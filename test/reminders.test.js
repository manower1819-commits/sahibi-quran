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
    update: async o => { for (const [k, v] of Object.entries(o)) store[col][id][k] = (v && v.arrayRemove !== undefined) ? (store[col][id][k] || []).filter(x => x !== v.arrayRemove) : v; },
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
      // like firebase-admin: sendEach throws only when the connection itself fails; a failed message is a result {success:false, error:{code}}, not an exception
      messaging: () => ({sendEach: async msgs => {
        if (store.__sendDown) throw new Error("messaging connection failed");
        store.__calls = (store.__calls || 0) + 1;
        const responses = msgs.map(m => {
          if (store.__failCall === store.__calls) return {success: false, error: {code: "messaging/server-unavailable"}};
          if (store.__codeByToken && store.__codeByToken[m.token]) return {success: false, error: {code: store.__codeByToken[m.token]}};
          if (store.__sendFailAll) return {success: false, error: {code: store.__sendFailAll}};
          if (store.__failTokenResp === m.token) return {success: false, error: {code: "messaging/server-unavailable"}};
          sent.push(m.token); return {success: true};
        });
        return {responses, successCount: responses.filter(r => r.success).length, failureCount: responses.filter(r => !r.success).length};
      }}),
    },
  };
}

async function runJob(store) {
  const {admin, sent} = makeAdmin(store);
  const load = Module._load, now = Date.now, log = console.log, err = console.error;
  const logs = [];
  let result, shouldFail;
  Module._load = function (req, ...rest) { return req === "firebase-admin" ? admin : load.call(this, req, ...rest); };
  Date.now = () => NOW; console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
  process.env.FIREBASE_SERVICE_ACCOUNT = "{}";
  try {
    const path = Module.createRequire(import.meta.url).resolve("../jobs/reminders.js");
    delete Module.createRequire(import.meta.url).cache[path];
    const mod = Module.createRequire(import.meta.url)("../jobs/reminders.js");
    shouldFail = mod.shouldFail; result = await mod.main();
  } finally { Module._load = load; Date.now = now; console.log = log; console.error = err; }
  return {sent, logs, result, shouldFail};
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

const twoParents = extra => Object.assign({
  users: {a: {remindAt: DUE, offset: 0, tokens: ["T-A"]}, b: {remindAt: DUE, offset: 0, tokens: ["T-B"]}},
  kids: {k1: {name: "أ", parentUid: "a"}, k2: {name: "ب", parentUid: "b"}}, days: {}, halaqas: {}, reminders: {},
}, extra);

test("exit code: a broken account alone is not a failed run", async () => {
  const r = await runJob({users: {bad: {remindAt: DUE, offset: "x", tokens: ["T"]}}, kids: {}, days: {}, halaqas: {}, reminders: {}});
  assert.equal(r.result.skipped, 2, "skipped once for the daily reminder and once for the weekly report");
  assert.equal(r.result.attempts, 0, "nothing was sent");
  assert.equal(r.shouldFail(r.result), false);
});

test("exit code: when the messaging service rejects every message, the run is red and nobody is marked as reminded", async () => {
  for (const down of [{__sendFailAll: "messaging/server-unavailable"}, {__sendFailAll: "messaging/third-party-auth-error"}, {__sendDown: true}]) {
    const store = twoParents(down);
    const r = await runJob(store);
    assert.deepEqual([r.result.attempts, r.result.failed], [2, 2], JSON.stringify(down));
    assert.equal(r.shouldFail(r.result), true, JSON.stringify(down));
    assert.ok(!("lastRemind" in store.users.a) && !("lastRemind" in store.users.b), "not stamped, so the next run tries again: " + JSON.stringify(down));
    assert.ok(r.logs.some(l => /^skipped parent reminder a /.test(l)));
  }
});

test("exit code: dead tokens are not an outage; they are removed and the run stays green", async () => {
  const store = twoParents({__sendFailAll: "messaging/registration-token-not-registered"});
  const r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [2, 0]);
  assert.equal(r.shouldFail(r.result), false);
  assert.equal(store.users.a.lastRemind, "2026-11-10", "the reminder was attempted; those devices are gone");
  assert.deepEqual([store.users.a.tokens, store.users.b.tokens], [[], []], "the dead tokens are removed from the accounts");
});

test("exit code: one account's send failing while another's works leaves the run green", async () => {
  const store = twoParents({__failTokenResp: "T-A"});
  const r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [2, 1]);
  assert.deepEqual(r.sent, ["T-B"]);
  assert.equal(r.shouldFail(r.result), false);
  assert.ok(!("lastRemind" in store.users.a), "the failed one is retried at the next run");
  assert.equal(store.users.b.lastRemind, "2026-11-10");
});

test("exit code: if only some of one account's devices fail, that send still counts as working", async () => {
  const store = {users: {c: {remindAt: DUE, offset: 0, tokens: ["T-C1", "T-C2"]}}, kids: {k: {name: "ج", parentUid: "c"}}, days: {}, halaqas: {}, reminders: {}, __failTokenResp: "T-C1"};
  const r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [1, 0]);
  assert.deepEqual(r.sent, ["T-C2"]);
  assert.equal(store.users.c.lastRemind, "2026-11-10");
  assert.equal(r.shouldFail(r.result), false);
});

test("exit code: nothing arrived on any device and some failed for a real reason: red, even if the others were dead tokens", async () => {
  const store = {users: {c: {remindAt: DUE, offset: 0, tokens: ["T-DEAD", "T-DOWN"]}}, kids: {k: {name: "ج", parentUid: "c"}}, days: {}, halaqas: {}, reminders: {},
    __codeByToken: {"T-DEAD": "messaging/registration-token-not-registered", "T-DOWN": "messaging/server-unavailable"}};
  const r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [1, 1]);
  assert.equal(r.shouldFail(r.result), true);
  assert.ok(!("lastRemind" in store.users.c), "not marked as reminded, so it is tried again");
});

test("exit code: an account with no devices is not an attempt and does not turn the run red", async () => {
  const store = {users: {c: {remindAt: DUE, offset: 0}}, kids: {k: {name: "ج", parentUid: "c"}}, days: {}, halaqas: {}, reminders: {}};
  const r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [0, 0]);
  assert.equal(r.shouldFail(r.result), false);
  assert.equal(store.users.c.lastRemind, "2026-11-10");
});

test("two children: the first send works and the second fails; the account is retried (the first reminder may repeat) and the run stays green", async () => {
  const store = {users: {c: {remindAt: DUE, offset: 0, tokens: ["T-C"]}}, kids: {k1: {name: "أ", parentUid: "c"}, k2: {name: "ب", parentUid: "c"}}, days: {}, halaqas: {}, reminders: {}, __failCall: 2};
  const r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [2, 1]);
  assert.deepEqual(r.sent, ["T-C"], "only the first child's reminder went out");
  assert.ok(!("lastRemind" in store.users.c));
  assert.equal(r.shouldFail(r.result), false);
});

test("exit code: a broken account next to an outage does not change the verdict", async () => {
  const store = twoParents({__sendFailAll: "messaging/server-unavailable"});
  store.users.bad = {remindAt: DUE, offset: "x"};
  const r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [2, 2]);
  assert.equal(r.shouldFail(r.result), true);
});

test("shouldFail: nothing attempted, partial and total failure", async () => {
  const mod = Module.createRequire(import.meta.url);
  const saved = Module._load; Module._load = function (req, ...rest) { return req === "firebase-admin" ? makeAdmin({}).admin : saved.call(this, req, ...rest); };
  process.env.FIREBASE_SERVICE_ACCOUNT = "{}";
  let shouldFail;
  try { delete mod.cache[mod.resolve("../jobs/reminders.js")]; shouldFail = mod("../jobs/reminders.js").shouldFail; } finally { Module._load = saved; }
  assert.equal(shouldFail(undefined), false);
  assert.equal(shouldFail({attempts: 0, failed: 0}), false);
  assert.equal(shouldFail({attempts: 3, failed: 2}), false);
  assert.equal(shouldFail({attempts: 3, failed: 3}), true);
  assert.equal(shouldFail({attempts: 1, failed: 1}), true);
});
