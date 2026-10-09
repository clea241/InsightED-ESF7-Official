const { prodPool, insightEdPool } = require("../db");

async function analyzeAllInterSchoolConnections() {
  console.log("=== Analyzing All Inter-School Teacher Connections ===");

  // 1. From esf7_clustered_ghost_sync:
  // Each room_key represents a teacher (e.g. ROOM_<prn_or_id>). If multiple schools have the same room_key, they are clustered!
  const ghostMultiSchools = await prodPool.query(`
    SELECT room_key, 
           array_agg(DISTINCT school_id) as schools,
           array_agg(DISTINCT school_name) as school_names,
           count(DISTINCT school_id) as school_count
    FROM esf7_clustered_ghost_sync
    WHERE school_id ~ '^\\d{5,7}$'
    GROUP BY room_key
    HAVING count(DISTINCT school_id) > 1
  `);

  console.log(
    `\nFound ${ghostMultiSchools.rows.length} teachers co-edited across multiple schools in esf7_clustered_ghost_sync:`,
  );
  ghostMultiSchools.rows.slice(0, 5).forEach((r) => {
    console.log(
      `- Room ${r.room_key}: Schools [${r.schools.join(", ")}] (${r.school_names.join(", ")})`,
    );
  });

  // 2. From school_drafts where a teacher appears in multiple schools' drafts
  const teacherMultiDrafts = await prodPool.query(`
    WITH unnested AS (
      SELECT 
        d.school_id,
        d.school_year,
        COALESCE(p_elem->>'prn', p_elem->>'employeeNo', p_elem->>'id') as teacher_key,
        TRIM(CONCAT(p_elem->>'firstName', ' ', p_elem->>'lastName')) as teacher_name,
        p_elem->>'deploymentStatus' as dep_status,
        p_elem->'assignedSchools' as assigned_schools
      FROM school_drafts d,
           jsonb_array_elements(d.payload->'personnel') as p_elem
      WHERE d.school_id ~ '^\\d{5,7}$'
    )
    SELECT teacher_key, teacher_name,
           array_agg(DISTINCT school_id) as schools,
           count(DISTINCT school_id) as school_count
    FROM unnested
    WHERE teacher_key IS NOT NULL AND teacher_key != '' AND teacher_key !~ '^PER-[0-9a-f]'
    GROUP BY teacher_key, teacher_name
    HAVING count(DISTINCT school_id) > 1
  `);

  console.log(
    `\nFound ${teacherMultiDrafts.rows.length} teachers sharing drafts across multiple actual DepEd schools:`,
  );
  teacherMultiDrafts.rows.slice(0, 5).forEach((r) => {
    console.log(
      `- Teacher ${r.teacher_name} (${r.teacher_key}): Schools [${r.schools.join(", ")}]`,
    );
  });

  // 3. From drafts with explicit assignedSchools arrays with real school IDs
  const explicitAssigned = await prodPool.query(`
    SELECT 
      d.school_id,
      d.school_year,
      COALESCE(p_elem->>'prn', p_elem->>'id') as teacher_key,
      TRIM(CONCAT(p_elem->>'firstName', ' ', p_elem->>'lastName')) as teacher_name,
      p_elem->>'deploymentStatus' as dep_status,
      p_elem->'assignedSchools' as assigned_schools
    FROM school_drafts d,
         jsonb_array_elements(d.payload->'personnel') as p_elem
    WHERE d.school_id ~ '^\\d{5,7}$'
      AND (
        (p_elem->'assignedSchools' IS NOT NULL AND jsonb_array_length(p_elem->'assignedSchools') > 1)
        OR (p_elem->'assigned_schools' IS NOT NULL AND jsonb_array_length(p_elem->'assigned_schools') > 1)
      )
  `);

  console.log(
    `\nFound ${explicitAssigned.rows.length} teachers with multi-school assignedSchools arrays in drafts.`,
  );

  await prodPool.end();
}

analyzeAllInterSchoolConnections().catch(console.error);
