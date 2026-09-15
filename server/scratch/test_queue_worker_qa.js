const db = require('../db');
const queueWorker = require('../queue_worker');

async function testQueueWorkerLogging() {
  console.log('🧪 [Queue Worker QA Verifier]: Testing Ingestion Stage Checkpoints...');

  const mockPayload = {
    schoolInfo: {
      schoolId: '888001',
      schoolName: 'QA Test Elementary School',
      hasElemSpecialPrograms: true,
      hasJhsSpecialPrograms: false,
      jhsSpecialPrograms: ['SNED-ES'],
      shsCurriculumModel: 'Standard Model'
    },
    personnel: [
      {
        id: 'PER-888001-001',
        prn: 'PRN-QA-888001-001',
        firstName: 'Juan',
        middleName: 'Dela',
        lastName: 'Cruz',
        salutation: 'MR.',
        type: 'teaching',
        position: 'TEACHER III',
        stepIncrement: 3,
        fundSource: 'NATIONAL',
        natureOfAppointment: 'REGULAR PERMANENT',
        hiringArrangement: 'REGULAR',
        isSchoolHead: false,
        noPhilsys: true,
        noTin: true,
        eligibility: ['LICENSURE EXAMINATION FOR TEACHERS'],
        highestEducationalAttainment: 'COLLEGE GRADUATE / BACCALAUREATE',
        collegeDegree: 'BACHELOR OF ELEMENTARY EDUCATION',
        learningAreaMap: { 'KEY_STAGE_1': ['ENGLISH', 'MATH'] },
        neapTrainingRows: [{ title: 'NEAP Early Math Literacy', startDate: '2026-06-01', endDate: '2026-06-03', days: 3, totalHours: 24 }],
        designations: [{ designationName: 'Math Coordinator', isSdsApproved: true }],
        workloadRows: [
          {
            gradeLevel: 'Grade 3',
            sectionName: 'Mabini',
            subject: 'MATHEMATICS',
            startTime: '08:00',
            endTime: '09:00',
            days: ['M', 'T', 'W', 'TH', 'F']
          }
        ]
      }
    ],
    classSections: [
      {
        id: 'SEC-888001-001',
        gradeLevel: 'Grade 3',
        sectionName: 'Mabini',
        sectionType: 'MONO GRADE',
        adviserId: 'PER-888001-001',
        maleLearners: 18,
        femaleLearners: 17,
        numberOfLearners: 35
      }
    ],
    allowancesMap: {
      'PER-888001-001': {
        hasPera: true,
        peraAmount: 2000,
        hasUniform: true,
        uniformAmount: 7000,
        hasSupplies: true,
        suppliesAmount: 10000,
        hasMedical: true,
        medicalAmount: 7000,
        hasHardship: false,
        hardshipAmount: 0
      }
    },
    workloadTransfers: []
  };

  try {
    // 1. Insert mock job in esf7_submission_queue
    const insertRes = await db.query(
      `INSERT INTO esf7_submission_queue (
         school_id, school_year, payload, signature, certified_by, status
       ) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      ['888001', '2026-2027', JSON.stringify(mockPayload), 'SIG-QA-TEST', 'QA Auditor']
    );

    const testJobId = insertRes.rows[0].id;
    console.log(`📦 [Queue Worker QA]: Created test queue job #${testJobId} for School 888001`);

    // 2. Process job directly through queueWorker
    const success = await queueWorker.processJobById(testJobId);
    console.log(`\n🎯 [Queue Worker QA]: Process result ➔ ${success ? 'SUCCESS' : 'FAILED'}`);

    // 3. Verify status in database
    const verifyRes = await db.query('SELECT id, status, error_message FROM esf7_submission_queue WHERE id = $1', [testJobId]);
    console.log(`📋 [Queue Worker QA]: DB Verification Status:`, verifyRes.rows[0]);

    // 4. Cleanup test rows to keep DB 100% clean
    await db.query('DELETE FROM esf7_personnel_allowances WHERE school_id = $1', ['888001']);
    await db.query('DELETE FROM esf7_workload_rows WHERE school_id = $1', ['888001']);
    await db.query('DELETE FROM esf7_regular_sections WHERE school_id = $1', ['888001']);
    await db.query('DELETE FROM esf7_personnel_profile WHERE school_id = $1', ['888001']);
    await db.query('DELETE FROM esf7_school_profile WHERE school_id = $1', ['888001']);
    await db.query('DELETE FROM esf7_submission_queue WHERE id = $1', [testJobId]);
    console.log('🧹 [Queue Worker QA]: Ephemeral test rows cleaned up successfully.');

  } catch (err) {
    console.error('❌ [Queue Worker QA Error]:', err.message);
  } finally {
    process.exit(0);
  }
}

testQueueWorkerLogging();
