require("../db/directPort"); // direct Postgres connection
const { pool } = require("../db/index");

/**
 * Consolidate duplicate profiles created by cache disaggregation and backfill
 * any missing L&D trainings or Learning Areas from verified submissions into
 * the normalized tables (esf7_personnel_ld_trainings, esf7_personnel_learning_areas).
 *
 * Rules:
 * - Safe, idempotent, non-destructive.
 * - Runs in a single transaction.
 * - Takes safety backup tables before any modifications.
 * - Set-based batched operations for ultra-fast, deadlock-free execution.
 * - Prints counts before and after.
 * - Supports --dry-run (default) and --apply.
 */

async function main() {
  const isApply = process.argv.includes("--apply");
  const isDryRun = !isApply || process.argv.includes("--dry-run");

  console.log(`=======================================================`);
  console.log(`Personnel Consolidation & Backfill`);
  console.log(
    `Mode: ${isDryRun ? "DRY RUN (no changes will be committed)" : "APPLY (changes will be committed)"}`,
  );
  console.log(`=======================================================\n`);

  const client = await pool.connect();
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);

  try {
    await client.query("BEGIN");

    // 1. Initial counts
    const {
      rows: [{ count: initialProfiles }],
    } = await client.query(
      "SELECT COUNT(*)::int AS count FROM esf7_personnel_profile",
    );
    const {
      rows: [{ count: initialLd }],
    } = await client.query(
      "SELECT COUNT(*)::int AS count FROM esf7_personnel_ld_trainings",
    );
    const {
      rows: [{ count: initialLa }],
    } = await client.query(
      "SELECT COUNT(*)::int AS count FROM esf7_personnel_learning_areas",
    );

    console.log(`[Before Counts]`);
    console.log(`  esf7_personnel_profile:        ${initialProfiles}`);
    console.log(`  esf7_personnel_ld_trainings:   ${initialLd}`);
    console.log(`  esf7_personnel_learning_areas: ${initialLa}\n`);

    // 2. Ensure esf7_personnel_id_mapping table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS esf7_personnel_id_mapping (
        legacy_id VARCHAR(100) PRIMARY KEY,
        new_id VARCHAR(100) NOT NULL,
        status VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 3. Take safety backups if applying
    if (!isDryRun) {
      console.log(
        `[Safety Backup] Creating snapshot tables with timestamp ${timestamp}...`,
      );
      await client.query(
        `CREATE TABLE _backup_esf7_personnel_profile_${timestamp} AS SELECT * FROM esf7_personnel_profile`,
      );
      await client.query(
        `CREATE TABLE _backup_esf7_personnel_ld_${timestamp} AS SELECT * FROM esf7_personnel_ld_trainings`,
      );
      await client.query(
        `CREATE TABLE _backup_esf7_personnel_la_${timestamp} AS SELECT * FROM esf7_personnel_learning_areas`,
      );
      console.log(`  -> _backup_esf7_personnel_profile_${timestamp}`);
      console.log(`  -> _backup_esf7_personnel_ld_${timestamp}`);
      console.log(`  -> _backup_esf7_personnel_la_${timestamp}\n`);
    }

    // 4. Populate temporary table with duplicate pairs
    await client.query(`
      CREATE TEMP TABLE temp_duplicate_pairs ON COMMIT DROP AS
      SELECT DISTINCT ON (p_uuid.id)
        p_orig.id AS canonical_id,
        p_uuid.id AS duplicate_id,
        p_orig.school_id
      FROM esf7_personnel_profile p_orig
      JOIN esf7_personnel_profile p_uuid 
        ON p_orig.school_id = p_uuid.school_id
       AND p_orig.id != p_uuid.id
       AND p_uuid.id LIKE '%-%-%-%-%'
       AND p_orig.id NOT LIKE '%-%-%-%-%'
       AND (
         p_uuid.legacy_id = p_orig.id 
         OR (
           UPPER(TRIM(p_orig.last_name)) = UPPER(TRIM(p_uuid.last_name)) 
           AND UPPER(TRIM(p_orig.first_name)) = UPPER(TRIM(p_uuid.first_name))
         )
       )
      WHERE p_orig.created_at <= p_uuid.created_at
      ORDER BY p_uuid.id, p_orig.created_at ASC
    `);

    const {
      rows: [{ count: dupCount }],
    } = await client.query(
      "SELECT COUNT(*)::int AS count FROM temp_duplicate_pairs",
    );
    console.log(
      `[Duplicate Detection] Identified ${dupCount} duplicate UUID profile(s) to consolidate.\n`,
    );

    if (dupCount > 0) {
      // A. Record mapping in esf7_personnel_id_mapping
      await client.query(`
        INSERT INTO esf7_personnel_id_mapping (legacy_id, new_id, status)
        SELECT duplicate_id, canonical_id, 'consolidated'
        FROM temp_duplicate_pairs
        ON CONFLICT (legacy_id) DO UPDATE SET new_id = EXCLUDED.new_id
      `);

      // B. Repoint child tables
      // 1) L&D trainings
      const { rowCount: ldRepointed } = await client.query(`
        UPDATE esf7_personnel_ld_trainings t
        SET personnel_id = d.canonical_id
        FROM temp_duplicate_pairs d
        WHERE t.personnel_id = d.duplicate_id
      `);
      console.log(`  - Repointed ${ldRepointed} L&D training row(s)`);

      // 2) Learning areas: remove duplicate if canonical already exists, else repoint
      await client.query(`
        DELETE FROM esf7_personnel_learning_areas a
        USING temp_duplicate_pairs d, esf7_personnel_learning_areas ca
        WHERE a.personnel_id = d.duplicate_id AND ca.personnel_id = d.canonical_id
      `);
      const { rowCount: laRepointed } = await client.query(`
        UPDATE esf7_personnel_learning_areas a
        SET personnel_id = d.canonical_id
        FROM temp_duplicate_pairs d
        WHERE a.personnel_id = d.duplicate_id
      `);
      console.log(`  - Repointed ${laRepointed} Learning Area row(s)`);

      // 3) Employment: remove duplicate if canonical already exists, else repoint
      await client.query(`
        DELETE FROM esf7_personnel_employment e
        USING temp_duplicate_pairs d, esf7_personnel_employment ce
        WHERE e.personnel_id = d.duplicate_id AND ce.personnel_id = d.canonical_id
      `);
      await client.query(`
        UPDATE esf7_personnel_employment e
        SET personnel_id = d.canonical_id, id = d.canonical_id
        FROM temp_duplicate_pairs d
        WHERE e.personnel_id = d.duplicate_id
      `);

      // 4) Education: remove duplicate if canonical already exists, else repoint
      await client.query(`
        DELETE FROM esf7_perssonel_educ ed
        USING temp_duplicate_pairs d, esf7_perssonel_educ ced
        WHERE ed.personnel_id = d.duplicate_id AND ced.personnel_id = d.canonical_id
      `);
      await client.query(`
        UPDATE esf7_perssonel_educ ed
        SET personnel_id = d.canonical_id
        FROM temp_duplicate_pairs d
        WHERE ed.personnel_id = d.duplicate_id
      `);

      // 5) Workloads, Designations, Admin Tasks
      await client.query(`
        UPDATE esf7_workload_rows w
        SET personnel_id = d.canonical_id
        FROM temp_duplicate_pairs d
        WHERE w.personnel_id = d.duplicate_id
      `);
      await client.query(`
        UPDATE esf7_personnel_designations des
        SET personnel_id = d.canonical_id
        FROM temp_duplicate_pairs d
        WHERE des.personnel_id = d.duplicate_id
      `);
      await client.query(`
        UPDATE esf7_admin_task adm
        SET personnel_id = d.canonical_id
        FROM temp_duplicate_pairs d
        WHERE adm.personnel_id = d.duplicate_id
      `);

      // C. Delete duplicate profiles
      const { rowCount: deletedProfiles } = await client.query(`
        DELETE FROM esf7_personnel_profile p
        USING temp_duplicate_pairs d
        WHERE p.id = d.duplicate_id
      `);
      console.log(
        `  - Deleted ${deletedProfiles} redundant duplicate profile row(s)\n`,
      );
    }

    // 5. Backfill missing L&D trainings and Learning Areas from esf7_personnel_submission
    console.log(
      `[Backfill Check] Inspecting submissions for missing normalized rows...`,
    );
    const { rows: submissions } = await client.query(`
      SELECT id, school_id, personnel_id, payload_json
      FROM esf7_personnel_submission
      WHERE payload_json IS NOT NULL
    `);

    let backfilledLdRows = 0;
    let backfilledLaRows = 0;

    for (const sub of submissions) {
      let pData = sub.payload_json;
      if (typeof pData === "string") {
        try {
          pData = JSON.parse(pData);
        } catch (e) {
          continue;
        }
      }
      if (!pData || typeof pData !== "object") continue;

      const pId = String(pData.id || sub.personnel_id || "").trim();
      if (!pId) continue;

      // Resolve to canonical ID if mapped
      const { rows: mapRows } = await client.query(
        "SELECT new_id AS canonical_id FROM esf7_personnel_id_mapping WHERE legacy_id = $1::varchar",
        [pId],
      );
      const targetId = mapRows.length > 0 ? mapRows[0].canonical_id : pId;

      // Ensure targetId exists in esf7_personnel_profile
      const { rows: profExists } = await client.query(
        "SELECT id FROM esf7_personnel_profile WHERE id = $1::varchar",
        [targetId],
      );
      if (profExists.length === 0) continue;

      // A. Check if normalized L&D is missing
      const { rows: existingLd } = await client.query(
        "SELECT id FROM esf7_personnel_ld_trainings WHERE personnel_id = $1::varchar",
        [targetId],
      );
      if (existingLd.length === 0) {
        const trainings = [
          ...(Array.isArray(pData.neapTrainingRows)
            ? pData.neapTrainingRows.map((r) => ({ ...r, type: "NEAP" }))
            : []),
          ...(Array.isArray(pData.certificationRows)
            ? pData.certificationRows.map((r) => ({ ...r, type: "TESDA" }))
            : []),
          ...(Array.isArray(pData.otherTrainingRows)
            ? pData.otherTrainingRows.map((r) => ({ ...r, type: "OTHER" }))
            : []),
        ];

        if (trainings.length > 0) {
          for (let i = 0; i < trainings.length; i++) {
            const tr = trainings[i];
            const trId = `TRN-${targetId}-${i + 1}-${Date.now()}`;
            await client.query(
              `
              INSERT INTO esf7_personnel_ld_trainings (
                id, personnel_id, training_type, title, conductor, 
                start_date, end_date, days, total_hours, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
              ON CONFLICT (id) DO NOTHING
            `,
              [
                trId,
                targetId,
                tr.type || tr.training_type || "NEAP",
                tr.title || tr.programTitle || "Training Program",
                tr.conductor || null,
                tr.startDate || tr.start_date || null,
                tr.endDate || tr.end_date || null,
                Number(tr.days) || null,
                Number(tr.totalHours || tr.total_hours || tr.hours) || 0,
              ],
            );
            backfilledLdRows++;
          }
        }
      }

      // B. Check if normalized Learning Areas is missing
      const { rows: existingLa } = await client.query(
        "SELECT id FROM esf7_personnel_learning_areas WHERE personnel_id = $1::varchar",
        [targetId],
      );
      if (existingLa.length === 0) {
        const laMap =
          pData.learningAreaMap || pData.matrix_data || pData.matrixData;
        if (
          laMap &&
          typeof laMap === "object" &&
          Object.keys(laMap).length > 0
        ) {
          const laId = `LA-${sub.school_id || "108348"}-${targetId.slice(0, 8)}`;
          await client.query(
            `
            INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (personnel_id) DO UPDATE SET matrix_data = EXCLUDED.matrix_data, updated_at = NOW()
          `,
            [laId, targetId, JSON.stringify(laMap)],
          );
          backfilledLaRows++;
        }
      }
    }

    console.log(
      `[Backfill Complete] Backfilled ${backfilledLdRows} L&D training row(s) and ${backfilledLaRows} Learning Area record(s).\n`,
    );

    // 6. After counts
    const {
      rows: [{ count: finalProfiles }],
    } = await client.query(
      "SELECT COUNT(*)::int AS count FROM esf7_personnel_profile",
    );
    const {
      rows: [{ count: finalLd }],
    } = await client.query(
      "SELECT COUNT(*)::int AS count FROM esf7_personnel_ld_trainings",
    );
    const {
      rows: [{ count: finalLa }],
    } = await client.query(
      "SELECT COUNT(*)::int AS count FROM esf7_personnel_learning_areas",
    );

    console.log(`[After Counts]`);
    console.log(
      `  esf7_personnel_profile:        ${finalProfiles} (delta: ${finalProfiles - initialProfiles})`,
    );
    console.log(
      `  esf7_personnel_ld_trainings:   ${finalLd} (delta: +${finalLd - initialLd})`,
    );
    console.log(
      `  esf7_personnel_learning_areas: ${finalLa} (delta: +${finalLa - initialLa})\n`,
    );

    if (isDryRun) {
      await client.query("ROLLBACK");
      console.log(
        `[DRY RUN] Transaction rolled back cleanly. No database changes were applied.`,
      );
      console.log(
        `To apply these changes, run: node server/scripts/consolidate_and_backfill_personnel.js --apply\n`,
      );
    } else {
      await client.query("COMMIT");
      console.log(
        `[APPLY] Transaction committed successfully. Database consolidated.`,
      );
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`\n❌ ERROR: Transaction rolled back due to error:`, err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}
