/* Firestore refuses an array directly inside another array ("Nested arrays are not supported").
   The app's day items ([[surah,from,to],...]) and plan ranges are exactly that shape, so on the way to Firestore every
   inner array is wrapped as {_a:[...]} (an array inside a map inside an array is allowed) and unwrapped on the way back.
   The rest of the app never sees the wrapped form. Only plain objects and arrays are walked. */
const plain = v => v && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
export function encode(v) {
  if (Array.isArray(v)) return v.map(x => Array.isArray(x) ? {_a: encode(x)} : encode(x));
  if (plain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
export function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (plain(v)) {
    const ks = Object.keys(v);
    if (ks.length === 1 && ks[0] === "_a" && Array.isArray(v._a)) return decode(v._a);
    return Object.fromEntries(ks.map(k => [k, decode(v[k])]));
  }
  return v;
}
/* true when no array sits directly inside another array anywhere in the value */
export function hasNestedArray(v) {
  if (Array.isArray(v)) return v.some(x => Array.isArray(x) || hasNestedArray(x));
  if (plain(v)) return Object.values(v).some(hasNestedArray);
  return false;
}
