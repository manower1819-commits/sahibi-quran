import test from "node:test";
import assert from "node:assert/strict";
import {encode, decode, hasNestedArray} from "../src/codec.js";

const DAY = {stars: 2, items: [[79, 1, 46], [81, 1, 29]], weak: [79], pw: [583], notes: "ok"};
const KID = {name: "Sara", surahs: [112, 113], ranges: [[2, 255, 257], [67, 1, 20]], plan: {surahs: [], ranges: [[2, 1, 5]]}, joinReq: {hid: "h1", name: "x"}};

test("the app's own data has arrays inside arrays (which Firestore refuses)", () => {
  assert.equal(hasNestedArray(DAY), true);
  assert.equal(hasNestedArray(KID), true);
});
test("encode leaves nothing Firestore would refuse", () => {
  assert.equal(hasNestedArray(encode(DAY)), false);
  assert.equal(hasNestedArray(encode(KID)), false);
  assert.deepEqual(encode(DAY).items, [{_a: [79, 1, 46]}, {_a: [81, 1, 29]}]);
});
test("decode(encode(x)) gives back exactly x", () => {
  assert.deepEqual(decode(encode(DAY)), DAY);
  assert.deepEqual(decode(encode(KID)), KID);
  assert.deepEqual(decode(JSON.parse(JSON.stringify(encode(KID)))), KID, "also after a JSON round trip");
  const deep = {a: [[[1, 2], [3]], []], b: [[]]};
  assert.equal(hasNestedArray(encode(deep)), false);
  assert.deepEqual(decode(encode(deep)), deep);
});
test("data without nested arrays is unchanged, and old documents read back as they are", () => {
  const flat = {stars: 1, weak: [1, 2], tokens: ["a"], m: {x: [1]}};
  assert.deepEqual(encode(flat), flat);
  assert.deepEqual(decode(flat), flat);
  assert.deepEqual(decode({items: [1, 2, 3]}), {items: [1, 2, 3]});
});
test("only an object that is exactly {_a:[...]} is unwrapped", () => {
  assert.deepEqual(decode({_a: "text"}), {_a: "text"});
  assert.deepEqual(decode({_a: [1], other: 1}), {_a: [1], other: 1});
});
test("null, numbers, strings and Date-like objects pass through", () => {
  assert.equal(encode(null), null); assert.equal(decode(5), 5); assert.equal(decode("x"), "x");
  const d = new Date(0); assert.equal(encode(d), d); assert.equal(decode(d), d);
});
