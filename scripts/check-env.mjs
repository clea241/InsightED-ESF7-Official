// Validates the server environment: every variable that is present must parse, and with --strict the required ones must exist.
// Usage: node scripts/check-env.mjs [--file server/.env] [--strict] [--ecosystem ecosystem.esf7-prod.config.cjs]
// --ecosystem also counts variables set in the PM2 ecosystem file (apps[].env), which is where production gets them.
// Values are never printed (only variable names), so the output is safe to paste into chat or CI logs.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { parseRedisConfig } = require("../server/utils/redisConfig.js");

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const fileArg = args.includes("--file")
  ? args[args.indexOf("--file") + 1]
  : "server/.env";

const env = { ...process.env };
const filePath = path.resolve(fileArg);
if (existsSync(filePath)) {
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && env[m[1]] === undefined)
      env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ecoArg = args.includes("--ecosystem")
  ? args[args.indexOf("--ecosystem") + 1]
  : null;
if (ecoArg && existsSync(path.resolve(ecoArg))) {
  const eco = require(path.resolve(ecoArg));
  for (const app of eco.apps || []) {
    for (const [k, v] of Object.entries(app.env || {}))
      if (env[k] === undefined) env[k] = String(v);
  }
}

const problems = [];
const present = (k) => env[k] !== undefined && String(env[k]).trim() !== "";
const isPort = (v) =>
  /^\d+$/.test(String(v).trim()) && Number(v) >= 1 && Number(v) <= 65535;

for (const key of ["PORT", "DB_PORT"]) {
  if (present(key) && !isPort(env[key]))
    problems.push(`${key} must be a whole number between 1 and 65535`);
}
if (present("DATABASE_URL")) {
  try {
    const u = new URL(env.DATABASE_URL);
    if (!/^postgres(ql)?:$/.test(u.protocol))
      problems.push(
        "DATABASE_URL must start with postgres:// or postgresql://",
      );
  } catch {
    problems.push("DATABASE_URL is not a valid URL");
  }
}
try {
  parseRedisConfig(env);
} catch (e) {
  problems.push(e.message);
}
if (present("DB_SSL") && !["true", "false"].includes(String(env.DB_SSL)))
  problems.push('DB_SSL must be "true" or "false"');

if (strict) {
  const hasDb =
    present("DATABASE_URL") ||
    ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].every(present);
  if (!hasDb)
    problems.push(
      "database settings missing: set DATABASE_URL or DB_HOST, DB_NAME, DB_USER and DB_PASSWORD",
    );
  if (!present("JWT_SECRET"))
    problems.push(
      "JWT_SECRET is missing (the server refuses to start in production without it)",
    );
  else if (String(env.JWT_SECRET).length < 16)
    problems.push("JWT_SECRET is too short (use at least 16 characters)");
}

const checked = [
  "PORT",
  "DB_PORT",
  "DATABASE_URL",
  "DB_SSL",
  "REDIS_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "JWT_SECRET",
].filter(present);
console.log(
  `[check-env] ${strict ? "strict" : "format"} check of ${fileArg}${existsSync(filePath) ? "" : " (file not found, using process environment)"}; variables set: ${checked.join(", ") || "none"}`,
);
if (problems.length) {
  for (const p of problems) console.error(`[check-env] ERROR: ${p}`);
  process.exit(1);
}
console.log("[check-env] OK");
