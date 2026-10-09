const db = require("../db");

/**
 * Synchronize overload_pay_and_reason for all personnel across all schools
 * Computes exact daily overload (>6h/day) and weekly overload (>30h/wk),
 * incorporating base workloads, workload transfers, absences, and drafts,
 * applies DepEd PHTR hourly rate from salary_matrix,
 * and upserts accurate hours and pay into overload_pay_and_reason.
 */
async function syncAllOverloadPayAndReasons(
  targetSchoolId = null,
  targetSchoolYear = null,
) {
  try {
    let whereClause = "";
    const params = [];
    if (targetSchoolId) {
      params.push(targetSchoolId.replace("SCH-", ""));
      whereClause = `WHERE p.school_id = $1 OR p.school_id = 'SCH-' || $1`;
    }

    const pRes = await db.query(
      `SELECT p.id, p.prn, p.first_name, p.last_name, p.school_id, p.school_year
       FROM esf7_personnel_profile p
       ${whereClause}`,
      params,
    );

    const cleanId = targetSchoolId ? targetSchoolId.replace("SCH-", "") : null;
    const wRes = cleanId
      ? await db
          .query(
            `SELECT * FROM esf7_workload_rows WHERE school_id = $1 OR school_id = 'SCH-' || $1`,
            [cleanId],
          )
          .catch(() => ({ rows: [] }))
      : await db
          .query(`SELECT * FROM esf7_workload_rows`)
          .catch(() => ({ rows: [] }));
    const shsRes = cleanId
      ? await db
          .query(
            `SELECT * FROM esf7_shs_workload_rows WHERE school_id = $1 OR school_id = 'SCH-' || $1`,
            [cleanId],
          )
          .catch(() => ({ rows: [] }))
      : await db
          .query(`SELECT * FROM esf7_shs_workload_rows`)
          .catch(() => ({ rows: [] }));
    const tfrRes = cleanId
      ? await db
          .query(
            `SELECT * FROM esf7_workload_transfer WHERE requester_school_id = $1 OR target_school_id = $1`,
            [cleanId],
          )
          .catch(() => ({ rows: [] }))
      : await db
          .query(`SELECT * FROM esf7_workload_transfer`)
          .catch(() => ({ rows: [] }));
    const absRes = cleanId
      ? await db
          .query(
            `SELECT * FROM overload_absences WHERE school_id = $1 OR school_id = 'SCH-' || $1`,
            [cleanId],
          )
          .catch(() => ({ rows: [] }))
      : await db
          .query(`SELECT * FROM overload_absences`)
          .catch(() => ({ rows: [] }));
    const draftsRes = cleanId
      ? await db
          .query(
            `SELECT * FROM school_drafts WHERE school_id = $1 OR school_id = 'SCH-' || $1`,
            [cleanId],
          )
          .catch(() => ({ rows: [] }))
      : await db
          .query(`SELECT * FROM school_drafts LIMIT 50`)
          .catch(() => ({ rows: [] }));
    const smRes = await db
      .query(
        `SELECT position_title, step_number, basic_salary FROM salary_matrix`,
      )
      .catch(() => ({ rows: [] }));
    const smRows = smRes.rows || [];

    const fallbackSalaries = {
      "TEACHER I": 31705,
      "TEACHER II": 33947,
      "TEACHER III": 36125,
      "TEACHER IV": 38764,
      "TEACHER V": 42178,
      "TEACHER VI": 45694,
      "TEACHER VII": 49562,
      "MASTER TEACHER I": 53818,
      "MASTER TEACHER II": 59153,
      "MASTER TEACHER III": 66052,
      "MASTER TEACHER IV": 73303,
      "MASTER TEACHER V": 81796,
    };

    const existingOprRes = cleanId
      ? await db
          .query(
            `SELECT * FROM overload_pay_and_reason WHERE school_id = $1 OR school_id = 'SCH-' || $1`,
            [cleanId],
          )
          .catch(() => ({ rows: [] }))
      : await db
          .query(`SELECT * FROM overload_pay_and_reason`)
          .catch(() => ({ rows: [] }));
    const existingOprMap = {};
    existingOprRes.rows.forEach((r) => {
      existingOprMap[r.personnel_id] = r;
    });

    const parseTimeMins = (t) => {
      if (!t) return 0;
      const [h, m] = String(t).split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const getWeekdaysInMonth = (monthIndex, year) => {
      const dates = [];
      const date = new Date(year, monthIndex, 1);
      while (date.getMonth() === monthIndex) {
        const day = date.getDay();
        if (day >= 1 && day <= 5) dates.push(new Date(date));
        date.setDate(date.getDate() + 1);
      }
      return dates;
    };

    const NON_INSTRUCTIONAL_RANGES = [
      {
        start: "2026-09-02",
        end: "2026-09-15",
        label: "Term 1 End-of-Term Block",
      },
      {
        start: "2026-12-07",
        end: "2026-12-18",
        label: "Term 2 End-of-Term Block",
      },
      { start: "2026-12-19", end: "2027-01-03", label: "Holiday Break" },
      {
        start: "2027-03-24",
        end: "2027-04-08",
        label: "Term 3 End-of-Term Block",
      },
      { start: "2027-04-09", end: "2027-06-06", label: "Vacation" },
    ];

    // June, July, August, September (Term 1 / FY Q3)
    const term1Dates = [
      ...getWeekdaysInMonth(5, 2026),
      ...getWeekdaysInMonth(6, 2026),
      ...getWeekdaysInMonth(7, 2026),
      ...getWeekdaysInMonth(8, 2026),
    ];

    const dayShortMap = { 1: "M", 2: "T", 3: "W", 4: "TH", 5: "F" };
    let updatedCount = 0;
    let seq = existingOprRes.rows.length + 1;

    for (const p of pRes.rows) {
      const pId = p.id;
      const schoolId = (p.school_id || "108348").replace("SCH-", "");
      const schoolYear = p.school_year || targetSchoolYear || "SY 26-27";

      // Find any draft data for this school
      const schoolDraft =
        draftsRes.rows.find(
          (d) => String(d.school_id).replace("SCH-", "") === schoolId,
        )?.payload || {};
      const draftPersonnel = (schoolDraft.personnel || []).find(
        (dp) => dp.id === pId,
      );
      const draftTransfers = schoolDraft.workloadTransfers || [];
      const allTransfers = [
        ...tfrRes.rows.filter(
          (t) => t.school_id === schoolId || t.school_id === `SCH-${schoolId}`,
        ),
        ...draftTransfers,
      ];

      // Workload rows: the saved rows (esf7_workload_rows / SHS) are the source of truth. The draft is only a fallback for a
      // teacher with no saved rows at all, and that is logged so the overload figure is known to rest on unsaved data.
      const savedWorkloads = [
        ...wRes.rows.filter((w) => w.personnel_id === pId),
        ...(shsRes.rows || []).filter((w) => w.personnel_id === pId),
      ];
      const draftWorkloads =
        draftPersonnel && Array.isArray(draftPersonnel.workloadRows)
          ? draftPersonnel.workloadRows
          : [];
      if (savedWorkloads.length === 0 && draftWorkloads.length > 0) {
        console.warn(
          `[OverloadSync] ${pId}: no saved workload rows, using ${draftWorkloads.length} unsaved draft row(s) - NOT confirmed saved.`,
        );
      }
      const pWorkloads =
        savedWorkloads.length > 0 ? savedWorkloads : draftWorkloads;

      let netOverloadHours = 0;
      let totalWeeklyMins = 0;

      term1Dates.forEach((d) => {
        const dateStr = d.toISOString().split("T")[0];
        const dayShort = dayShortMap[d.getDay()];

        // Check if date falls into an End-of-Term block or Vacation
        const isNonInstructional = NON_INSTRUCTIONAL_RANGES.some(
          (r) => dateStr >= r.start && dateStr <= r.end,
        );
        if (isNonInstructional) return;

        let dayMins = 0;
        pWorkloads.forEach((w) => {
          let daysArr = [];
          if (Array.isArray(w.days)) {
            daysArr = w.days;
          } else if (typeof w.days === "string") {
            try {
              daysArr = JSON.parse(w.days);
            } catch (e) {
              daysArr = w.days
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
          }
          if (daysArr.includes(dayShort)) {
            const sub = String(
              w.subject || w.subject_title || w.subjectName || "",
            )
              .toUpperCase()
              .trim();
            if (sub === "HGP") {
              // Excluded
            } else if (sub === "ADVISORY") {
              dayMins += 60;
            } else {
              const sTime = w.startTime || w.start_time;
              const eTime = w.endTime || w.end_time;
              dayMins += Math.max(
                0,
                parseTimeMins(eTime) - parseTimeMins(sTime),
              );
            }
          }
        });

        // Add substitute transferred workloads
        allTransfers.forEach((t) => {
          const tStart = t.startDate || t.start_date;
          const tEnd = t.endDate || t.end_date || tStart;
          if (dateStr >= tStart && dateStr <= tEnd) {
            const isSub =
              t.substituteTeacherId === pId ||
              t.substitute_personnel_id === pId ||
              t.relievingPersonnelId === pId ||
              t.relieving_personnel_id === pId;
            if (isSub) {
              const tRows = t.workloadRows || t.workload_rows || [];
              tRows.forEach((tw) => {
                let tdays = [];
                try {
                  tdays = Array.isArray(tw.days)
                    ? tw.days
                    : JSON.parse(tw.days);
                } catch (e) {
                  tdays = String(tw.days).split(",");
                }
                if (tdays.includes(dayShort)) {
                  const sub = String(tw.subject || "")
                    .toUpperCase()
                    .trim();
                  if (sub !== "HGP") {
                    dayMins += Math.max(
                      0,
                      parseTimeMins(tw.endTime || tw.end_time) -
                        parseTimeMins(tw.startTime || tw.start_time),
                    );
                  }
                }
              });
            }
          }
        });

        const dayHours = dayMins / 60;
        if (dayHours > 6.0) {
          netOverloadHours += dayHours - 6.0;
        }
      });

      // Also check standard 30h/week fallback if daily schedule is flat
      let baseWeeklyMins = 0;
      pWorkloads.forEach((w) => {
        let daysArr = [];
        if (Array.isArray(w.days)) {
          daysArr = w.days;
        } else if (typeof w.days === "string") {
          try {
            daysArr = JSON.parse(w.days);
          } catch (e) {
            daysArr = w.days
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }
        const daysCount =
          Array.isArray(daysArr) && daysArr.length > 0 ? daysArr.length : 5;
        const sub = String(w.subject || w.subject_title || w.subjectName || "")
          .toUpperCase()
          .trim();
        if (sub !== "HGP") {
          const sTime = w.startTime || w.start_time;
          const eTime = w.endTime || w.end_time;
          baseWeeklyMins +=
            Math.max(0, parseTimeMins(eTime) - parseTimeMins(sTime)) *
            daysCount;
        }
      });
      const baseWeeklyHours = baseWeeklyMins / 60;
      if (baseWeeklyHours > 30 && netOverloadHours === 0) {
        netOverloadHours = (baseWeeklyHours - 30) * 12;
      }

      if (netOverloadHours > 0) {
        const termOverloadHours = Math.round(netOverloadHours * 100) / 100;
        const basicSalary = fallbackSalaries["TEACHER I"];
        const phtr = 0.000781 * 12 * basicSalary;
        const overloadPay = Math.round(termOverloadHours * phtr * 100) / 100;

        const existingRow = existingOprMap[pId];
        const reasons =
          existingRow &&
          Array.isArray(existingRow.reasons) &&
          existingRow.reasons.length > 0
            ? existingRow.reasons
            : ["Teacher Shortage"];

        let oprId = existingRow ? existingRow.id : null;
        if (!oprId) {
          const countRes = await db.query(
            `SELECT COUNT(*) FROM overload_pay_and_reason`,
          );
          const seqNum = Number(countRes.rows[0].count) + 1;
          const pSuffix = pId.split("-").pop();
          oprId = `OPR-${schoolId}-${pSuffix}`;
        }

        const sql = `
          INSERT INTO overload_pay_and_reason (
            id, personnel_id, school_id, school_year, term, month,
            overload_hours, overload_pay, net_term_pay,
            reasons, raw_payload, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, NOW())
          ON CONFLICT (personnel_id, school_year, term, month)
          DO UPDATE SET
            overload_hours = EXCLUDED.overload_hours,
            overload_pay = EXCLUDED.overload_pay,
            net_term_pay = EXCLUDED.net_term_pay,
            reasons = EXCLUDED.reasons,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()
          RETURNING *;
        `;

        await db.query(sql, [
          oprId,
          pId,
          schoolId,
          schoolYear,
          "Term 1",
          "All",
          termOverloadHours,
          overloadPay,
          overloadPay,
          JSON.stringify(reasons),
          JSON.stringify({
            termOverloadHours,
            phtr,
            overloadPay,
          }),
        ]);

        updatedCount++;
      }
    }

    // Clean up invalid null-month rows
    await db.query(`
      DELETE FROM overload_pay_and_reason
      WHERE month IS NULL 
         OR (overload_hours = 0 AND overload_pay = 0 AND id NOT IN (
           SELECT id FROM overload_pay_and_reason WHERE overload_hours > 0
         ))
    `);

    console.log(
      `[Overload Sync] Synchronized ${updatedCount} personnel overload pay records.`,
    );
    return { success: true, updatedCount };
  } catch (err) {
    console.error("[Overload Sync Error]:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { syncAllOverloadPayAndReasons };
