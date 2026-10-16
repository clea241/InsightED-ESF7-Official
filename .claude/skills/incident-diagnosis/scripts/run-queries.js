#!/usr/bin/env node
"use strict";
// Run one read-only SELECT through remote-readonly.sh as the read-only database user.
//   node run-queries.js --name <result-name> (--file q.sql | --lib <query-name> [--param key=value ...])
//        [--approve-column col ...] [--export-ids col[,col2]] [--check-only] [--incident ID]
// --check-only validates and prints the final SQL without contacting any host.
// Exit: 0 ok, 2 rejected statement or bad usage, 3 query error/timeout.
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const g = require("./guard-incident-env.js");

const FORBIDDEN_WORDS = [
  "insert",
  "update",
  "delete",
  "truncate",
  "drop",
  "alter",
  "create",
  "grant",
  "revoke",
  "copy",
  "call",
  "do",
  "lock",
  "vacuum",
  "reindex",
  "refresh",
  "set",
  "into",
  "comment",
  "cluster",
  "listen",
  "notify",
  "prepare",
  "execute",
  "merge",
  "import",
  "security",
  "reset",
];
const FORBIDDEN_FUNCS =
  /\b(pg_sleep\w*|pg_terminate_backend|pg_cancel_backend|nextval|setval|lo_\w+|dblink\w*|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_ls_\w+|pg_advisory\w*|pg_logical\w+|pg_switch_wal|pg_reload_conf|set_config|pg_stat_reset\w*|pg_create_\w+|pg_drop_\w+|pg_replication_\w+|pg_promote|pg_rotate_logfile|pg_backup_\w+|pg_start_backup|pg_stop_backup|pg_export_snapshot|txid_\w*|query_to_xml\w*|xmlparse|file_fdw|pg_file_\w+)\s*\(/i;
const PERSONAL =
  /(name|email|phone|mobile|address|birth|dob|guardian|password|passwd|token|secret|signature|ip_addr|contact)/i;
const SAFE_COLUMN = /(_id|_ids|_count)$|^(id|count)$/i;

// Remove comments and string literals so keywords inside text cannot hide or trigger a match.
function strip(sql) {
  let out = "",
    i = 0;
  while (i < sql.length) {
    const c = sql[i],
      d = sql[i + 1];
    if (c === "-" && d === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += " ";
    } else if (c === "/" && d === "*") {
      const e = sql.indexOf("*/", i + 2);
      if (e < 0) throw new Error("unterminated comment");
      i = e + 2;
      out += " ";
    } else if (c === "'") {
      i++;
      for (;;) {
        if (i >= sql.length) throw new Error("unterminated string");
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          break;
        } else i++;
      }
      out += "''";
    } else if (c === "$" && /^\$[A-Za-z_]*\$/.test(sql.slice(i)))
      throw new Error("dollar-quoted strings are not allowed");
    else {
      out += c;
      i++;
    }
  }
  return out;
}

function validate(sqlRaw) {
  if (/\bE'/.test(sqlRaw))
    throw new Error("escape strings (E'..') are not allowed");
  const s = strip(sqlRaw).trim().replace(/;\s*$/, "");
  if (!s) throw new Error("empty statement");
  if (s.includes(";")) throw new Error("only a single statement is allowed");
  const lower = s.toLowerCase().replace(/"[^"]*"/g, '""');
  const m = lower.match(
    /^(explain\s*(\([^)]*\)|analyze\s+verbose|analyze|verbose)?\s*)?(select|with|values|table)\b/,
  );
  if (!m)
    throw new Error(
      "only SELECT, WITH ... SELECT or EXPLAIN of those is allowed",
    );
  for (const w of FORBIDDEN_WORDS)
    if (new RegExp(`\\b${w}\\b`).test(lower))
      throw new Error(`forbidden keyword: ${w.toUpperCase()}`);
  if (/\bfor\s+(update|share|no\s+key)/.test(lower))
    throw new Error("row locking (FOR UPDATE/SHARE) is not allowed");
  if (FORBIDDEN_FUNCS.test(lower))
    throw new Error(`forbidden function: ${lower.match(FORBIDDEN_FUNCS)[1]}`);
  if (
    /\bpg_catalog\.\w+\s*\(/.test(lower) &&
    !/pg_catalog\.(pg_get_\w+|pg_table_size|pg_total_relation_size|pg_relation_size|pg_size_pretty|pg_stat_\w*|count|to_\w+)\s*\(/.test(
      lower,
    )
  )
    throw new Error("pg_catalog function not on the read-only list");
  return {
    stripped: s,
    isExplain: !!m[1],
    text: sqlRaw.trim().replace(/;\s*$/, ""),
  };
}

function wrap(v, cfg) {
  const body = v.isExplain
    ? v.text
    : `select * from (\n${v.text}\n) as incident_q limit ${cfg.rowLimit}`;
  return `begin read only;\nset local statement_timeout = ${cfg.timeoutMs};\nset local lock_timeout = '1s';\nset local idle_in_transaction_session_timeout = ${cfg.timeoutMs};\n${body};\ncommit;\n`;
}

function parseCsv(t) {
  const rows = [];
  let row = [],
    cell = "",
    q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function libraryQuery(name, params) {
  const md = fs.readFileSync(
    path.join(__dirname, "..", "reference", "query-library.md"),
    "utf8",
  );
  const re = new RegExp(
    "^###\\s+" +
      name.replace(/[^\w-]/g, "") +
      "\\s*$[\\s\\S]*?```sql\\n([\\s\\S]*?)```",
    "m",
  );
  const m = md.match(re);
  if (!m) throw new Error(`library query not found: ${name}`);
  return m[1].replace(/:([a-z_][a-z0-9_]*)/gi, (all, k) => {
    if (!(k in params)) {
      if (/^[a-z_]+$/.test(k) && all.startsWith("::")) return all;
      throw new Error(`missing parameter: ${k}`);
    }
    const v = String(params[k]);
    if (!/^[A-Za-z0-9_.:+ \-]{0,80}$/.test(v))
      throw new Error(`parameter ${k} has unsafe characters`);
    return /^\d+$/.test(v) ? v : `'${v}'`;
  });
}

function main() {
  const a = process.argv.slice(2);
  const get = (n) => {
    const i = a.indexOf(n);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const all = (n) => a.flatMap((x, i) => (x === n ? [a[i + 1]] : []));
  const name = get("--name") || "query";
  if (!/^[\w-]+$/.test(name)) {
    console.error("bad --name");
    return 2;
  }
  const params = Object.fromEntries(
    all("--param").map((p) => p.split(/=(.*)/s).slice(0, 2)),
  );
  let sql;
  try {
    sql = get("--file")
      ? fs.readFileSync(get("--file"), "utf8")
      : libraryQuery(get("--lib") || "", params);
  } catch (e) {
    console.error("REJECTED: " + e.message);
    return 2;
  }
  const id = g.incidentId(get("--incident"));
  const gp = (() => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(g.incidentDir(id), ".guard-pass"), "utf8"),
      );
    } catch {
      return null;
    }
  })();
  const cfg = g.loadConfig(gp ? gp.target : "production");
  let v;
  try {
    v = validate(sql);
  } catch (e) {
    console.error("REJECTED: " + e.message);
    return 2;
  }
  const final = wrap(v, cfg);
  if (a.includes("--check-only")) {
    console.log("ACCEPTED\n" + final);
    return 0;
  }
  if (!id) {
    console.error("no incident id");
    return 2;
  }

  const dir = g.incidentDir(id);
  const t0 = Date.now();
  const r = cp.spawnSync(
    "bash",
    [path.join(__dirname, "remote-readonly.sh"), "--incident", id, "--psql"],
    {
      input: final,
      encoding: "utf8",
      timeout: cfg.timeoutMs + 30000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const ms = Date.now() - t0;
  const text = r.stdout || "";
  const failed =
    r.status !== 0 ||
    /^(psql: )?(error|fatal):/im.test(text) ||
    /canceling statement due to/.test(text);
  const rows = failed
    ? []
    : parseCsv(text.trim() + "\n").filter((x) => x.length > 1 || x[0] !== "");
  const header = rows.shift() || [];
  const approved = all("--approve-column");
  const masked = header.map(
    (h) => PERSONAL.test(h) && !approved.includes(h) && !SAFE_COLUMN.test(h),
  );
  const data = rows.map((row) =>
    row.map((c, i) => (masked[i] ? "[MASKED]" : g.redact(c))),
  );
  fs.appendFileSync(
    path.join(dir, "commands.log"),
    JSON.stringify({
      type: "query",
      ts: new Date().toISOString(),
      name,
      lib: get("--lib") || null,
      params,
      sql: v.text,
      durationMs: ms,
      rowCount: data.length,
      ok: !failed,
      maskedColumns: header.filter((_, i) => masked[i]),
    }) + "\n",
  );
  if (failed) {
    console.error(
      "QUERY FAILED (not retried): " +
        g.redact(
          text.split("\n").find((l) => /error|cancel/i.test(l)) ||
            "exit " + r.status,
        ),
    );
    return 3;
  }

  fs.mkdirSync(path.join(dir, "results"), { recursive: true, mode: 0o700 });
  const resFile = path.join(dir, "results", `${name}.json`);
  fs.writeFileSync(
    resFile,
    JSON.stringify(
      {
        name,
        columns: header,
        maskedColumns: header.filter((_, i) => masked[i]),
        rowCount: data.length,
        limit: cfg.rowLimit,
        truncated: !v.isExplain && data.length >= cfg.rowLimit,
        rows: data.map((r2) =>
          Object.fromEntries(header.map((h, i) => [h, r2[i]])),
        ),
      },
      null,
      1,
    ),
    { mode: 0o600 },
  );
  if (get("--export-ids")) {
    const cols = get("--export-ids").split(",");
    const idx = cols.map((c) => header.indexOf(c));
    if (idx.some((i) => i < 0 || masked[i])) {
      console.error(
        "REJECTED: --export-ids columns must exist and not be masked",
      );
      return 2;
    }
    const f = path.join(dir, "affected-ids.csv");
    const have = fs.existsSync(f);
    fs.appendFileSync(
      f,
      (have ? "" : cols.join(",") + "\n") +
        data.map((r2) => idx.map((i) => r2[i]).join(",")).join("\n") +
        "\n",
      { mode: 0o600 },
    );
    try {
      fs.chmodSync(f, 0o600);
    } catch {
      /* not supported on this OS */
    }
  }
  console.log(
    JSON.stringify({
      name,
      rowCount: data.length,
      durationMs: ms,
      result: path.relative(g.ROOT, resFile),
    }),
  );
  console.log(header.join(" | "));
  data.slice(0, 25).forEach((r2) => console.log(r2.join(" | ")));
  if (data.length > 25)
    console.log(`... ${data.length - 25} more rows in the result file`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { validate, wrap, strip };
