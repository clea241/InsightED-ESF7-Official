#!/usr/bin/env node
"use strict";
// results.json (+ manifest) -> markdown report, with the self-check numbers the skill requires.
// Usage: node render_report.js [--out <dir>] [--root d] [--config f] [--save <file.md>]
const {
  fs,
  path,
  parseArgs,
  findRoot,
  loadConfig,
  outDir,
  mask,
} = require("./lib");

const args = parseArgs();
const root = findRoot(args);
const cfg = loadConfig(args, root);
const dir = outDir(cfg, args);
const manifest = JSON.parse(
  fs.readFileSync(path.join(dir, "endpoints.manifest.json"), "utf8"),
);
const run = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
const ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const cell = (v) =>
  String(v === undefined || v === null || v === "" ? "-" : v)
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
const probeCell = (r, name) => {
  const ps = r.probes.filter(
    (p) => p.probe === name || p.probe.startsWith(name + ":"),
  );
  if (ps.length) return ps.map((p) => p.status).join("/");
  const sk = r.skipped.find(
    (s) => s.probe === name || (name === "writer" && s.probe === "writer"),
  );
  return sk ? "skip" : "-";
};

const L = [];
const byStatus = run.results.reduce((a, r) => {
  a[r.status] = (a[r.status] || 0) + 1;
  return a;
}, {});
const sev = ORDER.map((s) => [s, run.findings.filter((f) => f.severity === s)]);
const tested = run.results.filter((r) => r.probes.length).length;

L.push(
  `# Endpoint health report${manifest.meta.project ? ` - ${manifest.meta.project}` : ""}`,
);
L.push("");
L.push(
  `**Summary:** ${manifest.endpoints.length} endpoints in manifest, ${run.meta.selectedEndpoints} selected, ${tested} tested, ${run.results.filter((r) => r.status === "skipped").length} skipped, ${run.results.filter((r) => r.status === "not-testable").length} not testable, ${byStatus.healthy || 0} healthy, ${byStatus["gate-only"] || 0} only auth-gate checked (no credentials), ${byStatus.inconclusive || 0} inconclusive, ${byStatus.failing || 0} failing, ${byStatus.warnings || 0} with warnings. Findings: ${sev.map(([s, l]) => `${s} ${l.length}`).join(", ")}.`,
);
L.push(
  `Mode: ${run.meta.mode}. Base URL: ${run.meta.baseUrl}${run.meta.startedOwnServer ? " (server started by the skill)" : ""}. Role used: ${run.meta.role ? JSON.stringify(run.meta.role) : "none (public endpoints only)"}. Run: ${run.meta.startedAt}.`,
);
L.push("");
L.push("## Findings");
let n = 0;
for (const [s, list] of sev) {
  if (!list.length) continue;
  L.push("", `### ${s} (${list.length})`);
  // group identical titles so a repeated cause is one line, not forty
  const groups = new Map();
  for (const f of list) {
    const k = `${f.title}|${f.probe}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  for (const [, g] of groups) {
    const f = g[0];
    n++;
    L.push(
      `${n}. **${cell(f.title)}** - probe \`${f.probe}\` - ${g.length} endpoint(s)`,
    );
    for (const x of g.slice(0, 8)) {
      const req = x.request
        ? `${x.request.method} ${x.request.path}`
        : x.endpoint;
      L.push(
        `   - \`${cell(req)}\` expected ${cell(x.expected)}, got ${cell(x.actual)}${x.status !== undefined && !String(x.actual).startsWith("HTTP") ? ` (HTTP ${x.status})` : ""}${x.handler ? ` - \`${x.handler}\`` : ""}${x.bodyPreview ? `\n     body: \`${mask(cell(x.bodyPreview).slice(0, 160))}\`` : ""}`,
      );
    }
    if (g.length > 8)
      L.push(`   - ...and ${g.length - 8} more (see results.json)`);
    L.push(`   - fix: ${cell(f.fix || fixHint(f))}`);
  }
}
if (!n) L.push("", "No findings.");

function fixHint(f) {
  if (/leaks internals/.test(f.title))
    return 'Return a generic message to clients (e.g. "Internal error") and log the detail server-side only.';
  if (/Server error 5/.test(f.title))
    return "Validate input before the query and map expected failures to 4xx; keep 5xx for real faults.";
  if (/accepted with 2xx/.test(f.title))
    return "Validate required fields/types and reject with 400/422 before writing.";
  if (/without credentials/.test(f.title))
    return "Put the auth middleware on this route or its mount.";
  if (/not in the schema/.test(f.title))
    return "Create the missing table via a reviewed migration, or remove the dead query.";
  if (/Inconsistent error body/.test(f.title))
    return "Pick one error envelope (for example { error }) and use it everywhere.";
  if (/mapping/.test(f.title))
    return "Resolve manually (reference/db-table-mapping.md) and record the tables.";
  return "Investigate the handler at the file:line shown.";
}

L.push("", "## Endpoint matrix");
L.push(
  "| Endpoint | Auth | Tables read | Tables written | Happy | No-auth | Bad-input | Writer | Max ms | Status |",
);
L.push("|---|---|---|---|---|---|---|---|---|---|");
for (const r of run.results) {
  const ms = r.probes.length ? Math.max(...r.probes.map((p) => p.ms)) : "-";
  const tr =
    (r.tablesRead || []).join(", ") +
    (r.tableMappingConfidence !== "resolved"
      ? ` (${r.tableMappingConfidence})`
      : "");
  L.push(
    `| \`${cell(r.id)}\` | ${r.auth} | ${cell(tr)} | ${cell((r.tablesWritten || []).join(", "))} | ${probeCell(r, "happy")} | ${probeCell(r, "no-auth")} | ${probeCell(r, "bad-input")} | ${probeCell(r, "writer")} | ${ms} | ${r.status}${r.reason ? ` (${cell(r.reason).slice(0, 60)})` : ""} |`,
  );
}

L.push("", "## Table coverage");
const readBy = new Map();
const writtenBy = new Map();
for (const e of manifest.endpoints) {
  (e.tablesRead || []).forEach((t) => {
    if (!readBy.has(t)) readBy.set(t, []);
    readBy.get(t).push(e.id);
  });
  (e.tablesWritten || []).forEach((t) => {
    if (!writtenBy.has(t)) writtenBy.set(t, []);
    writtenBy.get(t).push(e.id);
  });
}
const tables = [...new Set([...readBy.keys(), ...writtenBy.keys()])].sort();
L.push("| Table | Read by | Written by |", "|---|---|---|");
for (const t of tables)
  L.push(
    `| \`${t}\`${/perssonel/.test(t) ? " (real spelling)" : ""} | ${(readBy.get(t) || []).length} | ${(writtenBy.get(t) || []).length}${
      (writtenBy.get(t) || []).length
        ? ": " +
          writtenBy
            .get(t)
            .slice(0, 3)
            .map((x) => "`" + x + "`")
            .join(", ") +
          ((writtenBy.get(t) || []).length > 3 ? ", ..." : "")
        : ""
    } |`,
  );
const unres = manifest.endpoints.filter(
  (e) => e.tableMappingConfidence !== "resolved",
);
L.push(
  "",
  `Mapping confidence: ${JSON.stringify(manifest.meta.tableMapping && manifest.meta.tableMapping.confidence)}. Schema source: ${manifest.meta.tableMapping && manifest.meta.tableMapping.schemaSource}.`,
);
if (unres.length) {
  L.push("", "Endpoints with partial/unresolved mapping:");
  unres.forEach((e) =>
    L.push(
      `- \`${e.id}\` (${e.tableMappingConfidence}) - ${cell(e.tableMappingNotes.filter((x) => !/intentional/.test(x))[0] || "")}`,
    ),
  );
}
const dr = manifest.endpoints.filter((e) =>
  (e.tablesWritten || []).includes("school_drafts"),
);
if (dr.length)
  L.push(
    "",
    `Endpoints that still write \`school_drafts\`: ${dr.map((e) => "`" + e.id + "`").join(", ")}. Persistence design is out of scope here; see the draft-normalization-audit skill.`,
  );
const runtime = run.results.filter(
  (r) => r.runtimeTableChanges && r.runtimeTableChanges.length,
);
L.push(
  "",
  `Runtime table check (invalid-payload probes): ${run.meta.db ? (run.meta.statsNoisy ? "INCONCLUSIVE (database was not idle)" : "database idle at start") : "not run"}; ${runtime.length} endpoint(s) showed table changes. Table counters changed during the whole run: ${run.tableTotalsDuringRun ? run.tableTotalsDuringRun.map((c) => `${c.table} +${c.ins}/~${c.upd}/-${c.del}`).join(", ") || "none" : "not measured"}.`,
);

L.push("", "## Skipped / not testable");
const sk = run.results.filter(
  (r) =>
    r.status === "skipped" ||
    r.status === "not-testable" ||
    r.skipped.length ||
    r.reasons.length,
);
const reasons = new Map();
for (const r of sk)
  for (const x of [
    r.reason,
    ...r.skipped.map((s) => `${s.probe}: ${s.reason}`),
    ...r.reasons,
  ].filter(Boolean)) {
    const k = x.replace(/HTTP \d+/, "HTTP n");
    if (!reasons.has(k)) reasons.set(k, []);
    reasons.get(k).push(r.id);
  }
for (const [k, ids] of reasons)
  L.push(
    `- ${k}: ${ids.length} endpoint(s) (e.g. ${ids
      .slice(0, 3)
      .map((x) => "`" + x + "`")
      .join(", ")})`,
  );

L.push("", "## Not verified");
if (!run.notVerified.length) L.push("- Nothing outstanding.");
run.notVerified.forEach((x) => L.push(`- ${x}`));
L.push(
  `- The database the running server actually uses is inferred from ${manifest.meta.configFile ? "the env file" : "the config"} and the checks above; it is not read back from the server process.`,
);
if (run.logs)
  L.push(
    `- Server logs: ${run.logs.source}${run.logs.hits && run.logs.hits.length ? `; ${run.logs.hits.length} error line(s) matched` : ""}.`,
  );

// ---- self-check numbers
const mIds = new Set(manifest.endpoints.map((e) => e.id));
const rIds = new Set(run.results.map((r) => r.id));
const missing = [...mIds].filter(
  (id) =>
    !rIds.has(id) && run.meta.selectedEndpoints === manifest.endpoints.length,
);
const cc = manifest.meta.countCheck;
L.push("", "## Self-check");
L.push(
  `- Report endpoints: ${run.results.length}; manifest: ${manifest.endpoints.length}; missing from results: ${missing.length}.`,
);
L.push(
  `- Independent count: ${cc.independentGrepDeclarations} route declarations by grep vs ${cc.distinctDeclarationsInManifest} distinct declarations in the manifest (${manifest.endpoints.length} endpoints after resolving ${manifest.meta.mounts.length} mounts, where one router can be mounted under several prefixes). Differences: ${cc.differences.length ? JSON.stringify(cc.differences) : "none"}.`,
);
L.push(
  `- Unresolved routes/mounts in discovery: ${manifest.meta.unresolvedRoutes.length}. Spec cross-check: ${(manifest.meta.spec.note || `only in code ${manifest.meta.spec.onlyInCode.length}, only in spec ${manifest.meta.spec.onlyInSpec.length}`).replace(/.$/, "")}.`,
);
const noStatus = run.results.filter((r) => !r.status).length;
const noTables = manifest.endpoints.filter(
  (e) => e.tablesRead === null || e.tablesWritten === null,
).length;
L.push(
  `- Endpoints without a status: ${noStatus}. Endpoints without a table mapping result: ${noTables}.`,
);
const text = L.join("\n");
const leaked = [
  /eyJ[\w-]{10,}\.[\w-]{10,}\./,
  /"password"\s*:\s*"[^*]/i,
].filter((re) => re.test(text));
if (leaked.length) {
  console.error(
    "SAFETY: report contains something that looks like a secret; not written.",
  );
  process.exit(1);
}
const file = args.save
  ? path.resolve(args.save)
  : path.join(dir, "endpoint-health-report.md");
fs.writeFileSync(file, text);
console.log(
  text.split("\n").length > 100
    ? `Report: ${text.split("\n").length} lines, saved to ${file}\n\n${L.slice(0, 40).join("\n")}\n...`
    : text,
);
