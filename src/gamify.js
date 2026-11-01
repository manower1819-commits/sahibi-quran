/* Teen points, levels, badges and weekly challenge. Rules approved by the parent:
   10 points per home star and per class star; +50 for a full week (7/7); +50 for the weekly challenge;
   a new level every 500 points. */
export const PTS_STAR=10,PTS_WEEK=50,PTS_CHALLENGE=50,LEVEL_PTS=500;
export const LEVELS={ar:["مبتدئ","ساعٍ","مثابر","حافظ مثابر","متقن","حافظ متميز","فارس القرآن"],en:["Beginner","Striver","Steady","Devoted","Skilled","Distinguished","Quran Knight"]};
export function levelInfo(points,lang){const n=Math.floor(points/LEVEL_PTS)+1,names=LEVELS[lang]||LEVELS.ar;return{n,name:names[Math.min(n,names.length)-1],into:points%LEVEL_PTS,need:LEVEL_PTS}}
/* challenge rotates by week index: 0 = 7 days done, 1 = 5 days with no mistakes, 2 = 15+ stars */
export function challengeFor(weekStart){const n=Math.floor(Date.parse(weekStart+"T00:00:00Z")/(7*864e5));return ((n%3)+3)%3}
export function challengeProgress(kind,days){ // days: array of 7 records (or null)
  if(kind===0){const v=days.filter(r=>r&&+(r.stars||0)>0).length;return{v,goal:7}}
  if(kind===1){const v=days.filter(r=>r&&+(r.stars||0)>0&&!(r.weak||[]).length&&!(r.tWeak||[]).length).length;return{v,goal:5}}
  const v=days.reduce((a,r)=>a+(r?+(r.stars||0):0),0);return{v,goal:15};
}
