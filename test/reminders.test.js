/* The reminder job against an in-memory Firestore: one account with bad values must not stop everyone else's reminders.
   (jobs/reminders.js runs on GitHub Actions; firebase-admin is replaced here, so no network and no service account.) */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0); // a Tuesday, 12:00 UTC

function makeAdmin(store) {
  const ID = {id: true}, sent = [];
  const fits = (doc, [f, op, v]) => {
    if (f === ID) return op === ">=" ? doc.id >= v : doc.id <= v;
    const x = doc.data[f];
    if (op === "!=") return x !== undefined && x !== v;
    if (op === "==") return x === v;
    if (op === "array-contains") return Array.isArray(x) && x.includes(v);
    throw new Error("op " + op);
  };
  const docRef = (col, id) => ({
    id,
    get: async () => ({id, exists: id in store[col], data: () => store[col][id], ref: docRef(col, id)}),
    update: async o => { Object.assign(store[col][id], o); },
    delete: async () => { if (store.__failDelete && store.__failDelete.has(id)) throw new Error("denied"); delete store[col][id]; },
    collection: sub => colRef("days", id + "/", sub),
  });
  const colRef = (col, prefix = "", _sub) => {
    const filters = [];
    const q = {
      where(f, op, v) { filters.push([f, op, v]); return q; },
      limit() { return q; },
      doc: id => docRef(col, prefix + id),
      async get() {
        const docs = Object.keys(store[col] || {}).filter(id => id.startsWith(prefix))
          .map(id => ({id: id.slice(prefix.length), data: store[col][id], rawId: id}))
          .filter(d => filters.every(fl => fits(d, fl)))
          .map(d => ({id: d.id, data: () => d.data, ref: docRef(col, d.rawId)}));
        return {docs, empty: !docs.length, size: docs.length};
      },
    };
    return q;
  };
  const firestore = () => ({collection: n => colRef(n)});
  firestore.FieldValue = {arrayRemove: x => ({arrayRemove: x})};
  firestore.FieldPath = {documentId: () => ID};
  return {
    sent,
    admin: {
      initializeApp() {}, credential: {cert: () => ({})}, firestore,
      messaging: () => ({sendEach: async msgs => { msgs.forEach(m => sent.push(m.token)); return {responses: msgs.map(() => ({success: true})), successCount: msgs.length}; }}),
    },
  };
}

async function runJob(store) {
  const {admin, sent} = makeAdmin(store);
  const load = Module._load, now = Date.now, log = console.log, err = console.error;
  const logs = [];
  Module._load = function (req, ...rest) { return req === "firebase-admin" ? admin : load.call(this, req, ...rest); };
  Date.now = () => NOW; console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
  process.env.FIREBASE_SERVICE_ACCOUNT = "{}";
  try {
    const path = Module.createRequire(import.meta.url).resolve("../jobs/reminders.js");
    delete Module.createRequire(import.meta.url).cache[path];
    await Module.createRequire(import.meta.url)("../jobs/reminders.js").main();
  } finally { Module._load = load; Date.now = now; console.log = log; console.error = err; }
  return {sent, logs};
}

const DUE = "11:30"; // 30 minutes before the fake "now"

test("an account with bad reminder values is skipped; the others still get their reminder", async () => {
  const store = {
    users: {
      bad1: {remindAt: DUE, offset: "x", tokens: ["T-BAD1"]},
      bad2: {remindAt: DUE, offset: 0, tokens: "not-a-list"},
      bad3: {remindAt: DUE, offset: 1e15, tokens: ["T-BAD3"]},
      good: {remindAt: DUE, offset: 0, tokens: ["T-GOOD"], lang: "ar"},
      weird: {remindAt: DUE, offset: 0, tokens: ["T-WEIRD"], lang: "constructor"}, // a language name that exists on every plain object
    },
    kids: {k1: {name: "سارة", parentUid: "good"}, k2: {name: "علي", parentUid: "bad2"}, k3: {name: "نور", parentUid: "weird"}},
    days: {}, halaqas: {}, reminders: {},
  };
  const {sent, logs} = await runJob(store);
  assert.deepEqual(sent, ["T-GOOD", "T-WEIRD"], "tokens that are not a list count as none; an odd language falls back to Arabic");
  assert.equal(store.users.good.lastRemind, "2026-11-10");
  assert.equal(store.users.weird.lastRemind, "2026-11-10");
  assert.ok(!("lastRemind" in store.users.bad1), "a skipped account is not marked as reminded");
  assert.ok(!("lastRemind" in store.users.bad3));
  assert.ok(logs.some(l => /^skipped parent reminder bad1 RangeError$/.test(l)), "the skip itself is logged, by name and id");
  assert.ok(logs.some(l => /^skipped parent reminder bad3 RangeError$/.test(l)));
  assert.ok(!logs.some(l => /^skipped parent reminder (bad2|good|weird)/.test(l)), "only the broken accounts are skipped");
  const text = logs.join("\n");
  for (const secret of ["T-BAD1", "T-GOOD", "not-a-list"]) assert.ok(!text.includes(secret), "no token or value in the log: " + secret);
});

test("a bad entry in the teacher queue does not stop the rest of the queue", async () => {
  const store = {
    users: {t: {tokens: ["T-T"]}, p1: {tokens: ["T-P1"], lang: "ar"}, p2: {tokens: ["T-P2"], lang: "ar"}},
    kids: {
      a: {name: "أ", parentUid: "p1", teacherUid: "t"},
      b: {name: "ب", parentUid: "p2", teacherUid: "t", parentUids: 5}, // not a list: spreading it throws
      c: {name: "ج", parentUid: "p2", teacherUid: "t"},
    },
    days: {}, halaqas: {},
    reminders: {
      r1: {kidId: "a", teacherUid: "t", kind: "remind", at: NOW - 1000},
      r2: {kidId: "b", teacherUid: "t", kind: "remind", at: NOW - 1000},
      r3: {kidId: "c", teacherUid: "t", kind: "remind", at: NOW - 1000},
    },
  };
  const {sent} = await runJob(store);
  assert.ok(sent.includes("T-P1") && sent.includes("T-P2"), "entries before and after the bad one are delivered: " + sent);
  assert.deepEqual(Object.keys(store.reminders), [], "every queue entry is removed, good or bad");
});

test("a queue entry that cannot be deleted does not stop the rest of the queue or the later sections", async () => {
  const store = {
    users: {t: {tokens: ["T-T"]}, p1: {tokens: ["T-P1"], lang: "ar"}, p2: {tokens: ["T-P2"], lang: "ar"}},
    kids: {a: {name: "أ", parentUid: "p1", teacherUid: "t"}, c: {name: "ج", parentUid: "p2", teacherUid: "t"}},
    days: {}, halaqas: {},
    reminders: {
      r1: {kidId: "a", teacherUid: "t", kind: "remind", at: NOW - 1000},
      r2: {kidId: "c", teacherUid: "t", kind: "remind", at: NOW - 1000},
    },
    __failDelete: new Set(["r1"]),
  };
  const {sent, logs} = await runJob(store);
  assert.deepEqual(sent.sort(), ["T-P1", "T-P2"]);
  assert.deepEqual(Object.keys(store.reminders), ["r1"], "only the entry whose delete failed is left");
  assert.ok(logs.some(l => /^skipped queue delete r1 /.test(l)));
});

test("a teacher account with bad values is skipped; the other teacher still gets the class summary", async () => {
  const store = {
    users: {
      tbad: {summaryAt: DUE, offset: "x", tokens: ["T-TBAD"]},
      tgood: {summaryAt: DUE, offset: 0, tokens: ["T-TGOOD"], lang: "ar"},
    },
    halaqas: {h1: {name: "حلقة", teacherUid: "tgood"}},
    kids: {k1: {name: "سارة", teacherUid: "tgood", halaqaId: "h1"}},
    days: {}, reminders: {},
  };
  const {sent, logs} = await runJob(store);
  assert.deepEqual(sent, ["T-TGOOD"]);
  assert.equal(store.users.tgood.lastSummary, "2026-11-10");
  assert.ok(!("lastSummary" in store.users.tbad));
  assert.ok(logs.some(l => /^skipped teacher summary tbad RangeError$/.test(l)));
});
