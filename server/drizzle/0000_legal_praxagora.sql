-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "esf7_personnel_employment" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"position_category" text NOT NULL,
	"position" text NOT NULL,
	"step_increment" integer DEFAULT 1,
	"fund_source" text NOT NULL,
	"nature_of_appointment" text NOT NULL,
	"hiring_arrangement" text NOT NULL,
	"deployment_status" text DEFAULT 'OWN STATION',
	"assigned_schools" jsonb DEFAULT '[]'::jsonb,
	"grade_levels_taught" jsonb DEFAULT '[]'::jsonb,
	"first_service_date" date,
	"last_promotion_date" date,
	"new_station_date" date,
	"last_lateral_movement_date" date,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esf7_personnel_employment_personnel_id_key" UNIQUE("personnel_id"),
	CONSTRAINT "esf7_personnel_employment_position_category_check" CHECK (position_category = ANY (ARRAY['TEACHING'::text, 'RELATED TEACHING'::text, 'NON-TEACHING'::text, 'teaching'::text, 'teaching-related'::text, 'non-teaching'::text])),
	CONSTRAINT "esf7_personnel_employment_step_increment_check" CHECK ((step_increment >= 1) AND (step_increment <= 8))
);
--> statement-breakpoint
CREATE TABLE "esf7_personnel_extra_tasks" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50),
	"school_id" varchar(50) NOT NULL,
	"school_year" varchar(20) DEFAULT 'SY 26-27' NOT NULL,
	"task_category" varchar(50) NOT NULL,
	"task_name" varchar(255) NOT NULL,
	"calendar_dates" jsonb DEFAULT '[]'::jsonb,
	"start_time" varchar(10),
	"end_time" varchar(10),
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "esf7_personnel_profile" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"prn" text NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"type" text DEFAULT 'teaching' NOT NULL,
	"salutation" text DEFAULT 'MR.' NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"name_extension" text,
	"tin" text,
	"no_tin" boolean DEFAULT false NOT NULL,
	"sex_at_birth" text,
	"civil_status" text,
	"solo_parent" boolean DEFAULT false NOT NULL,
	"religion" text,
	"ethnic_group" text,
	"birthdate" date,
	"age" integer,
	"philsys_no" text,
	"employee_no" text,
	"deped_email" text,
	"is_school_head" boolean DEFAULT false NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"term" text DEFAULT '1st',
	"no_philsys" boolean DEFAULT false NOT NULL,
	CONSTRAINT "esf7_personnel_profile_prn_key" UNIQUE("prn"),
	CONSTRAINT "esf7_personnel_profile_type_check" CHECK (type = ANY (ARRAY['teaching'::text, 'teaching-related'::text, 'non-teaching'::text])),
	CONSTRAINT "esf7_personnel_profile_sex_at_birth_check" CHECK (sex_at_birth = ANY (ARRAY['Male'::text, 'Female'::text, 'MALE'::text, 'FEMALE'::text]))
);
--> statement-breakpoint
CREATE TABLE "esf7_perssonel_educ" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"college_degree" text,
	"major" text,
	"minor" text,
	"post_graduate_degree" text DEFAULT 'N/A',
	"post_graduate_discipline" text,
	"eligibility" jsonb DEFAULT '[]'::jsonb,
	"prc_specialization" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"highest_educational_attainment" text DEFAULT 'COLLEGE GRADUATE / BACCALAUREATE' NOT NULL,
	"shs_track" text,
	"vocational_course" text,
	"vocational_level" text,
	CONSTRAINT "esf7_perssonel_educ_personnel_id_key" UNIQUE("personnel_id")
);
--> statement-breakpoint
CREATE TABLE "esf7_regular_sections" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text DEFAULT '2026-2027' NOT NULL,
	"grade_level" text NOT NULL,
	"section_name" text NOT NULL,
	"adviser_id" varchar(50),
	"section_type" text DEFAULT 'MONO GRADE' NOT NULL,
	"male_learners" integer DEFAULT 0,
	"female_learners" integer DEFAULT 0,
	"number_of_learners" integer DEFAULT 0,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"term" text DEFAULT '1st',
	"size_status" text DEFAULT 'WITHIN STANDARD',
	CONSTRAINT "uq_regular_section_school_sy" UNIQUE("school_id","school_year","grade_level","section_name")
);
--> statement-breakpoint
CREATE TABLE "esf7_personnel_ld_trainings" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"training_type" text NOT NULL,
	"title" text NOT NULL,
	"conductor" text,
	"start_date" date,
	"end_date" date,
	"days" integer,
	"total_hours" numeric,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esf7_personnel_ld_trainings_training_type_check" CHECK (training_type = ANY (ARRAY['NEAP'::text, 'TESDA'::text, 'OTHER'::text, 'neap'::text, 'tesda'::text, 'other'::text]))
);
--> statement-breakpoint
CREATE TABLE "esf7_remedial_enrichment_sections" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text DEFAULT '2026-2027' NOT NULL,
	"intervention_type" text DEFAULT 'REMEDIAL' NOT NULL,
	"grade_level" text NOT NULL,
	"section_name" text NOT NULL,
	"assigned_teacher_id" varchar(50),
	"male_learners" integer DEFAULT 0,
	"female_learners" integer DEFAULT 0,
	"total_learners" integer DEFAULT 0,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"term" text DEFAULT '1st'
);
--> statement-breakpoint
CREATE TABLE "esf7_link" (
	"school_id" text PRIMARY KEY NOT NULL,
	"link" text NOT NULL,
	"row_count" integer,
	"preview_data" jsonb,
	"summary" jsonb,
	"status" text DEFAULT 'PENDING_SDO',
	"uploaded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "esf7_personnel_learning_areas" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"matrix_data" jsonb DEFAULT '{}'::jsonb,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esf7_personnel_learning_areas_personnel_id_key" UNIQUE("personnel_id")
);
--> statement-breakpoint
CREATE TABLE "clustered_personnel" (
	"id" serial PRIMARY KEY NOT NULL,
	"prn" varchar(255) NOT NULL,
	"source_school_id" varchar(255) NOT NULL,
	"target_school_id" varchar(255) NOT NULL,
	"shared_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "clustered_personnel_prn_source_school_id_target_school_id_key" UNIQUE("prn","source_school_id","target_school_id")
);
--> statement-breakpoint
CREATE TABLE "esf7_personnel_designations" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"designation_name" text NOT NULL,
	"grade_level" text,
	"subject_area" text,
	"track" text,
	"is_sds_approved" boolean DEFAULT false NOT NULL,
	"sds_confirmed" boolean DEFAULT false NOT NULL,
	"serialized_key" text NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esf7_room_submissions_staging" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"personnel_id" varchar(64) NOT NULL,
	"personnel_name" varchar(255),
	"room" varchar(255),
	"profile_data" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now(),
	"submitted_timestamp" bigint
);
--> statement-breakpoint
CREATE TABLE "salary_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"salary_grade" integer NOT NULL,
	"step_number" integer NOT NULL,
	"basic_salary" numeric(10, 2) NOT NULL,
	"position_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_salary_grade_step" UNIQUE("salary_grade","step_number")
);
--> statement-breakpoint
CREATE TABLE "esf7_shs_workload_rows" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"term" text DEFAULT '1st' NOT NULL,
	"semester" text,
	"grade_level" text NOT NULL,
	"track_strand" text,
	"shs_subject_category" text,
	"section_id" varchar(50),
	"section_name" text,
	"subject" text NOT NULL,
	"subject_id" varchar(50),
	"remediation_subject" text,
	"start_time" time,
	"end_time" time,
	"days" jsonb DEFAULT '["M","T","W","TH","F"]'::jsonb,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esf7_aral_sections" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text DEFAULT '2026-2027' NOT NULL,
	"basis_type" text DEFAULT 'grade' NOT NULL,
	"grade_level" text NOT NULL,
	"assessment_tool" text,
	"profile_level" text,
	"section_name" text NOT NULL,
	"tutor_id" varchar(50),
	"male_learners" integer DEFAULT 0,
	"female_learners" integer DEFAULT 0,
	"total_learners" integer DEFAULT 0,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"term" text DEFAULT '1st'
);
--> statement-breakpoint
CREATE TABLE "esf7_personnel_submission" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"school_id" varchar(64) NOT NULL,
	"personnel_id" varchar(64) NOT NULL,
	"personnel_name" varchar(255),
	"room_name" varchar(255),
	"status" varchar(32) DEFAULT 'PENDING',
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_timestamp" bigint
);
--> statement-breakpoint
CREATE TABLE "esf7_term_status" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"term" text DEFAULT '1st' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_school_sy_term" UNIQUE("school_id","school_year","term"),
	CONSTRAINT "esf7_term_status_status_check" CHECK (status = ANY (ARRAY['OPEN'::text, 'LOCKED'::text]))
);
--> statement-breakpoint
CREATE TABLE "esf7_workload_rows" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"grade_level" text,
	"section_id" varchar(50),
	"section_name" text,
	"subject" text NOT NULL,
	"subject_id" varchar(50),
	"remediation_subject" text,
	"start_time" time,
	"end_time" time,
	"days" jsonb DEFAULT '["M","T","W","TH","F"]'::jsonb,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"term" text DEFAULT '1st'
);
--> statement-breakpoint
CREATE TABLE "esf7_workload_transfer" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"absent_personnel_id" varchar(50) NOT NULL,
	"relieving_personnel_id" varchar(50) NOT NULL,
	"absence_id" varchar(50),
	"workload_id" varchar(50) NOT NULL,
	"workload_type" text DEFAULT 'ELEM_JHS' NOT NULL,
	"subject" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"relieving_hours" numeric(4, 2) DEFAULT '1.00',
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overload_absences" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"leave_type" text DEFAULT 'SICK_LEAVE' NOT NULL,
	"total_days" integer DEFAULT 1,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overload_late" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"tardiness_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_personnel_sy_tardiness_date" UNIQUE("personnel_id","school_year","tardiness_date")
);
--> statement-breakpoint
CREATE TABLE "overload_pay_and_reason" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"term" text DEFAULT 'Term 1' NOT NULL,
	"month" text,
	"overload_hours" numeric(6, 2) DEFAULT '0.00',
	"overload_pay" numeric(10, 2) DEFAULT '0.00',
	"net_term_pay" numeric(10, 2) DEFAULT '0.00',
	"reasons" jsonb DEFAULT '[]'::jsonb,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_confirmed" boolean DEFAULT false,
	"actual_amount" numeric,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "uq_personnel_sy_term_month_overload" UNIQUE("personnel_id","school_year","term","month")
);
--> statement-breakpoint
CREATE TABLE "esf7_school_subjects" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"subject_name" text NOT NULL,
	"key_stage" text NOT NULL,
	"grade_level" text DEFAULT 'All',
	"shs_category" text,
	"is_custom" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_school_sy_custom_subject" UNIQUE("school_id","school_year","subject_name","key_stage")
);
--> statement-breakpoint
CREATE TABLE "overload_no_work" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"division" text NOT NULL,
	"school_id" text DEFAULT 'ALL' NOT NULL,
	"school_year" text NOT NULL,
	"no_work_date" date NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_region_div_school_date" UNIQUE("region","division","school_id","school_year","no_work_date")
);
--> statement-breakpoint
CREATE TABLE "esf7_school_profile" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text DEFAULT '2026-2027' NOT NULL,
	"has_elem_special_programs" boolean DEFAULT false NOT NULL,
	"has_jhs_special_programs" boolean DEFAULT false NOT NULL,
	"jhs_special_programs" jsonb DEFAULT '[]'::jsonb,
	"shs_curriculum_model" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_school_sy_profile" UNIQUE("school_id","school_year")
);
--> statement-breakpoint
CREATE TABLE "esf7_submission_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text DEFAULT '2026-2027' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature" text,
	"certified_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esf7_submission_queue_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'CANCELLED'::text]))
);
--> statement-breakpoint
CREATE TABLE "esf7_personnel_allowances" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"has_pera" boolean DEFAULT false NOT NULL,
	"pera_amount" numeric(10, 2) DEFAULT '2000.00',
	"has_uniform" boolean DEFAULT false NOT NULL,
	"uniform_amount" numeric(10, 2) DEFAULT '7000.00',
	"has_supplies" boolean DEFAULT false NOT NULL,
	"supplies_amount" numeric(10, 2) DEFAULT '10000.00',
	"has_medical" boolean DEFAULT false NOT NULL,
	"medical_amount" numeric(10, 2) DEFAULT '7000.00',
	"has_hardship" boolean DEFAULT false NOT NULL,
	"hardship_amount" numeric(10, 2) DEFAULT '0.00',
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_personnel_sy_allowances" UNIQUE("personnel_id","school_year")
);
--> statement-breakpoint
CREATE TABLE "esf7_requests" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"requester_school_id" text NOT NULL,
	"target_school_id" text NOT NULL,
	"school_year" text DEFAULT '2026-2027' NOT NULL,
	"request_type" text NOT NULL,
	"personnel_id" varchar(50),
	"personnel_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"remarks" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esf7_requests_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'CANCELLED'::text]))
);
--> statement-breakpoint
CREATE TABLE "esf7_work_immersion" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"personnel_id" varchar(50) NOT NULL,
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"visit_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"duration_minutes" integer DEFAULT 0,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_personnel_sy_immersion_date" UNIQUE("personnel_id","school_year","visit_date")
);
--> statement-breakpoint
CREATE TABLE "school_drafts" (
	"school_id" text NOT NULL,
	"school_year" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_drafts_pkey" PRIMARY KEY("school_id","school_year")
);
--> statement-breakpoint
ALTER TABLE "esf7_personnel_employment" ADD CONSTRAINT "esf7_personnel_employment_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_perssonel_educ" ADD CONSTRAINT "esf7_perssonel_educ_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_regular_sections" ADD CONSTRAINT "esf7_regular_sections_adviser_id_fkey" FOREIGN KEY ("adviser_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_personnel_ld_trainings" ADD CONSTRAINT "esf7_personnel_ld_trainings_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_remedial_enrichment_sections" ADD CONSTRAINT "esf7_remedial_enrichment_sections_assigned_teacher_id_fkey" FOREIGN KEY ("assigned_teacher_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_personnel_learning_areas" ADD CONSTRAINT "esf7_personnel_learning_areas_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_personnel_designations" ADD CONSTRAINT "esf7_personnel_designations_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_shs_workload_rows" ADD CONSTRAINT "esf7_shs_workload_rows_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_aral_sections" ADD CONSTRAINT "esf7_aral_sections_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_workload_rows" ADD CONSTRAINT "esf7_workload_rows_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_workload_transfer" ADD CONSTRAINT "esf7_workload_transfer_absent_personnel_id_fkey" FOREIGN KEY ("absent_personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_workload_transfer" ADD CONSTRAINT "esf7_workload_transfer_relieving_personnel_id_fkey" FOREIGN KEY ("relieving_personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_workload_transfer" ADD CONSTRAINT "esf7_workload_transfer_absence_id_fkey" FOREIGN KEY ("absence_id") REFERENCES "public"."overload_absences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overload_absences" ADD CONSTRAINT "overload_absences_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overload_late" ADD CONSTRAINT "overload_late_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overload_pay_and_reason" ADD CONSTRAINT "overload_pay_and_reason_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_requests" ADD CONSTRAINT "esf7_requests_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esf7_work_immersion" ADD CONSTRAINT "esf7_work_immersion_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."esf7_personnel_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_employment_personnel" ON "esf7_personnel_employment" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_extra_tasks_personnel" ON "esf7_personnel_extra_tasks" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_extra_tasks_school_sy" ON "esf7_personnel_extra_tasks" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_profile_prn" ON "esf7_personnel_profile" USING btree ("prn" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_profile_school_sy" ON "esf7_personnel_profile" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_perssonel_educ_personnel" ON "esf7_perssonel_educ" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_regular_sections_adviser" ON "esf7_regular_sections" USING btree ("adviser_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_regular_sections_school_sy" ON "esf7_regular_sections" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_ld_trainings_personnel" ON "esf7_personnel_ld_trainings" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_ld_trainings_type" ON "esf7_personnel_ld_trainings" USING btree ("training_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_remedial_sections_school_sy" ON "esf7_remedial_enrichment_sections" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_remedial_sections_teacher" ON "esf7_remedial_enrichment_sections" USING btree ("assigned_teacher_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_learning_areas_personnel" ON "esf7_personnel_learning_areas" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_designations_personnel" ON "esf7_personnel_designations" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_room_sub_staging_school" ON "esf7_room_submissions_staging" USING btree ("school_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_salary_matrix_lookup" ON "salary_matrix" USING btree ("salary_grade" int4_ops,"step_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_shs_workload_rows_personnel" ON "esf7_shs_workload_rows" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_shs_workload_rows_school_sy" ON "esf7_shs_workload_rows" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_shs_workload_rows_term" ON "esf7_shs_workload_rows" USING btree ("personnel_id" text_ops,"term" text_ops);--> statement-breakpoint
CREATE INDEX "idx_aral_sections_school_sy" ON "esf7_aral_sections" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_aral_sections_tutor" ON "esf7_aral_sections" USING btree ("tutor_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_pers_sub_school_status" ON "esf7_personnel_submission" USING btree ("school_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_term_status_school_sy" ON "esf7_term_status" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_workload_rows_personnel" ON "esf7_workload_rows" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_workload_rows_school_sy" ON "esf7_workload_rows" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_workload_rows_section" ON "esf7_workload_rows" USING btree ("section_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_workload_transfer_absence" ON "esf7_workload_transfer" USING btree ("absence_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_workload_transfer_absent" ON "esf7_workload_transfer" USING btree ("absent_personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_workload_transfer_relieving" ON "esf7_workload_transfer" USING btree ("relieving_personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_absences_dates" ON "overload_absences" USING btree ("start_date" date_ops,"end_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_absences_personnel" ON "overload_absences" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_absences_school_sy" ON "overload_absences" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_late_date" ON "overload_late" USING btree ("tardiness_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_late_personnel" ON "overload_late" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_late_school_sy" ON "overload_late" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_pay_reason_personnel" ON "overload_pay_and_reason" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_pay_reason_school_sy" ON "overload_pay_and_reason" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_pay_reason_term_month" ON "overload_pay_and_reason" USING btree ("personnel_id" text_ops,"school_year" text_ops,"term" text_ops,"month" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_school_subjects_school_sy" ON "esf7_school_subjects" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_no_work_date" ON "overload_no_work" USING btree ("no_work_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_no_work_region_div" ON "overload_no_work" USING btree ("region" text_ops,"division" text_ops);--> statement-breakpoint
CREATE INDEX "idx_overload_no_work_school" ON "overload_no_work" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_school_profile_school_sy" ON "esf7_school_profile" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_submission_queue_school_sy" ON "esf7_submission_queue" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_submission_queue_status_id" ON "esf7_submission_queue" USING btree ("status" text_ops,"id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_personnel_allowances_personnel" ON "esf7_personnel_allowances" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_requests_personnel" ON "esf7_requests" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_requests_requester" ON "esf7_requests" USING btree ("requester_school_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_requests_target" ON "esf7_requests" USING btree ("target_school_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_work_immersion_date" ON "esf7_work_immersion" USING btree ("visit_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_work_immersion_personnel" ON "esf7_work_immersion" USING btree ("personnel_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_esf7_work_immersion_school_sy" ON "esf7_work_immersion" USING btree ("school_id" text_ops,"school_year" text_ops);--> statement-breakpoint
CREATE VIEW "public"."overload_pay_test" AS (SELECT id, personnel_id, school_id, school_year, term, month, overload_hours, overload_pay, net_term_pay, reasons, raw_payload, created_at, updated_at, is_confirmed, actual_amount, confirmed_at FROM overload_pay_and_reason);
*/