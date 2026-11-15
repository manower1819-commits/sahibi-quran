/* Child-lock helpers: a 4-digit PIN kept as a salted SHA-256 hash, and a small lockout counter.
   This keeps a child out of the settings; it is not strong security (4 digits can be brute-forced by someone technical). */
export const validPin = p => /^\d{4}$/.test(String(p));
export async function hashPin(pin, salt) {
  const bytes = new TextEncoder().encode(salt + ":" + pin);
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), x => x.toString(16).padStart(2, "0")).join("");
}
export const newSalt = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), x => x.toString(16).padStart(2, "0")).join("");
export async function makePin(pin) { const s = newSalt(); return {s, h: await hashPin(pin, s)}; }
export async function checkPin(pin, rec) { return !!(rec && rec.s && rec.h) && validPin(pin) && (await hashPin(pin, rec.s)) === rec.h; }
/* after `max` wrong tries in a row the gate waits `waitMs`; returns the new state */
export function failState(st, now, max = 5, waitMs = 60000) {
  const n = ((st && st.n) || 0) + 1;
  return n >= max ? {n: 0, until: now + waitMs} : {n, until: (st && st.until) || 0};
}
/* a lockout state read back from storage: only a plausible one is kept, and the wait is never longer than waitMs from now (a wrong clock must not lock the settings for good) */
export function parseFail(raw, now, max = 5, waitMs = 60000) {
  if (!raw || typeof raw !== "object") return null;
  const n = Number(raw.n), until = Number(raw.until);
  if (!Number.isInteger(n) || n < 0 || n >= max || !Number.isFinite(until) || until < 0) return null;
  return {n, until: Math.min(until, now + waitMs)};
}
export const waitLeft = (st, now) => Math.max(0, Math.ceil((((st && st.until) || 0) - now) / 1000));
/* the settings lock closes after this long without any touch or key */
export const LOCK_MS = 5 * 60 * 1000;
export const lockExpired = (lastAct, now, ms = LOCK_MS) => now - lastAct > ms;
