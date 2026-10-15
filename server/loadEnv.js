const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Resolve root .env (primary consolidated location)
const rootEnvPath = path.resolve(__dirname, "../.env");
const serverEnvPath = path.resolve(__dirname, ".env");

const isTest =
  process.env.NODE_ENV === "test" || Boolean(process.env.TEST_DATABASE_URL);
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: !isTest });
} else if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath, override: !isTest });
} else {
  dotenv.config({ override: !isTest });
}

// Automatically synthesize legacy individual database fields from standardized URLs
const primaryUrl = process.env.PRIMARY_DATABASE_URL || process.env.DATABASE_URL;
if (primaryUrl) {
  try {
    const parsed = new URL(primaryUrl);
    if (!process.env.DB_HOST && parsed.hostname) {
      process.env.DB_HOST = parsed.hostname;
    }
    if (!process.env.DB_PORT && parsed.port) {
      process.env.DB_PORT = parsed.port;
    } else if (!process.env.DB_PORT) {
      process.env.DB_PORT = "5432";
    }
    if (!process.env.DB_USER && parsed.username) {
      process.env.DB_USER = decodeURIComponent(parsed.username);
    }
    if (!process.env.DB_PASSWORD && parsed.password) {
      process.env.DB_PASSWORD = decodeURIComponent(parsed.password);
    }
    if (!process.env.DB_NAME && parsed.pathname && parsed.pathname.length > 1) {
      process.env.DB_NAME = decodeURIComponent(parsed.pathname.slice(1));
    }
    if (process.env.DB_SSL === undefined) {
      const sslmode = parsed.searchParams.get("sslmode");
      if (sslmode === "require" || sslmode === "prefer") {
        process.env.DB_SSL = "true";
      } else if (sslmode === "disable") {
        process.env.DB_SSL = "false";
      } else {
        const isLocal =
          parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        process.env.DB_SSL =
          !isLocal && parsed.hostname.includes("azure.com") ? "true" : "false";
      }
    }
  } catch (err) {
    // If not a parseable URL, will be caught by downstream validation
  }
}

if (process.env.USERS_DATABASE_URL) {
  try {
    const parsedUsers = new URL(process.env.USERS_DATABASE_URL);
    if (
      !process.env.USERS_DB_NAME &&
      parsedUsers.pathname &&
      parsedUsers.pathname.length > 1
    ) {
      process.env.USERS_DB_NAME = decodeURIComponent(
        parsedUsers.pathname.slice(1),
      );
    }
    if (!process.env.AUTH_DB_NAME) {
      process.env.AUTH_DB_NAME = process.env.USERS_DB_NAME;
    }
  } catch (err) {}
}

if (process.env.INSIGHTED_DATABASE_URL) {
  try {
    const parsedInsight = new URL(process.env.INSIGHTED_DATABASE_URL);
    if (
      !process.env.INSIGHTED_DB_NAME &&
      parsedInsight.pathname &&
      parsedInsight.pathname.length > 1
    ) {
      process.env.INSIGHTED_DB_NAME = decodeURIComponent(
        parsedInsight.pathname.slice(1),
      );
    }
  } catch (err) {}
}

module.exports = process.env;
