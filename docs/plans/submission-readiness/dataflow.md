# Data flow: InsightED-ESF7-Official

> **Coverage is limited:** Drizzle is used only to define the schema; runtime writes are raw SQL. The field-to-column table below is derived from SQL text and variable tracing, so it is **not guaranteed complete**. Every row carries a confidence level; see Section 8 for what could not be resolved.

## 1. Coverage and assumptions

- **Parse mode:** `ast` (typescript compiler API located call expressions; field and SQL analysis is textual).
- **ORM coverage:** `schema-only`. Write calls by API: raw-sql=508.
- **Scope:** 175 routes (107 write routes), 38 Drizzle tables, 508 write calls (230 in application code), 133 client calls, 590 source files scanned.
- **Method:** static analysis only. No database, Redis, or server was contacted; `.env*` files were not read.
- **Overrides:** Manual overrides applied from `overrides.json`.
- **Confidence summary:** routes (high=175, medium=0, low=0); writes (high=178, medium=313, low=17); client calls (high=130, medium=1, low=2).
- **Reading confidence:** `high` = found directly in the handler or schema; `medium` = reached through one helper hop or partly inferred; `low` = heuristic link, dynamic SQL, or unresolved value.
- **Limits:** middleware order is not evaluated (all `app.use` middleware whose prefix matches is listed); loops are counted once and flagged; helper calls are followed two hops.

## 2. System overview

```mermaid
flowchart LR
  B["Browser (client calls: 133)"]
  N["nginx reverse proxy (no config found in repo)"]
  P["Node / PM2: insighted-esf7-prod-backend, instances 4, cluster"]
  M["Middleware: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware"]
  H["Handlers: 175 routes (107 write)"]
  D["Database client (raw SQL via pg Pool): pool max 8+5+8+5+4"]
  PG["PostgreSQL: 38 schema tables"]
  B --> N --> P --> M --> H --> D
  PB["PgBouncer? (only the port 6432 default was found, unconfirmed)"]
  D --> PB --> PG
  R["Redis: ioredis"]
  H -.->|queue / cache| R
```

Pool sizes found in application code sum to **30** connections per Node process (8 at server/db/index.js:98; 5 at server/db/index.js:127; 8 at server/db/index.js:157; 5 at server/db/index.js:193; 4 at server/db/index.js:224). Multiply by PM2 instances for the worst case.

## 3. Write routes

### POST /

- **Handler:** server/controllers/personnel/profile.js:547 (inline); **registered at** server/controllers/personnel/profile.js:547; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.age, body.allowEmailDiscrepancy, body.allow_email_discrepancy, body.assignedGradeLevels, body.assignedSchools, body.assigned_grade_levels, body.assigned_schools, body.birthdate, body.certificationRows, body.civilStatus, body.civil_status, body.collegeDegree, body.collegeDegrees, body.college_degree, body.college_degrees, body.depedEmail, body.deped_email, body.deploymentStatus, body.deployment_status, body.designation, body.designations, body.eligibility, body.employeeNo, body.employee_no, body.ethnicGroup, body.ethnic_group, body.firstName, body.firstServiceDate, body.first_name, body.first_service_date, body.fundSource, body.fund_source, body.gradeLevelsTaught, body.grade_levels_taught, body.highestEducationalAttainment, body.highest_educational_attainment, body.hiringArrangement, body.hiring_arrangement, body.id, body.isSchoolHead, body.is_school_head, body.lastLateralMovementDate, body.lastName, body.lastPromotionDate, body.last_lateral_movement_date, body.last_name, body.last_promotion_date, body.learningAreaMap, body.major, body.matrix_data, body.middleName, body.middle_name, body.minor, body.nameExtension, body.name_extension, body.natureOfAppointment, body.nature_of_appointment, body.neapTrainingRows, body.newStationDate, body.new_station_date, body.noDepedEmail, body.noPhilsys, body.noTin, body.no_deped_email, body.no_philsys, body.no_tin, body.otherTrainingRows, body.philsysNo, body.philsys_no, body.position, body.positionCategory, body.position_category, body.postGraduateDegree, body.postGraduateDiscipline, body.postGraduateDisciplineCustom, body.post_graduate_degree, body.post_graduate_discipline, body.prcSpecialization, body.prc_specialization, body.prn, body.religion, body.salutation, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.sexAtBirth, body.sex_at_birth, body.shsTrack, body.shs_track, body.soloParent, body.solo_parent, body.status, body.stepIncrement, body.step_increment, body.tin, body.type, body.vocationalCourse, body.vocationalLevel, body.vocational_course, body.vocational_level (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /
  S->>DB: 1. DELETE esf7_personnel_ld_trainings [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 2. INSERT esf7_personnel_ld_trainings [one-hop]
  DB-->>S: ok
  end
  S->>DB: 3. SELECT esf7_personnel_learning_areas [one-hop]
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_personnel_learning_areas [one-hop]
  DB-->>S: ok
  S->>DB: 5. DELETE esf7_personnel_designations [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 6. INSERT esf7_personnel_designations [one-hop]
  DB-->>S: ok
  end
  S->>DB: 7. BEGIN
  DB-->>S: ok
  S->>DB: 8. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 9. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 10. SELECT 5
  DB-->>S: rows
  S->>DB: 11. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 12. INSERT esf7_personnel_id_mapping
  DB-->>S: ok
  S->>DB: 13. INSERT esf7_personnel_employment
  DB-->>S: ok
  S->>DB: 14. INSERT esf7_perssonel_educ
  DB-->>S: ok
  S->>DB: 15. COMMIT
  DB-->>S: ok
  S->>DB: 16. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 17. SELECT esf7_personnel_ld_trainings
  DB-->>S: rows
  S->>DB: 18. SELECT esf7_personnel_designations
  DB-->>S: rows
  S-->>C: 200
```

Steps:
1. Client sends `POST /`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. DELETE esf7_personnel_ld_trainings (0 columns) — server/controllers/personnel/profile.js:195 [one-hop, medium]
4. INSERT esf7_personnel_ld_trainings (9 columns) **inside a loop** — server/controllers/personnel/profile.js:221 [one-hop, medium]
5. SELECT esf7_personnel_learning_areas — server/controllers/personnel/profile.js:252 [one-hop, medium]
6. INSERT esf7_personnel_learning_areas (3 columns, ON CONFLICT update) — server/controllers/personnel/profile.js:258 [one-hop, medium]
7. DELETE esf7_personnel_designations (0 columns) — server/controllers/personnel/profile.js:279 [one-hop, medium]
8. INSERT esf7_personnel_designations (11 columns) **inside a loop** — server/controllers/personnel/profile.js:524 [one-hop, medium]
9. BEGIN — server/controllers/personnel/profile.js:550 [direct, high]
10. SELECT esf7_personnel_profile — server/controllers/personnel/profile.js:685 [direct, high]
11. SELECT esf7_personnel_profile — server/controllers/personnel/profile.js:702 [direct, high]
12. SELECT 5 — server/controllers/personnel/profile.js:725 [direct, high]
13. INSERT esf7_personnel_profile (28 columns) — server/controllers/personnel/profile.js:808 [direct, high]
14. INSERT esf7_personnel_id_mapping (3 columns, ON CONFLICT nothing) — server/controllers/personnel/profile.js:813 [direct, high]
15. INSERT esf7_personnel_employment (15 columns, ON CONFLICT update) — server/controllers/personnel/profile.js:920 [direct, high]
16. INSERT esf7_perssonel_educ (14 columns, ON CONFLICT update) — server/controllers/personnel/profile.js:1043 [direct, high]
17. COMMIT — server/controllers/personnel/profile.js:1074 [direct, high]
18. SELECT esf7_personnel_profile — server/controllers/personnel/profile.js:1077 [direct, high]
19. SELECT esf7_personnel_ld_trainings — server/controllers/personnel/profile.js:1123 [direct, high]
20. SELECT esf7_personnel_designations — server/controllers/personnel/profile.js:1127 [direct, high]
21. Response 200 — server/controllers/personnel/profile.js:673.

**Queries per request:** 16 data queries (7 reads, 9 writes) + 4 transaction-control statements = **18 round trips**; **2 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### PUT /

- **Handler:** server/controllers/schools/profile.js:377 (inline); **registered at** server/controllers/schools/profile.js:377; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: not seen; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** none seen

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /
  Note over S: no database query detected for this route
  S-->>C: 403
```

Steps:
1. Client sends `PUT /`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. Response 403 — server/controllers/schools/profile.js:378.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### DELETE /:id

- **Handler:** server/controllers/personnel/roster.js:1446 (inline); **registered at** server/controllers/personnel/roster.js:1446; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.employeeNo, body.firstName, body.lastName, body.prn, body.schoolId, body.school_id, params.id, query.employeeNo, query.firstName, query.lastName, query.prn, query.schoolId, query.school_id (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /:id
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_deleted_personnel
  DB-->>S: ok
  S->>DB: 3. INSERT esf7_deleted_personnel [one-hop]
  DB-->>S: ok
  S->>DB: 4. SELECT school_drafts
  DB-->>S: rows
  S->>DB: 5. SELECT school_drafts [one-hop]
  DB-->>S: rows
  loop for each item
  S->>DB: 6. UPDATE school_drafts
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 7. UPDATE school_drafts [one-hop]
  DB-->>S: ok
  end
  S->>DB: 8. UPDATE esf7_regular_sections
  DB-->>S: ok
  S->>DB: 9. UPDATE esf7_regular_sections [one-hop]
  DB-->>S: ok
  S->>DB: 10. UPDATE esf7_sned_sections
  DB-->>S: ok
  S->>DB: 11. UPDATE esf7_sned_sections [one-hop]
  DB-->>S: ok
  S->>DB: 12. UPDATE esf7_als_sections
  DB-->>S: ok
  S->>DB: 13. UPDATE esf7_als_sections [one-hop]
  DB-->>S: ok
  S->>DB: 14. UPDATE esf7_aral_sections
  DB-->>S: ok
  S->>DB: 15. UPDATE esf7_aral_sections [one-hop]
  DB-->>S: ok
  S->>DB: 16. UPDATE esf7_remedial_enrichment_sections
  DB-->>S: ok
  S->>DB: 17. UPDATE esf7_remedial_enrichment_sections [one-hop]
  DB-->>S: ok
  S->>DB: 18. UPDATE esf7_workload_transfer
  DB-->>S: ok
  S->>DB: 19. UPDATE esf7_workload_transfer [one-hop]
  DB-->>S: ok
  S->>DB: 20. UPDATE esf7_workload_transfer
  DB-->>S: ok
  S->>DB: 21. UPDATE esf7_workload_transfer [one-hop]
  DB-->>S: ok
  S->>DB: 22. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 23. DELETE esf7_workload_rows [one-hop]
  DB-->>S: ok
  S->>DB: 24. DELETE esf7_workload_row
  DB-->>S: ok
  S->>DB: 25. DELETE esf7_workload_row [one-hop]
  DB-->>S: ok
  S->>DB: 26. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 27. DELETE esf7_shs_workload_rows [one-hop]
  DB-->>S: ok
  S->>DB: 28. DELETE esf7_admin_task
  DB-->>S: ok
  S->>DB: 29. DELETE esf7_admin_task [one-hop]
  DB-->>S: ok
  S->>DB: 30. DELETE esf7_related_task
  DB-->>S: ok
  S->>DB: 31. DELETE esf7_related_task [one-hop]
  DB-->>S: ok
  S->>DB: 32. DELETE esf7_personnel_employment
  DB-->>S: ok
  S->>DB: 33. DELETE esf7_personnel_employment [one-hop]
  DB-->>S: ok
  S->>DB: 34. DELETE esf7_personnel_education
  DB-->>S: ok
  S->>DB: 35. DELETE esf7_personnel_education [one-hop]
  DB-->>S: ok
  S->>DB: 36. DELETE esf7_personnel_educ
  DB-->>S: ok
  S->>DB: 37. DELETE esf7_personnel_educ [one-hop]
  DB-->>S: ok
  S->>DB: 38. DELETE esf7_perssonel_educ
  DB-->>S: ok
  S->>DB: 39. DELETE esf7_perssonel_educ [one-hop]
  DB-->>S: ok
  S->>DB: 40. DELETE esf7_personnel_learning_areas
  DB-->>S: ok
  Note over S,DB: 47 more queries not drawn
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. SELECT esf7_personnel_profile — server/controllers/personnel/roster.js:1461 [direct, high]
4. INSERT esf7_deleted_personnel (10 columns, ON CONFLICT update) — server/controllers/personnel/roster.js:1567 [direct, high]
5. INSERT esf7_deleted_personnel (10 columns, ON CONFLICT update) — server/controllers/personnel/roster.js:1567 [one-hop, medium]
6. SELECT school_drafts — server/controllers/personnel/roster.js:1604 [direct, high]
7. SELECT school_drafts — server/controllers/personnel/roster.js:1604 [one-hop, medium]
8. UPDATE school_drafts (2 columns) **inside a loop** — server/controllers/personnel/roster.js:1704 [direct, high]
9. UPDATE school_drafts (2 columns) **inside a loop** — server/controllers/personnel/roster.js:1704 [one-hop, medium]
10. UPDATE esf7_regular_sections (1 columns) — server/controllers/personnel/roster.js:1768 [direct, high]
11. UPDATE esf7_regular_sections (1 columns) — server/controllers/personnel/roster.js:1768 [one-hop, medium]
12. UPDATE esf7_sned_sections (1 columns) — server/controllers/personnel/roster.js:1774 [direct, high]
13. UPDATE esf7_sned_sections (1 columns) — server/controllers/personnel/roster.js:1774 [one-hop, medium]
14. UPDATE esf7_als_sections (1 columns) — server/controllers/personnel/roster.js:1780 [direct, high]
15. UPDATE esf7_als_sections (1 columns) — server/controllers/personnel/roster.js:1780 [one-hop, medium]
16. UPDATE esf7_aral_sections (1 columns) — server/controllers/personnel/roster.js:1786 [direct, high]
17. UPDATE esf7_aral_sections (1 columns) — server/controllers/personnel/roster.js:1786 [one-hop, medium]
18. UPDATE esf7_remedial_enrichment_sections (1 columns) — server/controllers/personnel/roster.js:1792 [direct, high]
19. UPDATE esf7_remedial_enrichment_sections (1 columns) — server/controllers/personnel/roster.js:1792 [one-hop, medium]
20. UPDATE esf7_workload_transfer (1 columns) — server/controllers/personnel/roster.js:1798 [direct, high]
21. UPDATE esf7_workload_transfer (1 columns) — server/controllers/personnel/roster.js:1798 [one-hop, medium]
22. UPDATE esf7_workload_transfer (1 columns) — server/controllers/personnel/roster.js:1804 [direct, high]
23. UPDATE esf7_workload_transfer (1 columns) — server/controllers/personnel/roster.js:1804 [one-hop, medium]
24. DELETE esf7_workload_rows (0 columns) — server/controllers/personnel/roster.js:1814 [direct, high]
25. DELETE esf7_workload_rows (0 columns) — server/controllers/personnel/roster.js:1814 [one-hop, medium]
26. DELETE esf7_workload_row (0 columns) — server/controllers/personnel/roster.js:1820 [direct, high]
27. DELETE esf7_workload_row (0 columns) — server/controllers/personnel/roster.js:1820 [one-hop, medium]
28. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/personnel/roster.js:1826 [direct, high]
29. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/personnel/roster.js:1826 [one-hop, medium]
30. DELETE esf7_admin_task (0 columns) — server/controllers/personnel/roster.js:1832 [direct, high]
31. DELETE esf7_admin_task (0 columns) — server/controllers/personnel/roster.js:1832 [one-hop, medium]
32. DELETE esf7_related_task (0 columns) — server/controllers/personnel/roster.js:1838 [direct, high]
33. DELETE esf7_related_task (0 columns) — server/controllers/personnel/roster.js:1838 [one-hop, medium]
34. DELETE esf7_personnel_employment (0 columns) — server/controllers/personnel/roster.js:1844 [direct, high]
35. DELETE esf7_personnel_employment (0 columns) — server/controllers/personnel/roster.js:1844 [one-hop, medium]
36. DELETE esf7_personnel_education (0 columns) — server/controllers/personnel/roster.js:1850 [direct, high]
37. DELETE esf7_personnel_education (0 columns) — server/controllers/personnel/roster.js:1850 [one-hop, medium]
38. DELETE esf7_personnel_educ (0 columns) — server/controllers/personnel/roster.js:1856 [direct, high]
39. DELETE esf7_personnel_educ (0 columns) — server/controllers/personnel/roster.js:1856 [one-hop, medium]
40. DELETE esf7_perssonel_educ (0 columns) — server/controllers/personnel/roster.js:1862 [direct, high]
41. DELETE esf7_perssonel_educ (0 columns) — server/controllers/personnel/roster.js:1862 [one-hop, medium]
42. DELETE esf7_personnel_learning_areas (0 columns) — server/controllers/personnel/roster.js:1868 [direct, high]
43. DELETE esf7_personnel_learning_areas (0 columns) — server/controllers/personnel/roster.js:1868 [one-hop, medium]
44. DELETE esf7_personnel_learning_area (0 columns) — server/controllers/personnel/roster.js:1874 [direct, high]
45. DELETE esf7_personnel_learning_area (0 columns) — server/controllers/personnel/roster.js:1874 [one-hop, medium]
46. DELETE esf7_personnel_ld_trainings (0 columns) — server/controllers/personnel/roster.js:1880 [direct, high]
47. DELETE esf7_personnel_ld_trainings (0 columns) — server/controllers/personnel/roster.js:1880 [one-hop, medium]
48. DELETE esf7_personnel_trainings (0 columns) — server/controllers/personnel/roster.js:1886 [direct, high]
49. DELETE esf7_personnel_trainings (0 columns) — server/controllers/personnel/roster.js:1886 [one-hop, medium]
50. DELETE esf7_personnel_ld (0 columns) — server/controllers/personnel/roster.js:1892 [direct, high]
51. DELETE esf7_personnel_ld (0 columns) — server/controllers/personnel/roster.js:1892 [one-hop, medium]
52. DELETE esf7_personnel_l&d (0 columns) — server/controllers/personnel/roster.js:1898 [direct, high]
53. DELETE esf7_personnel_l&d (0 columns) — server/controllers/personnel/roster.js:1898 [one-hop, medium]
54. DELETE esf7_personnel_designations (0 columns) — server/controllers/personnel/roster.js:1904 [direct, high]
55. DELETE esf7_personnel_designations (0 columns) — server/controllers/personnel/roster.js:1904 [one-hop, medium]
56. DELETE esf7_personnel_designation (0 columns) — server/controllers/personnel/roster.js:1910 [direct, high]
57. DELETE esf7_personnel_designation (0 columns) — server/controllers/personnel/roster.js:1910 [one-hop, medium]
58. DELETE esf7_personnel_extra_tasks (0 columns) — server/controllers/personnel/roster.js:1916 [direct, high]
59. DELETE esf7_personnel_extra_tasks (0 columns) — server/controllers/personnel/roster.js:1916 [one-hop, medium]
60. DELETE esf7_personnel_allowances (0 columns) — server/controllers/personnel/roster.js:1922 [direct, high]
61. DELETE esf7_personnel_allowances (0 columns) — server/controllers/personnel/roster.js:1922 [one-hop, medium]
62. DELETE esf7_personnel_allowance (0 columns) — server/controllers/personnel/roster.js:1928 [direct, high]
63. DELETE esf7_personnel_allowance (0 columns) — server/controllers/personnel/roster.js:1928 [one-hop, medium]
64. DELETE esf7_overload_late_undertime (0 columns) — server/controllers/personnel/roster.js:1934 [direct, high]
65. DELETE esf7_overload_late_undertime (0 columns) — server/controllers/personnel/roster.js:1934 [one-hop, medium]
66. DELETE overload_late_undertime (0 columns) — server/controllers/personnel/roster.js:1940 [direct, high]
67. DELETE overload_late_undertime (0 columns) — server/controllers/personnel/roster.js:1940 [one-hop, medium]
68. DELETE esf7_overload_no_work (0 columns) — server/controllers/personnel/roster.js:1946 [direct, high]
69. DELETE esf7_overload_no_work (0 columns) — server/controllers/personnel/roster.js:1946 [one-hop, medium]
70. DELETE overload_absences (0 columns) — server/controllers/personnel/roster.js:1952 [direct, high]
71. DELETE overload_absences (0 columns) — server/controllers/personnel/roster.js:1952 [one-hop, medium]
72. DELETE overload_pay_and_reason (0 columns) — server/controllers/personnel/roster.js:1958 [direct, high]
73. DELETE overload_pay_and_reason (0 columns) — server/controllers/personnel/roster.js:1958 [one-hop, medium]
74. DELETE esf7_work_immersion (0 columns) — server/controllers/personnel/roster.js:1964 [direct, high]
75. DELETE esf7_work_immersion (0 columns) — server/controllers/personnel/roster.js:1964 [one-hop, medium]
76. DELETE esf7_personnel_node_status (0 columns) — server/controllers/personnel/roster.js:1970 [direct, high]
77. DELETE esf7_personnel_node_status (0 columns) — server/controllers/personnel/roster.js:1970 [one-hop, medium]
78. DELETE esf7_room_submissions_staging (0 columns) — server/controllers/personnel/roster.js:1976 [direct, high]
79. DELETE esf7_room_submissions_staging (0 columns) — server/controllers/personnel/roster.js:1976 [one-hop, medium]
80. DELETE esf7_personnel_submission (0 columns) — server/controllers/personnel/roster.js:1982 [direct, high]
81. DELETE esf7_personnel_submission (0 columns) — server/controllers/personnel/roster.js:1982 [one-hop, medium]
82. DELETE esf7_requests (0 columns) — server/controllers/personnel/roster.js:1988 [direct, high]
83. DELETE esf7_requests (0 columns) — server/controllers/personnel/roster.js:1988 [one-hop, medium]
84. DELETE clustered_personnel (0 columns) — server/controllers/personnel/roster.js:1994 [direct, high]
85. DELETE clustered_personnel (0 columns) — server/controllers/personnel/roster.js:1994 [one-hop, medium]
86. DELETE esf7_personnel_id_mapping (0 columns) — server/controllers/personnel/roster.js:2000 [direct, high]
87. DELETE esf7_personnel_id_mapping (0 columns) — server/controllers/personnel/roster.js:2000 [one-hop, medium]
88. DELETE esf7_personnel_profile (0 columns) — server/controllers/personnel/roster.js:2009 [direct, high]
89. DELETE esf7_personnel_profile (0 columns) — server/controllers/personnel/roster.js:2009 [one-hop, medium]
90. Response 200 — server/controllers/personnel/roster.js:2020.

**Queries per request:** 87 data queries (3 reads, 84 writes) + 0 transaction-control statements = **87 round trips**; **2 of these run inside loops (multiplied by item count)**.

### PUT /:id

- **Handler:** server/controllers/personnel/profile.js:1156 (inline); **registered at** server/controllers/personnel/profile.js:1156; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: not seen; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.collegeDegrees, body.college_degrees, body.disabledServiceYears, body.disabled_service_years, body.hasMultipleHeads, body.isMainSchoolHead, body.isMainSh, body.is_main_sh, body.prn, body.schoolYear, body.school_year, body.status, params.id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /:id
  S->>DB: 1. DELETE esf7_personnel_ld_trainings [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 2. INSERT esf7_personnel_ld_trainings [one-hop]
  DB-->>S: ok
  end
  S->>DB: 3. SELECT esf7_personnel_learning_areas [one-hop]
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_personnel_learning_areas [one-hop]
  DB-->>S: ok
  S->>DB: 5. DELETE esf7_personnel_designations [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 6. INSERT esf7_personnel_designations [one-hop]
  DB-->>S: ok
  end
  S->>DB: 7. BEGIN
  DB-->>S: ok
  S->>DB: 8. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 9. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 10. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 11. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 12. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 13. INSERT esf7_personnel_employment
  DB-->>S: ok
  S->>DB: 14. INSERT esf7_perssonel_educ
  DB-->>S: ok
  S->>DB: 15. COMMIT
  DB-->>S: ok
  S->>DB: 16. SELECT esf7_personnel_ld_trainings
  DB-->>S: rows
  S->>DB: 17. SELECT esf7_personnel_learning_areas
  DB-->>S: rows
  S->>DB: 18. SELECT esf7_personnel_designations
  DB-->>S: rows
  S-->>C: 200
```

Steps:
1. Client sends `PUT /:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. DELETE esf7_personnel_ld_trainings (0 columns) — server/controllers/personnel/profile.js:195 [one-hop, medium]
4. INSERT esf7_personnel_ld_trainings (9 columns) **inside a loop** — server/controllers/personnel/profile.js:221 [one-hop, medium]
5. SELECT esf7_personnel_learning_areas — server/controllers/personnel/profile.js:252 [one-hop, medium]
6. INSERT esf7_personnel_learning_areas (3 columns, ON CONFLICT update) — server/controllers/personnel/profile.js:258 [one-hop, medium]
7. DELETE esf7_personnel_designations (0 columns) — server/controllers/personnel/profile.js:279 [one-hop, medium]
8. INSERT esf7_personnel_designations (11 columns) **inside a loop** — server/controllers/personnel/profile.js:524 [one-hop, medium]
9. BEGIN — server/controllers/personnel/profile.js:1159 [direct, high]
10. SELECT esf7_personnel_profile — server/controllers/personnel/profile.js:1274 [direct, high]
11. SELECT esf7_personnel_profile — server/controllers/personnel/profile.js:1286 [direct, high]
12. INSERT esf7_personnel_profile (10 columns, ON CONFLICT update) — server/controllers/personnel/profile.js:1308 [direct, high]
13. UPDATE esf7_personnel_profile (3 columns) — server/controllers/personnel/profile.js:1350 [direct, high]
14. UPDATE esf7_personnel_profile (28 columns) — server/controllers/personnel/profile.js:1567 [direct, high]
15. INSERT esf7_personnel_employment (15 columns, ON CONFLICT update) — server/controllers/personnel/profile.js:1669 [direct, high]
16. INSERT esf7_perssonel_educ (14 columns, ON CONFLICT update) — server/controllers/personnel/profile.js:1792 [direct, high]
17. COMMIT — server/controllers/personnel/profile.js:1823 [direct, high]
18. SELECT esf7_personnel_ld_trainings — server/controllers/personnel/profile.js:1825 [direct, high]
19. SELECT esf7_personnel_learning_areas — server/controllers/personnel/profile.js:1830 [direct, high]
20. SELECT esf7_personnel_designations — server/controllers/personnel/profile.js:1835 [direct, high]
21. Response 200 — server/controllers/personnel/profile.js:1879.

**Queries per request:** 16 data queries (6 reads, 10 writes) + 2 transaction-control statements = **18 round trips**; **2 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### PUT /:id/school-head

- **Handler:** server/controllers/personnel/roster.js:1196 (inline); **registered at** server/controllers/personnel/roster.js:1196; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.hasMultipleHeads, body.isMainSh, body.isSchoolHead, body.is_main_sh, body.is_school_head, body.schoolHeadLevel, body.schoolId, body.school_head_level, body.school_id, params.id, query.schoolId, query.school_id (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /:id/school-head
  S->>DB: 1. BEGIN
  DB-->>S: ok
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 3. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 4. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 5. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 6. UPDATE esf7_personnel_node_status
  DB-->>S: ok
  S->>DB: 7. UPDATE esf7_personnel_node_status
  DB-->>S: ok
  S->>DB: 8. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 9. UPDATE esf7_school_profile
  DB-->>S: ok
  S->>DB: 10. UPDATE esf7_school_profile
  DB-->>S: ok
  S->>DB: 11. SELECT school_drafts
  DB-->>S: rows
  loop for each item
  S->>DB: 12. UPDATE school_drafts
  DB-->>S: ok
  end
  S->>DB: 13. COMMIT
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /:id/school-head`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. BEGIN — server/controllers/personnel/roster.js:1231 [direct, high]
4. SELECT esf7_personnel_profile — server/controllers/personnel/roster.js:1235 [direct, high]
5. UPDATE esf7_personnel_profile (4 columns) — server/controllers/personnel/roster.js:1252 [direct, high]
6. UPDATE esf7_personnel_profile (2 columns) — server/controllers/personnel/roster.js:1257 [direct, high]
7. UPDATE esf7_personnel_profile (4 columns) — server/controllers/personnel/roster.js:1265 [direct, high]
8. UPDATE esf7_personnel_node_status (2 columns) — server/controllers/personnel/roster.js:1278 [direct, high]
9. UPDATE esf7_personnel_node_status (2 columns) — server/controllers/personnel/roster.js:1285 [direct, high]
10. SELECT esf7_personnel_profile — server/controllers/personnel/roster.js:1293 [direct, high]
11. UPDATE esf7_school_profile (4 columns) — server/controllers/personnel/roster.js:1305 [direct, high]
12. UPDATE esf7_school_profile (4 columns) — server/controllers/personnel/roster.js:1314 [direct, high]
13. SELECT school_drafts — server/controllers/personnel/roster.js:1326 [direct, high]
14. UPDATE school_drafts (2 columns) **inside a loop** — server/controllers/personnel/roster.js:1414 [direct, high]
15. COMMIT — server/controllers/personnel/roster.js:1422 [direct, high]
16. Response 200 — server/controllers/personnel/roster.js:1431.

**Queries per request:** 11 data queries (3 reads, 8 writes) + 2 transaction-control statements = **13 round trips**; **1 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### POST /api/absences

- **Handler:** server/controllers/absences/index.js:82 (inline); **registered at** server/controllers/absences/index.js:82; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.endDate, body.end_date, body.id, body.leaveType, body.leave_type, body.personnelId, body.personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.startDate, body.start_date, body.totalDays, body.total_days (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/absences
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT overload_absences
  DB-->>S: rows
  S->>DB: 3. INSERT overload_absences
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/absences`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/absences/index.js:106 [direct, high]
4. SELECT overload_absences — server/controllers/absences/index.js:125 [direct, high]
5. INSERT overload_absences (8 columns, ON CONFLICT update) — server/controllers/absences/index.js:152 [direct, high]
6. Response 201 — server/controllers/absences/index.js:153.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/absences/:id

- **Handler:** server/controllers/absences/index.js:168 (inline); **registered at** server/controllers/absences/index.js:168; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/absences/:id
  S->>DB: 1. DELETE overload_absences
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/absences/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE overload_absences (0 columns) — server/controllers/absences/index.js:170 [direct, high]
4. Response 200 — server/controllers/absences/index.js:173.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### GET /api/allowances

- **Handler:** server/controllers/allowances/index.js:185 (inline); **registered at** server/controllers/allowances/index.js:185; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** headers.x-school-id, query.schoolId, query.schoolYear, query.school_id, query.school_year (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, params.schoolID, params.schoolId, params.school_id, query.schoolID

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: GET /api/allowances
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. OTHER [one-hop]
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 4. SELECT esf7_personnel_allowances
  DB-->>S: rows
  loop for each item
  S->>DB: 5. INSERT esf7_personnel_allowances
  DB-->>S: ok
  end
  S-->>C: 200
```

Steps:
1. Client sends `GET /api/allowances`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/allowances/index.js:40 [one-hop, medium]
4. OTHER — server/controllers/allowances/index.js:43 [one-hop, medium]
5. SELECT esf7_personnel_profile — server/controllers/allowances/index.js:198 [direct, high]
6. SELECT esf7_personnel_allowances — server/controllers/allowances/index.js:204 [direct, high]
7. INSERT esf7_personnel_allowances (15 columns, ON CONFLICT update) **inside a loop** — server/controllers/allowances/index.js:237 [direct, high]
8. Response 200 — server/controllers/allowances/index.js:266.

**Queries per request:** 5 data queries (2 reads, 1 writes) + 0 transaction-control statements = **5 round trips**; **1 of these run inside loops (multiplied by item count)**.

### POST /api/allowances/bulk

- **Handler:** server/controllers/allowances/index.js:471 (inline); **registered at** server/controllers/allowances/index.js:471; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.schoolId, body.school_id, headers.x-school-id (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, headers.Authorization, headers.authorization, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/allowances/bulk
  S->>DB: 1. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_personnel_allowances
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/allowances/bulk`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/allowances/index.js:74 [one-hop, medium]
4. SELECT esf7_personnel_profile — server/controllers/allowances/index.js:488 [direct, high]
5. INSERT esf7_personnel_allowances (15 columns, ON CONFLICT update) — server/controllers/allowances/index.js:570 [direct, high]
6. Response 200 — server/controllers/allowances/index.js:605.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/allowances/disable

- **Handler:** server/controllers/allowances/index.js:408 (inline); **registered at** server/controllers/allowances/index.js:408; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.allowanceKey, body.isDisabled, body.personnelId, body.schoolYear (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/allowances/disable
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. OTHER [one-hop]
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_personnel_allowances
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/allowances/disable`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/allowances/index.js:40 [one-hop, medium]
4. OTHER — server/controllers/allowances/index.js:43 [one-hop, medium]
5. SELECT esf7_personnel_profile — server/controllers/allowances/index.js:426 [direct, high]
6. INSERT esf7_personnel_allowances (0 columns, ON CONFLICT update, multi-row) — server/controllers/allowances/index.js:438 [direct, high]
7. Response 200 — server/controllers/allowances/index.js:462.

**Queries per request:** 4 data queries (1 reads, 1 writes) + 0 transaction-control statements = **4 round trips**.

### POST /api/allowances/toggle

- **Handler:** server/controllers/allowances/index.js:280 (inline); **registered at** server/controllers/allowances/index.js:280; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.allowanceKey, body.amount, body.isGranted, body.personnelId, body.schoolId, body.schoolYear, body.school_id, headers.x-school-id (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, headers.Authorization, headers.authorization, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/allowances/toggle
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. OTHER [one-hop]
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 4. SELECT esf7_personnel_allowances
  DB-->>S: rows
  S->>DB: 5. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 6. INSERT esf7_personnel_allowances
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/allowances/toggle`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/allowances/index.js:40 [one-hop, medium]
4. OTHER — server/controllers/allowances/index.js:43 [one-hop, medium]
5. SELECT esf7_personnel_profile — server/controllers/allowances/index.js:74 [one-hop, medium]
6. SELECT esf7_personnel_allowances — server/controllers/allowances/index.js:310 [direct, high]
7. SELECT esf7_personnel_profile — server/controllers/allowances/index.js:338 [direct, high]
8. INSERT esf7_personnel_allowances (7 columns, ON CONFLICT update) — server/controllers/allowances/index.js:376 [direct, low]
9. Response 200 — server/controllers/allowances/index.js:395.

**Queries per request:** 6 data queries (3 reads, 1 writes) + 0 transaction-control statements = **6 round trips**.

> Note: The INSERT at server/controllers/allowances/index.js:376 picks its flag and amount columns at runtime (${hasCol}, ${amtCol}); the fixed columns are id, personnel_id, school_id, school_year, extras.

### POST /api/auth/master-login

- **Handler:** server/controllers/auth/index.js:142 (handlePasswordLogin); **registered at** server/controllers/auth/index.js:568; **confidence:** high
- **Middleware:** authLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: yes; validation: yes)
- **Request fields read in handler:** body.identifier, body.password, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/auth/master-login
  Note over S: no database query detected for this route
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/auth/master-login`.
2. Middleware runs: authLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. Response 200 — server/controllers/auth/index.js:177.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### POST /api/auth/migrate-login

- **Handler:** server/controllers/auth/index.js:142 (handlePasswordLogin); **registered at** server/controllers/auth/index.js:562; **confidence:** high
- **Middleware:** authLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: yes; validation: yes)
- **Request fields read in handler:** body.identifier, body.password, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/auth/migrate-login
  Note over S: no database query detected for this route
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/auth/migrate-login`.
2. Middleware runs: authLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. Response 200 — server/controllers/auth/index.js:177.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### POST /api/auth/passcode-login

- **Handler:** server/controllers/auth/index.js:327 (handlePasscodeLogin); **registered at** server/controllers/auth/index.js:581; **confidence:** high
- **Middleware:** passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: yes; validation: yes)
- **Request fields read in handler:** body.email, body.identifier, body.passcode, body.pin, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/auth/passcode-login
  Note over S: no database query detected for this route
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/auth/passcode-login`.
2. Middleware runs: passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. Response 200 — server/controllers/auth/index.js:365.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### POST /api/auth/password-login

- **Handler:** server/controllers/auth/index.js:142 (handlePasswordLogin); **registered at** server/controllers/auth/index.js:574; **confidence:** high
- **Middleware:** authLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: yes; validation: yes)
- **Request fields read in handler:** body.identifier, body.password, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/auth/password-login
  Note over S: no database query detected for this route
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/auth/password-login`.
2. Middleware runs: authLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. Response 200 — server/controllers/auth/index.js:177.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### POST /api/auth/pin-login

- **Handler:** server/controllers/auth/index.js:327 (handlePasscodeLogin); **registered at** server/controllers/auth/index.js:587; **confidence:** high
- **Middleware:** passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: yes; validation: yes)
- **Request fields read in handler:** body.email, body.identifier, body.passcode, body.pin, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/auth/pin-login
  Note over S: no database query detected for this route
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/auth/pin-login`.
2. Middleware runs: passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. Response 200 — server/controllers/auth/index.js:365.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### POST /api/auth/verify-passcode

- **Handler:** server/controllers/auth/index.js:599 (inline); **registered at** server/controllers/auth/index.js:595; **confidence:** high
- **Middleware:** passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: yes; validation: yes)
- **Request fields read in handler:** none seen

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/auth/verify-passcode
  Note over S: no database query detected for this route
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/auth/verify-passcode`.
2. Middleware runs: passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. Response 200 — server/controllers/auth/index.js:600.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### POST /api/designations

- **Handler:** server/controllers/personnel_designations/index.js:113 (inline); **registered at** server/controllers/personnel_designations/index.js:113; **confidence:** high
- **Also mounted at:** /api/personnel-designations
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.designation, body.designationName, body.designation_name, body.gradeLevel, body.grade_level, body.id, body.isSdsApproved, body.is_sds_approved, body.keyStage, body.key_stage, body.personnelId, body.personnel_id, body.sdsConfirmed, body.sds_confirmed, body.serializedKey, body.serialized_key, body.subjectArea, body.subject_area, body.track (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/designations
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_personnel_designations
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/designations`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_designations/index.js:141 [direct, high]
4. INSERT esf7_personnel_designations (11 columns) — server/controllers/personnel_designations/index.js:193 [direct, high]
5. Response 201 — server/controllers/personnel_designations/index.js:194.

**Queries per request:** 2 data queries (1 reads, 1 writes) + 0 transaction-control statements = **2 round trips**.

### DELETE /api/designations/:id

- **Handler:** server/controllers/personnel_designations/index.js:202 (inline); **registered at** server/controllers/personnel_designations/index.js:202; **confidence:** high
- **Also mounted at:** /api/personnel-designations/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/designations/:id
  S->>DB: 1. DELETE esf7_personnel_designations
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/designations/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_personnel_designations (0 columns) — server/controllers/personnel_designations/index.js:204 [direct, high]
4. Response 200 — server/controllers/personnel_designations/index.js:207.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/employment/:personnel_id

- **Handler:** server/controllers/personnel_employment/index.js:179 (inline); **registered at** server/controllers/personnel_employment/index.js:179; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.assignedGradeLevels, body.assignedSchools, body.assigned_grade_levels, body.assigned_schools, body.deploymentStatus, body.deployment_status, body.firstServiceDate, body.first_service_date, body.fundSource, body.fund_source, body.gradeLevelsTaught, body.grade_levels_taught, body.hiringArrangement, body.hiring_arrangement, body.lastLateralMovementDate, body.lastPromotionDate, body.last_lateral_movement_date, body.last_promotion_date, body.natureOfAppointment, body.nature_of_appointment, body.newStationDate, body.new_station_date, body.position, body.positionCategory, body.position_category, body.stepIncrement, body.step_increment, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/employment/:personnel_id
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_personnel_employment
  DB-->>S: ok
  S->>DB: 3. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/employment/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_employment/index.js:213 [direct, high]
4. INSERT esf7_personnel_employment (15 columns, ON CONFLICT update) — server/controllers/personnel_employment/index.js:315 [direct, high]
5. UPDATE esf7_personnel_profile (2 columns) — server/controllers/personnel_employment/index.js:324 [direct, high]
6. Response 200 — server/controllers/personnel_employment/index.js:329.

**Queries per request:** 3 data queries (1 reads, 2 writes) + 0 transaction-control statements = **3 round trips**.

### PUT /api/employment/:personnel_id

- **Handler:** server/controllers/personnel_employment/index.js:337 (inline); **registered at** server/controllers/personnel_employment/index.js:337; **confidence:** high (manual link)
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** none seen

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/employment/:personnel_id
  S->>DB: 1. SELECT esf7_personnel_profile [delegated]
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_personnel_employment [delegated]
  DB-->>S: ok
  S->>DB: 3. UPDATE esf7_personnel_profile [delegated]
  DB-->>S: ok
  S-->>C: response
```

Steps:
1. Client sends `PUT /api/employment/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_employment/index.js:213 [delegated, medium]
4. INSERT esf7_personnel_employment (15 columns, ON CONFLICT update) — server/controllers/personnel_employment/index.js:315 [delegated, medium]
5. UPDATE esf7_personnel_profile (2 columns) — server/controllers/personnel_employment/index.js:324 [delegated, medium]
6. Response.

**Queries per request:** 3 data queries (1 reads, 2 writes) + 0 transaction-control statements = **3 round trips**.

> Note: Delegates to POST /api/employment/:personnel_id (manual link).
> Note: server/controllers/personnel_employment/index.js:321 re-dispatches to the POST handler with router.handle, so the PUT does the same work.

### POST /api/esf7-upload

- **Handler:** server/controllers/esf7_upload/index.js:245 (inline); **registered at** server/controllers/esf7_upload/index.js:245; **confidence:** high
- **Middleware:** upload.single, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.schoolId, body.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/esf7-upload
  S->>DB: 1. SELECT schools_IERN
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_link
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/esf7-upload`.
2. Middleware runs: upload.single, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT schools_IERN — server/controllers/esf7_upload/index.js:282 [direct, high]
4. INSERT esf7_link (8 columns, ON CONFLICT update) — server/controllers/esf7_upload/index.js:312 [direct, high]
5. Response 200 — server/controllers/esf7_upload/index.js:323.

**Queries per request:** 2 data queries (1 reads, 1 writes) + 0 transaction-control statements = **2 round trips**.

### POST /api/esf7-upload/import-converted

- **Handler:** server/controllers/esf7_upload/index.js:340 (inline); **registered at** server/controllers/esf7_upload/index.js:340; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.old_school_id, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/esf7-upload/import-converted
  S->>DB: 1. SELECT esf7_database
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_database_dummy
  DB-->>S: rows
  loop for each item
  S->>DB: 3. INSERT esf7_database_dummy
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 4. INSERT esf7_database
  DB-->>S: ok
  end
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/esf7-upload/import-converted`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_database — server/controllers/esf7_upload/index.js:364 [direct, high]
4. SELECT esf7_database_dummy — server/controllers/esf7_upload/index.js:370 [direct, high]
5. INSERT esf7_database_dummy (1 columns, ON CONFLICT nothing) **inside a loop** — server/controllers/esf7_upload/index.js:397 [direct, low]
6. INSERT esf7_database (1 columns, ON CONFLICT nothing) **inside a loop** — server/controllers/esf7_upload/index.js:404 [direct, low]
7. Response 200 — server/controllers/esf7_upload/index.js:417.

**Queries per request:** 4 data queries (2 reads, 2 writes) + 0 transaction-control statements = **4 round trips**; **2 of these run inside loops (multiplied by item count)**.

### DELETE /api/extra-tasks/:id

- **Handler:** server/controllers/personnel_extra_tasks/index.js:128 (inline); **registered at** server/controllers/personnel_extra_tasks/index.js:128; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/extra-tasks/:id
  S->>DB: 1. DELETE esf7_personnel_extra_tasks
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/extra-tasks/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_personnel_extra_tasks (0 columns) — server/controllers/personnel_extra_tasks/index.js:131 [direct, high]
4. Response 200 — server/controllers/personnel_extra_tasks/index.js:134.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/extra-tasks/batch

- **Handler:** server/controllers/personnel_extra_tasks/index.js:66 (inline); **registered at** server/controllers/personnel_extra_tasks/index.js:66; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.personnelId, body.personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.tasks (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/extra-tasks/batch
  S->>DB: 1. DELETE esf7_personnel_extra_tasks
  DB-->>S: ok
  loop for each item
  S->>DB: 2. INSERT esf7_personnel_extra_tasks
  DB-->>S: ok
  end
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/extra-tasks/batch`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_personnel_extra_tasks (0 columns) — server/controllers/personnel_extra_tasks/index.js:83 [direct, high]
4. INSERT esf7_personnel_extra_tasks (9 columns) **inside a loop** — server/controllers/personnel_extra_tasks/index.js:105 [direct, high]
5. Response 200 — server/controllers/personnel_extra_tasks/index.js:116.

**Queries per request:** 2 data queries (0 reads, 2 writes) + 0 transaction-control statements = **2 round trips**; **1 of these run inside loops (multiplied by item count)**.

### POST /api/learning-areas/:personnel_id

- **Handler:** server/controllers/personnel_learning_areas/index.js:170 (inline); **registered at** server/controllers/personnel_learning_areas/index.js:170; **confidence:** high
- **Also mounted at:** /api/personnel-learning-areas/:personnel_id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.learningAreaMap, body.matrix_data, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/learning-areas/:personnel_id
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_personnel_learning_areas
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_personnel_learning_areas
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/learning-areas/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_learning_areas/index.js:176 [direct, high]
4. INSERT esf7_personnel_profile (9 columns, ON CONFLICT nothing) — server/controllers/personnel_learning_areas/index.js:221 [direct, high]
5. SELECT esf7_personnel_learning_areas — server/controllers/personnel_learning_areas/index.js:230 [direct, high]
6. INSERT esf7_personnel_learning_areas (4 columns, ON CONFLICT update) — server/controllers/personnel_learning_areas/index.js:245 [direct, high]
7. Response 200 — server/controllers/personnel_learning_areas/index.js:251.

**Queries per request:** 4 data queries (2 reads, 2 writes) + 0 transaction-control statements = **4 round trips**.

### PUT /api/learning-areas/:personnel_id

- **Handler:** server/controllers/personnel_learning_areas/index.js:259 (inline); **registered at** server/controllers/personnel_learning_areas/index.js:259; **confidence:** high (manual link)
- **Also mounted at:** /api/personnel-learning-areas/:personnel_id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** none seen

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/learning-areas/:personnel_id
  S->>DB: 1. SELECT esf7_personnel_profile [delegated]
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_personnel_profile [delegated]
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_personnel_learning_areas [delegated]
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_personnel_learning_areas [delegated]
  DB-->>S: ok
  S-->>C: response
```

Steps:
1. Client sends `PUT /api/learning-areas/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_learning_areas/index.js:176 [delegated, medium]
4. INSERT esf7_personnel_profile (9 columns, ON CONFLICT nothing) — server/controllers/personnel_learning_areas/index.js:221 [delegated, medium]
5. SELECT esf7_personnel_learning_areas — server/controllers/personnel_learning_areas/index.js:230 [delegated, medium]
6. INSERT esf7_personnel_learning_areas (4 columns, ON CONFLICT update) — server/controllers/personnel_learning_areas/index.js:245 [delegated, medium]
7. Response.

**Queries per request:** 4 data queries (2 reads, 2 writes) + 0 transaction-control statements = **4 round trips**.

> Note: Delegates to POST /api/learning-areas/:personnel_id (manual link).
> Note: PUT re-dispatches to the POST handler (same pattern as employment); verified by the PUT handler body being a single router.handle call.

### POST /api/learning-areas/toggle

- **Handler:** server/controllers/personnel_learning_areas/index.js:39 (inline); **registered at** server/controllers/personnel_learning_areas/index.js:39; **confidence:** high
- **Also mounted at:** /api/personnel-learning-areas/toggle
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.checked, body.learningArea, body.personnelId, body.schoolYear, body.yearsTaught (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/learning-areas/toggle
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_personnel_learning_areas
  DB-->>S: rows
  S->>DB: 4. SELECT esf7_personnel_learning_areas
  DB-->>S: rows
  S->>DB: 5. INSERT esf7_personnel_learning_areas
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/learning-areas/toggle`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_learning_areas/index.js:47 [direct, high]
4. INSERT esf7_personnel_profile (9 columns, ON CONFLICT nothing) — server/controllers/personnel_learning_areas/index.js:92 [direct, high]
5. SELECT esf7_personnel_learning_areas — server/controllers/personnel_learning_areas/index.js:101 [direct, high]
6. SELECT esf7_personnel_learning_areas — server/controllers/personnel_learning_areas/index.js:118 [direct, high]
7. INSERT esf7_personnel_learning_areas (4 columns, ON CONFLICT update) — server/controllers/personnel_learning_areas/index.js:133 [direct, high]
8. Response 200 — server/controllers/personnel_learning_areas/index.js:139.

**Queries per request:** 5 data queries (3 reads, 2 writes) + 0 transaction-control statements = **5 round trips**.

### PUT /api/node-status/personnel/:personnelId/:nodeId

- **Handler:** server/controllers/node_status/index.js:331 (inline); **registered at** server/controllers/node_status/index.js:331; **confidence:** high
- **Also mounted at:** /api/nodes/personnel/:personnelId/:nodeId
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.nodeId, params.personnelId, query.schoolId (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/node-status/personnel/:personnelId/:nodeId
  S->>DB: 1. SELECT esf7_personnel_node_status [one-hop]
  DB-->>S: rows
  S->>DB: 2. UPDATE esf7_school_node_status [one-hop]
  DB-->>S: ok
  S->>DB: 3. INSERT esf7_personnel_node_status
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /api/node-status/personnel/:personnelId/:nodeId`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_node_status — server/controllers/node_status/index.js:61 [one-hop, medium]
4. UPDATE esf7_school_node_status (2 columns) — server/controllers/node_status/index.js:93 [one-hop, medium]
5. INSERT esf7_personnel_node_status (10 columns, ON CONFLICT update) — server/controllers/node_status/index.js:385 [direct, low]
6. Response 200 — server/controllers/node_status/index.js:400.

**Queries per request:** 3 data queries (1 reads, 2 writes) + 0 transaction-control statements = **3 round trips**.

### PUT /api/node-status/school/:nodeId

- **Handler:** server/controllers/node_status/index.js:213 (inline); **registered at** server/controllers/node_status/index.js:213; **confidence:** high
- **Also mounted at:** /api/nodes/school/:nodeId
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.nodeId, query.schoolId (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/node-status/school/:nodeId
  S->>DB: 1. INSERT esf7_school_node_status
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /api/node-status/school/:nodeId`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. INSERT esf7_school_node_status (6 columns, ON CONFLICT update) — server/controllers/node_status/index.js:260 [direct, low]
4. Response 200 — server/controllers/node_status/index.js:268.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/overload-late-undertime

- **Handler:** server/controllers/overload_late_undertime/index.js:141 (inline); **registered at** server/controllers/overload_late_undertime/index.js:141; **confidence:** high
- **Also mounted at:** /api/overload-late, /api/tardiness
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.actualRenderedMinutes, body.actual_rendered_minutes, body.date, body.id, body.isExcused, body.is_excused, body.lateMinutes, body.late_minutes, body.leaveType, body.logDate, body.logType, body.log_date, body.log_type, body.missedMinutes, body.missedSlotIds, body.missedTeachingMinutes, body.missed_slot_ids, body.missed_teaching_minutes, body.month, body.personnelId, body.personnel_id, body.reason, body.scheduledTeachingMinutes, body.scheduled_teaching_minutes, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.startDate, body.tardinessDate, body.tardiness_date, body.term, body.timeIn, body.timeOut, body.time_in, body.time_out, body.totalDtrDeficitMinutes, body.total_dtr_deficit_minutes, body.undertimeMinutes, body.undertime_minutes, headers.x-school-id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-late-undertime
  S->>DB: 1. INSERT overload_late_undertime
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/overload-late-undertime`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. INSERT overload_late_undertime (20 columns, ON CONFLICT update) — server/controllers/overload_late_undertime/index.js:293 [direct, high]
4. Response 201 — server/controllers/overload_late_undertime/index.js:294.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/overload-late-undertime/:id

- **Handler:** server/controllers/overload_late_undertime/index.js:302 (inline); **registered at** server/controllers/overload_late_undertime/index.js:302; **confidence:** high
- **Also mounted at:** /api/overload-late/:id, /api/tardiness/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/overload-late-undertime/:id
  S->>DB: 1. DELETE overload_late_undertime
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/overload-late-undertime/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE overload_late_undertime (0 columns) — server/controllers/overload_late_undertime/index.js:305 [direct, high]
4. Response 200 — server/controllers/overload_late_undertime/index.js:306.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/overload-no-work

- **Handler:** server/controllers/overload_no_work/index.js:74 (inline); **registered at** server/controllers/overload_no_work/index.js:74; **confidence:** high
- **Also mounted at:** /api/no-work
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.date, body.description, body.division, body.eventType, body.event_type, body.id, body.name, body.noWorkDate, body.no_work_date, body.region, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.title (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-no-work
  S->>DB: 1. SELECT overload_no_work
  DB-->>S: rows
  S->>DB: 2. INSERT overload_no_work
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/overload-no-work`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT overload_no_work — server/controllers/overload_no_work/index.js:114 [direct, high]
4. INSERT overload_no_work (8 columns, ON CONFLICT update) — server/controllers/overload_no_work/index.js:142 [direct, high]
5. Response 201 — server/controllers/overload_no_work/index.js:143.

**Queries per request:** 2 data queries (1 reads, 1 writes) + 0 transaction-control statements = **2 round trips**.

### DELETE /api/overload-no-work/:id

- **Handler:** server/controllers/overload_no_work/index.js:151 (inline); **registered at** server/controllers/overload_no_work/index.js:151; **confidence:** high
- **Also mounted at:** /api/no-work/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/overload-no-work/:id
  S->>DB: 1. DELETE overload_no_work
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/overload-no-work/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE overload_no_work (0 columns) — server/controllers/overload_no_work/index.js:153 [direct, high]
4. Response 200 — server/controllers/overload_no_work/index.js:156.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/overload-pay-and-reason/batch

- **Handler:** server/controllers/overload_pay_and_reason/index.js:204 (inline); **registered at** server/controllers/overload_pay_and_reason/index.js:204; **confidence:** high
- **Also mounted at:** /api/overload-pay/batch
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.items, body.schoolYear, body.term (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-pay-and-reason/batch
  loop for each item
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  end
  loop for each item
  S->>DB: 2. SELECT overload_pay_and_reason
  DB-->>S: rows
  end
  loop for each item
  S->>DB: 3. INSERT overload_pay_and_reason
  DB-->>S: ok
  end
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/overload-pay-and-reason/batch`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile **inside a loop** — server/controllers/overload_pay_and_reason/index.js:227 [direct, high]
4. SELECT overload_pay_and_reason **inside a loop** — server/controllers/overload_pay_and_reason/index.js:239 [direct, high]
5. INSERT overload_pay_and_reason (11 columns, ON CONFLICT update) **inside a loop** — server/controllers/overload_pay_and_reason/index.js:272 [direct, high]
6. Response 200 — server/controllers/overload_pay_and_reason/index.js:288.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**; **3 of these run inside loops (multiplied by item count)**.

### POST /api/overload-pay-and-reason/save

- **Handler:** server/controllers/overload_pay_and_reason/index.js:93 (inline); **registered at** server/controllers/overload_pay_and_reason/index.js:93; **confidence:** high
- **Also mounted at:** /api/overload-pay/save
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.id, body.month, body.netTermPay, body.net_term_pay, body.overloadHours, body.overloadPay, body.overload_hours, body.overload_pay, body.personnelId, body.personnel_id, body.reasons, body.schoolYear, body.school_year, body.term (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-pay-and-reason/save
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT overload_pay_and_reason
  DB-->>S: rows
  S->>DB: 3. INSERT overload_pay_and_reason
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/overload-pay-and-reason/save`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/overload_pay_and_reason/index.js:118 [direct, high]
4. SELECT overload_pay_and_reason — server/controllers/overload_pay_and_reason/index.js:131 [direct, high]
5. INSERT overload_pay_and_reason (11 columns, ON CONFLICT update) — server/controllers/overload_pay_and_reason/index.js:179 [direct, high]
6. Response 200 — server/controllers/overload_pay_and_reason/index.js:192.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/overload-pay-and-reason/sync

- **Handler:** server/controllers/overload_pay_and_reason/index.js:305 (inline); **registered at** server/controllers/overload_pay_and_reason/index.js:305; **confidence:** high
- **Also mounted at:** /api/overload-pay/sync
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.schoolId, body.schoolYear (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-pay-and-reason/sync
  S->>DB: 1. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 3. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 4. SELECT esf7_shs_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 5. SELECT esf7_shs_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_workload_transfer [one-hop]
  DB-->>S: rows
  S->>DB: 7. SELECT esf7_workload_transfer [one-hop]
  DB-->>S: rows
  S->>DB: 8. SELECT school_drafts [one-hop]
  DB-->>S: rows
  S->>DB: 9. SELECT school_drafts [one-hop]
  DB-->>S: rows
  S->>DB: 10. SELECT overload_pay_and_reason [one-hop]
  DB-->>S: rows
  S->>DB: 11. SELECT overload_pay_and_reason [one-hop]
  DB-->>S: rows
  loop for each item
  S->>DB: 12. INSERT overload_pay_and_reason [one-hop]
  DB-->>S: ok
  end
  S->>DB: 13. DELETE overload_pay_and_reason [one-hop]
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/overload-pay-and-reason/sync`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/services/overloadSync.js:22 [one-hop, low]
4. SELECT esf7_workload_rows — server/services/overloadSync.js:32 [one-hop, medium]
5. SELECT esf7_workload_rows — server/services/overloadSync.js:38 [one-hop, medium]
6. SELECT esf7_shs_workload_rows — server/services/overloadSync.js:42 [one-hop, medium]
7. SELECT esf7_shs_workload_rows — server/services/overloadSync.js:48 [one-hop, medium]
8. SELECT esf7_workload_transfer — server/services/overloadSync.js:52 [one-hop, medium]
9. SELECT esf7_workload_transfer — server/services/overloadSync.js:58 [one-hop, medium]
10. SELECT school_drafts — server/services/overloadSync.js:62 [one-hop, medium]
11. SELECT school_drafts — server/services/overloadSync.js:68 [one-hop, medium]
12. SELECT overload_pay_and_reason — server/services/overloadSync.js:88 [one-hop, medium]
13. SELECT overload_pay_and_reason — server/services/overloadSync.js:94 [one-hop, medium]
14. INSERT overload_pay_and_reason (11 columns, ON CONFLICT update) **inside a loop** — server/services/overloadSync.js:351 [one-hop, medium]
15. DELETE overload_pay_and_reason (0 columns) — server/services/overloadSync.js:369 [one-hop, medium]
16. Response 200 — server/controllers/overload_pay_and_reason/index.js:312.

**Queries per request:** 13 data queries (11 reads, 2 writes) + 0 transaction-control statements = **13 round trips**; **1 of these run inside loops (multiplied by item count)**.

### POST /api/overload-reasons/batch

- **Handler:** server/controllers/overload_reasons/index.js:200 (inline); **registered at** server/controllers/overload_reasons/index.js:200; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.items, body.schoolYear, body.term (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-reasons/batch
  loop for each item
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  end
  loop for each item
  S->>DB: 2. SELECT overload_pay_and_reason
  DB-->>S: rows
  end
  loop for each item
  S->>DB: 3. INSERT overload_pay_and_reason
  DB-->>S: ok
  end
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/overload-reasons/batch`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile **inside a loop** — server/controllers/overload_reasons/index.js:223 [direct, high]
4. SELECT overload_pay_and_reason **inside a loop** — server/controllers/overload_reasons/index.js:235 [direct, high]
5. INSERT overload_pay_and_reason (11 columns, ON CONFLICT update) **inside a loop** — server/controllers/overload_reasons/index.js:268 [direct, high]
6. Response 200 — server/controllers/overload_reasons/index.js:284.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**; **3 of these run inside loops (multiplied by item count)**.

### POST /api/overload-reasons/save

- **Handler:** server/controllers/overload_reasons/index.js:74 (inline); **registered at** server/controllers/overload_reasons/index.js:74; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.id, body.month, body.netTermPay, body.net_term_pay, body.overloadHours, body.overloadPay, body.overload_hours, body.overload_pay, body.personnelId, body.personnel_id, body.reasons, body.schoolYear, body.school_year, body.term (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-reasons/save
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT overload_pay_and_reason
  DB-->>S: rows
  S->>DB: 3. INSERT overload_pay_and_reason
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/overload-reasons/save`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/overload_reasons/index.js:114 [direct, high]
4. SELECT overload_pay_and_reason — server/controllers/overload_reasons/index.js:122 [direct, high]
5. INSERT overload_pay_and_reason (11 columns, ON CONFLICT update) — server/controllers/overload_reasons/index.js:171 [direct, high]
6. Response 200 — server/controllers/overload_reasons/index.js:184.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/overload-reasons/sync

- **Handler:** server/controllers/overload_reasons/index.js:302 (inline); **registered at** server/controllers/overload_reasons/index.js:302; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.schoolId, body.schoolYear (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/overload-reasons/sync
  S->>DB: 1. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 3. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 4. SELECT esf7_shs_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 5. SELECT esf7_shs_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_workload_transfer [one-hop]
  DB-->>S: rows
  S->>DB: 7. SELECT esf7_workload_transfer [one-hop]
  DB-->>S: rows
  S->>DB: 8. SELECT school_drafts [one-hop]
  DB-->>S: rows
  S->>DB: 9. SELECT school_drafts [one-hop]
  DB-->>S: rows
  S->>DB: 10. SELECT overload_pay_and_reason [one-hop]
  DB-->>S: rows
  S->>DB: 11. SELECT overload_pay_and_reason [one-hop]
  DB-->>S: rows
  loop for each item
  S->>DB: 12. INSERT overload_pay_and_reason [one-hop]
  DB-->>S: ok
  end
  S->>DB: 13. DELETE overload_pay_and_reason [one-hop]
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/overload-reasons/sync`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/services/overloadSync.js:22 [one-hop, low]
4. SELECT esf7_workload_rows — server/services/overloadSync.js:32 [one-hop, medium]
5. SELECT esf7_workload_rows — server/services/overloadSync.js:38 [one-hop, medium]
6. SELECT esf7_shs_workload_rows — server/services/overloadSync.js:42 [one-hop, medium]
7. SELECT esf7_shs_workload_rows — server/services/overloadSync.js:48 [one-hop, medium]
8. SELECT esf7_workload_transfer — server/services/overloadSync.js:52 [one-hop, medium]
9. SELECT esf7_workload_transfer — server/services/overloadSync.js:58 [one-hop, medium]
10. SELECT school_drafts — server/services/overloadSync.js:62 [one-hop, medium]
11. SELECT school_drafts — server/services/overloadSync.js:68 [one-hop, medium]
12. SELECT overload_pay_and_reason — server/services/overloadSync.js:88 [one-hop, medium]
13. SELECT overload_pay_and_reason — server/services/overloadSync.js:94 [one-hop, medium]
14. INSERT overload_pay_and_reason (11 columns, ON CONFLICT update) **inside a loop** — server/services/overloadSync.js:351 [one-hop, medium]
15. DELETE overload_pay_and_reason (0 columns) — server/services/overloadSync.js:369 [one-hop, medium]
16. Response 200 — server/controllers/overload_reasons/index.js:309.

**Queries per request:** 13 data queries (11 reads, 2 writes) + 0 transaction-control statements = **13 round trips**; **1 of these run inside loops (multiplied by item count)**.

### POST /api/qualifications/:personnel_id

- **Handler:** server/controllers/personnel_qualifications/index.js:316 (inline); **registered at** server/controllers/personnel_qualifications/index.js:316; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.collegeDegree, body.collegeDegrees, body.college_degree, body.college_degrees, body.eligibility, body.highestEducationalAttainment, body.highest_educational_attainment, body.major, body.minor, body.postGraduateDegree, body.postGraduateDiscipline, body.postGraduateDisciplineCustom, body.post_graduate_degree, body.post_graduate_discipline, body.prcSpecialization, body.prc_specialization, body.shsTrack, body.shs_track, body.vocationalCourse, body.vocationalLevel, body.vocational_course, body.vocational_level, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/qualifications/:personnel_id
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_perssonel_educ
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_perssonel_educ
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/qualifications/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_qualifications/index.js:344 [direct, high]
4. SELECT esf7_perssonel_educ — server/controllers/personnel_qualifications/index.js:351 [direct, high]
5. INSERT esf7_perssonel_educ (14 columns, ON CONFLICT update) — server/controllers/personnel_qualifications/index.js:475 [direct, high]
6. Response 200 — server/controllers/personnel_qualifications/index.js:476.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### PUT /api/qualifications/:personnel_id

- **Handler:** server/controllers/personnel_qualifications/index.js:484 (inline); **registered at** server/controllers/personnel_qualifications/index.js:484; **confidence:** high (manual link)
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** none seen

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/qualifications/:personnel_id
  S->>DB: 1. SELECT esf7_personnel_profile [delegated]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_perssonel_educ [delegated]
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_perssonel_educ [delegated]
  DB-->>S: ok
  S-->>C: response
```

Steps:
1. Client sends `PUT /api/qualifications/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/personnel_qualifications/index.js:344 [delegated, medium]
4. SELECT esf7_perssonel_educ — server/controllers/personnel_qualifications/index.js:351 [delegated, medium]
5. INSERT esf7_perssonel_educ (14 columns, ON CONFLICT update) — server/controllers/personnel_qualifications/index.js:475 [delegated, medium]
6. Response.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

> Note: Delegates to POST /api/qualifications/:personnel_id (manual link).
> Note: PUT re-dispatches to the POST handler (same pattern as employment); verified by the PUT handler body being a single router.handle call.

### POST /api/reports/calendar-terms

- **Handler:** server/controllers/reports/index.js:190 (inline); **registered at** server/controllers/reports/index.js:190; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.school_id, body.school_year, body.terms (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/reports/calendar-terms
  S->>DB: 1. BEGIN
  DB-->>S: ok
  S->>DB: 2. DELETE school_calendar_terms
  DB-->>S: ok
  loop for each item
  S->>DB: 3. INSERT school_calendar_terms
  DB-->>S: ok
  end
  S->>DB: 4. COMMIT
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/reports/calendar-terms`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. BEGIN — server/controllers/reports/index.js:200 [direct, high]
4. DELETE school_calendar_terms (0 columns) — server/controllers/reports/index.js:201 [direct, high]
5. INSERT school_calendar_terms (7 columns) **inside a loop** — server/controllers/reports/index.js:207 [direct, high]
6. COMMIT — server/controllers/reports/index.js:221 [direct, high]
7. Response 200 — server/controllers/reports/index.js:222.

**Queries per request:** 2 data queries (0 reads, 2 writes) + 2 transaction-control statements = **4 round trips**; **1 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### POST /api/reports/generate-overload-pay

- **Handler:** server/controllers/reports/index.js:235 (inline); **registered at** server/controllers/reports/index.js:235; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.calendar_overrides, body.months, body.school_id, body.school_year (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/reports/generate-overload-pay
  S->>DB: 1. SELECT school_calendar_terms
  DB-->>S: rows
  S->>DB: 2. SELECT personnel
  DB-->>S: rows
  S->>DB: 3. SELECT workload_rows
  DB-->>S: rows
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/reports/generate-overload-pay`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT school_calendar_terms — server/controllers/reports/index.js:258 [direct, high]
4. SELECT personnel — server/controllers/reports/index.js:281 [direct, high]
5. SELECT workload_rows — server/controllers/reports/index.js:293 [direct, high]
6. Response 200 — server/controllers/reports/index.js:420.

**Queries per request:** 3 data queries (3 reads, 0 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/requests/:id/respond

- **Handler:** server/controllers/requests/index.js:666 (inline); **registered at** server/controllers/requests/index.js:666; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.action, body.remarks, params.id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/requests/:id/respond
  S->>DB: 1. UPDATE esf7_requests
  DB-->>S: ok
  S-)X: redisClient.publish (async)
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/requests/:id/respond`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. UPDATE esf7_requests (3 columns) — server/controllers/requests/index.js:675 [direct, high]
4. Side effect: `redisClient.publish` — server/services/cacheService.js:198
5. Response 200 — server/controllers/requests/index.js:685.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/requests/clustered/:prn/sync

- **Handler:** server/controllers/requests/index.js:883 (inline); **registered at** server/controllers/requests/index.js:883; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.authorSchoolId, body.authorSchoolName, body.slots, params.prn (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/requests/clustered/:prn/sync
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 3. SELECT esf7_requests [one-hop]
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_clustered_ghost_sync
  DB-->>S: ok
  S->>DB: 5. SELECT esf7_clustered_ghost_sync
  DB-->>S: rows
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/requests/clustered/:prn/sync`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/requests/index.js:701 [one-hop, medium]
4. SELECT esf7_personnel_profile — server/controllers/requests/index.js:731 [one-hop, medium]
5. SELECT esf7_requests — server/controllers/requests/index.js:751 [one-hop, medium]
6. INSERT esf7_clustered_ghost_sync (5 columns, ON CONFLICT update) — server/controllers/requests/index.js:905 [direct, high]
7. SELECT esf7_clustered_ghost_sync — server/controllers/requests/index.js:922 [direct, high]
8. Response 200 — server/controllers/requests/index.js:942.

**Queries per request:** 5 data queries (3 reads, 1 writes) + 0 transaction-control statements = **5 round trips**.

### POST /api/requests/create

- **Handler:** server/controllers/requests/index.js:491 (inline); **registered at** server/controllers/requests/index.js:491; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.id, body.personnelId, body.personnelName, body.personnel_id, body.personnel_name, body.remarks, body.requestType, body.request_type, body.requesterSchoolId, body.requester_school_id, body.targetSchoolId, body.target_school_id (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/requests/create
  S->>DB: 1. SELECT esf7_requests
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 4. SELECT esf7_requests
  DB-->>S: rows
  S->>DB: 5. INSERT esf7_requests
  DB-->>S: ok
  S-)X: redisClient.publish (async)
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/requests/create`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_requests — server/controllers/requests/index.js:524 [direct, high]
4. SELECT esf7_personnel_profile — server/controllers/requests/index.js:552 [direct, high]
5. INSERT esf7_personnel_profile (9 columns, ON CONFLICT nothing) — server/controllers/requests/index.js:603 [direct, high]
6. SELECT esf7_requests — server/controllers/requests/index.js:614 [direct, high]
7. INSERT esf7_requests (8 columns) — server/controllers/requests/index.js:620 [direct, high]
8. Side effect: `redisClient.publish` — server/services/cacheService.js:198
9. Response 200 — server/controllers/requests/index.js:543.

**Queries per request:** 5 data queries (3 reads, 2 writes) + 0 transaction-control statements = **5 round trips**.

### POST /api/room-profiling/accept

- **Handler:** server/controllers/room_profiling/index.js:560 (inline); **registered at** server/controllers/room_profiling/index.js:560; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.profileData, body.schoolId, body.school_id, body.selectedFields, body.submission, body.submissions (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/room-profiling/accept
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 2. UNKNOWN [one-hop]
  DB-->>S: ok
  end
  S->>DB: 3. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 4. BEGIN
  DB-->>S: ok
  S->>DB: 5. DELETE esf7_personnel_ld_trainings
  DB-->>S: ok
  S->>DB: 6. UPDATE esf7_personnel_submission
  DB-->>S: ok
  S->>DB: 7. COMMIT
  DB-->>S: ok
  S-)X: redisClient.publish (async)
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/room-profiling/accept`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/room_profiling/index.js:13 [one-hop, medium]
4. UNKNOWN **inside a loop** — server/controllers/room_profiling/index.js:494 [one-hop, low]
5. SELECT esf7_personnel_profile — server/controllers/room_profiling/index.js:626 [direct, high]
6. BEGIN — server/controllers/room_profiling/index.js:1404 [direct, high]
7. DELETE esf7_personnel_ld_trainings (0 columns) — server/controllers/room_profiling/index.js:1554 [direct, high]
8. UPDATE esf7_personnel_submission (1 columns) — server/controllers/room_profiling/index.js:1582 [direct, high]
9. COMMIT — server/controllers/room_profiling/index.js:1618 [direct, high]
10. Side effect: `redisClient.publish` — server/services/cacheService.js:198
11. Response 200 — server/controllers/room_profiling/index.js:580.

**Queries per request:** 5 data queries (1 reads, 2 writes) + 2 transaction-control statements = **7 round trips**; **1 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### POST /api/room-profiling/ack

- **Handler:** server/controllers/room_profiling/index.js:375 (inline); **registered at** server/controllers/room_profiling/index.js:375; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.personnelIds, body.schoolId, body.school_id, body.submissionIds (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/room-profiling/ack
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. UPDATE esf7_personnel_submission
  DB-->>S: ok
  loop for each item
  S->>DB: 3. INSERT esf7_personnel_submission_archive
  DB-->>S: ok
  end
  S-)X: redisClient.publish (async)
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/room-profiling/ack`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/room_profiling/index.js:13 [one-hop, medium]
4. UPDATE esf7_personnel_submission (1 columns) — server/controllers/room_profiling/index.js:393 [direct, high]
5. INSERT esf7_personnel_submission_archive (9 columns, ON CONFLICT update) **inside a loop** — server/controllers/room_profiling/index.js:406 [direct, high]
6. Side effect: `redisClient.publish` — server/services/cacheService.js:198
7. Response 200 — server/controllers/room_profiling/index.js:434.

**Queries per request:** 3 data queries (0 reads, 2 writes) + 0 transaction-control statements = **3 round trips**; **1 of these run inside loops (multiplied by item count)**.

### POST /api/room-profiling/record-attempt

- **Handler:** server/controllers/room_profiling/index.js:157 (inline); **registered at** server/controllers/room_profiling/index.js:157; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.isSuccess, body.passcode, body.personnelId, body.personnel_id, body.schoolId, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/room-profiling/record-attempt
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. DELETE esf7_passcode_lockout
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_passcode_lockout
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_passcode_lockout
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/room-profiling/record-attempt`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/room_profiling/index.js:13 [one-hop, medium]
4. DELETE esf7_passcode_lockout (0 columns) — server/controllers/room_profiling/index.js:190 [direct, high]
5. SELECT esf7_passcode_lockout — server/controllers/room_profiling/index.js:206 [direct, high]
6. INSERT esf7_passcode_lockout (5 columns, ON CONFLICT update) — server/controllers/room_profiling/index.js:240 [direct, high]
7. Response 200 — server/controllers/room_profiling/index.js:178.

**Queries per request:** 4 data queries (1 reads, 2 writes) + 0 transaction-control statements = **4 round trips**.

### POST /api/room-profiling/snapshots

- **Handler:** server/controllers/room_profiling/index.js:1776 (inline); **registered at** server/controllers/room_profiling/index.js:1776; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.personnel, body.schoolId, body.school_id, body.snapshotName (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/room-profiling/snapshots
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. INSERT esf7_profiling_snapshots
  DB-->>S: ok
  S->>DB: 3. DELETE esf7_profiling_snapshots
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/room-profiling/snapshots`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/room_profiling/index.js:13 [one-hop, medium]
4. INSERT esf7_profiling_snapshots (7 columns) — server/controllers/room_profiling/index.js:1793 [direct, high]
5. DELETE esf7_profiling_snapshots (0 columns) — server/controllers/room_profiling/index.js:1810 [direct, high]
6. Response 200 — server/controllers/room_profiling/index.js:1820.

**Queries per request:** 3 data queries (0 reads, 2 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/room-profiling/submit

- **Handler:** server/controllers/room_profiling/index.js:267 (inline); **registered at** server/controllers/room_profiling/index.js:267; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.personnelId, body.personnelName, body.personnel_id, body.personnel_name, body.profileData, body.room, body.roomName, body.schoolId, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/room-profiling/submit
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. DELETE esf7_personnel_submission
  DB-->>S: ok
  S->>DB: 3. INSERT esf7_personnel_submission
  DB-->>S: ok
  S-)X: redisClient.publish (async)
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/room-profiling/submit`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/room_profiling/index.js:13 [one-hop, medium]
4. DELETE esf7_personnel_submission (0 columns) — server/controllers/room_profiling/index.js:303 [direct, high]
5. INSERT esf7_personnel_submission (8 columns) — server/controllers/room_profiling/index.js:311 [direct, high]
6. Side effect: `redisClient.publish` — server/services/cacheService.js:198
7. Response 200 — server/controllers/room_profiling/index.js:331.

**Queries per request:** 3 data queries (0 reads, 2 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/room-profiling/sync-roster

- **Handler:** server/controllers/room_profiling/index.js:1864 (inline); **registered at** server/controllers/room_profiling/index.js:1864; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.roster, body.schoolId, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/room-profiling/sync-roster
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 2. UNKNOWN [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 3. SELECT esf7_personnel_profile
  DB-->>S: rows
  end
  loop for each item
  S->>DB: 4. SELECT esf7_personnel_id_mapping
  DB-->>S: rows
  end
  loop for each item
  S->>DB: 5. SELECT esf7_personnel_profile
  DB-->>S: rows
  end
  S->>DB: 6. BEGIN
  DB-->>S: ok
  loop for each item
  S->>DB: 7. INSERT esf7_personnel_id_mapping
  DB-->>S: ok
  end
  S->>DB: 8. COMMIT
  DB-->>S: ok
  S-)X: redisClient.publish (async)
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/room-profiling/sync-roster`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/room_profiling/index.js:13 [one-hop, medium]
4. UNKNOWN **inside a loop** — server/controllers/room_profiling/index.js:494 [one-hop, low]
5. SELECT esf7_personnel_profile **inside a loop** — server/controllers/room_profiling/index.js:1899 [direct, high]
6. SELECT esf7_personnel_id_mapping **inside a loop** — server/controllers/room_profiling/index.js:1908 [direct, high]
7. SELECT esf7_personnel_profile **inside a loop** — server/controllers/room_profiling/index.js:1923 [direct, high]
8. BEGIN — server/controllers/room_profiling/index.js:2187 [direct, high]
9. INSERT esf7_personnel_id_mapping (3 columns, ON CONFLICT update) **inside a loop** — server/controllers/room_profiling/index.js:2265 [direct, high]
10. COMMIT — server/controllers/room_profiling/index.js:2391 [direct, high]
11. Side effect: `redisClient.publish` — server/services/cacheService.js:198
12. Response 200 — server/controllers/room_profiling/index.js:1873.

**Queries per request:** 6 data queries (3 reads, 1 writes) + 2 transaction-control statements = **8 round trips**; **5 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### POST /api/room-profiling/verify-passcode

- **Handler:** server/controllers/room_profiling/index.js:2564 (inline); **registered at** server/controllers/room_profiling/index.js:2560; **confidence:** high
- **Middleware:** passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: yes; validation: yes)
- **Request fields read in handler:** body.passcode, body.schoolId, body.school_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/room-profiling/verify-passcode
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/room-profiling/verify-passcode`.
2. Middleware runs: passcodeLimiter, validateRequest, express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/room_profiling/index.js:13 [one-hop, medium]
4. SELECT esf7_personnel_profile — server/controllers/room_profiling/index.js:2587 [direct, high]
5. Response 200 — server/controllers/room_profiling/index.js:2668.

**Queries per request:** 2 data queries (1 reads, 0 writes) + 0 transaction-control statements = **2 round trips**.

### PUT /api/school-head-sdo

- **Handler:** server/controllers/school_head_sdo/index.js:58 (inline); **registered at** server/controllers/school_head_sdo/index.js:58; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.email, body.name, body.positionTitle, body.position_title

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/school-head-sdo
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_school_head_sdo
  DB-->>S: ok
  S-->>C: 200
  alt on error (catch block)
    S->>DB: e1. DDL [direct]
    DB-->>S: ok
    S->>DB: e2. INSERT esf7_school_head_sdo [direct]
    DB-->>S: ok
  end
```

Steps:
1. Client sends `PUT /api/school-head-sdo`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/school_head_sdo/index.js:82 [direct, high]
4. INSERT esf7_school_head_sdo (5 columns, ON CONFLICT update) — server/controllers/school_head_sdo/index.js:94 [direct, high]
5. Response 200 — server/controllers/school_head_sdo/index.js:102.
6. **Only when an error is caught (not counted below):**
   - DDL — server/controllers/school_head_sdo/index.js:106 [direct, high]
   - INSERT esf7_school_head_sdo — server/controllers/school_head_sdo/index.js:110 [direct, high]

**Queries per request:** 2 data queries (1 reads, 1 writes) + 0 transaction-control statements = **2 round trips**; 2 more run only in a catch block (error path, not counted).

### POST /api/school-subjects

- **Handler:** server/controllers/school_subjects/index.js:53 (inline); **registered at** server/controllers/school_subjects/index.js:53; **confidence:** high
- **Also mounted at:** /api/subjects
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.band, body.gradeLevel, body.grade_level, body.id, body.keyStage, body.key_stage, body.name, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.shsCategory, body.shs_category, body.subjectName, body.subject_name (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/school-subjects
  S->>DB: 1. SELECT esf7_school_subjects
  DB-->>S: rows
  S->>DB: 2. INSERT esf7_school_subjects
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/school-subjects`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_school_subjects — server/controllers/school_subjects/index.js:83 [direct, high]
4. INSERT esf7_school_subjects (9 columns, ON CONFLICT update) — server/controllers/school_subjects/index.js:114 [direct, high]
5. Response 201 — server/controllers/school_subjects/index.js:115.

**Queries per request:** 2 data queries (1 reads, 1 writes) + 0 transaction-control statements = **2 round trips**.

### DELETE /api/school-subjects/:id

- **Handler:** server/controllers/school_subjects/index.js:123 (inline); **registered at** server/controllers/school_subjects/index.js:123; **confidence:** high
- **Also mounted at:** /api/subjects/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/school-subjects/:id
  S->>DB: 1. DELETE esf7_school_subjects
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/school-subjects/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_school_subjects (0 columns) — server/controllers/school_subjects/index.js:125 [direct, high]
4. Response 200 — server/controllers/school_subjects/index.js:128.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/sections/:id

- **Handler:** server/controllers/class_sections/index.js:1294 (inline); **registered at** server/controllers/class_sections/index.js:1294; **confidence:** high
- **Also mounted at:** /api/class-sections/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** headers.x-school-id, params.id, query.schoolId, query.school_id (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, params.schoolID, params.schoolId, params.school_id, query.schoolID

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/sections/:id
  Note over S: no database query detected for this route
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/sections/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. Response 200 — server/controllers/class_sections/index.js:1418.

**Queries per request:** 0 data queries (0 reads, 0 writes) + 0 transaction-control statements = **0 round trips**.

### POST /api/sections/als

- **Handler:** server/controllers/class_sections/index.js:809 (inline); **registered at** server/controllers/class_sections/index.js:809; **confidence:** high
- **Also mounted at:** /api/class-sections/als
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.adviserId, body.adviser_id, body.advisorId, body.advisor_id, body.clcName, body.clc_name, body.deliveryMode, body.delivery_mode, body.femaleLearners, body.female_learners, body.gradeLevel, body.grade_level, body.id, body.maleLearners, body.male_learners, body.numberOfLearners, body.number_of_learners, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.sectionName, body.sectionType, body.section_name, body.section_type, body.sizeStatus, body.size_status (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/sections/als
  S->>DB: 1. SELECT esf7_als_sections
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_als_sections
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/sections/als`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_als_sections — server/controllers/class_sections/index.js:862 [direct, high]
4. SELECT esf7_personnel_profile — server/controllers/class_sections/index.js:878 [direct, high]
5. INSERT esf7_als_sections (13 columns, ON CONFLICT update) — server/controllers/class_sections/index.js:905 [direct, high]
6. Response 201 — server/controllers/class_sections/index.js:920.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/sections/als/:id

- **Handler:** server/controllers/class_sections/index.js:1185 (inline); **registered at** server/controllers/class_sections/index.js:1185; **confidence:** high
- **Also mounted at:** /api/class-sections/als/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/sections/als/:id
  S->>DB: 1. DELETE esf7_als_sections
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/sections/als/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_als_sections (0 columns) — server/controllers/class_sections/index.js:1187 [direct, high]
4. Response 200 — server/controllers/class_sections/index.js:1190.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/sections/aral

- **Handler:** server/controllers/class_sections/index.js:928 (inline); **registered at** server/controllers/class_sections/index.js:928; **confidence:** high
- **Also mounted at:** /api/class-sections/aral
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.assessmentTool, body.assessment_tool, body.basisType, body.basis_type, body.femaleLearners, body.female_learners, body.gradeLevel, body.grade_level, body.id, body.maleLearners, body.male_learners, body.profileLevel, body.profile_level, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.sectionName, body.sectionType, body.section_name, body.section_type, body.totalLearners, body.total_learners, body.tutorId, body.tutor_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/sections/aral
  S->>DB: 1. SELECT esf7_aral_sections
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_aral_sections
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/sections/aral`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_aral_sections — server/controllers/class_sections/index.js:975 [direct, high]
4. SELECT esf7_personnel_profile — server/controllers/class_sections/index.js:991 [direct, high]
5. INSERT esf7_aral_sections (13 columns, ON CONFLICT update) — server/controllers/class_sections/index.js:1019 [direct, high]
6. Response 201 — server/controllers/class_sections/index.js:1034.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/sections/aral/:id

- **Handler:** server/controllers/class_sections/index.js:1199 (inline); **registered at** server/controllers/class_sections/index.js:1199; **confidence:** high
- **Also mounted at:** /api/class-sections/aral/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/sections/aral/:id
  S->>DB: 1. DELETE esf7_aral_sections
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/sections/aral/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_aral_sections (0 columns) — server/controllers/class_sections/index.js:1201 [direct, high]
4. Response 200 — server/controllers/class_sections/index.js:1204.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/sections/clear-all

- **Handler:** server/controllers/class_sections/index.js:1229 (inline); **registered at** server/controllers/class_sections/index.js:1229; **confidence:** high
- **Also mounted at:** /api/class-sections/clear-all
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** query.schoolId, query.school_id (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/sections/clear-all
  S->>DB: 1. DELETE esf7_regular_sections
  DB-->>S: ok
  S->>DB: 2. DELETE esf7_sned_sections
  DB-->>S: ok
  S->>DB: 3. DELETE esf7_als_sections
  DB-->>S: ok
  S->>DB: 4. DELETE esf7_aral_sections
  DB-->>S: ok
  S->>DB: 5. DELETE esf7_remedial_enrichment_sections
  DB-->>S: ok
  S->>DB: 6. DELETE esf7_class_sections
  DB-->>S: ok
  S->>DB: 7. DELETE class_sections
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/sections/clear-all`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_regular_sections (0 columns) — server/controllers/class_sections/index.js:1240 [direct, high]
4. DELETE esf7_sned_sections (0 columns) — server/controllers/class_sections/index.js:1246 [direct, high]
5. DELETE esf7_als_sections (0 columns) — server/controllers/class_sections/index.js:1252 [direct, high]
6. DELETE esf7_aral_sections (0 columns) — server/controllers/class_sections/index.js:1258 [direct, high]
7. DELETE esf7_remedial_enrichment_sections (0 columns) — server/controllers/class_sections/index.js:1264 [direct, high]
8. DELETE esf7_class_sections (0 columns) — server/controllers/class_sections/index.js:1270 [direct, high]
9. DELETE class_sections (0 columns) — server/controllers/class_sections/index.js:1276 [direct, high]
10. Response 200 — server/controllers/class_sections/index.js:1283.

**Queries per request:** 7 data queries (0 reads, 7 writes) + 0 transaction-control statements = **7 round trips**.

### POST /api/sections/regular

- **Handler:** server/controllers/class_sections/index.js:622 (inline); **registered at** server/controllers/class_sections/index.js:622; **confidence:** high
- **Also mounted at:** /api/class-sections/regular
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** none seen (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/sections/regular
  S->>DB: 1. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 3. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 4. UPDATE esf7_regular_sections [one-hop]
  DB-->>S: ok
  S->>DB: 5. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 6. INSERT esf7_regular_sections [one-hop]
  DB-->>S: ok
  S->>DB: 7. BEGIN [one-hop]
  DB-->>S: ok
  S->>DB: 8. COMMIT [one-hop]
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/sections/regular`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/class_sections/index.js:483 [one-hop, medium]
4. SELECT esf7_regular_sections — server/controllers/class_sections/index.js:493 [one-hop, medium]
5. SELECT esf7_regular_sections — server/controllers/class_sections/index.js:500 [one-hop, medium]
6. UPDATE esf7_regular_sections (10 columns) — server/controllers/class_sections/index.js:550 [one-hop, medium]
7. SELECT esf7_regular_sections — server/controllers/class_sections/index.js:573 [one-hop, medium]
8. INSERT esf7_regular_sections (12 columns, ON CONFLICT update) — server/controllers/class_sections/index.js:579 [one-hop, medium]
9. BEGIN — server/controllers/class_sections/index.js:610 [one-hop, medium]
10. COMMIT — server/controllers/class_sections/index.js:612 [one-hop, medium]
11. Response 201 — server/controllers/class_sections/index.js:627.

**Queries per request:** 6 data queries (4 reads, 2 writes) + 2 transaction-control statements = **8 round trips**; 1 more run only in a catch block (error path, not counted).

### DELETE /api/sections/regular/:id

- **Handler:** server/controllers/class_sections/index.js:1157 (inline); **registered at** server/controllers/class_sections/index.js:1157; **confidence:** high
- **Also mounted at:** /api/class-sections/regular/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/sections/regular/:id
  S->>DB: 1. DELETE esf7_regular_sections
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/sections/regular/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_regular_sections (0 columns) — server/controllers/class_sections/index.js:1159 [direct, high]
4. Response 200 — server/controllers/class_sections/index.js:1162.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/sections/regular/sync

- **Handler:** server/controllers/class_sections/index.js:636 (inline); **registered at** server/controllers/class_sections/index.js:636; **confidence:** high
- **Also mounted at:** /api/class-sections/regular/sync
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.deletedIds, body.schoolId, body.schoolYear, body.sections (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/sections/regular/sync
  S->>DB: 1. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 3. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 4. UPDATE esf7_regular_sections [one-hop]
  DB-->>S: ok
  S->>DB: 5. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 6. INSERT esf7_regular_sections [one-hop]
  DB-->>S: ok
  S->>DB: 7. BEGIN [one-hop]
  DB-->>S: ok
  S->>DB: 8. COMMIT [one-hop]
  DB-->>S: ok
  S->>DB: 9. DELETE esf7_regular_sections
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/sections/regular/sync`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/class_sections/index.js:483 [one-hop, medium]
4. SELECT esf7_regular_sections — server/controllers/class_sections/index.js:493 [one-hop, medium]
5. SELECT esf7_regular_sections — server/controllers/class_sections/index.js:500 [one-hop, medium]
6. UPDATE esf7_regular_sections (10 columns) — server/controllers/class_sections/index.js:550 [one-hop, medium]
7. SELECT esf7_regular_sections — server/controllers/class_sections/index.js:573 [one-hop, medium]
8. INSERT esf7_regular_sections (12 columns, ON CONFLICT update) — server/controllers/class_sections/index.js:579 [one-hop, medium]
9. BEGIN — server/controllers/class_sections/index.js:610 [one-hop, medium]
10. COMMIT — server/controllers/class_sections/index.js:612 [one-hop, medium]
11. DELETE esf7_regular_sections (0 columns) — server/controllers/class_sections/index.js:659 [direct, high]
12. Response 200 — server/controllers/class_sections/index.js:682.

**Queries per request:** 7 data queries (4 reads, 3 writes) + 2 transaction-control statements = **9 round trips**; 1 more run only in a catch block (error path, not counted).

### POST /api/sections/remedial-enrichment

- **Handler:** server/controllers/class_sections/index.js:1042 (inline); **registered at** server/controllers/class_sections/index.js:1042; **confidence:** high
- **Also mounted at:** /api/class-sections/remedial-enrichment
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.adviserId, body.adviser_id, body.assignedTeacherId, body.assigned_teacher_id, body.femaleLearners, body.female_learners, body.gradeLevel, body.grade_level, body.id, body.interventionType, body.intervention_type, body.maleLearners, body.male_learners, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.sectionName, body.sectionType, body.section_name, body.section_type, body.totalLearners, body.total_learners (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/sections/remedial-enrichment
  S->>DB: 1. SELECT esf7_remedial_enrichment_sections
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_remedial_enrichment_sections
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/sections/remedial-enrichment`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_remedial_enrichment_sections — server/controllers/class_sections/index.js:1091 [direct, high]
4. SELECT esf7_personnel_profile — server/controllers/class_sections/index.js:1110 [direct, high]
5. INSERT esf7_remedial_enrichment_sections (11 columns, ON CONFLICT update) — server/controllers/class_sections/index.js:1136 [direct, high]
6. Response 201 — server/controllers/class_sections/index.js:1149.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/sections/remedial-enrichment/:id

- **Handler:** server/controllers/class_sections/index.js:1213 (inline); **registered at** server/controllers/class_sections/index.js:1213; **confidence:** high
- **Also mounted at:** /api/class-sections/remedial-enrichment/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/sections/remedial-enrichment/:id
  S->>DB: 1. DELETE esf7_remedial_enrichment_sections
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/sections/remedial-enrichment/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_remedial_enrichment_sections (0 columns) — server/controllers/class_sections/index.js:1215 [direct, high]
4. Response 200 — server/controllers/class_sections/index.js:1219.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/sections/sned

- **Handler:** server/controllers/class_sections/index.js:694 (inline); **registered at** server/controllers/class_sections/index.js:694; **confidence:** high
- **Also mounted at:** /api/class-sections/sned
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.adviserId, body.adviser_id, body.advisorId, body.advisor_id, body.femaleLearners, body.female_learners, body.gradeLevel, body.grade_level, body.id, body.maleLearners, body.male_learners, body.numberOfLearners, body.number_of_learners, body.programType, body.program_type, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.sectionName, body.sectionType, body.section_name, body.section_type, body.sizeStatus, body.size_status (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/sections/sned
  S->>DB: 1. SELECT esf7_sned_sections
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_sned_sections
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/sections/sned`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_sned_sections — server/controllers/class_sections/index.js:744 [direct, high]
4. SELECT esf7_personnel_profile — server/controllers/class_sections/index.js:761 [direct, high]
5. INSERT esf7_sned_sections (12 columns, ON CONFLICT update) — server/controllers/class_sections/index.js:787 [direct, high]
6. Response 201 — server/controllers/class_sections/index.js:801.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/sections/sned/:id

- **Handler:** server/controllers/class_sections/index.js:1171 (inline); **registered at** server/controllers/class_sections/index.js:1171; **confidence:** high
- **Also mounted at:** /api/class-sections/sned/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/sections/sned/:id
  S->>DB: 1. DELETE esf7_sned_sections
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/sections/sned/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_sned_sections (0 columns) — server/controllers/class_sections/index.js:1173 [direct, high]
4. Response 200 — server/controllers/class_sections/index.js:1176.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/shs-transfers

- **Handler:** server/controllers/shs_workload_transfers/index.js:90 (inline); **registered at** server/controllers/shs_workload_transfers/index.js:90; **confidence:** high
- **Also mounted at:** /api/workload-transfers
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.absenceId, body.absence_id, body.absentPersonnelId, body.absent_personnel_id, body.endDate, body.end_date, body.id, body.relievingHours, body.relievingPersonnelId, body.relieving_hours, body.relieving_personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.startDate, body.start_date, body.subject, body.workloadId, body.workloadType, body.workload_id, body.workload_type (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/shs-transfers
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_transfer
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_workload_transfer
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/shs-transfers`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/shs_workload_transfers/index.js:128 [direct, high]
4. SELECT esf7_workload_transfer — server/controllers/shs_workload_transfers/index.js:147 [direct, high]
5. INSERT esf7_workload_transfer (12 columns) — server/controllers/shs_workload_transfers/index.js:178 [direct, high]
6. Response 201 — server/controllers/shs_workload_transfers/index.js:179.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/shs-transfers/:id

- **Handler:** server/controllers/shs_workload_transfers/index.js:187 (inline); **registered at** server/controllers/shs_workload_transfers/index.js:187; **confidence:** high
- **Also mounted at:** /api/workload-transfers/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/shs-transfers/:id
  S->>DB: 1. DELETE esf7_workload_transfer
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/shs-transfers/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_workload_transfer (0 columns) — server/controllers/shs_workload_transfers/index.js:189 [direct, high]
4. Response 200 — server/controllers/shs_workload_transfers/index.js:192.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/shs-workloads

- **Handler:** server/controllers/shs_workload_rows/index.js:81 (inline); **registered at** server/controllers/shs_workload_rows/index.js:81; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.days, body.endTime, body.end_time, body.gradeLevel, body.grade_level, body.id, body.personnelId, body.personnel_id, body.remediationSubject, body.remediation_subject, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.sectionId, body.sectionName, body.section_id, body.section_name, body.semester, body.shsSubjectCategory, body.shs_subject_category, body.startTime, body.start_time, body.subject, body.subjectId, body.subject_id, body.term, body.trackStrand, body.track_strand (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/shs-workloads
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_shs_workload_rows
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_shs_workload_rows
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/shs-workloads`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/shs_workload_rows/index.js:119 [direct, high]
4. SELECT esf7_shs_workload_rows — server/controllers/shs_workload_rows/index.js:132 [direct, high]
5. INSERT esf7_shs_workload_rows (17 columns) — server/controllers/shs_workload_rows/index.js:169 [direct, high]
6. Response 201 — server/controllers/shs_workload_rows/index.js:170.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/shs-workloads/:id

- **Handler:** server/controllers/shs_workload_rows/index.js:224 (inline); **registered at** server/controllers/shs_workload_rows/index.js:224; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/shs-workloads/:id
  S->>DB: 1. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/shs-workloads/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/shs_workload_rows/index.js:226 [direct, high]
4. Response 200 — server/controllers/shs_workload_rows/index.js:229.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/shs-workloads/clear-all

- **Handler:** server/controllers/shs_workload_rows/index.js:211 (inline); **registered at** server/controllers/shs_workload_rows/index.js:211; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** none seen

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/shs-workloads/clear-all
  S->>DB: 1. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/shs-workloads/clear-all`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/shs_workload_rows/index.js:213 [direct, high]
4. Response 200 — server/controllers/shs_workload_rows/index.js:214.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/shs-workloads/personnel/:personnel_id

- **Handler:** server/controllers/shs_workload_rows/index.js:178 (inline); **registered at** server/controllers/shs_workload_rows/index.js:178; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.personnel_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/shs-workloads/personnel/:personnel_id
  S->>DB: 1. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/shs-workloads/personnel/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/shs_workload_rows/index.js:181 [direct, high]
4. Response 200 — server/controllers/shs_workload_rows/index.js:185.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/shs-workloads/school/:school_id

- **Handler:** server/controllers/shs_workload_rows/index.js:195 (inline); **registered at** server/controllers/shs_workload_rows/index.js:195; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/shs-workloads/school/:school_id
  S->>DB: 1. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/shs-workloads/school/:school_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/shs_workload_rows/index.js:198 [direct, high]
4. Response 200 — server/controllers/shs_workload_rows/index.js:201.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/submissions

- **Handler:** server/controllers/submissions/index.js:9 (inline); **registered at** server/controllers/submissions/index.js:9; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.certifiedBy, body.payload, body.schoolId, body.schoolYear, body.signature (whole body also used)
- **Read by helper functions:** body.school, body.schoolHead, body.schoolID, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/submissions
  S->>DB: 1. INSERT esf7_submission_queue
  DB-->>S: ok
  S->>DB: 2. SELECT esf7_submission_queue
  DB-->>S: rows
  S-)X: redisQueue.publishSubmissionJob (async)
  S-->>C: 202
```

Steps:
1. Client sends `POST /api/submissions`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. INSERT esf7_submission_queue (6 columns) — server/controllers/submissions/index.js:31 [direct, high]
4. SELECT esf7_submission_queue — server/controllers/submissions/index.js:64 [direct, high]
5. Side effect: `redisQueue.publishSubmissionJob` — server/controllers/submissions/index.js:52
6. Response 202 — server/controllers/submissions/index.js:70.

**Queries per request:** 2 data queries (1 reads, 1 writes) + 0 transaction-control statements = **2 round trips**.

### DELETE /api/trainings/:id

- **Handler:** server/controllers/personnel_trainings/index.js:144 (inline); **registered at** server/controllers/personnel_trainings/index.js:144; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/trainings/:id
  S->>DB: 1. DELETE esf7_personnel_ld_trainings
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/trainings/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_personnel_ld_trainings (0 columns) — server/controllers/personnel_trainings/index.js:146 [direct, high]
4. Response 200 — server/controllers/personnel_trainings/index.js:149.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### PUT /api/trainings/personnel/:personnel_id

- **Handler:** server/controllers/personnel_trainings/index.js:72 (inline); **registered at** server/controllers/personnel_trainings/index.js:72; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.certificationRows, body.neapTrainingRows, body.otherTrainingRows, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/trainings/personnel/:personnel_id
  S->>DB: 1. BEGIN
  DB-->>S: ok
  S->>DB: 2. DELETE esf7_personnel_ld_trainings
  DB-->>S: ok
  loop for each item
  S->>DB: 3. INSERT esf7_personnel_ld_trainings
  DB-->>S: ok
  end
  S->>DB: 4. COMMIT
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /api/trainings/personnel/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. BEGIN — server/controllers/personnel_trainings/index.js:77 [direct, high]
4. DELETE esf7_personnel_ld_trainings (0 columns) — server/controllers/personnel_trainings/index.js:80 [direct, high]
5. INSERT esf7_personnel_ld_trainings (9 columns) **inside a loop** — server/controllers/personnel_trainings/index.js:113 [direct, high]
6. COMMIT — server/controllers/personnel_trainings/index.js:132 [direct, high]
7. Response 200 — server/controllers/personnel_trainings/index.js:133.

**Queries per request:** 2 data queries (0 reads, 2 writes) + 2 transaction-control statements = **4 round trips**; **1 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### PUT /api/transfers/:id

- **Handler:** server/controllers/workload_transfers/index.js:128 (inline); **registered at** server/controllers/workload_transfers/index.js:128; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.status, params.id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/transfers/:id
  S->>DB: 1. UPDATE workload_transfers
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /api/transfers/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. UPDATE workload_transfers (2 columns) — server/controllers/workload_transfers/index.js:131 [direct, high]
4. Response 200 — server/controllers/workload_transfers/index.js:138.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/transfers/batch

- **Handler:** server/controllers/workload_transfers/index.js:66 (inline); **registered at** server/controllers/workload_transfers/index.js:66; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.absentTeacherId, body.endDate, body.loggedBy, body.reason, body.schoolId, body.schoolYear, body.startDate, body.substituteTeacherId, body.workloadRows (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/transfers/batch
  S->>DB: 1. BEGIN
  DB-->>S: ok
  loop for each item
  S->>DB: 2. INSERT workload_transfers
  DB-->>S: ok
  end
  S->>DB: 3. COMMIT
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/transfers/batch`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. BEGIN — server/controllers/workload_transfers/index.js:80 [direct, high]
4. INSERT workload_transfers (11 columns) **inside a loop** — server/controllers/workload_transfers/index.js:84 [direct, high]
5. COMMIT — server/controllers/workload_transfers/index.js:103 [direct, high]
6. Response 201 — server/controllers/workload_transfers/index.js:104.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 2 transaction-control statements = **3 round trips**; **1 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### POST /api/validation/resubmit

- **Handler:** server/controllers/validation/index.js:103 (inline); **registered at** server/controllers/validation/index.js:103; **confidence:** high
- **Also mounted at:** /api/esf7-validation/resubmit
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.certifiedBy, body.payload, body.schoolId, body.schoolYear, body.signature (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /api/validation/resubmit
  S->>DB: 1. DDL [one-hop]
  DB-->>S: ok
  S->>DB: 2. INSERT esf7_submission_queue
  DB-->>S: ok
  S->>DB: 3. INSERT esf7_validation
  DB-->>S: ok
  S-)X: redisQueue.publishSubmissionJob (async)
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/validation/resubmit`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DDL — server/controllers/validation/index.js:12 [one-hop, medium]
4. INSERT esf7_submission_queue (6 columns) — server/controllers/validation/index.js:125 [direct, high]
5. INSERT esf7_validation (8 columns, ON CONFLICT update) — server/controllers/validation/index.js:154 [direct, high]
6. Side effect: `redisQueue.publishSubmissionJob` — server/controllers/validation/index.js:142
7. Response 200 — server/controllers/validation/index.js:172.

**Queries per request:** 3 data queries (0 reads, 2 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/work-immersion

- **Handler:** server/controllers/work_immersion/index.js:105 (inline); **registered at** server/controllers/work_immersion/index.js:105; **confidence:** high
- **Also mounted at:** /api/work-immersion-schedules
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.date, body.endTime, body.end_time, body.id, body.personnelId, body.personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.startTime, body.start_time, body.visitDate, body.visit_date (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/work-immersion
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_work_immersion
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_work_immersion
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/work-immersion`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/work_immersion/index.js:130 [direct, high]
4. SELECT esf7_work_immersion — server/controllers/work_immersion/index.js:155 [direct, high]
5. INSERT esf7_work_immersion (8 columns, ON CONFLICT update) — server/controllers/work_immersion/index.js:184 [direct, high]
6. Response 201 — server/controllers/work_immersion/index.js:185.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/work-immersion/:id

- **Handler:** server/controllers/work_immersion/index.js:300 (inline); **registered at** server/controllers/work_immersion/index.js:300; **confidence:** high
- **Also mounted at:** /api/work-immersion-schedules/:id
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/work-immersion/:id
  S->>DB: 1. DELETE esf7_work_immersion
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/work-immersion/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_work_immersion (0 columns) — server/controllers/work_immersion/index.js:302 [direct, high]
4. Response 200 — server/controllers/work_immersion/index.js:305.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/work-immersion/batch

- **Handler:** server/controllers/work_immersion/index.js:196 (inline); **registered at** server/controllers/work_immersion/index.js:196; **confidence:** high
- **Also mounted at:** /api/work-immersion-schedules/batch
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.personnelId, body.personnel_id, body.schedules, body.schoolId, body.schoolYear, body.school_year (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/work-immersion/batch
  loop for each item
  S->>DB: 1. INSERT esf7_work_immersion
  DB-->>S: ok
  end
  S-->>C: 200
```

Steps:
1. Client sends `POST /api/work-immersion/batch`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. INSERT esf7_work_immersion (8 columns, ON CONFLICT update) **inside a loop** — server/controllers/work_immersion/index.js:229 [direct, high]
4. Response 200 — server/controllers/work_immersion/index.js:256.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**; **1 of these run inside loops (multiplied by item count)**.

### DELETE /api/work-immersion/date

- **Handler:** server/controllers/work_immersion/index.js:264 (inline); **registered at** server/controllers/work_immersion/index.js:264; **confidence:** high
- **Also mounted at:** /api/work-immersion-schedules/date
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.date, body.personnelId, body.personnel_id, body.schoolYear, body.school_year, body.visit_date (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/work-immersion/date
  S->>DB: 1. DELETE esf7_work_immersion
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/work-immersion/date`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_work_immersion (0 columns) — server/controllers/work_immersion/index.js:284 [direct, high]
4. Response 200 — server/controllers/work_immersion/index.js:289.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /api/workloads

- **Handler:** server/controllers/workload_rows/index.js:237 (inline); **registered at** server/controllers/workload_rows/index.js:237; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.days, body.endTime, body.end_time, body.gradeLevel, body.grade_level, body.id, body.personnelId, body.personnel_id, body.remediationSubject, body.remediation_subject, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.sectionId, body.sectionName, body.section_id, body.section_name, body.startTime, body.start_time, body.subject, body.subjectId, body.subject_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/workloads
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_rows
  DB-->>S: rows
  S->>DB: 3. INSERT esf7_workload_rows
  DB-->>S: ok
  S-->>C: 201
```

Steps:
1. Client sends `POST /api/workloads`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:269 [direct, high]
4. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:282 [direct, high]
5. INSERT esf7_workload_rows (14 columns) — server/controllers/workload_rows/index.js:330 [direct, high]
6. Response 201 — server/controllers/workload_rows/index.js:331.

**Queries per request:** 3 data queries (2 reads, 1 writes) + 0 transaction-control statements = **3 round trips**.

### DELETE /api/workloads/:id

- **Handler:** server/controllers/workload_rows/index.js:1321 (inline); **registered at** server/controllers/workload_rows/index.js:1321; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/workloads/:id
  S->>DB: 1. SELECT esf7_workload_rows
  DB-->>S: rows
  S->>DB: 2. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 3. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 4. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/workloads/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:1323 [direct, high]
4. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1329 [direct, high]
5. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:1335 [direct, high]
6. UPDATE esf7_personnel_profile (2 columns) — server/controllers/workload_rows/index.js:1346 [direct, high]
7. Response 200 — server/controllers/workload_rows/index.js:1354.

**Queries per request:** 4 data queries (2 reads, 2 writes) + 0 transaction-control statements = **4 round trips**.

### PUT /api/workloads/:id

- **Handler:** server/controllers/workload_rows/index.js:1125 (inline); **registered at** server/controllers/workload_rows/index.js:1125; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.days, body.endTime, body.end_time, body.gradeLevel, body.grade_level, body.remediationSubject, body.remediation_subject, body.sectionId, body.sectionName, body.section_id, body.section_name, body.startTime, body.start_time, body.subject, body.subjectId, body.subject_id, params.id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/workloads/:id
  S->>DB: 1. SELECT esf7_workload_rows
  DB-->>S: rows
  S->>DB: 2. UPDATE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 3. UPDATE esf7_workload_rows
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /api/workloads/:id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:1147 [direct, high]
4. UPDATE esf7_workload_rows (11 columns) — server/controllers/workload_rows/index.js:1216 [direct, high]
5. UPDATE esf7_workload_rows (1 columns) — server/controllers/workload_rows/index.js:1219 [direct, high]
6. Response 200 — server/controllers/workload_rows/index.js:1227.

**Queries per request:** 3 data queries (1 reads, 2 writes) + 0 transaction-control statements = **3 round trips**.

### POST /api/workloads/bulk

- **Handler:** server/controllers/workload_rows/index.js:453 (saveWorkloadBatchHandler); **registered at** server/controllers/workload_rows/index.js:1121; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.administrativeRows, body.administrative_rows, body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.personnelId, body.personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.shsWorkloads, body.teachingRelatedRows, body.teaching_related_rows, body.term, body.workloadRows, body.workload_rows, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/workloads/bulk
  S->>DB: 1. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 3. BEGIN
  DB-->>S: ok
  S->>DB: 4. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 5. SELECT
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 7. SELECT esf7_personnel_employment
  DB-->>S: rows
  S->>DB: 8. SELECT esf7_workload_rows
  DB-->>S: rows
  S->>DB: 9. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 10. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 11. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 12. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 13. DELETE esf7_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 14. INSERT esf7_workload_rows
  DB-->>S: ok
  end
  S->>DB: 15. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 16. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 17. INSERT esf7_shs_workload_rows
  DB-->>S: ok
  end
  S->>DB: 18. DELETE esf7_related_task
  DB-->>S: ok
  loop for each item
  S->>DB: 19. INSERT esf7_related_task
  DB-->>S: ok
  end
  S->>DB: 20. DELETE esf7_admin_task
  DB-->>S: ok
  S->>DB: 21. DELETE esf7_admin_task
  DB-->>S: ok
  loop for each item
  S->>DB: 22. INSERT esf7_admin_task
  DB-->>S: ok
  end
  S->>DB: 23. COMMIT
  DB-->>S: ok
  S-->>C: 200
  alt on error (catch block)
    S->>DB: e1. SELECT esf7_class_sections [one-hop]
    DB-->>S: ok
  end
```

Steps:
1. Client sends `POST /api/workloads/bulk`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_regular_sections — server/controllers/workload_rows/index.js:398 [one-hop, medium]
4. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:420 [one-hop, medium]
5. BEGIN — server/controllers/workload_rows/index.js:489 [direct, high]
6. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:491 [direct, high]
7. SELECT — server/controllers/workload_rows/index.js:495 [direct, high]
8. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:504 [direct, high]
9. SELECT esf7_personnel_employment — server/controllers/workload_rows/index.js:512 [direct, high]
10. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:528 [direct, high]
11. UPDATE esf7_personnel_profile (2 columns) — server/controllers/workload_rows/index.js:666 [direct, high]
12. INSERT esf7_personnel_profile (9 columns, ON CONFLICT update) — server/controllers/workload_rows/index.js:675 [direct, high]
13. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:702 [direct, high]
14. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:707 [direct, high]
15. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:712 [direct, high]
16. INSERT esf7_workload_rows (17 columns) **inside a loop** — server/controllers/workload_rows/index.js:809 [direct, high]
17. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:816 [direct, high]
18. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:821 [direct, high]
19. INSERT esf7_shs_workload_rows (19 columns, ON CONFLICT update) **inside a loop** — server/controllers/workload_rows/index.js:848 [direct, high]
20. DELETE esf7_related_task (0 columns) — server/controllers/workload_rows/index.js:887 [direct, high]
21. INSERT esf7_related_task (12 columns) **inside a loop** — server/controllers/workload_rows/index.js:933 [direct, high]
22. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:970 [direct, high]
23. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:975 [direct, high]
24. INSERT esf7_admin_task (20 columns) **inside a loop** — server/controllers/workload_rows/index.js:1042 [direct, high]
25. COMMIT — server/controllers/workload_rows/index.js:1100 [direct, high]
26. Response 200 — server/controllers/workload_rows/index.js:1101.
27. **Only when an error is caught (not counted below):**
   - SELECT esf7_class_sections — server/controllers/workload_rows/index.js:412 [one-hop, medium]

**Queries per request:** 21 data queries (7 reads, 14 writes) + 5 transaction-control statements = **23 round trips**; **4 of these run inside loops (multiplied by item count)**; 2 more run only in a catch block (error path, not counted).

### PUT /api/workloads/bulk

- **Handler:** server/controllers/workload_rows/index.js:453 (saveWorkloadBatchHandler); **registered at** server/controllers/workload_rows/index.js:1122; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.administrativeRows, body.administrative_rows, body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.personnelId, body.personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.shsWorkloads, body.teachingRelatedRows, body.teaching_related_rows, body.term, body.workloadRows, body.workload_rows, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/workloads/bulk
  S->>DB: 1. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 3. BEGIN
  DB-->>S: ok
  S->>DB: 4. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 5. SELECT
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 7. SELECT esf7_personnel_employment
  DB-->>S: rows
  S->>DB: 8. SELECT esf7_workload_rows
  DB-->>S: rows
  S->>DB: 9. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 10. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 11. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 12. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 13. DELETE esf7_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 14. INSERT esf7_workload_rows
  DB-->>S: ok
  end
  S->>DB: 15. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 16. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 17. INSERT esf7_shs_workload_rows
  DB-->>S: ok
  end
  S->>DB: 18. DELETE esf7_related_task
  DB-->>S: ok
  loop for each item
  S->>DB: 19. INSERT esf7_related_task
  DB-->>S: ok
  end
  S->>DB: 20. DELETE esf7_admin_task
  DB-->>S: ok
  S->>DB: 21. DELETE esf7_admin_task
  DB-->>S: ok
  loop for each item
  S->>DB: 22. INSERT esf7_admin_task
  DB-->>S: ok
  end
  S->>DB: 23. COMMIT
  DB-->>S: ok
  S-->>C: 200
  alt on error (catch block)
    S->>DB: e1. SELECT esf7_class_sections [one-hop]
    DB-->>S: ok
  end
```

Steps:
1. Client sends `PUT /api/workloads/bulk`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_regular_sections — server/controllers/workload_rows/index.js:398 [one-hop, medium]
4. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:420 [one-hop, medium]
5. BEGIN — server/controllers/workload_rows/index.js:489 [direct, high]
6. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:491 [direct, high]
7. SELECT — server/controllers/workload_rows/index.js:495 [direct, high]
8. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:504 [direct, high]
9. SELECT esf7_personnel_employment — server/controllers/workload_rows/index.js:512 [direct, high]
10. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:528 [direct, high]
11. UPDATE esf7_personnel_profile (2 columns) — server/controllers/workload_rows/index.js:666 [direct, high]
12. INSERT esf7_personnel_profile (9 columns, ON CONFLICT update) — server/controllers/workload_rows/index.js:675 [direct, high]
13. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:702 [direct, high]
14. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:707 [direct, high]
15. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:712 [direct, high]
16. INSERT esf7_workload_rows (17 columns) **inside a loop** — server/controllers/workload_rows/index.js:809 [direct, high]
17. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:816 [direct, high]
18. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:821 [direct, high]
19. INSERT esf7_shs_workload_rows (19 columns, ON CONFLICT update) **inside a loop** — server/controllers/workload_rows/index.js:848 [direct, high]
20. DELETE esf7_related_task (0 columns) — server/controllers/workload_rows/index.js:887 [direct, high]
21. INSERT esf7_related_task (12 columns) **inside a loop** — server/controllers/workload_rows/index.js:933 [direct, high]
22. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:970 [direct, high]
23. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:975 [direct, high]
24. INSERT esf7_admin_task (20 columns) **inside a loop** — server/controllers/workload_rows/index.js:1042 [direct, high]
25. COMMIT — server/controllers/workload_rows/index.js:1100 [direct, high]
26. Response 200 — server/controllers/workload_rows/index.js:1101.
27. **Only when an error is caught (not counted below):**
   - SELECT esf7_class_sections — server/controllers/workload_rows/index.js:412 [one-hop, medium]

**Queries per request:** 21 data queries (7 reads, 14 writes) + 5 transaction-control statements = **23 round trips**; **4 of these run inside loops (multiplied by item count)**; 2 more run only in a catch block (error path, not counted).

### DELETE /api/workloads/clear-all

- **Handler:** server/controllers/workload_rows/index.js:1308 (inline); **registered at** server/controllers/workload_rows/index.js:1308; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** none seen

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/workloads/clear-all
  S->>DB: 1. DELETE esf7_workload_rows
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/workloads/clear-all`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1310 [direct, high]
4. Response 200 — server/controllers/workload_rows/index.js:1311.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/workloads/personnel/:personnel_id

- **Handler:** server/controllers/workload_rows/index.js:1235 (inline); **registered at** server/controllers/workload_rows/index.js:1235; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.personnel_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/workloads/personnel/:personnel_id
  S->>DB: 1. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 2. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 3. DELETE esf7_workload_rows [one-hop]
  DB-->>S: ok
  S->>DB: 4. DELETE esf7_workload_row
  DB-->>S: ok
  S->>DB: 5. DELETE esf7_workload_row [one-hop]
  DB-->>S: ok
  S->>DB: 6. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 7. DELETE esf7_shs_workload_rows [one-hop]
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/workloads/personnel/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:1240 [direct, high]
4. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1258 [direct, high]
5. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1258 [one-hop, medium]
6. DELETE esf7_workload_row (0 columns) — server/controllers/workload_rows/index.js:1264 [direct, high]
7. DELETE esf7_workload_row (0 columns) — server/controllers/workload_rows/index.js:1264 [one-hop, medium]
8. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1270 [direct, high]
9. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1270 [one-hop, medium]
10. Response 200 — server/controllers/workload_rows/index.js:1282.

**Queries per request:** 7 data queries (1 reads, 6 writes) + 0 transaction-control statements = **7 round trips**.

### POST /api/workloads/personnel/:personnel_id

- **Handler:** server/controllers/workload_rows/index.js:453 (saveWorkloadBatchHandler); **registered at** server/controllers/workload_rows/index.js:1120; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.administrativeRows, body.administrative_rows, body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.personnelId, body.personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.shsWorkloads, body.teachingRelatedRows, body.teaching_related_rows, body.term, body.workloadRows, body.workload_rows, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /api/workloads/personnel/:personnel_id
  S->>DB: 1. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 3. BEGIN
  DB-->>S: ok
  S->>DB: 4. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 5. SELECT
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 7. SELECT esf7_personnel_employment
  DB-->>S: rows
  S->>DB: 8. SELECT esf7_workload_rows
  DB-->>S: rows
  S->>DB: 9. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 10. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 11. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 12. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 13. DELETE esf7_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 14. INSERT esf7_workload_rows
  DB-->>S: ok
  end
  S->>DB: 15. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 16. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 17. INSERT esf7_shs_workload_rows
  DB-->>S: ok
  end
  S->>DB: 18. DELETE esf7_related_task
  DB-->>S: ok
  loop for each item
  S->>DB: 19. INSERT esf7_related_task
  DB-->>S: ok
  end
  S->>DB: 20. DELETE esf7_admin_task
  DB-->>S: ok
  S->>DB: 21. DELETE esf7_admin_task
  DB-->>S: ok
  loop for each item
  S->>DB: 22. INSERT esf7_admin_task
  DB-->>S: ok
  end
  S->>DB: 23. COMMIT
  DB-->>S: ok
  S-->>C: 200
  alt on error (catch block)
    S->>DB: e1. SELECT esf7_class_sections [one-hop]
    DB-->>S: ok
  end
```

Steps:
1. Client sends `POST /api/workloads/personnel/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_regular_sections — server/controllers/workload_rows/index.js:398 [one-hop, medium]
4. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:420 [one-hop, medium]
5. BEGIN — server/controllers/workload_rows/index.js:489 [direct, high]
6. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:491 [direct, high]
7. SELECT — server/controllers/workload_rows/index.js:495 [direct, high]
8. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:504 [direct, high]
9. SELECT esf7_personnel_employment — server/controllers/workload_rows/index.js:512 [direct, high]
10. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:528 [direct, high]
11. UPDATE esf7_personnel_profile (2 columns) — server/controllers/workload_rows/index.js:666 [direct, high]
12. INSERT esf7_personnel_profile (9 columns, ON CONFLICT update) — server/controllers/workload_rows/index.js:675 [direct, high]
13. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:702 [direct, high]
14. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:707 [direct, high]
15. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:712 [direct, high]
16. INSERT esf7_workload_rows (17 columns) **inside a loop** — server/controllers/workload_rows/index.js:809 [direct, high]
17. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:816 [direct, high]
18. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:821 [direct, high]
19. INSERT esf7_shs_workload_rows (19 columns, ON CONFLICT update) **inside a loop** — server/controllers/workload_rows/index.js:848 [direct, high]
20. DELETE esf7_related_task (0 columns) — server/controllers/workload_rows/index.js:887 [direct, high]
21. INSERT esf7_related_task (12 columns) **inside a loop** — server/controllers/workload_rows/index.js:933 [direct, high]
22. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:970 [direct, high]
23. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:975 [direct, high]
24. INSERT esf7_admin_task (20 columns) **inside a loop** — server/controllers/workload_rows/index.js:1042 [direct, high]
25. COMMIT — server/controllers/workload_rows/index.js:1100 [direct, high]
26. Response 200 — server/controllers/workload_rows/index.js:1101.
27. **Only when an error is caught (not counted below):**
   - SELECT esf7_class_sections — server/controllers/workload_rows/index.js:412 [one-hop, medium]

**Queries per request:** 21 data queries (7 reads, 14 writes) + 5 transaction-control statements = **23 round trips**; **4 of these run inside loops (multiplied by item count)**; 2 more run only in a catch block (error path, not counted).

### PUT /api/workloads/personnel/:personnel_id

- **Handler:** server/controllers/workload_rows/index.js:453 (saveWorkloadBatchHandler); **registered at** server/controllers/workload_rows/index.js:1119; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.administrativeRows, body.administrative_rows, body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.personnelId, body.personnel_id, body.schoolId, body.schoolYear, body.school_id, body.school_year, body.shsWorkloads, body.teachingRelatedRows, body.teaching_related_rows, body.term, body.workloadRows, body.workload_rows, params.personnel_id (whole body also used)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /api/workloads/personnel/:personnel_id
  S->>DB: 1. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 2. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 3. BEGIN
  DB-->>S: ok
  S->>DB: 4. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 5. SELECT
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_personnel_profile
  DB-->>S: rows
  S->>DB: 7. SELECT esf7_personnel_employment
  DB-->>S: rows
  S->>DB: 8. SELECT esf7_workload_rows
  DB-->>S: rows
  S->>DB: 9. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 10. INSERT esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 11. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 12. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 13. DELETE esf7_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 14. INSERT esf7_workload_rows
  DB-->>S: ok
  end
  S->>DB: 15. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 16. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  loop for each item
  S->>DB: 17. INSERT esf7_shs_workload_rows
  DB-->>S: ok
  end
  S->>DB: 18. DELETE esf7_related_task
  DB-->>S: ok
  loop for each item
  S->>DB: 19. INSERT esf7_related_task
  DB-->>S: ok
  end
  S->>DB: 20. DELETE esf7_admin_task
  DB-->>S: ok
  S->>DB: 21. DELETE esf7_admin_task
  DB-->>S: ok
  loop for each item
  S->>DB: 22. INSERT esf7_admin_task
  DB-->>S: ok
  end
  S->>DB: 23. COMMIT
  DB-->>S: ok
  S-->>C: 200
  alt on error (catch block)
    S->>DB: e1. SELECT esf7_class_sections [one-hop]
    DB-->>S: ok
  end
```

Steps:
1. Client sends `PUT /api/workloads/personnel/:personnel_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. SELECT esf7_regular_sections — server/controllers/workload_rows/index.js:398 [one-hop, medium]
4. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:420 [one-hop, medium]
5. BEGIN — server/controllers/workload_rows/index.js:489 [direct, high]
6. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:491 [direct, high]
7. SELECT — server/controllers/workload_rows/index.js:495 [direct, high]
8. SELECT esf7_personnel_profile — server/controllers/workload_rows/index.js:504 [direct, high]
9. SELECT esf7_personnel_employment — server/controllers/workload_rows/index.js:512 [direct, high]
10. SELECT esf7_workload_rows — server/controllers/workload_rows/index.js:528 [direct, high]
11. UPDATE esf7_personnel_profile (2 columns) — server/controllers/workload_rows/index.js:666 [direct, high]
12. INSERT esf7_personnel_profile (9 columns, ON CONFLICT update) — server/controllers/workload_rows/index.js:675 [direct, high]
13. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:702 [direct, high]
14. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:707 [direct, high]
15. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:712 [direct, high]
16. INSERT esf7_workload_rows (17 columns) **inside a loop** — server/controllers/workload_rows/index.js:809 [direct, high]
17. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:816 [direct, high]
18. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:821 [direct, high]
19. INSERT esf7_shs_workload_rows (19 columns, ON CONFLICT update) **inside a loop** — server/controllers/workload_rows/index.js:848 [direct, high]
20. DELETE esf7_related_task (0 columns) — server/controllers/workload_rows/index.js:887 [direct, high]
21. INSERT esf7_related_task (12 columns) **inside a loop** — server/controllers/workload_rows/index.js:933 [direct, high]
22. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:970 [direct, high]
23. DELETE esf7_admin_task (0 columns) — server/controllers/workload_rows/index.js:975 [direct, high]
24. INSERT esf7_admin_task (20 columns) **inside a loop** — server/controllers/workload_rows/index.js:1042 [direct, high]
25. COMMIT — server/controllers/workload_rows/index.js:1100 [direct, high]
26. Response 200 — server/controllers/workload_rows/index.js:1101.
27. **Only when an error is caught (not counted below):**
   - SELECT esf7_class_sections — server/controllers/workload_rows/index.js:412 [one-hop, medium]

**Queries per request:** 21 data queries (7 reads, 14 writes) + 5 transaction-control statements = **23 round trips**; **4 of these run inside loops (multiplied by item count)**; 2 more run only in a catch block (error path, not counted).

### DELETE /api/workloads/personnel/:personnel_id/term/:term

- **Handler:** server/controllers/workload_rows/index.js:1452 (inline); **registered at** server/controllers/workload_rows/index.js:1452; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.personnel_id, params.term
- **Read by helper functions:** query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/workloads/personnel/:personnel_id/term/:term
  S->>DB: 1. BEGIN
  DB-->>S: ok
  S->>DB: 2. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 3. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 4. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 5. COMMIT
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/workloads/personnel/:personnel_id/term/:term`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. BEGIN — server/controllers/workload_rows/index.js:1458 [direct, high]
4. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1470 [direct, high]
5. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1474 [direct, high]
6. UPDATE esf7_personnel_profile (2 columns) — server/controllers/workload_rows/index.js:1478 [direct, low]
7. COMMIT — server/controllers/workload_rows/index.js:1482 [direct, high]
8. Response 200 — server/controllers/workload_rows/index.js:1483.

**Queries per request:** 3 data queries (0 reads, 3 writes) + 3 transaction-control statements = **5 round trips**; 1 more run only in a catch block (error path, not counted).

### DELETE /api/workloads/school/:school_id

- **Handler:** server/controllers/workload_rows/index.js:1292 (inline); **registered at** server/controllers/workload_rows/index.js:1292; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** params.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/workloads/school/:school_id
  S->>DB: 1. DELETE esf7_workload_rows
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/workloads/school/:school_id`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1295 [direct, high]
4. Response 200 — server/controllers/workload_rows/index.js:1298.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /api/workloads/term-clear/school

- **Handler:** server/controllers/workload_rows/index.js:1503 (inline); **registered at** server/controllers/workload_rows/index.js:1503; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate (auth: yes; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** query.term
- **Read by helper functions:** query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /api/workloads/term-clear/school
  S->>DB: 1. BEGIN
  DB-->>S: ok
  S->>DB: 2. DELETE esf7_workload_rows
  DB-->>S: ok
  S->>DB: 3. DELETE esf7_shs_workload_rows
  DB-->>S: ok
  S->>DB: 4. UPDATE esf7_personnel_profile
  DB-->>S: ok
  S->>DB: 5. COMMIT
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /api/workloads/term-clear/school`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware, apiAuthGate.
3. BEGIN — server/controllers/workload_rows/index.js:1512 [direct, high]
4. DELETE esf7_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1513 [direct, high]
5. DELETE esf7_shs_workload_rows (0 columns) — server/controllers/workload_rows/index.js:1517 [direct, high]
6. UPDATE esf7_personnel_profile (2 columns) — server/controllers/workload_rows/index.js:1521 [direct, low]
7. COMMIT — server/controllers/workload_rows/index.js:1525 [direct, high]
8. Response 200 — server/controllers/workload_rows/index.js:1526.

**Queries per request:** 3 data queries (0 reads, 3 writes) + 2 transaction-control statements = **5 round trips**; 1 more run only in a catch block (error path, not counted).

### POST /bulk

- **Handler:** server/controllers/personnel/roster.js:949 (inline); **registered at** server/controllers/personnel/roster.js:949; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.personnel, body.personnelList, body.schoolId, body.schoolYear, body.school_id, body.school_year (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /bulk
  S->>DB: 1. BEGIN
  DB-->>S: ok
  S->>DB: 2. SELECT esf7_personnel_profile
  DB-->>S: rows
  loop for each item
  S->>DB: 3. SELECT esf7_personnel_profile
  DB-->>S: rows
  end
  loop for each item
  S->>DB: 4. INSERT esf7_personnel_profile
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 5. INSERT esf7_personnel_employment
  DB-->>S: ok
  end
  S->>DB: 6. COMMIT
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /bulk`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. BEGIN — server/controllers/personnel/roster.js:970 [direct, high]
4. SELECT esf7_personnel_profile — server/controllers/personnel/roster.js:973 [direct, high]
5. SELECT esf7_personnel_profile **inside a loop** — server/controllers/personnel/roster.js:999 [direct, high]
6. INSERT esf7_personnel_profile (31 columns, ON CONFLICT update) **inside a loop** — server/controllers/personnel/roster.js:1109 [direct, high]
7. INSERT esf7_personnel_employment (9 columns, ON CONFLICT update) **inside a loop** — server/controllers/personnel/roster.js:1153 [direct, high]
8. COMMIT — server/controllers/personnel/roster.js:1177 [direct, high]
9. Response 200 — server/controllers/personnel/roster.js:963.

**Queries per request:** 4 data queries (2 reads, 2 writes) + 2 transaction-control statements = **6 round trips**; **3 of these run inside loops (multiplied by item count)**; 1 more run only in a catch block (error path, not counted).

### PUT /curricular-config

- **Handler:** server/controllers/schools/profile.js:25 (inline); **registered at** server/controllers/schools/profile.js:25; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.elemInclusivePrograms, body.elemSpecialPrograms, body.elem_inclusive_programs, body.elem_special_programs, body.hasElemSpecialPrograms, body.hasJhsSpecialPrograms, body.hasShifts, body.has_elem_special_programs, body.has_es_als, body.has_es_iped, body.has_es_mad, body.has_es_sned, body.has_jhs_als, body.has_jhs_iped, body.has_jhs_mad, body.has_jhs_sned, body.has_jhs_special_programs, body.has_shifts, body.has_shs_iped, body.has_shs_mad, body.has_shs_sned, body.iern, body.jhsInclusivePrograms, body.jhsSpecialPrograms, body.jhs_inclusive_programs, body.jhs_special_programs, body.schoolId, body.schoolYear, body.school_id, body.shiftsConfig, body.shifts_config, body.shsCurriculumModel, body.shsInclusivePrograms, body.shs_curriculum_model, body.shs_inclusive_programs (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /curricular-config
  S->>DB: 1. INSERT esf7_school_profile
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /curricular-config`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. INSERT esf7_school_profile (28 columns, ON CONFLICT update) — server/controllers/schools/profile.js:237 [direct, high]
4. Response 200 — server/controllers/schools/profile.js:269.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### DELETE /draft

- **Handler:** server/controllers/schools/drafts.js:2343 (inline); **registered at** server/controllers/schools/drafts.js:2343; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** query.schoolYear (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: DELETE /draft
  S->>DB: 1. DELETE school_drafts
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `DELETE /draft`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. DELETE school_drafts (0 columns) — server/controllers/schools/drafts.js:2350 [direct, high]
4. Response 200 — server/controllers/schools/drafts.js:2358.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### POST /draft

- **Handler:** server/controllers/schools/drafts.js:1900 (handleSaveDraft); **registered at** server/controllers/schools/drafts.js:2366; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.allowSectionDeletion, body.baseVersion, body.payload, body.schoolYear, headers.x-smoke-test, headers.x-sync-normalize, query.schoolId, query.school_id (whole body also used)
- **Read by helper functions:** body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: POST /draft
  S->>DB: 1. SAVEPOINT [heuristic]
  DB-->>S: ok
  S->>DB: 2. RELEASE [heuristic]
  DB-->>S: ok
  S->>DB: 3. SELECT columns [one-hop]
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_school_profile [one-hop]
  DB-->>S: ok
  S->>DB: 5. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_personnel_id_mapping [one-hop]
  DB-->>S: rows
  S->>DB: 7. INSERT esf7_personnel_id_mapping [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 8. INSERT esf7_personnel_profile [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 9. INSERT esf7_personnel_employment [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 10. INSERT esf7_perssonel_educ [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 11. INSERT esf7_regular_sections [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 12. INSERT esf7_workload_rows [one-hop]
  DB-->>S: ok
  end
  S->>DB: 13. SELECT esf7_school_profile [one-hop]
  DB-->>S: rows
  S->>DB: 14. SELECT schools [one-hop]
  DB-->>S: rows
  S->>DB: 15. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 16. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 17. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 18. SELECT esf7_school_node_status [one-hop]
  DB-->>S: rows
  S->>DB: 19. SELECT esf7_deleted_personnel [one-hop]
  DB-->>S: rows
  S->>DB: 20. SELECT school_drafts
  DB-->>S: rows
  S->>DB: 21. SELECT esf7_deleted_personnel
  DB-->>S: rows
  S->>DB: 22. BEGIN
  DB-->>S: ok
  S->>DB: 23. UNKNOWN
  DB-->>S: ok
  S->>DB: 24. SELECT school_drafts
  DB-->>S: rows
  S->>DB: 25. INSERT school_drafts
  DB-->>S: ok
  S->>DB: 26. COMMIT
  DB-->>S: ok
  S-)X: redisClient.publish (async)
  S-->>C: 200
  Note over S,DB: after the response (deferred, same process)
  S->>DB: d1. INSERT esf7_personnel_node_status [one-hop]
  DB-->>S: ok
  S->>DB: d2. INSERT esf7_school_node_status [one-hop]
  DB-->>S: ok
```

Steps:
1. Client sends `POST /draft`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. SAVEPOINT — server/controllers/schools/drafts.js:68 [heuristic, low]
4. RELEASE — server/controllers/schools/drafts.js:71 [heuristic, low]
5. SELECT columns — server/controllers/schools/drafts.js:89 [one-hop, medium]
6. INSERT esf7_school_profile (28 columns, ON CONFLICT update) — server/controllers/schools/drafts.js:556 [one-hop, medium]
7. SELECT esf7_personnel_profile — server/controllers/schools/drafts.js:660 [one-hop, medium]
8. SELECT esf7_personnel_id_mapping — server/controllers/schools/drafts.js:695 [one-hop, medium]
9. INSERT esf7_personnel_id_mapping (0 columns, ON CONFLICT update, multi-row) — server/controllers/schools/drafts.js:951 [one-hop, medium]
10. INSERT esf7_personnel_profile (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1006 [one-hop, low]
11. INSERT esf7_personnel_employment (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1086 [one-hop, low]
12. INSERT esf7_perssonel_educ (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1149 [one-hop, low]
13. INSERT esf7_regular_sections (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1291 [one-hop, low]
14. INSERT esf7_workload_rows (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1405 [one-hop, low]
15. SELECT esf7_school_profile — server/controllers/schools/drafts.js:1456 [one-hop, medium]
16. SELECT schools — server/controllers/schools/drafts.js:1462 [one-hop, medium]
17. SELECT esf7_personnel_profile — server/controllers/schools/drafts.js:1467 [one-hop, medium]
18. SELECT esf7_workload_rows — server/controllers/schools/drafts.js:1506 [one-hop, medium]
19. SELECT esf7_regular_sections — server/controllers/schools/drafts.js:1512 [one-hop, medium]
20. SELECT esf7_school_node_status — server/controllers/schools/drafts.js:1518 [one-hop, medium]
21. SELECT esf7_deleted_personnel — server/controllers/schools/drafts.js:1524 [one-hop, medium]
22. SELECT school_drafts — server/controllers/schools/drafts.js:1933 [direct, high]
23. SELECT esf7_deleted_personnel — server/controllers/schools/drafts.js:1964 [direct, high]
24. BEGIN — server/controllers/schools/drafts.js:2195 [direct, high]
25. UNKNOWN — server/controllers/schools/drafts.js:2221 [direct, low]
26. SELECT school_drafts — server/controllers/schools/drafts.js:2225 [direct, high]
27. INSERT school_drafts (4 columns, ON CONFLICT update) — server/controllers/schools/drafts.js:2245 [direct, high]
28. COMMIT — server/controllers/schools/drafts.js:2282 [direct, high]
29. Side effect: `redisClient.publish` — server/services/cacheService.js:198
30. Response 200 — server/controllers/schools/drafts.js:2329.
31. **After the response (deferred):**
   - INSERT esf7_personnel_node_status — server/controllers/schools/drafts.js:371 [one-hop, low]
   - INSERT esf7_school_node_status — server/controllers/schools/drafts.js:399 [one-hop, medium]

**Queries per request:** 22 data queries (13 reads, 8 writes) + 5 transaction-control statements = **26 round trips**; **5 of these run inside loops (multiplied by item count)**; plus 2 deferred queries (2 writes) that run after the response in the same process; 2 more run only in a catch block (error path, not counted).

### PUT /draft

- **Handler:** server/controllers/schools/drafts.js:1900 (handleSaveDraft); **registered at** server/controllers/schools/drafts.js:2365; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.allowSectionDeletion, body.baseVersion, body.payload, body.schoolYear, headers.x-smoke-test, headers.x-sync-normalize, query.schoolId, query.school_id (whole body also used)
- **Read by helper functions:** body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  participant X as Queue or Redis
  C->>S: PUT /draft
  S->>DB: 1. SAVEPOINT [heuristic]
  DB-->>S: ok
  S->>DB: 2. RELEASE [heuristic]
  DB-->>S: ok
  S->>DB: 3. SELECT columns [one-hop]
  DB-->>S: rows
  S->>DB: 4. INSERT esf7_school_profile [one-hop]
  DB-->>S: ok
  S->>DB: 5. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 6. SELECT esf7_personnel_id_mapping [one-hop]
  DB-->>S: rows
  S->>DB: 7. INSERT esf7_personnel_id_mapping [one-hop]
  DB-->>S: ok
  loop for each item
  S->>DB: 8. INSERT esf7_personnel_profile [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 9. INSERT esf7_personnel_employment [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 10. INSERT esf7_perssonel_educ [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 11. INSERT esf7_regular_sections [one-hop]
  DB-->>S: ok
  end
  loop for each item
  S->>DB: 12. INSERT esf7_workload_rows [one-hop]
  DB-->>S: ok
  end
  S->>DB: 13. SELECT esf7_school_profile [one-hop]
  DB-->>S: rows
  S->>DB: 14. SELECT schools [one-hop]
  DB-->>S: rows
  S->>DB: 15. SELECT esf7_personnel_profile [one-hop]
  DB-->>S: rows
  S->>DB: 16. SELECT esf7_workload_rows [one-hop]
  DB-->>S: rows
  S->>DB: 17. SELECT esf7_regular_sections [one-hop]
  DB-->>S: rows
  S->>DB: 18. SELECT esf7_school_node_status [one-hop]
  DB-->>S: rows
  S->>DB: 19. SELECT esf7_deleted_personnel [one-hop]
  DB-->>S: rows
  S->>DB: 20. SELECT school_drafts
  DB-->>S: rows
  S->>DB: 21. SELECT esf7_deleted_personnel
  DB-->>S: rows
  S->>DB: 22. BEGIN
  DB-->>S: ok
  S->>DB: 23. UNKNOWN
  DB-->>S: ok
  S->>DB: 24. SELECT school_drafts
  DB-->>S: rows
  S->>DB: 25. INSERT school_drafts
  DB-->>S: ok
  S->>DB: 26. COMMIT
  DB-->>S: ok
  S-)X: redisClient.publish (async)
  S-->>C: 200
  Note over S,DB: after the response (deferred, same process)
  S->>DB: d1. INSERT esf7_personnel_node_status [one-hop]
  DB-->>S: ok
  S->>DB: d2. INSERT esf7_school_node_status [one-hop]
  DB-->>S: ok
```

Steps:
1. Client sends `PUT /draft`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. SAVEPOINT — server/controllers/schools/drafts.js:68 [heuristic, low]
4. RELEASE — server/controllers/schools/drafts.js:71 [heuristic, low]
5. SELECT columns — server/controllers/schools/drafts.js:89 [one-hop, medium]
6. INSERT esf7_school_profile (28 columns, ON CONFLICT update) — server/controllers/schools/drafts.js:556 [one-hop, medium]
7. SELECT esf7_personnel_profile — server/controllers/schools/drafts.js:660 [one-hop, medium]
8. SELECT esf7_personnel_id_mapping — server/controllers/schools/drafts.js:695 [one-hop, medium]
9. INSERT esf7_personnel_id_mapping (0 columns, ON CONFLICT update, multi-row) — server/controllers/schools/drafts.js:951 [one-hop, medium]
10. INSERT esf7_personnel_profile (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1006 [one-hop, low]
11. INSERT esf7_personnel_employment (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1086 [one-hop, low]
12. INSERT esf7_perssonel_educ (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1149 [one-hop, low]
13. INSERT esf7_regular_sections (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1291 [one-hop, low]
14. INSERT esf7_workload_rows (0 columns, ON CONFLICT update) **inside a loop** — server/controllers/schools/drafts.js:1405 [one-hop, low]
15. SELECT esf7_school_profile — server/controllers/schools/drafts.js:1456 [one-hop, medium]
16. SELECT schools — server/controllers/schools/drafts.js:1462 [one-hop, medium]
17. SELECT esf7_personnel_profile — server/controllers/schools/drafts.js:1467 [one-hop, medium]
18. SELECT esf7_workload_rows — server/controllers/schools/drafts.js:1506 [one-hop, medium]
19. SELECT esf7_regular_sections — server/controllers/schools/drafts.js:1512 [one-hop, medium]
20. SELECT esf7_school_node_status — server/controllers/schools/drafts.js:1518 [one-hop, medium]
21. SELECT esf7_deleted_personnel — server/controllers/schools/drafts.js:1524 [one-hop, medium]
22. SELECT school_drafts — server/controllers/schools/drafts.js:1933 [direct, high]
23. SELECT esf7_deleted_personnel — server/controllers/schools/drafts.js:1964 [direct, high]
24. BEGIN — server/controllers/schools/drafts.js:2195 [direct, high]
25. UNKNOWN — server/controllers/schools/drafts.js:2221 [direct, low]
26. SELECT school_drafts — server/controllers/schools/drafts.js:2225 [direct, high]
27. INSERT school_drafts (4 columns, ON CONFLICT update) — server/controllers/schools/drafts.js:2245 [direct, high]
28. COMMIT — server/controllers/schools/drafts.js:2282 [direct, high]
29. Side effect: `redisClient.publish` — server/services/cacheService.js:198
30. Response 200 — server/controllers/schools/drafts.js:2329.
31. **After the response (deferred):**
   - INSERT esf7_personnel_node_status — server/controllers/schools/drafts.js:371 [one-hop, low]
   - INSERT esf7_school_node_status — server/controllers/schools/drafts.js:399 [one-hop, medium]

**Queries per request:** 22 data queries (13 reads, 8 writes) + 5 transaction-control statements = **26 round trips**; **5 of these run inside loops (multiplied by item count)**; plus 2 deferred queries (2 writes) that run after the response in the same process; 2 more run only in a catch block (error path, not counted).

### POST /share

- **Handler:** server/controllers/personnel/profile.js:38 (inline); **registered at** server/controllers/personnel/profile.js:38; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.prn, body.target_school_ids (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /share
  S->>DB: 1. DDL
  DB-->>S: ok
  loop for each item
  S->>DB: 2. INSERT clustered_personnel
  DB-->>S: ok
  end
  S-->>C: 200
```

Steps:
1. Client sends `POST /share`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. DDL — server/controllers/personnel/profile.js:55 [direct, high]
4. INSERT clustered_personnel (4 columns, ON CONFLICT update) **inside a loop** — server/controllers/personnel/profile.js:68 [direct, high]
5. Response 200 — server/controllers/personnel/profile.js:76.

**Queries per request:** 2 data queries (0 reads, 1 writes) + 0 transaction-control statements = **2 round trips**; **1 of these run inside loops (multiplied by item count)**.

### POST /shifts

- **Handler:** server/controllers/schools/profile.js:309 (inline); **registered at** server/controllers/schools/profile.js:309; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.shifts (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: POST /shifts
  S->>DB: 1. INSERT schools
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `POST /shifts`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. INSERT schools (7 columns, ON CONFLICT update) — server/controllers/schools/profile.js:321 [direct, high]
4. Response 200 — server/controllers/schools/profile.js:337.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

### PUT /subjects

- **Handler:** server/controllers/schools/profile.js:344 (inline); **registered at** server/controllers/schools/profile.js:344; **confidence:** high
- **Middleware:** express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware (auth: checked inside handler; rate limit: not seen; validation: not seen)
- **Request fields read in handler:** body.subjectsConfig (whole body also used)
- **Read by helper functions:** body.payload, body.school, body.schoolHead, body.schoolID, body.schoolId, body.school_id, headers.Authorization, headers.authorization, headers.x-school-id, params.schoolID, params.schoolId, params.school_id, query.schoolID, query.schoolId, query.school_id

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server handler
  participant DB as PostgreSQL
  C->>S: PUT /subjects
  S->>DB: 1. INSERT schools
  DB-->>S: ok
  S-->>C: 200
```

Steps:
1. Client sends `PUT /subjects`.
2. Middleware runs: express.json, helmet, cors, express.urlencoded, devLogger, db.dbMiddleware.
3. INSERT schools (7 columns, ON CONFLICT update) — server/controllers/schools/profile.js:354 [direct, high]
4. Response 200 — server/controllers/schools/profile.js:370.

**Queries per request:** 1 data queries (0 reads, 1 writes) + 0 transaction-control statements = **1 round trips**.

## 4. Entity-relationship diagram

Tables written by the routes above. Tables marked _not in schema file_ exist only as raw SQL targets and have no column metadata.

```mermaid
erDiagram
  class_sections {
    text not_in_schema_file "no column metadata"
  }
  clustered_personnel {
    serial id PK "not null"
    varchar prn UK "not null, len 255"
    varchar source_school_id UK "not null, len 255"
    varchar target_school_id UK "not null, len 255"
    timestamp shared_at "nullable"
  }
  esf7_admin_task {
    varchar id PK "not null, len 50"
    varchar personnel_id "not null, len 50"
    varchar school_id "not null, len 50"
    varchar school_year "not null, len 20"
    text task_name "not null"
    jsonb dates "nullable"
    integer duration_minutes "not null"
    jsonb extras "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_als_sections {
    text not_in_schema_file "no column metadata"
  }
  esf7_aral_sections {
    varchar id PK "not null, len 50"
    text school_id "not null"
    text school_year "not null"
    text basis_type "not null"
    text grade_level "not null"
    text assessment_tool "nullable"
    text profile_level "nullable"
    text section_name "not null"
    varchar tutor_id "nullable, len 50"
    integer male_learners "nullable"
    integer female_learners "nullable"
    integer total_learners "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
    text term "nullable"
  }
  esf7_class_sections {
    text not_in_schema_file "no column metadata"
  }
  esf7_clustered_ghost_sync {
    text room_key "not null"
    text school_id "not null"
    text school_name "nullable"
    jsonb slots "not null"
    timestamp updated_at "nullable"
  }
  esf7_database {
    text not_in_schema_file "no column metadata"
  }
  esf7_database_dummy {
    text not_in_schema_file "no column metadata"
  }
  esf7_deleted_personnel {
    text not_in_schema_file "no column metadata"
  }
  esf7_link {
    text school_id "not null"
    text semester "not null"
    text iern "nullable"
    text link "not null"
    text file_path "nullable"
    integer row_count "nullable"
    jsonb preview_data "nullable"
    jsonb summary "nullable"
    text status "nullable"
    text audit_remarks "nullable"
    timestamp uploaded_at "nullable"
    timestamp updated_at "nullable"
  }
  esf7_overload_late_undertime {
    text not_in_schema_file "no column metadata"
  }
  esf7_overload_no_work {
    text not_in_schema_file "no column metadata"
  }
  esf7_passcode_lockout {
    varchar lockout_key PK "not null, len 128"
    varchar school_id "not null, len 64"
    integer failed_attempts "nullable"
    bigint lockout_until "nullable"
    timestamp last_attempt_at "nullable"
  }
  esf7_personnel_allowance {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_allowances {
    varchar id PK "not null, len 50"
    varchar personnel_id UK "not null, len 50"
    text school_id "not null"
    text school_year UK "not null"
    boolean has_pera "not null"
    numeric pera_amount "nullable"
    boolean has_uniform "not null"
    numeric uniform_amount "nullable"
    boolean has_supplies "not null"
    numeric supplies_amount "nullable"
    boolean has_medical "not null"
    numeric medical_amount "nullable"
    boolean has_hardship "not null"
    numeric hardship_amount "nullable"
    jsonb extras "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_personnel_designation {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_designations {
    varchar id PK "not null, len 50"
    varchar personnel_id "not null, len 50"
    varchar school_id "nullable, len 50"
    text designation_name "not null"
    varchar key_stage "nullable, len 50"
    text grade_level "nullable"
    text subject_area "nullable"
    text track "nullable"
    boolean is_sds_approved "not null"
    boolean sds_confirmed "not null"
    text serialized_key "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_personnel_educ {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_education {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_employment {
    varchar id PK "not null, len 50"
    varchar personnel_id UK "not null, len 50"
    text position_category "not null"
    text position "not null"
    integer step_increment "nullable"
    text fund_source "not null"
    text nature_of_appointment "not null"
    text hiring_arrangement "not null"
    text deployment_status "nullable"
    jsonb assigned_schools "nullable"
    jsonb grade_levels_taught "nullable"
    date first_service_date "nullable"
    date last_promotion_date "nullable"
    date new_station_date "nullable"
    date last_lateral_movement_date "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_personnel_extra_tasks {
    varchar id PK "not null, len 50"
    varchar personnel_id "nullable, len 50"
    varchar school_id "not null, len 50"
    varchar school_year "not null, len 20"
    varchar task_category "not null, len 50"
    varchar task_name "not null, len 255"
    jsonb calendar_dates "nullable"
    varchar start_time "nullable, len 10"
    varchar end_time "nullable, len 10"
    jsonb raw_payload "nullable"
    timestamp created_at "nullable"
    timestamp updated_at "nullable"
  }
  esf7_personnel_id_mapping {
    varchar legacy_id PK "not null, len 128"
    varchar new_id "not null, len 64"
    varchar status "not null, len 32"
    timestamp created_at "not null"
  }
  esf7_personnel_l_d {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_ld {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_ld_trainings {
    varchar id PK "not null, len 50"
    varchar personnel_id "not null, len 50"
    text training_type "not null"
    text title "not null"
    text conductor "nullable"
    date start_date "nullable"
    date end_date "nullable"
    integer days "nullable"
    numeric total_hours "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_personnel_learning_area {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_learning_areas {
    varchar id PK "not null, len 50"
    varchar personnel_id UK "not null, len 50"
    jsonb matrix_data "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_personnel_node_status {
    text not_in_schema_file "no column metadata"
  }
  esf7_personnel_profile {
    varchar id PK "not null, len 50"
    text prn UK "not null"
    text school_id "not null"
    text school_year "not null"
    text type "not null"
    text salutation "not null"
    text first_name "not null"
    text middle_name "nullable"
    text last_name "not null"
    text name_extension "nullable"
    text tin "nullable"
    boolean no_tin "not null"
    text sex_at_birth "nullable"
    text civil_status "nullable"
    boolean solo_parent "not null"
    text religion "nullable"
    text ethnic_group "nullable"
    date birthdate "nullable"
    integer age "nullable"
    text philsys_no "nullable"
    text employee_no "nullable"
    text deped_email "nullable"
    boolean is_school_head "not null"
    boolean is_main_sh "not null"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
    text term "nullable"
    boolean no_philsys "not null"
    varchar status "not null, len 32"
    varchar legacy_id "nullable, len 128"
  }
  esf7_personnel_submission {
    varchar id PK "not null, len 128"
    varchar school_id "not null, len 64"
    varchar personnel_id "not null, len 64"
    varchar personnel_name "nullable, len 255"
    varchar room_name "nullable, len 255"
    varchar status "nullable, len 32"
    jsonb payload_json "not null"
    timestamp created_at "nullable"
    bigint created_timestamp "nullable"
  }
  esf7_personnel_submission_archive {
    varchar id PK "not null, len 128"
    varchar school_id "not null, len 64"
    varchar personnel_id "not null, len 64"
    varchar personnel_name "nullable, len 255"
    varchar room_name "nullable, len 255"
    varchar status "nullable, len 32"
    jsonb payload_json "not null"
    timestamp created_at "nullable"
    bigint created_timestamp "nullable"
  }
  esf7_personnel_trainings {
    text not_in_schema_file "no column metadata"
  }
  esf7_perssonel_educ {
    varchar id PK "not null, len 50"
    varchar personnel_id UK "not null, len 50"
    text college_degree "nullable"
    text major "nullable"
    text minor "nullable"
    text post_graduate_degree "nullable"
    text post_graduate_discipline "nullable"
    jsonb eligibility "nullable"
    text prc_specialization "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
    text highest_educational_attainment "not null"
    text shs_track "nullable"
    text vocational_course "nullable"
    text vocational_level "nullable"
  }
  esf7_profiling_snapshots {
    varchar id PK "not null, len 128"
    varchar school_id "not null, len 64"
    varchar snapshot_name "nullable, len 255"
    integer personnel_count "nullable"
    integer verified_count "nullable"
    jsonb snapshot_json "not null"
    timestamp created_at "nullable"
  }
  esf7_regular_sections {
    varchar id PK "not null, len 50"
    text school_id UK "not null"
    text school_year UK "not null"
    text grade_level UK "not null"
    text section_name UK "not null"
    varchar adviser_id "nullable, len 50"
    text section_type "not null"
    integer male_learners "nullable"
    integer female_learners "nullable"
    integer number_of_learners "nullable"
    jsonb extras "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
    text term "nullable"
    text size_status "nullable"
  }
  esf7_related_task {
    varchar id PK "not null, len 50"
    varchar personnel_id "not null, len 50"
    varchar school_id "not null, len 50"
    varchar school_year "not null, len 20"
    text task_name "not null"
    varchar frequency "not null, len 20"
    integer duration_minutes "not null"
    numeric term1_hours "nullable"
    boolean is_designation_synced "nullable"
    jsonb extras "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_remedial_enrichment_sections {
    varchar id PK "not null, len 50"
    text school_id "not null"
    text school_year "not null"
    text intervention_type "not null"
    text grade_level "not null"
    text section_name "not null"
    varchar assigned_teacher_id "nullable, len 50"
    integer male_learners "nullable"
    integer female_learners "nullable"
    integer total_learners "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
    text term "nullable"
  }
  esf7_requests {
    varchar id PK "not null, len 50"
    text requester_school_id "not null"
    text target_school_id "not null"
    text school_year "not null"
    text request_type "not null"
    varchar personnel_id "nullable, len 50"
    text personnel_name "nullable"
    text status "not null"
    text remarks "nullable"
    jsonb extras "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_room_submissions_staging {
    varchar id PK "not null, len 128"
    varchar school_id "not null, len 64"
    varchar personnel_id "not null, len 64"
    varchar personnel_name "nullable, len 255"
    varchar room "nullable, len 255"
    jsonb profile_data "not null"
    timestamp submitted_at "nullable"
    bigint submitted_timestamp "nullable"
  }
  esf7_school_head_sdo {
    text not_in_schema_file "no column metadata"
  }
  esf7_school_node_status {
    text not_in_schema_file "no column metadata"
  }
  esf7_school_profile {
    varchar id PK "not null, len 50"
    text school_id UK "not null"
    text school_year UK "not null"
    boolean has_elem_special_programs "not null"
    jsonb elem_special_programs "nullable"
    boolean has_jhs_special_programs "not null"
    jsonb jhs_special_programs "nullable"
    text shs_curriculum_model "nullable"
    boolean has_elem_inclusive "not null"
    jsonb elem_inclusive_programs "nullable"
    boolean has_jhs_inclusive "not null"
    jsonb jhs_inclusive_programs "nullable"
    boolean has_shs_inclusive "not null"
    jsonb shs_inclusive_programs "nullable"
    boolean has_als "not null"
    boolean has_sned "not null"
    boolean has_iped "not null"
    boolean has_madrasah "not null"
    jsonb inclusive_programs "nullable"
    jsonb extras "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_school_subjects {
    varchar id PK "not null, len 50"
    text school_id UK "not null"
    text school_year UK "not null"
    text subject_name UK "not null"
    text key_stage UK "not null"
    text grade_level "nullable"
    text shs_category "nullable"
    boolean is_custom "not null"
    boolean is_active "not null"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_shs_workload_rows {
    varchar id PK "not null, len 50"
    varchar personnel_id "not null, len 50"
    text school_id "not null"
    text school_year "not null"
    text term "not null"
    text semester "nullable"
    text grade_level "not null"
    text track_strand "nullable"
    text shs_subject_category "nullable"
    varchar section_id "nullable, len 50"
    text section_name "nullable"
    text subject "not null"
    varchar subject_id "nullable, len 50"
    text remediation_subject "nullable"
    time start_time "nullable"
    time end_time "nullable"
    jsonb days "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_sned_sections {
    text not_in_schema_file "no column metadata"
  }
  esf7_submission_queue {
    serial id PK "not null"
    text school_id "not null"
    text school_year "not null"
    jsonb payload "not null"
    text signature "nullable"
    text certified_by "nullable"
    text status "not null"
    text error_message "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_validation {
    serial id PK "not null"
    varchar school_id UK "not null, len 50"
    varchar school_year "nullable, len 50"
    text po3_validation "nullable"
    text hrmo_validation "nullable"
    text special_program_validation "nullable"
    text sections_density_validation "nullable"
    text staffing_composition_validation "nullable"
    jsonb validation_details "nullable"
    jsonb validated_by "nullable"
    timestamp created_at "nullable"
    timestamp updated_at "nullable"
  }
  esf7_work_immersion {
    varchar id PK "not null, len 50"
    varchar personnel_id UK "not null, len 50"
    text school_id "not null"
    text school_year UK "not null"
    date visit_date UK "not null"
    time start_time "not null"
    time end_time "not null"
    integer duration_minutes "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  esf7_workload_row {
    text not_in_schema_file "no column metadata"
  }
  esf7_workload_rows {
    varchar id PK "not null, len 50"
    varchar personnel_id "not null, len 50"
    text school_id "not null"
    text school_year "not null"
    text grade_level "nullable"
    varchar section_id "nullable, len 50"
    text section_name "nullable"
    text subject "not null"
    varchar subject_id "nullable, len 50"
    text remediation_subject "nullable"
    time start_time "nullable"
    time end_time "nullable"
    jsonb days "nullable"
    jsonb extras "not null"
    timestamp created_at "not null"
    timestamp updated_at "not null"
    text term "nullable"
  }
  esf7_workload_transfer {
    varchar id PK "not null, len 50"
    text school_id "not null"
    text school_year "not null"
    varchar absent_personnel_id "not null, len 50"
    varchar relieving_personnel_id "not null, len 50"
    varchar absence_id "nullable, len 50"
    varchar workload_id "not null, len 50"
    text workload_type "not null"
    text subject "not null"
    date start_date "not null"
    date end_date "not null"
    numeric relieving_hours "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  overload_absences {
    varchar id PK "not null, len 50"
    varchar personnel_id "not null, len 50"
    text school_id "not null"
    text school_year "not null"
    date start_date "not null"
    date end_date "not null"
    text leave_type "not null"
    integer total_days "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  overload_late_undertime {
    text not_in_schema_file "no column metadata"
  }
  overload_no_work {
    varchar id PK "not null, len 50"
    text region UK "not null"
    text division UK "not null"
    text school_id UK "not null"
    text school_year UK "not null"
    date no_work_date UK "not null"
    text event_type "not null"
    text title "not null"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
  }
  overload_pay_and_reason {
    varchar id PK "not null, len 50"
    varchar personnel_id UK "not null, len 50"
    text school_id "not null"
    text school_year UK "not null"
    text term UK "not null"
    text month UK "nullable"
    numeric overload_hours "nullable"
    numeric overload_pay "nullable"
    numeric net_term_pay "nullable"
    jsonb reasons "nullable"
    jsonb raw_payload "nullable"
    timestamp created_at "not null"
    timestamp updated_at "not null"
    boolean is_confirmed "nullable"
    numeric actual_amount "nullable"
    timestamp confirmed_at "nullable"
  }
  school_calendar_terms {
    text not_in_schema_file "no column metadata"
  }
  school_drafts {
    text school_id "not null"
    text school_year "not null"
    jsonb payload "not null"
    timestamp updated_at "not null"
  }
  schools {
    text not_in_schema_file "no column metadata"
  }
  workload_transfers {
    text not_in_schema_file "no column metadata"
  }
```

_Not in schema file:_ class_sections, esf7_als_sections, esf7_class_sections, esf7_database, esf7_database_dummy, esf7_deleted_personnel, esf7_overload_late_undertime, esf7_overload_no_work, esf7_personnel_allowance, esf7_personnel_designation, esf7_personnel_educ, esf7_personnel_education, esf7_personnel_l&d, esf7_personnel_ld, esf7_personnel_learning_area, esf7_personnel_node_status, esf7_personnel_trainings, esf7_school_head_sdo, esf7_school_node_status, esf7_sned_sections, esf7_workload_row, overload_late_undertime, school_calendar_terms, schools, workload_transfers

## 5. Field-to-column table

### 5.1 Mapped fields

| Client field | Request location | Validation | Transform | Table.column | DB type | Nullable/default | Index/unique | Possible personal data | Confidence | Routes |
|---|---|---|---|---|---|---|---|---|---|---|
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | class_sections.* | (table not in schema file) |  |  |  | low | DELETE /api/sections/clear-all |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | clustered_personnel.id | serial | NOT NULL; default serial | PK |  | medium |  |
| prn | body | none found |  | clustered_personnel.prn | varchar(255) | NOT NULL | unique clustered_personnel_prn_source_school_id_target_school_id_key (prn+source_school_id+target_school_id) | government-id | high | POST /share |
| (server-derived) | — | n/a | expression | clustered_personnel.shared_at | timestamp | nullable; default sql`CURRENT_TIMESTAMP`, |  |  | high | POST /share |
| (server-derived) | — | n/a |  | clustered_personnel.source_school_id | varchar(255) | NOT NULL | unique clustered_personnel_prn_source_school_id_target_school_id_key (prn+source_school_id+target_school_id) |  | high | POST /share |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | clustered_personnel.target_school_id | varchar(255) | NOT NULL | unique clustered_personnel_prn_source_school_id_target_school_id_key (prn+source_school_id+target_school_id) |  | low | POST /share |
| (server-derived) | — | n/a | expression | esf7_admin_task.created_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify+Array.isArray | esf7_admin_task.dates | jsonb | nullable; default [] |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_admin_task.days | ? |  |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.duration_minutes | integer | NOT NULL; default 60 |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.end_date | ? |  |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows | body | none found |  | esf7_admin_task.end_time | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_admin_task.end_time | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnelId _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnel_id _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolId _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolYear _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_year _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| term _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(hardcoded fallback)_ | body | none found | JSON.stringify+adminTaskPayload.buildExtras+targetPersonId.split | esf7_admin_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.id | varchar(50) | NOT NULL | PK |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.is_designation_synced | ? |  |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnelId | body | none found |  | esf7_admin_task.personnel_id | varchar(50) | NOT NULL | index idx_esf7_admin_task_personnel; foreignKey cascade | employment | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnel_id | body | none found |  | esf7_admin_task.personnel_id | varchar(50) | NOT NULL | index idx_esf7_admin_task_personnel; foreignKey cascade | employment | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_admin_task.school_id | varchar(50) | NOT NULL |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_admin_task.school_id | varchar(50) | NOT NULL |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_admin_task.school_year | varchar(20) | NOT NULL; default '2026-2027' |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_admin_task.school_year | varchar(20) | NOT NULL; default '2026-2027' |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.start_date | ? |  |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows | body | none found |  | esf7_admin_task.start_time | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_admin_task.start_time | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (literal/default) | — | n/a |  | esf7_admin_task.status | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.task_category | ? |  |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.task_name | text | NOT NULL |  | identity | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_admin_task.term_total_hours | ? |  |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| term _(hardcoded fallback)_ | body | none found |  | esf7_admin_task.term | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows _(hardcoded fallback)_ | body | none found |  | esf7_admin_task.term | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(hardcoded fallback)_ | body | none found |  | esf7_admin_task.term | ? |  |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (server-derived) | — | n/a | expression | esf7_admin_task.updated_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (literal/default) | — | n/a |  | esf7_als_sections.adviser_id | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_als_sections.adviser_id | (table not in schema file) |  |  |  | low | POST /api/sections/als |
| clcName | body | none found |  | esf7_als_sections.clc_name | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| clc_name | body | none found |  | esf7_als_sections.clc_name | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| deliveryMode | body | none found |  | esf7_als_sections.delivery_mode | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| delivery_mode | body | none found |  | esf7_als_sections.delivery_mode | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| femaleLearners | body | none found |  | esf7_als_sections.female_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| female_learners | body | none found |  | esf7_als_sections.female_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| gradeLevel _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.grade_level | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| grade_level _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.grade_level | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| id | body | none found |  | esf7_als_sections.id | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| maleLearners | body | none found |  | esf7_als_sections.male_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| male_learners | body | none found |  | esf7_als_sections.male_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| femaleLearners | body | none found |  | esf7_als_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| female_learners | body | none found |  | esf7_als_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| maleLearners | body | none found |  | esf7_als_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| male_learners | body | none found |  | esf7_als_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| numberOfLearners | body | none found |  | esf7_als_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| number_of_learners | body | none found |  | esf7_als_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.school_id | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.school_id | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.school_year | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.school_year | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| id | body | none found |  | esf7_als_sections.section_name | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| sectionName | body | none found |  | esf7_als_sections.section_name | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| section_name | body | none found |  | esf7_als_sections.section_name | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| sectionType _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.section_type | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| section_type _(hardcoded fallback)_ | body | none found |  | esf7_als_sections.section_type | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| femaleLearners | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| female_learners | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| maleLearners | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| male_learners | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| numberOfLearners | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| number_of_learners | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| sizeStatus | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| size_status | body | none found |  | esf7_als_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/als |
| assessmentTool | body | none found |  | esf7_aral_sections.assessment_tool | text | nullable |  |  | high | POST /api/sections/aral |
| assessment_tool | body | none found |  | esf7_aral_sections.assessment_tool | text | nullable |  |  | high | POST /api/sections/aral |
| basisType _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.basis_type | text | NOT NULL; default 'grade' |  |  | high | POST /api/sections/aral |
| basis_type _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.basis_type | text | NOT NULL; default 'grade' |  |  | high | POST /api/sections/aral |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_aral_sections.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| femaleLearners | body | none found |  | esf7_aral_sections.female_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| female_learners | body | none found |  | esf7_aral_sections.female_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| gradeLevel _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.grade_level | text | NOT NULL |  |  | high | POST /api/sections/aral |
| grade_level _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.grade_level | text | NOT NULL |  |  | high | POST /api/sections/aral |
| id | body | none found |  | esf7_aral_sections.id | varchar(50) | NOT NULL | PK |  | high | POST /api/sections/aral |
| maleLearners | body | none found |  | esf7_aral_sections.male_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| male_learners | body | none found |  | esf7_aral_sections.male_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| profileLevel | body | none found |  | esf7_aral_sections.profile_level | text | nullable |  |  | high | POST /api/sections/aral |
| profile_level | body | none found |  | esf7_aral_sections.profile_level | text | nullable |  |  | high | POST /api/sections/aral |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_aral_sections.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.school_id | text | NOT NULL | index idx_aral_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/aral |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.school_id | text | NOT NULL | index idx_aral_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/aral |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.school_year | text | NOT NULL; default '2026-2027' | index idx_aral_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/aral |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.school_year | text | NOT NULL; default '2026-2027' | index idx_aral_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/aral |
| id | body | none found |  | esf7_aral_sections.section_name | text | NOT NULL |  | identity | high | POST /api/sections/aral |
| sectionName | body | none found |  | esf7_aral_sections.section_name | text | NOT NULL |  | identity | high | POST /api/sections/aral |
| section_name | body | none found |  | esf7_aral_sections.section_name | text | NOT NULL |  | identity | high | POST /api/sections/aral |
| sectionType _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.section_type | ? |  |  |  | high | POST /api/sections/aral |
| section_type _(hardcoded fallback)_ | body | none found |  | esf7_aral_sections.section_type | ? |  |  |  | high | POST /api/sections/aral |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_aral_sections.term | text | nullable; default '1st' |  |  | medium |  |
| femaleLearners | body | none found |  | esf7_aral_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| female_learners | body | none found |  | esf7_aral_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| maleLearners | body | none found |  | esf7_aral_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| male_learners | body | none found |  | esf7_aral_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| totalLearners | body | none found |  | esf7_aral_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| total_learners | body | none found |  | esf7_aral_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/aral |
| (literal/default) | — | n/a |  | esf7_aral_sections.tutor_id | varchar(50) | nullable | index idx_aral_sections_tutor; foreignKey set null |  | high | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_aral_sections.tutor_id | varchar(50) | nullable | index idx_aral_sections_tutor; foreignKey set null |  | low | POST /api/sections/aral |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_aral_sections.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_class_sections.* | (table not in schema file) |  |  |  | low | DELETE /api/sections/clear-all |
| prn | params | none found |  | esf7_clustered_ghost_sync.room_key | text | NOT NULL | primaryKey (room_key+school_id); index idx_clustered_ghost_room |  | high | POST /api/requests/clustered/:prn/sync |
| authorSchoolId | body | none found |  | esf7_clustered_ghost_sync.school_id | text | NOT NULL | primaryKey (room_key+school_id) |  | high | POST /api/requests/clustered/:prn/sync |
| authorSchoolName _(hardcoded fallback)_ | body | none found | expression | esf7_clustered_ghost_sync.school_name | text | nullable |  | identity | high | POST /api/requests/clustered/:prn/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_clustered_ghost_sync.slots | jsonb | NOT NULL; default [] |  |  | low | POST /api/requests/clustered/:prn/sync |
| (server-derived) | — | n/a | expression | esf7_clustered_ghost_sync.updated_at | timestamp | nullable; default now() |  |  | high | POST /api/requests/clustered/:prn/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_database.${…} | (table not in schema file) |  |  |  | low | POST /api/esf7-upload/import-converted |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_database_dummy.${…} | (table not in schema file) |  |  |  | low | POST /api/esf7-upload/import-converted |
| (server-derived) | — | n/a | expression | esf7_deleted_personnel.deleted_at | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| (literal/default) | — | n/a |  | esf7_deleted_personnel.deleted_by | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| employeeNo | body | none found |  | esf7_deleted_personnel.employee_no | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| firstName | body | none found | String+toUpperCase+isNonGenericVal | esf7_deleted_personnel.first_name | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_deleted_personnel.full_name_clean | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_deleted_personnel.id | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| lastName | body | none found | String+toUpperCase+isNonGenericVal | esf7_deleted_personnel.last_name | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| id | params | none found |  | esf7_deleted_personnel.personnel_id | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| id | params | none found |  | esf7_deleted_personnel.prn | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| prn | body | none found |  | esf7_deleted_personnel.prn | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| schoolId _(server value with client fallback)_ | body | none found |  | esf7_deleted_personnel.school_id | (table not in schema file) |  |  |  | medium | DELETE /:id; DELETE /:id |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_deleted_personnel.school_id | (table not in schema file) |  |  |  | medium | DELETE /:id; DELETE /:id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_link.audit_remarks | text | nullable |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_link.file_path | text | nullable |  |  | low | POST /api/esf7-upload |
| schoolId | body | none found |  | esf7_link.iern | text | nullable |  |  | high | POST /api/esf7-upload |
| school_id | body | none found |  | esf7_link.iern | text | nullable |  |  | high | POST /api/esf7-upload |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_link.link | text | NOT NULL |  |  | low | POST /api/esf7-upload |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_link.preview_data | jsonb | nullable |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_link.row_count | integer | nullable |  |  | medium |  |
| schoolId | body | none found |  | esf7_link.school_id | text | NOT NULL | primaryKey (school_id+semester) |  | high | POST /api/esf7-upload |
| school_id | body | none found |  | esf7_link.school_id | text | NOT NULL | primaryKey (school_id+semester) |  | high | POST /api/esf7-upload |
| (literal/default) | — | n/a |  | esf7_link.semester | text | NOT NULL; default 'REGULAR' | primaryKey (school_id+semester) |  | high | POST /api/esf7-upload |
| (literal/default) | — | n/a |  | esf7_link.status | text | nullable; default 'PENDING_SDO' |  |  | high | POST /api/esf7-upload |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_link.summary | jsonb | nullable |  |  | medium |  |
| (server-derived) | — | n/a |  | esf7_link.updated_at | timestamp | nullable; default sql`CURRENT_TIMESTAMP' |  |  | high | POST /api/esf7-upload |
| (server-derived) | — | n/a |  | esf7_link.uploaded_at | timestamp | nullable; default sql`CURRENT_TIMESTAMP' |  |  | high | POST /api/esf7-upload |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_overload_late_undertime.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_overload_no_work.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_passcode_lockout.failed_attempts | integer | nullable; default 0 |  |  | low | POST /api/room-profiling/record-attempt |
| (server-derived) | — | n/a | expression | esf7_passcode_lockout.last_attempt_at | timestamp | nullable; default now() |  |  | high | POST /api/room-profiling/record-attempt |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_passcode_lockout.lockout_key | varchar(128) | NOT NULL | PK |  | low | POST /api/room-profiling/record-attempt |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_passcode_lockout.lockout_until | bigint | nullable; default 0 |  |  | low | POST /api/room-profiling/record-attempt |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_passcode_lockout.school_id | varchar(64) | NOT NULL | index idx_passcode_lockout_school |  | high | POST /api/room-profiling/record-attempt |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_passcode_lockout.school_id | varchar(64) | NOT NULL | index idx_passcode_lockout_school |  | high | POST /api/room-profiling/record-attempt |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_allowance.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| isGranted | body | none found |  | esf7_personnel_allowances.${…} | ? |  |  |  | low | POST /api/allowances/toggle |
| isGranted | body | none found | Boolean | esf7_personnel_allowances.${…} | ? |  |  |  | low | POST /api/allowances/toggle |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_allowances.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.extras | jsonb | NOT NULL; default {} |  |  | high | GET /api/allowances |
| isGranted _(server value with client fallback)_ | body | none found | JSON.stringify+payload.buildExtras+generateAllowanceId | esf7_personnel_allowances.extras | jsonb | NOT NULL; default {} |  |  | low | POST /api/allowances/toggle |
| personnelId _(server value with client fallback)_ | body | none found | JSON.stringify+payload.buildExtras+generateAllowanceId | esf7_personnel_allowances.extras | jsonb | NOT NULL; default {} |  |  | low | POST /api/allowances/toggle |
| schoolId _(server value with client fallback)_ | body | none found | JSON.stringify+payload.buildExtras+generateAllowanceId | esf7_personnel_allowances.extras | jsonb | NOT NULL; default {} |  |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| schoolYear _(server value with client fallback)_ | body | none found | JSON.stringify+payload.buildExtras+generateAllowanceId | esf7_personnel_allowances.extras | jsonb | NOT NULL; default {} |  |  | low | POST /api/allowances/toggle |
| school_id _(server value with client fallback)_ | body | none found | JSON.stringify+payload.buildExtras+generateAllowanceId | esf7_personnel_allowances.extras | jsonb | NOT NULL; default {} |  |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| x-school-id _(server value with client fallback)_ | headers | none found | JSON.stringify+payload.buildExtras+generateAllowanceId | esf7_personnel_allowances.extras | jsonb | NOT NULL; default {} |  |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.hardship_amount | numeric | nullable; default '0.00' |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.hardship_amount | numeric | nullable; default '0.00' |  |  | low | POST /api/allowances/bulk |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.has_hardship | boolean | NOT NULL; default false |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.has_hardship | boolean | NOT NULL; default false |  |  | low | POST /api/allowances/bulk |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.has_medical | boolean | NOT NULL; default false |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.has_medical | boolean | NOT NULL; default false |  |  | low | POST /api/allowances/bulk |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.has_pera | boolean | NOT NULL; default false |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.has_pera | boolean | NOT NULL; default false |  |  | low | POST /api/allowances/bulk |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.has_supplies | boolean | NOT NULL; default false |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.has_supplies | boolean | NOT NULL; default false |  |  | low | POST /api/allowances/bulk |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.has_uniform | boolean | NOT NULL; default false |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.has_uniform | boolean | NOT NULL; default false |  |  | low | POST /api/allowances/bulk |
| (server-derived) | — | n/a |  | esf7_personnel_allowances.id | varchar(50) | NOT NULL | PK |  | high | GET /api/allowances |
| personnelId _(server value with client fallback)_ | body | none found |  | esf7_personnel_allowances.id | varchar(50) | NOT NULL | PK |  | low | POST /api/allowances/toggle |
| schoolId _(server value with client fallback)_ | body | none found |  | esf7_personnel_allowances.id | varchar(50) | NOT NULL | PK |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_personnel_allowances.id | varchar(50) | NOT NULL | PK |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| x-school-id _(server value with client fallback)_ | headers | none found |  | esf7_personnel_allowances.id | varchar(50) | NOT NULL | PK |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.medical_amount | numeric | nullable; default '7000.00' |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.medical_amount | numeric | nullable; default '7000.00' |  |  | low | POST /api/allowances/bulk |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.pera_amount | numeric | nullable; default '2000.00", |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.pera_amount | numeric | nullable; default '2000.00", |  |  | low | POST /api/allowances/bulk |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_allowances_personnel; unique uq_personnel_sy_allowances (personnel_id+school_year) | employment | low | GET /api/allowances; POST /api/allowances/bulk |
| personnelId | body | none found |  | esf7_personnel_allowances.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_allowances_personnel; unique uq_personnel_sy_allowances (personnel_id+school_year) | employment | low | POST /api/allowances/toggle |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.school_id | text | NOT NULL |  |  | low | GET /api/allowances |
| personnelId _(server value with client fallback)_ | body | none found |  | esf7_personnel_allowances.school_id | text | NOT NULL |  |  | low | POST /api/allowances/toggle |
| schoolId _(server value with client fallback)_ | body | none found |  | esf7_personnel_allowances.school_id | text | NOT NULL |  |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_personnel_allowances.school_id | text | NOT NULL |  |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| x-school-id _(server value with client fallback)_ | headers | none found |  | esf7_personnel_allowances.school_id | text | NOT NULL |  |  | low | POST /api/allowances/bulk; POST /api/allowances/toggle |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.school_year | text | NOT NULL | unique uq_personnel_sy_allowances (personnel_id+school_year) |  | low | POST /api/allowances/bulk |
| schoolYear _(hardcoded fallback)_ | query | none found |  | esf7_personnel_allowances.school_year | text | NOT NULL | unique uq_personnel_sy_allowances (personnel_id+school_year) |  | low | GET /api/allowances; POST /api/allowances/toggle |
| school_year _(hardcoded fallback)_ | query | none found |  | esf7_personnel_allowances.school_year | text | NOT NULL | unique uq_personnel_sy_allowances (personnel_id+school_year) |  | high | GET /api/allowances; POST /api/allowances/toggle |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.supplies_amount | numeric | nullable; default '10000.00' |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.supplies_amount | numeric | nullable; default '10000.00' |  |  | low | POST /api/allowances/bulk |
| (literal/default) | — | n/a |  | esf7_personnel_allowances.uniform_amount | numeric | nullable; default '7000.00' |  |  | high | GET /api/allowances |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_allowances.uniform_amount | numeric | nullable; default '7000.00' |  |  | low | POST /api/allowances/bulk |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_allowances.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_designation.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_designations.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_designations.designation_name | text | NOT NULL |  | identity | low | POST /; PUT /:id |
| designation _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.designation_name | text | NOT NULL |  | identity | high | POST /api/designations |
| designationName _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.designation_name | text | NOT NULL |  | identity | high | POST /api/designations |
| designation_name _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.designation_name | text | NOT NULL |  | identity | high | POST /api/designations |
| serializedKey _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.designation_name | text | NOT NULL |  | identity | high | POST /api/designations |
| serialized_key _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.designation_name | text | NOT NULL |  | identity | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_designations.grade_level | text | nullable |  |  | low | POST /; PUT /:id |
| gradeLevel | body | none found | expression | esf7_personnel_designations.grade_level | text | nullable |  |  | high | POST /api/designations |
| grade_level | body | none found | expression | esf7_personnel_designations.grade_level | text | nullable |  |  | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_designations.id | varchar(50) | NOT NULL | PK |  | low | POST /; PUT /:id |
| id _(server value with client fallback)_ | body | none found |  | esf7_personnel_designations.id | varchar(50) | NOT NULL | PK |  | medium | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | low | POST /; PUT /:id |
| designation _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| designationName _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| designation_name _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| isSdsApproved _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| is_sds_approved _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| serializedKey _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| serialized_key _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.is_sds_approved | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | low | POST /; PUT /:id |
| designation _(hardcoded fallback)_ | body | none found | extractKeyStage | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | high | POST /api/designations |
| designationName _(hardcoded fallback)_ | body | none found | extractKeyStage | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | high | POST /api/designations |
| designation_name _(hardcoded fallback)_ | body | none found | extractKeyStage | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | high | POST /api/designations |
| keyStage _(hardcoded fallback)_ | body | none found | extractKeyStage | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | high | POST /api/designations |
| key_stage _(hardcoded fallback)_ | body | none found | extractKeyStage | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | high | POST /api/designations |
| serializedKey _(hardcoded fallback)_ | body | none found | extractKeyStage | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | high | POST /api/designations |
| serialized_key _(hardcoded fallback)_ | body | none found | extractKeyStage | esf7_personnel_designations.key_stage | varchar(50) | nullable |  | identity | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_designations.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_designations_personnel; foreignKey cascade | employment | low | POST /; PUT /:id |
| personnelId | body | none found |  | esf7_personnel_designations.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_designations_personnel; foreignKey cascade | employment | high | POST /api/designations |
| personnel_id | body | none found |  | esf7_personnel_designations.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_designations_personnel; foreignKey cascade | employment | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | String+replace | esf7_personnel_designations.school_id | varchar(50) | nullable | index idx_esf7_personnel_designations_school |  | low | POST /; PUT /:id |
| personnelId _(server value with client fallback)_ | body | none found | String+replace+db.query | esf7_personnel_designations.school_id | varchar(50) | nullable | index idx_esf7_personnel_designations_school |  | medium | POST /api/designations |
| personnel_id _(server value with client fallback)_ | body | none found | String+replace+db.query | esf7_personnel_designations.school_id | varchar(50) | nullable | index idx_esf7_personnel_designations_school |  | medium | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_designations.sds_confirmed | boolean | NOT NULL; default false |  |  | low | POST /; PUT /:id |
| sdsConfirmed | body | none found |  | esf7_personnel_designations.sds_confirmed | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| sds_confirmed | body | none found |  | esf7_personnel_designations.sds_confirmed | boolean | NOT NULL; default false |  |  | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_designations.serialized_key | text | NOT NULL |  |  | low | POST /; PUT /:id |
| designation _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.serialized_key | text | NOT NULL |  |  | high | POST /api/designations |
| designationName _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.serialized_key | text | NOT NULL |  |  | high | POST /api/designations |
| designation_name _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.serialized_key | text | NOT NULL |  |  | high | POST /api/designations |
| serializedKey _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.serialized_key | text | NOT NULL |  |  | high | POST /api/designations |
| serialized_key _(hardcoded fallback)_ | body | none found |  | esf7_personnel_designations.serialized_key | text | NOT NULL |  |  | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_designations.subject_area | text | nullable |  |  | low | POST /; PUT /:id |
| subjectArea | body | none found | expression | esf7_personnel_designations.subject_area | text | nullable |  |  | high | POST /api/designations |
| subject_area | body | none found | expression | esf7_personnel_designations.subject_area | text | nullable |  |  | high | POST /api/designations |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_designations.track | text | nullable |  |  | low | POST /; PUT /:id |
| track | body | none found | expression | esf7_personnel_designations.track | text | nullable |  |  | high | POST /api/designations |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_designations.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_educ.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_education.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_personnel_employment.assigned_schools | jsonb | nullable; default [] |  |  | low | PUT /:id |
| assignedSchools | body | none found | JSON.stringify | esf7_personnel_employment.assigned_schools | jsonb | nullable; default [] |  |  | high | POST / |
| assignedSchools | body | none found |  | esf7_personnel_employment.assigned_schools | jsonb | nullable; default [] |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| assigned_schools | body | none found | JSON.stringify | esf7_personnel_employment.assigned_schools | jsonb | nullable; default [] |  |  | high | POST / |
| assigned_schools | body | none found |  | esf7_personnel_employment.assigned_schools | jsonb | nullable; default [] |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_employment.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_employment.deployment_status | text | nullable; default 'OWN STATION' |  |  | low | PUT /:id |
| deploymentStatus _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.deployment_status | text | nullable; default 'OWN STATION' |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| deployment_status _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.deployment_status | text | nullable; default 'OWN STATION' |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | coerceDateField | esf7_personnel_employment.first_service_date | date | nullable |  | employment | low | PUT /:id |
| firstServiceDate | body | none found | coerceDateField | esf7_personnel_employment.first_service_date | date | nullable |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| first_service_date | body | none found | coerceDateField | esf7_personnel_employment.first_service_date | date | nullable |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_employment.fund_source | text | NOT NULL |  |  | low | PUT /:id |
| fundSource _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.fund_source | text | NOT NULL |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| fund_source _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.fund_source | text | NOT NULL |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.fund_source | text | NOT NULL |  |  | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.fund_source | text | NOT NULL |  |  | high | POST /bulk |
| position _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.fund_source | text | NOT NULL |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify+sanitizeGradeArray | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | low | PUT /:id |
| assignedGradeLevels | body | none found | JSON.stringify+sanitizeGradeArray | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST / |
| assignedGradeLevels | body | none found |  | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| assigned_grade_levels | body | none found | JSON.stringify+sanitizeGradeArray | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST / |
| assigned_grade_levels | body | none found |  | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| gradeLevelsTaught | body | none found | JSON.stringify+sanitizeGradeArray | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST / |
| gradeLevelsTaught | body | none found |  | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| grade_levels_taught | body | none found | JSON.stringify+sanitizeGradeArray | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST / |
| grade_levels_taught | body | none found |  | esf7_personnel_employment.grade_levels_taught | jsonb | nullable; default [] |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_employment.hiring_arrangement | text | NOT NULL |  |  | low | PUT /:id |
| hiringArrangement _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.hiring_arrangement | text | NOT NULL |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| hiring_arrangement _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.hiring_arrangement | text | NOT NULL |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.hiring_arrangement | text | NOT NULL |  |  | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.hiring_arrangement | text | NOT NULL |  |  | high | POST /bulk |
| position _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.hiring_arrangement | text | NOT NULL |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (server-derived) | — | n/a |  | esf7_personnel_employment.id | varchar(50) | NOT NULL | PK |  | high | POST /; PUT /:id; POST /api/employment/:personnel_id +2 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | coerceDateField | esf7_personnel_employment.last_lateral_movement_date | date | nullable |  |  | low | PUT /:id |
| lastLateralMovementDate | body | none found | coerceDateField | esf7_personnel_employment.last_lateral_movement_date | date | nullable |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| last_lateral_movement_date | body | none found | coerceDateField | esf7_personnel_employment.last_lateral_movement_date | date | nullable |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | coerceDateField | esf7_personnel_employment.last_promotion_date | date | nullable |  |  | low | PUT /:id |
| lastPromotionDate | body | none found | coerceDateField | esf7_personnel_employment.last_promotion_date | date | nullable |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| last_promotion_date | body | none found | coerceDateField | esf7_personnel_employment.last_promotion_date | date | nullable |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_employment.nature_of_appointment | text | NOT NULL |  | employment | low | PUT /:id |
| natureOfAppointment _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.nature_of_appointment | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| nature_of_appointment _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.nature_of_appointment | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.nature_of_appointment | text | NOT NULL |  | employment | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.nature_of_appointment | text | NOT NULL |  | employment | high | POST /bulk |
| position _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.nature_of_appointment | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | coerceDateField | esf7_personnel_employment.new_station_date | date | nullable |  |  | low | PUT /:id |
| newStationDate | body | none found | coerceDateField | esf7_personnel_employment.new_station_date | date | nullable |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| new_station_date | body | none found | coerceDateField | esf7_personnel_employment.new_station_date | date | nullable |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| age _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| allow_email_discrepancy _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| birthdate _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| civil_status _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| deped_email _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| employee_no _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| ethnic_group _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| first_name _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| is_school_head _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| last_name _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| middle_name _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| name_extension _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| no_deped_email _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| no_philsys _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| no_tin _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| personnel | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | high | POST /bulk |
| personnel_id _(server value with client fallback)_ | params | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| philsys_no _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| religion _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| salutation _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| school_year _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| sex_at_birth _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| solo_parent _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| status _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | PUT /:id |
| tin _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| type _(server value with client fallback)_ | body | none found |  | esf7_personnel_employment.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_employment_personnel; foreignKey cascade; unique esf7_personnel_employment_personnel_id_key | employment | medium | POST / |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_employment.position | text | NOT NULL |  | employment | low | PUT /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_employment.position_category | text | NOT NULL |  | employment | low | PUT /:id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position_category | text | NOT NULL |  | employment | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position_category | text | NOT NULL |  | employment | high | POST /bulk |
| position _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position_category | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| positionCategory _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position_category | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| position_category _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position_category | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| type _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position_category | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position | text | NOT NULL |  | employment | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position | text | NOT NULL |  | employment | high | POST /bulk |
| position _(hardcoded fallback)_ | body | none found |  | esf7_personnel_employment.position | text | NOT NULL |  | employment | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_employment.step_increment | integer | nullable; default 1 |  |  | low | PUT /:id |
| personnel | body | none found |  | esf7_personnel_employment.step_increment | integer | nullable; default 1 |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_employment.step_increment | integer | nullable; default 1 |  |  | high | POST /bulk |
| stepIncrement | body | none found |  | esf7_personnel_employment.step_increment | integer | nullable; default 1 |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| step_increment | body | none found |  | esf7_personnel_employment.step_increment | integer | nullable; default 1 |  |  | high | POST /; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| (server-derived) | — | n/a | expression | esf7_personnel_employment.updated_at | timestamp | NOT NULL; default now() |  |  | high | POST /bulk |
| tasks | body | none found |  | esf7_personnel_extra_tasks.calendar_dates | jsonb | nullable; default [] |  |  | high | POST /api/extra-tasks/batch |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_extra_tasks.created_at | timestamp | nullable; default now() |  |  | medium |  |
| tasks _(hardcoded fallback)_ | body | none found |  | esf7_personnel_extra_tasks.end_time | varchar(10) | nullable |  |  | high | POST /api/extra-tasks/batch |
| tasks _(server value with client fallback)_ | body | none found |  | esf7_personnel_extra_tasks.id | varchar(50) | NOT NULL | PK |  | medium | POST /api/extra-tasks/batch |
| personnelId | body | none found |  | esf7_personnel_extra_tasks.personnel_id | varchar(50) | nullable | index idx_extra_tasks_personnel | employment | high | POST /api/extra-tasks/batch |
| personnel_id | body | none found |  | esf7_personnel_extra_tasks.personnel_id | varchar(50) | nullable | index idx_extra_tasks_personnel | employment | high | POST /api/extra-tasks/batch |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_extra_tasks.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_personnel_extra_tasks.school_id | varchar(50) | NOT NULL | index idx_extra_tasks_school_sy (school_id+school_year) |  | medium | POST /api/extra-tasks/batch |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_personnel_extra_tasks.school_id | varchar(50) | NOT NULL | index idx_extra_tasks_school_sy (school_id+school_year) |  | medium | POST /api/extra-tasks/batch |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_personnel_extra_tasks.school_year | varchar(20) | NOT NULL; default 'SY 26-27' | index idx_extra_tasks_school_sy (school_id+school_year) |  | high | POST /api/extra-tasks/batch |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_personnel_extra_tasks.school_year | varchar(20) | NOT NULL; default 'SY 26-27' | index idx_extra_tasks_school_sy (school_id+school_year) |  | high | POST /api/extra-tasks/batch |
| tasks _(hardcoded fallback)_ | body | none found |  | esf7_personnel_extra_tasks.start_time | varchar(10) | nullable |  |  | high | POST /api/extra-tasks/batch |
| tasks | body | none found |  | esf7_personnel_extra_tasks.task_category | varchar(50) | NOT NULL |  |  | high | POST /api/extra-tasks/batch |
| tasks _(hardcoded fallback)_ | body | none found |  | esf7_personnel_extra_tasks.task_name | varchar(255) | NOT NULL |  | identity | high | POST /api/extra-tasks/batch |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_extra_tasks.updated_at | timestamp | nullable; default now() |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_id_mapping.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_id_mapping.legacy_id | varchar(128) | NOT NULL | PK |  | low | POST /api/room-profiling/sync-roster |
| id | body | none found |  | esf7_personnel_id_mapping.legacy_id | varchar(128) | NOT NULL | PK |  | high | POST / |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_id_mapping.new_id | varchar(64) | NOT NULL | index idx_pers_mapping_new_id |  | low | POST /api/room-profiling/sync-roster |
| id | body | none found |  | esf7_personnel_id_mapping.new_id | varchar(64) | NOT NULL | index idx_pers_mapping_new_id |  | high | POST / |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_id_mapping.status | varchar(32) | NOT NULL |  |  | low | POST /api/room-profiling/sync-roster |
| status _(hardcoded fallback)_ | body | none found |  | esf7_personnel_id_mapping.status | varchar(32) | NOT NULL |  |  | high | POST / |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_l&d.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_ld.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.conductor | text | nullable |  |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_ld_trainings.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.days | integer | nullable |  |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.end_date | date | nullable |  |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.id | varchar(50) | NOT NULL | PK |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_ld_trainings_personnel; foreignKey cascade | employment | low | POST /; PUT /:id |
| personnel_id | params | none found |  | esf7_personnel_ld_trainings.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_ld_trainings_personnel; foreignKey cascade | employment | high | PUT /api/trainings/personnel/:personnel_id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_ld_trainings.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.start_date | date | nullable |  |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.title | text | NOT NULL |  |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.total_hours | numeric | nullable |  |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_ld_trainings.training_type | text | NOT NULL | index idx_esf7_personnel_ld_trainings_type |  | low | POST /; PUT /:id; PUT /api/trainings/personnel/:personnel_id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_ld_trainings.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_learning_area.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_learning_areas.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_learning_areas.id | varchar(50) | NOT NULL | PK |  | low | POST /; PUT /:id; POST /api/learning-areas/:personnel_id +2 |
| learningAreaMap | body | none found | JSON.stringify | esf7_personnel_learning_areas.matrix_data | jsonb | nullable; default {} |  |  | medium | POST /; PUT /:id; POST /api/learning-areas/:personnel_id +1 |
| matrix_data | body | none found | JSON.stringify | esf7_personnel_learning_areas.matrix_data | jsonb | nullable; default {} |  |  | medium | POST /; PUT /:id; POST /api/learning-areas/:personnel_id +1 |
| personnelId _(server value with client fallback)_ | body | none found | JSON.stringify+db.query | esf7_personnel_learning_areas.matrix_data | jsonb | nullable; default {} |  |  | medium | POST /api/learning-areas/toggle |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_learning_areas.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_learning_areas_personnel; foreignKey cascade; unique esf7_personnel_learning_areas_personnel_id_key | employment | low | POST /; PUT /:id |
| personnelId | body | none found |  | esf7_personnel_learning_areas.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_learning_areas_personnel; foreignKey cascade; unique esf7_personnel_learning_areas_personnel_id_key | employment | high | POST /api/learning-areas/toggle |
| personnel_id | params | none found |  | esf7_personnel_learning_areas.personnel_id | varchar(50) | NOT NULL | index idx_esf7_personnel_learning_areas_personnel; foreignKey cascade; unique esf7_personnel_learning_areas_personnel_id_key | employment | high | POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_learning_areas.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| (server-derived) | — | n/a | expression | esf7_personnel_learning_areas.updated_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/learning-areas/toggle |
| (server-derived) | — | n/a | JSON.stringify+Date+toISOString | esf7_personnel_node_status.${…} | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_node_status.category | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | Boolean | esf7_personnel_node_status.is_complete | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (literal/default) | — | n/a |  | esf7_personnel_node_status.is_school_head | (table not in schema file) |  |  |  | high | PUT /:id/school-head |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | Boolean | esf7_personnel_node_status.is_school_head | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| isSchoolHead | body | none found |  | esf7_personnel_node_status.is_school_head | (table not in schema file) |  |  |  | high | PUT /:id/school-head |
| is_school_head | body | none found |  | esf7_personnel_node_status.is_school_head | (table not in schema file) |  |  |  | high | PUT /:id/school-head |
| personnelId | params | none found |  | esf7_personnel_node_status.personnel_id | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_node_status.personnel_name | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_node_status.position_title | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | query | none found |  | esf7_personnel_node_status.school_id | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_node_status.school_year | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (server-derived) | — | n/a | expression | esf7_personnel_node_status.updated_at | (table not in schema file) |  |  |  | low | PUT /:id/school-head; PUT /api/node-status/personnel/:personnelId/:nodeId |
| age | body | none found |  | esf7_personnel_profile.age | integer | nullable |  | identity | high | POST / |
| birthdate | body | none found |  | esf7_personnel_profile.age | integer | nullable |  | identity | high | POST / |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.age | integer | nullable |  | identity | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.age | integer | nullable |  | identity | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.age | integer | nullable |  | identity | high | POST /bulk |
| allowEmailDiscrepancy | body | none found |  | esf7_personnel_profile.allow_email_discrepancy | ? |  |  |  | high | POST / |
| allow_email_discrepancy | body | none found |  | esf7_personnel_profile.allow_email_discrepancy | ? |  |  |  | high | POST / |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.allow_email_discrepancy | ? |  |  |  | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.allow_email_discrepancy | ? |  |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.allow_email_discrepancy | ? |  |  |  | high | POST /bulk |
| birthdate | body | none found | coerceDateField | esf7_personnel_profile.birthdate | date | nullable |  | identity | high | POST / |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.birthdate | date | nullable |  | identity | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.birthdate | date | nullable |  | identity | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.birthdate | date | nullable |  | identity | high | POST /bulk |
| civilStatus | body | none found | toUpperCase | esf7_personnel_profile.civil_status | text | nullable |  | identity | high | POST / |
| civil_status | body | none found | toUpperCase | esf7_personnel_profile.civil_status | text | nullable |  | identity | high | POST / |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | params | none found |  | esf7_personnel_profile.civil_status | text | nullable |  | identity | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.civil_status | text | nullable |  | identity | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.civil_status | text | nullable |  | identity | high | POST /bulk |
| (server-derived) | — | n/a | expression | esf7_personnel_profile.created_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/learning-areas/toggle +5 |
| (literal/default) | — | n/a |  | esf7_personnel_profile.deleted | ? |  |  |  | high | POST /bulk |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.deped_email | text | nullable |  | contact | low | PUT /:id |
| depedEmail | body | none found | toUpperCase+trim | esf7_personnel_profile.deped_email | text | nullable |  | contact | high | POST / |
| deped_email | body | none found | toUpperCase+trim | esf7_personnel_profile.deped_email | text | nullable |  | contact | high | POST / |
| natureOfAppointment | body | none found | toUpperCase+trim | esf7_personnel_profile.deped_email | text | nullable |  | contact | high | POST / |
| nature_of_appointment | body | none found | toUpperCase+trim | esf7_personnel_profile.deped_email | text | nullable |  | contact | high | POST / |
| personnel | body | none found |  | esf7_personnel_profile.deped_email | text | nullable |  | contact | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.deped_email | text | nullable |  | contact | high | POST /bulk |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.disabled_service_years | ? |  |  |  | low | PUT /:id |
| employeeNo | body | none found | expression | esf7_personnel_profile.employee_no | text | nullable |  | government-id | high | POST / |
| employee_no | body | none found | expression | esf7_personnel_profile.employee_no | text | nullable |  | government-id | high | POST / |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.employee_no | text | nullable |  | government-id | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.employee_no | text | nullable |  | government-id | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.employee_no | text | nullable |  | government-id | high | POST /bulk |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.ethnic_group | text | nullable |  |  | low | PUT /:id |
| ethnicGroup | body | none found | toUpperCase | esf7_personnel_profile.ethnic_group | text | nullable |  |  | high | POST / |
| ethnic_group | body | none found | toUpperCase | esf7_personnel_profile.ethnic_group | text | nullable |  |  | high | POST / |
| personnel | body | none found |  | esf7_personnel_profile.ethnic_group | text | nullable |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.ethnic_group | text | nullable |  |  | high | POST /bulk |
| (literal/default) | — | n/a |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | low | PUT /:id; POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id +1 |
| firstName | body | none found |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | high | POST / |
| first_name | body | none found |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | high | POST / |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | medium | PUT /:id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | high | POST /bulk |
| personnelName | body | none found |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | high | POST /api/requests/create |
| personnel_name | body | none found |  | esf7_personnel_profile.first_name | text | NOT NULL |  | identity | high | POST /api/requests/create |
| id | body | none found |  | esf7_personnel_profile.id | varchar(50) | NOT NULL | PK |  | high | POST /; PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.id | varchar(50) | NOT NULL | PK |  | high | POST /bulk |
| personnelId | body | none found |  | esf7_personnel_profile.id | varchar(50) | NOT NULL | PK |  | high | POST /api/learning-areas/toggle; POST /api/requests/create; POST /api/workloads/bulk +3 |
| personnelList | body | none found |  | esf7_personnel_profile.id | varchar(50) | NOT NULL | PK |  | high | POST /bulk |
| personnel_id | params | none found |  | esf7_personnel_profile.id | varchar(50) | NOT NULL | PK |  | high | POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/requests/create +4 |
| (literal/default) | — | n/a |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | high | PUT /:id; PUT /:id/school-head |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | medium | PUT /:id |
| isMainSchoolHead _(server value with client fallback)_ | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | medium | PUT /:id |
| isMainSh _(server value with client fallback)_ | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | medium | PUT /:id |
| isMainSh | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | high | PUT /:id/school-head |
| isSchoolHead | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | high | PUT /:id/school-head |
| is_main_sh _(server value with client fallback)_ | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | medium | PUT /:id |
| is_main_sh | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | high | PUT /:id/school-head |
| is_school_head | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | high | PUT /:id/school-head |
| personnel | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.is_main_sh | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| (literal/default) | — | n/a |  | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | high | PUT /:id; PUT /:id/school-head |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | medium | PUT /:id |
| isSchoolHead | body | none found | expression | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | high | POST / |
| isSchoolHead | body | none found |  | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | high | PUT /:id/school-head |
| is_school_head | body | none found | expression | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | high | POST / |
| is_school_head | body | none found |  | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | high | PUT /:id/school-head |
| personnel | body | none found |  | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.is_school_head | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| (literal/default) | — | n/a |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | low | PUT /:id; POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id +1 |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | medium | PUT /:id |
| lastName | body | none found |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | high | POST / |
| last_name | body | none found |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | high | POST / |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | high | POST /bulk |
| personnelName | body | none found |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | high | POST /api/requests/create |
| personnel_name | body | none found |  | esf7_personnel_profile.last_name | text | NOT NULL |  | identity | high | POST /api/requests/create |
| id | body | none found |  | esf7_personnel_profile.legacy_id | varchar(128) | nullable | index idx_esf7_personnel_profile_legacy_id |  | high | POST /; PUT /:id |
| personnel | body | none found | expression | esf7_personnel_profile.legacy_id | varchar(128) | nullable | index idx_esf7_personnel_profile_legacy_id |  | high | POST /bulk |
| personnelList | body | none found | expression | esf7_personnel_profile.legacy_id | varchar(128) | nullable | index idx_esf7_personnel_profile_legacy_id |  | high | POST /bulk |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.middle_name | text | nullable |  | identity | medium | PUT /:id |
| middleName | body | none found | toUpperCase | esf7_personnel_profile.middle_name | text | nullable |  | identity | high | POST / |
| middle_name | body | none found | toUpperCase | esf7_personnel_profile.middle_name | text | nullable |  | identity | high | POST / |
| personnel | body | none found |  | esf7_personnel_profile.middle_name | text | nullable |  | identity | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.middle_name | text | nullable |  | identity | high | POST /bulk |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.name_extension | text | nullable |  |  | medium | PUT /:id |
| nameExtension | body | none found | toUpperCase | esf7_personnel_profile.name_extension | text | nullable |  |  | high | POST / |
| name_extension | body | none found | toUpperCase | esf7_personnel_profile.name_extension | text | nullable |  |  | high | POST / |
| personnel | body | none found |  | esf7_personnel_profile.name_extension | text | nullable |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.name_extension | text | nullable |  |  | high | POST /bulk |
| depedEmail | body | none found | toUpperCase+trim | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST / |
| deped_email | body | none found | toUpperCase+trim | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST / |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | params | none found |  | esf7_personnel_profile.no_deped_email | ? |  |  |  | medium | PUT /:id |
| natureOfAppointment | body | none found | toUpperCase+trim | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST / |
| nature_of_appointment | body | none found | toUpperCase+trim | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST / |
| noDepedEmail | body | none found | toUpperCase+trim | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST / |
| no_deped_email | body | none found | toUpperCase+trim | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST / |
| personnel | body | none found |  | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.no_deped_email | ? |  |  |  | high | POST /bulk |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.no_philsys | boolean | NOT NULL; default false |  |  | medium | PUT /:id |
| noPhilsys | body | none found | expression | esf7_personnel_profile.no_philsys | boolean | NOT NULL; default false |  |  | high | POST / |
| no_philsys | body | none found | expression | esf7_personnel_profile.no_philsys | boolean | NOT NULL; default false |  |  | high | POST / |
| personnel | body | none found |  | esf7_personnel_profile.no_philsys | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.no_philsys | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.no_tin | boolean | NOT NULL; default false |  | financial | medium | PUT /:id |
| noTin | body | none found | expression | esf7_personnel_profile.no_tin | boolean | NOT NULL; default false |  | financial | high | POST / |
| no_tin | body | none found | expression | esf7_personnel_profile.no_tin | boolean | NOT NULL; default false |  | financial | high | POST / |
| personnel | body | none found |  | esf7_personnel_profile.no_tin | boolean | NOT NULL; default false |  | financial | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.no_tin | boolean | NOT NULL; default false |  | financial | high | POST /bulk |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.philsys_no | text | nullable |  |  | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.philsys_no | text | nullable |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.philsys_no | text | nullable |  |  | high | POST /bulk |
| philsysNo | body | none found | expression | esf7_personnel_profile.philsys_no | text | nullable |  |  | high | POST / |
| philsys_no | body | none found | expression | esf7_personnel_profile.philsys_no | text | nullable |  |  | high | POST / |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.prn | text | NOT NULL | index idx_esf7_personnel_profile_prn; unique esf7_personnel_profile_prn_key | government-id | low | POST /; POST /bulk |
| id | params | none found |  | esf7_personnel_profile.prn | text | NOT NULL | index idx_esf7_personnel_profile_prn; unique esf7_personnel_profile_prn_key | government-id | high | PUT /:id |
| personnelId | body | none found |  | esf7_personnel_profile.prn | text | NOT NULL | index idx_esf7_personnel_profile_prn; unique esf7_personnel_profile_prn_key | government-id | high | POST /api/learning-areas/toggle; POST /api/requests/create; POST /api/workloads/bulk +3 |
| personnel_id | params | none found |  | esf7_personnel_profile.prn | text | NOT NULL | index idx_esf7_personnel_profile_prn; unique esf7_personnel_profile_prn_key | government-id | high | POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/requests/create +4 |
| prn | body | none found |  | esf7_personnel_profile.prn | text | NOT NULL | index idx_esf7_personnel_profile_prn; unique esf7_personnel_profile_prn_key | government-id | high | PUT /:id |
| (server-derived) | — | n/a | JSON.stringify+db.query | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | high | DELETE /api/workloads/:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | low | DELETE /api/workloads/personnel/:personnel_id/term/:term; DELETE /api/workloads/term-clear/school |
| administrativeRows _(server value with client fallback)_ | body | none found | JSON.stringify+dedupeRowsById+Array.isArray | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| administrative_rows _(server value with client fallback)_ | body | none found | JSON.stringify+dedupeRowsById+Array.isArray | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| teachingRelatedRows _(server value with client fallback)_ | body | none found | JSON.stringify+dedupeRowsById+Array.isArray | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| teaching_related_rows _(server value with client fallback)_ | body | none found | JSON.stringify+dedupeRowsById+Array.isArray | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows _(server value with client fallback)_ | body | none found | JSON.stringify+dedupeRowsById+Array.isArray | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(server value with client fallback)_ | body | none found | JSON.stringify+dedupeRowsById+Array.isArray | esf7_personnel_profile.raw_payload | jsonb | nullable; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | params | none found |  | esf7_personnel_profile.religion | text | nullable |  | identity | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.religion | text | nullable |  | identity | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.religion | text | nullable |  | identity | high | POST /bulk |
| religion | body | none found | toUpperCase | esf7_personnel_profile.religion | text | nullable |  | identity | high | POST / |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | params | none found |  | esf7_personnel_profile.salutation | text | NOT NULL; default 'MR.' |  |  | medium | PUT /:id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.salutation | text | NOT NULL; default 'MR.' |  |  | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.salutation | text | NOT NULL; default 'MR.' |  |  | high | POST /bulk |
| salutation _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.salutation | text | NOT NULL; default 'MR.' |  |  | high | POST / |
| (literal/default) | — | n/a |  | esf7_personnel_profile.school_head_level | ? |  |  |  | high | PUT /:id/school-head |
| isSchoolHead | body | none found | Boolean | esf7_personnel_profile.school_head_level | ? |  |  |  | high | PUT /:id/school-head |
| is_school_head | body | none found | Boolean | esf7_personnel_profile.school_head_level | ? |  |  |  | high | PUT /:id/school-head |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.school_id | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | low | PUT /:id; POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id +2 |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.school_id | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | medium | POST /; POST /bulk |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.school_id | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.school_id | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | medium | POST /; POST /bulk |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.school_id | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (literal/default) | — | n/a |  | esf7_personnel_profile.school_year | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | high | POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/learning-areas/toggle +1 |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.school_year | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | high | POST /; PUT /:id; POST /api/workloads/bulk +4 |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.school_year | text | NOT NULL | index idx_esf7_personnel_profile_school_sy (school_id+school_year) |  | high | POST /; PUT /:id; POST /api/workloads/bulk +4 |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | params | none found |  | esf7_personnel_profile.sex_at_birth | text | nullable |  | identity | medium | PUT /:id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.sex_at_birth | text | nullable |  | identity | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.sex_at_birth | text | nullable |  | identity | high | POST /bulk |
| sexAtBirth _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.sex_at_birth | text | nullable |  | identity | high | POST / |
| sex_at_birth _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.sex_at_birth | text | nullable |  | identity | high | POST / |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.solo_parent | boolean | NOT NULL; default false |  |  | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.solo_parent | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.solo_parent | boolean | NOT NULL; default false |  |  | high | POST /bulk |
| soloParent | body | none found | expression | esf7_personnel_profile.solo_parent | boolean | NOT NULL; default false |  |  | high | POST / |
| solo_parent | body | none found | expression | esf7_personnel_profile.solo_parent | boolean | NOT NULL; default false |  |  | high | POST / |
| (literal/default) | — | n/a |  | esf7_personnel_profile.status | varchar(32) | NOT NULL; default 'canonical' | index idx_esf7_personnel_profile_status |  | high | PUT /:id; POST /bulk |
| status _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.status | varchar(32) | NOT NULL; default 'canonical' | index idx_esf7_personnel_profile_status |  | high | POST / |
| status | body | none found | expression | esf7_personnel_profile.status | varchar(32) | NOT NULL; default 'canonical' | index idx_esf7_personnel_profile_status |  | high | PUT /:id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_profile.term | text | nullable; default '1st' |  |  | medium |  |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.tin | text | nullable |  | financial | medium | PUT /:id |
| personnel | body | none found |  | esf7_personnel_profile.tin | text | nullable |  | financial | high | POST /bulk |
| personnelList | body | none found |  | esf7_personnel_profile.tin | text | nullable |  | financial | high | POST /bulk |
| tin | body | none found | expression | esf7_personnel_profile.tin | text | nullable |  | financial | high | POST / |
| (literal/default) | — | n/a |  | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | high | POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/learning-areas/toggle +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | low | PUT /:id |
| id _(server value with client fallback)_ | params | none found |  | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | medium | PUT /:id |
| personnel _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | high | POST /bulk |
| personnelList _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | high | POST /bulk |
| positionCategory _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| position_category _(hardcoded fallback)_ | body | none found |  | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | high | POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id |
| type _(hardcoded fallback)_ | body | none found | expression | esf7_personnel_profile.type | text | NOT NULL; default 'teaching' |  |  | high | POST / |
| (server-derived) | — | n/a | expression | esf7_personnel_profile.updated_at | timestamp | NOT NULL; default now() |  |  | low | PUT /:id; PUT /:id/school-head; POST /api/employment/:personnel_id +13 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.created_at | timestamp | nullable; default now() |  |  | low | POST /api/room-profiling/ack |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.created_timestamp | bigint | nullable |  |  | low | POST /api/room-profiling/ack |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.id | varchar(128) | NOT NULL | PK |  | low | POST /api/room-profiling/ack |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.payload_json | jsonb | NOT NULL |  |  | low | POST /api/room-profiling/ack |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.personnel_id | varchar(64) | NOT NULL | index idx_pers_archive_personnel (school_id+personnel_id) | employment | low | POST /api/room-profiling/ack |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.personnel_name | varchar(255) | nullable |  | identity | low | POST /api/room-profiling/ack |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.room_name | varchar(255) | nullable |  | identity | low | POST /api/room-profiling/ack |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_personnel_submission_archive.school_id | varchar(64) | NOT NULL | index idx_pers_archive_school; index idx_pers_archive_personnel (school_id+personnel_id) |  | low | POST /api/room-profiling/ack |
| (literal/default) | — | n/a |  | esf7_personnel_submission_archive.status | varchar(32) | nullable; default 'APPROVED' |  |  | high | POST /api/room-profiling/ack |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_personnel_submission.created_at | timestamp | nullable; default now() |  |  | medium |  |
| (server-derived) | — | n/a |  | esf7_personnel_submission.created_timestamp | bigint | nullable |  |  | high | POST /api/room-profiling/submit |
| (server-derived) | — | n/a |  | esf7_personnel_submission.id | varchar(128) | NOT NULL | PK |  | high | POST /api/room-profiling/submit |
| profileData | body | none found | JSON.stringify | esf7_personnel_submission.payload_json | jsonb | NOT NULL |  |  | high | POST /api/room-profiling/submit |
| personnelId | body | none found |  | esf7_personnel_submission.personnel_id | varchar(64) | NOT NULL |  | employment | high | POST /api/room-profiling/submit |
| personnel_id | body | none found |  | esf7_personnel_submission.personnel_id | varchar(64) | NOT NULL |  | employment | high | POST /api/room-profiling/submit |
| profileData | body | none found |  | esf7_personnel_submission.personnel_id | varchar(64) | NOT NULL |  | employment | high | POST /api/room-profiling/submit |
| personnelName _(hardcoded fallback)_ | body | none found |  | esf7_personnel_submission.personnel_name | varchar(255) | nullable |  | identity | high | POST /api/room-profiling/submit |
| personnel_name _(hardcoded fallback)_ | body | none found |  | esf7_personnel_submission.personnel_name | varchar(255) | nullable |  | identity | high | POST /api/room-profiling/submit |
| room _(hardcoded fallback)_ | body | none found |  | esf7_personnel_submission.room_name | varchar(255) | nullable |  | identity | high | POST /api/room-profiling/submit |
| roomName _(hardcoded fallback)_ | body | none found |  | esf7_personnel_submission.room_name | varchar(255) | nullable |  | identity | high | POST /api/room-profiling/submit |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_personnel_submission.school_id | varchar(64) | NOT NULL | index idx_pers_sub_school_status (school_id+status) |  | high | POST /api/room-profiling/submit |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_personnel_submission.school_id | varchar(64) | NOT NULL | index idx_pers_sub_school_status (school_id+status) |  | high | POST /api/room-profiling/submit |
| (literal/default) | — | n/a |  | esf7_personnel_submission.status | varchar(32) | nullable; default 'PENDING' | index idx_pers_sub_school_status (school_id+status) |  | high | POST /api/room-profiling/accept; POST /api/room-profiling/ack; POST /api/room-profiling/submit |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_personnel_trainings.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.college_degree | text | nullable |  |  | low | PUT /:id |
| collegeDegree | body | none found |  | esf7_perssonel_educ.college_degree | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| college_degree | body | none found |  | esf7_perssonel_educ.college_degree | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_perssonel_educ.college_degrees | ? |  |  |  | low | POST /; PUT /:id; POST /api/qualifications/:personnel_id +1 |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_perssonel_educ.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_perssonel_educ.eligibility | jsonb | nullable; default [] |  |  | low | POST /; PUT /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.eligibility | jsonb | nullable; default [] |  |  | low | POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.highest_educational_attainment | text | NOT NULL; default 'COLLEGE GRADUATE / BACCALAUREATE' |  |  | low | PUT /:id |
| collegeDegree | body | none found |  | esf7_perssonel_educ.highest_educational_attainment | text | NOT NULL; default 'COLLEGE GRADUATE / BACCALAUREATE' |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| college_degree | body | none found |  | esf7_perssonel_educ.highest_educational_attainment | text | NOT NULL; default 'COLLEGE GRADUATE / BACCALAUREATE' |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| highestEducationalAttainment | body | none found |  | esf7_perssonel_educ.highest_educational_attainment | text | NOT NULL; default 'COLLEGE GRADUATE / BACCALAUREATE' |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| highest_educational_attainment | body | none found |  | esf7_perssonel_educ.highest_educational_attainment | text | NOT NULL; default 'COLLEGE GRADUATE / BACCALAUREATE' |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.id | varchar(50) | NOT NULL | PK |  | low | POST /; PUT /:id; POST /api/qualifications/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | toUpperCase | esf7_perssonel_educ.major | text | nullable |  |  | low | PUT /:id |
| major | body | none found | toUpperCase | esf7_perssonel_educ.major | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | toUpperCase | esf7_perssonel_educ.minor | text | nullable |  |  | low | PUT /:id |
| minor | body | none found | toUpperCase | esf7_perssonel_educ.minor | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| age _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| allow_email_discrepancy _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| birthdate _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| civil_status _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| deped_email _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| employee_no _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| ethnic_group _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| first_name _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| is_school_head _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| last_name _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| middle_name _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| name_extension _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| no_deped_email _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| no_philsys _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| no_tin _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| personnel_id | params | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | high | POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| philsys_no _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| religion _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| salutation _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| school_year _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| sex_at_birth _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| solo_parent _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| status _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | PUT /:id |
| tin _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| type _(server value with client fallback)_ | body | none found |  | esf7_perssonel_educ.personnel_id | varchar(50) | NOT NULL | index idx_esf7_perssonel_educ_personnel; foreignKey cascade; unique esf7_perssonel_educ_personnel_id_key | employment | medium | POST / |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.post_graduate_degree | text | nullable; default 'N/A' |  |  | low | PUT /:id |
| postGraduateDegree _(hardcoded fallback)_ | body | none found |  | esf7_perssonel_educ.post_graduate_degree | text | nullable; default 'N/A' |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| post_graduate_degree _(hardcoded fallback)_ | body | none found |  | esf7_perssonel_educ.post_graduate_degree | text | nullable; default 'N/A' |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (whole body) | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | PUT /:id |
| collegeDegree | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| college_degree | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| highestEducationalAttainment | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| highest_educational_attainment | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| postGraduateDiscipline | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| postGraduateDisciplineCustom | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| post_graduate_discipline | body | none found | parsePostGraduateDiscipline+toUpperCase | esf7_perssonel_educ.post_graduate_discipline | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | toUpperCase | esf7_perssonel_educ.prc_specialization | text | nullable |  |  | low | PUT /:id |
| prcSpecialization | body | none found | toUpperCase | esf7_perssonel_educ.prc_specialization | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| prc_specialization | body | none found | toUpperCase | esf7_perssonel_educ.prc_specialization | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_perssonel_educ.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.shs_track | text | nullable |  |  | low | PUT /:id |
| shsTrack | body | none found |  | esf7_perssonel_educ.shs_track | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| shs_track | body | none found |  | esf7_perssonel_educ.shs_track | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_perssonel_educ.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.vocational_course | text | nullable |  |  | low | PUT /:id |
| vocationalCourse | body | none found |  | esf7_perssonel_educ.vocational_course | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| vocational_course | body | none found |  | esf7_perssonel_educ.vocational_course | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_perssonel_educ.vocational_level | text | nullable |  |  | low | PUT /:id |
| vocationalLevel | body | none found |  | esf7_perssonel_educ.vocational_level | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| vocational_level | body | none found |  | esf7_perssonel_educ.vocational_level | text | nullable |  |  | high | POST /; POST /api/qualifications/:personnel_id; PUT /api/qualifications/:personnel_id |
| (server-derived) | — | n/a | expression | esf7_profiling_snapshots.created_at | timestamp | nullable; default now() |  |  | high | POST /api/room-profiling/snapshots |
| (server-derived) | — | n/a |  | esf7_profiling_snapshots.id | varchar(128) | NOT NULL | PK |  | high | POST /api/room-profiling/snapshots |
| personnel | body | none found |  | esf7_profiling_snapshots.personnel_count | integer | nullable; default 0 |  | employment | high | POST /api/room-profiling/snapshots |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_profiling_snapshots.school_id | varchar(64) | NOT NULL | index idx_pers_snapshots_school |  | high | POST /api/room-profiling/snapshots |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_profiling_snapshots.school_id | varchar(64) | NOT NULL | index idx_pers_snapshots_school |  | high | POST /api/room-profiling/snapshots |
| personnel | body | none found | JSON.stringify+Array.isArray | esf7_profiling_snapshots.snapshot_json | jsonb | NOT NULL |  |  | high | POST /api/room-profiling/snapshots |
| snapshotName _(hardcoded fallback)_ | body | none found |  | esf7_profiling_snapshots.snapshot_name | varchar(255) | nullable |  | identity | high | POST /api/room-profiling/snapshots |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_profiling_snapshots.verified_count | integer | nullable; default 0 |  |  | low | POST /api/room-profiling/snapshots |
| (literal/default) | — | n/a |  | esf7_regular_sections.adviser_id | varchar(50) | nullable | index idx_regular_sections_adviser; foreignKey set null |  | high | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.adviser_id | varchar(50) | nullable | index idx_regular_sections_adviser; foreignKey set null |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_regular_sections.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (server-derived) | — | n/a |  | esf7_regular_sections.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.female_learners | integer | nullable; default 0 |  |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.grade_level | text | NOT NULL | unique uq_regular_section_school_sy (school_id+school_year+grade_level+section_name) |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (server-derived) | — | n/a |  | esf7_regular_sections.id | varchar(50) | NOT NULL | PK |  | medium | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.male_learners | integer | nullable; default 0 |  |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.number_of_learners | integer | nullable; default 0 |  |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.school_id | text | NOT NULL | index idx_regular_sections_school_sy (school_id+school_year); unique uq_regular_section_school_sy (school_id+school_year+grade_level+section_name) |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.school_year | text | NOT NULL; default '2026-2027' | index idx_regular_sections_school_sy (school_id+school_year); unique uq_regular_section_school_sy (school_id+school_year+grade_level+section_name) |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.section_name | text | NOT NULL | unique uq_regular_section_school_sy (school_id+school_year+grade_level+section_name) | identity | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.section_type | text | NOT NULL; default 'MONO GRADE' |  |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_regular_sections.size_status | text | nullable; default 'WITHIN STANDARD' |  |  | low | POST /api/sections/regular; POST /api/sections/regular/sync |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_regular_sections.term | text | nullable; default '1st' |  |  | medium |  |
| (server-derived) | — | n/a | expression | esf7_regular_sections.updated_at | timestamp | NOT NULL; default now() |  |  | medium | POST /api/sections/regular; POST /api/sections/regular/sync |
| (server-derived) | — | n/a | expression | esf7_related_task.created_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_related_task.duration_minutes | integer | NOT NULL; default 60 |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnelId _(hardcoded fallback)_ | body | none found | JSON.stringify+relatedTaskPayload.buildExtras+targetPersonId.split | esf7_related_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnel_id _(hardcoded fallback)_ | body | none found | JSON.stringify+relatedTaskPayload.buildExtras+targetPersonId.split | esf7_related_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolId _(hardcoded fallback)_ | body | none found | JSON.stringify+relatedTaskPayload.buildExtras+targetPersonId.split | esf7_related_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolYear _(hardcoded fallback)_ | body | none found | JSON.stringify+relatedTaskPayload.buildExtras+targetPersonId.split | esf7_related_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(hardcoded fallback)_ | body | none found | JSON.stringify+relatedTaskPayload.buildExtras+targetPersonId.split | esf7_related_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_year _(hardcoded fallback)_ | body | none found | JSON.stringify+relatedTaskPayload.buildExtras+targetPersonId.split | esf7_related_task.extras | jsonb | NOT NULL; default {} |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_related_task.frequency | varchar(20) | NOT NULL; default 'weekly' |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_related_task.id | varchar(50) | NOT NULL | PK |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_related_task.is_designation_synced | boolean | nullable; default false |  | employment | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnelId | body | none found |  | esf7_related_task.personnel_id | varchar(50) | NOT NULL | index idx_esf7_related_task_personnel; foreignKey cascade | employment | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnel_id | body | none found |  | esf7_related_task.personnel_id | varchar(50) | NOT NULL | index idx_esf7_related_task_personnel; foreignKey cascade | employment | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_related_task.school_id | varchar(50) | NOT NULL |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_related_task.school_id | varchar(50) | NOT NULL |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_related_task.school_year | varchar(20) | NOT NULL; default '2026-2027' |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_related_task.school_year | varchar(20) | NOT NULL; default '2026-2027' |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_related_task.task_name | text | NOT NULL |  | identity | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_related_task.term1_hours | numeric | nullable; default '0.00", |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (server-derived) | — | n/a | expression | esf7_related_task.updated_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (literal/default) | — | n/a |  | esf7_remedial_enrichment_sections.assigned_teacher_id | varchar(50) | nullable | index idx_remedial_sections_teacher; foreignKey set null |  | high | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_remedial_enrichment_sections.assigned_teacher_id | varchar(50) | nullable | index idx_remedial_sections_teacher; foreignKey set null |  | low | POST /api/sections/remedial-enrichment |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_remedial_enrichment_sections.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| femaleLearners | body | none found |  | esf7_remedial_enrichment_sections.female_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| female_learners | body | none found |  | esf7_remedial_enrichment_sections.female_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| gradeLevel _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.grade_level | text | NOT NULL |  |  | high | POST /api/sections/remedial-enrichment |
| grade_level _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.grade_level | text | NOT NULL |  |  | high | POST /api/sections/remedial-enrichment |
| id | body | none found |  | esf7_remedial_enrichment_sections.id | varchar(50) | NOT NULL | PK |  | high | POST /api/sections/remedial-enrichment |
| interventionType _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.intervention_type | text | NOT NULL; default 'REMEDIAL' |  |  | high | POST /api/sections/remedial-enrichment |
| intervention_type _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.intervention_type | text | NOT NULL; default 'REMEDIAL' |  |  | high | POST /api/sections/remedial-enrichment |
| sectionType _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.intervention_type | text | NOT NULL; default 'REMEDIAL' |  |  | high | POST /api/sections/remedial-enrichment |
| section_type _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.intervention_type | text | NOT NULL; default 'REMEDIAL' |  |  | high | POST /api/sections/remedial-enrichment |
| maleLearners | body | none found |  | esf7_remedial_enrichment_sections.male_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| male_learners | body | none found |  | esf7_remedial_enrichment_sections.male_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_remedial_enrichment_sections.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.school_id | text | NOT NULL | index idx_remedial_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/remedial-enrichment |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.school_id | text | NOT NULL | index idx_remedial_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/remedial-enrichment |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.school_year | text | NOT NULL; default '2026-2027' | index idx_remedial_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/remedial-enrichment |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.school_year | text | NOT NULL; default '2026-2027' | index idx_remedial_sections_school_sy (school_id+school_year) |  | high | POST /api/sections/remedial-enrichment |
| id | body | none found |  | esf7_remedial_enrichment_sections.section_name | text | NOT NULL |  | identity | high | POST /api/sections/remedial-enrichment |
| sectionName | body | none found |  | esf7_remedial_enrichment_sections.section_name | text | NOT NULL |  | identity | high | POST /api/sections/remedial-enrichment |
| section_name | body | none found |  | esf7_remedial_enrichment_sections.section_name | text | NOT NULL |  | identity | high | POST /api/sections/remedial-enrichment |
| interventionType _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.section_type | ? |  |  |  | high | POST /api/sections/remedial-enrichment |
| intervention_type _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.section_type | ? |  |  |  | high | POST /api/sections/remedial-enrichment |
| sectionType _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.section_type | ? |  |  |  | high | POST /api/sections/remedial-enrichment |
| section_type _(hardcoded fallback)_ | body | none found |  | esf7_remedial_enrichment_sections.section_type | ? |  |  |  | high | POST /api/sections/remedial-enrichment |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_remedial_enrichment_sections.term | text | nullable; default '1st' |  |  | medium |  |
| femaleLearners | body | none found |  | esf7_remedial_enrichment_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| female_learners | body | none found |  | esf7_remedial_enrichment_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| maleLearners | body | none found |  | esf7_remedial_enrichment_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| male_learners | body | none found |  | esf7_remedial_enrichment_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| totalLearners | body | none found |  | esf7_remedial_enrichment_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| total_learners | body | none found |  | esf7_remedial_enrichment_sections.total_learners | integer | nullable; default 0 |  |  | high | POST /api/sections/remedial-enrichment |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_remedial_enrichment_sections.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_requests.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| personnelName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| personnel_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| remarks _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| requestType _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| request_type _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| requesterSchoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| requester_school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| targetSchoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| target_school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+payload.buildExtras+resolveSchoolId | esf7_requests.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/requests/create |
| id _(hardcoded fallback)_ | body | none found |  | esf7_requests.id | varchar(50) | NOT NULL | PK |  | high | POST /api/requests/create |
| personnelId | body | none found |  | esf7_requests.personnel_id | varchar(50) | nullable | index idx_esf7_requests_personnel; foreignKey set null | employment | high | POST /api/requests/create |
| personnel_id | body | none found |  | esf7_requests.personnel_id | varchar(50) | nullable | index idx_esf7_requests_personnel; foreignKey set null | employment | high | POST /api/requests/create |
| personnelName | body | none found | expression | esf7_requests.personnel_name | text | nullable |  | identity | high | POST /api/requests/create |
| personnel_name | body | none found | expression | esf7_requests.personnel_name | text | nullable |  | identity | high | POST /api/requests/create |
| remarks | body | none found | expression | esf7_requests.remarks | text | nullable |  |  | high | POST /api/requests/:id/respond; POST /api/requests/create |
| requestType | body | none found |  | esf7_requests.request_type | text | NOT NULL |  |  | high | POST /api/requests/create |
| request_type | body | none found |  | esf7_requests.request_type | text | NOT NULL |  |  | high | POST /api/requests/create |
| requesterSchoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_requests.requester_school_id | text | NOT NULL | index idx_esf7_requests_requester (requester_school_id+status) |  | medium | POST /api/requests/create |
| requester_school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_requests.requester_school_id | text | NOT NULL | index idx_esf7_requests_requester (requester_school_id+status) |  | medium | POST /api/requests/create |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_requests.school_year | text | NOT NULL; default '2026-2027' |  |  | medium |  |
| action | body | none found |  | esf7_requests.status | text | NOT NULL; default 'pending' | index idx_esf7_requests_requester (requester_school_id+status); index idx_esf7_requests_target (target_school_id+status) |  | high | POST /api/requests/:id/respond |
| targetSchoolId | body | none found |  | esf7_requests.target_school_id | text | NOT NULL | index idx_esf7_requests_target (target_school_id+status) |  | high | POST /api/requests/create |
| target_school_id | body | none found |  | esf7_requests.target_school_id | text | NOT NULL | index idx_esf7_requests_target (target_school_id+status) |  | high | POST /api/requests/create |
| (server-derived) | — | n/a | expression | esf7_requests.updated_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/requests/:id/respond |
| (unknown) _(NOT NULL without default and not set by any detected write)_ | — | n/a |  | esf7_room_submissions_staging.id | varchar(128) | NOT NULL | PK |  | low |  |
| (unknown) _(NOT NULL without default and not set by any detected write)_ | — | n/a |  | esf7_room_submissions_staging.personnel_id | varchar(64) | NOT NULL |  | employment | low |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_room_submissions_staging.personnel_name | varchar(255) | nullable |  | identity | medium |  |
| (unknown) _(NOT NULL without default and not set by any detected write)_ | — | n/a |  | esf7_room_submissions_staging.profile_data | jsonb | NOT NULL |  |  | low |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_room_submissions_staging.room | varchar(255) | nullable |  |  | medium |  |
| (unknown) _(NOT NULL without default and not set by any detected write)_ | — | n/a |  | esf7_room_submissions_staging.school_id | varchar(64) | NOT NULL | index idx_room_sub_staging_school |  | low |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_room_submissions_staging.submitted_at | timestamp | nullable; default now() |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_room_submissions_staging.submitted_timestamp | bigint | nullable |  |  | medium |  |
| email | body | none found |  | esf7_school_head_sdo.email | (table not in schema file) |  |  |  | high | PUT /api/school-head-sdo |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_school_head_sdo.id | (table not in schema file) |  |  |  | low | PUT /api/school-head-sdo |
| name | body | none found |  | esf7_school_head_sdo.name | (table not in schema file) |  |  |  | high | PUT /api/school-head-sdo |
| positionTitle | body | none found |  | esf7_school_head_sdo.position_title | (table not in schema file) |  |  |  | high | PUT /api/school-head-sdo |
| position_title | body | none found |  | esf7_school_head_sdo.position_title | (table not in schema file) |  |  |  | high | PUT /api/school-head-sdo |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_head_sdo.school_id | (table not in schema file) |  |  |  | low | PUT /api/school-head-sdo |
| (server-derived) | — | n/a | JSON.stringify+Date+toISOString | esf7_school_node_status.${…} | (table not in schema file) |  |  |  | low | PUT /api/node-status/school/:nodeId |
| (server-derived) | — | n/a | JSON.stringify+completedNodes.includes+Date | esf7_school_node_status.node_01_school | (table not in schema file) |  |  |  | medium | POST /draft; PUT /draft |
| (server-derived) | — | n/a | JSON.stringify+completedNodes.includes+Date | esf7_school_node_status.node_02_roster | (table not in schema file) |  |  |  | medium | POST /draft; PUT /draft |
| (server-derived) | — | n/a | JSON.stringify+completedNodes.includes+Date | esf7_school_node_status.node_05_requests | (table not in schema file) |  |  |  | medium | POST /draft; PUT /draft |
| (server-derived) | — | n/a | JSON.stringify+completedNodes.includes+Date | esf7_school_node_status.node_06_classes | (table not in schema file) |  |  |  | medium | POST /draft; PUT /draft |
| (server-derived) | — | n/a | JSON.stringify+completedNodes.includes+Date | esf7_school_node_status.node_10_overload | (table not in schema file) |  |  |  | medium | POST /draft; PUT /draft |
| (server-derived) | — | n/a | JSON.stringify+completedNodes.includes+Date | esf7_school_node_status.node_11_validation | (table not in schema file) |  |  |  | medium | POST /draft; PUT /draft |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_school_node_status.overall_percentage | (table not in schema file) |  |  |  | low | PUT /api/node-status/school/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_node_status.overall_percentage | (table not in schema file) |  |  |  | low | POST /draft; PUT /draft |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_school_node_status.overall_status | (table not in schema file) |  |  |  | low | PUT /api/node-status/school/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | completedNodes.includes+Array.isArray | esf7_school_node_status.overall_status | (table not in schema file) |  |  |  | low | POST /draft; PUT /draft |
| (server-derived) | — | n/a | JSON.stringify+Date+toISOString | esf7_school_node_status.personnel_summary | (table not in schema file) |  |  |  | medium | PUT /api/node-status/personnel/:personnelId/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify+Array.isArray | esf7_school_node_status.personnel_summary | (table not in schema file) |  |  |  | low | POST /draft; PUT /draft |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_node_status.school_id | (table not in schema file) |  |  |  | low | POST /draft; PUT /draft |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | query | none found |  | esf7_school_node_status.school_id | (table not in schema file) |  |  |  | low | PUT /api/node-status/school/:nodeId |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_node_status.school_year | (table not in schema file) |  |  |  | low | PUT /api/node-status/school/:nodeId; POST /draft; PUT /draft |
| (server-derived) | — | n/a | expression | esf7_school_node_status.updated_at | (table not in schema file) |  |  |  | low | PUT /api/node-status/personnel/:personnelId/:nodeId; PUT /api/node-status/school/:nodeId; POST /draft +1 |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.elem_inclusive_programs | jsonb | nullable; default [] |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify+Array.isArray | esf7_school_profile.elem_special_programs | jsonb | nullable; default [] |  |  | low | POST /draft; PUT /draft |
| elemSpecialPrograms | body | none found | JSON.stringify+Array.isArray | esf7_school_profile.elem_special_programs | jsonb | nullable; default [] |  |  | high | PUT /curricular-config |
| elem_special_programs | body | none found | JSON.stringify+Array.isArray | esf7_school_profile.elem_special_programs | jsonb | nullable; default [] |  |  | high | PUT /curricular-config |
| hasElemSpecialPrograms | body | none found | JSON.stringify+Array.isArray | esf7_school_profile.elem_special_programs | jsonb | nullable; default [] |  |  | high | PUT /curricular-config |
| has_elem_special_programs | body | none found | JSON.stringify+Array.isArray | esf7_school_profile.elem_special_programs | jsonb | nullable; default [] |  |  | high | PUT /curricular-config |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.extras | jsonb | NOT NULL; default {} |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_als | boolean | NOT NULL; default false |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_als | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_als | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_es_als | body | none found |  | esf7_school_profile.has_als | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_jhs_als | body | none found |  | esf7_school_profile.has_als | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_als | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_als | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.has_elem_inclusive | boolean | NOT NULL; default false |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | sanitizeBoolean | esf7_school_profile.has_elem_special_programs | boolean | NOT NULL; default false |  |  | low | POST /draft; PUT /draft |
| hasElemSpecialPrograms | body | none found |  | esf7_school_profile.has_elem_special_programs | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_elem_special_programs | body | none found |  | esf7_school_profile.has_elem_special_programs | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_es_als | ? |  |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_es_als | ? |  |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_es_als | ? |  |  |  | high | PUT /curricular-config |
| has_es_als | body | none found |  | esf7_school_profile.has_es_als | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_es_iped | ? |  |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_es_iped | ? |  |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_es_iped | ? |  |  |  | high | PUT /curricular-config |
| has_es_iped | body | none found |  | esf7_school_profile.has_es_iped | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_es_mad | ? |  |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_es_mad | ? |  |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_es_mad | ? |  |  |  | high | PUT /curricular-config |
| has_es_mad | body | none found |  | esf7_school_profile.has_es_mad | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_es_sned | ? |  |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_es_sned | ? |  |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_es_sned | ? |  |  |  | high | PUT /curricular-config |
| has_es_sned | body | none found |  | esf7_school_profile.has_es_sned | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_es_iped | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_jhs_iped | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_shs_iped | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| shsInclusivePrograms | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| shs_inclusive_programs | body | none found |  | esf7_school_profile.has_iped | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_jhs_als | ? |  |  |  | low | POST /draft; PUT /draft |
| has_jhs_als | body | none found |  | esf7_school_profile.has_jhs_als | ? |  |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_jhs_als | ? |  |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_jhs_als | ? |  |  |  | high | PUT /curricular-config |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.has_jhs_inclusive | boolean | NOT NULL; default false |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_jhs_iped | ? |  |  |  | low | POST /draft; PUT /draft |
| has_jhs_iped | body | none found |  | esf7_school_profile.has_jhs_iped | ? |  |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_jhs_iped | ? |  |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_jhs_iped | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_jhs_mad | ? |  |  |  | low | POST /draft; PUT /draft |
| has_jhs_mad | body | none found |  | esf7_school_profile.has_jhs_mad | ? |  |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_jhs_mad | ? |  |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_jhs_mad | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_jhs_sned | ? |  |  |  | low | POST /draft; PUT /draft |
| has_jhs_sned | body | none found |  | esf7_school_profile.has_jhs_sned | ? |  |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_jhs_sned | ? |  |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_jhs_sned | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | sanitizeBoolean | esf7_school_profile.has_jhs_special_programs | boolean | NOT NULL; default false |  |  | low | POST /draft; PUT /draft |
| hasJhsSpecialPrograms | body | none found |  | esf7_school_profile.has_jhs_special_programs | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_jhs_special_programs | body | none found |  | esf7_school_profile.has_jhs_special_programs | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_es_mad | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_jhs_mad | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_shs_mad | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| shsInclusivePrograms | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| shs_inclusive_programs | body | none found |  | esf7_school_profile.has_madrasah | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | sanitizeBoolean | esf7_school_profile.has_shifts | ? |  |  |  | low | POST /draft; PUT /draft |
| hasShifts | body | none found |  | esf7_school_profile.has_shifts | ? |  |  |  | high | PUT /curricular-config |
| has_shifts | body | none found |  | esf7_school_profile.has_shifts | ? |  |  |  | high | PUT /curricular-config |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.has_shs_inclusive | boolean | NOT NULL; default false |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_shs_iped | ? |  |  |  | low | POST /draft; PUT /draft |
| has_shs_iped | body | none found |  | esf7_school_profile.has_shs_iped | ? |  |  |  | high | PUT /curricular-config |
| shsInclusivePrograms | body | none found |  | esf7_school_profile.has_shs_iped | ? |  |  |  | high | PUT /curricular-config |
| shs_inclusive_programs | body | none found |  | esf7_school_profile.has_shs_iped | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_shs_mad | ? |  |  |  | low | POST /draft; PUT /draft |
| has_shs_mad | body | none found |  | esf7_school_profile.has_shs_mad | ? |  |  |  | high | PUT /curricular-config |
| shsInclusivePrograms | body | none found |  | esf7_school_profile.has_shs_mad | ? |  |  |  | high | PUT /curricular-config |
| shs_inclusive_programs | body | none found |  | esf7_school_profile.has_shs_mad | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_shs_sned | ? |  |  |  | low | POST /draft; PUT /draft |
| has_shs_sned | body | none found |  | esf7_school_profile.has_shs_sned | ? |  |  |  | high | PUT /curricular-config |
| shsInclusivePrograms | body | none found |  | esf7_school_profile.has_shs_sned | ? |  |  |  | high | PUT /curricular-config |
| shs_inclusive_programs | body | none found |  | esf7_school_profile.has_shs_sned | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | low | POST /draft; PUT /draft |
| elemInclusivePrograms | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| elem_inclusive_programs | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_es_sned | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_jhs_sned | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| has_shs_sned | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhsInclusivePrograms | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| jhs_inclusive_programs | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| shsInclusivePrograms | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| shs_inclusive_programs | body | none found |  | esf7_school_profile.has_sned | boolean | NOT NULL; default false |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.id | varchar(50) | NOT NULL | PK |  | low | PUT /curricular-config; POST /draft; PUT /draft |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | String+trim | esf7_school_profile.iern | ? |  |  |  | low | POST /draft; PUT /draft |
| iern | body | none found | String+trim | esf7_school_profile.iern | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_school_profile.inclusive_programs | jsonb | nullable; default [] |  |  | low | PUT /curricular-config; POST /draft; PUT /draft |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.jhs_inclusive_programs | jsonb | nullable; default [] |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify+Array.isArray | esf7_school_profile.jhs_special_programs | jsonb | nullable; default [] |  |  | low | POST /draft; PUT /draft |
| jhsSpecialPrograms | body | none found | JSON.stringify+Array.isArray | esf7_school_profile.jhs_special_programs | jsonb | nullable; default [] |  |  | high | PUT /curricular-config |
| jhs_special_programs | body | none found | JSON.stringify+Array.isArray | esf7_school_profile.jhs_special_programs | jsonb | nullable; default [] |  |  | high | PUT /curricular-config |
| (literal/default) | — | n/a |  | esf7_school_profile.school_head_id | ? |  |  |  | high | PUT /:id/school-head |
| id | params | none found |  | esf7_school_profile.school_head_id | ? |  |  |  | high | PUT /:id/school-head |
| (literal/default) | — | n/a |  | esf7_school_profile.school_head_level | ? |  |  |  | high | PUT /:id/school-head |
| schoolHeadLevel | body | none found |  | esf7_school_profile.school_head_level | ? |  |  |  | high | PUT /:id/school-head |
| school_head_level | body | none found |  | esf7_school_profile.school_head_level | ? |  |  |  | high | PUT /:id/school-head |
| (literal/default) | — | n/a |  | esf7_school_profile.school_head_name | ? |  |  |  | high | PUT /:id/school-head |
| (server-derived) | — | n/a |  | esf7_school_profile.school_head_name | ? |  |  |  | high | PUT /:id/school-head |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.school_id | text | NOT NULL | index idx_esf7_school_profile_school_sy (school_id+school_year); unique uq_school_sy_profile (school_id+school_year) |  | low | POST /draft; PUT /draft |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_school_profile.school_id | text | NOT NULL | index idx_esf7_school_profile_school_sy (school_id+school_year); unique uq_school_sy_profile (school_id+school_year) |  | medium | PUT /curricular-config |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_school_profile.school_id | text | NOT NULL | index idx_esf7_school_profile_school_sy (school_id+school_year); unique uq_school_sy_profile (school_id+school_year) |  | medium | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_school_profile.school_year | text | NOT NULL; default '2026-2027' | index idx_esf7_school_profile_school_sy (school_id+school_year); unique uq_school_sy_profile (school_id+school_year) |  | low | POST /draft; PUT /draft |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_school_profile.school_year | text | NOT NULL; default '2026-2027' | index idx_esf7_school_profile_school_sy (school_id+school_year); unique uq_school_sy_profile (school_id+school_year) |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_school_profile.shifts_config | ? |  |  |  | low | POST /draft; PUT /draft |
| shiftsConfig | body | none found | JSON.stringify | esf7_school_profile.shifts_config | ? |  |  |  | high | PUT /curricular-config |
| shifts_config | body | none found | JSON.stringify | esf7_school_profile.shifts_config | ? |  |  |  | high | PUT /curricular-config |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_school_profile.shs_curriculum_model | text | nullable |  |  | low | POST /draft; PUT /draft |
| shsCurriculumModel _(hardcoded fallback)_ | body | none found |  | esf7_school_profile.shs_curriculum_model | text | nullable |  |  | high | PUT /curricular-config |
| shs_curriculum_model _(hardcoded fallback)_ | body | none found |  | esf7_school_profile.shs_curriculum_model | text | nullable |  |  | high | PUT /curricular-config |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_profile.shs_inclusive_programs | jsonb | nullable; default [] |  |  | medium |  |
| (server-derived) | — | n/a | expression | esf7_school_profile.updated_at | timestamp | NOT NULL; default now() |  |  | medium | PUT /:id/school-head; PUT /curricular-config; POST /draft +1 |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_subjects.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| gradeLevel _(hardcoded fallback)_ | body | none found | expression | esf7_school_subjects.grade_level | text | nullable; default 'All' |  |  | high | POST /api/school-subjects |
| grade_level _(hardcoded fallback)_ | body | none found | expression | esf7_school_subjects.grade_level | text | nullable; default 'All' |  |  | high | POST /api/school-subjects |
| id | body | none found |  | esf7_school_subjects.id | varchar(50) | NOT NULL | PK |  | high | POST /api/school-subjects |
| (literal/default) | — | n/a |  | esf7_school_subjects.is_active | boolean | NOT NULL; default true |  |  | high | POST /api/school-subjects |
| (literal/default) | — | n/a |  | esf7_school_subjects.is_custom | boolean | NOT NULL; default true |  |  | high | POST /api/school-subjects |
| band _(hardcoded fallback)_ | body | none found |  | esf7_school_subjects.key_stage | text | NOT NULL | unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) | identity | high | POST /api/school-subjects |
| keyStage _(hardcoded fallback)_ | body | none found |  | esf7_school_subjects.key_stage | text | NOT NULL | unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) | identity | high | POST /api/school-subjects |
| key_stage _(hardcoded fallback)_ | body | none found |  | esf7_school_subjects.key_stage | text | NOT NULL | unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) | identity | high | POST /api/school-subjects |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_subjects.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_school_subjects.school_id | text | NOT NULL | index idx_esf7_school_subjects_school_sy (school_id+school_year); unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) |  | high | POST /api/school-subjects |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_school_subjects.school_id | text | NOT NULL | index idx_esf7_school_subjects_school_sy (school_id+school_year); unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) |  | high | POST /api/school-subjects |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_school_subjects.school_year | text | NOT NULL | index idx_esf7_school_subjects_school_sy (school_id+school_year); unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) |  | high | POST /api/school-subjects |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_school_subjects.school_year | text | NOT NULL | index idx_esf7_school_subjects_school_sy (school_id+school_year); unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) |  | high | POST /api/school-subjects |
| shsCategory | body | none found | expression | esf7_school_subjects.shs_category | text | nullable |  |  | high | POST /api/school-subjects |
| shs_category | body | none found | expression | esf7_school_subjects.shs_category | text | nullable |  |  | high | POST /api/school-subjects |
| name | body | none found |  | esf7_school_subjects.subject_name | text | NOT NULL | unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) | identity | high | POST /api/school-subjects |
| subjectName | body | none found |  | esf7_school_subjects.subject_name | text | NOT NULL | unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) | identity | high | POST /api/school-subjects |
| subject_name | body | none found |  | esf7_school_subjects.subject_name | text | NOT NULL | unique uq_school_sy_custom_subject (school_id+school_year+subject_name+key_stage) | identity | high | POST /api/school-subjects |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_school_subjects.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (server-derived) | — | n/a | expression | esf7_shs_workload_rows.created_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_shs_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days | body | none found | JSON.stringify | esf7_shs_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.end_time | time | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| endTime | body | none found | expression | esf7_shs_workload_rows.end_time | time | nullable |  |  | high | POST /api/shs-workloads |
| end_time | body | none found | expression | esf7_shs_workload_rows.end_time | time | nullable |  |  | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.grade_level | text | NOT NULL |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| gradeLevel _(hardcoded fallback)_ | body | none found | expression | esf7_shs_workload_rows.grade_level | text | NOT NULL |  |  | high | POST /api/shs-workloads |
| grade_level _(hardcoded fallback)_ | body | none found | expression | esf7_shs_workload_rows.grade_level | text | NOT NULL |  |  | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_shs_workload_rows.id | varchar(50) | NOT NULL | PK |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| id | body | none found |  | esf7_shs_workload_rows.id | varchar(50) | NOT NULL | PK |  | high | POST /api/shs-workloads |
| personnelId | body | none found |  | esf7_shs_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_shs_workload_rows_personnel; index idx_esf7_shs_workload_rows_term (personnel_id+term); foreignKey cascade | employment | high | POST /api/shs-workloads; POST /api/workloads/bulk; PUT /api/workloads/bulk +2 |
| personnel_id | body | none found |  | esf7_shs_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_shs_workload_rows_personnel; index idx_esf7_shs_workload_rows_term (personnel_id+term); foreignKey cascade | employment | high | POST /api/shs-workloads; POST /api/workloads/bulk; PUT /api/workloads/bulk +2 |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_shs_workload_rows.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.remediation_subject | text | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| remediationSubject | body | none found | expression | esf7_shs_workload_rows.remediation_subject | text | nullable |  |  | high | POST /api/shs-workloads |
| remediation_subject | body | none found | expression | esf7_shs_workload_rows.remediation_subject | text | nullable |  |  | high | POST /api/shs-workloads |
| personnelId _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_id | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| personnel_id _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_id | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| schoolId _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_id | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_shs_workload_rows.school_id | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_id | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_shs_workload_rows.school_id | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnelId _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_year | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| personnel_id _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_year | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| schoolYear _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_year | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_shs_workload_rows.school_year | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_year _(server value with client fallback)_ | body | none found |  | esf7_shs_workload_rows.school_year | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/shs-workloads |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_shs_workload_rows.school_year | text | NOT NULL | index idx_esf7_shs_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.section_id | varchar(50) | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| sectionId | body | none found | expression | esf7_shs_workload_rows.section_id | varchar(50) | nullable |  |  | high | POST /api/shs-workloads |
| section_id | body | none found | expression | esf7_shs_workload_rows.section_id | varchar(50) | nullable |  |  | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.section_name | text | nullable |  | identity | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| sectionName | body | none found | expression | esf7_shs_workload_rows.section_name | text | nullable |  | identity | high | POST /api/shs-workloads |
| section_name | body | none found | expression | esf7_shs_workload_rows.section_name | text | nullable |  | identity | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.semester | text | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| semester | body | none found | expression | esf7_shs_workload_rows.semester | text | nullable |  |  | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.shs_subject_category | text | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| shsSubjectCategory | body | none found | expression | esf7_shs_workload_rows.shs_subject_category | text | nullable |  |  | high | POST /api/shs-workloads |
| shs_subject_category | body | none found | expression | esf7_shs_workload_rows.shs_subject_category | text | nullable |  |  | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.start_time | time | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| startTime | body | none found | expression | esf7_shs_workload_rows.start_time | time | nullable |  |  | high | POST /api/shs-workloads |
| start_time | body | none found | expression | esf7_shs_workload_rows.start_time | time | nullable |  |  | high | POST /api/shs-workloads |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.subject | text | NOT NULL |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.subject_id | varchar(50) | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| subjectId | body | none found | expression | esf7_shs_workload_rows.subject_id | varchar(50) | nullable |  |  | high | POST /api/shs-workloads |
| subject_id | body | none found | expression | esf7_shs_workload_rows.subject_id | varchar(50) | nullable |  |  | high | POST /api/shs-workloads |
| subject _(hardcoded fallback)_ | body | none found | expression | esf7_shs_workload_rows.subject | text | NOT NULL |  |  | high | POST /api/shs-workloads |
| term _(hardcoded fallback)_ | body | none found | expression | esf7_shs_workload_rows.term | text | NOT NULL; default '1st' | index idx_esf7_shs_workload_rows_term (personnel_id+term) |  | high | POST /api/shs-workloads |
| term _(hardcoded fallback)_ | body | none found | dedupeRowsById+Array.isArray | esf7_shs_workload_rows.term | text | NOT NULL; default '1st' | index idx_esf7_shs_workload_rows_term (personnel_id+term) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows _(hardcoded fallback)_ | body | none found | dedupeRowsById+Array.isArray | esf7_shs_workload_rows.term | text | NOT NULL; default '1st' | index idx_esf7_shs_workload_rows_term (personnel_id+term) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(hardcoded fallback)_ | body | none found | dedupeRowsById+Array.isArray | esf7_shs_workload_rows.term | text | NOT NULL; default '1st' | index idx_esf7_shs_workload_rows_term (personnel_id+term) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | esf7_shs_workload_rows.track_strand | text | nullable |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| trackStrand | body | none found | expression | esf7_shs_workload_rows.track_strand | text | nullable |  |  | high | POST /api/shs-workloads |
| track_strand | body | none found | expression | esf7_shs_workload_rows.track_strand | text | nullable |  |  | high | POST /api/shs-workloads |
| (server-derived) | — | n/a | expression | esf7_shs_workload_rows.updated_at | timestamp | NOT NULL; default now() |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (literal/default) | — | n/a |  | esf7_sned_sections.adviser_id | (table not in schema file) |  |  |  | high | DELETE /:id; DELETE /:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_sned_sections.adviser_id | (table not in schema file) |  |  |  | low | POST /api/sections/sned |
| femaleLearners | body | none found |  | esf7_sned_sections.female_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| female_learners | body | none found |  | esf7_sned_sections.female_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| gradeLevel _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.grade_level | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| grade_level _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.grade_level | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| id | body | none found |  | esf7_sned_sections.id | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| maleLearners | body | none found |  | esf7_sned_sections.male_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| male_learners | body | none found |  | esf7_sned_sections.male_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| femaleLearners | body | none found |  | esf7_sned_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| female_learners | body | none found |  | esf7_sned_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| maleLearners | body | none found |  | esf7_sned_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| male_learners | body | none found |  | esf7_sned_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| numberOfLearners | body | none found |  | esf7_sned_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| number_of_learners | body | none found |  | esf7_sned_sections.number_of_learners | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| programType | body | none found |  | esf7_sned_sections.program_type | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| program_type | body | none found |  | esf7_sned_sections.program_type | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.school_id | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.school_id | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.school_year | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.school_year | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| id | body | none found |  | esf7_sned_sections.section_name | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| sectionName | body | none found |  | esf7_sned_sections.section_name | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| section_name | body | none found |  | esf7_sned_sections.section_name | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| sectionType _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.section_type | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| section_type _(hardcoded fallback)_ | body | none found |  | esf7_sned_sections.section_type | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| femaleLearners | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| female_learners | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| maleLearners | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| male_learners | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| numberOfLearners | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| number_of_learners | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| sizeStatus | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| size_status | body | none found |  | esf7_sned_sections.size_status | (table not in schema file) |  |  |  | high | POST /api/sections/sned |
| certifiedBy | body | none found | expression | esf7_submission_queue.certified_by | text | nullable |  |  | high | POST /api/submissions; POST /api/validation/resubmit |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_submission_queue.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_submission_queue.error_message | text | nullable |  | identity | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_submission_queue.id | serial | NOT NULL; default serial | PK; index idx_esf7_submission_queue_status_id (status+id) |  | medium |  |
| payload | body | none found |  | esf7_submission_queue.payload | jsonb | NOT NULL; default {} |  |  | high | POST /api/submissions |
| payload | body | none found | JSON.stringify | esf7_submission_queue.payload | jsonb | NOT NULL; default {} |  |  | high | POST /api/validation/resubmit |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_submission_queue.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_submission_queue.school_id | text | NOT NULL | index idx_esf7_submission_queue_school_sy (school_id+school_year) |  | medium | POST /api/submissions |
| schoolId | body | none found |  | esf7_submission_queue.school_id | text | NOT NULL | index idx_esf7_submission_queue_school_sy (school_id+school_year) |  | high | POST /api/validation/resubmit |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_submission_queue.school_year | text | NOT NULL; default '2026-2027' | index idx_esf7_submission_queue_school_sy (school_id+school_year) |  | high | POST /api/submissions; POST /api/validation/resubmit |
| signature | body | none found | expression | esf7_submission_queue.signature | text | nullable |  | identity | high | POST /api/submissions; POST /api/validation/resubmit |
| (literal/default) | — | n/a |  | esf7_submission_queue.status | text | NOT NULL; default 'pending' | index idx_esf7_submission_queue_status_id (status+id) |  | high | POST /api/submissions; POST /api/validation/resubmit |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_submission_queue.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_validation.created_at | timestamp | nullable; default now() |  |  | medium |  |
| (literal/default) | — | n/a |  | esf7_validation.hrmo_validation | text | nullable; default 'PENDING' |  |  | high | POST /api/validation/resubmit |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_validation.id | serial | NOT NULL; default serial | PK |  | medium |  |
| (literal/default) | — | n/a |  | esf7_validation.po3_validation | text | nullable; default 'PENDING' |  |  | high | POST /api/validation/resubmit |
| schoolId | body | none found |  | esf7_validation.school_id | varchar(50) | NOT NULL | unique; index idx_esf7_validation_school_id |  | high | POST /api/validation/resubmit |
| schoolYear | body | none found |  | esf7_validation.school_year | varchar(50) | nullable; default 'SY 26-27' |  |  | high | POST /api/validation/resubmit |
| (literal/default) | — | n/a |  | esf7_validation.sections_density_validation | text | nullable; default 'PENDING' |  |  | high | POST /api/validation/resubmit |
| (literal/default) | — | n/a |  | esf7_validation.special_program_validation | text | nullable; default 'PENDING' |  |  | high | POST /api/validation/resubmit |
| (literal/default) | — | n/a |  | esf7_validation.staffing_composition_validation | text | nullable; default 'PENDING' |  | employment | high | POST /api/validation/resubmit |
| (server-derived) | — | n/a | expression | esf7_validation.updated_at | timestamp | nullable; default now() |  |  | high | POST /api/validation/resubmit |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_validation.validated_by | jsonb | nullable; default {} |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_validation.validation_details | jsonb | nullable; default {} |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_work_immersion.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_work_immersion.duration_minutes | integer | nullable; default 0 |  |  | low | POST /api/work-immersion/batch |
| endTime | body | none found |  | esf7_work_immersion.duration_minutes | integer | nullable; default 0 |  |  | high | POST /api/work-immersion |
| end_time | body | none found |  | esf7_work_immersion.duration_minutes | integer | nullable; default 0 |  |  | high | POST /api/work-immersion |
| startTime | body | none found |  | esf7_work_immersion.duration_minutes | integer | nullable; default 0 |  |  | high | POST /api/work-immersion |
| start_time | body | none found |  | esf7_work_immersion.duration_minutes | integer | nullable; default 0 |  |  | high | POST /api/work-immersion |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_work_immersion.end_time | time | NOT NULL |  |  | low | POST /api/work-immersion/batch |
| endTime | body | none found |  | esf7_work_immersion.end_time | time | NOT NULL |  |  | high | POST /api/work-immersion |
| end_time | body | none found |  | esf7_work_immersion.end_time | time | NOT NULL |  |  | high | POST /api/work-immersion |
| (server-derived) | — | n/a |  | esf7_work_immersion.id | varchar(50) | NOT NULL | PK |  | high | POST /api/work-immersion/batch |
| id | body | none found |  | esf7_work_immersion.id | varchar(50) | NOT NULL | PK |  | high | POST /api/work-immersion |
| personnelId | body | none found |  | esf7_work_immersion.personnel_id | varchar(50) | NOT NULL | index idx_esf7_work_immersion_personnel; foreignKey cascade; unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) | employment | high | POST /api/work-immersion; POST /api/work-immersion/batch |
| personnel_id | body | none found |  | esf7_work_immersion.personnel_id | varchar(50) | NOT NULL | index idx_esf7_work_immersion_personnel; foreignKey cascade; unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) | employment | high | POST /api/work-immersion; POST /api/work-immersion/batch |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_work_immersion.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| personnelId _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_id | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year) |  | medium | POST /api/work-immersion |
| personnel_id _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_id | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year) |  | medium | POST /api/work-immersion |
| schoolId _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_id | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year) |  | medium | POST /api/work-immersion |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_work_immersion.school_id | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year) |  | high | POST /api/work-immersion/batch |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_id | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year) |  | medium | POST /api/work-immersion |
| personnelId _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_year | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year); unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | medium | POST /api/work-immersion |
| personnel_id _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_year | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year); unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | medium | POST /api/work-immersion |
| schoolYear _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_year | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year); unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | medium | POST /api/work-immersion |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_work_immersion.school_year | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year); unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | high | POST /api/work-immersion/batch |
| school_year _(server value with client fallback)_ | body | none found |  | esf7_work_immersion.school_year | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year); unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | medium | POST /api/work-immersion |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_work_immersion.school_year | text | NOT NULL | index idx_esf7_work_immersion_school_sy (school_id+school_year); unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | high | POST /api/work-immersion/batch |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_work_immersion.start_time | time | NOT NULL |  |  | low | POST /api/work-immersion/batch |
| startTime | body | none found |  | esf7_work_immersion.start_time | time | NOT NULL |  |  | high | POST /api/work-immersion |
| start_time | body | none found |  | esf7_work_immersion.start_time | time | NOT NULL |  |  | high | POST /api/work-immersion |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_work_immersion.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | esf7_work_immersion.visit_date | date | NOT NULL | index idx_esf7_work_immersion_date; unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | low | POST /api/work-immersion/batch |
| date | body | none found |  | esf7_work_immersion.visit_date | date | NOT NULL | index idx_esf7_work_immersion_date; unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | high | POST /api/work-immersion |
| visitDate | body | none found |  | esf7_work_immersion.visit_date | date | NOT NULL | index idx_esf7_work_immersion_date; unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | high | POST /api/work-immersion |
| visit_date | body | none found |  | esf7_work_immersion.visit_date | date | NOT NULL | index idx_esf7_work_immersion_date; unique uq_personnel_sy_immersion_date (personnel_id+school_year+visit_date) |  | high | POST /api/work-immersion |
| (unknown) _(column list is built at runtime or the table name is dynamic; see Section 8)_ | ? | ? |  | esf7_workload_row.* | (table not in schema file) |  |  |  | low | DELETE /:id; DELETE /:id; DELETE /api/workloads/personnel/:personnel_id +1 |
| (server-derived) | — | n/a | expression | esf7_workload_rows.created_at | timestamp | NOT NULL; default now() | index idx_esf7_workload_rows_created_at_id (created_at+id) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | low | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| days | body | none found | JSON.stringify | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+targetSchoolId.replace+db.query | esf7_workload_rows.days | jsonb | nullable; default ["M", "T", "W", "TH", "F"] |  |  | medium | POST /api/workloads |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| workloadRows | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_workload_rows.end_time | time | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (whole body) | body | none found | JSON.stringify+buildExtras | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | high | PUT /api/workloads/:id |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+targetSchoolId.replace | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads |
| term _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found | JSON.stringify+buildExtras+String | esf7_workload_rows.extras | jsonb | NOT NULL; default {} |  |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | PUT /api/workloads/:id |
| workloadRows | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_workload_rows.grade_level | text | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads |
| workloadRows _(server value with client fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(server value with client fallback)_ | body | none found |  | esf7_workload_rows.id | varchar(50) | NOT NULL | PK; index idx_esf7_workload_rows_created_at_id (created_at+id) |  | medium | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| personnelId | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| personnel_id | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_rows_personnel; foreignKey cascade | employment | medium | POST /api/workloads |
| (literal/default) | — | n/a |  | esf7_workload_rows.raw_payload | ? |  |  |  | high | PUT /api/workloads/:id |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | PUT /api/workloads/:id |
| workloadRows | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_workload_rows.remediation_subject | text | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| schoolId _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| school_id _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_id | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| schoolYear _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| school_year _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.school_year | text | NOT NULL | index idx_esf7_workload_rows_school_sy (school_id+school_year) |  | medium | POST /api/workloads |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | PUT /api/workloads/:id |
| workloadRows | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_workload_rows.section_id | varchar(50) | nullable | index idx_esf7_workload_rows_section |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | PUT /api/workloads/:id |
| workloadRows | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_workload_rows.section_name | text | nullable |  | identity | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | PUT /api/workloads/:id |
| workloadRows | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_workload_rows.start_time | time | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | PUT /api/workloads/:id |
| workloadRows | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows | body | none found |  | esf7_workload_rows.subject_id | varchar(50) | nullable |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| days _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| days | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| endTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| endTime | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| end_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| end_time | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| gradeLevel _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| gradeLevel | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| grade_level _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| grade_level | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| personnelId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| personnel_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| remediationSubject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| remediationSubject | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| remediation_subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| remediation_subject | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| schoolId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| schoolYear _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| school_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| school_year _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| sectionId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| sectionId | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| sectionName _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| sectionName | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| section_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| section_id | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| section_name _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| section_name | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| startTime _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| startTime | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| start_time _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| start_time | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| subject _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| subject | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| subjectId _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| subjectId | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| subject_id _(server value with client fallback)_ _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | medium | POST /api/workloads |
| subject_id | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | PUT /api/workloads/:id |
| workloadRows _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.subject | text | NOT NULL |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| term _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.term | text | nullable; default '1st' |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workloadRows _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.term | text | nullable; default '1st' |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| workload_rows _(hardcoded fallback)_ | body | none found |  | esf7_workload_rows.term | text | nullable; default '1st' |  |  | high | POST /api/workloads/bulk; PUT /api/workloads/bulk; POST /api/workloads/personnel/:personnel_id +1 |
| (server-derived) | — | n/a | expression | esf7_workload_rows.updated_at | timestamp | NOT NULL; default now() |  |  | high | PUT /api/workloads/:id; POST /api/workloads/bulk; PUT /api/workloads/bulk +2 |
| absenceId | body | none found | expression | esf7_workload_transfer.absence_id | varchar(50) | nullable | index idx_esf7_workload_transfer_absence; foreignKey cascade |  | high | POST /api/shs-transfers |
| absence_id | body | none found | expression | esf7_workload_transfer.absence_id | varchar(50) | nullable | index idx_esf7_workload_transfer_absence; foreignKey cascade |  | high | POST /api/shs-transfers |
| (literal/default) | — | n/a |  | esf7_workload_transfer.absent_personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_transfer_absent; foreignKey cascade | employment | high | DELETE /:id; DELETE /:id |
| absentPersonnelId | body | none found |  | esf7_workload_transfer.absent_personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_transfer_absent; foreignKey cascade | employment | high | POST /api/shs-transfers |
| absent_personnel_id | body | none found |  | esf7_workload_transfer.absent_personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_transfer_absent; foreignKey cascade | employment | high | POST /api/shs-transfers |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_workload_transfer.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| endDate | body | none found |  | esf7_workload_transfer.end_date | date | NOT NULL |  |  | high | POST /api/shs-transfers |
| end_date | body | none found |  | esf7_workload_transfer.end_date | date | NOT NULL |  |  | high | POST /api/shs-transfers |
| startDate | body | none found |  | esf7_workload_transfer.end_date | date | NOT NULL |  |  | high | POST /api/shs-transfers |
| start_date | body | none found |  | esf7_workload_transfer.end_date | date | NOT NULL |  |  | high | POST /api/shs-transfers |
| id | body | none found |  | esf7_workload_transfer.id | varchar(50) | NOT NULL | PK |  | high | POST /api/shs-transfers |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_workload_transfer.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| relievingHours | body | none found | expression | esf7_workload_transfer.relieving_hours | numeric | nullable; default '1.00' |  |  | high | POST /api/shs-transfers |
| relieving_hours | body | none found | expression | esf7_workload_transfer.relieving_hours | numeric | nullable; default '1.00' |  |  | high | POST /api/shs-transfers |
| (literal/default) | — | n/a |  | esf7_workload_transfer.relieving_personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_transfer_relieving; foreignKey cascade | employment | high | DELETE /:id; DELETE /:id |
| relievingPersonnelId | body | none found |  | esf7_workload_transfer.relieving_personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_transfer_relieving; foreignKey cascade | employment | high | POST /api/shs-transfers |
| relieving_personnel_id | body | none found |  | esf7_workload_transfer.relieving_personnel_id | varchar(50) | NOT NULL | index idx_esf7_workload_transfer_relieving; foreignKey cascade | employment | high | POST /api/shs-transfers |
| relievingPersonnelId _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_id | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| relieving_personnel_id _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_id | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| schoolId _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_id | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| school_id _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_id | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| relievingPersonnelId _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_year | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| relieving_personnel_id _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_year | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| schoolYear _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_year | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| school_year _(server value with client fallback)_ | body | none found |  | esf7_workload_transfer.school_year | text | NOT NULL |  |  | medium | POST /api/shs-transfers |
| startDate | body | none found |  | esf7_workload_transfer.start_date | date | NOT NULL |  |  | high | POST /api/shs-transfers |
| start_date | body | none found |  | esf7_workload_transfer.start_date | date | NOT NULL |  |  | high | POST /api/shs-transfers |
| subject _(hardcoded fallback)_ | body | none found |  | esf7_workload_transfer.subject | text | NOT NULL |  |  | high | POST /api/shs-transfers |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | esf7_workload_transfer.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| workloadId | body | none found |  | esf7_workload_transfer.workload_id | varchar(50) | NOT NULL |  |  | high | POST /api/shs-transfers |
| workload_id | body | none found |  | esf7_workload_transfer.workload_id | varchar(50) | NOT NULL |  |  | high | POST /api/shs-transfers |
| workloadType _(hardcoded fallback)_ | body | none found | expression | esf7_workload_transfer.workload_type | text | NOT NULL; default 'ELEM_JHS' |  |  | high | POST /api/shs-transfers |
| workload_type _(hardcoded fallback)_ | body | none found | expression | esf7_workload_transfer.workload_type | text | NOT NULL; default 'ELEM_JHS' |  |  | high | POST /api/shs-transfers |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_absences.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| endDate | body | none found |  | overload_absences.end_date | date | NOT NULL | index idx_overload_absences_dates (start_date+end_date) |  | high | POST /api/absences |
| end_date | body | none found |  | overload_absences.end_date | date | NOT NULL | index idx_overload_absences_dates (start_date+end_date) |  | high | POST /api/absences |
| startDate | body | none found |  | overload_absences.end_date | date | NOT NULL | index idx_overload_absences_dates (start_date+end_date) |  | high | POST /api/absences |
| start_date | body | none found |  | overload_absences.end_date | date | NOT NULL | index idx_overload_absences_dates (start_date+end_date) |  | high | POST /api/absences |
| id | body | none found |  | overload_absences.id | varchar(50) | NOT NULL | PK |  | high | POST /api/absences |
| leaveType _(hardcoded fallback)_ | body | none found | expression | overload_absences.leave_type | text | NOT NULL; default 'SICK_LEAVE' |  |  | high | POST /api/absences |
| leave_type _(hardcoded fallback)_ | body | none found | expression | overload_absences.leave_type | text | NOT NULL; default 'SICK_LEAVE' |  |  | high | POST /api/absences |
| personnelId | body | none found |  | overload_absences.personnel_id | varchar(50) | NOT NULL | index idx_overload_absences_personnel; foreignKey cascade | employment | high | POST /api/absences |
| personnel_id | body | none found |  | overload_absences.personnel_id | varchar(50) | NOT NULL | index idx_overload_absences_personnel; foreignKey cascade | employment | high | POST /api/absences |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_absences.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| personnelId _(server value with client fallback)_ | body | none found |  | overload_absences.school_id | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| personnel_id _(server value with client fallback)_ | body | none found |  | overload_absences.school_id | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| schoolId _(server value with client fallback)_ | body | none found |  | overload_absences.school_id | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| school_id _(server value with client fallback)_ | body | none found |  | overload_absences.school_id | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| personnelId _(server value with client fallback)_ | body | none found |  | overload_absences.school_year | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| personnel_id _(server value with client fallback)_ | body | none found |  | overload_absences.school_year | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| schoolYear _(server value with client fallback)_ | body | none found |  | overload_absences.school_year | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| school_year _(server value with client fallback)_ | body | none found |  | overload_absences.school_year | text | NOT NULL | index idx_overload_absences_school_sy (school_id+school_year) |  | medium | POST /api/absences |
| startDate | body | none found |  | overload_absences.start_date | date | NOT NULL | index idx_overload_absences_dates (start_date+end_date) |  | high | POST /api/absences |
| start_date | body | none found |  | overload_absences.start_date | date | NOT NULL | index idx_overload_absences_dates (start_date+end_date) |  | high | POST /api/absences |
| totalDays | body | none found | expression | overload_absences.total_days | integer | nullable; default 1 |  |  | high | POST /api/absences |
| total_days | body | none found | expression | overload_absences.total_days | integer | nullable; default 1 |  |  | high | POST /api/absences |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_absences.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| actualRenderedMinutes | body | none found |  | overload_late_undertime.actual_rendered_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| actual_rendered_minutes | body | none found |  | overload_late_undertime.actual_rendered_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missedMinutes | body | none found |  | overload_late_undertime.actual_rendered_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missedTeachingMinutes | body | none found |  | overload_late_undertime.actual_rendered_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missed_teaching_minutes | body | none found |  | overload_late_undertime.actual_rendered_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| scheduledTeachingMinutes | body | none found |  | overload_late_undertime.actual_rendered_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| scheduled_teaching_minutes | body | none found |  | overload_late_undertime.actual_rendered_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| id _(server value with client fallback)_ | body | none found |  | overload_late_undertime.id | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| isExcused | body | none found |  | overload_late_undertime.is_excused | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| is_excused | body | none found |  | overload_late_undertime.is_excused | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| lateMinutes | body | none found |  | overload_late_undertime.late_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| late_minutes | body | none found |  | overload_late_undertime.late_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| date | body | none found |  | overload_late_undertime.log_date | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| logDate | body | none found |  | overload_late_undertime.log_date | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| log_date | body | none found |  | overload_late_undertime.log_date | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| startDate | body | none found |  | overload_late_undertime.log_date | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| tardinessDate | body | none found |  | overload_late_undertime.log_date | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| tardiness_date | body | none found |  | overload_late_undertime.log_date | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| leaveType _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.log_type | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| logType _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.log_type | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| log_type _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.log_type | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missedSlotIds | body | none found | JSON.stringify+Array.isArray | overload_late_undertime.missed_slot_ids | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missed_slot_ids | body | none found | JSON.stringify+Array.isArray | overload_late_undertime.missed_slot_ids | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missedMinutes | body | none found |  | overload_late_undertime.missed_teaching_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missedTeachingMinutes | body | none found |  | overload_late_undertime.missed_teaching_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| missed_teaching_minutes | body | none found |  | overload_late_undertime.missed_teaching_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| date _(server value with client fallback)_ | body | none found |  | overload_late_undertime.month | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| logDate _(server value with client fallback)_ | body | none found |  | overload_late_undertime.month | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| log_date _(server value with client fallback)_ | body | none found |  | overload_late_undertime.month | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| month _(server value with client fallback)_ | body | none found |  | overload_late_undertime.month | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| startDate _(server value with client fallback)_ | body | none found |  | overload_late_undertime.month | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| tardinessDate _(server value with client fallback)_ | body | none found |  | overload_late_undertime.month | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| tardiness_date _(server value with client fallback)_ | body | none found |  | overload_late_undertime.month | (table not in schema file) |  |  |  | medium | POST /api/overload-late-undertime |
| personnelId | body | none found |  | overload_late_undertime.personnel_id | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| personnel_id | body | none found |  | overload_late_undertime.personnel_id | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| reason | body | none found |  | overload_late_undertime.reason | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| scheduledTeachingMinutes | body | none found |  | overload_late_undertime.scheduled_teaching_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| scheduled_teaching_minutes | body | none found |  | overload_late_undertime.scheduled_teaching_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| schoolId _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.school_id | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| school_id _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.school_id | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| x-school-id _(hardcoded fallback)_ | headers | none found |  | overload_late_undertime.school_id | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| schoolYear _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.school_year | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| school_year _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.school_year | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| term _(hardcoded fallback)_ | body | none found |  | overload_late_undertime.term | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| timeIn | body | none found |  | overload_late_undertime.time_in | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| time_in | body | none found |  | overload_late_undertime.time_in | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| timeOut | body | none found |  | overload_late_undertime.time_out | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| time_out | body | none found |  | overload_late_undertime.time_out | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| lateMinutes | body | none found |  | overload_late_undertime.total_dtr_deficit_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| late_minutes | body | none found |  | overload_late_undertime.total_dtr_deficit_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| totalDtrDeficitMinutes | body | none found |  | overload_late_undertime.total_dtr_deficit_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| total_dtr_deficit_minutes | body | none found |  | overload_late_undertime.total_dtr_deficit_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| undertimeMinutes | body | none found |  | overload_late_undertime.total_dtr_deficit_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| undertime_minutes | body | none found |  | overload_late_undertime.total_dtr_deficit_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| undertimeMinutes | body | none found |  | overload_late_undertime.undertime_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| undertime_minutes | body | none found |  | overload_late_undertime.undertime_minutes | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| (server-derived) | — | n/a | expression | overload_late_undertime.updated_at | (table not in schema file) |  |  |  | high | POST /api/overload-late-undertime |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_no_work.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| division _(hardcoded fallback)_ | body | none found |  | overload_no_work.division | text | NOT NULL | index idx_overload_no_work_region_div (region+division); unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| eventType _(hardcoded fallback)_ | body | none found |  | overload_no_work.event_type | text | NOT NULL |  |  | high | POST /api/overload-no-work |
| event_type _(hardcoded fallback)_ | body | none found |  | overload_no_work.event_type | text | NOT NULL |  |  | high | POST /api/overload-no-work |
| id | body | none found |  | overload_no_work.id | varchar(50) | NOT NULL | PK |  | high | POST /api/overload-no-work |
| date | body | none found |  | overload_no_work.no_work_date | date | NOT NULL | index idx_overload_no_work_date; unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| noWorkDate | body | none found |  | overload_no_work.no_work_date | date | NOT NULL | index idx_overload_no_work_date; unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| no_work_date | body | none found |  | overload_no_work.no_work_date | date | NOT NULL | index idx_overload_no_work_date; unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_no_work.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| region _(hardcoded fallback)_ | body | none found |  | overload_no_work.region | text | NOT NULL | index idx_overload_no_work_region_div (region+division); unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| schoolId _(hardcoded fallback)_ | body | none found |  | overload_no_work.school_id | text | NOT NULL; default 'ALL' | index idx_overload_no_work_school (school_id+school_year); unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| school_id _(hardcoded fallback)_ | body | none found |  | overload_no_work.school_id | text | NOT NULL; default 'ALL' | index idx_overload_no_work_school (school_id+school_year); unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| schoolYear _(hardcoded fallback)_ | body | none found |  | overload_no_work.school_year | text | NOT NULL | index idx_overload_no_work_school (school_id+school_year); unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| school_year _(hardcoded fallback)_ | body | none found |  | overload_no_work.school_year | text | NOT NULL | index idx_overload_no_work_school (school_id+school_year); unique uq_region_div_school_date (region+division+school_id+school_year+no_work_date) |  | high | POST /api/overload-no-work |
| description _(hardcoded fallback)_ | body | none found |  | overload_no_work.title | text | NOT NULL |  |  | high | POST /api/overload-no-work |
| name _(hardcoded fallback)_ | body | none found |  | overload_no_work.title | text | NOT NULL |  |  | high | POST /api/overload-no-work |
| title _(hardcoded fallback)_ | body | none found |  | overload_no_work.title | text | NOT NULL |  |  | high | POST /api/overload-no-work |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_no_work.updated_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_pay_and_reason.actual_amount | numeric | nullable |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_pay_and_reason.confirmed_at | timestamp | nullable |  |  | medium |  |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_pay_and_reason.created_at | timestamp | NOT NULL; default now() |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | overload_pay_and_reason.id | varchar(50) | NOT NULL | PK |  | low | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync +1 |
| id | body | none found |  | overload_pay_and_reason.id | varchar(50) | NOT NULL | PK |  | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_pay_and_reason.is_confirmed | boolean | nullable; default false |  |  | medium |  |
| (literal/default) | — | n/a |  | overload_pay_and_reason.month | text | nullable | index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) |  | medium | POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | overload_pay_and_reason.month | text | nullable | index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) |  | low | POST /api/overload-pay-and-reason/batch; POST /api/overload-reasons/batch |
| month | body | none found |  | overload_pay_and_reason.month | text | nullable | index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) |  | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | overload_pay_and_reason.net_term_pay | numeric | nullable; default '0.00", |  | financial | low | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync +1 |
| netTermPay | body | none found |  | overload_pay_and_reason.net_term_pay | numeric | nullable; default '0.00", |  | financial | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| net_term_pay | body | none found |  | overload_pay_and_reason.net_term_pay | numeric | nullable; default '0.00", |  | financial | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| overloadPay | body | none found |  | overload_pay_and_reason.net_term_pay | numeric | nullable; default '0.00", |  | financial | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| overload_pay | body | none found |  | overload_pay_and_reason.net_term_pay | numeric | nullable; default '0.00", |  | financial | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | overload_pay_and_reason.overload_hours | numeric | nullable; default '0.00' |  |  | low | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync +1 |
| overloadHours | body | none found |  | overload_pay_and_reason.overload_hours | numeric | nullable; default '0.00' |  |  | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| overload_hours | body | none found |  | overload_pay_and_reason.overload_hours | numeric | nullable; default '0.00' |  |  | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | overload_pay_and_reason.overload_pay | numeric | nullable; default '0.00", |  | financial | low | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync +1 |
| overloadPay | body | none found |  | overload_pay_and_reason.overload_pay | numeric | nullable; default '0.00", |  | financial | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| overload_pay | body | none found |  | overload_pay_and_reason.overload_pay | numeric | nullable; default '0.00", |  | financial | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | overload_pay_and_reason.personnel_id | varchar(50) | NOT NULL | index idx_overload_pay_reason_personnel; index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); foreignKey cascade; unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) | employment | low | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync +1 |
| personnelId | body | none found |  | overload_pay_and_reason.personnel_id | varchar(50) | NOT NULL | index idx_overload_pay_reason_personnel; index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); foreignKey cascade; unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) | employment | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| personnel_id | body | none found |  | overload_pay_and_reason.personnel_id | varchar(50) | NOT NULL | index idx_overload_pay_reason_personnel; index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); foreignKey cascade; unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) | employment | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| (default) _(not set by any detected write; DB default or NULL)_ | — | n/a |  | overload_pay_and_reason.raw_payload | jsonb | nullable; default {} |  |  | medium |  |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | overload_pay_and_reason.reasons | jsonb | nullable; default [] |  |  | low | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/batch +1 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify+Array.isArray | overload_pay_and_reason.reasons | jsonb | nullable; default [] |  |  | low | POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync |
| (server-derived) | — | n/a |  | overload_pay_and_reason.school_id | text | NOT NULL | index idx_overload_pay_reason_school_sy (school_id+school_year) |  | high | POST /api/overload-pay-and-reason/batch; POST /api/overload-reasons/batch |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | overload_pay_and_reason.school_id | text | NOT NULL | index idx_overload_pay_reason_school_sy (school_id+school_year) |  | low | POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync |
| personnelId _(server value with client fallback)_ | body | none found |  | overload_pay_and_reason.school_id | text | NOT NULL | index idx_overload_pay_reason_school_sy (school_id+school_year) |  | medium | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| personnel_id _(server value with client fallback)_ | body | none found |  | overload_pay_and_reason.school_id | text | NOT NULL | index idx_overload_pay_reason_school_sy (school_id+school_year) |  | medium | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| schoolYear | body | none found |  | overload_pay_and_reason.school_year | text | NOT NULL | index idx_overload_pay_reason_school_sy (school_id+school_year); index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) |  | medium | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/save; POST /api/overload-pay-and-reason/sync +3 |
| school_year _(hardcoded fallback)_ | body | none found |  | overload_pay_and_reason.school_year | text | NOT NULL | index idx_overload_pay_reason_school_sy (school_id+school_year); index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) |  | high | POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/save |
| (literal/default) | — | n/a |  | overload_pay_and_reason.term | text | NOT NULL; default 'Term 1' | index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) |  | medium | POST /api/overload-pay-and-reason/sync; POST /api/overload-reasons/sync |
| term | body | none found |  | overload_pay_and_reason.term | text | NOT NULL; default 'Term 1' | index idx_overload_pay_reason_term_month (personnel_id+school_year+term+month); unique uq_personnel_sy_term_month_overload (personnel_id+school_year+term+month) |  | high | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/batch +1 |
| (server-derived) | — | n/a | expression | overload_pay_and_reason.updated_at | timestamp | NOT NULL; default now() |  |  | medium | POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/save; POST /api/overload-pay-and-reason/sync +3 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | school_calendar_terms.block_type | (table not in schema file) |  |  |  | low | POST /api/reports/calendar-terms |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | school_calendar_terms.end_date | (table not in schema file) |  |  |  | low | POST /api/reports/calendar-terms |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | school_calendar_terms.is_teaching | (table not in schema file) |  |  |  | low | POST /api/reports/calendar-terms |
| school_id | body | none found |  | school_calendar_terms.school_id | (table not in schema file) |  |  |  | high | POST /api/reports/calendar-terms |
| school_year _(hardcoded fallback)_ | body | none found | expression | school_calendar_terms.school_year | (table not in schema file) |  |  |  | high | POST /api/reports/calendar-terms |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | school_calendar_terms.start_date | (table not in schema file) |  |  |  | low | POST /api/reports/calendar-terms |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | school_calendar_terms.term_name | (table not in schema file) |  |  |  | low | POST /api/reports/calendar-terms |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | JSON.stringify | school_drafts.payload | jsonb | NOT NULL; default {} |  |  | low | DELETE /:id; DELETE /:id; PUT /:id/school-head +2 |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | school_drafts.school_id | text | NOT NULL | primaryKey (school_id+school_year) |  | low | POST /draft; PUT /draft |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | school_drafts.school_year | text | NOT NULL | primaryKey (school_id+school_year) |  | low | POST /draft; PUT /draft |
| (server-derived) | — | n/a | expression | school_drafts.updated_at | timestamp | NOT NULL; default now() |  |  | high | DELETE /:id; DELETE /:id; PUT /:id/school-head +2 |
| (literal/default) | — | n/a |  | schools.division | (table not in schema file) |  |  |  | high | POST /shifts; PUT /subjects |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? | expression | schools.id | (table not in schema file) |  |  |  | low | POST /shifts; PUT /subjects |
| shifts | body | none found | parseInt | schools.number_of_shifts | (table not in schema file) |  |  |  | high | POST /shifts |
| (literal/default) | — | n/a |  | schools.region | (table not in schema file) |  |  |  | high | POST /shifts; PUT /subjects |
| (server-derived) | — | n/a |  | schools.school_id | (table not in schema file) |  |  |  | high | POST /shifts; PUT /subjects |
| (literal/default) | — | n/a |  | schools.school_name | (table not in schema file) |  |  |  | high | POST /shifts; PUT /subjects |
| (literal/default) | — | n/a |  | schools.school_year | (table not in schema file) |  |  |  | high | POST /shifts; PUT /subjects |
| subjectsConfig | body | none found | JSON.stringify | schools.subjects_config | (table not in schema file) |  |  |  | high | PUT /subjects |
| absentTeacherId | body | none found |  | workload_transfers.absent_personnel_id | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| endDate | body | none found |  | workload_transfers.end_date | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| (server-derived) | — | n/a |  | workload_transfers.id | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| loggedBy _(hardcoded fallback)_ | body | none found | expression | workload_transfers.logged_by | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| reason | body | none found | expression | workload_transfers.reason | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| schoolId _(hardcoded fallback)_ | body | none found | expression | workload_transfers.school_id | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| schoolYear _(hardcoded fallback)_ | body | none found | expression | workload_transfers.school_year | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| startDate | body | none found |  | workload_transfers.start_date | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| (literal/default) | — | n/a |  | workload_transfers.status | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| status | body | none found |  | workload_transfers.status | (table not in schema file) |  |  |  | high | PUT /api/transfers/:id |
| substituteTeacherId | body | none found |  | workload_transfers.substitute_personnel_id | (table not in schema file) |  |  |  | high | POST /api/transfers/batch |
| (server-derived) | — | n/a | expression | workload_transfers.updated_at | (table not in schema file) |  |  |  | high | PUT /api/transfers/:id |
| (unknown) _(value comes from a parameter or expression the scanner could not trace)_ | ? | ? |  | workload_transfers.workload_row_id | (table not in schema file) |  |  |  | low | POST /api/transfers/batch |

### 5.2 Unmapped client fields

Fields the handler reads (or the validator declares) that were not traced into any column of that route's writes.

- **POST /**: body.certificationRows, body.collegeDegrees, body.college_degrees, body.designation, body.designations, body.eligibility, body.neapTrainingRows, body.otherTrainingRows, body.prn
- **PUT /:id**: body.collegeDegrees, body.college_degrees, body.disabledServiceYears, body.disabled_service_years, body.hasMultipleHeads _(whole body is also stored, so some of these may be inside a JSON column)_
- **PUT /:id/school-head**: body.hasMultipleHeads, body.schoolId, body.school_id, query.schoolId, query.school_id
- **DELETE /api/absences/:id**: params.id
- **GET /api/allowances**: headers.x-school-id, query.schoolId, query.school_id
- **POST /api/allowances/disable**: body.allowanceKey, body.isDisabled, body.personnelId, body.schoolYear
- **POST /api/allowances/toggle**: body.allowanceKey, body.amount
- **POST /api/auth/master-login**: body.identifier, body.password, body.school_id
- **POST /api/auth/migrate-login**: body.identifier, body.password, body.school_id
- **POST /api/auth/passcode-login**: body.email, body.identifier, body.passcode, body.pin, body.school_id
- **POST /api/auth/password-login**: body.identifier, body.password, body.school_id
- **POST /api/auth/pin-login**: body.email, body.identifier, body.passcode, body.pin, body.school_id
- **DELETE /api/designations/:id**: params.id
- **POST /api/esf7-upload/import-converted**: body.old_school_id, body.school_id
- **DELETE /api/extra-tasks/:id**: params.id
- **POST /api/learning-areas/toggle**: body.checked, body.learningArea, body.schoolYear, body.yearsTaught
- **PUT /api/node-status/personnel/:personnelId/:nodeId**: params.nodeId
- **PUT /api/node-status/school/:nodeId**: params.nodeId
- **DELETE /api/overload-late-undertime/:id**: params.id
- **DELETE /api/overload-no-work/:id**: params.id
- **POST /api/overload-pay-and-reason/batch**: body.items
- **POST /api/overload-pay-and-reason/save**: body.reasons
- **POST /api/overload-pay-and-reason/sync**: body.schoolId
- **POST /api/overload-reasons/batch**: body.items
- **POST /api/overload-reasons/save**: body.reasons
- **POST /api/overload-reasons/sync**: body.schoolId
- **POST /api/qualifications/:personnel_id**: body.collegeDegrees, body.college_degrees, body.eligibility
- **POST /api/reports/calendar-terms**: body.terms
- **POST /api/reports/generate-overload-pay**: body.calendar_overrides, body.months, body.school_id, body.school_year
- **POST /api/requests/:id/respond**: params.id
- **POST /api/requests/clustered/:prn/sync**: body.slots
- **POST /api/room-profiling/accept**: body.profileData, body.schoolId, body.school_id, body.selectedFields, body.submission, body.submissions
- **POST /api/room-profiling/ack**: body.personnelIds, body.schoolId, body.school_id, body.submissionIds
- **POST /api/room-profiling/record-attempt**: body.isSuccess, body.passcode, body.personnelId, body.personnel_id
- **POST /api/room-profiling/sync-roster**: body.roster, body.schoolId, body.school_id
- **POST /api/room-profiling/verify-passcode**: body.passcode, body.schoolId, body.school_id
- **DELETE /api/school-subjects/:id**: params.id
- **DELETE /api/sections/:id**: headers.x-school-id, params.id, query.schoolId, query.school_id
- **POST /api/sections/als**: body.adviserId, body.adviser_id, body.advisorId, body.advisor_id
- **DELETE /api/sections/als/:id**: params.id
- **POST /api/sections/aral**: body.tutorId, body.tutor_id
- **DELETE /api/sections/aral/:id**: params.id
- **DELETE /api/sections/clear-all**: query.schoolId, query.school_id
- **DELETE /api/sections/regular/:id**: params.id
- **POST /api/sections/regular/sync**: body.deletedIds, body.schoolId, body.schoolYear, body.sections
- **POST /api/sections/remedial-enrichment**: body.adviserId, body.adviser_id, body.assignedTeacherId, body.assigned_teacher_id
- **DELETE /api/sections/remedial-enrichment/:id**: params.id
- **POST /api/sections/sned**: body.adviserId, body.adviser_id, body.advisorId, body.advisor_id
- **DELETE /api/sections/sned/:id**: params.id
- **DELETE /api/shs-transfers/:id**: params.id
- **DELETE /api/shs-workloads/:id**: params.id
- **DELETE /api/shs-workloads/personnel/:personnel_id**: params.personnel_id
- **DELETE /api/shs-workloads/school/:school_id**: params.school_id
- **DELETE /api/trainings/:id**: params.id
- **PUT /api/trainings/personnel/:personnel_id**: body.certificationRows, body.neapTrainingRows, body.otherTrainingRows
- **PUT /api/transfers/:id**: params.id
- **POST /api/transfers/batch**: body.workloadRows
- **DELETE /api/work-immersion/:id**: params.id
- **POST /api/work-immersion/batch**: body.schedules
- **DELETE /api/work-immersion/date**: body.date, body.personnelId, body.personnel_id, body.schoolYear, body.school_year, body.visit_date
- **DELETE /api/workloads/:id**: params.id
- **PUT /api/workloads/:id**: params.id _(whole body is also stored, so some of these may be inside a JSON column)_
- **POST /api/workloads/bulk**: body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.shsWorkloads
- **PUT /api/workloads/bulk**: body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.shsWorkloads
- **DELETE /api/workloads/personnel/:personnel_id**: params.personnel_id
- **POST /api/workloads/personnel/:personnel_id**: body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.shsWorkloads
- **PUT /api/workloads/personnel/:personnel_id**: body.assignedGradeLevels, body.assigned_grade_levels, body.gradeLevelsTaught, body.grade_levels_taught, body.shsWorkloads
- **DELETE /api/workloads/personnel/:personnel_id/term/:term**: params.personnel_id, params.term
- **DELETE /api/workloads/school/:school_id**: params.school_id
- **DELETE /api/workloads/term-clear/school**: query.term
- **DELETE /draft**: query.schoolYear
- **POST /draft**: body.allowSectionDeletion, body.baseVersion, body.payload, body.schoolYear, headers.x-smoke-test, headers.x-sync-normalize, query.schoolId, query.school_id
- **PUT /draft**: body.allowSectionDeletion, body.baseVersion, body.payload, body.schoolYear, headers.x-smoke-test, headers.x-sync-normalize, query.schoolId, query.school_id
- **POST /share**: body.target_school_ids

### 5.3 Unmapped columns

Columns of written tables that no detected write sets (they rely on DB defaults, NULL, or code the scanner did not reach).

- **clustered_personnel**: id
- **esf7_aral_sections**: raw_payload, created_at, updated_at, term
- **esf7_link**: row_count, preview_data, summary, audit_remarks
- **esf7_personnel_allowances**: created_at, updated_at
- **esf7_personnel_designations**: created_at, updated_at
- **esf7_personnel_employment**: created_at
- **esf7_personnel_extra_tasks**: raw_payload, created_at, updated_at
- **esf7_personnel_id_mapping**: created_at
- **esf7_personnel_ld_trainings**: raw_payload, created_at, updated_at
- **esf7_personnel_learning_areas**: raw_payload, created_at
- **esf7_personnel_profile**: term
- **esf7_personnel_submission**: created_at
- **esf7_perssonel_educ**: raw_payload, created_at, updated_at
- **esf7_regular_sections**: created_at, term
- **esf7_remedial_enrichment_sections**: raw_payload, created_at, updated_at, term
- **esf7_requests**: school_year, created_at
- **esf7_room_submissions_staging**: id (NOT NULL, no default), school_id (NOT NULL, no default), personnel_id (NOT NULL, no default), personnel_name, room, profile_data (NOT NULL, no default), submitted_at, submitted_timestamp
- **esf7_school_profile**: has_elem_inclusive, elem_inclusive_programs, has_jhs_inclusive, jhs_inclusive_programs, has_shs_inclusive, shs_inclusive_programs, extras, created_at
- **esf7_school_subjects**: raw_payload, created_at, updated_at
- **esf7_shs_workload_rows**: raw_payload
- **esf7_submission_queue**: id, error_message, raw_payload, created_at, updated_at
- **esf7_validation**: id, validation_details, validated_by, created_at
- **esf7_work_immersion**: raw_payload, created_at, updated_at
- **esf7_workload_transfer**: raw_payload, created_at, updated_at
- **overload_absences**: raw_payload, created_at, updated_at
- **overload_no_work**: raw_payload, created_at, updated_at
- **overload_pay_and_reason**: raw_payload, created_at, is_confirmed, actual_amount, confirmed_at

## 6. Client save behavior

76 non-GET client calls of 133 total. Behavior flags come from a window of code around each call (and from the whole file when marked _file_).

| Trigger (file:line) | Call | Linked route | Retry/backoff | Draft handling | Unload / logout | Idempotency key | Confidence |
|---|---|---|---|---|---|---|---|
| client/src/services/api.js:312 | PUT /school<br>body is variable data | PUT /:id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:320 | PUT /school-info/subjects<br>body keys: subjectsConfig | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:328 | PUT /schools/curricular-config<br>body is variable configData | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:375 | POST /personnel/bulk<br>body keys: personnelList, schoolId, schoolYear | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:383 | POST /personnel/bulk-harvester-import<br>body keys: personnelList, schoolId | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:394 | POST /personnel<br>body is variable data | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:402 | DELETE /personnel/{id}<br>body is variable meta | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:410 | PUT /personnel/{id}<br>body is variable data | PUT /:id/school-head | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:418 | PUT /personnel/{id}/verify<br>body keys: field, value | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:430 | PUT /school-head-sdo<br>body is variable record | PUT /:id; PUT /api/school-head-sdo | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:438 | PUT /personnel/{id}/school-head<br>body keys: ...extra, isMainSh, isSchoolHead | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:448 | POST /workloads/bulk<br>body is variable data | POST /api/workloads/bulk | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:477 | DELETE /workloads/personnel/{encodeURIComponentpersonnelId}/term/{encodeURIComponentterm}?schoolId={encodeURIComponentcleanId} | DELETE /api/workloads/personnel/:personnel_id/term/:term | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:488 | DELETE /workloads/term-clear/school?schoolId={encodeURIComponentcleanId}&term={encodeURIComponentterm} | DELETE /api/workloads/term-clear/school | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:497 | PUT /employment/{personnelId}<br>body is variable data | PUT /:id/school-head; PUT /api/employment/:personnel_id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:507 | PUT /qualifications/{personnelId}<br>body is variable data | PUT /:id/school-head; PUT /api/qualifications/:personnel_id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:520 | POST /trainings<br>body is variable data | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:528 | PUT /trainings/personnel/{personnelId}<br>body is variable data | PUT /api/trainings/personnel/:personnel_id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:539 | DELETE /trainings/{id} | DELETE /api/trainings/:id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:559 | POST /sections/regular/sync<br>body keys: deletedIds, schoolId, schoolYear, sections | POST /api/sections/regular/sync | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:579 | POST /sections/regular<br>body is variable data | POST /api/sections/regular | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:587 | POST /sections/aral<br>body is variable data | POST /api/sections/aral | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:595 | POST /sections/remedial-enrichment<br>body is variable data | POST /api/sections/remedial-enrichment | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:612 | POST /sections/regular<br>body keys: adviserId, adviser_id, advisory_minutes, hgp_minutes, id, number_of_learners | POST /api/sections/regular | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:632 | DELETE /sections/{encodeURIComponentid} | DELETE /api/sections/:id; DELETE /api/sections/clear-all | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:641 | DELETE /sections/clear-all?schoolId={encodeURIComponentschoolId} | DELETE /api/sections/:id; DELETE /api/sections/clear-all | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:652 | POST /workloads<br>body is variable data | POST /api/workloads | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:665 | PUT /workloads/personnel/{personnelId}<br>body keys: administrativeRows, teachingRelatedRows, workloadRows | PUT /api/workloads/personnel/:personnel_id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:680 | DELETE /workloads/{id} | DELETE /api/workloads/:id; DELETE /api/workloads/clear-all | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:692 | POST /transfers/batch<br>body is variable data | POST /api/transfers/batch | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:700 | PUT /transfers/{id}<br>body keys: status | PUT /:id/school-head; PUT /api/transfers/:id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:727 | POST /overload-late-undertime<br>body is variable data | POST /api/overload-late-undertime | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:735 | DELETE /overload-late-undertime/{encodeURIComponentid} | DELETE /api/overload-late-undertime/:id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:757 | POST /allowances/toggle<br>body keys: allowanceKey, isGranted, personnelId, schoolYear | POST /api/allowances/toggle | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:775 | POST /allowances/disable<br>body keys: allowanceKey, isDisabled, personnelId, schoolYear | POST /api/allowances/disable | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:792 | POST /allowances/bulk<br>body keys: allowances, personnelId, schoolYear | POST /api/allowances/bulk | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:818 | POST /overload-reasons/save<br>body keys: month, netTermPay, overloadHours, overloadPay, personnelId, rawPayload, reasons, schoolYear, term | POST /api/overload-reasons/save | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:840 | POST /overload-reasons/batch<br>body keys: items, schoolYear, term | POST /api/overload-reasons/batch | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:861 | POST /work-immersion/batch<br>body keys: personnelId, schedules, schoolId, schoolYear | POST /api/work-immersion/batch | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:873 | DELETE /work-immersion/date<br>body keys: date, personnelId, schoolYear | DELETE /api/work-immersion/:id; DELETE /api/work-immersion/date | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:896 | POST /learning-areas/toggle<br>body keys: checked, learningArea, personnelId, schoolYear, yearsTaught | POST /api/learning-areas/:personnel_id; POST /api/learning-areas/toggle | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:921 | POST /extra-tasks/batch<br>body keys: personnelId, tasks | POST /api/extra-tasks/batch | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:936 | POST /personnel/share<br>body keys: first_name, last_name, prn, target_school_ids | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:946 | POST /room-profiling/submit<br>body is variable data | POST /api/room-profiling/submit | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:967 | POST /room-profiling/sync-roster<br>body keys: roster, schoolId | POST /api/room-profiling/sync-roster | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1001 | POST /room-profiling/verify-passcode<br>body keys: passcode, schoolId | POST /api/room-profiling/verify-passcode | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1032 | POST /room-profiling/ack<br>body keys: personnelIds, schoolId, submissionIds | POST /api/room-profiling/ack | _file_ | _file_ | — | possible | high |
| client/src/services/api.js:1046 | POST /room-profiling/accept<br>body keys: schoolId, selectedFields, submission, submissions | POST /api/room-profiling/accept | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1073 | POST /room-profiling/snapshots<br>body keys: personnel, schoolId, snapshotName | POST /api/room-profiling/snapshots | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1110 | POST /room-profiling/record-attempt<br>body keys: isSuccess, passcode, personnelId, schoolId | POST /api/room-profiling/record-attempt | yes (no jitter seen) | _file_ | — | none seen | high |
| client/src/services/api.js:1123 | POST /absences<br>body is variable data | POST /api/absences | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1131 | DELETE /absences/{id} | DELETE /api/absences/:id | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1141 | POST /submissions<br>body is variable data | POST /api/submissions | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1192 | DELETE /school/draft?schoolYear={encodeURIComponentschoolYear} | unlinked | _file_ | yes | — | none seen | high |
| client/src/services/api.js:1220 | PUT /node-status/school/{encodeURIComponentnodeId}<br>body keys: overallPercentage, overallStatus, payload, schoolYear | PUT /api/node-status/school/:nodeId | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1259 | PUT /node-status/personnel/{encodeURIComponentpersonnelId}/{encodeURIComponenttargetNodeId}<br>body keys: category, isComplete, isSchoolHead, payload, personnelName, positionTitle, schoolYear | PUT /api/node-status/personnel/:personnelId/:nodeId | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1311 | POST /requests/create<br>body is variable data | POST /api/requests/create | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1323 | POST /requests/{id}/respond<br>body keys: action | POST /api/requests/:id/respond | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1374 | POST /reports/calendar-terms<br>body keys: school_id, school_year, terms | POST /api/reports/calendar-terms | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1386 | POST /reports/generate-overload-pay<br>body is variable payload | POST /api/reports/generate-overload-pay | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1417 | PUT /shs-workloads/personnel/{personnelId}<br>body keys: shsWorkloadRows | unlinked | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1434 | POST /shs-transfers<br>body is variable transferData | POST /api/shs-transfers | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1451 | POST /requests/clustered/{encodeURIComponentprn}/sync<br>body is variable data | POST /api/requests/clustered/:prn/sync | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1476 | POST /esf7-upload<br>body is variable formData | POST /api/esf7-upload | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1483 | POST /esf7-upload/import-converted<br>body is variable data | POST /api/esf7-upload/import-converted | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1507 | POST /validation/resubmit<br>body is variable data | POST /api/validation/resubmit | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1517 | POST /auth/passcode-login<br>body is variable data | POST /api/auth/passcode-login | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1537 | POST /auth/migrate-login<br>body is variable data | POST /api/auth/migrate-login | _file_ | _file_ | — | none seen | high |
| client/src/services/api.js:1557 | POST /auth/pin-login<br>body is variable data | POST /api/auth/pin-login | _file_ | yes | — | none seen | high |
| e2e/security/helpers.mjs:7 | POST (url not static)<br>body keys: data | unlinked | — | — | — | none seen | low |
| scratch/verify_sync_roster_e2e.cjs:78 | POST /sync-roster<br>body is variable syncPayload | unlinked | — | — | — | none seen | high |
| scripts/smoke-test.mjs:153 | PUT /api/school/draft<br>body keys: baseVersion, payload, schoolYear | unlinked | — | yes | — | none seen | high |
| scripts/verify_personnel_local_task.js:41 | POST /api/auth/passcode-login<br>body keys: passcode, pin, school_id | POST /api/auth/passcode-login | — | — | — | none seen | high |
| scripts/verify_personnel_local_task.js:102 | POST /api/personnel/bulk<br>body keys: personnelList, schoolId, schoolYear | unlinked | — | — | — | none seen | high |
| scripts/verify_personnel_local_task.js:145 | DELETE /api/personnel/{oldId}<br>body keys: firstName, lastName, prn, schoolId | unlinked | — | — | — | none seen | high |
| scripts/verify_personnel_local_task.js:216 | DELETE /api/personnel/{newPersonId}<br>body keys: firstName, lastName, prn, schoolId | unlinked | — | — | — | none seen | high |

## 7. Findings

### 7.1 Rule-based findings

| Severity | Finding | Where | Evidence | Why it matters |
|---|---|---|---|---|
| high | Several writes outside a transaction | POST /; DELETE /:id; PUT /:id; POST /api/employment/:personnel_id; PUT /api/employment/:personnel_id; POST /api/esf7-upload/import-converted; POST /api/extra-tasks/batch; POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/learning-areas/toggle; PUT /api/node-status/personnel/:personnelId/:nodeId; POST /api/overload-pay-and-reason/sync; +16 more | server/controllers/personnel/profile.js:547; server/controllers/personnel/roster.js:1446; server/controllers/personnel/profile.js:1156; server/controllers/personnel_employment/index.js:179; server/controllers/personnel_employment/index.js:337; server/controllers/esf7_upload/index.js:340; +22 more | A failure between writes leaves partial data; a retry may duplicate the first writes. |
| high | Tenant read from client input | esf7_link.school_id (server/controllers/esf7_upload/index.js:312); overload_late_undertime.school_id (server/controllers/overload_late_undertime/index.js:293); overload_no_work.school_id (server/controllers/overload_no_work/index.js:142); school_calendar_terms.school_id (server/controllers/reports/index.js:207); esf7_clustered_ghost_sync.school_id (server/controllers/requests/index.js:905); esf7_passcode_lockout.school_id (server/controllers/room_profiling/index.js:240); esf7_profiling_snapshots.school_id (server/controllers/room_profiling/index.js:1793); esf7_personnel_submission.school_id (server/controllers/room_profiling/index.js:311); esf7_school_subjects.school_id (server/controllers/school_subjects/index.js:114); esf7_als_sections.school_id (server/controllers/class_sections/index.js:905); esf7_aral_sections.school_id (server/controllers/class_sections/index.js:1019); esf7_remedial_enrichment_sections.school_id (server/controllers/class_sections/index.js:1136); +10 more | esf7_link.school_id (server/controllers/esf7_upload/index.js:312); overload_late_undertime.school_id (server/controllers/overload_late_undertime/index.js:293); overload_no_work.school_id (server/controllers/overload_no_work/index.js:142); school_calendar_terms.school_id (server/controllers/reports/index.js:207); +18 more | Tenant must come from the verified token; a client-supplied value lets one tenant write into another. |
| high | UPDATE/DELETE without WHERE | esf7_shs_workload_rows (server/controllers/shs_workload_rows/index.js:213); esf7_workload_rows (server/controllers/workload_rows/index.js:1310) | server/controllers/shs_workload_rows/index.js:213; server/controllers/workload_rows/index.js:1310 | Affects every row of the table. |
| high | Write route without an auth middleware name | PUT /; PUT /:id | server/controllers/schools/profile.js:377; server/controllers/personnel/profile.js:1156 | Scanner matches middleware names only; confirm whether auth is applied some other way. |
| medium | Hardcoded fallback value for tenant | esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:808); esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:1308); esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:1567); esf7_personnel_extra_tasks.school_id (server/controllers/personnel_extra_tasks/index.js:105); esf7_personnel_node_status.school_id (server/controllers/node_status/index.js:385); esf7_school_node_status.school_id (server/controllers/node_status/index.js:260); overload_late_undertime.school_id (server/controllers/overload_late_undertime/index.js:293); overload_no_work.school_id (server/controllers/overload_no_work/index.js:142); overload_pay_and_reason.school_id (server/controllers/overload_pay_and_reason/index.js:272); overload_pay_and_reason.school_id (server/services/overloadSync.js:351); overload_pay_and_reason.school_id (server/controllers/overload_reasons/index.js:268); esf7_passcode_lockout.school_id (server/controllers/room_profiling/index.js:240); +21 more | esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:808); esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:1308); esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:1567); esf7_personnel_extra_tasks.school_id (server/controllers/personnel_extra_tasks/index.js:105); +29 more | A literal default can silently file data under the wrong tenant. |
| medium | Insert without a submission ID or ON CONFLICT | POST /api/designations; POST /api/extra-tasks/batch; POST /api/reports/calendar-terms; POST /api/room-profiling/snapshots; POST /api/room-profiling/submit; POST /api/shs-transfers; POST /api/shs-workloads; POST /api/submissions; PUT /api/trainings/personnel/:personnel_id; POST /api/transfers/batch; POST /api/workloads | server/controllers/personnel_designations/index.js:113; server/controllers/personnel_extra_tasks/index.js:66; server/controllers/reports/index.js:190; server/controllers/room_profiling/index.js:1776; server/controllers/room_profiling/index.js:267; server/controllers/shs_workload_transfers/index.js:90; +5 more | A client retry or double click creates duplicate rows or fails on a primary-key conflict. |
| medium | JSON/JSONB columns are written | esf7_admin_task.dates; esf7_admin_task.extras; esf7_aral_sections.raw_payload; esf7_clustered_ghost_sync.slots; esf7_link.preview_data; esf7_link.summary; esf7_personnel_allowances.extras; esf7_personnel_employment.assigned_schools; esf7_personnel_employment.grade_levels_taught; esf7_personnel_extra_tasks.calendar_dates; esf7_personnel_extra_tasks.raw_payload; esf7_personnel_ld_trainings.raw_payload; +36 more | server/drizzle/schema.ts:519; server/drizzle/schema.ts:519; server/drizzle/schema.ts:653; server/drizzle/schema.ts:1366; +44 more | Large documents increase WAL, TOAST and row size; whole-document rewrites on each save amplify write load. |
| medium | Large request body limit | express body limit 50mb (server/server.js:157) | express body limit 50mb (server/server.js:157) | A burst of large bodies is held in memory by Node before any validation; a 50 MB limit multiplied by concurrent requests can exhaust process memory. |
| medium | Queries inside loops (N+1 round trips) | POST / (2); DELETE /:id (2); PUT /:id (2); PUT /:id/school-head (1); GET /api/allowances (1); POST /api/esf7-upload/import-converted (2); POST /api/extra-tasks/batch (1); POST /api/overload-pay-and-reason/batch (3); POST /api/overload-pay-and-reason/sync (1); POST /api/overload-reasons/batch (3); POST /api/overload-reasons/sync (1); POST /api/reports/calendar-terms (1); +14 more | server/controllers/personnel/profile.js:221; server/controllers/personnel/roster.js:1704; server/controllers/personnel/profile.js:221; server/controllers/personnel/roster.js:1414; server/controllers/allowances/index.js:237; server/controllers/esf7_upload/index.js:397; +20 more | Round trips grow with the item count; consider one multi-row statement per chunk. |
| medium | Redis maxmemory policy not found in the repo | infrastructure | n/a | If the server uses an evicting policy, accepted-but-unwritten entries can be evicted; require noeviction. |
| medium | Redis persistence (AOF) setting not found in the repo | infrastructure | n/a | Without AOF a Redis restart loses everything not yet in PostgreSQL. |
| medium | Schema change (DDL) executed in the request path | GET /api/allowances; POST /api/allowances/disable; POST /api/allowances/toggle; GET /api/requests/clustered/:prn/sync; POST /api/requests/clustered/:prn/sync; POST /api/room-profiling/accept; POST /api/room-profiling/ack; GET /api/room-profiling/approved; GET /api/room-profiling/check-lockout; GET /api/room-profiling/pending; POST /api/room-profiling/record-attempt; GET /api/room-profiling/roster; +11 more | server/controllers/allowances/index.js:40; server/controllers/allowances/index.js:40; server/controllers/allowances/index.js:40; server/controllers/requests/index.js:701; server/controllers/requests/index.js:701; server/controllers/room_profiling/index.js:13; +17 more | CREATE/ALTER at request time takes locks and runs on every call or first call per process. |
| medium | Tenant has a client-supplied fallback | esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:808); esf7_deleted_personnel.school_id (server/controllers/personnel/roster.js:1567); overload_absences.school_id (server/controllers/absences/index.js:152); esf7_personnel_allowances.school_id (server/controllers/allowances/index.js:570); esf7_personnel_allowances.school_id (server/controllers/allowances/index.js:376); esf7_personnel_designations.school_id (server/controllers/personnel_designations/index.js:193); esf7_personnel_extra_tasks.school_id (server/controllers/personnel_extra_tasks/index.js:105); esf7_personnel_node_status.school_id (server/controllers/node_status/index.js:385); esf7_school_node_status.school_id (server/controllers/node_status/index.js:260); overload_pay_and_reason.school_id (server/controllers/overload_pay_and_reason/index.js:179); overload_pay_and_reason.school_id (server/controllers/overload_reasons/index.js:171); esf7_workload_transfer.school_id (server/controllers/shs_workload_transfers/index.js:178); +6 more | esf7_personnel_profile.school_id (server/controllers/personnel/profile.js:808); esf7_deleted_personnel.school_id (server/controllers/personnel/roster.js:1567); overload_absences.school_id (server/controllers/absences/index.js:152); esf7_personnel_allowances.school_id (server/controllers/allowances/index.js:570); +14 more | The server value is used first but the request body can still supply the tenant when it is missing. |
| low | Bare COUNT/MAX query in a route that inserts (possible ID generation) | POST /; PUT /:id; POST /api/absences; POST /api/learning-areas/:personnel_id; PUT /api/learning-areas/:personnel_id; POST /api/learning-areas/toggle; POST /api/overload-no-work; POST /api/overload-pay-and-reason/batch; POST /api/overload-pay-and-reason/save; POST /api/overload-reasons/batch; POST /api/overload-reasons/save; POST /api/qualifications/:personnel_id; +14 more | server/controllers/personnel/profile.js:252; server/controllers/personnel/profile.js:252; server/controllers/absences/index.js:125; server/controllers/personnel_learning_areas/index.js:230; server/controllers/personnel_learning_areas/index.js:230; server/controllers/personnel_learning_areas/index.js:118; +20 more | If the count or max feeds a new ID, two simultaneous requests can read the same value and generate the same ID. Read the code to confirm, then use a sequence, UUID or the client submission ID. |
| low | Client retry without jitter seen | client/src/services/api.js:1110 | client/src/services/api.js:1110 | Synchronised retries make a burst worse; add random jitter. |
| info | Database work continues after the response (deferred, same process) | POST /draft (2); PUT /draft (2) | server/controllers/schools/drafts.js:2366; server/controllers/schools/drafts.js:2365 | The client sees a response before this work commits; it also competes for the same Node process and pool during a burst. |
| info | More than one query per request | POST / (18); DELETE /:id (87); PUT /:id (18); PUT /:id/school-head (13); POST /api/absences (3); GET /api/allowances (5); POST /api/allowances/bulk (3); POST /api/allowances/disable (4); POST /api/allowances/toggle (6); POST /api/designations (2); POST /api/employment/:personnel_id (3); PUT /api/employment/:personnel_id (3); +57 more | See Section 3 per route | Each extra round trip holds a pooled connection longer; peak connection demand = request rate x total query time. |
| info | PgBouncer only inferred from a port default | ecosystem.esf7-prod.config.cjs:12; ecosystem.esf7-prod.config.cjs:43 | ecosystem.esf7-prod.config.cjs:12; ecosystem.esf7-prod.config.cjs:43 | Confirm that a pooler really runs on that port, its pool mode (transaction vs session), pool size and max_client_conn; the app uses pg.Pool, whose named prepared statements and session settings need checking under transaction pooling. |
| info | Pool size per Node process | 5 pool(s), max sum 30 | server/db/index.js:98; server/db/index.js:127; server/db/index.js:157; server/db/index.js:193; server/db/index.js:224 | Worst-case connections = PM2 instances x sum of pool max; compare with the database max_connections or PgBouncer limits. |
| info | Possible personal data in written tables | 65 columns | names listed in Section 5 | Names only, matched by pattern. Confirm classification, retention, and whether values need masking in logs or backups. |

### 7.2 Judgment findings

| Severity | Finding | Evidence | Detail |
|---|---|---|---|
| high | Certified submission has no client submission ID; a retry creates a second queue job | server/controllers/submissions/index.js:26; server/create_esf7_submission_queue_table.js:29 | POST /api/submissions inserts into esf7_submission_queue whose key is a server-side SERIAL and whose create script (server/create_esf7_submission_queue_table.js) defines no unique (school_id, school_year, client ID). A double click or client retry queues the same submission twice, and each job runs the heavy processing in queue_worker.js. |
| high | Tenant for a submission can come from the request body, with a hardcoded fallback school | server/controllers/submissions/index.js:12; server/controllers/workload_rows/index.js:194; server/controllers/workload_rows/index.js:466 | schoolId is getSchoolIdFromRequest(req) \|\| req.body.schoolId \|\| a literal school number. If the verified lookup returns nothing the body value or a literal id decides which school the data is filed under. The tenant must come only from the verified token. |
| high | One worker job is a very long single transaction | server/queue_worker.js:621; server/queue_worker.js:3020 | The job runs BEGIN at line 621 and COMMIT at line 3020, with deletes and re-inserts across about twenty normalized tables in between, on one checked-out connection. Up to MAX_CONCURRENT_WORKERS = 5 jobs run per process (server/queue_worker.js:516), so during a burst a few jobs can hold connections and row locks for the whole run and starve the web pool if START_LOCAL_WORKER is not false. |
| medium | Workload ID is built from COUNT(*) of the whole table | server/controllers/workload_rows/index.js:200 | POST /api/workloads reads SELECT COUNT(*) FROM esf7_workload_rows and uses count+1 in the new id. Two simultaneous saves can read the same count; the id collides or the save fails. Use a sequence or a client-generated UUID. |
| medium | Redis carries only a job pointer; PostgreSQL is already the durable store | server/services/redisQueue.js:202; server/controllers/submissions/index.js:26 | The payload is committed to esf7_submission_queue first and Redis (XADD with jobId, schoolId, schoolYear) is a best-effort wake-up with a polling fallback. This is already an outbox pattern: an accepted submission survives a Redis outage. The residual risks are the payload size in the queue table, the unbounded body limit, and worker throughput, not Redis durability. |
| medium | Client retry backoff has no jitter; draft retry is a fixed 10 s | client/src/services/api.js:232; client/src/services/api.js:159; client/src/services/draftSaver.js:8 | fetchJsonWithRetry retries 502/503/504 at 0.5 s, 1 s, 2 s without randomization, and the draft saver retries every 10 s. After an outage all clients retry on the same schedule. |
| medium | Request body limit is 50 MB while the queue payload is stored whole | server/server.js:134; server/controllers/submissions/index.js:23 | express.json({ limit: '50mb' }) lets each request hold up to 50 MB in memory before any validation. A burst of large certified payloads is held in the Node process (1500M restart limit per PM2 app) and then written whole into a JSONB column. |

## 8. Unresolved items

### dynamic-sql (1)

- server/controllers/schools/drafts.js:2221 — Query text could not be read statically (sql).

### Dismissed with reason

- `unresolved:dynamic-sql:server/db/index.js:367`: db.query is a wrapper that forwards the caller's SQL to the context-selected pool; it is not a write path of its own.
- `unresolved:column-mapping:server/controllers/allowances/index.js:376`: Dynamic column is chosen at runtime (${hasCol}, ${amtCol}); other columns are id, personnel_id, school_id, school_year, extras.
- `unresolved:column-mapping:server/controllers/esf7_upload/index.js:397`: Dynamic row cloning helper columns for test accounts into esf7_database_dummy.
- `unresolved:column-mapping:server/controllers/esf7_upload/index.js:404`: Dynamic row cloning helper columns for non-test accounts into esf7_database.
- `unresolved:column-mapping:server/controllers/node_status/index.js:260`: Dynamic column is a node id chosen from a fixed list; the other columns are listed in the SQL (school_id, school_year, overall_status, overall_percentage).
- `unresolved:column-mapping:server/controllers/node_status/index.js:385`: Same node-id pattern for personnel node status; fixed columns visible in the SQL (school_id, school_year, personnel_id, personnel_name, position_title, category, is_school_head, is_complete).
- `unresolved:column-mapping:server/controllers/schools/drafts.js:951`: Batch insert into esf7_personnel_id_mapping via UNNEST($1::text[], $2::text[], $3::text[]) with fixed columns legacy_id, new_id, status.
- `unresolved:dynamic-sql:server/controllers/room_profiling/index.js:494`: Switch/case static SQL execution helper for multi-row upsert operations across allowlisted tables.
- `unresolved:dynamic-sql:server/controllers/schools/drafts.js:2205`: Optimistic concurrency SQL for school_drafts version incrementing (INSERT ON CONFLICT DO UPDATE WHERE school_drafts.version = $4).
- `unresolved:unlinked-write:server/queue_worker.js:607`: Background consumer of esf7_submission_queue updating queue item status.
- `unresolved:unlinked-write:server/queue_worker.js:819`: Background consumer normalizing school profile.
- `unresolved:unlinked-write:server/queue_worker.js:1886`: Background consumer upserting legacy-to-new personnel ID mappings.
- `unresolved:unlinked-write:server/queue_worker.js:1975`: Background consumer upserting personnel L&D trainings.
- `unresolved:unlinked-write:server/queue_worker.js:1991`: Background consumer upserting personnel designations.
- `unresolved:unlinked-write:server/queue_worker.js:2007`: Background consumer upserting related tasks.
- `unresolved:unlinked-write:server/queue_worker.js:2023`: Background consumer upserting admin tasks.
- `unresolved:unlinked-write:server/queue_worker.js:2047`: Background consumer upserting regular sections.
- `unresolved:unlinked-write:server/queue_worker.js:2051`: Background consumer upserting sned sections.
- `unresolved:unlinked-write:server/queue_worker.js:2055`: Background consumer upserting als sections.
- `unresolved:unlinked-write:server/queue_worker.js:2059`: Background consumer upserting aral sections.
- `unresolved:unlinked-write:server/queue_worker.js:2063`: Background consumer upserting remedial enrichment sections.
- `unresolved:unlinked-write:server/queue_worker.js:2518`: Background consumer upserting elementary/JHS workload rows.
- `unresolved:unlinked-write:server/queue_worker.js:2529`: Background consumer upserting SHS workload rows.
- `unresolved:unlinked-write:server/queue_worker.js:2542`: Background consumer upserting elementary/JHS workload rows fallback.
- `unresolved:unlinked-write:server/queue_worker.js:2553`: Background consumer upserting SHS workload rows fallback.
- `unresolved:unlinked-write:server/queue_worker.js:2596`: Background consumer upserting personnel allowances.
- `unresolved:unlinked-write:server/queue_worker.js:2798`: Background consumer recording workload transfers.
- `unresolved:unlinked-write:server/queue_worker.js:3166`: Background consumer marking job completed.
- `unresolved:unlinked-write:server/queue_worker.js:3209`: Background consumer marking job failed.
- `unresolved:unlinked-write:server/queue_worker.js:3494`: Background consumer of esf7_submission_queue. Reached from POST /api/submissions through setImmediate or separate worker process.
- `unresolved:unlinked-write:server/services/queueClaims.js:11`: Claim SQL used by queue_worker.js (UPDATE ... status = 'processing'); background path, not an HTTP route.
- `unresolved:unlinked-write:server/services/queueClaims.js:26`: Stale recovery SQL used by queue_worker.js; background path, not an HTTP route.

### Owner questions

1. What are the expected normal and worst-case submissions per minute, and how long must a database outage be survivable?
2. What is the VM size, the database tier, and its `max_connections`?
3. Is nginx in front of Node, and what rate or body-size limits does it apply (no nginx directives were found in the repo)?
4. Which Redis deployment is used (managed or self-hosted), with what `maxmemory`, `maxmemory-policy`, and persistence settings?
5. Which of the unlinked application writes (workers, helpers) run on every submission, and which are scripts?

