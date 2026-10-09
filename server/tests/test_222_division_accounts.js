const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const path = require("path");
const assert = require("assert");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const {
  resolveTestDivision,
  isTestDivisionSchoolId,
  TEST_DIVISIONS,
} = require("../utils/divisionTestRegistry");

const insightEdPool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace("insighted_esf7", "insightEd")
    : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function runQATests() {
  console.log(
    "================================================================",
  );
  console.log("🧪 QA VERIFICATION SUITE: 222 DepEd Division Test Sandboxes");
  console.log(
    "================================================================\n",
  );

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${e.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${e.message}`);
      failed++;
    }
  }

  // ── TEST 1: Division Registry Resolution ──
  console.log("--- 1. Division Handle Resolution Tests ---");
  test("albay.test resolves correctly to Region V and School 900075 / mapped ID", () => {
    const res = resolveTestDivision("albay.test");
    assert(res !== null, "albay.test should resolve");
    assert.strictEqual(res.division, "ALBAY");
    assert.strictEqual(res.region, "REGION V");
    assert(
      res.schoolId.startsWith("900"),
      "School ID should be in 900xxx series",
    );
  });

  test("pasigcity.test resolves to NCR and Pasig City", () => {
    const res = resolveTestDivision("pasigcity.test");
    assert(res !== null, "pasigcity.test should resolve");
    assert.strictEqual(res.division, "PASIG CITY");
    assert.strictEqual(res.region, "NCR");
  });

  test("davaocity.test resolves to Region XI and Davao City", () => {
    const res = resolveTestDivision("davaocity.test");
    assert(res !== null, "davaocity.test should resolve");
    assert.strictEqual(res.division, "DAVAO CITY");
    assert.strictEqual(res.region, "REGION XI");
  });

  test("Numeric ID 900001 resolves correctly", () => {
    const res = resolveTestDivision("900001");
    assert(res !== null, "900001 should resolve");
    assert.strictEqual(res.schoolId, "900001");
  });

  test("All 222+ divisions in registry have unique slugs and unique school IDs", () => {
    const slugs = new Set();
    const schoolIds = new Set();
    for (const d of TEST_DIVISIONS) {
      assert(!slugs.has(d.slug), `Duplicate slug: ${d.slug}`);
      assert(!schoolIds.has(d.schoolId), `Duplicate schoolId: ${d.schoolId}`);
      slugs.add(d.slug);
      schoolIds.add(d.schoolId);
    }
    assert(
      TEST_DIVISIONS.length >= 222,
      `Expected at least 222 divisions, got ${TEST_DIVISIONS.length}`,
    );
  });

  // ── TEST 2: Database PII Safety and Anonymization Audit ──
  console.log("\n--- 2. Database Anonymization & Integrity Audit ---");
  await testAsync(
    "esf7_database_dummy rows have safe anonymized TINs (999- series)",
    async () => {
      const res = await insightEdPool.query(`
      SELECT count(*) as total, 
             count(*) FILTER (WHERE tin LIKE '999-%') as safe_tins,
             count(*) FILTER (WHERE tin NOT LIKE '999-%' AND tin IS NOT NULL AND tin != '') as non_compliant_tins
      FROM esf7_database_dummy 
      WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) >= '900001'
    `);
      const { total, safe_tins, non_compliant_tins } = res.rows[0];
      console.log(
        `     Total test personnel rows: ${total}, Compliant 999- TINs: ${safe_tins}`,
      );
      assert(
        parseInt(total, 10) > 1000,
        "Should have over 1,000 seeded test personnel",
      );
      assert.strictEqual(
        parseInt(non_compliant_tins, 10),
        0,
        "Zero real TINs allowed in 900xxx series",
      );
    },
  );

  // ── TEST 3: Roster and Personnel Fetch for Sample Divisions ──
  console.log("\n--- 3. Multi-Region School Roster Fetch Tests ---");
  const sampleSchools = ["900001", "900075", "900150", "900200"];
  for (const schId of sampleSchools) {
    await testAsync(
      `School ${schId} loads 7 structured personnel from esf7_database_dummy`,
      async () => {
        const res = await insightEdPool.query(
          `
        SELECT first, last, position, subject_1, from_1, to_1, fund_source 
        FROM esf7_database_dummy 
        WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1
      `,
          [schId],
        );
        assert.strictEqual(
          res.rows.length,
          7,
          `Expected 7 personnel for school ${schId}, got ${res.rows.length}`,
        );

        const positions = res.rows.map((r) => r.position);
        assert(positions.includes("SCHOOL PRINCIPAL II"), "Has Principal II");
        assert(positions.includes("MASTER TEACHER I"), "Has Master Teacher I");
        assert(
          positions.includes("ADMINISTRATIVE OFFICER II"),
          "Has Non-Teaching ADAS",
        );
      },
    );
  }

  // ── TEST 4: JWT Token Simulation for Auth Controller ──
  console.log("\n--- 4. Auth Dispatch Verification ---");
  test("divtest- token signs and decodes cleanly with full division metadata", () => {
    const div = resolveTestDivision("cebucity.test");
    const secret = process.env.JWT_SECRET || "unit-test-only-secret-0123456789";
    const token = jwt.sign(
      {
        uid: `divtest-${div.schoolId}`,
        email: `${div.slug}@esf7.test`,
        role: "school",
        school_id: div.schoolId,
      },
      secret,
      { expiresIn: "30d" },
    );
    const decoded = jwt.verify(token, secret);
    assert.strictEqual(decoded.school_id, div.schoolId);
    assert(decoded.uid.startsWith("divtest-"));
  });

  console.log(
    "\n================================================================",
  );
  console.log(`🎉 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(
    "================================================================\n",
  );

  await insightEdPool.end();
  if (failed > 0) process.exit(1);
}

runQATests().catch((err) => {
  console.error("Fatal Test Runner Error:", err);
  process.exit(1);
});
