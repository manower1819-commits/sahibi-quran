import {S} from "./surahs.js";
// Start of each juz (Hafs/Madani): [surah, ayah]
export const JUZ_START=[[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
const key=(s,a)=>s*1000+a;
export function juzOf(s,a){let j=0;for(let i=0;i<30;i++)if(key(s,a)>=key(JUZ_START[i][0],JUZ_START[i][1]))j=i;return j}
// ayat count of every juz, and how many of them the memorized surahs cover
export function juzCoverage(surahs){
  const tot=new Array(30).fill(0),got=new Array(30).fill(0),set=new Set(surahs);
  for(let s=1;s<=114;s++)for(let a=1;a<=S[s-1][2];a++){const j=juzOf(s,a);tot[j]++;if(set.has(s))got[j]++}
  return tot.map((t,i)=>({juz:i+1,total:t,got:got[i],frac:got[i]/t}));
}
// surahs that start inside a given juz (for juz badges)
export function surahsOfJuz(j){const r=[];for(let s=1;s<=114;s++){if(juzOf(s,1)===j-1)r.push(s)}return r}
