const { stagingPool, prodPool } = require("../db");
const { MCOC_ARCHETYPES } = require("../utils/divisionTestRegistry");
const { codec } = require("../utils/payloadExtras");

// esf7_school_profile keeps typed columns + a slim `extras` JSONB (run the expand migration on the target first)
const schoolProfilePayload = codec("esf7_school_profile");

async function seedStaging() {
  console.log("=====================================================");
  console.log("🌱 SEEDING 7 MCOC ARCHETYPES INTO STAGING DATABASE");
  console.log("=====================================================\n");

  // 1. Safety Check: Verify connected database is staging
  const dbRes = await stagingPool.query("SELECT current_database()");
  const activeDb = dbRes.rows[0].current_database;
  console.log(`Connected Staging Target: [${activeDb}]`);

  if (activeDb !== "insighted_esf7_staging") {
    console.error(
      "❌ SAFETY ABORT: Connected DB is NOT insighted_esf7_staging!",
    );
    process.exit(1);
  }

  // 2. Define MCOC Archetype Configurations
  const ARCHETYPE_CONFIGS = [
    {
      schoolId: "900223",
      schoolName: "MABINI ELEMENTARY SCHOOL (PURE ES)",
      region: "REGION V",
      division: "MCOC PURE ELEMENTARY",
      district: "LEGAZPI DISTRICT I",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: true,
      elemSpecialPrograms: ["SPECIAL SCIENCE ELEMENTARY SCHOOL"],
      hasJhsSpecialPrograms: false,
      jhsSpecialPrograms: [],
      shsCurriculumModel: null,
      hasElemInclusive: false,
      elemInclusivePrograms: [],
      hasJhsInclusive: false,
      jhsInclusivePrograms: [],
      hasShsInclusive: false,
      shsInclusivePrograms: [],
      hasAls: false,
      hasSned: false,
      hasIped: false,
      hasMadrasah: false,
      inclusivePrograms: [],
    },
    {
      schoolId: "900224",
      schoolName: "RIZAL MEMORIAL JUNIOR HIGH SCHOOL (PURE JHS)",
      region: "REGION V",
      division: "MCOC PURE JUNIOR HIGH",
      district: "NAGA DISTRICT II",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: false,
      elemSpecialPrograms: [],
      hasJhsSpecialPrograms: true,
      jhsSpecialPrograms: [
        "SPECIAL PROGRAM IN THE ARTS (SPA)",
        "SPECIAL PROGRAM IN JOURNALISM (SPJ)",
        "SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM",
      ],
      shsCurriculumModel: null,
      hasElemInclusive: false,
      elemInclusivePrograms: [],
      hasJhsInclusive: false,
      jhsInclusivePrograms: [],
      hasShsInclusive: false,
      shsInclusivePrograms: [],
      hasAls: false,
      hasSned: false,
      hasIped: false,
      hasMadrasah: false,
      inclusivePrograms: [],
    },
    {
      schoolId: "900225",
      schoolName: "ALBAY NATIONAL SENIOR HIGH SCHOOL (PURE SHS)",
      region: "REGION V",
      division: "MCOC PURE SENIOR HIGH",
      district: "TABACO DISTRICT I",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: false,
      elemSpecialPrograms: [],
      hasJhsSpecialPrograms: false,
      jhsSpecialPrograms: [],
      shsCurriculumModel: "Standard K-12 SHS Curriculum",
      hasElemInclusive: false,
      elemInclusivePrograms: [],
      hasJhsInclusive: false,
      jhsInclusivePrograms: [],
      hasShsInclusive: false,
      shsInclusivePrograms: [],
      hasAls: false,
      hasSned: false,
      hasIped: false,
      hasMadrasah: false,
      inclusivePrograms: [],
    },
    {
      schoolId: "900226",
      schoolName: "DARAGA INTEGRATED MEMORIAL SCHOOL (K-10)",
      region: "REGION V",
      division: "MCOC INTEGRATED SCHOOL",
      district: "DARAGA DISTRICT III",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: true,
      elemSpecialPrograms: ["SPECIAL SCIENCE ELEMENTARY SCHOOL"],
      hasJhsSpecialPrograms: true,
      jhsSpecialPrograms: [
        "SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM",
      ],
      shsCurriculumModel: null,
      hasElemInclusive: false,
      elemInclusivePrograms: [],
      hasJhsInclusive: false,
      jhsInclusivePrograms: [],
      hasShsInclusive: false,
      shsInclusivePrograms: [],
      hasAls: false,
      hasSned: false,
      hasIped: false,
      hasMadrasah: false,
      inclusivePrograms: [],
    },
    {
      schoolId: "900227",
      schoolName: "SAN ISIDRO MULTIGRADE SCHOOL (MG ES)",
      region: "REGION V",
      division: "MCOC MULTIGRADE SCHOOL",
      district: "POLANGUI DISTRICT II",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: false,
      elemSpecialPrograms: [],
      hasJhsSpecialPrograms: false,
      jhsSpecialPrograms: [],
      shsCurriculumModel: null,
      hasElemInclusive: false,
      elemInclusivePrograms: [],
      hasJhsInclusive: false,
      jhsInclusivePrograms: [],
      hasShsInclusive: false,
      shsInclusivePrograms: [],
      hasAls: false,
      hasSned: false,
      hasIped: false,
      hasMadrasah: false,
      inclusivePrograms: [],
    },
    {
      schoolId: "900228",
      schoolName: "BICOL REGIONAL COMPREHENSIVE HIGH SCHOOL (K-12)",
      region: "REGION V",
      division: "MCOC K-12 COMPREHENSIVE",
      district: "LEGAZPI DISTRICT II",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: true,
      elemSpecialPrograms: ["SPECIAL SCIENCE ELEMENTARY SCHOOL"],
      hasJhsSpecialPrograms: true,
      jhsSpecialPrograms: [
        "SPECIAL PROGRAM IN THE ARTS (SPA)",
        "SPECIAL PROGRAM IN SPORTS (SPS)",
        "SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM",
        "SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)",
      ],
      shsCurriculumModel: "Standard K-12 SHS Curriculum",
      hasElemInclusive: false,
      elemInclusivePrograms: [],
      hasJhsInclusive: false,
      jhsInclusivePrograms: [],
      hasShsInclusive: false,
      shsInclusivePrograms: [],
      hasAls: false,
      hasSned: false,
      hasIped: false,
      hasMadrasah: false,
      inclusivePrograms: [],
    },
    {
      schoolId: "900229",
      schoolName: "ALBAY SPECIAL EDUCATION & INCLUSIVE CENTER",
      region: "REGION V",
      division: "MCOC INCLUSIVE SNED ALS",
      district: "ALBAY INCLUSIVE DISTRICT",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: false,
      elemSpecialPrograms: [],
      hasJhsSpecialPrograms: false,
      jhsSpecialPrograms: [],
      shsCurriculumModel: null,
      hasElemInclusive: true,
      elemInclusivePrograms: ["SNED-ES", "ALS-ES", "ARAL-ES"],
      hasJhsInclusive: true,
      jhsInclusivePrograms: ["SNED-JHS", "ALS-JHS", "ARAL-JHS"],
      hasShsInclusive: false,
      shsInclusivePrograms: [],
      hasAls: true,
      hasSned: true,
      hasIped: false,
      hasMadrasah: false,
      inclusivePrograms: [
        "SNED-ES",
        "ALS-ES",
        "ARAL-ES",
        "SNED-JHS",
        "ALS-JHS",
        "ARAL-JHS",
      ],
    },
    {
      schoolId: "900230",
      schoolName: "BICOL NATIONAL COMPREHENSIVE SCHOOL (ALL OFFERINGS)",
      region: "REGION V",
      division: "MCOC ALL OFFERINGS",
      district: "LEGAZPI MEGA DISTRICT",
      schoolYear: "SY 26-27",
      hasElemSpecialPrograms: true,
      elemSpecialPrograms: ["SPECIAL SCIENCE ELEMENTARY SCHOOL"],
      hasJhsSpecialPrograms: true,
      jhsSpecialPrograms: [
        "SPECIAL PROGRAM IN THE ARTS (SPA)",
        "SPECIAL PROGRAM IN SPORTS (SPS)",
        "SPECIAL PROGRAM IN JOURNALISM (SPJ)",
        "SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM",
        "SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)",
      ],
      shsCurriculumModel: "Standard K-12 SHS Curriculum",
      hasElemInclusive: true,
      elemInclusivePrograms: ["SNED-ES", "ALS-ES", "ARAL-ES"],
      hasJhsInclusive: true,
      jhsInclusivePrograms: ["SNED-JHS", "ALS-JHS", "ARAL-JHS"],
      hasShsInclusive: true,
      shsInclusivePrograms: ["SNED-SHS", "ALS-SHS", "ARAL-SHS"],
      hasAls: true,
      hasSned: true,
      hasIped: true,
      hasMadrasah: true,
      inclusivePrograms: [
        "SNED-ES",
        "ALS-ES",
        "ARAL-ES",
        "SNED-JHS",
        "ALS-JHS",
        "ARAL-JHS",
        "SNED-SHS",
        "ALS-SHS",
        "ARAL-SHS",
      ],
    },
  ];

  for (const config of ARCHETYPE_CONFIGS) {
    console.log(
      `▶ Seeding Archetype [${config.schoolId}] ${config.schoolName}...`,
    );

    const profileId = `SCH-PROFILE-${config.schoolId}`;
    await stagingPool.query(
      `
      INSERT INTO esf7_school_profile (
        id, school_id, school_year,
        has_elem_special_programs, elem_special_programs,
        has_jhs_special_programs, jhs_special_programs,
        shs_curriculum_model,
        has_elem_inclusive, elem_inclusive_programs,
        has_jhs_inclusive, jhs_inclusive_programs,
        has_shs_inclusive, shs_inclusive_programs,
        has_als, has_sned, has_iped, has_madrasah,
        inclusive_programs, extras, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12::jsonb, $13, $14::jsonb, $15, $16, $17, $18, $19::jsonb, $20::jsonb, NOW()
      )
      ON CONFLICT (school_id, school_year) DO UPDATE SET
        has_elem_special_programs = EXCLUDED.has_elem_special_programs,
        elem_special_programs = EXCLUDED.elem_special_programs,
        has_jhs_special_programs = EXCLUDED.has_jhs_special_programs,
        jhs_special_programs = EXCLUDED.jhs_special_programs,
        shs_curriculum_model = EXCLUDED.shs_curriculum_model,
        has_elem_inclusive = EXCLUDED.has_elem_inclusive,
        elem_inclusive_programs = EXCLUDED.elem_inclusive_programs,
        has_jhs_inclusive = EXCLUDED.has_jhs_inclusive,
        jhs_inclusive_programs = EXCLUDED.jhs_inclusive_programs,
        has_shs_inclusive = EXCLUDED.has_shs_inclusive,
        shs_inclusive_programs = EXCLUDED.shs_inclusive_programs,
        has_als = EXCLUDED.has_als,
        has_sned = EXCLUDED.has_sned,
        has_iped = EXCLUDED.has_iped,
        has_madrasah = EXCLUDED.has_madrasah,
        inclusive_programs = EXCLUDED.inclusive_programs,
        extras = EXCLUDED.extras,
        updated_at = NOW()
    `,
      [
        profileId,
        config.schoolId,
        config.schoolYear,
        config.hasElemSpecialPrograms,
        JSON.stringify(config.elemSpecialPrograms),
        config.hasJhsSpecialPrograms,
        JSON.stringify(config.jhsSpecialPrograms),
        config.shsCurriculumModel,
        config.hasElemInclusive,
        JSON.stringify(config.elemInclusivePrograms),
        config.hasJhsInclusive,
        JSON.stringify(config.jhsInclusivePrograms),
        config.hasShsInclusive,
        JSON.stringify(config.shsInclusivePrograms),
        config.hasAls,
        config.hasSned,
        config.hasIped,
        config.hasMadrasah,
        JSON.stringify(config.inclusivePrograms),
        JSON.stringify(
          schoolProfilePayload.buildExtras(config, {
            id: profileId,
            school_id: config.schoolId,
            school_year: config.schoolYear,
            has_elem_special_programs: config.hasElemSpecialPrograms,
            elem_special_programs: config.elemSpecialPrograms,
            has_jhs_special_programs: config.hasJhsSpecialPrograms,
            jhs_special_programs: config.jhsSpecialPrograms,
            shs_curriculum_model: config.shsCurriculumModel,
            has_elem_inclusive: config.hasElemInclusive,
            elem_inclusive_programs: config.elemInclusivePrograms,
            has_jhs_inclusive: config.hasJhsInclusive,
            jhs_inclusive_programs: config.jhsInclusivePrograms,
            has_shs_inclusive: config.hasShsInclusive,
            shs_inclusive_programs: config.shsInclusivePrograms,
            has_als: config.hasAls,
            has_sned: config.hasSned,
            has_iped: config.hasIped,
            has_madrasah: config.hasMadrasah,
            inclusive_programs: config.inclusivePrograms,
          }),
        ),
      ],
    );

    console.log(
      `  ✅ Stored profile in esf7_school_profile for [${config.schoolId}]`,
    );
  }

  // 3. Staging database verification
  const pCount = await stagingPool.query(
    "SELECT COUNT(*) FROM esf7_school_profile WHERE school_id >= '900223' AND school_id <= '900230'",
  );
  console.log(
    `\nStaging verification: ${pCount.rows[0].count} rows in esf7_school_profile.`,
  );

  // 4. Production database check (MUST BE ZERO)
  const prodCheck = await prodPool.query(
    "SELECT COUNT(*) FROM esf7_school_profile WHERE school_id >= '900223' AND school_id <= '900230'",
  );
  console.log(`Production check: ${prodCheck.rows[0].count} rows (MUST BE 0)`);

  if (parseInt(prodCheck.rows[0].count, 10) !== 0) {
    console.error("❌ CRITICAL ERROR: Production database was modified!");
    process.exit(1);
  }

  console.log("\n=====================================================");
  console.log("🎉 ALL 8 MCOC ARCHETYPES SEEDED INTO STAGING SUCCESSFULLY!");
  console.log("=====================================================");
  process.exit(0);
}

seedStaging().catch((err) => {
  console.error("Seed Error:", err);
  process.exit(1);
});
