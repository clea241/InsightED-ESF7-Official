// Preload module for ops scripts run on the server:
//   ESF7_ECOSYSTEM=../ecosystem.esf7-staging.config.cjs node -r ./scripts/with_ecosystem_env.js migrations/<file>.js
//
// PM2 gives the app the `env` block of its ecosystem file (DB_NAME, DB_PORT, NODE_ENV, ...). A script started by hand
// from a shell does NOT get it, so it could talk to a different database than the app. This applies that same block
// first, so a migration, a backup or a check sees exactly what the running app sees. Values are never printed.
//
// ORDER MATTERS: this runs (via `node -r`) BEFORE the script's own `require("../db/directPort")`. The ecosystem
// file names the PgBouncer port (DB_PORT 6432); db/directPort then rewrites it to the direct Postgres port, exactly
// as it does for every other ops script. This file opens no database connection itself.
const path = require("path");

function applyEcosystemEnv(file, appName, env = process.env) {
  if (!file) return [];
  const eco = require(path.resolve(file));
  const apps = Array.isArray(eco.apps) ? eco.apps : [];
  const app =
    (appName && apps.find((a) => a.name === appName)) ||
    apps.find((a) => a.env && !/worker/i.test(a.name || "")) ||
    apps.find((a) => a.env);
  if (!app || !app.env) return [];
  const applied = [];
  for (const [key, value] of Object.entries(app.env)) {
    if (value === undefined || value === null || value === "") continue;
    env[key] = String(value);
    applied.push(key);
  }
  return applied;
}

if (process.env.ESF7_ECOSYSTEM) {
  applyEcosystemEnv(process.env.ESF7_ECOSYSTEM, process.env.ESF7_ECOSYSTEM_APP);
}

module.exports = { applyEcosystemEnv };
