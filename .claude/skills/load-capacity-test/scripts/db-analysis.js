#!/usr/bin/env node
"use strict";
// Analyses the slowest statements recorded by pg_stat_statements during the peak run, on the largest tenant of the LOCAL test database.
// Read-only: EXPLAIN ANALYZE only for SELECT, inside a READ ONLY transaction that is rolled back. Never creates indexes.
// Usage: node db-analysis.js [--root <repo>] [--top 15] [--out load-test/reports/raw/db-analysis.json]
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const TOP = Number(opt("top", 15));
const outFile = path.resolve(
  root,
  opt("out", "load-test/reports/raw/db-analysis.json"),
);

function parseEnv(file) {
  const out = {};
  let t = "";
  try {
    t = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  for (const l of t.split(/\r?\n/)) {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m && !l.trim().startsWith("#"))
      out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
function loadPg() {
  for (const d of [path.join(root, "server"), root]) {
    try {
      return createRequire(path.join(d, "package.json"))("pg");
    } catch {
      /* next */
    }
  }
  throw new Error("pg driver not found");
}
const redactConsts = (s) =>
  String(s || "")
    .replace(/'[^']*'(::\w+)?/g, "'?'")
    .replace(/\b\d{5,}\b/g, "#");

// ---- plan inspection
function walk(node, fn, depth = 0) {
  fn(node, depth);
  for (const c of node.Plans || []) walk(c, fn, depth + 1);
}
function inspectPlan(planRoot, analyzed, tableRows) {
  const findings = [];
  const nodes = [];
  walk(planRoot, (n) => nodes.push(n));
  const hasLimit = nodes.some((n) => n["Node Type"] === "Limit");
  for (const n of nodes) {
    const rel = n["Relation Name"];
    const big = rel && (tableRows[rel] || 0) > 10000;
    const filt = [n["Filter"], n["Index Cond"], n["Recheck Cond"]]
      .filter(Boolean)
      .join(" AND ");
    if (/Seq Scan/.test(n["Node Type"]) && big) {
      const cols = [
        ...new Set(
          [
            ...String(n["Filter"] || "").matchAll(
              /\(?"?([a-z_][a-z0-9_]*)"? (?:=|<|>|<=|>=|~~|IN|ANY)/gi,
            ),
          ].map((m) => m[1]),
        ),
      ].filter((c) => !/^(and|or|not)$/i.test(c));
      findings.push({
        type: "sequential_scan",
        relation: rel,
        table_rows_estimate: tableRows[rel],
        removed_by_filter: n["Rows Removed by Filter"] ?? null,
        filter: redactConsts(n["Filter"]),
        suggested_index_text_only: cols.length
          ? `CREATE INDEX CONCURRENTLY idx_${rel}_${cols.slice(0, 3).join("_")} ON ${rel} (${cols.slice(0, 3).join(", ")});  -- apply through the deploy process, never automatically`
          : null,
      });
    }
    if (
      /Seq Scan/.test(n["Node Type"]) &&
      /\b(lower|upper|date|to_char|trim|coalesce)\(|\("?[a-z_][a-z0-9_]*"?\)::(text|date|int|integer)/i.test(
        filt,
      )
    )
      findings.push({
        type: "function_or_cast_on_column",
        relation: rel,
        filter: redactConsts(filt),
      });
    if (
      analyzed &&
      n["Plan Rows"] !== undefined &&
      n["Actual Rows"] !== undefined
    ) {
      const est = Math.max(1, n["Plan Rows"]),
        act = Math.max(1, n["Actual Rows"] * (n["Actual Loops"] || 1));
      if (act / est > 10 || est / act > 10)
        findings.push({
          type: "row_estimate_off",
          node: n["Node Type"],
          relation: rel || null,
          estimated: n["Plan Rows"],
          actual: n["Actual Rows"],
          hint: "stale statistics? run ANALYZE on the local test table",
        });
    }
    if (
      /external|disk/i.test(
        String(n["Sort Method"] || "") + String(n["Sort Space Type"] || ""),
      )
    )
      findings.push({
        type: "sort_spills_to_disk",
        method: n["Sort Method"],
        space_kb: n["Sort Space Used"],
      });
    if (n["Hash Batches"] > 1)
      findings.push({
        type: "hash_spills_to_disk",
        batches: n["Hash Batches"],
      });
    if (
      analyzed &&
      n["Shared Read Blocks"] > 0 &&
      n["Shared Read Blocks"] > (n["Shared Hit Blocks"] || 0) * 2 &&
      !n["Plans"]
    )
      findings.push({
        type: "mostly_disk_reads",
        node: n["Node Type"],
        relation: rel || null,
        read_blocks: n["Shared Read Blocks"],
        hit_blocks: n["Shared Hit Blocks"] || 0,
      });
  }
  const topRows =
    analyzed && planRoot["Actual Rows"] !== undefined
      ? planRoot["Actual Rows"]
      : planRoot["Plan Rows"];
  if (!hasLimit && topRows > 5000)
    findings.push({
      type: "unbounded_result",
      estimated_rows: topRows,
      hint: "no LIMIT/pagination; consider paginating or selecting fewer columns",
    });
  const scan = nodes
    .filter((n) => /Scan/.test(n["Node Type"]))
    .map(
      (n) =>
        `${n["Node Type"]}${n["Relation Name"] ? " on " + n["Relation Name"] : ""}`,
    );
  return {
    findings,
    summary: {
      scan_types: [...new Set(scan)],
      plan_rows: topRows,
      actual_rows: planRoot["Actual Rows"] ?? null,
      shared_hit: planRoot["Shared Hit Blocks"] ?? null,
      shared_read: planRoot["Shared Read Blocks"] ?? null,
      execution_ms: planRoot["Execution Time"] ?? null,
    },
  };
}

(async () => {
  const env = parseEnv(path.join(root, ".env.load"));
  let u;
  try {
    u = new URL(env.LOAD_DATABASE_URL);
  } catch {
    console.error("LOAD_DATABASE_URL missing in .env.load");
    process.exit(2);
  }
  const dbName = decodeURIComponent(u.pathname.slice(1)).toLowerCase();
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname) ||
    !dbName.includes("test") ||
    /^drill_/.test(dbName)
  ) {
    console.error(
      'REFUSED: database must be local, contain "test" and not be a drill_* restore. Run guard-load-env.js.',
    );
    process.exit(2);
  }
  let model = {};
  try {
    model = JSON.parse(
      fs.readFileSync(path.join(root, "load-test/load-model.json"), "utf8"),
    );
  } catch {
    /* optional */
  }
  const tenant =
    model.largest_tenant_targets && model.largest_tenant_targets.school_id;
  let params = {};
  try {
    params = JSON.parse(
      fs.readFileSync(path.join(root, "load-test/query-params.json"), "utf8"),
    );
  } catch {
    /* optional */
  }

  const { Client } = loadPg();
  const c = new Client({ connectionString: env.LOAD_DATABASE_URL });
  await c.connect();
  const out = {
    generated_at: new Date().toISOString(),
    tenant: tenant || null,
    pg_stat_statements: false,
    server_version_num: null,
    statements: [],
    notes: [],
  };
  try {
    out.server_version_num = Number(
      (await c.query("SHOW server_version_num")).rows[0].server_version_num,
    );
    const ext = await c.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'",
    );
    if (!ext.rows.length) {
      out.notes.push(
        "pg_stat_statements is not installed in the local test database; no statement statistics available.",
      );
    } else {
      out.pg_stat_statements = true;
      const tr = {};
      for (const r of (
        await c.query(
          "SELECT relname, reltuples::float8 AS n FROM pg_class WHERE relkind IN ('r','p')",
        )
      ).rows)
        tr[r.relname] = r.n;
      const top = await c.query(
        `SELECT queryid::text AS id, query, calls::float8 AS calls, total_exec_time::float8 AS total_ms, mean_exec_time::float8 AS mean_ms, rows::float8 AS rows,
          shared_blks_read::float8 AS blks_read, shared_blks_hit::float8 AS blks_hit
        FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND query NOT ILIKE '%pg_stat_statements%' AND query !~* '^\\s*(begin|commit|rollback|set|show|create extension|explain|prepare|deallocate|analyze)'
          AND query NOT ILIKE '%pg_stat_activity%' AND query NOT ILIKE '%pg_stat_statements%' AND query NOT ILIKE '%pg_settings%'
        ORDER BY total_exec_time DESC LIMIT $1`,
        [TOP],
      );
      for (const r of top.rows) {
        const sql = r.query.trim();
        const kind =
          /^(select|with)\b/i.test(sql) &&
          !/\b(insert|update|delete)\b[\s\S]*\breturning\b/i.test(sql) &&
          !/\bfor\s+(update|share|no key update)\b/i.test(sql)
            ? "select"
            : /^(insert|update|delete)\b/i.test(sql)
              ? "write"
              : "other";
        const st = {
          id: r.id,
          kind,
          calls: r.calls,
          total_ms: +r.total_ms.toFixed(1),
          mean_ms: +r.mean_ms.toFixed(3),
          rows: r.rows,
          shared_blks_read: r.blks_read,
          shared_blks_hit: r.blks_hit,
          query: sql.replace(/\s+/g, " ").slice(0, 300),
          flags: [],
          plan: null,
          plan_mode: "none",
          findings: [],
        };
        if (r.calls >= 1000 && r.mean_ms < 1)
          st.flags.push("high-call low-mean (possible N+1)");
        if (r.mean_ms >= 100) st.flags.push("slow on average (>=100 ms)");
        if (r.rows / Math.max(1, r.calls) > 5000)
          st.flags.push("returns many rows per call (unpaginated?)");
        // Plans, each inside a READ ONLY transaction that is rolled back.
        const withParams = params[r.id];
        try {
          await c.query("BEGIN READ ONLY");
          await c.query("SET LOCAL statement_timeout = '10s'");
          let planJson = null;
          if (kind === "select" && withParams && Array.isArray(withParams)) {
            await c.query(`PREPARE lc_stmt AS ${sql}`);
            const lits = withParams
              .map((p) => (p === null ? "NULL" : c.escapeLiteral(String(p))))
              .join(", ");
            planJson = (
              await c.query(
                `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE lc_stmt(${lits})`,
              )
            ).rows[0]["QUERY PLAN"][0];
            st.plan_mode = "analyze_with_real_parameters";
          } else if (
            out.server_version_num >= 160000 &&
            (kind === "select" || kind === "write")
          ) {
            planJson = (
              await c.query(`EXPLAIN (GENERIC_PLAN, FORMAT JSON) ${sql}`)
            ).rows[0]["QUERY PLAN"][0];
            st.plan_mode =
              "generic_plan_only (no real parameters; not an execution plan)";
          } else
            st.plan_mode =
              kind === "other"
                ? "skipped (not a SELECT/INSERT/UPDATE/DELETE)"
                : "skipped (needs PostgreSQL 16+ for GENERIC_PLAN or entries in load-test/query-params.json)";
          if (planJson) {
            const ins = inspectPlan(
              planJson.Plan,
              st.plan_mode.startsWith("analyze"),
              tr,
            );
            st.plan = ins.summary;
            st.plan.execution_ms = planJson["Execution Time"] ?? null;
            st.findings = ins.findings;
          }
        } catch (e) {
          st.plan_mode =
            "failed: " + String(e.message).split("\n")[0].slice(0, 160);
        } finally {
          try {
            await c.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        out.statements.push(st);
      }
      out.notes.push(
        "pg_stat_statements counters include warm-up and the seed/analysis traffic since the last reset; the run script resets them before each scenario.",
      );
    }
  } finally {
    await c.end();
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Top statements by total time (tenant ${tenant || "n/a"}, PostgreSQL ${out.server_version_num}):`,
  );
  console.log(
    "total ms".padEnd(12) +
      "calls".padEnd(10) +
      "mean ms".padEnd(10) +
      "plan mode".padEnd(34) +
      "findings",
  );
  for (const s of out.statements)
    console.log(
      String(s.total_ms).padEnd(12) +
        String(s.calls).padEnd(10) +
        String(s.mean_ms).padEnd(10) +
        s.plan_mode.slice(0, 32).padEnd(34) +
        [...s.flags, ...s.findings.map((f) => f.type)].join(", "),
    );
  for (const n of out.notes) console.log("NOTE " + n);
  console.log("written: " + path.relative(root, outFile));
})().catch((e) => {
  console.error(
    "db-analysis failed: " +
      String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "<url>"),
  );
  process.exit(2);
});
