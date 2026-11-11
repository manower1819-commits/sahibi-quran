import test from "node:test";
import assert from "node:assert/strict";
import {validPin, hashPin, makePin, checkPin, failState, parseFail, waitLeft, lockExpired, LOCK_MS} from "../src/pin.js";

test("validPin: exactly four digits", () => {
  for (const ok of ["0000", "1234", "9999", 1234]) assert.equal(validPin(ok), true, String(ok));
  for (const bad of ["123", "12345", "12a4", "", " 1234", "１２３４", null, undefined]) assert.equal(validPin(bad), false, String(bad));
});
test("a PIN is stored as a salted hash, never the PIN", async () => {
  const rec = await makePin("4821");
  assert.equal(Object.keys(rec).sort().join(), "h,s");
  assert.ok(!JSON.stringify(rec).includes("4821"));
  assert.match(rec.h, /^[0-9a-f]{64}$/);
  assert.equal(await checkPin("4821", rec), true);
  assert.equal(await checkPin("4822", rec), false);
  assert.equal(await checkPin("", rec), false);
  assert.equal(await checkPin("4821", null), false);
  assert.equal(await checkPin("4821", {s: "x"}), false);
});
test("the same PIN gets a different hash with a different salt", async () => {
  const a = await makePin("1111"), b = await makePin("1111");
  assert.notEqual(a.s, b.s); assert.notEqual(a.h, b.h);
  assert.equal(await hashPin("1111", a.s), a.h);
});
test("lockout: five wrong tries in a row wait a minute, then reset", () => {
  let st = null; const t0 = 1000;
  for (let i = 1; i <= 4; i++) { st = failState(st, t0); assert.equal(st.n, i); assert.equal(waitLeft(st, t0), 0); }
  st = failState(st, t0);
  assert.equal(st.n, 0); assert.equal(waitLeft(st, t0), 60); assert.equal(waitLeft(st, t0 + 30000), 30); assert.equal(waitLeft(st, t0 + 61000), 0);
  assert.equal(waitLeft(null, t0), 0);
});
test("auto-lock closes after five minutes without any activity", () => {
  assert.equal(LOCK_MS, 300000);
  assert.equal(lockExpired(0, 299999), false);
  assert.equal(lockExpired(0, 300000), false);
  assert.equal(lockExpired(0, 300001), true);
  assert.equal(lockExpired(1000, 1000 + 60000), false);
});

test("parseFail: a lockout kept in storage comes back as it was, and nothing odd survives", () => {
  const now = 1_000_000;
  assert.deepEqual(parseFail({n: 3, until: 0}, now), {n: 3, until: 0});
  assert.deepEqual(parseFail({n: 0, until: now + 30000}, now), {n: 0, until: now + 30000}, "a wait still running");
  // the state round-trips through JSON (that is how it is stored)
  const s = failState(failState(null, now), now);
  assert.deepEqual(parseFail(JSON.parse(JSON.stringify(s)), now), s);
  // a wait is never longer than one lockout from now, whatever the stored value or the clock says
  assert.equal(parseFail({n: 0, until: now + 99_999_999}, now).until, now + 60000);
  for (const bad of [null, undefined, 5, "x", [], {}, {n: -1, until: 0}, {n: 1.5, until: 0}, {n: 5, until: 0}, {n: 99, until: 0}, {n: "a", until: 0}, {n: 1, until: -5}, {n: 1, until: NaN}, {n: 1, until: "z"}])
    assert.equal(parseFail(bad, now), null, JSON.stringify(bad));
  // restored state keeps counting: four stored failures plus one more start the wait
  const r = failState(parseFail({n: 4, until: 0}, now), now);
  assert.deepEqual(r, {n: 0, until: now + 60000});
  assert.equal(waitLeft(r, now), 60);
});
