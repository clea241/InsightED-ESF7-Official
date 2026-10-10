#!/usr/bin/env node
// Deterministic capacity estimate for a submission burst. The plan quotes these numbers; it never recomputes them by hand.
// Usage: node capacity-math.mjs --normal-per-min N --worst-per-min N --queries-per-submission N --payload-bytes N
//          --instances N --pool-per-instance N [--spike-factor 3] [--db-max-connections N] [--txn-ms N] [--outage-min 30]
//          [--source name=user|inventory|default|unknown ...] --out capacity.json
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const get = (n) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const sources = {};
argv.forEach((a, i) => {
  if (a === "--source" && argv[i + 1]) {
    const [k, v] = argv[i + 1].split("=");
    sources[k] = v;
  }
});
const REQUIRED = [
  "normal-per-min",
  "worst-per-min",
  "queries-per-submission",
  "payload-bytes",
  "instances",
  "pool-per-instance",
  "out",
];
const missing = REQUIRED.filter((r) => get(r) === undefined);
if (missing.length) {
  console.error(
    `Missing required argument(s): ${missing.map((m) => "--" + m).join(", ")}`,
  );
  console.error(
    "Usage: node capacity-math.mjs --normal-per-min N --worst-per-min N --queries-per-submission N --payload-bytes N --instances N --pool-per-instance N [--spike-factor 3] [--db-max-connections N] [--txn-ms N] [--outage-min 30] --out file",
  );
  process.exit(2);
}
const num = (n, def) => {
  const v = get(n);
  if (v === undefined) return def;
  const x = Number(v);
  if (!Number.isFinite(x) || x < 0) {
    console.error(`--${n} must be a non-negative number (got "${v}")`);
    process.exit(2);
  }
  return x;
};
const normal = num("normal-per-min");
const worst = num("worst-per-min");
const spike = num("spike-factor", 3);
const qps = num("queries-per-submission");
const payload = num("payload-bytes");
const instances = num("instances");
const poolPer = num("pool-per-instance");
const dbMax =
  get("db-max-connections") !== undefined ? num("db-max-connections") : null;
const txnMs = get("txn-ms") !== undefined ? num("txn-ms") : null;
const outage = num("outage-min", 30);
const src = (name, provided) =>
  sources[name] || (provided ? "user" : "unknown");
const inputs = {
  normalPerMin: { value: normal, source: src("normalPerMin", true) },
  worstPerMin: { value: worst, source: src("worstPerMin", true) },
  spikeFactor: {
    value: spike,
    source:
      sources.spikeFactor ||
      (get("spike-factor") !== undefined ? "user" : "default"),
  },
  queriesPerSubmission: {
    value: qps,
    source: sources.queriesPerSubmission || "inventory",
  },
  payloadBytes: { value: payload, source: sources.payloadBytes || "user" },
  instances: { value: instances, source: sources.instances || "inventory" },
  poolPerInstance: {
    value: poolPer,
    source: sources.poolPerInstance || "inventory",
  },
  dbMaxConnections: {
    value: dbMax,
    source: dbMax === null ? "unknown" : src("dbMaxConnections", true),
  },
  txnMs: {
    value: txnMs,
    source: txnMs === null ? "unknown" : src("txnMs", true),
  },
  outageMin: {
    value: outage,
    source:
      sources.outageMin ||
      (get("outage-min") !== undefined ? "user" : "default"),
  },
};

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const normalRps = normal / 60;
const worstRps = worst / 60;
const peakRps = worstRps * spike;
const qpsPeak = peakRps * qps;
const available = instances * poolPer;
const outageSec = outage * 60;
const backlogSubmissions = peakRps * outageSec;
const OVERHEAD = 2;
const backlogBytes = backlogSubmissions * payload * OVERHEAD;
const backlogMiB = backlogBytes / 1048576;
const backlogWorstAvgMiB =
  (worstRps * outageSec * payload * OVERHEAD) / 1048576;

const connNeeded = (ms) => peakRps * (ms / 1000);
const scenarioMs = txnMs !== null ? [txnMs] : [5, 20, 50];
const scenarios = scenarioMs.map((ms) => {
  const need = connNeeded(ms);
  return {
    txnMs: ms,
    kind: txnMs !== null ? "user-supplied" : "scenario (not a measurement)",
    connectionsNeeded: r2(need),
    fitsPool: need <= available,
    poolUtilizationPct: available ? r1((need / available) * 100) : null,
    fitsDbLimit: dbMax !== null ? need <= dbMax : null,
  };
});

const out = {
  inputs,
  results: {
    normalAvgRps: r2(normalRps),
    worstAvgRps: r2(worstRps),
    peakRps: r2(peakRps),
    queriesPerSecondAtPeak: r2(qpsPeak),
    connectionsAvailableFromPools: available,
    dbMaxConnections: dbMax,
    poolsExceedDbLimit: dbMax !== null ? available > dbMax : null,
    scenarios,
    redisBacklog: {
      label: "estimate",
      outageMinutes: outage,
      submissionsBuffered: Math.ceil(backlogSubmissions),
      overheadFactor: OVERHEAD,
      estimatedMiB: r1(backlogMiB),
      estimatedMiBAtWorstAverageRate: r1(backlogWorstAvgMiB),
    },
  },
  display: {
    normalAvgRps: r2(normalRps).toFixed(2),
    worstAvgRps: r2(worstRps).toFixed(2),
    peakRps: r2(peakRps).toFixed(2),
    queriesPerSecondAtPeak: r2(qpsPeak).toFixed(2),
    connectionsAvailable: String(available),
    redisBacklogSubmissions: String(Math.ceil(backlogSubmissions)),
    redisBacklogMiB: r1(backlogMiB).toFixed(1),
    redisBacklogWorstAvgMiB: r1(backlogWorstAvgMiB).toFixed(1),
    ...Object.fromEntries(
      scenarios.map((s) => [
        `connectionsNeeded_${s.txnMs}ms`,
        s.connectionsNeeded.toFixed(2),
      ]),
    ),
  },
  formulas: [
    "normalAvgRps = normalPerMin / 60",
    "worstAvgRps = worstPerMin / 60",
    "peakRps = worstAvgRps x spikeFactor",
    "queriesPerSecondAtPeak = peakRps x queriesPerSubmission",
    "connectionsNeeded = peakRps x (txnMs / 1000)   (Little's law: concurrency = arrival rate x time in system)",
    "connectionsAvailable = instances x poolPerInstance",
    "redisBacklogMiB = peakRps x outageMinutes x 60 x payloadBytes x 2 / 1048576   (estimate; 2 = overhead factor for stream and replication structures)",
    "redisBacklogWorstAvgMiB = worstAvgRps x outageMinutes x 60 x payloadBytes x 2 / 1048576   (estimate at the sustained worst-case average instead of the spike peak)",
  ],
  caveats: [
    "These are arithmetic estimates from the stated inputs, not measurements. Staging results do not prove production capacity.",
    txnMs === null
      ? "Transaction time was not supplied; 5, 20 and 50 ms are shown as scenarios only."
      : "Transaction time was supplied by the user.",
    "Little's law assumes the connection is held for the whole transaction; connections held longer (idle in transaction, slow clients) raise the need.",
    dbMax === null
      ? "Database max_connections is unknown; compare connectionsAvailable with it before trusting the pool settings."
      : "Compare connectionsAvailable with the database limit and leave headroom for admin and worker connections.",
  ],
};
fs.mkdirSync(path.dirname(path.resolve(get("out"))), { recursive: true });
fs.writeFileSync(get("out"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `capacity: peak ${out.display.peakRps} req/s, ${out.display.queriesPerSecondAtPeak} queries/s, pools ${available} connections, Redis backlog ~${out.display.redisBacklogMiB} MiB -> ${get("out")}`,
);
