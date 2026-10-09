#!/usr/bin/env node
"use strict";
// Turns the user's numbers (and optionally a local nginx access log) into explicit load scenarios.
// Usage: node estimate-peak.js [--model load-test/load-model.json] [--access-log <path>] [--root <repo>]
// The access log is aggregated in memory only: IP addresses, user ids, query strings and tokens are discarded.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const modelPath = path.resolve(root, opt("model", "load-test/load-model.json"));
const logPath = opt("access-log", null);

const MONTHS = {
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
const LINE =
  /^\S+ \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "[^"]*"(?: (\S+))?/;

function normalizePath(p) {
  const clean = p.split("?")[0];
  return (
    clean
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        if (/^\d+$/.test(seg)) return ":id";
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            seg,
          )
        )
          return ":id";
        if (/^[0-9a-f]{16,}$/i.test(seg)) return ":id";
        if (seg.length >= 6 && /\d/.test(seg) && /^[\w-]+$/.test(seg))
          return ":id";
        return decodeURIComponent(seg).slice(0, 40);
      })
      .join("/") || "/"
  );
}
function tsToSec(s) {
  const m = s.match(/^(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+)/);
  return m
    ? Math.floor(
        Date.UTC(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], +m[6]) / 1000,
      )
    : null;
}
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function analyzeLog(file) {
  const perSec = new Map(),
    routes = new Map(),
    times = [];
  let reads = 0,
    writes = 0,
    lines = 0,
    bad = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    lines++;
    const m = line.match(LINE);
    if (!m) {
      bad++;
      continue;
    }
    const sec = tsToSec(m[1]);
    if (sec === null) {
      bad++;
      continue;
    }
    perSec.set(sec, (perSec.get(sec) || 0) + 1);
    const method = m[2];
    const key = `${method} ${normalizePath(m[3])}`;
    routes.set(key, (routes.get(key) || 0) + 1);
    if (method === "GET" || method === "HEAD") reads++;
    else writes++;
    const rt = parseFloat(m[5]);
    if (Number.isFinite(rt)) times.push(rt);
  }
  const perMin = new Map();
  for (const [s, n] of perSec)
    perMin.set(Math.floor(s / 60), (perMin.get(Math.floor(s / 60)) || 0) + n);
  const total = [...routes.values()].reduce((a, b) => a + b, 0);
  const mix = [...routes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, n]) => {
      const [method, p] = k.split(" ");
      return {
        name: k
          .replace(/[^\w]+/g, "_")
          .replace(/^_|_$/g, "")
          .toLowerCase()
          .slice(0, 40),
        method,
        path: p,
        weight: Math.max(1, Math.round((n / total) * 100)),
        kind: method === "GET" || method === "HEAD" ? "read" : "write",
        source: "from-log",
      };
    });
  return {
    lines,
    unparsed: bad,
    peak_rps: Math.max(0, ...perSec.values()),
    peak_rpm: Math.max(0, ...perMin.values()),
    read_write_ratio: writes ? +(reads / writes).toFixed(2) : null,
    p95_request_time_s: times.length ? pct(times, 95) : null,
    mix,
  };
}

(async () => {
  let model;
  try {
    model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  } catch {
    console.error(
      `Cannot read ${path.relative(root, modelPath)}. Copy load-test/load-model.example.json and fill in the numbers (see reference/capacity-model.md).`,
    );
    process.exit(1);
  }
  const I = model.inputs || {};
  const v = (k, d) => (I[k] && Number.isFinite(+I[k].value) ? +I[k].value : d);
  const missing = [
    "total_schools",
    "users_per_school",
    "peak_active_fraction",
    "actions_per_minute",
    "requests_per_action",
  ].filter((k) => !I[k] || !Number.isFinite(+I[k].value));
  if (missing.length) {
    console.error(`Missing inputs: ${missing.join(", ")}`);
    process.exit(1);
  }
  const assumptions = [];
  for (const [k, o] of Object.entries(I))
    if (o.source !== "stated")
      assumptions.push(`${k} = ${o.value} (${o.source || "assumed"})`);

  let log = null;
  if (logPath) {
    try {
      log = await analyzeLog(path.resolve(logPath));
    } catch (e) {
      console.error(`Cannot read access log: ${e.code || e.message}`);
      process.exit(1);
    }
    if (log.mix.length) {
      model.endpoint_mix = mergeMix(model.endpoint_mix || [], log.mix);
    }
  }

  const total_users = v("total_schools") * v("users_per_school");
  const concurrent_active = total_users * v("peak_active_fraction");
  const rps_typical =
    (concurrent_active * v("actions_per_minute") * v("requests_per_action")) /
    60;
  const burst = v("burst_multiplier", 1),
    safety = v("safety_factor", 2);
  let peak_rps = rps_typical * burst * safety;
  let peak_source = "computed from model";
  if (log && log.peak_rps) {
    // real traffic wins for the observed peak, still scaled by the safety factor
    peak_rps = Math.max(peak_rps, log.peak_rps * safety);
    peak_source = "max(model, access-log peak x safety)";
  }
  const lat = v("avg_latency_s", 0.4);
  const littles =
    peak_rps *
    (log && log.p95_request_time_s
      ? Math.min(lat, log.p95_request_time_s)
      : lat);
  const r1 = (x) => Math.max(1, Math.round(x * 10) / 10);
  const baseline = r1(rps_typical);
  const peak = r1(peak_rps);
  model.scenarios = {
    baseline: {
      executor: "constant-arrival-rate",
      rate_per_s: baseline,
      duration: "5m",
      note: "typical busy-hour load, no burst, no safety factor",
    },
    peak: {
      executor: "constant-arrival-rate",
      rate_per_s: peak,
      duration: "10m",
      note: `estimated peak x safety factor ${safety}`,
    },
    spike: {
      executor: "ramping-arrival-rate",
      start_rate_per_s: baseline,
      spike_rate_per_s: r1(peak * 4),
      spike_duration: "60s",
      total_duration: "4m",
      note: "4x peak for 60 seconds, starting from baseline",
    },
    stress: {
      executor: "ramping-arrival-rate",
      stages: [1, 2, 3, 4, 5, 6].map((m) => ({
        multiplier: m,
        rate_per_s: r1(peak * m),
        duration: "2m",
      })),
      note: "ramp 1x to 6x peak; stops at the first breached threshold",
    },
    soak: {
      executor: "constant-arrival-rate",
      rate_per_s: peak,
      duration: `${v("soak_hours", 4)}h`,
      note: "only runs with --soak and an explicit user request",
    },
  };
  model.estimate = {
    generated_at: new Date().toISOString(),
    total_users,
    concurrent_active: Math.round(concurrent_active),
    requests_per_second_typical: +rps_typical.toFixed(2),
    peak_requests_per_second: peak,
    peak_source,
    littles_law_concurrency: +littles.toFixed(1),
    assumptions,
    access_log: log
      ? {
          lines: log.lines,
          unparsed: log.unparsed,
          peak_rps: log.peak_rps,
          peak_rpm: log.peak_rpm,
          read_write_ratio: log.read_write_ratio,
          p95_request_time_s: log.p95_request_time_s,
        }
      : null,
  };
  fs.writeFileSync(modelPath, JSON.stringify(model, null, 2) + "\n");

  console.log("Scenario        Rate (req/s)   Duration");
  console.log(
    `baseline        ${String(baseline).padEnd(14)} ${model.scenarios.baseline.duration}`,
  );
  console.log(
    `peak            ${String(peak).padEnd(14)} ${model.scenarios.peak.duration}`,
  );
  console.log(
    `spike           ${String(model.scenarios.spike.spike_rate_per_s).padEnd(14)} ${model.scenarios.spike.spike_duration} (from ${baseline})`,
  );
  console.log(
    `stress          ${model.scenarios.stress.stages.map((s) => s.rate_per_s).join(" -> ")}   2m per stage`,
  );
  console.log(
    `soak            ${String(peak).padEnd(14)} ${model.scenarios.soak.duration} (only with --soak)`,
  );
  console.log(
    `\nUsers ${total_users}, concurrently active ${Math.round(concurrent_active)}, typical ${rps_typical.toFixed(2)} req/s, peak ${peak} req/s (${peak_source}).`,
  );
  console.log(
    `Little's law cross-check: ~${littles.toFixed(1)} requests in flight at peak.`,
  );
  if (log)
    console.log(
      `Access log: ${log.lines} lines, observed peak ${log.peak_rps} req/s (${log.peak_rpm} req/min), read/write ${log.read_write_ratio}, endpoint mix taken from the log.`,
    );
  console.log("\nAssumptions (not stated by the user):");
  for (const a of assumptions) console.log(" - " + a);
  if (!assumptions.length) console.log(" - none");
})();

function mergeMix(existing, fromLog) {
  // Keep existing templated paths ({schoolId}) when a log route obviously matches; otherwise use the log routes as they are.
  return fromLog.map((r) => {
    const m = existing.find(
      (e) =>
        e.method === r.method &&
        e.path.split("?")[0].replace(/\{[^}]+\}/g, ":id") === r.path,
    );
    return m ? { ...m, weight: r.weight, source: "from-log" } : r;
  });
}
