#!/usr/bin/env node
// External verification of the skill outputs against the acceptance criteria. Read-only.
// Usage: node validate-outputs.mjs [--dir docs/plans/submission-readiness] [--root .] [--allow <path-prefix> ...] [--no-mmdc]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const ROOT = path.resolve(opt("--root", "."));
const DIR = path.resolve(ROOT, opt("--dir", "docs/plans/submission-readiness"));
const allow = [
  "docs/plans/submission-readiness/",
  ...argv.flatMap((a, i) => (a === "--allow" ? [argv[i + 1]] : [])),
];
const HERE = path.dirname(fileURLToPath(import.meta.url));

const results = [];
let failed = 0;
const rec = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`,
  );
};
const warn = (name, detail) => console.log(`NOTE  ${name} — ${detail}`);
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);

const invF = path.join(DIR, "inventory.json");
const capF = path.join(DIR, "capacity.json");
const dfF = path.join(DIR, "dataflow.md");
const planF = path.join(DIR, "readiness-plan.md");
const ovF = path.join(DIR, "overrides.json");

// 1. files exist
const present = {
  inventory: fs.existsSync(invF),
  capacity: fs.existsSync(capF),
  dataflow: fs.existsSync(dfF),
  plan: fs.existsSync(planF),
};
rec(
  Object.values(present).every(Boolean),
  "output files exist",
  Object.entries(present)
    .filter(([, v]) => !v)
    .map(([k]) => "missing " + k)
    .join(", "),
);
if (!present.inventory || !present.dataflow) {
  console.log(`\n${failed} criteria failed`);
  process.exit(1);
}
const inv = JSON.parse(read(invF));
const df = read(dfF);
const plan = read(planF);
const cap = present.capacity ? JSON.parse(read(capF)) : null;
const ov = fs.existsSync(ovF) ? JSON.parse(read(ovF)) : {};
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE", "MUTATION", "ANY"]);

// section splitter for dataflow.md
const sectionOf = (title) => {
  const re = new RegExp(
    `^## ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$`,
    "m",
  );
  const m = re.exec(df);
  if (!m) return null;
  const rest = df.slice(m.index + m[0].length);
  const nx = /^## /m.exec(rest);
  return nx ? rest.slice(0, nx.index) : rest;
};
const HEADINGS = [
  "## 1. Coverage and assumptions",
  "## 2. System overview",
  "## 3. Write routes",
  "## 4. Entity-relationship diagram",
  "## 5. Field-to-column table",
  "## 6. Client save behavior",
  "## 7. Findings",
  "## 8. Unresolved items",
];
const missingHeads = HEADINGS.filter((h) => !df.split("\n").includes(h));
rec(
  !missingHeads.length,
  "dataflow.md has all 8 fixed sections in order",
  missingHeads.join(", "),
);
const order = HEADINGS.map((h) => df.indexOf("\n" + h + "\n"));
rec(
  order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])) ||
    (order[0] === -1 && df.startsWith(HEADINGS[0])),
  "section order is fixed",
);

// 2. route coverage
const sec3 = sectionOf("3. Write routes") || "";
const blocks = sec3.split(/^### /m).slice(1);
const byHead = new Map(blocks.map((b) => [b.split("\n")[0].trim(), b]));
const expected = inv.routes.filter(
  (r) => r.isWriteRoute || MUTATING.has(r.method),
);
const noBlock = [];
const noDiagram = [];
const noCount = [];
for (const r of expected) {
  const b = byHead.get(`${r.method} ${r.path}`);
  if (!b) {
    noBlock.push(`${r.method} ${r.path}`);
    continue;
  }
  if (!/```mermaid\s+sequenceDiagram/.test(b))
    noDiagram.push(`${r.method} ${r.path}`);
  if (!/\*\*Queries per request:\*\*/.test(b))
    noCount.push(`${r.method} ${r.path}`);
}
const some = (a) =>
  a.slice(0, 5).join("; ") + (a.length > 5 ? `; +${a.length - 5} more` : "");
rec(
  !noBlock.length,
  `every write route has a section (${expected.length} routes)`,
  some(noBlock),
);
rec(
  !noDiagram.length,
  "every write route has a sequence diagram",
  some(noDiagram),
);
rec(
  !noCount.length,
  "every write route states a queries-per-request count",
  some(noCount),
);

// 3. tables
const writeRouteIds = new Set(expected.map((r) => r.id));
const linkedExtra = new Set();
for (const l of ov.routeLinks || [])
  for (const w of l.writes || []) linkedExtra.add(w);
const writtenTables = new Set(
  inv.writes
    .filter(
      (w) =>
        w.table &&
        (w.routeIds.some((id) => writeRouteIds.has(id)) ||
          linkedExtra.has(w.id)),
    )
    .map((w) => w.table),
);
const sec4 = sectionOf("4. Entity-relationship diagram") || "";
const sec5 = sectionOf("5. Field-to-column table") || "";
const ident = (s) =>
  String(s)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^(\d)/, "_$1");
const notER = [...writtenTables].filter(
  (t) => !new RegExp(`^\\s*${ident(t)} \\{`, "m").test(sec4),
);
const notTbl = [...writtenTables].filter(
  (t) =>
    !sec5.includes(`${t}.`) &&
    !new RegExp(`\\| ${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`).test(
      sec5,
    ),
);
rec(
  !notER.length,
  `every written table is in the ER diagram (${writtenTables.size} tables)`,
  some(notER),
);
rec(
  !notTbl.length,
  "every written table is in the field-to-column table",
  some(notTbl),
);
const tByName = new Map(inv.tables.map((t) => [t.name, t]));
const noCol = [];
for (const t of writtenTables)
  for (const c of tByName.get(t)?.columns || [])
    if (!sec5.includes(`${t}.${c.name} |`)) noCol.push(`${t}.${c.name}`);
rec(
  !noCol.length,
  "every column of a written table has a source row",
  some(noCol),
);
rec(
  /### 5\.2 Unmapped client fields/.test(sec5) &&
    /### 5\.3 Unmapped columns/.test(sec5),
  "unmapped client fields and unmapped columns are listed",
);

// 4. unresolved
const sec8 = sectionOf("8. Unresolved items") || "";
const dismissed = new Set((ov.dismissUnresolved || []).map((d) => d.id));
const openUn = inv.unresolved.filter((u) => !dismissed.has(u.id));
const bullets = (sec8.match(/^- /gm) || []).length;
rec(
  bullets >= openUn.length && /### Owner questions/.test(sec8),
  "unresolved items and owner questions are listed",
  `${openUn.length} open in inventory, ${bullets} bullets in section 8`,
);

// 5. mermaid
const mm = [];
for (const [name, text] of [
  ["dataflow.md", df],
  ["readiness-plan.md", plan || ""],
]) {
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)))
    mm.push({
      file: name,
      line: text.slice(0, m.index).split("\n").length + 1,
      code: m[1],
    });
}
function structural(code) {
  const errs = [];
  const lines = code.split("\n").filter((l) => l.trim());
  if (!lines.length) return ["empty diagram"];
  const head = lines[0].trim();
  const body = lines.slice(1);
  if (
    /^flowchart\s+(LR|RL|TB|TD|BT)$/.test(head) ||
    /^graph\s+(LR|RL|TB|TD|BT)$/.test(head)
  ) {
    for (const l of body) {
      const t = l.trim();
      if ((t.match(/"/g) || []).length % 2)
        errs.push(`odd quotes: ${t.slice(0, 60)}`);
      const stripped = t.replace(/"[^"]*"/g, '""');
      if (
        (stripped.match(/\[/g) || []).length !==
        (stripped.match(/\]/g) || []).length
      )
        errs.push(`unbalanced []: ${t.slice(0, 60)}`);
      if (
        !/^(subgraph|end|classDef|class|style|linkStyle|%%)/.test(t) &&
        !/^[A-Za-z_][\w]*(\[.*\]|\(.*\)|\{.*\})?(\s*(-->|---|-\.->|-\.-|==>|--[^>]*-->|-->\|[^|]*\|)\s*[A-Za-z_][\w]*(\[.*\]|\(.*\)|\{.*\})?)*\s*$/.test(
          stripped.replace(/\|[^|]*\|/g, ""),
        )
      )
        errs.push(`unrecognised line: ${t.slice(0, 60)}`);
    }
  } else if (head === "sequenceDiagram") {
    const parts = new Set();
    let depth = 0;
    for (const l of body) {
      const t = l.trim();
      let mt;
      if ((mt = /^participant\s+(\w+)(?:\s+as\s+.+)?$/.exec(t)))
        parts.add(mt[1]);
      else if (/^(loop|alt|opt|par|rect|critical|break)\b/.test(t)) depth++;
      else if (t === "end") depth--;
      else if (t === "else" || /^else\b|^and\b/.test(t)) continue;
      else if (
        (mt =
          /^(\w+)\s*(->>|-->>|-\)|--\)|->|-->|-x|--x)\s*(\w+)\s*:\s*(.*)$/.exec(
            t,
          ))
      ) {
        if (!parts.has(mt[1]) || !parts.has(mt[3]))
          errs.push(`undeclared participant in: ${t.slice(0, 60)}`);
        if (/[;#]/.test(mt[4]))
          errs.push(`unescaped ; or # in message: ${t.slice(0, 60)}`);
      } else if (
        (mt = /^Note\s+(over|left of|right of)\s+([\w,\s]+)\s*:\s*(.*)$/.exec(
          t,
        ))
      ) {
        for (const p of mt[2].split(",").map((x) => x.trim()))
          if (!parts.has(p))
            errs.push(`Note references undeclared participant ${p}`);
      } else errs.push(`unrecognised line: ${t.slice(0, 60)}`);
    }
    if (depth !== 0) errs.push("unbalanced loop/end");
  } else if (head === "erDiagram") {
    let open = false;
    for (const l of body) {
      const t = l.trim();
      if (/^\w+\s*\{$/.test(t)) {
        if (open) errs.push("nested entity block");
        open = true;
      } else if (t === "}") {
        if (!open) errs.push("stray }");
        open = false;
      } else if (open) {
        if (
          !/^\w+\s+\w+(\s+(PK|FK|UK)(\s*,\s*(PK|FK|UK))*)?(\s+"[^"]*")?$/.test(
            t,
          )
        )
          errs.push(`bad attribute: ${t.slice(0, 60)}`);
      } else if (
        !/^\w+\s+[|}o][|o]--[|o][|{o]\s+\w+\s*:\s*("[^"]*"|\w+)$/.test(t) &&
        !/^\w+$/.test(t)
      )
        errs.push(`bad relationship: ${t.slice(0, 60)}`);
    }
    if (open) errs.push("unclosed entity block");
  } else errs.push(`unsupported or unknown diagram type: ${head}`);
  return errs;
}
let mmdc = null;
if (!argv.includes("--no-mmdc")) {
  for (const cand of [
    path.join(
      ROOT,
      "node_modules/.bin/mmdc" + (process.platform === "win32" ? ".cmd" : ""),
    ),
    path.join(
      HERE,
      "../../../../node_modules/.bin/mmdc" +
        (process.platform === "win32" ? ".cmd" : ""),
    ),
  ])
    if (fs.existsSync(cand)) mmdc = cand;
}
let mode = "structural";
async function tryMermaidJsdom() {
  const dirs = [opt("--mermaid-dir"), ROOT, path.join(HERE, "../../../..")]
    .filter(Boolean)
    .map((d) => path.resolve(d));
  for (const d of dirs) {
    try {
      const req = createRequire(path.join(d, "package.json"));
      const jsdomPath = req.resolve("jsdom");
      const mermaidPath = req.resolve("mermaid");
      const { JSDOM } = await import(pathToFileURL(jsdomPath).href);
      const dom = new JSDOM("<!DOCTYPE html><body></body>");
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      Object.defineProperty(globalThis, "navigator", {
        value: dom.window.navigator,
        configurable: true,
      });
      const mod = await import(pathToFileURL(mermaidPath).href);
      const mermaid = mod.default || mod;
      mermaid.initialize({ startOnLoad: false });
      return mermaid;
    } catch {
      /* try next */
    }
  }
  return null;
}
const mmErrs = [];
if (mmdc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mmd-"));
  const probe = path.join(tmp, "probe.mmd");
  fs.writeFileSync(probe, "flowchart LR\n  A-->B\n");
  const pr = spawnSync(
    mmdc,
    ["-i", probe, "-o", path.join(tmp, "probe.svg"), "-q"],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  if (pr.status === 0) {
    mode = "mermaid-cli";
    mm.forEach((b, i) => {
      const f = path.join(tmp, `b${i}.mmd`);
      fs.writeFileSync(f, b.code);
      const r = spawnSync(
        mmdc,
        ["-i", f, "-o", path.join(tmp, `b${i}.svg`), "-q"],
        { encoding: "utf8", shell: process.platform === "win32" },
      );
      if (r.status !== 0)
        mmErrs.push(
          `${b.file}:${b.line} ${String(r.stderr).split("\n")[0].slice(0, 100)}`,
        );
    });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (mode === "structural" && !argv.includes("--no-mmdc")) {
  const mermaid = await tryMermaidJsdom();
  if (mermaid) {
    mode = "mermaid-jsdom";
    for (const b of mm) {
      try {
        await mermaid.parse(b.code);
      } catch (e) {
        mmErrs.push(
          b.file +
            ":" +
            b.line +
            " " +
            String(e.message || e)
              .split("\n")[0]
              .slice(0, 100),
        );
      }
    }
  }
}
if (mode === "structural")
  for (const b of mm)
    for (const e of structural(b.code)) mmErrs.push(`${b.file}:${b.line} ${e}`);
rec(
  !mmErrs.length,
  `Mermaid blocks parse (${mm.length} blocks, ${mode === "mermaid-cli" ? "parsed with mermaid-cli" : mode === "mermaid-jsdom" ? "parsed with the mermaid parser under jsdom" : "STRUCTURAL check only — mermaid-cli and mermaid+jsdom not usable here"})`,
  some(mmErrs),
);
if (mode === "structural")
  warn(
    "mermaid",
    "install @mermaid-js/mermaid-cli (or mermaid + jsdom, or pass --mermaid-dir) to get a real parse; structural checks cannot catch every syntax error",
  );

// 6. plan structure + capacity numbers
if (plan) {
  const tpl =
    read(path.join(HERE, "../reference/readiness-plan-template.md")) || "";
  const tplHeads = tpl
    .split("\n")
    .filter((l) => /^## \d+\. /.test(l))
    .map((l) => l.trim());
  const planHeads = plan.split("\n").map((l) => l.trim());
  const miss = tplHeads.filter((h) => !planHeads.includes(h));
  rec(
    tplHeads.length >= 10 && !miss.length,
    "readiness-plan.md follows the template headings",
    miss.join(", "),
  );
  if (cap) {
    const keys = [
      "peakRps",
      "queriesPerSecondAtPeak",
      "connectionsAvailable",
      "redisBacklogMiB",
      ...Object.keys(cap.display).filter((k) =>
        k.startsWith("connectionsNeeded_"),
      ),
    ];
    const wrong = keys.filter(
      (k) => cap.display[k] !== undefined && !plan.includes(cap.display[k]),
    );
    rec(
      !wrong.length,
      "capacity numbers in the plan match capacity.json",
      wrong.map((k) => `${k}=${cap.display[k]} not found`).join(", "),
    );
  } else
    rec(
      false,
      "capacity numbers in the plan match capacity.json",
      "capacity.json missing",
    );
  const failText =
    /primary success measure/i.test(plan) && /reconcil/i.test(plan);
  rec(failText, "plan states reconciliation as the primary success measure");
} else
  rec(false, "readiness-plan.md present and follows the template", "missing");

// 7. citations
function checkCitations(name, text) {
  const re =
    /(?<![\w/.-])((?:[A-Za-z0-9_@.-]+\/)*[A-Za-z0-9_@.-]+\.(?:mjs|cjs|jsx|tsx|js|ts|json|sql|conf|md|py|sh|yml|yaml)):(\d+)(?:-(\d+))?/g;
  let m;
  const bad = [];
  let n = 0;
  const cache = new Map();
  while ((m = re.exec(text))) {
    const f = path.resolve(ROOT, m[1]);
    n++;
    if (!cache.has(f))
      cache.set(
        f,
        fs.existsSync(f) && fs.statSync(f).isFile()
          ? fs.readFileSync(f, "utf8").split("\n").length
          : -1,
      );
    const total = cache.get(f);
    const line = Number(m[3] || m[2]);
    if (total < 0) bad.push(`${m[0]} (file not found)`);
    else if (line > total + 1 || Number(m[2]) < 1)
      bad.push(`${m[0]} (file has ${total} lines)`);
  }
  return { n, bad: [...new Set(bad)] };
}
for (const [name, text] of [
  ["readiness-plan.md", plan],
  ["dataflow.md", df],
]) {
  if (!text) continue;
  const { n, bad } = checkCitations(name, text);
  rec(
    !bad.length && n > 0,
    `file:line citations in ${name} resolve (${n} checked)`,
    some(bad) || (n === 0 ? "no citations found" : ""),
  );
}

// 8. git status
try {
  const out = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  const bad = out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, "").split(" -> ").pop())
    .filter((p) => !allow.some((a) => p.startsWith(a)));
  rec(
    !bad.length,
    "git status shows changes only under docs/plans/submission-readiness/" +
      (allow.length > 1 ? ` (+ ${allow.slice(1).join(", ")})` : ""),
    some(bad),
  );
} catch {
  warn("git status", "not a git repository or git unavailable; check skipped");
}

console.log(
  `\n${failed ? failed + " criteria failed" : "all criteria passed"}`,
);
process.exit(failed ? 1 : 0);
