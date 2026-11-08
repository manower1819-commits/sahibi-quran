import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {S} from "../src/surahs.js";
import {parseQuranText, quranTextComplete, splitBasmala} from "../src/quran-text.js";

const FILE = new URL("../public/quran-uthmani.txt", import.meta.url);
const letters = s => [...s].filter(c => /[ء-ؿف-يٱ]/.test(c)).map(c => c.codePointAt(0).toString(16)).join(" ");
const raw = readFileSync(FILE);
const txt = raw.toString("utf8");

test("the bundled Tanzil text is the unmodified download (checksum)", () => {
  // Tanzil's terms forbid changing the text. If this fails, the file was edited or replaced on purpose: re-verify it and update the hash.
  assert.equal(createHash("sha256").update(raw).digest("hex"), "6933e133dd56db778c801bf738848454e43648105a151e8d84d86a7cae39ec5f");
});

test("copyright and terms block is kept in the file", () => {
  assert.ok(txt.includes("Tanzil Quran Text (Uthmani, Version 1.1)"));
  assert.ok(txt.includes("License: Creative Commons Attribution 3.0"));
  assert.ok(txt.includes("CHANGING IT IS NOT ALLOWED"));
  assert.ok(txt.includes("tanzil.net"));
});

test("6236 ayat, every one of the app's surah table, none empty", () => {
  const m = parseQuranText(txt);
  assert.equal(m.size, 6236);
  assert.equal(quranTextComplete(m), true);
  for (let s = 1; s <= 114; s++) { assert.ok(m.has(s + ":1"), "first ayah of " + s); assert.ok(m.has(s + ":" + S[s - 1][2]), "last ayah of " + s); assert.ok(!m.has(s + ":" + (S[s - 1][2] + 1)), "no extra ayah in " + s); }
  assert.equal(letters(m.get("1:1")), "628 633 645 671 644 644 647 671 644 631 62d 645 646 671 644 631 62d 64a 645", "1:1 is the basmala");
});

test("parser ignores comments, blank lines and CRLF; completeness check rejects partial data", () => {
  const m = parseQuranText("# c\n\n1|1|a\r\n1|2|b|c\nbad line\n");
  assert.deepEqual([...m.entries()], [["1:1", "a"], ["1:2", "b|c"]]);
  assert.equal(quranTextComplete(m), false);
  const full = parseQuranText(txt); full.set("2:5", "  ");
  assert.equal(quranTextComplete(full), false, "an empty ayah makes it incomplete");
});

test("basmala is split off the first ayah of every surah except 1 and 9, and only there", () => {
  const m = parseQuranText(txt), B = m.get("1:1");
  for (let s = 1; s <= 114; s++) {
    const r = splitBasmala(s, 1, m.get(s + ":1"), B);
    if (s === 1 || s === 9) { assert.equal(r.basmala, null, "surah " + s); assert.equal(r.rest, m.get(s + ":1")); }
    else {
      assert.ok(r.basmala, "surah " + s + " basmala found"); assert.ok(r.rest.trim().length > 0, "surah " + s + " has text after it");
      assert.equal(r.basmala + " " + r.rest, m.get(s + ":1"), "nothing lost or changed in surah " + s);
    }
  }
  assert.equal(letters(splitBasmala(112, 1, m.get("112:1"), B).rest), "642 644 647 648 671 644 644 647 623 62d 62f", "112:1 is Qul huwa Allahu ahad");
  assert.equal(splitBasmala(27, 30, m.get("27:30"), B).basmala, null, "27:30 contains the basmala as part of the ayah: never split");
  assert.equal(splitBasmala(2, 2, m.get("2:2"), B).rest, m.get("2:2"));
});
