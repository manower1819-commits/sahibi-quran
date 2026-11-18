import test from "node:test";
import assert from "node:assert/strict";
import {juzItems,juzCoverage,JUZ_START} from "../src/juz.js";
import {S} from "../src/surahs.js";
import {planAdd,planRemove,planToggleJuz,itemsPlan,planUnits,planCovers,planAyat} from "../src/planner.js";

const ayat=items=>items.reduce((a,it)=>a+it[2]-it[1]+1,0);

test("the 30 juz together are exactly the whole Quran, with no overlap", () => {
  const all=[];for(let j=1;j<=30;j++)all.push(...juzItems(j));
  assert.equal(ayat(all),6236);
  const seen=new Set();
  all.forEach(([n,f,t])=>{assert.ok(f>=1&&t>=f&&t<=S[n-1][2]);for(let a=f;a<=t;a++){const k=n*1000+a;assert.ok(!seen.has(k),"overlap "+k);seen.add(k)}});
});

test("juzItems agrees with juzCoverage on the size of every juz", () => {
  const cov=juzCoverage([],[]);
  for(let j=1;j<=30;j++)assert.equal(ayat(juzItems(j)),cov[j-1].total,"juz "+j);
});

test("juz 1 and juz 30 pieces", () => {
  assert.deepEqual(juzItems(1),[[1,1,7],[2,1,141]]);
  assert.deepEqual(juzItems(2),[[2,142,252]]);
  assert.deepEqual(juzItems(30)[0],[78,1,40]);
  assert.deepEqual(juzItems(30).at(-1),[114,1,6]);
  assert.deepEqual(juzItems(0),[]);
  assert.deepEqual(juzItems(31),[]);
});

test("pressing a juz adds all of it, pressing again takes it out", () => {
  let p={surahs:[],ranges:[]};
  p=planToggleJuz(p,30);
  assert.equal(juzCoverage(p.surahs,p.ranges)[29].frac,1);
  assert.equal(planAyat(p),ayat(juzItems(30)));
  assert.ok(p.surahs.includes(114)&&p.surahs.includes(79));
  p=planToggleJuz(p,30);
  assert.deepEqual(p,{surahs:[],ranges:[]});
});

test("juz 1 then juz 2 end as one range of Al-Baqarah and juz 3 completes the surah", () => {
  let p={surahs:[],ranges:[]};
  p=planToggleJuz(p,1);
  assert.deepEqual(p.surahs,[1]);
  assert.deepEqual(p.ranges,[[2,1,141]]);
  p=planToggleJuz(p,2);
  assert.deepEqual(p.ranges,[[2,1,252]]);
  p=planToggleJuz(p,3);   // Al-Baqarah 253-286 joins and the surah becomes whole
  assert.ok(p.surahs.includes(2));
  assert.deepEqual(p.ranges.filter(r=>r[0]===2),[]);
});

test("all 30 juz pressed one by one give all 114 surahs, and pressing them all again leaves nothing", () => {
  let p={surahs:[],ranges:[]};
  for(let j=1;j<=30;j++)p=planToggleJuz(p,j);
  assert.equal(p.surahs.length,114);assert.deepEqual(p.ranges,[]);
  for(let j=1;j<=30;j++)p=planToggleJuz(p,j);
  assert.deepEqual(p,{surahs:[],ranges:[]});
});

test("a juz that is only partly chosen is completed, not removed", () => {
  let p={surahs:[],ranges:[[2,142,200]]};   // part of juz 2
  p=planToggleJuz(p,2);
  assert.deepEqual(p.ranges,[[2,142,252]]);
  assert.equal(juzCoverage(p.surahs,p.ranges)[1].frac,1);
});

test("removing a juz from a whole surah leaves the rest of it as ranges", () => {
  let p={surahs:[2],ranges:[]};
  p=planToggleJuz(p,2);    // juz 2 = 2:142-252
  assert.deepEqual(p.surahs,[]);
  assert.deepEqual(p.ranges,[[2,1,141],[2,253,286]]);
  assert.ok(planCovers(p,2,1,141)&&!planCovers(p,2,142,142)&&planCovers(p,2,253,286));
});

test("planRemove: surah that is not in the plan stays out, and the input is not changed", () => {
  const p={surahs:[1,2],ranges:[[3,1,50]]};const before=JSON.stringify(p);
  assert.deepEqual(planRemove(p,5,1,10),{surahs:[1,2],ranges:[[3,1,50]]});
  assert.deepEqual(planRemove(p,3,1,50),{surahs:[1,2],ranges:[]});
  assert.deepEqual(planRemove(p,3,10,20),{surahs:[1,2],ranges:[[3,1,9],[3,21,50]]});
  assert.equal(JSON.stringify(p),before);
});

test("planRemove then planAdd of the same piece gives back the same plan", () => {
  const p={surahs:[2,3],ranges:[]};
  const q=planAdd(planRemove(p,2,100,150),2,100,150);
  assert.deepEqual(q,{surahs:[2,3],ranges:[]});
});

test("itemsPlan turns a day's list into a plan and back", () => {
  const list=[[1,1,7],[2,1,141],[114,1,6]];
  const p=itemsPlan(list);
  assert.deepEqual(p,{surahs:[1,114],ranges:[[2,1,141]]});
  assert.deepEqual(planUnits(p),[[1,1,7],[2,1,141],[114,1,6]]);
  assert.deepEqual(itemsPlan([]),{surahs:[],ranges:[]});
});

test("JUZ_START has 30 entries", () => assert.equal(JUZ_START.length,30));

test("adding an ayah range keeps the other pieces of the same surah that a juz left", () => {
  let p=planToggleJuz({surahs:[2],ranges:[]},2);   // Al-Baqarah 1-141 and 253-286
  const q=planAdd(p,2,150,160);
  assert.deepEqual(q.ranges,[[2,1,141],[2,150,160],[2,253,286]]);
  assert.deepEqual(planAdd(p,2,255,257),p);   // already in the plan: nothing changes
  const full=planAdd(planAdd(q,2,142,149),2,161,252);   // filling the gaps makes it a whole surah again
  assert.deepEqual(full,{surahs:[2],ranges:[]});
});
