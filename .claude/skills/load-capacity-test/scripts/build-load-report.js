#!/usr/bin/env node
"use strict";
// Builds load-test/reports/<timestamp>-load-report.md, updates load-test/history.json and flags regressions (>20%).
// Usage: node build-load-report.js [--root <repo>]
// Reads: load-test/reports/raw/latest-<scenario>.txt (+ the k6 summary, resource CSV and meta it points to), db-analysis.json, machine.json, load-model.json.
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const RAW = path.join(root, "load-test", "reports", "raw");
const SCENARIOS = ["baseline", "peak", "spike", "stress", "soak"];
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};
const model = readJson(path.join(root, "load-test", "load-model.json")) || {};
const th = Object.assign(
  {
    read_p95_ms: 800,
    write_p95_ms: 1500,
    error_rate: 0.01,
    generator_cpu_max_percent: 85,
  },
  model.thresholds || {},
);
const machine = readJson(path.join(RAW, "machine.json")) || {};
const dbA = readJson(path.join(RAW, "db-analysis.json"));
const fmt = (x, d = 0) =>
  x === null || x === undefined || Number.isNaN(x)
    ? "n/a"
    : Number(x).toFixed(d);

function readCsv(file) {
  let t = "";
  try {
    t = fs.readFileSync(file, "utf8").trim();
  } catch {
    return [];
  }
  const [head, ...rows] = t.split(/\r?\n/);
  const cols = head.split(",");
  return rows.map((r) => {
    const v = r.split(",");
    const o = {};
    cols.forEach(
      (c, i) => (o[c] = v[i] === "" || v[i] === undefined ? null : v[i]),
    );
    return o;
  });
}
const num = (rows, k) =>
  rows.map((r) => (r[k] === null ? NaN : Number(r[k]))).filter(Number.isFinite);
const max = (a) => (a.length ? Math.max(...a) : null);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function loadScenario(name) {
  const ptr = path.join(RAW, `latest-${name}.txt`);
  if (!fs.existsSync(ptr)) return null;
  const prefix = fs.readFileSync(ptr, "utf8").trim();
  const k6 = readJson(`${prefix}-k6.json`);
  const meta = readJson(`${prefix}-meta.json`) || {};
  const csv = readCsv(`${prefix}-resources.csv`);
  const m = (k6 && k6.metrics) || {};
  const d = m.http_req_duration || {};
  const routes = {};
  for (const [k, v] of Object.entries(m)) {
    const r = k.match(/^http_req_duration\{route:([^}]+)\}$/);
    if (r) routes[r[1]] = { p95: v["p(95)"], p99: v["p(99)"], med: v.med };
  }
  const failed = m.http_req_failed
    ? (m.http_req_failed.value ?? m.http_req_failed.rate ?? null)
    : null;
  const dropped = m.dropped_iterations ? (m.dropped_iterations.count ?? 0) : 0;
  const res = {
    machine_cpu_max: max(num(csv, "machine_cpu_pct")),
    machine_cpu_avg: avg(num(csv, "machine_cpu_pct")),
    app_cpu_max: max(num(csv, "app_cpu_pct")),
    k6_cpu_max: max(num(csv, "k6_cpu_pct")),
    loadavg_max: max(num(csv, "loadavg1")),
    pg_active_max: max(num(csv, "pg_active")),
    pg_idle_max: max(num(csv, "pg_idle")),
    pg_idle_in_tx_max: max(num(csv, "pg_idle_in_tx")),
    pg_waiting_max: max(num(csv, "pg_waiting")),
    pg_max_connections: max(num(csv, "pg_max_connections")),
    loop_lag_max: max(num(csv, "event_loop_lag_ms")),
    pool_in_use_max: max(num(csv, "app_pool_in_use")),
    restarts: (() => {
      const a = num(csv, "pm2_restarts");
      return a.length ? a[a.length - 1] - a[0] : null;
    })(),
    samples: csv.length,
  };
  const first = csv.find((r) => r.app_rss_mb_per_process),
    last = [...csv].reverse().find((r) => r.app_rss_mb_per_process);
  if (first && last) {
    const f = first.app_rss_mb_per_process.split(";").map(Number),
      l = last.app_rss_mb_per_process.split(";").map(Number);
    res.rss_start_mb = f.reduce((a, b) => a + b, 0);
    res.rss_end_mb = l.reduce((a, b) => a + b, 0);
    res.rss_growth_pct = res.rss_start_mb
      ? ((res.rss_end_mb - res.rss_start_mb) / res.rss_start_mb) * 100
      : null;
  }
  const errs = [];
  if (!k6) errs.push("no k6 summary found");
  const reasons = [];
  if (meta.invalid_reason) reasons.push(meta.invalid_reason);
  if (dropped > 0)
    reasons.push(
      `load generator dropped ${dropped} iterations (generator saturated)`,
    );
  if (
    res.k6_cpu_max !== null &&
    res.machine_cpu_max !== null &&
    res.k6_cpu_max > th.generator_cpu_max_percent
  )
    reasons.push(
      `k6 process CPU ${fmt(res.k6_cpu_max)}% exceeds the ${th.generator_cpu_max_percent}% generator limit`,
    );
  const sc = (model.scenarios || {})[name] || {};
  const target = sc.rate_per_s ?? sc.spike_rate_per_s ?? null;
  const readFail = Object.entries(routes)
    .filter(([n, r]) => endpointKind(n) === "read" && r.p95 > th.read_p95_ms)
    .map(([n]) => n);
  const writeFail = Object.entries(routes)
    .filter(([n, r]) => endpointKind(n) === "write" && r.p95 > th.write_p95_ms)
    .map(([n]) => n);
  const errorBreach = failed !== null && failed > th.error_rate;
  const overallP95Breach =
    !Object.keys(routes).length && d["p(95)"] > th.read_p95_ms;
  const breaches = [
    ...readFail.map((n) => `${n} p95 above ${th.read_p95_ms} ms`),
    ...writeFail.map((n) => `${n} p95 above ${th.write_p95_ms} ms`),
    ...(errorBreach
      ? [`error rate ${fmt(failed * 100, 2)}% above ${th.error_rate * 100}%`]
      : []),
    ...(overallP95Breach ? [`overall p95 above ${th.read_p95_ms} ms`] : []),
  ];
  return {
    name,
    prefix,
    meta,
    errs,
    target_rate: target,
    routes,
    res,
    p50: d.med ?? null,
    p95: d["p(95)"] ?? null,
    p99: d["p(99)"] ?? null,
    error_rate: failed,
    throughput: m.http_reqs ? m.http_reqs.rate : null,
    requests: m.http_reqs ? m.http_reqs.count : null,
    dropped,
    invalid: reasons.length > 0 || !k6,
    invalid_reasons: reasons.length ? reasons : !k6 ? ["no k6 summary"] : [],
    breaches,
    passed: !!k6 && reasons.length === 0 && breaches.length === 0,
  };
}
function endpointKind(routeName) {
  const e = (model.endpoint_mix || []).find((x) => x.name === routeName);
  return e ? e.kind : "read";
}

const runs = SCENARIOS.map(loadScenario).filter(Boolean);
const now = new Date();
const stamp = now
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "-");
const valid = runs.filter((r) => !r.invalid);
const overall = !runs.length
  ? "NO DATA"
  : runs.every((r) => r.invalid)
    ? "INVALID"
    : runs.some((r) => r.invalid)
      ? "PARTIAL (some runs invalid)"
      : runs.every((r) => r.passed)
        ? "PASS"
        : "FAIL";

// ---- first bottleneck (first match in a fixed priority order; evidence cited)
function bottleneck() {
  const cands = [];
  const cores = machine.cpu_cores || 1;
  for (const r of valid) {
    const x = r.res;
    if (x.restarts > 0)
      cands.push([
        r.name,
        1,
        "process restarts",
        `PM2 restart count rose by ${x.restarts} (memory cap or crash)`,
      ]);
    if (
      x.pg_max_connections &&
      x.pg_active_max + x.pg_idle_max + x.pg_idle_in_tx_max >=
        0.8 * x.pg_max_connections
    )
      cands.push([
        r.name,
        2,
        "database connections",
        `connections peaked at ${x.pg_active_max + x.pg_idle_max + x.pg_idle_in_tx_max} of max_connections ${x.pg_max_connections}`,
      ]);
    if (x.pg_waiting_max >= 3)
      cands.push([
        r.name,
        2,
        "database locks/pool wait",
        `${x.pg_waiting_max} sessions waiting on locks`,
      ]);
    if (
      x.app_cpu_max !== null &&
      x.app_cpu_max >= 0.85 * 100 * Math.min(cores, 2)
    )
      cands.push([
        r.name,
        3,
        "application CPU",
        `app CPU peaked at ${fmt(x.app_cpu_max)}% (summed over processes) on ${cores} cores`,
      ]);
    if (x.loop_lag_max > 100)
      cands.push([
        r.name,
        3,
        "event loop",
        `event loop lag peaked at ${fmt(x.loop_lag_max)} ms`,
      ]);
    if (x.rss_growth_pct > 25)
      cands.push([
        r.name,
        4,
        "memory growth",
        `resident memory grew ${fmt(x.rss_growth_pct)}% during the run (${fmt(x.rss_start_mb)} to ${fmt(x.rss_end_mb)} MB); only a soak run can prove a leak`,
      ]);
  }
  const slow =
    dbA && dbA.statements
      ? dbA.statements.find(
          (s) =>
            s.mean_ms >= 100 ||
            s.findings.some((f) => f.type === "sequential_scan"),
        )
      : null;
  if (slow)
    cands.push([
      "peak",
      3,
      "slow query",
      `statement ${slow.id} (${slow.calls} calls, mean ${slow.mean_ms} ms, total ${slow.total_ms} ms)${slow.findings.some((f) => f.type === "sequential_scan") ? ", sequential scan on a large table" : ""}`,
    ]);
  const n1 =
    dbA && dbA.statements
      ? dbA.statements.find((s) =>
          s.flags.some((f) => f.startsWith("high-call")),
        )
      : null;
  if (n1)
    cands.push([
      "peak",
      3,
      "N+1 query pattern",
      `statement ${n1.id} ran ${n1.calls} times (mean ${n1.mean_ms} ms, ${fmt(n1.total_ms)} ms in total)`,
    ]);
  cands.sort((a, b) => a[1] - b[1]);
  return cands;
}
const bn = bottleneck();

// ---- history and trend
const histFile = path.join(root, "load-test", "history.json");
const history = readJson(histFile) || [];
const prev = history.filter((h) => h.valid).slice(-1)[0] || null;
function maxSustainable() {
  const ok = valid.filter((r) => r.passed && r.target_rate);
  if (!ok.length) return null;
  const st = ok.find((r) => r.name === "stress");
  return st
    ? model.scenarios.stress.stages.slice(-1)[0].rate_per_s
    : Math.max(
        ...ok.filter((r) => r.name !== "spike").map((r) => r.target_rate),
        0,
      ) || null;
}
const entry = {
  timestamp: now.toISOString(),
  valid: runs.length > 0 && !runs.some((r) => r.invalid),
  scenarios: Object.fromEntries(
    runs.map((r) => [
      r.name,
      {
        p95_ms: r.p95,
        error_rate: r.error_rate,
        throughput_rps: r.throughput,
        passed: r.passed,
        invalid: r.invalid,
      },
    ]),
  ),
  max_sustainable_rate_per_s: maxSustainable(),
};
const regressions = [];
if (prev) {
  for (const [n, cur] of Object.entries(entry.scenarios)) {
    const p = prev.scenarios[n];
    if (!p || cur.invalid || p.invalid) continue;
    if (p.p95_ms && cur.p95_ms > p.p95_ms * 1.2)
      regressions.push(
        `${n}: p95 ${fmt(p.p95_ms)} -> ${fmt(cur.p95_ms)} ms (+${fmt((cur.p95_ms / p.p95_ms - 1) * 100)}%)`,
      );
    if (cur.error_rate > Math.max(p.error_rate || 0, 0.001) * 1.2)
      regressions.push(
        `${n}: error rate ${fmt((p.error_rate || 0) * 100, 2)}% -> ${fmt(cur.error_rate * 100, 2)}%`,
      );
    if (p.throughput_rps && cur.throughput_rps < p.throughput_rps * 0.8)
      regressions.push(
        `${n}: throughput ${fmt(p.throughput_rps, 1)} -> ${fmt(cur.throughput_rps, 1)} req/s`,
      );
  }
  if (
    prev.max_sustainable_rate_per_s &&
    entry.max_sustainable_rate_per_s &&
    entry.max_sustainable_rate_per_s < prev.max_sustainable_rate_per_s * 0.8
  )
    regressions.push(
      `max sustainable rate ${prev.max_sustainable_rate_per_s} -> ${entry.max_sustainable_rate_per_s} req/s`,
    );
}

// ---- report
const L = [];
const p = (s = "") => L.push(s);
p(`# Load capacity report (${now.toISOString()})`);
p();
p("## Summary");
p();
p(`- Overall: **${overall}**`);
p(
  `- Scenarios run: ${runs.map((r) => `${r.name} (${r.invalid ? "INVALID" : r.passed ? "pass" : "fail"})`).join(", ") || "none"}`,
);
p(
  `- First bottleneck: ${bn.length ? `**${bn[0][2]}** in ${bn[0][0]}: ${bn[0][3]}` : "none reached within the tested load (no resource limit or slow query crossed its threshold)"}`,
);
p(
  "- These are LOCAL, RELATIVE findings. They do not state what production can handle.",
);
p();
p("## Machine and how to read these results");
p();
p(
  `- Machine: ${machine.cpu_cores || "?"} cores (${machine.cpu_model || "unknown"}), ${machine.memory_total_gb || "?"} GB RAM, ${machine.platform || "unknown OS"}, Node ${machine.node || "?"}.`,
);
p(
  `- App layout: ${[...new Set(runs.map((r) => r.meta.app_layout).filter(Boolean))].join("; ") || "unknown"}.`,
);
p(
  "- The load generator (k6), the app, PostgreSQL and the sampler share this one machine, so absolute numbers are lower than a dedicated production VM and are not comparable to it. Use them to find the first bottleneck and to compare runs with each other.",
);
p();
p("## Assumptions in the load model");
p();
const est = model.estimate || {};
if (est.assumptions && est.assumptions.length)
  for (const a of est.assumptions) p(`- ${a}`);
else p("- No unlabelled assumptions recorded (all inputs stated by the user).");
if (est.peak_requests_per_second)
  p(
    `- Estimated peak: ${est.peak_requests_per_second} req/s (${est.peak_source}); typical ${est.requests_per_second_typical} req/s; Little's law in-flight ~${est.littles_law_concurrency}.`,
  );
const dist = (model.endpoint_mix || [])
  .map((e) => `${e.name} ${e.weight}% (${e.source || "assumed"})`)
  .join(", ");
p(`- Endpoint mix: ${dist || "not set"}.`);
p(
  `- Thresholds: read p95 < ${th.read_p95_ms} ms, write p95 < ${th.write_p95_ms} ms, error rate < ${th.error_rate * 100}%.`,
);
p();
p("## Scenario results");
p();
p(
  "| Scenario | Target req/s | p50 ms | p95 ms | p99 ms | Error rate | Throughput req/s | Dropped | Verdict |",
);
p("|---|---|---|---|---|---|---|---|---|");
for (const r of runs)
  p(
    `| ${r.name} | ${fmt(r.target_rate, 1)} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${r.error_rate === null ? "n/a" : fmt(r.error_rate * 100, 2) + "%"} | ${fmt(r.throughput, 1)} | ${r.dropped} | ${r.invalid ? "INVALID" : r.passed ? "pass" : "FAIL"} |`,
  );
if (!runs.length) p("| (no runs found) | | | | | | | | |");
for (const r of runs) {
  if (r.invalid)
    p(
      `\n**${r.name} is INVALID** and must not be read as an application limit: ${r.invalid_reasons.join("; ")}. Repeat the run.`,
    );
  else if (r.breaches.length)
    p(`\n**${r.name} breached thresholds:** ${r.breaches.join("; ")}.`);
  const rt = Object.entries(r.routes);
  if (rt.length)
    p(
      `\nPer route (${r.name}): ${rt.map(([n, v]) => `${n} p95 ${fmt(v.p95)} ms`).join(", ")}.`,
    );
}
p();
p("## Resource findings");
p();
p(
  "| Scenario | Machine CPU max % | App CPU max % | k6 CPU max % | RSS growth | Loop lag max ms | PG conns (active/idle/idle-in-tx) of max | Lock waits | Restarts |",
);
p("|---|---|---|---|---|---|---|---|---|");
for (const r of runs) {
  const x = r.res;
  p(
    `| ${r.name} | ${fmt(x.machine_cpu_max)} | ${fmt(x.app_cpu_max)} | ${fmt(x.k6_cpu_max)} | ${x.rss_growth_pct === undefined ? "n/a" : fmt(x.rss_growth_pct) + "%"} | ${fmt(x.loop_lag_max)} | ${fmt(x.pg_active_max)}/${fmt(x.pg_idle_max)}/${fmt(x.pg_idle_in_tx_max)} of ${fmt(x.pg_max_connections)} | ${fmt(x.pg_waiting_max)} | ${fmt(x.restarts)} |`,
  );
}
p();
p(
  "Memory growth over a short run is only a hint; a memory fix is unproven until a multi-hour soak (`--soak`) shows flat memory.",
);
p();
p("## First bottleneck");
p();
if (!bn.length)
  p(
    "No bottleneck was reached in the tested range. Headroom is at least the tested peak (locally); try the stress ramp or a larger tenant.",
  );
else {
  p("Ordered by likelihood of being first (evidence from the samples):");
  for (const b of bn) p(`- **${b[2]}** (${b[0]}): ${b[3]}`);
}
p();
p("## Database analysis");
p();
if (!dbA)
  p("db-analysis.js has not been run (run it right after the peak scenario).");
else {
  p(
    `Largest tenant: ${dbA.tenant || "n/a"}. PostgreSQL ${dbA.server_version_num || "?"}. pg_stat_statements: ${dbA.pg_stat_statements ? "available" : "NOT available"}.`,
  );
  if (dbA.statements.length) {
    p();
    p(
      "| # | Total ms | Calls | Mean ms | Rows | Plan mode | Scan types | Flags and plan findings |",
    );
    p("|---|---|---|---|---|---|---|---|");
    dbA.statements.forEach((s, i) =>
      p(
        `| ${i + 1} | ${fmt(s.total_ms)} | ${fmt(s.calls)} | ${fmt(s.mean_ms, 2)} | ${fmt(s.rows)} | ${s.plan_mode.replace(/\|/g, "/")} | ${(s.plan ? s.plan.scan_types.join(", ") : "").replace(/\|/g, "/") || "-"} | ${[...s.flags, ...s.findings.map((f) => f.type)].join(", ") || "-"} |`,
      ),
    );
    p();
    p("Statements (normalized, parameters shown as $n):");
    dbA.statements.forEach((s, i) =>
      p(`${i + 1}. \`${s.id}\` ${s.query.replace(/`/g, "'")}`),
    );
    const idx = dbA.statements.flatMap((s) =>
      s.findings
        .filter((f) => f.suggested_index_text_only)
        .map((f) => f.suggested_index_text_only),
    );
    if (idx.length) {
      p();
      p("Index suggestions (text only, never applied automatically):");
      for (const i of [...new Set(idx)]) p(`- \`${i}\``);
    }
  }
  for (const n of dbA.notes) p(`- ${n}`);
  const generic = dbA.statements.filter((s) =>
    s.plan_mode.startsWith("generic"),
  ).length;
  if (generic)
    p(
      `- ${generic} statement(s) have only a generic plan (no real parameters): treat them as indicative, not as the plan the app really gets. Add parameter values to load-test/query-params.json to analyze them for real.`,
    );
}
p();
p(
  "## Checklist findings (automatic part; the agent adds the rest from reference/load-checklist.md and reference/db-analysis-guide.md)",
);
p();
const cf = [];
for (const r of valid) {
  const x = r.res;
  if (
    x.pg_max_connections &&
    x.pg_active_max + x.pg_idle_max + x.pg_idle_in_tx_max >=
      0.5 * x.pg_max_connections
  )
    cf.push(
      `Pool size x processes versus max_connections: ${r.name} used ${x.pg_active_max + x.pg_idle_max + x.pg_idle_in_tx_max} of ${x.pg_max_connections} connections; check pool size x PM2 instances x other apps sharing the database.`,
    );
}
if (dbA)
  for (const s of dbA.statements)
    for (const f of s.findings) {
      if (f.type === "sequential_scan")
        cf.push(
          `Sequential scan on ${f.relation} (~${fmt(f.table_rows_estimate)} rows) in statement ${s.id}.`,
        );
      if (f.type === "function_or_cast_on_column")
        cf.push(
          `Function or cast on a filtered column in statement ${s.id} (${f.relation || "n/a"}) can bypass an index.`,
        );
      if (f.type === "unbounded_result")
        cf.push(
          `Statement ${s.id} returns an unbounded result (~${fmt(f.estimated_rows)} rows): paginate or select fewer columns.`,
        );
    }
if (dbA)
  for (const s of dbA.statements)
    if (s.flags.some((f) => f.startsWith("high-call")))
      cf.push(
        `Statement ${s.id} runs ${fmt(s.calls)} times at ${s.mean_ms} ms mean: possible N+1 pattern.`,
      );
if (cf.length) for (const c of [...new Set(cf)]) p(`- ${c}`);
else p("- No automatic findings.");
p();
p("## What could not be verified locally");
p();
for (const x of [
  "nginx, API gateway and CDN timeouts and buffering (not present locally)",
  "Production hardware, network latency and PostgreSQL/Redis tuning (this machine differs)",
  "Real user behaviour beyond the stated or assumed model",
  "Memory leaks over hours (only with a soak run)",
  "Anything that depends on real production data distribution",
])
  p(`- ${x}`);
p();
p("## Recommended next steps (priority order)");
p();
const steps = [];
const inv = runs.filter((r) => r.invalid);
if (inv.length)
  steps.push(
    `Repeat the invalid run(s) (${inv.map((r) => r.name).join(", ")}) after fixing the cause: ${[...new Set(inv.flatMap((r) => r.invalid_reasons))].join("; ")}.`,
  );
if (bn.length)
  steps.push(`Investigate the first bottleneck: ${bn[0][2]} (${bn[0][3]}).`);
for (const c of [...new Set(cf)].slice(0, 5)) steps.push(c);
if (regressions.length)
  steps.push("Review the regressions listed below against the previous run.");
steps.push(
  "Confirm capacity on a staging environment that matches production hardware; this skill never runs there.",
);
steps.forEach((s, i) => p(`${i + 1}. ${s}`));
p();
p("## Trend vs previous run");
p();
if (!prev) p("No previous valid run in load-test/history.json.");
else if (!regressions.length)
  p(
    `No metric regressed by more than 20% against the run of ${prev.timestamp}.`,
  );
else {
  p(`Regressions (>20%) against the run of ${prev.timestamp}:`);
  for (const r of regressions) p(`- ${r}`);
}
p();

const outDir = path.join(root, "load-test", "reports");
fs.mkdirSync(outDir, { recursive: true });
const reportFile = path.join(outDir, `${stamp}-load-report.md`);
fs.writeFileSync(reportFile, L.join("\n"));
history.push(entry);
fs.writeFileSync(histFile, JSON.stringify(history, null, 2) + "\n");
console.log(
  `Report: ${path.relative(root, reportFile)}\nOverall: ${overall}\nHistory entries: ${history.length}${regressions.length ? "\nRegressions: " + regressions.length : ""}`,
);
