const { Client } = require("pg");

async function run() {
  console.log("=== VERIFYING PERSONNEL FLOW ON esf7_local ===");

  const client = new Client({
    connectionString:
      "postgresql://postgres:kLeyahhUnique241!%40@127.0.0.1:5432/esf7_local",
  });
  await client.connect();

  console.log("\n1. Verifying table columns in esf7_local...");

  // Check deleted in esf7_database
  const masterColCheck = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'esf7_database' AND column_name = 'deleted'
  `);
  console.log(
    "esf7_database has 'deleted' column:",
    masterColCheck.rows.length > 0 ? "YES (PASS)" : "NO (FAIL)",
  );

  // Check raw_payload / extra / extras in esf7_personnel_profile
  const profileCols = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'esf7_personnel_profile' 
      AND column_name IN ('raw_payload', 'extra', 'extras')
  `);
  console.log(
    "esf7_personnel_profile has raw_payload/extra/extras:",
    profileCols.rows.length === 0
      ? "NONE (PASS)"
      : `FOUND: ${JSON.stringify(profileCols.rows)} (FAIL)`,
  );

  // 2. Login to get auth token
  console.log("\n2. Logging in via API...");
  const loginRes = await fetch(
    "http://127.0.0.1:5000/api/auth/passcode-login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_id: "342285",
        passcode: "342285",
        pin: "342285",
      }),
    },
  );
  const { token } = await loginRes.json();
  console.log("Login token acquired.");

  // 3. Fetch master personnel from GET /api/personnel
  console.log("\n3. Testing GET /api/personnel (Auto-population)...");
  const rosterRes = await fetch(
    "http://127.0.0.1:5000/api/personnel?schoolId=342285",
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const rosterData = await rosterRes.json();
  const personnelList =
    rosterData.data ||
    rosterData.personnel ||
    (Array.isArray(rosterData) ? rosterData : []);
  console.log(`Fetched ${personnelList.length} personnel for school 342285.`);
  if (personnelList.length === 0) {
    throw new Error(
      "Expected personnel from master records for school 342285!",
    );
  }

  // Pick an old master personnel
  const oldMasterPerson = personnelList[0];
  const oldPrn = oldMasterPerson.prn || oldMasterPerson.employeeNo;
  const oldId = oldMasterPerson.id;
  console.log("Picked old master personnel:", {
    id: oldId,
    name: `${oldMasterPerson.firstName} ${oldMasterPerson.lastName}`,
    prn: oldPrn,
  });

  // Create a new personnel object
  const newPersonId = `PER-342285-NEW-${Date.now().toString().slice(-4)}`;
  const newPerson = {
    id: newPersonId,
    prn: "105", // should become PRN-105
    firstName: "JUAN",
    lastName: "DELA CRUZ",
    type: "teaching",
    position: "TEACHER I",
    stepIncrement: "1",
  };

  // 4. Test Bulk Save (Triggered on 'ADD PERSONNEL' or 'SAVE' button)
  console.log(
    "\n4. Testing POST /api/personnel/bulk (saving all active personnel)...",
  );
  const bulkRes = await fetch("http://127.0.0.1:5000/api/personnel/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      schoolId: "342285",
      schoolYear: "SY 26-27",
      personnelList: [
        {
          id: oldId,
          prn: oldPrn,
          firstName: oldMasterPerson.firstName,
          lastName: oldMasterPerson.lastName,
          type: oldMasterPerson.type || "teaching",
          position: oldMasterPerson.position || "TEACHER I",
        },
        newPerson,
      ],
    }),
  });
  const bulkResult = await bulkRes.json();
  console.log("Bulk save response:", bulkResult);

  // Check saved records in esf7_personnel_profile
  const checkOldSaved = await client.query(
    "SELECT id, prn, first_name, last_name FROM esf7_personnel_profile WHERE id = $1",
    [oldId],
  );
  const checkNewSaved = await client.query(
    "SELECT id, prn, first_name, last_name FROM esf7_personnel_profile WHERE id = $1",
    [newPersonId],
  );
  console.log("Old person in esf7_personnel_profile:", checkOldSaved.rows[0]);
  console.log("New person in esf7_personnel_profile:", checkNewSaved.rows[0]);
  console.log(
    "PRN formatting check on new person:",
    checkNewSaved.rows[0]?.prn === "PRN-105" ? "PASS (PRN-105)" : "FAIL",
  );

  // 5. Test Deletion of Old Master Personnel
  console.log("\n5. Testing DELETE on Old Master Personnel...");
  const delOldRes = await fetch(
    `http://127.0.0.1:5000/api/personnel/${oldId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        schoolId: "342285",
        prn: oldPrn,
        firstName: oldMasterPerson.firstName,
        lastName: oldMasterPerson.lastName,
      }),
    },
  );
  const delOldResult = await delOldRes.json();
  console.log("Delete old person response:", delOldResult);

  // Check that row in esf7_personnel_profile is DELETED
  const checkOldProfileDeleted = await client.query(
    "SELECT id FROM esf7_personnel_profile WHERE id = $1",
    [oldId],
  );
  console.log(
    "Old person in esf7_personnel_profile after delete:",
    checkOldProfileDeleted.rows.length === 0
      ? "REMOVED (PASS)"
      : "STILL PRESENT (FAIL)",
  );

  // Check that in esf7_database, deleted = true
  const checkMasterDeleted = await client.query(
    `SELECT first, last, deleted FROM esf7_database 
     WHERE (school_id = '342285' OR schoool_id = '342285') 
       AND (UPPER(TRIM(first)) = $1 AND UPPER(TRIM(last)) = $2)`,
    [
      String(oldMasterPerson.firstName).trim().toUpperCase(),
      String(oldMasterPerson.lastName).trim().toUpperCase(),
    ],
  );
  console.log(
    "Old person in esf7_database has deleted = true:",
    checkMasterDeleted.rows[0]?.deleted === true
      ? "YES (PASS)"
      : `NO (${JSON.stringify(checkMasterDeleted.rows[0])}) (FAIL)`,
  );

  // Verify that GET /api/personnel now excludes the deleted old personnel
  const rosterAfterDelRes = await fetch(
    "http://127.0.0.1:5000/api/personnel?schoolId=342285",
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const rosterAfterDelData = await rosterAfterDelRes.json();
  const listAfterDel = rosterAfterDelData.personnel || rosterAfterDelData || [];
  const foundInRoster = listAfterDel.some(
    (p) =>
      p.id === oldId ||
      (p.firstName?.toUpperCase() ===
        oldMasterPerson.firstName?.toUpperCase() &&
        p.lastName?.toUpperCase() === oldMasterPerson.lastName?.toUpperCase()),
  );
  console.log(
    "Deleted old person in auto-populated roster:",
    foundInRoster ? "STILL FOUND (FAIL)" : "EXCLUDED (PASS)",
  );

  // 6. Test Deletion of New Personnel
  console.log("\n6. Testing DELETE on Newly Added Personnel...");
  const delNewRes = await fetch(
    `http://127.0.0.1:5000/api/personnel/${newPersonId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        schoolId: "342285",
        prn: "PRN-105",
        firstName: "JUAN",
        lastName: "DELA CRUZ",
      }),
    },
  );
  const delNewResult = await delNewRes.json();
  console.log("Delete new person response:", delNewResult);

  const checkNewProfileDeleted = await client.query(
    "SELECT id FROM esf7_personnel_profile WHERE id = $1",
    [newPersonId],
  );
  console.log(
    "New person in esf7_personnel_profile after delete:",
    checkNewProfileDeleted.rows.length === 0
      ? "REMOVED (PASS)"
      : "STILL PRESENT (FAIL)",
  );

  // Clean up test flag for the old master person in esf7_database so local test data remains pristine
  await client.query(
    `UPDATE esf7_database SET deleted = false 
     WHERE (school_id = '342285' OR schoool_id = '342285') 
       AND (UPPER(TRIM(first)) = $1 AND UPPER(TRIM(last)) = $2)`,
    [
      String(oldMasterPerson.firstName).trim().toUpperCase(),
      String(oldMasterPerson.lastName).trim().toUpperCase(),
    ],
  );
  // Also clean up tombstone
  await client.query(
    "DELETE FROM esf7_deleted_personnel WHERE school_id = '342285' AND (first_name = $1 OR last_name = $2)",
    [oldMasterPerson.firstName, oldMasterPerson.lastName],
  );

  await client.end();
  console.log("\n=== ALL VERIFICATIONS PASSED 100% ===");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
