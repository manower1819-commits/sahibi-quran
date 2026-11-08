import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const {throttled, fieldFor, WINDOW_MS} = createRequire(import.meta.url)("../jobs/throttle.js");

test("one hour window", () => {
  assert.equal(WINDOW_MS, 3600000);
  const t0 = 1_000_000_000;
  assert.equal(throttled(undefined, t0), false, "never notified");
  assert.equal(throttled(null, t0), false);
  assert.equal(throttled("x", t0), false, "garbage is ignored, not trusted");
  assert.equal(throttled(t0 - 1000, t0), true, "1 second ago");
  assert.equal(throttled(t0 - (WINDOW_MS - 1), t0), true);
  assert.equal(throttled(t0 - WINDOW_MS, t0), false, "exactly one hour: allowed again");
  assert.equal(throttled(t0 + 5000, t0), false, "a timestamp from the future (clock skew) does not block forever");
});
test("notes and reminders are throttled separately", () => {
  assert.equal(fieldFor("note"), "lastNoteAt");
  assert.equal(fieldFor("remind"), "lastRemindAt");
  assert.equal(fieldFor(undefined), "lastRemindAt");
  assert.notEqual(fieldFor("note"), fieldFor("remind"));
});
