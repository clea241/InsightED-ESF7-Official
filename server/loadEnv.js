const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Resolve root .env (primary consolidated location)
const rootEnvPath = path.resolve(__dirname, "../.env");
const serverEnvPath = path.resolve(__dirname, ".env");

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else {
  dotenv.config();
}

module.exports = process.env;
