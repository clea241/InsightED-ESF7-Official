const path = require("path");
const fs = require("fs");

// Prefer root .env (local dev), fallback to server/.env
const rootEnvPath = path.join(__dirname, "../.env");
const serverEnvPath = path.join(__dirname, ".env");
const envPath = fs.existsSync(rootEnvPath) ? rootEnvPath : serverEnvPath;
require("dotenv").config({ path: envPath });

const host = process.env.DB_HOST || "localhost";
const isLocal = host === "localhost" || host === "127.0.0.1";

module.exports = {
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: host,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "esf7_local",
    ssl:
      !isLocal && (process.env.DB_SSL === "true" || host.includes("azure.com"))
        ? { rejectUnauthorized: false }
        : false,
  },
};
