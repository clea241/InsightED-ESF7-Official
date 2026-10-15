#!/usr/bin/env node
// ci-gate: run npm ci, lint, build, test in order; collect all failures; write report + fix prompt.
// Usage: node run-gate.mjs [--skip-install] [--timeout-min <n>]
// Writes only to <os tmpdir>/ci-gate-<repo-folder-name>/. Never modifies the repo.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const skipInstall = args.includes("--skip-install");
const ti = args.indexOf("--timeout-min");
const timeoutMin =
  ti >= 0 && Number(args[ti + 1]) > 0 ? Number(args[ti + 1]) : 15;

const repo = process.cwd();
const pkgPath = path.join(repo, "package.json");
if (!fs.existsSync(pkgPath)) {
  console.error(`ci-gate: no package.json in ${repo}. Run from the repo root.`);
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const outDir = path.join(os.tmpdir(), `ci-gate-${path.basename(repo)}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const STEPS = [
  { name: "npm-ci", command: "npm ci", script: null },
  { name: "lint", command: "npm run lint", script: "lint" },
  { name: "build", command: "npm run build", script: "build" },
  { name: "test", command: "npm test", script: "test" },
];

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const ERR_RE = /error|FAIL|✖|✕|failed/i;
const MAX_CAPTURE = 8 * 1024 * 1024;

function killTree(child) {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    /* already gone */
  }
}

function runCommand(step) {
  return new Promise((resolve) => {
    const logPath = path.join(outDir, `${step.name}.log`);
    const logStream = fs.createWriteStream(logPath);
    const start = Date.now();
    let captured = "";
    let timedOut = false;
    const child = spawn(step.command, {
      cwd: repo,
      shell: true,
      detached: process.platform !== "win32",
      env: { ...process.env, CI: "true", FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const onData = (buf) => {
      logStream.write(buf);
      if (captured.length < MAX_CAPTURE) captured += buf.toString("utf8");
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMin * 60_000);
    const finish = (code) => {
      clearTimeout(timer);
      logStream.end(() =>
        resolve({
          code: timedOut ? null : code,
          durationSec: Math.round((Date.now() - start) / 100) / 10,
          timedOut,
          output: captured.replace(ANSI, ""),
        }),
      );
    };
    child.on("error", (e) => {
      captured += `\nspawn error: ${e.message}\n`;
      finish(1);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
}

function toRepoRelative(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(repo, p);
  const rel = path.relative(repo, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  try {
    return fs.statSync(abs).isFile() ? rel.split(path.sep).join("/") : null;
  } catch {
    return null;
  }
}

function extractFiles(lines) {
  const found = new Set();
  const pathRe =
    /((?:[A-Za-z]:)?[\w@.\-\/\\]+\.(?:[cm]?[jt]sx?|json|css|scss|html|vue|mjs|cjs|md))(?::(\d+)(?::\d+)?)?/g;
  let current = null; // eslint stylish: path on its own line, then "  12:5  error ..."
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith(">")) continue; // npm's command echo, not an error location
    const bare = toRepoRelative(line.trim());
    if (bare) {
      current = bare;
      found.add(bare);
      continue;
    }
    const m = /^\s+(\d+):\d+\s+(?:error|warning)/.exec(line);
    if (m && current) {
      found.add(`${current}:${m[1]}`);
      continue;
    }
    for (const mm of line.matchAll(pathRe)) {
      const rel = toRepoRelative(mm[1]);
      if (rel && !rel.startsWith("node_modules/"))
        found.add(mm[2] ? `${rel}:${mm[2]}` : rel);
    }
  }
  return [...found].slice(0, 30);
}

function signature(stepName, errorLines, tail) {
  const first =
    errorLines[0] ?? tail.filter((l) => l.trim()).slice(-1)[0] ?? "";
  const cleaned = first
    .replace(/(?:[A-Za-z]:)?[\w@.\-\/\\]*[\/\\][\w@.\-\/\\]*/g, "<path>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return `${stepName}: ${cleaned}`;
}

function analyze(step, res) {
  const lines = res.output.split(/\r?\n/);
  const tail = lines.slice(-60);
  const errorLines = lines
    .filter((l) => ERR_RE.test(l))
    .map((l) => l.trim())
    .slice(0, 20);
  return {
    tail,
    errorLines,
    files: extractFiles(lines),
    signature: signature(step.name, errorLines, tail),
  };
}

const results = [];
for (const step of STEPS) {
  const base = {
    step: step.name,
    command: step.command,
    status: "passed",
    exitCode: null,
    durationSec: 0,
    log: path.join(outDir, `${step.name}.log`),
  };
  if (step.name === "npm-ci" && skipInstall) {
    results.push({ ...base, status: "skipped" });
    continue;
  }
  if (step.script && !pkg.scripts?.[step.script]) {
    const msg = `package.json has no "${step.script}" script.\n`;
    fs.writeFileSync(base.log, msg);
    results.push({
      ...base,
      status: "missing",
      exitCode: null,
      excerpt: {
        tail: [msg.trim()],
        errorLines: [msg.trim()],
        files: ["package.json"],
        signature: `${step.name}: missing script`,
      },
    });
    continue;
  }
  process.stdout.write(`ci-gate: running ${step.command} ...\n`);
  const res = await runCommand(step);
  const status = res.timedOut
    ? "timeout"
    : res.code === 0
      ? "passed"
      : "failed";
  const r = {
    ...base,
    status,
    exitCode: res.code,
    durationSec: res.durationSec,
  };
  if (status !== "passed") r.excerpt = analyze(step, res);
  results.push(r);
}

const failed = results.filter((r) => !["passed", "skipped"].includes(r.status));
const report = {
  repo,
  outDir,
  timeoutMin,
  generatedAt: new Date().toISOString(),
  allPassed: failed.length === 0,
  steps: results.map((r) => ({
    step: r.step,
    command: r.command,
    status: r.status,
    exitCode: r.exitCode,
    durationSec: r.durationSec,
    log: r.log,
    signature: r.excerpt?.signature ?? null,
    lastLines: r.excerpt?.tail ?? [],
    errorLines: r.excerpt?.errorLines ?? [],
    files: r.excerpt?.files ?? [],
  })),
  failureSignatures: failed.map((r) => r.excerpt.signature),
};
fs.writeFileSync(
  path.join(outDir, "report.json"),
  JSON.stringify(report, null, 2),
);

// fix-prompt.md (structure defined in reference/fix-prompt-template.md)
const sections = failed.map((r) => {
  const ex = r.excerpt;
  const excerpt = (ex.errorLines.length ? ex.errorLines : ex.tail).join("\n");
  return [
    `## ${r.step} failed (exit code ${r.exitCode ?? "n/a"}, status ${r.status})`,
    "",
    `**Command:** \`${r.command}\``,
    "",
    "**Error excerpt:**",
    "```",
    excerpt,
    "```",
    "",
    "**Last 60 lines:** see `" + r.log + "`",
    "",
    "**Files likely involved:**",
    ...(ex.files.length
      ? ex.files.map((f) => `- ${f}`)
      : ["- (none detected; read the log)"]),
    "",
    `**Signature:** \`${ex.signature}\``,
    "",
    "**Instruction:** Fix the root cause in source code, then re-run only this command to confirm; do not change lint/test/build config, do not skip or delete tests, do not add suppression comments.",
    "",
    ...(r.step === "npm-ci"
      ? [
          "**Note:** Later failures may be caused by this one. Fix it first. Make `package.json` and the lockfile consistent; do not delete the lockfile.",
          "",
        ]
      : []),
    ...(r.step === "build"
      ? [
          "**Note:** A failed build can cause test failures. Fix this before test failures.",
          "",
        ]
      : []),
  ].join("\n");
});
const header = `# ci-gate fix prompt\n\n${failed.length} failing step(s). Fix order: npm-ci, build, lint, test.\n\n`;
fs.writeFileSync(
  path.join(outDir, "fix-prompt.md"),
  header + (sections.join("\n") || "All steps passed. Nothing to fix.\n"),
);

// summary
const pad = (s, n) => String(s).padEnd(n);
console.log("\nSTEP       STATUS    EXIT  DURATION");
for (const r of results) {
  console.log(
    `${pad(r.step, 10)} ${pad(r.status, 9)} ${pad(r.exitCode ?? "-", 5)} ${r.durationSec}s`,
  );
}
console.log(`\nReport dir: ${outDir}`);
process.exit(report.allPassed ? 0 : 1);
