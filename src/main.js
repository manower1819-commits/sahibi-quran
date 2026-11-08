import {S} from "./surahs.js";
import {pad,iso,parse,addDays,diffDays,weekOfWs,planItems,planUnits,planHas,planAyat,planAdd,planCovers,mergeItems,pageSegments,itemPageList,itemAyat,itemPages} from "./planner.js";
import {I,DAYS,DSHORT} from "./i18n.js";
import {STAR,LOGO,THEMES,THEME_ORDER,giftSvg,ICON_GEAR,ICON_BACK} from "./themes.js";
import {createFakeBackend} from "./backend-fake.js";
import {CONFIG} from "./config.js";
import {avatar,LOOKS,SKINS} from "./avatar.js";
import {PALETTES,PALETTE_ORDER} from "./palettes.js";
import {juzCoverage,surahsOfJuz} from "./juz.js";
import {pageStrugglers} from "./strength.js";
import {makeBackup,parseBackup,MAX_FILE_BYTES} from "./backup.js";
import {parseQuranText,quranTextComplete,splitBasmala,QURAN_TEXT_URL} from "./quran-text.js";
import {PTS_STAR,PTS_WEEK,PTS_CHALLENGE,levelInfo,challengeFor,challengeProgress} from "./gamify.js";

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
const WS=()=>ST.profile.weekStart==null?(L()==="en"?0:6):ST.profile.weekStart;
const weekOf=(s,ws)=>weekOfWs(s,ws==null?WS():ws);
const nice=s=>new Intl.DateTimeFormat(L()==="en"?"en-GB":"ar-u-ca-gregory-nu-latn",{day:"numeric",month:"short"}).format(parse(s));
const giftTail=k=>k.gift?' · '+t("gift_is",esc(k.gift)):'';
const hij=s=>{if(!ST.profile.hijri)return"";
  try{return new Intl.DateTimeFormat(L()==="en"?"en-u-ca-islamic-umalqura-nu-latn":"ar-u-ca-islamic-umalqura-nu-latn",{day:"numeric",month:"long"}).format(parse(s))}catch(e){return""}};
const niceH=s=>{const h=hij(s);return h?nice(s)+' · '+h:nice(s)};
const today=()=>iso(new Date());
const range=(a,b)=>{const r=[];for(let i=a;i<=b;i++)r.push(i);return r};
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const app=$("app");

/* ================= planning ================= */
function halaqaOf(kid){if(!kid||!kid.halaqaId)return null;return ST.hdocs[kid.halaqaId]||ST.halaqas[kid.halaqaId]||null}
function effPlan(kid){const h=halaqaOf(kid);return h&&planHas(h.plan)?h.plan:kid}
const planSurahCount=p=>new Set(planUnits(p).map(u=>u[0])).size;
function day(kid,date){return ((ST.days[kid.id]||{})[date])||null}
function planFor(kid,date){
  const r=day(kid,date);if(r&&r.items)return r.items;
  return planItems(effPlan(kid),date);
}
function setField(kid,date,f){quietUntil=Date.now()+900;const r=day(kid,date);if(!r||!r.items)f=Object.assign({items:planFor(kid,date)},f);D.setDay(kid.id,date,f)}
const amt=items=>{const pg=Math.round(itemPages(items)*10)/10;return itemAyat(items)+' '+t("ayah")+' · '+pg+' '+(L()==="en"&&pg===1?"page":t("page_u"))};
const itemLabel=it=>{const a=S[it[0]-1][2];return esc(sName(it[0]))+((it[1]>1||it[2]<a)?'<small>'+it[1]+'–'+it[2]+'</small>':'')};
const cycleLbl=c=>c===1?t("week1"):c===2?t("weeks2"):t("weeks",c);

/* ================= themes ================= */
function applyTheme(th){
  const root=document.documentElement.style;document.body.dataset.mode="";
  ["bg","surface","surface2","ink","muted","accent","accent2","line","star","on-accent","good","mid","bad","none"].forEach(k=>root.removeProperty("--"+k));
  root.removeProperty("color-scheme");app.classList.remove("sky");
  ["hero","hero-ink","on-primary"].forEach(k=>root.removeProperty("--"+k));
  if(!th||!THEMES[th]){setPalette(appTheme());return}
  const T=THEMES[th];Object.keys(T.c).forEach(k=>root.setProperty("--"+k,T.c[k]));
  root.setProperty("--hero",T.dark?T.c.surface2:T.c.accent2);root.setProperty("--hero-ink","#ffffff");root.setProperty("--on-primary","#ffffff");
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
  if(prefs.pendingJoin&&["edit","gate","settings"].indexOf(v)<0)return renderJoin();
  if(v==="gate")return renderGate();
  if(v==="settings")return renderSettings();
  if(v==="edit")return renderEdit();
  if(v==="hedit")return renderHEdit();
  if(childKid()){const k=childKid();return v==="hist"?renderHist(k,{}):v==="report"?renderReport(k,{}):v==="record"?renderRecord(k,{}):renderKid(k)}
  if(prefs.mode==="teach"&&halaqaList().length){
    if(v==="halaqa"&&ST.halaqas[nav.hid])return renderHalaqa(ST.halaqas[nav.hid]);
    if(v==="student"){const k=(ST.students[nav.hid]||{})[nav.kid];if(k)return renderStudent(k,ST.halaqas[nav.hid]);}
    if(v==="shist"){const k=(ST.students[nav.hid]||{})[nav.kid];if(k)return renderHist(k,{teacher:true,hid:nav.hid});}
    if(v==="hreport"&&ST.halaqas[nav.hid])return renderHReport(ST.halaqas[nav.hid]);
    if(v==="sreport"){const k=(ST.students[nav.hid]||{})[nav.kid];if(k)return renderReport(k,{teacher:true,hid:nav.hid});}
    if(v==="srecord"){const k=(ST.students[nav.hid]||{})[nav.kid];if(k)return renderRecord(k,{teacher:true,hid:nav.hid});}
    return renderTeachHome();
  }
  const k=curKid();
  if(!k)return renderWelcome();
  if(v==="hist")return renderHist(k,{});
  if(v==="report")return renderReport(k,{});
  if(v==="record")return renderRecord(k,{});
  return renderKid(k);
}
function renderKid(k){const m=modeOf(k);m==="adults"?renderAdult(k):m==="teens"?renderTeen(k):renderKids(k);try{maybeOnboard(k,m)}catch(e){}}
function maybeOnboard(k,m){
  if(prefs.onb)return;prefs.onb=1;savePrefs();
  if(m!=="kids"||childKid()||!k.created||Date.now()-k.created>2*864e5)return;
  let i=0;const ov=document.createElement("div");ov.className="celebrate onb";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");
  const draw=()=>{ov.innerHTML='<div class="cel-in"><h2>'+t("onb_t"+i)+'</h2><p>'+t("onb_p"+i)+'</p><div class="dots">'+[0,1,2].map(j=>'<i'+(j===i?' class="on"':'')+'></i>').join("")+'</div><button class="btn accent big" id="onbNext">'+t(i<2?"onb_next":"onb_go")+'</button>'+(i<2?'<button class="btn" id="onbSkip">'+t("onb_skip")+'</button>':'')+'</div>';
    $("onbNext").onclick=()=>{if(i<2){i++;draw()}else ov.remove()};if($("onbSkip"))$("onbSkip").onclick=()=>ov.remove();$("onbNext").focus()};
  document.body.appendChild(ov);draw();
}
// update live parts without destroying inputs (path, stars, teacher rows)
function refreshLive(){
  if(nav.view==="main"&&$("path")){const k=childKid()||curKid();if(k&&modeOf(k)==="kids"){const w=weekView||weekOf(today());$("path").innerHTML=kidsScene(k,w,pickDay(w));bindScene(k,w)}}
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
   (prefs.pendingJoin?'<p class="chipline">'+t("join_login")+'</p>':'')+
   '<form class="card" id="authF" novalidate><h2>'+t(up?"signup":"signin")+'</h2>'+
   (up?'<label class="field"><span class="sec-t">'+t("your_name")+'</span><input id="aName" autocomplete="name" maxlength="40"></label>':'')+
   '<label class="field"><span class="sec-t">'+t("email")+'</span><input id="aEmail" type="email" autocomplete="email" dir="ltr" required></label>'+
   '<label class="field"><span class="sec-t">'+t("password")+'</span><input id="aPw" type="password" autocomplete="'+(up?"new-password":"current-password")+'" dir="ltr" required></label>'+
   '<label class="checkrow"><input type="checkbox" id="aShow"> '+t("show_pw")+'</label>'+
   '<p class="msg err" id="aMsg"></p><button class="btn primary big" id="aGo" type="submit">'+t(up?"signup":"signin")+'</button>'+
   '<div class="row"><button class="btn" type="button" id="aSwitch">'+t(up?"have_acc":"no_acc")+'</button>'+(up?'':'<button class="btn" type="button" id="aForgot">'+t("forgot")+'</button>')+'</div></form>'+
   '<div class="row" style="justify-content:center"><button class="btn" id="aLang">'+(L()==="ar"?"English":"العربية")+'</button></div>';
  const msg=(m,ok)=>{const e=$("aMsg");e.className="msg "+(ok?"ok":"err");e.textContent=m};
  $("aShow").onchange=e=>{$("aPw").type=e.target.checked?"text":"password"};
  $("aSwitch").onclick=()=>{authMode=up?"signin":"signup";renderAuth()};
  $("aLang").onclick=()=>{prefs.lang=L()==="ar"?"en":"ar";savePrefs();render()};
  if($("aForgot"))$("aForgot").onclick=async()=>{const e=$("aEmail").value.trim();if(!e){msg(t("auth/invalid-email"));return}try{await D.resetPw(e);msg(t("reset_sent"),true)}catch(x){msg(t(x.code)||t("err_generic"))}};
  $("authF").onsubmit=async e=>{e.preventDefault();$("aGo").disabled=true;msg("");
    const nm=up?($("aName").value||"").trim():"";
    try{if(up)await D.signUp($("aEmail").value.trim(),$("aPw").value,nm);else await D.signIn($("aEmail").value.trim(),$("aPw").value);
      if(up)D.saveProfile({lang:L(),weekStart:L()==="en"?0:6,name:nm});}
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
  $("gear").onclick=()=>openSettings();
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
  app.innerHTML=topbar()+'<section class="stack welcome"><span class="logo">'+LOGO+'</span><h1>'+t("app")+'</h1><p>'+t("tag")+'</p><h2 class="who">'+t("start_who")+'</h2><div class="langpick"><button class="btn primary big" id="first">'+t("for_child")+'</button><button class="btn accent big" id="firstSelf">'+t("for_me")+'</button></div></section>'+
   '<section class="card"><h2>'+t("teach")+'</h2><p class="about">'+t("teach_t")+'</p><button class="btn accent" id="firstH" style="align-self:flex-start">'+t("new_halaqa")+'</button></section>'+demoNote();
  bindTop();$("first").onclick=()=>openEdit(null);$("firstSelf").onclick=()=>openEdit(null,true);$("firstH").onclick=()=>openHEdit(null);
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
/* One day's card. variant: "week" (list of 7), "kids", "teens", "adults"; teacherMode: the class rating. */
function wordRow(cls,label){return '<div class="stars words '+cls+'" role="group" aria-label="'+label+'">'+[1,2,3].map(n=>'<button class="wordbtn" data-n="'+n+'">'+t(HINT[n])+'</button>').join("")+'</div>'}
function makeDayCard(k,date,i,w,teacherMode,variant){
  variant=variant||"week";
  const jd=parse(date).getDay(),r=day(k,date)||{},items=planFor(k,date),isToday=date===today();
  const weakKey=teacherMode?"tWeak":"weak",weak=r[weakKey]||[],p=effPlan(k),A=variant==="adults"?analyse(k):null;
  const el=document.createElement("article");el.className="card day v-"+variant+(isToday&&variant==="week"?" today":"");el.id="day-"+date;
  const head=variant==="kids"?'<div class="day-h"><h2>'+(isToday?t("mission"):DAYS[L()][jd])+'</h2><span class="d">'+(items.length?amt(items):'')+'</span></div>'
    :'<div class="day-h"><h2>'+(variant==="week"?DAYS[L()][jd]:t("review_of",DAYS[L()][jd]))+(isToday&&variant==="week"?'<span class="chip today">'+t("today")+'</span>':'')+(jd===p.light?'<span class="chip">'+t("lightchip")+'</span>':'')+'</h2><span class="d">'+(variant==="week"?niceH(date):(items.length?amt(items):''))+'</span></div>';
  let list;
  if(!items.length)list='<p class="empty">'+t("no_review")+'</p>';
  else if(variant==="adults")list='<div class="rows">'+items.map(it=>{const lv=A.lv[it[0]],str=lv&&lv.n?t("strength")+' '+lv.avg.toFixed(1):t("nolv");return '<button class="item row'+(weak.indexOf(it[0])>-1?' weak':'')+'" data-s="'+it[0]+'" aria-pressed="'+(weak.indexOf(it[0])>-1)+'"><span class="q">'+itemLabel(it)+'</span><span class="m">'+(it[2]-it[1]+1)+' '+t("ayah")+' · '+str+'</span></button>'}).join("")+'</div><span class="hint">'+t("tap_weak_self")+'</span>';
  else list='<div class="items">'+items.map(it=>'<button class="item'+(weak.indexOf(it[0])>-1?' weak':'')+'" data-s="'+it[0]+'" aria-pressed="'+(weak.indexOf(it[0])>-1)+'">'+itemLabel(it)+'</button>').join("")+'</div><span class="hint">'+(teacherMode?t("tweak"):variant==="teens"||k.self?t("tap_weak_self"):t(k.gender==="f"?"tap_weak_f":"tap_weak"))+'</span>';
  if(items.length)list+='<div class="row"><button class="btn small listen" data-listen>'+ICONS.play+t("listen")+'</button><button class="btn small listen" data-text>'+ICONS.book+t("text_btn")+'</button></div>';
  if(isToday&&!teacherMode)list+='<div class="addrev makeup" hidden></div><div class="addrev strength" hidden></div>';
  if(items.length&&!teacherMode)list+='<details class="more pagesbox"><summary>'+t("pages_t")+'</summary><p class="hint">'+t("pages_hint")+'</p><div class="items">'+itemPageList(items).map(pg=>'<button type="button" class="item pg'+(((r.pw||[]).indexOf(pg)>-1)?' weak':'')+'" data-pg="'+pg+'" aria-pressed="'+((r.pw||[]).indexOf(pg)>-1)+'">'+t("page_n",pg.toLocaleString(L()==="en"?"en":"ar-EG"))+'</button>').join("")+'</div></details>';
  let html=head+(variant==="week"?'<div class="field"><div class="sec-t"><span>'+t("review")+'</span><span>'+(items.length?amt(items):'')+'</span></div>'+list+'</div>':list);
  const extras='<label class="field"><span class="sec-t">'+t("extra")+'</span><input data-f="extra" id="ex-'+date+'" autocomplete="off" placeholder="'+t("extra_ph")+'"></label>'+
      '<div class="field"><span class="sec-t">'+t("newm")+'</span><div class="newrow"><select class="sel" data-f="nS" id="ns-'+date+'" aria-label="'+t("new_surah")+'">'+surahOptions(+r.nS||0)+'</select><input data-f="nF" id="nf-'+date+'" type="number" inputmode="numeric" min="1" placeholder="'+t("from_s")+'" aria-label="'+t("from")+'"><input data-f="nT" id="nt-'+date+'" type="number" inputmode="numeric" min="1" placeholder="'+t("to_s")+'" aria-label="'+t("to")+'"></div><div class="addrev" hidden></div></div>'+
      '<label class="field"><span class="sec-t">'+t("notes")+'</span><textarea data-f="notes" id="no-'+date+'" rows="1"></textarea></label>';
  const teacherBox=(+(r.tStars||0)>0||r.tNotes||(r.tWeak||[]).length)?'<div class="other"><span>'+t("teacher_rating")+': '+(+(r.tStars||0)>0?starsRO(+r.tStars):t("not_rated"))+'</span>'+((r.tWeak||[]).length?'<span class="hint">'+t("mistake")+': '+r.tWeak.map(n=>esc(sName(n))).join("، ")+'</span>':'')+(r.tNotes?'<span class="hint">'+esc(r.tNotes)+'</span>':'')+'</div>':'';
  if(teacherMode){
    html+='<div class="other"><span>'+t("home_rating")+': '+(+(r.stars||0)>0?starsRO(+r.stars):t("not_rated"))+'</span>'+((r.weak||[]).length?'<span class="hint">'+t("mistake")+': '+r.weak.map(n=>esc(sName(n))).join("، ")+'</span>':'')+(r.nS?'<span class="hint">'+t("newm")+': '+esc(sName(+r.nS))+' '+(r.nF||"")+'–'+(r.nT||"")+'</span>':'')+(r.notes?'<span class="hint">'+esc(r.notes)+'</span>':'')+'</div>'+
      starRow("t",t("tstars"))+'<label class="field"><span class="sec-t">'+t("tnotes")+'</span><textarea data-f="tNotes" id="tn-'+date+'" rows="1"></textarea></label>';
  }else if(variant==="kids"){
    html+='<div class="stars big h" role="group" aria-label="'+t("stars")+'">'+[1,2,3].map(n=>'<button class="starbtn" data-n="'+n+'" aria-label="'+n+'">'+STAR+'</button>').join("")+'</div>'+teacherBox+
      '<details class="more"><summary>'+t("for_parents")+'</summary>'+extras+'</details>';
  }else if(variant==="teens"||variant==="adults"){
    html+=wordRow("h",t("stars"))+teacherBox+(variant==="adults"?extras:'<details class="more"><summary>'+t("more")+'</summary>'+extras+'</details>');
  }else{
    html+=extras.split('<label class="field"><span class="sec-t">'+t("notes"))[0]+starRow("h",t("stars"))+teacherBox+'<label class="field"><span class="sec-t">'+t("notes")+'</span><textarea data-f="notes" id="no-'+date+'" rows="1"></textarea></label>';
  }
  el.innerHTML=html;
  el.querySelectorAll("input[data-f],textarea[data-f]").forEach(inp=>{inp.value=r[inp.dataset.f]||"";let tm;inp.addEventListener("input",()=>{clearTimeout(tm);tm=setTimeout(()=>{let v=inp.value;if(inp.type==="number"){const n=+el.querySelector("[data-f=nS]").value;v=v===""?"":Math.max(1,Math.min(n?S[n-1][2]:286,Math.round(+v)||1));}setField(k,date,{[inp.dataset.f]:v});askAdd()},500)})});
  const sel=el.querySelector("select[data-f]");if(sel)sel.addEventListener("change",e=>{const v=+e.target.value||"";setField(k,date,{nS:v});askAdd();if(v)el.querySelectorAll("input[type=number]").forEach(x=>x.max=S[v-1][2])});
  // after the parent logs new memorization, offer to add it to the review plan (own plan only: never over a teacher's plan, never from the child's device)
  const askBox=el.querySelector(".addrev");
  function askAdd(){
    if(!askBox)return;askBox.hidden=true;askBox.innerHTML="";
    const kk=ST.kids[k.id];if(teacherMode||childKid()||!kk||planHas((halaqaOf(kk)||{}).plan))return;
    const rr=day(k,date)||{},n=+rr.nS,f=+rr.nF,to=+rr.nT;
    if(!n||!(f>=1)||!(to>=f)||to>S[n-1][2])return;
    const key=[k.id,date,n,f,to].join(":");
    if(justAdded===key){askBox.hidden=false;askBox.innerHTML='<span>'+t("addrev_done")+'</span>';return}
    if(planCovers(kk,n,f,to)||(prefs.noAdd||{})[key])return;
    askBox.hidden=false;
    askBox.innerHTML='<span>'+t("addrev_q",esc(sName(n)),f,to)+'</span><span class="row"><button type="button" class="btn small primary" data-y>'+t("addrev_yes")+'</button><button type="button" class="btn small" data-n>'+t("addrev_no")+'</button></span>';
    askBox.querySelector("[data-y]").onclick=async()=>{quietUntil=Date.now()+900;justAdded=key;const np=planAdd(kk,n,f,to);
      try{await D.saveKid(Object.assign({},kk,{surahs:np.surahs,ranges:np.ranges,start:weekOf(today())}))}catch(e){justAdded="";askBox.innerHTML='<span class="msg err">'+t("err_generic")+'</span>';return}
      askAdd()};
    askBox.querySelector("[data-n]").onclick=()=>{prefs.noAdd=prefs.noAdd||{};prefs.noAdd[key]=1;savePrefs();askBox.hidden=true};
  }
  askAdd();
  // offer to make up a day missed in the last 3 days: its wird is added to today's items; the missed day keeps no stars
  const mkBox=el.querySelector(".makeup");
  function makeupOffer(){
    if(!mkBox)return;mkBox.hidden=true;mkBox.innerHTML="";
    const created=k.created?iso(new Date(k.created)):"";
    for(let b=1;b<=3;b++){const md=addDays(date,-b);if(created&&md<created)break;
      const mi=planFor(k,md),mr=day(k,md)||{},nm=b===1?t("yesterday"):DAYS[L()][parse(md).getDay()];
      if(justMade===date+":"+md){mkBox.hidden=false;mkBox.innerHTML='<span>'+t("makeup_done",nm)+'</span>';return}
      if(!mi.length||+(mr.stars||0)>0||mi.every(it=>planCovers({surahs:[],ranges:planFor(k,date)},it[0],it[1],it[2])))continue;
      mkBox.hidden=false;
      mkBox.innerHTML='<span>'+t("makeup_q",nm,amt(mi))+'</span><button type="button" class="btn small primary" data-mk>'+t("makeup_do")+'</button>';
      mkBox.querySelector("[data-mk]").onclick=()=>{justMade=date+":"+md;setField(k,date,{items:mergeItems(planFor(k,date),mi)});makeupOffer()};
      return}
  }
  makeupOffer();
  // pages marked mistaken on 2+ different days in the last 3 weeks: offer, never impose, an extra review of that page tomorrow
  const stBox=el.querySelector(".strength");
  function strengthOffer(){
    if(!stBox)return;stBox.hidden=true;stBox.innerHTML="";
    if(teacherMode||childKid())return;
    const tm=addDays(date,1),tItems=planFor(k,tm);
    for(const c of pageStrugglers(ST.days[k.id]||{},date)){
      const segs=pageSegments(c.page),key=k.id+":"+c.page+":"+c.last,ptxt=c.page.toLocaleString(L()==="en"?"en":"ar-EG");
      if(justStr===key){stBox.hidden=false;stBox.innerHTML='<span>'+t("str_done",ptxt)+'</span>';return}
      if((prefs.noStr||{})[key]||segs.every(s=>planCovers({surahs:[],ranges:tItems},s[0],s[1],s[2])))continue;
      stBox.hidden=false;
      stBox.innerHTML='<span>'+t("str_q",ptxt,c.count)+'</span><span class="row"><button type="button" class="btn small primary" data-sy>'+t("str_yes")+'</button><button type="button" class="btn small" data-sn>'+t("str_no")+'</button></span>';
      stBox.querySelector("[data-sy]").onclick=()=>{justStr=key;setField(k,tm,{items:mergeItems(planFor(k,tm),segs)});strengthOffer()};
      stBox.querySelector("[data-sn]").onclick=()=>{prefs.noStr=prefs.noStr||{};prefs.noStr[key]=1;savePrefs();strengthOffer()};
      return}
  }
  strengthOffer();
  const lb=el.querySelector("[data-listen]");if(lb)lb.onclick=()=>openListen(items);
  const tb=el.querySelector("[data-text]");if(tb)tb.onclick=()=>openText(items);
  el.querySelectorAll(".item.pg").forEach(b=>b.onclick=()=>{const rr=day(k,date)||{},arr=(rr.pw||[]).slice(),pg=+b.dataset.pg,ix=arr.indexOf(pg);if(ix>-1)arr.splice(ix,1);else arr.push(pg);arr.sort((x,y)=>x-y);setField(k,date,{pw:arr});b.classList.toggle("weak",ix<0);b.setAttribute("aria-pressed",String(ix<0));strengthOffer()});
  el.querySelectorAll(".item[data-s]").forEach(b=>b.onclick=()=>{const rr=day(k,date)||{},arr=(rr[weakKey]||[]).slice(),n=+b.dataset.s,ix=arr.indexOf(n);if(ix>-1)arr.splice(ix,1);else arr.push(n);setField(k,date,{[weakKey]:arr});b.classList.toggle("weak",ix<0);b.setAttribute("aria-pressed",String(ix<0))});
  const sKey=teacherMode?"tStars":"stars",row=el.querySelector(".stars");
  row.querySelectorAll("button").forEach(b=>b.onclick=()=>{const cur=+((day(k,date)||{})[sKey]||0),n=+b.dataset.n,v=cur===n?0:n;setField(k,date,{[sKey]:v});paint(row,v);
    if(!teacherMode)afterRate(k,w,i,v,cur,b)});
  paint(row,+(r[sKey]||0));
  return el;
}
let justAdded="",justMade="",justStr="";
let afterRate=(k,w,i,v,cur,b)=>{if($("path"))renderPath(k,w);if(v>cur){burst(b);const st=$("st-"+i);if(st)st.classList.add("pulse")}};
function renderDays(k,w,teacherMode){
  const box=$("days");box.innerHTML="";
  for(let i=0;i<7;i++)box.appendChild(makeDayCard(k,addDays(w,i),i,w,teacherMode,"week"));
}
function paint(row,v){const words=row.classList.contains("words");row.querySelectorAll("button").forEach(b=>{const n=+b.dataset.n,on=words?n===v:n<=v;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on))});const h=row.querySelector(".hint");if(h)h.textContent=t(HINT[v])}
function burst(btn){for(let i=0;i<10;i++){const s=document.createElement("span");s.className="burst";const a=i/10*Math.PI*2;s.style.setProperty("--x",Math.cos(a)*44+"px");s.style.setProperty("--y",Math.sin(a)*44+"px");btn.appendChild(s);setTimeout(()=>s.remove(),750)}}
function scrollToday(){if(weekView)return;setTimeout(()=>{const d=$("day-"+today());if(d)d.scrollIntoView({behavior:"smooth",block:"start"})},150)}

/* ================= age modes ================= */
const modeOf=k=>k.mode||(k.age==null||k.age===""?"kids":+k.age<=8?"kids":+k.age<=14?"teens":"adults");
const BRAND={light:{bg:"#f4ecdc",surface:"#fbf8f1",surface2:"#ece2cc",ink:"#1c2421",muted:"#5b6762",accent:"#d4a23a",accent2:"#0e5e4f",line:"#e2d6bd",star:"#d4a23a","on-accent":"#1c2421"},
 dark:{bg:"#0a3b33",surface:"#0e4a40",surface2:"#145446",ink:"#f4ecdc",muted:"#b9cfc8",accent:"#d4a23a",accent2:"#e6c773",line:"#1d5a4c",star:"#d4a23a","on-accent":"#0a3b33"}};
const appTheme=()=>ST.profile.appTheme||prefs.appTheme||"emerald";
const paletteFor=k=>k.palette||(modeOf(k)==="adults"?(ST.profile.appTheme||prefs.appTheme?appTheme():"emeraldNight"):appTheme());
function setPalette(id){const P=PALETTES[id]||PALETTES.emerald,root=document.documentElement.style;Object.keys(P.v).forEach(k=>root.setProperty("--"+k,P.v[k]));root.setProperty("--none",P.v.line);root.setProperty("color-scheme",P.dark?"dark":"light");document.documentElement.dataset.pal=id}
function applyPalette(id){applyTheme(null);setPalette(id)}
function paletteGrid(id,sel,withDefault){
  const opts=(withDefault?[""]:[]).concat(PALETTE_ORDER);
  return '<div class="pals" id="'+id+'">'+opts.map(k=>{const P=k?PALETTES[k]:PALETTES[appTheme()];const v=P.v;
    return '<button type="button" class="pal" data-pal="'+k+'" aria-pressed="'+(k===(sel||""))+'"><span class="pal-prev" style="background:'+v.bg+'"><i style="background:'+v.hero+'"></i><b style="background:'+v.surface+'"><u style="background:'+v.accent2+'"></u><s style="background:'+v.star+'"></s></b></span><span>'+(k?P[L()]:t("same_as_app"))+'</span></button>'}).join("")+'</div>';
}
function setMode(m){document.body.dataset.mode=m||""}
let selDay=null;
function pickDay(w){if(selDay&&selDay>=w&&selDay<=addDays(w,6))return selDay;const td=today();return td>=w&&td<=addDays(w,6)?td:w}
const ICONS={
 home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
 trophy:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4"/></svg>',
 lock:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
 chart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
 star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16l-5.4 3.2 1.3-6-4.5-4 6-.6z"/></svg>',
 gear:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
 flame:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 3 3 3s0-4 0-7z"/></svg>',
 palette:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 22 9.7C22 5.9 17.5 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/></svg>',
 globe:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
 bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
 people:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 2 5 5.4"/></svg>',
 book:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6c-2-1.6-5-2-8-1.6V19c3-.4 6 0 8 1.6 2-1.6 5-2 8-1.6V4.4C17 4 14 4.4 12 6z"/><path d="M12 6v14.6"/></svg>',
 user:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
 info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
 play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
 phone:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>'
};
function bottomNav(active,third){
  const it=[["main","home",t("today")],["hist",modeKid()==="kids"?"trophy":"chart",modeKid()==="kids"?t("treasures"):t("progress")],["gear",third||"lock",third==="gear"?t("settings"):t("for_parents")]];
  return '<nav class="bnav">'+it.map(x=>'<button data-nav="'+x[0]+'" class="'+(x[0]===active?"on":"")+'">'+ICONS[x[1]]+'<span>'+x[2]+'</span></button>').join("")+'</nav>';
}
let _modeKid="kids";const modeKid=()=>_modeKid;
function bindNav(){app.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{const v=b.dataset.nav;if(v==="gear")return openSettings();go(v);if(v==="main")setTimeout(()=>window.scrollTo({top:0}),0)})}
function openSettings(){go(gateOk||!needsGate()?"settings":"gate")}
function needsGate(){const ks=kidsList();return ks.length===0?false:!ks.every(k=>k.self||modeOf(k)==="adults")}
function slimTop(k){
  const showMode=!childKid()&&halaqaList().length>0;
  const tb=tabs(k);
  if(!tb&&!showMode)return '';
  return '<div class="slimtop">'+tb+(showMode?'<div class="seg mode" id="modeSeg"><button data-m="kids" aria-pressed="'+(prefs.mode!=="teach")+'">'+t("mykids")+'</button><button data-m="teach" aria-pressed="'+(prefs.mode==="teach")+'">'+t("myhalaqas")+'</button></div>':'')+'</div>';
}
function bindSlim(){
  if($("modeSeg"))$("modeSeg").querySelectorAll("button").forEach(b=>b.onclick=()=>{prefs.mode=b.dataset.m;savePrefs();go("main")});
  app.querySelectorAll(".tab[data-k]").forEach(b=>b.onclick=()=>{prefs.cur=b.dataset.k;selDay=null;savePrefs();go("main")});
}
function weekNav(w){const isCur=w===weekOf(today());return '<div class="weeknav"><button class="btn" id="wPrev">'+t("prev")+'</button><span class="lbl">'+t("week")+'<b>'+nice(w)+' – '+nice(addDays(w,6))+'</b>'+(hij(w)?'<small>'+hij(w)+' – '+hij(addDays(w,6))+'</small>':'')+'</span><button class="btn" id="wNext">'+t("next")+'</button></div>'+(isCur?'':'<button class="btn accent" id="wNow" style="align-self:center">'+t("this_week")+'</button>')}
function bindWeekNav(w){$("wPrev").onclick=()=>{weekView=addDays(w,-7);selDay=null;render()};$("wNext").onclick=()=>{weekView=addDays(w,7);selDay=null;render()};if($("wNow"))$("wNow").onclick=()=>{weekView=null;selDay=null;render()}}
function weekStrip(k,w,sel){
  let h='<div class="wstrip" role="tablist">';
  for(let i=0;i<7;i++){const d=addDays(w,i),r=day(k,d)||{},done=+(r.stars||0)>0;h+='<button role="tab" data-d="'+d+'" aria-selected="'+(d===sel)+'" class="'+(done?"done":"")+(d===today()?" now":"")+'"><span>'+DSHORT[L()][parse(d).getDay()]+'</span><b>'+parse(d).getDate()+'</b><i></i></button>'}
  return h+'</div>';
}
function bindStrip(){app.querySelectorAll(".wstrip [data-d]").forEach(b=>b.onclick=()=>{selDay=b.dataset.d;render()})}
function streakOf(k){const R=ST.days[k.id]||{};let d=today();if(!(R[d]&&+(R[d].stars||0)>0))d=addDays(d,-1);let n=0;while(R[d]&&+(R[d].stars||0)>0){n++;d=addDays(d,-1)}return n}

/* ---------- kids (4–8): illustrated journey ---------- */
const PATHPTS=[[336,292],[250,262],[296,206],[214,172],[104,176],[128,116],[104,70]],GIFTPT=[50,58];
function kidsScene(k,w,sel){
  const T=THEMES[k.theme]||THEMES.space,dark=!!T.dark,bg=dark?T.c.bg:T.c.surface2,ink=dark?"#ffffff":T.c.ink;
  let st='',last=-1;
  for(let i=0;i<7;i++){const d=addDays(w,i),r=day(k,d),done=!!(r&&+(r.stars||0)>0);if(done)last=i;const [x,y]=PATHPTS[i];
    st+='<g class="pstation'+(d===sel?" sel":"")+'" data-d="'+d+'" role="button" tabindex="0" aria-label="'+DAYS[L()][parse(d).getDay()]+'">'+(d===sel?'<circle cx="'+x+'" cy="'+y+'" r="24" fill="none" stroke="'+(dark?"#ffffff":T.c.accent2)+'" stroke-width="3" stroke-dasharray="4 4"/>':'')+'<svg x="'+(x-20)+'" y="'+(y-20)+'" width="40" height="40" viewBox="0 0 40 40">'+T.st(i,done).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')+'</svg><text x="'+x+'" y="'+(y+34)+'" text-anchor="middle" font-size="11" font-weight="700" fill="'+ink+'" opacity=".85">'+DSHORT[L()][parse(d).getDay()]+'</text></g>'}
  const s=weekStats(k,w),open=s.done===7,me=PATHPTS[Math.max(0,last)];
  const gift='<g transform="translate('+(GIFTPT[0]-20)+' '+(GIFTPT[1]-20)+')" class="gift'+(open?" open":"")+'">'+giftSvg(open).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')+'</g>';
  const av='<g transform="translate('+(me[0]-22)+' '+(me[1]-62)+')"><circle cx="22" cy="22" r="23" fill="#ffffff" stroke="'+T.c.accent+'" stroke-width="3"/><svg x="2" y="2" width="40" height="40" viewBox="0 0 150 120">'+avatar(k.look||0,k.skin==null?1:k.skin,{head:true}).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')+'</svg></g>';
  const stars=dark?'<g fill="#ffffff" opacity=".8"><circle cx="40" cy="40" r="1.6"/><circle cx="120" cy="24" r="1.2"/><circle cx="250" cy="34" r="1.8"/><circle cx="350" cy="70" r="1.3"/><circle cx="30" cy="160" r="1.2"/><circle cx="370" cy="200" r="1.6"/><circle cx="200" cy="110" r="1"/></g>':'';
  return '<svg class="scene" viewBox="0 0 390 340" role="img" aria-label="'+esc(T.path[L()])+'"><rect width="390" height="340" fill="'+bg+'"/>'+stars+
    '<g opacity=".95" transform="translate(292 8) scale(.86)">'+T.art.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')+'</g>'+
    '<path d="M0 316 Q195 290 390 316 V340 H0 Z" style="fill:var(--bg)"/>'+
    '<path d="M336 292 C300 290 262 284 250 262 C238 240 290 228 296 206 C302 184 250 176 214 172 C178 168 132 190 104 176 C76 162 92 128 128 116 C164 104 150 76 104 70 C82 67 68 64 56 60" fill="none" stroke="'+(dark?"#ffffff55":T.c.line)+'" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"/>'+
    st+gift+av+'</svg>';
}
function renderKids(k){
  applyTheme(k.theme);setMode("kids");_modeKid="kids";
  const w=weekView||weekOf(today()),sel=pickDay(w),T=THEMES[k.theme]||THEMES.space,s=weekStats(k,w),h=halaqaOf(k);
  const sub=L()==="en"?T.sub.en:T.sub.ar[k.gender==="f"?1:0];
  app.innerHTML=slimTop(k)+
   '<div class="kidhead"><div class="kh-text"><span class="kh-hi">'+t("salam")+'</span><span class="kh-name">'+esc(k.name)+'</span><span class="kh-sub">'+sub+'</span></div><span class="starchip">'+ICONS.star+'<b>'+s.tot+'</b></span></div>'+
   '<div class="scenewrap" id="path">'+kidsScene(k,w,sel)+'</div>'+
   '<p class="gift-note'+(s.done===7?" win":"")+'" id="giftNote">'+(s.done===7?t(k.gender==="f"?"win_f":"win_m",k.name):(7-s.done===1?t("left1"):7-s.done===2?t("left2"):t("leftN",7-s.done)))+giftTail(k)+'</p>'+
   (h?'<p class="chipline">'+t("joined",esc(h.name))+'</p>':'')+
   weekNav(w)+'<div id="days" class="days"></div>'+demoNote()+bottomNav("main");
  $("days").appendChild(makeDayCard(k,sel,PATHPTS.length,w,false,"kids"));
  afterRate=(kk,ww,i,v,cur,b)=>{$("path").innerHTML=kidsScene(kk,ww,sel);bindScene(kk,ww);if(v>cur)burst(b);maybeCelebrate(kk,ww)};
  bindSlim();bindNav();bindWeekNav(w);bindScene(k,w);maybeCelebrate(k,w);
}
function bindScene(k,w){app.querySelectorAll(".pstation").forEach(g=>{const f=()=>{selDay=g.dataset.d;render()};g.onclick=f;g.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();f()}}})}
function maybeCelebrate(k,w){
  const s=weekStats(k,w);if(s.done<7)return;const key="sahibi-cel-"+k.id+"-"+w;
  try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1")}catch(e){}
  let ayat=0;for(let i=0;i<7;i++){const d=addDays(w,i);ayat+=itemAyat(planFor(k,d))}
  const ov=document.createElement("div");ov.className="celebrate";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");
  ov.innerHTML='<div class="cel-in"><div class="confetti" aria-hidden="true">'+Array.from({length:18},(_,i)=>'<i style="--i:'+i+'"></i>').join("")+'</div><span class="cel-av">'+avatar(k.look||0,k.skin==null?1:k.skin,{happy:true})+'</span>'+giftSvg(true)+
   '<h2>'+t(k.gender==="f"?"cel_title_f":"cel_title_m",esc(k.name))+'</h2><p>'+t(k.gender==="f"?"cel_sub_f":"cel_sub_m")+'</p>'+(k.gift?'<p class="cel-gift">'+t("gift_is",esc(k.gift))+'</p>':'')+
   '<div class="cel-stats"><span><b>'+s.tot+'</b>'+t("stars_lbl")+'</span><span><b>7/7</b>'+t("days_word")+'</span><span><b>'+ayat+'</b>'+t("ayah")+'</span></div><button class="btn accent big" id="celOk">'+t("open_gift")+'</button></div>';
  document.body.appendChild(ov);$("celOk").focus();$("celOk").onclick=()=>ov.remove();
}

/* ---------- teens (9–14): levels, badges, challenge ---------- */
function teenStats(k){
  const R=ST.days[k.id]||{};let pts=0;Object.values(R).forEach(r=>{pts+=PTS_STAR*(+(r.stars||0)+ +(r.tStars||0))});
  const A=analyse(k);let fullWeeks=0,chDone=0;
  A.perWeek.forEach(x=>{if(x.days===7)fullWeeks++;const ds=[...Array(7)].map((_,i)=>R[addDays(x.w,i)]||null),kind=challengeFor(x.w),p=challengeProgress(kind,ds);if(p.v>=p.goal)chDone++});
  pts+=PTS_WEEK*fullWeeks+PTS_CHALLENGE*chDone;
  let clean=0;Object.keys(R).forEach(d=>{const r=R[d];if(+(r.stars||0)===3&&!(r.weak||[]).length&&!(r.tWeak||[]).length)clean+=itemAyat(r.items||planFor(k,d))});
  let best=A.best;
  const p=effPlan(k),cov=juzCoverage(p.surahs||[],p.ranges),juzDone=[];
  cov.forEach(c=>{if(c.frac===1){const ss=surahsOfJuz(c.juz);if(ss.every(n=>A.lv[n]&&(A.lv[n].level==="good"||A.lv[n].level==="mid")))juzDone.push(c.juz)}});
  return {pts,fullWeeks,clean,best,juzDone,A};
}
function badge(on,txt,label,color){return '<span class="badge'+(on?"":" off")+'"><svg viewBox="0 0 60 60" aria-hidden="true"><g transform="translate(30 30)"><rect x="-19" y="-19" width="38" height="38" rx="4" fill="'+(on?color:"none")+'" stroke="'+(on?color:"var(--line)")+'" stroke-width="2"'+(on?'':' stroke-dasharray="4 3"')+'/><rect x="-19" y="-19" width="38" height="38" rx="4" fill="'+(on?color:"none")+'" stroke="'+(on?color:"var(--line)")+'" stroke-width="2" transform="rotate(45)"'+(on?'':' stroke-dasharray="4 3"')+'/></g><text x="30" y="35" text-anchor="middle" font-size="13" font-weight="700" fill="'+(on?"#ffffff":"var(--muted)")+'">'+txt+'</text></svg>'+label+'</span>'}
function renderTeen(k){
  applyPalette(paletteFor(k));setMode("teens");_modeKid="teens";
  const w=weekView||weekOf(today()),sel=pickDay(w),S2=teenStats(k),lv=levelInfo(S2.pts,L()),streak=streakOf(k);
  const ds=[...Array(7)].map((_,i)=>day(k,addDays(w,i))),kind=challengeFor(w),cp=challengeProgress(kind,ds);
  app.innerHTML=slimTop(k)+
   '<header class="bhead"><div class="bh-row"><div class="bh-name"><span>'+DAYS[L()][parse(today()).getDay()]+'</span><b>'+esc(k.name)+'</b></div><span class="flame">'+ICONS.flame+t("streak_n",streak)+'</span></div>'+
   '<div class="lvl"><div class="lvl-t"><span>'+t("level_n",lv.n,lv.name)+'</span><span>'+lv.into+' / '+lv.need+' '+t("points")+'</span></div><div class="bar"><i style="width:'+Math.round(lv.into/lv.need*100)+'%"></i></div></div></header>'+
   '<section class="badges">'+badge(S2.fullWeeks>0,"7",t("b_week"),"#d4a23a")+badge(S2.clean>=100,"100",t("b_clean"),"#0e5e4f")+badge(S2.juzDone.length>0,t("juz_short"),t("b_juz"),"#8b5cf6")+badge(S2.best>=30,"30",t("b_month"),"#c4552f")+'</section>'+
   '<section class="card chal"><div class="row between"><span class="eyebrow">'+t("challenge")+'</span><span class="hint">+'+PTS_CHALLENGE+' '+t("points")+'</span></div><b>'+t("ch_"+kind)+'</b><div class="row"><div class="bar grow"><i style="width:'+Math.min(100,Math.round(cp.v/cp.goal*100))+'%"></i></div><span class="hint">'+Math.min(cp.v,cp.goal)+' / '+cp.goal+'</span></div></section>'+
   weekNav(w)+weekStrip(k,w,sel)+'<div id="days" class="days"></div>'+demoNote()+bottomNav("main","gear");
  $("days").appendChild(makeDayCard(k,sel,0,w,false,"teens"));
  afterRate=()=>{};
  bindSlim();bindNav();bindWeekNav(w);bindStrip();
}

/* ---------- adults (15+): juz ring and review strength ---------- */
function juzRing(cov){
  const cx=90,cy=90,r=72;let s='';
  for(let i=0;i<30;i++){const a0=(-90+i*12+1)*Math.PI/180,a1=(-90+(i+1)*12-1)*Math.PI/180,f=cov[i].frac;
    s+='<path d="M'+(cx+r*Math.cos(a0)).toFixed(1)+' '+(cy+r*Math.sin(a0)).toFixed(1)+' A'+r+' '+r+' 0 0 1 '+(cx+r*Math.cos(a1)).toFixed(1)+' '+(cy+r*Math.sin(a1)).toFixed(1)+'" stroke="'+(f>=1?"var(--accent)":f>0?"var(--muted)":"var(--line)")+'" stroke-width="12" fill="none"/>'}
  return s;
}
function renderAdult(k){
  applyPalette(paletteFor(k));setMode("adults");_modeKid="adults";
  const w=weekView||weekOf(today()),sel=pickDay(w),p=effPlan(k),cov=juzCoverage(p.surahs||[],p.ranges),full=cov.filter(c=>c.frac>=1).length;
  const mem=cov.reduce((a,c)=>a+c.got,0),pct=Math.round(mem/6236*1000)/10,A=analyse(k);
  const rows=cov.filter(c=>c.got>0).sort((a,b)=>b.juz-a.juz).map(c=>{const ss=surahsOfJuz(c.juz).filter(n=>A.lv[n]&&A.lv[n].n);const avg=ss.length?ss.reduce((a,n)=>a+A.lv[n].avg,0)/ss.length:null;
    const col=avg==null?"var(--line)":avg>=2.5?"var(--good)":avg>=1.5?"var(--mid)":"var(--bad)";
    return '<span>'+t("juz_n",c.juz)+'</span><span class="sbar"><i style="width:'+(avg==null?0:Math.round(avg/3*100))+'%;background:'+col+'"></i></span><span class="m">'+(avg==null?'—':avg.toFixed(1))+'</span>'}).join("");
  app.innerHTML=slimTop(k)+
   '<header class="ahead"><div class="row between ah-top"><span>'+DAYS[L()][parse(today()).getDay()]+'، '+niceH(today())+'</span><span>'+esc(k.name)+'</span></div>'+
   '<svg class="ring" viewBox="0 0 180 180" role="img" aria-label="'+t("juz_full_n",full)+'">'+juzRing(cov)+'<text x="90" y="86" text-anchor="middle" class="rnum">'+full+'</text><text x="90" y="110" text-anchor="middle" class="rsub">'+t("of_30")+'</text></svg>'+
   '<b class="ah-title">'+t("hifz_journey")+'</b><span class="ah-sub">'+t("memorized_pct",pct,mem)+'</span></header>'+
   weekNav(w)+weekStrip(k,w,sel)+'<div id="days" class="days"></div>'+
   (rows?'<section class="card"><h3>'+t("strength_by_juz")+'</h3><div class="sgrid3">'+rows+'</div></section>':'')+demoNote()+bottomNav("main","gear");
  $("days").appendChild(makeDayCard(k,sel,0,w,false,"adults"));
  afterRate=()=>{};
  bindSlim();bindNav();bindWeekNav(w);bindStrip();
}

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
  const pool={};planUnits(p).forEach(u=>pool[u[0]]=1);Object.keys(occ).forEach(n=>pool[n]=1);
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
  const md=modeOf(k);if(md==="kids"||o.teacher){applyTheme(k.theme);setMode(o.teacher?"":"kids")}else{applyPalette(paletteFor(k));setMode(md)}
  const A=analyse(k),ids=Object.keys(A.lv).map(Number).sort((a,b)=>a-b),cnt={good:0,mid:0,bad:0,none:0};ids.forEach(n=>cnt[A.lv[n].level]++);
  const avg=A.evald?(A.total/A.evald).toFixed(1):"0",rate=A.elapsed?Math.round(A.evald/A.elapsed*100):0;
  const weakest=ids.filter(n=>A.lv[n].level==="bad"||A.lv[n].level==="mid").sort((a,b)=>{const ra=A.lv[a].level==="bad"?0:1,rb=A.lv[b].level==="bad"?0:1;return ra-rb||A.lv[a].avg-A.lv[b].avg}).slice(0,5);
  const LV={good:t("good"),mid:t("mid"),bad:t("bad"),none:t("nolv")};
  app.innerHTML=topbar()+(o.teacher?'':tabs(k))+hero(k,t("back"))+
   '<div class="row"><button class="btn accent" id="hRep">'+t("week_report")+'</button><button class="btn" id="hRec">'+t("export_rec")+'</button></div>'+
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
  $("hRep").onclick=()=>o.teacher?go("sreport",{hid:o.hid,kid:k.id}):go("report");
  $("hRec").onclick=()=>o.teacher?go("srecord",{hid:o.hid,kid:k.id}):go("record");
  app.querySelectorAll("[data-w]").forEach(b=>b.onclick=()=>{const w=b.dataset.w===weekOf(today())?null:b.dataset.w;back();weekView=w;render()});
}

/* ================= teacher ================= */
function renderTeachHome(){
  applyTheme(null);
  const hs=halaqaList();hs.forEach(h=>D.subStudents(h.id));const td=today();
  app.innerHTML=topbar()+'<h1 class="pagetitle">'+t("myhalaqas")+'</h1>'+
   hs.map(h=>{const st=Object.values(ST.students[h.id]||{}),dn=st.filter(k=>+((day(k,td)||{}).stars||0)>0).length;
     return '<button class="card hcard" data-h="'+h.id+'"><span class="hrow"><b>'+esc(h.name)+'</b><span class="codechip" dir="ltr">'+esc(h.code)+'</span></span><span class="hint">'+t("students")+': '+st.length+' · '+t("today")+': '+t("done_n",dn,st.length)+'</span><span class="hint">'+(planHas(h.plan)?t("plan")+': '+t("selected",planSurahCount(h.plan))+' · '+cycleLbl(h.plan.cycle):t("plan_none"))+'</span></button>'}).join("")+
   '<button class="btn accent" id="newH" style="align-self:flex-start">+ '+t("new_halaqa")+'</button>'+demoNote();
  bindTop();
  app.querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>{hDate=null;go("halaqa",{hid:b.dataset.h})});
  $("newH").onclick=()=>openHEdit(null);
}
const reminded={};
let hFilter="all";
function renderHalaqa(h){
  applyTheme(null);D.subStudents(h.id);
  const td=today(),date=hDate||td,all=Object.values(ST.students[h.id]||{}).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
  const isDone=k=>+((day(k,date)||{}).stars||0)>0,dn=all.filter(isDone).length,notN=all.length-dn;
  const st=hFilter==="not"?all.filter(k=>!isDone(k)):all;
  const C=2*Math.PI*30,frac=all.length?dn/all.length:0;
  // most-missed surahs this week (home + class marks)
  const w=weekOf(date),miss={};all.forEach(k=>{for(let i=0;i<7;i++){const r=day(k,addDays(w,i));if(!r)continue;new Set([...(r.weak||[]),...(r.tWeak||[])]).forEach(n=>miss[n]=(miss[n]||0)+1)}});
  const top=Object.entries(miss).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const P=ST.profile;
  const wtxt=items=>esc(items.map(it=>sName(it[0])+((it[1]>1||it[2]<S[it[0]-1][2])?' '+it[1]+'–'+it[2]:'')).join("، "));
  const wmap={};all.forEach(k=>{wmap[k.id]=planFor(k,date)});
  const wset=[...new Set(all.map(k=>JSON.stringify(wmap[k.id])))],oneW=wset.length===1&&wmap[all[0].id].length?wmap[all[0].id]:null;
  app.innerHTML=topbar()+
   '<header class="bhead thead"><div class="bh-row"><div class="bh-name"><span>'+t("myhalaqas")+'</span><b>'+esc(h.name)+'</b></div><button class="codechip big" id="hCopy" dir="ltr" aria-label="'+t("copy")+'">'+esc(h.code)+'</button></div>'+
   '<div class="row"><svg width="74" height="74" viewBox="0 0 74 74" role="img" aria-label="'+t("done_n",dn,all.length)+'"><circle cx="37" cy="37" r="30" fill="none" stroke="#0a3b33" stroke-width="8"/><circle cx="37" cy="37" r="30" fill="none" stroke="#d4a23a" stroke-width="8" stroke-dasharray="'+(C*frac).toFixed(1)+' '+C.toFixed(1)+'" stroke-linecap="round" transform="rotate(-90 37 37)"/><text x="37" y="42" text-anchor="middle" font-size="16" font-weight="700" fill="#fbf8f1">'+dn+'/'+all.length+'</text></svg>'+
   '<div class="col"><b>'+t("done_n",dn,all.length)+'</b><span class="hint lt">'+(P.summaryAt?t("summary_at_hint",P.summaryAt):t("summary_off"))+'</span><span class="msg ok lt" id="hCMsg"></span></div></div></header>'+
   '<div class="row between"><button class="btn" id="hBack">'+t("myhalaqas")+'</button><button class="btn primary" id="hInv">'+t("invite")+'</button><button class="btn accent" id="hRepB">'+t("week_report")+'</button><button class="btn" id="hSet">'+t("hsettings")+'</button></div>'+
   '<div class="weeknav"><button class="btn" id="dPrev">'+t("prev")+'</button><span class="lbl">'+DAYS[L()][parse(date).getDay()]+'<b>'+niceH(date)+'</b></span><button class="btn" id="dNext">'+t("next")+'</button></div>'+
   (date===td?'':'<button class="btn accent" id="dNow" style="align-self:center">'+t("today")+'</button>')+
   (oneW?'<section class="card"><div class="row between"><h2>'+t("today_wird")+'</h2><span class="hint">'+amt(oneW)+'</span></div><div class="items">'+oneW.map(it=>'<span class="item">'+itemLabel(it)+'</span>').join("")+'</div></section>':'')+
   '<section class="card"><div class="row between"><h2>'+t("students")+'</h2><div class="seg" id="hFil"><button data-v="all" aria-pressed="'+(hFilter==="all")+'">'+t("filter_all")+'</button><button data-v="not" aria-pressed="'+(hFilter==="not")+'">'+t("filter_not",notN)+'</button></div></div>'+
   (all.length?'<ul class="list srows">'+st.map(k=>{const r=day(k,date)||{},hs=+(r.stars||0),ok=hs>0;
     return '<li class="srow"><div class="sname"><span class="art s">'+avatar(k.look||0,k.skin==null?1:k.skin,{head:true})+'</span><span class="t"><button class="linkbtn" data-open="'+k.id+'">'+esc(k.name)+'</button><span class="hint '+(ok?"okc":"badc")+'">'+(ok?'✓ '+t("home_done")+' '+starsRO(hs):'✗ '+t("home_not"))+'</span>'+(!oneW&&wmap[k.id].length?'<span class="hint">'+t("wird_lbl")+': '+wtxt(wmap[k.id])+'</span>':'')+'</span></div>'+
       '<div class="sact">'+starRow("t mini",t("tstars")).replace('class="stars','data-k="'+k.id+'" class="stars')+(!ok&&date===td?'<button class="btn small primary" data-rem="'+k.id+'"'+(reminded[k.id+date]?' disabled':'')+'>'+(reminded[k.id+date]?t("reminded"):t("remind"))+'</button>':'')+'<button class="btn small" data-rm="'+k.id+'">'+t("remove_st")+'</button></div></li>'}).join("")+'</ul>':'<p class="empty">'+t("no_students")+'</p>')+'</section>'+
   (all.length?'<section class="card"><h3>'+t("top_mistakes")+'</h3>'+(top.length?'<div class="items">'+top.map(([n,c])=>'<span class="item weak">'+esc(sName(+n))+'<small>'+c+'</small></span>').join("")+'</div>':'<p class="empty">'+t("no_mistakes")+'</p>')+'</section>':'')+demoNote();
  bindTop();
  $("hBack").onclick=()=>go("main");$("hSet").onclick=()=>openHEdit(h.id);$("hRepB").onclick=()=>go("hreport",{hid:h.id});
  $("hInv").onclick=()=>{const url=location.origin+location.pathname.replace(/[^/]*$/,"")+"?join="+encodeURIComponent(h.code),txt=t("invite_txt",h.name,h.code);
    if(navigator.share)navigator.share({title:t("app"),text:txt,url}).catch(()=>{});else copyText(txt+"\n"+url,$("hCMsg"))};
  app.querySelectorAll("[data-rm]").forEach(b=>{let armed=false;b.onclick=async()=>{if(!armed){armed=true;b.className="btn small warn";b.textContent=t("rm_confirm");return}
    b.disabled=true;await D.removeStudent(b.dataset.rm);delete (ST.students[h.id]||{})[b.dataset.rm];render()}});
  $("hCopy").onclick=()=>copyText(h.code,$("hCMsg"));
  $("hFil").querySelectorAll("button").forEach(b=>b.onclick=()=>{hFilter=b.dataset.v;render()});
  $("dPrev").onclick=()=>{hDate=addDays(date,-1);render()};$("dNext").onclick=()=>{hDate=addDays(date,1);render()};
  if($("dNow"))$("dNow").onclick=()=>{hDate=null;render()};
  app.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>go("student",{hid:h.id,kid:b.dataset.open}));
  app.querySelectorAll(".stars[data-k]").forEach(row=>{const k=all.find(x=>x.id===row.dataset.k);paint(row,+((day(k,date)||{}).tStars||0));
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
   (ck?'<section class="card"><h2 class="sh">'+ICONS.phone+t("childdev")+'</h2><p class="about">'+t("childdev_on",esc(ck.name))+'</p><button class="btn" id="cdOff" style="align-self:flex-start">'+t("childdev_off")+'</button></section>':'')+
   '<section class="card"><h2 class="sh">'+ICONS.bell+t("notif")+'</h2><button class="btn primary" id="nOn" style="align-self:flex-start">'+t("notif_on")+'</button><p class="msg" id="nMsg"></p>'+
    (ck?'':'<label class="field"><span class="sec-t">'+t("remind_at")+'</span><select id="remAt">'+timeOptions(P.remindAt||"")+'</select></label>'+(halaqaList().length?'<label class="field"><span class="sec-t">'+t("summary_at")+'</span><select id="sumAt">'+timeOptions(P.summaryAt||"")+'</select></label>':''))+'</section>'+
   (ck?'':
   '<section class="card"><h2 class="sh">'+ICONS.people+t("kids")+'</h2>'+kidsList().map(k=>'<div class="kidrow">'+(modeOf(k)==="adults"?LOGO:avatar(k.look||0,k.skin==null?1:k.skin))+'<span class="t"><b>'+esc(k.name)+'</b><small>'+(halaqaOf(k)?t("joined",esc(halaqaOf(k).name)):t("selected",planSurahCount(effPlan(k)))+' · '+cycleLbl(effPlan(k).cycle||1))+'</small></span><button class="btn" data-ed="'+k.id+'">'+t("edit_kid")+'</button></div>').join("")+'<div class="row"><button class="btn accent" id="sAdd">+ '+t("add_kid")+'</button>'+(kidsList().some(x=>x.self)?'':'<button class="btn" id="sAddSelf">+ '+t("add_self")+'</button>')+'</div></section>'+
   '<section class="card"><h2 class="sh">'+ICONS.book+t("myhalaqas")+'</h2>'+(halaqaList().length?halaqaList().map(h=>'<div class="kidrow"><span class="t"><b>'+esc(h.name)+'</b><small dir="ltr">'+esc(h.code)+'</small></span><button class="btn" data-he="'+h.id+'">'+t("edit_kid")+'</button></div>').join(""):'<p class="about">'+t("teach_t")+'</p>')+'<button class="btn accent" id="sAddH" style="align-self:flex-start">+ '+t("new_halaqa")+'</button></section>'+
   '<section class="card"><h2 class="sh">'+ICONS.palette+t("appearance")+'</h2><p class="about">'+t("appearance_t")+'</p>'+paletteGrid("sPal",appTheme(),false)+'</section>'+
   '<section class="card"><h2 class="sh">'+ICONS.globe+t("lang")+'</h2>'+seg("sLang",[["ar","العربية"],["en","English"]],L())+'<h3>'+t("week_start")+'</h3>'+seg("sWs",[[6,t("sat")],[0,t("sun")],[1,t("mon")]],WS())+'<h3>'+t("hij_lbl")+'</h3>'+seg("sHij",[["0",t("hij_off")],["1",t("hij_on")]],ST.profile.hijri?"1":"0")+'<p class="hint">'+t("hij_t")+'</p></section>'+
   '<section class="card"><h2 class="sh">'+ICONS.info+t("bk_title")+'</h2><p class="about">'+t("bk_t")+'</p><div class="row"><button class="btn" id="bkOut">'+t("bk_export")+'</button><button class="btn" id="bkIn">'+t("bk_import")+'</button></div><input type="file" id="bkFile" accept="application/json,.json" hidden><p class="msg" id="bkMsg"></p><div id="bkConf"></div></section>'+
   (hasLocal?'<section class="card"><button class="btn" id="imp">'+t("import_local")+'</button><p class="msg ok" id="impMsg"></p></section>':''))+
   '<section class="card"><h2 class="sh">'+ICONS.user+t("account")+'</h2><p class="about" dir="ltr">'+esc(ST.user.email)+'</p><div class="row"><button class="btn" id="sOut">'+t("signout")+'</button>'+(ck?'':'<button class="btn" id="sDel">'+t("delacc")+'</button>')+'</div><p class="msg err" id="sMsg"></p></section>'+
   '<section class="card"><h2 class="sh">'+ICONS.info+t("about")+'</h2><p class="about">'+t("about_t")+'</p><a class="btn" href="privacy.html" target="_blank" rel="noopener" style="align-self:flex-start">'+t("privacy")+'</a><p class="hint">'+t("audio_src")+'</p><p class="hint">'+tanzilLine()+'</p><div class="devby"><span class="hint">'+t("dev_by")+'</span><img src="'+__DEV_LOGO__+'" alt="'+(L()==="en"?"Mohamed Anwar":"محمد أنور")+'" width="280" height="'+Math.round(280*__DEV_LOGO_H__/560)+'"><p class="copy">'+t("copyright")+'</p></div></section>'+demoNote();
  $("sDone").onclick=()=>{go("main");scrollToday()};
  if($("cdOff"))$("cdOff").onclick=()=>{prefs.child=null;savePrefs();renderSettings()};
  $("nOn").onclick=async()=>{const m=$("nMsg");m.className="msg";try{const r=await D.enablePush(ck?{kidId:ck.id}:{});m.className="msg "+(r==="ok"?"ok":"err");m.textContent=t({ok:"notif_ok",denied:"notif_denied",unsupported:"notif_unsupported","ios-home":"notif_ios",demo:"notif_demo"}[r]||"err_generic")}catch(e){m.className="msg err";m.textContent=t("err_generic")}};
  const off=-new Date().getTimezoneOffset();
  if($("remAt"))$("remAt").onchange=e=>D.saveProfile({remindAt:e.target.value||null,remindUtc:toUtcSlot(e.target.value),offset:off});
  if($("sumAt"))$("sumAt").onchange=e=>D.saveProfile({summaryAt:e.target.value||null,summaryUtc:toUtcSlot(e.target.value),offset:off});
  app.querySelectorAll("[data-ed]").forEach(b=>b.onclick=()=>openEdit(b.dataset.ed));
  app.querySelectorAll("[data-he]").forEach(b=>b.onclick=()=>openHEdit(b.dataset.he));
  if($("sAdd"))$("sAdd").onclick=()=>openEdit(null);if($("sAddSelf"))$("sAddSelf").onclick=()=>openEdit(null,true);
  if($("sAddH"))$("sAddH").onclick=()=>openHEdit(null);
  if($("sLang"))$("sLang").querySelectorAll("button").forEach(b=>b.onclick=()=>{prefs.lang=b.dataset.v;savePrefs();D.saveProfile({lang:b.dataset.v});renderSettings()});
  if($("sHij"))$("sHij").querySelectorAll("button").forEach(b=>b.onclick=()=>{D.saveProfile({hijri:b.dataset.v==="1"});renderSettings()});
  if($("sWs"))$("sWs").querySelectorAll("button").forEach(b=>b.onclick=()=>{D.saveProfile({weekStart:+b.dataset.v});renderSettings()});
  if($("sPal"))$("sPal").querySelectorAll(".pal").forEach(b=>b.onclick=()=>{prefs.appTheme=b.dataset.pal;savePrefs();D.saveProfile({appTheme:b.dataset.pal});renderSettings()});
  if($("imp"))$("imp").onclick=async()=>{const v=hasLocal;let n=0;for(const k of v.kids){const id=uid("k");await D.saveKid({id,name:k.name,gender:k.gender||"m",theme:k.theme||"space",surahs:k.surahs,cycle:k.cycle||1,light:k.light==null?5:k.light,weekStart:v.weekStart==null?6:v.weekStart,start:k.start,created:Date.now()+n,halaqaId:null,teacherUid:null});
      const R=(v.rec||{})[k.id]||{};for(const d of Object.keys(R))await D.setDay(id,d,R[d]);n++}
    D.saveProfile({imported:true});$("impMsg").textContent=t("imported",n);$("imp").disabled=true};
  if($("bkOut")){
    const bm=(txt,cls)=>{$("bkMsg").className="msg "+(cls||"");$("bkMsg").textContent=txt};
    $("bkOut").onclick=()=>{const ks=kidsList();if(!ks.length){bm(t("bk_none"),"err");return}
      const b=makeBackup(ks,ST.days),blob=new Blob([JSON.stringify(b,null,1)],{type:"application/json"}),a=document.createElement("a");
      a.href=URL.createObjectURL(blob);a.download="sahibi-backup-"+today()+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      bm(t("bk_saved",b.kids.length),"ok")};
    $("bkIn").onclick=()=>$("bkFile").click();
    $("bkFile").onchange=async e=>{const f=e.target.files[0];e.target.value="";$("bkConf").innerHTML="";if(!f)return;bm("");
      if(f.size>MAX_FILE_BYTES){bm(t("bk_big"),"err");return}
      let r;try{r=parseBackup(await f.text())}catch(x){r={ok:false,err:"bad"}}
      if(!r.ok){bm(t(r.err==="big"?"bk_big":"bk_bad"),"err");return}
      const nd=r.kids.reduce((a,x)=>a+Object.keys(x.days).length,0);
      $("bkConf").innerHTML='<p class="about">'+t("bk_summary",r.kids.length,r.kids.map(x=>esc(x.kid.name)).join("، "),nd)+(r.dropped?' '+t("bk_dropped",r.dropped):'')+'</p><div class="row"><button class="btn primary" id="bkGo">'+t("bk_go")+'</button><button class="btn" id="bkNo">'+t("cancel")+'</button></div>';
      $("bkNo").onclick=()=>{$("bkConf").innerHTML=""};
      $("bkGo").onclick=async()=>{$("bkGo").disabled=true;bm(t("loading"));
        try{let n=0;for(const x of r.kids){const id=uid("k");await D.saveKid(Object.assign({id,created:Date.now()+n},x.kid,{halaqaId:null,teacherUid:null}));
            const ds=Object.keys(x.days);for(let i=0;i<ds.length;i+=20)await Promise.all(ds.slice(i,i+20).map(d=>D.setDay(id,d,x.days[d])));n++}
          $("bkConf").innerHTML="";bm(t("bk_done",r.kids.length,nd),"ok")}catch(x){$("bkGo").disabled=false;bm(t("err_generic"),"err")}}};
  }
  $("sOut").onclick=async()=>{gateOk=false;nav={view:"main"};await D.signOut()};
  let armed=false;if($("sDel"))$("sDel").onclick=async()=>{if(!armed){armed=true;$("sDel").className="btn warn";$("sDel").textContent=t("delacc2");return}
    try{await D.deleteAccount();gateOk=false;nav={view:"main"};render()}catch(e){$("sMsg").textContent=I[L()][e.code]?t(e.code):t("err_generic")}};
}

/* ================= plan picker (shared) ================= */
function planSection(d){
  return '<section class="card"><h3>'+t("memorized")+'</h3><div class="row"><span class="hint">'+t("presets")+'</span>'+["p30","p29","p2930","pall","pnone"].map(p=>'<button type="button" class="btn" data-p="'+p+'">'+t(p)+'</button>').join("")+'</div>'+
   '<label class="field"><input id="eSearch" type="search" placeholder="'+t("search")+'" autocomplete="off"></label><span class="hint" id="eCount"></span><div class="picker" id="ePick">'+
   range(1,114).map(n=>'<label class="pk" data-q="'+esc(S[n-1][0]+" "+S[n-1][1].toLowerCase()+" "+n)+'"><input type="checkbox" value="'+n+'"'+(d.surahs.indexOf(n)>-1?' checked':'')+'><span class="n">'+n+'</span><span class="q">'+esc(sName(n))+'</span><span class="a">'+S[n-1][2]+' '+t("ayah")+'</span></label>').join("")+'</div></section>'+
   '<section class="card"><h3>'+t("ayat_pick")+'</h3><p class="about">'+t("ayat_pick_t")+'</p><div class="newrow rangerow"><select class="sel" id="rS" aria-label="'+t("new_surah")+'">'+surahOptions(0)+'</select><input id="rF" type="number" inputmode="numeric" min="1" placeholder="'+t("from_s")+'" aria-label="'+t("from")+'"><input id="rT" type="number" inputmode="numeric" min="1" placeholder="'+t("to_s")+'" aria-label="'+t("to")+'"></div><div class="row"><button type="button" class="btn" id="rAdd">'+t("ayat_add")+'</button></div><p class="msg err" id="rMsg"></p><div id="rList"></div></section>'+
   '<section class="card"><h3>'+t("cycle")+'</h3>'+seg("eCycle",[1,2,3,4,6,8,12].map(c=>[c,cycleLbl(c)]),d.cycle)+'<h3>'+t("light")+'</h3>'+seg("eLight",[[-1,t("none")]].concat(range(0,6).map(i=>[(WS()+i)%7,DAYS[L()][(WS()+i)%7]])),d.light)+'<div class="estimate" id="eEst"></div></section>';
}
function bindPlan(d){
  if(!d.ranges)d.ranges=[];
  const drawRanges=()=>{d.ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);$("rList").innerHTML=d.ranges.map((r,ix)=>'<div class="kidrow"><span class="t"><b>'+esc(sName(r[0]))+'</b><small>'+t("ayat_range",r[1],r[2])+'</small></span><button type="button" class="btn" data-rm="'+ix+'">'+t("ayat_rm")+'</button></div>').join("");
    $("rList").querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{d.ranges.splice(+b.dataset.rm,1);drawRanges();upd()})};
  const upd=()=>{$("eCount").textContent=t("selected",planSurahCount(d));const tot=planAyat(d),caps=7*d.cycle-(d.light>=0?0.5*d.cycle:0);$("eEst").innerHTML=planHas(d)?t("est",Math.round(tot/caps),cycleLbl(d.cycle)):t("est0")};upd();drawRanges();
  $("rS").onchange=e=>{const n=+e.target.value;$("rF").max=$("rT").max=n?S[n-1][2]:"";$("rMsg").textContent=""};
  $("rAdd").onclick=()=>{const n=+$("rS").value,f=Math.round(+$("rF").value),to=Math.round(+$("rT").value),msg=$("rMsg");msg.textContent="";
    if(!n||!(f>=1)||!(to>=f)||to>S[n-1][2]){msg.textContent=t("ayat_bad",n?S[n-1][2]:286);return}
    if(d.surahs.indexOf(n)>-1){msg.textContent=t("ayat_whole");return}
    d.ranges=d.ranges.filter(r=>r[0]!==n);d.ranges.push([n,f,to]);$("rF").value=$("rT").value="";drawRanges();upd()};
  const segB=(id,f)=>$(id).querySelectorAll("button").forEach(b=>b.onclick=()=>{d[f]=+b.dataset.v;$(id).querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));upd()});
  segB("eCycle","cycle");segB("eLight","light");
  const sync=()=>{$("ePick").querySelectorAll("input").forEach(c=>c.checked=d.surahs.indexOf(+c.value)>-1);drawRanges();upd()};
  $("ePick").addEventListener("change",e=>{const n=+e.target.value;if(e.target.checked){if(d.surahs.indexOf(n)<0)d.surahs.push(n);d.ranges=d.ranges.filter(r=>r[0]!==n);drawRanges()}else d.surahs=d.surahs.filter(x=>x!==n);upd()});
  app.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>{const p=b.dataset.p,add=p==="p30"?range(78,114):p==="p29"?range(67,77):p==="p2930"?range(67,114):p==="pall"?range(1,114):null;if(!add){d.surahs=[];d.ranges=[]}else add.forEach(n=>{if(d.surahs.indexOf(n)<0)d.surahs.push(n);d.ranges=d.ranges.filter(r=>r[0]!==n)});d.surahs.sort((a,b)=>a-b);sync()});
  $("eSearch").oninput=e=>{const q=e.target.value.trim().toLowerCase();$("ePick").querySelectorAll(".pk").forEach(r=>r.hidden=!!q&&r.dataset.q.indexOf(q)<0)};
}

/* ================= kid editor ================= */
function openEdit(id,self){
  const k=id?ST.kids[id]:null;
  draft=k?JSON.parse(JSON.stringify(k)):Object.assign({id:uid("k"),name:"",gender:"m",theme:"space",surahs:[],cycle:1,light:5,halaqaId:null,teacherUid:null,age:"",mode:null,self:false,look:0,skin:1,_new:true},self?{name:ST.profile.name||"",age:30,self:true}:{});
  if(!draft.surahs)draft.surahs=[];if(!draft.ranges)draft.ranges=[];go("edit");
}
function renderEdit(){
  applyTheme(null);const d=draft,h=halaqaOf(d),tp=h&&planHas(h.plan);
  app.innerHTML='<div class="topbar"><span class="brand">'+LOGO+t(d._new?"add_kid":"edit_kid")+'</span><button class="iconbtn" id="eBack" aria-label="'+t("cancel")+'">'+ICON_BACK+'</button></div>'+
   '<section class="card"><label class="field"><span class="sec-t">'+t("kid_name")+'</span><input id="eName" autocomplete="off" maxlength="30" value="'+esc(d.name)+'"></label>'+seg("eGender",[["m",t("boy")],["f",t("girl")]],d.gender)+(modeOf(d)==="kids"?'<label class="field"><span class="sec-t">'+t("gift_lbl")+'</span><input id="eGift" autocomplete="off" maxlength="60" placeholder="'+t("gift_ph")+'" value="'+esc(d.gift||"")+'"></label>':'')+'</section>'+
   '<section class="card"><div class="row"><label class="field" style="flex:0 0 7em"><span class="sec-t">'+t("age")+'</span><input id="eAge" type="number" inputmode="numeric" min="3" max="99" value="'+esc(d.age==null?"":d.age)+'"></label><label class="checkrow"><input type="checkbox" id="eSelf"'+(d.self?' checked':'')+'> '+t("self")+'</label></div><h3>'+t("ui_mode")+'</h3>'+seg("eMode",[["",t("m_auto")],["kids",t("m_kids")],["teens",t("m_teens")],["adults",t("m_adults")]],d.mode||"")+'</section>'+
   (modeOf(d)!=="adults"?'<section class="card"><h3>'+t("look")+'</h3><div class="looks" id="eLooks">'+LOOKS.map((lk,i)=>'<button type="button" class="lk" data-lk="'+i+'" aria-pressed="'+(i===(d.look||0))+'">'+avatar(i,d.skin==null?1:d.skin)+'<span>'+lk[L()]+'</span></button>').join("")+'</div><h3>'+t("skin")+'</h3><div class="row" id="eSkin">'+SKINS.map((c,i)=>'<button type="button" class="skin" data-sk="'+i+'" aria-pressed="'+(i===(d.skin==null?1:d.skin))+'" style="background:'+c+'" aria-label="'+(i+1)+'"></button>').join("")+'</div></section>':'')+
   (modeOf(d)!=="kids"?'<section class="card"><h3>'+t("profile_theme")+'</h3>'+paletteGrid("ePal",d.palette||"",true)+'</section>':'')+
   (modeOf(d)==="kids"?'<section class="card"><h3>'+t(d.gender==="f"?"theme_f":"theme")+'</h3><div class="themes" id="eThemes">'+THEME_ORDER.map(th=>'<button type="button" class="th" data-th="'+th+'" aria-pressed="'+(th===d.theme)+'">'+THEMES[th].art+'<span>'+THEMES[th][L()]+'</span></button>').join("")+'</div></section>':'')+
   '<section class="card"><h3>'+t("halaqa")+'</h3>'+(h?'<p class="about">'+t("joined",esc(h.name))+(h.teacherName?' · '+t("teacher_of",esc(h.teacherName)):'')+'</p><p class="about">'+(tp?t("plan_by_teacher",esc(h.name)):t("plan_by_parent"))+'</p><button type="button" class="btn" id="hLeave" style="align-self:flex-start">'+t("leave")+'</button>':
     '<div class="row"><input id="hCodeIn" class="codein" dir="ltr" maxlength="8" placeholder="'+t("halaqa_code")+'" autocomplete="off" value="'+esc(d._code||"")+'"><button type="button" class="btn primary" id="hJoin">'+t("join")+'</button></div>')+'<p class="msg" id="hMsg"></p></section>'+
   (tp?'':planSection(d))+
   (d._new?'':'<section class="card"><h3>'+t("childdev")+'</h3><p class="about">'+t("childdev_t")+'</p><button type="button" class="btn" id="cdSet" style="align-self:flex-start">'+t("childdev_set",esc(d.name))+'</button></section>')+
   '<p class="msg err" id="eMsg"></p><div class="row"><button class="btn primary big" id="eSave">'+t("save")+'</button><button class="btn big" id="eCancel">'+t("cancel")+'</button>'+(d._new?'':'<button class="btn big" id="eDel" style="margin-inline-start:auto">'+t("del")+'</button>')+'</div>';
  $("eName").oninput=e=>{d.name=e.target.value};
  if($("eGift"))$("eGift").oninput=e=>{d.gift=e.target.value};
  if($("hCodeIn"))$("hCodeIn").oninput=e=>{d._code=e.target.value};
  $("eGender").querySelectorAll("button").forEach(b=>b.onclick=()=>{d.gender=b.dataset.v;renderEdit()});
  if($("eThemes"))$("eThemes").querySelectorAll(".th").forEach(b=>b.onclick=()=>{d.theme=b.dataset.th;$("eThemes").querySelectorAll(".th").forEach(x=>x.setAttribute("aria-pressed",String(x===b)))});
  $("eAge").onchange=e=>{const v=e.target.value.trim();d.age=v===""?"":Math.max(3,Math.min(99,Math.round(+v)||0));renderEdit()};
  $("eSelf").onchange=e=>{d.self=e.target.checked;if(d.self&&(d.age===""||d.age==null))d.age=30;renderEdit()};
  $("eMode").querySelectorAll("button").forEach(b=>b.onclick=()=>{d.mode=b.dataset.v||null;renderEdit()});
  if($("ePal"))$("ePal").querySelectorAll(".pal").forEach(b=>b.onclick=()=>{d.palette=b.dataset.pal||null;$("ePal").querySelectorAll(".pal").forEach(x=>x.setAttribute("aria-pressed",String(x===b)))});
  if($("eLooks"))$("eLooks").querySelectorAll(".lk").forEach(b=>b.onclick=()=>{d.look=+b.dataset.lk;$("eLooks").querySelectorAll(".lk").forEach(x=>x.setAttribute("aria-pressed",String(x===b)))});
  if($("eSkin"))$("eSkin").querySelectorAll(".skin").forEach(b=>b.onclick=()=>{d.skin=+b.dataset.sk;renderEdit()});
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
  const d=draft;d.name=(d.name||"").trim();const h=halaqaOf(d),tp=h&&planHas(h.plan);
  if(!d.name){$("eMsg").textContent=t("name_req");return false}
  if(!tp&&!planHas(d)&&!quiet){$("eMsg").textContent=t("surah_req");return false}
  const prev=ST.kids[d.id];
  const changed=!prev||JSON.stringify([prev.surahs,prev.ranges||[],prev.cycle,prev.light])!==JSON.stringify([d.surahs,d.ranges||[],d.cycle,d.light]);
  const k={id:d.id,name:d.name,gender:d.gender,theme:d.theme,palette:d.palette||null,age:d.age===""?null:d.age,mode:d.mode||null,self:!!d.self,look:d.look||0,skin:d.skin==null?1:d.skin,gift:(d.gift||"").trim().slice(0,60),surahs:d.surahs.slice().sort((a,b)=>a-b),ranges:(d.ranges||[]).map(r=>r.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cycle:d.cycle,light:d.light,weekStart:WS(),
    start:changed?weekOf(today()):(prev.start||weekOf(today())),created:prev&&prev.created||Date.now(),halaqaId:prev?prev.halaqaId||null:null,teacherUid:prev?prev.teacherUid||null:null};
  await D.saveKid(k);d._new=false;return true;
}

/* ================= halaqa editor ================= */
function newCode(){const A="ABCDEFGHJKMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<6;i++)s+=A[Math.floor(Math.random()*A.length)];return s}
function openHEdit(id){
  const h=id?ST.halaqas[id]:null;
  draft=h?JSON.parse(JSON.stringify(h)):{id:uid("h"),name:"",teacherName:ST.profile.name||"",plan:null,_new:true};
  draft._usePlan=planHas(draft.plan);
  draft._p=draft.plan?JSON.parse(JSON.stringify(draft.plan)):{surahs:[],ranges:[],cycle:1,light:5};
  if(!draft._p.ranges)draft._p.ranges=[];
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
    if(d._usePlan&&!planHas(d._p)){$("eMsg").textContent=t("surah_req");return}
    $("eSave").disabled=true;
    try{let code=d.code;if(!code){for(let i=0;i<5;i++){code=newCode();if(!(await D.codeTaken(code)))break}}
      const prev=d.plan,np=d._usePlan?{surahs:d._p.surahs.slice().sort((a,b)=>a-b),ranges:d._p.ranges.map(r=>r.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cycle:d._p.cycle,light:d._p.light,weekStart:WS(),start:prev&&JSON.stringify([prev.surahs,prev.ranges||[],prev.cycle,prev.light])===JSON.stringify([d._p.surahs,d._p.ranges,d._p.cycle,d._p.light])?prev.start:weekOf(today())}:null;
      await D.saveHalaqa({id:d.id,name:d.name,teacherName:(d.teacherName||"").trim(),code,plan:np,created:d.created||Date.now()});
      if(!ST.profile.name&&d.teacherName)D.saveProfile({name:d.teacherName.trim()});
      prefs.mode="teach";savePrefs();const id=d.id;draft=null;hDate=null;go("halaqa",{hid:id});
    }catch(e){$("eSave").disabled=false;$("eMsg").textContent=t("err_generic")}};
  let armed=false;if($("eDel"))$("eDel").onclick=async()=>{if(!armed){armed=true;$("eDel").className="btn warn big";$("eDel").textContent=t("del2");return}await D.deleteHalaqa(d.id);draft=null;go("main")};
}



/* ================= invite link: ?join=CODE ================= */
let joinInfo=null;
function renderJoin(){
  applyTheme(null);const code=prefs.pendingJoin;
  const done=()=>{prefs.pendingJoin=null;savePrefs();joinInfo=null};
  if(!joinInfo||joinInfo.code!==code){joinInfo={code,loading:true};D.findHalaqa(code).then(h=>{joinInfo={code,h:h||null};render()},()=>{joinInfo={code,h:null};render()})}
  const h=joinInfo.h,ks=kidsList();
  app.innerHTML=topbar()+'<section class="stack welcome"><span class="logo">'+LOGO+'</span><h1>'+t("invite_t")+'</h1>'+
   (joinInfo.loading?'<p>'+t("loading")+'</p>':h?'<p><b>«'+esc(h.name)+'»</b>'+(h.teacherName?' · '+t("teacher_of",esc(h.teacherName)):'')+'</p>':'<p>'+t("notfound")+' <b dir="ltr">'+esc(code)+'</b></p>')+'</section>'+
   (h?'<section class="card"><h2>'+t("join_who")+'</h2>'+(ks.length?ks.map(k=>'<div class="kidrow"><span class="t"><b>'+esc(k.name)+'</b>'+(k.halaqaId===h.id?'<small>'+t("already_in")+'</small>':k.halaqaId?'<small>'+t("will_move")+'</small>':'')+'</span>'+(k.halaqaId===h.id?'':'<button class="btn accent" data-jk="'+k.id+'">'+t("join")+'</button>')+'</div>').join(""):'')+
     '<div class="row"><button class="btn accent" id="jNew">+ '+t("for_child")+'</button><button class="btn accent" id="jSelf">+ '+t("for_me")+'</button></div><p class="msg" id="jMsg"></p></section>':'')+
   '<button class="btn" id="jCancel" style="align-self:center">'+t("cancel")+'</button>';
  bindTop();
  $("jCancel").onclick=()=>{done();go("main")};
  if(!h)return;
  const newKid=self=>{done();openEdit(null,self);draft._code=code;renderEdit()};
  $("jNew").onclick=()=>newKid(false);$("jSelf").onclick=()=>newKid(true);
  app.querySelectorAll("[data-jk]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await D.joinHalaqa(b.dataset.jk,code);if(r&&r.err){$("jMsg").className="msg err";$("jMsg").textContent=t("notfound");b.disabled=false;return}
    prefs.cur=b.dataset.jk;prefs.mode="kids";done();go("main")}catch(e){$("jMsg").className="msg err";$("jMsg").textContent=t("err_generic");b.disabled=false}});
}

/* ================= weekly report + PDF export ================= */
function repData(k,w){
  let home=0,cls=0,done=0,ayat=0;const miss={},news=[],tn=[],hn=[];
  for(let i=0;i<7;i++){const d=addDays(w,i),r=day(k,d);if(!r)continue;const hs=+(r.stars||0),ts=+(r.tStars||0);home+=hs;cls+=ts;
    if(hs>0){done++;ayat+=itemAyat(r.items||planFor(k,d))}
    new Set([...(r.weak||[]),...(r.tWeak||[])]).forEach(n=>miss[n]=(miss[n]||0)+1);
    if(r.nS)news.push({d,n:+r.nS,f:r.nF,t:r.nT});if(r.tNotes)tn.push({d,x:r.tNotes});if(r.notes)hn.push({d,x:r.notes})}
  return{home,cls,done,ayat,miss:Object.entries(miss).map(([n,c])=>[+n,c]).sort((a,b)=>b[1]-a[1]||a[0]-b[0]),news,tn,hn};
}
const dayLbl=d=>DAYS[L()][parse(d).getDay()]+' '+nice(d);
const repWeek=()=>nav.w==="prev"?addDays(weekOf(today()),-7):(nav.w||weekOf(today()));
function repTop(title,sub){return '<header class="bhead rhead"><div class="bh-row"><div class="bh-name"><span>'+sub+'</span><b>'+title+'</b></div><span class="rlogo" aria-hidden="true">'+LOGO+'</span></div></header>'}
function repNav(w){return '<div class="weeknav noprint"><button class="btn" id="rPrev">'+t("prev")+'</button><span class="lbl">'+t("week")+'<b>'+nice(w)+' – '+nice(addDays(w,6))+'</b></span><button class="btn" id="rNext">'+t("next")+'</button></div>'}
function bindRep(w,back){
  $("rPrev").onclick=()=>{nav.w=addDays(w,-7);render()};$("rNext").onclick=()=>{nav.w=addDays(w,7);render()};
  $("rBack").onclick=back;$("rPdf").onclick=()=>window.print();
}
const repActs=()=>'<div class="row between noprint"><button class="btn" id="rBack">'+t("back")+'</button><button class="btn accent" id="rPdf">'+t("export_pdf")+'</button></div>';
function renderReport(k,o){
  applyPalette(appTheme());setMode("");
  const w=repWeek(),R=repData(k,w),P=repData(k,addDays(w,-7)),diff=R.home-P.home,inH=!!k.halaqaId;
  const cmp=diff>0?t("rep_up",diff):diff<0?t("rep_down",-diff):t("rep_same");
  const list=(arr,f)=>arr.length?'<ul class="list">'+arr.map(f).join("")+'</ul>':'<p class="empty">'+t("rep_none")+'</p>';
  app.innerHTML=repActs()+repTop(t("rep_of",esc(k.name)),t("week_report")+' · '+nice(w)+' – '+nice(addDays(w,6)))+repNav(w)+
   '<section class="card"><div class="kpis">'+
    '<div class="kpi"><b>'+R.done+'/7</b><span>'+t("rep_days")+'</span></div>'+
    '<div class="kpi"><b>'+R.home+'/21</b><span>'+t("rep_home")+'</span></div>'+
    (inH?'<div class="kpi"><b>'+R.cls+'/21</b><span>'+t("rep_class")+'</span></div>':'')+
    '<div class="kpi"><b>'+R.ayat+'</b><span>'+t("rep_ayat")+'</span></div></div><p class="hint">'+cmp+'</p></section>'+
   '<section class="card"><h3>'+t("rep_mist")+'</h3>'+(R.miss.length?'<div class="items">'+R.miss.map(([n,c])=>'<span class="item weak">'+esc(sName(n))+'<small>'+c+'</small></span>').join("")+'</div>':'<p class="empty">'+t("no_mistakes")+'</p>')+'</section>'+
   '<section class="card"><h3>'+t("rep_new")+'</h3>'+list(R.news,x=>'<li><span class="t"><span class="q">'+esc(sName(x.n))+'</span> '+(x.f||x.t?'<span class="m">'+(x.f||"?")+'–'+(x.t||"?")+'</span>':'')+'</span><span class="m">'+dayLbl(x.d)+'</span></li>')+'</section>'+
   (inH?'<section class="card"><h3>'+t("rep_tnotes")+'</h3>'+list(R.tn,x=>'<li><span>'+esc(x.x)+'</span><span class="m">'+dayLbl(x.d)+'</span></li>')+'</section>':'')+
   '<section class="card"><h3>'+t("rep_notes")+'</h3>'+list(R.hn,x=>'<li><span>'+esc(x.x)+'</span><span class="m">'+dayLbl(x.d)+'</span></li>')+'</section>'+
   '<p class="hint noprint">'+t("print_hint")+'</p><p class="hint printonly">'+t("printed_on",nice(today()))+' · '+t("app")+'</p>';
  bindRep(w,()=>o.teacher?go("student",{hid:o.hid,kid:k.id}):go("hist"));
}
function renderHReport(h){
  applyPalette(appTheme());setMode("");D.subStudents(h.id);
  const w=repWeek(),all=Object.values(ST.students[h.id]||{}).sort((a,b)=>a.name.localeCompare(b.name,"ar")),rows=all.map(k=>({k,r:repData(k,w)}));
  const full=rows.filter(x=>x.r.done===7).length,avg=rows.length?(rows.reduce((a,x)=>a+x.r.home,0)/rows.length).toFixed(1):"0",miss={};
  rows.forEach(x=>x.r.miss.forEach(([n,c])=>miss[n]=(miss[n]||0)+c));const top=Object.entries(miss).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const notDone=rows.filter(x=>x.r.done<7).sort((a,b)=>a.r.done-b.r.done);
  app.innerHTML=repActs()+repTop(esc(h.name),t("h_report")+' · '+nice(w)+' – '+nice(addDays(w,6)))+repNav(w)+
   '<section class="card"><div class="kpis"><div class="kpi"><b>'+all.length+'</b><span>'+t("students")+'</span></div><div class="kpi"><b>'+full+'</b><span>'+t("rep_full")+'</span></div><div class="kpi"><b>'+avg+'</b><span>'+t("rep_avg")+'</span></div></div></section>'+
   '<section class="card"><h3>'+t("students")+'</h3>'+(rows.length?'<table class="rtab"><thead><tr><th>'+t("rep_student")+'</th><th>'+t("rep_days")+'</th><th>'+t("rep_home")+'</th><th>'+t("rep_class")+'</th><th>'+t("mistake")+'</th></tr></thead><tbody>'+
     rows.map(x=>'<tr><td>'+esc(x.k.name)+'</td><td>'+x.r.done+'/7</td><td>'+x.r.home+'</td><td>'+x.r.cls+'</td><td>'+x.r.miss.reduce((a,m)=>a+m[1],0)+'</td></tr>').join("")+'</tbody></table>':'<p class="empty">'+t("no_students")+'</p>')+'</section>'+
   '<section class="card"><h3>'+t("rep_need")+'</h3>'+(notDone.length?'<ul class="list">'+notDone.map(x=>'<li><span>'+esc(x.k.name)+'</span><span class="m">'+x.r.done+'/7</span></li>').join("")+'</ul>':'<p class="empty">'+t("rep_none")+'</p>')+'</section>'+
   '<section class="card"><h3>'+t("top_mistakes")+'</h3>'+(top.length?'<div class="items">'+top.map(([n,c])=>'<span class="item weak">'+esc(sName(+n))+'<small>'+c+'</small></span>').join("")+'</div>':'<p class="empty">'+t("no_mistakes")+'</p>')+'</section>'+
   '<p class="hint noprint">'+t("print_hint")+'</p><p class="hint printonly">'+t("printed_on",nice(today()))+' · '+t("app")+'</p>';
  bindRep(w,()=>go("halaqa",{hid:h.id}));
}
function renderRecord(k,o){
  applyPalette(appTheme());setMode("");
  const A=analyse(k),ids=Object.keys(A.lv).map(Number).sort((a,b)=>a-b),LV={good:t("good"),mid:t("mid"),bad:t("bad"),none:t("nolv")};
  const avg=A.evald?(A.total/A.evald).toFixed(1):"0",inH=!!k.halaqaId;
  app.innerHTML=repActs()+repTop(t("rec_title",esc(k.name)),t("printed_on",nice(today())))+
   '<section class="card"><div class="kpis"><div class="kpi"><b>'+A.perWeek.length+'</b><span>'+t("k_weeks")+'</span></div><div class="kpi"><b>'+A.total+'</b><span>'+t("k_total")+'</span></div><div class="kpi"><b>'+avg+'</b><span>'+t("k_avg")+'</span></div><div class="kpi"><b>'+A.best+'</b><span>'+t("k_streak")+'</span></div></div></section>'+
   '<section class="card"><h3>'+t("lv_t")+'</h3><table class="rtab"><tbody>'+ids.map(n=>{const v=A.lv[n];return '<tr><td><span class="dot" style="background:var(--'+v.level+')"></span> '+esc(sName(n))+'</td><td>'+LV[v.level]+'</td><td>'+(v.n?t("avg")+' '+v.avg.toFixed(1)+' · '+v.n+' '+t("times")+(v.weakN?' · '+t("mistake")+' '+v.weakN:''):'—')+'</td></tr>'}).join("")+'</tbody></table></section>'+
   '<section class="card"><h3>'+t("weeks_t")+'</h3><table class="rtab"><thead><tr><th>'+t("week")+'</th><th>'+t("rep_days")+'</th><th>'+t("rep_home")+'</th>'+(inH?'<th>'+t("rep_class")+'</th>':'')+'</tr></thead><tbody>'+
     A.perWeek.slice().reverse().map(x=>{const r=repData(k,x.w);return '<tr><td>'+nice(x.w)+' – '+nice(addDays(x.w,6))+'</td><td>'+r.done+'/7</td><td>'+r.home+'</td>'+(inH?'<td>'+r.cls+'</td>':'')+'</tr>'}).join("")+'</tbody></table></section>'+
   '<section class="card"><h3>'+t("new_t")+'</h3>'+(A.news.length?'<ul class="list">'+A.news.map(x=>'<li><span class="t"><span class="q">'+esc(sName(x.n))+'</span> '+(x.f||x.t?'<span class="m">'+(x.f||"?")+'–'+(x.t||"?")+'</span>':'')+'</span><span class="m">'+dayLbl(x.d)+'</span></li>').join("")+'</ul>':'<p class="empty">'+t("new_none")+'</p>')+'</section>'+
   '<p class="hint noprint">'+t("print_hint")+'</p><p class="hint printonly">'+t("app")+'</p>';
  $("rBack").onclick=()=>o.teacher?go("shist",{hid:o.hid,kid:k.id}):go("hist");$("rPdf").onclick=()=>window.print();
}

/* ================= Quran text (Tanzil, bundled; fetched the first time it is needed) ================= */
let QT=null,QTp=null;
function loadQuran(){
  if(QT)return Promise.resolve(QT);
  return QTp||(QTp=fetch(QURAN_TEXT_URL).then(r=>{if(!r.ok)throw new Error("http "+r.status);return r.text()}).then(txt=>{
    const mp=parseQuranText(txt);if(!quranTextComplete(mp))throw new Error("quran text incomplete");QT=mp;return mp}).catch(e=>{QTp=null;throw e}));
}
const ayahShown=(s,a)=>{const x=QT&&QT.get(s+":"+a);return x?splitBasmala(s,a,x,QT.get("1:1")):{basmala:null,rest:""}};
const tanzilLine=()=>t("tanzil_src")+' <a href="https://tanzil.net" target="_blank" rel="noopener">tanzil.net</a>';
function openText(items){
  const ov=document.createElement("div");ov.className="sheet";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");ov.setAttribute("aria-label",t("text_t"));
  ov.innerHTML='<div class="sheet-in"><div class="row between"><h2>'+t("text_t")+'</h2><button class="btn" id="qClose">'+t("close")+'</button></div><div id="qBody"><p class="status">'+t("loading")+'</p></div><p class="hint">'+tanzilLine()+'</p></div>';
  document.body.appendChild(ov);$("qClose").onclick=()=>ov.remove();$("qClose").focus();
  loadQuran().then(()=>{if(!ov.isConnected)return;
    $("qBody").innerHTML=items.map(it=>{const xs=range(it[1],it[2]).map(a=>[a,ayahShown(it[0],a)]),b=xs[0][1].basmala;
      return '<h3>'+itemLabel(it)+'</h3>'+(b?'<p class="qbasm">'+esc(b)+'</p>':'')+'<p class="qtext">'+xs.map(([a,x])=>esc(x.rest)+' <span class="qn">\uFD3F'+a.toLocaleString("ar-EG")+'\uFD3E</span>').join(" ")+'</p>'}).join("")})
  .catch(()=>{if(ov.isConnected)$("qBody").innerHTML='<p class="msg err">'+t("text_err")+'</p>'});
}

/* ================= listening (alquran.cloud / Islamic Network CDN) ================= */
const RECITERS=[["ar.husary",128,"rc_husary"],["ar.alafasy",128,"rc_alafasy"],["ar.minshawi",128,"rc_minshawi"],["ar.abdulbasitmurattal",192,"rc_abdulbasit"]];
const AYAH0=(()=>{const a=[0];for(let i=0;i<114;i++)a.push(a[i]+S[i][2]);return a})(); // global number of ayah 1 of surah n = AYAH0[n-1]+1
const ayahUrl=(rc,s,a)=>{const R=RECITERS.find(x=>x[0]===rc)||RECITERS[0];return "https://cdn.islamic.network/quran/audio/"+R[1]+"/"+R[0]+"/"+(AYAH0[s-1]+a)+".mp3"};
const player={el:null,queue:[],i:0,rep:0,on:false,audio:null};
function openListen(items){
  const pr=prefs.audio||{rc:"ar.husary",mode:"ayah",rep:3};prefs.audio=pr;
  const ov=document.createElement("div");ov.className="sheet";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");ov.setAttribute("aria-label",t("listen_t"));
  ov.innerHTML='<div class="sheet-in"><div class="row between"><h2>'+t("listen_t")+'</h2><button class="btn" id="lClose">'+t("close")+'</button></div>'+
   '<label class="field"><span class="sec-t">'+t("reciter")+'</span><select class="sel" id="lRc">'+RECITERS.map(r=>'<option value="'+r[0]+'"'+(r[0]===pr.rc?' selected':'')+'>'+t(r[2])+'</option>').join("")+'</select></label>'+
   '<div class="field"><span class="sec-t">'+t("r_mode")+'</span>'+seg("lMode",[["ayah",t("m_ayah")],["full",t("m_full")]],pr.mode)+'</div>'+
   '<div class="field" id="lRepF"'+(pr.mode==="ayah"?'':' hidden')+'><span class="sec-t">'+t("repeat")+'</span>'+seg("lRep",[[1,t("x_once")],[3,t("x_times",3)],[5,t("x_times",5)],[10,t("x_times",10)]],pr.rep)+'</div>'+
   '<div class="items" id="lItems">'+items.map((it,j)=>'<button class="item" data-j="'+j+'">'+itemLabel(it)+'</button>').join("")+'</div>'+
   '<p class="qline" id="lText" aria-live="off"></p>'+
   '<div class="field"><button type="button" class="btn" id="lWarm">'+t("warm_btn")+'</button><span class="hint" id="lWarmMsg">'+t("warm_hint")+'</span></div>'+
   '<p class="now" id="lNow" aria-live="polite"></p><div class="row"><button class="btn accent big" id="lPlay">'+t("play")+'</button><button class="btn" id="lStop">'+t("stop")+'</button></div>'+
   '<p class="hint">'+t("audio_src")+'</p></div>';
  document.body.appendChild(ov);player.el=ov;loadQuran().catch(()=>{});
  const segBind=(id,f)=>$(id).querySelectorAll("button").forEach(b=>b.onclick=()=>{$(id).querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));f(b.dataset.v)});
  $("lRc").onchange=e=>{pr.rc=e.target.value;savePrefs();if(player.on)playCur()};
  segBind("lMode",v=>{pr.mode=v;savePrefs();$("lRepF").hidden=v!=="ayah"});
  segBind("lRep",v=>{pr.rep=+v;savePrefs()});
  const build=from=>{player.queue=[];items.forEach((it,j)=>{if(j<from)return;for(let a=it[1];a<=it[2];a++)player.queue.push({s:it[0],a,j})});player.i=0;player.rep=0};
  ov.querySelectorAll("#lItems .item").forEach(b=>b.onclick=()=>{build(+b.dataset.j);start()});
  const start=()=>{if(!player.queue.length)build(0);player.on=true;playCur()};
  $("lPlay").onclick=()=>{const a=player.audio;if(player.on&&a&&!a.paused){a.pause();$("lPlay").textContent=t("play");return}if(player.on&&a&&a.paused&&a.src){a.play().catch(err);$("lPlay").textContent=t("pause");return}build(0);start()};
  $("lStop").onclick=()=>stopListen(false);
  $("lClose").onclick=()=>{warmRun++;stopListen(true)};
  $("lWarm").onclick=async()=>{
    if(warming){warmRun++;return}
    warming=true;$("lWarm").textContent=t("warm_cancel");
    const msg=$("lWarmMsg"),r=await prewarmAudio(items,prefs.audio.rc,(ok,fail,total)=>{if($("lWarmMsg"))$("lWarmMsg").textContent=t("warm_prog",ok+fail,total)});
    warming=false;if(!$("lWarm"))return;$("lWarm").textContent=t("warm_btn");
    msg.textContent=r.cancelled?t("warm_stopped",r.ok,r.total):r.fail?t("warm_part",r.ok,r.total,r.fail):t("warm_done",r.ok,r.total)+' '+t("warm_note")};
  const err=()=>{$("lNow").textContent=t("audio_err");player.on=false;$("lPlay").textContent=t("play")};
  player.err=err;$("lClose").focus();
}
/* Best effort: let the browser download today's ayat now so they play from its HTTP cache later.
   The audio CDN sends no CORS headers, so the Cache API cannot be used; an Audio element is what fills the cache
   (a fetch() in no-cors mode was measured not to help). The browser may still evict the files. */
let warmRun=0,warming=false;
async function prewarmAudio(items,rc,on){
  const run=++warmRun,list=[];
  items.forEach(it=>{for(let a=it[1];a<=it[2];a++)list.push([it[0],a])});
  let ok=0,fail=0,i=0;const keep=[];
  const one=([s,a])=>new Promise(res=>{
    const el=new Audio();el.preload="auto";keep.push(el);let done=false,tm=null;
    const fin=g=>{if(done)return;done=true;clearTimeout(tm);el.onprogress=el.oncanplaythrough=el.onloadedmetadata=el.onerror=null;el.removeAttribute("src");el.load();res(g)};
    const chk=()=>{try{const b=el.buffered;if(isFinite(el.duration)&&b.length&&b.end(b.length-1)>=el.duration-0.3)fin(true)}catch(e){}};
    el.onprogress=chk;el.oncanplaythrough=chk;el.onloadedmetadata=chk;el.onerror=()=>fin(false);
    tm=setTimeout(()=>fin(false),30000);
    el.src=ayahUrl(rc,s,a);
  });
  const worker=async()=>{while(i<list.length&&run===warmRun){const x=list[i++];(await one(x))?ok++:fail++;on(ok,fail,list.length)}};
  await Promise.all([worker(),worker()]);
  return{ok,fail,total:list.length,cancelled:run!==warmRun};
}
function playCur(){
  const q=player.queue[player.i];if(!q){stopListen(false);return}
  if(!player.audio){player.audio=new Audio();player.audio.preload="auto";
    player.audio.onended=()=>{const pr=prefs.audio;player.rep++;if(pr.mode!=="ayah"||player.rep>=pr.rep){player.rep=0;player.i++}playCur()};
    player.audio.onerror=()=>player.err&&player.err()}
  player.audio.src=ayahUrl(prefs.audio.rc,q.s,q.a);player.audio.play().then(()=>{if($("lPlay"))$("lPlay").textContent=t("pause")}).catch(()=>player.err&&player.err());
  if($("lText"))$("lText").textContent=ayahShown(q.s,q.a).rest;
  if($("lNow"))$("lNow").textContent=t("now_ayah",sName(q.s),q.a)+(prefs.audio.mode==="ayah"&&prefs.audio.rep>1?' · '+(player.rep+1)+'/'+prefs.audio.rep:'');
  if(player.el)player.el.querySelectorAll("#lItems .item").forEach(b=>b.classList.toggle("on",+b.dataset.j===q.j));
  const nx=player.queue[player.i+1];if(nx){const pre=new Audio();pre.preload="auto";pre.src=ayahUrl(prefs.audio.rc,nx.s,nx.a)}
}
function stopListen(close){
  player.on=false;player.queue=[];player.i=0;player.rep=0;if(player.audio){player.audio.pause();player.audio.removeAttribute("src");player.audio.load()}
  if($("lPlay"))$("lPlay").textContent=t("play");if($("lNow"))$("lNow").textContent="";if($("lText"))$("lText").textContent="";
  if(player.el)player.el.querySelectorAll("#lItems .item").forEach(b=>b.classList.remove("on"));
  if(close&&player.el){player.el.remove();player.el=null}
}

/* open from a notification link: ?report=1 (parent, last week) or ?hreport=<halaqaId> (teacher) */
(()=>{const q=new URLSearchParams(location.search);
  if(q.get("join")){prefs.pendingJoin=String(q.get("join")).trim().toUpperCase().slice(0,8);savePrefs();history.replaceState(null,"",location.pathname)}
  if(q.get("report")){nav={view:"report",w:"prev"}}
  else if(q.get("hreport")){prefs.mode="teach";nav={view:"hreport",hid:q.get("hreport"),w:"prev"}}
  if(q.get("report")||q.get("hreport"))history.replaceState(null,"",location.pathname);
})();

render();
