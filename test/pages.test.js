import test from "node:test";
import assert from "node:assert/strict";
import {S} from "../src/surahs.js";
import {PAGE_START} from "../src/pages.js";
import {AY0, pageOfAyah, pageSegments, itemPageList, planCovers, mergeItems} from "../src/planner.js";
import {pageStrugglers} from "../src/strength.js";

test("pageOfAyah: known mushaf positions", () => {
  assert.equal(pageOfAyah(1, 1), 1);
  assert.equal(pageOfAyah(1, 7), 1);
  assert.equal(pageOfAyah(2, 1), 2);
  assert.equal(pageOfAyah(2, 255), 42, "Ayat al-Kursi is on page 42");
  assert.equal(pageOfAyah(114, 6), 604);
  assert.equal(pageOfAyah(112, 1), 604);
});

test("every ayah belongs to exactly one page and pageSegments agrees with pageOfAyah", () => {
  let total = 0;
  for (let p = 1; p <= 604; p++) {
    const segs = pageSegments(p);
    assert.ok(segs.length >= 1, "page " + p + " is not empty");
    for (const [n, f, t] of segs) { assert.ok(f >= 1 && t <= S[n - 1][2] && f <= t); for (let a = f; a <= t; a++) { assert.equal(pageOfAyah(n, a), p, n + ":" + a); total++; } }
  }
  assert.equal(total, 6236);
});

test("pages are contiguous and cover the whole text", () => {
  assert.equal(PAGE_START[0], 1);
  assert.equal(pageSegments(1)[0][0], 1);
  assert.deepEqual(pageSegments(604), [[112, 1, 4], [113, 1, 5], [114, 1, 6]], "the last page holds surahs 112-114");
  assert.equal(AY0[114], 6236);
});

test("itemPageList", () => {
  assert.deepEqual(itemPageList([[1, 1, 7]]), [1]);
  const mix = itemPageList([[2, 255, 257], [1, 1, 7]]);
  assert.equal(mix[0], 1); assert.ok(mix.includes(42)); assert.deepEqual(mix, [...new Set(mix)].sort((a, b) => a - b), "sorted, no duplicates");
  const l = itemPageList([[2, 1, 286]]); assert.equal(l[0], 2); assert.equal(l[l.length - 1], 49); assert.equal(l.length, 48);
});

test("a page's segments, put back as items, cover exactly that page", () => {
  for (const p of [1, 2, 42, 300, 583, 604]) {
    const segs = pageSegments(p);
    for (const s of segs) assert.equal(planCovers({surahs: [], ranges: segs}, s[0], s[1], s[2]), true);
    assert.deepEqual(mergeItems(segs, segs), segs, "merging a page into itself changes nothing");
  }
});

test("pageStrugglers: needs the same page on at least 2 different days inside the window", () => {
  const days = {"2026-11-01": {pw: [42, 7]}, "2026-11-05": {pw: [42, 42]}, "2026-11-06": {pw: [9]}, "2026-10-01": {pw: [7]}, "2026-11-08": {pw: [9]}};
  const r = pageStrugglers(days, "2026-11-07");
  assert.deepEqual(r, [{page: 42, count: 2, last: "2026-11-05"}], "7 is outside the window (Oct 1), 9 is in the future (Nov 8)");
  assert.deepEqual(pageStrugglers(days, "2026-11-08").map(e => e.page).sort((a, b) => a - b), [9, 42]);
  assert.deepEqual(pageStrugglers({}, "2026-11-07"), []);
  assert.deepEqual(pageStrugglers({"2026-11-07": {pw: [0, 605, 1.5, "x", null]}}, "2026-11-07", {min: 1}), [], "bad page numbers are ignored");
  assert.deepEqual(pageStrugglers({"2026-11-06": {pw: [5]}}, "2026-11-07", {min: 1}), [{page: 5, count: 1, last: "2026-11-06"}]);
});

test("pageStrugglers: a teacher's page marks count too, and one day counts once per page whoever marked it", () => {
  const days = {"2026-11-01": {tpw: [42]}, "2026-11-05": {pw: [42]}, "2026-11-06": {pw: [7], tpw: [7]}};
  assert.deepEqual(pageStrugglers(days, "2026-11-07"), [{page: 42, count: 2, last: "2026-11-05"}], "42: teacher on one day + parent on another; 7: both on the same day = one day only");
  assert.deepEqual(pageStrugglers({"2026-11-05": {tpw: "x"}, "2026-11-06": {tpw: null}}, "2026-11-07", {min: 1}), [], "bad shapes are ignored");
});
