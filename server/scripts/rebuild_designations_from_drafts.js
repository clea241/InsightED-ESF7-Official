require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
/**
 * Clean Slate High-Performance Rebuild of esf7_personnel_designations from school_drafts
 *
 * Rules:
 * - Strictly isolated to insighted_esf7 (Azure DB).
 * - Creates safety backup in esf7_personnel_designations_backup_20261013.
 * - Adds school_id column and index to esf7_personnel_designations if missing.
 * - Drops raw_payload column.
 * - Truncates esf7_personnel_designations cleanly.
 * - High-speed chunking with batch profile fetching (ANY($1)) to minimize network roundtrips.
 * - Creates alias view esf7_personnel_designation.
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

function parseDesignation(item, cleanSchoolId, profileId, counter) {
  if (!item) return null;
  let dsgObj = {};

  if (typeof item === "string") {
    const rawStr = item.trim();
    const isSds =
      rawStr.includes("::APPROVED_SDS") ||
      rawStr.toUpperCase().includes("APPROVED_SDS");
    const cleanKey = rawStr.replace(/::APPROVED_SDS/gi, "").trim();
    if (!cleanKey) return null;

    let dsgName = cleanKey;
    let keyStage = null;
    let gradeLevel = null;
    let subjectArea = null;
    let track = null;

    const upper = cleanKey.toUpperCase();

    if (
      upper.startsWith("DEPARTMENT HEAD") &&
      (upper.includes("KEY STAGE 1") ||
        upper.includes("KS1") ||
        upper.includes("KINDER") ||
        upper.includes("GRADE 1") ||
        upper.includes("GRADE 2") ||
        upper.includes("GRADE 3")) &&
      !upper.includes("KEY STAGE 2") &&
      !upper.includes("KEY STAGE 3") &&
      !upper.includes("KEY STAGE 4") &&
      !upper.includes("GRADE 4") &&
      !upper.includes("GRADE 5") &&
      !upper.includes("GRADE 6") &&
      !upper.includes("GRADE 7") &&
      !upper.includes("GRADE 8") &&
      !upper.includes("GRADE 9") &&
      !upper.includes("GRADE 10")
    ) {
      keyStage = "KS1";
      dsgName = "DEPARTMENT HEAD";
      subjectArea = "Early Primary Literacy & Numeracy";
      if (
        upper.includes("KINDER - GRADE 3") ||
        upper.includes("KINDER TO GRADE 3") ||
        upper === "DEPARTMENT HEAD - KEY STAGE 1" ||
        upper === "DEPARTMENT HEAD - KS1"
      ) {
        gradeLevel = "Kinder, Grade 1, Grade 2, Grade 3";
      } else {
        const detected = [];
        if (upper.includes("KINDER")) detected.push("Kinder");
        if (upper.includes("GRADE 1") || upper.includes("G1"))
          detected.push("Grade 1");
        if (upper.includes("GRADE 2") || upper.includes("G2"))
          detected.push("Grade 2");
        if (upper.includes("GRADE 3") || upper.includes("G3"))
          detected.push("Grade 3");
        gradeLevel =
          detected.length > 0
            ? detected.join(", ")
            : "Kinder, Grade 1, Grade 2, Grade 3";
      }
    } else if (
      upper.startsWith("DEPARTMENT HEAD") &&
      (upper.includes("KEY STAGE 2") || upper.includes("KS2"))
    ) {
      keyStage = "KS2";
      dsgName = "DEPARTMENT HEAD";
      gradeLevel = "Grade 4, Grade 5, Grade 6";
      if (cleanKey.includes(" - ")) {
        const parts = cleanKey.split(" - ");
        subjectArea = parts[parts.length - 1].trim();
      }
    } else if (
      upper.startsWith("DEPARTMENT HEAD") &&
      (upper.includes("KEY STAGE 3") || upper.includes("KS3"))
    ) {
      keyStage = "KS3";
      dsgName = "DEPARTMENT HEAD";
      gradeLevel = "Grade 7, Grade 8, Grade 9, Grade 10";
      if (cleanKey.includes(" - ")) {
        const parts = cleanKey.split(" - ");
        subjectArea = parts[parts.length - 1].trim();
      }
    } else if (
      upper.startsWith("DEPARTMENT HEAD") &&
      (upper.includes("KEY STAGE 4") ||
        upper.includes("KS4") ||
        upper.includes("ACADEMIC TRACK") ||
        upper.includes("TECH-PRO TRACK") ||
        upper.includes("SHS"))
    ) {
      keyStage = "KS4";
      dsgName = "DEPARTMENT HEAD";
      gradeLevel = "Grade 11, Grade 12";
      track = upper.includes("TECH") ? "Tech-Pro Track" : "Academic Track";
    } else if (cleanKey.includes(" - ")) {
      const parts = cleanKey.split(" - ");
      dsgName = parts[0].trim();
      const subPart = parts.slice(1).join(" - ").trim();
      const gradeMatch =
        subPart.match(/\((Grade\s*\d+|Kinder|Grade\s*1[0-2])\)/i) ||
        subPart.match(/^(Grade\s*\d+|Kinder|Grade\s*1[0-2])$/i);
      if (gradeMatch) {
        gradeLevel = gradeMatch[1] || gradeMatch[0];
        subjectArea = subPart.replace(gradeMatch[0], "").trim() || null;
      } else {
        subjectArea = subPart;
      }
    }

    dsgObj = {
      designationName: dsgName,
      keyStage: keyStage || null,
      gradeLevel: gradeLevel || null,
      subjectArea: subjectArea || null,
      track: track || null,
      isSdsApproved: isSds,
      sdsConfirmed: isSds,
      serializedKey: rawStr,
    };
  } else if (typeof item === "object") {
    const rawKey =
      item.serializedKey ||
      item.serialized_key ||
      item.designation ||
      item.designationName ||
      item.designation_name ||
      item.name ||
      "OFFICIAL DESIGNATION";
    const cleanKey = String(rawKey)
      .replace(/::APPROVED_SDS/gi, "")
      .trim();
    const upper = cleanKey.toUpperCase();
    let keyStage = item.keyStage || item.key_stage || null;
    if (!keyStage) {
      if (
        upper.startsWith("DEPARTMENT HEAD") &&
        (upper.includes("KEY STAGE 1") || upper.includes("KS1"))
      ) {
        keyStage = "KS1";
      } else if (upper.includes("KEY STAGE 2") || upper.includes("KS2")) {
        keyStage = "KS2";
      } else if (upper.includes("KEY STAGE 3") || upper.includes("KS3")) {
        keyStage = "KS3";
      } else if (
        upper.includes("KEY STAGE 4") ||
        upper.includes("KS4") ||
        upper.includes("ACADEMIC TRACK") ||
        upper.includes("TECH-PRO TRACK")
      ) {
        keyStage = "KS4";
      }
    }
    const isSds = !!(
      item.isSdsApproved ||
      item.is_sds_approved ||
      String(rawKey).includes("::APPROVED_SDS")
    );
    const isConf = !!(item.sdsConfirmed || item.sds_confirmed || isSds);
    const dsgName = (
      item.designationName ||
      item.designation_name ||
      item.name ||
      cleanKey.split(" - ")[0]
    )
      .replace(/::APPROVED_SDS/gi, "")
      .trim();

    dsgObj = {
      designationName: dsgName || "OFFICIAL DESIGNATION",
      keyStage: keyStage || null,
      gradeLevel: item.gradeLevel || item.grade_level || null,
      subjectArea: item.subjectArea || item.subject_area || null,
      track: item.track || null,
      isSdsApproved: isSds,
      sdsConfirmed: isConf,
      serializedKey: rawKey,
    };
  }

  const dsgId = `DSG-${cleanSchoolId}-${String(profileId).split("-").pop()}-${String(counter).padStart(3, "0")}`;
  return {
    id: dsgId,
    personnel_id: String(profileId),
    school_id: cleanSchoolId,
    ...dsgObj,
  };
}

async function run() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    console.log("==========================================================");
    console.log(
      "🚀 HIGH-PERFORMANCE REBUILD: esf7_personnel_designations FROM school_drafts",
    );
    console.log("==========================================================");

    // 1. Create safety backup if not exists
    console.log("Creating safety backup table if not exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_designations_backup_20261013 AS 
      SELECT * FROM esf7_personnel_designations;
    `);
    const bCheck = await client.query(
      "SELECT count(*) FROM esf7_personnel_designations_backup_20261013;",
    );
    console.log(
      `✓ Safety backup confirmed: ${bCheck.rows[0].count} records intact.`,
    );

    // 2. Ensure school_id column and index exists
    console.log("Ensuring school_id column exists...");
    await client.query(`
      ALTER TABLE esf7_personnel_designations 
      ADD COLUMN IF NOT EXISTS school_id VARCHAR(50);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_esf7_personnel_designations_school 
      ON esf7_personnel_designations (school_id);
    `);

    // 3. Drop raw_payload column
    console.log(
      "Dropping raw_payload column from esf7_personnel_designations...",
    );
    await client.query(`
      ALTER TABLE esf7_personnel_designations 
      DROP COLUMN IF EXISTS raw_payload;
    `);
    console.log("✓ raw_payload dropped.");

    // 4. Truncate table cleanly
    console.log("Truncating esf7_personnel_designations...");
    await client.query("TRUNCATE TABLE esf7_personnel_designations;");
    console.log("✓ Table cleanly truncated.");

    // 5. Query drafts with designations
    const totalDraftsRes = await client.query(
      `SELECT count(*) FROM school_drafts WHERE jsonb_path_exists(payload, '$.personnel[*].designations')`,
    );
    const totalSchools = Number(totalDraftsRes.rows[0].count);
    console.log(`Total schools with designations: ${totalSchools}`);

    const CHUNK_SIZE = 250;
    let offset = 0;
    let processedSchools = 0;
    let totalDesignationsInserted = 0;

    while (offset < totalSchools) {
      const chunkRes = await client.query(
        `SELECT school_id, payload->'personnel' as personnel 
         FROM school_drafts 
         WHERE jsonb_path_exists(payload, '$.personnel[*].designations')
         ORDER BY school_id ASC 
         LIMIT $1 OFFSET $2`,
        [CHUNK_SIZE, offset],
      );

      if (chunkRes.rows.length === 0) break;

      const cleanSchoolIds = chunkRes.rows.map((r) =>
        String(r.school_id).replace(/^SCH-/i, ""),
      );

      // Single batched query to fetch profiles for ALL schools in this chunk
      const profRes = await client.query(
        `SELECT id, legacy_id, school_id, first_name, last_name, employee_no 
         FROM esf7_personnel_profile 
         WHERE school_id = ANY($1)`,
        [cleanSchoolIds],
      );

      // Build grouped in-memory maps per school
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
        const { school_id, personnel } = row;
        const cleanSchoolId = String(school_id).replace(/^SCH-/i, "");
        const rawPersonnel = Array.isArray(personnel) ? personnel : [];
        const withDesig = rawPersonnel.filter(
          (p) => Array.isArray(p.designations) && p.designations.length > 0,
        );
        if (withDesig.length === 0) continue;

        const maps = schoolMaps.get(cleanSchoolId) || {
          legacyMap: new Map(),
          nameMap: new Map(),
          empNoMap: new Map(),
        };

        for (const p of withDesig) {
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

          if (!targetProfileId) continue;

          let counter = 1;
          for (const d of p.designations) {
            const parsed = parseDesignation(
              d,
              cleanSchoolId,
              targetProfileId,
              counter++,
            );
            if (parsed && parsed.designationName) {
              rowsToInsert.push(parsed);
            }
          }
        }
      }

      // Bulk insert rowsToInsert in batches
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
              $${pIdx++}, NOW(), NOW()
            )`);
            params.push(
              item.id,
              item.personnel_id,
              item.school_id,
              item.designationName,
              item.keyStage,
              item.gradeLevel,
              item.subjectArea,
              item.track,
              item.isSdsApproved,
              item.sdsConfirmed,
              item.serializedKey,
            );
          }

          await client.query(
            `
            INSERT INTO esf7_personnel_designations (
              id, personnel_id, school_id, designation_name, key_stage,
              grade_level, subject_area, track, is_sds_approved, sds_confirmed,
              serialized_key, created_at, updated_at
            ) VALUES ${valuesClause.join(", ")}
            ON CONFLICT (id) DO NOTHING;
          `,
            params,
          );

          totalDesignationsInserted += slice.length;
        }
      }

      offset += chunkRes.rows.length;
      processedSchools += chunkRes.rows.length;

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const percent = ((processedSchools / totalSchools) * 100).toFixed(1);
      console.log(
        `[Progress ${percent}%] Processed ${processedSchools}/${totalSchools} schools | Inserted designations: ${totalDesignationsInserted} | Elapsed: ${elapsedSec}s`,
      );
    }

    // 6. Create or replace alias view esf7_personnel_designation
    console.log("Creating/updating alias view esf7_personnel_designation...");
    await client.query(`
      CREATE OR REPLACE VIEW esf7_personnel_designation AS 
      SELECT * FROM esf7_personnel_designations;
    `);

    const finalSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalCount = await client.query(
      "SELECT count(*) FROM esf7_personnel_designations;",
    );

    console.log("==========================================================");
    console.log(`🎉 REBUILD COMPLETE in ${finalSec}s!`);
    console.log(`✓ Schools processed: ${processedSchools}`);
    console.log(`✓ Total designations in DB: ${finalCount.rows[0].count}`);
    console.log(`✓ raw_payload dropped.`);
    console.log(`✓ View esf7_personnel_designation verified.`);
    console.log("==========================================================");
  } catch (err) {
    console.error("FATAL ERROR DURING REBUILD:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
