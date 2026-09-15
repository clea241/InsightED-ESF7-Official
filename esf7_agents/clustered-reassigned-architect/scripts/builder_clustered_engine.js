/**
 * Builder Agent: Clustered & Reassigned Personnel Workload & Conflict Engine
 * 
 * Implements the core business logic, timetable interval overlap detection,
 * dual-partition IndexedDB state transformation, and combined teaching duration math.
 */

class ClusteredReassignedEngine {
  /**
   * Convert time string 'HH:MM' (24-hour) to integer minutes from midnight.
   */
  static timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return 0;
    const hrs = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    return hrs * 60 + mins;
  }

  /**
   * Check if two time intervals on the same day overlap.
   * [startA, endA) and [startB, endB) overlap if startA < endB && startB < endA.
   */
  static intervalsOverlap(startA, endA, startB, endB) {
    const sA = this.timeToMinutes(startA);
    const eA = this.timeToMinutes(endA);
    const sB = this.timeToMinutes(startB);
    const eB = this.timeToMinutes(endB);
    return sA < eB && sB < eA;
  }

  /**
   * Normalize days array or string representation.
   */
  static normalizeDays(days) {
    if (Array.isArray(days)) return days.map(d => String(d).trim().toUpperCase());
    if (typeof days === 'string') {
      // Handles 'M, T, W' or 'M-T-W' or single day
      return days.split(/[,/-]/).map(d => d.trim().toUpperCase()).filter(Boolean);
    }
    return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  }

  /**
   * Check if two slot day allocations have at least one shared day.
   */
  static shareCommonDay(daysA, daysB) {
    const listA = this.normalizeDays(daysA);
    const listB = this.normalizeDays(daysB);
    return listA.some(dA => listB.includes(dA));
  }

  /**
   * Audit Clustered Personnel Workload for Cross-School Schedule Collisions.
   * Compares active school's `myWorkloadRows` against partner school's `sharedWorkloadRows`.
   * 
   * @param {Object} personnel - Personnel record
   * @param {Array} mySlots - Timetable slots assigned by active school
   * @param {Array} sharedSlots - Ghost/partner school timetable slots
   * @returns {Object} { isValid: boolean, conflicts: Array }
   */
  static auditClusteredWorkload(personnel, mySlots = [], sharedSlots = []) {
    const conflicts = [];
    if (!personnel || personnel.requestType !== 'clustered_teacher') {
      return { isValid: true, conflicts: [] };
    }

    mySlots.forEach((slotA, idxA) => {
      sharedSlots.forEach((slotB, idxB) => {
        const hasSharedDay = this.shareCommonDay(slotA.days || slotA.day, slotB.days || slotB.day);
        if (hasSharedDay) {
          const overlaps = this.intervalsOverlap(
            slotA.startTime || slotA.start_time,
            slotA.endTime || slotA.end_time,
            slotB.startTime || slotB.start_time,
            slotB.endTime || slotB.end_time
          );

          if (overlaps) {
            conflicts.push({
              mySlotIndex: idxA,
              sharedSlotIndex: idxB,
              mySubject: slotA.subject,
              sharedSubject: slotB.subject,
              partnerSchool: slotB.schoolName || 'Partner School',
              timeA: `${slotA.startTime || slotA.start_time}-${slotA.endTime || slotA.end_time}`,
              timeB: `${slotB.startTime || slotB.start_time}-${slotB.endTime || slotB.end_time}`,
              message: `Schedule conflict: ${slotA.subject} (${slotA.startTime || slotA.start_time}-${slotA.endTime || slotA.end_time}) collides with ${slotB.schoolName || 'Partner School'}'s ${slotB.subject} (${slotB.startTime || slotB.start_time}-${slotB.endTime || slotB.end_time}).`
            });
          }
        }
      });
    });

    return {
      isValid: conflicts.length === 0,
      conflicts
    };
  }

  /**
   * Audit Reassigned Personnel Workload.
   * Mother School MUST have 0 workload rows.
   * Host School MUST have >= 1 workload row (if certified).
   * 
   * @param {Object} personnel - Personnel record
   * @param {string} activeSchoolId - Current school ID checking certification
   * @param {Array} workloadRows - Assigned slots
   * @returns {Object} { isValid: boolean, error: string | null }
   */
  static auditReassignedWorkload(personnel, activeSchoolId, workloadRows = []) {
    if (!personnel || personnel.requestType !== 'reassigned_teacher') {
      return { isValid: true, error: null };
    }

    const isMotherSchool = (activeSchoolId === personnel.requesterSchoolId);

    if (isMotherSchool) {
      if (workloadRows.length > 0) {
        return {
          isValid: false,
          error: `Reassigned Personnel ${personnel.name || 'Teacher'} is deployed to another station and must have 0 workload rows in Mother School.`
        };
      }
      return { isValid: true, error: null };
    }

    // Host School check
    const isHostSchool = (activeSchoolId === personnel.targetSchoolId);
    if (isHostSchool) {
      if (workloadRows.length === 0) {
        return {
          isValid: false,
          error: `Reassigned Personnel ${personnel.name || 'Teacher'} must have an assigned teaching workload in Host School.`
        };
      }
      return { isValid: true, error: null };
    }

    return { isValid: true, error: null };
  }

  /**
   * Calculate Combined Teaching Minutes for Clustered Teachers.
   * Standard daily teaching load is 360 minutes (6.0 hours).
   */
  static calculateCombinedTeachingLoad(mySlots = [], sharedSlots = []) {
    const calculateMinutes = (slots) => {
      return (slots || []).reduce((acc, slot) => {
        if (slot.subject === 'HGP') return acc; // HGP is 0 min workload
        const s = ClusteredReassignedEngine.timeToMinutes(slot.startTime || slot.start_time);
        const e = ClusteredReassignedEngine.timeToMinutes(slot.endTime || slot.end_time);
        return acc + Math.max(0, e - s);
      }, 0);
    };

    const myMinutes = calculateMinutes(mySlots);
    const sharedMinutes = calculateMinutes(sharedSlots);
    const totalMinutes = myMinutes + sharedMinutes;
    const standardMinutes = 360; // 6.0 hours

    return {
      myMinutes,
      sharedMinutes,
      totalMinutes,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      standardMinutes,
      isWithinStandard: totalMinutes <= standardMinutes,
      overloadMinutes: Math.max(0, totalMinutes - standardMinutes)
    };
  }

  /**
   * Ghost Sync WebSocket Packet Serializer.
   */
  static createGhostSyncPacket(prn, authorSchoolId, authorSchoolName, slots) {
    return {
      event: 'CLUSTERED_SLOT_UPDATE',
      prn: String(prn).trim(),
      authorSchoolId: String(authorSchoolId).trim(),
      authorSchoolName: String(authorSchoolName).trim(),
      timestamp: Date.now(),
      slots: (slots || []).map(s => ({
        day: s.day || (Array.isArray(s.days) ? s.days[0] : 'MONDAY'),
        startTime: s.startTime || s.start_time,
        endTime: s.endTime || s.end_time,
        subject: s.subject,
        schoolId: String(authorSchoolId).trim(),
        schoolName: String(authorSchoolName).trim()
      }))
    };
  }
}

module.exports = ClusteredReassignedEngine;
