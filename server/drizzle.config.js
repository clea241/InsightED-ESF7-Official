const path = require("path");
const fs = require("fs");

require("./loadEnv");

const host = process.env.DB_HOST || "localhost";
const isLocal = host === "localhost" || host === "127.0.0.1";

module.exports = {
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dbCredentials: process.env.DATABASE_URL
    ? {
        url: process.env.DATABASE_URL,
        ssl:
          !isLocal &&
          (process.env.DB_SSL === "true" || host.includes("azure.com"))
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        host: host,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "esf7_local",
        ssl:
          !isLocal &&
          (process.env.DB_SSL === "true" || host.includes("azure.com"))
            ? { rejectUnauthorized: false }
            : false,
      },
};
