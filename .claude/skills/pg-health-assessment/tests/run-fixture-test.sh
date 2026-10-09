#!/usr/bin/env bash
# Fixture test for pg-health-assessment. Refuses to run unless the target is a local pgha_test_* database.
#   PGHA_TEST_URL=postgresql://user:pass@localhost:5432/pgha_test_x bash run-fixture-test.sh   (use an existing disposable DB)
#   bash run-fixture-test.sh                                                                     (boots a throw-away embedded PostgreSQL from the repo's node_modules)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$SKILL/../../.." && pwd)"

if [ -z "${PGHA_TEST_URL:-}" ]; then
  echo "[test] no PGHA_TEST_URL: booting a disposable embedded PostgreSQL"
  cd "$REPO"
  export PGHA_SELF="$HERE/run-fixture-test.sh"
  exec node --input-type=module -e '
    import EmbeddedPostgres from "embedded-postgres";
    import { mkdtempSync, rmSync, appendFileSync, writeFileSync, copyFileSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import net from "node:net";
    import { spawn } from "node:child_process";
    const dir = mkdtempSync(path.join(tmpdir(), "pgha-"));
    const log = path.join(dir, "server.log");
    writeFileSync(log, "");
    const port = await new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
    const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, "data"), user: "postgres", password: "postgres", port, persistent: false,
      postgresFlags: ["-c", "log_statement=all", "-c", "log_line_prefix=[%a] "], onLog: (m) => appendFileSync(log, String(m) + "\n"), onError: (m) => appendFileSync(log, String(m) + "\n") });
    let code = 1;
    try {
      await pg.initialise(); await pg.start();
      const name = "pgha_test_" + Math.random().toString(36).slice(2, 8);
      await pg.createDatabase(name);
      code = await new Promise((res) => spawn("bash", [process.env.PGHA_SELF], { stdio: "inherit", env: { ...process.env, PGHA_TEST_URL: `postgresql://postgres:postgres@127.0.0.1:${port}/${name}`, PGHA_SERVER_LOG: log } }).on("exit", (c) => res(c ?? 1)));
    } finally { try { await pg.stop(); } catch {} try { copyFileSync(log, path.join(process.cwd(), "pg-health-reports", ".work", "server.log")); } catch {} rmSync(dir, { recursive: true, force: true }); }
    process.exit(code);
  '
fi

# ---- guard: local host and pgha_test_ database only
HOST="$(node -e 'const u=new URL(process.env.PGHA_TEST_URL);console.log(u.hostname)')"
DB="$(node -e 'const u=new URL(process.env.PGHA_TEST_URL);console.log(decodeURIComponent(u.pathname.slice(1)))')"
case "$HOST" in localhost|127.0.0.1|::1|"[::1]") ;; *) echo "REFUSED: host '$HOST' is not local"; exit 3;; esac
case "$DB" in pgha_test_*) ;; *) echo "REFUSED: database '$DB' does not start with pgha_test_"; exit 3;; esac
echo "[test] target host=$HOST database=$DB"

cd "$REPO"
PROJ="$REPO/pg-health-reports/.work/fixture-project"
rm -rf "$PROJ"; mkdir -p "$PROJ"
trap 'rm -rf "$PROJ"' EXIT

# ---- load fixture (setup is the only place that writes, and only to the disposable DB)
node -e '
  const { Client } = require("pg"); const fs = require("fs");
  (async () => { const c = new Client({ connectionString: process.env.PGHA_TEST_URL }); await c.connect();
    await c.query(fs.readFileSync(process.argv[1], "utf8")); await c.end(); })().catch((e) => { console.error("fixture load failed:", e.message); process.exit(1); });
' "$HERE/fixtures/bad-schema.sql"

# ---- throw-away Drizzle project that matches the fixture (plus one deliberate drift: ghost_table)
cat > "$PROJ/package.json" <<'EOF'
{ "name": "pgha-fixture", "private": true, "dependencies": { "drizzle-orm": "*", "pg": "*" } }
EOF
cat > "$PROJ/drizzle.config.ts" <<'EOF'
export default { dialect: 'postgresql', schema: './schema.ts', dbCredentials: { url: process.env.PGHA_TEST_URL! } };
EOF
cat > "$PROJ/schema.ts" <<'EOF'
import { pgTable, bigint, varchar, text, uuid, real, json, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
export const customers = pgTable('customers', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const orders = pgTable('orders', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  customerId: bigint('customer_id', { mode: 'number' }).notNull().references(() => customers.id),
  status: text('status'),
  price: real('price').notNull(),
  placedAt: timestamp('placed_at', { withTimezone: true }).defaultNow(),
}, (table) => [index('idx_orders_status_unused').on(table.status)]);
export const auditLog = pgTable('audit_log', {
  event: text('event'),
  at: timestamp('at', { withTimezone: true }).defaultNow(),
});
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: bigint('customer_id', { mode: 'number' }),
  data: text('data'),
});
export const legacyEvents = pgTable('legacy_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  meta: json('meta'),
});
export const documents = pgTable('documents', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  body: jsonb('body'),
});
export const ghost = pgTable('ghost_table', { id: bigint('id', { mode: 'number' }).primaryKey() });
EOF

# ---- optional second input: the same tables described in Prisma (PGHA_ORM=prisma)
if [ "${PGHA_ORM:-drizzle}" = "prisma" ]; then
  rm -f "$PROJ/drizzle.config.ts" "$PROJ/schema.ts"
  echo '{ "name": "pgha-fixture", "private": true, "dependencies": { "@prisma/client": "*", "pg": "*" } }' > "$PROJ/package.json"
  mkdir -p "$PROJ/prisma"
  cat > "$PROJ/prisma/schema.prisma" <<'EOF'
datasource db {
  provider = "postgresql"
  url      = env("PGHA_TEST_URL")
}
model customers {
  id         BigInt   @id @default(autoincrement())
  email      String   @db.VarChar(255)
  created_at DateTime @default(now()) @db.Timestamp(6)
  orders     orders[]
}
model orders {
  id          BigInt    @id @default(autoincrement())
  customer_id BigInt
  status      String?
  price       Float     @db.Real
  placed_at   DateTime? @default(now()) @db.Timestamptz(6)
  customer    customers @relation(fields: [customer_id], references: [id])
  @@index([status], map: "idx_orders_status_unused")
}
model audit_log {
  event String?
  at    DateTime? @db.Timestamptz(6)
  @@ignore
}
model sessions {
  id          String  @id @default(uuid()) @db.Uuid
  customer_id BigInt?
  data        String?
}
model legacy_events {
  id   BigInt @id @default(autoincrement())
  meta Json?  @db.Json
}
model documents {
  id   BigInt @id @default(autoincrement())
  body Json?  @db.JsonB
}
EOF
fi

S="$SKILL/scripts"
OPTS=(--root "$PROJ")
node "$S/detect-orm.mjs" "${OPTS[@]}" > "$PROJ/detect.json"
node "$S/parse-orm-schema.mjs" "${OPTS[@]}" --detect "$PROJ/detect.json"
node "$S/collect-live.mjs" "${OPTS[@]}" --url-env PGHA_TEST_URL --ram-gb 16 --storage ssd
node "$S/analyze-json.mjs" "${OPTS[@]}" --url-env PGHA_TEST_URL
node "$S/assess.mjs" "${OPTS[@]}"
node "$S/render-report.mjs" "${OPTS[@]}" --date 2000-01-01

# ---- compare with expected-findings.json
WORK="$PROJ/pg-health-reports/.work"
node - "$WORK/findings.json" "$WORK/json.json" "$HERE/expected-findings.json" "$PROJ/pg-health-reports/pg-health-2000-01-01.md" <<'EOF'
const fs = require('fs');
const [f, j, e, md] = process.argv.slice(2).map((p, i) => (i < 3 ? JSON.parse(fs.readFileSync(p, 'utf8')) : fs.readFileSync(p, 'utf8')));
const got = new Set(f.findings.map((x) => x.id));
const missing = e.required.filter((id) => !got.has(id));
const unexpected = [...got].filter((id) => !e.required.includes(id) && !e.allowed_extra.includes(id) && id !== 'CFG-14');
let bad = 0;
const cls = Object.fromEntries(j.columns.map((c) => [`${c.table}.${c.column}`, c.classification]));
for (const [k, v] of Object.entries(e.json_classification)) if (cls[k] !== v) { console.log(`JSON classification mismatch: ${k} expected ${v}, got ${cls[k]}`); bad++; }
console.log('score:', f.score, '| findings:', [...got].sort().join(' '));
console.log('missing:', missing.join(', ') || 'none');
console.log('unexpected:', unexpected.join(', ') || 'none');
if (missing.length || unexpected.length) bad++;
if (/postgres(ql)?:\/\/|:postgres@/i.test(md)) { console.log('report contains a connection string/password'); bad++; }
if (/fake-value-|fake-label-|"deep"/.test(md + JSON.stringify(f) + JSON.stringify(j))) { console.log('report contains JSON values'); bad++; }
if (!/How to improve \(prompt\)/.test(md)) { console.log('improve prompt missing'); bad++; }
process.exit(bad ? 1 : 0);
EOF
echo "[test] findings comparison passed"

# ---- statement log check (only when the embedded server log is available)
if [ -n "${PGHA_SERVER_LOG:-}" ] && [ -f "$PGHA_SERVER_LOG" ]; then
  sleep 2
  BAD="$(grep '^\[pg-health-assessment\]' "$PGHA_SERVER_LOG" | grep -o 'statement: .*' | sed 's/^statement: //' | grep -viE '^(select|show|with|begin read only|set local statement_timeout|set local lock_timeout|rollback|commit)' || true)"
  N="$(grep -c '^\[pg-health-assessment\]' "$PGHA_SERVER_LOG" || true)"
  echo "[test] statements logged for the skill: $N"
  if [ "$N" -eq 0 ]; then echo "FAIL: no statements captured from the skill (log check inconclusive)"; exit 1; fi
  if [ -n "$BAD" ]; then echo "FAIL: non-read-only statements seen:"; echo "$BAD"; exit 1; fi
  echo "[test] statement log shows only SELECT/SHOW/WITH/BEGIN READ ONLY/SET LOCAL/ROLLBACK"
fi
echo "[test] PASS"
