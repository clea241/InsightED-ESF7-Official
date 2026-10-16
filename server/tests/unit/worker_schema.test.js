import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const { WORKER_COLUMNS } = nodeRequire("../../services/workerSchema.js");
const { findMissingWorkerColumns, warnIfWorkerSchemaMismatch } = nodeRequire(
  "../../db/workerSchemaCheck.js",
);
const { COLUMNS } = nodeRequire(
  "../../migrations/add_worker_schema_columns.js",
);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sqlText = readFileSync(
  path.join(repoRoot, "docs/ops/worker-schema-check.sql"),
  "utf8",
);

// A fake database that has every worker column except those listed.
function fakeClient(missing = {}) {
  return {
    query: async (_sql, params) => {
      const rows = [];
      for (const table of params[0]) {
        if (missing[table] === "table") continue;
        for (const col of WORKER_COLUMNS[table] || []) {
          if (!(missing[table] || []).includes(col)) {
            rows.push({ table_name: table, column_name: col });
          }
        }
      }
      return { rows };
    },
  };
}

test("the read-only SQL check lists exactly the columns in services/workerSchema.js", () => {
  const listed = [...sqlText.matchAll(/^\s+\('(\w+)', '(\w+)',/gm)].map(
    (m) => `${m[1]}.${m[2]}`,
  );
  const expected = Object.entries(WORKER_COLUMNS).flatMap(([t, cols]) =>
    cols.map((c) => `${t}.${c}`),
  );
  expect(listed.sort()).toEqual(expected.sort());
});

test("the SQL check can only read", () => {
  const code = sqlText
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  expect(code).not.toMatch(
    /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i,
  );
  expect(code.trim().toUpperCase().startsWith("SELECT")).toBe(true);
});

test("every column the migration adds is one the worker writes", () => {
  for (const [table, column] of COLUMNS) {
    expect(WORKER_COLUMNS[table]).toContain(column);
  }
});

test("the manifest covers the tables the worker writes", () => {
  const worker = readFileSync(
    path.join(repoRoot, "server/queue_worker.js"),
    "utf8",
  );
  const literalTables = [
    ...worker.matchAll(/executeBatchInsertInChunks\(\s*client,\s*"(\w+)"/g),
  ].map((m) => m[1]);
  expect(literalTables.length).toBeGreaterThan(10);
  for (const t of new Set(literalTables))
    expect(WORKER_COLUMNS).toHaveProperty(t);
});

test("findMissingWorkerColumns reports missing tables and columns", async () => {
  const result = await findMissingWorkerColumns(
    fakeClient({
      esf7_school_profile: ["has_elem_inclusive"],
      esf7_admin_task: "table",
    }),
  );
  expect(result.missingTables).toEqual(["esf7_admin_task"]);
  expect(result.missingColumns).toEqual({
    esf7_school_profile: ["has_elem_inclusive"],
  });
});

test("the boot check warns once with the details, stays quiet when complete, and never throws", async () => {
  const warn = console.warn;
  const log = console.log;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  console.log = () => {};
  try {
    expect(
      await warnIfWorkerSchemaMismatch(
        fakeClient({ esf7_personnel_employment: ["raw_payload"] }),
      ),
    ).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/esf7_personnel_employment\(raw_payload\)/);
    expect(warnings[0]).toMatch(/worker-schema-check\.sql/);

    warnings.length = 0;
    expect(await warnIfWorkerSchemaMismatch(fakeClient())).toBe(false);
    expect(warnings).toHaveLength(0);

    const broken = {
      query: async () => {
        throw new Error("connection refused");
      },
    };
    expect(await warnIfWorkerSchemaMismatch(broken)).toBe(false);
    expect(warnings.join(" ")).toMatch(/could not run/);
  } finally {
    console.warn = warn;
    console.log = log;
  }
});

test("verifyWorkerSchema does nothing unless QUEUE_CONSUMER_ENABLED is true", async () => {
  const saved = process.env.QUEUE_CONSUMER_ENABLED;
  delete process.env.QUEUE_CONSUMER_ENABLED;
  try {
    const worker = nodeRequire("../../queue_worker.js");
    expect(await worker.verifyWorkerSchema()).toBe(false);
  } finally {
    if (saved !== undefined) process.env.QUEUE_CONSUMER_ENABLED = saved;
  }
});
