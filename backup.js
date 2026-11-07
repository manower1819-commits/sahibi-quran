/* JSON backup of a parent's children and their daily records (no DOM, no network, unit-tested in test/backup.test.js).
   Export keeps only what the family owns; import treats the file as untrusted input and rebuilds every field. */
import {S} from "./surahs.js";

export const BACKUP_APP = "sahibi-quran";
export const BACKUP_VERSION = 1;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_KIDS = 30, MAX_DAYS = 4000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const int = (v, a, b) => { const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return Number.isInteger(n) && n >= a && n <= b ? n : null; };
const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const validDate = s => { const m = DATE.exec(s); if (!m) return false; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]; };
const aySpan = r => {
  if (!Array.isArray(r) || r.length !== 3) return null;
  const n = int(r[0], 1, 114); if (n == null) return null;
  const f = int(r[1], 1, S[n - 1][2]), t = f == null ? null : int(r[2], f, S[n - 1][2]);
  return t == null ? null : [n, f, t];
};

/* the keys of a day record that the family (not the teacher) owns: the same list as homeKeys() in firestore.rules */
export const HOME_DAY_KEYS = ["items", "stars", "weak", "extra", "nS", "nF", "nT", "notes"];

export function cleanKid(o) {
  if (!o || typeof o !== "object") return null;
  const name = str(o.name, 30).trim(); if (!name) return null;
  const surahs = [...new Set((Array.isArray(o.surahs) ? o.surahs : []).map(x => int(x, 1, 114)).filter(x => x != null))].sort((a, b) => a - b);
  const ranges = (Array.isArray(o.ranges) ? o.ranges : []).map(aySpan).filter(Boolean);
  const k = {
    name, gender: o.gender === "f" ? "f" : "m", theme: str(o.theme, 20) || "space", surahs, ranges,
    cycle: [1, 2, 3, 4, 6, 8, 12].includes(Number(o.cycle)) ? Number(o.cycle) : 1,
    light: int(o.light, -1, 6) == null ? 5 : int(o.light, -1, 6),
    weekStart: [0, 1, 6].includes(Number(o.weekStart)) ? Number(o.weekStart) : 6,
    self: o.self === true, look: int(o.look, 0, 50) || 0, skin: int(o.skin, 0, 20) == null ? 1 : int(o.skin, 0, 20),
  };
  if (str(o.palette, 20)) k.palette = str(o.palette, 20);
  if (int(o.age, 3, 99) != null) k.age = int(o.age, 3, 99);
  if (["kids", "teens", "adults"].includes(o.mode)) k.mode = o.mode;
  if (validDate(o.start)) k.start = o.start;
  if (typeof o.created === "number" && isFinite(o.created) && o.created > 0) k.created = Math.round(o.created);
  if (typeof o.gift === "string" && o.gift.trim()) k.gift = o.gift.trim().slice(0, 60);
  return k;
}

export function cleanDay(r) {
  if (!r || typeof r !== "object") return null;
  const d = {};
  if (Array.isArray(r.items)) d.items = r.items.map(aySpan).filter(Boolean);
  if (int(r.stars, 0, 3) != null) d.stars = int(r.stars, 0, 3);
  if (Array.isArray(r.weak)) d.weak = [...new Set(r.weak.map(x => int(x, 1, 114)).filter(x => x != null))];
  if (typeof r.extra === "string") d.extra = r.extra.slice(0, 200);
  if (typeof r.notes === "string") d.notes = r.notes.slice(0, 2000);
  if (int(r.nS, 1, 114) != null) d.nS = int(r.nS, 1, 114); else if (r.nS === "") d.nS = "";
  for (const f of ["nF", "nT"]) { if (int(r[f], 1, 286) != null) d[f] = int(r[f], 1, 286); else if (r[f] === "") d[f] = ""; }
  return Object.keys(d).length ? d : null;
}

/* kids: array of kid objects, days: {kidId: {date: record}} */
export function makeBackup(kids, days, now) {
  const out = [];
  for (const k of kids) {
    const ck = cleanKid(k); if (!ck) continue;
    const dd = {};
    Object.keys((days && days[k.id]) || {}).sort().forEach(date => { if (!validDate(date)) return; const c = cleanDay(days[k.id][date]); if (c) dd[date] = c; });
    out.push(Object.assign(ck, {days: dd}));
  }
  return {app: BACKUP_APP, version: BACKUP_VERSION, exported: new Date(now == null ? Date.now() : now).toISOString(), kids: out};
}

/* Parse text from a file. Returns {ok:true, kids:[{kid, days}], dropped} or {ok:false, err:"big"|"bad"} */
export function parseBackup(text) {
  if (typeof text !== "string" || text.length > MAX_FILE_BYTES) return {ok: false, err: "big"};
  let j; try { j = JSON.parse(text); } catch (e) { return {ok: false, err: "bad"}; }
  if (!j || j.app !== BACKUP_APP || !Array.isArray(j.kids) || !j.kids.length || j.kids.length > MAX_KIDS) return {ok: false, err: "bad"};
  if (!(Number(j.version) >= 1) || Number(j.version) > BACKUP_VERSION) return {ok: false, err: "bad"};
  const kids = []; let dropped = 0;
  for (const raw of j.kids) {
    const kid = cleanKid(raw); if (!kid) { dropped++; continue; }
    const days = {}; let n = 0;
    for (const date of Object.keys((raw && raw.days && typeof raw.days === "object") ? raw.days : {})) {
      if (n >= MAX_DAYS) break;
      if (!validDate(date)) continue;
      const c = cleanDay(raw.days[date]); if (c) { days[date] = c; n++; }
    }
    kids.push({kid, days});
  }
  return kids.length ? {ok: true, kids, dropped} : {ok: false, err: "bad"};
}
