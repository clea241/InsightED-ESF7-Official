#!/usr/bin/env node
"use strict";
// Guard + shared helpers for the incident-diagnosis skill.
//   node guard-incident-env.js --mode investigate|repro [--target production|staging] [--incident <id>]
//   node guard-incident-env.js --match -- <argv...>     (exit 0 if the command is allowlisted; used by remote-readonly.sh)
//   node guard-incident-env.js --redact                 (stdin -> stdout, personal data and secrets masked)
//   node guard-incident-env.js --audit-log [--incident <id>]   (re-check every command in commands.log against the allowlist)
// Never prints secrets. Exit 0 only if every check passes.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "../../../..");
const ALLOWLIST_PATH = path.join(
  ROOT,
  "incident",
  "allowed-remote-commands.json",
);
const ENV_PATH = path.join(ROOT, ".env.incident");

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const l of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m && !l.trim().startsWith("#"))
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function loadConfig(target) {
  const e = parseEnvFile(ENV_PATH);
  const list = (s) =>
    (s || "")
      .split(",")
      .map((x) => x.trim().replace(/\/+$/, ""))
      .filter(Boolean);
  const cfg = {
    target: target || "production",
    sshHost: target === "staging" ? e.STAGING_SSH_HOST : e.PROD_SSH_HOST,
    sshUser:
      target === "staging"
        ? e.STAGING_SSH_USER || e.PROD_SSH_USER
        : e.PROD_SSH_USER,
    sshKey: e.SSH_KEY || "",
    logPaths: list(e.LOG_PATHS),
    pm2User: e.PM2_USER || "",
    releaseRoot: (e.RELEASE_ROOT || "").replace(/\/+$/, ""),
    marker: e.RELEASE_MARKER_FILE || "",
    backupDir: (e.BACKUP_DIR || "").replace(/\/+$/, ""),
    dbName: e.DB_NAME || "",
    dbUser: e.DB_READONLY_USER || "",
    dbHost: e.DB_HOST || "localhost",
    dbPort: e.DB_PORT || "5432",
    timeoutMs: parseInt(e.QUERY_TIMEOUT_MS || "10000", 10),
    rowLimit: parseInt(e.QUERY_ROW_LIMIT || "1000", 10),
    evidenceMaxMb: parseInt(e.EVIDENCE_MAX_MB || "500", 10),
    present: Object.keys(e),
  };
  return cfg;
}

function loadAllowlist(file) {
  return JSON.parse(fs.readFileSync(file || ALLOWLIST_PATH, "utf8"));
}
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// ---------- redaction ----------
// Each IP becomes a stable keyed hash (HMAC-SHA256, random per-incident key in incident/<id>/.ipkey) so distinct clients can be counted.
// The key is deleted after evidence collection (--drop-ip-key); without a key every IP becomes [REDACTED-IP].
let ipKey = null;
const ipKeyFile = (id) => path.join(ROOT, "incident", id, ".ipkey");
function loadIpKey(id) {
  try {
    ipKey = fs.readFileSync(ipKeyFile(id));
  } catch {
    ipKey = null;
  }
}
function ipToken(ip) {
  if (!ipKey) return "[REDACTED-IP]";
  return (
    "ip-" +
    crypto.createHmac("sha256", ipKey).update(ip).digest("hex").slice(0, 10)
  );
}
const REDACTIONS = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]*@[^\s'"]+/gi, "[REDACTED-CONNSTRING]"],
  [/\bpostgres(?:ql)?:\/\/\S+/gi, "[REDACTED-CONNSTRING]"],
  [/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, "Bearer [REDACTED]"],
  [
    /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
    "[REDACTED-JWT]",
  ],
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
    "$1$2[REDACTED]",
  ],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED-EMAIL]"],
  [
    /(?:\b(?:[0-9a-f]{1,4}:){1,5}|::)ffff:((?:\d{1,3}\.){3}\d{1,3})\b/gi,
    (m, v4) => ipToken(v4),
  ], // IPv4-mapped IPv6 -> same token as the plain IPv4
  [
    /\b(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi,
    (m) => ipToken(m.toLowerCase()),
  ],
  [
    /\b((?:\d{1,3}\.){3}\d{1,3})(:\d{1,5}\b)?/g,
    (m, ip, port) => ipToken(ip) + (port || ""),
  ],
  [/(?:\+?63|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[REDACTED-PHONE]"],
  [/\b\d{3}[\s.-]\d{3,4}[\s.-]\d{4}\b/g, "[REDACTED-PHONE]"],
];
function redact(text) {
  let s = String(text);
  for (const [re, rep] of REDACTIONS) s = s.replace(re, rep);
  return s.replace(/[A-Za-z0-9_+=-]{32,}/g, (m) => {
    if (/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(m)) return m; // git sha / sha256 checksum
    if (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(m)) return m; // lowercase kebab/snake identifier
    return /[0-9]/.test(m) && /[A-Za-z]/.test(m) ? "[REDACTED-TOKEN]" : m;
  });
}

// ---------- command matching ----------
const META = /[;&`<>\n\r]|\$\(|\$\{|\|\|/;
function underRoot(p, roots) {
  return roots.some((r) => r && (p === r || p.startsWith(r + "/")));
}
function safePath(p, roots) {
  if (!p.startsWith("/") || p.includes("..") || /[*?\[\]{}~|]/.test(p))
    return false;
  if (path.posix.normalize(p) !== p) return false;
  if (
    /(^|\/)(\.env[^/]*|\.pgpass|\.ssh|id_rsa[^/]*|[^/]*\.(pem|key|p12))(\/|$)/i.test(
      p,
    )
  )
    return false;
  return underRoot(p, roots);
}
function tokenOk(spec, arg, cfg) {
  switch (spec) {
    case "{PATH}":
      return safePath(arg, [...cfg.logPaths, cfg.releaseRoot, cfg.backupDir]);
    case "{LOGPATH}":
      return safePath(arg, cfg.logPaths);
    case "{MARKER}":
      return (
        !!cfg.marker &&
        arg === cfg.marker &&
        safePath(arg, [cfg.releaseRoot, ...cfg.logPaths])
      );
    case "{INT}":
      return /^\d{1,6}$/.test(arg);
    case "{NAME}":
      return /^[A-Za-z0-9_.:@-]{1,80}$/.test(arg);
    case "{TIME}":
      return /^[0-9TZ:+. -]{4,40}$/.test(arg);
    case "{PATTERN}":
      return arg.length > 0 && arg.length <= 300 && !arg.startsWith("-");
    case "{DB_HOST}":
      return !!cfg.dbHost && arg === cfg.dbHost;
    case "{DB_PORT}":
      return arg === cfg.dbPort;
    case "{DB_NAME}":
      return !!cfg.dbName && arg === cfg.dbName;
    case "{DB_READONLY_USER}":
      return !!cfg.dbUser && arg === cfg.dbUser;
    default:
      return spec === arg;
  }
}
function matchCommand(argv, cfg, allow) {
  if (!argv.length) return { ok: false, reason: "empty command" };
  for (const a of argv) {
    if (META.test(a) || (a.includes("|") && !isPatternArg(argv, a, allow))) {
      return { ok: false, reason: "shell metacharacter in argument" };
    }
  }
  const entry = (allow.commands || []).filter((c) => c.exe === argv[0]);
  if (!entry.length)
    return { ok: false, reason: `executable not allowlisted: ${argv[0]}` };
  for (const c of entry) {
    for (const form of c.forms) {
      if (
        form.length === argv.length &&
        form.every((spec, i) => tokenOk(spec, argv[i], cfg))
      )
        return { ok: true, entry: c };
    }
  }
  return {
    ok: false,
    reason: `arguments do not match any allowed form of ${argv[0]}`,
  };
}
// '|' is only tolerated in a grep expression, i.e. an argument that sits in a {PATTERN} slot of some form.
function isPatternArg(argv, arg, allow) {
  const i = argv.indexOf(arg);
  return (allow.commands || []).some(
    (c) =>
      c.exe === argv[0] &&
      c.forms.some((f) => f.length === argv.length && f[i] === "{PATTERN}"),
  );
}

// ---------- static allowlist checks ----------
const ALLOWED_EXES = new Set([
  "ls",
  "stat",
  "du",
  "df",
  "uptime",
  "date",
  "free",
  "ps",
  "tail",
  "head",
  "grep",
  "zgrep",
  "cat",
  "sha256sum",
  "journalctl",
  "pm2",
  "nginx",
  "psql",
]);
const FORBIDDEN_EXES = [
  "rm",
  "mv",
  "cp",
  "scp",
  "rsync",
  "chmod",
  "chown",
  "sudo",
  "su",
  "kill",
  "pkill",
  "killall",
  "systemctl",
  "service",
  "vi",
  "vim",
  "nano",
  "ed",
  "sed",
  "awk",
  "tee",
  "dd",
  "ln",
  "truncate",
  "logrotate",
  "reboot",
  "shutdown",
  "bash",
  "sh",
  "node",
  "python",
  "curl",
  "wget",
  "xargs",
  "find",
];
function checkAllowlist(allow) {
  const res = [];
  const add = (ok, msg) => res.push({ ok, msg });
  const cmds = allow.commands || [];
  let bad = false;
  for (const c of cmds) {
    const forms = c.forms || [];
    if (FORBIDDEN_EXES.includes(c.exe) || !ALLOWED_EXES.has(c.exe)) {
      add(false, `allowlist contains ${c.exe}`);
      bad = true;
    }
    for (const f of forms) {
      if (f[0] !== c.exe) {
        add(false, `allowlist form for ${c.exe} starts with ${f[0]}`);
        bad = true;
      }
      const lit = f.filter((t) => !/^\{[A-Z_]+\}$/.test(t));
      if (lit.some((t) => FORBIDDEN_EXES.includes(t))) {
        add(
          false,
          `allowlist form runs ${lit.find((t) => FORBIDDEN_EXES.includes(t))}`,
        );
        bad = true;
      }
      if (lit.some((t) => /[;&`<>]|\$\(/.test(t) || t.includes("|"))) {
        add(
          false,
          `allowlist form contains a shell metacharacter: ${f.join(" ")}`,
        );
        bad = true;
      }
      if (c.exe === "pm2") {
        if (!["jlist", "describe", "logs"].includes(f[1])) {
          add(false, `allowlist contains pm2 ${f[1]}`);
          bad = true;
        }
        if (f[1] === "logs" && !f.includes("--nostream")) {
          add(false, "allowlist contains pm2 logs without --nostream");
          bad = true;
        }
      }
      if (c.exe === "nginx" && !(f.length === 2 && f[1] === "-V")) {
        add(false, `allowlist contains nginx ${f.slice(1).join(" ")}`);
        bad = true;
      }
      if (c.exe === "journalctl" && !f.includes("--no-pager")) {
        add(false, "allowlist contains journalctl without --no-pager");
        bad = true;
      }
      if (c.exe === "psql") {
        const i = f.indexOf("-U");
        const ok =
          c.readonlyWrapper === true &&
          f.includes("-X") &&
          f.includes("-w") &&
          f.includes("--csv") &&
          i > 0 &&
          f[i + 1] === "{DB_READONLY_USER}" &&
          f.slice(-2).join(" ") === "-f -" &&
          !f.some((t) =>
            ["-c", "--command", "-o", "--output", "-L", "-s", "-1"].includes(t),
          );
        if (!ok) {
          add(
            false,
            "allowlist contains psql without the read-only wrapper constraints",
          );
          bad = true;
        }
      }
      if (
        ["grep", "zgrep", "tail", "head", "cat", "sha256sum"].includes(c.exe) &&
        f.some((t) => /^(-f|-F|--follow|-r|-R|-e|-w|-z)$/.test(t))
      ) {
        add(false, `allowlist contains an unsafe flag in ${f.join(" ")}`);
        bad = true;
      }
    }
  }
  if (!bad)
    add(
      true,
      `allowlist contains only read-only commands (${cmds.length} executables)`,
    );
  return res;
}

// ---------- incident dir ----------
function incidentId(arg) {
  if (arg) return arg;
  if (process.env.INCIDENT_ID) return process.env.INCIDENT_ID;
  const f = path.join(ROOT, "incident", ".current");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "";
}
const incidentDir = (id) => path.join(ROOT, "incident", id);

// ---------- CLI ----------
function out(ok, msg) {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  return ok;
}
function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function runDbCheck(cfg, id) {
  const sql = `
select 'super_or_create', (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)::text from pg_roles where rolname = current_user;
select 'write_privilege_tables', count(*)::text from information_schema.tables t where table_schema not in ('pg_catalog','information_schema') and table_type = 'BASE TABLE' and (has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'INSERT') or has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'UPDATE') or has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'DELETE') or has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'TRUNCATE'));
select 'readonly_effective', current_setting('default_transaction_read_only');
select 'readonly_role_setting', coalesce((select 'on' from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = current_user and s.setconfig::text like '%default_transaction_read_only=on%' limit 1), 'off');
`;
  const r = cp.spawnSync(
    "bash",
    [
      path.join(__dirname, "remote-readonly.sh"),
      "--incident",
      id,
      "--bootstrap",
      "--psql",
    ],
    { input: sql, encoding: "utf8", timeout: 60000 },
  );
  if (r.status !== 0)
    return [
      {
        ok: false,
        msg: `database role check could not run (${(r.stderr || "").split("\n")[0] || "exit " + r.status})`,
      },
    ];
  const rows = Object.fromEntries(
    r.stdout
      .split(/\r?\n/)
      .map((l) => l.split(","))
      .filter((x) => x.length >= 2)
      .map((x) => [x[0].replace(/"/g, ""), x[1].replace(/"/g, "")]),
  );
  const res = [];
  res.push({
    ok: rows.super_or_create === "false",
    msg: "database role is not superuser and cannot create roles or databases",
  });
  res.push({
    ok: rows.write_privilege_tables === "0",
    msg:
      rows.write_privilege_tables === "0"
        ? "database role has no write privileges"
        : `database role has write privileges on ${rows.write_privilege_tables} tables`,
  });
  const ro =
    rows.readonly_role_setting === "on"
      ? "role setting"
      : "wrapper-enforced (PGOPTIONS)";
  res.push({
    ok: rows.readonly_effective === "on",
    msg: `default_transaction_read_only is on (${ro})`,
  });
  return res;
}

function main() {
  if (
    process.argv.includes("--init-ip-key") ||
    process.argv.includes("--drop-ip-key")
  ) {
    const f = ipKeyFile(incidentId(arg("--incident")));
    if (process.argv.includes("--drop-ip-key")) {
      fs.rmSync(f, { force: true });
      console.log("ip key discarded");
      return 0;
    }
    if (!fs.existsSync(f))
      fs.writeFileSync(f, crypto.randomBytes(32), { mode: 0o600 });
    return 0;
  }
  if (
    process.argv.includes("--redact-file") ||
    process.argv.includes("--redact")
  )
    loadIpKey(incidentId(arg("--incident")));
  if (process.argv.includes("--redact-file")) {
    // --redact-file <in> <out>: raw hash is recorded by the caller; the raw file is never kept
    const i = process.argv.indexOf("--redact-file");
    let t = fs.readFileSync(process.argv[i + 1]);
    if (process.argv.includes("--gz")) t = require("zlib").gunzipSync(t);
    fs.writeFileSync(
      process.argv[i + 2],
      t.toString("utf8").split("\n").map(redact).join("\n"),
      { mode: 0o600 },
    );
    return 0;
  }
  if (process.argv.includes("--redact")) {
    process.stdout.write(redact(fs.readFileSync(0, "utf8")));
    return 0;
  }
  if (process.argv.includes("--match")) {
    const argv = process.argv.slice(process.argv.indexOf("--") + 1);
    const gp = guardPass();
    const c = loadConfig(gp ? gp.target : "production");
    const r = matchCommand(argv, c, loadAllowlist());
    if (!r.ok) console.error(`REJECTED: ${r.reason}`);
    return r.ok ? 0 : 1;
  }
  if (process.argv.includes("--audit-log")) return auditLog();

  const mode = arg("--mode");
  const target = arg("--target") || "production";
  if (
    !["investigate", "repro"].includes(mode) ||
    !["production", "staging"].includes(target)
  ) {
    console.error(
      "usage: guard-incident-env.js --mode investigate|repro [--target production|staging] [--incident <id>]",
    );
    return 2;
  }
  const results = [];
  const add = (ok, msg) => results.push({ ok, msg });

  if (mode === "repro") {
    const e = parseEnvFile(path.join(ROOT, ".env.test"));
    add(fs.existsSync(path.join(ROOT, ".env.test")), ".env.test exists");
    const host = (e.DB_HOST || "").toLowerCase();
    const db = e.DB_NAME || e.PGDATABASE || "";
    add(
      ["127.0.0.1", "localhost", "::1"].includes(host),
      "test database host is loopback",
    );
    add(
      /test/i.test(db) && !/^drill_/i.test(db),
      'test database name contains "test" and is not a drill_ database',
    );
    add(!/^drill_/i.test(db), "not a drill_ database");
    console.log("NOTE repro mode contacts no remote host");
  } else {
    const id = incidentId(arg("--incident"));
    add(fs.existsSync(ENV_PATH), ".env.incident exists");
    const cfg = loadConfig(target);
    const missing = [
      ["sshHost", target === "staging" ? "STAGING_SSH_HOST" : "PROD_SSH_HOST"],
      ["sshUser", "PROD_SSH_USER"],
      ["dbName", "DB_NAME"],
      ["dbUser", "DB_READONLY_USER"],
      ["releaseRoot", "RELEASE_ROOT"],
    ]
      .filter(([k]) => !cfg[k])
      .map(([, n]) => n);
    if (!cfg.logPaths.length) missing.push("LOG_PATHS");
    add(
      missing.length === 0,
      missing.length
        ? `required settings are filled in (missing: ${missing.join(", ")})`
        : "required settings are filled in",
    );
    add(
      cfg.logPaths.every(
        (p) =>
          p.startsWith("/") &&
          p.length > 8 &&
          !["/etc", "/root", "/home", "/var", "/usr", "/tmp"].includes(p),
      ),
      "LOG_PATHS are specific absolute directories",
    );
    add(
      /^\d{8}-\d{4}-[a-z0-9-]+$/.test(id),
      `incident id is valid (YYYYMMDD-HHMM-<short-name>)`,
    );
    let allow;
    try {
      allow = loadAllowlist(arg("--allowlist"));
      checkAllowlist(allow).forEach((r) => add(r.ok, r.msg));
    } catch (e) {
      add(false, `allowlist unreadable: ${e.message}`);
    }
    if (results.every((r) => r.ok) && !arg("--allowlist")) {
      const dir = incidentDir(id);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(ROOT, "incident", ".current"), id);
      const pass = {
        id,
        mode,
        target,
        time: new Date().toISOString(),
        allowlistSha: sha(fs.readFileSync(ALLOWLIST_PATH)),
        dbVerified: false,
      };
      fs.writeFileSync(path.join(dir, ".guard-pass"), JSON.stringify(pass), {
        mode: 0o600,
      });
      runDbCheck(cfg, id).forEach((r) => add(r.ok, r.msg));
      if (results.every((r) => r.ok)) {
        pass.dbVerified = true;
        fs.writeFileSync(path.join(dir, ".guard-pass"), JSON.stringify(pass), {
          mode: 0o600,
        });
      } else fs.rmSync(path.join(dir, ".guard-pass"), { force: true });
    }
  }
  results.forEach((r) => out(r.ok, r.msg));
  return results.every((r) => r.ok) ? 0 : 1;
}

function guardPass(dir) {
  const id = incidentId(arg("--incident"));
  const f = path.join(dir || (id ? incidentDir(id) : ""), ".guard-pass");
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

function auditLog() {
  const id = incidentId(arg("--incident"));
  const gp = guardPass();
  const cfg = loadConfig(gp ? gp.target : "production");
  const allow = loadAllowlist();
  const f = path.join(incidentDir(id), "commands.log");
  if (!fs.existsSync(f)) return out(false, "commands.log exists") ? 0 : 1;
  let n = 0,
    bad = 0;
  for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean)) {
    let j;
    try {
      j = JSON.parse(l);
    } catch {
      bad++;
      console.log("FAIL unparseable line in commands.log");
      continue;
    }
    if (j.type !== "cmd") continue;
    n++;
    const r = matchCommand(j.argv, cfg, allow);
    if (!r.ok) {
      bad++;
      console.log(`FAIL not allowlisted: ${j.argv[0]} (${r.reason})`);
    }
  }
  out(bad === 0, `commands.log: ${n} remote commands, all allowlisted`);
  return bad === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main());
module.exports = {
  ROOT,
  loadConfig,
  loadAllowlist,
  matchCommand,
  checkAllowlist,
  redact,
  incidentId,
  incidentDir,
  parseEnvFile,
  sha,
};
