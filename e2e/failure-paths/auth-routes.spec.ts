import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { API, newTenant } from "./helpers";

// FP-12: every API route in the inventory must answer 401 without a valid token, unless it is on this explicit public allowlist.
// Adding a public route is a deliberate act: add its prefix here in the same change.
const PUBLIC_ALLOWLIST = [
  "/api/health",
  "/api/auth",
  "/api/room-profiling",
  "/api/salary-matrix",
];

const root = process.env.E2E_PROJECT_ROOT || process.cwd();
const controllers = path.join(root, "server", "controllers");
const METHOD_RE = /router\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]*)\2/g;

function filesIn(target: string): string[] {
  if (fs.existsSync(target + ".js")) return [target + ".js"];
  return fs.existsSync(target) && fs.statSync(target).isDirectory()
    ? walk(target)
    : [];
}
function walk(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? e.name === "node_modules"
          ? []
          : walk(path.join(dir, e.name))
        : e.name.endsWith(".js")
          ? [path.join(dir, e.name)]
          : [],
    );
}

function inventory(): { method: string; url: string }[] {
  const serverSrc = fs.readFileSync(
    path.join(root, "server", "server.js"),
    "utf8",
  );
  const out = new Map<string, { method: string; url: string }>();
  const add = (method: string, url: string) =>
    out.set(method + " " + url, { method, url });
  // Routers mounted under /api: mount path + each router.<method>(path) in the controller's files.
  for (const m of serverSrc.matchAll(
    /app\.use\(\s*["'](\/api[^"']*)["']\s*,\s*(?:[\w.()]+\s*,\s*)*require\(\s*["']\.\/controllers\/([^"']+)["']\s*\)/g,
  )) {
    const mount = m[1].replace(/\/$/, "");
    for (const file of filesIn(path.join(controllers, m[2]))) {
      for (const r of fs.readFileSync(file, "utf8").matchAll(METHOD_RE)) {
        const sub = r[3] === "/" ? "" : r[3];
        add(
          r[1].toUpperCase(),
          (mount + (sub.startsWith("/") || sub === "" ? sub : "/" + sub))
            .replace(/:[A-Za-z_]\w*\??/g, "1")
            .replace(/\*/g, "x"),
        );
      }
    }
    add("GET", mount || "/api"); // the mount root itself
  }
  // Routes declared directly on app under /api.
  for (const m of serverSrc.matchAll(
    /app\.(get|post|put|patch|delete)\(\s*["'](\/api[^"']*)["']/g,
  ))
    add(m[1].toUpperCase(), m[2].replace(/:[A-Za-z_]\w*/g, "1"));
  return [...out.values()];
}

const isPublic = (url: string) =>
  PUBLIC_ALLOWLIST.some((p) => url === p || url.startsWith(p + "/"));

test.describe("unauthenticated access", () => {
  test("FP-12 every inventoried API route returns 401 without a token unless it is on the public allowlist", async ({
    request,
  }) => {
    const routes = inventory().filter((r) => !isPublic(r.url));
    expect(
      routes.length,
      "route inventory must not be empty (the parser would be broken)",
    ).toBeGreaterThan(30);
    test
      .info()
      .annotations.push({
        type: "routes-checked",
        description: String(routes.length),
      });

    const offenders: string[] = [];
    // Small batches keep the local server comfortable.
    for (let i = 0; i < routes.length; i += 10) {
      await Promise.all(
        routes.slice(i, i + 10).map(async (r) => {
          const res = await request.fetch(API + r.url, {
            method: r.method,
            data: r.method === "GET" ? undefined : {},
            failOnStatusCode: false,
          });
          if (res.status() !== 401)
            offenders.push(`${r.method} ${r.url} -> ${res.status()}`);
        }),
      );
    }
    expect(offenders, "routes reachable without a token").toEqual([]);

    // A school id in a header or query is not a login.
    const spoof = await request.get(
      `${API}/api/school/draft?school_id=199001`,
      { headers: { "x-school-id": "199001" } },
    );
    expect(spoof.status()).toBe(401);
  });

  test("FP-12 forged, wrongly signed and expired tokens are rejected with 401", async ({
    request,
  }) => {
    const jwt = require("jsonwebtoken");
    const t = newTenant("fp12");
    const claims = { uid: t.uid, role: "school", school_id: t.schoolId };
    const bad: Record<string, string> = {
      "signed with another secret": jwt.sign(
        claims,
        "not-the-real-secret-not-the-real-secret",
        { algorithm: "HS256", expiresIn: "1h" },
      ),
      expired: jwt.sign(claims, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: -60,
      }),
      "alg none": `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`,
      garbage: "not-a-jwt",
    };
    for (const [label, token] of Object.entries(bad)) {
      const res = await request.get(`${API}/api/school/draft`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status(), label).toBe(401);
    }
  });
});
