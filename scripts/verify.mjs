// One command for every quality gate, in order: lint, typecheck, test (unit with coverage + integration), build (+ env check), smoke.
// On success it writes .verify-passed with the current commit, which the deploy script requires.
// Usage: npm run verify      (set VERIFY_SKIP_STAMP=1 to skip writing the stamp)
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const steps = [
  ['lint', 'npm run lint'],
  ['typecheck', 'npm run typecheck'],
  ['unit tests + coverage thresholds', 'npm run test:coverage'],
  ['integration tests (embedded PostgreSQL)', 'npm run test:integration'],
  ['environment check', 'npm run check:env'],
  ['build (warnings are errors) + bundle budget', 'npm run build'],
  ['smoke test of the built output', 'npm run smoke']
];

const git = (args) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim();
const started = Date.now();
for (const [label, cmd] of steps) {
  console.log(`\n=== verify: ${label} ===`);
  const t = Date.now();
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n[verify] FAILED at "${label}" (${cmd})`);
    process.exit(r.status || 1);
  }
  console.log(`[verify] ${label}: ok (${Math.round((Date.now() - t) / 1000)}s)`);
}

if (!process.env.VERIFY_SKIP_STAMP) {
  const stamp = { commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0, verifiedAt: new Date().toISOString() };
  writeFileSync('.verify-passed', JSON.stringify(stamp, null, 2));
  console.log(`\n[verify] wrote .verify-passed for ${stamp.commit.slice(0, 8)}${stamp.dirty ? ' (working tree had uncommitted changes: the deploy gate will reject this stamp)' : ''}`);
}
console.log(`\n[verify] ALL CHECKS PASSED in ${Math.round((Date.now() - started) / 1000)}s`);
