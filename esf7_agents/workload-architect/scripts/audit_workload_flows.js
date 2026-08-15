/**
 * Static Audit Script for ESF7 Workload Flows
 * 
 * Usage: node esf7_agents/workload-architect/scripts/audit_workload_flows.js
 */

const fs = require('fs');
const path = require('path');

const WORKLOAD_PATH = path.resolve(__dirname, '../../../client/src/pages/Workload.jsx');

console.log('====================================================');
console.log('  🔍 ESF7 WORKLOAD FLOW & BLUEPRINT AUDITOR');
console.log('====================================================');
console.log(` Target File: ${WORKLOAD_PATH}`);

if (!fs.existsSync(WORKLOAD_PATH)) {
  console.error('❌ ERROR: Workload.jsx file not found!');
  process.exit(1);
}

const code = fs.readFileSync(WORKLOAD_PATH, 'utf-8');

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

console.log('\n--- 1. Subject Normalization & HGP Logic Audit ---');
checkRule('normalizeSubjectName Helper', code.includes('normalizeSubjectName'), 'Must define normalizeSubjectName helper.');
checkRule('HGP Normalization Rule', code.includes("return 'HGP'"), 'Must normalize Homeroom Guidance variants to HGP.');
checkRule('Advisory Subject Detector', code.includes('isAdvisorySub'), 'Must define isAdvisorySub helper.');
checkRule('Advisory/HGP Pair Exclusion', code.includes('isAdvisoryOrHgpPair'), 'Must define isAdvisoryOrHgpPair conflict exclusion rule.');

console.log('\n--- 2. Delegation HTML Package Exporter Audit ---');
checkRule('generateWorkloadDelegationHTML Function', code.includes('generateWorkloadDelegationHTML'), 'Must define generateWorkloadDelegationHTML exporter.');
checkRule('Delegation Package Version Marker', code.includes('INSIGHTED_WORKLOAD_DELEGATION_V1'), 'Must include INSIGHTED_WORKLOAD_DELEGATION_V1 payload marker.');
checkRule('Base64 Payload Encoding', code.includes('btoa(') || code.includes('jsonB64'), 'Must encode delegation payload in Base64.');

console.log('\n--- 3. Timetable Grid & Categories Audit ---');
checkRule('Elementary Category Support', code.includes('Elementary'), 'Must support Elementary workload category.');
checkRule('Junior High Category Support', code.includes('Junior High'), 'Must support Junior High workload category.');
checkRule('Senior High Category Support', code.includes('Senior High'), 'Must support Senior High workload category.');

console.log('\n====================================================');
if (errors === 0 && warnings === 0) {
  console.log('🎉 AUDIT COMPLETE: ALL WORKLOAD FLOW CONTRACTS INTACT & VALIDATED!');
  process.exit(0);
} else if (errors === 0) {
  console.log(`⚠️ AUDIT PASSED WITH ${warnings} WARNING(S). Review suggestions above.`);
  process.exit(0);
} else {
  console.log(`❌ AUDIT FAILED: Found ${errors} error(s) and ${warnings} warning(s). Please review failure details above.`);
  process.exit(1);
}
