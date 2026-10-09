#!/usr/bin/env node
// Strictly read-only live collector. Every statement runs inside BEGIN READ ONLY with statement/lock timeouts.
// Usage: node collect-live.mjs [--root <path>] [--url-env NAME] [--out <file>] [--ram-gb N] [--storage ssd|hdd] [--yes]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { detect } from './detect-orm.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SYS = "('pg_catalog','information_schema')";

function readDotenv(file) {
  const out = {};
  let t = '';
  try { t = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const l of t.split(/\r?\n/)) { const m = l.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/); if (m && !l.trim().startsWith('#')) out[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
  return out;
}

// Resolves the connection string from env / .env files named by the ORM config. Returns { url, from } without logging secrets.
export function resolveConnection(root, det, urlEnv) {
  const env = { ...readDotenv(path.join(root, 'server', '.env')), ...readDotenv(path.join(root, '.env')), ...process.env };
  const cs = det.connectionSource || {};
  const name = urlEnv || (cs.kind === 'env-url' ? cs.var : null);
  if (name && env[name]) return { url: env[name], from: 'env:' + name };
  if (!urlEnv && cs.kind === 'env-parts') {
    const v = { host: 'DB_HOST', port: 'DB_PORT', user: 'DB_USER', password: 'DB_PASSWORD', database: 'DB_NAME', ...cs.vars };
    const host = env[v.host] || 'localhost';
    const u = new URL('postgresql://x');
    u.hostname = host; u.port = env[v.port] || '5432'; u.username = env[v.user] || 'postgres'; u.password = env[v.password] || ''; u.pathname = '/' + (env[v.database] || 'postgres');
    return { url: u.toString(), from: 'env-parts:' + Object.values(v).join(',') };
  }
  if (!urlEnv && env.DATABASE_URL) return { url: env.DATABASE_URL, from: 'env:DATABASE_URL' };
  return null;
}

function loadDriver(root, det) {
  const dirs = [det.driverDir && path.join(root, det.driverDir), root, path.join(root, 'server'), path.join(root, 'backend')].filter(Boolean);
  for (const d of dirs) {
    const req = createRequire(path.join(d, 'package.json'));
    for (const name of ['pg', 'postgres']) { try { return { name, mod: req(name) }; } catch { /* next */ } }
  }
  return null;
}

export async function openReadOnly(root, det, url) {
  const drv = loadDriver(root, det);
  if (!drv) throw new Error('No installed postgres driver (pg or postgres) found; nothing was installed.');
  let q, close;
  if (drv.name === 'pg') {
    const Pg = drv.mod.Client || drv.mod.default.Client;
    const client = new Pg({ connectionString: url, application_name: 'pg-health-assessment' });
    await client.connect();
    q = async (text) => (await client.query(text)).rows;
    close = () => client.end();
  } else {
    const sql = (drv.mod.default || drv.mod)(url, { max: 1, onnotice() {}, connection: { application_name: 'pg-health-assessment' } });
    q = async (text) => [...(await sql.unsafe(text))];
    close = () => sql.end();
  }
  const begin = async () => {
    await q('BEGIN READ ONLY');
    await q("SET LOCAL statement_timeout = '5s'");
    await q("SET LOCAL lock_timeout = '1s'");
    const r = await q('SHOW transaction_read_only');
    if (!r[0] || r[0].transaction_read_only !== 'on') throw new Error('Transaction could not be made read-only; aborting.');
  };
  await begin();
  const errors = [];
  const run = async (name, text) => {
    try { return await q(text); } catch (e) {
      errors.push({ query: name, message: String(e.message).slice(0, 200) });
      try { await q('ROLLBACK'); } catch { /* ignore */ }
      await begin();
      return null;
    }
  };
  const end = async () => { try { await q('ROLLBACK'); } catch { /* ignore */ } await close(); };
  return { run, end, errors, driver: drv.name };
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

export async function collect(root, det, url, flags) {
  const db = await openReadOnly(root, det, url);
  const { run } = db;
  const live = { meta: { collectedAt: new Date().toISOString(), driver: db.driver }, errors: db.errors };
  try {
    const u = new URL(url);
    live.meta.host = u.hostname; live.meta.port = u.port || '5432'; live.meta.database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch { live.meta.host = 'unknown'; }

  const v = await run('version', 'SHOW server_version_num');
  live.meta.serverVersionNum = v ? Number(v[0].server_version_num) : null;
  const sv = await run('server_version', 'SHOW server_version');
  live.meta.serverVersion = sv ? sv[0].server_version : null;

  live.settings = {};
  for (const r of (await run('settings', 'SELECT name, setting, unit, source, boot_val FROM pg_settings')) || []) live.settings[r.name] = { setting: r.setting, unit: r.unit, source: r.source, boot_val: r.boot_val };

  const dbs = await run('pg_stat_database', 'SELECT blks_hit::float8 blks_hit, blks_read::float8 blks_read, temp_files::float8 temp_files, temp_bytes::float8 temp_bytes, deadlocks::float8 deadlocks, xact_commit::float8 xact_commit, xact_rollback::float8 xact_rollback, numbackends::int numbackends, stats_reset FROM pg_stat_database WHERE datname = current_database()');
  live.database = dbs && dbs[0] ? dbs[0] : null;
  const age = await run('xid_age', 'SELECT max(age(datfrozenxid))::float8 AS max_age FROM pg_database');
  live.xidAgeMax = age && age[0] ? num(age[0].max_age) : null;

  const tbls = (await run('tables', `SELECT n.nspname AS schema, c.relname AS name, c.relkind, pg_total_relation_size(c.oid)::float8 AS total_bytes, pg_relation_size(c.oid)::float8 AS rel_bytes,
      CASE WHEN c.reltoastrelid <> 0 THEN pg_total_relation_size(c.reltoastrelid) ELSE 0 END::float8 AS toast_bytes, c.reloptions::text[] AS reloptions,
      s.seq_scan::float8 seq_scan, s.idx_scan::float8 idx_scan, s.n_live_tup::float8 n_live, s.n_dead_tup::float8 n_dead, s.n_tup_upd::float8 n_upd, s.n_tup_hot_upd::float8 n_hot_upd,
      s.last_autovacuum, s.last_autoanalyze
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ${SYS} AND n.nspname NOT LIKE 'pg\\_toast%'`)) || [];
  const cols = (await run('columns', `SELECT n.nspname AS schema, c.relname AS tbl, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
      pg_get_expr(d.adbin, d.adrelid) AS def, a.attidentity::text AS identity, a.attgenerated::text AS generated
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p') AND n.nspname NOT IN ${SYS} ORDER BY n.nspname, c.relname, a.attnum`)) || [];
  for (const t of tbls) {
    t.columns = cols.filter((c) => c.schema === t.schema && c.tbl === t.name).map(({ name, type, notnull, def, identity, generated }) => ({ name, type, notNull: notnull, default: def, identity: identity || null, generated: generated || null }));
  }
  live.tables = tbls;

  live.constraints = (await run('constraints', `SELECT n.nspname AS schema, c.relname AS tbl, k.conname, k.contype::text AS contype,
      (SELECT array_agg(a.attname::text ORDER BY u.ord) FROM unnest(k.conkey) WITH ORDINALITY u(attnum, ord) JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.attnum) AS cols,
      rn.nspname AS ref_schema, rc.relname AS ref_table,
      (SELECT array_agg(a.attname::text ORDER BY u.ord) FROM unnest(k.confkey) WITH ORDINALITY u(attnum, ord) JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.attnum) AS ref_cols
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_class rc ON rc.oid = k.confrelid LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace
    WHERE k.contype IN ('p','f','u') AND n.nspname NOT IN ${SYS}`)) || [];

  live.indexes = ((await run('indexes', `SELECT n.nspname AS schema, t.relname AS tbl, i.relname AS idx, am.amname AS method, x.indisvalid AS valid, x.indisunique AS "unique", x.indisprimary AS pk,
      (x.indpred IS NOT NULL) AS partial, (x.indexprs IS NOT NULL) AS expr, pg_get_indexdef(x.indexrelid) AS def, pg_relation_size(x.indexrelid)::float8 AS bytes,
      COALESCE(s.idx_scan, 0)::float8 AS idx_scan, EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = x.indexrelid) AS backs_constraint, x.indnkeyatts::int AS nkeyatts,
      (SELECT array_agg(a.attname::text ORDER BY u.ord) FROM unnest(x.indkey::int2[]) WITH ORDINALITY u(attnum, ord) JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = u.attnum WHERE u.attnum > 0) AS cols
    FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_am am ON am.oid = i.relam
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = x.indexrelid WHERE n.nspname NOT IN ${SYS} AND n.nspname NOT LIKE 'pg\\_toast%'`)) || []).map((r) => ({ ...r, cols: (r.cols || []).slice(0, r.nkeyatts) }));

  live.activity = {
    byState: (await run('activity_state', `SELECT COALESCE(state,'unknown') AS state, count(*)::int AS n, max(EXTRACT(epoch FROM now() - xact_start))::float8 AS max_xact_age_s, max(EXTRACT(epoch FROM now() - state_change))::float8 AS max_state_age_s
      FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid() GROUP BY 1`)) || [],
    waitEvents: (await run('activity_wait', `SELECT COALESCE(wait_event_type,'none') AS wait_event_type, count(*)::int AS n FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid() GROUP BY 1`)) || [],
  };
  live.replicationSlots = await run('replication_slots', `SELECT slot_name, active, CASE WHEN restart_lsn IS NULL OR pg_is_in_recovery() THEN NULL ELSE pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)::float8 END AS retained_bytes FROM pg_replication_slots`);
  live.extensions = ((await run('extensions', 'SELECT extname FROM pg_extension')) || []).map((r) => r.extname);
  const role = await run('role', `SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, has_schema_privilege('public','CREATE') AS create_public,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ${SYS} AND has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE'))::int AS write_tables
    FROM pg_roles r WHERE r.rolname = current_user`);
  live.role = role && role[0] ? role[0] : null;
  live.checkpointer = (await run('checkpointer', live.meta.serverVersionNum >= 170000
    ? 'SELECT num_timed::float8 AS timed, num_requested::float8 AS requested FROM pg_stat_checkpointer'
    : 'SELECT checkpoints_timed::float8 AS timed, checkpoints_req::float8 AS requested FROM pg_stat_bgwriter') || [])?.[0] || null;
  live.extendedStats = (await run('extended_stats', `SELECT n.nspname AS schema, c.relname AS tbl FROM pg_statistic_ext e JOIN pg_class c ON c.oid = e.stxrelid JOIN pg_namespace n ON n.oid = c.relnamespace`)) || [];
  live.columnStats = (await run('pg_stats', `SELECT schemaname AS schema, tablename AS tbl, attname AS name, n_distinct::float8 AS n_distinct, most_common_freqs[1]::float8 AS top_freq
    FROM pg_stats WHERE schemaname NOT IN ${SYS} AND attname ~* '(status|state|flag|active|deleted|type)$'`)) || [];
  live.statements = null;
  if (live.extensions.includes('pg_stat_statements')) {
    const st = await run('pg_stat_statements', `SELECT left(query, 2000) AS query, calls::float8 AS calls FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND query ~* '^\\s*(select|with|update|delete|insert)' AND (query LIKE '%->%' OR query LIKE '%@>%' OR query LIKE '%#>%' OR query LIKE '%?%') ORDER BY calls DESC LIMIT 500`);
    live.statements = st;
  }

  // host facts
  const local = ['localhost', '127.0.0.1', '::1'].includes(live.meta.host);
  const ramFlag = flags.ramGb ? Number(flags.ramGb) : null;
  let ram = { value: null, source: 'unverified' };
  if (ramFlag) ram = { value: ramFlag, source: 'flag' };
  else if (local) { try { const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemTotal:\s+(\d+) kB/); if (m) ram = { value: Math.round((Number(m[1]) / 1048576) * 10) / 10, source: '/proc/meminfo' }; } catch { /* not linux */ } }
  let storage = { value: null, source: 'unverified' };
  if (flags.storage === 'ssd' || flags.storage === 'hdd') storage = { value: flags.storage, source: 'flag' };
  else if (local) {
    try {
      const vals = fs.readdirSync('/sys/block').map((d) => { try { return fs.readFileSync(`/sys/block/${d}/queue/rotational`, 'utf8').trim(); } catch { return null; } }).filter((x) => x !== null);
      if (vals.length) storage = { value: vals.includes('1') ? 'hdd' : 'ssd', source: '/sys/block/*/queue/rotational' };
    } catch { /* not linux */ }
  }
  live.host = { ramGb: ram, storage };
  await db.end();
  return live;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(opt('root', process.cwd()));
  const det = detect();
  const conn = resolveConnection(root, det, opt('url-env', null));
  if (!conn) { process.stderr.write('No connection string found. Set the env var named in the ORM config, or pass --url-env NAME.\n'); process.exit(2); }
  const u = new URL(conn.url);
  process.stdout.write(`target: host=${u.hostname} database=${decodeURIComponent(u.pathname.slice(1))} (from ${conn.from}); read-only transaction\n`);
  try {
    const live = await collect(root, det, conn.url, { ramGb: opt('ram-gb', null), storage: opt('storage', null) });
    const out = path.resolve(root, opt('out', 'pg-health-reports/.work/live.json'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(live, null, 2) + '\n');
    process.stdout.write(`tables=${live.tables.length} indexes=${live.indexes.length} errors=${live.errors.length}\nwritten: ${path.relative(process.cwd(), out)}\n`);
  } catch (e) {
    process.stderr.write('collect-live failed: ' + String(e.message).replace(/postgres(ql)?:\/\/[^\s]*/gi, '<url>') + '\n');
    process.exit(1);
  }
}
