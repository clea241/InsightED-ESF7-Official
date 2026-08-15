/**
 * Static Audit Script for ESF7 Dashboard Flows
 * 
 * Usage: node esf7_agents/dashboard-architect/scripts/audit_dashboard_flows.js
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_PATH = path.resolve(__dirname, '../../../client/src/pages/Dashboard.jsx');

console.log('====================================================');
console.log('  🔍 ESF7 DASHBOARD FLOW & BLUEPRINT AUDITOR');
console.log('====================================================');
console.log(` Target File: ${DASHBOARD_PATH}`);

if (!fs.existsSync(DASHBOARD_PATH)) {
  console.error('❌ ERROR: Dashboard.jsx file not found at expected path!');
  process.exit(1);
}

const code = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

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

console.log('\n--- 1. Context & API Integration Audit ---');
checkRule('useApp Hook', code.includes('useApp()'), 'Dashboard.jsx must consume useApp() context.');
checkRule('Personnel State', code.includes('personnel'), 'Dashboard.jsx must access personnel array from useApp.');
checkRule('Class Sections State', code.includes('classSections'), 'Dashboard.jsx must access classSections from useApp.');
checkRule('School Info State', code.includes('schoolInfo'), 'Dashboard.jsx must access schoolInfo from useApp.');
checkRule('API getDashboardStats', code.includes('api.getDashboardStats()'), 'Dashboard.jsx must fetch stats via api.getDashboardStats().');
checkRule('useEffect Cleanup', code.includes('isCancelled'), 'useEffect should implement cancellation flag to prevent memory leak state updates.');

console.log('\n--- 2. Navigation & Action Routes Audit ---');
checkRule('Active View Roster Route', code.includes("setActiveView('roster')"), 'Must provide navigation handler to roster view.');
checkRule('Active View Classes Route', code.includes("setActiveView('organized_classes')"), 'Must provide navigation handler to organized_classes view.');
checkRule('Active View Validation Route', code.includes("setActiveView('validation')"), 'Must provide navigation handler to validation view.');
checkRule('ESF7 Upload Modal Integration', code.includes('<ESF7UploadModal'), 'Must integrate ESF7UploadModal component.');

console.log('\n--- 3. Core Calculations Audit ---');
checkRule('Age Brackets Calculation', code.includes('ageBrackets'), 'Must include demographic age bracket calculation logic.');
checkRule('Appointment Status Calculation', code.includes('appointmentCounts'), 'Must include plantilla appointment status breakdown.');
checkRule('Grade Teacher Surplus/Shortage Math', code.includes('gradeTeacherAnalysis'), 'Must include teacher excess & shortage calculation by grade.');
checkRule('Out-of-Field Teaching KPI', code.includes('inFieldCount') && code.includes('outOfFieldCount'), 'Must include out-of-field teaching quality KPI.');

console.log('\n====================================================');
if (errors === 0 && warnings === 0) {
  console.log('🎉 AUDIT COMPLETE: ALL DASHBOARD FLOW CONTRACTS INTACK & VALIDATED!');
  process.exit(0);
} else if (errors === 0) {
  console.log(`⚠️ AUDIT PASSED WITH ${warnings} WARNING(S). Review suggestions above.`);
  process.exit(0);
} else {
  console.log(`❌ AUDIT FAILED: Found ${errors} error(s) and ${warnings} warning(s). Please review failure details above.`);
  process.exit(1);
}
