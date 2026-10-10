#!/usr/bin/env node
// Renders inventory.json (from find-write-paths.mjs) into dataflow.md with a fixed structure.
// Usage: node render-dataflow.mjs <inventory.json> [--overrides <file>] --out <dataflow.md>
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const invPath = argv.find(
  (a, i) =>
    !a.startsWith("--") && !["--overrides", "--out"].includes(argv[i - 1]),
);
const outPath = opt("--out");
const ovPath = opt("--overrides");
if (!invPath || !outPath) {
  console.error(
    "Usage: node render-dataflow.mjs <inventory.json> [--overrides <file>] --out <dataflow.md>",
  );
  process.exit(2);
}
const inv = JSON.parse(fs.readFileSync(invPath, "utf8"));
let ov = {};
let ovNote = "No overrides file supplied.";
if (ovPath) {
  if (fs.existsSync(ovPath)) {
    ov = JSON.parse(fs.readFileSync(ovPath, "utf8"));
    ovNote = `Manual overrides applied from \`${path.basename(ovPath)}\`.`;
  } else ovNote = `Overrides file \`${ovPath}\` not found; none applied.`;
}

// ------------------------------------------------------------ helpers
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE", "MUTATION", "ANY"]);
const RANK = { high: 3, medium: 2, low: 1 };
const minConf = (...c) =>
  c.filter(Boolean).sort((a, b) => RANK[a] - RANK[b])[0] || "low";
const cite = (e) => (e ? `${e.file}:${e.line}` : "n/a");
const md = (s) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
const lbl = (s) =>
  String(s ?? "")
    .replace(/"/g, "'")
    .replace(/[<>{}`]/g, "")
    .replace(/;/g, ",")
    .replace(/#/g, "no.")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
const ident = (s) =>
  String(s)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^(\d)/, "_$1");
const routeLabel = (r) => `${r.method} ${r.path}`;
const byId = new Map(inv.routes.map((r) => [r.id, r]));
const writeById = new Map(inv.writes.map((w) => [w.id, w]));
const tableByName = new Map(inv.tables.map((t) => [t.name, t]));
const findRoute = (key) =>
  inv.routes.find(
    (r) =>
      r.id === key ||
      routeLabel(r) === key ||
      (r.aliases || []).some((a) => `${r.method} ${a}` === key),
  );

// ------------------------------------------------------------ apply overrides (copy-on-write)
const routes = inv.routes.map((r) => ({
  ...r,
  writeIds: [...(r.writeIds || [])],
  queries: [...r.queries],
  notes: [],
  manual: false,
}));
const rById = new Map(routes.map((r) => [r.id, r]));
const unresolvedDismissed = [];
for (const l of ov.routeLinks || []) {
  const r = l.route && findRoute(l.route) && rById.get(findRoute(l.route).id);
  if (!r) continue;
  for (const wid of l.writes || [])
    if (!r.writeIds.includes(wid) && writeById.has(wid)) r.writeIds.push(wid);
  if (l.delegatesTo) {
    const t =
      findRoute(l.delegatesTo) && rById.get(findRoute(l.delegatesTo).id);
    if (t) {
      for (const wid of t.writeIds)
        if (!r.writeIds.includes(wid)) r.writeIds.push(wid);
      r.queries = [
        ...r.queries,
        ...t.queries.map((q) => ({
          ...q,
          linked: "delegated",
          confidence: "medium",
        })),
      ];
      r.metrics = { ...t.metrics };
      r.notes.push(`Delegates to ${routeLabel(t)} (manual link).`);
    }
  }
  r.manual = true;
  if (l.note) r.notes.push(l.note);
}
for (const n of ov.routeNotes || []) {
  const f = findRoute(n.route);
  if (f) rById.get(f.id).notes.push(n.note);
}
for (const c of ov.confidence || []) {
  const f = findRoute(c.id);
  if (f) rById.get(f.id).confidence = c.confidence;
}
const isWriteRoute = (r) => r.writeIds.length > 0 || MUTATING.has(r.method);
const writeRoutes = routes.filter(isWriteRoute);

// ------------------------------------------------------------ section 1
const L = [];
const push = (...x) => L.push(...x);
const m = inv.meta;
push(`# Data flow: ${m.repo}`, "");
if (m.ormCoverage !== "full") {
  const why =
    m.ormCoverage === "partial"
      ? "part of the database writes use raw SQL (`db.query` / `pool.query` / `client.query`) instead of the Drizzle query builder"
      : m.ormCoverage === "schema-only"
        ? "Drizzle is used only to define the schema; runtime writes are raw SQL"
        : "no Drizzle schema was found";
  push(
    `> **Coverage is limited:** ${why}. The field-to-column table below is derived from SQL text and variable tracing, so it is **not guaranteed complete**. Every row carries a confidence level; see Section 8 for what could not be resolved.`,
    "",
  );
}
push("## 1. Coverage and assumptions", "");
push(`- **Parse mode:** \`${m.parseMode}\` (${m.note}).`);
push(
  `- **ORM coverage:** \`${m.ormCoverage}\`. Write calls by API: ${
    Object.entries(m.writeApis)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "none"
  }.`,
);
push(
  `- **Scope:** ${m.counts.routes} routes (${writeRoutes.length} write routes), ${m.counts.tables} Drizzle tables, ${m.counts.writes} write calls (${m.counts.appWrites} in application code), ${m.counts.clientCalls} client calls, ${m.counts.filesScanned} source files scanned.`,
);
push(
  "- **Method:** static analysis only. No database, Redis, or server was contacted; `.env*` files were not read.",
);
push(`- **Overrides:** ${ovNote}`);
const confCount = (arr) =>
  ["high", "medium", "low"]
    .map((c) => `${c}=${arr.filter((x) => x.confidence === c).length}`)
    .join(", ");
push(
  `- **Confidence summary:** routes (${confCount(routes)}); writes (${confCount(inv.writes)}); client calls (${confCount(inv.clientCalls)}).`,
);
push(
  "- **Reading confidence:** `high` = found directly in the handler or schema; `medium` = reached through one helper hop or partly inferred; `low` = heuristic link, dynamic SQL, or unresolved value.",
);
push(
  "- **Limits:** middleware order is not evaluated (all `app.use` middleware whose prefix matches is listed); loops are counted once and flagged; helper calls are followed two hops.",
  "",
);

// ------------------------------------------------------------ section 2
push("## 2. System overview", "");
const pm2 = inv.infra.pm2;
const prodPm2 =
  pm2.find((p) => /prod/i.test(p.app) && !/worker/i.test(p.app)) ||
  pm2.find((p) => !/worker|staging/i.test(p.app)) ||
  pm2[0];
const appPools = inv.infra.pools.filter((p) => p.context !== "script");
const poolSum = appPools.reduce((a, p) => a + (p.max || 0), 0);
const globalNames = [
  ...new Set(
    routes.flatMap((r) =>
      r.middleware.detail.filter((d) => d.via === "app.use").map((d) => d.name),
    ),
  ),
].slice(0, 6);
const hasRedis = inv.infra.redis.packages.length > 0;
const hasPgb = inv.infra.pgbouncer.length > 0;
const nginxN = inv.infra.nginx.length;
push("```mermaid", "flowchart LR");
push(`  B["Browser (client calls: ${inv.clientCalls.length})"]`);
push(
  `  N["nginx reverse proxy${nginxN ? ` (${nginxN} directives found)` : " (no config found in repo)"}"]`,
);
push(
  `  P["Node / PM2${prodPm2 ? `: ${lbl(prodPm2.app)}, instances ${lbl(prodPm2.instances)}, ${lbl(prodPm2.execMode || "")}` : " (no PM2 config found)"}"]`,
);
push(`  M["Middleware: ${lbl(globalNames.join(", ") || "none detected")}"]`);
push(`  H["Handlers: ${routes.length} routes (${writeRoutes.length} write)"]`);
push(
  `  D["${inv.infra.drizzleClients.length ? "Drizzle client" : "Database client (raw SQL via pg Pool)"}${appPools.length ? `: pool max ${appPools.map((p) => p.max ?? "?").join("+")}` : ""}"]`,
);
push(`  PG["PostgreSQL: ${inv.tables.length} schema tables"]`);
push("  B --> N --> P --> M --> H --> D");
if (hasPgb) {
  push(
    `  PB["${inv.infra.pgbouncer.every((p) => p.note) ? "PgBouncer? (only the port 6432 default was found, unconfirmed)" : "PgBouncer (referenced in repo)"}"]`,
  );
  push("  D --> PB --> PG");
} else push("  D -->|direct, no pooler found| PG");
if (hasRedis) {
  push(
    `  R["Redis: ${lbl([...new Set(inv.infra.redis.packages.map((p) => p.name))].join(", "))}"]`,
  );
  push("  H -.->|queue / cache| R");
}
push("```", "");
if (poolSum)
  push(
    `Pool sizes found in application code sum to **${poolSum}** connections per Node process (${appPools.map((p) => `${p.max ?? "?"} at ${cite(p.evidence)}`).join("; ")}). Multiply by PM2 instances for the worst case.`,
    "",
  );

// ------------------------------------------------------------ section 3
push("## 3. Write routes", "");
if (!writeRoutes.length) push("_No write routes detected._", "");
const stepLine = (q) => {
  const what = q.op === "read" ? "SELECT" : q.op.toUpperCase();
  const tbl = q.table ? ` ${q.table}` : "";
  return `${what}${tbl}`;
};
for (const r of writeRoutes) {
  const qs = r.queries.filter(
    (q) =>
      q.op !== "ROLLBACK" && q.op !== "session" && !q.deferred && !q.errorPath,
  );
  const eq = r.queries.filter(
    (q) => q.op !== "ROLLBACK" && q.op !== "session" && q.errorPath,
  );
  const dq = r.queries.filter(
    (q) => q.op !== "ROLLBACK" && q.op !== "session" && q.deferred,
  );
  const m2 = r.metrics;
  push(`### ${routeLabel(r)}`, "");
  push(
    `- **Handler:** ${r.handler ? `${cite(r.handler)} (${r.handler.name})` : "not located"}; **registered at** ${cite(r.evidence)}; **confidence:** ${r.confidence}${r.manual ? " (manual link)" : ""}`,
  );
  if (r.aliases?.length) push(`- **Also mounted at:** ${r.aliases.join(", ")}`);
  push(
    `- **Middleware:** ${r.middleware.names.length ? r.middleware.names.map(lbl).join(", ") : "none detected"} (auth: ${r.middleware.classes.auth ? "yes" : r.authInHandler ? "checked inside handler" : "not seen"}; rate limit: ${r.middleware.classes.rateLimit ? "yes" : "not seen"}; validation: ${r.middleware.classes.validation ? "yes" : "not seen"})`,
  );
  const direct = r.requestFields
    .filter((f) => f.via === "direct" || f.via == null)
    .map((f) => `${f.location}.${f.name}`);
  push(
    `- **Request fields read in handler:** ${direct.length ? direct.join(", ") : "none seen"}${r.bodyUsedWhole ? " (whole body also used)" : ""}`,
  );
  if (r.requestFields.some((f) => f.via === "helper"))
    push(
      `- **Read by helper functions:** ${[...new Set(r.requestFields.filter((f) => f.via === "helper").map((f) => `${f.location}.${f.name}`))].join(", ")}`,
    );
  push("", "```mermaid", "sequenceDiagram");
  push(
    "  participant C as Client",
    "  participant S as Server handler",
    "  participant DB as PostgreSQL",
  );
  if (r.sideEffects?.length) push("  participant X as Queue or Redis");
  push(`  C->>S: ${lbl(routeLabel(r))}`);
  const cap = 40;
  qs.slice(0, cap).forEach((q, i) => {
    const tag = q.linked && q.linked !== "direct" ? ` [${q.linked}]` : "";
    if (q.inLoop) push("  loop for each item");
    push(`  S->>DB: ${i + 1}. ${lbl(stepLine(q))}${tag}`);
    push(
      `  DB-->>S: ${q.op === "read" ? "rows" : ["BEGIN", "COMMIT"].includes(q.op) ? "ok" : "ok"}`,
    );
    if (q.inLoop) push("  end");
  });
  if (qs.length > cap)
    push(`  Note over S,DB: ${qs.length - cap} more queries not drawn`);
  if (!qs.length)
    push("  Note over S: no database query detected for this route");
  if (r.transaction?.callback && !qs.some((q) => q.op === "BEGIN"))
    push("  Note over S,DB: queries run inside a transaction callback");
  for (const s of r.sideEffects || []) push(`  S-)X: ${lbl(s.name)} (async)`);
  const resp =
    (r.responses || []).find((x) => x.status < 400) || (r.responses || [])[0];
  push(`  S-->>C: ${resp ? resp.status : "response"}`);
  if (dq.length) {
    push("  Note over S,DB: after the response (deferred, same process)");
    dq.slice(0, 15).forEach((q, i) => {
      push(`  S->>DB: d${i + 1}. ${lbl(stepLine(q))} [${q.linked}]`);
      push("  DB-->>S: ok");
    });
    if (dq.length > 15)
      push(
        `  Note over S,DB: ${dq.length - 15} more deferred queries not drawn`,
      );
  }
  if (eq.length) {
    push("  alt on error (catch block)");
    eq.slice(0, 6).forEach((q, i) => {
      push(`    S->>DB: e${i + 1}. ${lbl(stepLine(q))} [${q.linked}]`);
      push("    DB-->>S: ok");
    });
    push("  end");
  }
  push("```", "");
  push("Steps:");
  let n = 1;
  push(`${n++}. Client sends \`${routeLabel(r)}\`.`);
  if (r.middleware.names.length)
    push(`${n++}. Middleware runs: ${r.middleware.names.map(lbl).join(", ")}.`);
  for (const q of qs) {
    const w = q.writeId ? writeById.get(q.writeId) : null;
    const extra = w
      ? ` (${w.columns.length} columns${w.conflict ? `, ON CONFLICT ${w.conflict.action}` : ""}${w.batch ? ", multi-row" : ""})`
      : "";
    push(
      `${n++}. ${stepLine(q)}${extra}${q.inLoop ? " **inside a loop**" : ""} — ${cite(q.evidence)} [${q.linked}, ${q.confidence}]`,
    );
  }
  for (const s of r.sideEffects || [])
    push(`${n++}. Side effect: \`${s.name}\` — ${cite(s)}`);
  push(
    `${n++}. Response${resp ? ` ${resp.status}` : ""}${resp ? ` — ${cite({ file: r.handler?.file || r.evidence.file, line: resp.line })}` : ""}.`,
  );
  if (eq.length) {
    push(`${n++}. **Only when an error is caught (not counted below):**`);
    for (const q of eq)
      push(
        `   - ${stepLine(q)} — ${cite(q.evidence)} [${q.linked}, ${q.confidence}]`,
      );
  }
  if (dq.length) {
    push(`${n++}. **After the response (deferred):**`);
    for (const q of dq)
      push(
        `   - ${stepLine(q)} — ${cite(q.evidence)} [${q.linked}, ${q.confidence}]`,
      );
  }
  push("");
  const loopNote = m2.inLoop
    ? `; **${m2.inLoop} of these run inside loops (multiplied by item count)**`
    : "";
  push(
    `**Queries per request:** ${m2.dataQueries} data queries (${m2.reads} reads, ${m2.writes} writes) + ${m2.txControl} transaction-control statements = **${m2.roundTrips} round trips**${loopNote}${m2.deferredQueries ? `; plus ${m2.deferredQueries} deferred queries (${m2.deferredWrites || 0} writes) that run after the response in the same process` : ""}${m2.errorPathQueries ? `; ${m2.errorPathQueries} more run only in a catch block (error path, not counted)` : ""}.`,
    "",
  );
  for (const note of r.notes) push(`> Note: ${note}`);
  if (r.notes.length) push("");
}

// ------------------------------------------------------------ writes by table (shared)
const usedWrites = new Map(); // writeId -> {write, routes[]}
for (const r of writeRoutes)
  for (const id of r.writeIds) {
    const w = writeById.get(id);
    if (!w) continue;
    if (!usedWrites.has(id)) usedWrites.set(id, { w, routes: [] });
    usedWrites.get(id).routes.push(r);
  }
const writtenTables = [
  ...new Set([...usedWrites.values()].map((x) => x.w.table).filter(Boolean)),
].sort();

// ------------------------------------------------------------ section 4
push("## 4. Entity-relationship diagram", "");
const erTables = writtenTables.map(
  (n) =>
    tableByName.get(n) || {
      name: n,
      columns: [],
      constraints: [],
      missing: true,
    },
);
if (!erTables.length) push("_No written tables detected._", "");
else {
  push(
    "Tables written by the routes above. Tables marked _not in schema file_ exist only as raw SQL targets and have no column metadata.",
    "",
  );
  push("```mermaid", "erDiagram");
  const inSet = new Set(erTables.map((t) => t.name));
  for (const t of erTables) {
    push(`  ${ident(t.name)} {`);
    const uniqueCols = new Set(
      t.constraints
        .filter((c) => /unique/.test(c.kind))
        .flatMap((c) => c.columns),
    );
    for (const c of t.columns) {
      const keys = [
        c.primaryKey ? "PK" : null,
        c.references ? "FK" : null,
        c.unique || uniqueCols.has(c.name) ? "UK" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const ty =
        ident(String(c.type).replace(/\(.*\)/, "")) + (c.array ? "_array" : "");
      push(
        `    ${ty} ${ident(c.name)}${keys ? " " + keys : ""} "${c.notNull ? "not null" : "nullable"}${c.length ? ", len " + c.length : ""}"`,
      );
    }
    if (t.missing || !t.columns.length)
      push('    text not_in_schema_file "no column metadata"');
    push("  }");
  }
  for (const t of erTables)
    for (const c of t.columns)
      if (c.references && inSet.has(c.references.table))
        push(
          `  ${ident(c.references.table)} ||--o{ ${ident(t.name)} : "${ident(c.name)}"`,
        );
  push("```", "");
  const missing = erTables.filter((t) => t.missing).map((t) => t.name);
  if (missing.length) push(`_Not in schema file:_ ${missing.join(", ")}`, "");
}

// ------------------------------------------------------------ section 5
push("## 5. Field-to-column table", "");
const piiByCol = new Map();
for (const p of inv.personalDataFields)
  if (p.kind === "column") piiByCol.set(p.where, p.class);
const validatorsById = new Map(inv.validators.map((v) => [v.id, v]));
const typeStr = (c) =>
  c
    ? `${c.type}${c.length ? "(" + c.length + ")" : ""}${c.array ? "[]" : ""}`
    : "?";
const idxStr = (t, c) => {
  if (!t || !c) return "";
  const out = [];
  if (c.primaryKey) out.push("PK");
  if (c.unique) out.push("unique");
  for (const k of t.constraints)
    if (k.columns.includes(c.name))
      out.push(
        `${k.kind}${k.name ? " " + k.name : ""}${k.columns.length > 1 ? " (" + k.columns.join("+") + ")" : ""}`,
      );
  return [...new Set(out)].join("; ");
};
const rows = new Map();
const addRow = (row) => {
  const k = [
    row.table,
    row.column,
    row.source,
    row.clientField,
    row.transform,
  ].join("\u0001");
  if (rows.has(k)) {
    const e = rows.get(k);
    for (const rt of row.routes) if (!e.routes.includes(rt)) e.routes.push(rt);
    e.confidence = minConf(e.confidence, row.confidence);
  } else rows.set(k, row);
};
const mappedColumns = new Map(); // table -> Set(column)
for (const { w, routes: rs } of usedWrites.values()) {
  if (!w.table) continue;
  const t = tableByName.get(w.table);
  for (const col of w.columns) {
    if (!mappedColumns.has(w.table)) mappedColumns.set(w.table, new Set());
    mappedColumns.get(w.table).add(col.column);
    const cobj = t?.columns.find((c) => c.name === col.column);
    const base = {
      table: w.table,
      column: col.column,
      routes: rs.map(routeLabel),
      dbType: t ? typeStr(cobj) : "(table not in schema file)",
      nullDef: cobj
        ? `${cobj.notNull ? "NOT NULL" : "nullable"}${cobj.default ? "; default " + cobj.default : ""}`
        : "",
      idx: idxStr(t, cobj),
      pii: piiByCol.get(`${w.table}.${col.column}`) || "",
      transform: col.transform === "none" ? "" : col.transform,
    };
    const wc = minConf(
      w.confidence,
      w.linked === "heuristic" ? "low" : "high",
      w.dynamic ? "low" : "high",
    );
    if (col.source === "client" || col.source === "mixed") {
      for (const cf of col.clientFields.length
        ? col.clientFields
        : ["body.*"]) {
        const [loc, ...f] = cf.split(".");
        const field = f.join(".");
        let validation = "none found";
        for (const r of rs)
          for (const vid of r.validatorIds || []) {
            const vf = validatorsById
              .get(vid)
              ?.fields.find((x) => x.name === field);
            if (vf)
              validation = `${validatorsById.get(vid).library}: ${vf.type}${vf.limits ? " " + vf.limits : ""}${vf.required ? ", required" : ", optional"}`;
          }
        addRow({
          ...base,
          source: col.source,
          clientField: field && field !== "*" ? field : "(whole " + loc + ")",
          location: loc,
          validation,
          confidence: col.source === "mixed" ? minConf(wc, "medium") : wc,
          note:
            col.source === "mixed" ? "server value with client fallback" : "",
          fallback: col.fallbackLiteral,
        });
      }
    } else if (col.source === "server")
      addRow({
        ...base,
        source: "server",
        clientField: "(server-derived)",
        location: "—",
        validation: "n/a",
        confidence: wc,
        note: "",
      });
    else if (col.source === "literal")
      addRow({
        ...base,
        source: "literal",
        clientField: "(literal/default)",
        location: "—",
        validation: "n/a",
        confidence: wc,
        note: "",
      });
    else
      addRow({
        ...base,
        source: "unknown",
        clientField: "(unknown)",
        location: "?",
        validation: "?",
        confidence: "low",
        note: "value comes from a parameter or expression the scanner could not trace",
      });
  }
}
// columns never written by any route -> default/unknown
for (const tn of writtenTables) {
  const t = tableByName.get(tn);
  if (!t) continue;
  const done = mappedColumns.get(tn) || new Set();
  for (const c of t.columns) {
    if (done.has(c.name)) continue;
    const hasDef = !!c.default || !c.notNull;
    addRow({
      table: tn,
      column: c.name,
      routes: [],
      source: hasDef ? "default" : "unknown",
      clientField: hasDef ? "(default)" : "(unknown)",
      location: "—",
      validation: "n/a",
      transform: "",
      dbType: typeStr(c),
      nullDef: `${c.notNull ? "NOT NULL" : "nullable"}${c.default ? "; default " + c.default : ""}`,
      idx: idxStr(t, c),
      pii: piiByCol.get(`${tn}.${c.name}`) || "",
      confidence: hasDef ? "medium" : "low",
      note: hasDef
        ? "not set by any detected write; DB default or NULL"
        : "NOT NULL without default and not set by any detected write",
    });
  }
}
for (const tn of writtenTables) {
  if ([...rows.values()].some((r) => r.table === tn)) continue;
  const t = tableByName.get(tn);
  addRow({
    table: tn,
    column: "*",
    routes: [...usedWrites.values()]
      .filter((x) => x.w.table === tn)
      .flatMap((x) => x.routes.map(routeLabel)),
    source: "unknown",
    clientField: "(unknown)",
    location: "?",
    validation: "?",
    transform: "",
    dbType: t ? "" : "(table not in schema file)",
    nullDef: "",
    idx: "",
    pii: "",
    confidence: "low",
    note: "column list is built at runtime or the table name is dynamic; see Section 8",
  });
}
for (const mo of ov.fieldMappings || []) {
  const t = tableByName.get(mo.table);
  const cobj = t?.columns.find((c) => c.name === mo.column);
  addRow({
    table: mo.table,
    column: mo.column,
    source: "client",
    clientField: mo.clientField,
    location: mo.location || "body",
    validation: mo.validation || "none found",
    transform: mo.transform || "",
    dbType: t ? typeStr(cobj) : "?",
    nullDef: cobj
      ? `${cobj.notNull ? "NOT NULL" : "nullable"}${cobj.default ? "; default " + cobj.default : ""}`
      : "",
    idx: idxStr(t, cobj),
    pii: piiByCol.get(`${mo.table}.${mo.column}`) || "",
    routes: mo.route ? [mo.route] : [],
    confidence: "high",
    note: "manual",
  });
}
const rowList = [...rows.values()].sort((a, b) =>
  a.table + a.column + a.clientField < b.table + b.column + b.clientField
    ? -1
    : 1,
);
push("### 5.1 Mapped fields", "");
push(
  "| Client field | Request location | Validation | Transform | Table.column | DB type | Nullable/default | Index/unique | Possible personal data | Confidence | Routes |",
);
push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rowList) {
  const rs =
    r.routes.length > 3
      ? `${r.routes.slice(0, 3).join("; ")} +${r.routes.length - 3}`
      : r.routes.join("; ");
  push(
    `| ${md(r.clientField)}${r.note ? ` _(${md(r.note)})_` : ""}${r.fallback ? " _(hardcoded fallback)_" : ""} | ${md(r.location)} | ${md(r.validation)} | ${md(r.transform)} | ${md(r.table)}.${md(r.column)} | ${md(r.dbType)} | ${md(r.nullDef)} | ${md(r.idx)} | ${md(r.pii)} | ${r.confidence} | ${md(rs)} |`,
  );
}
if (!rowList.length) push("| _none_ | | | | | | | | | | |");
push("");
// 5.2 unmapped client fields
push("### 5.2 Unmapped client fields", "");
push(
  "Fields the handler reads (or the validator declares) that were not traced into any column of that route's writes.",
  "",
);
let anyUnmapped = false;
for (const r of writeRoutes) {
  const mapped = new Set();
  for (const id of r.writeIds)
    for (const c of writeById.get(id)?.columns || [])
      for (const cf of c.clientFields) mapped.add(cf);
  const wholeBody = [...mapped].some((x) => x.endsWith(".*"));
  const direct = r.requestFields
    .filter(
      (f) =>
        ((f.via === "direct" || f.via == null) && f.location !== "headers") ||
        (f.location === "headers" && f.via === "direct"),
    )
    .map((f) => `${f.location}.${f.name}`);
  const val = (r.validatorIds || []).flatMap((id) =>
    (validatorsById.get(id)?.fields || []).map((f) => `body.${f.name}`),
  );
  const all = [...new Set([...direct, ...val])];
  const un = all.filter((f) => !mapped.has(f));
  if (un.length) {
    anyUnmapped = true;
    push(
      `- **${routeLabel(r)}**: ${un.join(", ")}${wholeBody ? " _(whole body is also stored, so some of these may be inside a JSON column)_" : ""}`,
    );
  }
}
if (!anyUnmapped) push("_None._");
push("");
// 5.3 unmapped columns
push("### 5.3 Unmapped columns", "");
push(
  "Columns of written tables that no detected write sets (they rely on DB defaults, NULL, or code the scanner did not reach).",
  "",
);
let anyCol = false;
for (const tn of writtenTables) {
  const t = tableByName.get(tn);
  if (!t) continue;
  const done = mappedColumns.get(tn) || new Set();
  const un = t.columns
    .filter((c) => !done.has(c.name))
    .map(
      (c) =>
        `${c.name}${c.notNull && !c.default ? " (NOT NULL, no default)" : ""}`,
    );
  if (un.length) {
    anyCol = true;
    push(`- **${tn}**: ${un.join(", ")}`);
  }
}
if (!anyCol) push("_None._");
push("");

// ------------------------------------------------------------ section 6
push("## 6. Client save behavior", "");
const mutCalls = inv.clientCalls.filter((c) => c.method !== "GET");
push(
  `${mutCalls.length} non-GET client calls of ${inv.clientCalls.length} total. Behavior flags come from a window of code around each call (and from the whole file when marked _file_).`,
  "",
);
push(
  "| Trigger (file:line) | Call | Linked route | Retry/backoff | Draft handling | Unload / logout | Idempotency key | Confidence |",
);
push("|---|---|---|---|---|---|---|---|");
const flag = (c, k, pretty) =>
  (c.behavior[k] ? "yes" : c.fileLevelSignals?.[k] ? "_file_" : "—") +
  (k === "retry" && c.behavior.retry
    ? c.behavior.jitter
      ? " (jitter)"
      : " (no jitter seen)"
    : "");
for (const c of mutCalls) {
  const lr = c.routeIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(routeLabel);
  push(
    `| ${cite(c.evidence)}${c.behavior.debounce ? " (debounced/auto-save)" : ""} | ${md(c.method)} ${md(c.url || "(url not static)")}${c.bodyKeys ? "<br>body keys: " + md(c.bodyKeys.join(", ")) : c.bodyNote ? "<br>" + md(c.bodyNote) : ""} | ${md(lr.join("; ") || "unlinked")} | ${flag(c, "retry")} | ${flag(c, "draft")} | ${flag(c, "unload")}${c.behavior.logout || c.fileLevelSignals?.logout ? " / logout seen" : ""} | ${c.behavior.idempotency ? "possible" : "none seen"} | ${c.confidence} |`,
  );
}
if (!mutCalls.length) push("| _none_ | | | | | | | |");
push("");

// ------------------------------------------------------------ section 7
push("## 7. Findings", "");
const F = [];
const add = (severity, rule, where, evidence, why) =>
  F.push({ severity, rule, where, evidence, why });
const list = (arr, n = 12) =>
  arr.length > n
    ? arr.slice(0, n).join("; ") + `; +${arr.length - n} more`
    : arr.join("; ");
const TENANT =
  /^(school_?id|tenant_?id|org(anization)?_?id|workspace_?id|account_?id|company_?id)$/i;
{
  const multi = writeRoutes.filter((r) => r.metrics.roundTrips > 1);
  if (multi.length)
    add(
      "info",
      "More than one query per request",
      list(multi.map((r) => `${routeLabel(r)} (${r.metrics.roundTrips})`)),
      "See Section 3 per route",
      "Each extra round trip holds a pooled connection longer; peak connection demand = request rate x total query time.",
    );
  const deferredRoutes = writeRoutes.filter((r) => r.metrics.deferredQueries);
  if (deferredRoutes.length)
    add(
      "info",
      "Database work continues after the response (deferred, same process)",
      list(
        deferredRoutes.map(
          (r) => `${routeLabel(r)} (${r.metrics.deferredQueries})`,
        ),
      ),
      list(
        deferredRoutes.map((r) => cite(r.evidence)),
        6,
      ),
      "The client sees a response before this work commits; it also competes for the same Node process and pool during a burst.",
    );
  const syncWriteIds = (r) =>
    r.writeIds.filter(
      (id) => !r.queries.some((q) => q.writeId === id && q.deferred),
    );
  const nonAtomic = writeRoutes.filter(
    (r) =>
      syncWriteIds(r).length >= 2 &&
      syncWriteIds(r).some((id) => !writeById.get(id)?.inTransaction),
  );
  if (nonAtomic.length)
    add(
      "high",
      "Several writes outside a transaction",
      list(nonAtomic.map(routeLabel)),
      list(
        nonAtomic.map((r) => cite(r.evidence)),
        6,
      ),
      "A failure between writes leaves partial data; a retry may duplicate the first writes.",
    );
  const loops = writeRoutes.filter((r) => r.metrics.inLoop > 0);
  if (loops.length)
    add(
      "medium",
      "Queries inside loops (N+1 round trips)",
      list(loops.map((r) => `${routeLabel(r)} (${r.metrics.inLoop})`)),
      list(
        loops.flatMap((r) =>
          r.queries
            .filter((q) => q.inLoop)
            .slice(0, 1)
            .map((q) => cite(q.evidence)),
        ),
        6,
      ),
      "Round trips grow with the item count; consider one multi-row statement per chunk.",
    );
  const jsonCols = [];
  for (const tn of writtenTables)
    for (const c of tableByName.get(tn)?.columns || [])
      if (/^jsonb?$/.test(c.type)) jsonCols.push(`${tn}.${c.name}`);
  if (jsonCols.length)
    add(
      "medium",
      "JSON/JSONB columns are written",
      list(jsonCols),
      list(
        jsonCols.map((x) => cite(tableByName.get(x.split(".")[0])?.evidence)),
        4,
      ),
      "Large documents increase WAL, TOAST and row size; whole-document rewrites on each save amplify write load.",
    );
  const noIdem = writeRoutes.filter(
    (r) =>
      syncWriteIds(r).some((id) => writeById.get(id)?.op === "insert") &&
      !syncWriteIds(r).some((id) => writeById.get(id)?.conflict) &&
      !r.idempotencySignal,
  );
  if (noIdem.length)
    add(
      "medium",
      "Insert without a submission ID or ON CONFLICT",
      list(noIdem.map(routeLabel)),
      list(
        noIdem.map((r) => cite(r.evidence)),
        6,
      ),
      "A client retry or double click creates duplicate rows or fails on a primary-key conflict.",
    );
  const tenantBad = [];
  const tenantMixed = [];
  const fallbackLit = [];
  for (const { w, routes: rs } of usedWrites.values())
    for (const c of w.columns)
      if (TENANT.test(c.column)) {
        const lbls = `${w.table}.${c.column} (${cite(w.evidence)})`;
        if (c.source === "client") tenantBad.push(lbls);
        else if (c.source === "mixed") tenantMixed.push(lbls);
        if (c.fallbackLiteral) fallbackLit.push(lbls);
      }
  if (tenantBad.length)
    add(
      "high",
      "Tenant read from client input",
      list([...new Set(tenantBad)]),
      list([...new Set(tenantBad)], 4),
      "Tenant must come from the verified token; a client-supplied value lets one tenant write into another.",
    );
  if (tenantMixed.length)
    add(
      "medium",
      "Tenant has a client-supplied fallback",
      list([...new Set(tenantMixed)]),
      list([...new Set(tenantMixed)], 4),
      "The server value is used first but the request body can still supply the tenant when it is missing.",
    );
  if (fallbackLit.length)
    add(
      "medium",
      "Hardcoded fallback value for tenant",
      list([...new Set(fallbackLit)]),
      list([...new Set(fallbackLit)], 4),
      "A literal default can silently file data under the wrong tenant.",
    );
  const noAuth = writeRoutes.filter(
    (r) => !r.middleware.classes.auth && !r.authInHandler,
  );
  if (noAuth.length)
    add(
      "high",
      "Write route without an auth middleware name",
      list(noAuth.map(routeLabel)),
      list(
        noAuth.map((r) => cite(r.evidence)),
        6,
      ),
      "Scanner matches middleware names only; confirm whether auth is applied some other way.",
    );
  const rbc = writeRoutes.filter((r) => r.responseBeforeCommit);
  if (rbc.length)
    add(
      "medium",
      "Response sent before the write or commit (possible)",
      list(rbc.map((r) => `${routeLabel(r)} (${r.responseBeforeCommit.kind})`)),
      list(
        rbc.map((r) =>
          cite({
            file: r.handler?.file || r.evidence.file,
            line: r.responseBeforeCommit.line,
          }),
        ),
        6,
      ),
      "If the response reaches the client before COMMIT, the UI can show saved for data that is lost on failure.",
    );
  const ddl = routes.filter((r) => r.queries.some((q) => q.op === "ddl"));
  if (ddl.length)
    add(
      "medium",
      "Schema change (DDL) executed in the request path",
      list(ddl.map(routeLabel)),
      list(
        ddl.map((r) => cite(r.queries.find((q) => q.op === "ddl").evidence)),
        6,
      ),
      "CREATE/ALTER at request time takes locks and runs on every call or first call per process.",
    );
  const noWhere = [...usedWrites.values()].filter(
    ({ w }) => (w.op === "update" || w.op === "delete") && w.hasWhere === false,
  );
  if (noWhere.length)
    add(
      "high",
      "UPDATE/DELETE without WHERE",
      list(noWhere.map(({ w }) => `${w.table || "?"} (${cite(w.evidence)})`)),
      list(
        noWhere.map(({ w }) => cite(w.evidence)),
        6,
      ),
      "Affects every row of the table.",
    );
  const BARE_AGG =
    /SELECT\s+(COUNT\s*\(\s*\*?\s*\)|MAX\s*\(\s*\w+\s*\))(\s+AS\s+\w+)?\s+FROM/i;
  const countThenInsert = writeRoutes.filter(
    (r) =>
      r.queries.some(
        (q) => q.op === "read" && BARE_AGG.test(q.sqlHead || ""),
      ) && r.writeIds.some((id) => writeById.get(id)?.op === "insert"),
  );
  if (countThenInsert.length)
    add(
      "low",
      "Bare COUNT/MAX query in a route that inserts (possible ID generation)",
      list(countThenInsert.map(routeLabel)),
      list(
        countThenInsert.map((r) =>
          cite(r.queries.find((q) => BARE_AGG.test(q.sqlHead || "")).evidence),
        ),
        6,
      ),
      "If the count or max feeds a new ID, two simultaneous requests can read the same value and generate the same ID. Read the code to confirm, then use a sequence, UUID or the client submission ID.",
    );
  const big = [];
  const toMb = (s) => {
    const mm = /^(\d+(?:\.\d+)?)\s*([kmg])?b?$/i.exec(String(s).trim());
    return mm
      ? Number(mm[1]) *
          { k: 1 / 1024, m: 1, g: 1024 }[(mm[2] || "m").toLowerCase()]
      : 0;
  };
  for (const b of inv.infra.bodyLimits)
    if (toMb(b.limit) > 1)
      big.push(`express body limit ${b.limit} (${cite(b.evidence)})`);
  for (const n of inv.infra.nginx)
    if (
      /client_max_body_size/.test(n.directive) &&
      toMb(n.directive.split(/\s+/)[1]) > 1
    )
      big.push(`${n.directive} (${cite(n.evidence)})`);
  if (big.length)
    add(
      "medium",
      "Large request body limit",
      list(big),
      list(big, 4),
      "A burst of large bodies is held in memory by Node before any validation; a 50 MB limit multiplied by concurrent requests can exhaust process memory.",
    );
  if (poolSum)
    add(
      "info",
      "Pool size per Node process",
      `${appPools.length} pool(s), max sum ${poolSum}`,
      list(
        appPools.map((p) => cite(p.evidence)),
        6,
      ),
      "Worst-case connections = PM2 instances x sum of pool max; compare with the database max_connections or PgBouncer limits.",
    );
  if (hasPgb && inv.infra.pgbouncer.every((p) => p.note))
    add(
      "info",
      "PgBouncer only inferred from a port default",
      list(inv.infra.pgbouncer.map((p) => cite(p.evidence))),
      list(inv.infra.pgbouncer.map((p) => cite(p.evidence))),
      "Confirm that a pooler really runs on that port, its pool mode (transaction vs session), pool size and max_client_conn; the app uses pg.Pool, whose named prepared statements and session settings need checking under transaction pooling.",
    );
  if (!hasPgb)
    add(
      "info",
      "No PgBouncer reference found in the repo",
      "infrastructure",
      "n/a",
      "Connections go from Node straight to PostgreSQL unless a pooler is configured outside the repo; ask the owner.",
    );
  const pjs = inv.infra.postgresJs.filter((p) => p.prepare !== "false");
  if (pjs.length)
    add(
      "medium",
      "postgres-js client without prepare: false",
      list(pjs.map((p) => cite(p.evidence))),
      list(pjs.map((p) => cite(p.evidence))),
      "Prepared statements break under PgBouncer transaction pooling.",
    );
  if (hasRedis) {
    if (inv.infra.redis.config.some((c) => /MAXLEN/i.test(c.key)))
      add(
        "high",
        "Redis stream trimming (MAXLEN) in use",
        list(
          inv.infra.redis.config
            .filter((c) => /MAXLEN/i.test(c.key))
            .map((c) => cite(c.evidence)),
        ),
        "see evidence",
        "Trimming can delete entries that are not yet written to PostgreSQL; only trim acknowledged entries.",
      );
    if (!inv.infra.redis.config.some((c) => /maxmemory-policy/i.test(c.key)))
      add(
        "medium",
        "Redis maxmemory policy not found in the repo",
        "infrastructure",
        "n/a",
        "If the server uses an evicting policy, accepted-but-unwritten entries can be evicted; require noeviction.",
      );
    if (!inv.infra.redis.config.some((c) => /appendonly/i.test(c.key)))
      add(
        "medium",
        "Redis persistence (AOF) setting not found in the repo",
        "infrastructure",
        "n/a",
        "Without AOF a Redis restart loses everything not yet in PostgreSQL.",
      );
    if (inv.infra.redis.ttls.length)
      add(
        "medium",
        "Redis keys with a TTL",
        list(
          inv.infra.redis.ttls.map(
            (t) => `${t.call} ${t.seconds}s (${cite(t.evidence)})`,
          ),
        ),
        "see where",
        "Entries that expire before their PostgreSQL write commits are lost.",
      );
  }
  const pdWritten = new Set(
    inv.personalDataFields
      .filter(
        (p) =>
          p.kind === "column" && writtenTables.includes(p.where.split(".")[0]),
      )
      .map((p) => p.where),
  );
  if (pdWritten.size)
    add(
      "info",
      "Possible personal data in written tables",
      `${pdWritten.size} columns`,
      "names listed in Section 5",
      "Names only, matched by pattern. Confirm classification, retention, and whether values need masking in logs or backups.",
    );
  const retryNoJitter = mutCalls.filter(
    (c) => c.behavior.retry && !c.behavior.jitter,
  );
  if (retryNoJitter.length)
    add(
      "low",
      "Client retry without jitter seen",
      list(
        retryNoJitter.map((c) => cite(c.evidence)),
        6,
      ),
      list(
        retryNoJitter.map((c) => cite(c.evidence)),
        4,
      ),
      "Synchronised retries make a burst worse; add random jitter.",
    );
  const autos = mutCalls.filter((c) => c.behavior.debounce);
  if (autos.length)
    add(
      "low",
      "Auto-save or timer near a write call",
      list(
        autos.map((c) => cite(c.evidence)),
        6,
      ),
      list(
        autos.map((c) => cite(c.evidence)),
        4,
      ),
      "Auto-save multiplies write traffic per active user; check the interval and whether unchanged drafts are skipped.",
    );
}
const sevRank = { high: 0, medium: 1, low: 2, info: 3 };
F.sort(
  (a, b) =>
    sevRank[a.severity] - sevRank[b.severity] || (a.rule < b.rule ? -1 : 1),
);
push("### 7.1 Rule-based findings", "");
push("| Severity | Finding | Where | Evidence | Why it matters |");
push("|---|---|---|---|---|");
for (const f of F)
  push(
    `| ${f.severity} | ${md(f.rule)} | ${md(f.where)} | ${md(f.evidence)} | ${md(f.why)} |`,
  );
if (!F.length) push("| _none_ | | | | |");
push("");
push("### 7.2 Judgment findings", "");
const jf = ov.judgmentFindings || [];
if (!jf.length)
  push(
    "_None recorded yet. Add them to `overrides.json` under `judgmentFindings` (see reference/dataflow-analysis.md) and re-run this renderer._",
  );
else {
  push("| Severity | Finding | Evidence | Detail |");
  push("|---|---|---|---|");
  for (const f of jf)
    push(
      `| ${md(f.severity || "info")} | ${md(f.title)} | ${md(Array.isArray(f.evidence) ? f.evidence.join("; ") : f.evidence)} | ${md(f.detail)} |`,
    );
}
push("");

// ------------------------------------------------------------ section 8
push("## 8. Unresolved items", "");
const dismissed = new Map(
  (ov.dismissUnresolved || []).map((d) => [d.id, d.reason]),
);
const open = inv.unresolved.filter((u) => !dismissed.has(u.id));
const kinds = [...new Set(open.map((u) => u.kind))].sort();
if (!open.length) push("_None._", "");
for (const k of kinds) {
  push(`### ${k} (${open.filter((u) => u.kind === k).length})`, "");
  for (const u of open.filter((x) => x.kind === k))
    push(`- ${u.evidence ? cite(u.evidence) + " — " : ""}${u.message}`);
  push("");
}
if (dismissed.size) {
  push("### Dismissed with reason", "");
  for (const [id, reason] of dismissed) push(`- \`${id}\`: ${reason}`);
  push("");
}
push("### Owner questions", "");
const q = [];
q.push(
  "What are the expected normal and worst-case submissions per minute, and how long must a database outage be survivable?",
);
q.push("What is the VM size, the database tier, and its `max_connections`?");
if (!hasPgb)
  q.push("Is a connection pooler (PgBouncer) configured outside this repo?");
if (!nginxN)
  q.push(
    "Is nginx in front of Node, and what rate or body-size limits does it apply (no nginx directives were found in the repo)?",
  );
if (hasRedis)
  q.push(
    "Which Redis deployment is used (managed or self-hosted), with what `maxmemory`, `maxmemory-policy`, and persistence settings?",
  );
else
  q.push("Is Redis or another durable queue available if a buffer is needed?");
if (inv.unresolved.some((u) => u.kind === "unlinked-write"))
  q.push(
    "Which of the unlinked application writes (workers, helpers) run on every submission, and which are scripts?",
  );
q.forEach((x, i) => push(`${i + 1}. ${x}`));
push("");

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, L.join("\n") + "\n");
console.log(
  `dataflow: ${writeRoutes.length} write routes, ${erTables.length} tables, ${rowList.length} field rows, ${F.length} findings -> ${outPath}`,
);
