import test from "node:test";
import assert from "node:assert/strict";
import {AY0, AW, ALGO_PAGES, bins, planItems, itemPages, addDays, planChanged, planStamp, clampStart, giftDays, giftStats} from "../src/planner.js";
import {cleanKid} from "../src/backup.js";

const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
const START = {6: "2026-01-03", 0: "2026-01-04", 1: "2026-01-05"};
const mk = (o, algo = ALGO_PAGES) => Object.assign({surahs: [], ranges: [], cycle: 1, light: -1, weekStart: 6, start: START[6]}, o, algo ? {algo} : {});
const global = (n, a) => AY0[n - 1] + a;
const flat = days => days.flat().flatMap(([n, f, t]) => range(f, t).map(a => global(n, a)));
const pagesOf = d => d.reduce((s, it) => s + itemPages([it]), 0);

const PLANS = {
  "juz amma": {surahs: range(78, 114)},
  "juz 29+30": {surahs: range(67, 114)},
  "whole mushaf": {surahs: range(1, 114)},
  "mixed surahs and ranges": {surahs: [1, 36, 112], ranges: [[2, 255, 286], [18, 1, 10]]},
  "short surahs": {surahs: [105, 106, 107, 108, 109, 110, 111, 112, 113, 114]},
  "a single short surah": {surahs: [112]},
  "a single ayah": {surahs: [], ranges: [[2, 255, 255]]},
};

for (const [name, base] of Object.entries(PLANS)) for (const cycle of [1, 2, 4, 12]) for (const ws of [6, 0, 1]) {
  test(`algo 2: mushaf order, every ayah exactly once per cycle: ${name}, cycle ${cycle}, ws ${ws}`, () => {
    const plan = mk(Object.assign({cycle, weekStart: ws, start: START[ws]}, base));
    const days = bins(plan);
    assert.equal(days.length, 7 * cycle);
    const seq = flat(days);
    const want = [];
    for (const n of base.surahs) for (let a = 1; a <= AY0[n] - AY0[n - 1]; a++) want.push(global(n, a));
    for (const [n, f, t] of base.ranges || []) for (let a = f; a <= t; a++) want.push(global(n, a));
    want.sort((x, y) => x - y);
    assert.deepEqual(seq, want, "the days, read one after the other, are the plan in mushaf order with nothing missing or repeated");
    // the same through planItems over the whole cycle
    const viaDates = [];
    for (let d = 0; d < 7 * cycle; d++) viaDates.push(planItems(plan, addDays(START[ws], d)));
    assert.deepEqual(flat(viaDates), want);
  });
}

test("algo 2 has no light day: the light setting changes nothing", () => {
  const a = bins(mk({surahs: range(67, 114), cycle: 2, light: 5}));
  const b = bins(mk({surahs: range(67, 114), cycle: 2, light: -1}));
  assert.deepEqual(a, b);
});

test("a wird of 7 pages over 7 days is one page a day", () => {
  const days = bins(mk({surahs: range(97, 114)}));
  const total = days.reduce((s, d) => s + pagesOf(d), 0);
  assert.ok(Math.abs(total - 7) < 0.01, "the plan is 7 pages, got " + total);
  days.forEach((d, i) => assert.ok(Math.abs(pagesOf(d) - 1) < 0.1, `day ${i + 1}: ${pagesOf(d).toFixed(3)} pages`));
});

test("a wird of 20 pages over 7 days is the same share every day", () => {
  const days = bins(mk({surahs: range(80, 114)}));
  const total = days.reduce((s, d) => s + pagesOf(d), 0);
  assert.ok(Math.abs(total - 20) < 0.01, "the plan is 20 pages, got " + total);
  days.forEach((d, i) => assert.ok(Math.abs(pagesOf(d) - 20 / 7) < 0.1, `day ${i + 1}: ${pagesOf(d).toFixed(3)} pages`));
});

for (const [name, base] of Object.entries(PLANS)) for (const cycle of [1, 3, 8]) {
  test(`algo 2: no day is more than one ayah away from the equal share: ${name}, cycle ${cycle}`, () => {
    const plan = mk(Object.assign({cycle}, base));
    const days = bins(plan), N = 7 * cycle;
    const total = days.reduce((s, d) => s + pagesOf(d), 0);
    const maxAyah = Math.max(...flat(days).map(g => AW[g]));
    // the only days allowed to differ more are those beyond the number of ayat (a plan smaller than the cycle)
    const ayat = flat(days).length;
    if (ayat < N) return;
    days.forEach((d, i) => assert.ok(Math.abs(pagesOf(d) - total / N) <= maxAyah + 1e-9, `day ${i + 1}: ${pagesOf(d).toFixed(3)} vs ${(total / N).toFixed(3)}`));
  });
}

test("a plan smaller than the cycle leaves empty days spread through it, not piled at the end", () => {
  const days = bins(mk({surahs: [112], cycle: 4}));
  const used = days.map((d, i) => d.length ? i : -1).filter(i => i >= 0);
  assert.equal(flat(days).length, 4, "the four ayat of al-Ikhlas");
  assert.equal(used.length, 4, "one ayah on each of four different days");
  assert.ok(used[3] - used[0] >= 14, "the days are spread over the cycle: " + used.join(","));
});

test("plans saved before this change carry no algo and are distributed exactly as before", () => {
  const old = bins(mk({surahs: range(78, 114), cycle: 1, light: 5}, 0));
  const neu = bins(mk({surahs: range(78, 114), cycle: 1, light: 5}));
  assert.notDeepEqual(old, neu, "the two distributions differ");
  // the old one still has a light day lighter than the others
  const load = old.map(pagesOf);
  const ws = 6, lightIdx = (5 - ws + 7) % 7;
  assert.ok(load[lightIdx] < Math.min(...load.filter((_, i) => i !== lightIdx)), "light day is lighter");
  // an unknown algo value is treated as the old distribution
  assert.deepEqual(bins(mk({surahs: range(78, 114), light: 5}, 7)), old);
});

test("backup import keeps only the algo marker 2", () => {
  const base = {name: "ali", gender: "m", surahs: [112], cycle: 1, light: -1, weekStart: 6};
  assert.equal(cleanKid(Object.assign({}, base, {algo: 2})).algo, 2);
  assert.ok(!("algo" in cleanKid(Object.assign({}, base, {algo: 3}))));
  assert.ok(!("algo" in cleanKid(Object.assign({}, base, {algo: "2x"}))));
  assert.ok(!("algo" in cleanKid(base)));
});

test("a plan saved in the middle of a week starts at its first ayah that very day", () => {
  const wed = "2026-01-07"; // a Wednesday; the week starts on Saturday
  const plan = mk({surahs: range(78, 114), cycle: 1, start: wed});
  assert.deepEqual(planItems(plan, wed)[0].slice(0, 2), [78, 1], "the day it was saved is day 1 and begins with an-Naba");
  // the next 7 days, then the cycle repeats
  const first = planItems(plan, wed), again = planItems(plan, addDays(wed, 7));
  assert.deepEqual(again, first);
  const seq = [];
  for (let d = 0; d < 7; d++) seq.push(planItems(plan, addDays(wed, d)));
  assert.equal(flat(seq).length, flat(bins(plan)).length, "nothing is missed in the first seven days");
  assert.deepEqual(flat(seq), flat(bins(plan)), "in order, from the first ayah");
});

test("a plan saved in the middle of a week with a longer cycle still starts on day 1", () => {
  const thu = "2026-01-08";
  const plan = mk({surahs: range(67, 114), cycle: 4, start: thu});
  const seq = [];
  for (let d = 0; d < 28; d++) seq.push(planItems(plan, addDays(thu, d)));
  assert.deepEqual(flat(seq), flat(bins(plan)));
  assert.equal(planItems(plan, thu)[0][0], 67);
});

test("old plans are still counted from the first day of a week", () => {
  const sat = START[6], wed = "2026-01-07";
  const old = {surahs: range(78, 114), ranges: [], cycle: 1, light: 5, weekStart: 6, start: sat};
  // Saturday of that week is day 1, Wednesday is day 5: the same items as one week later
  assert.deepEqual(planItems(old, wed), planItems(old, addDays(wed, 7)));
  assert.deepEqual(planItems(old, sat), bins(old)[0].map(c => c.slice()));
  assert.deepEqual(planItems(old, wed), bins(old)[4].map(c => c.slice()));
});

test("two ayat over 84 days land about a quarter and three quarters of the way, not at the very end", () => {
  const days = bins(mk({surahs: [], ranges: [[112, 1, 2]], cycle: 12}));
  const used = days.map((d, i) => d.length ? i + 1 : 0).filter(Boolean);
  assert.equal(used.length, 2);
  assert.ok(Math.abs(used[0] - 21) <= 2, "first at day " + used[0]);
  assert.ok(Math.abs(used[1] - 63) <= 2, "second at day " + used[1]);
});

test("a small plan is symmetric: the last ayah is not always on the last day", () => {
  const days = bins(mk({surahs: [112], cycle: 4}));
  const used = days.map((d, i) => d.length ? i + 1 : 0).filter(Boolean);
  assert.ok(used[used.length - 1] < 28, "the last ayah is on day " + used[used.length - 1] + " of 28");
});

test("planChanged looks at surahs, ranges and cycle only, whatever their order", () => {
  const base = {surahs: [114, 112], ranges: [[2, 5, 9], [1, 1, 3]], cycle: 2, light: 5, start: "2026-01-03"};
  assert.equal(planChanged(base, {surahs: [112, 114], ranges: [[1, 1, 3], [2, 5, 9]], cycle: 2}), false);
  assert.equal(planChanged(base, Object.assign({}, base, {cycle: 3})), true);
  assert.equal(planChanged(base, Object.assign({}, base, {surahs: [112]})), true);
  assert.equal(planChanged(base, Object.assign({}, base, {ranges: [[2, 5, 10], [1, 1, 3]]})), true);
  assert.equal(planChanged(null, base), true);
  assert.equal(planChanged({surahs: [1], cycle: 1}, {surahs: [1], ranges: [], cycle: 1}), false, "a missing ranges list is an empty one");
});

test("saving a plan that did not change keeps an old plan old and keeps its start", () => {
  const old = {surahs: [112], ranges: [], cycle: 1, light: 5, start: "2026-01-03", weekStart: 6};
  const st = planStamp(old, {surahs: [112], ranges: [], cycle: 1}, "2026-02-10", "2026-02-07");
  assert.deepEqual(st, {light: 5, start: "2026-01-03"});
  assert.ok(!("algo" in st), "no undefined algo key (Firestore rejects undefined)");
  for (const v of Object.values(st)) assert.notEqual(v, undefined);
});

test("saving a plan that did not change keeps a new plan new and keeps its start", () => {
  const cur = {surahs: [112], ranges: [], cycle: 1, light: -1, algo: 2, start: "2026-01-07"};
  assert.deepEqual(planStamp(cur, {surahs: [112], ranges: [], cycle: 1}, "2026-02-10", "2026-02-07"), {light: -1, algo: 2, start: "2026-01-07"});
});

test("an old plan without a stored start falls back to the first day of this week; a new one to today", () => {
  assert.deepEqual(planStamp({surahs: [1], cycle: 1, light: 5}, {surahs: [1], cycle: 1}, "2026-02-10", "2026-02-07"), {light: 5, start: "2026-02-07"});
  assert.deepEqual(planStamp({surahs: [1], cycle: 1, algo: 2}, {surahs: [1], cycle: 1}, "2026-02-10", "2026-02-07"), {light: -1, algo: 2, start: "2026-02-10"});
});

test("changing the plan moves it to the new distribution, counted from today", () => {
  const old = {surahs: [112], ranges: [], cycle: 1, light: 5, start: "2026-01-03"};
  assert.deepEqual(planStamp(old, {surahs: [112, 113], ranges: [], cycle: 1}, "2026-02-10", "2026-02-07"), {light: -1, algo: 2, start: "2026-02-10"});
  assert.deepEqual(planStamp(old, {surahs: [112], ranges: [], cycle: 2}, "2026-02-10", "2026-02-07"), {light: -1, algo: 2, start: "2026-02-10"});
  assert.deepEqual(planStamp(null, {surahs: [112], ranges: [], cycle: 1}, "2026-02-10", "2026-02-07"), {light: -1, algo: 2, start: "2026-02-10"});
});

test("adding to a new plan little by little keeps its start, so the cycle goes on", () => {
  const cur = {surahs: [112], ranges: [], cycle: 4, light: -1, algo: 2, start: "2026-01-07"};
  const next = {surahs: [112], ranges: [[2, 255, 255]], cycle: 4};
  assert.deepEqual(planStamp(cur, next, "2026-02-10", "2026-02-07", true), {light: -1, algo: 2, start: "2026-01-07"});
  // the editor (no keepStart) still counts from today when the plan changes
  assert.deepEqual(planStamp(cur, next, "2026-02-10", "2026-02-07"), {light: -1, algo: 2, start: "2026-02-10"});
  // a different cycle length is a new plan even when adding
  assert.deepEqual(planStamp(cur, Object.assign({}, next, {cycle: 2}), "2026-02-10", "2026-02-07", true), {light: -1, algo: 2, start: "2026-02-10"});
});

test("adding to an old plan moves it to the new distribution, counted from today", () => {
  const old = {surahs: [112], ranges: [], cycle: 1, light: 5, start: "2026-01-03"};
  const next = {surahs: [112], ranges: [[2, 255, 255]], cycle: 1};
  assert.deepEqual(planStamp(old, next, "2026-02-10", "2026-02-07", true), {light: -1, algo: 2, start: "2026-02-10"});
});

test("adding one ayah range a day to a long cycle keeps showing new pieces every day", () => {
  // a plan that grows by one range a day: the day index keeps going forward from the original start
  const start = "2026-01-07";
  let plan = mk({surahs: [112], cycle: 4, start}), seen = new Set();
  for (let d = 0; d < 10; d++) {
    const date = addDays(start, d);
    planItems(plan, date).forEach(it => seen.add(it.join(":")));
    const cur = {surahs: plan.surahs, ranges: plan.ranges, cycle: 4, light: -1, algo: 2, start: plan.start};
    const next = {surahs: [112], ranges: [...plan.ranges, [2, 1 + d * 3, 3 + d * 3]], cycle: 4};
    plan = Object.assign({}, plan, next, planStamp(cur, next, addDays(date, 1), addDays(date, 1), true));
    assert.equal(plan.start, start, "start never moves on day " + d);
  }
  assert.ok(seen.size >= 3, "different pieces appeared over the ten days: " + seen.size);
});

test("an in-order plan has no wird on the days before its start", () => {
  const plan = mk({surahs: range(78, 114), cycle: 2, start: "2026-01-07"});
  assert.deepEqual(planItems(plan, "2026-01-06"), []);
  assert.deepEqual(planItems(plan, "2026-01-03"), []);
  assert.deepEqual(planItems(plan, "2025-12-01"), []);
  assert.ok(planItems(plan, "2026-01-07").length > 0, "the start day itself has the first piece");
  assert.equal(planItems(plan, "2026-01-07")[0][0], 78);
});

test("old plans still show something on days before their start (unchanged)", () => {
  const old = {surahs: range(78, 114), ranges: [], cycle: 1, light: 5, weekStart: 6, start: "2026-01-10"};
  // 2026-01-05 is a Monday: day 3 of the week that starts on Saturday 2026-01-03 (one week before the start's week)
  assert.deepEqual(planItems(old, "2026-01-05"), bins(old)[2].map(c => c.slice()));
  assert.ok(planItems(old, "2026-01-05").length > 0);
});

test("an in-order plan with a malformed start or cycle gives empty days instead of crashing", () => {
  const good = mk({surahs: range(78, 114), cycle: 1, start: "2026-01-07"});
  assert.ok(planItems(good, "2026-01-09").length > 0, "the good plan has a wird that day");
  for (const bad of [{start: "not a date"}, {start: 12345}, {start: null}, {start: undefined}, {start: "2026-1-7"}, {start: "2025-1-7"}, {cycle: "x"}, {cycle: 0}, {cycle: -1}, {cycle: 1.5}, {cycle: undefined}]) {
    const plan = Object.assign({}, good, bad);
    assert.deepEqual(planItems(plan, "2026-01-09"), [], JSON.stringify(bad));
  }
  const noStart = Object.assign({}, good); delete noStart.start;
  assert.deepEqual(planItems(noStart, "2026-01-09"), [], "no start at all");
});

test("an in-order plan never keeps a light day, even one stored by an older backup", () => {
  const cur = {surahs: [112], ranges: [], cycle: 1, light: 5, algo: 2, start: "2026-01-07"};
  assert.equal(planStamp(cur, {surahs: [112], ranges: [], cycle: 1}, "2026-02-10", "2026-02-07").light, -1);
  const imported = cleanKid({name: "ali", gender: "m", surahs: [112], cycle: 1, algo: 2});
  assert.equal(imported.light, -1);
  assert.equal(cleanKid({name: "ali", gender: "m", surahs: [112], cycle: 1}).light, 5, "an old kid imported without light keeps the old default");
});

test("a start that has not come yet on this device is counted from today", () => {
  const plan = mk({surahs: range(78, 114), cycle: 1, start: "2026-01-09"});
  const clamped = clampStart(plan, "2026-01-07");
  assert.equal(clamped.start, "2026-01-07");
  assert.equal(plan.start, "2026-01-09", "the stored plan is not modified");
  // today shows the first piece, not an empty day, and so does the day after
  assert.deepEqual(planItems(clamped, "2026-01-07"), bins(plan)[0]);
  assert.deepEqual(planItems(clamped, "2026-01-08"), bins(plan)[1]);
  assert.deepEqual(planItems(plan, "2026-01-07"), [], "without the clamp the day would be empty");
});

test("clampStart leaves a start that has come, a legacy plan and a malformed start untouched", () => {
  const plan = mk({surahs: [112], start: "2026-01-07"});
  assert.equal(clampStart(plan, "2026-01-07"), plan, "the start day itself");
  assert.equal(clampStart(plan, "2026-02-01"), plan, "a start in the past");
  const old = {surahs: [112], ranges: [], cycle: 1, light: 5, weekStart: 6, start: "2099-01-01"};
  assert.equal(clampStart(old, "2026-01-07"), old, "a legacy plan is never touched");
  for (const start of ["zzzz", "2099-1-1", 20990101, null, undefined]) {
    const bad = mk({surahs: [112], start});
    assert.equal(clampStart(bad, "2026-01-07"), bad, String(start));
  }
  for (const bad of ["not a date", "1", "", null, undefined]) assert.equal(clampStart(plan, bad), plan, "a bad today is ignored: " + String(bad));
  assert.equal(clampStart(null, "2026-01-07"), null);
  assert.equal(clampStart(undefined, "2026-01-07"), undefined);
});

test("the bins cache does not mix plans that differ only in what the distribution ignores", () => {
  const a = mk({surahs: range(78, 114), cycle: 1, light: -1, weekStart: 6});
  const b = mk({surahs: range(78, 114), cycle: 1, light: 3, weekStart: 1});
  assert.deepEqual(bins(a), bins(b), "the in-order distribution ignores the light day and the week start");
  const oldA = {surahs: range(78, 114), ranges: [], cycle: 1, light: 5, weekStart: 6};
  const oldB = Object.assign({}, oldA, {light: 2});
  assert.notDeepEqual(bins(oldA), bins(oldB), "the old distribution still depends on the light day");
});

test("the weekly gift asks for every day of an old plan's week", () => {
  const old = {surahs: [112], ranges: [], cycle: 1, light: 5, weekStart: 6, start: "2026-01-07"};
  assert.equal(giftDays(old, "2026-01-03").length, 7, "even when the old plan starts inside the week");
  assert.equal(giftDays(null, "2026-01-03").length, 7);
  assert.equal(giftDays(undefined, "2026-01-03").length, 7);
});

test("the first gift of an in-order plan asks only for the days from its start", () => {
  const w = "2026-01-03"; // Saturday
  const plan = mk({surahs: [112], start: "2026-01-07"}); // Wednesday
  assert.deepEqual(giftDays(plan, w), ["2026-01-07", "2026-01-08", "2026-01-09"]);
  assert.equal(giftDays(mk({surahs: [112], start: "2026-01-03"}), w).length, 7, "starting on the first day of the week");
  assert.equal(giftDays(mk({surahs: [112], start: "2025-12-20"}), w).length, 7, "a plan that started in an earlier week");
  assert.equal(giftDays(mk({surahs: [112], start: "2026-01-09"}), w).length, 1, "starting on the last day of the week");
  assert.deepEqual(giftDays(mk({surahs: [112], start: "2026-01-10"}), w), [], "a week wholly before the start has no gift");
  // the next week is a full week
  assert.equal(giftDays(plan, "2026-01-10").length, 7);
});

test("giftDays ignores a malformed start of an in-order plan (all seven days)", () => {
  for (const start of ["zzzz", "2026-1-7", 20260107, null, undefined]) {
    assert.equal(giftDays(mk({surahs: [112], start}), "2026-01-03").length, 7, String(start));
  }
});

test("giftStats: an old plan counts all seven days for the gift and for the reports alike", () => {
  const old = {surahs: [112], ranges: [], cycle: 1, light: 5, weekStart: 6, start: "2026-01-07"};
  const w = "2026-01-03";
  const stars = {"2026-01-03": 3, "2026-01-05": 2, "2026-01-09": 1};
  const s = giftStats(old, w, d => stars[d]);
  assert.deepEqual(s, {tot: 6, rated: 3, done: 3, need: 7, open: false, left: 4});
  const all = giftStats(old, w, () => 3);
  assert.deepEqual([all.rated, all.done, all.need, all.open, all.left], [7, 7, 7, true, 0]);
});

test("giftStats: the first gift of an in-order plan needs only the days from its start, the reports still count every rated day", () => {
  const w = "2026-01-03";
  const plan = mk({surahs: [112], start: "2026-01-07"}); // Wednesday: Wed, Thu, Fri are asked for
  // a star on a day before the start (from an older plan) counts as rated, not for the gift
  const before = giftStats(plan, w, d => ({"2026-01-04": 3, "2026-01-08": 2}[d]));
  assert.deepEqual(before, {tot: 5, rated: 2, done: 1, need: 3, open: false, left: 2});
  const full = giftStats(plan, w, d => (d >= "2026-01-07" ? 3 : 0));
  assert.deepEqual([full.rated, full.done, full.need, full.open, full.left], [3, 3, 3, true, 0]);
  // all seven days rated: the gift is open and the rated count is seven (the teen "full week" badge keeps working)
  const seven = giftStats(plan, w, () => 3);
  assert.deepEqual([seven.rated, seven.done, seven.need, seven.open], [7, 3, 3, true]);
});

test("giftStats: a week wholly before the start has no gift, even with stars", () => {
  const plan = mk({surahs: [112], start: "2026-01-20"});
  const s = giftStats(plan, "2026-01-03", () => 3);
  assert.deepEqual([s.need, s.done, s.open, s.left, s.rated], [0, 0, false, 0, 7]);
});

test("giftStats: bad star values count as no star", () => {
  const plan = mk({surahs: [112], start: "2026-01-03"});
  const s = giftStats(plan, "2026-01-03", d => ({"2026-01-03": "x", "2026-01-04": null, "2026-01-05": undefined, "2026-01-06": -1}[d]));
  assert.deepEqual([s.tot, s.rated, s.done], [-1, 0, 0]);
});
