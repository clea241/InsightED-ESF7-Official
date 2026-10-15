"use strict";
// Preload (node --require / NODE_OPTIONS) used ONLY for failure-path test runs. Fails closed and forces every `pg` Client and Pool
// to connect to the database in DATABASE_URL (the guarded .env.test database), whatever host, port, database name or credentials the code
// asks for. The app and several legacy scripts hard-code real database names (for example insighted_esf7); this makes that harmless.
const Module = require("module");

const url = process.env.DATABASE_URL;
let target;
try {
  target = new URL(url);
} catch {
  throw new Error("pin-db: DATABASE_URL is missing or invalid; refusing to start without a pinned test database.");
}
const host = target.hostname.replace(/^\[|\]$/g, "");
const dbName = decodeURIComponent(target.pathname.slice(1));
if (!["localhost", "127.0.0.1", "::1"].includes(host) || !dbName.toLowerCase().includes("test"))
  throw new Error("pin-db: DATABASE_URL is not a local test database; refusing to start.");

const pinned = {
  host,
  port: Number(target.port || 5432),
  database: dbName,
  user: decodeURIComponent(target.username),
  password: decodeURIComponent(target.password),
  ssl: false,
};
const pin = (cfg) => {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  const { connectionString, ...rest } = base;
  return { ...rest, ...pinned };
};

const load = Module._load;
Module._load = function (request, parent, isMain) {
  const mod = load.apply(this, arguments);
  if (request === "pg" && mod && !mod.__failurePathPinned) {
    const BaseClient = mod.Client;
    const BasePool = mod.Pool;
    class PinnedClient extends BaseClient {
      constructor(cfg) {
        super(pin(cfg));
      }
    }
    class PinnedPool extends BasePool {
      constructor(cfg) {
        super(pin(cfg));
      }
    }
    mod.Client = PinnedClient;
    mod.Pool = PinnedPool;
    Object.defineProperty(mod, "__failurePathPinned", { value: true });
  }
  return mod;
};

