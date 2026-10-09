// Shared helpers for the saved k6 scenarios. Run through .claude/skills/load-capacity-test/scripts/run-load.sh (local target only).
import http from "k6/http";
import { check, fail } from "k6";

const MODEL = JSON.parse(open(__ENV.MODEL_FILE));
const ACCOUNTS = JSON.parse(open(__ENV.ACCOUNTS_FILE)).accounts;
const BASE = (__ENV.BASE_URL || "").replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE)) {
  fail("BASE_URL must be a loopback address; refusing to run.");
}
const TH = Object.assign(
  { read_p95_ms: 800, write_p95_ms: 1500, error_rate: 0.01 },
  MODEL.thresholds || {},
);
const MIX = MODEL.endpoint_mix;
const TOTAL_WEIGHT = MIX.reduce((a, e) => a + e.weight, 0);
const SY = "SY 26-27";

function stageRate(r) {
  return Math.max(1, Math.round(r * 10));
} // arrival rate per 10s (supports fractions)

export function buildOptions(name, opts = {}) {
  const sc = MODEL.scenarios[name];
  const vus = (rate) => Math.max(10, Math.ceil(rate * 2));
  let scenario;
  if (sc.executor === "constant-arrival-rate") {
    scenario = {
      executor: "constant-arrival-rate",
      rate: stageRate(sc.rate_per_s),
      timeUnit: "10s",
      duration: sc.duration,
      preAllocatedVUs: vus(sc.rate_per_s),
      maxVUs: vus(sc.rate_per_s) * 5,
    };
  } else {
    let stages;
    let peakRate;
    if (name === "spike") {
      const b = stageRate(sc.start_rate_per_s),
        s = stageRate(sc.spike_rate_per_s);
      stages = [
        { duration: "60s", target: b },
        { duration: "10s", target: s },
        { duration: sc.spike_duration, target: s },
        { duration: "10s", target: b },
        { duration: "60s", target: b },
      ];
      peakRate = sc.spike_rate_per_s;
    } else {
      stages = sc.stages.flatMap((st) => [
        { duration: "10s", target: stageRate(st.rate_per_s) },
        { duration: st.duration, target: stageRate(st.rate_per_s) },
      ]);
      peakRate = sc.stages[sc.stages.length - 1].rate_per_s;
    }
    scenario = {
      executor: "ramping-arrival-rate",
      startRate: stageRate(
        sc.start_rate_per_s || sc.stages?.[0]?.rate_per_s || 1,
      ),
      timeUnit: "10s",
      stages,
      preAllocatedVUs: vus(peakRate),
      maxVUs: vus(peakRate) * 5,
    };
  }
  const thresholds = {
    http_req_failed: [
      { threshold: "rate<0.5", abortOnFail: true, delayAbortEval: "30s" }, // results would measure breakage, not capacity
      opts.abortOnBreach
        ? {
            threshold: `rate<${TH.error_rate}`,
            abortOnFail: true,
            delayAbortEval: "30s",
          }
        : `rate<${TH.error_rate}`,
    ],
    dropped_iterations: ["count==0"], // generator saturation check: any dropped iteration invalidates the run
  };
  for (const e of MIX) {
    const limit = e.kind === "write" ? TH.write_p95_ms : TH.read_p95_ms;
    thresholds[`http_req_duration{route:${e.name}}`] = [
      opts.abortOnBreach
        ? {
            threshold: `p(95)<${limit}`,
            abortOnFail: true,
            delayAbortEval: "60s",
          }
        : `p(95)<${limit}`,
    ];
  }
  return {
    scenarios: { [name]: scenario },
    thresholds,
    summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
    noConnectionReuse: false,
  };
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// setup(): verify the synthetic account tokens once and share them with every VU.
export function setup() {
  const good = [];
  for (const a of ACCOUNTS) {
    const r = http.get(`${BASE}/api/school/draft?schoolId=${a.school_id}`, {
      headers: headers(a.token),
      tags: { route: "setup" },
    });
    if (r.status === 200) good.push(a);
  }
  if (!good.some((a) => a.is_largest))
    fail(
      "setup: the largest tenant's synthetic account was rejected; check seed-large.js and LOAD_JWT_SECRET",
    );
  return { accounts: good };
}

function pickEndpoint() {
  let x = Math.random() * TOTAL_WEIGHT;
  for (const e of MIX) {
    x -= e.weight;
    if (x <= 0) return e;
  }
  return MIX[MIX.length - 1];
}

// 70% of traffic goes to the largest tenant (the realistic worst case), the rest to small ones.
export function run(data) {
  const accts = data.accounts;
  const largest = accts.filter((a) => a.is_largest);
  const small = accts.filter((a) => !a.is_largest);
  const a =
    Math.random() < 0.7 || !small.length
      ? largest[0]
      : small[Math.floor(Math.random() * small.length)];
  const e = pickEndpoint();
  const pid =
    a.personnel_ids[Math.floor(Math.random() * a.personnel_ids.length)];
  const path = e.path
    .replace(/\{schoolId\}/g, a.school_id)
    .replace(/\{personnelId\}/g, pid)
    .replace(/:id/g, pid);
  const params = { headers: headers(a.token), tags: { route: e.name } };
  let res;
  if (e.method === "GET") res = http.get(`${BASE}${path}`, params);
  else {
    // save-by-id contract: never sends a deletion list and an empty personnel array keeps existing records
    const body = JSON.stringify({
      schoolYear: SY,
      payload: {
        schoolInfo: { schoolId: a.school_id },
        personnel: [],
        classSections: [],
        loadTest: { at: Date.now() },
      },
    });
    res = http.request(e.method, `${BASE}${path}`, body, params);
  }
  check(res, { "status below 400": (r) => r.status < 400 });
}
