/* Sahibi Al-Quran — reminder job, run by GitHub Actions every ~15 minutes (free; no Blaze plan needed).
   1) Parent + child reminder when today's home wird isn't logged by the parent's chosen time.
   2) Teacher's daily class summary at the teacher's chosen time.
   3) Teacher "Remind" taps queued in /reminders.
   4) Weekly report on the first day of each new week (covers the week that just ended):
      parents at their reminder time, teachers at their summary time.
   GitHub schedules can run late, so each reminder is "due and not yet sent today" rather than an exact slot. */
const admin=require("firebase-admin");
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db=admin.firestore(),FV=admin.firestore.FieldValue;
const LATE_MAX=180; // minutes: skip a reminder that is more than 3 hours overdue
const BASE=process.env.APP_URL||"https://sahibi-quran.web.app";

const TXT={
  ar:{rem_t:"تذكير بالورد",rem_b:"ورد {0} لليوم لم يُسجَّل بعد",sum_t:"ملخص اليوم: {0}",sum_b:"أتمّ {0} من {1}. لم يُتمّ: {2}",sum_all:"أتمّ الجميع ورد اليوم، ما شاء الله",n_t:"ملاحظة جديدة من المعلم",n_b:"كتب المعلم ملاحظة على ورد {0}",t_t:"تذكير من المعلم",t_b:"لا تنسَ ورد اليوم يا {0}",t_bf:"لا تنسَي ورد اليوم يا {0}",w_t:"تقرير الأسبوع جاهز",w_line:"{0}: {1}/7 أيام · {2} نجمة · {3} خطأ",hw_t:"تقرير الأسبوع: {0}",hw_b:"أتمّ الأسبوع {0} من {1} · متوسط نجوم البيت {2}"},
  en:{rem_t:"Wird reminder",rem_b:"{0}'s wird for today isn't logged yet",sum_t:"Today's summary: {0}",sum_b:"{0} of {1} done. Not yet: {2}",sum_all:"Everyone finished today's wird. Masha'Allah",n_t:"New note from your teacher",n_b:"Your teacher wrote a note on {0}'s wird",t_t:"Reminder from your teacher",t_b:"Don't forget today's wird, {0}",t_bf:"Don't forget today's wird, {0}",w_t:"Your weekly report is ready",w_line:"{0}: {1}/7 days · {2} stars · {3} mistakes",hw_t:"Weekly report: {0}",hw_b:"{0} of {1} finished the week · average home stars {2}"}
};
const tx=(lang,k,...a)=>{let s=(TXT[lang]||TXT.ar)[k];a.forEach((v,i)=>s=s.split("{"+i+"}").join(v));return s};
const local=off=>{const d=new Date(Date.now()+(off||0)*60000);return{date:d.toISOString().slice(0,10),min:d.getUTCHours()*60+d.getUTCMinutes()}};
const hm=s=>{const [h,m]=String(s).split(":").map(Number);return h*60+m};
const due=(at,off,last)=>{if(!at)return null;const L=local(off),late=L.min-hm(at);return late>=0&&late<=LATE_MAX&&last!==L.date?L.date:null};

const addD=(s,n)=>{const d=new Date(s+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dow=s=>new Date(s+"T00:00:00Z").getUTCDay();
const wsOf=u=>u.weekStart==null||u.weekStart===""?((u.lang||"ar")==="en"?0:6):+u.weekStart;
async function weekDays(ref,a,b){const ID=admin.firestore.FieldPath.documentId();const s=await ref.collection("days").where(ID,">=",a).where(ID,"<=",b).get();return s.docs.map(d=>d.data())}
function sumWeek(days){let done=0,home=0,mist=0;days.forEach(r=>{const hs=+(r.stars||0);home+=hs;if(hs>0)done++;mist+=new Set([...(r.weak||[]),...(r.tWeak||[])]).size});return{done,home,mist}}

/* a parent's children: the ones they own (parentUid) and the ones they co-parent (parentUids) */
async function kidsOfParent(uid){
  const [a,b]=await Promise.all([db.collection("kids").where("parentUid","==",uid).get(),db.collection("kids").where("parentUids","array-contains",uid).get()]);
  const m=new Map();[...a.docs,...b.docs].forEach(d=>m.set(d.id,d));return[...m.values()];
}
async function send(targets,title,body,link){
  const all=[];targets.forEach(x=>(x.tokens||[]).forEach(tk=>all.push({ref:x.ref,tk})));
  const uniq=[...new Map(all.map(x=>[x.tk,x])).values()];
  if(!uniq.length)return 0;
  const res=await admin.messaging().sendEach(uniq.map(x=>({token:x.tk,notification:{title,body},data:{link:link||"/"},webpush:{fcmOptions:{link:BASE+(link||"/")},notification:{icon:"/icons/icon-192.png",dir:"auto"}}})));
  await Promise.all(res.responses.map((r,i)=>{const c=r.error&&r.error.code;
    if(c==="messaging/registration-token-not-registered"||c==="messaging/invalid-registration-token"||c==="messaging/invalid-argument")return uniq[i].ref.update({tokens:FV.arrayRemove(uniq[i].tk)}).catch(()=>{})}));
  return res.successCount;
}

async function main(){
  let n=0;
  // 1) parent reminders
  const parents=await db.collection("users").where("remindAt","!=",null).get();
  for(const p of parents.docs){
    const u=p.data(),d=due(u.remindAt,u.offset,u.lastRemind);if(!d)continue;
    const lang=u.lang||"ar",kids=await kidsOfParent(p.id);
    for(const k of kids){
      const kd=k.data(),day=await k.ref.collection("days").doc(d).get();
      if(day.exists&&(day.data().stars||0)>0)continue;
      n+=await send([{ref:p.ref,tokens:u.tokens}].concat(p.id===kd.parentUid?[{ref:k.ref,tokens:kd.tokens}]:[]),tx(lang,"rem_t"),tx(lang,"rem_b",kd.name||""));
    }
    await p.ref.update({lastRemind:d});
  }
  // 2) teacher summaries
  const teachers=await db.collection("users").where("summaryAt","!=",null).get();
  for(const t of teachers.docs){
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
  }
  // 3) teacher "Remind" taps
  const q=await db.collection("reminders").limit(500).get();
  for(const r of q.docs){
    const x=r.data();
    try{
      const kref=db.collection("kids").doc(String(x.kidId)),k=await kref.get();
      if(k.exists&&k.data().teacherUid===x.teacherUid&&Date.now()-(x.at||0)<6*3600e3){
        const kd=k.data(),uids=[...new Set([kd.parentUid,...(kd.parentUids||[])].filter(Boolean))],targets=[{ref:kref,tokens:kd.tokens}];let lang=x.lang||"ar";
        for(const pid of uids){const pref=db.collection("users").doc(pid),p=await pref.get(),pu=p.exists?p.data():{};if(pid===kd.parentUid)lang=pu.lang||lang;targets.push({ref:pref,tokens:pu.tokens})}
        n+=await send(targets,tx(lang,x.kind==="note"?"n_t":"t_t"),x.kind==="note"?tx(lang,"n_b",kd.name||""):tx(lang,kd.gender==="f"?"t_bf":"t_b",kd.name||""));
      }
    }finally{await r.ref.delete()}
  }
  // 4) weekly reports (first day of the new week)
  for(const p of parents.docs){
    const u=p.data(),d=due(u.remindAt,u.offset,u.lastWeekly);if(!d||dow(d)!==wsOf(u))continue;
    const lang=u.lang||"ar",a=addD(d,-7),b=addD(d,-1),kids=await kidsOfParent(p.id),lines=[];
    for(const k of kids){const w=sumWeek(await weekDays(k.ref,a,b));lines.push(tx(lang,"w_line",k.data().name||"",w.done,w.home,w.mist))}
    if(lines.length)n+=await send([{ref:p.ref,tokens:u.tokens}],tx(lang,"w_t"),lines.join("\n"),"/?report=1");
    await p.ref.update({lastWeekly:d});
  }
  for(const t of teachers.docs){
    const u=t.data(),d=due(u.summaryAt,u.offset,u.lastHWeekly);if(!d||dow(d)!==wsOf(u))continue;
    const lang=u.lang||"ar",a=addD(d,-7),b=addD(d,-1),hs=await db.collection("halaqas").where("teacherUid","==",t.id).get();
    for(const h of hs.docs){
      const st=await db.collection("kids").where("teacherUid","==",t.id).where("halaqaId","==",h.id).get();if(st.empty)continue;
      let full=0,home=0;for(const k of st.docs){const w=sumWeek(await weekDays(k.ref,a,b));if(w.done===7)full++;home+=w.home}
      n+=await send([{ref:t.ref,tokens:u.tokens}],tx(lang,"hw_t",h.data().name||""),tx(lang,"hw_b",full,st.size,(home/st.size).toFixed(1)),"/?hreport="+h.id);
    }
    await t.ref.update({lastHWeekly:d});
  }
  console.log("notifications sent:",n);
}
module.exports={main,due,local,sumWeek,addD,dow,wsOf,kidsOfParent};
if(require.main===module)main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
