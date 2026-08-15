/**
 * Static Audit Script for ESF7 Personnel Profiling Flows
 * 
 * Usage: node esf7_agents/personnel-profiling-architect/scripts/audit_profiling_flows.js
 */

const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.resolve(__dirname, '../../../client/src/pages/PersonnelProfile.jsx');

console.log('====================================================');
console.log('  🔍 ESF7 PERSONNEL PROFILING FLOW & BLUEPRINT AUDITOR');
console.log('====================================================');
console.log(` Target File: ${PROFILE_PATH}`);

if (!fs.existsSync(PROFILE_PATH)) {
  console.error('❌ ERROR: PersonnelProfile.jsx file not found!');
  process.exit(1);
}

const code = fs.readFileSync(PROFILE_PATH, 'utf-8');

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
checkRule('useApp Hook', code.includes('useApp('), 'PersonnelProfile.jsx must consume useApp().');
checkRule('Active Personnel Selection', code.includes('activePersonnelId'), 'Must access activePersonnelId from context.');
checkRule('Save Personnel Changes Hook', code.includes('savePersonnelChanges'), 'Must consume savePersonnelChanges from context.');

console.log('\n--- 2. Learning Area Taught Matrix Audit ---');
checkRule('Curriculum Eras Constant', code.includes('CURRICULUM_ERAS'), 'Must define CURRICULUM_ERAS.');
checkRule('Primary Subjects Constant', code.includes('PRIMARY_SUBJECTS'), 'Must define PRIMARY_SUBJECTS.');
checkRule('Service Years Cap Calculation', code.includes('getMaxAllowedServiceYears'), 'Must calculate service years cap.');
checkRule('Cell Max Years Calculation', code.includes('getCellMaxYears'), 'Must bound cell years via getCellMaxYears.');
checkRule('Learning Area API Integration', code.includes('api.getLearningAreas') && code.includes('api.saveLearningArea'), 'Must integrate Learning Area API endpoints.');

console.log('\n--- 3. Modals & Local Draft Persistence Audit ---');
checkRule('RA 1080 Custom Eligibility Modal', code.includes('showRa1080Modal'), 'Must integrate RA 1080 Board Exam input modal.');
checkRule('DepEd Email Policy Modal', code.includes('<DepEdEmailInfoModal'), 'Must integrate DepEd Email info modal.');
checkRule('Local Storage Draft Auto-Save', code.includes('draft_personnel_') || code.includes('draft_learning_areas_'), 'Must support local storage draft caching.');

console.log('\n====================================================');
if (errors === 0 && warnings === 0) {
  console.log('🎉 AUDIT COMPLETE: ALL PROFILING FLOW CONTRACTS INTACT & VALIDATED!');
  process.exit(0);
} else if (errors === 0) {
  console.log(`⚠️ AUDIT PASSED WITH ${warnings} WARNING(S). Review suggestions above.`);
  process.exit(0);
} else {
  console.log(`❌ AUDIT FAILED: Found ${errors} error(s) and ${warnings} warning(s). Please review failure details above.`);
  process.exit(1);
}
