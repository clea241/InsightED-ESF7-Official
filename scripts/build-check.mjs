// Builds the client and FAILS on any build warning, then enforces bundle size budgets.
// Usage: node scripts/build-check.mjs
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const clientDir = path.resolve("client");
// Budgets (bytes). Current build: entry ~482 kB raw / ~128 kB gzip. Raise deliberately, never by accident.
const BUDGET = {
  entryRaw: 520 * 1024, // the main index-*.js loaded by every visitor
  entryGzip: 145 * 1024,
  anyChunkRaw: 520 * 1024, // largest lazy chunk
  totalGzip: 620 * 1024, // all JS together
};

const build = spawnSync("npx vite build", {
  cwd: clientDir,
  encoding: "utf8",
  shell: true,
});
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
if (build.status !== 0) {
  console.error("[build-check] FAILED: vite build exited with an error");
  process.exit(1);
}
const output = `${build.stdout}\n${build.stderr}`;
const warnings = output
  .split("\n")
  .filter((l) => /\(!\)|warning|\bwarn\b/i.test(l));
if (warnings.length) {
  console.error(
    "[build-check] FAILED: the build produced warnings:\n" +
      warnings.map((w) => "  " + w.trim()).join("\n"),
  );
  process.exit(1);
}

const assetsDir = path.join(clientDir, "dist", "assets");
const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
let totalGzip = 0;
const failures = [];
const rows = [];
for (const file of jsFiles) {
  const buf = readFileSync(path.join(assetsDir, file));
  const raw = statSync(path.join(assetsDir, file)).size;
  const gz = gzipSync(buf).length;
  totalGzip += gz;
  rows.push({
    file,
    kB: Math.round(raw / 1024),
    gzipKB: Math.round(gz / 1024),
  });
  if (raw > BUDGET.anyChunkRaw)
    failures.push(
      `${file} is ${Math.round(raw / 1024)} kB (limit ${BUDGET.anyChunkRaw / 1024} kB)`,
    );
  if (/^index-/.test(file)) {
    if (raw > BUDGET.entryRaw)
      failures.push(
        `entry ${file} is ${Math.round(raw / 1024)} kB raw (limit ${BUDGET.entryRaw / 1024} kB)`,
      );
    if (gz > BUDGET.entryGzip)
      failures.push(
        `entry ${file} is ${Math.round(gz / 1024)} kB gzip (limit ${BUDGET.entryGzip / 1024} kB)`,
      );
  }
}
if (totalGzip > BUDGET.totalGzip)
  failures.push(
    `total JS is ${Math.round(totalGzip / 1024)} kB gzip (limit ${BUDGET.totalGzip / 1024} kB)`,
  );

rows.sort((a, b) => b.kB - a.kB);
console.table(rows.slice(0, 6));
console.log(`[build-check] total JS gzip: ${Math.round(totalGzip / 1024)} kB`);
if (failures.length) {
  console.error(
    "[build-check] FAILED bundle budget:\n" +
      failures.map((f) => "  " + f).join("\n"),
  );
  process.exit(1);
}
console.log("[build-check] OK: build clean, bundle within budget");
