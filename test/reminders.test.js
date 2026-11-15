/* The reminder job against an in-memory Firestore: one account with bad values must not stop everyone else's reminders.
   (jobs/reminders.js runs on GitHub Actions; firebase-admin is replaced here, so no network and no service account.) */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0); // a Tuesday, 12:00 UTC

function makeAdmin(store) {
  const ID = {id: true}, sent = [], messages = [];
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
    sent, messages,
    admin: {
      initializeApp() {}, credential: {cert: () => ({})}, firestore,
      // like firebase-admin: sendEach throws only when the connection itself fails; a failed message is a result {success:false, error:{code}}, not an exception
      messaging: () => ({sendEach: async msgs => {
        if (store.__sendDown) throw new Error("messaging connection failed");
        if (msgs.length > 500) throw new Error("messages list must not contain more than 500 items");
        if (store.__throwOnToken && msgs.some(m => m.token === store.__throwOnToken)) throw new Error("connection lost in this part");
        store.__calls = (store.__calls || 0) + 1;
        const responses = msgs.map(m => {
          if (store.__failCall === store.__calls) return {success: false, error: {code: "messaging/server-unavailable"}};
          if (store.__codeByToken && store.__codeByToken[m.token]) return {success: false, error: {code: store.__codeByToken[m.token]}};
          if (store.__sendFailAll) return {success: false, error: {code: store.__sendFailAll, message: store.__failMsg || ""}};
          if (store.__failTokenResp === m.token) return {success: false, error: {code: "messaging/server-unavailable"}};
          sent.push(m.token); messages.push({token: m.token, title: m.notification.title, body: m.notification.body, link: m.data.link}); return {success: true};
        });
        return {responses, successCount: responses.filter(r => r.success).length, failureCount: responses.filter(r => !r.success).length};
      }}),
    },
  };
}

async function runJob(store) {
  const {admin, sent, messages} = makeAdmin(store);
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
  return {sent, logs, result, shouldFail, messages};
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

/* ---------- weekly reports follow each child's own week (planWeekStart) ---------- */
// NOW is a Tuesday (2026-11-10). A child whose in-order plan started on a Tuesday begins a new week today; one that started on a Wednesday does not.
const weeklyOf = r => r.messages.filter(m => m.link.startsWith("/?report=1"));
const parentWith = kids => ({users: {p: {remindAt: DUE, offset: 0, tokens: ["T-P"], lang: "ar"}}, kids, days: {}, halaqas: {}, reminders: {}});
const plan2 = (start, extra = {}) => Object.assign({algo: 2, start, surahs: [78]}, extra);

test("weekly report: a child is reported on the weekday its plan started, with its own link", async () => {
  const store = parentWith({
    a: Object.assign({name: "أحمد", parentUid: "p"}, plan2("2026-11-03")),   // started on a Tuesday: its week begins today
    b: {name: "بسمة", parentUid: "p", surahs: [78]},                           // older plan: the account's week start (Saturday)
    c: Object.assign({name: "جميلة", parentUid: "p"}, plan2("2026-11-04")),   // started on a Wednesday
  });
  const r = await runJob(store);
  const w = weeklyOf(r);
  assert.equal(w.length, 1);
  assert.equal(w[0].link, "/?report=1&kid=a", "one child: the link carries that child");
  assert.ok(w[0].body.includes("أحمد") && !w[0].body.includes("بسمة") && !w[0].body.includes("جميلة"), w[0].body);
  assert.equal(store.users.p.lastWeekly, "2026-11-10");
});

test("weekly report: children whose weeks begin on the same day are reported together", async () => {
  const store = parentWith({
    a: Object.assign({name: "أحمد", parentUid: "p"}, plan2("2026-11-03")),
    b: Object.assign({name: "بسمة", parentUid: "p"}, plan2("2026-10-27")),   // also a Tuesday
  });
  const w = weeklyOf(await runJob(store));
  assert.equal(w.length, 1);
  assert.equal(w[0].link, "/?report=1&kid=a", "several children: the link opens the first one named");
  assert.ok(w[0].body.includes("أحمد") && w[0].body.includes("بسمة"));
});

test("weekly report: older plans still follow the account's week start; nothing is sent on other days but the day is marked", async () => {
  // week start Tuesday: the older plan's child is reported today
  let store = parentWith({b: {name: "بسمة", parentUid: "p", surahs: [78]}});
  store.users.p.weekStart = 2;
  let w = weeklyOf(await runJob(store));
  assert.equal(w.length, 1); assert.ok(w[0].body.includes("بسمة"));
  // default week start (Saturday) and a child whose week begins on a Wednesday: no report today
  store = parentWith({c: Object.assign({name: "جميلة", parentUid: "p"}, plan2("2026-11-04")), b: {name: "بسمة", parentUid: "p", surahs: [78]}});
  const r = await runJob(store);
  assert.equal(weeklyOf(r).length, 0);
  assert.equal(store.users.p.lastWeekly, "2026-11-10", "marked, so the job does not look again today");
});

test("weekly report: a child in a class follows the teacher's plan for the student, then the class plan", async () => {
  const store = parentWith({k: {name: "علي", parentUid: "p", halaqaId: "h", surahs: [78]}});
  store.halaqas = {h: {name: "حلقة", teacherUid: "t", plan: plan2("2026-11-03")}};   // class plan started on a Tuesday
  assert.equal(weeklyOf(await runJob(store)).length, 1, "the class plan decides");
  store.users.p.lastWeekly = undefined; delete store.users.p.lastWeekly;
  store.halaqas.h.studentPlans = {k: plan2("2026-11-04")};                            // this student's own plan started on a Wednesday
  assert.equal(weeklyOf(await runJob(store)).length, 0, "the student's plan wins over the class plan");
});

test("weekly report: nothing on the day a plan starts, nor before a whole week has passed", async () => {
  // the plan was saved today (a Tuesday): the weekday matches, but there is no finished week to report
  let store = parentWith({a: Object.assign({name: "أحمد", parentUid: "p"}, plan2("2026-11-10"))});
  let r = await runJob(store);
  assert.equal(weeklyOf(r).length, 0, "saved today");
  assert.equal(store.users.p.lastWeekly, "2026-11-10");
  // a start that has not come yet (a device with a later date saved it)
  store = parentWith({a: Object.assign({name: "أحمد", parentUid: "p"}, plan2("2026-11-17"))});
  assert.equal(weeklyOf(await runJob(store)).length, 0, "starts next week");
  // exactly one week after the start: the first report, covering the seven days of the plan
  store = parentWith({a: Object.assign({name: "أحمد", parentUid: "p"}, plan2("2026-11-03"))});
  assert.equal(weeklyOf(await runJob(store)).length, 1, "a week has passed");
  // an older plan has no start to wait for: reported on the account's week start as before
  store = parentWith({b: {name: "بسمة", parentUid: "p", surahs: [78], start: "2026-11-10"}});
  store.users.p.weekStart = 2;
  assert.equal(weeklyOf(await runJob(store)).length, 1, "older plans are not held back by a start date");
});

test("weekly report: a class plan saved today is not reported today", async () => {
  const store = {
    users: {t: {summaryAt: DUE, offset: 0, tokens: ["T-T"], lang: "ar"}},
    halaqas: {h1: {name: "الأولى", teacherUid: "t", plan: plan2("2026-11-10")}},
    kids: {s1: {name: "أ", teacherUid: "t", halaqaId: "h1"}}, days: {}, reminders: {},
  };
  const r = await runJob(store);
  assert.deepEqual(r.messages.filter(m => m.link.startsWith("/?hreport=")), []);
});

test("weekly report: the child's own plan is used when the class has no record or no plan for the student", async () => {
  // the class document is gone: the child's own plan (started on a Tuesday) decides
  let store = parentWith({k: Object.assign({name: "علي", parentUid: "p", halaqaId: "gone"}, plan2("2026-11-03"))});
  assert.equal(weeklyOf(await runJob(store)).length, 1, "no class document");
  // the student's entry was removed (null) and the class plan started on a Wednesday: not today
  store = parentWith({k: Object.assign({name: "علي", parentUid: "p", halaqaId: "h"}, plan2("2026-11-03"))});
  store.halaqas = {h: {name: "حلقة", teacherUid: "t", plan: plan2("2026-11-04"), studentPlans: {k: null}}};
  assert.equal(weeklyOf(await runJob(store)).length, 0, "the class plan, since the student's own entry is empty");
  // a class with an empty plan: back to the child's own plan
  store = parentWith({k: Object.assign({name: "علي", parentUid: "p", halaqaId: "h"}, plan2("2026-11-03"))});
  store.halaqas = {h: {name: "حلقة", teacherUid: "t", plan: {surahs: [], ranges: []}}};
  assert.equal(weeklyOf(await runJob(store)).length, 1, "an empty class plan is no plan");
});

test("weekly class report: sent on the weekday of the class plan", async () => {
  const mk = plan => ({
    users: {t: {summaryAt: DUE, offset: 0, tokens: ["T-T"], lang: "ar"}},
    halaqas: {h1: {name: "الأولى", teacherUid: "t", plan}, h2: {name: "الثانية", teacherUid: "t", plan: {surahs: [78]}}},
    kids: {s1: {name: "أ", teacherUid: "t", halaqaId: "h1"}, s2: {name: "ب", teacherUid: "t", halaqaId: "h2"}}, days: {}, reminders: {},
  });
  let r = await runJob(mk(plan2("2026-11-03")));
  let links = r.messages.map(m => m.link).filter(l => l.startsWith("/?hreport="));
  assert.deepEqual(links, ["/?hreport=h1"], "only the class whose week begins today (Tuesday), not the older-plan class (Saturday)");
  r = await runJob(mk(plan2("2026-11-04")));
  links = r.messages.map(m => m.link).filter(l => l.startsWith("/?hreport="));
  assert.deepEqual(links, [], "a class plan that started on a Wednesday: nothing on Tuesday");
});

test("the job and the app agree on the weekday a plan's week begins", async () => {
  const {planWeekStart: appRule} = await import("../src/planner.js");
  const saved = Module._load; Module._load = function (req, ...rest) { return req === "firebase-admin" ? makeAdmin({}).admin : saved.call(this, req, ...rest); };
  process.env.FIREBASE_SERVICE_ACCOUNT = "{}";
  let jobRule;
  try { const mod = Module.createRequire(import.meta.url); delete mod.cache[mod.resolve("../jobs/reminders.js")]; jobRule = mod("../jobs/reminders.js").planWeekStart; } finally { Module._load = saved; }
  const plans = [
    undefined, null, {}, {surahs: [1]}, {algo: 1, start: "2026-11-11"}, {algo: "2", start: "2026-11-11"}, {algo: 2}, {algo: 2, start: 5}, {algo: 2, start: ""},
    {algo: 2, start: "2026-11-11"}, {algo: 2, start: "2026-11-07"}, {algo: 2, start: "2026-11-08"}, {algo: 2, start: "2026-11-09"}, {algo: 2, start: "2026-11-10"},
    {algo: 2, start: "2026-11-12"}, {algo: 2, start: "2026-11-13"}, {algo: 2, start: "2024-02-29"}, {algo: 2, start: "2026-02-30"}, {algo: 2, start: "2026-13-01"},
    {algo: 2, start: "20261111"}, {algo: 2, start: "2026-1-1"}, {algo: 2, start: "x"},
  ];
  for (const p of plans) for (const fb of [0, 1, 6]) assert.equal(jobRule(p, fb), appRule(p, fb), JSON.stringify(p) + " fallback " + fb);
  assert.equal(jobRule({algo: 2, start: "2026-11-11"}, 6), 3, "Wednesday");
});

/* ---------- dead tokens, chunks, and the queue stamp ---------- */
test("a malformed token is removed, a bad payload is not: both come back as invalid-argument", async () => {
  // the registration token is the problem: the devices are dropped and the run stays green
  let store = twoParents({__sendFailAll: "messaging/invalid-argument", __failMsg: "The registration token is not a valid FCM registration token"});
  let r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [2, 0]);
  assert.deepEqual([store.users.a.tokens, store.users.b.tokens], [[], []]);
  assert.equal(r.shouldFail(r.result), false);
  // the payload is the problem (it would fail for every device): the tokens stay and the run is red
  store = twoParents({__sendFailAll: "messaging/invalid-argument", __failMsg: "Invalid JSON payload received. Unknown name"});
  r = await runJob(store);
  assert.deepEqual([r.result.attempts, r.result.failed], [2, 2]);
  assert.deepEqual([store.users.a.tokens, store.users.b.tokens], [["T-A"], ["T-B"]], "nobody loses a working device because of a payload error");
  assert.equal(r.shouldFail(r.result), true);
  assert.ok(!("lastRemind" in store.users.a));
});

test("a dead token is removed from every document that holds it", async () => {
  const store = {users: {p: {remindAt: DUE, offset: 0, tokens: ["T-X", "T-Y"]}}, kids: {k1: {name: "أ", parentUid: "p", tokens: ["T-X"]}}, days: {}, halaqas: {}, reminders: {},
    __codeByToken: {"T-X": "messaging/registration-token-not-registered"}};
  await runJob(store);
  assert.deepEqual(store.users.p.tokens, ["T-Y"], "the account");
  assert.deepEqual(store.kids.k1.tokens, [], "and the child's device list");
});

test("more than 500 devices are sent in parts", async () => {
  const tokens = Array.from({length: 1200}, (_, i) => "T" + i);
  const store = {users: {p: {remindAt: DUE, offset: 0, tokens}}, kids: {k: {name: "أ", parentUid: "p"}}, days: {}, halaqas: {}, reminders: {}};
  const r = await runJob(store);
  assert.equal(r.sent.length, 1200); assert.equal(new Set(r.sent).size, 1200);
  assert.deepEqual([r.result.attempts, r.result.failed], [1, 0], "one notification, three parts");
  assert.equal(store.users.p.lastRemind, "2026-11-10");
});

test("the teacher's tap: a send that failed does not start the hour of silence", async () => {
  const mkq = () => ({users: {t: {tokens: ["T-T"]}, p: {tokens: ["T-P"], lang: "ar"}}, kids: {a: {name: "أ", parentUid: "p", teacherUid: "t"}}, days: {}, halaqas: {},
    reminders: {r1: {kidId: "a", teacherUid: "t", kind: "remind", at: NOW - 1000}}});
  let store = Object.assign(mkq(), {__sendFailAll: "messaging/server-unavailable"});
  await runJob(store);
  assert.ok(!("lastRemindAt" in store.kids.a), "a failed send leaves no stamp, so the teacher can tap again");
  assert.deepEqual(Object.keys(store.reminders), [], "the tap itself is consumed");
  store = mkq();
  const r = await runJob(store);
  assert.deepEqual(r.sent, ["T-P"]);
  assert.equal(store.kids.a.lastRemindAt, NOW, "a sent notification starts the hour");
  // within that hour a second tap is dropped
  store.reminders = {r2: {kidId: "a", teacherUid: "t", kind: "remind", at: NOW - 500}};
  assert.deepEqual((await runJob(store)).sent, [], "throttled");
});

test("parts of 500: a dead token far into the list is matched to the right device, and a part that never went out does not hide the others", async () => {
  const tokens = Array.from({length: 1200}, (_, i) => "T" + i);
  const mk = extra => Object.assign({users: {p: {remindAt: DUE, offset: 0, tokens: tokens.slice()}}, kids: {k: {name: "أ", parentUid: "p"}}, days: {}, halaqas: {}, reminders: {}}, extra);
  // T1100 is in the third part and is the only dead one
  let store = mk({__codeByToken: {"T1100": "messaging/registration-token-not-registered"}});
  await runJob(store);
  assert.equal(store.users.p.tokens.length, 1199);
  assert.ok(!store.users.p.tokens.includes("T1100") && store.users.p.tokens.includes("T1099") && store.users.p.tokens.includes("T1101"), "exactly that one is gone");
  // the second part (T500..T999) cannot be sent: the other 700 devices still get it, and the account counts as reminded
  store = mk({__throwOnToken: "T700"});
  const r = await runJob(store);
  assert.equal(r.sent.length, 700); assert.ok(r.sent.includes("T0") && !r.sent.includes("T700") && r.sent.includes("T1100"));
  assert.deepEqual([r.result.attempts, r.result.failed], [1, 0]);
  assert.equal(store.users.p.lastRemind, "2026-11-10");
});
