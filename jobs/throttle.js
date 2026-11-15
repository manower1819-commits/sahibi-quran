/* One teacher-triggered notification of each kind (remind / note) per child per hour: a teacher cannot flood a family. */
const WINDOW_MS = 60 * 60 * 1000;
const throttled = (last, now, windowMs = WINDOW_MS) => typeof last === "number" && now - last >= 0 && now - last < windowMs;
const fieldFor = kind => (kind === "note" ? "lastNoteAt" : "lastRemindAt");
module.exports = {throttled, fieldFor, WINDOW_MS};
