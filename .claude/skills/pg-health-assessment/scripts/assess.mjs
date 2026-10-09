#!/usr/bin/env node
// Applies reference/check-catalog.md to orm-schema.json + live.json + json.json; computes drift and the score. No database access.
// Usage: node assess.mjs [--root <path>] [--orm f] [--live f] [--json f] [--out f]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const WEIGHTS = { Configuration: 20, Schema: 25, Indexes: 20, JSON: 15, Health: 20 };
const PENALTY = { critical: 15, high: 8, medium: 4, low: 1, info: 0 };
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const MB = 1048576, GB = 1073741824;
const EXEC = {
  concurrently: 'online: CREATE/DROP INDEX CONCURRENTLY (cannot run inside a transaction block), no maintenance window',
  reload: 'online: config reload (SELECT pg_reload_conf()), no restart',
  restart: 'maintenance window: PostgreSQL restart required',
  rewrite: 'maintenance window: takes an ACCESS EXCLUSIVE lock / rewrites the table',
  app: 'online: application and data change, plan an expand/contract migration',
  ops: 'online: operational action, no schema change',
};
const list = (a, n = 12) => (a.length > n ? a.slice(0, n).join(', ') + `, ... (+${a.length - n} more)` : a.join(', '));

export function assess(orm, live, json) {
  const findings = [], evaluated = [], unverified = [];
  const add = (f) => findings.push({ needs_downtime: /maintenance window/.test(f.execution), object: null, ...f });
  const ok = (id) => evaluated.push(id);
  const unv = (id, category, reason) => unverified.push({ id, category, reason });

  const S = live.settings || {};
  const unitMul = { '8kB': 8192, kB: 1024, MB: MB, GB: GB, B: 1, ms: 1, s: 1000, min: 60000 };
  const num = (n) => (S[n] ? Number(S[n].setting) * (unitMul[S[n].unit] || 1) : null);
  const isDefault = (n) => S[n] && S[n].source === 'default';
  const ram = live.host && live.host.ramGb && live.host.ramGb.value ? live.host.ramGb.value * GB : null;
  const storage = live.host && live.host.storage ? live.host.storage.value : null;
  const dbs = live.database || {};
  const ver = live.meta.serverVersionNum;
  const tables = live.tables || [];
  const fq = (t) => (t.schema === 'public' ? t.name : `${t.schema}.${t.name}`);
  const poolerHints = (orm && orm.poolerHints) || [];
  const bigTable = (name) => { const t = tables.find((x) => fq(x) === name); return t && t.total_bytes > 100 * MB; };

  // ---------------- Configuration
  const C = 'Configuration';
  if (!ram) for (const id of ['CFG-01', 'CFG-02', 'CFG-03', 'CFG-05']) unv(id, C, 'RAM unknown: pass --ram-gb or run on the DB host');
  else {
    const sb = num('shared_buffers');
    if (isDefault('shared_buffers') && sb <= 128 * MB && ram >= 4 * GB) add({ id: 'CFG-01', category: C, severity: 'high', title: 'shared_buffers is still the 128MB default', evidence: `shared_buffers=${sb / MB}MB (default) on ${ram / GB} GB RAM`, fix: `ALTER SYSTEM SET shared_buffers = '${Math.round((ram * 0.25) / MB)}MB';  -- ~25% of RAM, then restart`, execution: EXEC.restart });
    else if (sb / ram < 0.15) add({ id: 'CFG-01', category: C, severity: 'medium', title: 'shared_buffers below 15% of RAM', evidence: `shared_buffers=${Math.round(sb / MB)}MB = ${Math.round((sb / ram) * 100)}% of ${ram / GB} GB`, fix: `ALTER SYSTEM SET shared_buffers = '${Math.round((ram * 0.25) / MB)}MB';`, execution: EXEC.restart });
    else if (sb / ram > 0.4) add({ id: 'CFG-01', category: C, severity: 'low', title: 'shared_buffers above 40% of RAM', evidence: `${Math.round((sb / ram) * 100)}% of RAM`, fix: `ALTER SYSTEM SET shared_buffers = '${Math.round((ram * 0.25) / MB)}MB';`, execution: EXEC.restart });
    else ok('CFG-01');
    const ecs = num('effective_cache_size');
    if (ecs / ram < 0.4) add({ id: 'CFG-02', category: C, severity: 'medium', title: 'effective_cache_size below 40% of RAM', evidence: `effective_cache_size=${Math.round(ecs / MB)}MB = ${Math.round((ecs / ram) * 100)}% of ${ram / GB} GB`, fix: `ALTER SYSTEM SET effective_cache_size = '${Math.round((ram * 0.65) / MB)}MB';`, execution: EXEC.reload }); else ok('CFG-02');
    const wm = num('work_mem'), mc = num('max_connections');
    if (wm * mc * 4 > ram) add({ id: 'CFG-03', category: C, severity: 'high', title: 'work_mem x max_connections x 4 exceeds RAM', evidence: `${wm / MB}MB x ${mc} x 4 = ${Math.round((wm * mc * 4) / GB * 10) / 10} GB vs ${ram / GB} GB RAM`, fix: 'Lower max_connections (use a pooler) or work_mem; raise work_mem per session/role only for heavy reports: ALTER ROLE report_role SET work_mem = \'64MB\';', execution: EXEC.reload }); else ok('CFG-03');
    if (isDefault('maintenance_work_mem') && num('maintenance_work_mem') <= 64 * MB && ram >= 8 * GB) add({ id: 'CFG-05', category: C, severity: 'low', title: 'maintenance_work_mem is the 64MB default on a host with 8 GB+ RAM', evidence: `maintenance_work_mem=64MB, RAM ${ram / GB} GB`, fix: "ALTER SYSTEM SET maintenance_work_mem = '512MB';", execution: EXEC.reload }); else ok('CFG-05');
  }
  if (dbs.temp_bytes == null) unv('CFG-04', C, 'pg_stat_database unavailable');
  else if (num('work_mem') === 4 * MB && dbs.temp_bytes > 100 * MB) add({ id: 'CFG-04', category: C, severity: 'medium', title: 'work_mem is the 4MB default and queries spill to temp files', evidence: `work_mem=4MB, temp_bytes=${Math.round(dbs.temp_bytes / MB)}MB in ${dbs.temp_files} files`, fix: "ALTER SYSTEM SET work_mem = '16MB';  -- then re-check temp_bytes", execution: EXEC.reload }); else ok('CFG-04');
  const maxc = num('max_connections');
  const pooled = poolerHints.length > 0;
  const backends = dbs.numbackends || 0;
  if ((maxc > 200 && !pooled) || backends > 200) add({ id: 'CFG-06', category: C, severity: 'high', title: 'High connection count without a pooler', evidence: `max_connections=${maxc}, current backends=${backends}, pooler evidence in repo: ${pooled ? list(poolerHints) : 'none'}`, fix: 'Put PgBouncer (transaction pooling) in front, keep max_connections around 100-200, and cap the application pool size.', execution: EXEC.app }); else ok('CFG-06');
  if (!storage) unv('CFG-07', C, 'storage type unknown: pass --storage ssd|hdd');
  else if (storage === 'ssd' && num('random_page_cost') >= 4) add({ id: 'CFG-07', category: C, severity: 'medium', title: 'random_page_cost is 4.0 on SSD/NVMe', evidence: `random_page_cost=${S.random_page_cost.setting}, storage=${storage}`, fix: 'ALTER SYSTEM SET random_page_cost = 1.1;', execution: EXEC.reload }); else ok('CFG-07');
  if (Number(S.checkpoint_completion_target?.setting) < 0.9) add({ id: 'CFG-08', category: C, severity: 'low', title: 'checkpoint_completion_target below 0.9', evidence: `value=${S.checkpoint_completion_target.setting}`, fix: 'ALTER SYSTEM SET checkpoint_completion_target = 0.9;', execution: EXEC.reload }); else ok('CFG-08');
  if (!live.checkpointer) unv('CFG-09', C, 'checkpoint statistics unavailable');
  else if (num('max_wal_size') < 4096 * MB && live.checkpointer.requested > live.checkpointer.timed) add({ id: 'CFG-09', category: C, severity: 'medium', title: 'max_wal_size is small and checkpoints are mostly requested, not timed', evidence: `max_wal_size=${num('max_wal_size') / MB}MB, checkpoints timed=${live.checkpointer.timed}, requested=${live.checkpointer.requested}`, fix: "ALTER SYSTEM SET max_wal_size = '8GB';", execution: EXEC.reload }); else ok('CFG-09');
  if (num('idle_in_transaction_session_timeout') === 0) add({ id: 'CFG-10', category: C, severity: 'medium', title: 'idle_in_transaction_session_timeout is disabled', evidence: 'value=0', fix: "ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';", execution: EXEC.reload }); else ok('CFG-10');
  if (Number(S.log_temp_files?.setting) === -1) add({ id: 'CFG-11', category: C, severity: 'low', title: 'log_temp_files is -1 (temp-file spilling is not logged)', evidence: 'value=-1', fix: 'ALTER SYSTEM SET log_temp_files = 0;', execution: EXEC.reload }); else ok('CFG-11');
  if (S.autovacuum?.setting === 'off') add({ id: 'CFG-12', category: C, severity: 'critical', title: 'autovacuum is off', evidence: 'autovacuum=off', fix: 'ALTER SYSTEM SET autovacuum = on;', execution: EXEC.reload }); else ok('CFG-12');
  if (!(live.extensions || []).includes('pg_stat_statements')) add({ id: 'CFG-13', category: C, severity: 'medium', title: 'pg_stat_statements is not installed', evidence: `extensions: ${list(live.extensions || [])}; shared_preload_libraries='${S.shared_preload_libraries?.setting || ''}'`, fix: "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';  -- restart, then: CREATE EXTENSION pg_stat_statements;", execution: EXEC.restart }); else ok('CFG-13');
  add({ id: 'CFG-14', category: C, severity: 'info', title: 'Pooler evidence', evidence: pooled ? `pooler references in: ${list(poolerHints)}` : 'no PgBouncer/Odyssey/pgpool reference found in the repo', fix: 'None required; informational.', execution: EXEC.ops });

  // ---------------- Schema
  const SC = 'Schema';
  const pkTables = new Set((live.constraints || []).filter((c) => c.contype === 'p').map((c) => `${c.schema}.${c.tbl}`));
  const noPk = tables.filter((t) => !pkTables.has(`${t.schema}.${t.name}`));
  if (noPk.length) for (const t of noPk) add({ id: 'SCH-01', category: SC, severity: 'high', title: 'Table without a primary key', object: fq(t), evidence: `${fq(t)} has no primary key (~${Math.round(t.n_live || 0)} rows)`, fix: `ALTER TABLE ${fq(t)} ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;  -- or promote an existing unique NOT NULL column`, execution: t.total_bytes > 100 * MB ? EXEC.rewrite : EXEC.app }); else ok('SCH-01');
  const idxByTable = {};
  for (const i of live.indexes || []) (idxByTable[`${i.schema}.${i.tbl}`] ||= []).push(i);
  let fkMissing = 0;
  for (const c of (live.constraints || []).filter((x) => x.contype === 'f')) {
    const idx = idxByTable[`${c.schema}.${c.tbl}`] || [];
    const covered = idx.some((i) => i.valid && !i.partial && i.method === 'btree' && (i.cols || []).length >= c.cols.length && c.cols.every((col, k) => i.cols[k] === col));
    if (!covered) { fkMissing++; const tn = c.schema === 'public' ? c.tbl : `${c.schema}.${c.tbl}`; add({ id: 'SCH-02', category: SC, severity: 'high', title: 'Foreign key without a supporting index', object: `${tn}(${c.cols.join(',')})`, evidence: `${c.conname}: ${tn}(${c.cols.join(', ')}) -> ${c.ref_table}(${(c.ref_cols || []).join(', ')}) has no index starting with those columns`, fix: `CREATE INDEX CONCURRENTLY ON ${tn} (${c.cols.join(', ')});`, execution: EXEC.concurrently }); }
  }
  if (!fkMissing) ok('SCH-02');
  const uuidPk = [];
  for (const c of (live.constraints || []).filter((x) => x.contype === 'p' && x.cols.length === 1)) {
    const t = tables.find((x) => x.schema === c.schema && x.name === c.tbl);
    const col = t && t.columns.find((x) => x.name === c.cols[0]);
    if (col && col.type === 'uuid' && /gen_random_uuid|uuid_generate_v4/.test(col.default || '')) uuidPk.push(t);
  }
  for (const t of uuidPk) add({ id: 'SCH-03', category: SC, severity: (t.n_live || 0) >= 100000 ? 'medium' : 'low', title: 'Random UUIDv4 primary key', object: fq(t), evidence: `${fq(t)} uses a random UUID primary key (~${Math.round(t.n_live || 0)} rows): random inserts fragment the index and hurt cache locality`, fix: 'Use bigint identity, or time-ordered UUIDv7 (uuidv7() on PostgreSQL 18, or generated by the application) for new tables; migrate with expand/contract.', execution: EXEC.app });
  if (!uuidPk.length) ok('SCH-03');
  const vcs = [], ts = [], money = [];
  for (const t of tables) for (const c of t.columns) {
    if (/^character varying\(\d+\)$/.test(c.type)) vcs.push(`${fq(t)}.${c.name} ${c.type}`);
    if (c.type === 'timestamp without time zone') ts.push(`${fq(t)}.${c.name}`);
    if (/^(real|double precision)$/.test(c.type) && /(price|amount|cost|total|balance|salary|fee|rate|payment|tax)/i.test(c.name)) money.push(`${fq(t)}.${c.name} ${c.type}`);
  }
  if (vcs.length) add({ id: 'SCH-04', category: SC, severity: 'low', title: 'varchar(n) columns', evidence: `${vcs.length} column(s): ${list(vcs)}`, fix: 'Prefer text (optionally with a CHECK constraint where a real business limit exists): ALTER TABLE t ALTER COLUMN c TYPE text;  -- metadata-only for varchar to text', execution: EXEC.app }); else ok('SCH-04');
  if (money.length) for (const m of money) add({ id: 'SCH-05', category: SC, severity: 'high', title: 'Floating point type for a money-like column', object: m.split(' ')[0], evidence: m, fix: `ALTER TABLE ${m.split('.').slice(0, -1).join('.')} ALTER COLUMN ${m.split(' ')[0].split('.').pop()} TYPE numeric(12,2) USING ${m.split(' ')[0].split('.').pop()}::numeric(12,2);`, execution: EXEC.rewrite }); else ok('SCH-05');
  if (ts.length) add({ id: 'SCH-06', category: SC, severity: 'medium', title: 'timestamp without time zone', evidence: `${ts.length} column(s): ${list(ts)}`, fix: "ALTER TABLE t ALTER COLUMN c TYPE timestamptz USING c AT TIME ZONE 'UTC';  -- confirm the stored zone first", execution: EXEC.rewrite }); else ok('SCH-06');

  // drift
  const drift = { available: false, tablesOnlyInOrm: [], tablesOnlyInLive: [], columnsOnlyInOrm: [], columnsOnlyInLive: [], typeMismatch: [], nullabilityMismatch: [], indexesOnlyInOrm: [], indexesOnlyInLive: [] };
  const canon = (t) => String(t || '').toLowerCase().replace(/^(timestamp|time)\(\d+\)/, '$1').replace(/^numeric\(\d+(,\d+)?\)/, 'numeric').replace(/\s+/g, ' ').trim();
  if (orm && orm.tables && orm.tables.length) {
    drift.available = true;
    const o = new Map(orm.tables.map((t) => [`${t.schema || 'public'}.${t.name}`, t]));
    const l = new Map(tables.map((t) => [`${t.schema}.${t.name}`, t]));
    for (const k of o.keys()) if (!l.has(k)) drift.tablesOnlyInOrm.push(k);
    for (const k of l.keys()) if (!o.has(k) && !/^(public\.)?_?_?(drizzle|prisma)/i.test(k) && !/^drizzle\./.test(k)) drift.tablesOnlyInLive.push(k);
    for (const [k, ot] of o) {
      const lt = l.get(k); if (!lt) continue;
      const lc = new Map(lt.columns.map((c) => [c.name, c])), oc = new Map(ot.columns.map((c) => [c.name, c]));
      for (const [n, c] of oc) {
        const x = lc.get(n);
        if (!x) { drift.columnsOnlyInOrm.push(`${k}.${n}`); continue; }
        if (canon(c.type) !== canon(x.type)) drift.typeMismatch.push({ column: `${k}.${n}`, orm: c.type, live: x.type });
        const pk = (ot.primaryKey || []).includes(n);
        if (!pk && c.nullable === x.notNull) drift.nullabilityMismatch.push({ column: `${k}.${n}`, orm: c.nullable ? 'nullable' : 'required', live: x.notNull ? 'NOT NULL' : 'nullable' });
      }
      for (const n of lc.keys()) if (!oc.has(n)) drift.columnsOnlyInLive.push(`${k}.${n}`);
      const ormIdx = new Set((ot.indexes || []).map((i) => `${i.columns.join(',')}|${!!i.unique}`));
      const liveIdx = (idxByTable[k] || []).filter((i) => !i.pk && i.cols && !i.expr);
      const liveSet = new Set(liveIdx.map((i) => `${i.cols.join(',')}|${!!i.unique}`));
      for (const s of ormIdx) if (!liveSet.has(s)) drift.indexesOnlyInOrm.push(`${k} (${s.replace('|', ') unique=')}`);
      for (const s of liveSet) if (!ormIdx.has(s)) drift.indexesOnlyInLive.push(`${k} (${s.replace('|', ') unique=')}`);
    }
    const structural = drift.tablesOnlyInOrm.length + drift.tablesOnlyInLive.length + drift.columnsOnlyInOrm.length + drift.columnsOnlyInLive.length + drift.typeMismatch.length + drift.indexesOnlyInOrm.length + drift.indexesOnlyInLive.length;
    if (structural) add({ id: 'SCH-09', category: SC, severity: 'medium', title: 'ORM schema and live database differ', evidence: `tables only in ORM: ${list(drift.tablesOnlyInOrm) || '-'}; only in live: ${list(drift.tablesOnlyInLive) || '-'}; columns only in ORM ${drift.columnsOnlyInOrm.length}, only in live ${drift.columnsOnlyInLive.length}; type mismatches ${drift.typeMismatch.length}; indexes only in ORM ${drift.indexesOnlyInOrm.length}, only in live ${drift.indexesOnlyInLive.length}`, fix: 'Decide which side is the source of truth, then generate a reviewed migration (ORM -> live) or update the ORM definitions (live -> ORM). Do not apply blindly.', execution: EXEC.app }); else ok('SCH-09');
    if (drift.nullabilityMismatch.length) add({ id: 'SCH-07', category: SC, severity: 'medium', title: 'Nullability differs between ORM and live', evidence: `${drift.nullabilityMismatch.length} column(s): ${list(drift.nullabilityMismatch.map((m) => `${m.column} (ORM ${m.orm}, live ${m.live})`), 8)}`, fix: 'Backfill NULLs, then ALTER TABLE t ALTER COLUMN c SET NOT NULL (use a NOT VALID CHECK constraint then VALIDATE to avoid long locks), or relax the ORM definition.', execution: EXEC.app }); else ok('SCH-07');
  } else { unv('SCH-07', SC, 'no ORM schema extracted (live-only run)'); unv('SCH-09', SC, 'no ORM schema extracted (live-only run)'); }
  unv('SCH-08', SC, 'extended-statistics candidates need correlated-filter analysis of pg_stat_statements; not automated');

  // ---------------- Indexes
  const IX = 'Indexes';
  const inv = (live.indexes || []).filter((i) => !i.valid);
  if (inv.length) for (const i of inv) add({ id: 'IDX-01', category: IX, severity: 'high', title: 'Invalid index', object: i.idx, evidence: `${i.schema}.${i.idx} on ${i.tbl} is INVALID (failed CREATE INDEX CONCURRENTLY)`, fix: `DROP INDEX CONCURRENTLY ${i.schema}.${i.idx};  -- then recreate with CREATE INDEX CONCURRENTLY`, execution: EXEC.concurrently }); else ok('IDX-01');
  let dup = 0;
  for (const [tk, idx] of Object.entries(idxByTable)) {
    const cand = idx.filter((i) => i.valid && i.cols && !i.expr);
    for (const a of cand) for (const b of cand) {
      if (a === b || a.method !== b.method || a.partial !== b.partial) continue;
      const sameCols = a.cols.join(',') === b.cols.join(',');
      const prefix = !sameCols && b.cols.length > a.cols.length && a.cols.every((c, k) => b.cols[k] === c);
      if ((sameCols && a.idx < b.idx && a.unique === b.unique) || (prefix && !a.unique && !a.pk && !a.backs_constraint)) {
        if (a.partial && a.def.split('WHERE')[1] !== b.def.split('WHERE')[1]) continue;
        dup++;
        add({ id: 'IDX-02', category: IX, severity: 'medium', title: sameCols ? 'Duplicate index' : 'Index is a prefix of another index', object: a.idx, evidence: `${a.idx} (${a.cols.join(', ')}) ${sameCols ? 'duplicates' : 'is covered by'} ${b.idx} (${b.cols.join(', ')}) on ${tk}`, fix: `DROP INDEX CONCURRENTLY ${a.schema}.${a.idx};`, execution: EXEC.concurrently });
      }
    }
  }
  if (!dup) ok('IDX-02');
  const resetAt = dbs.stats_reset ? new Date(dbs.stats_reset) : null;
  const ageDays = resetAt ? (new Date(live.meta.collectedAt) - resetAt) / 86400000 : null;
  const unused = (live.indexes || []).filter((i) => i.valid && i.idx_scan === 0 && !i.unique && !i.pk && !i.backs_constraint);
  if (unused.length) for (const i of unused) {
    const old = ageDays !== null && ageDays >= 7;
    add({ id: 'IDX-03', category: IX, severity: i.bytes > 10 * MB && old ? 'medium' : 'low', title: 'Unused non-unique index', object: i.idx, evidence: `${i.idx} on ${i.tbl}: idx_scan=0, size ${(i.bytes / MB).toFixed(1)} MB; statistics age ${ageDays === null ? 'unknown (never reset)' : ageDays.toFixed(1) + ' days'}${old ? '' : ' (too young to be conclusive)'}`, fix: `DROP INDEX CONCURRENTLY ${i.schema}.${i.idx};  -- only after confirming on every replica and across a full business cycle`, execution: EXEC.concurrently });
  } else ok('IDX-03');
  const seq = tables.filter((t) => (t.n_live || 0) > 10000 && t.seq_scan > 10 * (t.idx_scan || 0));
  if (seq.length) add({ id: 'IDX-04', category: IX, severity: 'medium', title: 'High sequential-scan ratio on large tables', evidence: list(seq.map((t) => `${fq(t)} seq_scan=${t.seq_scan} idx_scan=${t.idx_scan || 0} rows~${Math.round(t.n_live)}`), 8), fix: 'Find the filtering columns (pg_stat_statements, EXPLAIN without ANALYZE) and add matching indexes: CREATE INDEX CONCURRENTLY ...', execution: EXEC.concurrently }); else ok('IDX-04');
  const part = (live.columnStats || []).filter((c) => (c.top_freq || 0) > 0.9 && (tables.find((t) => t.schema === c.schema && t.name === c.tbl)?.n_live || 0) > 10000);
  if (part.length) add({ id: 'IDX-05', category: IX, severity: 'low', title: 'Partial-index opportunity on a skewed status-like column', evidence: list(part.map((c) => `${c.tbl}.${c.name} dominant value share ${Math.round(c.top_freq * 100)}%`)), fix: 'CREATE INDEX CONCURRENTLY ON t (col) WHERE col <> <dominant value>;  -- index only the rare rows', execution: EXEC.concurrently }); else ok('IDX-05');

  // ---------------- Health
  const H = 'Health';
  if (live.xidAgeMax == null) unv('HLT-01', H, 'datfrozenxid age unavailable');
  else if (live.xidAgeMax > 200e6) add({ id: 'HLT-01', category: H, severity: 'critical', title: 'Transaction ID wraparound risk', evidence: `max(age(datfrozenxid))=${Math.round(live.xidAgeMax / 1e6)}M (limit ~2.1B)`, fix: 'VACUUM (FREEZE, VERBOSE) on the oldest tables during a quiet period; check blocking long transactions/replication slots first.', execution: EXEC.ops });
  else if (live.xidAgeMax > 150e6) add({ id: 'HLT-01', category: H, severity: 'high', title: 'Transaction ID age is high', evidence: `max(age(datfrozenxid))=${Math.round(live.xidAgeMax / 1e6)}M`, fix: 'Make sure autovacuum can freeze (check long transactions and slots); schedule VACUUM (FREEZE) on the oldest tables.', execution: EXEC.ops });
  else ok('HLT-01');
  const bloat = tables.filter((t) => (t.n_dead || 0) > 10000 && t.n_dead / Math.max(1, t.n_dead + (t.n_live || 0)) > 0.2);
  if (bloat.length) for (const t of bloat) { const r = t.n_dead / (t.n_dead + t.n_live); add({ id: 'HLT-02', category: H, severity: r > 0.4 ? 'high' : 'medium', title: 'High dead-tuple ratio', object: fq(t), evidence: `${fq(t)}: ${Math.round(t.n_dead)} dead vs ${Math.round(t.n_live)} live (${Math.round(r * 100)}%), last autovacuum ${t.last_autovacuum || 'never'}`, fix: `ALTER TABLE ${fq(t)} SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000);  -- then VACUUM (VERBOSE) ${fq(t)};`, execution: EXEC.ops }); } else ok('HLT-02');
  const act = live.activity ? live.activity.byState : [];
  const long = act.filter((a) => a.state !== 'idle' && (a.max_xact_age_s || 0) > 300);
  if (long.length) add({ id: 'HLT-03', category: H, severity: 'high', title: 'Transaction open longer than 5 minutes', evidence: long.map((a) => `state=${a.state} oldest ${Math.round(a.max_xact_age_s)}s (${a.n} session(s))`).join('; '), fix: 'Investigate in pg_stat_activity; fix the application path that holds the transaction; set idle_in_transaction_session_timeout.', execution: EXEC.ops }); else ok('HLT-03');
  const iit = act.filter((a) => /idle in transaction/.test(a.state) && (a.max_state_age_s || 0) > 60);
  if (iit.length) add({ id: 'HLT-04', category: H, severity: 'medium', title: 'Sessions idle in transaction for over 1 minute', evidence: iit.map((a) => `${a.state}: ${a.n} session(s), oldest ${Math.round(a.max_state_age_s)}s`).join('; '), fix: "ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';  -- and fix the application code path", execution: EXEC.reload }); else ok('HLT-04');
  const slots = (live.replicationSlots || []).filter((s) => !s.active);
  if (slots.length) add({ id: 'HLT-05', category: H, severity: 'high', title: 'Inactive replication slot retaining WAL', evidence: slots.map((s) => `${s.slot_name}: ${s.retained_bytes == null ? 'unknown' : Math.round(s.retained_bytes / MB) + ' MB'} retained`).join('; '), fix: "SELECT pg_drop_replication_slot('<slot>');  -- only if the consumer is gone for good", execution: EXEC.ops }); else ok('HLT-05');
  const reads = (dbs.blks_hit || 0) + (dbs.blks_read || 0);
  if (reads < 10000) unv('HLT-06', H, 'too little I/O since stats reset to judge the cache hit ratio');
  else { const r = dbs.blks_hit / reads; if (r < 0.95) add({ id: 'HLT-06', category: H, severity: 'high', title: 'Cache hit ratio below 95%', evidence: `${(r * 100).toFixed(2)}%`, fix: 'Increase shared_buffers / RAM, or add indexes to avoid large scans.', execution: EXEC.restart }); else if (r < 0.99) add({ id: 'HLT-06', category: H, severity: 'medium', title: 'Cache hit ratio below 99%', evidence: `${(r * 100).toFixed(2)}%`, fix: 'Review shared_buffers and the heaviest queries.', execution: EXEC.restart }); else ok('HLT-06'); }
  if (dbs.temp_bytes > GB) add({ id: 'HLT-07', category: H, severity: 'high', title: 'Large temp-file spilling', evidence: `temp_bytes=${(dbs.temp_bytes / GB).toFixed(1)} GB in ${dbs.temp_files} files since stats reset`, fix: "SET work_mem for the heavy roles (ALTER ROLE ... SET work_mem = '64MB';), add missing indexes, and set log_temp_files = 0 to find the queries.", execution: EXEC.reload }); else ok('HLT-07');
  if (dbs.deadlocks > 0) add({ id: 'HLT-08', category: H, severity: 'low', title: 'Deadlocks occurred', evidence: `deadlocks=${dbs.deadlocks} since stats reset`, fix: 'Enable log_lock_waits = on and make transactions take locks in a consistent order.', execution: EXEC.app }); else ok('HLT-08');
  const r = live.role;
  if (!r) unv('HLT-09', H, 'role privileges unavailable');
  else if (r.rolsuper || r.write_tables > 0 || r.create_public || r.rolcreatedb || r.rolcreaterole) add({ id: 'HLT-09', category: H, severity: 'high', title: 'Assessment role has write or superuser privileges', evidence: `rolsuper=${r.rolsuper}, createdb=${r.rolcreatedb}, createrole=${r.rolcreaterole}, writable tables=${r.write_tables}, CREATE on public=${r.create_public}`, fix: "Use a dedicated read-only role for assessments: CREATE ROLE assessor LOGIN PASSWORD '...'; GRANT pg_monitor, pg_read_all_stats TO assessor; GRANT CONNECT ON DATABASE db TO assessor;  -- and run the application with a least-privilege role, not a superuser.", execution: EXEC.ops }); else ok('HLT-09');

  // ---------------- JSON
  const J = 'JSON';
  const jcols = (json && json.columns) || [];
  if (!jcols.length) ok('JSN-01');
  for (const c of jcols) {
    const name = `${c.schema === 'public' || c.schema === 'orm' ? '' : c.schema + '.'}${c.table}.${c.column}`;
    if (c.status === 'unverified') { unv('JSN-01', J, name + ': ' + c.reason); continue; }
    if (c.classification === 'split') add({ id: 'JSN-01', category: J, severity: c.severity, title: 'json/jsonb column should be split', object: name, evidence: `${name}: ${c.reasons.join('; ')} (avg ${Math.round(c.stats.avg)} B, p95 ${Math.round(c.stats.p95)} B, max ${Math.round(c.stats.max)} B, TOAST share of table ${Math.round(c.toastShare * 100)}%)`, fix: c.patterns.map((p) => `[${p.pattern}] ${p.detail}`).join(' | ') + ' -- see reference/json-splitting.md (expand/contract: add new columns/table, dual write, batch backfill, switch reads, then drop).', execution: EXEC.app });
    else if (c.classification === 'watch') add({ id: 'JSN-02', category: J, severity: 'low', title: 'json/jsonb column to watch', object: name, evidence: `${name}: ${c.watch.join('; ')}`, fix: /json, not jsonb/.test(c.watch.join()) ? `ALTER TABLE ${c.table} ALTER COLUMN ${c.column} TYPE jsonb USING ${c.column}::jsonb;  -- rewrites the table` : 'Add a GIN (jsonb_path_ops) or expression index on the keys actually filtered, or promote them to columns.', execution: /jsonb/.test(c.watch.join()) ? EXEC.rewrite : EXEC.concurrently });
  }
  if (jcols.length && !findings.some((f) => f.id === 'JSN-01')) ok('JSN-01');
  if (jcols.length && !findings.some((f) => f.id === 'JSN-02')) ok('JSN-02');

  // ---------------- score
  const cats = {};
  for (const [name, w] of Object.entries(WEIGHTS)) {
    const pen = findings.filter((f) => f.category === name).reduce((a, f) => a + PENALTY[f.severity], 0);
    cats[name] = { weight: w, penalty: pen, capped: Math.min(pen, w), subscore: w - Math.min(pen, w) };
  }
  const score = Math.max(0, 100 - Object.values(cats).reduce((a, c) => a + c.capped, 0));
  findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.id.localeCompare(b.id) || String(a.object).localeCompare(String(b.object)));
  return {
    target: { host: live.meta.host, database: live.meta.database }, serverVersion: live.meta.serverVersion, collectedAt: live.meta.collectedAt, host: live.host,
    score, categories: cats, findings, evaluated: [...new Set(evaluated)].sort(), unverified, drift, collectionErrors: live.errors || [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(opt('root', process.cwd()));
  const work = path.join(root, 'pg-health-reports', '.work');
  const rd = (n, d) => JSON.parse(fs.readFileSync(path.resolve(root, opt(n, path.join(work, d))), 'utf8'));
  const orm = (() => { try { return rd('orm', 'orm-schema.json'); } catch { return null; } })();
  const live = rd('live', 'live.json');
  const json = (() => { try { return rd('json', 'json.json'); } catch { return null; } })();
  const result = assess(orm, live, json);
  const out = path.resolve(root, opt('out', path.join(work, 'findings.json')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(`score=${result.score} findings=${result.findings.length} unverified=${result.unverified.length}\nwritten: ${path.relative(process.cwd(), out)}\n`);
}
