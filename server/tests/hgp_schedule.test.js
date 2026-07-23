const { validateWorkloadSchedules } = require('../utils/scheduleValidator');
const assert = require('assert');

console.log('=== Running ADVISORY Schedule Validation Tests ===');

// Test Case 1: Two ADVISORY rows in the same section sharing a time block (valid)
try {
  const workloadRowsCase1 = [
    { id: '1', subject: 'ADVISORY', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:30', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
    { id: '2', subject: 'ADVISORY', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:00', days: ['Fri'] }
  ];
  const res1 = validateWorkloadSchedules(workloadRowsCase1);
  assert.strictEqual(res1, null, 'Case 1 should be null (valid – same section ADVISORY overlap allowed)');
  console.log('✅ Test 1 Passed: ADVISORY rows in the same section sharing a time block are accepted.');
} catch (e) {
  console.error('❌ Test 1 Failed:', e.message);
  process.exit(1);
}

// Test Case 2: ADVISORY rows in DIFFERENT sections overlapping (valid — teacher not double-booked)
try {
  const workloadRowsCase2 = [
    { id: '1', subject: 'ADVISORY', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:30', days: ['Mon'] },
    { id: '2', subject: 'ADVISORY', category: 'JHS', sectionId: 'sec-102', startTime: '07:30', endTime: '08:30', days: ['Mon'] }
  ];
  const res2 = validateWorkloadSchedules(workloadRowsCase2);
  // Different sections – treated as a conflict (teacher cannot advise two sections at the same time)
  assert.notStrictEqual(res2, null, 'Case 2 should return conflict – different sections overlap');
  assert.strictEqual(res2.type, 'conflict');
  console.log('✅ Test 2 Passed: ADVISORY rows in different sections at the same time are correctly flagged as conflicts.');
} catch (e) {
  console.error('❌ Test 2 Failed:', e.message);
  process.exit(1);
}

// Test Case 3: Overlapping non-ADVISORY subjects (Regression Check)
try {
  const workloadRowsCase3 = [
    { id: '1', subject: 'MATHEMATICS', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:30', days: ['Mon'] },
    { id: '2', subject: 'SCIENCE', category: 'JHS', sectionId: 'sec-101', startTime: '08:00', endTime: '09:00', days: ['Mon'] }
  ];
  const res3 = validateWorkloadSchedules(workloadRowsCase3);
  assert.notStrictEqual(res3, null, 'Case 3 should return collision error');
  assert.strictEqual(res3.type, 'conflict');
  assert.ok(res3.error.includes('Schedule conflict'), 'Case 3 collision check');
  console.log('✅ Test 3 Passed: Standard subject collisions continue to be blocked as expected.');
} catch (e) {
  console.error('❌ Test 3 Failed:', e.message);
  process.exit(1);
}

// Test Case 4: No schedules (edge case)
try {
  const res4 = validateWorkloadSchedules([]);
  assert.strictEqual(res4, null, 'Case 4 should be null (empty array)');
  console.log('✅ Test 4 Passed: Empty workload array returns null (no conflicts).');
} catch (e) {
  console.error('❌ Test 4 Failed:', e.message);
  process.exit(1);
}

// Test Case 5: Non-overlapping subjects on different days
try {
  const workloadRowsCase5 = [
    { id: '1', subject: 'MATHEMATICS', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:30', days: ['Mon'] },
    { id: '2', subject: 'SCIENCE', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:30', days: ['Tue'] }
  ];
  const res5 = validateWorkloadSchedules(workloadRowsCase5);
  assert.strictEqual(res5, null, 'Case 5 should be null (different days)');
  console.log('✅ Test 5 Passed: Same time on different days is correctly accepted.');
} catch (e) {
  console.error('❌ Test 5 Failed:', e.message);
  process.exit(1);
}

// Test Case 6: HGP row nested within ADVISORY row time window for the same section (valid)
try {
  const workloadRowsCase6 = [
    { id: '1', subject: 'ADVISORY', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:30', days: ['M', 'T', 'W', 'TH', 'F'] },
    { id: '2', subject: 'HGP', category: 'JHS', sectionId: 'sec-101', startTime: '07:30', endTime: '08:30', days: ['F'] }
  ];
  const res6 = validateWorkloadSchedules(workloadRowsCase6);
  assert.strictEqual(res6, null, 'Case 6 should be null (HGP nested within ADVISORY in same section)');
  console.log('✅ Test 6 Passed: HGP row nested within ADVISORY time window in the same section is accepted.');
} catch (e) {
  console.error('❌ Test 6 Failed:', e.message);
  process.exit(1);
}

console.log('🎉 All ADVISORY & HGP Schedule Validation Tests Passed Successfully!');
