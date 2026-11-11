/* Parser for the bundled Quran text: public/quran-uthmani.txt, Tanzil Quran Text (Uthmani, v1.1), copied verbatim.
   Format: lines "surah|ayah|text"; lines starting with # are the copyright block and are ignored here (the file keeps them). */
import {S} from "./surahs.js";
export const QURAN_TEXT_URL = "quran-uthmani.txt";
export function parseQuranText(txt) {
  const m = new Map();
  for (const l of String(txt).split("\n")) {
    if (!l || l[0] === "#") continue;
    const i = l.indexOf("|"), j = l.indexOf("|", i + 1);
    if (i > 0 && j > i) m.set(l.slice(0, i) + ":" + l.slice(i + 1, j), l.slice(j + 1).replace(/\r$/, ""));
  }
  return m;
}
/* the text is only used if every ayah of the app's own surah table is present and non-empty */
export function quranTextComplete(m) {
  if (m.size !== 6236) return false;
  for (let s = 1; s <= 114; s++) for (let a = 1; a <= S[s - 1][2]; a++) { const t = m.get(s + ":" + a); if (!t || !t.trim()) return false; }
  return true;
}

/* In the Tanzil file the first ayah of every surah except 1 and 9 starts with the basmala (4 words), spelled with a
   shadda on the first letter in surahs 95 and 97. For display it is shown as its own line, as in the mushaf.
   Only the text's display is split; no character is changed. Compares letters only (marks and tatweel ignored). */
const skel = w => w.replace(/[ً-ٰٟۖ-ۭـ]/g, "");
export function splitBasmala(surah, ayah, text, basmalaText) {
  if (ayah !== 1 || surah === 1 || surah === 9) return {basmala: null, rest: text};
  const w = text.split(" "), b = basmalaText.split(" ");
  if (w.length <= b.length || !b.every((x, i) => skel(w[i]) === skel(x))) return {basmala: null, rest: text};
  return {basmala: w.slice(0, b.length).join(" "), rest: w.slice(b.length).join(" ")};
}

/* Audio: islamic.network serves one file per ayah, numbered across the whole Quran (the same Hafs numbering as the text above). */
export const RECITERS=[["ar.husary",128,"rc_husary"],["ar.alafasy",128,"rc_alafasy"],["ar.minshawi",128,"rc_minshawi"],["ar.abdulbasitmurattal",192,"rc_abdulbasit"]];
export const AYAH0=(()=>{const a=[0];for(let i=0;i<114;i++)a.push(a[i]+S[i][2]);return a})(); // global number of ayah 1 of surah n = AYAH0[n-1]+1
export const ayahUrl=(rc,s,a)=>{const R=RECITERS.find(x=>x[0]===rc)||RECITERS[0];return "https://cdn.islamic.network/quran/audio/"+R[1]+"/"+R[0]+"/"+(AYAH0[s-1]+a)+".mp3"};
