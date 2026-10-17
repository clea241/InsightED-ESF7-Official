import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("with_ecosystem_env: scripts see the environment PM2 gives the app", () => {
  const { applyEcosystemEnv } = require("../../scripts/with_ecosystem_env.js");

  it("applies the backend app's env block and skips empty values", () => {
    const env = {};
    const applied = applyEcosystemEnv(
      "ecosystem.esf7-staging.config.cjs",
      undefined,
      env,
    );
    expect(applied).toEqual(
      expect.arrayContaining(["NODE_ENV", "DB_NAME", "PORT"]),
    );
    expect(env.DB_NAME).toBe(process.env.DB_NAME || "insighted_esf7_staging");
    expect(env.PORT).toBe("5035");
    // undefined entries (secrets not set in this shell) are not turned into the string "undefined"
    for (const v of Object.values(env)) expect(v).not.toBe("undefined");
  });

  it("uses the backend, not the worker, unless asked", () => {
    const envA = {};
    applyEcosystemEnv("ecosystem.esf7-prod.config.cjs", undefined, envA);
    expect(envA.PG_POOL_MAX_WORKER).toBeUndefined();
    expect(envA.DB_NAME).toBe(process.env.DB_NAME || "insighted_esf7");
  });

  it("does nothing without an ecosystem file", () => {
    expect(applyEcosystemEnv(undefined, undefined, {})).toEqual([]);
  });
});

describe("backup_database", () => {
  const backup = require("../../scripts/backup_database.js");

  it("refuses to run against a database other than the one the deploy expects", () => {
    const env = {
      DB_HOST: "127.0.0.1",
      DB_PORT: "5432",
      DB_USER: "u",
      DB_PASSWORD: "p",
      DB_NAME: "insighted_esf7",
    };
    const err = [];
    const orig = console.error;
    console.error = (m) => err.push(m);
    try {
      const code = backup.main(
        ["--out", "/tmp/x.dump", "--expect-db", "insighted_esf7_staging"],
        env,
      );
      expect(code).toBe(2);
      expect(err.join(" ")).toMatch(/expects "insighted_esf7_staging"/);
    } finally {
      console.error = orig;
    }
  });

  it("needs an output file", () => {
    const orig = console.error;
    console.error = () => {};
    try {
      expect(backup.main([], { DB_NAME: "x" })).toBe(1);
    } finally {
      console.error = orig;
    }
  });

  it("builds a custom-format pg_dump command and reads the database from a URL when DB_NAME is unset", () => {
    expect(
      backup.buildPgDumpArgs(
        { host: "h", port: 5432, user: "u" },
        "db",
        "/o.dump",
      ),
    ).toEqual([
      "-h",
      "h",
      "-p",
      "5432",
      "-U",
      "u",
      "-d",
      "db",
      "-Fc",
      "-f",
      "/o.dump",
    ]);
    expect(
      backup.resolveDatabaseName(
        {},
        {
          DATABASE_URL:
            "postgresql://u:p@h:5432/insighted_esf7_staging?sslmode=require",
        },
      ),
    ).toBe("insighted_esf7_staging");
  });
});

describe("health routes expose which build is running", () => {
  const src = read("../../server.js");
  it("reads BUILD_INFO.json and returns it from readiness and deep health", () => {
    expect(src).toMatch(/BUILD_INFO\.json/);
    const ready = src.slice(
      src.indexOf("const checkReadiness"),
      src.indexOf("const checkDeep"),
    );
    expect(ready).toMatch(/build: BUILD_INFO/);
    expect(src.slice(src.indexOf("const checkDeep"))).toMatch(
      /build: BUILD_INFO/,
    );
  });
  it("serves /api/health/readiness, the route the deploy checks", () => {
    expect(src).toMatch(
      /app\.get\("\/api\/health\/readiness", checkReadiness\)/,
    );
  });
});

describe("deploy scripts are thin configs over one shared module", () => {
  const staging = read("../../../deploy_esf7_staging.py");
  const prod = read("../../../deploy_esf7_prod.py");
  it("both import deploy_common and contain no copy of the logic", () => {
    for (const s of [staging, prod]) {
      expect(s).toMatch(/import deploy_common as dc/);
      expect(s).not.toMatch(/def run_command|def main|subprocess/);
    }
  });
  it("keep their existing config values", () => {
    expect(staging).toMatch(/\/mnt\/insighted-esf7-staging/);
    expect(staging).toMatch(/port=5035/);
    expect(staging).toMatch(/insighted-esf7-staging-backend/);
    expect(prod).toMatch(
      /\/var\/www\/html\/InsightED-ROSDO\/insighted-esf7-prod/,
    );
    expect(prod).toMatch(/port=5007/);
    expect(prod).toMatch(/insighted-esf7-prod-backend/);
  });
});
