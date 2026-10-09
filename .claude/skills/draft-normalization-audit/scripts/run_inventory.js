#!/usr/bin/env node
/**
 * Runs inventory_tables.sql read-only. Refuses unless the DB is on the allowlist and the host is loopback.
 * The session is set READ ONLY and only the SELECT in the .sql file is sent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const fromServer = (m) => require(require.resolve(m, { paths: [path.join(ROOT, 'server'), ROOT] }));
fromServer('dotenv').config({ path: path.join(ROOT, 'server/.env') });
const { Client } = fromServer('pg');

const ALLOWED = new Set(['esf7_local', 'insighted_esf7']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const db = process.env.DB_NAME || 'esf7_local';
const host = String(process.env.DB_HOST || 'localhost').toLowerCase();

if (!ALLOWED.has(db)) { console.error(`FATAL: database "${db}" is not on the allowlist [${[...ALLOWED].join(', ')}].`); process.exit(1); }
if (!LOOPBACK.has(host)) { console.error(`FATAL: DB_HOST "${host}" is not a loopback address.`); process.exit(1); }
if (String(process.env.NODE_ENV).toLowerCase() === 'production') { console.error('FATAL: refusing to run with NODE_ENV=production.'); process.exit(1); }

const sql = fs.readFileSync(path.join(__dirname, 'inventory_tables.sql'), 'utf8');
if (/\b(insert|update|delete|drop|alter|truncate|create|grant)\b/i.test(sql.replace(/--.*$/gm, ''))) {
  console.error('FATAL: inventory SQL contains a non-SELECT keyword.');
  process.exit(1);
}

(async () => {
  const client = new Client({
    host,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: db
  });
  try {
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    const { rows } = await client.query(sql);
    const tables = new Map();
    for (const r of rows) {
      if (!tables.has(r.table_name)) tables.set(r.table_name, { columns: [], constraints: [], fks: [] });
      const t = tables.get(r.table_name);
      if (r.kind === 'columns') t.columns.push(`${r.name} ${r.detail}${r.extra === 'NO' ? ' NOT NULL' : ''}`);
      else if (r.kind === 'constraint') t.constraints.push(`${r.name} [${r.detail}]`);
      else t.fks.push(`${r.name} (${r.detail})`);
    }
    console.log(`# Inventory of ${db} @ ${host} (read-only)\n`);
    for (const [name, t] of [...tables].sort()) {
      console.log(`## ${name}\ncolumns: ${t.columns.join(', ')}\nconstraints: ${t.constraints.join('; ') || '-'}\nforeign keys: ${t.fks.join('; ') || '-'}\n`);
    }
    console.log(`Tables found: ${tables.size}`);
  } catch (e) {
    console.error(`FATAL: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
