/**
 * Static Audit Script for ESF7 Personnel Roster Flows
 * 
 * Usage: node esf7_agents/roster-architect/scripts/audit_roster_flows.js
 */

const fs = require('fs');
const path = require('path');

const ROSTER_PATH = path.resolve(__dirname, '../../../client/src/pages/Roster.jsx');
const PROFILE_PATH = path.resolve(__dirname, '../../../client/src/pages/PersonnelProfile.jsx');

console.log('====================================================');
console.log('  🔍 ESF7 PERSONNEL ROSTER FLOW & BLUEPRINT AUDITOR');
console.log('====================================================');
console.log(` Target File 1: ${ROSTER_PATH}`);
console.log(` Target File 2: ${PROFILE_PATH}`);

if (!fs.existsSync(ROSTER_PATH)) {
  console.error('❌ ERROR: Roster.jsx file not found!');
  process.exit(1);
}

if (!fs.existsSync(PROFILE_PATH)) {
  console.error('❌ ERROR: PersonnelProfile.jsx file not found!');
  process.exit(1);
}

const rosterCode = fs.readFileSync(ROSTER_PATH, 'utf-8');
const profileCode = fs.readFileSync(PROFILE_PATH, 'utf-8');

let errors = 0;
let warnings = 0;

function checkRule(name, condition, errorMsg, isWarning = false) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    if (isWarning) {
      warnings++;
      console.log(`  ⚠️  [WARN] ${name}: ${errorMsg}`);
    } else {
      errors++;
      console.log(`  ❌ [FAIL] ${name}: ${errorMsg}`);
    }
  }
}

console.log('\n--- 1. Context & State Ingestion Audit ---');
checkRule('useApp Hook (Roster)', rosterCode.includes('useApp('), 'Roster.jsx must consume useApp().');
checkRule('useApp Hook (Profile)', profileCode.includes('useApp('), 'PersonnelProfile.jsx must consume useApp().');
checkRule('Personnel State', rosterCode.includes('personnel'), 'Roster.jsx must access personnel array.');
checkRule('Add Personnel Hook', rosterCode.includes('addPersonnel'), 'Roster.jsx must consume addPersonnel from context.');
checkRule('Delete Personnel Hook', rosterCode.includes('deletePersonnel'), 'Roster.jsx must consume deletePersonnel from context.');
checkRule('Toggle School Head Hook', rosterCode.includes('toggleSchoolHead'), 'Roster.jsx must consume toggleSchoolHead from context.');
checkRule('Commit Draft Personnel Hook', rosterCode.includes('commitDraftPersonnel'), 'Roster.jsx must consume commitDraftPersonnel from context.');

console.log('\n--- 2. Validation & Business Rules Audit ---');
checkRule('School Head Conflict Check', rosterCode.includes('checkIsHead') || rosterCode.includes('currentHead'), 'Must enforce single School Head validation rules.');
checkRule('Non-Teaching School Head Guard', rosterCode.includes('isNonTeaching'), 'Must disallow Non-Teaching personnel from being School Head.');
checkRule('Draft Auto-Fill Commitment Banner', rosterCode.includes('isDraft'), 'Must detect and handle auto-filled draft personnel records.');
checkRule('DepEd Email Format Policy', rosterCode.includes('@deped.gov.ph'), 'Must format DepEd email as username@deped.gov.ph.');

console.log('\n--- 3. Navigation & View Routing Audit ---');
checkRule('Profile Target Navigation', rosterCode.includes("setActiveView('profile')"), 'Must set active view to profile when viewing personnel.');
checkRule('Workload Target Navigation', rosterCode.includes("setActiveView('workload')"), 'Must set active view to workload when viewing workload.');
checkRule('Active Personnel Selection', rosterCode.includes('setActivePersonnelId'), 'Must set active personnel ID before navigating.');

console.log('\n====================================================');
if (errors === 0 && warnings === 0) {
  console.log('🎉 AUDIT COMPLETE: ALL ROSTER FLOW CONTRACTS INTACT & VALIDATED!');
  process.exit(0);
} else if (errors === 0) {
  console.log(`⚠️ AUDIT PASSED WITH ${warnings} WARNING(S). Review suggestions above.`);
  process.exit(0);
} else {
  console.log(`❌ AUDIT FAILED: Found ${errors} error(s) and ${warnings} warning(s). Please review failure details above.`);
  process.exit(1);
}
