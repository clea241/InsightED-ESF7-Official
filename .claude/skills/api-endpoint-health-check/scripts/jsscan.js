"use strict";
// Tiny static JavaScript scanner (no parser dependency): balanced-bracket argument splitting, require resolution and a
// per-file function index. Used by discover_routes.js and map_tables.js. Heuristic by design: anything it cannot
// resolve must be reported as unresolved by the caller, never guessed.
const fs = require("fs");
const path = require("path");

const fileCache = new Map();
function readFile(f) {
  if (!fileCache.has(f)) {
    try {
      fileCache.set(f, fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
    } catch (e) {
      fileCache.set(f, null);
    }
  }
  return fileCache.get(f);
}

/** Index just after the string/comment starting at i, or i if none starts there. */
function skipLiteral(s, i) {
  const c = s[i];
  if (c === "/" && s[i + 1] === "/") {
    const e = s.indexOf("\n", i);
    return e < 0 ? s.length : e;
  }
  if (c === "/" && s[i + 1] === "*") {
    const e = s.indexOf("*/", i + 2);
    return e < 0 ? s.length : e + 2;
  }
  if (c === "'" || c === '"') {
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === "\\") j++;
      else if (s[j] === c) return j + 1;
      else if (s[j] === "\n") return j;
    }
    return s.length;
  }
  if (c === "`") {
    let depth = 0;
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === "\\") {
        j++;
        continue;
      }
      if (depth === 0 && s[j] === "`") return j + 1;
      if (s[j] === "$" && s[j + 1] === "{") {
        depth++;
        j++;
      } else if (depth > 0 && s[j] === "}") depth--;
    }
    return s.length;
  }
  return i;
}

/** Given s[open] is ( [ or {, returns index of the matching closer. */
function matchClose(s, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [pairs[s[open]]];
  for (let i = open + 1; i < s.length; i++) {
    const j = skipLiteral(s, i);
    if (j !== i) {
      i = j - 1;
      continue;
    }
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") stack.push(pairs[c]);
    else if (c === ")" || c === "]" || c === "}") {
      if (c === stack[stack.length - 1]) stack.pop();
      if (!stack.length) return i;
    }
  }
  return -1;
}

/** Splits the argument list that opens at s[open] === '('. Returns [{text, start}] or null. */
function splitArgs(s, open) {
  const close = matchClose(s, open);
  if (close < 0) return null;
  const args = [];
  let start = open + 1;
  let depth = 0;
  for (let i = open + 1; i < close; i++) {
    const j = skipLiteral(s, i);
    if (j !== i) {
      i = j - 1;
      continue;
    }
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      args.push({ text: s.slice(start, i).trim(), start });
      start = i + 1;
    }
  }
  const last = s.slice(start, close).trim();
  if (last) args.push({ text: last, start });
  return { args, close };
}

const lineOf = (s, idx) => s.slice(0, idx).split("\n").length;

function resolveRequire(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [
    base,
    base + ".js",
    base + ".cjs",
    base + ".mjs",
    path.join(base, "index.js"),
    path.join(base, "index.cjs"),
  ]) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch (e) {
      /* next */
    }
  }
  return null;
}

/** Local names bound to relative modules: Map(local -> {file, exportName|null, spec}). */
function importsOf(file) {
  const s = readFile(file) || "";
  const map = new Map();
  const add = (local, spec, exportName) =>
    map.set(local, { spec, exportName, file: resolveRequire(file, spec) });
  let m;
  const reDestr =
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reDestr.exec(s))) {
    for (const part of m[1].split(",")) {
      const [orig, alias] = part.split(":").map((x) => x && x.trim());
      if (orig) add(alias || orig, m[2], orig);
    }
  }
  const reWhole =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)(\.([A-Za-z_$][\w$]*))?/g;
  while ((m = reWhole.exec(s))) add(m[1], m[2], m[4] || null);
  const reEs =
    /import\s+(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = reEs.exec(s))) {
    if (m[1])
      m[1].split(",").forEach((p) => {
        const [o, a] = p.split(/\s+as\s+/).map((x) => x.trim());
        if (o) add(a || o, m[3], o);
      });
    else add(m[2], m[3], null);
  }
  return map;
}

/** Functions defined in a file: Map(name -> {start, end, line, body}). */
function functionsOf(file) {
  const s = readFile(file) || "";
  const out = new Map();
  const put = (name, from, braceIdx) => {
    if (out.has(name)) return;
    let end = -1;
    let bodyStart = braceIdx;
    if (s[braceIdx] === "{") end = matchClose(s, braceIdx);
    else {
      // expression-bodied arrow: up to the statement end at depth 0
      let depth = 0;
      for (let i = braceIdx; i < s.length; i++) {
        const j = skipLiteral(s, i);
        if (j !== i) {
          i = j - 1;
          continue;
        }
        const c = s[i];
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) {
          if (depth === 0) {
            end = i;
            break;
          }
          depth--;
        } else if (c === ";" && depth === 0) {
          end = i;
          break;
        }
      }
      if (end < 0) end = s.length;
    }
    if (end < 0) return;
    out.set(name, {
      start: from,
      end,
      line: lineOf(s, from),
      body: s.slice(bodyStart, end + 1),
      file,
    });
  };
  let m;
  const reFn = /(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = reFn.exec(s))) {
    const open = s.indexOf("(", m.index + m[0].length - 1);
    const close = matchClose(s, open);
    const brace = close < 0 ? -1 : s.indexOf("{", close);
    if (brace > 0) put(m[1], m.index, brace);
  }
  const reArrow =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b[^(]*\(|\(|[A-Za-z_$][\w$]*\s*=>)/g;
  while ((m = reArrow.exec(s))) {
    let idx = m.index + m[0].length - 1;
    if (s[idx] === "(" && !/function/.test(m[0])) {
      // arrow params
      const close = matchClose(s, idx);
      if (close < 0) continue;
      const arrow = s.slice(close + 1).match(/^\s*=>\s*/);
      if (!arrow) continue;
      idx = close + 1 + arrow[0].length;
    } else if (/function/.test(m[0])) {
      const close = matchClose(s, idx);
      idx = s.indexOf("{", close);
    } else {
      idx = m.index + m[0].length;
      while (/\s/.test(s[idx])) idx++;
    }
    if (idx > 0) put(m[1], m.index, idx);
  }
  return out;
}

/** String-literal value of an argument text, or null when it is not a plain literal. */
function stringLiteral(text) {
  const m = text.match(/^(['"`])((?:\\.|(?!\1)[^\\])*)\1$/s);
  if (!m) return null;
  if (m[1] === "`" && m[2].includes("${")) return null;
  return m[2];
}

module.exports = {
  readFile,
  skipLiteral,
  matchClose,
  splitArgs,
  lineOf,
  resolveRequire,
  importsOf,
  functionsOf,
  stringLiteral,
};
