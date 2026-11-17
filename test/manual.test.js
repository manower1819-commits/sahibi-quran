import test from "node:test";
import assert from "node:assert/strict";
import {isManual, manualWs, cleanItems, manualWeek, manualItems, manualPool, cleanManual, manualPlan, manualStamp, manualHas, planItems, planHas,
  giftDays, giftStats, planWeekStart, planStamp, planChanged, ALGO_PAGES, addDays, weekOfWs, planUnits, itemAyat} from "../src/planner.js";
import {cleanKid} from "../src/backup.js";
import {encode, decode, hasNestedArray} from "../src/codec.js";

/* 2026-11-14 is a Saturday (weekday 6); the week 11-14 .. 11-20 starts on Saturday */
const SAT = "2026-11-14", SUN = "2026-11-15", MON = "2026-11-16", TUE = "2026-11-17", FRI = "2026-11-20", NEXT_SAT = "2026-11-21";
/* tpl({6: list, 0: list}) -> seven lists (a day not named is empty); wk({"2026-11-14": {0: list, 1: null}}) -> the entries of weeks of their own */
const tpl = o => [0, 1, 2, 3, 4, 5, 6].map(i => (o && o[i]) || []);
const wk = o => Object.entries(o || {}).map(([w, days]) => ({w, d: [0, 1, 2, 3, 4, 5, 6].map(i => (days && days[i] !== undefined ? days[i] : null))}));
const mk = (t, w, ws = 6) => ({ws, tpl: tpl(t), wk: wk(w)});
const plan = m => ({...manualPlan(m), algo: 0, light: -1, start: SAT});

test("isManual / manualWs", () => {
  assert.equal(isManual(null), false);
  assert.equal(isManual({}), false);
  assert.equal(isManual({manual: []}), false);
  assert.equal(isManual({manual: "x"}), false);
  assert.equal(isManual({manual: {tpl: []}}), true);
  assert.equal(manualWs({ws: 0}), 0);
  assert.equal(manualWs({ws: 6}), 6);
  assert.equal(manualWs({ws: 9}), 6);
  assert.equal(manualWs({ws: "x"}), 6);
  assert.equal(manualWs(null), 6);
});

test("cleanItems keeps real pieces, merges overlaps, orders them, drops the rest", () => {
  assert.deepEqual(cleanItems([[103, 1, 3], [1, 1, 7], [103, 2, 3]]), [[1, 1, 7], [103, 1, 3]]);
  assert.deepEqual(cleanItems([[1, 1, 3], [1, 4, 7]]), [[1, 1, 7]]);               // touching pieces merge
  assert.deepEqual(cleanItems([[1, 1, 8]]), []);                                     // beyond the surah
  assert.deepEqual(cleanItems([[0, 1, 1], [115, 1, 1], [1, 0, 3], [1, 3, 2], ["x", 1, 2]]), []);
  assert.deepEqual(cleanItems([[103, "1", "3"]]), [[103, 1, 3]]);
  assert.deepEqual(cleanItems("x"), []);
  assert.deepEqual(cleanItems(undefined), []);
  assert.deepEqual(cleanItems([null, 5, "a"]), []);
});

test("the weekly template repeats every week", () => {
  const p = plan(mk({6: [[1, 1, 7]], 0: [[112, 1, 4], [113, 1, 5]], 1: [], 5: [[103, 1, 3]]}));
  assert.deepEqual(manualItems(p, SAT), [[1, 1, 7]]);
  assert.deepEqual(manualItems(p, NEXT_SAT), [[1, 1, 7]]);
  assert.deepEqual(manualItems(p, "2027-03-06"), [[1, 1, 7]]);                       // any later Saturday
  assert.deepEqual(manualItems(p, SUN), [[112, 1, 4], [113, 1, 5]]);
  assert.deepEqual(manualItems(p, MON), []);                                         // an empty list is a rest day
  assert.deepEqual(manualItems(p, TUE), []);                                         // so is a weekday nobody chose
  assert.deepEqual(manualItems(p, FRI), [[103, 1, 3]]);
});

test("a week of its own replaces only the days it names; null follows the template", () => {
  const p = plan(mk({6: [[1, 1, 7]], 0: [[112, 1, 4]], 1: [[113, 1, 5]]}, {[SAT]: {0: [[114, 1, 6]], 1: []}}));
  assert.deepEqual(manualItems(p, SAT), [[1, 1, 7]]);                                // null: follows the template
  assert.deepEqual(manualItems(p, SUN), [[114, 1, 6]]);                              // replaced
  assert.deepEqual(manualItems(p, MON), []);                                         // replaced by a rest day
  assert.deepEqual(manualItems(p, NEXT_SAT), [[1, 1, 7]]);                           // the next week is the template again
  assert.deepEqual(manualItems(p, addDays(NEXT_SAT, 1)), [[112, 1, 4]]);
  assert.deepEqual(manualWeek(p.manual, SAT).w, SAT);
  assert.equal(manualWeek(p.manual, NEXT_SAT), undefined);
  assert.equal(manualWeek(null, SAT), undefined);
});

test("the week key follows the week start saved with the plan", () => {
  // a plan whose weeks begin on Sunday: the week of Sat 11-14 begins on Sun 11-08
  const p = plan(mk({6: [[1, 1, 7]]}, {"2026-11-08": {6: [[2, 1, 5]]}}, 0));
  assert.deepEqual(manualItems(p, SAT), [[2, 1, 5]]);
  assert.deepEqual(manualItems(p, NEXT_SAT), [[1, 1, 7]]);
  assert.equal(weekOfWs(SAT, 0), "2026-11-08");
  assert.equal(planWeekStart(p, 6), 0);                                              // and so do the plan's weeks
});

test("manualItems is safe on bad input", () => {
  assert.deepEqual(manualItems({manual: {tpl: tpl({6: [[1, 1, 7]]})}}, "not a date"), []);
  assert.deepEqual(manualItems({manual: {tpl: ["x", "x", "x", "x", "x", "x", "x"], wk: [null, 5, "a", {w: SAT, d: "x"}]}}, SAT), []);
  assert.deepEqual(manualItems({manual: {tpl: {6: [[1, 1, 7]]}}}, SAT), []);          // the old map shape is not read
  assert.deepEqual(manualItems({manual: {}}, SAT), []);
  assert.deepEqual(manualItems({}, SAT), []);
  assert.deepEqual(manualItems(null, SAT), []);
  // a repeated week date: the last entry wins
  const p = {manual: {ws: 6, tpl: tpl({6: [[1, 1, 7]]}), wk: [{w: SAT, d: [null, null, null, null, null, null, [[2, 1, 5]]]}, {w: SAT, d: [null, null, null, null, null, null, [[3, 1, 5]]]}]}};
  assert.deepEqual(manualItems(p, SAT), [[3, 1, 5]]);
});

test("planItems returns the manual day; an automatic plan is untouched", () => {
  const p = plan(mk({6: [[1, 1, 7]]}));
  assert.deepEqual(planItems(p, SAT), [[1, 1, 7]]);
  assert.deepEqual(planItems(p, SUN), []);
  const auto = {surahs: [112, 113, 114], ranges: [], cycle: 1, light: -1, algo: ALGO_PAGES, start: SAT};
  assert.equal(isManual(auto), false);
  assert.ok(planItems(auto, SAT).length > 0);
  // an empty manual plan has nothing to ask anywhere
  assert.deepEqual(planItems({surahs: [], ranges: [], manual: mk()}, SAT), []);
});

test("manualPool lists every surah the plan touches, across the template and the weeks", () => {
  const m = mk({6: [[1, 1, 7]], 0: [[2, 1, 10]]}, {[SAT]: {1: [[112, 1, 4]], 2: [[2, 11, 20]]}});
  const pool = manualPool(m);
  assert.deepEqual(pool.surahs, [1, 112]);
  assert.deepEqual(pool.ranges, [[2, 1, 20]]);                                       // 1-10 and 11-20 touch, so they merge
  assert.deepEqual(manualPool(null), {surahs: [], ranges: []});
  assert.deepEqual(manualPool(mk()), {surahs: [], ranges: []});
  assert.deepEqual(manualPool({tpl: "x", wk: "y"}), {surahs: [], ranges: []});
  // the pool is what the rest of the app reads as the plan's units
  assert.deepEqual(planUnits(plan(m)).map(u => u[0]), [1, 2, 112]);
});

test("cleanManual: seven cleaned lists, valid weeks only, repeated dates collapse, the latest weeks kept", () => {
  const c = cleanManual({ws: 9, tpl: [[[1, 1, 7], [1, 1, 99]], "x", null], wk: [
    {w: "2026-11-14", d: [[[112, 1, 4]], null, "bad", [], undefined]},
    {w: "2026-13-45", d: [[[112, 1, 4]]]}, {w: "nope", d: [[[1, 1, 1]]]}, {w: "2026-11-21", d: [null, null]}, {w: "2026-11-28", d: [[[1, 1, 1]]]},
    {w: "2026-11-28", d: [null, null, null]},                                         // a later entry that follows the template everywhere removes the earlier one
    null, 5]});
  assert.equal(c.ws, 6);
  assert.equal(c.tpl.length, 7);
  assert.deepEqual(c.tpl[0], [[1, 1, 7]]);
  assert.deepEqual(c.tpl.slice(1), [[], [], [], [], [], []]);
  assert.deepEqual(c.wk, [{w: "2026-11-14", d: [[[112, 1, 4]], null, null, [], null, null, null]}]);
  assert.deepEqual(cleanManual(null), {ws: 6, tpl: tpl(), wk: []});
  assert.deepEqual(cleanManual({tpl: {6: [[1, 1, 7]]}}), {ws: 6, tpl: tpl(), wk: []});   // the map shape is not accepted
  // more than the cap: the latest ones stay
  const weeks = []; let d = "2020-01-04"; for (let i = 0; i < 130; i++) { weeks.push({w: d, d: [[[1, 1, 3]], null, null, null, null, null, null]}); d = addDays(d, 7); }
  const big = cleanManual({tpl: [], wk: weeks});
  assert.equal(big.wk.length, 120);
  assert.equal(big.wk[119].w, addDays("2020-01-04", 7 * 129));
  assert.equal(big.wk[0].w, addDays("2020-01-04", 7 * 10));
});

test("manualPlan: the fields saved, with the pool and no distribution", () => {
  const p = manualPlan(mk({6: [[1, 1, 7]], 0: [[112, 1, 4]]}));
  assert.deepEqual(p.surahs, [1, 112]);
  assert.deepEqual(p.ranges, []);
  assert.equal(p.cycle, 1);
  assert.equal(isManual(p), true);
  assert.equal(manualHas({...p}), true);
  assert.equal(manualHas(manualPlan(mk())), false);                                  // nothing chosen anywhere: not a plan
  assert.equal(planHas(manualPlan(mk())), false);
  assert.deepEqual(manualStamp(null, SAT), {light: -1, algo: 0, start: SAT});
  assert.deepEqual(manualStamp({start: "2026-01-03"}, SAT), {light: -1, algo: 0, start: "2026-01-03"});
  assert.deepEqual(manualStamp({start: "junk"}, SAT), {light: -1, algo: 0, start: SAT});
});

test("the gift does not wait for rest days", () => {
  const p = plan(mk({6: [[1, 1, 7]], 0: [[112, 1, 4]], 2: [[113, 1, 5]]}));
  assert.deepEqual(giftDays(p, SAT), [SAT, SUN, TUE]);                               // Sat, Sun and Tue are asked; the other four are rest days
  const stars = {[SAT]: 3, [SUN]: 2};
  let s = giftStats(p, SAT, d => stars[d] || 0);
  assert.equal(s.need, 3); assert.equal(s.done, 2); assert.equal(s.open, false); assert.equal(s.left, 1);
  stars[TUE] = 1;
  s = giftStats(p, SAT, d => stars[d] || 0);
  assert.equal(s.open, true); assert.equal(s.left, 0);
  // stars on a rest day still count as stars and as rated days, but not for the gift
  stars[MON] = 3;
  s = giftStats(p, SAT, d => stars[d] || 0);
  assert.equal(s.rated, 4); assert.equal(s.done, 3); assert.equal(s.tot, 9);
  // a week with no day at all asks for nothing and never opens
  const empty = {...plan(mk({6: []})), surahs: [1]};
  assert.equal(giftStats(empty, SAT, () => 3).open, false);
  // a week of its own changes which days are asked
  const w = plan(mk({6: [[1, 1, 7]]}, {[SAT]: {6: [], 0: [[112, 1, 4]]}}));
  assert.deepEqual(giftDays(w, SAT), [SUN]);
});

test("a flexible plan's weeks begin on the weekday saved with it, never on the day it was saved", () => {
  assert.equal(planWeekStart(plan(mk({6: [[1, 1, 7]]})), 0), 6);
  assert.equal(planWeekStart(plan(mk({6: [[1, 1, 7]]}, {}, 0)), 6), 0);
  assert.equal(planWeekStart(plan(mk({6: [[1, 1, 7]]}, {}, 1)), 6), 1);
  // even if a stray algo 2 + start were stored with it
  assert.equal(planWeekStart({...plan(mk({6: [[1, 1, 7]]})), algo: ALGO_PAGES, start: "2026-11-18"}, 0), 6);
  assert.equal(planWeekStart({...plan(mk({6: [[1, 1, 7]]}, {}, 9)), algo: ALGO_PAGES, start: "2026-11-18"}, 0), 6);
});

test("planStamp: saving the automatic plan over a flexible one distributes it from today", () => {
  const prev = plan(mk({6: [[1, 1, 7]]}));
  const next = {surahs: [112, 113], ranges: [], cycle: 1};
  assert.deepEqual(planStamp(prev, next, "2026-11-18", "2026-11-14"), {light: -1, algo: ALGO_PAGES, start: "2026-11-18"});
  // even when the surahs are the same as the flexible plan's pool
  assert.deepEqual(planStamp(prev, {surahs: prev.surahs, ranges: prev.ranges, cycle: 1}, "2026-11-18", "2026-11-14", true), {light: -1, algo: ALGO_PAGES, start: "2026-11-18"});
  // an automatic previous plan behaves as before
  assert.deepEqual(planStamp(null, next, "2026-11-18", "2026-11-14"), {light: -1, algo: ALGO_PAGES, start: "2026-11-18"});
  assert.equal(planChanged(prev, {surahs: prev.surahs, ranges: prev.ranges, cycle: 1}), false);
});

test("Firestore: a manual plan survives the nested-array codec, and arrays are replaced whole (a removed day cannot linger)", () => {
  const m = cleanManual(mk({6: [[1, 1, 7], [103, 1, 3]], 0: []}, {[SAT]: {1: [[112, 1, 4]]}}));
  const doc = {surahs: [1, 103, 112], manual: m};
  assert.equal(hasNestedArray(doc), true);                                            // as the app holds it
  const wire = encode(doc);
  assert.equal(hasNestedArray(wire), false);                                          // as Firestore gets it
  assert.deepEqual(decode(wire), doc);
  // the plan's own maps are only {ws, tpl, wk}: tpl and wk are arrays, so a merge write replaces them rather than merging key by key
  assert.ok(Array.isArray(m.tpl) && Array.isArray(m.wk));
  assert.ok(m.tpl.every(Array.isArray));
  assert.ok(m.wk.every(e => Array.isArray(e.d) && e.d.length === 7));
});

test("backup: a flexible plan is rebuilt from the file; a bad one falls back to the surahs it came with", () => {
  const raw = {name: "طفل", surahs: [1], manual: {ws: 0, tpl: tpl({6: [[112, 1, 4]], 0: [[113, 1, 5]]}), wk: wk({[SAT]: {1: [[114, 1, 6]]}})}, algo: 2, cycle: 4, light: 3};
  const k = cleanKid(raw);
  assert.equal(isManual(k), true);
  assert.deepEqual(k.surahs, [112, 113, 114]);
  assert.equal(k.cycle, 1); assert.equal(k.light, -1); assert.equal(k.algo, 0);
  assert.equal(k.manual.ws, 0);
  assert.deepEqual(k.manual.wk, [{w: SAT, d: [null, [[114, 1, 6]], null, null, null, null, null]}]);
  // nothing usable: the child keeps its surahs and is not flexible
  const bad = cleanKid({name: "طفل", surahs: [1, 2], manual: {tpl: tpl({6: [[1, 1, 9999]]})}, cycle: 2});
  assert.equal(isManual(bad), false);
  assert.deepEqual(bad.surahs, [1, 2]); assert.equal(bad.cycle, 2);
  assert.equal(isManual(cleanKid({name: "طفل", surahs: [1], manual: "x"})), false);
  assert.equal(isManual(cleanKid({name: "طفل", surahs: [1], manual: [1, 2]})), false);
  assert.equal(isManual(cleanKid({name: "طفل", surahs: [1], manual: {tpl: {6: [[1, 1, 7]]}}})), false);   // the map shape is not accepted
  // a normal child is unchanged
  assert.equal("manual" in cleanKid({name: "طفل", surahs: [1]}), false);
  assert.equal(itemAyat(manualItems(k, SAT)) > 0, true);
});

test("the gift does not wait for days before a flexible plan began; a plan with an old start keeps all its days", () => {
  const m = mk({6: [[1, 1, 7]], 0: [[112, 1, 4]], 1: [[113, 1, 5]], 2: [[114, 1, 6]]});
  // made on Tuesday 11-17: Saturday to Monday came before it
  const fresh = {...manualPlan(m), algo: 0, light: -1, start: TUE};
  assert.deepEqual(giftDays(fresh, SAT), [TUE]);
  assert.equal(giftStats(fresh, SAT, d => (d === TUE ? 2 : 0)).open, true, "the one day since it began is enough");
  // a plan that started long ago asks every day it names
  const old = {...manualPlan(m), algo: 0, light: -1, start: "2026-01-03"};
  assert.deepEqual(giftDays(old, SAT), [SAT, SUN, MON, TUE]);
  // no start, or one that is not a date: nothing is held back
  assert.deepEqual(giftDays({...manualPlan(m)}, SAT), [SAT, SUN, MON, TUE]);
  assert.deepEqual(giftDays({...manualPlan(m), start: "junk"}, SAT), [SAT, SUN, MON, TUE]);
});

test("a day holds at most 120 pieces; the rest are ignored", () => {
  const many = []; for (let n = 1; n <= 114; n++) many.push([n, 1, 1]);
  for (let i = 0; i < 300; i++) many.push([2, 3 + (i % 20), 3 + (i % 20)]);
  assert.ok(cleanItems(many).length <= 120 + 1);
  // a list of 500 junk pieces is cut before anything is done with it
  const junk = Array.from({length: 500}, () => ["x", 1, 2]);
  assert.deepEqual(cleanItems(junk), []);
  const m = mk({6: many});
  assert.ok(manualPool(m).surahs.length <= 120);
});
