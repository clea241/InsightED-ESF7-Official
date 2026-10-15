// A small connection straight to PostgreSQL (DB_DIRECT_PORT), for work that must not go through PgBouncer in
// transaction mode, such as the schema changes the server runs at startup. Unlike db/directPort.js it does NOT change
// process.env, so the normal pools keep using DB_PORT.
//
// Same database and credentials as the primary pool in db/index.js; only the port differs (same rewrite rule as the
// scripts: only when DB_DIRECT_PORT is set or the port is the pooler's 6432).
const { Pool } = require("pg");
require("../loadEnv");
const { applyDirectPort } = require("./directPortCore");

function directPoolConfig(sourceEnv = process.env) {
  const env = { ...sourceEnv };
  applyDirectPort(env);
  const host = env.DB_HOST;
  const isLocal = host === "127.0.0.1" || host === "localhost";
  const ssl =
    !isLocal &&
    (env.DB_SSL === "true" || String(host || "").includes("azure.com"))
      ? { rejectUnauthorized: false }
      : false;
  const url = env.PRIMARY_DATABASE_URL || env.DATABASE_URL;
  const base = url
    ? { connectionString: url }
    : {
        host,
        port: Number(env.DB_PORT) || 5432,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME || "insighted_esf7",
      };
  return {
    ...base,
    ssl,
    max: 1,
    keepAlive: true,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  };
}

function createDirectPool(sourceEnv = process.env) {
  const pool = new Pool(directPoolConfig(sourceEnv));
  pool.on("error", (err) =>
    console.warn("[Direct Pool Client Error]:", err.message),
  );
  return pool;
}

module.exports = { createDirectPool, directPoolConfig };
