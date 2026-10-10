#!/usr/bin/env node
"use strict";
// Merges security/reports/raw/* into security/reports/security-report.md with a fixed section structure.
// Usage: node build-report.js [--root <repo>]   (manual findings: security/reports/raw/manual-findings.json)
const fs = require("fs");
const path = require("path");
const argv = process.argv.slice(2);
const root = path.resolve(argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : process.cwd());
const RAW = path.join(root, "security/reports/raw");
const SEV = ["critical", "high", "medium", "low", "info"];

// Redaction: anything secret-looking never reaches the report.
function redact(s) {
  return String(s == null ? "" : s)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, "Bearer [REDACTED]")
    .replace(/((?:password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi, "$1[REDACTED]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@\/]+:[^\s@\/]+@[^\s'"]+/gi, "[REDACTED-CONNECTION-STRING]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[REDACTED-JWT]")
    .replace(/\b(?=[A-Za-z0-9+\/_-]*\d)(?=[A-Za-z0-9+\/_-]*[A-Za-z])[A-Za-z0-9+\/_-]{32,}\b/g, "[REDACTED]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8"));
  } catch {
    return undefined;
  }
};
const findings = [];
const tools = new Map(); // name -> {ran, note}
const add = (f) => findings.push({ status: "unconfirmed", evidence: "", recommendation: "Review the finding and fix at the cited location.", ...f, location: String(f.location).split("\\").join("/") });
const mapSev = (s) => ({ error: "high", warning: "medium", critical: "critical", high: "high", moderate: "medium", medium: "medium", low: "low", info: "info", informational: "info" })[String(s).toLowerCase()] || "low";
const notRun = (name, d) => !!d && d.status === "not run" && (tools.set(name, { ran: false, note: d.reason }), true);

for (const name of ["gitleaks-tree", "gitleaks-history"]) {
  const d = readJson(name + ".json");
  if (d === undefined) tools.set(name, { ran: false, note: "no raw output" });
  else if (!notRun(name, d)) {
    tools.set(name, { ran: true, note: `${Array.isArray(d) ? d.length : 0} hit(s)` });
    for (const r of Array.isArray(d) ? d : [])
      add({ tool: name, severity: "high", title: `Possible secret (${r.RuleID})${name.endsWith("history") ? " in git history" : ""}`, location: `${r.File}:${r.StartLine}`, evidence: `rule ${r.RuleID}; value redacted`, status: "unconfirmed", rule: r.RuleID,
        recommendation: name.endsWith("history") ? "Rotate this secret (it was committed), then remove it from the code." : "Move the value to environment config; rotate it if it was ever committed or shared." });
  }
}
{
  const d = readJson("semgrep.json");
  if (d === undefined) tools.set("semgrep", { ran: false, note: "no raw output" });
  else if (!notRun("semgrep", d)) {
    tools.set("semgrep", { ran: true, note: `${(d.results || []).length} hit(s), ${(d.errors || []).length} error(s)` });
    for (const r of d.results || [])
      add({ tool: "semgrep", severity: mapSev(r.extra && r.extra.severity), title: String(r.check_id || "").split(".").slice(-2).join("."), location: `${r.path}:${r.start && r.start.line}`, evidence: redact(r.extra && r.extra.message), rule: r.check_id, recommendation: "See the rule message; confirm the data flow, then fix." });
  }
}
for (const n of ["root", "server", "client"]) {
  const d = readJson(`npm-audit-${n}.json`);
  const name = `npm-audit-${n}`;
  if (d === undefined) continue;
  if (notRun(name, d)) continue;
  const v = d.vulnerabilities || {};
  tools.set(name, { ran: true, note: `${Object.keys(v).length} vulnerable package(s)` });
  for (const [pkg, x] of Object.entries(v))
    add({ tool: name, severity: mapSev(x.severity), title: `Vulnerable dependency ${pkg}`, location: `${n === "root" ? "" : n + "/"}package.json (${pkg})`, evidence: `severity ${x.severity}; ${x.isDirect ? "direct" : "transitive"}; fix ${x.fixAvailable ? "available" : "not available"}`, status: "confirmed", rule: pkg, recommendation: x.fixAvailable ? "Run npm audit fix (review breaking changes); apply within the patch SLA." : "No fix yet: pin, replace or monitor." });
}
{
  const d = readJson("eslint-security.json");
  if (d === undefined) tools.set("eslint-security", { ran: false, note: "no raw output" });
  else if (!notRun("eslint-security", d)) {
    let n = 0;
    for (const f of Array.isArray(d) ? d : [])
      for (const m of f.messages || []) {
        if (!/security\//.test(m.ruleId || "")) continue;
        n++;
        add({ tool: "eslint-security", severity: "low", title: m.ruleId, location: `${path.relative(root, f.filePath).replace(/\\/g, "/")}:${m.line}`, evidence: redact(m.message), rule: m.ruleId, recommendation: "Pattern-based rule with many false positives: confirm exploitability before changing code." });
      }
    tools.set("eslint-security", { ran: true, note: `${n} hit(s)` });
  }
}
// sqlmap: injection verdict lines only
{
  const dir = path.join(RAW, "sqlmap");
  let ran = false;
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".findings")) {
        ran = true;
        const t = fs.readFileSync(path.join(dir, f), "utf8").trim();
        if (t) add({ tool: "sqlmap", severity: "critical", title: "SQL injection reported by sqlmap", location: `endpoint index ${f.replace(/\D/g, "")} in security/targets.json`, evidence: redact(t.split("\n").slice(0, 3).join(" | ")), status: "unconfirmed", rule: "sqli-" + f, recommendation: "Use parameterized queries; whitelist dynamic identifiers. Reproduce with a regression test." });
      }
      if (f === "not-run.json") tools.set("sqlmap", { ran: false, note: (readJson("sqlmap/not-run.json") || {}).reason || "not run" });
    }
    if (ran) tools.set("sqlmap", { ran: true, note: "see raw/sqlmap" });
  }
  if (!tools.has("sqlmap")) tools.set("sqlmap", { ran: false, note: "active scan not run" });
}
{
  const d = readJson("zap.json");
  if (d === undefined) tools.set("zap", { ran: false, note: "active scan not run" });
  else if (!notRun("zap", d)) {
    let n = 0;
    for (const site of d.site || [])
      for (const a of site.alerts || []) {
        n++;
        add({ tool: "zap", severity: mapSev(String(a.riskdesc || "").split(" ")[0]), title: redact(a.name || a.alert), location: `${site["@name"] || ""} (${(a.instances || []).length} instance(s))`, evidence: redact(a.desc), rule: "zap-" + (a.pluginid || a.name), recommendation: redact(a.solution) || "See ZAP alert." });
      }
    tools.set("zap", { ran: true, note: `${n} alert(s)` });
  }
}
// route inventory
const inv = readJson("route-inventory.json");
let invText = "Route inventory NOT RUN or failed. Do not read this as \"no unprotected routes\".";
if (inv && inv.routes && inv.routes.length) {
  const un = inv.routes.filter((r) => !r.authenticated);
  const bad = inv.routes.filter((r) => !r.authenticated && !r.allowlisted);
  invText = `${inv.routes.length} routes (${inv.framework}); ${un.length} without authentication; ${un.length - bad.length} allowlisted; ${bad.length} NOT allowlisted.\n\n| Method | Path | Authenticated | Allowlisted | Location |\n|---|---|---|---|---|\n` +
    un.map((r) => `| ${r.method} | ${r.path} | no | ${r.allowlisted ? "yes" : "NO"} | ${r.location} |`).join("\n");
  tools.set("route-inventory", { ran: true, note: `${inv.routes.length} routes` });
  for (const r of bad)
    add({ tool: "route-inventory", severity: /health/i.test(r.path) ? "medium" : "high", title: `Unauthenticated route ${r.method} ${r.path}`, location: r.location, evidence: `no auth middleware applies (${r.via}); not in security/public-routes.json`, status: "confirmed", rule: `${r.method} ${r.path}`, recommendation: "Require authentication, or add it to security/public-routes.json if it is intentionally public." });
  if (inv.warnings && inv.warnings.length) invText += "\n\nWarnings: " + inv.warnings.map(redact).join("; ");
} else tools.set("route-inventory", { ran: false, note: "no usable inventory" });
// manual findings
const manual = readJson("manual-findings.json");
const manualChecks = readJson("manual-checks.json");
for (const m of Array.isArray(manual) ? manual : []) add({ tool: "manual", ...m, evidence: redact(m.evidence), title: redact(m.title) });

// dedupe by location + rule, sort, assign ids
const seen = new Set();
const uniq = findings.filter((f) => {
  const k = `${f.location}|${f.rule || f.title}`;
  return seen.has(k) ? false : (seen.add(k), true);
});
uniq.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || a.location.localeCompare(b.location));
// Triage notes (security/reports/raw/triage.json: [{tool, rule (regex), path (regex), verdict, reason}]).
// The verdict is added to the evidence; triage never changes a status to "confirmed".
const triage = readJson("triage.json");
for (const f of uniq) {
  for (const t of Array.isArray(triage) ? triage : []) {
    if (t.tool === f.tool && new RegExp(t.rule || ".").test(f.rule || f.title) && new RegExp(t.path || ".").test(f.location)) {
      f.triage = t.verdict;
      f.evidence = redact(`[triage: ${t.verdict}] ${t.reason}. ${f.evidence}`);
      break;
    }
  }
}
// Stable ids: a registry maps location|rule to a number so ids survive re-runs and new findings.
const regFile = path.join(root, "security/reports/id-registry.json");
let reg = {};
try { reg = JSON.parse(fs.readFileSync(regFile, "utf8")); } catch { /* first run */ }
let nextId = Math.max(0, ...Object.values(reg)) + 1;
for (const f of uniq) {
  const k = `${f.location}|${f.rule || f.title}`;
  if (!reg[k]) reg[k] = nextId++;
  f.id = f.id || `SEC-${String(reg[k]).padStart(3, "0")}`;
}
fs.writeFileSync(regFile, JSON.stringify(reg, null, 2));

const count = (s, st) => uniq.filter((f) => f.severity === s && (!st || f.status === st)).length;
let md = `# Security report\n\nGenerated ${new Date().toISOString()}. Evidence is redacted. "unconfirmed" means a tool reported it and nobody has reproduced it.\n\n## Summary\n\n| Severity | Total | Confirmed | Unconfirmed |\n|---|---|---|---|\n`;
for (const s of SEV) md += `| ${s} | ${count(s)} | ${count(s, "confirmed")} | ${count(s, "unconfirmed")} |\n`;
md += `\n## Findings\n\n| ID | Severity | Status | Tool | Title | Location | Evidence (redacted) | Recommendation |\n|---|---|---|---|---|---|---|---|\n`;
const cell = (s) => String(s).replace(/\|/g, "\\|");
for (const f of uniq) md += `| ${f.id} | ${f.severity} | ${f.status} | ${f.tool} | ${cell(f.title)} | ${cell(f.location)} | ${cell(f.evidence)} | ${cell(f.recommendation)} |\n`;
if (!uniq.length) md += "| - | - | - | - | none | - | - | - |\n";
md += `\n## Tools\n\n| Tool | Ran | Note |\n|---|---|---|\n`;
for (const [k, v] of [...tools].sort()) md += `| ${k} | ${v.ran ? "yes" : "not run"} | ${cell(v.note)} |\n`;
md += `\n## Route inventory\n\n${invText}\n\n## Manual checks\n\n`;
if (Array.isArray(manualChecks) && manualChecks.length) {
  md += "| Check | Result | Note |\n|---|---|---|\n" + manualChecks.map((c) => `| ${cell(c.check)} | ${cell(c.result)} | ${cell(redact(c.note))} |`).join("\n") + "\n";
} else md += "No manual checks recorded (write security/reports/raw/manual-checks.json as [{check,result,note}]).\n";
fs.writeFileSync(path.join(root, "security/reports/security-report.md"), md);
fs.writeFileSync(path.join(RAW, "normalized-findings.json"), JSON.stringify(uniq, null, 2));
// fix-prompt.md is derived from the same normalized list as the report, so the two cannot drift apart.
const tplParts = fs.readFileSync(path.join(__dirname, "../reference/fix-prompt-template.md"), "utf8").split(/^---$/m)[1] || "";
const guardrails = tplParts.split("## Findings")[0].replace(/^\s*# .*\n/, "").trim();
const finish = "## Finish" + tplParts.split("## Finish")[1];
const testFor = (f) => f.test || (f.tool === "route-inventory" ? "e2e/security/unauthenticated-routes.spec.mjs" : null);
const groups = new Map();
for (const f of uniq.filter((x) => x.severity !== "info")) {
  const bulk = f.tool === "semgrep" || f.tool === "eslint-security";
  const k = bulk ? `${f.severity}|${f.tool}|${f.rule}|${f.triage || ""}` : f.id;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(f);
}
let fp = `# Security fix prompt\n\nGenerated from security/reports/raw/normalized-findings.json (${uniq.length} findings; same source as security-report.md). Scanner-only items are "unconfirmed" until reproduced.\n\n${guardrails}\n\n## Findings (critical, then high, medium, low)\n\n`;
for (const sev of SEV.slice(0, 4)) {
  const gs = [...groups.values()].filter((g) => g[0].severity === sev);
  if (!gs.length) continue;
  fp += `### ${sev.toUpperCase()}\n\n`;
  for (const g of gs) {
    const f = g[0];
    const t = testFor(f);
    const ids = g.length > 1 ? `${g.slice(0, 3).map((x) => x.id).join(", ")}${g.length > 3 ? `, +${g.length - 3} more` : ""}` : f.id;
    fp += `#### ${ids} ${f.title} (${f.severity}, ${f.status}${g.length > 1 ? `, ${g.length} locations` : ""})${f.triage ? ` [triage: ${f.triage}]` : ""}\n- **Location:** ${g.slice(0, 5).map((x) => "`" + x.location + "`").join(", ")}${g.length > 5 ? ` and ${g.length - 5} more (see raw/normalized-findings.json)` : ""}\n- **Evidence (redacted):** ${f.evidence}\n- **Failing regression test:** ${t ? "`" + t + "` (tag @open-finding)" : "none yet (not reproduced locally)"}\n- **Suggested fix:** ${f.recommendation}\n- **How to verify:** ${t ? "run that test, then the full suite." : "re-run the scan that reported it and the full suite."}\n\n`;
  }
}
fs.writeFileSync(path.join(root, "security/reports/fix-prompt.md"), fp + finish);
console.log(`report written: ${uniq.length} finding(s); ` + SEV.map((s) => `${s}=${count(s)}`).join(" "));
