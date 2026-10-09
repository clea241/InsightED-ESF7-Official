#!/usr/bin/env node
// Finds the ORM, schema files and connection source. Text inspection only: never executes project code.
// Usage: node detect-orm.mjs [--root <path>]   -> JSON on stdout
import fs from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";
const argv = process.argv.slice(2);
const ri = argv.indexOf("--root");
const root = path.resolve(
  ri >= 0 && argv[ri + 1] ? argv[ri + 1] : process.cwd(),
);
const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "pg-health-reports",
  "readiness-reports",
  ".claude",
  ".agents",
]);

function walk(dir, depth, out) {
  if (depth > 4) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1, out);
    } else out.push(path.join(dir, e.name));
  }
  return out;
}
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const read = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

export function detect() {
  const files = walk(root, 0, []);
  const pkgs = files.filter((f) => path.basename(f) === "package.json");
  const deps = {};
  const depDir = {};
  for (const p of pkgs) {
    try {
      const j = JSON.parse(read(p));
      for (const k of Object.keys({
        ...j.dependencies,
        ...j.devDependencies,
      })) {
        deps[k] = true;
        if (!depDir[k]) depDir[k] = path.dirname(p);
      }
    } catch {
      /* ignore */
    }
  }
  const driver = deps.pg ? "pg" : deps.postgres ? "postgres" : null;
  const driverDir = driver ? rel(depDir[driver]) || "." : null;
  const poolerHints = files
    .filter(
      (f) =>
        /\.(ya?ml|env|conf|ini|json|cjs|js|mjs|ts)$|Dockerfile/.test(f) &&
        !/node_modules/.test(f) &&
        fs.statSync(f).size < 200000 &&
        /pgbouncer|odyssey|pgpool/i.test(read(f)),
    )
    .map(rel)
    .slice(0, 10);
  const result = {
    root,
    orm: "none",
    schemaFiles: [],
    configFile: null,
    connectionSource: null,
    driver,
    driverDir,
    poolerHints,
  };

  const find = (re) => files.filter((f) => re.test(path.basename(f)));
  const drizzleCfg = find(/^drizzle\.config\.[cm]?[jt]s$/)[0];
  const prismaFiles = files.filter((f) => path.basename(f) === "schema.prisma");
  const typeormFiles = files.filter(
    (f) => /\.[jt]s$/.test(f) && /@Entity\s*\(/.test(read(f)),
  );
  const sequelizeFiles = files.filter(
    (f) =>
      /\.[cm]?[jt]s$/.test(f) &&
      /DataTypes\.(JSONB?|UUID|STRING)/.test(read(f)) &&
      /(sequelize\.define|\.init\s*\()/.test(read(f)),
  );
  const knexCfg = find(/^knexfile\.[cm]?[jt]s$/)[0];

  if (drizzleCfg || deps["drizzle-orm"]) {
    result.orm = "drizzle";
    const cfgText = drizzleCfg ? read(drizzleCfg) : "";
    result.configFile = drizzleCfg ? rel(drizzleCfg) : null;
    let schemaFiles = [];
    const m = cfgText.match(/schema\s*:\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/);
    if (m) {
      const globs = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
      for (const g of globs) {
        const base = path.resolve(
          path.dirname(drizzleCfg),
          g.replace(/\*.*$/, ""),
        );
        if (/\*/.test(g))
          schemaFiles.push(
            ...files.filter(
              (f) => f.startsWith(base) && /\.[cm]?[jt]s$/.test(f),
            ),
          );
        else if (fs.existsSync(path.resolve(path.dirname(drizzleCfg), g)))
          schemaFiles.push(path.resolve(path.dirname(drizzleCfg), g));
      }
    }
    if (!schemaFiles.length)
      schemaFiles = files.filter(
        (f) => /\.[cm]?[jt]s$/.test(f) && /\bpgTable\s*\(/.test(read(f)),
      );
    result.schemaFiles = [...new Set(schemaFiles)].map(rel);
    const envUrl = cfgText.match(
      /(?:url|connectionString)\s*:\s*process\.env\.(\w+)/,
    );
    const parts = {};
    for (const [k, key] of [
      ["host", "host"],
      ["port", "port"],
      ["user", "user"],
      ["password", "password"],
      ["database", "database"],
    ]) {
      const mm = cfgText.match(
        new RegExp(key + "\\s*:\\s*(?:Number\\()?process\\.env\\.(\\w+)"),
      );
      if (mm) parts[k] = mm[1];
    }
    if (envUrl) result.connectionSource = { kind: "env-url", var: envUrl[1] };
    else if (Object.keys(parts).length)
      result.connectionSource = { kind: "env-parts", vars: parts };
    else if (/dbCredentials/.test(cfgText))
      result.connectionSource = {
        kind: "literal-in-config",
        note: "values not read; pass --url-env NAME",
      };
  } else if (prismaFiles.length) {
    result.orm = "prisma";
    result.schemaFiles = prismaFiles.map(rel);
    result.configFile = rel(prismaFiles[0]);
    const m = read(prismaFiles[0]).match(/url\s*=\s*env\(\s*"(\w+)"\s*\)/);
    if (m) result.connectionSource = { kind: "env-url", var: m[1] };
  } else if (typeormFiles.length || deps.typeorm) {
    result.orm = "typeorm";
    result.schemaFiles = typeormFiles.map(rel);
    const ds = files.filter(
      (f) => /\.[jt]s$/.test(f) && /new DataSource\s*\(/.test(read(f)),
    )[0];
    if (ds) {
      result.configFile = rel(ds);
      const m = read(ds).match(/url\s*:\s*process\.env\.(\w+)/);
      if (m) result.connectionSource = { kind: "env-url", var: m[1] };
    }
  } else if (sequelizeFiles.length || deps.sequelize) {
    result.orm = "sequelize";
    result.schemaFiles = sequelizeFiles.map(rel);
    const rc = find(/^\.sequelizerc$/)[0];
    result.configFile = rc ? rel(rc) : null;
  } else if (knexCfg || deps.knex) {
    result.orm = "knex";
    result.configFile = knexCfg ? rel(knexCfg) : null;
    result.schemaFiles = files
      .filter((f) => /migrations?[\\/]/.test(f) && /\.[cm]?[jt]s$/.test(f))
      .map(rel);
  }
  if (!result.connectionSource && (deps.pg || deps.postgres))
    result.connectionSource = {
      kind: "env-url",
      var: "DATABASE_URL",
      assumed: true,
    };
  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.stdout.write(JSON.stringify(detect(), null, 2) + "\n");
}
