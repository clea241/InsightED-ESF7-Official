function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = String(t).substring(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Returns true if the row represents an ADVISORY workload entry.
 * Only the exact subject "ADVISORY" qualifies.
 */
function isAdvisoryRow(row) {
  if (!row) return false;
  const sub = String(row.subject || row.task || '').trim().toUpperCase();
  return sub === 'ADVISORY' || sub === 'HGP' || sub.includes('HOMEROOM GUIDANCE');
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

      const daysOverlap = daysA.some(d => daysB.includes(d));
      if (!daysOverlap) continue;

      const nsB = timeToMins(startB);
      const neB = timeToMins(endB);

      // Overlap condition: StartA < EndB AND EndA > StartB
      if (nsA < neB && neA > nsB) {
        const isAAdvisory = isAdvisoryRow(rowA);
        const isBAdvisory = isAdvisoryRow(rowB);

        // Two ADVISORY rows for the same section are allowed to share time
        if (isAAdvisory && isBAdvisory) {
          const secA = String(rowA.section_id || rowA.sectionId || '');
          const secB = String(rowB.section_id || rowB.sectionId || '');
          if (secA && secB && secA === secB) continue;
        }

        // Collision detected
        const nameA = rowA.subject || rowA.task || 'Subject A';
        const nameB = rowB.subject || rowB.task || 'Subject B';
        return {
          error: `Schedule conflict: ${nameA} (${startA} - ${endA}) overlaps with ${nameB} (${startB} - ${endB}).`,
          type: 'conflict'
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
    const sub = String(row.subject || row.task || '').trim().toUpperCase();
    if (sub === 'HGP' || sub.includes('HOMEROOM GUIDANCE')) {
      const start = row.startTime || row.start_time;
      const end = row.endTime || row.end_time;
      const days = row.days || (row.daySchedule ? String(row.daySchedule).split(',').map(s => s.trim()) : []);
      if (!start || !end || !days.length) continue;
      const dailyMins = timeToMins(end) - timeToMins(start);
      const weeklyMins = dailyMins * days.length;
      if (weeklyMins !== 60) {
        return {
          error: `HGP Policy Violation: Homeroom Guidance (HGP) must total exactly 60 minutes per week (Current: ${dailyMins} mins/day × ${days.length} days = ${weeklyMins} mins/week).`,
          type: 'hgp_weekly_error'
        };
      }
    }
  }
  return null;
}

module.exports = {
  timeToMins,
  isAdvisoryRow,
  validateWorkloadSchedules,
  validateHgpWeeklyMinutes
};
