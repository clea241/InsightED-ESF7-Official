// "Saved" may only be reported when the record the server read back from the database says so.
// verifyStoredPersonnel compares what was sent with the stored record the server returned and lists every
// difference in the fields that keep going missing between environments: the tenure dates, PhilSys and L&D rows.

const PLACEHOLDER = /^(|n\/?a|none|null|undefined|-|--|—)$/i;

/** 'YYYY-MM-DD' as written (never converted through a time zone), or "" for blank / placeholder / not a date. */
export const calendarDay = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (PLACEHOLDER.test(s)) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : "";
};

const first = (obj, ...keys) => {
  for (const k of keys) if (obj && obj[k] !== undefined) return obj[k];
  return undefined;
};

const DATE_FIELDS = [
  ["firstServiceDate", "first_service_date", "Date of 1st Day of Service"],
  ["lastPromotionDate", "last_promotion_date", "Date of Last Promotion"],
  ["newStationDate", "new_station_date", "Date of New Station"],
  [
    "lastLateralMovementDate",
    "last_lateral_movement_date",
    "Date of Last Lateral Movement",
  ],
];

const TRAINING_KEYS = [
  ["neapTrainingRows", "neap_training_rows", "NEAP trainings"],
  ["certificationRows", "certification_rows", "Certifications"],
  ["otherTrainingRows", "other_training_rows", "Other trainings"],
];

export function verifyStoredPersonnel(sent, stored) {
  const problems = [];
  if (!stored || typeof stored !== "object") {
    return ["The server did not return the stored record."];
  }

  for (const [camel, snake, label] of DATE_FIELDS) {
    const want = calendarDay(first(sent, camel, snake));
    if (!want) continue; // blank / N/A is not something to enforce
    const got = calendarDay(first(stored, camel, snake));
    if (got !== want) {
      problems.push(`${label}: sent ${want}, stored ${got || "nothing"}`);
    }
  }

  const noPhilsys = Boolean(first(sent, "noPhilsys", "no_philsys"));
  const wantPhilsys = String(
    first(sent, "philsysNo", "philsys_no") ?? "",
  ).trim();
  if (!noPhilsys && wantPhilsys && !PLACEHOLDER.test(wantPhilsys)) {
    const gotPhilsys = String(
      first(stored, "philsysNo", "philsys_no") ?? "",
    ).trim();
    if (gotPhilsys !== wantPhilsys) {
      problems.push(
        `PhilSys number: sent ${wantPhilsys}, stored ${gotPhilsys || "nothing"}`,
      );
    }
  }

  for (const [camel, snake, label] of TRAINING_KEYS) {
    const sentRows = first(sent, camel, snake);
    if (!Array.isArray(sentRows)) continue; // not part of this save
    const storedRows = first(stored, camel, snake);
    const storedCount = Array.isArray(storedRows) ? storedRows.length : 0;
    if (storedCount !== sentRows.length) {
      problems.push(
        `${label}: sent ${sentRows.length} row(s), stored ${storedCount}`,
      );
    }
  }
  const sentLa = first(sent, "learningAreaMap", "matrix_data", "matrixData");
  if (sentLa && typeof sentLa === "object" && Object.keys(sentLa).length > 0) {
    const storedLa = first(
      stored,
      "learningAreaMap",
      "matrix_data",
      "matrixData",
    );
    const storedKeys =
      storedLa && typeof storedLa === "object"
        ? Object.keys(storedLa).filter((k) => storedLa[k]?.checked)
        : [];
    const sentChecked = Object.keys(sentLa).filter((k) => sentLa[k]?.checked);
    if (sentChecked.length > 0 && storedKeys.length === 0) {
      problems.push(
        `Learning areas: sent ${sentChecked.length} allocated area(s), stored nothing`,
      );
    }
  }

  return problems;
}

// The fields a verified save is allowed to copy back into local state (what the database holds wins).
export const STORED_FIELDS_TO_ADOPT = [
  "firstName",
  "first_name",
  "middleName",
  "middle_name",
  "lastName",
  "last_name",
  "nameExtension",
  "name_extension",
  "extensionName",
  "salutation",
  "sexAtBirth",
  "sex_at_birth",
  "civilStatus",
  "civil_status",
  "soloParent",
  "solo_parent",
  "religion",
  "ethnicGroup",
  "ethnic_group",
  "birthdate",
  "age",
  "tin",
  "noTin",
  "no_tin",
  "depedEmail",
  "deped_email",
  "noDepedEmail",
  "no_deped_email",
  "allowEmailDiscrepancy",
  "allow_email_discrepancy",
  "isSchoolHead",
  "is_school_head",
  "isMainSchoolHead",
  "is_main_school_head",
  "is_main_sh",
  "position",
  "positionCategory",
  "position_category",
  "type",
  "fundSource",
  "fund_source",
  "natureOfAppointment",
  "nature_of_appointment",
  "hiringArrangement",
  "hiring_arrangement",
  "deploymentStatus",
  "deployment_status",
  "assignedSchools",
  "assigned_schools",
  "gradeLevelsTaught",
  "grade_levels_taught",
  "assignedGradeLevels",
  "assigned_grade_levels",
  "teachesShs",
  "teaches_shs",
  "hasNoTeachingLoad",
  "has_no_teaching_load",
  "highestEducationalAttainment",
  "highest_educational_attainment",
  "collegeDegree",
  "college_degree",
  "collegeDegrees",
  "college_degrees",
  "degreeRows",
  "major",
  "minor",
  "postGraduateDegree",
  "post_graduate_degree",
  "postGraduateDiscipline",
  "post_graduate_discipline",
  "prcSpecialization",
  "prc_specialization",
  "eligibility",
  "shsTrack",
  "shs_track",
  "vocationalCourse",
  "vocational_course",
  "vocationalLevel",
  "vocational_level",
  "disabledServiceYears",
  "disabled_service_years",
  "employeeNo",
  "employee_no",
  "firstServiceDate",
  "first_service_date",
  "lastPromotionDate",
  "last_promotion_date",
  "newStationDate",
  "new_station_date",
  "lastLateralMovementDate",
  "last_lateral_movement_date",
  "stepIncrement",
  "step_increment",
  "actualStep",
  "actual_step",
  "schoolReportedStep",
  "school_reported_step",
  "stepIncrementConfirmed",
  "step_increment_confirmed",
  "philsysNo",
  "philsys_no",
  "noPhilsys",
  "no_philsys",
  "neapTrainingRows",
  "certificationRows",
  "otherTrainingRows",
  "learningAreaMap",
  "matrix_data",
  "updated_at",
  "updatedAt",
];
