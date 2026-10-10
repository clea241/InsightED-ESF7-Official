function normalizeDay(dayStr) {
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
}

function getRowDays(row) {
  if (!row) return [];
  const raw =
    Array.isArray(row.days) && row.days.length > 0
      ? row.days
      : typeof row.days === "string" && row.days.trim()
        ? row.days.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
        : row.daySchedule
          ? String(row.daySchedule).split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
          : [];
  return raw.map(normalizeDay);
}

function timeToMins(t) {
  if (!t || typeof t !== "string") return 99999;
  let str = t.trim();
  if (str.includes("-")) {
    str = str.split("-")[0].trim();
  }
  const upperStr = str.toUpperCase();
  const isPM = upperStr.includes("PM");
  const isAM = upperStr.includes("AM");
  const cleanStr = upperStr.replace(/[^\d:]/g, "");
  const parts = cleanStr.split(":");
  if (parts.length < 2 || isNaN(parseInt(parts[0], 10))) return 99999;

  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  if (!isPM && !isAM && hours >= 1 && hours < 6) {
    hours += 12;
  }

  return hours * 60 + minutes;
}

function isPerGradeSharedSlot(a, b) {
  if (!a || !b) return false;
  const secA = String(a.sectionId || a.section_id || "");
  const secB = String(b.sectionId || b.section_id || "");
  if (!secA || secA !== secB) return false;
  const gA = String(a.subjectGradeLevel || a.subject_grade_level || "").trim().toUpperCase();
  const gB = String(b.subjectGradeLevel || b.subject_grade_level || "").trim().toUpperCase();
  return Boolean(gA && gB && gA !== gB);
}

function isAdvisoryRow(row) {
  if (!row) return false;
  const sub = String(row.subject || row.task || "").trim().toUpperCase();
  return sub === "ADVISORY" || sub === "HGP" || sub.includes("HOMEROOM GUIDANCE");
}

/**
 * Returns true if the pair qualifies for the ADVISORY nested co-existence rule.
 * ADVISORY is permitted to overlap with other subjects, tasks, and HGP.
 * Two HGP rows, or HGP with regular subjects (e.g. SCIENCE), are NOT permitted to overlap.
 */
function isAdvisoryOrHgpPair(rA, rB) {
  if (!rA || !rB) return false;
  const subA = String(rA.subject || rA.task || "").trim().toUpperCase();
  const subB = String(rB.subject || rB.task || "").trim().toUpperCase();
  const isAdvA = subA === "ADVISORY";
  const isAdvB = subB === "ADVISORY";
  const isHgpA = subA === "HGP" || subA.includes("HOMEROOM GUIDANCE");
  const isHgpB = subB === "HGP" || subB.includes("HOMEROOM GUIDANCE");

  if (isAdvA || isAdvB) return true;
  if (isHgpA && isHgpB) return false;

  return false;
}

/**
 * Validates a list of workload rows for schedule conflicts.
 * Returns null if valid, or { error: string, type: string } if invalid.
 */
function validateWorkloadSchedules(rows) {
  if (!rows || !Array.isArray(rows)) return null;

  for (let i = 0; i < rows.length; i++) {
    const rowA = rows[i];
    if (!rowA) continue;
    const startA = rowA.startTime || rowA.start_time;
    const endA = rowA.endTime || rowA.end_time;
    const daysA = getRowDays(rowA);
    if (!startA || !endA || !daysA.length) continue;

    const nsA = timeToMins(startA);
    const neA = timeToMins(endA);
    if (nsA >= 99999 || neA >= 99999 || nsA < 0 || neA < 0 || nsA >= neA) continue;

    for (let j = i + 1; j < rows.length; j++) {
      const rowB = rows[j];
      if (!rowB) continue;

      if (rowA === rowB) continue;
      if (rowA.id && rowB.id && String(rowA.id) === String(rowB.id)) continue;

      // Stale/duplicate block in state
      const isDuplicate =
        String(rowA.subject || rowA.task || "").trim().toUpperCase() ===
          String(rowB.subject || rowB.task || "").trim().toUpperCase() &&
        String(rowA.sectionId || rowA.section_id || "").trim() ===
          String(rowB.sectionId || rowB.section_id || "").trim() &&
        startA === (rowB.startTime || rowB.start_time) &&
        endA === (rowB.endTime || rowB.end_time);
      if (isDuplicate) continue;

      // Term isolation
      const termA = rowA.term || "1st";
      const termB = rowB.term || "1st";
      if (termA !== termB) continue;

      // Scoping to same teacher if personnel IDs exist
      const pA = rowA.personnelId || rowA.personnel_id;
      const pB = rowB.personnelId || rowB.personnel_id;
      if (pA && pB && String(pA) !== String(pB)) continue;

      // Multigrade side-by-side slot sharing
      if (isPerGradeSharedSlot(rowA, rowB)) continue;

      const startB = rowB.startTime || rowB.start_time;
      const endB = rowB.endTime || rowB.end_time;
      const daysB = getRowDays(rowB);
      if (!startB || !endB || !daysB.length) continue;

      const sharedDays = daysA.filter((d) => daysB.includes(d));
      if (!sharedDays.length) continue;

      const nsB = timeToMins(startB);
      const neB = timeToMins(endB);
      if (nsB >= 99999 || neB >= 99999 || nsB < 0 || neB < 0 || nsB >= neB) continue;

      // Strictly open-interval overlap: StartA < EndB AND EndA > StartB
      if (nsA < neB && neA > nsB) {
        if (isAdvisoryOrHgpPair(rowA, rowB)) continue;

        // Collision detected
        const nameA = rowA.subject || rowA.task || "Subject A";
        const nameB = rowB.subject || rowB.task || "Subject B";
        const daysLabel = sharedDays.join(", ");
        return {
          error: `Schedule conflict: ${nameA} (${startA} - ${endA}) overlaps with ${nameB} (${startB} - ${endB}) on ${daysLabel}.`,
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
  isAdvisoryOrHgpPair,
  validateWorkloadSchedules,
  validateHgpWeeklyMinutes,
  getClusteredLocksForDay,
  validateCrossSchoolClusteredSchedules,
};
