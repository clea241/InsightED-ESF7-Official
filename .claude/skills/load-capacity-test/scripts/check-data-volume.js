#!/usr/bin/env node
"use strict";
// Makes sure the LOCAL test database is big enough to mean something. Exit 1 on any shortfall.
// Usage: node check-data-volume.js [--root <repo>] [--model load-test/load-model.json]
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const modelPath = path.resolve(root, opt("model", "load-test/load-model.json"));

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
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';

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
      'REFUSED: database must be local, contain "test" in its name and not be a drill_* restore. Run guard-load-env.js.',
    );
    process.exit(2);
  }
  let model;
  try {
    model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  } catch {
    console.error("load-model.json not found");
    process.exit(2);
  }
  const T = model.largest_tenant_targets;
  if (!T || !T.tables) {
    console.error("largest_tenant_targets.tables missing in the model");
    process.exit(2);
  }
  const col = T.tenant_column || "school_id";
  const others = model.other_tenants || { count: 0, rows_per_table: {} };

  // Hint only: table counts recorded by a backup drill (never reads the drill database)
  let hint = null;
  try {
    hint = JSON.parse(
      fs.readFileSync(path.join(root, "backup-drill", "history.json"), "utf8"),
    );
  } catch {
    /* optional */
  }

  const { Client } = loadPg();
  const c = new Client({ connectionString: env.LOAD_DATABASE_URL });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const shortfalls = [];
  const rows = [];
  try {
    for (const [table, target] of Object.entries(T.tables)) {
      let ex = await c.query("SELECT to_regclass($1) AS r", [table]);
      if (!ex.rows[0].r) {
        shortfalls.push(`${table}: table does not exist`);
        rows.push([table, "missing", target, "-", "-"]);
        continue;
      }
      const mine = Number(
        (
          await c.query(
            `SELECT count(*)::bigint AS n FROM ${qi(table)} WHERE ${qi(col)} = $1`,
            [T.school_id],
          )
        ).rows[0].n,
      );
      const total = Number(
        (await c.query(`SELECT count(*)::bigint AS n FROM ${qi(table)}`))
          .rows[0].n,
      );
      const wantTotal =
        target +
        (others.count || 0) * ((others.rows_per_table || {})[table] || 0);
      rows.push([table, mine, target, total, wantTotal]);
      if (mine < target)
        shortfalls.push(
          `${table}: largest tenant has ${mine} rows, target ${target}`,
        );
      if (total < wantTotal * 0.9)
        shortfalls.push(
          `${table}: total ${total} rows, expected about ${wantTotal}`,
        );
    }
    // Is the configured tenant really the largest one in the main table? (tenant ids only, no row data)
    const main = Object.entries(T.tables).sort((a, b) => b[1] - a[1])[0][0];
    const mainExists = (await c.query("SELECT to_regclass($1) AS r", [main]))
      .rows[0].r;
    const top = !mainExists
      ? { rows: [] }
      : await c.query(
          `SELECT ${qi(col)} AS t, count(*)::bigint AS n FROM ${qi(main)} GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
        );
    if (top.rows[0] && String(top.rows[0].t) !== String(T.school_id))
      shortfalls.push(
        `tenant ${T.school_id} is not the largest in ${main} (largest is ${top.rows[0].t}); update largest_tenant_targets.school_id`,
      );
  } finally {
    await c.query("ROLLBACK");
    await c.end();
  }

  console.log(
    "table".padEnd(34) +
      "largest tenant".padEnd(16) +
      "target".padEnd(10) +
      "total".padEnd(10) +
      "expected total",
  );
  for (const r of rows)
    console.log(
      String(r[0]).padEnd(34) +
        String(r[1]).padEnd(16) +
        String(r[2]).padEnd(10) +
        String(r[3]).padEnd(10) +
        r[4],
    );
  if (hint)
    console.log(
      "\nHint: backup-drill/history.json exists; compare its recorded table counts with realistic production totals when you adjust the targets.",
    );
  if (shortfalls.length) {
    console.log("\nFAIL data volume too small for meaningful results:");
    for (const s of shortfalls) console.log(" - " + s);
    console.log("Run: node load-test/seed-large.js (synthetic data only).");
    process.exit(1);
  }
  console.log("\nPASS local database meets the largest-tenant volume target.");
})().catch((e) => {
  console.error(
    "check-data-volume failed: " +
      String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "<url>"),
  );
  process.exit(2);
});
