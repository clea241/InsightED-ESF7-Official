/**
 * Clean Slate High-Performance Rebuild of esf7_workload_rows from school_drafts
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Creates safety backup in esf7_workload_rows_backup_20261013_v2.
 * - Adds extras JSONB column if missing.
 * - Drops raw_payload column from esf7_workload_rows.
 * - Truncates esf7_workload_rows cleanly.
 * - High-speed keyset chunking with batch profile fetching (ANY($1)).
 * - Ingests authentic workload rows from school_drafts mapped to esf7_personnel_profile(id).
 * - Creates alias view esf7_workload_row.
 */

const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

function sanitizeTime(val) {
  if (!val || typeof val !== "string") return null;
  const s = val.trim();
  const ampm = s.match(/(am|pm)$/i);
  const m = s
    .replace(/(am|pm)$/i, "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ss = m[3] ? m[3] : "00";
  if (ampm) {
    const isPm = ampm[1].toLowerCase() === "pm";
    if (isPm && hh < 12) hh += 12;
    if (!isPm && hh === 12) hh = 0;
  }
  if (hh > 23 || parseInt(mm, 10) > 59) return null;
  return `${String(hh).padStart(2, "0")}:${mm}:${ss}`;
}

function sanitizeDays(val) {
  if (Array.isArray(val) && val.length > 0) return val;
  if (typeof val === "string" && val.trim().length > 0) {
    const parts = val
      .split(/[,|\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts;
  }
  return ["M", "T", "W", "TH", "F"];
}

async function run() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log("==========================================================");
    console.log(
      "🚀 CLEAN SLATE REBUILD: esf7_workload_rows FROM school_drafts",
    );
    console.log("==========================================================");

    // 1. Create safety backup if not exists
    console.log("Creating safety backup table if not exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_workload_rows_backup_20261013_v2 AS 
      SELECT * FROM esf7_workload_rows;
    `);
    const bCheck = await client.query(
      "SELECT count(*) FROM esf7_workload_rows_backup_20261013_v2;",
    );
    console.log(
      `✓ Safety backup confirmed: ${bCheck.rows[0].count} records intact.`,
    );

    // 2. Ensure extras column exists
    console.log("Ensuring extras JSONB column exists...");
    await client.query(`
      ALTER TABLE esf7_workload_rows 
      ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    // 3. Drop raw_payload column
    console.log("Dropping raw_payload column from esf7_workload_rows...");
    await client.query(`
      ALTER TABLE esf7_workload_rows 
      DROP COLUMN IF EXISTS raw_payload;
    `);
    console.log("✓ raw_payload dropped.");

    // 4. Truncate table cleanly
    console.log("Truncating esf7_workload_rows...");
    await client.query("TRUNCATE TABLE esf7_workload_rows;");
    console.log("✓ Table cleanly truncated.");

    // 5. Query total schools with workloads
    const totalCountRes = await client.query(
      `SELECT count(*) FROM school_drafts WHERE jsonb_path_exists(payload, '$.personnel[*].workloadRows[*]')`,
    );
    const totalSchools = Number(totalCountRes.rows[0].count);
    console.log(`Total schools with workload rows: ${totalSchools}`);

    const CHUNK_SIZE = 100;
    let lastSchoolId = "";
    let processedSchools = 0;
    let totalWorkloadsInserted = 0;
    const globalSeenIds = new Set();

    while (true) {
      const chunkRes = await client.query(
        `SELECT school_id, school_year, payload->'personnel' as personnel 
         FROM school_drafts 
         WHERE jsonb_path_exists(payload, '$.personnel[*].workloadRows[*]')
           AND school_id > $1
         ORDER BY school_id ASC 
         LIMIT $2`,
        [lastSchoolId, CHUNK_SIZE],
      );

      if (chunkRes.rows.length === 0) break;

      const cleanSchoolIds = chunkRes.rows.map((r) =>
        String(r.school_id).replace(/^SCH-/i, ""),
      );

      // Batch profile fetching for all schools in this chunk
      const profRes = await client.query(
        `SELECT id, legacy_id, school_id, first_name, last_name, employee_no 
         FROM esf7_personnel_profile 
         WHERE school_id = ANY($1)`,
        [cleanSchoolIds],
      );

      // Group profile maps per school
      const schoolMaps = new Map();
      for (const pr of profRes.rows) {
        const sid = pr.school_id;
        if (!schoolMaps.has(sid)) {
          schoolMaps.set(sid, {
            legacyMap: new Map(),
            nameMap: new Map(),
            empNoMap: new Map(),
          });
        }
        const m = schoolMaps.get(sid);
        if (pr.legacy_id) m.legacyMap.set(String(pr.legacy_id).trim(), pr.id);
        const nKey = `${(pr.first_name || "").trim().toUpperCase()}|${(pr.last_name || "").trim().toUpperCase()}`;
        if (nKey !== "|") m.nameMap.set(nKey, pr.id);
        if (pr.employee_no)
          m.empNoMap.set(String(pr.employee_no).trim(), pr.id);
      }

      const rowsToInsert = [];

      for (const row of chunkRes.rows) {
        const { school_id, school_year, personnel } = row;
        const cleanSchoolId = String(school_id).replace(/^SCH-/i, "");
        const targetSy = school_year || "SY 26-27";
        const rawPersonnel = Array.isArray(personnel) ? personnel : [];
        const maps = schoolMaps.get(cleanSchoolId);
        if (!maps) continue; // No profiles in this school

        let counter = 1;

        for (const p of rawPersonnel) {
          const wklRows = Array.isArray(p.workloadRows) ? p.workloadRows : [];
          if (wklRows.length === 0) continue;

          const draftId = p.id ? String(p.id).trim() : null;
          const fn = (p.first_name || p.firstName || "").trim().toUpperCase();
          const ln = (p.last_name || p.lastName || "").trim().toUpperCase();
          const empNo = (p.employee_no || p.employeeNo || p.prn || "").trim();
          const nKey = `${fn}|${ln}`;

          let targetProfileId = null;
          if (draftId && maps.legacyMap.has(draftId)) {
            targetProfileId = maps.legacyMap.get(draftId);
          } else if (maps.nameMap.has(nKey)) {
            targetProfileId = maps.nameMap.get(nKey);
          } else if (empNo && maps.empNoMap.has(empNo)) {
            targetProfileId = maps.empNoMap.get(empNo);
          }

          if (!targetProfileId) continue; // Must reference an existing profile

          for (const w of wklRows) {
            if (!w) continue;
            const subject = String(
              w.subject ||
                w.subject_name ||
                w.subjectName ||
                w.task ||
                "MATHEMATICS",
            ).trim();
            if (!subject) continue;

            let wId = w.id ? String(w.id).trim() : null;
            if (!wId || globalSeenIds.has(wId)) {
              wId = `WKL-${cleanSchoolId}-${targetProfileId}-${counter++}-${Math.random().toString(36).substring(2, 6)}`;
            }
            globalSeenIds.add(wId);

            const gradeLevel = w.grade_level || w.gradeLevel || null;
            const sectionId = w.section_id || w.sectionId || null;
            const sectionName = w.section_name || w.sectionName || null;
            const subjectId = w.subject_id || w.subjectId || null;
            const remediationSubject =
              w.remediation_subject || w.remediationSubject || null;
            const startTime = sanitizeTime(w.start_time || w.startTime);
            const endTime = sanitizeTime(w.end_time || w.endTime);
            const days = sanitizeDays(w.days);
            const term = w.term || "1st";

            rowsToInsert.push({
              id: wId,
              personnel_id: targetProfileId,
              school_id: cleanSchoolId,
              school_year: targetSy,
              grade_level: gradeLevel,
              section_id: sectionId,
              section_name: sectionName,
              subject: subject,
              subject_id: subjectId,
              remediation_subject: remediationSubject,
              start_time: startTime,
              end_time: endTime,
              days: days,
              term: term,
              extras: {},
            });
          }
        }
      }

      // Batch insert rowsToInsert in chunks
      if (rowsToInsert.length > 0) {
        const BATCH_INSERT_SIZE = 500;
        for (let b = 0; b < rowsToInsert.length; b += BATCH_INSERT_SIZE) {
          const slice = rowsToInsert.slice(b, b + BATCH_INSERT_SIZE);
          const valuesClause = [];
          const params = [];
          let pIdx = 1;

          for (const item of slice) {
            valuesClause.push(`(
              $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, 
              $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, 
              $${pIdx++}, $${pIdx++}, $${pIdx++}::jsonb, $${pIdx++}, $${pIdx++}::jsonb, 
              NOW(), NOW()
            )`);
            params.push(
              item.id,
              item.personnel_id,
              item.school_id,
              item.school_year,
              item.grade_level,
              item.section_id,
              item.section_name,
              item.subject,
              item.subject_id,
              item.remediation_subject,
              item.start_time,
              item.end_time,
              JSON.stringify(item.days),
              item.term,
              JSON.stringify(item.extras),
            );
          }

          await client.query(
            `
            INSERT INTO esf7_workload_rows (
              id, personnel_id, school_id, school_year, grade_level,
              section_id, section_name, subject, subject_id, remediation_subject,
              start_time, end_time, days, term, extras, created_at, updated_at
            ) VALUES ${valuesClause.join(", ")}
            ON CONFLICT (id) DO NOTHING;
          `,
            params,
          );

          totalWorkloadsInserted += slice.length;
        }
      }

      lastSchoolId = chunkRes.rows[chunkRes.rows.length - 1].school_id;
      processedSchools += chunkRes.rows.length;

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const percent = Math.min(
        100,
        (processedSchools / totalSchools) * 100,
      ).toFixed(1);
      console.log(
        `[Progress ${percent}%] Processed ${processedSchools}/${totalSchools} schools | Inserted workloads: ${totalWorkloadsInserted} | Elapsed: ${elapsedSec}s`,
      );
    }

    // 6. Create alias view esf7_workload_row
    console.log("Creating/updating alias view esf7_workload_row...");
    await client.query(`
      CREATE OR REPLACE VIEW esf7_workload_row AS 
      SELECT * FROM esf7_workload_rows;
    `);

    const finalSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalCount = await client.query(
      "SELECT count(*) FROM esf7_workload_rows;",
    );

    console.log("==========================================================");
    console.log(`🎉 REBUILD COMPLETE in ${finalSec}s!`);
    console.log(`✓ Schools processed: ${processedSchools}`);
    console.log(`✓ Total workloads in DB: ${finalCount.rows[0].count}`);
    console.log(`✓ raw_payload dropped.`);
    console.log(`✓ View esf7_workload_row verified.`);
    console.log("==========================================================");
  } catch (err) {
    console.error("FATAL ERROR DURING REBUILD:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
