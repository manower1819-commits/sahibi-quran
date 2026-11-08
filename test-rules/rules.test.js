/* Firestore security rules tests. They run against the Firestore emulator (needs Java), not with `npm test`:
     npx firebase emulators:exec --only firestore --project demo-sahibi "node --test test-rules/*.test.js"
   Needs @firebase/rules-unit-testing (install with --no-save, it is not a project dependency). */
import test, {before, after, beforeEach} from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {encode, decode} from "../src/codec.js";
import {initializeTestEnvironment, assertSucceeds, assertFails} from "@firebase/rules-unit-testing";
import {doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, arrayUnion, arrayRemove, deleteField, serverTimestamp, Timestamp} from "firebase/firestore";

let env;
const A = "ownerA", B = "coB", S = "stranger", T = "teacherT", U = "teacherU";
const db = uid => env.authenticatedContext(uid).firestore();
const seed = fn => env.withSecurityRulesDisabled(async ctx => fn(ctx.firestore()));
const FAR = Date.now() + 48 * 3600e3, PAST = Date.now() - 1000;
const NOW = () => Timestamp.now(), DAYS_AGO = n => Timestamp.fromMillis(Date.now() - n * 864e5);
const approvedReq = (o = {}) => Object.assign({kidId: "k1", parentUid: A, teacherUid: T, kidName: "Sara", status: "approved", at: 1, decidedAt: NOW()}, o);

before(async () => {
  env = await initializeTestEnvironment({projectId: "demo-sahibi", firestore: {rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")}});
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async d => {
    await setDoc(doc(d, "halaqas/hT"), {name: "T class", teacherUid: T, code: "TCODE1"});
    await setDoc(doc(d, "halaqas/hU"), {name: "U class", teacherUid: U, code: "UCODE1"});
    await setDoc(doc(d, "halaqaCodes/TCODE1"), {hid: "hT", teacherUid: T});
    await setDoc(doc(d, "kids/k1"), {name: "Sara", parentUid: A, parentUids: [A], surahs: [112], cycle: 1, light: 5});
    await setDoc(doc(d, "kids/k1/days/2026-11-07"), {stars: 2, tStars: 1});
  });
});

/* ---------- classes and class codes ---------- */
test("classes: anyone signed in can get one class by id, nobody signed out can", async () => {
  await assertSucceeds(getDoc(doc(db(S), "halaqas/hT")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "halaqas/hT")));
});
test("classes: they cannot be listed, except a teacher's own", async () => {
  await assertFails(getDocs(collection(db(S), "halaqas")));
  await assertFails(getDocs(query(collection(db(S), "halaqas"), where("teacherUid", "==", T))));
  await assertSucceeds(getDocs(query(collection(db(T), "halaqas"), where("teacherUid", "==", T))));
  await assertFails(getDocs(collection(db(T), "halaqas")));
});
test("classes: only the teacher changes or deletes one", async () => {
  await assertSucceeds(updateDoc(doc(db(T), "halaqas/hT"), {name: "new"}));
  await assertFails(updateDoc(doc(db(S), "halaqas/hT"), {name: "x"}));
  await assertFails(updateDoc(doc(db(T), "halaqas/hT"), {teacherUid: S}));
  await assertFails(deleteDoc(doc(db(S), "halaqas/hT")));
  await assertSucceeds(setDoc(doc(db(S), "halaqas/hS"), {name: "mine", teacherUid: S}));
  await assertFails(setDoc(doc(db(S), "halaqas/hS2"), {name: "stolen", teacherUid: T}));
});
test("class codes: lookup one code yes, list no", async () => {
  await assertSucceeds(getDoc(doc(db(S), "halaqaCodes/TCODE1")));
  await assertFails(getDocs(collection(db(S), "halaqaCodes")));
  await assertSucceeds(getDoc(doc(db(S), "halaqaCodes/NOPE99")));
});
test("class codes: only a teacher registers a code for their own class", async () => {
  await assertSucceeds(setDoc(doc(db(T), "halaqaCodes/NEWC12"), {hid: "hT", teacherUid: T}));
  await assertFails(setDoc(doc(db(S), "halaqaCodes/STOLEN"), {hid: "hT", teacherUid: S}));
  await assertFails(setDoc(doc(db(S), "halaqaCodes/STOLE2"), {hid: "hT", teacherUid: T}));
  await assertFails(setDoc(doc(db(T), "halaqaCodes/lower1"), {hid: "hT", teacherUid: T}));
  await assertFails(setDoc(doc(db(T), "halaqaCodes/EXTRA1"), {hid: "hT", teacherUid: T, x: 1}));
  await assertFails(setDoc(doc(db(T), "halaqaCodes/TCODE1"), {hid: "hU", teacherUid: T}), "an existing code cannot be taken over (that would be an update)");
  await assertFails(deleteDoc(doc(db(S), "halaqaCodes/TCODE1")));
  await assertSucceeds(deleteDoc(doc(db(T), "halaqaCodes/TCODE1")));
});

/* ---------- join requests ---------- */
const req = (o = {}) => Object.assign({kidId: "k1", parentUid: A, teacherUid: T, kidName: "Sara", status: "pending", at: 1}, o);
test("requests: the child's parent can ask; nobody else, nothing but 'pending'", async () => {
  await assertSucceeds(setDoc(doc(db(A), "halaqas/hT/requests/k1"), req()));
});
test("requests: bad creates are refused", async () => {
  const r = doc(db(A), "halaqas/hT/requests/k1");
  await assertFails(setDoc(doc(db(S), "halaqas/hT/requests/k1"), req({parentUid: S})), "stranger for someone else's child");
  await assertFails(setDoc(doc(db(A), "halaqas/hT/requests/k1"), req({status: "approved"})), "self-approval");
  await assertFails(setDoc(r, req({kidId: "k2"})), "kidId must equal the document id");
  await assertFails(setDoc(r, req({teacherUid: U})), "teacher must be the class's teacher");
  await assertFails(setDoc(r, req({parentUid: S})), "parentUid must be the caller");
  await assertFails(setDoc(r, req({extra: 1})), "no extra fields");
  await assertFails(setDoc(r, req({kidName: "x".repeat(31)})), "name length");
});
test("requests: who can read, decide and delete", async () => {
  await seed(d => setDoc(doc(d, "halaqas/hT/requests/k1"), req()));
  await assertSucceeds(getDoc(doc(db(T), "halaqas/hT/requests/k1")));
  await assertSucceeds(getDoc(doc(db(A), "halaqas/hT/requests/k1")));
  await assertFails(getDoc(doc(db(S), "halaqas/hT/requests/k1")));
  await assertFails(getDoc(doc(db(U), "halaqas/hT/requests/k1")));
  await assertFails(updateDoc(doc(db(A), "halaqas/hT/requests/k1"), {status: "approved", decidedAt: serverTimestamp()}), "parent cannot approve");
  await assertFails(updateDoc(doc(db(U), "halaqas/hT/requests/k1"), {status: "approved", decidedAt: serverTimestamp()}), "another teacher cannot approve");
  await assertFails(updateDoc(doc(db(T), "halaqas/hT/requests/k1"), {status: "weird", decidedAt: serverTimestamp()}));
  await assertFails(updateDoc(doc(db(T), "halaqas/hT/requests/k1"), {status: "approved", kidName: "other"}));
  await assertFails(updateDoc(doc(db(T), "halaqas/hT/requests/k1"), {status: "approved", decidedAt: DAYS_AGO(0)}), "the time must come from the server, not the client");
  await assertFails(updateDoc(doc(db(T), "halaqas/hT/requests/k1"), {status: "approved", decidedAt: 2}));
  await assertSucceeds(updateDoc(doc(db(T), "halaqas/hT/requests/k1"), {status: "approved", decidedAt: serverTimestamp()}));
  await assertFails(deleteDoc(doc(db(S), "halaqas/hT/requests/k1")));
  await assertSucceeds(deleteDoc(doc(db(A), "halaqas/hT/requests/k1")));
});
test("requests: the teacher can list pending ones, a stranger cannot", async () => {
  await seed(d => setDoc(doc(d, "halaqas/hT/requests/k1"), req()));
  await assertSucceeds(getDocs(query(collection(db(T), "halaqas/hT/requests"), where("status", "==", "pending"))));
  await assertFails(getDocs(collection(db(S), "halaqas/hT/requests")));
});

/* ---------- linking a child to a class ---------- */
test("linking: a parent cannot link a child without an approved request", async () => {
  const k = doc(db(A), "kids/k1");
  await assertFails(updateDoc(k, {halaqaId: "hT", teacherUid: T}), "no request at all");
  await seed(d => setDoc(doc(d, "halaqas/hT/requests/k1"), req()));
  await assertFails(updateDoc(k, {halaqaId: "hT", teacherUid: T}), "pending is not enough");
  await seed(d => updateDoc(doc(d, "halaqas/hT/requests/k1"), {status: "rejected", decidedAt: NOW()}));
  await assertFails(updateDoc(k, {halaqaId: "hT", teacherUid: T}), "rejected (even though a decision time is recorded)");
  await seed(d => updateDoc(doc(d, "halaqas/hT/requests/k1"), {status: "approved", decidedAt: NOW()}));
  await assertFails(updateDoc(k, {halaqaId: "hT", teacherUid: U}), "teacher must match the class");
  await assertFails(updateDoc(k, {halaqaId: "hU", teacherUid: U}), "the approval is for hT, not hU");
  await assertSucceeds(updateDoc(k, {halaqaId: "hT", teacherUid: T}));
});
test("linking: a new child cannot be created already inside a class", async () => {
  await assertFails(setDoc(doc(db(A), "kids/k9"), {name: "N", parentUid: A, halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(setDoc(doc(db(A), "kids/k9"), {name: "N", parentUid: A}));
  await assertFails(setDoc(doc(db(A), "kids/k8"), {name: "N", parentUid: S}), "cannot create a child for someone else");
  await assertFails(setDoc(doc(db(A), "kids/k7"), {name: "N", parentUid: A, parentUids: [A, S]}), "a new child belongs only to its creator");
});
test("linking: the teacher links an approved, unassigned child at once", async () => {
  const k = doc(db(T), "kids/k1");
  await assertFails(updateDoc(k, {halaqaId: "hT", teacherUid: T}), "not approved yet");
  await seed(d => setDoc(doc(d, "halaqas/hT/requests/k1"), approvedReq()));
  await assertFails(updateDoc(doc(db(U), "kids/k1"), {halaqaId: "hU", teacherUid: U}), "another teacher, no approval for hU");
  await assertFails(updateDoc(k, {halaqaId: "hT", teacherUid: T, name: "changed"}), "only the two link fields");
  await assertSucceeds(updateDoc(k, {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(getDoc(doc(db(T), "kids/k1")), "now the teacher can read the student");
});
test("linking: an approval older than 7 days no longer works for anyone", async () => {
  await seed(d => setDoc(doc(d, "halaqas/hT/requests/k1"), approvedReq({decidedAt: DAYS_AGO(8)})));
  await assertFails(updateDoc(doc(db(T), "kids/k1"), {halaqaId: "hT", teacherUid: T}), "teacher, 8 days later");
  await assertFails(updateDoc(doc(db(A), "kids/k1"), {halaqaId: "hT", teacherUid: T}), "parent, 8 days later");
  await seed(d => setDoc(doc(d, "halaqas/hT/requests/k1"), approvedReq({decidedAt: DAYS_AGO(6)})));
  await assertSucceeds(updateDoc(doc(db(T), "kids/k1"), {halaqaId: "hT", teacherUid: T}), "6 days is still fine");
});
test("linking: an approval without a recorded time is useless", async () => {
  await seed(d => setDoc(doc(d, "halaqas/hT/requests/k1"), Object.assign(approvedReq(), {decidedAt: null})));
  await assertFails(updateDoc(doc(db(T), "kids/k1"), {halaqaId: "hT", teacherUid: T}));
});
test("linking: a child already in another class cannot be taken by a second teacher", async () => {
  await seed(async d => {
    await updateDoc(doc(d, "kids/k1"), {halaqaId: "hU", teacherUid: U});
    await setDoc(doc(d, "halaqas/hT/requests/k1"), approvedReq());
  });
  await assertFails(updateDoc(doc(db(T), "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(updateDoc(doc(db(A), "kids/k1"), {halaqaId: "hT", teacherUid: T}), "the parent can move it with the approval");
});
test("linking: the teacher can only remove their own student; parents can leave", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertFails(updateDoc(doc(db(U), "kids/k1"), {halaqaId: null, teacherUid: null}));
  await assertSucceeds(updateDoc(doc(db(T), "kids/k1"), {halaqaId: null, teacherUid: null}));
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(updateDoc(doc(db(A), "kids/k1"), {halaqaId: null, teacherUid: null}));
});
test("linking: an already-linked child (old data, no request document) can still be edited", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(updateDoc(doc(db(A), "kids/k1"), {name: "Renamed", halaqaId: "hT", teacherUid: T}));
});
test("children: strangers and other teachers see nothing", async () => {
  await assertFails(getDoc(doc(db(S), "kids/k1")));
  await assertFails(getDoc(doc(db(T), "kids/k1")));
  await assertFails(getDoc(doc(db(S), "kids/k1/days/2026-11-07")));
  await assertFails(updateDoc(doc(db(S), "kids/k1"), {name: "x"}));
  await assertFails(deleteDoc(doc(db(S), "kids/k1")));
});

/* ---------- co-parent invites ---------- */
const inv = (o = {}) => Object.assign({kidId: "k1", ownerUid: A, exp: FAR, claimedBy: null}, o);
test("invites: only the child's owner creates one, in the right shape", async () => {
  await assertSucceeds(setDoc(doc(db(A), "invites/ABCD2345"), inv()));
  await assertFails(setDoc(doc(db(S), "invites/ABCD2346"), inv({ownerUid: S})), "not the owner of k1");
  await assertFails(setDoc(doc(db(A), "invites/ABCD2347"), inv({ownerUid: S})));
  await assertFails(setDoc(doc(db(A), "invites/ABCD2348"), inv({claimedBy: S})), "pre-claimed");
  await assertFails(setDoc(doc(db(A), "invites/ABCD2349"), inv({exp: "tomorrow"})));
  await assertFails(setDoc(doc(db(A), "invites/short"), inv()), "code format");
  await assertFails(setDoc(doc(db(A), "invites/ABCD2340"), inv({extra: 1})));
});
test("invites: a co-parent cannot make invites, the owner only", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {parentUids: [A, B]}));
  await assertFails(setDoc(doc(db(B), "invites/ABCD2345"), inv({ownerUid: B})));
});
test("invites: claimed once, by yourself, before it expires", async () => {
  await seed(async d => { await setDoc(doc(d, "invites/GOOD2345"), inv()); await setDoc(doc(d, "invites/OLD22345"), inv({exp: PAST})); await setDoc(doc(d, "invites/USED2345"), inv({claimedBy: S})); });
  await assertSucceeds(getDoc(doc(db(B), "invites/GOOD2345")));
  await assertFails(getDocs(collection(db(B), "invites")));
  await assertFails(updateDoc(doc(db(B), "invites/GOOD2345"), {claimedBy: S}), "claim for somebody else");
  await assertFails(updateDoc(doc(db(B), "invites/GOOD2345"), {claimedBy: B, kidId: "k2"}), "only claimedBy changes");
  await assertFails(updateDoc(doc(db(B), "invites/OLD22345"), {claimedBy: B}), "expired");
  await assertFails(updateDoc(doc(db(B), "invites/USED2345"), {claimedBy: B}), "already claimed");
  await assertSucceeds(updateDoc(doc(db(B), "invites/GOOD2345"), {claimedBy: B}));
});

async function claimed(who = B, extra = {}) {
  await seed(async d => { await setDoc(doc(d, "invites/GOOD2345"), inv(Object.assign({claimedBy: who}, extra))); await setDoc(doc(d, "kids/k1/private/invite"), {code: "GOOD2345"}); });
}
test("co-parent join: needs a claimed invite for this child, adds only yourself", async () => {
  const k = doc(db(B), "kids/k1");
  await assertFails(updateDoc(k, {parentUids: arrayUnion(B)}), "no invite on the child yet");
  await seed(d => setDoc(doc(d, "kids/k1/private/invite"), {code: "GOOD2345"}));
  await seed(d => setDoc(doc(d, "invites/GOOD2345"), inv()));
  await assertFails(updateDoc(k, {parentUids: arrayUnion(B)}), "invite not claimed");
  await claimed(S);
  await assertFails(updateDoc(k, {parentUids: arrayUnion(B)}), "invite claimed by someone else");
  await claimed(B);
  await assertFails(updateDoc(k, {parentUids: arrayUnion(S)}), "cannot add another person");
  await assertFails(updateDoc(k, {parentUids: arrayUnion(B), name: "hacked"}), "only parentUids/parentNames");
  await assertFails(updateDoc(k, {parentUids: arrayUnion(B), "parentNames.ownerA": "x"}), "cannot write someone else's name");
  await assertFails(updateDoc(k, {parentUids: [B]}), "cannot drop the owner");
  await assertSucceeds(updateDoc(k, {parentUids: arrayUnion(B), "parentNames.coB": "Mama"}));
});
test("co-parent join: an invite for another child does not open this one", async () => {
  await seed(async d => { await setDoc(doc(d, "kids/k2"), {name: "Other", parentUid: S, parentUids: [S]}); });
  await claimed(B, {kidId: "k2"});
  await assertFails(updateDoc(doc(db(B), "kids/k1"), {parentUids: arrayUnion(B)}));
});
test("co-parent join: works for an older child that has no parentUids yet is covered by the owner's invite step", async () => {
  await seed(d => setDoc(doc(d, "kids/k3"), {name: "Old", parentUid: A}));
  await assertSucceeds(setDoc(doc(db(A), "kids/k3/private/invite"), {code: "GOOD2345"}));
  await assertSucceeds(updateDoc(doc(db(A), "kids/k3"), {parentUids: arrayUnion(A)}));
  await seed(d => setDoc(doc(d, "invites/GOOD2345"), inv({kidId: "k3", claimedBy: B})));
  await assertSucceeds(updateDoc(doc(db(B), "kids/k3"), {parentUids: arrayUnion(B)}));
});

/* ---------- what a co-parent may and may not do ---------- */
async function coparent() { await seed(d => updateDoc(doc(d, "kids/k1"), {parentUids: [A, B], parentNames: {coB: "Mama"}})); }
test("co-parent: reads and edits the child and the days", async () => {
  await coparent();
  await assertSucceeds(getDoc(doc(db(B), "kids/k1")));
  await assertSucceeds(getDocs(query(collection(db(B), "kids"), where("parentUids", "array-contains", B))));
  await assertSucceeds(updateDoc(doc(db(B), "kids/k1"), {name: "Sara 2", surahs: [112, 113]}));
  await assertSucceeds(getDoc(doc(db(B), "kids/k1/days/2026-11-07")));
  await assertSucceeds(setDoc(doc(db(B), "kids/k1/days/2026-11-08"), {stars: 3, pw: [583]}));
  await assertFails(setDoc(doc(db(B), "kids/k1/days/2026-11-09"), {stars: 3, tStars: 3}), "class rating is the teacher's");
  await assertSucceeds(deleteDoc(doc(db(B), "kids/k1/days/2026-11-07")));
});
test("co-parent: cannot delete the child, take ownership, or add people", async () => {
  await coparent();
  await assertFails(deleteDoc(doc(db(B), "kids/k1")));
  await assertFails(updateDoc(doc(db(B), "kids/k1"), {parentUid: B}));
  await assertFails(updateDoc(doc(db(B), "kids/k1"), {parentUids: arrayUnion(S)}));
  await assertFails(updateDoc(doc(db(B), "kids/k1"), {parentUids: [A, B, S]}));
});
test("co-parent: can leave", async () => {
  await coparent();
  await assertSucceeds(updateDoc(doc(db(B), "kids/k1"), {parentUids: arrayRemove(B)}));
  await assertFails(getDoc(doc(db(B), "kids/k1")), "after leaving they see nothing");
});
test("co-parent: can ask to join a class for the shared child", async () => {
  await coparent();
  await assertSucceeds(setDoc(doc(db(B), "halaqas/hT/requests/k1"), req({parentUid: B})));
});
test("owner: removes co-parents and deletes the child; cannot remove themself from parentUids", async () => {
  await coparent();
  await assertSucceeds(updateDoc(doc(db(A), "kids/k1"), {parentUids: arrayRemove(B), "parentNames.coB": deleteField()}));
  await assertFails(updateDoc(doc(db(A), "kids/k1"), {parentUids: [B]}));
  await assertSucceeds(deleteDoc(doc(db(A), "kids/k1")));
});
test("a stranger is not a co-parent just because an invite exists", async () => {
  await seed(async d => { await setDoc(doc(d, "invites/GOOD2345"), inv()); await setDoc(doc(d, "kids/k1/private/invite"), {code: "GOOD2345"}); });
  await assertFails(getDoc(doc(db(S), "kids/k1")));
  await assertFails(updateDoc(doc(db(S), "kids/k1"), {parentUids: arrayUnion(S)}));
});

/* ---------- the wire format of items and ranges ---------- */
test("codec: day items and plan ranges are accepted by Firestore once encoded, and read back identical", async () => {
  const day = {stars: 2, items: [[79, 1, 46], [81, 1, 29]], weak: [79], pw: [583]};
  await assertSucceeds(setDoc(doc(db(A), "kids/k1/days/2026-11-12"), encode(day), {merge: true}));
  const got = await assertSucceeds(getDoc(doc(db(A), "kids/k1/days/2026-11-12")));
  assert.deepEqual(decode(got.data()), day);
  const plan = {surahs: [112], ranges: [[2, 255, 257], [67, 1, 20]]};
  await assertSucceeds(setDoc(doc(db(A), "kids/k1"), encode(plan), {merge: true}));
  assert.deepEqual(decode((await getDoc(doc(db(A), "kids/k1"))).data()).ranges, plan.ranges);
  await assertSucceeds(setDoc(doc(db(T), "halaqas/hT"), encode({plan: {surahs: [], ranges: [[2, 1, 5]]}}), {merge: true}));
  assert.deepEqual(decode((await getDoc(doc(db(S), "halaqas/hT"))).data()).plan.ranges, [[2, 1, 5]]);
});

/* ---------- days: unchanged behaviour ---------- */
test("days: the teacher writes class marks only", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(setDoc(doc(db(T), "kids/k1/days/2026-11-08"), {tStars: 2, tNotes: "good"}));
  await assertFails(setDoc(doc(db(T), "kids/k1/days/2026-11-09"), {stars: 3}));
  await assertSucceeds(getDoc(doc(db(T), "kids/k1/days/2026-11-07")));
  await assertFails(deleteDoc(doc(db(T), "kids/k1/days/2026-11-07")));
});
test("Firestore itself refuses an array inside an array (how the app builds day items)", async () => {
  let msg = "";
  try { await setDoc(doc(db(A), "kids/k1/days/2026-11-10"), {stars: 1, items: [[112, 1, 4]]}, {merge: true}); } catch (e) { msg = String(e.message); }
  if (!/Nested arrays are not supported/.test(msg)) throw new Error("expected the SDK to refuse nested arrays, got: " + msg);
});
test("days: the teacher marks pages (tpw) on their own key; neither side can write the other's page marks", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(setDoc(doc(db(T), "kids/k1/days/2026-11-08"), {tStars: 2, tpw: [583, 584]}));
  await assertFails(setDoc(doc(db(T), "kids/k1/days/2026-11-09"), {pw: [583]}), "the parent's key");
  await assertSucceeds(setDoc(doc(db(A), "kids/k1/days/2026-11-10"), {stars: 1, pw: [583]}));
  await assertFails(setDoc(doc(db(A), "kids/k1/days/2026-11-11"), {tpw: [583]}), "the teacher's key");
  await assertFails(setDoc(doc(db(U), "kids/k1/days/2026-11-12"), {tpw: [583]}), "another teacher");
});
test("days: page lists must be lists of at most 604 entries (what is stored is later displayed to the other side)", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertFails(setDoc(doc(db(A), "kids/k1/days/2026-11-20"), {pw: "<img src=x onerror=alert(1)>"}), "a string is not a list");
  await assertFails(setDoc(doc(db(A), "kids/k1/days/2026-11-21"), {pw: Array.from({length: 605}, (_, i) => i + 1)}), "too long");
  await assertFails(setDoc(doc(db(T), "kids/k1/days/2026-11-22"), {tpw: "x"}));
  await assertFails(setDoc(doc(db(T), "kids/k1/days/2026-11-23"), {tpw: Array.from({length: 605}, (_, i) => i + 1)}));
  await assertSucceeds(setDoc(doc(db(A), "kids/k1/days/2026-11-24"), {pw: Array.from({length: 604}, (_, i) => i + 1)}));
  await assertSucceeds(setDoc(doc(db(A), "kids/k1/days/2026-11-25"), {stars: 2}), "days without page lists are untouched");
});
test("days: the parent writes home keys, including pw, and nothing else", async () => {
  await assertSucceeds(setDoc(doc(db(A), "kids/k1/days/2026-11-08"), {stars: 1, weak: [112], pw: [42], notes: "n", items: [112, 1, 4]}));
  await assertFails(setDoc(doc(db(A), "kids/k1/days/2026-11-09"), {stars: 1, junk: 1}));
});

/* ---------- reminders ---------- */
test("reminders: only a teacher, only for their own student", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(setDoc(doc(db(T), "reminders/r1"), {kidId: "k1", teacherUid: T, lang: "ar", at: 1}));
  await assertFails(setDoc(doc(db(U), "reminders/r2"), {kidId: "k1", teacherUid: U, lang: "ar", at: 1}));
  await assertFails(setDoc(doc(db(A), "reminders/r3"), {kidId: "k1", teacherUid: A, lang: "ar", at: 1}));
});
test("reminders: a teacher's note notification is allowed, other kinds and fields are not", async () => {
  await seed(d => updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T}));
  await assertSucceeds(setDoc(doc(db(T), "reminders/n1"), {kidId: "k1", teacherUid: T, lang: "ar", at: 1, kind: "note"}));
  await assertSucceeds(setDoc(doc(db(T), "reminders/n2"), {kidId: "k1", teacherUid: T, lang: "ar", at: 1, kind: "remind"}));
  await assertFails(setDoc(doc(db(T), "reminders/n3"), {kidId: "k1", teacherUid: T, lang: "ar", at: 1, kind: "spam"}));
  await assertFails(setDoc(doc(db(T), "reminders/n4"), {kidId: "k1", teacherUid: T, lang: "ar", at: 1, kind: "note", body: "free text"}));
  await assertFails(setDoc(doc(db(U), "reminders/n5"), {kidId: "k1", teacherUid: U, lang: "ar", at: 1, kind: "note"}), "not their student");
});
test("student plans: the teacher can store one per child in the class document and parents can read it", async () => {
  const plan = {surahs: [], ranges: [[2, 1, 5]], cycle: 1, light: 5, start: "2026-11-08"};
  await assertSucceeds(updateDoc(doc(db(T), "halaqas/hT"), {studentPlans: {k1: encode(plan)}}));
  const got = decode((await assertSucceeds(getDoc(doc(db(A), "halaqas/hT")))).data());
  assert.deepEqual(got.studentPlans.k1.ranges, [[2, 1, 5]]);
  await assertFails(updateDoc(doc(db(A), "halaqas/hT"), {studentPlans: {k1: null}}), "a parent cannot change the class document");
  await assertSucceeds(updateDoc(doc(db(T), "halaqas/hT"), {studentPlans: {k1: null}}));
});

/* ---------- review finding: the invite code must not leak to a linked teacher (who could otherwise claim it and become a co-parent) ---------- */
test("the invite code lives where only the parents can read it", async () => {
  await seed(async d => {
    await updateDoc(doc(d, "kids/k1"), {halaqaId: "hT", teacherUid: T});
    await setDoc(doc(d, "invites/GOOD2345"), inv());
    await setDoc(doc(d, "kids/k1/private/invite"), {code: "GOOD2345"});
  });
  const kid = (await assertSucceeds(getDoc(doc(db(T), "kids/k1")))).data();
  assert.ok(!JSON.stringify(kid).includes("GOOD2345"), "the code must not be in the child's document");
  await assertFails(getDoc(doc(db(T), "kids/k1/private/invite")), "the linked teacher cannot read it");
  await assertFails(getDoc(doc(db(S), "kids/k1/private/invite")), "nor a stranger");
  await assertSucceeds(getDoc(doc(db(A), "kids/k1/private/invite")), "the owner can");
  await assertFails(setDoc(doc(db(T), "kids/k1/private/invite"), {code: "EVIL2345"}), "and only a parent can write it");
});
test("the code owner can still bring in the intended co-parent", async () => {
  await seed(async d => { await setDoc(doc(d, "invites/GOOD2345"), inv({claimedBy: B})); await setDoc(doc(d, "kids/k1/private/invite"), {code: "GOOD2345"}); });
  await assertSucceeds(updateDoc(doc(db(B), "kids/k1"), {parentUids: arrayUnion(B)}));
});

test("co-parent join: an invite past its expiry cannot be used to join, even if it was claimed in time", async () => {
  await seed(async d => { await setDoc(doc(d, "invites/GOOD2345"), inv({claimedBy: B, exp: PAST})); await setDoc(doc(d, "kids/k1/private/invite"), {code: "GOOD2345"}); });
  await assertFails(updateDoc(doc(db(B), "kids/k1"), {parentUids: arrayUnion(B)}));
});
test("co-parent join: without a recorded invite for the child nobody can join", async () => {
  await seed(d => setDoc(doc(d, "invites/GOOD2345"), inv({claimedBy: B})));
  await assertFails(updateDoc(doc(db(B), "kids/k1"), {parentUids: arrayUnion(B)}));
});
