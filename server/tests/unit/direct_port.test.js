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
