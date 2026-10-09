# Capacity model

How `scripts/estimate-peak.js` turns numbers into load scenarios, and how to ask for them.

## Questions to ask the user (at most three at a time)

1. How many schools use the app, and how many users per school and role (school head, encoders, others)?
2. What share of them is active at the busiest hour? What drives the busiest day (a submission deadline, report-card period, enrollment)?
3. How many actions does an active user perform per minute, how many HTTP requests does one action cause, and do many users press **save** at the same moment (save bursts)?
4. Optionally: the production VM's specs (cores, RAM) and PM2 instance count, so local results can be interpreted cautiously.
5. Optionally: a locally exported nginx access log (combined format; `$request_time` as a final field is a bonus).

Label every number in `load-test/load-model.json` as `stated` (the user gave it), `assumed` (a placeholder) or `from-log`.

## Formulas

- `total_users = total_schools x users_per_school`
- `concurrent_active = total_users x peak_active_fraction`
- `typical_rps = concurrent_active x actions_per_minute x requests_per_action / 60`
- `peak_rps = typical_rps x burst_multiplier x safety_factor` (burst = the busiest-day window; safety factor default 2)
- With an access log: `peak_rps = max(model, observed_peak_rps x safety_factor)`.
- Little's law cross-check: `in-flight requests = arrival_rate x average_latency`. If this is far above the pool or the instance count, expect queueing.
- Scenarios: baseline = typical_rps; peak = peak_rps (constant arrival rate); spike = 4x peak for 60 s from baseline; stress = 1x to 6x peak in 2-minute stages; soak = peak for `soak_hours` (only with `--soak`).
- `max_sustainable_rate_per_s` (history.json) = the highest target rate of a valid, passing peak or stress run.

## Why a safety factor

Estimates are guesses and real traffic is bursty. The factor keeps the "peak" test above the estimate so a modest error does not hide a bottleneck. It is multiplied, not added, and is always shown in the report.

## Reading an access log without personal data

The estimator reads one line at a time, keeps only per-second counters, normalized route patterns (ids replaced by `:id`, query strings dropped), method counts and request times. IP addresses, user ids and tokens are discarded in memory and never printed or stored. Never paste raw log lines into the report.

## Turning local results into a cautious statement

Compare the local machine with the production VM specs the user supplies. The laptop also runs k6, PostgreSQL and the sampler, so absolute numbers are not comparable. Say things like "the first bottleneck locally was X at about Y req/s; whether production has similar headroom depends on its hardware and must be confirmed on staging". Never say "production can handle N users". Capacity on production can only be confirmed by a staging test, which this skill does not run.
