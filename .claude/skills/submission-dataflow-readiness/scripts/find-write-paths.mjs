#!/usr/bin/env node
// Static inventory of the API connection and the database write layer of a repo.
// Read-only. No dependencies (uses `typescript` only if it already resolves from the repo root).
// Usage: node find-write-paths.mjs <repo-root> --out <file> [--no-ast]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const repoArg = argv.find(
  (a, i) => !a.startsWith("--") && argv[i - 1] !== "--out",
);
const outFile = opt("--out");
if (!repoArg || !outFile) {
  console.error(
    "Usage: node find-write-paths.mjs <repo-root> --out <file> [--no-ast]",
  );
  process.exit(2);
}
const ROOT = path.resolve(repoArg);
if (!fs.existsSync(ROOT)) {
  console.error(`Repo root not found: ${ROOT}`);
  process.exit(2);
}

// ---------------------------------------------------------------- constants
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".claude",
  ".turbo",
  ".cache",
  "out-tsc",
]);
const SRC_EXT = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const VERBS = ["get", "post", "put", "patch", "delete", "all"];
const KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "function",
  "return",
  "typeof",
  "new",
  "await",
  "async",
  "super",
  "import",
  "require",
  "void",
  "delete",
  "in",
  "of",
]);
const MAX_FILE = 1_500_000;
const posix = (p) => p.split(path.sep).join("/");

// ---------------------------------------------------------------- optional typescript
let ts = null;
if (!flag("--no-ast")) {
  try {
    ts = createRequire(path.join(ROOT, "package.json"))("typescript");
    if (!ts || !ts.createSourceFile) ts = null;
  } catch {
    ts = null;
  }
}

// ---------------------------------------------------------------- file walk
const files = []; // {rel, abs}
(function walk(dir) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  ents.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of ents) {
    const abs = path.join(dir, e.name);
    const rel = posix(path.relative(ROOT, abs));
    if (e.isDirectory()) {
      if (
        IGNORE_DIRS.has(e.name) ||
        rel === "docs/plans" ||
        rel.startsWith("docs/plans/")
      )
        continue;
      walk(abs);
    } else if (e.isFile()) {
      if (e.name.startsWith(".env")) continue; // never read env files
      files.push({ rel, abs });
    }
  }
})(ROOT);

const readText = (abs) => {
  try {
    const st = fs.statSync(abs);
    if (st.size > MAX_FILE) return null;
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- text helpers
// mask(): returns {nc: comments blanked, co: comments AND string/template text blanked}; same length as the input.
function mask(text) {
  const n = text.length;
  const nc = text.split("");
  const co = text.split("");
  const blank = (arr, i) => {
    if (arr[i] !== "\n" && arr[i] !== "\r") arr[i] = " ";
  };
  const st = [];
  let inTpl = false;
  let depth = 0;
  let i = 0;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (inTpl) {
      if (c === "\\") {
        blank(co, i);
        blank(co, i + 1);
        i += 2;
        continue;
      }
      if (c === "`") {
        inTpl = false;
        i++;
        continue;
      }
      if (c === "$" && d === "{") {
        st.push(depth);
        depth = 0;
        inTpl = false;
        i += 2;
        continue;
      }
      blank(co, i);
      i++;
      continue;
    }
    if (c === "/" && d === "/") {
      while (i < n && text[i] !== "\n") {
        blank(nc, i);
        blank(co, i);
        i++;
      }
      continue;
    }
    if (c === "/" && d === "*") {
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) {
        blank(nc, i);
        blank(co, i);
        i++;
      }
      for (let k = 0; k < 2 && i < n; k++, i++) {
        blank(nc, i);
        blank(co, i);
      }
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && text[i] !== c && text[i] !== "\n") {
        if (text[i] === "\\") {
          blank(co, i);
          i++;
        }
        blank(co, i);
        i++;
      }
      i++;
      continue;
    }
    if (c === "`") {
      inTpl = true;
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0 && st.length) {
        depth = st.pop();
        inTpl = true;
        i++;
        continue;
      }
      depth--;
    }
    i++;
  }
  return { nc: nc.join(""), co: co.join("") };
}

// matchClose(): index of the bracket closing the one at `open`, using the code-only mask.
function matchClose(co, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  let depth = 0;
  for (let i = open; i < co.length; i++) {
    const c = co[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return pairs[co[open]] === c ? i : i;
    }
  }
  return co.length - 1;
}

// splitTop(): split text[from,to) on top-level commas. Returns [{s,e}] trimmed offsets (absolute).
function splitTop(co, from, to) {
  const out = [];
  let depth = 0;
  let s = from;
  for (let i = from; i < to; i++) {
    const c = co[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push([s, i]);
      s = i + 1;
    }
  }
  out.push([s, to]);
  return out
    .map(([a, b]) => {
      while (a < b && /\s/.test(co[a])) a++;
      while (b > a && /\s/.test(co[b - 1])) b--;
      return { s: a, e: b };
    })
    .filter((r) => r.e > r.s);
}

function backExpr(co, j) {
  let i = j;
  for (;;) {
    while (i >= 0 && /\s/.test(co[i])) i--;
    if (i < 0) break;
    if (co[i] === ")" || co[i] === "]") {
      let depth = 0;
      for (; i >= 0; i--) {
        if (")]}".includes(co[i])) depth++;
        else if ("([{".includes(co[i])) {
          depth--;
          if (depth === 0) break;
        }
      }
      i--;
      while (i >= 0 && /\s/.test(co[i])) i--;
      if (i >= 0 && /[\w$)\]]/.test(co[i])) continue;
      i++;
      break;
    }
    if (/[\w$]/.test(co[i])) {
      while (i >= 0 && /[\w$]/.test(co[i])) i--;
      let k = i;
      while (k >= 0 && /\s/.test(co[k])) k--;
      if (co[k] === ".") {
        i = k - 1;
        if (co[i] === "?") i--;
        continue;
      }
      break;
    }
    break;
  }
  return i + 1;
}

const squash = (s) => s.replace(/\s+/g, " ").trim();
const cut = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ---------------------------------------------------------------- source file model
const sources = new Map(); // rel -> fi
const fileList = [];

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") starts.push(i + 1);
  return starts;
}
function lineAt(fi, pos) {
  const a = fi.starts;
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (a[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function astCalls(fi) {
  const kind = fi.rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    fi.rel,
    fi.text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const isNew = ts.isNewExpression(node);
      let name = null;
      let receiver = "";
      let start = node.expression.getStart(sf);
      const ex = node.expression;
      if (ts.isPropertyAccessExpression(ex)) {
        name = ex.name.text;
        receiver = squash(
          fi.nc.slice(ex.expression.getStart(sf), ex.expression.getEnd()),
        );
        start = ex.name.getStart(sf);
      } else if (ts.isIdentifier(ex)) name = ex.text;
      if (name && node.arguments) {
        const args = node.arguments.map((a) => ({
          s: a.getStart(sf),
          e: a.getEnd(),
        }));
        calls.push({ name, receiver, isNew, start, end: node.getEnd(), args });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return calls;
}

function regexCalls(fi) {
  const { co, nc } = fi;
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  const calls = [];
  let m;
  while ((m = re.exec(co))) {
    const name = m[1];
    if (KEYWORDS.has(name)) continue;
    const start = m.index;
    let j = start - 1;
    while (j >= 0 && /\s/.test(co[j])) j--;
    let member = false;
    if (co[j] === ".") {
      member = true;
      j--;
      if (co[j] === "?") j--;
    }
    const isNew =
      !member && /\bnew\s*$/.test(co.slice(Math.max(0, start - 6), start));
    const open = m.index + m[0].length - 1;
    const close = matchClose(co, open);
    const args = splitTop(co, open + 1, close);
    const recvStart = member ? backExpr(co, j) : start;
    const receiver = member ? squash(nc.slice(recvStart, j + 1)) : "";
    calls.push({ name, receiver, isNew, start, end: close + 1, args });
  }
  return calls;
}

for (const f of files) {
  const ext = path.extname(f.rel).toLowerCase();
  if (!SRC_EXT.has(ext) || f.rel.endsWith(".d.ts") || /\.min\./.test(f.rel))
    continue;
  const text = readText(f.abs);
  if (text == null) continue;
  const { nc, co } = mask(text);
  const fi = {
    rel: f.rel,
    abs: f.abs,
    text,
    nc,
    co,
    starts: lineIndex(text),
    ext,
  };
  fi.calls = ts ? astCalls(fi) : regexCalls(fi);
  fi.calls.sort((a, b) => a.start - b.start);
  sources.set(f.rel, fi);
  fileList.push(fi);
}
const argText = (fi, a) => fi.nc.slice(a.s, a.e);
const strLit = (s) => {
  const m = /^\s*(["'`])((?:\\.|(?!\1)[\s\S])*)\1\s*$/.exec(s);
  return m ? m[2] : null;
};

// ---------------------------------------------------------------- classification helpers
const CLASS_RES = {
  auth: /auth|jwt|token|gate|protect|session|guard|login|passport|verify|permission|role/i,
  tenant: /tenant|school|org(?!an)|workspace|account/i,
  rateLimit: /rate|limit|throttle|slow/i,
  validation: /valid|schema|zod|joi|yup|ajv|sanitiz|parse/i,
};
const classify = (names) => {
  const out = {
    auth: false,
    tenant: false,
    rateLimit: false,
    validation: false,
  };
  for (const n of names)
    for (const k of Object.keys(out)) if (CLASS_RES[k].test(n)) out[k] = true;
  return out;
};
const argName = (fi, a) => {
  const t = squash(argText(fi, a));
  const m =
    /^(?:await\s+)?(?:require\([^)]*\)\s*\.\s*)?([A-Za-z_$][\w$.]*)/.exec(t);
  if (!m) return cut(t, 30);
  const segs = m[1].split(".");
  return /^(?:await\s+)?require\(/.test(t) || segs.length < 2
    ? segs.pop()
    : segs.slice(-2).join(".");
};

// ---------------------------------------------------------------- imports / resolution
function resolveRel(fromRel, spec) {
  if (!spec.startsWith(".")) return null;
  const base = posix(path.normalize(path.join(path.dirname(fromRel), spec)));
  const cands = [base];
  for (const e of SRC_EXT) cands.push(base + e);
  for (const e of SRC_EXT) cands.push(base + "/index" + e);
  // ts projects import "./x.js" for x.ts
  if (/\.(m|c)?jsx?$/.test(base))
    cands.push(
      base.replace(/\.(m|c)?jsx?$/, ".ts"),
      base.replace(/\.(m|c)?jsx?$/, ".tsx"),
    );
  return cands.find((c) => sources.has(c)) || null;
}
for (const fi of fileList) {
  const imp = new Map();
  const nc = fi.nc;
  let m;
  const r1 =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']([^"']+)["']\s*\)(?:\s*\.\s*([A-Za-z_$][\w$]*))?/g;
  while ((m = r1.exec(nc)))
    imp.set(m[1], {
      spec: m[2],
      file: resolveRel(fi.rel, m[2]),
      imported: m[3] || "*",
    });
  const r2 =
    /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = r2.exec(nc))) {
    for (const part of m[1].split(",")) {
      const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?/.exec(part);
      if (mm)
        imp.set(mm[2] || mm[1], {
          spec: m[2],
          file: resolveRel(fi.rel, m[2]),
          imported: mm[1],
        });
    }
  }
  const r3 = /\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  while ((m = r3.exec(nc))) {
    const file = resolveRel(fi.rel, m[2]);
    let clause = m[1];
    const ns = /\*\s+as\s+([\w$]+)/.exec(clause);
    if (ns) imp.set(ns[1], { spec: m[2], file, imported: "*" });
    const named = /\{([^}]*)\}/.exec(clause);
    if (named)
      for (const part of named[1].split(",")) {
        const mm = /^\s*(?:type\s+)?([\w$]+)\s*(?:as\s+([\w$]+))?/.exec(part);
        if (mm) imp.set(mm[2] || mm[1], { spec: m[2], file, imported: mm[1] });
      }
    const def = /^\s*(?:type\s+)?([\w$]+)\s*(?:,|$)/.exec(
      clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+[\w$]+/, ""),
    );
    if (def) imp.set(def[1], { spec: m[2], file, imported: "default" });
  }
  fi.imports = imp;
}

// ---------------------------------------------------------------- function lookup
const funcCache = new Map();
function findFunction(fi, name) {
  const key = fi.rel + "#" + name;
  if (funcCache.has(key)) return funcCache.get(key);
  const esc = name.replace(/[$]/g, "\\$");
  const pats = [
    new RegExp(`\\bfunction\\s*\\*?\\s+${esc}\\s*\\(`),
    new RegExp(
      `\\b(?:const|let|var)\\s+${esc}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:function\\b|\\(|[\\w$]+\\s*=>)`,
    ),
    new RegExp(
      `(?:exports|module\\.exports)\\.${esc}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\(|[\\w$]+\\s*=>)`,
    ),
    new RegExp(
      `(?:^|[,{\\s])${esc}\\s*:\\s*(?:async\\s*)?(?:function\\b|\\(|[\\w$]+\\s*=>)`,
    ),
    new RegExp(
      `^\\s*(?:async\\s+|static\\s+|public\\s+|private\\s+)*${esc}\\s*\\([^)]*\\)\\s*(?::[^{]+)?\\{`,
      "m",
    ),
  ];
  let res = null;
  for (const p of pats) {
    const m = p.exec(fi.co);
    if (!m) continue;
    const from = m.index;
    let depth = 0;
    let i = from;
    let bodyOpen = -1;
    let paramsOpen = -1;
    let paramsClose = -1;
    for (; i < fi.co.length; i++) {
      const c = fi.co[i];
      if (c === "(") {
        if (depth === 0 && paramsOpen < 0) paramsOpen = i;
        depth++;
      } else if (c === ")") {
        depth--;
        if (depth === 0 && paramsClose < 0) paramsClose = i;
      } else if (c === "{" && depth === 0) {
        bodyOpen = i;
        break;
      } else if (c === ";" && depth === 0) break;
    }
    if (bodyOpen < 0) continue;
    const close = matchClose(fi.co, bodyOpen);
    res = {
      start: bodyOpen,
      end: close + 1,
      declStart: from,
      params:
        paramsOpen >= 0 && paramsClose > paramsOpen
          ? [paramsOpen + 1, paramsClose]
          : null,
    };
    break;
  }
  funcCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------- SQL parsing
function sqlFromArg(fi, a, pos) {
  const t = argText(fi, a).trim();
  if (
    /^(["'`])/.test(t) ||
    /^sql\s*`/.test(t) ||
    /^(?:Prisma\.)?sql\s*`/.test(t)
  )
    return joinStrings(t);
  const idm = /^([A-Za-z_$][\w$]*)$/.exec(t);
  if (idm) {
    const re = new RegExp(
      `\\b(?:const|let|var)\\s+${idm[1].replace(/[$]/g, "\\$")}\\s*=\\s*`,
      "g",
    );
    let last = null;
    let m;
    while ((m = re.exec(fi.co)) && m.index < pos) last = m;
    if (last) {
      const from = last.index + last[0].length;
      // statement end = first ';' at depth 0 in the code-only mask (string contents are blanked there)
      let depth = 0;
      let end = Math.min(fi.co.length, from + 6000);
      for (let i = from; i < end; i++) {
        const ch = fi.co[i];
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        else if (ch === ";" && depth <= 0) {
          end = i;
          break;
        }
      }
      const expr = fi.nc.slice(from, end);
      if (/^(["'`])/.test(expr.trim()) || /^sql\s*`/.test(expr.trim()))
        return joinStrings(expr);
    }
  }
  return null;
}
function joinStrings(t) {
  const parts = [];
  const re = /(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  let m;
  while ((m = re.exec(t))) parts.push(m[2].replace(/\$\{[^}]*\}/g, "${…}"));
  return parts.join(" ");
}
const unq = (s) => s.replace(/^"|"$/g, "");
const DML =
  /\b(INSERT\s+INTO|DELETE\s+FROM|(?<!\bDO\s)(?<!\bFOR\s)UPDATE)\s+(?:ONLY\s+)?((?:"[^"]+"|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|[\w$]+))?)/i;
function parseSql(sql) {
  const s = squash(sql.replace(/--[^\n]*/g, " "));
  const info = {
    sql: cut(s, 160),
    kind: "other",
    table: null,
    cols: null,
    vals: null,
    setPairs: null,
    conflict: null,
    hasWhere: /\bWHERE\b/i.test(s),
    returning: /\bRETURNING\b/i.test(s),
    batch: false,
    dynamic: s.includes("${…}"),
    insertSelect: false,
  };
  const m = DML.exec(s);
  if (m && !/^\s*(SELECT)\b/i.test(s.replace(/^\s*WITH[\s\S]*?\)\s*/i, "x"))) {
    const op = m[1].toUpperCase().split(/\s+/)[0];
    info.kind =
      op === "INSERT" ? "insert" : op === "DELETE" ? "delete" : "update";
    let t = m[2].split(".").pop().replace(/\s+/g, "");
    info.table = unq(t);
    if (/^\$/.test(info.table)) {
      info.dynamic = true;
      info.table = null;
    }
    const after = s.slice(m.index + m[0].length);
    if (info.kind === "insert") {
      const cm = /^\s*(?:AS\s+\w+\s*)?\(([^)]*)\)/i.exec(after);
      if (cm)
        info.cols = cm[1]
          .split(",")
          .map((x) => unq(x.trim()))
          .filter(Boolean);
      const vm = /\bVALUES\s*\(/i.exec(after);
      if (vm) {
        const open = vm.index + vm[0].length - 1;
        const close = matchClose(after, open);
        const inner = after.slice(open + 1, close);
        info.vals = splitSimple(inner);
        const tail = after.slice(close + 1);
        if (/^\s*,\s*\(/.test(tail) || /^\s*,?\s*\$\{/.test(tail))
          info.batch = true;
      } else if (/\bSELECT\b/i.test(after)) info.insertSelect = true;
      if (
        /\bunnest\s*\(|json_to_recordset|jsonb_to_recordset|json_populate_recordset|jsonb_populate_recordset|jsonb_array_elements/i.test(
          after,
        )
      )
        info.batch = true;
      const cf =
        /\bON\s+CONFLICT\s*(?:\(([^)]*)\)|ON\s+CONSTRAINT\s+([\w$"]+))?\s*(?:WHERE[^D]*)?DO\s+(NOTHING|UPDATE)/i.exec(
          after,
        );
      if (cf)
        info.conflict = {
          target: (cf[1] || cf[2] || "").replace(/\s+/g, ""),
          action: cf[3].toLowerCase() === "nothing" ? "nothing" : "update",
        };
    } else if (info.kind === "update") {
      const sm =
        /\bSET\b([\s\S]*?)(?:\bWHERE\b|\bRETURNING\b|\bFROM\b|$)/i.exec(after);
      if (sm) {
        info.setPairs = splitSimple(sm[1])
          .map((p) => {
            const eq = p.indexOf("=");
            return eq > 0
              ? {
                  col: unq(p.slice(0, eq).trim()),
                  expr: p.slice(eq + 1).trim(),
                }
              : null;
          })
          .filter(Boolean);
      }
    }
    if (
      info.dynamic &&
      ((info.cols && info.cols.some((c) => c.includes("${"))) ||
        (info.setPairs && info.setPairs.some((p) => p.col.includes("${"))))
    )
      info.dynamicColumns = true;
    return info;
  }
  const first = /^\s*(\w+)/.exec(s);
  const w = first ? first[1].toUpperCase() : "";
  if (w === "SELECT" || w === "WITH" || w === "VALUES") info.kind = "read";
  else if (
    [
      "BEGIN",
      "START",
      "COMMIT",
      "ROLLBACK",
      "SAVEPOINT",
      "RELEASE",
      "END",
    ].includes(w)
  ) {
    info.kind = "txctl";
    info.op =
      w === "START" || w === "END" ? (w === "START" ? "BEGIN" : "COMMIT") : w;
  } else if (["CREATE", "ALTER", "DROP", "TRUNCATE"].includes(w))
    info.kind = "ddl";
  else if (["SET", "SHOW", "RESET", "LISTEN", "NOTIFY"].includes(w))
    info.kind = "session";
  const rt =
    /\bFROM\s+((?:"[^"]+"|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|[\w$]+))?)/i.exec(s);
  if (info.kind === "read" && rt) info.table = unq(rt[1].split(".").pop());
  return info;
}
function splitSimple(str) {
  const co = str;
  const out = [];
  let depth = 0;
  let q = null;
  let s = 0;
  for (let i = 0; i < co.length; i++) {
    const c = co[i];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(co.slice(s, i).trim());
      s = i + 1;
    }
  }
  out.push(co.slice(s).trim());
  return out.filter((x) => x.length);
}

// ---------------------------------------------------------------- db call detection per file
const DB_TAIL =
  /(?:^|\.)(db|pool|client|tx|trx|conn|connection|database|pg|sql|dbc|dbClient|knex|sequelize|prisma|txn|readPool|writePool)$/i;
const Q_NAMES = new Set([
  "query",
  "execute",
  "unsafe",
  "any",
  "many",
  "one",
  "none",
  "oneOrNone",
  "manyOrNone",
  "raw",
  "run",
  "all",
  "get",
]);
const tailOf = (recv) => recv.replace(/\([^()]*\)/g, "").replace(/\s+/g, "");

function catchRanges(fi) {
  if (fi._catch) return fi._catch;
  const out = [];
  const re = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
  let m;
  while ((m = re.exec(fi.co))) {
    const open = m.index + m[0].length - 1;
    out.push([open, matchClose(fi.co, open) + 1]);
  }
  for (const c of fi.calls)
    if (c.name === "catch" && c.receiver && c.args.length)
      out.push([c.start, c.end]);
  fi._catch = out;
  return out;
}
function loopRanges(fi) {
  if (fi._loops) return fi._loops;
  const out = [];
  const re = /\b(for|while)\s*(?:await\s*)?\(/g;
  let m;
  while ((m = re.exec(fi.co))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(fi.co, open);
    let k = close + 1;
    while (/\s/.test(fi.co[k] || "")) k++;
    if (fi.co[k] === "{") out.push([m.index, matchClose(fi.co, k) + 1]);
    else {
      const semi = fi.co.indexOf(";", k);
      out.push([m.index, semi < 0 ? k : semi + 1]);
    }
  }
  for (const c of fi.calls)
    if (
      /^(forEach|map|flatMap|reduce|filter|some|every|mapSeries|each)$/.test(
        c.name,
      ) &&
      c.receiver
    )
      out.push([c.start, c.end]);
  fi._loops = out;
  return out;
}
function txRanges(fi) {
  if (fi._tx) return fi._tx;
  const out = [];
  for (const c of fi.calls) {
    if (
      /transaction|withTx\b|inTx\b/i.test(c.name) &&
      !/^is/i.test(c.name) &&
      c.args.length
    )
      out.push([c.start, c.end]);
    if (c.name === "batch" && DB_TAIL.test(tailOf(c.receiver)))
      out.push([c.start, c.end]);
  }
  fi._tx = out;
  return out;
}

function dbCalls(fi) {
  if (fi._db) return fi._db;
  const out = [];
  const calls = fi.calls;
  for (const c of calls) {
    const recv = tailOf(c.receiver);
    let q = null;
    if (Q_NAMES.has(c.name) && DB_TAIL.test(recv) && c.args.length) {
      const a0 = c.args[0];
      const sqlText = sqlFromArg(fi, a0, c.start);
      if (sqlText != null) {
        q = {
          api: /^sql\s*`/.test(argText(fi, a0).trim())
            ? "drizzle-sql"
            : "raw-sql",
          ...parseSql(sqlText),
        };
        q.paramsArg = c.args[1] || null;
      } else {
        const t = squash(argText(fi, a0));
        q = {
          api: "raw-sql",
          kind: "unknown-sql",
          sql: cut(t, 80),
          table: null,
          dynamicSource: true,
        };
      }
    } else if (
      ["insert", "update", "delete"].includes(c.name) &&
      DB_TAIL.test(recv) &&
      c.args.length === 1 &&
      !strLit(argText(fi, c.args[0]))
    ) {
      const tv = squash(argText(fi, c.args[0]));
      const chain = readChain(fi, c.end);
      q = {
        api: "drizzle",
        kind: c.name,
        tableVar: tv,
        chain: chain.names,
        valuesArg: chain.values,
        setArg: chain.set,
        hasWhere: chain.names.includes("where"),
        returning: chain.names.includes("returning"),
        conflict: chain.names.includes("onConflictDoNothing")
          ? { target: chain.conflictTarget || "", action: "nothing" }
          : chain.names.includes("onConflictDoUpdate")
            ? { target: chain.conflictTarget || "", action: "update" }
            : null,
        batch: chain.valuesIsArray,
      };
    } else if (
      [
        "select",
        "selectDistinct",
        "selectDistinctOn",
        "findFirst",
        "findMany",
        "findUnique",
        "findOne",
        "findAll",
      ].includes(c.name) &&
      (DB_TAIL.test(recv) ||
        /(^|\.)(db|tx)\.query\.[\w$]+$/.test(tailOf(c.receiver)))
    ) {
      const chain = c.name.startsWith("select")
        ? readChain(fi, c.end)
        : { names: [] };
      const fromArg = chain.fromArg;
      q = {
        api: "drizzle",
        kind: "read",
        tableVar: fromArg || null,
        table: null,
      };
    } else if (c.name === "execute" && DB_TAIL.test(recv)) q = null;
    if (q) {
      q.pos = c.start;
      q.line = lineAt(fi, c.start);
      q.endPos = c.end;
      out.push(q);
    }
  }
  // tagged templates: sql`INSERT ...` (postgres-js) outside .execute()
  const tr =
    /\b(sql|db)\s*`\s*(INSERT|UPDATE|DELETE|SELECT|WITH|BEGIN|COMMIT)\b/gi;
  let m;
  while ((m = tr.exec(fi.text))) {
    if (out.some((q) => q.pos <= m.index && q.endPos >= m.index)) continue;
    const end = fi.text.indexOf("`", m.index + m[0].length);
    const q = {
      api: "tagged-sql",
      ...parseSql(joinStrings(fi.text.slice(m.index + m[1].length, end + 1))),
    };
    q.pos = m.index;
    q.line = lineAt(fi, m.index);
    q.endPos = end;
    out.push(q);
  }
  out.sort((a, b) => a.pos - b.pos);
  const loops = loopRanges(fi);
  const txs = txRanges(fi);
  for (const q of out) {
    q.inLoop = loops.some(([a, b]) => q.pos >= a && q.pos < b);
    q.inCatch = catchRanges(fi).some(([a, b]) => q.pos >= a && q.pos < b);
    q.inTxCallback =
      txs.some(([a, b]) => q.pos >= a && q.pos < b) ||
      /(^|\.)(tx|trx|txn)$/i.test(
        tailOf(fi.calls.find((c) => c.start === q.pos)?.receiver || ""),
      );
  }
  fi._db = out;
  return out;
}
function readChain(fi, endPos) {
  const names = [];
  let values = null;
  let set = null;
  let valuesIsArray = false;
  let conflictTarget = null;
  let fromArg = null;
  let i = endPos;
  for (;;) {
    let k = i;
    while (/\s/.test(fi.co[k] || "")) k++;
    if (fi.co[k] === "?" && fi.co[k + 1] === ".") k++;
    if (fi.co[k] !== ".") break;
    k++;
    while (/\s/.test(fi.co[k] || "")) k++;
    const m = /^([A-Za-z_$][\w$]*)\s*\(/.exec(fi.co.slice(k, k + 60));
    if (!m) break;
    const open = k + m[0].length - 1;
    const close = matchClose(fi.co, open);
    const body = fi.nc.slice(open + 1, close);
    names.push(m[1]);
    if (m[1] === "values") {
      values = body;
      valuesIsArray =
        /^\s*\[/.test(body) ||
        /\.map\(/.test(body) ||
        /^\s*[A-Za-z_$][\w$.]*\s*$/.test(body);
    } else if (m[1] === "set") set = body;
    else if (m[1] === "from" && !fromArg) fromArg = squash(body);
    else if (m[1] === "onConflictDoNothing" || m[1] === "onConflictDoUpdate") {
      const tm = /target\s*:\s*([^,}]+(?:\[[^\]]*\])?)/.exec(body);
      conflictTarget = tm ? squash(tm[1]).replace(/^\[|\]$/g, "") : "";
    }
    i = close + 1;
  }
  return { names, values, set, valuesIsArray, conflictTarget, fromArg };
}

// ---------------------------------------------------------------- tables (Drizzle schema)
let casingSnake = false;
for (const f of files) {
  if (/(^|\/)drizzle\.config\.[cm]?[jt]s$/.test(f.rel)) {
    const t = readText(f.abs) || "";
    if (/casing\s*:\s*["']snake_case["']/.test(t)) casingSnake = true;
  }
}
const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const tables = [];
const enums = [];
const PGTYPES = new Set([
  "serial",
  "bigserial",
  "smallserial",
  "integer",
  "int",
  "smallint",
  "bigint",
  "numeric",
  "decimal",
  "real",
  "doublePrecision",
  "boolean",
  "text",
  "varchar",
  "char",
  "uuid",
  "json",
  "jsonb",
  "date",
  "time",
  "timestamp",
  "interval",
  "bytea",
  "inet",
  "cidr",
  "macaddr",
  "point",
  "line",
  "vector",
  "geometry",
]);
for (const fi of fileList) {
  for (const c of fi.calls) {
    if (c.name === "pgEnum" && c.args.length >= 2) {
      const nm = strLit(argText(fi, c.args[0]));
      const vals = [
        ...argText(fi, c.args[1]).matchAll(/["'`]([^"'`]+)["'`]/g),
      ].map((x) => x[1]);
      const before = fi.nc.slice(Math.max(0, c.start - 120), c.start);
      const v = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:\w+\.)?$/.exec(before);
      if (nm)
        enums.push({
          name: nm,
          exportName: v ? v[1] : null,
          values: vals,
          evidence: { file: fi.rel, line: lineAt(fi, c.start) },
        });
    }
  }
}
const enumByVar = new Map(
  enums.filter((e) => e.exportName).map((e) => [e.exportName, e]),
);
for (const fi of fileList) {
  for (const c of fi.calls) {
    const isTable =
      (c.name === "pgTable" && !c.receiver) ||
      (c.name === "table" && /pgSchema/.test(c.receiver)) ||
      (c.name === "pgTable" && /\w/.test(c.receiver) === false);
    if (!isTable || c.args.length < 2) continue;
    const name = strLit(argText(fi, c.args[0]));
    if (!name) continue;
    const before = fi.nc.slice(Math.max(0, c.start - 160), c.start);
    const v =
      /(?:const|let|var)\s+([\w$]+)\s*=\s*$/.exec(
        before.replace(/\s+$/, "") + "",
      ) || /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:\w+\.)?$/.exec(before);
    const colsArg = c.args[1];
    const colsSrc = fi.co.slice(colsArg.s, colsArg.e);
    const columns = [];
    if (colsSrc.startsWith("{")) {
      const entries = splitTop(fi.co, colsArg.s + 1, colsArg.e - 1);
      for (const en of entries) {
        const txt = fi.nc.slice(en.s, en.e);
        const km =
          /^(?:\[?\s*)?(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$]*))\s*\]?\s*:\s*([\s\S]*)$/.exec(
            txt,
          );
        if (!km) continue;
        const key = km[2] || km[3];
        const expr = km[4].trim();
        const tm =
          /^([A-Za-z_$][\w$]*)\s*\(([\s\S]*?)\)(?=\s*(?:\.|$))/.exec(expr) ||
          /^([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)/.exec(expr);
        if (!tm) continue;
        const ty = tm[1];
        const inner = tm[2];
        const nm = /^\s*(["'`])([^"'`]+)\1/.exec(inner);
        const lenM = /\blength\s*:\s*(\d+)/.exec(inner);
        const precM = /\bprecision\s*:\s*(\d+)/.exec(inner);
        const scaleM = /\bscale\s*:\s*(\d+)/.exec(inner);
        const refM = /\.references\(\s*\(\)\s*=>\s*([\w$]+)\.([\w$]+)/.exec(
          expr,
        );
        const defM = /\.default\(([\s\S]*?)\)(?=\s*(?:\.|$))/.exec(expr);
        const known = PGTYPES.has(ty) || enumByVar.has(ty);
        if (!known && !/^[a-z]+[A-Za-z]*$/.test(ty)) continue;
        const isSerial = /serial/i.test(ty);
        const pk = /\.primaryKey\(/.test(expr);
        const enumDef = enumByVar.get(ty);
        columns.push({
          key,
          name: nm ? nm[2] : casingSnake ? toSnake(key) : key,
          type: enumDef ? `enum(${enumDef.name})` : ty,
          length: lenM ? Number(lenM[1]) : null,
          precision: precM ? Number(precM[1]) : null,
          scale: scaleM ? Number(scaleM[1]) : null,
          array: /\.array\(/.test(expr),
          notNull: /\.notNull\(/.test(expr) || pk || isSerial,
          default: defM
            ? cut(squash(defM[1]).replace(/^["'`]|["'`]$/g, "'"), 40)
            : /\.defaultNow\(/.test(expr)
              ? "now()"
              : /\.defaultRandom\(/.test(expr)
                ? "random()"
                : /\.\$defaultFn\(|\.\$default\(/.test(expr)
                  ? "app-generated"
                  : /generatedAlways|generatedByDefault/.test(expr)
                    ? "identity"
                    : isSerial
                      ? "serial"
                      : null,
          primaryKey: pk,
          unique: /\.unique\(/.test(expr),
          references: refM ? { tableVar: refM[1], column: refM[2] } : null,
        });
      }
    }
    const extra = c.args[2] ? { s: c.args[2].s, e: c.args[2].e } : null;
    const constraints = [];
    if (extra) {
      const ex = fi.nc.slice(extra.s, extra.e);
      const exco = fi.co.slice(extra.s, extra.e);
      const starts = [
        ...exco.matchAll(
          /\b(uniqueIndex|index|unique|foreignKey|primaryKey|check)\s*\(/g,
        ),
      ];
      for (let i = 0; i < starts.length; i++) {
        const seg = ex.slice(
          starts[i].index,
          i + 1 < starts.length ? starts[i + 1].index : ex.length,
        );
        const kind = starts[i][1];
        const nmm = /\(\s*(["'`])([^"'`]+)\1/.exec(seg);
        const keysOf = (str) =>
          [...str.matchAll(/\b(?:table|t)\.([\w$]+)/g)].map((m) => m[1]);
        let cols = [];
        let foreign = null;
        if (kind === "foreignKey") {
          const cm = /columns\s*:\s*\[([^\]]*)\]/.exec(seg);
          const fm = /foreignColumns\s*:\s*\[([^\]]*)\]/.exec(seg);
          cols = cm ? keysOf(cm[1]) : [];
          if (fm) foreign = squash(fm[1]);
        } else cols = keysOf(seg);
        constraints.push({
          kind: kind === "uniqueIndex" ? "unique-index" : kind,
          name: nmm ? nmm[2] : null,
          columns: cols.map(
            (k) => columns.find((cc) => cc.key === k)?.name || k,
          ),
          foreign,
        });
      }
    }
    tables.push({
      id: `table:${name}`,
      name,
      exportName: v ? v[1] : null,
      columns,
      constraints,
      evidence: { file: fi.rel, line: lineAt(fi, c.start) },
      confidence: ts ? "high" : "medium",
    });
  }
}
tables.sort((a, b) =>
  a.name < b.name
    ? -1
    : a.name > b.name
      ? 1
      : a.evidence.file < b.evidence.file
        ? -1
        : 1,
);
const tableByVar = new Map();
const tableByName = new Map();
for (const t of tables) {
  if (t.exportName) tableByVar.set(t.exportName, t);
  tableByName.set(t.name, t);
}
// resolve references to table names
for (const t of tables)
  for (const c of t.columns)
    if (c.references) {
      const rt = tableByVar.get(c.references.tableVar);
      c.references = rt
        ? {
            table: rt.name,
            column:
              rt.columns.find((x) => x.key === c.references.column)?.name ||
              c.references.column,
          }
        : { table: c.references.tableVar, column: c.references.column };
    }

// ---------------------------------------------------------------- request-field & expression analysis
const SERVER_RE =
  /\breq\.(user|auth|session|school|tenant)\b|getSchoolIdFromRequest|\bres\.locals\b|randomUUID|uuid(?:v4)?\s*\(|nanoid|generate\w*Id|new Date\b|Date\.now|\bNOW\(\)|gen_random_uuid|\bnow\(\)|CURRENT_TIMESTAMP|\bctx\.(?:user|state)\b|\bcurrentUser\b|\bsession\./i;
const DB_DERIVED =
  /\b(?:tx|trx|db|client|pool|conn|database)\s*\.\s*(?:query|insert|select|update|execute|delete)\b/;
const TENANT_COL =
  /(^|_)(school|tenant|org|organization|workspace|account|company)(_?id)?$|^tenant|^school_?id$/i;
function reqNamesFor(extra) {
  return ["req", "request", ...extra];
}
function clientRefs(expr, reqNames, vars) {
  const refs = [];
  const rn = reqNames.join("|");
  const re = new RegExp(
    `\\b(?:${rn})\\s*\\??\\.\\s*(body|query|params|headers|header|cookies)\\b(?:\\s*\\??\\.\\s*([\\w$]+)|\\s*\\[\\s*["']([^"']+)["']\\s*\\]|\\s*\\(\\s*["']([^"']+)["']\\s*\\))?`,
    "g",
  );
  let m;
  while ((m = re.exec(expr)))
    refs.push({
      location: m[1] === "header" ? "headers" : m[1],
      field: m[2] || m[3] || m[4] || null,
    });
  const ids = expr
    .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, '""')
    .matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?!\s*:)/g);
  for (const id of ids) if (vars.has(id[1])) refs.push(vars.get(id[1]));
  return refs;
}
function collectClientVars(bodyText, reqNames) {
  const vars = new Map();
  const rn = reqNames.join("|");
  const des = new RegExp(
    `(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*(?:await\\s+)?(?:${rn})\\s*\\??\\.\\s*(body|query|params|headers)\\b`,
    "g",
  );
  let m;
  while ((m = des.exec(bodyText))) {
    for (const part of m[1].split(",")) {
      const mm = /^\s*(?:\.\.\.)?([\w$]+)\s*(?::\s*([\w$]+))?/.exec(part);
      if (mm && !part.trim().startsWith("..."))
        vars.set(mm[2] || mm[1], { location: m[2], field: mm[1] });
    }
  }
  const parseRe = new RegExp(
    `(?:const|let|var)\\s*(\\{[^}]*\\}|[\\w$]+)\\s*=\\s*(?:await\\s+)?[\\w$.]+\\.(?:parse|parseAsync|safeParse|validate|validateSync|cast|assert)\\(\\s*(?:${rn})\\s*\\??\\.\\s*(body|query|params)\\s*\\)`,
    "g",
  );
  const parsedAliases = [];
  while ((m = parseRe.exec(bodyText))) {
    if (m[1].startsWith("{")) {
      for (const part of m[1].slice(1, -1).split(",")) {
        const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?/.exec(part);
        if (mm) vars.set(mm[2] || mm[1], { location: m[2], field: mm[1] });
      }
    } else parsedAliases.push([m[1], m[2]]);
  }
  const alias = new RegExp(
    `(?:const|let|var)\\s+([\\w$]+)\\s*=\\s*(?:${rn})\\s*\\??\\.\\s*(body|query|params)\\s*(?:\\|\\||\\?\\?)?\\s*(?:\\{\\})?\\s*[;\\n]`,
    "g",
  );
  const aliases = [];
  while ((m = alias.exec(bodyText))) aliases.push([m[1], m[2]]);
  aliases.push(...parsedAliases);
  for (const [a, loc] of aliases) {
    const des2 = new RegExp(
      `(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${a}\\b`,
      "g",
    );
    while ((m = des2.exec(bodyText)))
      for (const part of m[1].split(",")) {
        const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?/.exec(part);
        if (mm) vars.set(mm[2] || mm[1], { location: loc, field: mm[1] });
      }
    vars.set("\u0000alias:" + a, { location: loc, field: null });
  }
  // direct alias usage a.x -> add as refs lazily via regex in clientRefs? keep simple: register alias.field patterns
  const dot = [];
  for (const [a, loc] of aliases) {
    const re = new RegExp(
      `\\b${a}\\s*\\??\\.\\s*(?:data\\s*\\??\\.\\s*)?([\\w$]+)`,
      "g",
    );
    while ((m = re.exec(bodyText)))
      dot.push({ name: `${a}.${m[1]}`, location: loc, field: m[1] });
  }
  return { vars, aliases: aliases.map((a) => a[0]), aliasUses: dot };
}
function classifyExpr(exprRaw, scope, depth = 0) {
  const expr = exprRaw.trim();
  const res = {
    clients: [],
    server: false,
    literal: false,
    fallbackLiteral: false,
    calls: [],
  };
  if (
    /^(null|undefined|true|false|-?\d+(\.\d+)?|(["'`])[^"'`$]*\3|\[\]|\{\}|DEFAULT|NULL|NOW\(\)|CURRENT_TIMESTAMP|now\(\)|'[^']*'(::\w+)?|\d+)$/i.test(
      expr,
    )
  ) {
    res.literal = true;
    if (/^(NOW\(\)|now\(\)|CURRENT_TIMESTAMP)$/i.test(expr)) {
      res.literal = false;
      res.server = true;
    }
    return res;
  }
  res.clients.push(...clientRefs(expr, scope.reqNames, scope.vars));
  for (const u of scope.aliasUses)
    if (expr.includes(u.name))
      res.clients.push({ location: u.location, field: u.field });
  if (SERVER_RE.test(expr)) res.server = true;
  if (/(\|\||\?\?)\s*(["'`])[^"'`]+\2/.test(expr)) res.fallbackLiteral = true;
  for (const c of expr.matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g))
    if (!KEYWORDS.has(c[1])) res.calls.push(c[1]);
  if (depth < 3) {
    const ids = expr
      .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, '""')
      .matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$]*\s*(?::|\())/g);
    const seen = new Set();
    for (const id of ids) {
      const nm = id[1];
      if (
        seen.has(nm) ||
        scope.vars.has(nm) ||
        KEYWORDS.has(nm) ||
        /^(req|request|res|JSON|null|undefined|true|false|Date|Math|Number|String|Array|Object)$/.test(
          nm,
        )
      )
        continue;
      seen.add(nm);
      const dm = new RegExp(
        `\\b(?:const|let|var)\\s+${nm.replace(/[$]/g, "\\$")}\\s*=\\s*([^;]+);`,
      ).exec(scope.text);
      const dm2 =
        dm ||
        new RegExp(
          `\\b(?:const|let|var)\\s*[\\[{][^=;]*\\b${nm.replace(/[$]/g, "\\$")}\\b[^=;]*[\\]}]\\s*=\\s*([^;]+);`,
        ).exec(scope.text);
      if (dm2 && DB_DERIVED.test(dm2[1])) res.server = true;
      if (dm && !dm[1].includes("=>")) {
        const sub = classifyExpr(dm[1], scope, depth + 1);
        res.clients.push(...sub.clients);
        if (sub.server) res.server = true;
        if (sub.fallbackLiteral) res.fallbackLiteral = true;
        res.calls.push(...sub.calls);
      }
    }
  }
  return res;
}
function sourceFor(expr, scope) {
  const c = classifyExpr(expr, scope);
  let clients = [
    ...new Map(c.clients.map((x) => [x.location + ":" + x.field, x])).values(),
  ];
  clients = clients.filter(
    (x) =>
      x.field || !clients.some((y) => y.location === x.location && y.field),
  );
  let kind = "unknown";
  if (clients.length && c.server) kind = "mixed";
  else if (clients.length) kind = "client";
  else if (c.server) kind = "server";
  else if (c.literal) kind = "literal";
  const calls = [...new Set(c.calls)]
    .filter((x) => !/^(req|res)\./.test(x))
    .slice(0, 3);
  const bare = /^[\w$.?]+$/.test(expr.replace(/\s+/g, ""));
  return {
    kind,
    clients,
    fallbackLiteral: c.fallbackLiteral,
    transform:
      bare || kind === "literal"
        ? "none"
        : calls.length
          ? calls.join("+")
          : "expression",
    expr: cut(squash(expr), 70),
  };
}

function paramExprs(fi, q, scopeText) {
  if (!q.paramsArg) return null;
  let t = argText(fi, q.paramsArg).trim();
  if (!t.startsWith("[")) {
    const idm = /^([A-Za-z_$][\w$]*)$/.exec(t);
    if (!idm) return null;
    const re = new RegExp(`\\b(?:const|let|var)\\s+${idm[1]}\\s*=\\s*\\[`, "g");
    let last = null;
    let m;
    while ((m = re.exec(fi.co)) && m.index < q.pos) last = m;
    if (!last) return null;
    const open = last.index + last[0].length - 1;
    t = fi.nc.slice(open, matchClose(fi.co, open) + 1);
  }
  const inner = t.slice(1, -1);
  const parts = splitTop(inner, 0, inner.length).map((r) =>
    inner.slice(r.s, r.e),
  );
  return parts;
}

// ---------------------------------------------------------------- write column mapping
function mapColumns(fi, q, scope) {
  const out = [];
  const add = (column, expr) => out.push({ column, ...sourceFor(expr, scope) });
  if (q.api === "drizzle") {
    const tbl = tableByVar.get(q.tableVar);
    const keyToCol = (k) =>
      tbl?.columns.find((c) => c.key === k)?.name ||
      (casingSnake ? toSnake(k) : k);
    const objText = q.kind === "insert" ? q.valuesArg : q.setArg;
    if (objText) {
      let body = objText.trim();
      const arr = /^\[\s*(\{[\s\S]*\})\s*[\],]?/.exec(body);
      if (arr) body = arr[1];
      if (body.startsWith("{")) {
        const co = mask(body).co;
        const entries = splitTop(co, 1, matchCloseSafe(co, 0));
        for (const en of entries) {
          const txt = body.slice(en.s, en.e);
          if (txt.startsWith("...")) {
            q.spread = true;
            continue;
          }
          const m =
            /^(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$]*))\s*(?::\s*([\s\S]+))?$/.exec(
              txt,
            );
          if (!m) continue;
          const key = m[2] || m[3];
          add(keyToCol(key), m[4] != null ? m[4] : key);
        }
      } else q.opaqueValues = true;
    }
  } else if (
    q.kind === "insert" &&
    q.cols &&
    q.vals &&
    !q.batch &&
    !q.insertSelect
  ) {
    const params = paramExprs(fi, q, scope.text);
    q.cols.forEach((col, i) => {
      const v = q.vals[i] ?? "";
      const pm = /\$(\d+)/.exec(v);
      if (pm && params) add(col, params[Number(pm[1]) - 1] ?? "?");
      else if (pm)
        out.push({
          column: col,
          kind: "unknown",
          clients: [],
          transform: "param",
          expr: cut(v, 40),
          fallbackLiteral: false,
        });
      else add(col, v);
    });
    if (q.cols.length && !params && q.vals.some((v) => /\$\d+/.test(v)))
      q.paramsUnresolved = true;
  } else if (q.kind === "update" && q.setPairs) {
    const params = paramExprs(fi, q, scope.text);
    for (const p of q.setPairs) {
      const pm = /\$(\d+)/.exec(p.expr);
      if (pm && params) add(p.col, params[Number(pm[1]) - 1] ?? "?");
      else if (pm)
        out.push({
          column: p.col,
          kind: "unknown",
          clients: [],
          transform: "param",
          expr: cut(p.expr, 40),
          fallbackLiteral: false,
        });
      else add(p.col, p.expr);
    }
    if (!params && q.setPairs.some((p) => /\$\d+/.test(p.expr)))
      q.paramsUnresolved = true;
  }
  return out;
}
function matchCloseSafe(co, open) {
  return matchClose(co, open);
}

// ---------------------------------------------------------------- servers: routes
const SERVER_RECV_DEFAULT = new Set([
  "app",
  "router",
  "server",
  "fastify",
  "hono",
  "api_router",
  "apiRouter",
  "routes",
  "route",
  "instance",
  "v1",
  "v2",
]);
function serverReceivers(fi) {
  const set = new Set(SERVER_RECV_DEFAULT);
  const re =
    /\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?(?:express\s*\.\s*Router|Router|express|new\s+Hono|Fastify|fastify|new\s+Elysia|new\s+Router)\s*\(/g;
  let m;
  while ((m = re.exec(fi.co))) set.add(m[1]);
  return set;
}
const joinPath = (...parts) => {
  const s = parts
    .filter((p) => p != null && p !== "")
    .join("/")
    .replace(/\/+/g, "/");
  return ("/" + s).replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
};
function funcParamNames(fi, fn) {
  if (!fn?.params) return [];
  const [a, b] = fn.params;
  return splitTop(fi.co, a, b).map((r) => {
    const t = fi.nc.slice(r.s, r.e);
    if (t.startsWith("{"))
      return {
        destructured: [
          ...t.matchAll(/(?:^|[,{])\s*([\w$]+)\s*(?::\s*([\w$]+))?/g),
        ].map((m) => ({ key: m[1], local: m[2] || m[1] })),
      };
    return { name: (/^\.{0,3}([\w$]+)/.exec(t) || [])[1] };
  });
}

const routeRecords = []; // before mount resolution
const mountCalls = []; // {fi, prefix, targetFile, mw:[names], line}
const globalMw = []; // {fileRel, prefix, name, line}
const fileHasRoutes = new Set();

function inlineHandlerRange(fi, a) {
  const t = argText(fi, a).trim();
  if (/^(async\s+)?(function\b|\(|[\w$]+\s*=>)/.test(t)) {
    const rel = fi.nc.slice(a.s, a.e);
    const idx = fi.co.slice(a.s, a.e);
    // body = first top-level "{" after params, or whole expr for arrow expression bodies
    let depth = 0;
    for (let i = 0; i < idx.length; i++) {
      const c = idx[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "{" && depth === 0)
        return {
          start: a.s + i,
          end: a.s + matchClose(idx, i) + 1,
          params: paramsOf(fi, a),
        };
    }
    return { start: a.s, end: a.e, params: paramsOf(fi, a) };
  }
  // wrapper: asyncHandler(async (req,res)=>{...}) / catchAsync(...)
  const w = /^([\w$.]+)\s*\(/.exec(t);
  if (w) {
    const open = a.s + w[0].length - 1;
    const close = matchClose(fi.co, open);
    const inner = splitTop(fi.co, open + 1, close);
    if (inner.length)
      return inlineHandlerRange(fi, inner[inner.length - 1]) || null;
  }
  return null;
}
function paramsOf(fi, a) {
  const t = fi.co.slice(a.s, a.e);
  const open = t.indexOf("(");
  if (open < 0 || /^[\w$]+\s*=>/.test(t.trim())) return null;
  const m = /^(?:async\s+)?(?:function\s*[\w$]*\s*)?\(/.exec(t.trim());
  if (!m) return null;
  const start = a.s + t.indexOf("(");
  const close = matchClose(fi.co, start);
  return [start + 1, close];
}

for (const fi of fileList) {
  const recvs = serverReceivers(fi);
  const rel = fi.rel;
  const looksClient =
    /(^|\/)(client|frontend|web|public|components|hooks)(\/|$)/i.test(rel) &&
    !/(^|\/)(server|backend|api)(\/|$)/i.test(rel);
  for (const c of fi.calls) {
    const rtail = tailOf(c.receiver);
    // ---- verb routes
    const routeCall = /\.route\(\s*(["'`])([^"'`]*)\1\s*\)$/.exec(
      squash(c.receiver),
    );
    if (
      VERBS.includes(c.name) &&
      (recvs.has(rtail.split(".").pop()) ||
        /Router$/.test(rtail) ||
        routeCall) &&
      !looksClient
    ) {
      let path0 = null;
      let argStart = 0;
      if (routeCall) path0 = routeCall[2];
      else if (c.args.length) {
        const s0 = strLit(argText(fi, c.args[0]));
        if (s0 != null && (s0.startsWith("/") || s0 === "" || s0 === "*")) {
          path0 = s0;
          argStart = 1;
        } else if (
          /^[A-Za-z_$][\w$.]*$/.test(argText(fi, c.args[0]).trim()) &&
          c.args.length > 1
        ) {
          path0 = null;
          argStart = 1;
        } else continue;
      } else continue;
      let rest = c.args.slice(argStart);
      if (!rest.length) continue;
      const handlerArg = rest[rest.length - 1];
      let mids = rest.slice(0, -1);
      let optsText = "";
      if (
        mids.length &&
        /^\{/.test(argText(fi, mids[mids.length - 1]).trim())
      ) {
        optsText = argText(fi, mids.pop());
      }
      const mwNames = mids.flatMap((a) => {
        const t = argText(fi, a).trim();
        if (t.startsWith("["))
          return splitTop(fi.co, a.s + 1, a.e - 1).map((r) => argName(fi, r));
        return [argName(fi, a)];
      });
      for (const m of optsText.matchAll(
        /(preHandler|onRequest|preValidation|preParsing)\s*:\s*(\[[^\]]*\]|[\w$.]+)/g,
      ))
        for (const n of m[2].matchAll(/[A-Za-z_$][\w$]*/g)) mwNames.push(n[0]);
      const hasSchemaOpt = /\bschema\s*:/.test(optsText);
      if (hasSchemaOpt) mwNames.push("schema-validation");
      routeRecords.push({
        routerVar: rtail.split(".").pop(),
        fi,
        method: c.name.toUpperCase(),
        path: path0,
        mwNames,
        mwArgs: mids,
        handlerArg,
        line: lineAt(fi, c.start),
        pos: c.start,
        confidence: path0 == null ? "low" : "high",
        framework: "express-like",
      });
      fileHasRoutes.add(rel);
      continue;
    }
    // ---- fastify route object
    if (
      c.name === "route" &&
      recvs.has(rtail.split(".").pop()) &&
      c.args.length === 1
    ) {
      const t = argText(fi, c.args[0]);
      const mm = /method\s*:\s*(?:\[\s*)?["'`]([A-Za-z]+)["'`]/.exec(t);
      const um = /\b(?:url|path)\s*:\s*["'`]([^"'`]+)["'`]/.exec(t);
      const hm = /\bhandler\s*:\s*([^,}\n]+)/.exec(t);
      if (mm && um) {
        const hIdx = hm
          ? c.args[0].s + t.indexOf(hm[0]) + hm[0].indexOf(hm[1])
          : c.args[0].s;
        routeRecords.push({
          fi,
          method: mm[1].toUpperCase(),
          path: um[1],
          mwNames: [
            ...t.matchAll(
              /(?:preHandler|onRequest|preValidation)\s*:\s*(\[[^\]]*\]|[\w$.]+)/g,
            ),
          ]
            .flatMap((m) =>
              [...m[1].matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]),
            )
            .concat(/\bschema\s*:/.test(t) ? ["schema-validation"] : []),
          mwArgs: [],
          handlerArg: { s: hIdx, e: hIdx + (hm ? hm[1].trim().length : 0) },
          line: lineAt(fi, c.start),
          pos: c.start,
          confidence: "medium",
          framework: "fastify",
        });
        fileHasRoutes.add(rel);
      }
      continue;
    }
    // ---- trpc mutation
    if (
      c.name === "mutation" &&
      /[pP]rocedure/.test(c.receiver) &&
      c.args.length
    ) {
      const before = fi.nc.slice(
        Math.max(0, c.start - c.receiver.length - 60),
        c.start - c.receiver.length,
      );
      const km = /([\w$]+)\s*:\s*$/.exec(before);
      const mw = [...c.receiver.matchAll(/\.(use|input)\(\s*([\w$]+)?/g)].map(
        (m) =>
          m[1] === "input" ? "input:" + (m[2] || "schema") : m[2] || m[1],
      );
      routeRecords.push({
        fi,
        method: "MUTATION",
        path: "trpc." + (km ? km[1] : "?"),
        mwNames: [
          /protected/i.test(c.receiver)
            ? "protectedProcedure"
            : "publicProcedure",
          ...mw,
        ],
        mwArgs: [],
        handlerArg: c.args[c.args.length - 1],
        line: lineAt(fi, c.start),
        pos: c.start,
        confidence: "medium",
        framework: "trpc",
        pathIsFinal: true,
      });
      fileHasRoutes.add(rel);
      continue;
    }
    // ---- app.use(...) mounts and global middleware
    if (
      c.name === "use" &&
      (recvs.has(rtail.split(".").pop()) || /Router$/.test(rtail)) &&
      c.args.length &&
      !looksClient
    ) {
      let prefix = "";
      let i0 = 0;
      const s0 = strLit(argText(fi, c.args[0]));
      if (s0 != null && s0.startsWith("/")) {
        prefix = s0;
        i0 = 1;
      } else if (
        c.args.length > 1 &&
        /^["'`]/.test(argText(fi, c.args[0]).trim())
      ) {
        i0 = 1;
      }
      const mw = [];
      let target = null;
      for (let k = i0; k < c.args.length; k++) {
        const t = squash(argText(fi, c.args[k]));
        const req = /^require\(\s*["']([^"']+)["']\s*\)\s*(\.\s*[\w$]+)?/.exec(
          t,
        );
        if (req && !req[2]) {
          const f = resolveRel(rel, req[1]);
          if (f) {
            target = target || f;
            continue;
          }
        }
        const idm = /^([A-Za-z_$][\w$]*)$/.exec(t);
        if (idm) {
          const im = fi.imports.get(idm[1]);
          if (im?.file && (im.imported !== "*") === false) {
            target = target || im.file;
            continue;
          }
          if (im?.file) {
            target = target || im.file;
            continue;
          }
          // local router variable defined in same file
          if (recvs.has(idm[1]) && idm[1] !== "app") {
            target = target || rel + "#" + idm[1];
            continue;
          }
        }
        mw.push(argName(fi, c.args[k]));
      }
      mountCalls.push({ fi, prefix, target, mw, line: lineAt(fi, c.start) });
    }
  }
  // ---- Next.js
  if (/(^|\/)app\/.*route\.[jt]sx?$/.test(rel)) {
    const segs = rel.split("/");
    const ai = segs.lastIndexOf("app");
    const urlPath =
      "/" +
      segs
        .slice(ai + 1, -1)
        .filter((s) => !/^\(.*\)$/.test(s))
        .map((s) =>
          s.replace(/^\[\.\.\.(.+)\]$/, ":$1*").replace(/^\[(.+)\]$/, ":$1"),
        )
        .join("/");
    for (const v of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const m = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${v}\\b|export\\s+const\\s+${v}\\s*=`,
      ).exec(fi.co);
      if (m)
        routeRecords.push({
          fi,
          method: v,
          path: urlPath.replace(/\/+/g, "/"),
          mwNames: [],
          mwArgs: [],
          handlerName: v,
          line: lineAt(fi, m.index),
          pos: m.index,
          confidence: "high",
          framework: "next-app",
          pathIsFinal: true,
        });
    }
    if (routeRecords.some((r) => r.fi === fi)) fileHasRoutes.add(rel);
  } else if (/(^|\/)pages\/api\/.*\.[jt]sx?$/.test(rel)) {
    const segs = rel.split("/");
    const pi = segs.lastIndexOf("api");
    const urlPath =
      "/api/" +
      segs
        .slice(pi + 1)
        .join("/")
        .replace(/\.[jt]sx?$/, "")
        .replace(/\/index$/, "")
        .replace(/\[(.+?)\]/g, ":$1");
    const m =
      /export\s+default\s+(?:async\s+)?function\s*([\w$]*)/.exec(fi.co) ||
      /export\s+default\s+/.exec(fi.co);
    if (m) {
      routeRecords.push({
        fi,
        method: "ANY",
        path: urlPath,
        mwNames: [],
        mwArgs: [],
        handlerName: m[1] || null,
        handlerWhole: !m[1],
        line: lineAt(fi, m.index),
        pos: m.index,
        confidence: "low",
        framework: "next-pages",
        pathIsFinal: true,
      });
      fileHasRoutes.add(rel);
    }
  }
  // ---- NestJS
  if (/@Controller\s*\(/.test(fi.nc)) {
    const ctrls = [
      ...fi.nc.matchAll(/@Controller\s*\(\s*(?:["'`]([^"'`]*)["'`])?[^)]*\)/g),
    ];
    for (const m of fi.nc.matchAll(
      /@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:["'`]([^"'`]*)["'`])?[^)]*\)\s*((?:@[\w$]+\s*\([^)]*\)\s*)*)(?:async\s+)?([\w$]+)\s*\(/g,
    )) {
      const ctrl = [...ctrls].filter((x) => x.index < m.index).pop();
      const pre = fi.nc.slice(Math.max(0, m.index - 300), m.index);
      const guards = [
        ...(
          pre +
          m[3] +
          fi.nc.slice(ctrl ? ctrl.index : 0, ctrl ? ctrl.index + 200 : 0)
        ).matchAll(
          /@(UseGuards|UsePipes|UseInterceptors|Throttle)\s*\(([^)]*)\)/g,
        ),
      ].map((x) => x[1] + ":" + squash(x[2]));
      routeRecords.push({
        fi,
        method: m[1].toUpperCase(),
        path: joinPath(ctrl?.[1] || "", m[2] || ""),
        mwNames: guards,
        mwArgs: [],
        handlerName: m[4],
        line: lineAt(fi, m.index),
        pos: m.index,
        confidence: "medium",
        framework: "nestjs",
        pathIsFinal: true,
      });
      fileHasRoutes.add(rel);
    }
  }
}

// ---- mount resolution
const mountsByTarget = new Map(); // file -> [{parent, prefix, mw}]
for (const mc of mountCalls) {
  if (!mc.target) continue;
  const tgt = mc.target.includes("#") ? mc.target.split("#")[0] : mc.target;
  if (!fileHasRoutes.has(tgt) && !mc.target.includes("#")) {
    // not a router file: treat as middleware module
    mc.mw.push(path.basename(tgt).replace(/\.[^.]+$/, ""));
    mc.target = null;
    continue;
  }
  if (!mountsByTarget.has(mc.target)) mountsByTarget.set(mc.target, []);
  mountsByTarget.get(mc.target).push(mc);
}
for (const mc of mountCalls)
  if (!mc.target)
    for (const n of mc.mw) {
      if (/^[(\[{]|^(function|async|require)\b|=>/.test(n) || n === "require")
        continue;
      globalMw.push({
        file: mc.fi.rel,
        prefix: mc.prefix,
        name: n,
        line: mc.line,
      });
    }
function prefixesFor(file, seen = new Set()) {
  if (seen.has(file)) return [{ prefix: "", mounted: false, mw: [], via: [] }];
  seen = new Set(seen).add(file);
  const inc = mountsByTarget.get(file) || [];
  if (!inc.length) return [{ prefix: "", mounted: false, mw: [], via: [] }];
  const out = [];
  for (const mc of inc) {
    const parents = prefixesFor(mc.fi.rel, seen);
    for (const p of parents)
      out.push({
        prefix:
          joinPath(p.prefix, mc.prefix) === "/"
            ? ""
            : joinPath(p.prefix, mc.prefix),
        mounted: true,
        mw: [...p.mw, ...mc.mw],
        via: [...p.via, `${mc.fi.rel}:${mc.line}`],
      });
  }
  return out;
}

// ---------------------------------------------------------------- validators
const validators = [];
for (const fi of fileList) {
  for (const c of fi.calls) {
    const rt = tailOf(c.receiver);
    let lib = null;
    if (c.name === "object" && /^(z|zod|Joi|joi|yup|Yup|v|S|schema)$/.test(rt))
      lib = /^(Joi|joi)$/.test(rt) ? "joi" : /yup/i.test(rt) ? "yup" : "zod";
    else if (/^create(Insert|Select|Update)Schema$/.test(c.name))
      lib = "drizzle-zod";
    else if (c.name === "Object" && rt === "Type") lib = "typebox";
    if (!lib) continue;
    const before = fi.nc.slice(
      Math.max(0, c.start - c.receiver.length - 120),
      c.start - (c.receiver ? c.receiver.length + 1 : 0),
    );
    const nm =
      /(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:\w+\s*\.\s*)?$/.exec(
        before.replace(/\s+$/, " "),
      );
    const fields = [];
    if (lib === "drizzle-zod") {
      const tv = squash(argText(fi, c.args[0] || { s: 0, e: 0 }));
      const t = tableByVar.get(tv);
      if (t)
        for (const col of t.columns)
          fields.push({
            name: col.key,
            type: col.type,
            limits: col.length ? `max ${col.length}` : "",
            required: col.notNull && !col.default,
          });
    } else if (c.args.length) {
      const a = c.args[0];
      if (fi.co[a.s] === "{") {
        for (const en of splitTop(fi.co, a.s + 1, a.e - 1)) {
          const txt = fi.nc.slice(en.s, en.e);
          const km =
            /^(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]+)$/.exec(
              txt,
            );
          if (!km) continue;
          const expr = km[4];
          const tm = /^(?:[\w$]+\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\(/.exec(
            expr.trim(),
          );
          const lim = [
            ...expr.matchAll(
              /\.(min|max|length|gte|lte|email|uuid|regex|int|positive|nonempty|trim|url)\(([^)]*)\)/g,
            ),
          ].map((x) => `${x[1]}${x[2] ? " " + squash(x[2]) : ""}`);
          fields.push({
            name: km[2] || km[3],
            type: tm ? tm[1] : "unknown",
            limits: lim.join(", "),
            required: !/\.(optional|nullable|nullish)\(|\.default\(/.test(expr),
          });
        }
      }
    }
    validators.push({
      id: `validator:${fi.rel}:${lineAt(fi, c.start)}`,
      name: nm ? nm[1] : null,
      library: lib,
      fields,
      evidence: { file: fi.rel, line: lineAt(fi, c.start) },
      confidence: lib === "drizzle-zod" || fields.length ? "high" : "low",
    });
  }
}
validators.sort((a, b) =>
  a.evidence.file < b.evidence.file
    ? -1
    : a.evidence.file > b.evidence.file
      ? 1
      : a.evidence.line - b.evidence.line,
);

// ---------------------------------------------------------------- route analysis
const RES_NAMES = /^(json|send|end|sendStatus|redirect|sendFile|render)$/;
const SIDE_RE = /(publish|enqueue|xadd|dispatch|sendMail|sendEmail|notify)\w*/i;
const AUTH_IN_HANDLER =
  /getSchoolIdFromRequest|verifyToken|jwt\.verify|\breq\.(user|auth)\b|requireAuth|isAuthenticated|authenticate\(/;
const IDEMP =
  /idempoten|submission_?id|request_?id|client_?request|dedupe|dedup/i;
const SKIP_RECV_ROOT = new Set([
  "res",
  "req",
  "console",
  "JSON",
  "Object",
  "Array",
  "Math",
  "Number",
  "String",
  "Promise",
  "Date",
  "Buffer",
  "process",
  "fs",
  "path",
  "db",
  "pool",
  "client",
  "tx",
  "trx",
  "logger",
  "log",
  "next",
  "app",
  "router",
  "this",
  "Map",
  "Set",
  "crypto",
  "Intl",
  "Error",
  "Symbol",
  "parseInt",
  "parseFloat",
]);

function rangeFuncFor(fi, name) {
  const fn = findFunction(fi, name);
  return fn ? { fi, ...fn, name } : null;
}
function resolveCall(fi, c) {
  const root = c.receiver
    ? c.receiver.replace(/\(.*$/, "").split(".")[0].trim()
    : null;
  if (!c.receiver) {
    const local = rangeFuncFor(fi, c.name);
    if (local) return local;
    const im = fi.imports.get(c.name);
    if (im?.file) {
      const tfi = sources.get(im.file);
      const fname =
        im.imported === "default" || im.imported === "*" ? c.name : im.imported;
      return (
        rangeFuncFor(tfi, fname) ||
        (im.imported === "default" ? rangeFuncFor(tfi, "default") : null)
      );
    }
    return null;
  }
  if (root === "this") return rangeFuncFor(fi, c.name);
  if (SKIP_RECV_ROOT.has(root)) return null;
  const im = fi.imports.get(root);
  if (im?.file) return rangeFuncFor(sources.get(im.file), c.name);
  return null;
}

function analyzeRoute(rr) {
  const fi = rr.fi;
  // locate handler
  let handler = null;
  if (rr.handlerWhole)
    handler = { fi, start: 0, end: fi.text.length, name: "default" };
  else if (rr.handlerName) handler = rangeFuncFor(fi, rr.handlerName);
  else if (rr.handlerArg) {
    const inl = inlineHandlerRange(fi, rr.handlerArg);
    if (inl) handler = { fi, ...inl, name: "inline" };
    else {
      const t = squash(argText(fi, rr.handlerArg));
      const idm = /^([A-Za-z_$][\w$]*)$/.exec(t);
      const mem = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(t);
      if (idm) {
        handler = rangeFuncFor(fi, idm[1]);
        if (!handler) {
          const im = fi.imports.get(idm[1]);
          if (im?.file)
            handler = rangeFuncFor(
              sources.get(im.file),
              im.imported === "default" || im.imported === "*"
                ? idm[1]
                : im.imported,
            );
        }
      } else if (mem) {
        const im = fi.imports.get(mem[1]);
        if (im?.file) handler = rangeFuncFor(sources.get(im.file), mem[2]);
        else handler = rangeFuncFor(fi, mem[2]);
      }
    }
  }
  return { handler };
}

function gather(handler, route) {
  // BFS through the call graph (depth 2) collecting db calls, side effects, request fields, responses.
  const result = {
    queries: [],
    sideEffects: [],
    reqFields: [],
    responses: [],
    bodyUsedWhole: false,
    notes: [],
    handlerText: "",
  };
  const seen = new Set();
  const stack = [
    {
      h: handler,
      depth: 0,
      bindings: new Map(),
      reqAliases: [],
      deferred: false,
    },
  ];
  while (stack.length) {
    const {
      h,
      depth,
      bindings,
      reqAliases,
      deferred: entryDeferred,
    } = stack.shift();
    const key = h.fi.rel + ":" + h.start;
    if (seen.has(key)) continue;
    seen.add(key);
    const fi = h.fi;
    const text = fi.nc.slice(h.start, h.end);
    if (depth === 0) result.handlerText = text;
    const reqNames = reqNamesFor(reqAliases);
    // include params bound as aliases of req
    const params = h.params
      ? [h.params]
      : h.name !== "inline" && h.name !== "default"
        ? [funcParamsRange(fi, h)]
        : [];
    const cv = collectClientVars(text, reqNames);
    // bindings from caller (params receiving client data)
    const vars = new Map([...cv.vars, ...bindings]);
    // handler params: destructured (req, res) pattern
    if (depth === 0) {
      const pnames = h.params
        ? splitTop(fi.co, h.params[0], h.params[1]).map((r) =>
            fi.nc.slice(r.s, r.e),
          )
        : [];
      const first = pnames[0] && /^[\w$]+$/.test(pnames[0]) ? pnames[0] : null;
      if (first && !reqNames.includes(first)) reqNames.push(first);
      // Hono: c.req.json() ; Fastify: request
    }
    const scope = { text, vars, reqNames, aliasUses: cv.aliasUses };
    // request fields
    const rn = reqNames.join("|");
    const fre = new RegExp(
      `\\b(?:${rn})\\s*\\??\\.\\s*(body|query|params|headers|header|cookies)\\b(?:\\s*\\??\\.\\s*([\\w$]+)|\\s*\\[\\s*["']([^"']+)["']\\s*\\]|\\s*\\(\\s*["']([^"']+)["']\\s*\\))?`,
      "g",
    );
    let m;
    while ((m = fre.exec(text))) {
      const field = m[2] || m[3] || m[4] || null;
      const loc = m[1] === "header" ? "headers" : m[1];
      if (
        field &&
        /^(length|hasOwnProperty|toString|map|forEach|filter|some|every|find|includes|keys|values|entries)$/.test(
          field,
        )
      )
        continue;
      if (!field) {
        if (loc === "body") result.bodyUsedWhole = true;
        continue;
      }
      result.reqFields.push({
        name: field,
        location: loc,
        line: lineAt(fi, h.start + m.index),
        file: fi.rel,
        via: depth === 0 ? "direct" : "helper",
      });
    }
    for (const [vn, ref] of cv.vars)
      if (!vn.startsWith("\u0000")) {
        const idx = text.search(
          new RegExp(`\\b${vn.replace(/[$]/g, "\\$")}\\b`),
        );
        result.reqFields.push({
          name: ref.field,
          location: ref.location,
          line: lineAt(fi, h.start + Math.max(0, idx)),
          file: fi.rel,
          via: depth === 0 ? "direct" : "helper",
        });
      }
    for (const u of cv.aliasUses)
      result.reqFields.push({
        name: u.field,
        location: u.location,
        line: lineAt(fi, h.start),
        file: fi.rel,
        via: depth === 0 ? "direct" : "helper",
      });
    // db calls
    const defRanges = fi.calls
      .filter(
        (c) =>
          c.start >= h.start &&
          c.start < h.end &&
          /^(setImmediate|setTimeout|nextTick|queueMicrotask)$/.test(c.name),
      )
      .map((c) => [c.start, c.end]);
    const inDeferred = (pos) =>
      entryDeferred || defRanges.some(([a, b]) => pos >= a && pos < b);
    const fireAndForget = (c) => {
      let pre = fi.nc.slice(Math.max(h.start, c.start - 120), c.start);
      pre = pre.slice(
        Math.max(
          pre.lastIndexOf(";"),
          pre.lastIndexOf("{"),
          pre.lastIndexOf("}"),
        ) + 1,
      );
      return (
        !/\b(await|return)\b|=/.test(pre) &&
        /^\s*\.\s*(catch|then)\s*\(/.test(fi.nc.slice(c.end, c.end + 30))
      );
    };
    const dbs = dbCalls(fi).filter((q) => q.pos >= h.start && q.pos < h.end);
    for (const q of dbs) {
      const cols =
        q.kind === "insert" || q.kind === "update"
          ? mapColumns(fi, q, scope)
          : [];
      const tbl =
        q.api === "drizzle"
          ? tableByVar.get(q.tableVar)
          : tableByName.get(q.table);
      result.queries.push({
        q,
        fi,
        depth,
        cols,
        tableName:
          tbl?.name || q.table || (q.tableVar ? `?${q.tableVar}` : null),
        fnName: h.name,
        funcStart: h.start,
        funcEnd: h.end,
        deferred: inDeferred(q.pos),
        errorPath: !!q.inCatch,
      });
    }
    // calls inside range
    const calls = fi.calls.filter((c) => c.start >= h.start && c.start < h.end);
    for (const c of calls) {
      const rt = tailOf(c.receiver);
      if (
        (/^(res|reply)$/.test(rt.split(".")[0]) && RES_NAMES.test(c.name)) ||
        (/NextResponse|Response$/.test(rt) && c.name === "json")
      ) {
        const sm =
          /status\(\s*(\d{3})/.exec(c.receiver) ||
          (c.name === "sendStatus"
            ? /(\d{3})/.exec(argText(fi, c.args[0] || { s: 0, e: 0 }))
            : null) ||
          /status\s*:\s*(\d{3})/.exec(fi.nc.slice(c.start, c.end));
        const before = fi.nc.slice(Math.max(h.start, c.start - 40), c.start);
        const stmtStart = before.lastIndexOf("\n");
        const lead = before.slice(stmtStart + 1);
        const after = fi.nc.slice(c.end, c.end + 40);
        result.responses.push({
          pos: c.start,
          line: lineAt(fi, c.start),
          status: sm ? Number(sm[1]) : 200,
          returned: /\breturn\b/.test(lead) || /^\s*;?\s*return\b/.test(after),
          depth,
          fnStart: h.start,
        });
      }
      if (SIDE_RE.test(c.name) && !DB_TAIL.test(rt)) {
        const recvRoot = c.receiver.split(".")[0];
        if (
          /redis|queue|bull|stream|job|mail|bus|kafka|sqs|events?/i.test(
            c.receiver + c.name,
          ) ||
          fi.imports.get(recvRoot)?.spec?.match(/queue|redis|mail/i)
        )
          result.sideEffects.push({
            name: (c.receiver ? c.receiver + "." : "") + c.name,
            line: lineAt(fi, c.start),
            file: fi.rel,
            depth,
          });
      }
      if (depth < 2) {
        const tgt = resolveCall(fi, c);
        if (tgt && !seen.has(tgt.fi.rel + ":" + tgt.start)) {
          const nb = new Map();
          const aliases = [];
          const plist = funcParamNames(tgt.fi, tgt);
          c.args.forEach((a, i) => {
            const at = argText(fi, a).trim();
            const p = plist[i];
            if (!p) return;
            if (/^(req|request)$/.test(at) || reqNames.includes(at)) {
              if (p.name) aliases.push(p.name);
              return;
            }
            const refs = clientRefs(at, reqNames, vars);
            if (refs.length) {
              if (p.name) nb.set(p.name, refs[0]);
              if (p.destructured && /\breq\.body\s*$|^[\w$]+$/.test(at))
                for (const d of p.destructured)
                  nb.set(d.local, { location: refs[0].location, field: d.key });
            }
          });
          stack.push({
            h: tgt,
            depth: depth + 1,
            bindings: nb,
            reqAliases: aliases,
            deferred: inDeferred(c.start) || fireAndForget(c),
          });
        }
      }
    }
  }
  return result;
}
function funcParamsRange(fi, h) {
  return h.params || null;
}

// ---------------------------------------------------------------- build routes
const routes = [];
const writes = [];
const unresolved = [];
const addUnresolved = (kind, message, file, line) =>
  unresolved.push({
    id: `unresolved:${kind}:${file || "-"}:${line || 0}`,
    kind,
    message,
    evidence: file ? { file, line: line || 0 } : null,
  });
const writeKey = (q, fi) => `${fi.rel}:${q.line}:${q.pos}`;
const writeIndex = new Map();
const SCRIPT_TEXT =
  /\bprocess\.exit\(|require\.main\s*===\s*module|^\s*\(async\s*\(\)\s*=>|^main\(\)|^run\(\)/m;
const EXPORTS_TEXT = /module\.exports|\bexports\.?\w+\s*=|^\s*export\s/m;
const isScriptFile = (rel) => {
  if (isScriptPath(rel)) return true;
  const fi = sources.get(rel);
  return !!fi && SCRIPT_TEXT.test(fi.nc) && !EXPORTS_TEXT.test(fi.nc);
};
const isScriptPath = (p) =>
  /(^|\/)(scripts?|scratch|migrations?|seeds?|load-test|tests?|__tests__|e2e|fixtures?|backups?|tools)(\/|$)|\.(test|spec)\.[jt]sx?$|(^|\/)(create|check|fix|debug|inspect|migrate|patch|add|clean|drop|list|find|match|seed|insert|diagnose|build|test|register|reseed|reset|scratch|truncate|verify|scan|smoke|restore|backup)_[\w.-]*\.[cm]?[jt]s$/i.test(
    p,
  );

for (const rr of routeRecords) {
  const fi = rr.fi;
  const { handler } = analyzeRoute(rr);
  const mountKey =
    rr.routerVar && mountsByTarget.has(fi.rel + "#" + rr.routerVar)
      ? fi.rel + "#" + rr.routerVar
      : fi.rel;
  const bases = rr.pathIsFinal
    ? [{ prefix: "", mounted: true, mw: [], via: [] }]
    : prefixesFor(mountKey);
  const fullPaths = [
    ...new Set(bases.map((b) => joinPath(b.prefix, rr.path ?? ""))),
  ];
  const mounted =
    bases.some((b) => b.mounted) || rr.pathIsFinal || fileDeclaresRoot(fi);
  const mwGlobal = [];
  for (const b of bases)
    for (const n of b.mw) mwGlobal.push({ name: n, via: "mount" });
  for (const g of globalMw)
    if (
      fullPaths.some(
        (p) =>
          g.prefix === "" ||
          p === g.prefix ||
          p.startsWith(g.prefix.replace(/\/$/, "") + "/"),
      )
    )
      mwGlobal.push({
        name: g.name,
        via: "app.use",
        file: g.file,
        line: g.line,
      });
  const routerMw = (mountCalls.filter((mc) => false), []);
  // router.use(mw) in same file as route (applies to the router)
  for (const c of fi.calls)
    if (
      c.name === "use" &&
      c.pos == null &&
      c.start < rr.pos &&
      tailOf(c.receiver).split(".").pop() !== "app" &&
      c.args.length &&
      !/^["'`]/.test(argText(fi, c.args[0]).trim()) &&
      !/^require\(/.test(argText(fi, c.args[0]).trim())
    )
      routerMw.push({
        name: argName(fi, c.args[0]),
        via: "router.use",
        file: fi.rel,
        line: lineAt(fi, c.start),
      });
  const mwAll = [
    ...rr.mwNames.map((n) => ({ name: n, via: "route" })),
    ...routerMw,
    ...mwGlobal,
  ];
  const mwUnique = [];
  const seenMw = new Set();
  for (const m of mwAll) {
    const k = m.name + "|" + m.via;
    if (!seenMw.has(k)) {
      seenMw.add(k);
      mwUnique.push(m);
    }
  }
  const cls = classify(mwUnique.map((m) => m.name));
  const g = handler ? gather(handler, rr) : null;
  const handlerLoc = handler
    ? { file: handler.fi.rel, line: lineAt(handler.fi, handler.start) }
    : null;
  const route = {
    id: `route:${rr.method}:${fullPaths[0]}@${fi.rel}:${rr.line}`,
    method: rr.method,
    path: fullPaths[0],
    aliases: fullPaths.slice(1),
    routePathLiteral: rr.path,
    mountResolved: !!mounted && rr.path != null,
    framework: rr.framework,
    evidence: { file: fi.rel, line: rr.line },
    handler: handlerLoc ? { ...handlerLoc, name: handler.name } : null,
    middleware: {
      names: mwUnique.map((m) => m.name),
      detail: mwUnique,
      classes: cls,
    },
    requestFields: [],
    bodyUsedWhole: false,
    validatorIds: [],
    queries: [],
    metrics: {
      dataQueries: 0,
      reads: 0,
      writes: 0,
      txControl: 0,
      roundTrips: 0,
      inLoop: 0,
    },
    transaction: { begins: 0, commits: 0, callback: false },
    responses: [],
    responseBeforeCommit: false,
    sideEffects: [],
    authInHandler: false,
    idempotencySignal: null,
    confidence: rr.confidence,
  };
  if (rr.path == null)
    addUnresolved(
      "route-path",
      `Route path is not a string literal (${rr.method}); mounted path cannot be resolved.`,
      fi.rel,
      rr.line,
    );
  else if (!mounted)
    addUnresolved(
      "mount-unknown",
      `Router file has no resolvable mount; the path shown (${fullPaths[0]}) is relative to its router.`,
      fi.rel,
      rr.line,
    );
  if (!mounted && route.confidence === "high") route.confidence = "medium";
  if (!handler) {
    route.confidence = "low";
    addUnresolved(
      "handler-not-found",
      `Handler for ${rr.method} ${fullPaths[0]} could not be located; queries are not linked.`,
      fi.rel,
      rr.line,
    );
  } else {
    route.handlerTextHead = undefined;
    const seenReq = new Set();
    for (const f of [...g.reqFields].sort((a, b) =>
      a.via === b.via ? 0 : a.via === "direct" ? -1 : 1,
    )) {
      const k = `${f.location}:${f.name}`;
      if (!seenReq.has(k)) {
        seenReq.add(k);
        route.requestFields.push({
          name: f.name,
          location: f.location,
          file: f.file,
          line: f.line,
          via: f.via,
        });
      }
    }
    route.requestFields.sort((a, b) =>
      a.location + a.name < b.location + b.name ? -1 : 1,
    );
    route.bodyUsedWhole = g.bodyUsedWhole;
    route.authInHandler = AUTH_IN_HANDLER.test(g.handlerText);
    const im = IDEMP.exec(g.handlerText);
    const onc = g.queries.find(
      (x) => x.q.conflict && !x.deferred && !x.errorPath,
    );
    route.idempotencySignal = onc
      ? { kind: "on-conflict", file: onc.fi.rel, line: onc.q.line }
      : im
        ? { kind: "name-match", match: im[0] }
        : null;
    for (const x of g.queries) {
      const q = x.q;
      const linked =
        x.depth === 0 ? "direct" : x.depth === 1 ? "one-hop" : "heuristic";
      const entry = {
        writeId:
          q.kind === "insert" || q.kind === "update" || q.kind === "delete"
            ? `write:${x.fi.rel}:${q.line}:${q.pos}`
            : null,
        op: q.kind === "txctl" ? q.op : q.kind,
        api: q.api,
        table: x.tableName,
        evidence: { file: x.fi.rel, line: q.line },
        linked,
        inLoop: q.inLoop,
        sqlHead: q.sql ? cut(q.sql, 110) : null,
        deferred: !!x.deferred,
        errorPath: !!x.errorPath && !x.deferred,
        confidence:
          q.dynamic || q.kind === "unknown-sql" || q.dynamicSource
            ? "low"
            : linked === "heuristic"
              ? "low"
              : linked === "one-hop"
                ? "medium"
                : "high",
      };
      if (q.kind === "unknown-sql") {
        entry.op = "unknown";
        addUnresolved(
          "dynamic-sql",
          `Query text could not be read statically (${q.sql}).`,
          x.fi.rel,
          q.line,
        );
      }
      route.queries.push({
        ...entry,
        _pos: q.pos,
        _file: x.fi.rel,
        _fn: x.funcStart,
        _end: x.funcEnd,
        _inTxCb: q.inTxCallback,
        _hasWhere: q.hasWhere,
        _q: q,
        _cols: x.cols,
      });
    }
    route.responses = g.responses
      .filter((r) => r.depth === 0)
      .map((r) => ({
        line: r.line,
        status: r.status,
        returned: r.returned,
        pos: r.pos,
      }));
    route.sideEffects = g.sideEffects
      .map((s) => ({ name: s.name, file: s.file, line: s.line }))
      .filter(
        (s, i, a) =>
          a.findIndex(
            (t) => t.name === s.name && t.line === s.line && t.file === s.file,
          ) === i,
      );
    // transaction + counts
    for (const e of route.queries) {
      if (e.errorPath) {
        route.metrics.errorPathQueries =
          (route.metrics.errorPathQueries || 0) + 1;
        continue;
      }
      if (e.deferred) {
        route.metrics.deferredQueries =
          (route.metrics.deferredQueries || 0) + 1;
        if (e.writeId)
          route.metrics.deferredWrites =
            (route.metrics.deferredWrites || 0) + 1;
        continue;
      }
      if (e.op === "BEGIN") route.transaction.begins++;
      if (e.op === "COMMIT") route.transaction.commits++;
      if (e.op === "read") route.metrics.reads++;
      else if (["insert", "update", "delete"].includes(e.op))
        route.metrics.writes++;
      else if (
        ["BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE"].includes(e.op)
      )
        route.metrics.txControl++;
      if (e.inLoop) route.metrics.inLoop++;
    }
    route.metrics.dataQueries = route.queries.filter(
      (e) =>
        !e.deferred &&
        !e.errorPath &&
        ![
          "BEGIN",
          "COMMIT",
          "ROLLBACK",
          "SAVEPOINT",
          "RELEASE",
          "session",
        ].includes(e.op),
    ).length;
    // ROLLBACK is on the error path only; do not count it as a round trip of the happy path.
    route.metrics.roundTrips = route.queries.filter(
      (e) =>
        !e.deferred && !e.errorPath && !["ROLLBACK", "session"].includes(e.op),
    ).length;
    route.transaction.callback = route.queries.some((e) => e._inTxCb);
    for (const e of route.queries) {
      if (["insert", "update", "delete"].includes(e.op) || e.op === "read") {
        const hasBegin = route.queries.some(
          (b) =>
            b.op === "BEGIN" &&
            b._file === e._file &&
            b._fn === e._fn &&
            b._pos < e._pos,
        );
        const hasCommit = route.queries.some(
          (b) =>
            b.op === "COMMIT" &&
            b._file === e._file &&
            b._fn === e._fn &&
            b._pos > e._pos,
        );
        e.inTransaction = (hasBegin && hasCommit) || e._inTxCb;
      }
    }
    // response before commit / before write (possible)
    const hs = handler;
    const firstWrite = route.queries.filter(
      (e) =>
        e.writeId &&
        !e.errorPath &&
        e._file === hs.fi.rel &&
        e._pos >= hs.start &&
        e._pos < hs.end,
    );
    const commits = route.queries.filter(
      (e) =>
        e.op === "COMMIT" &&
        e._file === hs.fi.rel &&
        e._pos >= hs.start &&
        e._pos < hs.end,
    );
    for (const r of g.responses.filter(
      (r) => r.depth === 0 && r.status < 400 && !r.returned,
    )) {
      const wAfter = firstWrite.some((w) => w._pos > r.pos);
      const cAfter = commits.some((c) => c._pos > r.pos);
      const wBefore = firstWrite.some((w) => w._pos < r.pos);
      if (wAfter || (wBefore && cAfter)) {
        route.responseBeforeCommit = {
          line: r.line,
          kind: wAfter ? "response-before-write" : "response-before-commit",
        };
        break;
      }
    }
    // writes registry
    for (const e of route.queries) {
      if (!e.writeId) continue;
      let w = writeIndex.get(e.writeId);
      const q = e._q;
      if (!w) {
        w = {
          id: e.writeId,
          op: e.op,
          api: q.api,
          table: e.table,
          evidence: e.evidence,
          enclosingFunction: null,
          inTransaction: !!e.inTransaction,
          conflict: q.conflict || null,
          returning: !!q.returning,
          batch: !!q.batch,
          hasWhere: q.kind === "insert" ? null : !!q.hasWhere,
          sqlHead: q.sql || null,
          columns: e._cols.map((c) => ({
            column: c.column,
            source: c.kind,
            clientFields: c.clients
              .map((x) => `${x.location}.${x.field ?? "*"}`)
              .sort(),
            transform: c.transform,
            fallbackLiteral: c.fallbackLiteral || false,
            expr: c.expr,
          })),
          dynamic: !!(
            q.dynamicColumns ||
            q.spread ||
            q.opaqueValues ||
            q.paramsUnresolved ||
            q.insertSelect
          ),
          context: isScriptFile(e._file) ? "script" : "app",
          routeIds: [],
          linked: e.linked,
          confidence: e.confidence,
          _routeCols: new Map(),
        };
        const efn =
          /^\s*(?:async\s+)?function\s+([\w$]+)/.exec(
            sources.get(e._file).nc.slice(e._fn - 0, e._fn + 0),
          ) || null;
        writeIndex.set(e.writeId, w);
        writes.push(w);
      }
      if (!w.routeIds.includes(route.id)) w.routeIds.push(route.id);
      const rank = { direct: 0, "one-hop": 1, heuristic: 2 };
      if (rank[e.linked] < rank[w.linked]) w.linked = e.linked;
      route.writeIds = route.writeIds || [];
      route.writeIds.push(e.writeId);
      if (w.dynamic) {
        const reason = q.insertSelect
          ? "INSERT … SELECT"
          : q.dynamicColumns
            ? "dynamic column list"
            : q.spread
              ? "spread in values"
              : q.paramsUnresolved
                ? "parameter array not static"
                : "values not a literal object";
        addUnresolved(
          "column-mapping",
          `Column mapping for ${e.table || "?"} is incomplete (${reason}).`,
          e.evidence.file,
          e.evidence.line,
        );
      }
      if (!e.table || String(e.table).startsWith("?"))
        addUnresolved(
          "table-unresolved",
          `Write target table could not be resolved (${q.tableVar || q.sql || "?"}).`,
          e.evidence.file,
          e.evidence.line,
        );
    }
  }
  routes.push(route);
}
function fileDeclaresRoot(fi) {
  return (
    /\.listen\(|express\(\)|new\s+Hono\(|Fastify\(/.test(fi.co) &&
    !mountsByTarget.has(fi.rel)
  );
}

// writes not reached from any route (workers, scripts, helpers): scan every file
for (const fi of fileList) {
  for (const q of dbCalls(fi)) {
    if (!["insert", "update", "delete"].includes(q.kind)) continue;
    const id = `write:${fi.rel}:${q.line}:${q.pos}`;
    if (writeIndex.has(id)) continue;
    const tbl =
      q.api === "drizzle"
        ? tableByVar.get(q.tableVar)
        : tableByName.get(q.table);
    const cols = (() => {
      const scopeText = fi.nc.slice(Math.max(0, q.pos - 2500), q.pos + 300);
      const cv = collectClientVars(scopeText, reqNamesFor([]));
      return mapColumns(fi, q, {
        text: scopeText,
        vars: cv.vars,
        reqNames: reqNamesFor([]),
        aliasUses: cv.aliasUses,
      });
    })();
    const w = {
      id,
      op: q.kind,
      api: q.api,
      table: tbl?.name || q.table || null,
      evidence: { file: fi.rel, line: q.line },
      enclosingFunction: null,
      inTransaction: !!q.inTxCallback,
      conflict: q.conflict || null,
      returning: !!q.returning,
      batch: !!q.batch,
      hasWhere: q.kind === "insert" ? null : !!q.hasWhere,
      sqlHead: q.sql || null,
      columns: cols.map((c) => ({
        column: c.column,
        source: c.kind,
        clientFields: c.clients
          .map((x) => `${x.location}.${x.field ?? "*"}`)
          .sort(),
        transform: c.transform,
        fallbackLiteral: c.fallbackLiteral || false,
        expr: c.expr,
      })),
      dynamic: !!(
        q.dynamicColumns ||
        q.spread ||
        q.opaqueValues ||
        q.paramsUnresolved ||
        q.insertSelect
      ),
      context: isScriptFile(fi.rel) ? "script" : "app",
      routeIds: [],
      linked: "unlinked",
      confidence: "medium",
    };
    // try heuristic link: write lives in a file imported by a route's file
    const importers = routes.filter((r) => r.evidence.file === fi.rel);
    if (importers.length) {
      w.linked = "heuristic";
      w.confidence = "low";
      w.routeIds = importers.map((r) => r.id);
    }
    writes.push(w);
    writeIndex.set(id, w);
    if (w.context === "app" && w.linked === "unlinked")
      addUnresolved(
        "unlinked-write",
        `Write to ${w.table || "?"} in app code is not reachable from a detected route (worker, helper, or unsupported route style).`,
        fi.rel,
        q.line,
      );
  }
}
for (const w of writes) delete w._routeCols;
// strip internals from route queries
for (const r of routes) {
  r.queries = r.queries.map((e) => {
    const { _pos, _file, _fn, _end, _inTxCb, _hasWhere, _q, _cols, ...rest } =
      e;
    return rest;
  });
  r.responses = r.responses.map(({ pos, ...x }) => x);
  r.queries.sort((a, b) =>
    a.evidence.file === b.evidence.file
      ? a.evidence.line - b.evidence.line
      : a.evidence.file < b.evidence.file
        ? -1
        : 1,
  );
  r.isWriteRoute =
    r.metrics.writes > 0 ||
    (r.metrics.deferredWrites || 0) > 0 ||
    r.queries.some((q) => q.writeId && q.errorPath);
}
// link validators to routes
for (const r of routes) {
  if (!r.handler) continue;
  const fi = sources.get(r.evidence.file);
  const routeRecord = routeRecords.find(
    (x) => x.fi === fi && x.line === r.evidence.line && x.method === r.method,
  );
  const args =
    (routeRecord?.mwArgs || []).map((a) => argText(fi, a)).join(" ") +
    " " +
    (r.handler
      ? sources.get(r.handler.file).nc.slice(routeRecord ? 0 : 0, 0)
      : "");
  const hf = sources.get(r.handler.file);
  const hfn = findHandlerText(r, hf, routeRecord);
  for (const v of validators)
    if (
      v.name &&
      new RegExp(`\\b${v.name.replace(/[$]/g, "\\$")}\\b`).test(
        args + " " + hfn,
      )
    )
      r.validatorIds.push(v.id);
  r.validatorIds.sort();
  if (r.validatorIds.length) r.middleware.classes.validation = true;
}
function findHandlerText(r, hf, rec) {
  if (!rec) return "";
  const { handler } = analyzeRoute(rec);
  return handler ? handler.fi.nc.slice(handler.start, handler.end) : "";
}
routes.sort((a, b) =>
  a.path < b.path
    ? -1
    : a.path > b.path
      ? 1
      : a.method < b.method
        ? -1
        : a.method > b.method
          ? 1
          : a.evidence.file < b.evidence.file
            ? -1
            : a.evidence.file > b.evidence.file
              ? 1
              : a.evidence.line - b.evidence.line,
);
writes.sort((a, b) =>
  a.evidence.file < b.evidence.file
    ? -1
    : a.evidence.file > b.evidence.file
      ? 1
      : a.evidence.line - b.evidence.line,
);
for (const w of writes) {
  w.routeIds.sort();
  w.columns.sort((a, b) => (a.column < b.column ? -1 : 1));
}

// ---------------------------------------------------------------- client calls
const clientCalls = [];
const CLIENT_FN =
  /^(fetch|fetchWithAuth|fetchWithRetry|fetchJson|apiFetch|apiRequest|request|\$fetch|ofetch|axios|ky|useFetch|http|apiCall)$/;
const CLIENT_VERB_RECV =
  /^(axios|ky|http|api|apiClient|client|instance|\$http|request|superagent)$/;
function normalizeUrl(t) {
  let u = t.replace(/\$\{\s*([^}]*)\}/g, (m0, ex) =>
    /base|api|url|host|origin/i.test(ex) &&
    !/\//.test(ex) &&
    m0 === t.slice(0, m0.length)
      ? ""
      : `{${squash(ex).replace(/[^\w.]/g, "")}}`,
  );
  u = u.replace(/^\{[\w.]*(?:base|api|url|host|origin)[\w.]*\}/i, "");
  u = u.replace(/^https?:\/\/[^/]+/i, "");
  return u;
}
function windowText(fi, pos, before = 1200, after = 1200) {
  // Window around the call, cut at the nearest declaration boundary so a neighbouring function's retry code is not attributed to this call.
  const BOUNDARY =
    /\n(?:export\s+(?:default\s+)?(?:async\s+)?(?:const|function|class)\b|(?:async\s+)?function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:function|\(|\w+\s*=>)|\s{0,4}[\w$]+\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>))/g;
  let start = Math.max(0, pos - before);
  let end = Math.min(fi.nc.length, pos + after);
  const head = fi.nc.slice(start, pos);
  let m;
  let lastB = -1;
  BOUNDARY.lastIndex = 0;
  while ((m = BOUNDARY.exec(head))) lastB = m.index;
  if (lastB >= 0) start += lastB;
  const tail = fi.nc.slice(pos, end);
  BOUNDARY.lastIndex = 0;
  const nb = BOUNDARY.exec(tail);
  if (nb) end = pos + nb.index;
  return fi.nc.slice(start, end);
}
const SIG = {
  retry: /retry|retries|attempt|backoff|\*\*\s*\w+|Math\.pow\(/i,
  jitter: /Math\.random\(\)/,
  debounce: /debounce|autosave|auto-save|autoSave|setInterval\(/i,
  draft:
    /localStorage\.setItem|sessionStorage\.setItem|indexedDB|Dexie|idb\b|saveDraft|setDraft|draft/i,
  unload: /beforeunload|pagehide|visibilitychange|sendBeacon/i,
  logout: /logout|signOut|sign-out/i,
  idempotency:
    /Idempotency-Key|idempotencyKey|idempotency|submissionId|submission_id|requestId|clientRequestId|clientId/i,
  timeout: /AbortController|AbortSignal\.timeout|timeout/i,
  pending: /pending|dirty|unsaved|queue/i,
};
for (const fi of fileList) {
  const serverSide =
    /(^|\/)(server|backend|controllers|routes|services\/server)(\/|$)/i.test(
      fi.rel,
    ) && !/(^|\/)(client|frontend)(\/|$)/i.test(fi.rel);
  if (serverSide) continue;
  for (const c of fi.calls) {
    const rt = tailOf(c.receiver);
    let method = null;
    let kind = null;
    let urlArg = c.args[0];
    let optsArg = c.args[1];
    if (!c.receiver && CLIENT_FN.test(c.name) && c.args.length) {
      kind = c.name;
    } else if (
      VERBS.includes(c.name) &&
      c.name !== "all" &&
      CLIENT_VERB_RECV.test(rt.split(".").pop()) &&
      c.args.length
    ) {
      kind = rt + "." + c.name;
      method = c.name.toUpperCase();
    } else if (/^use(Mutation|SWRMutation)$/.test(c.name)) {
      kind = c.name;
      method = "MUTATION";
      urlArg = null;
    } else continue;
    let url = null;
    if (urlArg) {
      const t = argText(fi, urlArg).trim();
      if (/^(["'`])/.test(t))
        url = normalizeUrl(
          joinStrings(t.replace(/\$\{([^}]*)\}/g, (m0) => m0)).length
            ? t.replace(/^(["'`])|(["'`])$/g, "")
            : "",
        );
      else if (/^[A-Za-z_$][\w$.]*$/.test(t)) url = null;
    }
    if (!url && !method) {
      if (!/^use/.test(c.name)) continue;
    }
    const optsText = optsArg ? argText(fi, optsArg) : "";
    if (!method) {
      const mm = /method\s*:\s*["'`]([A-Za-z]+)["'`]/.exec(optsText);
      method = mm ? mm[1].toUpperCase() : url ? "GET" : "UNKNOWN";
    }
    // body keys
    let bodyKeys = null;
    let bodyNote = null;
    const bodyArg = VERBS.includes(c.name) ? c.args[1] : null;
    let objSrc = null;
    const jm =
      /(?:body|data|json)\s*:\s*(?:JSON\.stringify\(\s*)?(\{[\s\S]*?\}|[A-Za-z_$][\w$.]*)/.exec(
        optsText,
      );
    if (VERBS.includes(c.name) && bodyArg) objSrc = argText(fi, bodyArg);
    else if (jm) objSrc = jm[1];
    if (objSrc && objSrc.trim().startsWith("{")) {
      const ob = objSrc.trim();
      const m2 = mask(ob);
      const end = matchClose(m2.co, 0);
      bodyKeys = splitTop(m2.co, 1, end)
        .map((r) => {
          const t = ob.slice(r.s, r.e);
          const km =
            /^(?:\.\.\.\s*([\w$.]+)|(?:(["'`])([^"'`]+)\2|([A-Za-z_$][\w$]*)))/.exec(
              t,
            );
          return km ? (km[1] ? `...${km[1]}` : km[3] || km[4]) : null;
        })
        .filter(Boolean)
        .sort();
    } else if (objSrc) bodyNote = `body is variable ${cut(objSrc.trim(), 30)}`;
    const win = windowText(fi, c.start);
    const behavior = {};
    for (const [k, re] of Object.entries(SIG)) {
      const m = re.exec(win);
      if (m) behavior[k] = true;
    }
    const fileSig = {};
    for (const [k, re] of Object.entries({
      retry: SIG.retry,
      debounce: SIG.debounce,
      draft: SIG.draft,
      unload: SIG.unload,
      logout: SIG.logout,
    }))
      if (re.test(fi.nc)) fileSig[k] = true;
    const line = lineAt(fi, c.start);
    clientCalls.push({
      id: `client:${fi.rel}:${line}:${c.start}`,
      kind,
      method,
      url,
      bodyKeys,
      bodyNote,
      evidence: { file: fi.rel, line },
      behavior,
      fileLevelSignals: fileSig,
      routeIds: [],
      confidence: url
        ? /^(\/|https?:)/.test(url) || url.startsWith("{")
          ? "high"
          : "medium"
        : "low",
    });
  }
}
// link client calls to routes
function segs(p) {
  return p.split("?")[0].split("/").filter(Boolean);
}
function urlMatches(url, rpath) {
  const a = segs(url.replace(/^\/api(?=\/|$)/, ""));
  const b = segs(rpath.replace(/^\/api(?=\/|$)/, ""));
  if (a.length !== b.length || !a.length) return false;
  return a.every(
    (s, i) =>
      s === b[i] ||
      s.startsWith("{") ||
      b[i].startsWith(":") ||
      s.startsWith(":"),
  );
}
for (const cc of clientCalls) {
  if (!cc.url) continue;
  for (const r of routes) {
    if (
      (r.method === cc.method || r.method === "ANY") &&
      [r.path, ...r.aliases].some((p) => urlMatches(cc.url, p))
    )
      cc.routeIds.push(r.id);
  }
  cc.routeIds.sort();
}
clientCalls.sort((a, b) =>
  a.evidence.file < b.evidence.file
    ? -1
    : a.evidence.file > b.evidence.file
      ? 1
      : a.evidence.line - b.evidence.line,
);
// back-reference on routes
for (const r of routes)
  r.clientCallIds = clientCalls
    .filter((c) => c.routeIds.includes(r.id))
    .map((c) => c.id);

// ---------------------------------------------------------------- infra
const infra = {
  pools: [],
  drizzleClients: [],
  postgresJs: [],
  envVarNames: [],
  dependencies: {},
  pm2: [],
  nginx: [],
  redis: { packages: [], calls: [], ttls: [], config: [] },
  pgbouncer: [],
  bodyLimits: [],
  drizzleConfig: null,
  enums,
  migrationObjects: [],
};
const envSet = new Map();
const depKeys = [
  "drizzle-orm",
  "drizzle-kit",
  "drizzle-zod",
  "pg",
  "postgres",
  "pg-pool",
  "express",
  "fastify",
  "hono",
  "next",
  "@nestjs/core",
  "@trpc/server",
  "zod",
  "joi",
  "yup",
  "ajv",
  "ioredis",
  "redis",
  "bullmq",
  "bull",
  "pg-boss",
  "typescript",
  "pm2",
  "knex",
  "prisma",
  "sequelize",
];
for (const f of files) {
  if (path.basename(f.rel) === "package.json") {
    const t = readText(f.abs);
    if (!t) continue;
    try {
      const j = JSON.parse(t);
      for (const sec of ["dependencies", "devDependencies"])
        for (const k of depKeys)
          if (j[sec]?.[k])
            infra.dependencies[k] = { version: j[sec][k], file: f.rel };
    } catch {}
  }
}
for (const fi of fileList) {
  for (const c of fi.calls) {
    if (c.isNew && c.name === "Pool" && c.args.length) {
      const t = argText(fi, c.args[0]);
      const mx = /\bmax\s*:\s*([^,}\n]+)/.exec(t);
      const nums = mx
        ? [...mx[1].matchAll(/\d+/g)].map((x) => Number(x[0]))
        : [];
      infra.pools.push({
        context: isScriptFile(fi.rel) ? "script" : "app",
        evidence: { file: fi.rel, line: lineAt(fi, c.start) },
        maxExpr: mx ? cut(squash(mx[1]), 60) : null,
        max: nums.length ? nums[nums.length - 1] : null,
        connectionTimeoutMillis:
          (/connectionTimeoutMillis\s*:\s*([^,}\n]+)/.exec(t) ||
            [])[1]?.trim() || null,
        idleTimeoutMillis:
          (/idleTimeoutMillis\s*:\s*([^,}\n]+)/.exec(t) || [])[1]?.trim() ||
          null,
        statementTimeout:
          (/statement_timeout\s*:\s*([^,}\n]+)/.exec(t) || [])[1]?.trim() ||
          null,
        ssl: /\bssl\s*:/.test(t),
      });
    }
    if (c.name === "drizzle" && !c.receiver) {
      const imp = fi.imports.get("drizzle");
      infra.drizzleClients.push({
        evidence: { file: fi.rel, line: lineAt(fi, c.start) },
        driver: imp?.spec || null,
      });
    }
    if (c.name === "postgres" && !c.receiver && fi.imports.get("postgres")) {
      const t = c.args[1]
        ? argText(fi, c.args[1])
        : c.args[0]
          ? argText(fi, c.args[0])
          : "";
      infra.postgresJs.push({
        evidence: { file: fi.rel, line: lineAt(fi, c.start) },
        max: (/\bmax\s*:\s*([^,}\n]+)/.exec(t) || [])[1]?.trim() || null,
        prepare: (/\bprepare\s*:\s*(\w+)/.exec(t) || [])[1] || null,
      });
    }
    if (
      /^(xadd|xreadgroup|xack|xautoclaim|xclaim|xtrim|xgroup|lpush|rpush|brpop|blpop|zadd|setex|expire|pexpire|publish|subscribe)$/i.test(
        c.name,
      ) &&
      /redis|client|stream|queue|pub|sub|conn/i.test(c.receiver + fi.rel)
    ) {
      infra.redis.calls.push({
        name: c.name.toLowerCase(),
        evidence: { file: fi.rel, line: lineAt(fi, c.start) },
      });
      const raw = fi.nc.slice(c.start, c.end);
      if (/MAXLEN/i.test(raw))
        infra.redis.config.push({
          key: "MAXLEN (stream trimming)",
          evidence: { file: fi.rel, line: lineAt(fi, c.start) },
        });
      const ttl =
        /(?:setex|expire|pexpire)\w*\s*\([^,]+,\s*(\d+)|["']EX["']\s*,\s*(\d+)/i.exec(
          raw,
        );
      if (ttl)
        infra.redis.ttls.push({
          seconds: Number(ttl[1] || ttl[2]),
          call: c.name,
          evidence: { file: fi.rel, line: lineAt(fi, c.start) },
        });
    }
    if (c.name === "json" && /express/.test(c.receiver) && c.args.length) {
      const lm = /limit\s*:\s*["'`]([^"'`]+)/.exec(argText(fi, c.args[0]));
      if (lm)
        infra.bodyLimits.push({
          limit: lm[1],
          evidence: { file: fi.rel, line: lineAt(fi, c.start) },
        });
    }
  }
  for (const m of fi.nc.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    if (
      /DATABASE|DB_|PG|POSTGRES|REDIS|QUEUE|POOL|PGBOUNCER|SSL/.test(m[1]) &&
      !envSet.has(m[1])
    )
      envSet.set(m[1], { name: m[1], file: fi.rel, line: lineAt(fi, m.index) });
  }
  for (const m of fi.nc.matchAll(
    /(?:from\s+|require\(\s*)["'](ioredis|redis|bullmq|bull|pg-boss|@upstash\/redis|amqplib|kafkajs)["']/g,
  ))
    infra.redis.packages.push({
      name: m[1],
      evidence: { file: fi.rel, line: lineAt(fi, m.index) },
    });
}
infra.envVarNames = [...envSet.values()].sort((a, b) =>
  a.name < b.name ? -1 : 1,
);
const dedupe = (arr, keyf) => [
  ...new Map(arr.map((x) => [keyf(x), x])).values(),
];
infra.redis.packages = dedupe(
  infra.redis.packages,
  (x) => x.name + x.evidence.file,
).sort((a, b) =>
  a.name + a.evidence.file < b.name + b.evidence.file ? -1 : 1,
);
infra.redis.calls = infra.redis.calls
  .sort((a, b) =>
    a.evidence.file + String(a.evidence.line).padStart(8, "0") <
    b.evidence.file + String(b.evidence.line).padStart(8, "0")
      ? -1
      : 1,
  )
  .slice(0, 80);

// non-JS config files: PM2, nginx, redis, migrations, drizzle config
const CONF_LINE =
  /^\s*(limit_req_zone|limit_req|limit_conn_zone|limit_conn|worker_connections|worker_processes|client_max_body_size|proxy_read_timeout|proxy_send_timeout|keepalive_timeout|keepalive_requests|proxy_connect_timeout)\b[^;\n]*;?/;
const REDIS_CONF =
  /^\s*["']?(maxmemory|maxmemory-policy|appendonly|appendfsync|save|requirepass|tls-port)["']?[\s=:]+[^\n]*/i;
for (const f of files) {
  const base = path.basename(f.rel);
  const ext = path.extname(base).toLowerCase();
  if (/^ecosystem.*\.(c|m)?js(on)?$/.test(base) || base === "pm2.config.js") {
    const t = readText(f.abs);
    if (!t) continue;
    const nc = mask(t).nc;
    const parts = [...nc.matchAll(/\bname\s*:\s*["'`]([^"'`]+)["'`]/g)];
    parts.forEach((m, i) => {
      const seg = nc.slice(
        m.index,
        i + 1 < parts.length ? parts[i + 1].index : nc.length,
      );
      const inst = /\binstances\s*:\s*([^,\n]+)/.exec(seg);
      const evidence = {
        file: f.rel,
        line: t.slice(0, m.index).split("\n").length,
      };
      // env hint names/values that matter for capacity: port defaults and the worker switch (no secrets are read)
      const dbPort = /DB_PORT\s*:\s*[^,\n]*?["'](\d{2,5})["']/.exec(seg);
      const localWorker = /START_LOCAL_WORKER\s*:\s*["']?(\w+)/.exec(seg);
      infra.pm2.push({
        app: m[1],
        instances: inst ? inst[1].trim().replace(/["']/g, "") : null,
        execMode: (/exec_mode\s*:\s*["']([^"']+)/.exec(seg) || [])[1] || null,
        maxMemoryRestart:
          (/max_memory_restart\s*:\s*["']([^"']+)/.exec(seg) || [])[1] || null,
        dbPortDefault: dbPort ? dbPort[1] : null,
        startLocalWorker: localWorker ? localWorker[1] : null,
        evidence,
      });
      if (dbPort && dbPort[1] === "6432")
        infra.pgbouncer.push({
          note: "DB_PORT default 6432 (the usual PgBouncer port); confirm with the owner",
          evidence,
        });
    });
  }
  if (
    /\.(conf|py|sh|ya?ml|template|cfg|ini|j2|tf)$/i.test(ext) ||
    /nginx|redis/i.test(base)
  ) {
    const t = readText(f.abs);
    if (!t) continue;
    const lines = t.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (CONF_LINE.test(ln) && infra.nginx.length < 80)
        infra.nginx.push({
          directive: squash(ln.replace(/;.*$/, "")),
          evidence: { file: f.rel, line: i + 1 },
        });
      if (/\.(conf|ya?ml|cfg|ini|tf)$/i.test(ext) || /redis/i.test(base)) {
        if (
          REDIS_CONF.test(ln) &&
          infra.redis.config.length < 60 &&
          /redis/i.test(f.rel + t.slice(0, 2000))
        )
          infra.redis.config.push({
            key: squash(ln),
            evidence: { file: f.rel, line: i + 1 },
          });
      } else if (
        /maxmemory|appendonly|appendfsync/i.test(ln) &&
        infra.redis.config.length < 60
      ) {
        const mm =
          /(maxmemory-policy|maxmemory|appendonly|appendfsync)[\s"'=:]+([\w.-]+)/i.exec(
            ln,
          );
        if (mm)
          infra.redis.config.push({
            key: `${mm[1]} ${mm[2]}`,
            evidence: { file: f.rel, line: i + 1 },
          });
      }
      if (
        /pgbouncer/i.test(ln) &&
        !/^\s*(#|\/\/)/.test(ln) &&
        infra.pgbouncer.length < 10
      )
        infra.pgbouncer.push({ evidence: { file: f.rel, line: i + 1 } });
    }
  }
  if (/(^|\/)drizzle\.config\.[cm]?[jt]s$/.test(f.rel)) {
    const t = readText(f.abs) || "";
    const nc = mask(t).nc;
    infra.drizzleConfig = {
      file: f.rel,
      schema: (/schema\s*:\s*["'`]([^"'`]+)/.exec(nc) || [])[1] || null,
      out: (/\bout\s*:\s*["'`]([^"'`]+)/.exec(nc) || [])[1] || null,
      dialect: (/dialect\s*:\s*["'`]([^"'`]+)/.exec(nc) || [])[1] || null,
      driver: (/\bdriver\s*:\s*["'`]([^"'`]+)/.exec(nc) || [])[1] || null,
      casing: (/casing\s*:\s*["'`]([^"'`]+)/.exec(nc) || [])[1] || null,
    };
  }
  if (
    ext === ".sql" &&
    /(^|\/)(migrations?|drizzle|db\/migrations?|prisma\/migrations)(\/|$)/i.test(
      f.rel,
    )
  ) {
    const t = readText(f.abs);
    if (!t) continue;
    t.split("\n").forEach((ln, i) => {
      const m =
        /\bCREATE\s+(UNIQUE\s+)?(INDEX|TRIGGER)\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([\w$]+)"?[\s\S]*?\b(?:ON|BEFORE|AFTER|INSTEAD)\b[^"\n]*?(?:ON\s+)?(?:ONLY\s+)?"?(?:public"?\."?)?([\w$]+)?/i.exec(
          ln,
        );
      if (m && infra.migrationObjects.length < 500)
        infra.migrationObjects.push({
          kind: (m[1] ? "unique " : "") + m[2].toLowerCase(),
          name: m[3],
          table: m[4] || null,
          evidence: { file: f.rel, line: i + 1 },
        });
    });
  }
}
infra.pm2.sort((a, b) =>
  a.evidence.file + a.app < b.evidence.file + b.app ? -1 : 1,
);
infra.migrationObjects.sort((a, b) =>
  a.evidence.file + String(a.evidence.line).padStart(8, "0") <
  b.evidence.file + String(b.evidence.line).padStart(8, "0")
    ? -1
    : 1,
);
infra.nginx.sort((a, b) =>
  a.evidence.file + String(a.evidence.line).padStart(8, "0") <
  b.evidence.file + String(b.evidence.line).padStart(8, "0")
    ? -1
    : 1,
);
infra.redis.config.sort((a, b) =>
  a.evidence.file + String(a.evidence.line).padStart(8, "0") <
  b.evidence.file + String(b.evidence.line).padStart(8, "0")
    ? -1
    : 1,
);
infra.pools.sort((a, b) =>
  a.evidence.file + String(a.evidence.line).padStart(8, "0") <
  b.evidence.file + String(b.evidence.line).padStart(8, "0")
    ? -1
    : 1,
);
infra.pgbouncer.sort((a, b) =>
  a.evidence.file + String(a.evidence.line).padStart(8, "0") <
  b.evidence.file + String(b.evidence.line).padStart(8, "0")
    ? -1
    : 1,
);

// ---------------------------------------------------------------- personal data
const PD = [
  [
    "identity",
    /(^|_)(first|last|middle|given|sur|full|maiden)?_?name$|^name$|surname|birth|dob|age$|gender|sex$|civil_?status|religion|nationality|signature|photo|avatar|lrn$/i,
  ],
  [
    "contact",
    /address|phone|mobile|contact|email|telephone|zip|postal|barangay|city$/i,
  ],
  [
    "financial",
    /salary|wage|pay(?!load)|income|allowance|bank|account_?(no|num)|tax|tin$|deduction/i,
  ],
  [
    "government-id",
    /(^|_)(sss|gsis|philhealth|pag_?ibig|tin|passport|license|licence|ssn|national_?id|prn|plantilla|item_?no|employee_?(no|number|id))($|_)/i,
  ],
  ["credential", /password|passcode|pin$|secret|token|otp/i],
  [
    "employment",
    /employee|personnel|position|designation|appointment|service_?date|teaching|qualification/i,
  ],
];
const personalDataFields = [];
const pdSeen = new Set();
const pdAdd = (name, kind, where, evidence, conf = "medium") => {
  for (const [cls, re] of PD) {
    if (re.test(name)) {
      const k = `${kind}|${where}|${name}|${cls}`;
      if (pdSeen.has(k)) return;
      pdSeen.add(k);
      personalDataFields.push({
        name,
        kind,
        where,
        class: cls,
        evidence,
        confidence: conf,
      });
      return;
    }
  }
};
for (const t of tables)
  for (const c of t.columns)
    pdAdd(c.name, "column", `${t.name}.${c.name}`, t.evidence);
for (const v of validators)
  for (const f of v.fields)
    pdAdd(f.name, "validator", `${v.name || v.id}`, v.evidence);
for (const r of routes)
  for (const f of r.requestFields)
    pdAdd(
      f.name,
      "request",
      `${r.method} ${r.path}`,
      { file: r.evidence.file, line: f.line },
      "low",
    );
for (const cc of clientCalls)
  for (const k of cc.bodyKeys || [])
    pdAdd(
      k,
      "client-body",
      `${cc.method} ${cc.url || "?"}`,
      cc.evidence,
      "low",
    );
personalDataFields.sort((a, b) =>
  a.kind + a.where + a.name < b.kind + b.where + b.name ? -1 : 1,
);

// ---------------------------------------------------------------- finalize
if (routes.length === 0 && tables.length === 0) {
  console.error(
    "No routes and no Drizzle tables were found. This is probably the wrong repo root or an unsupported stack. Nothing written.",
  );
  process.exit(3);
}
const dedupUnresolved = [
  ...new Map(unresolved.map((u) => [u.id + "|" + u.message, u])).values(),
].sort((a, b) => (a.id + a.message < b.id + b.message ? -1 : 1));
const apiCounts = {
  drizzle: 0,
  "raw-sql": 0,
  "drizzle-sql": 0,
  "tagged-sql": 0,
};
for (const w of writes) apiCounts[w.api] = (apiCounts[w.api] || 0) + 1;
const ormCoverage =
  tables.length && (apiCounts.drizzle || apiCounts["drizzle-sql"])
    ? apiCounts["raw-sql"]
      ? "partial"
      : "full"
    : tables.length
      ? "schema-only"
      : "none";
const out = {
  meta: {
    parseMode: ts ? "ast" : "regex",
    repo: path.basename(ROOT),
    ormCoverage,
    writeApis: apiCounts,
    schemaFilePresent: tables.length > 0,
    counts: {
      routes: routes.length,
      writeRoutes: routes.filter(
        (r) =>
          r.isWriteRoute ||
          ["POST", "PUT", "PATCH", "DELETE", "MUTATION"].includes(r.method),
      ).length,
      tables: tables.length,
      writes: writes.length,
      appWrites: writes.filter((w) => w.context === "app").length,
      validators: validators.length,
      clientCalls: clientCalls.length,
      filesScanned: fileList.length,
      unresolved: dedupUnresolved.length,
    },
    note: ts
      ? "typescript compiler API located call expressions; field and SQL analysis is textual"
      : "regex heuristics only; typescript was not resolvable from the repo root",
  },
  routes,
  validators,
  tables,
  writes,
  clientCalls,
  infra,
  personalDataFields,
  unresolved: dedupUnresolved,
};
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(
  `inventory: ${routes.length} routes, ${tables.length} tables, ${writes.length} writes, ${clientCalls.length} client calls, ${dedupUnresolved.length} unresolved (parseMode=${out.meta.parseMode}) -> ${outFile}`,
);
