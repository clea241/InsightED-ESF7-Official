const { pool } = require("../db/index.js");

/**
 * Helper to determine if teacher profile is complete
 */
function isProfileComplete(p) {
  if (!p) return false;
  if (p.isDraft) return false;
  const hasEduc =
    p.collegeDegree ||
    (Array.isArray(p.degreeRows) && p.degreeRows.length > 0) ||
    (Array.isArray(p.collegeDegrees) && p.collegeDegrees.length > 0);
  const hasLearningArea =
    (p.matrixData && Object.keys(p.matrixData).length > 0) ||
    (p.learningAreaMap && Object.keys(p.learningAreaMap).length > 0);
  return Boolean(
    hasEduc || hasLearningArea || p.personalVerified || p.workloadVerified,
  );
}

/**
 * Helper to determine if teacher workload is complete
 */
function isWorkloadComplete(p) {
  if (!p) return false;
  if (p.hasNoTeachingLoad === true || p.has_no_teaching_load === true)
    return true;
  const rows = Array.isArray(p.workloadRows) ? p.workloadRows : [];
  return rows.length > 0;
}

async function hydrateNodeStatus() {
  console.log(
    "🚀 [Hydration] Starting safe auto-population of Node Status tables from existing school drafts...",
  );

  const startTime = Date.now();
  let processedSchools = 0;
  let processedPersonnel = 0;
  const batchSize = 100;
  let offset = 0;

  try {
    const countRes = await pool.query("SELECT COUNT(*) FROM school_drafts");
    const totalSchools = parseInt(countRes.rows[0].count, 10);
    console.log(`📊 Found ${totalSchools} total school drafts to hydrate.`);

    while (offset < totalSchools) {
      const batchRes = await pool.query(
        "SELECT school_id, school_year, payload, updated_at FROM school_drafts ORDER BY updated_at DESC LIMIT $1 OFFSET $2",
        [batchSize, offset],
      );

      if (batchRes.rows.length === 0) break;

      for (const row of batchRes.rows) {
        const schoolId = String(row.school_id).trim();
        const schoolYear = row.school_year || "SY 26-27";
        const payload = row.payload || {};

        const schoolInfo = payload.schoolInfo || {};
        const personnelList = Array.isArray(payload.personnel)
          ? payload.personnel
          : [];
        const classSections = Array.isArray(payload.classSections)
          ? payload.classSections
          : [];
        const journeyState = payload.journey_state || {};
        const completedNodes = Array.isArray(journeyState.completedNodes)
          ? journeyState.completedNodes
          : [];

        // 1. School Node 01: School Profile
        const node01School = {
          status:
            completedNodes.includes("school") || schoolInfo.schoolName
              ? "COMPLETED"
              : "IN_PROGRESS",
          completed_at: row.updated_at,
          school_name: schoolInfo.schoolName || `School ${schoolId}`,
          region: schoolInfo.region || "",
          division: schoolInfo.division || "",
          district: schoolInfo.district || "",
          curricular_offering: schoolInfo.curricularOffering || ["Elementary"],
          number_of_shifts: schoolInfo.numberOfShifts || "1",
          shs_curriculum_model:
            schoolInfo.shsCurriculumModel || "Standard K-12 SHS Curriculum",
          special_programs: schoolInfo.specialPrograms || [],
        };

        // 2. School Node 02: Roster
        const teachingCount = personnelList.filter(
          (p) => p.type === "teaching",
        ).length;
        const relatedCount = personnelList.filter(
          (p) =>
            p.type === "teaching-related" ||
            p.positionCategory === "RELATED TEACHING",
        ).length;
        const nonTeachingCount = personnelList.filter(
          (p) => p.type === "non-teaching",
        ).length;

        const node02Roster = {
          status:
            completedNodes.includes("roster") || personnelList.length > 0
              ? "COMPLETED"
              : "IN_PROGRESS",
          completed_at: row.updated_at,
          total_personnel: personnelList.length,
          teaching: teachingCount,
          related_teaching: relatedCount,
          non_teaching: nonTeachingCount,
        };

        // 3. School Node 05: Requests
        const node05Requests = {
          status: completedNodes.includes("requests")
            ? "COMPLETED"
            : "IN_PROGRESS",
          completed_at: row.updated_at,
        };

        // 4. School Node 06: Classes
        const node06Classes = {
          status:
            completedNodes.includes("classes") || classSections.length > 0
              ? "COMPLETED"
              : "IN_PROGRESS",
          completed_at: row.updated_at,
          total_sections: classSections.length,
          sections: classSections,
        };

        // 5. School Node 10: Overload
        const node10Overload = {
          status: completedNodes.includes("overload")
            ? "COMPLETED"
            : "IN_PROGRESS",
          completed_at: row.updated_at,
        };

        // 6. School Node 11: Validation
        const node11Validation = {
          status: completedNodes.includes("validation")
            ? "COMPLETED"
            : "IN_PROGRESS",
          completed_at: row.updated_at,
          certified_by: schoolInfo.certifiedBy || null,
          certified_at: schoolInfo.certifiedAt || null,
        };

        // Calculate personnel stats
        let profilingDoneCount = 0;
        let workloadDoneCount = 0;
        let fullyDoneCount = 0;

        // Populate individual teachers into esf7_personnel_node_status
        for (const p of personnelList) {
          const pId = String(
            p.id ||
              p.prn ||
              `PER-${schoolId}-${Math.random().toString(36).substring(2, 7)}`,
          );
          const pName =
            `${p.lastName || ""}, ${p.firstName || ""} ${p.middleName || ""}`.trim() ||
            "TEACHER";
          const pPos =
            p.position || p.plantilla_position || p.position_title || "";
          const pCat =
            p.type === "teaching-related" ||
            p.positionCategory === "RELATED TEACHING"
              ? "RELATED TEACHING"
              : p.type === "non-teaching"
                ? "NON-TEACHING"
                : "TEACHING";
          const isHead = Boolean(
            p.isSchoolHead ||
            p.is_school_head ||
            String(pPos).toUpperCase().includes("PRINCIPAL"),
          );

          const profDone = isProfileComplete(p);
          const workDone = isWorkloadComplete(p);
          if (profDone) profilingDoneCount++;
          if (workDone) workloadDoneCount++;
          if (profDone && workDone) fullyDoneCount++;

          const node03RoomQr = {
            status: p.roomQrSubmitted ? "COMPLETED" : "NOT_STARTED",
            completed_at: p.roomQrSubmittedAt || null,
          };

          const node04Profile = {
            status: profDone ? "COMPLETED" : "IN_PROGRESS",
            completed_at: row.updated_at,
            highest_educational_attainment:
              p.highestEducationalAttainment ||
              p.highest_educational_attainment ||
              "",
            prc_license_no: p.prcLicenseNo || p.prc_license_no || "",
            degrees: p.degreeRows || p.collegeDegrees || [],
            learning_area_matrix: p.matrixData || p.learningAreaMap || {},
          };

          const node07Designation = {
            status:
              Array.isArray(p.designations) && p.designations.length > 0
                ? "COMPLETED"
                : "IN_PROGRESS",
            designations: p.designations || [],
          };

          const node08Workload = {
            status: workDone ? "COMPLETED" : "IN_PROGRESS",
            completed_at: row.updated_at,
            is_zero_teaching_load: Boolean(
              p.hasNoTeachingLoad || p.has_no_teaching_load,
            ),
            workload_rows: p.workloadRows || [],
          };

          const node09Allowances = {
            status: "COMPLETED",
            uniform: true,
            cash: true,
          };

          await pool.query(
            `
            INSERT INTO esf7_personnel_node_status (
              school_id, school_year, personnel_id, personnel_name, position_title, category, is_school_head, is_complete,
              node_03_room_qr, node_04_profile, node_07_designation, node_08_workload, node_09_allowances, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (school_id, school_year, personnel_id)
            DO UPDATE SET
              personnel_name = EXCLUDED.personnel_name,
              position_title = EXCLUDED.position_title,
              category = EXCLUDED.category,
              is_school_head = EXCLUDED.is_school_head,
              is_complete = EXCLUDED.is_complete,
              node_03_room_qr = EXCLUDED.node_03_room_qr,
              node_04_profile = EXCLUDED.node_04_profile,
              node_07_designation = EXCLUDED.node_07_designation,
              node_08_workload = EXCLUDED.node_08_workload,
              node_09_allowances = EXCLUDED.node_09_allowances,
              updated_at = EXCLUDED.updated_at
          `,
            [
              schoolId,
              schoolYear,
              pId,
              pName,
              pPos,
              pCat,
              isHead,
              profDone && workDone,
              JSON.stringify(node03RoomQr),
              JSON.stringify(node04Profile),
              JSON.stringify(node07Designation),
              JSON.stringify(node08Workload),
              JSON.stringify(node09Allowances),
              row.updated_at,
            ],
          );

          processedPersonnel++;
        }

        const allReady =
          personnelList.length > 0 &&
          profilingDoneCount === personnelList.length &&
          workloadDoneCount === personnelList.length;

        const personnelSummary = {
          total_personnel: personnelList.length,
          teaching: teachingCount,
          related_teaching: relatedCount,
          non_teaching: nonTeachingCount,
          profiling_completed: profilingDoneCount,
          workload_completed: workloadDoneCount,
          all_personnel_ready: allReady,
        };

        const overallPct = Math.min(
          100,
          Math.round(((completedNodes.length + (allReady ? 2 : 0)) / 11) * 100),
        );

        // Upsert into esf7_school_node_status
        await pool.query(
          `
          INSERT INTO esf7_school_node_status (
            school_id, school_year, overall_status, overall_percentage,
            node_01_school, node_02_roster, node_05_requests, node_06_classes, node_10_overload, node_11_validation,
            personnel_summary, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (school_id, school_year)
          DO UPDATE SET
            overall_status = EXCLUDED.overall_status,
            overall_percentage = EXCLUDED.overall_percentage,
            node_01_school = EXCLUDED.node_01_school,
            node_02_roster = EXCLUDED.node_02_roster,
            node_05_requests = EXCLUDED.node_05_requests,
            node_06_classes = EXCLUDED.node_06_classes,
            node_10_overload = EXCLUDED.node_10_overload,
            node_11_validation = EXCLUDED.node_11_validation,
            personnel_summary = EXCLUDED.personnel_summary,
            updated_at = EXCLUDED.updated_at
        `,
          [
            schoolId,
            schoolYear,
            completedNodes.includes("validation") ? "COMPLETED" : "IN_PROGRESS",
            overallPct,
            JSON.stringify(node01School),
            JSON.stringify(node02Roster),
            JSON.stringify(node05Requests),
            JSON.stringify(node06Classes),
            JSON.stringify(node10Overload),
            JSON.stringify(node11Validation),
            JSON.stringify(personnelSummary),
            row.updated_at,
          ],
        );

        processedSchools++;
      }

      offset += batchSize;
      console.log(
        `⏳ [Progress] Hydrated ${processedSchools} / ${totalSchools} schools (${processedPersonnel} teachers)...`,
      );
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `\n🎉 [Hydration Complete] Successfully hydrated ${processedSchools} schools and ${processedPersonnel} teachers in ${elapsed}s.`,
    );

    // Quick verification query on the boolean view
    const viewCheck = await pool.query(
      "SELECT COUNT(*) as total_view_rows, COUNT(CASE WHEN is_all_nodes_completed = true THEN 1 END) as completed_schools FROM vw_esf7_school_node_progress",
    );
    console.log(
      "📊 Verification on SQL View `vw_esf7_school_node_progress`:",
      viewCheck.rows[0],
    );
  } catch (err) {
    console.error("❌ Error during hydration:", err);
  } finally {
    await pool.end();
  }
}

hydrateNodeStatus();
