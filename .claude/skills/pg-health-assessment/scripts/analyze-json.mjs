#!/usr/bin/env node
// Classifies every json/jsonb column as keep | watch | split using sampled, aggregate-only SQL (never returns values).
// Usage: node analyze-json.mjs [--root <path>] [--orm <file>] [--live <file>] [--out <file>] [--url-env NAME] [--max-sample-rows 1000] [--skip-above-gb 100]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect } from "./detect-orm.mjs";
import { resolveConnection, openReadOnly } from "./collect-live.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : d;
};
const here = path.dirname(fileURLToPath(import.meta.url));

export function loadThresholds() {
  const md = fs.readFileSync(
    path.join(here, "..", "reference", "json-splitting.md"),
    "utf8",
  );
  const m = md.match(/```json thresholds\s*([\s\S]*?)```/);
  if (!m)
    throw new Error("thresholds block missing in reference/json-splitting.md");
  return JSON.parse(m[1]);
}
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';

function sampleCte(t, col, maxRows) {
  const n = t.n_live || 0;
  const sample =
    n > maxRows * 2
      ? ` TABLESAMPLE SYSTEM (${Math.min(100, Math.max(0.01, ((maxRows * 2) / n) * 100)).toFixed(3)})`
      : "";
  return `s AS (SELECT row_number() OVER () AS rn, pg_column_size(x.${qi(col)}) AS sz, (x.${qi(col)})::jsonb AS j FROM ${qi(t.schema)}.${qi(t.name)} x${sample} WHERE x.${qi(col)} IS NOT NULL LIMIT ${maxRows})`;
}

async function analyzeColumn(run, t, col, type, th, maxRows) {
  const cte = sampleCte(t, col, maxRows);
  const sizes = await run(
    "json_sizes",
    `WITH ${cte} SELECT count(*)::int AS n, avg(sz)::float8 AS avg, percentile_cont(0.5) WITHIN GROUP (ORDER BY sz)::float8 AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY sz)::float8 AS p95, max(sz)::float8 AS max, avg((sz > 2048)::int)::float8 AS frac_big FROM s`,
  );
  if (!sizes || !sizes[0])
    return { status: "unverified", reason: "size query failed or timed out" };
  const stats = sizes[0];
  if (!stats.n)
    return {
      status: "analyzed",
      stats: { n: 0 },
      keys: [],
      rootTypes: {},
      depth: 0,
    };
  const keys =
    (await run(
      "json_keys",
      `WITH ${cte} SELECT k.key AS key, jsonb_typeof(k.value) AS typ, count(*)::int AS freq,
      max(CASE WHEN jsonb_typeof(k.value) = 'array' THEN jsonb_array_length(k.value) END)::int AS max_arr,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY CASE WHEN jsonb_typeof(k.value) = 'array' THEN jsonb_array_length(k.value) END)::float8 AS p95_arr,
      bool_or(jsonb_typeof(k.value) = 'array' AND jsonb_typeof(k.value -> 0) = 'object') AS arr_of_obj,
      max(CASE WHEN jsonb_typeof(k.value) = 'string' THEN length(k.value #>> '{}') END)::int AS max_str,
      bool_or(jsonb_typeof(k.value) = 'string' AND length(k.value #>> '{}') > 1000 AND (k.value #>> '{}') ~ '^[A-Za-z0-9+/=\\s]+$') AS b64
    FROM s, LATERAL jsonb_each(CASE WHEN jsonb_typeof(s.j) = 'object' THEN s.j ELSE '{}'::jsonb END) k
    GROUP BY k.key, jsonb_typeof(k.value) ORDER BY freq DESC, key LIMIT 200`,
    )) || [];
  const roots =
    (await run(
      "json_roots",
      `WITH ${cte} SELECT jsonb_typeof(j) AS typ, count(*)::int AS n,
      avg(CASE WHEN jsonb_typeof(j) = 'object' THEN (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(j) = 'object' THEN j ELSE '{}'::jsonb END)) END)::float8 AS avg_keys,
      max(CASE WHEN jsonb_typeof(j) = 'object' THEN (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(j) = 'object' THEN j ELSE '{}'::jsonb END)) END)::int AS max_keys,
      max(CASE WHEN jsonb_typeof(j) = 'array' THEN jsonb_array_length(j) END)::int AS max_root_arr,
      bool_or(jsonb_typeof(j) = 'array' AND jsonb_typeof(j -> 0) = 'object') AS root_arr_of_obj
    FROM s GROUP BY 1`,
    )) || [];
  const depth = await run(
    "json_depth",
    `WITH RECURSIVE ${cte}, r(rn, j, d) AS (SELECT rn, j, 1 FROM s WHERE jsonb_typeof(j) IN ('object','array')
      UNION ALL SELECT r.rn, c.value, r.d + 1 FROM r, LATERAL (SELECT e.value FROM jsonb_each(CASE WHEN jsonb_typeof(r.j) = 'object' THEN r.j ELSE '{}'::jsonb END) e
        UNION ALL SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.j) = 'array' THEN r.j ELSE '[]'::jsonb END) a) c
      WHERE r.d < 12 AND jsonb_typeof(c.value) IN ('object','array'))
    SELECT max(d)::int AS max_depth FROM r`,
  );
  const rootMap = Object.fromEntries(roots.map((r) => [r.typ, r.n]));
  return {
    status: "analyzed",
    stats: { ...stats, sampleRows: stats.n },
    keys,
    rootTypes: rootMap,
    keysPerRow: {
      avg: Math.max(0, ...roots.map((r) => r.avg_keys || 0)),
      max: Math.max(0, ...roots.map((r) => r.max_keys || 0)),
    },
    rootArrayMax: Math.max(0, ...roots.map((r) => r.max_root_arr || 0)),
    rootArrayOfObjects: roots.some((r) => r.root_arr_of_obj),
    depth: depth && depth[0] ? depth[0].max_depth || 0 : null,
  };
}

export function classify(info, ctx, th) {
  const reasons = [],
    watch = [];
  const s = info.stats || {};
  const n = s.n || 1;
  const hotKeys = (info.keys || [])
    .filter((k) => k.freq / n > th.split.hot_key_share)
    .map((k) => k.key);
  const arrays = (info.keys || []).filter(
    (k) => k.arr_of_obj || k.typ === "array",
  );
  const bigArrays = arrays.filter(
    (k) => (k.p95_arr || 0) > th.split.array_p95_len && k.arr_of_obj,
  );
  const idKeys = (info.keys || [])
    .filter((k) => /(_id|Id|_ids|Ids)$/.test(k.key) && k.freq / n > 0.5)
    .map((k) => k.key);
  const binKeys = (info.keys || [])
    .filter(
      (k) =>
        k.b64 ||
        (/(base64|blob|binary|image|photo|attachment|data_?uri)/i.test(k.key) &&
          (k.max_str || 0) > 1000),
    )
    .map((k) => k.key);
  if (s.p95 > th.split.p95_bytes)
    reasons.push(
      `p95 size ${Math.round(s.p95)} B exceeds ${th.split.p95_bytes} B`,
    );
  if (s.max > th.split.max_bytes)
    reasons.push(
      `max size ${Math.round(s.max)} B exceeds ${th.split.max_bytes} B`,
    );
  if (info.keysPerRow && info.keysPerRow.max > th.split.keys_per_row)
    reasons.push(
      `up to ${info.keysPerRow.max} top-level keys per row (limit ${th.split.keys_per_row})`,
    );
  if (info.depth > th.split.depth)
    reasons.push(`nesting depth ${info.depth} exceeds ${th.split.depth}`);
  if (
    bigArrays.length ||
    (info.rootArrayOfObjects && info.rootArrayMax > th.split.array_p95_len)
  )
    reasons.push(
      `unbounded array of objects (${bigArrays.map((k) => k.key).join(", ") || "root array"}, p95 length above ${th.split.array_p95_len})`,
    );
  const usedInQueries = ctx.stmtUse === null ? null : ctx.stmtUse;
  if (usedInQueries && hotKeys.length > th.split.hot_keys_min)
    reasons.push(
      `${hotKeys.length} keys present in >${th.split.hot_key_share * 100}% of rows while the column is used with JSON operators in queries`,
    );
  const churn =
    ctx.table.n_live >= 0 &&
    ctx.table.n_upd >= th.split.churn_min_updates &&
    ctx.table.n_upd / Math.max(ctx.table.n_live, 1) >= th.split.churn_ratio;
  if (churn && s.avg > th.split.large_avg_bytes)
    reasons.push(
      "large column on a high-churn table (updates rewrite the whole value)",
    );
  if (idKeys.length)
    reasons.push(
      `stores ids that look like foreign keys: ${idKeys.slice(0, 8).join(", ")}`,
    );
  if (binKeys.length)
    reasons.push(
      `base64/binary-looking payload in key(s): ${binKeys.slice(0, 5).join(", ")}`,
    );
  if (s.avg > th.watch.avg_bytes)
    watch.push(
      `avg size ${Math.round(s.avg)} B is above the ${th.toast_threshold} B TOAST threshold`,
    );
  if (ctx.type === "json")
    watch.push(
      "type is json, not jsonb (no indexing, reparsed on every access)",
    );
  if (usedInQueries && !ctx.indexed)
    watch.push(
      "column is used with JSON operators but has no GIN/expression index",
    );
  const classification = reasons.length
    ? "split"
    : watch.length
      ? "watch"
      : "keep";
  const patterns = [];
  if (classification === "split") {
    if (hotKeys.length)
      patterns.push({
        pattern: "promote-hot-keys",
        detail: `promote ${hotKeys.slice(0, 12).join(", ")} to typed columns (generated columns as a bridge)`,
      });
    if (bigArrays.length || info.rootArrayOfObjects)
      patterns.push({
        pattern: "child-table",
        detail: `move array(s) ${bigArrays.map((k) => k.key).join(", ") || "(root array)"} to a child table with FK and index`,
      });
    if (
      s.p95 > th.split.p95_bytes ||
      s.max > th.split.max_bytes ||
      binKeys.length
    )
      patterns.push({
        pattern: "side-table",
        detail:
          "move cold large payloads to a side table (vertical split) to keep hot rows narrow",
      });
    if (idKeys.length)
      patterns.push({
        pattern: "foreign-keys",
        detail: `replace embedded ids (${idKeys.slice(0, 8).join(", ")}) with foreign key columns`,
      });
    if (ctx.type === "json")
      patterns.push({
        pattern: "json-to-jsonb",
        detail: "convert json to jsonb",
      });
  }
  const severity =
    classification === "split"
      ? s.p95 > th.high_severity_p95_bytes || churn
        ? "high"
        : "medium"
      : classification === "watch"
        ? "low"
        : null;
  return {
    classification,
    severity,
    reasons,
    watch,
    patterns,
    hotKeys,
    idKeys,
    highChurn: churn,
  };
}

export async function run() {
  const root = path.resolve(opt("root", process.cwd()));
  const work = path.join(root, "pg-health-reports", ".work");
  const orm = JSON.parse(
    fs.readFileSync(
      path.resolve(root, opt("orm", path.join(work, "orm-schema.json"))),
      "utf8",
    ),
  );
  const live = JSON.parse(
    fs.readFileSync(
      path.resolve(root, opt("live", path.join(work, "live.json"))),
      "utf8",
    ),
  );
  const th = loadThresholds();
  const maxRows = Number(opt("max-sample-rows", 1000));
  const skipBytes = Number(opt("skip-above-gb", 100)) * 1073741824;
  const det = detect();
  const conn = resolveConnection(root, det, opt("url-env", null));
  if (!conn) {
    process.stderr.write("No connection string found.\n");
    process.exit(2);
  }

  const cols = new Map();
  for (const t of live.tables)
    for (const c of t.columns)
      if (/^jsonb?$/.test(c.type))
        cols.set(`${t.schema}.${t.name}.${c.name}`, {
          schema: t.schema,
          table: t.name,
          column: c.name,
          type: c.type,
          sources: ["live"],
        });
  for (const j of orm.jsonColumns) {
    const key = [...cols.keys()].find((k) =>
      k.endsWith(`.${j.table}.${j.column}`),
    );
    if (key) cols.get(key).sources.push("orm");
    else
      cols.set(`orm.${j.table}.${j.column}`, {
        schema: "public",
        table: j.table,
        column: j.column,
        type: j.type,
        sources: ["orm"],
        ormOnly: true,
      });
  }
  const db = await openReadOnly(root, det, conn.url);
  const results = [];
  try {
    for (const c of cols.values()) {
      const t = live.tables.find(
        (x) => x.schema === c.schema && x.name === c.table,
      );
      const base = {
        schema: c.schema,
        table: c.table,
        column: c.column,
        type: c.type,
        sources: c.sources,
      };
      if (c.ormOnly || !t) {
        results.push({
          ...base,
          status: "unverified",
          reason:
            "column defined in ORM but not present in live database (drift)",
          classification: null,
        });
        continue;
      }
      if (t.total_bytes > skipBytes) {
        results.push({
          ...base,
          status: "unverified",
          reason: `table larger than ${opt("skip-above-gb", 100)} GB; sampling skipped`,
          classification: null,
        });
        continue;
      }
      if (t.relkind === "p") {
        results.push({
          ...base,
          status: "unverified",
          reason: "partitioned table: TABLESAMPLE not supported",
          classification: null,
        });
        continue;
      }
      const info = await analyzeColumn(
        db.run,
        t,
        c.column,
        c.type,
        th,
        maxRows,
      );
      if (info.status === "unverified") {
        results.push({ ...base, ...info, classification: null });
        continue;
      }
      const stmtUse =
        live.statements === null
          ? null
          : live.statements.some(
              (s) =>
                new RegExp(`\\b${c.column}\\b`).test(s.query) &&
                /->|@>|#>|\?/.test(s.query),
            );
      const indexed = live.indexes.some(
        (i) =>
          i.tbl === c.table &&
          i.def.includes(c.column) &&
          (i.method === "gin" || i.expr),
      );
      const cls = classify(
        info,
        { type: c.type, table: t, stmtUse, indexed },
        th,
      );
      results.push({
        ...base,
        status: "analyzed",
        stats: info.stats,
        toastShare: t.total_bytes
          ? Math.round((t.toast_bytes / t.total_bytes) * 1000) / 1000
          : 0,
        structure: {
          keysPerRow: info.keysPerRow,
          depth: info.depth,
          rootTypes: info.rootTypes,
          keys: (info.keys || []).slice(0, 40).map((k) => ({
            key: k.key,
            type: k.typ,
            freq: k.freq,
            p95ArrayLen: k.p95_arr,
            arrayOfObjects: !!k.arr_of_obj,
          })),
        },
        signals: {
          queriedWithJsonOperators: stmtUse,
          indexed,
          updateRatio: t.n_live
            ? Math.round((t.n_upd / t.n_live) * 100) / 100
            : null,
        },
        ...cls,
      });
    }
  } finally {
    await db.end();
  }
  const out = {
    generatedAt: new Date().toISOString(),
    thresholds: th,
    columns: results,
    errors: db.errors,
  };
  const outFile = path.resolve(root, opt("out", path.join(work, "json.json")));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  const c = (k) => results.filter((r) => r.classification === k).length;
  process.stdout.write(
    `json columns=${results.length} keep=${c("keep")} watch=${c("watch")} split=${c("split")} unverified=${results.filter((r) => r.status === "unverified").length}\nwritten: ${path.relative(process.cwd(), outFile)}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run().catch((e) => {
    process.stderr.write(
      "analyze-json failed: " +
        String(e.message).replace(/postgres(ql)?:\/\/[^\s]*/gi, "<url>") +
        "\n",
    );
    process.exit(1);
  });
}
