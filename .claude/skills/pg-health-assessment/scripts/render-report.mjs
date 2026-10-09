#!/usr/bin/env node
// Renders pg-health-reports/pg-health-<date>.md and .json from findings.json + json.json. No database access.
// Usage: node render-report.mjs [--root <path>] [--findings f] [--json f] [--out-dir dir] [--date YYYY-MM-DD]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : d;
};
const SEV = ["critical", "high", "medium", "low", "info"];
const MB = 1048576;
const fmtB = (b) =>
  b == null
    ? "-"
    : b >= 1048576
      ? (b / 1048576).toFixed(1) + " MB"
      : Math.round(b) + " B";

export function render(F, J, dateStr) {
  const L = [];
  const p = (s = "") => L.push(s);
  p(`# PostgreSQL health assessment - ${dateStr}`);
  p();
  p("## Summary and score");
  p();
  p(
    `- Target: host \`${F.target.host}\`, database \`${F.target.database}\` (PostgreSQL ${F.serverVersion || "unknown"})`,
  );
  p(`- Collected: ${F.collectedAt}`);
  p(`- **Score: ${F.score} / 100**`);
  p(
    `- Host facts: RAM ${F.host.ramGb.value ? F.host.ramGb.value + " GB (" + F.host.ramGb.source + ")" : "unverified"}, storage ${F.host.storage.value ? F.host.storage.value + " (" + F.host.storage.source + ")" : "unverified"}`,
  );
  p();
  p("| Category | Weight | Penalty (capped) | Subscore |");
  p("|---|---|---|---|");
  for (const [k, c] of Object.entries(F.categories))
    p(
      `| ${k} | ${c.weight} | ${c.capped}${c.penalty > c.capped ? ` (raw ${c.penalty})` : ""} | ${c.subscore} / ${c.weight} |`,
    );
  p();
  p(
    `Findings: ${SEV.map((s) => `${F.findings.filter((f) => f.severity === s).length} ${s}`).join(", ")}. Checks evaluated with no finding: ${F.evaluated.length}.`,
  );
  p();
  p("## Unverified checks");
  p();
  if (!F.unverified.length) p("None.");
  for (const u of F.unverified) p(`- **${u.id}** (${u.category}): ${u.reason}`);
  if (F.collectionErrors.length) {
    p();
    p("Collection errors (query skipped, check unverified):");
    for (const e of F.collectionErrors) p(`- ${e.query}: ${e.message}`);
  }
  p();
  p("## Findings by severity");
  for (const s of SEV) {
    const fs_ = F.findings.filter((f) => f.severity === s);
    if (!fs_.length) continue;
    p();
    p(`### ${s[0].toUpperCase() + s.slice(1)} (${fs_.length})`);
    for (const f of fs_) {
      p();
      p(`**${f.id}** - ${f.title}${f.object ? ` (\`${f.object}\`)` : ""}  `);
      p(`Category: ${f.category}  `);
      p(`Evidence: ${f.evidence}  `);
      p(`Fix: \`${f.fix.replace(/`/g, "'")}\`  `);
      p(`Execution: ${f.execution}`);
    }
  }
  p();
  p("## JSON column verdicts");
  p();
  const cols = (J && J.columns) || [];
  if (!cols.length) p("No json/jsonb columns found.");
  else {
    p("| Column | Type | Verdict | avg / p95 / max size | Reasons |");
    p("|---|---|---|---|---|");
    for (const c of cols) {
      const v = c.classification || "unverified";
      const s =
        c.stats && c.stats.avg != null
          ? `${fmtB(c.stats.avg)} / ${fmtB(c.stats.p95)} / ${fmtB(c.stats.max)}`
          : "-";
      const why =
        c.status === "unverified"
          ? c.reason
          : [...(c.reasons || []), ...(c.watch || [])].join("; ") ||
            "within limits";
      p(
        `| \`${c.table}.${c.column}\` | ${c.type} | **${v}** | ${s} | ${why.replace(/\|/g, "/")} |`,
      );
    }
    for (const c of cols.filter((x) => x.classification === "split")) {
      p();
      p(`Recommended split for \`${c.table}.${c.column}\`:`);
      for (const pt of c.patterns) p(`- ${pt.pattern}: ${pt.detail}`);
    }
  }
  p();
  p("## ORM vs live drift");
  p();
  const d = F.drift;
  if (!d.available) p("No ORM schema was extracted; drift not evaluated.");
  else {
    const row = (label, arr) =>
      p(
        `- ${label}: ${arr.length ? arr.slice(0, 25).join(", ") + (arr.length > 25 ? ` ... (+${arr.length - 25})` : "") : "none"}`,
      );
    row("Tables only in ORM", d.tablesOnlyInOrm);
    row("Tables only in live DB", d.tablesOnlyInLive);
    row("Columns only in ORM", d.columnsOnlyInOrm);
    row("Columns only in live DB", d.columnsOnlyInLive);
    row(
      "Type mismatches",
      d.typeMismatch.map((m) => `${m.column} (ORM ${m.orm}, live ${m.live})`),
    );
    row(
      "Nullability mismatches",
      d.nullabilityMismatch.map(
        (m) => `${m.column} (ORM ${m.orm}, live ${m.live})`,
      ),
    );
    row("Indexes only in ORM", d.indexesOnlyInOrm);
    row("Indexes only in live DB", d.indexesOnlyInLive);
  }
  p();
  p("## Configuration: current vs recommended");
  p();
  const cfg = F.findings.filter(
    (f) => f.category === "Configuration" && f.severity !== "info",
  );
  if (!cfg.length)
    p("No configuration changes recommended by evaluated checks.");
  else {
    p("| Check | Current (evidence) | Recommended |");
    p("|---|---|---|");
    for (const f of cfg)
      p(
        `| ${f.id} ${f.title} | ${f.evidence.replace(/\|/g, "/")} | \`${f.fix.replace(/\|/g, "/").replace(/`/g, "'")}\` |`,
      );
  }
  p();
  p("## How to improve (prompt)");
  p();
  p("```text");
  p(
    "You are improving the health of a PostgreSQL database. Apply the fixes below in order (critical, high, medium, low).",
  );
  p(
    "Rules: work on staging first and take a verified backup before any change; one change at a time with a rollback step;",
  );
  p(
    "create/drop indexes with CONCURRENTLY outside transaction blocks; never run VACUUM FULL, TRUNCATE or DROP on production data without approval;",
  );
  p(
    "report before/after numbers; stop and report if a result is unexpected. Never print row data or secrets.",
  );
  p();
  let n = 0;
  for (const s of SEV.filter((x) => x !== "info"))
    for (const f of F.findings.filter((x) => x.severity === s)) {
      n++;
      p(
        `${n}. [${s.toUpperCase()}] ${f.id} ${f.title}${f.object ? " - " + f.object : ""}`,
      );
      p(`   Why: ${f.evidence}`);
      p(`   Do: ${f.fix}`);
      p(`   When: ${f.execution}`);
    }
  if (!n) p("No fixes are required.");
  p("```");
  return L.join("\n") + "\n";
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(opt("root", process.cwd()));
  const work = path.join(root, "pg-health-reports", ".work");
  const F = JSON.parse(
    fs.readFileSync(
      path.resolve(root, opt("findings", path.join(work, "findings.json"))),
      "utf8",
    ),
  );
  let J = null;
  try {
    J = JSON.parse(
      fs.readFileSync(
        path.resolve(root, opt("json", path.join(work, "json.json"))),
        "utf8",
      ),
    );
  } catch {
    /* optional */
  }
  const dateStr = opt("date", new Date().toISOString().slice(0, 10));
  const outDir = path.resolve(root, opt("out-dir", "pg-health-reports"));
  fs.mkdirSync(outDir, { recursive: true });
  const md = path.join(outDir, `pg-health-${dateStr}.md`);
  fs.writeFileSync(md, render(F, J, dateStr));
  fs.writeFileSync(
    path.join(outDir, `pg-health-${dateStr}.json`),
    JSON.stringify(
      {
        date: dateStr,
        score: F.score,
        categories: F.categories,
        findings: F.findings,
        unverified: F.unverified,
        drift: F.drift,
        jsonColumns: J
          ? J.columns.map(
              ({
                schema,
                table,
                column,
                type,
                status,
                classification,
                severity,
                reasons,
                watch,
                patterns,
                stats,
                reason,
              }) => ({
                schema,
                table,
                column,
                type,
                status,
                classification,
                severity,
                reasons,
                watch,
                patterns,
                stats,
                reason,
              }),
            )
          : [],
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    `score=${F.score}\nreport: ${path.relative(process.cwd(), md)}\n`,
  );
}
