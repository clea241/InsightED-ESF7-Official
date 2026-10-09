function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = String(t).substring(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Returns true if the row represents an ADVISORY workload entry.
 * Only the exact subject "ADVISORY" qualifies.
 */
function isAdvisoryRow(row) {
  if (!row) return false;
  const sub = String(row.subject || row.task || "")
    .trim()
    .toUpperCase();
  return (
    sub === "ADVISORY" || sub === "HGP" || sub.includes("HOMEROOM GUIDANCE")
  );
}

/**
 * Validates a list of workload rows for schedule conflicts.
 * Returns null if valid, or { error: string, type: string } if invalid.
 *
 * Note: ADVISORY rows are allowed to overlap with other ADVISORY rows
 * belonging to the same section (they share the same time block).
 * All other overlapping pairs are treated as conflicts.
 */
function validateWorkloadSchedules(rows) {
  if (!rows || !Array.isArray(rows)) return null;

  for (let i = 0; i < rows.length; i++) {
    const rowA = rows[i];
    const startA = rowA.startTime || rowA.start_time;
    const endA = rowA.endTime || rowA.end_time;
    const daysA = rowA.days || [];
    if (!startA || !endA || !daysA.length) continue;

    const nsA = timeToMins(startA);
    const neA = timeToMins(endA);

    for (let j = i + 1; j < rows.length; j++) {
      const rowB = rows[j];
      const startB = rowB.startTime || rowB.start_time;
      const endB = rowB.endTime || rowB.end_time;
      const daysB = rowB.days || [];
      if (!startB || !endB || !daysB.length) continue;

      const daysOverlap = daysA.some((d) => daysB.includes(d));
      if (!daysOverlap) continue;

      const nsB = timeToMins(startB);
      const neB = timeToMins(endB);

      // Overlap condition: StartA < EndB AND EndA > StartB
      if (nsA < neB && neA > nsB) {
        const isAAdvisory = isAdvisoryRow(rowA);
        const isBAdvisory = isAdvisoryRow(rowB);

        // Two ADVISORY rows for the same section are allowed to share time
        if (isAAdvisory && isBAdvisory) {
          const secA = String(rowA.section_id || rowA.sectionId || "");
          const secB = String(rowB.section_id || rowB.sectionId || "");
          if (secA && secB && secA === secB) continue;
        }

        // Collision detected
        const nameA = rowA.subject || rowA.task || "Subject A";
        const nameB = rowB.subject || rowB.task || "Subject B";
        return {
          error: `Schedule conflict: ${nameA} (${startA} - ${endA}) overlaps with ${nameB} (${startB} - ${endB}).`,
          type: "conflict",
        };
      }
    }
  }

  return null;
}

/**
 * Validates that any HGP rows for a section total exactly 60 minutes per week.
 */
function validateHgpWeeklyMinutes(rows) {
  if (!rows || !Array.isArray(rows)) return null;
  for (const row of rows) {
    const sub = String(row.subject || row.task || "")
      .trim()
      .toUpperCase();
    if (sub === "HGP" || sub.includes("HOMEROOM GUIDANCE")) {
      const start = row.startTime || row.start_time;
      const end = row.endTime || row.end_time;
      const days =
        row.days ||
        (row.daySchedule
          ? String(row.daySchedule)
              .split(",")
              .map((s) => s.trim())
          : []);
      if (!start || !end || !days.length) continue;
      const dailyMins = timeToMins(end) - timeToMins(start);
      const weeklyMins = dailyMins * days.length;
      if (weeklyMins !== 60) {
        return {
          error: `HGP Policy Violation: Homeroom Guidance (HGP) must total exactly 60 minutes per week (Current: ${dailyMins} mins/day × ${days.length} days = ${weeklyMins} mins/week).`,
          type: "hgp_weekly_error",
        };
      }
    }
  }
  return null;
}

/**
 * Computes effective ghost locks for a clustered teacher on a given day:
 * 1. Individual ghost slots from partner school(s).
 * 2. Sandwich gap transit lockouts (gap between partner classes on the same day <= maxGapMinutes, default 120 mins).
 */
function getClusteredLocksForDay(
  ghostRows = [],
  dayCode = "M",
  maxGapMinutes = 120,
) {
  if (!Array.isArray(ghostRows) || ghostRows.length === 0) {
    return { ghostSlots: [], transitGapSlots: [], allLockedIntervals: [] };
  }

  const normalizeGhostDay = (dayStr) => {
    if (!dayStr) return "M";
    const u = String(dayStr).trim().toUpperCase();
    if (u === "M" || u.startsWith("MON")) return "M";
    if (u === "TH" || u.startsWith("THU")) return "TH";
    if (u === "T" || u.startsWith("TUE")) return "T";
    if (u === "W" || u.startsWith("WED")) return "W";
    if (u === "F" || u.startsWith("FRI")) return "F";
    if (u === "SAT" || u.startsWith("SAT")) return "SAT";
    if (u === "SUN" || u.startsWith("SUN")) return "SUN";
    return u;
  };

  const dayGhosts = [];
  ghostRows.forEach((g, idx) => {
    const rawDays =
      Array.isArray(g.days) && g.days.length > 0
        ? g.days
        : g.day
          ? [g.day]
          : ["M", "T", "W", "TH", "F"];
    const normDays = rawDays.map(normalizeGhostDay);
    if (!normDays.includes(dayCode)) return;

    const sMins = timeToMins(g.startTime || g.start_time || "");
    const eMins = timeToMins(g.endTime || g.end_time || "");
    if (sMins < 99999 && eMins < 99999 && eMins > sMins) {
      dayGhosts.push({
        ...g,
        idx,
        sMins,
        eMins,
        diffMins: eMins - sMins,
      });
    }
  });

  dayGhosts.sort((a, b) => a.sMins - b.sMins || a.eMins - b.eMins);

  const transitGapSlots = [];
  for (let i = 0; i < dayGhosts.length - 1; i++) {
    const cur = dayGhosts[i];
    const next = dayGhosts[i + 1];

    const gapStart = cur.eMins;
    const gapEnd = next.sMins;
    const gapMins = gapEnd - gapStart;

    if (gapMins > 0 && gapMins <= maxGapMinutes) {
      transitGapSlots.push({
        isTransitGap: true,
        sMins: gapStart,
        eMins: gapEnd,
        diffMins: gapMins,
        schoolName: cur.schoolName || next.schoolName || "Partner Station",
        prevSubject: cur.subject || "Class",
        nextSubject: next.subject || "Class",
      });
    }
  }

  const allLockedIntervals = [
    ...dayGhosts.map((g) => ({
      sMins: g.sMins,
      eMins: g.eMins,
      type: "ghost",
      item: g,
    })),
    ...transitGapSlots.map((t) => ({
      sMins: t.sMins,
      eMins: t.eMins,
      type: "transit_gap",
      item: t,
    })),
  ];

  return {
    ghostSlots: dayGhosts,
    transitGapSlots,
    allLockedIntervals,
  };
}

/**
 * Validates cross-school schedule conflicts with partner school ghost slots and transit gaps (<= 2h).
 */
function validateCrossSchoolClusteredSchedules(
  localRows,
  ghostRows,
  maxGapMinutes = 120,
) {
  if (
    !localRows ||
    !Array.isArray(localRows) ||
    !ghostRows ||
    !Array.isArray(ghostRows) ||
    ghostRows.length === 0
  ) {
    return null;
  }

  for (const row of localRows) {
    const start = row.startTime || row.start_time;
    const end = row.endTime || row.end_time;
    const days =
      row.days ||
      (row.daySchedule
        ? String(row.daySchedule)
            .split(",")
            .map((s) => s.trim())
        : ["M", "T", "W", "TH", "F"]);
    if (!start || !end || !days.length) continue;

    const sMins = timeToMins(start);
    const eMins = timeToMins(end);
    if (sMins >= eMins) continue;

    for (const day of days) {
      const { allLockedIntervals } = getClusteredLocksForDay(
        ghostRows,
        day,
        maxGapMinutes,
      );
      for (const lock of allLockedIntervals) {
        if (sMins < lock.eMins && eMins > lock.sMins) {
          if (lock.type === "transit_gap") {
            return {
              error: `Cross-School Transit Conflict: ${row.subject || "Subject"} (${start} - ${end}) falls within a ≤2h sandwich gap stationed at ${lock.item.schoolName}.`,
              type: "transit_conflict",
            };
          }
          return {
            error: `Cross-School Conflict: ${row.subject || "Subject"} (${start} - ${end}) overlaps with ${lock.item.subject || "partner class"} at ${lock.item.schoolName || "partner station"}.`,
            type: "cross_school_conflict",
          };
        }
      }
    }
  }

  return null;
}

module.exports = {
  timeToMins,
  isAdvisoryRow,
  validateWorkloadSchedules,
  validateHgpWeeklyMinutes,
  getClusteredLocksForDay,
  validateCrossSchoolClusteredSchedules,
};
