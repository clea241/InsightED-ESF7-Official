import { test, expect } from "vitest";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const { startupSchemaInitEnabled, openStartupDdlRunner } = nodeRequire(
  "../../db/startupSchema.js",
);
const { directPoolConfig } = nodeRequire("../../db/directPool.js");

test("startup schema init stays on unless explicitly turned off", () => {
  expect(startupSchemaInitEnabled({})).toBe(true);
  expect(startupSchemaInitEnabled({ RUN_STARTUP_SCHEMA_INIT: "true" })).toBe(
    true,
  );
  expect(startupSchemaInitEnabled({ RUN_STARTUP_SCHEMA_INIT: "" })).toBe(true);
  for (const off of ["false", "FALSE", "0", "no", "off", " false "]) {
    expect(startupSchemaInitEnabled({ RUN_STARTUP_SCHEMA_INIT: off })).toBe(
      false,
    );
  }
});

test("the DDL runner uses the direct connection when it works", async () => {
  const calls = [];
  const pool = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [] };
    },
    end: async () => calls.push("end"),
  };
  const pooled = async () => {
    throw new Error("pooled must not be used");
  };
  const runner = await openStartupDdlRunner(pooled, {
    createDirectPool: () => pool,
  });
  expect(runner.direct).toBe(true);
  await runner.query("ALTER TABLE x ADD COLUMN y int");
  await runner.close();
  expect(calls).toEqual(["SELECT 1", "ALTER TABLE x ADD COLUMN y int", "end"]);
});

test("the DDL runner falls back to the pooled connection, with a warning, when the direct one fails", async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  let ended = false;
  const pool = {
    query: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    },
    end: async () => {
      ended = true;
    },
  };
  const used = [];
  try {
    const runner = await openStartupDdlRunner(async (sql) => used.push(sql), {
      createDirectPool: () => pool,
    });
    expect(runner.direct).toBe(false);
    await runner.query("CREATE TABLE t ()");
    await runner.close();
  } finally {
    console.warn = warn;
  }
  expect(used).toEqual(["CREATE TABLE t ()"]);
  expect(ended).toBe(true);
  expect(warnings.join(" ")).toMatch(/pooled connection/);
});

test("the direct pool config uses the direct port but leaves process.env alone", () => {
  const env = {
    DB_HOST: "10.0.0.5",
    DB_PORT: "6432",
    DB_USER: "u",
    DB_PASSWORD: "p",
    DB_NAME: "insighted_esf7",
  };
  const cfg = directPoolConfig(env);
  expect(cfg).toMatchObject({
    host: "10.0.0.5",
    port: 5432,
    max: 1,
    database: "insighted_esf7",
  });
  expect(env.DB_PORT).toBe("6432"); // the caller's env is untouched
  const url = directPoolConfig({
    ...env,
    DATABASE_URL: "postgresql://u:p@10.0.0.5:6432/insighted_esf7",
    DB_DIRECT_PORT: "5433",
  });
  expect(new URL(url.connectionString).port).toBe("5433");
});
