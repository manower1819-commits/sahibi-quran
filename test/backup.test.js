import test from "node:test";
import assert from "node:assert/strict";
import {makeBackup, parseBackup, cleanKid, cleanDay, BACKUP_APP, HOME_DAY_KEYS, MAX_TOTAL_DAYS} from "../src/backup.js";

const KID = {id: "k1", name: "سارة", gender: "f", theme: "space", surahs: [112, 113], ranges: [[2, 255, 257]], cycle: 2, light: 5, weekStart: 6, start: "2026-11-07", created: 1700000000000,
  parentUid: "SECRET-UID", tokens: ["PUSH-TOKEN"], halaqaId: "h1", teacherUid: "t1", age: 7, look: 2, skin: 3};
const DAYS = {k1: {"2026-11-07": {items: [[112, 1, 4]], stars: 3, weak: [112], pw: [42], extra: "x", nS: 67, nF: 1, nT: 10, notes: "n", tStars: 2, tNotes: "teacher", tWeak: [112], evil: "x"}, "bad-date": {stars: 1}}};

test("export keeps what the family owns and nothing private", () => {
  const b = makeBackup([KID], DAYS, 0);
  assert.equal(b.app, BACKUP_APP);
  const text = JSON.stringify(b);
  for (const secret of ["SECRET-UID", "PUSH-TOKEN", "parentUid", "tokens", "teacherUid", "halaqaId", "teacher", "tStars", "tWeak", "tNotes", "evil", "bad-date"]) assert.ok(!text.includes(secret), "leaked: " + secret);
  assert.deepEqual(Object.keys(b.kids[0].days["2026-11-07"]).sort(), HOME_DAY_KEYS.slice().sort());
  assert.deepEqual(b.kids[0].ranges, [[2, 255, 257]]);
});

test("round trip: export then import gives back the same kid and days", () => {
  const b = makeBackup([KID], DAYS, 0), r = parseBackup(JSON.stringify(b));
  assert.equal(r.ok, true);
  assert.equal(r.kids.length, 1);
  const {kid, days} = r.kids[0];
  assert.equal(kid.name, "سارة"); assert.deepEqual(kid.surahs, [112, 113]); assert.deepEqual(kid.ranges, [[2, 255, 257]]);
  assert.equal(kid.cycle, 2); assert.equal(kid.start, "2026-11-07"); assert.equal(kid.age, 7);
  assert.deepEqual(Object.keys(days), ["2026-11-07"]);
  assert.equal(days["2026-11-07"].stars, 3);
  assert.deepEqual(days["2026-11-07"].items, [[112, 1, 4]]);
});

test("import never lets a file smuggle in ownership, tokens or teacher fields", () => {
  const evil = {app: BACKUP_APP, version: 1, kids: [Object.assign({}, KID, {days: DAYS.k1})]};
  const {kid, days} = parseBackup(JSON.stringify(evil)).kids[0];
  for (const k of ["id", "parentUid", "tokens", "halaqaId", "teacherUid"]) assert.ok(!(k in kid), k);
  const d = days["2026-11-07"];
  for (const k of ["tStars", "tWeak", "tNotes", "evil"]) assert.ok(!(k in d), k);
});

test("import rejects things that are not a backup", () => {
  assert.deepEqual(parseBackup("not json"), {ok: false, err: "bad"});
  assert.equal(parseBackup("{}").ok, false);
  assert.equal(parseBackup(JSON.stringify({app: "other", version: 1, kids: [KID]})).ok, false);
  assert.equal(parseBackup(JSON.stringify({app: BACKUP_APP, version: 99, kids: [KID]})).ok, false, "future version");
  assert.equal(parseBackup(JSON.stringify({app: BACKUP_APP, version: 1, kids: []})).ok, false);
  assert.equal(parseBackup(JSON.stringify({app: BACKUP_APP, version: 1, kids: [{name: ""}]})).ok, false);
  assert.equal(parseBackup("x".repeat(6 * 1024 * 1024)).err, "big");
  assert.equal(parseBackup(null).ok, false);
});

test("cleanKid / cleanDay sanitise bad values", () => {
  const k = cleanKid({name: "  علي  ", gender: "zzz", surahs: [0, 1, 1, 115, "5", "x"], ranges: [[2, 5, 3], [2, 1, 300], [2, 1, 3], "x"], cycle: 5, light: 9, weekStart: 3, mode: "hacker", age: 500, theme: "t".repeat(50), created: "now", start: "2026-02-30"});
  assert.equal(k.name, "علي"); assert.equal(k.gender, "m"); assert.deepEqual(k.surahs, [1, 5]); assert.deepEqual(k.ranges, [[2, 1, 3]]);
  assert.equal(k.cycle, 1); assert.equal(k.light, 5); assert.equal(k.weekStart, 6); assert.ok(!("mode" in k)); assert.ok(!("age" in k));
  assert.equal(k.theme, "space", "an unknown theme name falls back to space"); assert.ok(!("created" in k)); assert.ok(!("start" in k), "impossible date dropped");
  assert.equal(cleanKid(null), null); assert.equal(cleanKid({name: ""}), null);
  assert.equal(cleanDay({stars: 7}), null);
  assert.deepEqual(cleanDay({stars: 2, nS: "", nF: "", nT: ""}), {stars: 2, nS: "", nF: "", nT: ""});
  assert.deepEqual(cleanDay({items: [[1, 1, 7], [1, 1, 99], "x"], weak: [1, 1, 200]}), {items: [[1, 1, 7]], weak: [1]});
  assert.equal(cleanDay("x"), null);
});

test("a child with no plan of their own (class plan) is still kept with their days", () => {
  const b = makeBackup([{id: "k9", name: "ليلى", surahs: [], cycle: 1}], {k9: {"2026-11-01": {stars: 2}}}, 0);
  assert.equal(b.kids.length, 1);
  assert.equal(b.kids[0].days["2026-11-01"].stars, 2);
});

test("import keeps only theme and palette names the app really has", () => {
  const imp = o => cleanKid(Object.assign({name: "س", surahs: [1]}, o));
  assert.equal(imp({theme: "ocean"}).theme, "ocean");
  assert.equal(imp({palette: "night"}).palette, "night");
  // names that exist on every plain object must not pass for a theme or a palette
  for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "nope", "", 5, null, {}, ["space"]]) {
    assert.equal(imp({theme: bad}).theme, "space", "theme " + String(bad));
    assert.equal("palette" in imp({palette: bad}), false, "palette " + String(bad));
  }
  assert.equal("palette" in imp({}), false);
});

test("a theme or palette name stored before this check cannot reach Object's own members", async () => {
  const {THEMES, THEME_ORDER} = await import("../src/themes.js");
  const {PALETTES, PALETTE_ORDER} = await import("../src/palettes.js");
  for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(THEMES[bad], undefined, "THEMES." + bad);
    assert.equal(PALETTES[bad], undefined, "PALETTES." + bad);
  }
  for (const n of THEME_ORDER) assert.ok(THEMES[n] && THEMES[n].c, "theme " + n);
  for (const n of PALETTE_ORDER) assert.ok(PALETTES[n] && PALETTES[n].v, "palette " + n);
});

/* ---------- limits on what a file can make the app write or count ---------- */
const file = kids => JSON.stringify({app: BACKUP_APP, version: 1, kids});
const kidWith = (name, days) => ({name, surahs: [1], days});
const dateAfter = n => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };

test("import: records outside 2000-01-01 .. a year from now are dropped, so they cannot stretch the history back to the year 100", () => {
  const days = {"0100-01-01": {stars: 1}, "1999-12-31": {stars: 1}, "2000-01-01": {stars: 2}, [dateAfter(300)]: {stars: 3}, [dateAfter(400)]: {stars: 1}, "9999-12-31": {stars: 1}, "2026-02-30": {stars: 1}};
  const r = parseBackup(file([kidWith("س", days)]));
  assert.deepEqual(Object.keys(r.kids[0].days).sort(), ["2000-01-01", dateAfter(300)].sort());
  assert.equal(cleanKid({name: "س", start: "0100-01-01"}).start, undefined, "a plan start is bounded the same way");
  assert.equal(cleanKid({name: "س", start: "2026-11-07"}).start, "2026-11-07");
  const out = makeBackup([{id: "k", name: "س", surahs: [1]}], {k: {"0100-01-01": {stars: 1}, "2026-11-07": {stars: 2}}}, 0);
  assert.deepEqual(Object.keys(out.kids[0].days), ["2026-11-07"], "export leaves such records out too");
});

test("import: lists are capped, and a list with nothing usable is left out instead of becoming an empty day", () => {
  const many = Array.from({length: 500}, (_, i) => [1 + (i % 100), 1, 1]);
  assert.ok(cleanKid({name: "س", ranges: many.map(r => [2, 1, 2])}).ranges.length <= 200);
  assert.equal(cleanDay({stars: 1, items: many}).items.length, 200);
  assert.deepEqual(cleanDay({stars: 1, items: []}).items, [], "an empty list stays empty (a day with no wird)");
  assert.equal("items" in cleanDay({stars: 1, items: ["x", [999, 1, 1], null]}), false, "nothing usable: the day falls back to the plan");
  assert.deepEqual(cleanDay({stars: 1, items: ["x", [112, 1, 4]]}).items, [[112, 1, 4]], "the usable part is kept");
});

test("import: more than 30 children keeps the first 30 and says how many were left out; it no longer refuses the file", () => {
  const kids = Array.from({length: 35}, (_, i) => kidWith("طفل" + i, {}));
  const r = parseBackup(file(kids));
  assert.equal(r.ok, true); assert.equal(r.kids.length, 30); assert.equal(r.dropped, 5);
});

test("import: a child with more than 4000 records keeps the newest 4000 and reports the rest", () => {
  const days = {};
  for (let i = 0; i < 4100; i++) { const d = new Date(Date.UTC(2010, 0, 1) + i * 864e5).toISOString().slice(0, 10); days[d] = {stars: 1}; }
  const r = parseBackup(file([kidWith("س", days)]));
  const keys = Object.keys(r.kids[0].days).sort();
  assert.equal(keys.length, 4000); assert.equal(r.droppedDays, 100);
  assert.equal(keys[keys.length - 1], new Date(Date.UTC(2010, 0, 1) + 4099 * 864e5).toISOString().slice(0, 10), "the newest record is kept");
  assert.equal(r.kids[0].days[new Date(Date.UTC(2010, 0, 1)).toISOString().slice(0, 10)], undefined, "the oldest is the one left out");
});

test("import: a file with more than 8000 records in all is refused as too big", () => {
  const mk = () => { const days = {}; for (let i = 0; i < 3000; i++) days[new Date(Date.UTC(2010, 0, 1) + i * 864e5).toISOString().slice(0, 10)] = {stars: 1}; return days; };
  const r = parseBackup(file([kidWith("أ", mk()), kidWith("ب", mk()), kidWith("ج", mk())]));
  assert.deepEqual([r.ok, r.err], [false, "big"]);
  assert.equal(parseBackup(file([kidWith("أ", mk()), kidWith("ب", mk())])).ok, true, "two such children are fine");
});

test("import: odd shapes of the days object are ignored", () => {
  assert.deepEqual(parseBackup(file([{name: "س", surahs: [1], days: ["2026-11-07"]}])).kids[0].days, {});
  const r = parseBackup('{"app":"sahibi-quran","version":1,"kids":[{"name":"س","surahs":[1],"days":{"__proto__":{"stars":3},"2026-11-07":{"stars":1}}}]}');
  assert.deepEqual(Object.keys(r.kids[0].days), ["2026-11-07"]);
  assert.equal(({}).stars, undefined, "nothing leaked onto Object.prototype");
});

test("export keeps the newest 4000 records of a child, so what is saved is what a restore will keep", () => {
  const days = {};
  for (let i = 0; i < 4100; i++) days[new Date(Date.UTC(2010, 0, 1) + i * 864e5).toISOString().slice(0, 10)] = {stars: 1};
  const out = makeBackup([{id: "k", name: "س", surahs: [1]}], {k: days}, 0);
  const keys = Object.keys(out.kids[0].days).sort();
  assert.equal(keys.length, 4000);
  assert.equal(keys[0], new Date(Date.UTC(2010, 0, 1) + 100 * 864e5).toISOString().slice(0, 10), "the oldest 100 are the ones left out");
  const back = parseBackup(JSON.stringify(out));
  assert.equal(back.ok, true); assert.equal(back.droppedDays, 0, "and the restore drops nothing more");
  assert.equal(MAX_TOTAL_DAYS, 8000);
});
