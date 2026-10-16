#!/usr/bin/env node
"use strict";
// Merge the preserved logs into one aggregate timeline. Output: incident/<id>/timeline.json and timeline.md (same structure every time).
//   node build-timeline.js [--incident ID]
// Aggregates only: client IPs and user ids are never written (only a count of distinct pseudonyms).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
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
const dir = g.incidentDir(id),
  ev = path.join(dir, "evidence");
const read = (f, d) => {
  try {
    return fs.readFileSync(path.join(ev, f), "utf8").trim();
  } catch {
    return d;
  }
};

const tzRaw = read("snapshots/vm-tz.txt", "");
const tzMatch = tzRaw.match(/^([+-])(\d\d)(\d\d)/);
const vmOffsetMin = tzMatch
  ? (tzMatch[1] === "-" ? -1 : 1) * (+tzMatch[2] * 60 + +tzMatch[3])
  : 0;
const tzKnown = !!tzMatch;
let win = {};
try {
  win = JSON.parse(read("window.json", "{}"));
} catch {
  /* none */
}
const toUtc = (s) => {
  if (!s) return null;
  const d = new Date(
    /[zZ]|[+-]\d\d:?\d\d$/.test(s)
      ? s.replace(" ", "T")
      : s.replace(" ", "T") + "Z",
  );
  return isNaN(d)
    ? null
    : /[zZ]|[+-]\d\d:?\d\d$/.test(s)
      ? d
      : new Date(d.getTime() - vmOffsetMin * 60000);
};
const winSince = win.since ? toUtc(win.since) : null,
  winUntil = win.until ? toUtc(win.until) : null;

const MON = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};
const NGX_ACCESS =
  /^(\S+) \S+ \S+ \[(\d\d)\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d) ([+-]\d{4})\] "(\S+) (\S+)[^"]*" (\d{3}) (\d+|-)(.*)$/;
const NGX_ERROR =
  /^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d) \[(\w+)\] \d+#\d+: (.*)$/;
const GENERIC =
  /^(\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?)[:\s|-]*(.*)$/;

const norm = (m) =>
  m
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<uuid>",
    )
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/gi, "<email>")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/Bearer\s+\S+/gi, "Bearer <token>")
    .replace(/(["'])[^"']{1,60}\1/g, "$1<v>$1")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
const normRoute = (u) =>
  u
    .split("?")[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "/:id")
    .replace(/\/\d+/g, "/:id")
    .replace(/\/[A-Za-z0-9_-]{20,}/g, "/:id");
const salt = crypto.randomBytes(8).toString("hex");
const pseud = (s) =>
  crypto
    .createHash("sha1")
    .update(salt + s)
    .digest("hex")
    .slice(0, 6);
const minute = (d) => d.toISOString().slice(0, 16) + "Z";

const CLASSIFY = [
  [
    "deploy",
    /\b(deploy(ed|ment)?|release (switch|updated)|RELEASE_SHA|pm2 reload|reloading)\b/i,
  ],
  [
    "restart",
    /(PM2.*(restart|stopped|exited|online)|process (exited|restarted)|SIGINT|SIGTERM|Server (is )?(listening|running|started)|listening on (port|:)\d+)/i,
  ],
  [
    "redis_fallback",
    /(redis.*(unavailable|ECONNREFUSED|ETIMEDOUT|not connected|connection (lost|closed)|error)|falling back to (postgres|pg|database))/i,
  ],
  [
    "worker",
    /(worker|queue|job).*(fail|retry|retrying|error|stuck)|(fail|retry).*(job|queue)/i,
  ],
  [
    "error",
    /(JsonWebTokenError|TokenExpiredError|invalid signature)|\b(error|exception|unhandled|fatal|ECONN\w+|ETIMEDOUT|EPIPE|ENOMEM|out of memory|too many connections|pool)\b/i,
  ],
];
const AUTH = [
  ["expired token", /(jwt expired|token expired|TokenExpiredError)/i],
  ["invalid signature", /(invalid signature|JsonWebTokenError|secret)/i],
  [
    "malformed or missing token",
    /(jwt malformed|no token|missing token|invalid token)/i,
  ],
  ["forbidden (403)", /\b403\b|forbidden/i],
  ["unauthorized (401)", /\b401\b|unauthori[sz]ed/i],
];

const T = {
  events: [],
  firstErrors: new Map(),
  minutes: new Map(),
  statusTotals: {},
  routes: new Map(),
  routeTimes: new Map(),
  worker: new Map(),
  redis: new Map(),
  auth: {},
  clients: new Set(),
  sources: [],
};
const bump = (o, k, n = 1) => {
  o[k] = (o[k] || 0) + n;
};
const minBucket = (m) => {
  if (!T.minutes.has(m))
    T.minutes.set(m, { requests: 0, errors: 0, status: {} });
  return T.minutes.get(m);
};
const inWin = (d) =>
  (!winSince || d >= winSince) && (!winUntil || d <= winUntil);

function handleMessage(d, src, msg) {
  if (!inWin(d)) return;
  const a = AUTH.find(([, re]) => re.test(msg));
  if (
    a &&
    /(fail|denied|error|invalid|expired|malformed|unauthori|forbidden)/i.test(
      msg,
    )
  )
    bump(T.auth, a[0]);
  const kind = (CLASSIFY.find(([, re]) => re.test(msg)) || [])[0];
  if (!kind) return;
  const key = norm(msg);
  if (["deploy", "restart"].includes(kind))
    T.events.push({
      ts: d.toISOString(),
      type: kind,
      source: src,
      detail: key,
    });
  if (kind === "redis_fallback") {
    const e = T.redis.get(key) || { first: d.toISOString(), count: 0 };
    e.count++;
    T.redis.set(key, e);
    T.events.push({
      ts: d.toISOString(),
      type: kind,
      source: src,
      detail: key,
    });
  }
  if (kind === "worker") {
    const e = T.worker.get(key) || { first: d.toISOString(), count: 0 };
    e.count++;
    T.worker.set(key, e);
  }
  if (kind === "error" || kind === "worker" || kind === "redis_fallback") {
    const e = T.firstErrors.get(key) || {
      first: d.toISOString(),
      message: key,
      count: 0,
      source: src,
    };
    e.count++;
    T.firstErrors.set(key, e);
    minBucket(minute(d)).errors++;
  }
}

function parseFile(file, rel) {
  let text;
  try {
    text = file.endsWith(".gz")
      ? zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")
      : fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  const info = { name: rel, lines: 0, parsed: 0, first: null, last: null };
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    info.lines++;
    let m,
      d,
      handled = false;
    if ((m = line.match(NGX_ACCESS))) {
      const off = m[8];
      d = new Date(
        `${m[4]}-${String(MON[m[3]] + 1).padStart(2, "0")}-${m[2]}T${m[5]}:${m[6]}:${m[7]}${off.slice(0, 3)}:${off.slice(3)}`,
      );
      if (!isNaN(d)) {
        handled = true;
        if (inWin(d)) {
          const st = m[11],
            b = minBucket(minute(d));
          b.requests++;
          bump(b.status, st);
          bump(T.statusTotals, st);
          T.clients.add(pseud(m[1]));
          const route = `${m[9]} ${normRoute(m[10])}`;
          if (+st >= 400) {
            const k = `${route} ${st}`;
            T.routes.set(k, (T.routes.get(k) || 0) + 1);
            if (+st >= 500) b.errors++;
          }
          const rt = (m[13].match(/(?:rt|request_time|urt)=([\d.]+)/) ||
            m[13].match(/\s([\d.]+)\s*$/) ||
            [])[1];
          if (rt && +rt > 0) {
            const e = T.routeTimes.get(route) || { n: 0, sum: 0, max: 0 };
            e.n++;
            e.sum += +rt;
            e.max = Math.max(e.max, +rt);
            T.routeTimes.set(route, e);
          }
          if (+st === 401 || +st === 403)
            bump(
              T.auth,
              +st === 401 ? "unauthorized (401)" : "forbidden (403)",
            );
        }
      }
    } else if ((m = line.match(NGX_ERROR))) {
      d = toUtc(`${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`);
      handled = !!d;
      if (d) handleMessage(d, "nginx-error", `${m[7]} ${m[8]}`);
    } else if ((m = line.match(GENERIC))) {
      d = toUtc(m[1]);
      handled = !!d;
      if (d) handleMessage(d, path.basename(rel), m[2]);
    }
    if (handled) {
      info.parsed++;
      if (!info.first || d < info.first) info.first = d;
      if (!info.last || d > info.last) info.last = d;
    }
  }
  T.sources.push({
    name: rel,
    lines: info.lines,
    parsed: info.parsed,
    first: info.first && info.first.toISOString(),
    last: info.last && info.last.toISOString(),
  });
}
function walk(d, base = "") {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f);
    fs.statSync(p).isDirectory()
      ? walk(p, base + f + "/")
      : parseFile(p, base + f);
  }
}
walk(path.join(ev, "raw"));

// gaps
const gaps = [];
if (!T.sources.length)
  gaps.push(
    "No log files were parsed: the evidence folder has no readable logs.",
  );
if (!tzKnown)
  gaps.push(
    "VM time zone unknown: timestamps without an offset were assumed to be UTC.",
  );
if (winSince)
  for (const s of T.sources)
    if (s.first && new Date(s.first) > new Date(winSince.getTime() + 5 * 60000))
      gaps.push(
        `${s.name}: first parsed entry is ${s.first}, after the window start ${winSince.toISOString()} (rotated or missing earlier data).`,
      );
for (const s of T.sources)
  if (s.lines && s.parsed < s.lines * 0.2)
    gaps.push(
      `${s.name}: only ${s.parsed} of ${s.lines} lines had a recognizable timestamp.`,
    );
for (const l of read("snapshots/retention.txt", "").split("\n"))
  if (/^(GAP|SKIPPED|NOTE)/.test(l)) gaps.push(l);
// release switches from the snapshot of release directories
const releaseMarker = read("snapshots/release-marker.txt", "UNKNOWN");
const restartInfo = (() => {
  try {
    return JSON.parse(read("snapshots/pm2-status.json", "[]")).map((p) => ({
      name: p.name,
      restarts: p.restart_time,
      status: p.status,
      uptimeSince: p.pm_uptime ? new Date(p.pm_uptime).toISOString() : null,
    }));
  } catch {
    return [];
  }
})();
for (const p of restartInfo)
  if (p.uptimeSince && inWin(new Date(p.uptimeSince)))
    T.events.push({
      ts: p.uptimeSince,
      type: "restart",
      source: "pm2-status",
      detail: `${p.name} (re)started; restart count ${p.restarts}`,
    });

const sortedMin = [...T.minutes.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([m, v]) => ({ minute: m, ...v }));
const out = {
  meta: {
    incident: id,
    generatedAt: new Date().toISOString(),
    vmTimeZoneOffset: tzKnown ? tzRaw : "UNKNOWN",
    window: {
      since: winSince && winSince.toISOString(),
      until: winUntil && winUntil.toISOString(),
    },
    releaseMarker,
    files: T.sources,
  },
  gaps,
  events: T.events.sort((a, b) => a.ts.localeCompare(b.ts)),
  firstErrors: [...T.firstErrors.values()]
    .sort((a, b) => a.first.localeCompare(b.first))
    .slice(0, 60),
  perMinute: sortedMin,
  statusTotals: T.statusTotals,
  routesWithErrors: [...T.routes.entries()]
    .map(([k, count]) => ({
      route: k.replace(/ (\d{3})$/, ""),
      status: k.slice(-3),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40),
  slowestRoutes: [...T.routeTimes.entries()]
    .map(([route, e]) => ({
      route,
      requests: e.n,
      avgSeconds: +(e.sum / e.n).toFixed(3),
      maxSeconds: e.max,
    }))
    .sort((a, b) => b.avgSeconds - a.avgSeconds)
    .slice(0, 15),
  workerEvents: [...T.worker.entries()]
    .map(([message, e]) => ({ message, ...e }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30),
  redisFallbacks: [...T.redis.entries()]
    .map(([message, e]) => ({ message, ...e }))
    .slice(0, 30),
  authFailures: T.auth,
  distinctClients: T.clients.size,
  pm2: restartInfo,
};
fs.writeFileSync(
  path.join(dir, "timeline.json"),
  JSON.stringify(out, null, 1),
  { mode: 0o600 },
);

const tbl = (head, rows) =>
  rows.length
    ? `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`
    : "_none observed_\n";
const topMin = (f) =>
  sortedMin
    .filter(f)
    .sort((a, b) => b.errors - a.errors || a.minute.localeCompare(b.minute))
    .slice(0, 20);
const md = [
  `# Timeline ${id}`,
  "",
  "## Meta",
  `- VM time zone offset: ${out.meta.vmTimeZoneOffset} (all times below are UTC)`,
  `- Window: ${out.meta.window.since || "UNKNOWN"} to ${out.meta.window.until || "UNKNOWN"}`,
  `- Release marker at collection time: ${releaseMarker}`,
  `- Distinct clients seen (pseudonymised count): ${out.distinctClients}`,
  "",
  "## Evidence gaps",
  gaps.length ? gaps.map((x) => `- ${x}`).join("\n") : "_no gaps detected_",
  "",
  "## Key events (deploys, restarts, Redis fallbacks)",
  tbl(
    ["time (UTC)", "type", "source", "detail"],
    out.events
      .slice(0, 80)
      .map((e) => [e.ts, e.type, e.source, e.detail.replace(/\|/g, "/")]),
  ),
  "",
  "## First occurrence of each distinct error",
  tbl(
    ["first seen (UTC)", "count", "source", "message (normalised)"],
    out.firstErrors.map((e) => [
      e.first,
      e.count,
      e.source,
      e.message.replace(/\|/g, "/"),
    ]),
  ),
  "",
  "## Error rate per minute (top 20 minutes)",
  tbl(
    ["minute (UTC)", "requests", "errors"],
    topMin((m) => m.errors > 0).map((m) => [m.minute, m.requests, m.errors]),
  ),
  "",
  "## Status code distribution",
  `Totals: ${
    Object.keys(out.statusTotals)
      .sort()
      .map((k) => `${k}=${out.statusTotals[k]}`)
      .join(", ") || "_none observed_"
  }\n`,
  tbl(
    ["minute (UTC)", "401", "403", "502", "503", "504", "5xx other"],
    sortedMin
      .filter((m) =>
        ["401", "403", "502", "503", "504"].some((k) => m.status[k]),
      )
      .slice(0, 40)
      .map((m) => [
        m.minute,
        m.status["401"] || 0,
        m.status["403"] || 0,
        m.status["502"] || 0,
        m.status["503"] || 0,
        m.status["504"] || 0,
        Object.entries(m.status)
          .filter(([k]) => +k >= 500 && !["502", "503", "504"].includes(k))
          .reduce((s, [, v]) => s + v, 0),
      ]),
  ),
  "",
  "## Routes returning 4xx/5xx",
  tbl(
    ["route", "status", "count"],
    out.routesWithErrors.map((r) => [r.route, r.status, r.count]),
  ),
  "",
  "## Slowest routes",
  tbl(
    ["route", "requests", "avg s", "max s"],
    out.slowestRoutes.map((r) => [
      r.route,
      r.requests,
      r.avgSeconds,
      r.maxSeconds,
    ]),
  ),
  "",
  "## Worker job failures and retries",
  tbl(
    ["first seen (UTC)", "count", "message"],
    out.workerEvents.map((e) => [
      e.first,
      e.count,
      e.message.replace(/\|/g, "/"),
    ]),
  ),
  "",
  "## Redis fallback messages",
  tbl(
    ["first seen (UTC)", "count", "message"],
    out.redisFallbacks.map((e) => [
      e.first,
      e.count,
      e.message.replace(/\|/g, "/"),
    ]),
  ),
  "",
  "## Authentication failures by cause",
  tbl(["cause", "count"], Object.entries(out.authFailures)),
  "",
].join("\n");
fs.writeFileSync(path.join(dir, "timeline.md"), g.redact(md), { mode: 0o600 });
console.log(
  `timeline written: ${out.events.length} events, ${out.firstErrors.length} distinct errors, ${sortedMin.length} minutes, ${gaps.length} gap notes`,
);
