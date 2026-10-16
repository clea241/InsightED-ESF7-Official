# Queue consumer: switch, schema check and polling fallback

The consumer is the part of `server/queue_worker.js` that turns a `pending` row in `esf7_submission_queue` into rows in the normalized tables. It was switched off in code in commit `8f0352c`; it is now controlled by one environment variable and is **off by default everywhere**.

## The switch

| Variable | Default | Effect |
|---|---|---|
| `QUEUE_CONSUMER_ENABLED` | `false` | `true` turns the consumer on (stream consumer, Postgres sweep, `processJobById`). Anything else leaves submissions `pending`. |
| `QUEUE_MAX_ATTEMPTS` | 5 | Attempts before a job stays `failed` (needs the retry columns, see below) |
| `RUN_STARTUP_SCHEMA_INIT` | on | `false`/`0`/`no`/`off` makes `server.js` skip its startup schema checks (use the migrations instead) |

The worker process logs one line at startup saying whether the consumer is enabled.

## Boot-time schema check (only when the consumer is on)

With `QUEUE_CONSUMER_ENABLED=true` the worker reads `information_schema` once at boot and logs a single warning if the database lacks columns it writes (`db/workerSchemaCheck.js`, column list in `services/workerSchema.js`). It never changes anything and never stops the process. Without the warning, a missing column makes every job fail at the step that writes it.

Before enabling the consumer on a database:

1. Run `docs/ops/worker-schema-check.sql` (read-only) against it. Rows with `status = MISSING` or `TABLE MISSING` are the problems.
2. Columns whose note says "added by migrations/add_worker_schema_columns.js" are not created by anything else in the repo. Take a backup of `esf7_personnel_employment` and `esf7_school_profile`, then run `node server/migrations/add_worker_schema_columns.js` (`--dry-run` first). It skips columns that already exist and records only the ones it created, so `--down` can never drop an existing column.
3. Columns whose note says "only created by manual script ..." come from older one-off scripts (`migrate_enhance_esf7_admin_task.js`, `migrate_add_key_stage_to_designations.js`, `migrate_term_support.js`, `migrations/expand_workload_rows_extras.js`). They are not part of `schema.sql` or the startup block. If the check shows them missing, decide with the owner which script to run; this migration does not do it for them.

The retry columns (`add_queue_retry_columns.js`) and `submission_id` (`add_queue_submission_id.js`) are separate optional migrations; the worker runs without them.

## Polling fallback (earlier readiness plan)

The plan said queued rows are still processed when Redis is down. That is true, and it sits behind the same switch:

- Standalone worker (`server/run_redis_worker.js`): `processNextJob()` runs every 20 seconds, and after each stream drain, whether or not Redis is reachable. While Redis is down the stream loop sleeps and the sweep keeps working.
- In-process worker (`START_LOCAL_WORKER=true`, not used in production): `startWorker()` polls every 2 seconds (10 seconds while Redis is up).
- Both return immediately when `QUEUE_CONSUMER_ENABLED` is not `true`.

Covered by `server/tests/integration/queue_consumer.integration.test.js` (a pending job reaches `completed` with no Redis involved).

## Startup reset of `processing` jobs

`server.js` used to put every `processing` job back to `pending` at each web start. With the consumer on, a web restart would do that to jobs the worker is running, so that reset is skipped when `QUEUE_CONSUMER_ENABLED=true`; `recoverStaleJobs` returns jobs stuck for over a minute instead.
