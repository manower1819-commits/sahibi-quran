import test from "node:test";
import assert from "node:assert/strict";
import {S} from "../src/surahs.js";
import {I} from "../src/i18n.js";
import {juzCoverage, juzOf, JUZ_START} from "../src/juz.js";

test("every i18n key exists in both Arabic and English", () => {
  const ar = Object.keys(I.ar), en = Object.keys(I.en);
  assert.deepEqual(ar.filter(k => !(k in I.en)), [], "keys missing from English");
  assert.deepEqual(en.filter(k => !(k in I.ar)), [], "keys missing from Arabic");
});

test("no empty translation values", () => {
  for (const lang of ["ar", "en"]) for (const [k, v] of Object.entries(I[lang])) assert.ok(String(v).trim().length > 0, `${lang}.${k}`);
});

test("surah table sanity (names and ayah counts)", () => {
  assert.equal(S[0][2], 7, "Al-Fatihah");
  assert.equal(S[1][2], 286, "Al-Baqarah");
  assert.equal(S[113][2], 6, "An-Nas");
  for (const [ar, en, n] of S) { assert.ok(ar && en && n > 0); }
});

test("juz table covers every ayah exactly once", () => {
  assert.equal(JUZ_START.length, 30);
  const cov = juzCoverage(Array.from({length: 114}, (_, i) => i + 1));
  assert.equal(cov.length, 30);
  assert.equal(cov.reduce((a, c) => a + c.total, 0), 6236);
  assert.equal(juzOf(1, 1), 0);
  assert.equal(juzOf(114, 6), 29);
  assert.equal(juzOf(2, 142), 1, "juz 2 starts at 2:142");
  assert.equal(juzOf(2, 141), 0);
});
