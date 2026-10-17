// Schema parity for the personnel tables behind: Date of 1st Day of Service (employment), the L&D tab
// (esf7_personnel_ld_trainings) and PhilSys (profile). ONE list used by:
//   - server/migrations/add_personnel_parity_columns.js  (adds what is missing, additive and idempotent)
//   - server.js at startup                                (logs loudly when a database is behind the code)
//   - tests                                               (the list cannot drift away from the code unnoticed)
//
// Why it exists: schema.sql only runs on a brand-new database, and CREATE TABLE IF NOT EXISTS never adds columns to
// a table that already exists. Several columns the code reads and writes were only ever added by hand on a developer
// machine, so a database created earlier (staging) lacked them and the queries that touch them failed.

// [table, column, definition used when the column is missing]
const REQUIRED_COLUMNS = [
  // ---- esf7_personnel_profile: identity / PhilSys / school head ----
  ["esf7_personnel_profile", "philsys_no", "TEXT"],
  ["esf7_personnel_profile", "no_philsys", "BOOLEAN NOT NULL DEFAULT FALSE"],
  ["esf7_personnel_profile", "birthdate", "DATE"],
  ["esf7_personnel_profile", "employee_no", "TEXT"],
  ["esf7_personnel_profile", "deped_email", "TEXT"],
  [
    "esf7_personnel_profile",
    "no_deped_email",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  ],
  [
    "esf7_personnel_profile",
    "allow_email_discrepancy",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  ],
  [
    "esf7_personnel_profile",
    "is_school_head",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  ],
  ["esf7_personnel_profile", "is_main_sh", "BOOLEAN NOT NULL DEFAULT FALSE"],
  ["esf7_personnel_profile", "school_head_level", "TEXT"],
  [
    "esf7_personnel_profile",
    "disabled_service_years",
    "INTEGER NOT NULL DEFAULT 0",
  ],
  ["esf7_personnel_profile", "deleted", "BOOLEAN NOT NULL DEFAULT FALSE"],
  [
    "esf7_personnel_profile",
    "status",
    "VARCHAR(32) NOT NULL DEFAULT 'canonical'",
  ],
  ["esf7_personnel_profile", "legacy_id", "VARCHAR(128)"],
  ["esf7_personnel_profile", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  [
    "esf7_personnel_profile",
    "updated_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ],

  // ---- esf7_personnel_employment: dates + steps ----
  ["esf7_personnel_employment", "first_service_date", "DATE"],
  ["esf7_personnel_employment", "last_promotion_date", "DATE"],
  ["esf7_personnel_employment", "new_station_date", "DATE"],
  ["esf7_personnel_employment", "last_lateral_movement_date", "DATE"],
  ["esf7_personnel_employment", "step_increment", "INTEGER DEFAULT 1"],
  ["esf7_personnel_employment", "actual_step", "INTEGER"],
  ["esf7_personnel_employment", "school_reported_step", "INTEGER"],
  [
    "esf7_personnel_employment",
    "deployment_status",
    "TEXT DEFAULT 'OWN STATION'",
  ],
  [
    "esf7_personnel_employment",
    "assigned_schools",
    "JSONB DEFAULT '[]'::jsonb",
  ],
  [
    "esf7_personnel_employment",
    "grade_levels_taught",
    "JSONB DEFAULT '[]'::jsonb",
  ],
  ["esf7_personnel_employment", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  [
    "esf7_personnel_employment",
    "updated_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ],

  // ---- esf7_personnel_ld_trainings: the whole L&D row ----
  ["esf7_personnel_ld_trainings", "conductor", "TEXT"],
  ["esf7_personnel_ld_trainings", "start_date", "DATE"],
  ["esf7_personnel_ld_trainings", "end_date", "DATE"],
  ["esf7_personnel_ld_trainings", "days", "INTEGER"],
  ["esf7_personnel_ld_trainings", "total_hours", "NUMERIC"],
  ["esf7_personnel_ld_trainings", "raw_payload", "JSONB DEFAULT '{}'::jsonb"],
  [
    "esf7_personnel_ld_trainings",
    "created_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ],
  [
    "esf7_personnel_ld_trainings",
    "updated_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ],

  // ---- learning areas ----
  ["esf7_personnel_learning_areas", "matrix_data", "JSONB DEFAULT '{}'::jsonb"],
  [
    "esf7_personnel_learning_areas",
    "updated_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ],
];

// Columns that must be real DATEs (a text column would show/shift dates differently and break date maths).
const DATE_COLUMNS = REQUIRED_COLUMNS.filter(([, , def]) =>
  /^DATE\b/.test(def),
).map(([table, column]) => [table, column]);

// Unique keys the upserts rely on (ON CONFLICT ...). [table, [columns]]
const REQUIRED_UNIQUE = [
  ["esf7_personnel_employment", ["personnel_id"]],
  ["esf7_personnel_learning_areas", ["personnel_id"]],
  ["esf7_personnel_designations", ["personnel_id", "serialized_key"]],
];

/**
 * Read-only comparison of a database with the list above.
 * @param {(sql: string, params?: any[]) => Promise<{rows: any[]}>} query
 * @returns {Promise<{table:string,column:string,problem:string,found?:string}[]>}
 */
async function findParityGaps(query) {
  const tables = [...new Set(REQUIRED_COLUMNS.map(([t]) => t))];
  const res = await query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [tables],
  );
  const have = new Map(
    res.rows.map((r) => [`${r.table_name}.${r.column_name}`, r.data_type]),
  );
  const tablesPresent = new Set(res.rows.map((r) => r.table_name));
  const gaps = [];
  for (const [table, column] of REQUIRED_COLUMNS) {
    if (!tablesPresent.has(table)) {
      if (!gaps.some((g) => g.table === table && g.problem === "table missing"))
        gaps.push({ table, column: "*", problem: "table missing" });
      continue;
    }
    if (!have.has(`${table}.${column}`)) {
      gaps.push({ table, column, problem: "column missing" });
    }
  }
  for (const [table, column] of DATE_COLUMNS) {
    const type = have.get(`${table}.${column}`);
    if (type && type !== "date") {
      gaps.push({ table, column, problem: "should be date", found: type });
    }
  }
  return gaps;
}

module.exports = {
  REQUIRED_COLUMNS,
  DATE_COLUMNS,
  REQUIRED_UNIQUE,
  findParityGaps,
};
