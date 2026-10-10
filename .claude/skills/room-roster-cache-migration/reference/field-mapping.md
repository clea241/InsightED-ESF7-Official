# Field mapping: esf7_room_roster_cache.roster_json

Generated from `server/scripts/lib/roomRosterFieldMap.js` plus a full dry run on esf7_local (10,697 schools, 310,753 personnel entries; 377 distinct key paths with digits collapsed to N). Regenerate with `node server/scripts/lib/roomRosterFieldMap.js --md` (registry only) or re-run the dry run for fresh counts.

`roster_json` is an **array of personnel objects**. The same field often appears under several spellings (camelCase, snake_case, harvester); the script takes the first non-blank in the order listed in the registry. Placeholders ("N/A", "", "-", "NONE") become NULL; strings are trimmed; school year is normalized to "SY 26-27". Workload, admin and related rows keep keys without a typed column in the table's `extras` jsonb. `raw_payload` is written as `{}`: the full payload is deliberately not copied again.

Contents: [Mapped](#mapped) · [Deliberately skipped](#known-unmapped--deliberately-skipped) · [Out of scope (reported in needs_review)](#out-of-scope-data-reported-in-needs_review) · [Unknown keys](#unknown-keys)

## Mapped
| Key path | Occurrences | Schools | Target | Note |
|---|---|---|---|---|
| `[].administrativeRows` | 68089 | 6119 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrative_rows` | 1471 | 813 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].age` | 217954 | 7434 | esf7_personnel_profile.age |  |
| `[].allowEmailDiscrepancy` | 4721 | 337 | esf7_personnel_profile.allow_email_discrepancy |  |
| `[].allow_email_discrepancy` | 4721 | 337 | esf7_personnel_profile.allow_email_discrepancy |  |
| `[].appt_dd` | 217560 | 7429 | esf7_personnel_employment.first_service_date | appt_* = harvester date parts, fallback |
| `[].appt_mm` | 217560 | 7429 | esf7_personnel_employment.first_service_date | appt_* = harvester date parts, fallback |
| `[].appt_yyyy` | 217560 | 7429 | esf7_personnel_employment.first_service_date | appt_* = harvester date parts, fallback |
| `[].assignedGradeLevels` | 272367 | 8708 | esf7_personnel_employment.grade_levels_taught |  |
| `[].assignedSchools` | 244471 | 8489 | esf7_personnel_employment.assigned_schools |  |
| `[].assigned_grade_levels` | 253369 | 8684 | esf7_personnel_employment.grade_levels_taught |  |
| `[].assigned_schools` | 217955 | 7435 | esf7_personnel_employment.assigned_schools |  |
| `[].birthDate` | 1 | 1 | esf7_personnel_profile.birthdate | placeholders -> NULL |
| `[].birthdate` | 305369 | 10648 | esf7_personnel_profile.birthdate | placeholders -> NULL |
| `[].birthday_dd` | 217560 | 7429 | esf7_personnel_profile.birthdate | fallback when birthdate absent |
| `[].birthday_mm` | 217560 | 7429 | esf7_personnel_profile.birthdate | fallback when birthdate absent |
| `[].birthday_yyyy` | 217560 | 7429 | esf7_personnel_profile.birthdate | fallback when birthdate absent |
| `[].cd` | 1 | 1 | esf7_perssonel_educ.college_degree |  |
| `[].civilStatus` | 260985 | 8583 | esf7_personnel_profile.civil_status |  |
| `[].civil_status` | 219770 | 7592 | esf7_personnel_profile.civil_status |  |
| `[].collegeDegree` | 272367 | 8708 | esf7_perssonel_educ.college_degree |  |
| `[].collegeDegrees` | 232829 | 8473 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].college_degree` | 220323 | 7620 | esf7_perssonel_educ.college_degree |  |
| `[].college_degrees` | 119104 | 7644 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].degreeRows` | 242766 | 8653 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].degree_finished__baccalaureate` | 217560 | 7429 | esf7_perssonel_educ.college_degree |  |
| `[].depedEmail` | 272355 | 8708 | esf7_personnel_profile.deped_email |  |
| `[].deped_email` | 236871 | 8343 | esf7_personnel_profile.deped_email |  |
| `[].deploymentStatus` | 272367 | 8708 | esf7_personnel_employment.deployment_status |  |
| `[].deployment_status` | 244532 | 8575 | esf7_personnel_employment.deployment_status |  |
| `[].designation` | 57118 | 6430 | esf7_personnel_designations.designation_name/serialized_key | strings or objects with name |
| `[].designations` | 224702 | 7874 | esf7_personnel_designations.designation_name/serialized_key | strings or objects with name |
| `[].doctorateDiscipline` | 52783 | 6782 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].doctorateDisciplines` | 53378 | 6800 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].doctorateGraduatedDisciplines` | 216454 | 7872 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].doctorateWithUnitsDisciplines` | 216454 | 7872 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].ehtinic_group` | 217560 | 7429 | esf7_personnel_profile.ethnic_group |  |
| `[].eligibility` | 256024 | 8674 | esf7_perssonel_educ.eligibility | string or array -> jsonb array |
| `[].email` | 73515 | 6452 | esf7_personnel_profile.deped_email |  |
| `[].employeeNo` | 256130 | 8672 | esf7_personnel_profile.employee_no |  |
| `[].employee_no` | 238310 | 8432 | esf7_personnel_profile.employee_no |  |
| `[].ethnicGroup` | 265836 | 8642 | esf7_personnel_profile.ethnic_group |  |
| `[].ethnic_group` | 262035 | 8489 | esf7_personnel_profile.ethnic_group |  |
| `[].extensionName` | 3211 | 1615 | esf7_personnel_profile.name_extension |  |
| `[].first` | 217560 | 7429 | esf7_personnel_profile.first_name |  |
| `[].firstName` | 310753 | 10697 | esf7_personnel_profile.first_name |  |
| `[].firstServiceDate` | 249613 | 8608 | esf7_personnel_employment.first_service_date | appt_* = harvester date parts, fallback |
| `[].first_name` | 218016 | 7441 | esf7_personnel_profile.first_name |  |
| `[].first_service_date` | 123783 | 7526 | esf7_personnel_employment.first_service_date | appt_* = harvester date parts, fallback |
| `[].fundSource` | 272355 | 8708 | esf7_personnel_employment.fund_source |  |
| `[].fund_source` | 244508 | 8575 | esf7_personnel_employment.fund_source |  |
| `[].gender` | 217560 | 7429 | esf7_personnel_profile.sex_at_birth | upper-cased; only MALE/FEMALE accepted |
| `[].gradeLevelsTaught` | 272351 | 8708 | esf7_personnel_employment.grade_levels_taught |  |
| `[].grade_levels_taught` | 253369 | 8684 | esf7_personnel_employment.grade_levels_taught |  |
| `[].highestEducationalAttainment` | 258340 | 8370 | esf7_perssonel_educ.highest_educational_attainment |  |
| `[].highest_educational_attainment` | 121772 | 7357 | esf7_perssonel_educ.highest_educational_attainment |  |
| `[].hiringArrangement` | 250292 | 8582 | esf7_personnel_employment.hiring_arrangement |  |
| `[].hiring_arrangement` | 240325 | 8471 | esf7_personnel_employment.hiring_arrangement |  |
| `[].id` | 310753 | 10697 | esf7_personnel_profile.legacy_id | cache id kept unchanged as legacy_id; id is a new UUID (decision: UUID PK + legacy_id) |
| `[].isSchoolHead` | 245177 | 8436 | esf7_personnel_profile.is_school_head |  |
| `[].is_school_head` | 224337 | 7699 | esf7_personnel_profile.is_school_head |  |
| `[].last` | 217560 | 7429 | esf7_personnel_profile.last_name |  |
| `[].lastLateralMovementDate` | 185390 | 8490 | esf7_personnel_employment.last_lateral_movement_date |  |
| `[].lastName` | 310753 | 10697 | esf7_personnel_profile.last_name |  |
| `[].lastPromotionDate` | 250778 | 8678 | esf7_personnel_employment.last_promotion_date |  |
| `[].last_lateral_movement_date` | 171627 | 8121 | esf7_personnel_employment.last_lateral_movement_date |  |
| `[].last_name` | 218018 | 7450 | esf7_personnel_profile.last_name |  |
| `[].last_promotion_date` | 125621 | 7662 | esf7_personnel_employment.last_promotion_date |  |
| `[].major` | 272367 | 8708 | esf7_perssonel_educ.major |  |
| `[].major__specialization` | 217560 | 7429 | esf7_perssonel_educ.major |  |
| `[].mastersDiscipline` | 52783 | 6782 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].mastersDisciplines` | 53378 | 6800 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].mastersGraduatedDisciplines` | 216454 | 7872 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].mastersWithUnitsDisciplines` | 216454 | 7872 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].middle` | 217560 | 7429 | esf7_personnel_profile.middle_name |  |
| `[].middleName` | 310711 | 10697 | esf7_personnel_profile.middle_name |  |
| `[].middle_name` | 218060 | 7452 | esf7_personnel_profile.middle_name |  |
| `[].minor` | 272367 | 8708 | esf7_perssonel_educ.minor |  |
| `[].name` | 310753 | 10697 | esf7_personnel_profile.first_name/last_name | fallback only: parsed from 'LAST, FIRST' when name parts are missing |
| `[].nameExtension` | 246548 | 8530 | esf7_personnel_profile.name_extension |  |
| `[].name_extension` | 218911 | 7660 | esf7_personnel_profile.name_extension |  |
| `[].natureOfAppointment` | 272355 | 8708 | esf7_personnel_employment.nature_of_appointment |  |
| `[].nature_of_appointment` | 244520 | 8575 | esf7_personnel_employment.nature_of_appointment |  |
| `[].newStationDate` | 257057 | 8696 | esf7_personnel_employment.new_station_date | station_* = harvester date parts, fallback |
| `[].new_station_date` | 125936 | 7676 | esf7_personnel_employment.new_station_date | station_* = harvester date parts, fallback |
| `[].noDepedEmail` | 171925 | 7697 | esf7_personnel_profile.no_deped_email |  |
| `[].noPhilsys` | 141620 | 8250 | esf7_personnel_profile.no_philsys |  |
| `[].noTin` | 272361 | 8708 | esf7_personnel_profile.no_tin |  |
| `[].no_deped_email` | 171925 | 7697 | esf7_personnel_profile.no_deped_email |  |
| `[].no_philsys` | 133766 | 8090 | esf7_personnel_profile.no_philsys |  |
| `[].no_tin` | 245980 | 8597 | esf7_personnel_profile.no_tin |  |
| `[].philsysNo` | 93912 | 7414 | esf7_personnel_profile.philsys_no |  |
| `[].philsys_no` | 33590 | 4360 | esf7_personnel_profile.philsys_no |  |
| `[].phylsys_num` | 217560 | 7429 | esf7_personnel_profile.philsys_no |  |
| `[].plantilla_position` | 257112 | 8228 | esf7_personnel_employment.position |  |
| `[].position` | 310329 | 10697 | esf7_personnel_employment.position |  |
| `[].positionCategory` | 260477 | 8348 | esf7_personnel_employment.position_category |  |
| `[].position_category` | 260477 | 8348 | esf7_personnel_employment.position_category |  |
| `[].position_title` | 256850 | 8122 | esf7_personnel_employment.position |  |
| `[].postGraduateDegree` | 251788 | 8625 | esf7_perssonel_educ.post_graduate_degree | blank -> column default 'N/A' |
| `[].postGraduateDiscipline` | 61318 | 7081 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].post_graduate__degree` | 217560 | 7429 | esf7_perssonel_educ.post_graduate_degree | blank -> column default 'N/A' |
| `[].post_graduate_degree` | 234811 | 8391 | esf7_perssonel_educ.post_graduate_degree | blank -> column default 'N/A' |
| `[].post_graduate_discipline` | 53378 | 6800 | esf7_perssonel_educ.post_graduate_discipline | JSON string kept as object; otherwise assembled from the masters*/doctorate* arrays |
| `[].prcSpecialization` | 262468 | 8564 | esf7_perssonel_educ.prc_specialization |  |
| `[].prc_specialization` | 259400 | 8472 | esf7_perssonel_educ.prc_specialization |  |
| `[].prn` | 310735 | 10697 | esf7_personnel_profile.prn | UNIQUE; missing/placeholder prn => flagged, not migrated |
| `[].religion` | 265868 | 8649 | esf7_personnel_profile.religion |  |
| `[].salutation` | 272367 | 8708 | esf7_personnel_profile.salutation | column default 'MR.' when absent |
| `[].schoolYear` | 217973 | 7434 | esf7_personnel_profile.school_year | normalized to 'SY 26-27' |
| `[].school_year` | 244416 | 8482 | esf7_personnel_profile.school_year | normalized to 'SY 26-27' |
| `[].sex` | 217561 | 7430 | esf7_personnel_profile.sex_at_birth | upper-cased; only MALE/FEMALE accepted |
| `[].sexAtBirth` | 261968 | 8588 | esf7_personnel_profile.sex_at_birth | upper-cased; only MALE/FEMALE accepted |
| `[].sex_at_birth` | 219190 | 7548 | esf7_personnel_profile.sex_at_birth | upper-cased; only MALE/FEMALE accepted |
| `[].shsTrack` | 22007 | 4939 | esf7_perssonel_educ.shs_track |  |
| `[].shs_track` | 719 | 101 | esf7_perssonel_educ.shs_track |  |
| `[].soloParent` | 246560 | 8535 | esf7_personnel_profile.solo_parent | 'YES'/'NO' strings -> boolean |
| `[].solo_parent` | 122087 | 7529 | esf7_personnel_profile.solo_parent | 'YES'/'NO' strings -> boolean |
| `[].station_dd` | 217560 | 7429 | esf7_personnel_employment.new_station_date | station_* = harvester date parts, fallback |
| `[].station_mm` | 217560 | 7429 | esf7_personnel_employment.new_station_date | station_* = harvester date parts, fallback |
| `[].station_yyyy` | 217560 | 7429 | esf7_personnel_employment.new_station_date | station_* = harvester date parts, fallback |
| `[].status__item_` | 217560 | 7429 | esf7_personnel_employment.deployment_status |  |
| `[].stepIncrement` | 249709 | 8612 | esf7_personnel_employment.step_increment | clamped 1..8 |
| `[].step_increment` | 240457 | 8454 | esf7_personnel_employment.step_increment | clamped 1..8 |
| `[].teachingRelatedRows` | 72911 | 6405 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].tin` | 272355 | 8708 | esf7_personnel_profile.tin |  |
| `[].type` | 310753 | 10697 | esf7_personnel_profile.type |  |
| `[].vocationalCourse` | 22014 | 4942 | esf7_perssonel_educ.vocational_course |  |
| `[].vocationalLevel` | 22014 | 4942 | esf7_perssonel_educ.vocational_level |  |
| `[].vocational_course` | 719 | 101 | esf7_perssonel_educ.vocational_course |  |
| `[].vocational_level` | 719 | 101 | esf7_perssonel_educ.vocational_level |  |
| `[].workloadRows` | 272367 | 8708 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |

### Nested keys of mapped child arrays
| Key path | Occurrences | Schools | Target | Note |
|---|---|---|---|---|
| `[].administrativeRows[].category` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].dates` | 19809 | 953 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].days` | 7953 | 753 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].durationMinutes` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].duration_minutes` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].endDate` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].endTime` | 7953 | 753 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].end_date` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].end_time` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].hours` | 7896 | 750 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].id` | 19809 | 953 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].isDesignationSynced` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].is_designation_synced` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].personnelId` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].personnel_id` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].rawPayload` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].schoolId` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].schoolYear` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].school_id` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].school_year` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].startDate` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].startTime` | 7953 | 753 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].start_date` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].start_time` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].status` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].task` | 27669 | 1606 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].taskCategory` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].taskName` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].task_name` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].term` | 7953 | 753 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrativeRows[].termTotalHours` | 93 | 11 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrative_rows[].days` | 8910 | 813 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrative_rows[].endTime` | 8910 | 813 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrative_rows[].hours` | 8910 | 813 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrative_rows[].startTime` | 8910 | 813 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrative_rows[].task` | 8910 | 813 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].administrative_rows[].term` | 8910 | 813 | esf7_admin_task | see CHILDREN.administrativeRows; unmapped keys -> extras |
| `[].collegeDegrees[].clientKey` | 16510 | 1799 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].collegeDegrees[].collegeDegree` | 225017 | 8281 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].collegeDegrees[].level` | 16510 | 1799 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].collegeDegrees[].major` | 225026 | 8281 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].collegeDegrees[].minor` | 225026 | 8281 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].college_degrees[].clientKey` | 11532 | 1596 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].college_degrees[].collegeDegree` | 111138 | 7357 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].college_degrees[].level` | 11532 | 1596 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].college_degrees[].major` | 111144 | 7357 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].college_degrees[].minor` | 111144 | 7357 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].degreeRows[].clientKey` | 126112 | 5362 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].degreeRows[].collegeDegree` | 225112 | 8384 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].degreeRows[].level` | 126112 | 5362 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].degreeRows[].major` | 225121 | 8384 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].degreeRows[].minor` | 225121 | 8384 | esf7_perssonel_educ.college_degrees | longest of the three arrays stored as jsonb |
| `[].teachingRelatedRows[].cadence` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].designatedBySds` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].durationMinutes` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].duration_minutes` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].frequency` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].hours` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].isDesignationSynced` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].isLocked` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].isSdsApproved` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].task` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].teachingRelatedRows[].task_name` | 15762 | 2207 | esf7_related_task | see CHILDREN.teachingRelatedRows; unmapped keys -> extras |
| `[].workloadRows[].category` | 140599 | 2941 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].daySchedule` | 80947 | 3241 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].days` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].durationMinutes` | 80947 | 3241 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].endTime` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].end_time` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].gradeLevel` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].grade_level` | 222283 | 934 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].id` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].minsPerDay` | 221160 | 907 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].personnelId` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].personnel_id` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].rawPayload` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].remediationSubject` | 9679 | 367 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].remediation_subject` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].rowType` | 221160 | 907 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].schoolId` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].schoolYear` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].school_id` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].school_year` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].sectionId` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].sectionName` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].section_id` | 222283 | 934 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].section_name` | 222283 | 934 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].startTime` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].start_time` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].subject` | 432305 | 4388 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].subjectId` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].subjectName` | 82127 | 3280 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].subject_id` | 1343 | 32 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].subject_name` | 221160 | 907 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].task` | 221160 | 907 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].term` | 140633 | 2958 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |
| `[].workloadRows[].trackStrand` | 77300 | 1868 | esf7_workload_rows | see CHILDREN.workloadRows; unmapped keys -> extras |

## Known unmapped / deliberately skipped
Not migrated on purpose; each has a reason in the Note column.

| Key path | Occurrences | Schools | Target | Note |
|---|---|---|---|---|
| `[].administrative` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].advisory` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].all_time` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].ancillary_admin_management` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].ancillary_curriculum` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].ancillary_inter__agency` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].ancillary_professional_development` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].ancillary_program__project` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].araling_panlipunan` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].birthYear` | 272367 | 8708 | - | surrogate/derived id or always-empty field |
| `[].changes` | 217560 | 7429 | - | harvester edit history (ORIGINAL_SNAPSHOT before/after); audit trail, not roster data |
| `[].data` | 217560 | 7429 | - | surrogate/derived id or always-empty field |
| `[].district` | 217560 | 7429 | - | school-level context, already held in school tables |
| `[].division` | 217560 | 7429 | - | school-level context, already held in school tables |
| `[].educationId` | 217954 | 7434 | - | surrogate/derived id or always-empty field |
| `[].employmentId` | 217954 | 7434 | - | surrogate/derived id or always-empty field |
| `[].english` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].esfN_id` | 217560 | 7429 | - | surrogate/derived id or always-empty field |
| `[].esp` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].filipino` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].gmrc` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].grandtotal_load` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].harvested_at` | 217560 | 7429 | - | UI/session state or verification flag (no column) |
| `[].hasNoTeachingLoad` | 31948 | 4364 | - | UI/session state or verification flag (no column) |
| `[].has_no_teaching_load` | 31880 | 4343 | - | UI/session state or verification flag (no column) |
| `[].home_guidance` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].iern` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].isDraft` | 128873 | 7700 | - | UI/session state or verification flag (no column) |
| `[].isVerified` | 15685 | 1189 | - | UI/session state or verification flag (no column) |
| `[].lastVerifiedAt` | 128873 | 7700 | - | UI/session state or verification flag (no column) |
| `[].last_first` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].learningAreaId` | 718 | 100 | - | surrogate/derived id or always-empty field |
| `[].major_specialization` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].mapeh` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].mathematics` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].mtb` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].muncipality` | 217560 | 7429 | - | school-level context, already held in school tables |
| `[].needsTimeReview` | 81562 | 2323 | - | UI/session state or verification flag (no column) |
| `[].noEmployeeNo` | 26947 | 2850 | - | UI/session state or verification flag (no column) |
| `[].no_employee_no` | 26947 | 2850 | - | UI/session state or verification flag (no column) |
| `[].non_major` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].number_of_loads` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].personalVerified` | 148055 | 7775 | - | UI/session state or verification flag (no column) |
| `[].position_value` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].profilingCode` | 277181 | 9007 | - | surrogate/derived id or always-empty field |
| `[].rank_position` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].rawPayload` | 718 | 100 | - | echo of the same row nested inside itself |
| `[].region` | 217560 | 7429 | - | school-level context, already held in school tables |
| `[].related_tasks` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].schoolId` | 217973 | 7434 | - | redundant: school id is the cache row's school_id |
| `[].school_id` | 246380 | 8513 | - | redundant: school id is the cache row's school_id |
| `[].school_name` | 217560 | 7429 | - | school-level context, already held in school tables |
| `[].school_other_info_a` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].school_other_info_b` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].schoool_id` | 217560 | 7429 | - | redundant: school id is the cache row's school_id |
| `[].science` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].search_and_sort` | 217560 | 7429 | - | harvester spreadsheet helper / lookup column |
| `[].semester` | 217560 | 7429 | - | school-level context, already held in school tables |
| `[].shs_applied_subjects` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].shs_core_subjects` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].shs_specialized_subjects` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].stepIncrementConfirmed` | 159956 | 7946 | - | UI confirmation flag; no column in esf7_personnel_employment |
| `[].step_increment_confirmed` | 158959 | 7768 | - | UI confirmation flag; no column in esf7_personnel_employment |
| `[].submitted_at` | 217560 | 7429 | - | UI/session state or verification flag (no column) |
| `[].teachesShs` | 87129 | 6408 | - | UI/session state or verification flag (no column) |
| `[].teaches_shs` | 87129 | 6408 | - | UI/session state or verification flag (no column) |
| `[].teaching_load` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_administrative` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_advisory` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_ancillary_admin_management` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_ancillary_curriculum` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_ancillary_inter__agency` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_ancillary_professional_development` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_ancillary_program__project` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_gmrc` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_home_guidance` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_major` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_nonmajor` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].time_related_tasks` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].tle_epp` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].total_trainings` | 217560 | 7429 | - | derived harvester total, recomputed from workload rows |
| `[].verified` | 15685 | 1189 | - | UI/session state or verification flag (no column) |
| `[].workloadValidated` | 12591 | 2605 | - | UI/session state or verification flag (no column) |
| `[].workloadVerified` | 105409 | 4822 | - | UI/session state or verification flag (no column) |

## Out of scope (data reported in needs_review)
Real data whose target table is not in this skill. Reported once per key as `out_of_scope_key`. Keep the cache until these have a home.

| Key path | Occurrences | Schools | Target | Note |
|---|---|---|---|---|
| `[].N` | 217560 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].categ_N` | 217560 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].categ_N_N` | 4133640 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].certificationRows` | 246597 | 8536 | esf7_personnel_ld_trainings | training/certification rows; table not in this skill's target list |
| `[].certification_rows` | 115784 | 7424 | esf7_personnel_ld_trainings | training/certification rows; table not in this skill's target list |
| `[].dN_N` | 1522920 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].dN_N_N` | 28935480 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].department_N` | 435120 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].department_N_N` | 8267280 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].discipline` | 26598 | 5512 | esf7_perssonel_educ (no column) | PRC licence details have no column in esf7_perssonel_educ |
| `[].from_N` | 217560 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].from_N_N` | 4133640 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].isBorrowed` | 72 | 56 | esf7_requests | sharing/cluster flags belong to the requests flow |
| `[].isClustered` | 132 | 77 | esf7_requests | sharing/cluster flags belong to the requests flow |
| `[].isReassigned` | 21 | 19 | esf7_requests | sharing/cluster flags belong to the requests flow |
| `[].isShared` | 772 | 285 | esf7_requests | sharing/cluster flags belong to the requests flow |
| `[].learningAreaMap` | 239740 | 8508 | esf7_personnel_learning_areas | learning-area matrix; table not in this skill's target list |
| `[].learningAreas` | 12257 | 1673 | esf7_personnel_learning_areas | learning-area matrix; table not in this skill's target list |
| `[].lvl_N` | 217560 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].lvl_N_N` | 4133640 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].matrixData` | 50304 | 5233 | esf7_personnel_learning_areas | learning-area matrix; table not in this skill's target list |
| `[].matrix_data` | 105877 | 7574 | esf7_personnel_learning_areas | learning-area matrix; table not in this skill's target list |
| `[].motherSchoolId` | 72 | 56 | esf7_requests | sharing/cluster flags belong to the requests flow |
| `[].neapTrainingRows` | 247175 | 8556 | esf7_personnel_ld_trainings | training/certification rows; table not in this skill's target list |
| `[].neap_training_rows` | 116437 | 7456 | esf7_personnel_ld_trainings | training/certification rows; table not in this skill's target list |
| `[].otherTrainingRows` | 247798 | 8560 | esf7_personnel_ld_trainings | training/certification rows; table not in this skill's target list |
| `[].other_training_rows` | 117096 | 7460 | esf7_personnel_ld_trainings | training/certification rows; table not in this skill's target list |
| `[].partnerSchoolId` | 132 | 77 | esf7_requests | sharing/cluster flags belong to the requests flow |
| `[].prcExpiryDate` | 26598 | 5512 | esf7_perssonel_educ (no column) | PRC licence details have no column in esf7_perssonel_educ |
| `[].prcLicenseNo` | 26598 | 5512 | esf7_perssonel_educ (no column) | PRC licence details have no column in esf7_perssonel_educ |
| `[].requestType` | 132 | 77 | esf7_requests | sharing/cluster flags belong to the requests flow |
| `[].section_N` | 217560 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].section_N_N` | 4133640 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].specializations` | 12256 | 1673 | esf7_personnel_learning_areas | learning-area matrix; table not in this skill's target list |
| `[].subject_N` | 217560 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].subject_N_N` | 4133640 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].to_N` | 217560 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].to_N_N` | 4133640 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].training_N` | 4351200 | 7429 | esf7_workload_rows (partly) | harvester timetable grid; rows are migrated only via workloadRows[] when present |
| `[].trainings` | 269 | 38 | esf7_personnel_ld_trainings | training/certification rows; table not in this skill's target list |

## Unknown keys
Keys not in the registry. 24 found; every one lands in needs_review as `unmapped_key`. All occur in a single malformed record (one occurrence each, abbreviated keys such as `bd`, `cs`, `fn`, `ln`, `psn`) and should be reviewed by hand.

| Key path | Occurrences | Schools | Target | Note |
|---|---|---|---|---|
| `[].bd` | 1 | 1 | - | key not in registry |
| `[].cs` | 1 | 1 | - | key not in registry |
| `[].ctr` | 1 | 1 | - | key not in registry |
| `[].eg` | 1 | 1 | - | key not in registry |
| `[].el` | 1 | 1 | - | key not in registry |
| `[].fn` | 1 | 1 | - | key not in registry |
| `[].fs` | 1 | 1 | - | key not in registry |
| `[].ln` | 1 | 1 | - | key not in registry |
| `[].mj` | 1 | 1 | - | key not in registry |
| `[].mn` | 1 | 1 | - | key not in registry |
| `[].mr` | 1 | 1 | - | key not in registry |
| `[].na` | 1 | 1 | - | key not in registry |
| `[].nt` | 1 | 1 | - | key not in registry |
| `[].ntr` | 1 | 1 | - | key not in registry |
| `[].otr` | 1 | 1 | - | key not in registry |
| `[].pr` | 1 | 1 | - | key not in registry |
| `[].ps` | 1 | 1 | - | key not in registry |
| `[].psn` | 1 | 1 | - | key not in registry |
| `[].rl` | 1 | 1 | - | key not in registry |
| `[].source` | 1 | 1 | - | key not in registry |
| `[].sp` | 1 | 1 | - | key not in registry |
| `[].sx` | 1 | 1 | - | key not in registry |
| `[].tn` | 1 | 1 | - | key not in registry |
| `[].ty` | 1 | 1 | - | key not in registry |

