import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const { applyDirectPort, directConnectionConfig, directPort } = nodeRequire(
  "../../db/directPort.js",
);

test("the pooler port is replaced by 5432 by default", () => {
  const env = {
    DB_PORT: "6432",
    DATABASE_URL: "postgresql://u:p@127.0.0.1:6432/insighted_esf7",
  };
  const changed = applyDirectPort(env);
  expect(env.DB_PORT).toBe("5432");
  expect(new URL(env.DATABASE_URL).port).toBe("5432");
  expect(env.DATABASE_URL).toContain("127.0.0.1");
  expect(env.DATABASE_URL).toContain("insighted_esf7");
  expect(changed).toEqual(["DB_PORT", "DATABASE_URL"]);
});

test("DB_DIRECT_PORT, when set, wins over any other port", () => {
  const env = {
    DB_DIRECT_PORT: "5433",
    DB_PORT: "6432",
    PRIMARY_DATABASE_URL: "postgresql://u:p@db.internal:6432/a",
    USERS_DATABASE_URL: "postgresql://u:p@db.internal:5999/b",
  };
  applyDirectPort(env);
  expect(env.DB_PORT).toBe("5433");
  expect(new URL(env.PRIMARY_DATABASE_URL).port).toBe("5433");
  expect(new URL(env.USERS_DATABASE_URL).port).toBe("5433");
});

test("a developer's own non-pooler port is left alone when DB_DIRECT_PORT is not set", () => {
  const env = {
    DB_PORT: "5433",
    DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/x",
  };
  expect(applyDirectPort(env)).toEqual([]);
  expect(env.DB_PORT).toBe("5433");
  expect(env.DATABASE_URL).toBe("postgresql://u:p@127.0.0.1:5433/x");
});

test("an invalid DB_DIRECT_PORT falls back to 5432; unparseable URLs are skipped", () => {
  expect(directPort({ DB_DIRECT_PORT: "abc" })).toBe("5432");
  expect(directPort({ DB_DIRECT_PORT: "70000" })).toBe("5432");
  const env = { DB_PORT: "6432", DATABASE_URL: "not a url" };
  applyDirectPort(env);
  expect(env.DATABASE_URL).toBe("not a url");
});

test("directConnectionConfig never returns the pooler port", () => {
  const cfg = directConnectionConfig({
    DB_HOST: "db.internal",
    DB_PORT: "6432",
    DB_USER: "u",
    DB_PASSWORD: "p",
    DB_NAME: "n",
  });
  expect(cfg).toMatchObject({ host: "db.internal", port: 5432, database: "n" });
  expect(directConnectionConfig({ DB_PORT: "5433" }).port).toBe(5433);
});

// Guard: every script, migration and migrate_*.js must load the direct-port helper, so a new one cannot be added
// that quietly goes through PgBouncer.
test("every script, migration and migrate_*.js loads db/directPort", () => {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const files = [
    ...readdirSync(path.join(serverDir, "scripts"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join("scripts", f)),
    ...readdirSync(path.join(serverDir, "migrations"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join("migrations", f)),
    ...readdirSync(serverDir).filter((f) => /^migrate_.*\.js$/.test(f)),
  ];
  expect(files.length).toBeGreaterThan(100);
  const missing = files.filter(
    (f) =>
      !readFileSync(path.join(serverDir, f), "utf8").includes("db/directPort"),
  );
  expect(missing).toEqual([]);
});

// Same guard for the older one-off scripts in server/ itself. Only the app and worker runtime stay on the pooled
// connection (they must go through PgBouncer); files that never touch the database need nothing.
test("every database-touching root script loads db/directPort, except the runtime files", () => {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const runtime = new Set([
    "db.js",
    "drizzle.config.js",
    "loadEnv.js",
    "queue_worker.js",
    "run_redis_worker.js",
    "run_worker.js",
    "server.js",
  ]);
  const touchesDb =
    /require\(["']\.\/db|require\(["']pg["']|new Pool|new Client|DB_PORT|DATABASE_URL|loadEnv/;
  const missing = readdirSync(serverDir)
    .filter((f) => f.endsWith(".js") && !runtime.has(f))
    .filter((f) => {
      const text = readFileSync(path.join(serverDir, f), "utf8");
      return touchesDb.test(text) && !text.includes("db/directPort");
    });
  expect(missing).toEqual([]);
});

// DB_DIRECT_HOST: PgBouncer runs ON the VM and forwards to a remote server, so "port 5432 on the same host" is a
// different database. Ops scripts get the real host through DB_DIRECT_HOST; nothing else changes.
test("DB_DIRECT_HOST replaces a loopback host (and only a loopback host)", () => {
  const env = {
    DB_DIRECT_HOST: "db.azure.example",
    DB_HOST: "127.0.0.1",
    DB_PORT: "6432",
    DATABASE_URL: "postgresql://u:p@127.0.0.1:6432/insighted_esf7_staging",
    USERS_DATABASE_URL: "postgresql://u:p@other.remote:6432/users",
  };
  const changed = applyDirectPort(env);
  expect(env.DB_HOST).toBe("db.azure.example");
  expect(env.DB_PORT).toBe("5432");
  const u = new URL(env.DATABASE_URL);
  expect([u.hostname, u.port, u.pathname]).toEqual([
    "db.azure.example",
    "5432",
    "/insighted_esf7_staging",
  ]);
  // a host that is already remote keeps its host (its port is still moved off the pooler port)
  expect(new URL(env.USERS_DATABASE_URL).hostname).toBe("other.remote");
  expect(changed).toEqual(
    expect.arrayContaining(["DB_PORT", "DB_HOST", "DATABASE_URL"]),
  );
});

test("without DB_DIRECT_HOST the host is never touched (behaviour unchanged)", () => {
  const env = { DB_HOST: "127.0.0.1", DB_PORT: "6432" };
  applyDirectPort(env);
  expect(env.DB_HOST).toBe("127.0.0.1");
});

test("a DB_DIRECT_HOST that equals the current host changes nothing", () => {
  const env = {
    DB_DIRECT_HOST: "10.0.0.5",
    DB_HOST: "10.0.0.5",
    DB_PORT: "5432",
  };
  expect(applyDirectPort(env)).toEqual([]);
});
