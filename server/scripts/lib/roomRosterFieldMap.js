/**
 * Field registry for esf7_room_roster_cache payloads (roster_json = array of personnel objects).
 * Single source of truth: the migration script classifies keys with it and
 * reference/field-mapping.md is generated from it (node scripts/lib/roomRosterFieldMap.js --md).
 *
 * disposition:
 *   mapped       -> written to a normalized table/column (target says where)
 *   skipped      -> deliberately not migrated (note says why); documented, not flagged per school
 *   out_of_scope -> real data whose target table is not part of this skill; reported once per key in needs_review
 * Keys not matched here are "unknown" and go to needs_review with school id + sample value.
 */

const pat = (k) => String(k).replace(/\d+/g, "N");

const M = (target, note = "") => ({ disposition: "mapped", target, note });
const S = (note) => ({ disposition: "skipped", target: "-", note });
const O = (target, note) => ({ disposition: "out_of_scope", target, note });

const P = "esf7_personnel_profile";
const E = "esf7_personnel_employment";
const D = "esf7_perssonel_educ";

const TOP = {};
const add = (keys, spec) => keys.forEach((k) => (TOP[pat(k)] = spec));

// ---- identity -> esf7_personnel_profile
add(["id"], M(`${P}.legacy_id`, "cache id kept unchanged as legacy_id; id is a new UUID (decision: UUID PK + legacy_id)"));
add(["prn"], M(`${P}.prn`, "UNIQUE; missing/placeholder prn => flagged, not migrated"));
add(["firstName", "first_name", "first"], M(`${P}.first_name`));
add(["middleName", "middle_name", "middle"], M(`${P}.middle_name`));
add(["lastName", "last_name", "last"], M(`${P}.last_name`));
add(["name"], M(`${P}.first_name/last_name`, "fallback only: parsed from 'LAST, FIRST' when name parts are missing"));
add(["nameExtension", "name_extension", "extensionName"], M(`${P}.name_extension`));
add(["salutation"], M(`${P}.salutation`, "column default 'MR.' when absent"));
add(["type"], M(`${P}.type`));
add(["sexAtBirth", "sex_at_birth", "gender", "sex"], M(`${P}.sex_at_birth`, "upper-cased; only MALE/FEMALE accepted"));
add(["birthdate", "birthDate"], M(`${P}.birthdate`, "placeholders -> NULL"));
add(["birthday_dd", "birthday_mm", "birthday_yyyy"], M(`${P}.birthdate`, "fallback when birthdate absent"));
add(["tin"], M(`${P}.tin`));
add(["noTin", "no_tin"], M(`${P}.no_tin`));
add(["philsysNo", "philsys_no", "phylsys_num"], M(`${P}.philsys_no`));
add(["noPhilsys", "no_philsys"], M(`${P}.no_philsys`));
add(["employeeNo", "employee_no"], M(`${P}.employee_no`));
add(["depedEmail", "deped_email", "email"], M(`${P}.deped_email`));
add(["noDepedEmail", "no_deped_email"], M(`${P}.no_deped_email`));
add(["allowEmailDiscrepancy", "allow_email_discrepancy"], M(`${P}.allow_email_discrepancy`));
add(["isSchoolHead", "is_school_head"], M(`${P}.is_school_head`));
add(["civilStatus", "civil_status"], M(`${P}.civil_status`));
add(["soloParent", "solo_parent"], M(`${P}.solo_parent`, "'YES'/'NO' strings -> boolean"));
add(["religion"], M(`${P}.religion`));
add(["ethnicGroup", "ethnic_group", "ehtinic_group"], M(`${P}.ethnic_group`));
add(["age"], M(`${P}.age`));
add(["term"], M(`${P}.term`));
add(["schoolYear", "school_year"], M(`${P}.school_year`, "normalized to 'SY 26-27'"));
add(["schoolId", "school_id", "schoool_id"], S("redundant: school id is the cache row's school_id"));

// ---- employment -> esf7_personnel_employment
add(["positionCategory", "position_category"], M(`${E}.position_category`));
add(["position", "position_title", "plantilla_position"], M(`${E}.position`));
add(["stepIncrement", "step_increment"], M(`${E}.step_increment`, "clamped 1..8"));
add(["fundSource", "fund_source"], M(`${E}.fund_source`));
add(["natureOfAppointment", "nature_of_appointment"], M(`${E}.nature_of_appointment`));
add(["hiringArrangement", "hiring_arrangement"], M(`${E}.hiring_arrangement`));
add(["deploymentStatus", "deployment_status", "status__item_"], M(`${E}.deployment_status`));
add(["assignedSchools", "assigned_schools"], M(`${E}.assigned_schools`));
add(["gradeLevelsTaught", "grade_levels_taught", "assignedGradeLevels", "assigned_grade_levels"], M(`${E}.grade_levels_taught`));
add(["firstServiceDate", "first_service_date", "appt_dd", "appt_mm", "appt_yyyy"], M(`${E}.first_service_date`, "appt_* = harvester date parts, fallback"));
add(["lastPromotionDate", "last_promotion_date"], M(`${E}.last_promotion_date`));
add(["newStationDate", "new_station_date", "station_dd", "station_mm", "station_yyyy"], M(`${E}.new_station_date`, "station_* = harvester date parts, fallback"));
add(["lastLateralMovementDate", "last_lateral_movement_date"], M(`${E}.last_lateral_movement_date`));
add(["stepIncrementConfirmed", "step_increment_confirmed"], S("UI confirmation flag; no column in esf7_personnel_employment"));

// ---- education -> esf7_perssonel_educ
add(["collegeDegree", "college_degree", "degree_finished__baccalaureate", "cd"], M(`${D}.college_degree`));
add(["major", "major__specialization"], M(`${D}.major`));
add(["minor"], M(`${D}.minor`));
add(["postGraduateDegree", "post_graduate_degree", "post_graduate__degree"], M(`${D}.post_graduate_degree`, "blank -> column default 'N/A'"));
add(["postGraduateDiscipline", "post_graduate_discipline", "mastersDiscipline", "mastersDisciplines", "mastersGraduatedDisciplines", "mastersWithUnitsDisciplines", "doctorateDiscipline", "doctorateDisciplines", "doctorateGraduatedDisciplines", "doctorateWithUnitsDisciplines"], M(`${D}.post_graduate_discipline`, "JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays"));
add(["eligibility"], M(`${D}.eligibility`, "string or array -> jsonb array"));
add(["prcSpecialization", "prc_specialization"], M(`${D}.prc_specialization`));
add(["highestEducationalAttainment", "highest_educational_attainment"], M(`${D}.highest_educational_attainment`));
add(["shsTrack", "shs_track"], M(`${D}.shs_track`));
add(["vocationalCourse", "vocational_course"], M(`${D}.vocational_course`));
add(["vocationalLevel", "vocational_level"], M(`${D}.vocational_level`));
add(["degreeRows", "collegeDegrees", "college_degrees"], M(`${D}.college_degrees`, "longest of the three arrays stored as jsonb"));

// ---- designations
add(["designations", "designation"], M("esf7_personnel_designations.designation_name/serialized_key", "strings or objects with name"));

// ---- child row arrays
add(["workloadRows"], M("esf7_workload_rows", "see CHILDREN.workloadRows; unmapped keys -> extras"));
add(["administrativeRows", "administrative_rows"], M("esf7_admin_task", "see CHILDREN.administrativeRows; unmapped keys -> extras"));
add(["teachingRelatedRows"], M("esf7_related_task", "see CHILDREN.teachingRelatedRows; unmapped keys -> extras"));

// ---- derived / UI / audit -> skipped
const derived = "derived harvester total, recomputed from workload rows";
add(["administrative", "advisory", "all_time", "ancillary_admin_management", "ancillary_curriculum", "ancillary_inter__agency", "ancillary_professional_development", "ancillary_program__project", "araling_panlipunan", "english", "esp", "filipino", "gmrc", "grandtotal_load", "home_guidance", "mapeh", "mathematics", "mtb", "non_major", "number_of_loads", "related_tasks", "science", "shs_applied_subjects", "shs_core_subjects", "shs_specialized_subjects", "tle_epp", "teaching_load", "total_trainings", "time_administrative", "time_advisory", "time_ancillary_admin_management", "time_ancillary_curriculum", "time_ancillary_inter__agency", "time_ancillary_professional_development", "time_ancillary_program__project", "time_gmrc", "time_home_guidance", "time_major", "time_nonmajor", "time_related_tasks"], S(derived));
add(["rank_position", "position_value", "major_specialization", "search_and_sort", "last_first", "iern", "school_other_info_a", "school_other_info_b"], S("harvester spreadsheet helper / lookup column"));
add(["region", "district", "division", "muncipality", "school_name", "semester"], S("school-level context, already held in school tables"));
add(["esf7_id", "educationId", "employmentId", "learningAreaId", "profilingCode", "data", "birthYear"], S("surrogate/derived id or always-empty field"));
add(["harvested_at", "submitted_at", "lastVerifiedAt", "isDraft", "verified", "isVerified", "personalVerified", "workloadVerified", "workloadValidated", "needsTimeReview", "hasNoTeachingLoad", "has_no_teaching_load", "teachesShs", "teaches_shs", "noEmployeeNo", "no_employee_no"], S("UI/session state or verification flag (no column)"));
add(["changes"], S("harvester edit history (ORIGINAL_SNAPSHOT before/after); audit trail, not roster data"));
add(["rawPayload"], S("echo of the same row nested inside itself"));

// ---- data-bearing, target outside this skill -> out_of_scope
add(["learningAreaMap", "matrixData", "matrix_data", "learningAreas", "specializations"], O("esf7_personnel_learning_areas", "learning-area matrix; table not in this skill's target list"));
add(["certificationRows", "certification_rows", "neapTrainingRows", "neap_training_rows", "otherTrainingRows", "other_training_rows", "trainings"], O("esf7_personnel_ld_trainings", "training/certification rows; table not in this skill's target list"));
add(["isShared", "isBorrowed", "isClustered", "isReassigned", "motherSchoolId", "partnerSchoolId", "requestType"], O("esf7_requests", "sharing/cluster flags belong to the requests flow"));
add(["discipline", "prcExpiryDate", "prcLicenseNo"], O(`${D} (no column)`, "PRC licence details have no column in esf7_perssonel_educ"));
add(["N", "categ_N", "categ_N_N", "dN_N", "dN_N_N", "department_N", "department_N_N", "from_N", "from_N_N", "to_N", "to_N_N", "lvl_N", "lvl_N_N", "section_N", "section_N_N", "subject_N", "subject_N_N", "training_N"], O("esf7_workload_rows (partly)", "harvester timetable grid; rows are migrated only via workloadRows[] when present"));

// ---- allowed first-level keys inside child arrays (anything else is "unknown")
const CHILDREN = {
  workloadRows: ["id", "personnelId", "personnel_id", "schoolId", "school_id", "schoolYear", "school_year", "gradeLevel", "grade_level", "sectionId", "section_id", "sectionName", "section_name", "subject", "subjectName", "subject_name", "subjectId", "subject_id", "remediationSubject", "remediation_subject", "startTime", "start_time", "endTime", "end_time", "days", "term", "category", "daySchedule", "durationMinutes", "minsPerDay", "rowType", "task", "trackStrand", "rawPayload"],
  administrativeRows: ["id", "personnelId", "personnel_id", "schoolId", "school_id", "schoolYear", "school_year", "taskName", "task_name", "task", "taskCategory", "category", "durationMinutes", "duration_minutes", "hours", "startTime", "start_time", "endTime", "end_time", "days", "term", "dates", "startDate", "start_date", "endDate", "end_date", "termTotalHours", "isDesignationSynced", "is_designation_synced", "status", "rawPayload"],
  administrative_rows: null, // alias of administrativeRows, set below
  teachingRelatedRows: ["id", "task", "task_name", "hours", "cadence", "frequency", "durationMinutes", "duration_minutes", "isLocked", "isSdsApproved", "designatedBySds", "isDesignationSynced"],
  degreeRows: ["clientKey", "collegeDegree", "level", "major", "minor"],
  collegeDegrees: null,
  college_degrees: null,
};
CHILDREN.administrative_rows = CHILDREN.administrativeRows;
CHILDREN.collegeDegrees = CHILDREN.degreeRows;
CHILDREN.college_degrees = CHILDREN.degreeRows;

/**
 * Classify a digit-normalised key path such as "[].workloadRows[].subject".
 * Returns { disposition, target, note } or { disposition: "unknown" }.
 */
function classify(path) {
  const m = /^\[\]\.([^.\[]+)(.*)$/.exec(path);
  if (!m) return { disposition: "unknown", target: "-", note: "not a personnel-level key" };
  const top = m[1];
  const rest = m[2];
  const spec = TOP[top];
  if (!spec) return { disposition: "unknown", target: "-", note: "key not in registry" };
  const kids = CHILDREN[top];
  if (kids && rest) {
    const c = /^\[\]\.([^.\[]+)/.exec(rest);
    if (c && !kids.map(pat).includes(c[1])) {
      return { disposition: "unknown", target: "-", note: `child key "${c[1]}" not in registry for ${top}[]` };
    }
  }
  return spec;
}

module.exports = { pat, TOP, CHILDREN, classify };

if (require.main === module && process.argv.includes("--md")) {
  const rows = Object.entries(TOP).sort((a, b) => a[0].localeCompare(b[0]));
  const out = ["| Payload key (digits shown as N) | Disposition | Target | Note |", "|---|---|---|---|"];
  for (const [k, v] of rows) out.push(`| \`${k}\` | ${v.disposition} | ${v.target} | ${v.note} |`);
  console.log(out.join("\n"));
}
