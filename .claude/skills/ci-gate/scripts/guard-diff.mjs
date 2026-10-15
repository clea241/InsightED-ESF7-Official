#!/usr/bin/env node
// ci-gate: detect "cheating" fixes in the working-tree diff vs HEAD (incl. untracked files).
// Read-only. Exit 1 with a violation list, or 0 with "OK: no guardrail violations".
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const git = (...a) =>
  execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

let tracked;
try {
  tracked = git("diff", "--no-color", "-U0", "HEAD");
} catch (e) {
  console.error(
    `guard-diff: cannot diff against HEAD (${e.message.split("\n")[0]})`,
  );
  process.exit(2);
}
const untracked = git("ls-files", "--others", "--exclude-standard")
  .split("\n")
  .filter(Boolean);

const violations = [];
const add = (file, msg) => violations.push(`${file}: ${msg}`);

const SUPPRESS =
  /eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error|istanbul ignore|\/\*\s*c8 ignore/;
const SKIPS =
  /\.skip\(|\.only\(|\bxit\(|\bxdescribe\(|\bit\.todo\(|\btest\.todo\(/;
const CONFIG =
  /(^|\/)(eslint\.config\.[^/]+|\.eslintrc[^/]*|tsconfig[^/]*\.json|jest\.config\.[^/]+|vitest\.config\.[^/]+|vite\.config\.[^/]+|webpack\.config\.[^/]+|\.npmrc)$/;
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|tests?)\//;
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_CASE = /(?:^|[^\w.])(?:it|test)(?:\.each\([^)]*\))?\s*\(/g;
const LOOSEN = /["']?(?:off|warn|0|1)["']?/;

// Parse unified diff into per-file added/removed lines.
const files = new Map();
let cur = null;
for (const line of tracked.split("\n")) {
  if (line.startsWith("diff --git ")) {
    const m = / b\/(.+)$/.exec(line);
    cur = { name: m ? m[1] : "?", added: [], removed: [], deleted: false };
    files.set(cur.name, cur);
  } else if (!cur) continue;
  else if (line.startsWith("deleted file mode")) cur.deleted = true;
  else if (line.startsWith("+++") || line.startsWith("---")) continue;
  else if (line.startsWith("+")) cur.added.push(line.slice(1));
  else if (line.startsWith("-")) cur.removed.push(line.slice(1));
}
for (const f of untracked) {
  if (!CODE_FILE.test(f) && !CONFIG.test(f)) continue;
  let text = "";
  try {
    text = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  files.set(f, {
    name: f,
    added: text.split("\n"),
    removed: [],
    deleted: false,
    untracked: true,
  });
}

// The skill's own files contain the forbidden patterns as data; never scan them.
for (const name of [...files.keys()])
  if (name.startsWith(".claude/skills/ci-gate/")) files.delete(name);

const count = (lines) => lines.join("\n").match(TEST_CASE)?.length ?? 0;

for (const f of files.values()) {
  const isTest = TEST_FILE.test(f.name);
  if (f.deleted && isTest) add(f.name, "test file deleted");
  for (const l of f.added) {
    if (CODE_FILE.test(f.name) && SUPPRESS.test(l))
      add(f.name, `suppression added: ${l.trim()}`);
    if (CODE_FILE.test(f.name) && SKIPS.test(l))
      add(f.name, `test skip/only/todo added: ${l.trim()}`);
  }
  if (isTest && !f.deleted && !f.untracked) {
    const net = count(f.added) - count(f.removed);
    if (net < 0) add(f.name, `net reduction of ${-net} test case(s)`);
  }
  if (CONFIG.test(f.name) && !f.untracked) {
    add(f.name, "lint/TS/test/build config modified");
  } else if (CONFIG.test(f.name) && f.untracked) {
    add(f.name, "new lint/TS/test/build config file added");
  }
  // rule loosening in any file that looks like lint config or inline rule comments
  if (/eslint|tsconfig/.test(f.name)) {
    for (const l of f.added) {
      if (
        /["']?[\w@/\-]+["']?\s*:\s*(\[\s*)?["']?(off|warn|0|1)["']?/.test(l) &&
        LOOSEN.test(l)
      )
        add(f.name, `rule loosened: ${l.trim()}`);
    }
    if (
      f.removed.some((l) => /:\s*(\[\s*)?["']?(error|2)["']?/.test(l)) &&
      !f.added.length
    )
      add(f.name, "rule(s) removed");
  }
  if (f.name === "package.json") {
    // compare scripts sections HEAD vs working tree
    try {
      const before = JSON.parse(git("show", "HEAD:package.json")).scripts ?? {};
      const after =
        JSON.parse(fs.readFileSync("package.json", "utf8")).scripts ?? {};
      for (const k of new Set([
        ...Object.keys(before),
        ...Object.keys(after),
      ])) {
        if (before[k] !== after[k]) add("package.json", `scripts.${k} changed`);
      }
    } catch {
      add("package.json", "could not compare scripts section");
    }
  }
}

if (violations.length) {
  console.log("VIOLATIONS:");
  for (const v of violations) console.log(`- ${v}`);
  process.exit(1);
}
console.log("OK: no guardrail violations");
