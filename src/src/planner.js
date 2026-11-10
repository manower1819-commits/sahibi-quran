/* Pure planning logic (no DOM, no store): date helpers, mushaf page weights and the review-cycle distribution.
   Kept out of main.js so it can be unit-tested (see test/planner.test.js and test/algo2.test.js). */
import {S} from "./surahs.js";
import {PAGE_START} from "./pages.js";

/* ---------- dates ---------- */
export const pad=n=>(n<10?"0":"")+n;
export const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
export const parse=s=>{const p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2])};
export const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
export const diffDays=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
export const weekOfWs=(s,ws)=>{const d=parse(s);d.setDate(d.getDate()-((d.getDay()-ws+7)%7));return iso(d)};

/* ---------- planning ---------- */
const binCache=new Map();
/* page weights: each ayah counts as 1/(ayat on its page), so a surah's weight is its length in mushaf pages */
export const AY0=[0];for(let i=0;i<114;i++)AY0.push(AY0[i]+S[i][2]);
export const AW=new Float64Array(6237),PSTART=new Set(PAGE_START);
for(let p=0;p<604;p++){const a=PAGE_START[p],b=p<603?PAGE_START[p+1]:6237;for(let g=a;g<b;g++)AW[g]=1/(b-a)}
export const pgs=(n,f,t)=>{let w=0;for(let a=f;a<=t;a++)w+=AW[AY0[n-1]+a];return w};
/* The units of a plan: whole surahs [n,1,last] plus optional ayah ranges [n,from,to] (plan.ranges).
   A whole surah wins over a range of the same surah; invalid or overlapping ranges are clipped/dropped. */
export function planUnits(plan){
  const whole=new Set(plan.surahs||[]),out=[];
  [...whole].sort((a,b)=>a-b).forEach(n=>{if(S[n-1])out.push([n,1,S[n-1][2]])});
  const last={};
  (plan.ranges||[]).map(r=>[+r[0],+r[1],+r[2]]).filter(r=>S[r[0]-1]&&!whole.has(r[0])&&r[1]>=1&&r[2]>=r[1]&&r[2]<=S[r[0]-1][2])
    .sort((x,y)=>x[0]-y[0]||x[1]-y[1]).forEach(r=>{const lo=Math.max(r[1],(last[r[0]]||0)+1);if(lo<=r[2]){out.push([r[0],lo,r[2]]);last[r[0]]=r[2]}});
  return out.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
}
/* ---------- mushaf pages (604, Madani): PAGE_START[p-1] is the global number of page p's first ayah ---------- */
export function pageOfAyah(n,a){const g=AY0[n-1]+a;let lo=0,hi=603;while(lo<hi){const mid=(lo+hi+1)>>1;if(PAGE_START[mid]<=g)lo=mid;else hi=mid-1}return lo+1}
/* the [surah,from,to] pieces printed on page p (a page can hold the end of one surah and the start of the next) */
export function pageSegments(p){
  const a0=PAGE_START[p-1],a1=p<604?PAGE_START[p]-1:6236,out=[];
  for(let s=1;s<=114;s++){const lo=AY0[s-1]+1,hi=AY0[s];if(hi<a0||lo>a1)continue;out.push([s,Math.max(a0,lo)-AY0[s-1],Math.min(a1,hi)-AY0[s-1]])}
  return out;
}
/* sorted page numbers touched by a list of items */
export function itemPageList(items){const set=new Set();items.forEach(([n,f,t])=>{for(let q=pageOfAyah(n,f);q<=pageOfAyah(n,t);q++)set.add(q)});return[...set].sort((a,b)=>a-b)}
/* true when every ayah of n:f-t is already in the plan */
export function planCovers(plan,n,f,t){const us=planUnits(plan).filter(u=>u[0]===n);for(let a=f;a<=t;a++)if(!us.some(u=>a>=u[1]&&a<=u[2]))return false;return true}
/* The plan's surahs/ranges after adding n:f-t. Touching or overlapping ranges of the same surah are merged;
   when they end up covering the whole surah it becomes a whole surah. Does not change the input. */
export function planAdd(plan,n,f,t){
  const whole=new Set(plan.surahs||[]),rest=(plan.ranges||[]).filter(r=>r[0]!==n).map(r=>r.slice());
  if(!whole.has(n)){
    const mine=planUnits({surahs:[],ranges:plan.ranges||[]}).filter(u=>u[0]===n).map(u=>[u[1],u[2]]);mine.push([f,t]);mine.sort((a,b)=>a[0]-b[0]);
    const merged=[];mine.forEach(r=>{const l=merged[merged.length-1];if(l&&r[0]<=l[1]+1)l[1]=Math.max(l[1],r[1]);else merged.push(r.slice())});
    if(merged.length===1&&merged[0][0]===1&&merged[0][1]===S[n-1][2])whole.add(n);
    else merged.forEach(m=>rest.push([n,m[0],m[1]]));
  }
  rest.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  return{surahs:[...whole].sort((a,b)=>a-b),ranges:rest};
}
export const planHas=p=>!!p&&((p.surahs&&p.surahs.length>0)||(p.ranges&&p.ranges.length>0));
export const planAyat=p=>planUnits(p).reduce((a,u)=>a+u[2]-u[1]+1,0);
/* Plans saved before the in-order distribution carry no `algo` and keep the balanced, interleaved distribution below, exactly as it was.
   Plans saved from now on carry algo:2 and use binsPages. */
export const ALGO_PAGES=2;
export function bins(plan){
  // the in-order distribution depends on the plan and its cycle only; the old one also on the light day and the week start
  const key=JSON.stringify(plan.algo===ALGO_PAGES?[ALGO_PAGES,plan.surahs,plan.ranges||[],plan.cycle]:[0,plan.surahs,plan.ranges||[],plan.cycle,plan.light,plan.weekStart]);
  if(binCache.has(key))return binCache.get(key);
  const out=plan.algo===ALGO_PAGES?binsPages(plan):binsLegacy(plan);
  binCache.set(key,out);return out;
}
function binsLegacy(plan){
  const ws=plan.weekStart==null?6:plan.weekStart,N=7*plan.cycle,caps=[];
  for(let b=0;b<N;b++){const jd=(ws+b%7)%7;caps.push(jd===plan.light?0.5:1)}
  const list=planUnits(plan),total=list.reduce((a,u)=>a+pgs(u[0],u[1],u[2]),0),unit=total/caps.reduce((a,c)=>a+c,0);
  const chunks=[];
  list.forEach(([n,lo,a])=>{const w=pgs(n,lo,a);
    if(unit>0&&w>unit*1.3){const k=Math.ceil(w/unit),cuts=[lo];let acc=0,j=1;
      // cut at the first ayah of a mushaf page, nearest to each equal share
      for(let x=lo;x<=a&&j<k;x++){const before=acc;acc+=AW[AY0[n-1]+x];const tgt=w*j/k;
        if(acc>=tgt){let c=x+1;for(let y=x+1;y<=a;y++){if(PSTART.has(AY0[n-1]+y)){c=y;break}}
          let cb=null;for(let y=x;y>cuts[cuts.length-1];y--){if(PSTART.has(AY0[n-1]+y)){cb=y;break}}
          if(cb&&Math.abs(pgs(n,lo,cb-1)-tgt)<=Math.abs(pgs(n,lo,c-1)-tgt))c=cb;
          if(c>cuts[cuts.length-1]&&c<=a)cuts.push(c);j++;}}
      cuts.forEach((c,i)=>chunks.push([n,c,i+1<cuts.length?cuts[i+1]-1:a]))}
    else chunks.push([n,lo,a])});
  const W=c=>pgs(c[0],c[1],c[2]);
  chunks.sort((x,y)=>W(y)-W(x)||x[0]-y[0]||x[1]-y[1]);
  const load=new Array(N).fill(0),out=[];for(let b=0;b<N;b++)out.push([]);
  chunks.forEach(c=>{const len=W(c);let best=0,bv=Infinity;for(let b=0;b<N;b++){const v=(load[b]+len)/caps[b];if(v<bv-1e-9){bv=v;best=b}}load[best]+=len;out[best].push(c)});
  // reorder days (only between days of equal capacity) so each day starts at the beginning of a surah where possible —
  // day 1 always, then the rest of the first week first; then give each split surah's parts in day order (part 1 first)
  const cnt={};chunks.forEach(c=>cnt[c[0]]=(cnt[c[0]]||0)+1);const split=new Set(Object.keys(cnt).filter(n=>cnt[n]>1).map(Number)),minS=a=>a.reduce((m,c)=>Math.min(m,c[0]),Infinity);
  const left=out.map((a,i)=>i),seen=new Set(),order=[];
  for(let pos=0;pos<N;pos++){
    const cand=left.filter(i=>caps[i]===caps[pos]);let pick=cand[0];
    for(const i of cand){const m=minS(out[i]);if(!out[i].length||!split.has(m)||!seen.has(m)){pick=i;break}}
    left.splice(left.indexOf(pick),1);order.push(pick);out[pick].forEach(c=>seen.add(c[0]));
  }
  const res=order.map(i=>out[i].map(c=>c.slice()));
  split.forEach(n=>{const parts=[];res.forEach(a=>a.forEach(c=>{if(c[0]===n)parts.push(c)}));
    const rng=chunks.filter(c=>c[0]===n).map(c=>[c[1],c[2]]).sort((x,y)=>x[0]-y[0]);parts.forEach((c,j)=>{c[1]=rng[j][0];c[2]=rng[j][1]})});
  out.length=0;res.forEach(a=>out.push(a));
  out.forEach(a=>a.sort((x,y)=>x[0]-y[0]||x[1]-y[1]));
  return out;
}

/* In mushaf order and equal in PAGES. The ayat of the plan are laid end to end, each weighing its share of a mushaf page, and every day
   takes an equal stretch: there is no light day in this distribution. The end of each day is the ayah that brings the total
   closest to the exact equal share, wherever it falls (a surah or a page is not a reason to move it). So 7 pages over 7 days is one
   page a day, 20 pages over 7 days is about 2.9 a day, neighbouring surahs share a day, and the days differ by less than one ayah.
   When the plan is smaller than the number of days some days stay empty, spread through the cycle. */
function binsPages(plan){
  const N=7*plan.cycle,caps=[];
  for(let b=0;b<N;b++)caps.push(1)
  const units=planUnits(plan),ay=[];
  units.forEach(([n,lo,hi])=>{for(let a=lo;a<=hi;a++){const g=AY0[n-1]+a;ay.push({n,a,w:AW[g]})}});
  const out=[];for(let b=0;b<N;b++)out.push([]);
  if(!ay.length)return out;
  const cum=[0];ay.forEach(x=>cum.push(cum[cum.length-1]+x.w));
  const total=cum[ay.length],capSum=caps.reduce((x,y)=>x+y,0),cands=[];
  for(let i=1;i<=ay.length;i++)cands.push(i);
  const cuts=[];let c0=0,prev=0;
  for(let b=0;b<N-1;b++){
    c0+=caps[b];const target=c0/capSum*total;let best=prev,bc=Infinity;
    for(const i of cands){if(i<prev)continue;const cost=Math.abs(cum[i]-target);if(cost<bc-1e-9){bc=cost;best=i}}
    // staying on the previous cut (an empty day) is chosen when it is clearly closer to the target than any real boundary
    if(Math.abs(cum[prev]-target)<Math.abs(cum[best]-target)-1e-9)best=prev;
    cuts.push(best);prev=best;
  }
  let from=0;
  [...cuts,ay.length].forEach((to,b)=>{
    const items=[];for(let i=from;i<to;i++){const x=ay[i],l=items[items.length-1];if(l&&l[0]===x.n&&l[2]===x.a-1)l[2]=x.a;else items.push([x.n,x.a,x.a])}
    out[b]=items;from=Math.max(from,to);
  });
  return out;
}

/* Did the plan itself change (surahs, ranges or cycle length)? Order inside the lists does not matter. */
const planKey=q=>JSON.stringify([(q.surahs||[]).slice().sort((x,y)=>x-y),(q.ranges||[]).map(r=>r.slice()).sort((x,y)=>x[0]-y[0]||x[1]-y[1]),q.cycle]);
export const planChanged=(prev,next)=>!prev||planKey(prev)!==planKey(next);
/* The fields that say how a plan is distributed, for the plan being saved. A new plan, or one whose surahs/ranges/cycle changed,
   gets the in-order distribution (algo 2, no light day) counted from today. A plan saved with nothing changed keeps exactly what it had
   (an old plan stays old; its start is not touched). Never returns an undefined value: Firestore rejects those.
   keepStart is for adding to a plan little by little (the "add to my review" prompt): a plan that already has the in-order distribution and
   keeps its cycle length keeps its start too, so the cycle goes on instead of going back to day 1 with every addition. */
export function planStamp(prev,next,today,weekToday,keepStart){
  if(keepStart&&prev&&prev.algo===ALGO_PAGES&&prev.start&&prev.cycle===next.cycle)return{light:-1,algo:ALGO_PAGES,start:prev.start};
  if(planChanged(prev,next))return{light:-1,algo:ALGO_PAGES,start:today};
  const out={light:prev.algo===ALGO_PAGES||prev.light==null?-1:prev.light,start:prev.start||(prev.algo===ALGO_PAGES?today:weekToday)};
  if(prev.algo===ALGO_PAGES)out.algo=ALGO_PAGES;
  return out;
}

/* A plan saved from a device whose date was ahead (or from a timezone ahead of ours) has a start that has not come yet here. Such a plan
   is counted from today until the real start arrives, so nobody sees an empty day because of a date difference. Plans without the
   in-order distribution, and starts that are not a valid date, are returned untouched (same object). Does not modify the stored plan. */
export const START_RE=/^\d{4}-\d{2}-\d{2}$/;
export function clampStart(p,today){
  if(p&&p.algo===ALGO_PAGES&&typeof p.start==="string"&&START_RE.test(p.start)&&START_RE.test(today)&&p.start>today)return Object.assign({},p,{start:today});
  return p;
}

/* The days of the week starting on w that the weekly gift asks for. All seven, except for a plan with the in-order distribution that
   starts inside or after the week: the days before its start have no wird, so they are not asked for (a plan saved on Wednesday opens
   its first gift on the days from Wednesday to the end of that week). A week wholly before the start has none, so no gift. */
export function giftDays(plan,w){
  const out=[];for(let i=0;i<7;i++)out.push(addDays(w,i));
  if(plan&&plan.algo===ALGO_PAGES&&typeof plan.start==="string"&&START_RE.test(plan.start))return out.filter(d=>d>=plan.start);
  return out;
}

/* The numbers of the week starting on w. starsOf(date) is the stars written for that date (0 when nothing).
   tot: stars of the seven days. rated: every day with a star, whatever the plan (what the reports and the teen badges count).
   need: days the gift asks for (giftDays). done: rated days among them. open: the gift is open. left: days still needed. */
export function giftStats(plan,w,starsOf){
  const need=giftDays(plan,w);let tot=0,rated=0,done=0;
  for(let i=0;i<7;i++){const d=addDays(w,i),s=+starsOf(d)||0;tot+=s;if(s>0){rated++;if(need.indexOf(d)>-1)done++}}
  return{tot,rated,done,need:need.length,open:need.length>0&&done>=need.length,left:Math.max(0,need.length-done)}
}

/* The items of a plan on a date (before any per-day override stored by the app). */
export function planItems(p,date){
  if(!planHas(p))return[];
  const ws=p.weekStart==null?6:p.weekStart;
  if(p.algo===ALGO_PAGES){
    // counted from the day the plan was saved; before that day there is no wird. A missing or malformed start, or a cycle that is not
    // a whole number of weeks, gives an empty day: such a plan cannot be placed in time, and it must not crash the screen.
    if(!Number.isInteger(p.cycle)||p.cycle<1)return[];
    if(typeof p.start!=="string"||!START_RE.test(p.start)||date<p.start)return[];
    const n=7*p.cycle,di=((diffDays(p.start,date)%n)+n)%n;
    return(bins(p)[di]||[]).map(c=>[c[0],c[1],c[2]])
  }
  const wk=Math.round(diffDays(p.start||weekOfWs(date,ws),weekOfWs(date,ws))/7),wi=((wk%p.cycle)+p.cycle)%p.cycle;
  const off=(parse(date).getDay()-ws+7)%7;
  return bins(p)[wi*7+off].map(c=>[c[0],c[1],c[2]]);
}
/* Union of two item lists ([surah,from,to]); overlapping or touching ranges of a surah are merged. Used to make up a missed day. */
export function mergeItems(a,b){
  const by={};a.concat(b).forEach(it=>{(by[it[0]]||(by[it[0]]=[])).push([it[1],it[2]])});
  const out=[];
  Object.keys(by).map(Number).sort((x,y)=>x-y).forEach(n=>{const m=[];
    by[n].sort((x,y)=>x[0]-y[0]).forEach(r=>{const l=m[m.length-1];if(l&&r[0]<=l[1]+1)l[1]=Math.max(l[1],r[1]);else m.push(r.slice())});
    m.forEach(r=>out.push([n,r[0],r[1]]))});
  return out;
}
export const itemAyat=items=>items.reduce((s,it)=>s+it[2]-it[1]+1,0);
export const itemPages=items=>items.reduce((s,it)=>s+pgs(it[0],it[1],it[2]),0);
