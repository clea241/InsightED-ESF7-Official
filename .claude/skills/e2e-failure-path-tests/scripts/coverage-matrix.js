#!/usr/bin/env node
"use strict";
// Compares the scenarios in reference/scenarios.md with the tests in e2e/failure-paths and prints a coverage matrix.
// Usage: node coverage-matrix.js [--root <repo>] [--report]
//   (no flag)  print the matrix; exit 1 if an "Applies: always" scenario has no test
//   --report   also write e2e/reports/failure-path-report.md from the last Playwright results
//              (e2e/reports/failure-path-results.json) and e2e/failure-paths/findings.json (triage notes kept by whoever runs the skill)
// Same output structure in every repo: only the content changes.
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const skillDir = path.resolve(__dirname, "..");
const testsDir = path.join(root, "e2e", "failure-paths");
const resultsFile = path.join(
  root,
  "e2e",
  "reports",
  "failure-path-results.json",
);
const findingsFile = path.join(testsDir, "findings.json");
const reportFile = path.join(root, "e2e", "reports", "failure-path-report.md");

// ---- scenarios ----
const md = fs
  .readFileSync(path.join(skillDir, "reference", "scenarios.md"), "utf8")
  .split(/\r?\n/);
const scenarios = [];
for (let i = 0; i < md.length; i++) {
  const h = md[i].match(/^##\s+(FP-\d+)\s+(.*\S)\s*$/);
  if (!h) continue;
  let applies = "always";
  for (let j = i + 1; j < Math.min(md.length, i + 4); j++) {
    const a = md[j].match(/^Applies:\s*(.*\S)\s*$/);
    if (a) {
      applies = a[1];
      break;
    }
  }
  scenarios.push({
    id: h[1],
    title: h[2],
    applies,
    always: /^always$/i.test(applies),
  });
}

// ---- tests ----
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : /\.spec\.ts$/.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
}
const TITLE_RE = /\b(?:test|it)(?:\.\w+)?\(\s*(["'`])(FP-\d+)\b/g;
const testFiles = {}; // id -> Set(relative file)
for (const file of walk(testsDir)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(TITLE_RE)) {
    (testFiles[m[2]] ||= new Set()).add(
      path.relative(root, file).split(path.sep).join("/"),
    );
  }
}

// ---- matrix ----
const rows = scenarios.map((s) => ({
  id: s.id,
  title: s.title,
  applicable: s.always ? "always" : s.applies,
  file: testFiles[s.id] ? [...testFiles[s.id]].sort().join(", ") : "MISSING",
  always: s.always,
}));
const unknown = Object.keys(testFiles).filter(
  (id) => !scenarios.some((s) => s.id === id),
);

function table(headers, data) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...data.map((r) => String(r[i]).length)),
  );
  const line = (r) =>
    "| " + r.map((c, i) => String(c).padEnd(widths[i])).join(" | ") + " |";
  return [
    line(headers),
    "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|",
    ...data.map(line),
  ].join("\n");
}
const matrixText = table(
  ["ID", "Title", "Applicable", "Test file"],
  rows.map((r) => [r.id, r.title, r.applicable, r.file]),
);
console.log(matrixText);
const missingAlways = rows.filter((r) => r.always && r.file === "MISSING");
const missingOther = rows.filter((r) => !r.always && r.file === "MISSING");
console.log("");
console.log(
  `scenarios: ${rows.length}, with a test: ${rows.filter((r) => r.file !== "MISSING").length}, missing (always): ${missingAlways.length}, missing (conditional): ${missingOther.length}`,
);
if (unknown.length)
  console.log(
    `tests whose ID is not in reference/scenarios.md: ${unknown.join(", ")}`,
  );
if (missingOther.length)
  console.log(
    `conditional scenarios without a test (add a test or list as not applicable with a reason): ${missingOther.map((r) => r.id).join(", ")}`,
  );

if (argv.includes("--report")) writeReport();
process.exit(missingAlways.length ? 1 : 0);

// ---- report ----
function writeReport() {
  const strip = (s) => String(s || "").replace(/\x1b\[[0-9;]*m/g, "");
  let results = null;
  try {
    results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  } catch {
    /* no run yet */
  }
  const tests = [];
  (function collect(suite) {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const r = (t.results || [])[t.results.length - 1] || {};
        const status =
          t.status === "skipped"
            ? "SKIPPED"
            : t.status === "expected"
              ? "PASS"
              : t.status === "unexpected"
                ? "FAIL"
                : "FLAKY";
        const skipAnn = (t.annotations || []).find((a) => a.type === "skip");
        const idm = spec.title.match(/^(FP-\d+)/);
        tests.push({
          id: idm ? idm[1] : "",
          file: String(spec.file || "").replace(/\\/g, "/"),
          title: spec.title,
          status,
          ms: r.duration || 0,
          error: strip(r.error && r.error.message)
            .split("\n")
            .filter((l) => l.trim())
            .slice(0, 4)
            .join(" ")
            .slice(0, 320),
          reason: skipAnn && skipAnn.description ? skipAnn.description : "",
        });
      }
    }
    for (const s of suite.suites || []) collect(s);
  })({ suites: (results && results.suites) || [] });

  let findings = { findings: [], notApplicable: [] };
  try {
    findings = {
      ...findings,
      ...JSON.parse(fs.readFileSync(findingsFile, "utf8")),
    };
  } catch {
    /* none yet */
  }
  const byId = (id) => tests.filter((t) => t.id === id);
  const scenarioResult = (id) => {
    const ts = byId(id);
    if (!ts.length) return testFiles[id] ? "NOT RUN" : "NO TEST";
    if (ts.some((t) => t.status === "FAIL")) return "FAIL";
    if (ts.every((t) => t.status === "SKIPPED")) return "SKIPPED";
    if (ts.some((t) => t.status === "FLAKY")) return "FLAKY";
    return ts.some((t) => t.status === "SKIPPED")
      ? "PASS (some skipped)"
      : "PASS";
  };
  const count = (s) => tests.filter((t) => t.status === s).length;
  const naIds = new Set((findings.notApplicable || []).map((n) => n.id));

  const out = [];
  out.push("# Failure-path report", "");
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(
    `Target: local app and local test database only (guard: scripts/guard-test-env.js)`,
    "",
  );
  out.push("## Summary", "");
  out.push(
    `- Tests run: ${tests.length} (passed ${count("PASS")}, failed ${count("FAIL")}, skipped ${count("SKIPPED")}, flaky ${count("FLAKY")})`,
  );
  out.push(
    `- Scenarios with a test: ${rows.filter((r) => r.file !== "MISSING").length} of ${rows.length}; always-applicable scenarios missing a test: ${missingAlways.length}`,
  );
  if (!results)
    out.push(
      "- No Playwright results found: run scripts/run-failure-paths.sh first.",
    );
  out.push("", "## Scenarios", "");
  out.push(
    table(
      ["ID", "Scenario", "Applicable", "Test file", "Result"],
      rows.map((r) => [
        r.id,
        r.title,
        naIds.has(r.id) ? `${r.applicable} (see not applicable)` : r.applicable,
        r.file,
        scenarioResult(r.id),
      ]),
    ),
  );
  out.push("", "## Tests", "");
  out.push(
    table(
      ["Scenario", "Test", "Result", "Seconds"],
      tests.map((t) => [
        t.id || "-",
        t.title.slice(0, 110),
        t.status,
        (t.ms / 1000).toFixed(1),
      ]),
    ),
  );

  const failed = tests.filter(
    (t) => t.status === "FAIL" || t.status === "FLAKY",
  );
  out.push("", "## Failures and findings", "");
  if (!failed.length) out.push("No failing tests.");
  for (const t of failed) {
    const f = (findings.findings || []).find(
      (x) => x.id === t.id && (!x.test || t.title.includes(x.test)),
    );
    out.push(`### ${t.id || "(no id)"} ${t.title}`, "");
    out.push(`- Result: ${t.status}`);
    out.push(`- Failing assertion: ${t.error || "(see Playwright output)"}`);
    out.push(
      `- Classification: ${f ? f.classification : "NEEDS TRIAGE (real app bug, or flaky/incorrect test?)"}`,
    );
    out.push(
      `- Data lost or at risk: ${f && f.dataLost ? f.dataLost : "not stated"}`,
    );
    if (f && f.notes) out.push(`- Notes: ${f.notes}`);
    out.push("");
  }
  const skipped = tests.filter((t) => t.status === "SKIPPED");
  out.push("## Skipped tests", "");
  if (!skipped.length) out.push("None.");
  for (const t of skipped)
    out.push(`- ${t.id} ${t.title}${t.reason ? `: ${t.reason}` : ""}`);
  out.push("", "## Not applicable or partly covered", "");
  if (!(findings.notApplicable || []).length) out.push("None recorded.");
  for (const n of findings.notApplicable || [])
    out.push(`- ${n.id}: ${n.reason}`);
  out.push("", "## Coverage matrix", "", matrixText, "");
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, out.join("\n"));
  console.log(`\nreport written: ${path.relative(root, reportFile)}`);
}
