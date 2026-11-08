import test from "node:test";
import assert from "node:assert/strict";
import {validPin, hashPin, makePin, checkPin, failState, waitLeft, lockExpired, LOCK_MS} from "../src/pin.js";

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
