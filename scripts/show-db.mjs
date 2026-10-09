import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve("server/.env");
const env = { ...process.env };

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && env[m[1]] === undefined) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

const dbName = env.DB_NAME || "insighted_esf7";
const dbHost =
  env.DB_HOST || "stride-posgre-prod-01.postgres.database.azure.com";
const dbPort = env.DB_PORT || "5432";
const dbUser = env.DB_USER || "Administrator1";
const isLocal = dbHost === "127.0.0.1" || dbHost === "localhost";
const ssl =
  (!isLocal && (env.DB_SSL === "true" || dbHost.includes("azure.com"))) ||
  (env.DB_SSL === "true" && !isLocal);

const authDbName =
  env.USERS_DB_NAME ||
  env.AUTH_DB_NAME ||
  (isLocal ? "users_local" : "users_database");

console.log(
  "\n========================================================================",
);
console.log("🗄️  [InsightED ESF7 Dev Startup]");
console.log(`   Target Database : ${dbName}`);
console.log(`   Auth Database   : ${authDbName}`);
console.log(`   Host & Port     : ${dbHost}:${dbPort}`);
console.log(`   Database User   : ${dbUser}`);
console.log(
  `   SSL Encryption  : ${ssl ? "Enabled (Azure/Remote)" : "Disabled (Localhost/Direct)"}`,
);
if (env.DATABASE_URL) {
  const safeUrl = env.DATABASE_URL.replace(/:[^:@]+@/, ":****@");
  console.log(`   DATABASE_URL    : ${safeUrl}`);
}
console.log(
  "========================================================================\n",
);
