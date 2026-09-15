import { pgTable, index, foreignKey, unique, check, varchar, text, integer, jsonb, date, timestamp, boolean, numeric, serial, bigint, time, primaryKey, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const esf7PersonnelEmployment = pgTable("esf7_personnel_employment", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	positionCategory: text("position_category").notNull(),
	position: text().notNull(),
	stepIncrement: integer("step_increment").default(1),
	fundSource: text("fund_source").notNull(),
	natureOfAppointment: text("nature_of_appointment").notNull(),
	hiringArrangement: text("hiring_arrangement").notNull(),
	deploymentStatus: text("deployment_status").default('OWN STATION'),
	assignedSchools: jsonb("assigned_schools").default([]),
	gradeLevelsTaught: jsonb("grade_levels_taught").default([]),
	firstServiceDate: date("first_service_date"),
	lastPromotionDate: date("last_promotion_date"),
	newStationDate: date("new_station_date"),
	lastLateralMovementDate: date("last_lateral_movement_date"),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_personnel_employment_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_personnel_employment_personnel_id_fkey"
		}).onDelete("cascade"),
	unique("esf7_personnel_employment_personnel_id_key").on(table.personnelId),
	check("esf7_personnel_employment_position_category_check", sql`position_category = ANY (ARRAY['TEACHING'::text, 'RELATED TEACHING'::text, 'NON-TEACHING'::text, 'teaching'::text, 'teaching-related'::text, 'non-teaching'::text])`),
	check("esf7_personnel_employment_step_increment_check", sql`(step_increment >= 1) AND (step_increment <= 8)`),
]);

export const esf7PersonnelExtraTasks = pgTable("esf7_personnel_extra_tasks", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }),
	schoolId: varchar("school_id", { length: 50 }).notNull(),
	schoolYear: varchar("school_year", { length: 20 }).default('SY 26-27').notNull(),
	taskCategory: varchar("task_category", { length: 50 }).notNull(),
	taskName: varchar("task_name", { length: 255 }).notNull(),
	calendarDates: jsonb("calendar_dates").default([]),
	startTime: varchar("start_time", { length: 10 }),
	endTime: varchar("end_time", { length: 10 }),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_extra_tasks_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_extra_tasks_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
]);

export const esf7PersonnelProfile = pgTable("esf7_personnel_profile", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	prn: text().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	type: text().default('teaching').notNull(),
	salutation: text().default('MR.').notNull(),
	firstName: text("first_name").notNull(),
	middleName: text("middle_name"),
	lastName: text("last_name").notNull(),
	nameExtension: text("name_extension"),
	tin: text(),
	noTin: boolean("no_tin").default(false).notNull(),
	sexAtBirth: text("sex_at_birth"),
	civilStatus: text("civil_status"),
	soloParent: boolean("solo_parent").default(false).notNull(),
	religion: text(),
	ethnicGroup: text("ethnic_group"),
	birthdate: date(),
	age: integer(),
	philsysNo: text("philsys_no"),
	employeeNo: text("employee_no"),
	depedEmail: text("deped_email"),
	isSchoolHead: boolean("is_school_head").default(false).notNull(),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	term: text().default('1st'),
	noPhilsys: boolean("no_philsys").default(false).notNull(),
}, (table) => [
	index("idx_esf7_personnel_profile_prn").using("btree", table.prn.asc().nullsLast().op("text_ops")),
	index("idx_esf7_personnel_profile_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	unique("esf7_personnel_profile_prn_key").on(table.prn),
	check("esf7_personnel_profile_type_check", sql`type = ANY (ARRAY['teaching'::text, 'teaching-related'::text, 'non-teaching'::text])`),
	check("esf7_personnel_profile_sex_at_birth_check", sql`sex_at_birth = ANY (ARRAY['Male'::text, 'Female'::text, 'MALE'::text, 'FEMALE'::text])`),
]);

export const esf7PerssonelEduc = pgTable("esf7_perssonel_educ", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	collegeDegree: text("college_degree"),
	major: text(),
	minor: text(),
	postGraduateDegree: text("post_graduate_degree").default('N/A'),
	postGraduateDiscipline: text("post_graduate_discipline"),
	eligibility: jsonb().default([]),
	prcSpecialization: text("prc_specialization"),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	highestEducationalAttainment: text("highest_educational_attainment").default('COLLEGE GRADUATE / BACCALAUREATE').notNull(),
	shsTrack: text("shs_track"),
	vocationalCourse: text("vocational_course"),
	vocationalLevel: text("vocational_level"),
}, (table) => [
	index("idx_esf7_perssonel_educ_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_perssonel_educ_personnel_id_fkey"
		}).onDelete("cascade"),
	unique("esf7_perssonel_educ_personnel_id_key").on(table.personnelId),
]);

export const esf7RegularSections = pgTable("esf7_regular_sections", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").default('2026-2027').notNull(),
	gradeLevel: text("grade_level").notNull(),
	sectionName: text("section_name").notNull(),
	adviserId: varchar("adviser_id", { length: 50 }),
	sectionType: text("section_type").default('MONO GRADE').notNull(),
	maleLearners: integer("male_learners").default(0),
	femaleLearners: integer("female_learners").default(0),
	numberOfLearners: integer("number_of_learners").default(0),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	term: text().default('1st'),
	sizeStatus: text("size_status").default('WITHIN STANDARD'),
}, (table) => [
	index("idx_regular_sections_adviser").using("btree", table.adviserId.asc().nullsLast().op("text_ops")),
	index("idx_regular_sections_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.adviserId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_regular_sections_adviser_id_fkey"
		}).onDelete("set null"),
	unique("uq_regular_section_school_sy").on(table.schoolId, table.schoolYear, table.gradeLevel, table.sectionName),
]);

export const esf7PersonnelLdTrainings = pgTable("esf7_personnel_ld_trainings", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	trainingType: text("training_type").notNull(),
	title: text().notNull(),
	conductor: text(),
	startDate: date("start_date"),
	endDate: date("end_date"),
	days: integer(),
	totalHours: numeric("total_hours"),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_personnel_ld_trainings_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_esf7_personnel_ld_trainings_type").using("btree", table.trainingType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_personnel_ld_trainings_personnel_id_fkey"
		}).onDelete("cascade"),
	check("esf7_personnel_ld_trainings_training_type_check", sql`training_type = ANY (ARRAY['NEAP'::text, 'TESDA'::text, 'OTHER'::text, 'neap'::text, 'tesda'::text, 'other'::text])`),
]);

export const esf7RemedialEnrichmentSections = pgTable("esf7_remedial_enrichment_sections", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").default('2026-2027').notNull(),
	interventionType: text("intervention_type").default('REMEDIAL').notNull(),
	gradeLevel: text("grade_level").notNull(),
	sectionName: text("section_name").notNull(),
	assignedTeacherId: varchar("assigned_teacher_id", { length: 50 }),
	maleLearners: integer("male_learners").default(0),
	femaleLearners: integer("female_learners").default(0),
	totalLearners: integer("total_learners").default(0),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	term: text().default('1st'),
}, (table) => [
	index("idx_remedial_sections_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	index("idx_remedial_sections_teacher").using("btree", table.assignedTeacherId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.assignedTeacherId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_remedial_enrichment_sections_assigned_teacher_id_fkey"
		}).onDelete("set null"),
]);

export const esf7Link = pgTable("esf7_link", {
	schoolId: text("school_id").primaryKey().notNull(),
	link: text().notNull(),
	rowCount: integer("row_count"),
	previewData: jsonb("preview_data"),
	summary: jsonb(),
	status: text().default('PENDING_SDO'),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const esf7PersonnelLearningAreas = pgTable("esf7_personnel_learning_areas", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	matrixData: jsonb("matrix_data").default({}),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_personnel_learning_areas_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_personnel_learning_areas_personnel_id_fkey"
		}).onDelete("cascade"),
	unique("esf7_personnel_learning_areas_personnel_id_key").on(table.personnelId),
]);

export const clusteredPersonnel = pgTable("clustered_personnel", {
	id: serial().primaryKey().notNull(),
	prn: varchar({ length: 255 }).notNull(),
	sourceSchoolId: varchar("source_school_id", { length: 255 }).notNull(),
	targetSchoolId: varchar("target_school_id", { length: 255 }).notNull(),
	sharedAt: timestamp("shared_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	unique("clustered_personnel_prn_source_school_id_target_school_id_key").on(table.prn, table.sourceSchoolId, table.targetSchoolId),
]);

export const esf7PersonnelDesignations = pgTable("esf7_personnel_designations", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	designationName: text("designation_name").notNull(),
	gradeLevel: text("grade_level"),
	subjectArea: text("subject_area"),
	track: text(),
	isSdsApproved: boolean("is_sds_approved").default(false).notNull(),
	sdsConfirmed: boolean("sds_confirmed").default(false).notNull(),
	serializedKey: text("serialized_key").notNull(),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_personnel_designations_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_personnel_designations_personnel_id_fkey"
		}).onDelete("cascade"),
]);

export const esf7RelatedTask = pgTable("esf7_related_task", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: varchar("school_id", { length: 50 }).notNull(),
	schoolYear: varchar("school_year", { length: 20 }).default('2026-2027').notNull(),
	taskName: text("task_name").notNull(),
	frequency: varchar({ length: 20 }).default('weekly').notNull(),
	durationMinutes: integer("duration_minutes").default(60).notNull(),
	term1Hours: numeric("term1_hours", { precision: 6, scale: 2 }).default('0.00'),
	isDesignationSynced: boolean("is_designation_synced").default(false),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_related_task_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_related_task_personnel_id_fkey"
		}).onDelete("cascade"),
]);

export const esf7AdminTask = pgTable("esf7_admin_task", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: varchar("school_id", { length: 50 }).notNull(),
	schoolYear: varchar("school_year", { length: 20 }).default('2026-2027').notNull(),
	taskName: text("task_name").notNull(),
	dates: jsonb().default([]),
	durationMinutes: integer("duration_minutes").default(60).notNull(),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_admin_task_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_admin_task_personnel_id_fkey"
		}).onDelete("cascade"),
]);

export const esf7RoomSubmissionsStaging = pgTable("esf7_room_submissions_staging", {
	id: varchar({ length: 128 }).primaryKey().notNull(),
	schoolId: varchar("school_id", { length: 64 }).notNull(),
	personnelId: varchar("personnel_id", { length: 64 }).notNull(),
	personnelName: varchar("personnel_name", { length: 255 }),
	room: varchar({ length: 255 }),
	profileData: jsonb("profile_data").notNull(),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	submittedTimestamp: bigint("submitted_timestamp", { mode: "number" }),
}, (table) => [
	index("idx_room_sub_staging_school").using("btree", table.schoolId.asc().nullsLast().op("text_ops")),
]);

export const salaryMatrix = pgTable("salary_matrix", {
	id: serial().primaryKey().notNull(),
	salaryGrade: integer("salary_grade").notNull(),
	stepNumber: integer("step_number").notNull(),
	basicSalary: numeric("basic_salary", { precision: 10, scale:  2 }).notNull(),
	positionTitle: text("position_title"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_salary_matrix_lookup").using("btree", table.salaryGrade.asc().nullsLast().op("int4_ops"), table.stepNumber.asc().nullsLast().op("int4_ops")),
	unique("uq_salary_grade_step").on(table.salaryGrade, table.stepNumber),
]);

export const esf7ShsWorkloadRows = pgTable("esf7_shs_workload_rows", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	term: text().default('1st').notNull(),
	semester: text(),
	gradeLevel: text("grade_level").notNull(),
	trackStrand: text("track_strand"),
	shsSubjectCategory: text("shs_subject_category"),
	sectionId: varchar("section_id", { length: 50 }),
	sectionName: text("section_name"),
	subject: text().notNull(),
	subjectId: varchar("subject_id", { length: 50 }),
	remediationSubject: text("remediation_subject"),
	startTime: time("start_time"),
	endTime: time("end_time"),
	days: jsonb().default(["M","T","W","TH","F"]),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_shs_workload_rows_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_esf7_shs_workload_rows_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	index("idx_esf7_shs_workload_rows_term").using("btree", table.personnelId.asc().nullsLast().op("text_ops"), table.term.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_shs_workload_rows_personnel_id_fkey"
		}).onDelete("cascade"),
]);

export const esf7AralSections = pgTable("esf7_aral_sections", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").default('2026-2027').notNull(),
	basisType: text("basis_type").default('grade').notNull(),
	gradeLevel: text("grade_level").notNull(),
	assessmentTool: text("assessment_tool"),
	profileLevel: text("profile_level"),
	sectionName: text("section_name").notNull(),
	tutorId: varchar("tutor_id", { length: 50 }),
	maleLearners: integer("male_learners").default(0),
	femaleLearners: integer("female_learners").default(0),
	totalLearners: integer("total_learners").default(0),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	term: text().default('1st'),
}, (table) => [
	index("idx_aral_sections_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	index("idx_aral_sections_tutor").using("btree", table.tutorId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tutorId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_aral_sections_tutor_id_fkey"
		}).onDelete("set null"),
]);

export const esf7PersonnelSubmission = pgTable("esf7_personnel_submission", {
	id: varchar({ length: 128 }).primaryKey().notNull(),
	schoolId: varchar("school_id", { length: 64 }).notNull(),
	personnelId: varchar("personnel_id", { length: 64 }).notNull(),
	personnelName: varchar("personnel_name", { length: 255 }),
	roomName: varchar("room_name", { length: 255 }),
	status: varchar({ length: 32 }).default('PENDING'),
	payloadJson: jsonb("payload_json").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdTimestamp: bigint("created_timestamp", { mode: "number" }),
}, (table) => [
	index("idx_pers_sub_school_status").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
]);

export const esf7TermStatus = pgTable("esf7_term_status", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	term: text().default('1st').notNull(),
	status: text().default('OPEN').notNull(),
	lockedAt: timestamp("locked_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_term_status_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	unique("uq_school_sy_term").on(table.schoolId, table.schoolYear, table.term),
	check("esf7_term_status_status_check", sql`status = ANY (ARRAY['OPEN'::text, 'LOCKED'::text])`),
]);

export const esf7WorkloadRows = pgTable("esf7_workload_rows", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	gradeLevel: text("grade_level"),
	sectionId: varchar("section_id", { length: 50 }),
	sectionName: text("section_name"),
	subject: text().notNull(),
	subjectId: varchar("subject_id", { length: 50 }),
	remediationSubject: text("remediation_subject"),
	startTime: time("start_time"),
	endTime: time("end_time"),
	days: jsonb().default(["M","T","W","TH","F"]),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	term: text().default('1st'),
}, (table) => [
	index("idx_esf7_workload_rows_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_esf7_workload_rows_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	index("idx_esf7_workload_rows_section").using("btree", table.sectionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_workload_rows_personnel_id_fkey"
		}).onDelete("cascade"),
]);

export const esf7WorkloadTransfer = pgTable("esf7_workload_transfer", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	absentPersonnelId: varchar("absent_personnel_id", { length: 50 }).notNull(),
	relievingPersonnelId: varchar("relieving_personnel_id", { length: 50 }).notNull(),
	absenceId: varchar("absence_id", { length: 50 }),
	workloadId: varchar("workload_id", { length: 50 }).notNull(),
	workloadType: text("workload_type").default('ELEM_JHS').notNull(),
	subject: text().notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	relievingHours: numeric("relieving_hours", { precision: 4, scale:  2 }).default('1.00'),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_workload_transfer_absence").using("btree", table.absenceId.asc().nullsLast().op("text_ops")),
	index("idx_esf7_workload_transfer_absent").using("btree", table.absentPersonnelId.asc().nullsLast().op("text_ops")),
	index("idx_esf7_workload_transfer_relieving").using("btree", table.relievingPersonnelId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.absentPersonnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_workload_transfer_absent_personnel_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.relievingPersonnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_workload_transfer_relieving_personnel_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.absenceId],
			foreignColumns: [overloadAbsences.id],
			name: "esf7_workload_transfer_absence_id_fkey"
		}).onDelete("cascade"),
]);

export const overloadAbsences = pgTable("overload_absences", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	leaveType: text("leave_type").default('SICK_LEAVE').notNull(),
	totalDays: integer("total_days").default(1),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_overload_absences_dates").using("btree", table.startDate.asc().nullsLast().op("date_ops"), table.endDate.asc().nullsLast().op("date_ops")),
	index("idx_overload_absences_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_overload_absences_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "overload_absences_personnel_id_fkey"
		}).onDelete("cascade"),
]);

export const overloadLate = pgTable("overload_late", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	tardinessDate: date("tardiness_date").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_overload_late_date").using("btree", table.tardinessDate.asc().nullsLast().op("date_ops")),
	index("idx_overload_late_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_overload_late_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "overload_late_personnel_id_fkey"
		}).onDelete("cascade"),
	unique("uq_personnel_sy_tardiness_date").on(table.personnelId, table.schoolYear, table.tardinessDate),
]);

export const overloadPayAndReason = pgTable("overload_pay_and_reason", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	term: text().default('Term 1').notNull(),
	month: text(),
	overloadHours: numeric("overload_hours", { precision: 6, scale:  2 }).default('0.00'),
	overloadPay: numeric("overload_pay", { precision: 10, scale:  2 }).default('0.00'),
	netTermPay: numeric("net_term_pay", { precision: 10, scale:  2 }).default('0.00'),
	reasons: jsonb().default([]),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isConfirmed: boolean("is_confirmed").default(false),
	actualAmount: numeric("actual_amount"),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_overload_pay_reason_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_overload_pay_reason_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	index("idx_overload_pay_reason_term_month").using("btree", table.personnelId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops"), table.term.asc().nullsLast().op("text_ops"), table.month.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "overload_pay_and_reason_personnel_id_fkey"
		}).onDelete("cascade"),
	unique("uq_personnel_sy_term_month_overload").on(table.personnelId, table.schoolYear, table.term, table.month),
]);

export const esf7SchoolSubjects = pgTable("esf7_school_subjects", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	subjectName: text("subject_name").notNull(),
	keyStage: text("key_stage").notNull(),
	gradeLevel: text("grade_level").default('All'),
	shsCategory: text("shs_category"),
	isCustom: boolean("is_custom").default(true).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_school_subjects_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	unique("uq_school_sy_custom_subject").on(table.schoolId, table.schoolYear, table.subjectName, table.keyStage),
]);

export const overloadNoWork = pgTable("overload_no_work", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	region: text().notNull(),
	division: text().notNull(),
	schoolId: text("school_id").default('ALL').notNull(),
	schoolYear: text("school_year").notNull(),
	noWorkDate: date("no_work_date").notNull(),
	eventType: text("event_type").notNull(),
	title: text().notNull(),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_overload_no_work_date").using("btree", table.noWorkDate.asc().nullsLast().op("date_ops")),
	index("idx_overload_no_work_region_div").using("btree", table.region.asc().nullsLast().op("text_ops"), table.division.asc().nullsLast().op("text_ops")),
	index("idx_overload_no_work_school").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	unique("uq_region_div_school_date").on(table.region, table.division, table.schoolId, table.schoolYear, table.noWorkDate),
]);

export const esf7SchoolProfile = pgTable("esf7_school_profile", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").default('2026-2027').notNull(),
	hasElemSpecialPrograms: boolean("has_elem_special_programs").default(false).notNull(),
	elemSpecialPrograms: jsonb("elem_special_programs").default([]),
	hasJhsSpecialPrograms: boolean("has_jhs_special_programs").default(false).notNull(),
	jhsSpecialPrograms: jsonb("jhs_special_programs").default([]),
	shsCurriculumModel: text("shs_curriculum_model"),
	hasElemInclusive: boolean("has_elem_inclusive").default(false).notNull(),
	elemInclusivePrograms: jsonb("elem_inclusive_programs").default([]),
	hasJhsInclusive: boolean("has_jhs_inclusive").default(false).notNull(),
	jhsInclusivePrograms: jsonb("jhs_inclusive_programs").default([]),
	hasShsInclusive: boolean("has_shs_inclusive").default(false).notNull(),
	shsInclusivePrograms: jsonb("shs_inclusive_programs").default([]),
	hasAls: boolean("has_als").default(false).notNull(),
	hasSned: boolean("has_sned").default(false).notNull(),
	hasIped: boolean("has_iped").default(false).notNull(),
	hasMadrasah: boolean("has_madrasah").default(false).notNull(),
	inclusivePrograms: jsonb("inclusive_programs").default([]),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_school_profile_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	unique("uq_school_sy_profile").on(table.schoolId, table.schoolYear),
]);

export const esf7SubmissionQueue = pgTable("esf7_submission_queue", {
	id: serial().primaryKey().notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").default('2026-2027').notNull(),
	payload: jsonb().default({}).notNull(),
	signature: text(),
	certifiedBy: text("certified_by"),
	status: text().default('pending').notNull(),
	errorMessage: text("error_message"),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_submission_queue_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	index("idx_esf7_submission_queue_status_id").using("btree", table.status.asc().nullsLast().op("text_ops"), table.id.asc().nullsLast().op("int4_ops")),
	check("esf7_submission_queue_status_check", sql`status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'CANCELLED'::text])`),
]);

export const esf7PersonnelAllowances = pgTable("esf7_personnel_allowances", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	hasPera: boolean("has_pera").default(false).notNull(),
	peraAmount: numeric("pera_amount", { precision: 10, scale:  2 }).default('2000.00'),
	hasUniform: boolean("has_uniform").default(false).notNull(),
	uniformAmount: numeric("uniform_amount", { precision: 10, scale:  2 }).default('7000.00'),
	hasSupplies: boolean("has_supplies").default(false).notNull(),
	suppliesAmount: numeric("supplies_amount", { precision: 10, scale:  2 }).default('10000.00'),
	hasMedical: boolean("has_medical").default(false).notNull(),
	medicalAmount: numeric("medical_amount", { precision: 10, scale:  2 }).default('7000.00'),
	hasHardship: boolean("has_hardship").default(false).notNull(),
	hardshipAmount: numeric("hardship_amount", { precision: 10, scale:  2 }).default('0.00'),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_personnel_allowances_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	unique("uq_personnel_sy_allowances").on(table.personnelId, table.schoolYear),
]);

export const esf7Requests = pgTable("esf7_requests", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	requesterSchoolId: text("requester_school_id").notNull(),
	targetSchoolId: text("target_school_id").notNull(),
	schoolYear: text("school_year").default('2026-2027').notNull(),
	requestType: text("request_type").notNull(),
	personnelId: varchar("personnel_id", { length: 50 }),
	personnelName: text("personnel_name"),
	status: text().default('pending').notNull(),
	remarks: text(),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_requests_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_esf7_requests_requester").using("btree", table.requesterSchoolId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_esf7_requests_target").using("btree", table.targetSchoolId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_requests_personnel_id_fkey"
		}).onDelete("set null"),
	check("esf7_requests_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'CANCELLED'::text])`),
]);

export const esf7WorkImmersion = pgTable("esf7_work_immersion", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	personnelId: varchar("personnel_id", { length: 50 }).notNull(),
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	visitDate: date("visit_date").notNull(),
	startTime: time("start_time").notNull(),
	endTime: time("end_time").notNull(),
	durationMinutes: integer("duration_minutes").default(0),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_esf7_work_immersion_date").using("btree", table.visitDate.asc().nullsLast().op("date_ops")),
	index("idx_esf7_work_immersion_personnel").using("btree", table.personnelId.asc().nullsLast().op("text_ops")),
	index("idx_esf7_work_immersion_school_sy").using("btree", table.schoolId.asc().nullsLast().op("text_ops"), table.schoolYear.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.personnelId],
			foreignColumns: [esf7PersonnelProfile.id],
			name: "esf7_work_immersion_personnel_id_fkey"
		}).onDelete("cascade"),
	unique("uq_personnel_sy_immersion_date").on(table.personnelId, table.schoolYear, table.visitDate),
]);

export const schoolDrafts = pgTable("school_drafts", {
	schoolId: text("school_id").notNull(),
	schoolYear: text("school_year").notNull(),
	payload: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.schoolId, table.schoolYear], name: "school_drafts_pkey"}),
]);
export const overloadPayTest = pgView("overload_pay_test", {	id: varchar({ length: 50 }),
	personnelId: varchar("personnel_id", { length: 50 }),
	schoolId: text("school_id"),
	schoolYear: text("school_year"),
	term: text(),
	month: text(),
	overloadHours: numeric("overload_hours", { precision: 6, scale:  2 }),
	overloadPay: numeric("overload_pay", { precision: 10, scale:  2 }),
	netTermPay: numeric("net_term_pay", { precision: 10, scale:  2 }),
	reasons: jsonb(),
	rawPayload: jsonb("raw_payload"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	isConfirmed: boolean("is_confirmed"),
	actualAmount: numeric("actual_amount"),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT id, personnel_id, school_id, school_year, term, month, overload_hours, overload_pay, net_term_pay, reasons, raw_payload, created_at, updated_at, is_confirmed, actual_amount, confirmed_at FROM overload_pay_and_reason`);