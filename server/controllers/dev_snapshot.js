/**
 * InsightED ESF7 - School Relational Snapshot & Health Endpoint
 * Returns a comprehensive, read-only graph of all relational entities,
 * section tallies, workload distributions, allowances, and foreign key orphan checks for a given school.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/snapshot/:schoolId', async (req, res) => {
  const { schoolId } = req.params;
  const { schoolYear } = req.query;

  const syClause = schoolYear ? 'AND school_year = $2' : '';
  const params = schoolYear ? [schoolId, schoolYear] : [schoolId];

  try {
    // 1. School Profile
    const profileRes = await db.query(
      `SELECT * FROM esf7_school_profile WHERE school_id = $1 ${syClause} LIMIT 1`,
      params
    );
    const profile = profileRes.rows[0] || null;

    // 2. Personnel Summary
    const personnelRes = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN type = 'teaching' THEN 1 END) as teaching,
        COUNT(CASE WHEN type != 'teaching' THEN 1 END) as non_teaching,
        COUNT(CASE WHEN is_school_head = true THEN 1 END) as school_heads
       FROM esf7_personnel_profile 
       WHERE school_id = $1 ${syClause}`,
      params
    );
    const personnel = personnelRes.rows[0];

    // 3. Sections Summary
    const regularSectionsRes = await db.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(number_of_learners), 0) as total_learners,
              COALESCE(SUM(male_learners), 0) as male, COALESCE(SUM(female_learners), 0) as female
       FROM esf7_regular_sections 
       WHERE school_id = $1 ${syClause}`,
      params
    );
    const aralSectionsRes = await db.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(total_learners), 0) as total_learners
       FROM esf7_aral_sections 
       WHERE school_id = $1 ${syClause}`,
      params
    );
    const remedialSectionsRes = await db.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(total_learners), 0) as total_learners
       FROM esf7_remedial_enrichment_sections 
       WHERE school_id = $1 ${syClause}`,
      params
    );

    // 4. Workloads Summary
    const elemWorkloadsRes = await db.query(
      `SELECT COUNT(*) as total FROM esf7_workload_rows WHERE school_id = $1 ${syClause}`,
      params
    );
    const shsWorkloadsRes = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN term = '1st' OR term = 'Term 1' THEN 1 END) as term1,
        COUNT(CASE WHEN term = '2nd' OR term = 'Term 2' THEN 1 END) as term2,
        COUNT(CASE WHEN term = '3rd' OR term = 'Term 3' THEN 1 END) as term3
       FROM esf7_shs_workload_rows 
       WHERE school_id = $1 ${syClause}`,
      params
    );

    // 5. Allowances
    const allowancesRes = await db.query(
      `SELECT COUNT(*) as total FROM esf7_personnel_allowances WHERE school_id = $1 ${syClause}`,
      params
    );

    // 6. Overload Logs (Holidays, Absences, Relieving, Late, Pay)
    const holidaysRes = await db.query(
      `SELECT COUNT(*) as total FROM overload_no_work WHERE (school_id = $1 OR school_id = 'ALL') ${syClause}`,
      params
    );
    const absencesRes = await db.query(
      `SELECT COUNT(*) as total FROM overload_absences WHERE school_id = $1 ${syClause}`,
      params
    );
    const relievingRes = await db.query(
      `SELECT COUNT(*) as total FROM esf7_workload_transfer WHERE school_id = $1 ${syClause}`,
      params
    );
    const tardinessRes = await db.query(
      `SELECT COUNT(*) as total FROM overload_late WHERE school_id = $1 ${syClause}`,
      params
    );
    const overloadPayRes = await db.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(overload_pay), 0) as total_pay FROM overload_pay_and_reason WHERE school_id = $1 ${syClause}`,
      params
    );

    // 7. Requests (Requester or Target)
    const requestsRes = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved
       FROM esf7_requests 
       WHERE (requester_school_id = $1 OR target_school_id = $1) ${syClause}`,
      params
    );

    // 8. Relational Orphan Integrity Checks
    const orphanWorkloadsNoPersonnel = await db.query(
      `SELECT COUNT(*) as count 
       FROM esf7_workload_rows w 
       LEFT JOIN esf7_personnel_profile p ON w.personnel_id = p.id 
       WHERE w.school_id = $1 AND p.id IS NULL`,
      [schoolId]
    );
    const orphanShsWorkloadsNoPersonnel = await db.query(
      `SELECT COUNT(*) as count 
       FROM esf7_shs_workload_rows w 
       LEFT JOIN esf7_personnel_profile p ON w.personnel_id = p.id 
       WHERE w.school_id = $1 AND p.id IS NULL`,
      [schoolId]
    );
    const orphanSectionsNoAdviser = await db.query(
      `SELECT COUNT(*) as count 
       FROM esf7_regular_sections s 
       LEFT JOIN esf7_personnel_profile p ON s.adviser_id = p.id 
       WHERE s.school_id = $1 AND s.adviser_id IS NOT NULL AND p.id IS NULL`,
      [schoolId]
    );

    const orphans = {
      workloadsWithoutPersonnel: Number(orphanWorkloadsNoPersonnel.rows[0].count) + Number(orphanShsWorkloadsNoPersonnel.rows[0].count),
      sectionsWithoutAdviser: Number(orphanSectionsNoAdviser.rows[0].count)
    };

    const totalOrphans = orphans.workloadsWithoutPersonnel + orphans.sectionsWithoutAdviser;
    const healthStatus = totalOrphans === 0 ? 'HEALTHY' : 'WARNING (Orphans Detected)';

    res.json({
      schoolId,
      schoolYear: schoolYear || 'ALL_YEARS',
      healthStatus,
      summary: {
        personnel: {
          total: Number(personnel.total),
          teaching: Number(personnel.teaching),
          nonTeaching: Number(personnel.non_teaching),
          schoolHeadFound: Number(personnel.school_heads) > 0,
          schoolHeadCount: Number(personnel.school_heads)
        },
        sections: {
          regularCount: Number(regularSectionsRes.rows[0].total),
          regularLearners: Number(regularSectionsRes.rows[0].total_learners),
          aralCount: Number(aralSectionsRes.rows[0].total),
          aralLearners: Number(aralSectionsRes.rows[0].total_learners),
          remedialCount: Number(remedialSectionsRes.rows[0].total),
          remedialLearners: Number(remedialSectionsRes.rows[0].total_learners),
          totalLearners: Number(regularSectionsRes.rows[0].total_learners) + Number(aralSectionsRes.rows[0].total_learners) + Number(remedialSectionsRes.rows[0].total_learners)
        },
        workloads: {
          elemJhsTotal: Number(elemWorkloadsRes.rows[0].total),
          shsTotal: Number(shsWorkloadsRes.rows[0].total),
          shsTerm1: Number(shsWorkloadsRes.rows[0].term1),
          shsTerm2: Number(shsWorkloadsRes.rows[0].term2),
          shsTerm3: Number(shsWorkloadsRes.rows[0].term3),
          total: Number(elemWorkloadsRes.rows[0].total) + Number(shsWorkloadsRes.rows[0].total)
        },
        allowances: {
          recordedCount: Number(allowancesRes.rows[0].total)
        },
        overload: {
          holidaysCount: Number(holidaysRes.rows[0].total),
          absencesCount: Number(absencesRes.rows[0].total),
          relievingDutyCount: Number(relievingRes.rows[0].total),
          tardinessCount: Number(tardinessRes.rows[0].total),
          overloadPayRecords: Number(overloadPayRes.rows[0].total),
          totalOverloadPay: Number(overloadPayRes.rows[0].total_pay)
        },
        requests: {
          total: Number(requestsRes.rows[0].total),
          pending: Number(requestsRes.rows[0].pending),
          approved: Number(requestsRes.rows[0].approved)
        }
      },
      schoolProfile: {
        exists: !!profile,
        shsModel: profile ? profile.shs_curriculum_model : null,
        specialPrograms: profile ? profile.jhs_special_programs : [],
        hasElemSpecialPrograms: profile ? profile.has_elem_special_programs : false,
        hasJhsSpecialPrograms: profile ? profile.has_jhs_special_programs : false
      },
      orphans,
      auditTimestamp: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
