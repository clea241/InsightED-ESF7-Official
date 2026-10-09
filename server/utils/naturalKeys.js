// Proposed natural keys for tables that today have only a surrogate `id`. One definition, used by the duplicate audit,
// the gated dedupe and the unique-index migration, so all three agree on what "the same record" means.
//
// `exprs` are SQL expressions (NULL-safe) that together identify a record; `where` limits a PARTIAL unique index.
// `schoolCol` is the column used to scope a report to one school.

const TIME_BLOCK = (personnel = "personnel_id") => [
  personnel,
  "COALESCE(term, '1st')",
  "start_time",
  "end_time",
  "COALESCE(days::text, '')",
  "COALESCE(NULLIF(section_id, ''), section_name, '')",
  "subject",
];

const NATURAL_KEYS = [
  {
    table: "esf7_workload_rows",
    index: "ux_workload_rows_slot",
    exprs: TIME_BLOCK(),
    schoolCol: "school_id",
    note: "one teacher, term, day set, time slot, section and subject = one block",
  },
  {
    table: "esf7_shs_workload_rows",
    index: "ux_shs_workload_rows_slot",
    exprs: TIME_BLOCK(),
    schoolCol: "school_id",
    note: "same rule for SHS blocks",
  },
  {
    table: "esf7_admin_task",
    index: "ux_admin_task_slot",
    exprs: [
      "personnel_id",
      "COALESCE(term, '1st')",
      "task_name",
      "COALESCE(start_time::text, '')",
      "COALESCE(end_time::text, '')",
      "COALESCE(days::text, '')",
    ],
    schoolCol: "school_id",
    note: "one task at one time slot per teacher and term",
  },
  {
    table: "esf7_related_task",
    index: "ux_related_task_name",
    exprs: ["personnel_id", "task_name", "COALESCE(frequency::text, '')"],
    schoolCol: "school_id",
    note: "one related task per teacher and frequency",
  },
  {
    table: "esf7_personnel_designations",
    index: "ux_designations_serialized_key",
    exprs: ["personnel_id", "serialized_key"],
    where: "serialized_key IS NOT NULL",
    schoolCol: null,
    note: "serialized_key already encodes the designation; unique per teacher",
  },
  {
    table: "esf7_aral_sections",
    index: "ux_aral_sections_key",
    exprs: [
      "school_id",
      "school_year",
      "COALESCE(term, '')",
      "COALESCE(basis_type, '')",
      "grade_level",
      "section_name",
    ],
    schoolCol: "school_id",
    note: "one ARAL section name per school, year, term, basis and grade",
  },
  {
    table: "esf7_remedial_enrichment_sections",
    index: "ux_remedial_sections_key",
    exprs: [
      "school_id",
      "school_year",
      "COALESCE(term, '')",
      "COALESCE(intervention_type, '')",
      "grade_level",
      "section_name",
    ],
    schoolCol: "school_id",
    note: "one remedial/enrichment section name per school, year, term, type and grade",
  },
  {
    table: "esf7_requests",
    index: "ux_requests_one_pending",
    exprs: [
      "requester_school_id",
      "target_school_id",
      "COALESCE(school_year, '')",
      "request_type",
      "COALESCE(personnel_id, '')",
    ],
    where: "status = 'pending'",
    schoolCol: "requester_school_id",
    note: "only ONE pending request of a kind per person; approved/rejected history may repeat",
  },
];

const keyList = (k) => k.exprs.join(", ");

module.exports = { NATURAL_KEYS, keyList };
