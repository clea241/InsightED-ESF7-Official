#!/usr/bin/env node
"use strict";
/*
 * score.js - validate results.json, compute scores, render report.md, score.json and fix-prompt.md.
 * Node built-ins only. See ../reference/scoring.md for the model.
 */
const fs = require("fs");
const path = require("path");

const WEIGHT = { critical: 10, high: 5, medium: 3, low: 1 };
const CREDIT = { pass: 1, partial: 0.5, fail: 0, unknown: 0 };
const STATUSES = ["pass", "partial", "fail", "na", "unknown"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const ICON = { pass: "✅", partial: "⚠️", fail: "❌", unknown: "❓", na: "➖" };
const TIERS = ["P0", "P1", "P2", "P3"];

function die(code, msg) {
  process.stderr.write(msg + "\n");
  process.exit(code);
}
const round1 = (x) => Math.round(x * 10) / 10;

function parseArgs(argv) {
  const a = {};
  const allowed = [
    "results",
    "checks",
    "out-dir",
    "min-score",
    "evidence",
    "target",
  ];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (!argv[i].startsWith("--") || !allowed.includes(k))
      die(1, "Unknown argument: " + argv[i]);
    a[k] = argv[++i];
    if (a[k] === undefined) die(1, "Missing value for --" + k);
  }
  for (const r of ["results", "checks", "out-dir"])
    if (!a[r]) die(1, "Missing required --" + r);
  return a;
}

function loadJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return die(1, "Cannot read " + what + " (" + file + "): " + e.message);
  }
}

function validate(checks, results) {
  const errors = [];
  if (!Array.isArray(results)) return ["results.json must be a JSON array"];
  const known = new Map(checks.map((c) => [c.id, c]));
  const seen = new Map();
  for (const r of results) {
    if (!r || typeof r !== "object" || typeof r.id !== "string") {
      errors.push('entry without a string "id"');
      continue;
    }
    if (!known.has(r.id)) errors.push("unknown check ID: " + r.id);
    seen.set(r.id, (seen.get(r.id) || 0) + 1);
    if (!STATUSES.includes(r.status))
      errors.push(r.id + ': invalid status "' + r.status + '"');
    const ev = typeof r.evidence === "string" ? r.evidence.trim() : "";
    if (["pass", "partial", "fail"].includes(r.status) && !ev)
      errors.push(r.id + ": " + r.status + " requires non-empty evidence");
    if (r.status === "na" && !(typeof r.note === "string" && r.note.trim()))
      errors.push(r.id + ": na requires a justification in note");
    const blob = String(r.evidence || "") + " " + String(r.note || "");
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b/.test(blob))
      errors.push(
        r.id +
          ": evidence/note appears to contain a secret value; cite file:line instead",
      );
  }
  for (const c of checks) {
    const n = seen.get(c.id) || 0;
    if (n === 0) errors.push("missing result for check " + c.id);
    if (n > 1)
      errors.push("duplicate results for check " + c.id + " (" + n + ")");
  }
  return errors;
}

function scoreOf(checks, statusOf) {
  let earned = 0,
    possible = 0;
  for (const c of checks) {
    const s = statusOf(c);
    if (s === "na") continue;
    possible += WEIGHT[c.severity];
    earned += WEIGHT[c.severity] * CREDIT[s];
  }
  return {
    earned,
    possible,
    score: possible ? round1((earned / possible) * 100) : null,
  };
}

function verdictOf(score, blockers) {
  if (score === null) return "N/A (no applicable checks)";
  if (blockers > 0) return "NO-GO (critical blockers)";
  if (score >= 90) return "GO";
  if (score >= 80) return "GO with conditions";
  if (score >= 60) return "NOT READY";
  return "BLOCKED";
}

const tierOf = (c, status) =>
  status === "partial"
    ? "P3"
    : { critical: "P0", high: "P1", medium: "P2", low: "P3" }[c.severity];

function fill(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars))
    out = out.split("{{" + k + "}}").join(v);
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = loadJson(args.checks, "checks catalog");
  const results = loadJson(args.results, "results");
  const errors = validate(checks, results);
  if (errors.length)
    die(
      1,
      "Validation failed (" +
        errors.length +
        " problem(s)):\n - " +
        errors.join("\n - "),
    );

  const by = new Map(results.map((r) => [r.id, r]));
  const statusOf = (c) => by.get(c.id).status;
  const overall = scoreOf(checks, statusOf);
  const blockers = checks.filter(
    (c) =>
      c.severity === "critical" && ["fail", "unknown"].includes(statusOf(c)),
  );
  const verdict = verdictOf(overall.score, blockers.length);

  const categories = {};
  for (const cat of [...new Set(checks.map((c) => c.category))]) {
    const cs = checks.filter((c) => c.category === cat);
    const s = scoreOf(cs, statusOf);
    categories[cat] = Object.assign({}, s, {
      checks: cs.length,
      counts: Object.fromEntries(
        STATUSES.map((st) => [st, cs.filter((c) => statusOf(c) === st).length]),
      ),
    });
  }
  const byStatus = Object.fromEntries(
    STATUSES.map((st) => [st, checks.filter((c) => statusOf(c) === st).length]),
  );
  const bySeverity = Object.fromEntries(
    SEVERITIES.map((sv) => [
      sv,
      Object.fromEntries(
        ["total"]
          .concat(STATUSES)
          .map((st) => [
            st,
            checks.filter(
              (c) =>
                c.severity === sv && (st === "total" || statusOf(c) === st),
            ).length,
          ]),
      ),
    ]),
  );

  const project = (levels) => {
    const s = scoreOf(checks, (c) => {
      const st = statusOf(c);
      if (st === "na") return "na";
      if (levels === "all") return "pass";
      return ["fail", "unknown"].includes(st) && levels.includes(c.severity)
        ? "pass"
        : st;
    });
    const remaining = checks.filter(
      (c) =>
        c.severity === "critical" &&
        ["fail", "unknown"].includes(statusOf(c)) &&
        !(levels === "all" || levels.includes("critical")),
    ).length;
    return { score: s.score, verdict: verdictOf(s.score, remaining) };
  };
  const projections = {
    after_p0: project(["critical"]),
    after_p0_p1: project(["critical", "high"]),
    after_all: project("all"),
  };

  // fix items
  const items = checks
    .filter((c) => ["fail", "unknown", "partial"].includes(statusOf(c)))
    .map((c) => ({ c, r: by.get(c.id), tier: tierOf(c, statusOf(c)) }));
  items.sort(
    (x, y) =>
      TIERS.indexOf(x.tier) - TIERS.indexOf(y.tier) ||
      WEIGHT[y.c.severity] - WEIGHT[x.c.severity] ||
      x.c.id.localeCompare(y.c.id),
  );

  // evidence coverage
  let evidence = null;
  const evPath =
    args.evidence ||
    path.join(path.dirname(path.resolve(args.results)), "evidence.json");
  try {
    evidence = JSON.parse(fs.readFileSync(evPath, "utf8"));
  } catch {
    evidence = null;
  }
  const skippedSections =
    evidence && evidence.coverage && Array.isArray(evidence.coverage.skipped)
      ? evidence.coverage.skipped
      : [];
  const unknownChecks = checks.filter((c) => statusOf(c) === "unknown");
  const coverage = {
    evidence_found: !!evidence,
    safe_mode:
      evidence && evidence.coverage ? !!evidence.coverage.safeMode : null,
    skipped_sections: skippedSections.map((s) => ({
      section: s.section,
      status: s.status,
      enable_with: s.enableWith,
    })),
    unknown_checks: unknownChecks.length,
    unknown_due_to_skipped_sections: unknownChecks.filter((c) =>
      /skipped in safe mode/i.test(String(by.get(c.id).note || "")),
    ).length,
  };

  const generatedAt = new Date().toISOString();
  const scoreJson = {
    generated_at: generatedAt,
    overall: {
      score: overall.score,
      verdict,
      earned: overall.earned,
      possible: overall.possible,
    },
    categories,
    counts: {
      total_checks: checks.length,
      by_status: byStatus,
      by_severity: bySeverity,
    },
    critical_blockers: blockers.map((c) => ({
      id: c.id,
      title: c.title,
      status: statusOf(c),
    })),
    projections,
    fixes: Object.fromEntries(
      TIERS.map((t) => [t, items.filter((i) => i.tier === t).length]),
    ),
    evidence_coverage: coverage,
  };

  // fix-prompt
  const fmt = (i) => {
    const r = i.r;
    const state = [
      r.status,
      r.evidence ? "evidence: " + String(r.evidence).trim() : null,
      r.note ? "note: " + String(r.note).trim() : null,
    ]
      .filter(Boolean)
      .join(" — ");
    return (
      "### " +
      i.c.id +
      " — " +
      i.c.title +
      "\n- **Severity / state:** " +
      i.c.severity +
      " / " +
      state +
      "\n- **Fix:** " +
      i.c.fix_hint +
      "\n- **Verify by:** " +
      i.c.verify_by +
      "\n"
    );
  };
  const tierText = (t) => {
    const xs = items.filter((i) => i.tier === t);
    return xs.length ? xs.map(fmt).join("\n") : "_None._\n";
  };
  const tplFile = path.join(
    __dirname,
    "..",
    "reference",
    "fix-prompt-template.md",
  );
  let tpl;
  try {
    tpl = fs.readFileSync(tplFile, "utf8");
  } catch (e) {
    return die(1, "Cannot read fix-prompt template: " + e.message);
  }
  const target = args.target || "90";
  const fixPrompt = fill(tpl, {
    score: String(overall.score),
    verdict,
    date: generatedAt.slice(0, 10),
    counts: STATUSES.map((s) => s + ": " + byStatus[s]).join(", "),
    summary_line: items.length
      ? items.length +
        " check(s) need attention (" +
        TIERS.map((t) => t + ": " + scoreJson.fixes[t]).join(", ") +
        "). Critical blockers: " +
        blockers.length +
        "."
      : "No fixes are required: every applicable check passed.",
    p0_items: tierText("P0"),
    p1_items: tierText("P1"),
    p2_items: tierText("P2"),
    p3_items: tierText("P3"),
    target,
  });

  // report
  const L = [];
  L.push(
    "# Pre-launch readiness report",
    "",
    "**Score:** " + overall.score + " / 100  ",
    "**Verdict:** " + verdict + "  ",
    "**Generated:** " + generatedAt,
    "",
  );
  L.push("## Critical blockers", "");
  if (blockers.length)
    blockers.forEach((c) =>
      L.push(
        "- " +
          ICON[statusOf(c)] +
          " **" +
          c.id +
          "** " +
          c.title +
          " (" +
          statusOf(c) +
          ")",
      ),
    );
  else L.push("None.");
  L.push(
    "",
    "## Category scores",
    "",
    "| Category | Score | Pass | Partial | Fail | Unknown | N/A |",
    "|---|---|---|---|---|---|---|",
  );
  for (const [cat, v] of Object.entries(categories))
    L.push(
      "| " +
        cat +
        " | " +
        (v.score === null ? "n/a" : v.score) +
        " | " +
        ["pass", "partial", "fail", "unknown", "na"]
          .map((s) => v.counts[s])
          .join(" | ") +
        " |",
    );
  L.push(
    "",
    "## Projected score after fixes",
    "",
    "- After P0: " +
      projections.after_p0.score +
      " (" +
      projections.after_p0.verdict +
      ")",
    "- After P0 + P1: " +
      projections.after_p0_p1.score +
      " (" +
      projections.after_p0_p1.verdict +
      ")",
    "- After all fixes: " +
      projections.after_all.score +
      " (" +
      projections.after_all.verdict +
      ")",
  );
  L.push("", "## Evidence coverage", "");
  if (!coverage.evidence_found)
    L.push(
      "`evidence.json` was not found next to the results, so coverage could not be summarised.",
    );
  else {
    L.push(
      "A low score may partly reflect sections skipped in safe mode. " +
        coverage.unknown_due_to_skipped_sections +
        " of " +
        coverage.unknown_checks +
        " `unknown` checks were marked unknown because a section was skipped.",
    );
    if (coverage.skipped_sections.length) {
      L.push(
        "",
        "Skipped or unavailable sections and the flags that would raise coverage:",
      );
      coverage.skipped_sections.forEach((s) =>
        L.push("- `" + s.section + "` (" + s.status + "): " + s.enable_with),
      );
    } else L.push("All sections ran.");
  }
  L.push("", "## Checklist", "");
  for (const cat of Object.keys(categories)) {
    L.push("### " + cat, "");
    for (const c of checks.filter((x) => x.category === cat)) {
      const r = by.get(c.id);
      L.push(
        "- " +
          ICON[r.status] +
          " **" +
          c.id +
          "** [" +
          c.severity +
          "] " +
          c.title,
      );
      if (r.evidence) L.push("  - Evidence: " + String(r.evidence).trim());
      if (r.note) L.push("  - Note: " + String(r.note).trim());
    }
    L.push("");
  }

  const outDir = path.resolve(args["out-dir"]);
  const existed = fs.existsSync(outDir);
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  if (!existed) {
    try {
      fs.chmodSync(outDir, 0o700);
    } catch {
      /* best effort */
    }
  }
  const write = (name, text) => {
    const p = path.join(outDir, name);
    fs.writeFileSync(p, text, { mode: 0o600 });
    try {
      fs.chmodSync(p, 0o600);
    } catch {
      /* best effort */
    }
  };
  write("score.json", JSON.stringify(scoreJson, null, 2) + "\n");
  write("report.md", L.join("\n") + "\n");
  write("fix-prompt.md", fixPrompt);

  process.stdout.write(
    "Score: " +
      overall.score +
      "  Verdict: " +
      verdict +
      "\nCritical blockers: " +
      blockers.length +
      "\nFiles: " +
      ["report.md", "score.json", "fix-prompt.md"]
        .map((f) => path.join(args["out-dir"], f))
        .join(", ") +
      "\n",
  );
  if (args["min-score"] !== undefined) {
    const min = Number(args["min-score"]);
    if (Number.isNaN(min)) die(1, "--min-score must be a number");
    if (overall.score === null || overall.score < min) {
      process.stderr.write(
        "Score " + overall.score + " is below --min-score " + min + "\n",
      );
      process.exit(2);
    }
  }
}

main();
