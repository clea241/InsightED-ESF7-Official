# k6 patterns

The saved scripts live in `load-test/k6/` (`lib.js` plus `baseline|peak|spike|stress|soak.js`). Do not regenerate them; edit the model instead.

- `setup()` verifies the seeded synthetic accounts (tokens written by `load-test/seed-large.js`, signed with the load environment's own secret) and shares them with all VUs. It fails if the largest tenant's account is rejected.
- `constant-arrival-rate` for baseline, peak and soak; `ramping-arrival-rate` for spike and stress. Arrival-rate executors keep the offered load constant even when the app slows down, which is what exposes queueing.
- Endpoint weights come from `endpoint_mix` in the model (assumed, or from the access log). 70% of requests go to the largest tenant.
- Path templates: `{schoolId}`, `{personnelId}` and `:id` (from log routes) are filled per request.
- Save requests follow the app's save-by-id contract (`PUT /api/school/draft`, an empty `personnel` array keeps existing records, no deletion list) and never delete data.
- Thresholds from the model: default p95 < 800 ms for reads, < 1500 ms for writes, error rate < 1%. Per-route thresholds use the tag `route`. An `http_req_failed` rate above 50% for 30 s aborts the run. Stress aborts on a sustained p95 or error breach so the breaking point is the last passing stage.
- Generator saturation: `dropped_iterations` must be 0 (`count==0` threshold). Any dropped iteration, or k6 CPU above the configured limit, makes the run invalid.
- `summaryTrendStats` includes p(99). Requests are tagged by `route` for per-endpoint results.
- No real third-party calls; the script refuses a non-loopback `BASE_URL`.

## Minimal example

```js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    peak: {
      executor: "constant-arrival-rate",
      rate: 120,
      timeUnit: "10s",
      duration: "10m",
      preAllocatedVUs: 24,
      maxVUs: 120,
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.5", abortOnFail: true, delayAbortEval: "30s" }, "rate<0.01"],
    dropped_iterations: ["count==0"],
    "http_req_duration{route:school_draft_get}": ["p(95)<800"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

export default function () {
  const r = http.get(`${__ENV.BASE_URL}/api/school/draft?schoolId=900001`, {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
    tags: { route: "school_draft_get" },
  });
  check(r, { ok: (x) => x.status < 400 });
}
```
