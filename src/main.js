import {S} from "./surahs.js";
import {I,DAYS,DSHORT} from "./i18n.js";
import {STAR,LOGO,THEMES,THEME_ORDER,giftSvg,ICON_GEAR,ICON_BACK} from "./themes.js";
import {createFakeBackend} from "./backend-fake.js";
import {CONFIG} from "./config.js";

/* ================= backend ================= */
let D;
if(__DEMO__||!CONFIG.firebase||/[?&]demo\b/.test(location.search))D=createFakeBackend();
else{const m=await import("./backend-firebase.js");D=m.createFirebaseBackend(CONFIG)}
const ST=D.store;

/* ================= local prefs ================= */
const LP="sahibi-prefs";
let prefs={lang:null,mode:"kids",cur:null,child:null};
try{prefs=Object.assign(prefs,JSON.parse(localStorage.getItem(LP)||"{}"))}catch(e){}
const savePrefs=()=>{try{localStorage.setItem(LP,JSON.stringify(prefs))}catch(e){}};

/* ================= helpers ================= */
const L=()=>prefs.lang||ST.profile.lang||"ar";
function t(k){let s=(I[L()]&&I[L()][k])||I.ar[k]||k;for(let i=1;i<arguments.length;i++)s=s.split("{"+(i-1)+"}").join(arguments[i]);return s}
const sName=n=>S[n-1][L()==="en"?1:0];
const esc=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const $=id=>document.getElementById(id);
const pad=n=>(n<10?"0":"")+n;
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=s=>{const p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2])};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const diffDays=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
const WS=()=>ST.profile.weekStart==null?(L()==="en"?0:6):ST.profile.weekStart;
const weekOf=(s,ws)=>{ws=ws==null?WS():ws;const d=parse(s);d.setDate(d.getDate()-((d.getDay()-ws+7)%7));return iso(d)};
const nice=s=>new Intl.DateTimeFormat(L()==="en"?"en-GB":"ar-u-ca-gregory-nu-latn",{day:"numeric",month:"short"}).format(parse(s));
const today=()=>iso(new Date());
const range=(a,b)=>{const r=[];for(let i=a;i<=b;i++)r.push(i);return r};
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const app=$("app");

/* ================= planning ================= */
const binCache=new Map();
function bins(plan){
  const key=JSON.stringify([plan.surahs,plan.cycle,plan.light,plan.weekStart]);
  if(binCache.has(key))return binCache.get(key);
  const ws=plan.weekStart==null?6:plan.weekStart,N=7*plan.cycle,caps=[];
  for(let b=0;b<N;b++){const jd=(ws+b%7)%7;caps.push(jd===plan.light?0.5:1)}
  const list=plan.surahs.slice().sort((a,b)=>a-b),total=list.reduce((a,n)=>a+S[n-1][2],0),unit=total/caps.reduce((a,c)=>a+c,0);
  const chunks=[];
  list.forEach(n=>{const a=S[n-1][2];if(unit>0&&a>unit*1.3){const k=Math.ceil(a/unit),sz=Math.ceil(a/k);for(let f=1;f<=a;f+=sz)chunks.push([n,f,Math.min(a,f+sz-1)])}else chunks.push([n,1,a])});
  chunks.sort((x,y)=>(y[2]-y[1])-(x[2]-x[1])||x[0]-y[0]||x[1]-y[1]);
  const load=new Array(N).fill(0),out=[];for(let b=0;b<N;b++)out.push([]);
  chunks.forEach(c=>{const len=c[2]-c[1]+1;let best=0,bv=Infinity;for(let b=0;b<N;b++){const v=(load[b]+len)/caps[b];if(v<bv-1e-9){bv=v;best=b}}load[best]+=len;out[best].push(c)});
  out.forEach(a=>a.sort((x,y)=>x[0]-y[0]||x[1]-y[1]));
  binCache.set(key,out);return out;
}
function halaqaOf(kid){if(!kid||!kid.halaqaId)return null;return ST.hdocs[kid.halaqaId]||ST.halaqas[kid.halaqaId]||null}
function effPlan(kid){const h=halaqaOf(kid);return h&&h.plan&&h.plan.surahs&&h.plan.surahs.length?h.plan:kid}
function day(kid,date){return ((ST.days[kid.id]||{})[date])||null}
function planFor(kid,date){
  const r=day(kid,date);if(r&&r.items)return r.items;
  const p=effPlan(kid);if(!p.surahs||!p.surahs.length)return[];
  const ws=p.weekStart==null?6:p.weekStart;
  const wk=Math.round(diffDays(p.start||weekOf(date,ws),weekOf(date,ws))/7),wi=((wk%p.cycle)+p.cycle)%p.cycle;
  const off=(parse(date).getDay()-ws+7)%7;
  return bins(p)[wi*7+off].map(c=>[c[0],c[1],c[2]]);
}
function setField(kid,date,f){quietUntil=Date.now()+900;const r=day(kid,date);if(!r||!r.items)f=Object.assign({items:planFor(kid,date)},f);D.setDay(kid.id,date,f)}
const itemAyat=items=>items.reduce((s,it)=>s+it[2]-it[1]+1,0);
const itemLabel=it=>{const a=S[it[0]-1][2];return esc(sName(it[0]))+((it[1]>1||it[2]<a)?'<small>'+it[1]+'–'+it[2]+'</small>':'')};
const cycleLbl=c=>c===1?t("week1"):c===2?t("weeks2"):t("weeks",c);

/* ================= themes ================= */
function applyTheme(th){
  const root=document.documentElement.style;
  ["bg","surface","surface2","ink","muted","accent","accent2","line","star","on-accent","good","mid","bad","none"].forEach(k=>root.removeProperty("--"+k));
  root.removeProperty("color-scheme");app.classList.remove("sky");
  if(!th||!THEMES[th])return;
  const T=THEMES[th];Object.keys(T.c).forEach(k=>root.setProperty("--"+k,T.c[k]));
  root.setProperty("--good",T.dark?"#4cd98a":"#2f9e5b");root.setProperty("--mid",T.dark?"#ffc93c":"#d99a00");root.setProperty("--bad",T.dark?"#ff6b6b":"#e5484d");root.setProperty("--none",T.c.line);
  root.setProperty("color-scheme",T.dark?"dark":"light");if(T.sky)app.classList.add("sky");
}
function setDir(){const h=document.documentElement;h.lang=L();h.dir=L()==="en"?"ltr":"rtl";document.body.classList.toggle("en",L()==="en");document.title=t("app")}

/* ================= navigation ================= */
let nav={view:"main"};       // main | hist | gate | settings | edit | halaqa | hedit | student | shist
let gateOk=false,weekView=null,hDate=null,draft=null;
function go(v,extra){nav=Object.assign({view:v},extra||{});weekView=null;render();window.scrollTo({top:0})}
const kidsList=()=>Object.values(ST.kids).sort((a,b)=>(a.created||0)-(b.created||0));
const halaqaList=()=>Object.values(ST.halaqas).sort((a,b)=>(a.created||0)-(b.created||0));
function childKid(){return prefs.child&&ST.user&&prefs.child.uid===ST.user.uid?ST.kids[prefs.child.kid]||null:null}
function curKid(){const ck=childKid();if(ck)return ck;let k=ST.kids[prefs.cur];if(!k){k=kidsList()[0]||null;if(k)prefs.cur=k.id}return k}

/* ================= render root ================= */
let lastKey="";
let quietUntil=0,pending=false,qT=null;
D.onChange(()=>{if(ST.user&&ST.profile.lang&&!prefs.lang){prefs.lang=ST.profile.lang;savePrefs()}softRender()});
function softRender(){
  // never rebuild the page under the user's fingers: while typing or right after a tap, update live bits only
  const a=document.activeElement,typing=a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA"||a.tagName==="SELECT")&&app.contains(a);
  if(typing||Date.now()<quietUntil||["edit","hedit","settings","gate"].indexOf(nav.view)>-1&&ST.ready&&ST.user&&app.childElementCount){pending=true;refreshLive();
    if(!typing&&Date.now()<quietUntil){clearTimeout(qT);qT=setTimeout(()=>{if(pending)softRender()},quietUntil-Date.now()+50)}return}
  pending=false;render();
}
app.addEventListener("focusout",()=>{setTimeout(()=>{if(pending)softRender()},50)});
function render(){
  setDir();
  if(!prefs.lang)return renderLang();
  if(!ST.ready){applyTheme(null);app.innerHTML='<p class="status">'+t("loading")+'</p>';return}
  if(!ST.user)return renderAuth();
  if(ST.user&&ST.profile&&ST.profile.lang!==prefs.lang&&ST.ready)D.saveProfile({lang:prefs.lang});
  const v=nav.view;
  if(v==="gate")return renderGate();
  if(v==="settings")return renderSettings();
  if(v==="edit")return renderEdit();
  if(v==="hedit")return renderHEdit();
  if(childKid()){const k=childKid();return v==="hist"?renderHist(k,{}):renderMain(k)}
  if(prefs.mode==="teach"&&halaqaList().length){
    if(v==="halaqa"&&ST.halaqas[nav.hid])return renderHalaqa(ST.halaqas[nav.hid]);
    if(v==="student"){const k=(ST.students[nav.hid]||{})[nav.kid];if(k)return renderStudent(k,ST.halaqas[nav.hid]);}
    if(v==="shist"){const k=(ST.students[nav.hid]||{})[nav.kid];if(k)return renderHist(k,{teacher:true,hid:nav.hid});}
    return renderTeachHome();
  }
  const k=curKid();
  if(!k)return renderWelcome();
  if(v==="hist")return renderHist(k,{});
  return renderMain(k);
}
// update live parts without destroying inputs (path, stars, teacher rows)
function refreshLive(){
  if(nav.view==="main"&&$("path")){const k=curKid();if(k)renderPath(k,weekView||weekOf(today()))}
}

/* ================= pre-auth ================= */
function renderLang(){
  applyTheme(null);
  app.innerHTML='<section class="stack welcome"><span class="logo">'+LOGO+'</span><h1>صاحبي القرآن<br><span style="font-size:24px">Sahibi Al-Quran</span></h1><p>اختر اللغة · Choose your language</p><div class="langpick"><button class="btn primary big" data-l="ar">العربية</button><button class="btn primary big" data-l="en">English</button></div></section>';
  app.querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{prefs.lang=b.dataset.l;savePrefs();render()});
}
let authMode="signup";
function renderAuth(){
  applyTheme(null);
  const up=authMode==="signup";
  app.innerHTML='<section class="stack welcome"><span class="logo">'+LOGO+'</span><h1>'+t("app")+'</h1><p>'+t("tag")+'</p></section>'+
   (D.kind==="demo"?'<p class="msg" style="text-align:center">'+t("demo_note")+'</p>':'')+
   '<form class="card" id="authF" novalidate><h2>'+t(up?"signup":"signin")+'</h2>'+
   (up?'<label class="field"><span class="sec-t">'+t("your_name")+'</span><input id="aName" autocomplete="name" maxlength="40"></label>':'')+
   '<label class="field"><span class="sec-t">'+t("email")+'</span><input id="aEmail" type="email" autocomplete="email" dir="ltr" required></label>'+
   '<label class="field"><span class="sec-t">'+t("password")+'</span><input id="aPw" type="password" autocomplete="'+(up?"new-password":"current-password")+'" dir="ltr" required></label>'+
   '<p class="msg err" id="aMsg"></p><button class="btn primary big" id="aGo" type="submit">'+t(up?"signup":"signin")+'</button>'+
   '<div class="row"><button class="btn" type="button" id="aSwitch">'+t(up?"have_acc":"no_acc")+'</button>'+(up?'':'<button class="btn" type="button" id="aForgot">'+t("forgot")+'</button>')+'</div></form>'+
   '<div class="row" style="justify-content:center"><button class="btn" id="aLang">'+(L()==="ar"?"English":"العربية")+'</button></div>';
  const msg=(m,ok)=>{const e=$("aMsg");e.className="msg "+(ok?"ok":"err");e.textContent=m};
  $("aSwitch").onclick=()=>{authMode=up?"signin":"signup";renderAuth()};
  $("aLang").onclick=()=>{prefs.lang=L()==="ar"?"en":"ar";savePrefs();render()};
  if($("aForgot"))$("aForgot").onclick=async()=>{const e=$("aEmail").value.trim();if(!e){msg(t("auth/invalid-email"));return}try{await D.resetPw(e);msg(t("reset_sent"),true)}catch(x){msg(t(x.code)||t("err_generic"))}};
  $("authF").onsubmit=async e=>{e.preventDefault();$("aGo").disabled=true;msg("");
    try{if(up)await D.signUp($("aEmail").value.trim(),$("aPw").value,($("aName").value||"").trim());else await D.signIn($("aEmail").value.trim(),$("aPw").value);
      if(up)D.saveProfile({lang:L(),weekStart:L()==="en"?0:6,name:($("aName")?$("aName").value.trim():"")});}
    catch(x){const m=I[L()][x.code]?t(x.code):t("err_generic");msg(m);$("aGo").disabled=false}};
}

/* ================= shared chrome ================= */
function topbar(){
  const showMode=!childKid()&&halaqaList().length>0;
  return '<div class="topbar"><span class="brand">'+LOGO+'<span class="bname">'+t("app")+'</span></span>'+
    (showMode?'<div class="seg mode" id="modeSeg"><button data-m="kids" aria-pressed="'+(prefs.mode!=="teach")+'">'+t("mykids")+'</button><button data-m="teach" aria-pressed="'+(prefs.mode==="teach")+'">'+t("myhalaqas")+'</button></div>':'')+
    '<button class="iconbtn" id="gear" aria-label="'+t("settings")+'">'+ICON_GEAR+'</button></div>';
}
function bindTop(){
  $("gear").onclick=()=>go(gateOk?"settings":"gate");
  if($("modeSeg"))$("modeSeg").querySelectorAll("button").forEach(b=>b.onclick=()=>{prefs.mode=b.dataset.m;savePrefs();go("main")});
  app.querySelectorAll(".tab[data-k]").forEach(b=>b.onclick=()=>{prefs.cur=b.dataset.k;savePrefs();go("main");scrollToday()});
}
const tabs=k=>childKid()||kidsList().length<2?'':'<div class="tabs" role="tablist">'+kidsList().map(x=>'<button class="tab" role="tab" data-k="'+x.id+'" aria-selected="'+(x.id===k.id)+'">'+esc(x.name)+'</button>').join("")+'</div>';
function hero(k,btn,sub2){const T=THEMES[k.theme]||THEMES.space,sub=L()==="en"?T.sub.en:T.sub.ar[k.gender==="f"?1:0];return '<header class="hero"><span class="art">'+T.art+'</span><div class="meta"><h1>'+esc(k.name)+'</h1><p>'+(sub2||sub)+'</p>'+(btn?'<button class="btn primary" id="toggleView">'+btn+'</button>':'')+'</div></header>'}
function seg(id,opts,val){return '<div class="seg" id="'+id+'">'+opts.map(o=>'<button type="button" data-v="'+o[0]+'" aria-pressed="'+(String(o[0])===String(val))+'">'+o[1]+'</button>').join("")+'</div>'}
function starsRO(n){let s="";for(let i=1;i<=3;i++)s+=i<=n?"★":"☆";return '<span class="ro" aria-label="'+n+'/3">'+s+'</span>'}

/* ================= welcome ================= */
function renderWelcome(){
  applyTheme(null);
  app.innerHTML=topbar()+'<section class="stack welcome"><span class="logo">'+LOGO+'</span><h1>'+t("app")+'</h1><p>'+t("tag")+'</p><button class="btn primary big" id="first">'+t("start")+'</button></section>'+
   '<section class="card"><h2>'+t("teach")+'</h2><p class="about">'+t("teach_t")+'</p><button class="btn accent" id="firstH" style="align-self:flex-start">'+t("new_halaqa")+'</button></section>'+demoNote();
  bindTop();$("first").onclick=()=>openEdit(null);$("firstH").onclick=()=>openHEdit(null);
}
const demoNote=()=>D.kind==="demo"?'<p class="status">'+t("demo_note")+'</p>':'';

/* ================= child: main week ================= */
function weekStats(k,w){let tot=0,done=0;for(let i=0;i<7;i++){const r=day(k,addDays(w,i)),s=r?+(r.stars||0):0;tot+=s;if(s>0)done++}return{tot,done}}
function renderMain(k){
  applyTheme(k.theme);
  const w=weekView||weekOf(today()),isCur=w===weekOf(today()),T=THEMES[k.theme]||THEMES.space,h=halaqaOf(k);
  app.innerHTML=topbar()+tabs(k)+hero(k,t("history"),null)+
   (h?'<p class="chipline">'+t("joined",esc(h.name))+(h.teacherName?' · '+t("teacher_of",esc(h.teacherName)):'')+'</p>':'')+
   '<section class="card"><div class="journey-top"><b>'+T.path[L()]+'</b><span class="score">'+t("stars_lbl")+' <strong id="starCount">0</strong> / 21</span></div><div class="path" id="path"></div><p class="gift-note" id="giftNote"></p></section>'+
   '<div class="weeknav"><button class="btn" id="wPrev">'+t("prev")+'</button><span class="lbl">'+t("week")+'<b>'+nice(w)+' – '+nice(addDays(w,6))+'</b></span><button class="btn" id="wNext">'+t("next")+'</button></div>'+
   (isCur?'':'<button class="btn accent" id="wNow" style="align-self:center">'+t("this_week")+'</button>')+
   '<div class="days" id="days"></div>'+demoNote();
  bindTop();
  $("toggleView").onclick=()=>go("hist");
  $("wPrev").onclick=()=>{weekView=addDays(w,-7);render()};
  $("wNext").onclick=()=>{weekView=addDays(w,7);render()};
  if($("wNow"))$("wNow").onclick=()=>{weekView=null;render();scrollToday()};
  renderDays(k,w,false);renderPath(k,w);
}
function renderPath(k,w){
  const T=THEMES[k.theme]||THEMES.space;let last=-1,html="";
  for(let i=0;i<7;i++){const date=addDays(w,i),r=day(k,date),d=!!(r&&+(r.stars||0)>0);if(d)last=i;html+='<div class="st'+(d?" done":"")+'" id="st-'+i+'">'+T.st(i,d)+'<small>'+DSHORT[L()][parse(date).getDay()]+'</small></div>'}
  const s=weekStats(k,w),open=s.done===7;
  $("path").innerHTML=html+'<div class="st gift'+(open?" open":"")+'">'+giftSvg(open)+'<small>'+t("gift")+'</small></div>';
  if(last>=0)$("st-"+last).insertAdjacentHTML("afterbegin",'<span class="mini">'+T.art+'</span>');
  $("starCount").textContent=s.tot;
  const g=$("giftNote"),left=7-s.done;
  if(open){g.className="gift-note win";g.textContent=t(k.gender==="f"?"win_f":"win_m",k.name)}
  else{g.className="gift-note";g.textContent=left===1?t("left1"):left===2?t("left2"):t("leftN",left)}
}
const HINT=["h0","h1","h2","h3"];
function surahOptions(sel){let o='<option value="">—</option>';for(let n=1;n<=114;n++)o+='<option value="'+n+'"'+(n===sel?' selected':'')+'>'+n+'. '+esc(sName(n))+'</option>';return o}
function starRow(cls,label){return '<div class="stars '+cls+'" role="group" aria-label="'+label+'"><span class="slabel">'+label+'</span>'+[1,2,3].map(n=>'<button class="starbtn" data-n="'+n+'" aria-label="'+n+'">'+STAR+'</button>').join("")+'<span class="hint"></span></div>'}
/* teacherMode=false: home view (parent/child). true: teacher view of a student. */
function renderDays(k,w,teacherMode){
  const box=$("days");box.innerHTML="";const td=today();
  for(let i=0;i<7;i++){
    const date=addDays(w,i),jd=parse(date).getDay(),r=day(k,date)||{},items=planFor(k,date),isToday=date===td;
    const weakKey=teacherMode?"tWeak":"weak",weak=r[weakKey]||[],p=effPlan(k);
    const el=document.createElement("article");el.className="card day"+(isToday?" today":"");el.id="day-"+date;
    let html='<div class="day-h"><h2>'+DAYS[L()][jd]+(isToday?'<span class="chip today">'+t("today")+'</span>':'')+(jd===p.light?'<span class="chip">'+t("lightchip")+'</span>':'')+'</h2><span class="d">'+nice(date)+'</span></div>'+
      '<div class="field"><div class="sec-t"><span>'+t("review")+'</span><span>'+(items.length?itemAyat(items)+' '+t("ayah"):'')+'</span></div>'+
      (items.length?'<div class="items">'+items.map(it=>'<button class="item'+(weak.indexOf(it[0])>-1?' weak':'')+'" data-s="'+it[0]+'" aria-pressed="'+(weak.indexOf(it[0])>-1)+'">'+itemLabel(it)+'</button>').join("")+'</div><span class="hint">'+(teacherMode?t("tweak"):t(k.gender==="f"?"tap_weak_f":"tap_weak"))+'</span>':'<p class="empty">'+t("no_review")+'</p>')+'</div>';
    if(teacherMode){
      html+='<div class="other"><span>'+t("home_rating")+': '+(+(r.stars||0)>0?starsRO(+r.stars):t("not_rated"))+'</span>'+((r.weak||[]).length?'<span class="hint">'+t("mistake")+': '+r.weak.map(n=>esc(sName(n))).join("، ")+'</span>':'')+(r.nS?'<span class="hint">'+t("newm")+': '+esc(sName(+r.nS))+' '+(r.nF||"")+'–'+(r.nT||"")+'</span>':'')+(r.notes?'<span class="hint">'+esc(r.notes)+'</span>':'')+'</div>'+
        starRow("t",t("tstars"))+'<label class="field"><span class="sec-t">'+t("tnotes")+'</span><textarea data-f="tNotes" id="tn-'+date+'" rows="1"></textarea></label>';
    }else{
      html+='<label class="field"><span class="sec-t">'+t("extra")+'</span><input data-f="extra" id="ex-'+date+'" autocomplete="off" placeholder="'+t("extra_ph")+'"></label>'+
      '<div class="field"><span class="sec-t">'+t("newm")+'</span><div class="newrow"><select class="sel" data-f="nS" id="ns-'+date+'" aria-label="'+t("new_surah")+'">'+surahOptions(+r.nS||0)+'</select><input data-f="nF" id="nf-'+date+'" type="number" inputmode="numeric" min="1" placeholder="'+t("from_s")+'" aria-label="'+t("from")+'"><input data-f="nT" id="nt-'+date+'" type="number" inputmode="numeric" min="1" placeholder="'+t("to_s")+'" aria-label="'+t("to")+'"></div></div>'+
      starRow("h",t("stars"))+
      ((+(r.tStars||0)>0||r.tNotes||(r.tWeak||[]).length)?'<div class="other"><span>'+t("teacher_rating")+': '+(+(r.tStars||0)>0?starsRO(+r.tStars):t("not_rated"))+'</span>'+((r.tWeak||[]).length?'<span class="hint">'+t("mistake")+': '+r.tWeak.map(n=>esc(sName(n))).join("، ")+'</span>':'')+(r.tNotes?'<span class="hint">'+esc(r.tNotes)+'</span>':'')+'</div>':'')+
      '<label class="field"><span class="sec-t">'+t("notes")+'</span><textarea data-f="notes" id="no-'+date+'" rows="1"></textarea></label>';
    }
    el.innerHTML=html;box.appendChild(el);
    el.querySelectorAll("input[data-f],textarea[data-f]").forEach(inp=>{inp.value=r[inp.dataset.f]||"";let tm;inp.addEventListener("input",()=>{clearTimeout(tm);tm=setTimeout(()=>{let v=inp.value;if(inp.type==="number"){const n=+el.querySelector("[data-f=nS]").value;v=v===""?"":Math.max(1,Math.min(n?S[n-1][2]:286,Math.round(+v)||1));}setField(k,date,{[inp.dataset.f]:v})},500)})});
    const sel=el.querySelector("select[data-f]");if(sel)sel.addEventListener("change",e=>{const v=+e.target.value||"";setField(k,date,{nS:v});if(v)el.querySelectorAll("input[type=number]").forEach(x=>x.max=S[v-1][2])});
    el.querySelectorAll(".item").forEach(b=>b.onclick=()=>{const rr=day(k,date)||{},arr=(rr[weakKey]||[]).slice(),n=+b.dataset.s,ix=arr.indexOf(n);if(ix>-1)arr.splice(ix,1);else arr.push(n);setField(k,date,{[weakKey]:arr});b.classList.toggle("weak",ix<0);b.setAttribute("aria-pressed",String(ix<0))});
    const sKey=teacherMode?"tStars":"stars",row=el.querySelector(".stars");
    row.querySelectorAll(".starbtn").forEach(b=>b.onclick=()=>{const cur=+((day(k,date)||{})[sKey]||0),n=+b.dataset.n,v=cur===n?0:n;setField(k,date,{[sKey]:v});paint(row,v);if(!teacherMode&&$("path"))renderPath(k,w);if(v>cur){burst(b);const st=$("st-"+i);if(st)st.classList.add("pulse")}});
    paint(row,+(r[sKey]||0));
  }
}
function paint(row,v){row.querySelectorAll(".starbtn").forEach(b=>{const on=+b.dataset.n<=v;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});const h=row.querySelector(".hint");if(h)h.textContent=t(HINT[v])}
function burst(btn){for(let i=0;i<10;i++){const s=document.createElement("span");s.className="burst";const a=i/10*Math.PI*2;s.style.setProperty("--x",Math.cos(a)*44+"px");s.style.setProperty("--y",Math.sin(a)*44+"px");btn.appendChild(s);setTimeout(()=>s.remove(),750)}}
function scrollToday(){if(weekView)return;setTimeout(()=>{const d=$("day-"+today());if(d)d.scrollIntoView({behavior:"smooth",block:"start"})},150)}

/* ================= history ================= */
function analyse(k){
  const R=ST.days[k.id]||{},dates=Object.keys(R).sort(),occ={},news=[],done=[];let total=0,evald=0;
  const add=(n,d,score,weak)=>(occ[n]=occ[n]||[]).push({d,score,weak});
  dates.forEach(d=>{const r=R[d],hs=+(r.stars||0),ts=+(r.tStars||0),items=r.items||planFor(k,d),uniq=[...new Set(items.map(it=>it[0]))];
    if(hs>0){total+=hs;evald++;done.push(d);uniq.forEach(n=>{const w=(r.weak||[]).indexOf(n)>-1;add(n,d,w?1:hs,w)})}
    if(ts>0){uniq.forEach(n=>{const w=(r.tWeak||[]).indexOf(n)>-1;add(n,d,w?1:ts,w)})}
    if(r.nS)news.push({d,n:+r.nS,f:r.nF,t:r.nT});
  });
  const p=effPlan(k),start=k.start||p.start||weekOf(today()),curW=weekOf(today());
  const firstW=weekOf(dates[0]&&dates[0]<start?dates[0]:start),elapsed=Math.max(0,diffDays(firstW,today())+1);
  let best=0,run=0,prev=null;done.forEach(d=>{run=(prev&&addDays(prev,1)===d)?run+1:1;if(run>best)best=run;prev=d});
  const perWeek=[];for(let w=firstW;w<=curW;w=addDays(w,7)){const s=weekStats(k,w);perWeek.push({w,stars:s.tot,days:s.done})}
  const pool={};(p.surahs||[]).forEach(n=>pool[n]=1);Object.keys(occ).forEach(n=>pool[n]=1);
  const lv={};Object.keys(pool).map(Number).sort((a,b)=>a-b).forEach(n=>{const o=(occ[n]||[]).slice().sort((a,b)=>a.d<b.d?-1:1);
    if(!o.length){lv[n]={level:"none",n:0};return}
    const avg=o.reduce((a,x)=>a+x.score,0)/o.length,last2=o.slice(-2).some(x=>x.weak);
    lv[n]={level:last2?"bad":avg>=2.5?"good":avg>=1.5?"mid":"bad",avg,n:o.length,weakN:o.filter(x=>x.weak).length}});
  return{total,evald,elapsed,best,perWeek,lv,news:news.sort((a,b)=>a.d<b.d?1:-1)};
}
function chartSvg(pw){
  const data=pw.slice(-12),W=320,H=150,Lp=26,B=24,T=12,cw=(W-Lp-6)/Math.max(data.length,1),y=v=>T+(H-T-B)*(1-v/21),cur=weekOf(today());
  let g="";[0,7,14,21].forEach(v=>{g+='<line x1="'+Lp+'" x2="'+(W-4)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)"/><text x="'+(Lp-6)+'" y="'+(y(v)+4)+'" font-size="10" text-anchor="end" fill="var(--muted)">'+v+'</text>'});
  data.forEach((d,i)=>{const bw=Math.min(cw*0.64,34),x=Lp+i*cw+(cw-bw)/2,yy=y(d.stars);
    g+='<rect x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,y(0)-yy).toFixed(1)+'" rx="4" fill="'+(d.w===cur?"var(--accent)":"var(--accent2)")+'"/>';
    if(d.stars>0)g+='<text x="'+(x+bw/2).toFixed(1)+'" y="'+(yy-4).toFixed(1)+'" font-size="10" text-anchor="middle" fill="var(--ink)">'+d.stars+'</text>';
    const dt=parse(d.w);g+='<text x="'+(x+bw/2).toFixed(1)+'" y="'+(H-8)+'" font-size="9.5" text-anchor="middle" fill="var(--muted)">'+dt.getDate()+'/'+(dt.getMonth()+1)+'</text>'});
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+t("chart_t")+'" direction="ltr">'+g+'</svg>';
}
function renderHist(k,o){
  applyTheme(k.theme);
  const A=analyse(k),ids=Object.keys(A.lv).map(Number).sort((a,b)=>a-b),cnt={good:0,mid:0,bad:0,none:0};ids.forEach(n=>cnt[A.lv[n].level]++);
  const avg=A.evald?(A.total/A.evald).toFixed(1):"0",rate=A.elapsed?Math.round(A.evald/A.elapsed*100):0;
  const weakest=ids.filter(n=>A.lv[n].level==="bad"||A.lv[n].level==="mid").sort((a,b)=>{const ra=A.lv[a].level==="bad"?0:1,rb=A.lv[b].level==="bad"?0:1;return ra-rb||A.lv[a].avg-A.lv[b].avg}).slice(0,5);
  const LV={good:t("good"),mid:t("mid"),bad:t("bad"),none:t("nolv")};
  app.innerHTML=topbar()+(o.teacher?'':tabs(k))+hero(k,t("back"))+
   '<section class="card"><h2>'+t("summary",esc(k.name))+'</h2><div class="kpis">'+
    '<div class="kpi"><b>'+A.perWeek.length+'</b><span>'+t("k_weeks")+'</span></div><div class="kpi"><b>'+A.total+'</b><span>'+t("k_total")+'</span></div><div class="kpi"><b>'+avg+'</b><span>'+t("k_avg")+'</span></div>'+
    '<div class="kpi"><b>'+rate+'%</b><span>'+t("k_rate",A.evald,A.elapsed)+'</span></div><div class="kpi"><b>'+A.best+'</b><span>'+t("k_streak")+'</span></div><div class="kpi"><b>'+cnt.good+'</b><span>'+t("k_good",ids.length)+'</span></div></div></section>'+
   '<section class="card"><h2>'+t("chart_t")+'</h2><div class="chart">'+chartSvg(A.perWeek)+'</div><div class="legend"><span><i style="background:var(--accent2)"></i>'+t("chart_prev")+'</span><span><i style="background:var(--accent)"></i>'+t("chart_cur")+'</span><span>'+t("chart_max")+'</span></div></section>'+
   '<section class="card"><h2>'+t("lv_t")+'</h2><div class="legend">'+["good","mid","bad","none"].map(l=>'<span><i style="background:var(--'+l+')"></i>'+LV[l]+' ('+cnt[l]+')</span>').join("")+'</div><div class="sgrid">'+
    ids.map(n=>{const v=A.lv[n];return '<div class="scell '+v.level+'"><span class="nm">'+esc(sName(n))+'</span><span class="sc">'+(v.n?(t("avg")+' '+v.avg.toFixed(1)+' · '+v.n+' '+t("times")+(v.weakN?' · '+t("mistake")+' '+v.weakN:'')):LV.none)+'</span></div>'}).join("")+'</div></section>'+
   '<section class="card"><h2>'+t("focus_t")+'</h2>'+(weakest.length?'<ul class="list">'+weakest.map(n=>{const v=A.lv[n];return '<li><span><span class="dot" style="background:var(--'+v.level+')"></span><span class="q">'+esc(sName(n))+'</span></span><span class="m">'+LV[v.level]+' · '+t("avg")+' '+v.avg.toFixed(1)+'</span></li>'}).join("")+'</ul>':'<p class="empty">'+t("focus_none")+'</p>')+'</section>'+
   '<section class="card"><h2>'+t("new_t")+'</h2>'+(A.news.length?'<ul class="list">'+A.news.map(x=>'<li><span class="t"><span class="q">'+esc(sName(x.n))+'</span> '+(x.f||x.t?'<span class="m">'+(x.f||"?")+'–'+(x.t||"?")+'</span>':'')+'</span><span class="m">'+DAYS[L()][parse(x.d).getDay()]+' '+nice(x.d)+'</span></li>').join("")+'</ul>':'<p class="empty">'+t("new_none")+'</p>')+'</section>'+
   '<section class="card"><h2>'+t("weeks_t")+'</h2><ul class="list">'+A.perWeek.slice().reverse().map(d=>'<li><button data-w="'+d.w+'"><span>'+nice(d.w)+' – '+nice(addDays(d.w,6))+(d.w===weekOf(today())?' '+t("current"):'')+'</span><span class="m">'+d.stars+'★ · '+t("days_of",d.days)+'</span></button></li>').join("")+'</ul></section>';
  bindTop();
  const back=()=>o.teacher?go("student",{hid:o.hid,kid:k.id}):go("main");
  $("toggleView").onclick=back;
  app.querySelectorAll("[data-w]").forEach(b=>b.onclick=()=>{const w=b.dataset.w===weekOf(today())?null:b.dataset.w;back();weekView=w;render()});
}

/* ================= teacher ================= */
function renderTeachHome(){
  applyTheme(null);
  const hs=halaqaList();hs.forEach(h=>D.subStudents(h.id));const td=today();
  app.innerHTML=topbar()+'<h1 class="pagetitle">'+t("myhalaqas")+'</h1>'+
   hs.map(h=>{const st=Object.values(ST.students[h.id]||{}),dn=st.filter(k=>+((day(k,td)||{}).stars||0)>0).length;
     return '<button class="card hcard" data-h="'+h.id+'"><span class="hrow"><b>'+esc(h.name)+'</b><span class="codechip" dir="ltr">'+esc(h.code)+'</span></span><span class="hint">'+t("students")+': '+st.length+' · '+t("today")+': '+t("done_n",dn,st.length)+'</span><span class="hint">'+(h.plan&&h.plan.surahs&&h.plan.surahs.length?t("plan")+': '+t("selected",h.plan.surahs.length)+' · '+cycleLbl(h.plan.cycle):t("plan_none"))+'</span></button>'}).join("")+
   '<button class="btn accent" id="newH" style="align-self:flex-start">+ '+t("new_halaqa")+'</button>'+demoNote();
  bindTop();
  app.querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>{hDate=null;go("halaqa",{hid:b.dataset.h})});
  $("newH").onclick=()=>openHEdit(null);
}
const reminded={};
function renderHalaqa(h){
  applyTheme(null);D.subStudents(h.id);
  const td=today(),date=hDate||td,st=Object.values(ST.students[h.id]||{}).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
  const dn=st.filter(k=>+((day(k,date)||{}).stars||0)>0).length;
  app.innerHTML=topbar()+'<div class="row between"><button class="btn" id="hBack">'+ICON_BACK.replace('<svg','<svg class="ib"')+' '+t("myhalaqas")+'</button><button class="btn" id="hSet">'+t("hsettings")+'</button></div>'+
   '<section class="card"><h2>'+esc(h.name)+'</h2><div class="row"><span class="hint">'+t("code_hint")+':</span><span class="codechip big" dir="ltr" id="hCode">'+esc(h.code)+'</span><button class="btn" id="hCopy">'+t("copy")+'</button><span class="msg ok" id="hCMsg"></span></div>'+
   '<span class="hint">'+(h.plan&&h.plan.surahs&&h.plan.surahs.length?t("plan")+': '+t("selected",h.plan.surahs.length)+' · '+cycleLbl(h.plan.cycle):t("plan_none"))+'</span></section>'+
   '<div class="weeknav"><button class="btn" id="dPrev">'+t("prev")+'</button><span class="lbl">'+DAYS[L()][parse(date).getDay()]+'<b>'+nice(date)+'</b></span><button class="btn" id="dNext">'+t("next")+'</button></div>'+
   (date===td?'':'<button class="btn accent" id="dNow" style="align-self:center">'+t("today")+'</button>')+
   '<section class="card"><div class="journey-top"><h2>'+t("students")+'</h2><span class="score">'+t("done_n",'<strong>'+dn+'</strong>',st.length)+'</span></div>'+
   (st.length?'<ul class="list srows">'+st.map(k=>{const r=day(k,date)||{},hs=+(r.stars||0),ok=hs>0;
     return '<li class="srow"><div class="sname"><span class="art s">'+(THEMES[k.theme]||THEMES.space).art+'</span><span class="t"><button class="linkbtn" data-open="'+k.id+'">'+esc(k.name)+'</button><span class="hint '+(ok?"okc":"badc")+'">'+(ok?'✓ '+t("home_done")+' '+starsRO(hs):'✗ '+t("home_not"))+'</span></span></div>'+
       '<div class="sact">'+starRow("t mini",t("tstars")).replace('class="stars','data-k="'+k.id+'" class="stars')+(!ok&&date===td?'<button class="btn small" data-rem="'+k.id+'"'+(reminded[k.id+date]?' disabled':'')+'>'+(reminded[k.id+date]?t("reminded"):t("remind"))+'</button>':'')+'</div></li>'}).join("")+'</ul>':'<p class="empty">'+t("no_students")+'</p>')+'</section>'+demoNote();
  bindTop();
  $("hBack").onclick=()=>go("main");$("hSet").onclick=()=>openHEdit(h.id);
  $("hCopy").onclick=()=>copyText(h.code,$("hCMsg"));
  $("dPrev").onclick=()=>{hDate=addDays(date,-1);render()};$("dNext").onclick=()=>{hDate=addDays(date,1);render()};
  if($("dNow"))$("dNow").onclick=()=>{hDate=null;render()};
  app.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>go("student",{hid:h.id,kid:b.dataset.open}));
  app.querySelectorAll(".stars[data-k]").forEach(row=>{const k=st.find(x=>x.id===row.dataset.k);paint(row,+((day(k,date)||{}).tStars||0));
    row.querySelectorAll(".starbtn").forEach(b=>b.onclick=()=>{const cur=+((day(k,date)||{}).tStars||0),n=+b.dataset.n,v=cur===n?0:n;setField(k,date,{tStars:v});paint(row,v)})});
  app.querySelectorAll("[data-rem]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await D.remindKid(b.dataset.rem,L());reminded[b.dataset.rem+date]=1;b.textContent=t("reminded")}catch(e){b.disabled=false;b.textContent=t("err_generic")}});
}
function renderStudent(k,h){
  applyTheme(k.theme);
  const w=weekView||weekOf(today()),isCur=w===weekOf(today());
  app.innerHTML=topbar()+'<div class="row between"><button class="btn" id="sBack">'+esc(h.name)+'</button><button class="btn" id="sRemove">'+t("remove_st")+'</button></div>'+hero(k,t("history"),t("joined",esc(h.name)))+
   '<div class="weeknav"><button class="btn" id="wPrev">'+t("prev")+'</button><span class="lbl">'+t("week")+'<b>'+nice(w)+' – '+nice(addDays(w,6))+'</b></span><button class="btn" id="wNext">'+t("next")+'</button></div>'+
   (isCur?'':'<button class="btn accent" id="wNow" style="align-self:center">'+t("this_week")+'</button>')+'<div class="days" id="days"></div>';
  bindTop();
  $("sBack").onclick=()=>go("halaqa",{hid:h.id});
  $("toggleView").onclick=()=>go("shist",{hid:h.id,kid:k.id});
  $("wPrev").onclick=()=>{weekView=addDays(w,-7);render()};$("wNext").onclick=()=>{weekView=addDays(w,7);render()};
  if($("wNow"))$("wNow").onclick=()=>{weekView=null;render()};
  let armed=false;$("sRemove").onclick=async()=>{if(!armed){armed=true;$("sRemove").className="btn warn";$("sRemove").textContent=t("del2");return}await D.removeStudent(k.id);delete (ST.students[h.id]||{})[k.id];go("halaqa",{hid:h.id})};
  renderDays(k,w,true);
}
function copyText(txt,msgEl){const ok=()=>{msgEl.textContent=t("copied")};try{navigator.clipboard.writeText(txt).then(ok,()=>{msgEl.textContent=txt})}catch(e){msgEl.textContent=txt}}

/* ================= gate & settings ================= */
let gA=0,gB=0;
function renderGate(){
  applyTheme(null);gA=3+Math.floor(Math.random()*7);gB=3+Math.floor(Math.random()*7);
  app.innerHTML='<div class="topbar"><span class="brand">'+LOGO+t("app")+'</span><button class="iconbtn" id="gBack" aria-label="'+t("cancel")+'">'+ICON_BACK+'</button></div><section class="card gatebox"><h2>'+t("settings")+'</h2><p class="msg">'+t("gate_q")+'</p><span class="q">'+gA+' × '+gB+' = ?</span><input id="gIn" type="number" inputmode="numeric" autocomplete="off"><button class="btn primary big" id="gGo">'+t("gate_go")+'</button><p class="msg err" id="gMsg"></p></section>';
  $("gBack").onclick=()=>go("main");
  const ok=()=>{if(+$("gIn").value===gA*gB){gateOk=true;go("settings")}else{$("gMsg").textContent=t("gate_wrong");$("gIn").value=""}};
  $("gGo").onclick=ok;$("gIn").addEventListener("keydown",e=>{if(e.key==="Enter")ok()});
}
function timeOptions(sel){let o='<option value="">'+t("off")+'</option>';for(let m=5*60;m<24*60;m+=15){const v=pad(Math.floor(m/60))+":"+pad(m%60);o+='<option value="'+v+'"'+(v===sel?' selected':'')+'>'+v+'</option>'}return o}
function toUtcSlot(hhmm){if(!hhmm)return null;const [h,m]=hhmm.split(":").map(Number),off=-new Date().getTimezoneOffset();return (((h*60+m-off)%1440)+1440)%1440}
function renderSettings(){
  applyTheme(null);
  const P=ST.profile,ck=childKid(),hasLocal=(()=>{try{const v=JSON.parse(localStorage.getItem("sahibi-quran-v1")||"null");return v&&v.kids&&v.kids.length&&!P.imported?v:null}catch(e){return null}})();
  app.innerHTML='<div class="topbar"><span class="brand">'+LOGO+t("settings")+'</span><button class="btn primary" id="sDone">'+t("done")+'</button></div>'+
   (ck?'<section class="card"><h2>'+t("childdev")+'</h2><p class="about">'+t("childdev_on",esc(ck.name))+'</p><button class="btn" id="cdOff" style="align-self:flex-start">'+t("childdev_off")+'</button></section>':'')+
   '<section class="card"><h2>'+t("notif")+'</h2><button class="btn primary" id="nOn" style="align-self:flex-start">'+t("notif_on")+'</button><p class="msg" id="nMsg"></p>'+
    (ck?'':'<label class="field"><span class="sec-t">'+t("remind_at")+'</span><select id="remAt">'+timeOptions(P.remindAt||"")+'</select></label>'+(halaqaList().length?'<label class="field"><span class="sec-t">'+t("summary_at")+'</span><select id="sumAt">'+timeOptions(P.summaryAt||"")+'</select></label>':''))+'</section>'+
   (ck?'':
   '<section class="card"><h2>'+t("kids")+'</h2>'+kidsList().map(k=>'<div class="kidrow">'+(THEMES[k.theme]||THEMES.space).art+'<span class="t"><b>'+esc(k.name)+'</b><small>'+(halaqaOf(k)?t("joined",esc(halaqaOf(k).name)):t("selected",(effPlan(k).surahs||[]).length)+' · '+cycleLbl(effPlan(k).cycle||1))+'</small></span><button class="btn" data-ed="'+k.id+'">'+t("edit_kid")+'</button></div>').join("")+'<button class="btn accent" id="sAdd" style="align-self:flex-start">+ '+t("add_kid")+'</button></section>'+
   '<section class="card"><h2>'+t("myhalaqas")+'</h2>'+(halaqaList().length?halaqaList().map(h=>'<div class="kidrow"><span class="t"><b>'+esc(h.name)+'</b><small dir="ltr">'+esc(h.code)+'</small></span><button class="btn" data-he="'+h.id+'">'+t("edit_kid")+'</button></div>').join(""):'<p class="about">'+t("teach_t")+'</p>')+'<button class="btn accent" id="sAddH" style="align-self:flex-start">+ '+t("new_halaqa")+'</button></section>'+
   '<section class="card"><h3>'+t("lang")+'</h3>'+seg("sLang",[["ar","العربية"],["en","English"]],L())+'<h3>'+t("week_start")+'</h3>'+seg("sWs",[[6,t("sat")],[0,t("sun")],[1,t("mon")]],WS())+'</section>'+
   (hasLocal?'<section class="card"><button class="btn" id="imp">'+t("import_local")+'</button><p class="msg ok" id="impMsg"></p></section>':''))+
   '<section class="card"><h2>'+t("account")+'</h2><p class="about" dir="ltr">'+esc(ST.user.email)+'</p><div class="row"><button class="btn" id="sOut">'+t("signout")+'</button>'+(ck?'':'<button class="btn" id="sDel">'+t("delacc")+'</button>')+'</div><p class="msg err" id="sMsg"></p></section>'+
   '<section class="card"><h2>'+t("about")+'</h2><p class="about">'+t("about_t")+'</p><a class="btn" href="privacy.html" target="_blank" rel="noopener" style="align-self:flex-start">'+t("privacy")+'</a></section>'+demoNote();
  $("sDone").onclick=()=>{go("main");scrollToday()};
  if($("cdOff"))$("cdOff").onclick=()=>{prefs.child=null;savePrefs();renderSettings()};
  $("nOn").onclick=async()=>{const m=$("nMsg");m.className="msg";try{const r=await D.enablePush(ck?{kidId:ck.id}:{});m.className="msg "+(r==="ok"?"ok":"err");m.textContent=t({ok:"notif_ok",denied:"notif_denied",unsupported:"notif_unsupported","ios-home":"notif_ios",demo:"notif_demo"}[r]||"err_generic")}catch(e){m.className="msg err";m.textContent=t("err_generic")}};
  const off=-new Date().getTimezoneOffset();
  if($("remAt"))$("remAt").onchange=e=>D.saveProfile({remindAt:e.target.value||null,remindUtc:toUtcSlot(e.target.value),offset:off});
  if($("sumAt"))$("sumAt").onchange=e=>D.saveProfile({summaryAt:e.target.value||null,summaryUtc:toUtcSlot(e.target.value),offset:off});
  app.querySelectorAll("[data-ed]").forEach(b=>b.onclick=()=>openEdit(b.dataset.ed));
  app.querySelectorAll("[data-he]").forEach(b=>b.onclick=()=>openHEdit(b.dataset.he));
  if($("sAdd"))$("sAdd").onclick=()=>openEdit(null);
  if($("sAddH"))$("sAddH").onclick=()=>openHEdit(null);
  if($("sLang"))$("sLang").querySelectorAll("button").forEach(b=>b.onclick=()=>{prefs.lang=b.dataset.v;savePrefs();D.saveProfile({lang:b.dataset.v});renderSettings()});
  if($("sWs"))$("sWs").querySelectorAll("button").forEach(b=>b.onclick=()=>{D.saveProfile({weekStart:+b.dataset.v});renderSettings()});
  if($("imp"))$("imp").onclick=async()=>{const v=hasLocal;let n=0;for(const k of v.kids){const id=uid("k");await D.saveKid({id,name:k.name,gender:k.gender||"m",theme:k.theme||"space",surahs:k.surahs,cycle:k.cycle||1,light:k.light==null?5:k.light,weekStart:v.weekStart==null?6:v.weekStart,start:k.start,created:Date.now()+n,halaqaId:null,teacherUid:null});
      const R=(v.rec||{})[k.id]||{};for(const d of Object.keys(R))await D.setDay(id,d,R[d]);n++}
    D.saveProfile({imported:true});$("impMsg").textContent=t("imported",n);$("imp").disabled=true};
  $("sOut").onclick=async()=>{gateOk=false;nav={view:"main"};await D.signOut()};
  let armed=false;if($("sDel"))$("sDel").onclick=async()=>{if(!armed){armed=true;$("sDel").className="btn warn";$("sDel").textContent=t("delacc2");return}
    try{await D.deleteAccount();gateOk=false;nav={view:"main"};render()}catch(e){$("sMsg").textContent=I[L()][e.code]?t(e.code):t("err_generic")}};
}

/* ================= plan picker (shared) ================= */
function planSection(d){
  return '<section class="card"><h3>'+t("memorized")+'</h3><div class="row"><span class="hint">'+t("presets")+'</span>'+["p30","p29","p2930","pall","pnone"].map(p=>'<button type="button" class="btn" data-p="'+p+'">'+t(p)+'</button>').join("")+'</div>'+
   '<label class="field"><input id="eSearch" type="search" placeholder="'+t("search")+'" autocomplete="off"></label><span class="hint" id="eCount"></span><div class="picker" id="ePick">'+
   range(1,114).map(n=>'<label class="pk" data-q="'+esc(S[n-1][0]+" "+S[n-1][1].toLowerCase()+" "+n)+'"><input type="checkbox" value="'+n+'"'+(d.surahs.indexOf(n)>-1?' checked':'')+'><span class="n">'+n+'</span><span class="q">'+esc(sName(n))+'</span><span class="a">'+S[n-1][2]+' '+t("ayah")+'</span></label>').join("")+'</div></section>'+
   '<section class="card"><h3>'+t("cycle")+'</h3>'+seg("eCycle",[1,2,3,4,6,8,12].map(c=>[c,cycleLbl(c)]),d.cycle)+'<h3>'+t("light")+'</h3>'+seg("eLight",[[-1,t("none")]].concat(range(0,6).map(i=>[(WS()+i)%7,DAYS[L()][(WS()+i)%7]])),d.light)+'<div class="estimate" id="eEst"></div></section>';
}
function bindPlan(d){
  const upd=()=>{$("eCount").textContent=t("selected",d.surahs.length);const tot=d.surahs.reduce((a,n)=>a+S[n-1][2],0),caps=7*d.cycle-(d.light>=0?0.5*d.cycle:0);$("eEst").innerHTML=d.surahs.length?t("est",Math.round(tot/caps),cycleLbl(d.cycle)):t("est0")};upd();
  const segB=(id,f)=>$(id).querySelectorAll("button").forEach(b=>b.onclick=()=>{d[f]=+b.dataset.v;$(id).querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));upd()});
  segB("eCycle","cycle");segB("eLight","light");
  const sync=()=>{$("ePick").querySelectorAll("input").forEach(c=>c.checked=d.surahs.indexOf(+c.value)>-1);upd()};
  $("ePick").addEventListener("change",e=>{const n=+e.target.value;if(e.target.checked){if(d.surahs.indexOf(n)<0)d.surahs.push(n)}else d.surahs=d.surahs.filter(x=>x!==n);upd()});
  app.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>{const p=b.dataset.p,add=p==="p30"?range(78,114):p==="p29"?range(67,77):p==="p2930"?range(67,114):p==="pall"?range(1,114):null;if(!add)d.surahs=[];else add.forEach(n=>{if(d.surahs.indexOf(n)<0)d.surahs.push(n)});d.surahs.sort((a,b)=>a-b);sync()});
  $("eSearch").oninput=e=>{const q=e.target.value.trim().toLowerCase();$("ePick").querySelectorAll(".pk").forEach(r=>r.hidden=!!q&&r.dataset.q.indexOf(q)<0)};
}

/* ================= kid editor ================= */
function openEdit(id){
  const k=id?ST.kids[id]:null;
  draft=k?JSON.parse(JSON.stringify(k)):{id:uid("k"),name:"",gender:"m",theme:"space",surahs:[],cycle:1,light:5,halaqaId:null,teacherUid:null,_new:true};
  if(!draft.surahs)draft.surahs=[];go("edit");
}
function renderEdit(){
  applyTheme(null);const d=draft,h=halaqaOf(d),tp=h&&h.plan&&h.plan.surahs&&h.plan.surahs.length;
  app.innerHTML='<div class="topbar"><span class="brand">'+LOGO+t(d._new?"add_kid":"edit_kid")+'</span><button class="iconbtn" id="eBack" aria-label="'+t("cancel")+'">'+ICON_BACK+'</button></div>'+
   '<section class="card"><label class="field"><span class="sec-t">'+t("kid_name")+'</span><input id="eName" autocomplete="off" maxlength="30" value="'+esc(d.name)+'"></label>'+seg("eGender",[["m",t("boy")],["f",t("girl")]],d.gender)+'</section>'+
   '<section class="card"><h3>'+t(d.gender==="f"?"theme_f":"theme")+'</h3><div class="themes" id="eThemes">'+THEME_ORDER.map(th=>'<button type="button" class="th" data-th="'+th+'" aria-pressed="'+(th===d.theme)+'">'+THEMES[th].art+'<span>'+THEMES[th][L()]+'</span></button>').join("")+'</div></section>'+
   '<section class="card"><h3>'+t("halaqa")+'</h3>'+(h?'<p class="about">'+t("joined",esc(h.name))+(h.teacherName?' · '+t("teacher_of",esc(h.teacherName)):'')+'</p><p class="about">'+(tp?t("plan_by_teacher",esc(h.name)):t("plan_by_parent"))+'</p><button type="button" class="btn" id="hLeave" style="align-self:flex-start">'+t("leave")+'</button>':
     '<div class="row"><input id="hCodeIn" class="codein" dir="ltr" maxlength="8" placeholder="'+t("halaqa_code")+'" autocomplete="off"><button type="button" class="btn primary" id="hJoin">'+t("join")+'</button></div>')+'<p class="msg" id="hMsg"></p></section>'+
   (tp?'':planSection(d))+
   (d._new?'':'<section class="card"><h3>'+t("childdev")+'</h3><p class="about">'+t("childdev_t")+'</p><button type="button" class="btn" id="cdSet" style="align-self:flex-start">'+t("childdev_set",esc(d.name))+'</button></section>')+
   '<p class="msg err" id="eMsg"></p><div class="row"><button class="btn primary big" id="eSave">'+t("save")+'</button><button class="btn big" id="eCancel">'+t("cancel")+'</button>'+(d._new?'':'<button class="btn big" id="eDel" style="margin-inline-start:auto">'+t("del")+'</button>')+'</div>';
  $("eName").oninput=e=>{d.name=e.target.value};
  $("eGender").querySelectorAll("button").forEach(b=>b.onclick=()=>{d.gender=b.dataset.v;renderEdit()});
  $("eThemes").querySelectorAll(".th").forEach(b=>b.onclick=()=>{d.theme=b.dataset.th;$("eThemes").querySelectorAll(".th").forEach(x=>x.setAttribute("aria-pressed",String(x===b)))});
  if(!tp)bindPlan(d);
  const leave=()=>{draft=null;go(ST.kids[d.id]||!kidsList().length?(gateOk?"settings":"main"):"main")};
  $("eBack").onclick=leave;$("eCancel").onclick=leave;
  const hm=(m,ok)=>{$("hMsg").className="msg "+(ok?"ok":"err");$("hMsg").textContent=m};
  if($("hJoin"))$("hJoin").onclick=async()=>{const code=$("hCodeIn").value.trim().toUpperCase();if(!code)return;
    if(d._new||!ST.kids[d.id]){if(!d.name.trim()){hm(t("name_req"));return}await saveDraft(true)}
    try{const r=await D.joinHalaqa(d.id,code);if(r.err){hm(t("notfound"));return}d.halaqaId=(ST.kids[d.id]||{}).halaqaId||d.halaqaId;draft=Object.assign(JSON.parse(JSON.stringify(ST.kids[d.id]||d)),{_new:false});renderEdit();hm(t("joined",esc(r.name)),true)}catch(e){hm(t("err_generic"))}};
  if($("hLeave"))$("hLeave").onclick=async()=>{await D.leaveHalaqa(d.id);d.halaqaId=null;d.teacherUid=null;renderEdit()};
  if($("cdSet"))$("cdSet").onclick=()=>{prefs.child={uid:ST.user.uid,kid:d.id};savePrefs();gateOk=false;go("main")};
  $("eSave").onclick=async()=>{const ok=await saveDraft(false);if(ok){prefs.cur=d.id;savePrefs();draft=null;go("main");scrollToday()}};
  let armed=false;if($("eDel"))$("eDel").onclick=async()=>{if(!armed){armed=true;$("eDel").className="btn warn big";$("eDel").textContent=t("del2");return}
    await D.deleteKid(d.id);if(prefs.child&&prefs.child.kid===d.id)prefs.child=null;if(prefs.cur===d.id)prefs.cur=null;savePrefs();draft=null;go("settings")};
}
async function saveDraft(quiet){
  const d=draft;d.name=(d.name||"").trim();const h=halaqaOf(d),tp=h&&h.plan&&h.plan.surahs&&h.plan.surahs.length;
  if(!d.name){$("eMsg").textContent=t("name_req");return false}
  if(!tp&&!d.surahs.length&&!quiet){$("eMsg").textContent=t("surah_req");return false}
  const prev=ST.kids[d.id];
  const changed=!prev||JSON.stringify([prev.surahs,prev.cycle,prev.light])!==JSON.stringify([d.surahs,d.cycle,d.light]);
  const k={id:d.id,name:d.name,gender:d.gender,theme:d.theme,surahs:d.surahs.slice().sort((a,b)=>a-b),cycle:d.cycle,light:d.light,weekStart:WS(),
    start:changed?weekOf(today()):(prev.start||weekOf(today())),created:prev&&prev.created||Date.now(),halaqaId:prev?prev.halaqaId||null:null,teacherUid:prev?prev.teacherUid||null:null};
  await D.saveKid(k);d._new=false;return true;
}

/* ================= halaqa editor ================= */
function newCode(){const A="ABCDEFGHJKMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<6;i++)s+=A[Math.floor(Math.random()*A.length)];return s}
function openHEdit(id){
  const h=id?ST.halaqas[id]:null;
  draft=h?JSON.parse(JSON.stringify(h)):{id:uid("h"),name:"",teacherName:ST.profile.name||"",plan:null,_new:true};
  draft._usePlan=!!(draft.plan&&draft.plan.surahs&&draft.plan.surahs.length);
  draft._p=draft.plan?JSON.parse(JSON.stringify(draft.plan)):{surahs:[],cycle:1,light:5};
  go("hedit");
}
function renderHEdit(){
  applyTheme(null);const d=draft;
  app.innerHTML='<div class="topbar"><span class="brand">'+LOGO+t(d._new?"new_halaqa":"hsettings")+'</span><button class="iconbtn" id="eBack" aria-label="'+t("cancel")+'">'+ICON_BACK+'</button></div>'+
   '<section class="card"><label class="field"><span class="sec-t">'+t("halaqa_name")+'</span><input id="hName" autocomplete="off" maxlength="40" value="'+esc(d.name)+'"></label><label class="field"><span class="sec-t">'+t("teacher_name")+'</span><input id="hTName" autocomplete="off" maxlength="40" value="'+esc(d.teacherName||"")+'"></label>'+(d.code?'<span class="hint">'+t("halaqa_code")+': <span class="codechip" dir="ltr">'+esc(d.code)+'</span></span>':'')+'</section>'+
   '<section class="card"><h2>'+t("plan")+'</h2><p class="about">'+t("plan_t")+'</p>'+seg("usePlan",[["0",t("plan_none")],["1",t("plan")]],d._usePlan?"1":"0")+'</section>'+
   (d._usePlan?planSection(d._p):'')+
   '<p class="msg err" id="eMsg"></p><div class="row"><button class="btn primary big" id="eSave">'+t("save")+'</button><button class="btn big" id="eCancel">'+t("cancel")+'</button>'+(d._new?'':'<button class="btn big" id="eDel" style="margin-inline-start:auto">'+t("del_h")+'</button>')+'</div>';
  $("hName").oninput=e=>{d.name=e.target.value};$("hTName").oninput=e=>{d.teacherName=e.target.value};
  $("usePlan").querySelectorAll("button").forEach(b=>b.onclick=()=>{d._usePlan=b.dataset.v==="1";renderHEdit()});
  if(d._usePlan)bindPlan(d._p);
  const leave=()=>{const id=d.id,isNew=d._new;draft=null;if(!isNew&&ST.halaqas[id])go("halaqa",{hid:id});else go(gateOk?"settings":"main")};
  $("eBack").onclick=leave;$("eCancel").onclick=leave;
  $("eSave").onclick=async()=>{d.name=d.name.trim();if(!d.name){$("eMsg").textContent=t("name_req");return}
    if(d._usePlan&&!d._p.surahs.length){$("eMsg").textContent=t("surah_req");return}
    $("eSave").disabled=true;
    try{let code=d.code;if(!code){for(let i=0;i<5;i++){code=newCode();if(!(await D.codeTaken(code)))break}}
      const prev=d.plan,np=d._usePlan?{surahs:d._p.surahs.slice().sort((a,b)=>a-b),cycle:d._p.cycle,light:d._p.light,weekStart:WS(),start:prev&&JSON.stringify([prev.surahs,prev.cycle,prev.light])===JSON.stringify([d._p.surahs,d._p.cycle,d._p.light])?prev.start:weekOf(today())}:null;
      await D.saveHalaqa({id:d.id,name:d.name,teacherName:(d.teacherName||"").trim(),code,plan:np,created:d.created||Date.now()});
      if(!ST.profile.name&&d.teacherName)D.saveProfile({name:d.teacherName.trim()});
      prefs.mode="teach";savePrefs();const id=d.id;draft=null;hDate=null;go("halaqa",{hid:id});
    }catch(e){$("eSave").disabled=false;$("eMsg").textContent=t("err_generic")}};
  let armed=false;if($("eDel"))$("eDel").onclick=async()=>{if(!armed){armed=true;$("eDel").className="btn warn big";$("eDel").textContent=t("del2");return}await D.deleteHalaqa(d.id);draft=null;go("main")};
}

render();
