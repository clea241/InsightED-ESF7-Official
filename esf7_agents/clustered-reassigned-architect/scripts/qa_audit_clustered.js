/**
 * QA Auditor Agent: Test Suite for Clustered & Reassigned Architecture
 * 
 * Runs comprehensive edge case tests and reports precise assertion failures.
 */

const ClusteredReassignedEngine = require('./builder_clustered_engine');

class QAAuditorClustered {
  constructor() {
    this.results = [];
    this.failures = [];
  }

  assert(testName, actual, expected, details = '') {
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    const record = {
      testName,
      passed,
      actual,
      expected,
      details
    };
    this.results.push(record);
    if (!passed) {
      this.failures.push(record);
    }
    return passed;
  }

  runAllTests() {
    this.results = [];
    this.failures = [];

    // ----------------------------------------------------
    // TEST 1: Reassigned Mother School has 0 Workload (PASS)
    // ----------------------------------------------------
    const reassignedTeacher = {
      name: 'Maria Santos',
      prn: '10092831',
      requestType: 'reassigned_teacher',
      requesterSchoolId: '100115', // Mother School
      targetSchoolId: '100120'    // Host School
    };

    const res1 = ClusteredReassignedEngine.auditReassignedWorkload(reassignedTeacher, '100115', []);
    this.assert(
      'Reassigned in Mother School with 0 workload rows must be VALID',
      res1.isValid,
      true,
      res1.error
    );

    // ----------------------------------------------------
    // TEST 2: Reassigned Mother School assigns workload (FAIL)
    // ----------------------------------------------------
    const badWorkload = [{ subject: 'Math 7', startTime: '08:00', endTime: '09:00' }];
    const res2 = ClusteredReassignedEngine.auditReassignedWorkload(reassignedTeacher, '100115', badWorkload);
    this.assert(
      'Reassigned in Mother School with >0 workload rows must be BLOCKED',
      res2.isValid,
      false,
      'Must block saving workload in Mother School for reassigned-out personnel'
    );

    // ----------------------------------------------------
    // TEST 3: Reassigned Host School assigns workload (PASS)
    // ----------------------------------------------------
    const res3 = ClusteredReassignedEngine.auditReassignedWorkload(reassignedTeacher, '100120', badWorkload);
    this.assert(
      'Reassigned in Host School with valid workload rows must be VALID',
      res3.isValid,
      true,
      res3.error
    );

    // ----------------------------------------------------
    // TEST 4: Reassigned Host School with 0 workload (FAIL)
    // ----------------------------------------------------
    const res4 = ClusteredReassignedEngine.auditReassignedWorkload(reassignedTeacher, '100120', []);
    this.assert(
      'Reassigned in Host School with 0 workload rows must be BLOCKED',
      res4.isValid,
      false,
      'Host school must assign teaching load to reassigned-in personnel'
    );

    // ----------------------------------------------------
    // TEST 5: Clustered Cross-School Direct Time Collision (FAIL)
    // ----------------------------------------------------
    const clusteredTeacher = {
      name: 'Pedro Penduko',
      prn: '20048192',
      requestType: 'clustered_teacher',
      requesterSchoolId: '100115',
      targetSchoolId: '100120'
    };

    const schoolASlots = [
      { day: 'MONDAY', startTime: '08:00', endTime: '09:00', subject: 'Math 7' }
    ];
    const schoolBSlotsOverlap = [
      { day: 'MONDAY', startTime: '08:30', endTime: '09:30', subject: 'Science 7', schoolName: 'Mabini High' }
    ];

    const res5 = ClusteredReassignedEngine.auditClusteredWorkload(clusteredTeacher, schoolASlots, schoolBSlotsOverlap);
    this.assert(
      'Clustered teacher cross-school time overlap on same day must be FLAGGED as CONFLICT',
      res5.isValid,
      false,
      res5.conflicts[0] ? res5.conflicts[0].message : ''
    );

    // ----------------------------------------------------
    // TEST 6: Clustered Cross-School Non-Overlapping Same Day (PASS)
    // ----------------------------------------------------
    const schoolBSlotsNoOverlap = [
      { day: 'MONDAY', startTime: '10:00', endTime: '11:00', subject: 'Science 7', schoolName: 'Mabini High' }
    ];
    const res6 = ClusteredReassignedEngine.auditClusteredWorkload(clusteredTeacher, schoolASlots, schoolBSlotsNoOverlap);
    this.assert(
      'Clustered teacher non-overlapping times on same day must be VALID',
      res6.isValid,
      true,
      'No collisions found'
    );

    // ----------------------------------------------------
    // TEST 7: Clustered Cross-School Same Time on Different Days (PASS)
    // ----------------------------------------------------
    const schoolBSlotsDiffDay = [
      { day: 'TUESDAY', startTime: '08:00', endTime: '09:00', subject: 'Science 7', schoolName: 'Mabini High' }
    ];
    const res7 = ClusteredReassignedEngine.auditClusteredWorkload(clusteredTeacher, schoolASlots, schoolBSlotsDiffDay);
    this.assert(
      'Clustered teacher same time on different days must be VALID',
      res7.isValid,
      true,
      'Different days should not collide'
    );

    // ----------------------------------------------------
    // TEST 8: Combined Teaching Duration Math (Standard 360 mins)
    // ----------------------------------------------------
    const slotsA = [
      { startTime: '08:00', endTime: '09:00', subject: 'Math 7' }, // 60 mins
      { startTime: '09:00', endTime: '11:00', subject: 'English 7' } // 120 mins = 180 mins total A
    ];
    const slotsB = [
      { startTime: '13:00', endTime: '15:00', subject: 'Science 7' }, // 120 mins
      { startTime: '15:00', endTime: '16:00', subject: 'AP 7' } // 60 mins = 180 mins total B
    ];
    const mathRes = ClusteredReassignedEngine.calculateCombinedTeachingLoad(slotsA, slotsB);
    this.assert(
      'Combined load calculation sums minutes accurately to 360m (6.0 hrs)',
      { totalMinutes: mathRes.totalMinutes, totalHours: mathRes.totalHours, overloadMinutes: mathRes.overloadMinutes },
      { totalMinutes: 360, totalHours: 6.0, overloadMinutes: 0 },
      '180 mins School A + 180 mins School B = 360 mins total'
    );

    // ----------------------------------------------------
    // TEST 9: HGP 0-minute exclusion in Clustered Combined Math
    // ----------------------------------------------------
    const slotsWithHGP = [
      { startTime: '08:00', endTime: '09:00', subject: 'Math 7' },
      { startTime: '11:00', endTime: '12:00', subject: 'HGP' } // HGP is 0 min
    ];
    const mathHGP = ClusteredReassignedEngine.calculateCombinedTeachingLoad(slotsWithHGP, []);
    this.assert(
      'HGP is strictly counted as 0 minutes in combined teaching load calculation',
      mathHGP.totalMinutes,
      60,
      'Only Math 7 (60m) is counted, HGP (60m block) is 0m workload'
    );

    // ----------------------------------------------------
    // TEST 10: Ghost Sync Packet Serialization
    // ----------------------------------------------------
    const packet = ClusteredReassignedEngine.createGhostSyncPacket('10029384', '100115', 'Rizal High', schoolASlots);
    this.assert(
      'Ghost Sync WebSocket packet serializes event and attributes correctly',
      { event: packet.event, prn: packet.prn, authorSchoolId: packet.authorSchoolId, slotsCount: packet.slots.length },
      { event: 'CLUSTERED_SLOT_UPDATE', prn: '10029384', authorSchoolId: '100115', slotsCount: 1 },
      'Packet contains standard CLUSTERED_SLOT_UPDATE schema'
    );

    return {
      total: this.results.length,
      passed: this.results.filter(r => r.passed).length,
      failed: this.failures.length,
      failures: this.failures
    };
  }
}

module.exports = QAAuditorClustered;
