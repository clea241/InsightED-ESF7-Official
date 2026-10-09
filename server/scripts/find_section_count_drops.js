/**
 * find_section_count_drops.js
 *
 * Read-only audit script to identify schools whose organized class section count
 * dropped sharply between backup snapshots and live database drafts, or exhibit
 * anomalous section-to-personnel ratios (e.g., large faculty with 0-2 sections).
 *
 * Usage:
 *   node server/scripts/find_section_count_drops.js [--dump=/path/to/dump] [--threshold=5]
 */

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const pyScript = path.join(__dirname, "scan_dump_drops.py");
if (fs.existsSync(pyScript)) {
  const result = spawnSync("python3", [pyScript, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status || 0);
}

const { prodPool, getPool } = require("../db");

const DEFAULT_BACKUP_DUMP =
  "/mnt/esf7_backups/20261008_snapshot/db/insighted_esf7.dump";

// Parse CLI arguments
const args = process.argv.slice(2);
let dumpPath = DEFAULT_BACKUP_DUMP;
let dropThreshold = 5;

for (const arg of args) {
  if (arg.startsWith("--dump=")) dumpPath = arg.split("=")[1];
  if (arg.startsWith("--threshold="))
    dropThreshold = parseInt(arg.split("=")[1], 10) || 5;
}

// Helper: Extract section counts per school from a PostgreSQL custom dump
async function extractSectionCountsFromDump(dumpFile) {
  if (!fs.existsSync(dumpFile)) {
    console.warn(
      `[Audit] Backup dump not found at ${dumpFile}. Skipping backup diff analysis.`,
    );
    return null;
  }

  const readline = require("readline");
  const pgRestoreBin = fs.existsSync("/usr/lib/postgresql/17/bin/pg_restore")
    ? "/usr/lib/postgresql/17/bin/pg_restore"
    : "pg_restore";

  console.log(
    `[Audit] Scanning backup dump with ${pgRestoreBin}: ${dumpFile}...`,
  );
  return new Promise((resolve) => {
    const dumpMap = new Map();
    const proc = spawn(pgRestoreBin, [
      "-f",
      "-",
      "-a",
      "-t",
      "school_drafts",
      dumpFile,
    ]);
    const rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (!line || line.startsWith("\\.")) return;
      const tab1 = line.indexOf("\t");
      if (tab1 === -1) return;
      const tab2 = line.indexOf("\t", tab1 + 1);
      if (tab2 === -1) return;
      const tab3 = line.indexOf("\t", tab2 + 1);

      const schoolId = line.substring(0, tab1);
      const schoolYear = line.substring(tab1 + 1, tab2);
      const jsonText =
        tab3 !== -1 ? line.substring(tab2 + 1, tab3) : line.substring(tab2 + 1);
      const updatedAt = tab3 !== -1 ? line.substring(tab3 + 1) : "N/A";

      // Memory-efficient extraction of classSections count without parsing full 2MB+ json blobs
      let sectionCount = 0;
      let personnelCount = 0;
      const secIdx = jsonText.indexOf('"classSections"');
      if (secIdx !== -1) {
        const startBracket = jsonText.indexOf("[", secIdx);
        if (startBracket !== -1) {
          // Find rough end or count section occurrences
          const endBracket = jsonText.indexOf("]", startBracket);
          if (endBracket !== -1) {
            const secSlice = jsonText.substring(startBracket, endBracket + 1);
            try {
              const parsedSec = JSON.parse(secSlice.replace(/\\\\/g, "\\"));
              sectionCount = Array.isArray(parsedSec) ? parsedSec.length : 0;
            } catch (e) {
              // Regex fallback
              const matches = secSlice.match(/"id"\s*:/g);
              sectionCount = matches ? matches.length : 0;
            }
          }
        }
      }

      const perIdx = jsonText.indexOf('"personnel"');
      if (perIdx !== -1) {
        const startP = jsonText.indexOf("[", perIdx);
        if (startP !== -1) {
          const endP = jsonText.indexOf("]", startP);
          if (endP !== -1) {
            const perSlice = jsonText.substring(startP, endP + 1);
            const matches = perSlice.match(/"id"\s*:/g);
            personnelCount = matches ? matches.length : 0;
          }
        }
      }

      dumpMap.set(`${schoolId}_${schoolYear}`, {
        schoolId,
        schoolYear,
        sectionCount,
        personnelCount,
        updatedAt,
      });
    });

    rl.on("close", () => {
      console.log(
        `[Audit] Indexed ${dumpMap.size} school drafts from backup dump.`,
      );
      resolve(dumpMap);
    });

    proc.on("error", (err) => {
      console.warn(`[Audit] pg_restore execution note: ${err.message}.`);
      resolve(null);
    });
  });
}

async function runAudit() {
  const pool = prodPool || getPool();
  console.log(
    "\n========================================================================",
  );
  console.log("      READ-ONLY AUDIT: ORGANIZED CLASS SECTION COUNT DROPS");
  console.log(
    "========================================================================\n",
  );

  try {
    // 1. Fetch live school drafts
    console.log("[Audit] Querying live database school_drafts table...");
    const liveRes = await pool.query(`
      SELECT 
        school_id, 
        school_year, 
        updated_at,
        payload->'schoolInfo'->>'schoolName' as school_name,
        jsonb_array_length(COALESCE(payload->'classSections', '[]'::jsonb)) as live_sections_count,
        jsonb_array_length(COALESCE(payload->'personnel', '[]'::jsonb)) as live_personnel_count
      FROM school_drafts
      ORDER BY live_sections_count ASC, live_personnel_count DESC
    `);

    console.log(
      `[Audit] Retrieved ${liveRes.rows.length} active school drafts in database.\n`,
    );

    // 2. Extract backup counts if dump exists
    const dumpMap = await extractSectionCountsFromDump(dumpPath);

    // 3. Evaluate drops and anomalies
    const droppedSchools = [];
    const anomalousSchools = [];

    for (const row of liveRes.rows) {
      const key = `${row.school_id}_${row.school_year}`;
      const liveSec = parseInt(row.live_sections_count, 10);
      const livePer = parseInt(row.live_personnel_count, 10);
      const schoolName = row.school_name || `School ${row.school_id}`;

      if (dumpMap && dumpMap.has(key)) {
        const backup = dumpMap.get(key);
        const diff = backup.sectionCount - liveSec;
        if (diff >= dropThreshold) {
          droppedSchools.push({
            schoolId: row.school_id,
            schoolYear: row.school_year,
            schoolName,
            backupSections: backup.sectionCount,
            liveSections: liveSec,
            dropCount: diff,
            personnelCount: livePer,
            liveUpdatedAt: row.updated_at,
            backupUpdatedAt: backup.updatedAt,
            type: "BACKUP_DIFF_DROP",
          });
        }
      } else {
        // Heuristic: Large personnel roster (>= 15 teachers) but 0 or <= 2 sections
        if (livePer >= 15 && liveSec <= 2) {
          anomalousSchools.push({
            schoolId: row.school_id,
            schoolYear: row.school_year,
            schoolName,
            liveSections: liveSec,
            personnelCount: livePer,
            liveUpdatedAt: row.updated_at,
            type: "ANOMALOUS_LOW_SECTIONS",
          });
        }
      }
    }

    // 4. Output Results
    if (droppedSchools.length > 0) {
      console.log(
        `🚨 FOUND ${droppedSchools.length} SCHOOL(S) WITH SHARP SECTION COUNT DROPS:`,
      );
      console.log(
        "------------------------------------------------------------------------",
      );
      console.table(
        droppedSchools.map((s) => ({
          "School ID": s.schoolId,
          "School Name": s.schoolName.substring(0, 30),
          SY: s.schoolYear,
          "Backup Sec": s.backupSections,
          "Live Sec": s.liveSections,
          Drop: `-${s.dropCount}`,
          Personnel: s.personnelCount,
          "Last Live Update": s.liveUpdatedAt
            ? new Date(s.liveUpdatedAt).toISOString()
            : "N/A",
        })),
      );
    } else {
      console.log(
        "✓ No schools detected with sharp section count drops against backup dump.",
      );
    }

    if (anomalousSchools.length > 0) {
      console.log(
        `\n⚠️  FOUND ${anomalousSchools.length} SCHOOL(S) WITH ANOMALOUSLY LOW SECTIONS RELATIVE TO PERSONNEL:`,
      );
      console.log(
        "------------------------------------------------------------------------",
      );
      console.table(
        anomalousSchools.map((s) => ({
          "School ID": s.schoolId,
          "School Name": s.schoolName.substring(0, 30),
          SY: s.schoolYear,
          "Live Sec": s.liveSections,
          Personnel: s.personnelCount,
          "Last Live Update": s.liveUpdatedAt
            ? new Date(s.liveUpdatedAt).toISOString()
            : "N/A",
        })),
      );
    }

    console.log(
      "\n[Audit] Completed successfully. (Read-only execution: 0 rows modified).\n",
    );
  } catch (err) {
    console.error("[Audit Error]:", err.message);
  } finally {
    process.exit(0);
  }
}

runAudit();
