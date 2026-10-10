#!/usr/bin/env node
// Proves the scripts work before they are used on a real repo. Runs them on tests/fixture-app into a temp dir
// and compares counts and headings with EXPECTED.json. Never writes into the fixture.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(HERE, "../tests/fixture-app");
const exp = JSON.parse(
  fs.readFileSync(path.join(FIX, "EXPECTED.json"), "utf8"),
);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdr-selftest-"));
const run = (script, args) =>
  execFileSync(process.execPath, [path.join(HERE, script), ...args], {
    encoding: "utf8",
  });
const hashDir = (d) => {
  const h = crypto.createHash("sha1");
  const walk = (p) => {
    for (const e of fs
      .readdirSync(p, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f);
      else h.update(f + fs.readFileSync(f));
    }
  };
  walk(d);
  return h.digest("hex");
};
const before = hashDir(FIX);
const errors = [];
const check = (ok, msg) => {
  if (!ok) errors.push(msg);
};
try {
  const a = path.join(tmp, "inventory.json");
  const b = path.join(tmp, "inventory2.json");
  run("find-write-paths.mjs", [FIX, "--out", a, "--no-ast"]);
  run("find-write-paths.mjs", [FIX, "--out", b, "--no-ast"]);
  check(
    fs.readFileSync(a, "utf8") === fs.readFileSync(b, "utf8"),
    "inventory is not deterministic (two runs differ)",
  );
  const inv = JSON.parse(fs.readFileSync(a, "utf8"));
  const c = inv.meta.counts;
  for (const [k, v] of Object.entries(exp.counts))
    check(c[k] === v, `count ${k}: expected ${v}, got ${c[k]}`);
  check(
    JSON.stringify(inv.tables.map((t) => t.name)) ===
      JSON.stringify(exp.tables),
    `tables: expected ${exp.tables}, got ${inv.tables.map((t) => t.name)}`,
  );
  for (const [label, e] of Object.entries(exp.routes)) {
    const r = inv.routes.find((x) => `${x.method} ${x.path}` === label);
    check(!!r, `route missing: ${label}`);
    if (!r) continue;
    check(
      r.metrics.roundTrips === e.roundTrips,
      `${label}: roundTrips expected ${e.roundTrips}, got ${r.metrics.roundTrips}`,
    );
    check(
      r.metrics.writes === e.writes,
      `${label}: writes expected ${e.writes}, got ${r.metrics.writes}`,
    );
    const tx = r.queries
      .filter((q) => q.writeId)
      .every((q) => q.inTransaction === true);
    check(
      e.inTransaction ? tx : !r.queries.some((q) => q.inTransaction),
      `${label}: inTransaction expected ${e.inTransaction}`,
    );
  }
  const md1 = path.join(tmp, "dataflow.md");
  const md2 = path.join(tmp, "dataflow2.md");
  run("render-dataflow.mjs", [a, "--out", md1]);
  run("render-dataflow.mjs", [a, "--out", md2]);
  const text = fs.readFileSync(md1, "utf8");
  check(
    text === fs.readFileSync(md2, "utf8"),
    "dataflow.md is not deterministic",
  );
  const heads = text.split("\n").filter((l) => /^## /.test(l));
  check(
    JSON.stringify(heads) === JSON.stringify(exp.headings),
    `headings differ:\n  expected ${JSON.stringify(exp.headings)}\n  got      ${JSON.stringify(heads)}`,
  );
  for (const s of exp.mustContain)
    check(text.includes(s), `dataflow.md should contain: ${s}`);
  // capacity math smoke
  const cap = path.join(tmp, "capacity.json");
  run("capacity-math.mjs", [
    "--normal-per-min",
    "60",
    "--worst-per-min",
    "600",
    "--queries-per-submission",
    "2",
    "--payload-bytes",
    "2048",
    "--instances",
    "2",
    "--pool-per-instance",
    "5",
    "--out",
    cap,
  ]);
  const cj = JSON.parse(fs.readFileSync(cap, "utf8"));
  check(
    cj.display.peakRps === "30.00",
    `capacity peakRps expected 30.00, got ${cj.display.peakRps}`,
  );
  check(
    cj.results.scenarios.length === 3,
    "capacity should output 3 txn-time scenarios when txn-ms is unknown",
  );
  let failedAsExpected = false;
  try {
    execFileSync(
      process.execPath,
      [path.join(HERE, "capacity-math.mjs"), "--out", cap],
      { stdio: "pipe" },
    );
  } catch {
    failedAsExpected = true;
  }
  check(
    failedAsExpected,
    "capacity-math should fail when required arguments are missing",
  );
  // AST mode (only when typescript resolves from the fixture); must agree with regex mode on counts
  try {
    const ast = path.join(tmp, "inventory-ast.json");
    run("find-write-paths.mjs", [FIX, "--out", ast]);
    const j = JSON.parse(fs.readFileSync(ast, "utf8"));
    if (j.meta.parseMode === "ast")
      for (const k of Object.keys(exp.counts))
        check(
          j.meta.counts[k] === inv.meta.counts[k],
          `ast vs regex count differs for ${k}: ${j.meta.counts[k]} vs ${inv.meta.counts[k]}`,
        );
    else console.log("note: typescript not resolvable; AST mode not exercised");
  } catch (e) {
    errors.push("AST run failed: " + e.message.split("\n")[0]);
  }
} catch (e) {
  errors.push(
    "script crashed: " +
      (e.stderr || e.message).toString().split("\n").slice(0, 4).join(" | "),
  );
}
check(hashDir(FIX) === before, "the fixture was modified during the self-test");
fs.rmSync(tmp, { recursive: true, force: true });
if (errors.length) {
  console.error("SELFTEST FAILED");
  errors.forEach((e) => console.error(" - " + e));
  process.exit(1);
}
console.log("SELFTEST PASSED");
