/* Pages marked as mistaken (by the parent: pw, or by the teacher: tpw) on several different days recently: candidates for an extra review.
   A day counts once per page, whoever marked it. days: {date: {pw:[page,...], tpw:[page,...]}}. Returns [{page,count,last}] sorted by count, then by most recent. */
import {addDays} from "./planner.js";
export function pageStrugglers(days, today, opts) {
  const o = Object.assign({window: 21, min: 2}, opts || {}), from = addDays(today, -(o.window - 1)), by = {};
  for (const date of Object.keys(days || {})) {
    if (date < from || date > today) continue;
    const rec = days[date] || {}, pw = [].concat(Array.isArray(rec.pw) ? rec.pw : [], Array.isArray(rec.tpw) ? rec.tpw : []);
    if (!pw.length) continue;
    for (const p of new Set(pw)) { if (!Number.isInteger(p) || p < 1 || p > 604) continue; const e = by[p] || (by[p] = {page: p, count: 0, last: ""}); e.count++; if (date > e.last) e.last = date; }
  }
  return Object.values(by).filter(e => e.count >= o.min).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1) || a.page - b.page);
}
