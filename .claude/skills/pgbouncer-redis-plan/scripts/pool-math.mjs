#!/usr/bin/env node
// Connection-demand and PgBouncer sizing math. Pure arithmetic: no network, no database.
// Usage: node pool-math.mjs --instances 4 --pool-max 8 --max-connections 100
//        [--other-apps 0] [--reserved 10] [--db-cores N] [--db-user-pairs 1]
//        [--peak-concurrent-writes N] [--window-s 1] [--avg-tx-ms N]
//        [--found instances,pool-max] [--assumed max-connections] [--json]
const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const list = (n) => (opt(n) || "").split(",").filter(Boolean);
const found = new Set(list("found"));
const assumedFlag = new Set(list("assumed"));
const num = (n, d) => (opt(n) === undefined ? d : Number(opt(n)));

const missing = ["instances", "pool-max", "max-connections"].filter(
  (n) => opt(n) === undefined,
);
if (missing.length) {
  console.error(
    `Missing required: ${missing.map((m) => "--" + m).join(", ")}. Ask the user for all missing numbers at once, or pass a value and label it with --assumed.`,
  );
  process.exit(2);
}

const src = (n) =>
  opt(n) === undefined
    ? "assumed (default)"
    : assumedFlag.has(n)
      ? "assumed"
      : found.has(n)
        ? "found in repo"
        : "provided";
const I = {
  instances: num("instances"),
  poolMax: num("pool-max"),
  otherApps: num("other-apps", 0),
  maxConn: num("max-connections"),
  reserved: num("reserved", 10),
  cores: opt("db-cores") === undefined ? null : num("db-cores"),
  pairs: num("db-user-pairs", 1),
  peakWrites:
    opt("peak-concurrent-writes") === undefined
      ? null
      : num("peak-concurrent-writes"),
  windowS: num("window-s", 1),
  avgTxMs: opt("avg-tx-ms") === undefined ? null : num("avg-tx-ms"),
};
for (const [k, v] of Object.entries(I))
  if (v !== null && (!Number.isFinite(v) || v < 0)) {
    console.error(`Invalid value for ${k}`);
    process.exit(2);
  }

const budget = I.maxConn - I.reserved;
const direct = I.instances * I.poolMax + I.otherApps;
const headroom = budget - direct;

// PgBouncer sizing: pool follows DB parallelism, not client count.
const parallelism = I.cores ? I.cores * 4 : 20; // ~4 active backends per core is a ceiling for OLTP; 20 if cores unknown
const available = Math.max(0, budget - I.otherApps);
const perPairCap = Math.floor((available * 0.7) / I.pairs); // keep 30% slack below the budget
const defaultPool = Math.max(5, Math.min(parallelism, perPairCap));
const reservePool = Math.max(2, Math.ceil(defaultPool * 0.2));
const minPool = Math.max(2, Math.ceil(defaultPool * 0.25));
const maxClient =
  Math.ceil(Math.max(200, I.instances * I.poolMax * 4) / 100) * 100;
const totalServer = (defaultPool + reservePool) * I.pairs;
const appPoolMax = Math.min(
  I.poolMax,
  Math.max(2, Math.ceil((2 * defaultPool) / I.instances)),
);

const R = {
  inputs: Object.fromEntries(
    Object.entries({
      instances: [I.instances, src("instances")],
      "pool-max": [I.poolMax, src("pool-max")],
      "other-apps": [I.otherApps, src("other-apps")],
      "max-connections": [I.maxConn, src("max-connections")],
      reserved: [I.reserved, src("reserved")],
      "db-cores": [
        I.cores,
        I.cores === null ? "unknown (assumed 20 parallel)" : src("db-cores"),
      ],
      "db-user-pairs": [I.pairs, src("db-user-pairs")],
      "peak-concurrent-writes": [
        I.peakWrites,
        I.peakWrites === null ? "not given" : src("peak-concurrent-writes"),
      ],
      "window-s": [I.windowS, src("window-s")],
      "avg-tx-ms": [
        I.avgTxMs,
        I.avgTxMs === null ? "not given" : src("avg-tx-ms"),
      ],
    }).map(([k, [v, s]]) => [k, { value: v, source: s }]),
  ),
  current: {
    budget,
    worstCaseDirectDemand: direct,
    headroom,
    status: headroom >= 0 ? "within budget" : "OVERSHOOT",
  },
  recommended: {
    default_pool_size: defaultPool,
    reserve_pool_size: reservePool,
    min_pool_size: minPool,
    max_client_conn: maxClient,
    totalServerConnections: totalServer,
    appPoolMaxPerProcess: appPoolMax,
  },
  checks: {
    serverConnectionsWithinBudget: totalServer + I.otherApps <= budget,
  },
  littles: null,
};

if (I.peakWrites !== null && I.avgTxMs !== null) {
  const rate = I.peakWrites / I.windowS; // arrivals per second
  const needed = rate * (I.avgTxMs / 1000); // Little's law: L = lambda * W
  const burstWorkSeconds = (I.peakWrites * I.avgTxMs) / 1000;
  const drain = burstWorkSeconds / defaultPool;
  R.littles = {
    arrivalRatePerS: rate,
    requiredConcurrentServerConnections: Math.ceil(needed),
    poolSize: defaultPool,
    poolSufficientForSteadyPeak: needed <= defaultPool,
    burstDrainSecondsAtPoolSize: Number(drain.toFixed(2)),
    approxMeanQueueWaitSeconds: Number(
      Math.max(0, drain / 2 - I.windowS / 2).toFixed(2),
    ),
    approxWorstQueueWaitSeconds: Number(
      Math.max(0, drain - I.windowS).toFixed(2),
    ),
  };
}

if (argv.includes("--json")) {
  console.log(JSON.stringify(R, null, 2));
  process.exit(0);
}

const L = [];
L.push("INPUTS");
for (const [k, v] of Object.entries(R.inputs))
  L.push(`  ${k.padEnd(24)} ${String(v.value).padEnd(8)} [${v.source}]`);
L.push("\nCURRENT WORST-CASE DIRECT DEMAND");
L.push(
  `  demand  = instances x pool-max + other-apps = ${I.instances} x ${I.poolMax} + ${I.otherApps} = ${direct}`,
);
L.push(
  `  budget  = max_connections - reserved       = ${I.maxConn} - ${I.reserved} = ${budget}`,
);
L.push(
  `  result  = ${headroom >= 0 ? `headroom of ${headroom}` : `OVERSHOOT by ${-headroom}`} -> ${R.current.status}`,
);
L.push(
  "\nRECOMMENDED PGBOUNCER SIZING (per database/user pair; pairs=" +
    I.pairs +
    ")",
);
L.push(
  `  default_pool_size = max(5, min(${parallelism} [${I.cores ? `${I.cores} cores x 4` : "assumed DB parallelism"}], floor(0.7 x (budget - other-apps) / pairs = ${perPairCap}))) = ${defaultPool}`,
);
L.push(`  reserve_pool_size = max(2, ceil(0.2 x default))  = ${reservePool}`);
L.push(`  min_pool_size     = max(2, ceil(0.25 x default)) = ${minPool}`);
L.push(
  `  max_client_conn   = max(200, instances x pool-max x 4), rounded up to 100 = ${maxClient}`,
);
L.push(
  `  total server connections = (default + reserve) x pairs = ${totalServer}; + other apps ${I.otherApps} = ${totalServer + I.otherApps} vs budget ${budget} -> ${R.checks.serverConnectionsWithinBudget ? "OK" : "TOO HIGH, lower default_pool_size"}`,
);
L.push(
  `  app-side pool max per process behind PgBouncer = min(${I.poolMax}, max(2, ceil(2 x default / instances))) = ${appPoolMax}`,
);
if (R.littles) {
  const t = R.littles;
  L.push("\nLITTLE'S LAW (concurrency = arrival rate x time in system)");
  L.push(
    `  arrival rate = ${I.peakWrites} writes / ${I.windowS}s = ${t.arrivalRatePerS}/s; avg tx = ${I.avgTxMs} ms`,
  );
  L.push(
    `  required concurrent server connections = ${t.arrivalRatePerS} x ${I.avgTxMs / 1000}s = ${t.requiredConcurrentServerConnections}`,
  );
  L.push(
    `  pool size ${defaultPool} -> ${t.poolSufficientForSteadyPeak ? "sufficient for the steady peak" : "SMALLER than required; requests queue in PgBouncer"}`,
  );
  L.push(
    `  burst drain time at pool size = ${t.burstDrainSecondsAtPoolSize}s; approx mean queue wait ${t.approxMeanQueueWaitSeconds}s, worst ${t.approxWorstQueueWaitSeconds}s (set query_wait_timeout above the worst case or buffer the writes)`,
  );
} else {
  L.push(
    "\nLITTLE'S LAW: skipped (pass --peak-concurrent-writes and --avg-tx-ms)",
  );
}
L.push("\nASSUMPTIONS");
L.push(
  "  - Every app process can open its full pool-max at once (worst case).",
);
L.push(
  "  - ~4 active backends per DB core is a ceiling for OLTP; 20 when cores are unknown. Tune after measuring.",
);
L.push(
  "  - peak-concurrent-writes = writes arriving inside --window-s seconds; avg-tx-ms is the DB time per write transaction.",
);
L.push(
  "  - Queue-wait figures assume a fixed pool and uniform transactions; treat as order-of-magnitude. Nothing here contacts a database.",
);
console.log(L.join("\n"));
