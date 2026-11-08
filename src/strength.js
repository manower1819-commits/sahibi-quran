/* Pages the parent marked as mistaken on several different days recently: candidates for an extra review.
   days: {date: {pw:[page,...]}}. Returns [{page,count,last}] sorted by count, then by most recent. */
import {addDays} from "./planner.js";
export function pageStrugglers(days, today, opts) {
  const o = Object.assign({window: 21, min: 2}, opts || {}), from = addDays(today, -(o.window - 1)), by = {};
  for (const date of Object.keys(days || {})) {
    if (date < from || date > today) continue;
    const pw = days[date] && days[date].pw; if (!Array.isArray(pw)) continue;
    for (const p of new Set(pw)) { if (!Number.isInteger(p) || p < 1 || p > 604) continue; const e = by[p] || (by[p] = {page: p, count: 0, last: ""}); e.count++; if (date > e.last) e.last = date; }
  }
  return Object.values(by).filter(e => e.count >= o.min).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1) || a.page - b.page);
}
