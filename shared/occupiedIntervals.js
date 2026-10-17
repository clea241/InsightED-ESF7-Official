// Occupied-time helpers for the Add Schedule Slot dialog: which minutes of the day a teacher already has taken on
// a set of days. Times are minutes since midnight; an interval is [start, end) so back-to-back slots do not overlap
// (a block ending at 10:45 AM does not block a new one starting at 10:45 AM).

// Exact 24-hour "HH:MM" (or "HH:MM:SS") -> minutes; 99999 when it is not that format.
export const hhmmToMins = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 99999;
};

const dayList = (days) =>
  (Array.isArray(days)
    ? days
    : String(days || "")
        .split(/[,;\s]+/)
        .filter(Boolean)
  ).map((d) => String(d).trim().toUpperCase());

/**
 * Merged occupied intervals for `rows` on any of `days`.
 * rows: [{ startTime, endTime, days }]; toMins parses a row's time text (defaults to exact HH:MM).
 */
export const occupiedIntervals = (rows, days, toMins = hhmmToMins) => {
  const wanted = dayList(days);
  if (wanted.length === 0) return [];
  const list = [];
  for (const r of rows || []) {
    if (!r) continue;
    const s = toMins(r.startTime);
    const e = toMins(r.endTime);
    if (!(s < 99999 && e < 99999 && e > s)) continue;
    if (!dayList(r.days).some((d) => wanted.includes(d))) continue;
    list.push([s, e]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of list) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
};

// True when [start, end) overlaps any interval.
export const overlapsAny = (start, end, intervals) =>
  (intervals || []).some(([s, e]) => start < e && end > s);
