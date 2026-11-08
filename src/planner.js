/* Pure planning logic (no DOM, no store): date helpers, mushaf page weights and the review-cycle distribution.
   Moved out of main.js unchanged so it can be unit-tested (see test/planner.test.js). */
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
export function bins(plan){
  const key=JSON.stringify([plan.surahs,plan.ranges||[],plan.cycle,plan.light,plan.weekStart]);
  if(binCache.has(key))return binCache.get(key);
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
  binCache.set(key,out);return out;
}

/* The items of a plan on a date (before any per-day override stored by the app). */
export function planItems(p,date){
  if(!planHas(p))return[];
  const ws=p.weekStart==null?6:p.weekStart;
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
