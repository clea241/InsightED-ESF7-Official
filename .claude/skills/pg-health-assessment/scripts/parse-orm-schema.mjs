#!/usr/bin/env node
// Statically extracts tables/columns/keys/indexes/json columns from ORM source. Never imports or executes project code.
// Usage: node parse-orm-schema.mjs [--root <path>] [--detect <detect.json>] [--out <file>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from './detect-orm.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const root = path.resolve(opt('root', process.cwd()));
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

// ---------- helpers
function matchBalanced(text, openIdx, open = '{', close = '}') {
  let d = 0, q = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === open) d++;
    else if (c === close) { d--; if (d === 0) return i; }
  }
  return -1;
}
function splitTop(s, sep = ',') {
  const out = []; let d = 0, q = null, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') { cur += s[++i] || ''; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) d++;
    if (')]}'.includes(c)) d--;
    if (c === sep && d === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// ---------- Drizzle
const DZ_TYPES = {
  bigint: 'bigint', bigserial: 'bigint', serial: 'integer', smallserial: 'smallint', integer: 'integer', int: 'integer', smallint: 'smallint',
  uuid: 'uuid', text: 'text', boolean: 'boolean', jsonb: 'jsonb', json: 'json', real: 'real', doublePrecision: 'double precision',
  numeric: 'numeric', decimal: 'numeric', date: 'date', time: 'time without time zone', interval: 'interval', bytea: 'bytea', inet: 'inet',
};
function parseDrizzle(files, warnings) {
  const tables = [];
  const varToTable = {};
  const texts = files.map((f) => ({ f, t: read(path.join(root, f)) }));
  for (const { t } of texts) for (const m of t.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*pgTable\(\s*['"`]([^'"`]+)['"`]/g)) varToTable[m[1]] = m[2];
  for (const { f, t } of texts) {
    for (const m of t.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*pgTable\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const close = matchBalanced(t, open);
      if (close < 0) { warnings.push('unbalanced table ' + m[2]); continue; }
      const body = t.slice(open + 1, close);
      const after = t.slice(close + 1, matchBalanced(t, t.indexOf('(', m.index + 8), '(', ')'));
      const table = { name: m[2], schema: 'public', file: f, columns: [], primaryKey: [], foreignKeys: [], indexes: [], confidence: 'high' };
      const keyToName = {};
      for (const ent of splitTop(body)) {
        const mm = ent.match(/^\s*([A-Za-z_$][\w$]*|['"][^'"]+['"])\s*:\s*([\s\S]*)$/);
        if (!mm) continue;
        const jsKey = mm[1].replace(/['"]/g, '');
        const expr = mm[2].trim();
        const b = expr.match(/^(\w+)\(\s*(?:['"`]([^'"`]+)['"`])?\s*(?:,?\s*(\{[^)]*\}))?\s*\)/);
        if (!b) { table.confidence = 'medium'; warnings.push(`${m[2]}.${jsKey}: unparsed column expression`); continue; }
        const builder = b[1];
        const dbName = b[2] || jsKey;
        const optsText = b[3] || '';
        let type = DZ_TYPES[builder];
        if (builder === 'varchar') { const len = optsText.match(/length\s*:\s*(\d+)/); type = len ? `character varying(${len[1]})` : 'character varying'; }
        else if (builder === 'char') { const len = optsText.match(/length\s*:\s*(\d+)/); type = `character(${len ? len[1] : 1})`; }
        else if (builder === 'timestamp') type = /withTimezone\s*:\s*true/.test(optsText) ? 'timestamp with time zone' : 'timestamp without time zone';
        else if (builder === 'time') type = /withTimezone\s*:\s*true/.test(optsText) ? 'time with time zone' : 'time without time zone';
        else if (builder === 'numeric' || builder === 'decimal') type = 'numeric';
        else if (!type) { type = builder.toLowerCase(); table.confidence = 'medium'; warnings.push(`${m[2]}.${dbName}: unknown builder ${builder}`); }
        const isPk = /\.primaryKey\(/.test(expr);
        const col = { name: dbName, type, nullable: !(/\.notNull\(/.test(expr) || isPk), default: /\.default\w*\(|\.\$default/.test(expr) ? 'set' : null };
        if (/\.generatedAlwaysAsIdentity|\.generatedByDefaultAsIdentity/.test(expr) || builder === 'serial' || builder === 'bigserial') col.default = 'identity';
        table.columns.push(col);
        keyToName[jsKey] = dbName;
        if (isPk) table.primaryKey.push(dbName);
        if (/\.unique\(/.test(expr)) table.indexes.push({ name: null, columns: [dbName], unique: true });
        const ref = expr.match(/\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/);
        if (ref) table.foreignKeys.push({ columns: [dbName], refTable: varToTable[ref[1]] || ref[1], refColumns: [ref[2]], refVar: ref[1], refKey: ref[2] });
      }
      const col = (k) => keyToName[k] || snake(k);
      const colsOf = (s) => [...s.matchAll(/table\.(\w+)/g)].map((x) => col(x[1]));
      for (const im of after.matchAll(/(uniqueIndex|index)\(\s*(?:['"`]([^'"`]+)['"`])?\s*\)([\s\S]*?)(?=,\s*(?:index|uniqueIndex|foreignKey|unique|check|primaryKey)\(|\]\s*$|\}\s*\)\s*$|$)/g)) {
        const on = im[3].match(/\.on\(([^)]*)\)/);
        if (on) table.indexes.push({ name: im[2] || null, columns: colsOf(on[1]), unique: im[1] === 'uniqueIndex', partial: /\.where\(/.test(im[3]) });
      }
      for (const um of after.matchAll(/(?<![\w.])unique\(\s*(?:['"`]([^'"`]+)['"`])?\s*\)\.on\(([^)]*)\)/g)) table.indexes.push({ name: um[1] || null, columns: colsOf(um[2]), unique: true });
      for (const pm of after.matchAll(/primaryKey\(\s*\{\s*columns\s*:\s*\[([^\]]*)\]/g)) table.primaryKey.push(...colsOf(pm[1]));
      for (const fm of after.matchAll(/foreignKey\(\s*\{[\s\S]*?columns\s*:\s*\[([^\]]*)\][\s\S]*?foreignColumns\s*:\s*\[([^\]]*)\]/g)) {
        const rc = [...fm[2].matchAll(/(\w+)\.(\w+)/g)];
        table.foreignKeys.push({ columns: colsOf(fm[1]), refTable: rc[0] ? varToTable[rc[0][1]] || rc[0][1] : null, refColumns: rc.map((x) => x[2]) });
      }
      tables.push(table);
    }
  }
  // map FK ref column keys to db names
  const byVar = Object.fromEntries(Object.entries(varToTable).map(([v, n]) => [v, tables.find((x) => x.name === n)]));
  for (const t of tables) for (const fk of t.foreignKeys) if (fk.refVar && byVar[fk.refVar]) { delete fk.refVar; delete fk.refKey; }
  return tables;
}

// ---------- Prisma
const PRISMA_TYPES = { String: 'text', Int: 'integer', BigInt: 'bigint', Float: 'double precision', Decimal: 'numeric', Boolean: 'boolean', DateTime: 'timestamp without time zone', Json: 'jsonb', Bytes: 'bytea' };
function parsePrisma(files, warnings) {
  const text = files.map((f) => read(path.join(root, f))).join('\n');
  const models = [...text.matchAll(/^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm)].map((m) => ({ name: m[1], body: m[2] }));
  const modelNames = new Set(models.map((m) => m.name));
  const mapName = Object.fromEntries(models.map((m) => [m.name, (m.body.match(/@@map\(\s*"([^"]+)"\s*\)/) || [])[1] || m.name]));
  const tables = [];
  for (const m of models) {
    const t = { name: mapName[m.name], schema: 'public', file: files[0], columns: [], primaryKey: [], foreignKeys: [], indexes: [], confidence: 'high' };
    const fieldToCol = {};
    const lines = m.body.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
    for (const l of lines) {
      if (l.startsWith('@@')) continue;
      const f = l.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!f) continue;
      const [, field, typ, isList, opt, rest] = f;
      if (modelNames.has(typ)) {
        const rel = rest.match(/@relation\([^)]*fields:\s*\[([^\]]*)\][^)]*references:\s*\[([^\]]*)\]/);
        if (rel && !isList) t.foreignKeys.push({ columns: rel[1].split(',').map((s) => s.trim()), refTable: mapName[typ], refColumns: rel[2].split(',').map((s) => s.trim()), _fieldCols: true });
        continue;
      }
      let type = PRISMA_TYPES[typ];
      if (!type) { type = typ.toLowerCase(); t.confidence = 'medium'; }
      const dbt = rest.match(/@db\.(\w+)(?:\((\d+)\))?/);
      if (dbt) type = dbt[1] === 'VarChar' ? `character varying${dbt[2] ? `(${dbt[2]})` : ''}` : dbt[1] === 'Timestamptz' ? 'timestamp with time zone' : dbt[1] === 'Uuid' ? 'uuid' : dbt[1] === 'Real' ? 'real' : type;
      const mapped = (rest.match(/@map\(\s*"([^"]+)"/) || [])[1] || field;
      fieldToCol[field] = mapped;
      t.columns.push({ name: mapped, type, nullable: !!opt || isList === '[]' ? !!opt : false, default: /@default/.test(rest) ? 'set' : null });
      if (/@id\b/.test(rest)) t.primaryKey.push(mapped);
      if (/@unique\b/.test(rest)) t.indexes.push({ name: null, columns: [mapped], unique: true });
    }
    const conv = (arr) => arr.map((x) => fieldToCol[x] || x);
    for (const fk of t.foreignKeys) { fk.columns = conv(fk.columns); delete fk._fieldCols; }
    for (const im of m.body.matchAll(/@@(index|unique)\(\s*\[([^\]]*)\]/g)) t.indexes.push({ name: null, columns: conv(im[2].split(',').map((s) => s.trim().replace(/\(.*$/, ''))), unique: im[1] === 'unique' });
    const idm = m.body.match(/@@id\(\s*\[([^\]]*)\]/);
    if (idm) t.primaryKey.push(...conv(idm[1].split(',').map((s) => s.trim())));
    tables.push(t);
  }
  return tables;
}

// ---------- TypeORM / Sequelize (best effort; confidence reported)
function parseTypeorm(files, warnings) {
  const tables = [];
  for (const f of files) {
    const t = read(path.join(root, f));
    for (const m of t.matchAll(/@Entity\(\s*(?:['"`]([^'"`]+)['"`]|\{[^}]*name\s*:\s*['"`]([^'"`]+)['"`])?[^)]*\)\s*(?:export\s+)?class\s+(\w+)\s*\{([\s\S]*?)(?=\n@Entity|\n\}\s*$|$)/g)) {
      const tbl = { name: m[1] || m[2] || snake(m[3]), schema: 'public', file: f, columns: [], primaryKey: [], foreignKeys: [], indexes: [], confidence: 'low' };
      for (const c of m[4].matchAll(/@(PrimaryGeneratedColumn|PrimaryColumn|Column|Index|ManyToOne)\(([^)]*)\)\s*(?:@\w+\([^)]*\)\s*)*(\w+)\s*[!?]?\s*:\s*([\w\[\]<>| ]+)/g)) {
        const type = (c[2].match(/type\s*:\s*['"`](\w+)['"`]/) || c[2].match(/^\s*['"`](\w+)['"`]/) || [])[1] || ({ number: 'integer', string: 'text', boolean: 'boolean', Date: 'timestamp without time zone' }[c[4].trim()] || c[4].trim().toLowerCase());
        if (c[1] === 'ManyToOne' || c[1] === 'Index') continue;
        tbl.columns.push({ name: (c[2].match(/name\s*:\s*['"`](\w+)['"`]/) || [])[1] || c[3], type, nullable: /nullable\s*:\s*true/.test(c[2]), default: null });
        if (c[1].startsWith('Primary')) tbl.primaryKey.push(c[3]);
      }
      tables.push(tbl);
    }
  }
  warnings.push('TypeORM parsing is best-effort (confidence low): foreign keys and indexes may be incomplete');
  return tables;
}
function parseSequelize(files, warnings) {
  const tables = [];
  for (const f of files) {
    const t = read(path.join(root, f));
    for (const m of t.matchAll(/(?:sequelize\.define\(\s*['"`](\w+)['"`]\s*,|\.init\()\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const close = matchBalanced(t, open);
      const body = t.slice(open + 1, close);
      const tail = t.slice(close, close + 400);
      const tbl = { name: m[1] || (tail.match(/tableName\s*:\s*['"`](\w+)['"`]/) || [])[1] || 'unknown', schema: 'public', file: f, columns: [], primaryKey: [], foreignKeys: [], indexes: [], confidence: 'low' };
      for (const ent of splitTop(body)) {
        const mm = ent.match(/^\s*(\w+)\s*:\s*([\s\S]*)$/);
        if (!mm) continue;
        const dt = mm[2].match(/DataTypes\.(\w+)(?:\((\d+)\))?/);
        const map = { JSONB: 'jsonb', JSON: 'json', STRING: dt && dt[2] ? `character varying(${dt[2]})` : 'character varying(255)', TEXT: 'text', INTEGER: 'integer', BIGINT: 'bigint', UUID: 'uuid', BOOLEAN: 'boolean', DATE: 'timestamp with time zone', FLOAT: 'real', DECIMAL: 'numeric' };
        tbl.columns.push({ name: mm[1], type: dt ? map[dt[1]] || dt[1].toLowerCase() : 'unknown', nullable: !/allowNull\s*:\s*false|primaryKey\s*:\s*true/.test(mm[2]), default: null });
        if (/primaryKey\s*:\s*true/.test(mm[2])) tbl.primaryKey.push(mm[1]);
        const ref = mm[2].match(/references\s*:\s*\{[^}]*model\s*:\s*['"`](\w+)['"`]/);
        if (ref) tbl.foreignKeys.push({ columns: [mm[1]], refTable: ref[1], refColumns: ['id'] });
      }
      tables.push(tbl);
    }
  }
  warnings.push('Sequelize parsing is best-effort (confidence low)');
  return tables;
}

export function parseSchema(det) {
  const warnings = [];
  let tables = [];
  if (det.orm === 'drizzle') tables = parseDrizzle(det.schemaFiles, warnings);
  else if (det.orm === 'prisma') tables = parsePrisma(det.schemaFiles, warnings);
  else if (det.orm === 'typeorm') tables = parseTypeorm(det.schemaFiles, warnings);
  else if (det.orm === 'sequelize') tables = parseSequelize(det.schemaFiles, warnings);
  else warnings.push(det.orm === 'none' ? 'No ORM detected: live introspection only' : det.orm + ' declares schema in migrations; no static schema extracted');
  const jsonColumns = [];
  for (const t of tables) for (const c of t.columns) if (/^jsonb?$/.test(c.type)) jsonColumns.push({ table: t.name, column: c.name, type: c.type });
  return { orm: det.orm, schemaFiles: det.schemaFiles, tables, jsonColumns, poolerHints: det.poolerHints || [], warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const detFile = opt('detect', null);
  const det = detFile ? JSON.parse(fs.readFileSync(detFile, 'utf8')) : detect();
  const out = path.resolve(root, opt('out', 'pg-health-reports/.work/orm-schema.json'));
  const schema = parseSchema(det);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(schema, null, 2) + '\n');
  process.stdout.write(`orm=${schema.orm} tables=${schema.tables.length} jsonColumns=${schema.jsonColumns.length} warnings=${schema.warnings.length}\nwritten: ${path.relative(process.cwd(), out)}\n`);
}
