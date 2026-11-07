import test from "node:test";
import assert from "node:assert/strict";
import {S} from "../src/surahs.js";
import {PAGE_START} from "../src/pages.js";
import {AY0, AW, bins, planItems, planUnits, planHas, planAyat, itemAyat, itemPages, pgs, addDays, diffDays, weekOfWs, iso, parse} from "../src/planner.js";

const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
// 2026-01-03 is a Saturday (week start for ws=6), 2026-01-04 a Sunday, 2026-01-05 a Monday.
const START = {6: "2026-01-03", 0: "2026-01-04", 1: "2026-01-05"};

test("mushaf data is internally consistent", () => {
  assert.equal(S.length, 114);
  assert.equal(AY0[114], 6236, "total ayat");
  assert.equal(PAGE_START.length, 604, "mushaf pages");
  assert.equal(PAGE_START[0], 1);
  for (let i = 1; i < PAGE_START.length; i++) assert.ok(PAGE_START[i] > PAGE_START[i - 1], "PAGE_START strictly increasing at " + i);
  assert.ok(Math.abs(AW.reduce((a, b) => a + b, 0) - 604) < 1e-6, "page weights sum to 604");
});

test("date helpers", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(diffDays("2026-01-01", "2026-01-08"), 7);
  assert.equal(iso(parse("2026-07-09")), "2026-07-09");
  assert.equal(new Date(2026, 0, 3).getDay(), 6, "fixture: 2026-01-03 is a Saturday");
  assert.equal(weekOfWs("2026-01-03", 6), "2026-01-03");
  assert.equal(weekOfWs("2026-01-09", 6), "2026-01-03");
  assert.equal(weekOfWs("2026-01-02", 6), "2025-12-27");
  assert.equal(weekOfWs("2026-01-06", 0), "2026-01-04");
  assert.equal(weekOfWs("2026-01-06", 1), "2026-01-05");
});

test("item helpers", () => {
  assert.equal(itemAyat([[1, 1, 7], [112, 1, 4]]), 11);
  assert.ok(Math.abs(itemPages([[1, 1, 7]]) - pgs(1, 1, 7)) < 1e-12);
  assert.ok(pgs(2, 1, 286) > 40 && pgs(2, 1, 286) < 50, "Al-Baqarah is about 48 pages");
});

function ayahCounts(items, counts) {
  for (const [n, f, t] of items) for (let a = f; a <= t; a++) { const k = n + ":" + a; counts.set(k, (counts.get(k) || 0) + 1); }
}

const PLANS = [
  ["juz amma", range(78, 114)],
  ["juz 29+30", range(67, 114)],
  ["whole quran", range(1, 114)],
  ["single long surah", [2]],
  ["scattered", [18, 36, 55, 67, 78]],
  ["short ones", [1, 112, 113, 114]],
];

for (const [name, surahs] of PLANS) {
  for (const cycle of [1, 2, 4, 12]) {
    for (const light of [-1, 5]) {
      for (const ws of [6, 0, 1]) {
        test(`every ayah exactly once per cycle: ${name}, cycle ${cycle}, light ${light}, ws ${ws}`, () => {
          const plan = {surahs, cycle, light, weekStart: ws, start: START[ws]};
          const counts = new Map();
          for (let i = 0; i < 7 * cycle; i++) ayahCounts(planItems(plan, addDays(plan.start, i)), counts);
          let expected = 0;
          for (const n of surahs) for (let a = 1; a <= S[n - 1][2]; a++) {
            expected++;
            assert.equal(counts.get(n + ":" + a), 1, `ayah ${n}:${a}`);
          }
          assert.equal(counts.size, expected, "nothing outside the plan is scheduled");
        });
      }
    }
  }
}

test("the plan repeats every cycle", () => {
  const plan = {surahs: range(67, 114), cycle: 3, light: 5, weekStart: 6, start: START[6]};
  for (let i = 0; i < 21; i++) {
    const d = addDays(plan.start, i);
    assert.deepEqual(planItems(plan, d), planItems(plan, addDays(d, 21)));
    assert.deepEqual(planItems(plan, d), planItems(plan, addDays(d, -21)));
  }
});

test("the light day carries less than a normal day", () => {
  const plan = {surahs: range(67, 114), cycle: 2, light: 5, weekStart: 6, start: START[6]};
  const load = [];
  for (let i = 0; i < 14; i++) load.push({d: addDays(plan.start, i), p: itemPages(planItems(plan, addDays(plan.start, i)))});
  const isLight = x => parse(x.d).getDay() === 5;
  const lightAvg = load.filter(isLight).reduce((a, x) => a + x.p, 0) / load.filter(isLight).length;
  const normAvg = load.filter(x => !isLight(x)).reduce((a, x) => a + x.p, 0) / load.filter(x => !isLight(x)).length;
  assert.ok(lightAvg < normAvg * 0.75, `light ${lightAvg.toFixed(2)} vs normal ${normAvg.toFixed(2)}`);
});

test("no day is empty or lopsided for a mid-size plan", () => {
  const plan = {surahs: range(67, 114), cycle: 1, light: -1, weekStart: 6, start: START[6]};
  const pages = [];
  for (let i = 0; i < 7; i++) pages.push(itemPages(planItems(plan, addDays(plan.start, i))));
  const mean = pages.reduce((a, b) => a + b, 0) / 7;
  for (const p of pages) assert.ok(p > mean * 0.6 && p < mean * 1.4, `day load ${p.toFixed(2)} vs mean ${mean.toFixed(2)}`);
});

test("an empty plan yields nothing", () => {
  assert.deepEqual(planItems({surahs: [], cycle: 1, light: -1}, "2026-01-03"), []);
  assert.deepEqual(planItems({cycle: 1, light: -1}, "2026-01-03"), []);
});

test("bins are cached per plan shape and return the same object", () => {
  const plan = {surahs: [1, 2, 3], cycle: 1, light: -1, weekStart: 6};
  assert.equal(bins(plan), bins({...plan}));
});
