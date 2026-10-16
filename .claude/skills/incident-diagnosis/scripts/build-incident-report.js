#!/usr/bin/env node
"use strict";
// Build diagnosis-report.md, fix-prompt.md and announcement-draft.md from incident/<id>/investigation.json.
//   node build-incident-report.js [--incident ID]
// investigation.json fields (all optional; a missing field is written as "UNKNOWN: <what is missing>"):
//   shortName, symptom, window{since,until}, recentChanges[], hypotheses[{title,status,evidenceFor[],evidenceAgainst[]}],
//   rootCause{statement,confidence,evidence[],trigger,contributing[]}, blastRadius{tenantsAffected,usersAffected,perTenant[{tenant,count}],timeRange,kind,queries[]},
//   dataLoss{lost,recoverable,notRecoverable}, recoveryOptions[{option,tradeoffs}], backup{newest,acceptableLoss,manualBackupNeeded},
//   regressionTest{path,title,runResult,reproduced}, secretInvolved, jwtRotated, fixes[{title,description,verification}], unknowns[], followUps[],
//   announcement{whatHappened,whatChanged,knownLosses,userActions[],stillChecking[],nextUpdate,dataSafeConfirmed}
const fs = require("fs");
const path = require("path");
const g = require("./guard-incident-env.js");

const id = g.incidentId(
  process.argv.includes("--incident")
    ? process.argv[process.argv.indexOf("--incident") + 1]
    : "",
);
if (!id) {
  console.error("no incident id");
  process.exit(2);
}
const dir = g.incidentDir(id);
const rd = (f) => {
  try {
    return fs.readFileSync(path.join(dir, f), "utf8");
  } catch {
    return "";
  }
};
let inv;
try {
  inv = JSON.parse(rd("investigation.json"));
} catch (e) {
  console.error("investigation.json missing or invalid: " + e.message);
  process.exit(2);
}
const warnings = [];
const U = (v, what) => {
  if (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && !v.length)
  )
    return `UNKNOWN: ${what}`;
  return Array.isArray(v) ? v.map((x) => `- ${x}`).join("\n") : String(v);
};
const list = (a) =>
  Array.isArray(a) && a.length ? a.map((x) => `- ${x}`).join("\n") : null;

// confidence honesty
const rc = inv.rootCause || {};
let conf = ["confirmed", "probable", "unknown"].includes(rc.confidence)
  ? rc.confidence
  : "unknown";
if (conf === "confirmed" && (rc.evidence || []).length < 2) {
  conf = "probable";
  warnings.push(
    "root cause downgraded from confirmed to probable: fewer than two independent pieces of evidence",
  );
}
const hyps = inv.hypotheses || [];
if (hyps.length < 3)
  warnings.push(
    `only ${hyps.length} hypotheses recorded (at least 3 required)`,
  );
const reg = inv.regressionTest || {};
if (!reg.path && !reg.notReproducibleBecause)
  warnings.push("no regression test and no reason it could not be reproduced");

const manifest = rd("evidence/MANIFEST.sha256")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split(/\s+/));
const queries = rd("commands.log")
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter((j) => j && j.type === "query");
const timelineMd = rd("timeline.md");
const section = (title) => {
  const m = timelineMd.match(
    new RegExp(`## ${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`),
  );
  return m ? m[1].trim() : `UNKNOWN: timeline section "${title}" not available`;
};
const br = inv.blastRadius || {};
const bk = inv.backup || {};

const report = `# Diagnosis report: ${id}

## Summary
- Symptom: ${U(inv.symptom, "what users reported")}
- Window: ${U(inv.window && inv.window.since && `${inv.window.since} to ${inv.window.until || "UNKNOWN: end of window"}`, "time window")}
- Root cause (${conf.toUpperCase()}): ${U(rc.statement, "root cause statement")}
- Affected: ${U(br.tenantsAffected, "number of affected tenants")} tenants, ${U(br.usersAffected, "number of affected users")} users
- Recent changes reported: ${list(inv.recentChanges) ? "\n" + list(inv.recentChanges) : "UNKNOWN: recent deploys, config or secret changes were not recorded"}

## Impact
- Kind of impact: ${U(br.kind, "whether data is missing, wrong, or only hidden")}
- Time range of affected records: ${U(br.timeRange, "time range of affected records")}
- Backup check: newest backup ${U(bk.newest, "newest backup time")}; acceptable data loss ${U(bk.acceptableLoss, "acceptable data loss from the user")}; manual backup before any fix: ${bk.manualBackupNeeded === undefined ? "UNKNOWN: not assessed" : bk.manualBackupNeeded ? "REQUIRED, the newest backup is older than the acceptable loss" : "not required"}

## Timeline
${section("Key events")}

### First occurrence of each distinct error
${section("First occurrence of each distinct error")}

### Status code distribution
${section("Status code distribution")}

### Evidence gaps
${section("Evidence gaps")}

## Evidence
${manifest.length ? "| file | SHA-256 |\n|---|---|\n" + manifest.map(([s, f]) => `| ${f} | ${s} |`).join("\n") : "UNKNOWN: evidence manifest not found"}

## Hypotheses and outcome
${hyps.length ? hyps.map((h, i) => `### H${i + 1}: ${h.title || "UNKNOWN: title"} — ${String(h.status || "inconclusive").toUpperCase()}\n- Evidence for: ${list(h.evidenceFor) ? "\n" + list(h.evidenceFor) : "none recorded"}\n- Evidence against: ${list(h.evidenceAgainst) ? "\n" + list(h.evidenceAgainst) : "none recorded"}`).join("\n\n") : "UNKNOWN: no hypotheses recorded"}

## Root cause
- Statement: ${U(rc.statement, "root cause statement")}
- Confidence: **${conf}** (${conf === "confirmed" ? "at least two independent pieces of evidence" : "not confirmed"})
- Evidence:
${U(rc.evidence, "evidence references")}
- Trigger: ${U(rc.trigger, "what triggered it")}
- Contributing factors:
${U(rc.contributing, "contributing factors")}

## Blast radius
- Counts per tenant:
${br.perTenant && br.perTenant.length ? "| tenant (internal id) | affected records |\n|---|---|\n" + br.perTenant.map((t) => `| ${t.tenant} | ${t.count} |`).join("\n") : "UNKNOWN: per-tenant counts (run the blast radius queries)"}
- Internal ids: affected-ids.csv (local only, ids only)
- Queries run (read-only, from commands.log):
${queries.length ? queries.map((q) => `\`\`\`sql\n-- ${q.name} (${q.rowCount} rows, ${q.durationMs} ms, ${q.ts})\n${q.sql}\n\`\`\``).join("\n") : "UNKNOWN: no queries were run"}

## Data loss and recovery
- Lost: ${U(inv.dataLoss && inv.dataLoss.lost, "what is lost")}
- Recoverable: ${U(inv.dataLoss && inv.dataLoss.recoverable, "what can be recovered (device drafts, backup, queue, logs)")}
- Not recoverable: ${U(inv.dataLoss && inv.dataLoss.notRecoverable, "what cannot be recovered")}
- Recovery options (the user decides; nothing was restored):
${inv.recoveryOptions && inv.recoveryOptions.length ? inv.recoveryOptions.map((o) => `  - ${o.option}: ${o.tradeoffs || "UNKNOWN: trade-offs"}`).join("\n") : "UNKNOWN: recovery options not assessed"}

## Regression test
${reg.path ? `- File: ${reg.path}\n- Title: ${reg.title || "UNKNOWN: title"}\n- Local run: ${reg.runResult || "UNKNOWN: not run"}${reg.reproduced === false ? "\n- WARNING: the test did not fail for the stated root cause" : ""}` : `Not reproduced locally: ${U(reg.notReproducibleBecause, "reason")}`}
${inv.missingE2eScenario ? `- Recommend adding a scenario to the e2e-failure-path-tests skill: ${inv.missingE2eScenario}` : ""}

## What is not known
${U(inv.unknowns, "list of open questions")}

## Follow-ups for a blameless post-incident review
${U(inv.followUps, "follow-ups")}
Changes and commits are referenced, not people.
${warnings.length ? `\n## Report warnings\n${warnings.map((w) => `- ${w}`).join("\n")}\n` : ""}`;

const fixes = (inv.fixes || [])
  .map(
    (f, i) => `### Fix ${i + 1}: ${f.title || "UNKNOWN: title"}
${f.description || "UNKNOWN: description"}
- Must make this test pass: ${reg.path || "UNKNOWN: regression test"} (currently failing, tagged @open-incident; remove the tag in the same commit as the fix)
- Verification: ${f.verification || "UNKNOWN: how to verify"}
- Rollback: ${f.rollback || "UNKNOWN: how to roll this change back"}`,
  )
  .join("\n\n");
const fixPrompt = `# Fix prompt: ${id}

## Guardrails (read first, apply to every step)
1. Staging first: apply and verify every change on staging before production. Staging results are not proof for production.
2. Backup first: take a database backup and confirm it restores before any change that touches data. ${bk.manualBackupNeeded ? "A manual backup was flagged as REQUIRED in the diagnosis report." : ""}
3. One change at a time, one commit per fix, each with its own rollback.
4. No destructive commands: no DROP, TRUNCATE, bulk DELETE, force-push, or restore over live data without explicit written approval for that exact action.
5. Redact secrets: never print or commit tokens, passwords, connection strings or personal data.
6. Stop on unexpected results and report instead of continuing.
7. Deploy only through the normal deploy process.

## Root cause (${conf})
${U(rc.statement, "root cause statement")}

## Fixes in priority order
${fixes || "UNKNOWN: no fixes recorded in investigation.json"}

## Final checks
- The regression test ${reg.path || "UNKNOWN"} passes and no longer carries @open-incident.
- The affected records listed in the report are re-counted with the same read-only queries and match the expected result.
${inv.secretInvolved ? "- A secret was involved: rotate it after the fix, and restart sessions as needed.\n" : ""}${inv.jwtRotated ? "- JWT_SECRET rotation logs everyone out once: confirm the announcement mentions it.\n" : ""}`;

const an = inv.announcement || {};
const losses = an.knownLosses;
const safe = an.dataSafeConfirmed === true;
const actions =
  list(an.userActions) ||
  "UNKNOWN: what users should do (for example re-enter specific data or check a specific page)";
const still = list(an.stillChecking) || "UNKNOWN: what is still being checked";
const announcement = `# Announcement draft: ${id}
Fill every UNKNOWN before sending. Do not add facts that are not confirmed.

## Short version (chat)
${losses ? `We are sorry: ${losses}. ` : ""}${U(an.whatHappened, "plain-language description of what happened")} ${an.whatChanged ? `What we changed: ${an.whatChanged}.` : "UNKNOWN: what has changed so far."} ${inv.jwtRotated ? "You may be asked to log in once more. " : ""}${safe ? "We have confirmed that the rest of your saved data is safe. " : "We are still checking what was affected and will not say your data is safe until we have confirmed it. "}Next update: ${U(an.nextUpdate, "time of next update")}.

## Longer version (email)
Subject: ${U(an.subject, "subject line")}

Hello,

${losses ? `We are sorry. ${losses}\n\n` : ""}What happened: ${U(an.whatHappened, "plain-language description of what happened")}

What we have changed: ${U(an.whatChanged, "what has changed so far")}

What you should do:
${actions}
${inv.jwtRotated ? "- You will be logged out once. Please log in again; this is expected.\n" : ""}
What we are still checking:
${still}

${safe ? "We have confirmed that the rest of your saved data is intact." : "We will tell you as soon as we have confirmed the state of your data. Until then, please do not clear your browser data or discard unsaved changes."}

Our next update: ${U(an.nextUpdate, "time of next update")}.

Thank you for your patience.
`;

const scrub = (t, name) => {
  const r = g.redact(t);
  if (r !== t)
    warnings.push(
      `${name}: personal data or secrets were redacted from the output`,
    );
  return r;
};
fs.writeFileSync(
  path.join(dir, "diagnosis-report.md"),
  scrub(report, "diagnosis-report.md"),
  { mode: 0o600 },
);
fs.writeFileSync(
  path.join(dir, "fix-prompt.md"),
  scrub(fixPrompt, "fix-prompt.md"),
  { mode: 0o600 },
);
fs.writeFileSync(
  path.join(dir, "announcement-draft.md"),
  scrub(announcement, "announcement-draft.md"),
  { mode: 0o600 },
);
const unk = [
  "diagnosis-report.md",
  "fix-prompt.md",
  "announcement-draft.md",
].map((f) => `${f}: ${(rd(f).match(/UNKNOWN:/g) || []).length} UNKNOWN fields`);
console.log(
  "written: diagnosis-report.md, fix-prompt.md, announcement-draft.md\n" +
    unk.join("\n"),
);
warnings.forEach((w) => console.log("WARNING " + w));
process.exit(0);
