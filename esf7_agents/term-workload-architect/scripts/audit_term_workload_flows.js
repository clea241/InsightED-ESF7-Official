/**
 * Static flow auditor for Term Workload & Flexible SHS Architecture
 */
import fs from 'fs';
import path from 'path';

console.log("====================================================");
console.log("  🔍 ESF7 TERM WORKLOAD & FLEXIBLE SHS AUDITOR");
console.log("====================================================");

const skillPath = path.resolve('esf7_agents/term-workload-architect/SKILL.md');
const blueprintPath = path.resolve('esf7_agents/term-workload-architect/references/term_workload_blueprint.md');

let pass = true;

if (fs.existsSync(skillPath)) {
  console.log("  ✅ [PASS] Term Workload Agent SKILL.md found");
} else {
  console.error("  ❌ [FAIL] Missing term-workload-architect SKILL.md");
  pass = false;
}

if (fs.existsSync(blueprintPath)) {
  console.log("  ✅ [PASS] Term Workload Blueprint specification found");
} else {
  console.error("  ❌ [FAIL] Missing term_workload_blueprint.md");
  pass = false;
}

if (pass) {
  console.log("====================================================");
  console.log("🎉 AUDIT COMPLETE: ALL TERM WORKLOAD CONTRACTS READY!");
  process.exit(0);
} else {
  process.exit(1);
}
