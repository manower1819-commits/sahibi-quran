import test from "node:test";
import assert from "node:assert/strict";
import {makeBackup, parseBackup, cleanKid, cleanDay, BACKUP_APP, HOME_DAY_KEYS} from "../src/backup.js";

const KID = {id: "k1", name: "سارة", gender: "f", theme: "space", surahs: [112, 113], ranges: [[2, 255, 257]], cycle: 2, light: 5, weekStart: 6, start: "2026-11-07", created: 1700000000000,
  parentUid: "SECRET-UID", tokens: ["PUSH-TOKEN"], halaqaId: "h1", teacherUid: "t1", age: 7, look: 2, skin: 3};
const DAYS = {k1: {"2026-11-07": {items: [[112, 1, 4]], stars: 3, weak: [112], extra: "x", nS: 67, nF: 1, nT: 10, notes: "n", tStars: 2, tNotes: "teacher", tWeak: [112], evil: "x"}, "bad-date": {stars: 1}}};

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
  assert.equal(k.theme.length, 20); assert.ok(!("created" in k)); assert.ok(!("start" in k), "impossible date dropped");
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
