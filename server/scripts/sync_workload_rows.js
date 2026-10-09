const db = require("../db");

async function syncWorkloadRows() {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // Clear old sample/stale rows
    await client.query("DELETE FROM esf7_workload_rows");

    const pRes = await client.query(
      "SELECT id, school_id, school_year, first_name, last_name, raw_payload FROM esf7_personnel_profile ORDER BY id ASC",
    );
    let totalInserted = 0;

    for (const p of pRes.rows) {
      const pId = p.id;
      const schoolId = String(p.school_id || "100115").replace("SCH-", "");
      const schoolYear = p.school_year || "SY 26-27";
      const raw = p.raw_payload || {};
      const wkList = Array.isArray(raw.workloadRows) ? raw.workloadRows : [];

      let counter = 1;
      for (const wk of wkList) {
        if (!wk || (!wk.subject && !wk.subjectName && !wk.task)) continue;

        const seq = String(counter++).padStart(3, "0");
        const cleanPId = pId.replace(/[^0-9]/g, "").slice(-3) || "001";
        const wklId = `WKL-${schoolId}-${cleanPId}-${seq}`;

        const gradeLevel = wk.gradeLevel || wk.grade_level || "";
        const sectionId = wk.sectionId || wk.section_id || null;
        const sectionName = wk.sectionName || wk.section_name || "";
        const subject =
          wk.subject || wk.subjectName || wk.task || "MATHEMATICS";
        const startTime = wk.startTime || wk.start_time || "08:00";
        const endTime = wk.endTime || wk.end_time || "09:00";
        const days =
          Array.isArray(wk.days) && wk.days.length > 0
            ? wk.days
            : ["M", "T", "W", "TH", "F"];
        const term = wk.term || "1st";

        await client.query(
          `
          INSERT INTO esf7_workload_rows (
            id, personnel_id, school_id, school_year, grade_level, section_id, section_name,
            subject, start_time, end_time, days, term, raw_payload, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb, NOW(), NOW())
        `,
          [
            wklId,
            pId,
            schoolId,
            schoolYear,
            gradeLevel,
            sectionId,
            sectionName,
            subject,
            startTime,
            endTime,
            JSON.stringify(days),
            term,
            JSON.stringify(wk),
          ],
        );
        totalInserted++;
      }
    }

    await client.query("COMMIT");
    console.log(
      `✅ Successfully synced ${totalInserted} clean workload rows into esf7_workload_rows!`,
    );

    // Query preview of inserted rows
    const checkRes = await client.query(
      "SELECT id, personnel_id, subject, grade_level, section_name, start_time, end_time, days FROM esf7_workload_rows ORDER BY personnel_id, start_time",
    );
    console.table(checkRes.rows);

    return totalInserted;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error syncing workload rows:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  syncWorkloadRows()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { syncWorkloadRows };
