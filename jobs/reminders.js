/* Sahibi Al-Quran — reminder job, run by GitHub Actions every ~15 minutes (free; no Blaze plan needed).
   1) Parent + child reminder when today's home wird isn't logged by the parent's chosen time.
   2) Teacher's daily class summary at the teacher's chosen time.
   3) Teacher "Remind" taps queued in /reminders.
   4) Weekly report on the first day of each new week (covers the week that just ended):
      parents at their reminder time, teachers at their summary time.
   GitHub schedules can run late, so each reminder is "due and not yet sent today" rather than an exact slot. */
const admin=require("firebase-admin");
const {throttled,fieldFor}=require("./throttle");
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db=admin.firestore(),FV=admin.firestore.FieldValue;
const LATE_MAX=180; // minutes: skip a reminder that is more than 3 hours overdue
const BASE=process.env.APP_URL||"https://sahibi-quran.web.app";

const TXT={
  ar:{rem_t:"تذكير بالورد",rem_b:"ورد {0} لليوم لم يُسجَّل بعد",sum_t:"ملخص اليوم: {0}",sum_b:"أتمّ {0} من {1}. لم يُتمّ: {2}",sum_all:"أتمّ الجميع ورد اليوم، ما شاء الله",n_t:"ملاحظة جديدة من المعلم",n_b:"كتب المعلم ملاحظة على ورد {0}",t_t:"تذكير من المعلم",t_b:"لا تنسَ ورد اليوم يا {0}",t_bf:"لا تنسَي ورد اليوم يا {0}",w_t:"تقرير الأسبوع جاهز",w_line:"{0}: {1}/7 أيام · {2} نجمة · {3} خطأ",hw_t:"تقرير الأسبوع: {0}",hw_b:"أتمّ الأسبوع {0} من {1} · متوسط نجوم البيت {2}"},
  en:{rem_t:"Wird reminder",rem_b:"{0}'s wird for today isn't logged yet",sum_t:"Today's summary: {0}",sum_b:"{0} of {1} done. Not yet: {2}",sum_all:"Everyone finished today's wird. Masha'Allah",n_t:"New note from your teacher",n_b:"Your teacher wrote a note on {0}'s wird",t_t:"Reminder from your teacher",t_b:"Don't forget today's wird, {0}",t_bf:"Don't forget today's wird, {0}",w_t:"Your weekly report is ready",w_line:"{0}: {1}/7 days · {2} stars · {3} mistakes",hw_t:"Weekly report: {0}",hw_b:"{0} of {1} finished the week · average home stars {2}"}
};
const tx=(lang,k,...a)=>{let s=(Object.prototype.hasOwnProperty.call(TXT,lang)?TXT[lang]:TXT.ar)[k];a.forEach((v,i)=>s=s.split("{"+i+"}").join(v));return s};
const local=off=>{const d=new Date(Date.now()+(off||0)*60000);return{date:d.toISOString().slice(0,10),min:d.getUTCHours()*60+d.getUTCMinutes()}};
const hm=s=>{const [h,m]=String(s).split(":").map(Number);return h*60+m};
const due=(at,off,last)=>{if(!at)return null;const L=local(off),late=L.min-hm(at);return late>=0&&late<=LATE_MAX&&last!==L.date?L.date:null};

const addD=(s,n)=>{const d=new Date(s+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dow=s=>new Date(s+"T00:00:00Z").getUTCDay();
const wsOf=u=>u.weekStart==null||u.weekStart===""?((u.lang||"ar")==="en"?0:6):+u.weekStart;
/* The weekday (0 = Sunday) a plan's weeks begin on: the weekday of its start for the in-order distribution (algo 2), otherwise the account's own setting.
   The same rule as planWeekStart in src/planner.js (test/reminders.test.js checks that they agree). */
const planWeekStart=(p,fallback)=>{if(p&&p.algo===2&&typeof p.start==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(p.start)){const d=new Date(p.start+"T00:00:00Z");if(!isNaN(d)&&d.toISOString().slice(0,10)===p.start)return d.getUTCDay()}return fallback};
/* true on the first day of a new week of this plan, and only when a whole week has gone by since the plan started (a plan saved today has nothing to report today) */
const weekBeginsToday=(p,fallback,d)=>dow(d)===planWeekStart(p,fallback)&&!(planWeekStart(p,-1)!==-1&&p.start>=d);
const planHas=p=>!!p&&((p.surahs||[]).length>0||(p.ranges||[]).length>0);
/* the plan a child follows: the teacher's plan for that student, else the class plan, else the child's own (as effPlan in src/main.js) */
async function planOfKid(kd,kidId,cache){
  if(!kd.halaqaId)return kd;
  const hid=String(kd.halaqaId);
  if(!cache.has(hid)){const s=await db.collection("halaqas").doc(hid).get();cache.set(hid,s.exists?s.data():null)}
  const h=cache.get(hid);if(!h)return kd;
  const sp=(h.studentPlans||{})[kidId];
  return planHas(sp)?sp:planHas(h.plan)?h.plan:kd;
}
async function weekDays(ref,a,b){const ID=admin.firestore.FieldPath.documentId();const s=await ref.collection("days").where(ID,">=",a).where(ID,"<=",b).get();return s.docs.map(d=>d.data())}
function sumWeek(days){let done=0,home=0,mist=0;days.forEach(r=>{const hs=+(r.stars||0);home+=hs;if(hs>0)done++;mist+=new Set([...(r.weak||[]),...(r.tWeak||[])]).size});return{done,home,mist}}

/* a parent's children: the ones they own (parentUid) and the ones they co-parent (parentUids) */
async function kidsOfParent(uid){
  const [a,b]=await Promise.all([db.collection("kids").where("parentUid","==",uid).get(),db.collection("kids").where("parentUids","array-contains",uid).get()]);
  const m=new Map();[...a.docs,...b.docs].forEach(d=>m.set(d.id,d));return[...m.values()];
}
// FCM send attempts of this run and how many failed outright (see send); main() resets them
const sendStats={attempts:0,failed:0};
/* A failed message means a dead token (the device is gone, so the token is removed) when FCM says the token is unknown or malformed.
   "invalid-argument" is also what a bad payload gives (every message would fail): it counts as a dead token only when its text speaks of the registration token. */
const isDead=r=>{const e=r&&r.error;if(!e)return false;const c=e.code;
  return c==="messaging/registration-token-not-registered"||c==="messaging/invalid-registration-token"||(c==="messaging/invalid-argument"&&/registration token/i.test(String(e.message||"")))};
const CHUNK=500;   // sendEach takes at most 500 messages
async function send(targets,title,body,link){
  const refs=new Map();   // token -> every document that holds it (the account's and a child's can hold the same one)
  targets.forEach(x=>(Array.isArray(x.tokens)?x.tokens:[]).forEach(tk=>{if(typeof tk!=="string"||!tk)return;if(!refs.has(tk))refs.set(tk,[]);refs.get(tk).push(x.ref)}));
  const tokens=[...refs.keys()];
  if(!tokens.length)return 0;
  sendStats.attempts++;
  const responses=[];
  for(let i=0;i<tokens.length;i+=CHUNK){
    const part=tokens.slice(i,i+CHUNK);
    try{const res=await admin.messaging().sendEach(part.map(tk=>({token:tk,notification:{title,body},data:{link:link||"/"},webpush:{fcmOptions:{link:BASE+(link||"/")},notification:{icon:"/icons/icon-192.png",dir:"auto"}}})));res.responses.forEach(r=>responses.push(r))}
    catch(e){part.forEach(()=>responses.push({success:false,error:e}))}   // this part never went out (the connection failed)
  }
  await Promise.all(responses.map((r,i)=>isDead(r)?Promise.all(refs.get(tokens[i]).map(ref=>ref.update({tokens:FV.arrayRemove(tokens[i])}).catch(()=>{}))):null));
  // sendEach does not throw when the messages fail (it returns one result per message): when not one message arrived and at least one failed for a reason other than a dead token,
  // the service (not the recipients) is the problem. Fail this send so the account is not marked as reminded today and is tried again at the next run.
  const hard=responses.filter(r=>!r.success&&!isDead(r)),ok=responses.filter(r=>r.success).length;
  if(ok===0&&hard.length>0){sendStats.failed++;const e=new Error("send failed");e.code=(hard[0].error&&hard[0].error.code)||"send-failed";throw e}
  return ok;
}

async function main(){
  let n=0,skipped=0;sendStats.attempts=0;sendStats.failed=0;
  // one account or queue entry with bad values (a non-numeric offset, tokens that are not a list...) must not stop everyone else's reminders;
  // log only what and which id, never the values or the tokens
  const skip=(what,id,e)=>{skipped++;console.error("skipped",what,id,(e&&(e.code||e.name))||"error")};
  // 1) parent reminders
  const parents=await db.collection("users").where("remindAt","!=",null).get();
  for(const p of parents.docs){try{
    const u=p.data(),d=due(u.remindAt,u.offset,u.lastRemind);if(!d)continue;
    const lang=u.lang||"ar",kids=await kidsOfParent(p.id);
    for(const k of kids){
      const kd=k.data(),day=await k.ref.collection("days").doc(d).get();
      if(day.exists&&(day.data().stars||0)>0)continue;
      n+=await send([{ref:p.ref,tokens:u.tokens}].concat(p.id===kd.parentUid?[{ref:k.ref,tokens:kd.tokens}]:[]),tx(lang,"rem_t"),tx(lang,"rem_b",kd.name||""));
    }
    await p.ref.update({lastRemind:d});
  }catch(e){skip("parent reminder",p.id,e)}}
  // 2) teacher summaries
  const teachers=await db.collection("users").where("summaryAt","!=",null).get();
  for(const t of teachers.docs){try{
    const u=t.data(),d=due(u.summaryAt,u.offset,u.lastSummary);if(!d)continue;
    const lang=u.lang||"ar",hs=await db.collection("halaqas").where("teacherUid","==",t.id).get();
    for(const h of hs.docs){
      const st=await db.collection("kids").where("teacherUid","==",t.id).where("halaqaId","==",h.id).get();
      if(st.empty)continue;
      const missing=[];let done=0;
      for(const k of st.docs){const x=await k.ref.collection("days").doc(d).get();if(x.exists&&(x.data().stars||0)>0)done++;else missing.push(k.data().name||"")}
      const body=missing.length?tx(lang,"sum_b",done,st.size,missing.join(lang==="ar"?"، ":", ")):tx(lang,"sum_all");
      n+=await send([{ref:t.ref,tokens:u.tokens}],tx(lang,"sum_t",h.data().name||""),body);
    }
    await t.ref.update({lastSummary:d});
  }catch(e){skip("teacher summary",t.id,e)}}
  // 3) teacher "Remind" taps
  const q=await db.collection("reminders").limit(500).get();
  for(const r of q.docs){
    const x=r.data();
    try{
      const kref=db.collection("kids").doc(String(x.kidId)),k=await kref.get();
      if(k.exists&&k.data().teacherUid===x.teacherUid&&Date.now()-(x.at||0)<6*3600e3){
        const kd=k.data(),fld=fieldFor(x.kind);
        if(throttled(kd[fld],Date.now()))continue; // already notified this family of this kind within the hour (the finally below still removes the queue entry)
        const uids=[...new Set([kd.parentUid,...(kd.parentUids||[])].filter(Boolean))],targets=[{ref:kref,tokens:kd.tokens}];let lang=x.lang||"ar";
        for(const pid of uids){const pref=db.collection("users").doc(pid),p=await pref.get(),pu=p.exists?p.data():{};if(pid===kd.parentUid)lang=pu.lang||lang;targets.push({ref:pref,tokens:pu.tokens})}
        n+=await send(targets,tx(lang,x.kind==="note"?"n_t":"t_t"),x.kind==="note"?tx(lang,"n_b",kd.name||""):tx(lang,kd.gender==="f"?"t_bf":"t_b",kd.name||""));
        await kref.update({[fld]:Date.now()});   // stamped unless the send failed outright (it throws then): a failed send must not shut the teacher out for an hour
      }
    }catch(e){skip("queued reminder",r.id,e)}finally{await r.ref.delete().catch(e=>skip("queue delete",r.id,e))}
  }
  // 4) weekly reports, on the first day of a new week. A child's week begins on the weekday its plan started (planWeekStart), a class's on the weekday of the class plan,
  //    so each child (class) is reported on its own weekday, for the seven days that have just ended.
  const planCache=new Map();
  for(const p of parents.docs){try{
    const u=p.data(),d=due(u.remindAt,u.offset,u.lastWeekly);if(!d)continue;
    const lang=u.lang||"ar",a=addD(d,-7),b=addD(d,-1),lines=[],ids=[];
    for(const k of await kidsOfParent(p.id)){const kd=k.data();
      if(!weekBeginsToday(await planOfKid(kd,k.id,planCache),wsOf(u),d))continue;
      const w=sumWeek(await weekDays(k.ref,a,b));lines.push(tx(lang,"w_line",kd.name||"",w.done,w.home,w.mist));ids.push(k.id)}
    // the link opens the report of the first child named in the notification
    if(lines.length)n+=await send([{ref:p.ref,tokens:u.tokens}],tx(lang,"w_t"),lines.join("\n"),"/?report=1&kid="+encodeURIComponent(ids[0]));
    await p.ref.update({lastWeekly:d});
  }catch(e){skip("parent weekly",p.id,e)}}
  for(const t of teachers.docs){try{
    const u=t.data(),d=due(u.summaryAt,u.offset,u.lastHWeekly);if(!d)continue;
    const lang=u.lang||"ar",a=addD(d,-7),b=addD(d,-1),hs=await db.collection("halaqas").where("teacherUid","==",t.id).get();
    for(const h of hs.docs){
      if(!weekBeginsToday(h.data().plan,wsOf(u),d))continue;
      const st=await db.collection("kids").where("teacherUid","==",t.id).where("halaqaId","==",h.id).get();if(st.empty)continue;
      let full=0,home=0;for(const k of st.docs){const w=sumWeek(await weekDays(k.ref,a,b));if(w.done===7)full++;home+=w.home}
      n+=await send([{ref:t.ref,tokens:u.tokens}],tx(lang,"hw_t",h.data().name||""),tx(lang,"hw_b",full,st.size,(home/st.size).toFixed(1)),"/?hreport="+h.id);
    }
    await t.ref.update({lastHWeekly:d});
  }catch(e){skip("teacher weekly",t.id,e)}}
  console.log("notifications sent:",n,"skipped:",skipped,"send attempts failed:",sendStats.failed+"/"+sendStats.attempts);
  return{n,skipped,attempts:sendStats.attempts,failed:sendStats.failed};
}
// exit code 1 when messages were attempted and every attempt failed (the sending service is down); a few broken accounts leave the run green
const shouldFail=r=>!!r&&r.attempts>0&&r.failed===r.attempts;
module.exports={main,shouldFail,planWeekStart,weekBeginsToday,due,local,sumWeek,addD,dow,wsOf,kidsOfParent};
if(require.main===module)main().then(r=>{if(shouldFail(r)){console.error("every send attempt failed:",r.failed+"/"+r.attempts);process.exit(1)}process.exit(0)},e=>{console.error(e);process.exit(1)});
