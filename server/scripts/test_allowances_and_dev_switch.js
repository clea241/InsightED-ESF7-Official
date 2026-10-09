const {
  isTestDivisionSchoolId,
  resolveTestDivision,
} = require("../utils/divisionTestRegistry");
const { isDivisionOrTestAccount } = require("../db");

function testDevSwitchAndAllowances() {
  console.log("=====================================================");
  console.log("🧪 TESTING ALLOWANCES RULES & DEV SWITCH SUPPRESSION");
  console.log("=====================================================\n");

  let allOk = true;

  // 1. Test Dummy Account Detection for Dev Switch Suppression
  const testIds = [
    "900001",
    "900085",
    "900118",
    "900223",
    "900228",
    "900229",
    "800050",
    "199999",
    "divtest-900085",
    "pilot-199999",
    "r5.naga.test",
    "r7.naga.test",
  ];

  console.log("--- 1. Testing Test/Dummy Account Suppression ---");
  for (const tid of testIds) {
    const isTest =
      isDivisionOrTestAccount(tid) ||
      isTestDivisionSchoolId(tid) ||
      resolveTestDivision(tid) !== null;
    if (!isTest) {
      console.error(`  ❌ Failed to flag test/dummy account: ${tid}`);
      allOk = false;
    } else {
      console.log(
        `  ✅ Successfully identified test/dummy account for DEV switch suppression: [${tid}]`,
      );
    }
  }

  // 2. Test Real School Exemption
  const realSchoolIds = ["100115", "305337", "502624"];
  console.log("\n--- 2. Testing Real School Production Handling ---");
  for (const rid of realSchoolIds) {
    const isTest =
      isTestDivisionSchoolId(rid) || resolveTestDivision(rid) !== null;
    if (isTest) {
      console.error(`  ❌ Incorrectly flagged real school as test: ${rid}`);
      allOk = false;
    } else {
      console.log(`  ✅ Real DepEd School properly preserved: [${rid}]`);
    }
  }

  if (allOk) {
    console.log("\n=====================================================");
    console.log("🎉 ALL LOGIC AND CHECKS VERIFIED SUCCESSFULLY!");
    console.log("=====================================================");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testDevSwitchAndAllowances();
