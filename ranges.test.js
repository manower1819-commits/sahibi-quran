import test from "node:test";
import assert from "node:assert/strict";
import {S} from "../src/surahs.js";
import {planUnits, planHas, planAyat, planItems, planAdd, planCovers, mergeItems, addDays} from "../src/planner.js";
import {juzCoverage} from "../src/juz.js";

const START = {6: "2026-01-03", 0: "2026-01-04", 1: "2026-01-05"};

test("planUnits: whole surahs and ranges, whole wins, bad ranges dropped, overlaps clipped", () => {
  assert.deepEqual(planUnits({surahs: [112, 1]}), [[1, 1, 7], [112, 1, 4]]);
  assert.deepEqual(planUnits({surahs: [], ranges: [[2, 255, 257]]}), [[2, 255, 257]]);
  assert.deepEqual(planUnits({surahs: [2], ranges: [[2, 1, 5]]}), [[2, 1, 286]], "whole surah wins");
  assert.deepEqual(planUnits({surahs: [], ranges: [[1, 5, 99], [1, 0, 3], [1, 4, 2], [200, 1, 2]]}), [], "invalid ranges ignored");
  assert.deepEqual(planUnits({surahs: [], ranges: [[2, 1, 10], [2, 5, 20]]}), [[2, 1, 10], [2, 11, 20]], "overlap clipped");
  assert.deepEqual(planUnits({surahs: undefined, ranges: undefined}), []);
});

test("planHas / planAyat", () => {
  assert.equal(planHas(null), false);
  assert.equal(planHas({surahs: [], ranges: []}), false);
  assert.equal(planHas({surahs: [], ranges: [[1, 1, 2]]}), true);
  assert.equal(planHas({surahs: [1]}), true);
  assert.equal(planAyat({surahs: [1], ranges: [[2, 1, 10]]}), 17);
});

const CASES = [
  ["one range inside Al-Baqarah", {surahs: [], ranges: [[2, 255, 286]]}],
  ["long range split over days", {surahs: [], ranges: [[2, 1, 141]]}],
  ["range + whole surahs", {surahs: [1, 112, 113, 114], ranges: [[2, 255, 257], [18, 1, 10]]}],
  ["juz amma + part of Al-Baqarah", {surahs: Array.from({length: 37}, (_, i) => 78 + i), ranges: [[2, 1, 100]]}],
  ["two ranges of one surah", {surahs: [], ranges: [[3, 1, 20], [3, 100, 130]]}],
];
for (const [name, base] of CASES) for (const cycle of [1, 2, 4]) for (const light of [-1, 5]) for (const ws of [6, 0, 1]) {
  test(`ranges: every ayah exactly once per cycle: ${name}, cycle ${cycle}, light ${light}, ws ${ws}`, () => {
    const plan = Object.assign({cycle, light, weekStart: ws, start: START[ws]}, base);
    const counts = new Map();
    for (let i = 0; i < 7 * cycle; i++) for (const [n, f, t] of planItems(plan, addDays(plan.start, i))) {
      assert.ok(f >= 1 && t <= S[n - 1][2] && f <= t, `bad item ${n}:${f}-${t}`);
      for (let a = f; a <= t; a++) counts.set(n + ":" + a, (counts.get(n + ":" + a) || 0) + 1);
    }
    const expected = new Set();
    for (const [n, f, t] of planUnits(plan)) for (let a = f; a <= t; a++) expected.add(n + ":" + a);
    assert.equal(counts.size, expected.size, "same ayat covered");
    for (const k of expected) assert.equal(counts.get(k), 1, k);
  });
}

test("a plan of only a range shows work on non-light days", () => {
  const plan = {surahs: [], ranges: [[2, 255, 286]], cycle: 1, light: -1, weekStart: 6, start: START[6]};
  const days = Array.from({length: 7}, (_, i) => planItems(plan, addDays(plan.start, i)));
  assert.equal(days.reduce((a, d) => a + d.length, 0) > 0, true);
  assert.equal(days.flat().reduce((a, it) => a + it[2] - it[1] + 1, 0), 32);
});

test("juzCoverage counts ranges by ayah (Ayat al-Kursi 2:255 is in juz 3)", () => {
  const cov = juzCoverage([], [[2, 255, 257]]);
  assert.equal(cov[2].got, 3);
  assert.equal(cov.reduce((a, c) => a + c.got, 0), 3);
  const both = juzCoverage([2], [[2, 1, 5]]);
  assert.equal(both[0].got + both[1].got + both[2].got, 286, "no double counting");
});

test("planCovers", () => {
  const plan = {surahs: [112], ranges: [[2, 255, 257], [2, 260, 262]]};
  assert.equal(planCovers(plan, 112, 1, 4), true);
  assert.equal(planCovers(plan, 2, 255, 257), true);
  assert.equal(planCovers(plan, 2, 256, 257), true);
  assert.equal(planCovers(plan, 2, 255, 258), false);
  assert.equal(planCovers(plan, 2, 257, 260), false, "gap at 258-259");
  assert.equal(planCovers(plan, 1, 1, 1), false);
});

test("planAdd: new range, merge, promote to whole surah, no input mutation", () => {
  const base = {surahs: [1], ranges: [[2, 1, 10]]};
  const snapshot = JSON.stringify(base);
  assert.deepEqual(planAdd(base, 2, 11, 20), {surahs: [1], ranges: [[2, 1, 20]]}, "touching ranges merge");
  assert.deepEqual(planAdd(base, 2, 5, 15), {surahs: [1], ranges: [[2, 1, 15]]}, "overlap merges");
  assert.deepEqual(planAdd(base, 2, 30, 40), {surahs: [1], ranges: [[2, 1, 10], [2, 30, 40]]}, "separate range kept");
  assert.deepEqual(planAdd(base, 3, 1, 5), {surahs: [1], ranges: [[2, 1, 10], [3, 1, 5]]});
  assert.deepEqual(planAdd(base, 1, 1, 3), {surahs: [1], ranges: [[2, 1, 10]]}, "already whole");
  assert.deepEqual(planAdd({surahs: [], ranges: []}, 112, 1, 4), {surahs: [112], ranges: []}, "covers the whole surah -> whole");
  assert.deepEqual(planAdd({surahs: [], ranges: [[114, 1, 3]]}, 114, 4, 6), {surahs: [114], ranges: []}, "completes the surah");
  assert.equal(JSON.stringify(base), snapshot);
  const after = planAdd(base, 2, 11, 20);
  for (const [n, f, t] of [[2, 1, 20], [1, 1, 7]]) assert.equal(planCovers(after, n, f, t), true);
});

test("mergeItems: union without duplicates, sorted, inputs untouched", () => {
  const a = [[112, 1, 4], [2, 1, 10]], b = [[2, 11, 20], [114, 1, 6], [112, 1, 4]];
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  assert.deepEqual(mergeItems(a, b), [[2, 1, 20], [112, 1, 4], [114, 1, 6]]);
  assert.deepEqual(mergeItems([], []), []);
  assert.deepEqual(mergeItems([[2, 1, 5]], [[2, 9, 12]]), [[2, 1, 5], [2, 9, 12]], "gap kept");
  assert.equal(JSON.stringify(a), sa); assert.equal(JSON.stringify(b), sb);
});

test("making up a missed day covers its ayat exactly once", () => {
  const plan = {surahs: Array.from({length: 37}, (_, i) => 78 + i), cycle: 1, light: 5, weekStart: 6, start: START[6]};
  const missed = planItems(plan, addDays(plan.start, 2)), today = planItems(plan, addDays(plan.start, 3));
  const merged = mergeItems(today, missed);
  const seen = new Set(); let total = 0;
  for (const [n, f, t] of merged) for (let a = f; a <= t; a++) { seen.add(n + ":" + a); total++; }
  assert.equal(seen.size, total, "no ayah twice");
  for (const [n, f, t] of missed.concat(today)) for (let a = f; a <= t; a++) assert.ok(seen.has(n + ":" + a));
});
