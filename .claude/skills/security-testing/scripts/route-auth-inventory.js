#!/usr/bin/env node
"use strict";
// Static route-auth inventory for Express (Fastify is detected but reported as unsupported, never as "0 routes").
// Parses source with @babel/parser, follows app.use(mount, require(router)) and records, per route, whether an auth
// middleware applies (on the route, on its router, or as a global gate mounted earlier). Compares against
// security/public-routes.json. Exit 1 if an unauthenticated route is not allowlisted; exit 2 if detection is unreliable.
// Usage: node route-auth-inventory.js [--root <repo>] [--entry server/server.js] [--auth-pattern <regex>]
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const root = path.resolve(opt("root", process.cwd()));
const AUTH_RE = new RegExp(opt("auth-pattern", "auth|jwt|authenticate|requireUser|verifyToken|apiAuthGate"), "i");
const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);

function loadParser() {
  for (const base of [root, path.join(root, "server"), path.join(root, "client")]) {
    try {
      return require(require.resolve("@babel/parser", { paths: [base] }));
    } catch {
      /* try next */
    }
  }
  return null;
}
const parser = loadParser();
const out = { framework: null, routes: [], warnings: [], unparsed: [] };
const finish = (code) => {
  fs.mkdirSync(path.join(root, "security/reports/raw"), { recursive: true });
  fs.writeFileSync(path.join(root, "security/reports/raw/route-inventory.json"), JSON.stringify(out, null, 2));
  process.exit(code);
};

const pkgText = (() => {
  try {
    return fs.readFileSync(path.join(root, "server/package.json"), "utf8") + fs.readFileSync(path.join(root, "package.json"), "utf8");
  } catch {
    return "";
  }
})();
out.framework = /"fastify"/.test(pkgText) && !/"express"/.test(pkgText) ? "fastify" : /"express"/.test(pkgText) ? "express" : "unknown";
if (out.framework !== "express" || !parser) {
  out.warnings.push(`DETECTION FAILED: framework=${out.framework}, parser=${parser ? "ok" : "missing (@babel/parser)"}. This is NOT "zero routes".`);
  console.log(out.warnings[0]);
  finish(2);
}

const entry = path.resolve(root, opt("entry", "server/server.js"));
const cache = new Map();
function parseFile(file) {
  if (cache.has(file)) return cache.get(file);
  let ast = null;
  try {
    ast = parser.parse(fs.readFileSync(file, "utf8"), { sourceType: "unambiguous", plugins: ["jsx", "typescript"], errorRecovery: true });
  } catch (e) {
    out.unparsed.push(path.relative(root, file));
  }
  cache.set(file, ast);
  return ast;
}
function walk(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && walk(c, fn));
    else if (v && typeof v.type === "string") walk(v, fn);
  }
}
const strOf = (n) => (n && n.type === "StringLiteral" ? n.value : n && n.type === "TemplateLiteral" && n.expressions.length === 0 ? n.quasis[0].value.cooked : null);
function resolveRequire(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + ".js", base + ".mjs", base + ".ts", path.join(base, "index.js")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
// require("x") or require("x").name -> { spec, member }
function requireOf(n) {
  if (!n) return null;
  if (n.type === "CallExpression" && n.callee.name === "require" && strOf(n.arguments[0])) return { spec: strOf(n.arguments[0]), member: null };
  if (n.type === "MemberExpression" && !n.computed) {
    const r = requireOf(n.object);
    if (r) return { spec: r.spec, member: n.property.name };
  }
  return null;
}
function varRequires(file, ast) {
  const m = new Map();
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier") {
      const r = requireOf(n.init);
      if (r) m.set(n.id.name, r);
    }
  });
  return m;
}
const text = (file, n) => fs.readFileSync(file, "utf8").slice(n.start, n.end);
const NOT_AUTH_RE = /limit|throttle|valid|schema|cors|helmet/i;
const isAuthExpr = (file, n, vars) => {
  if (NOT_AUTH_RE.test(text(file, n).slice(0, 60))) return false;
  if (n.type === "Identifier" && vars.has(n.name)) {
    const r = vars.get(n.name);
    return AUTH_RE.test(n.name) || AUTH_RE.test(r.member || "");
  }
  if (n.type === "CallExpression") return isAuthExpr(file, n.callee, vars);
  return AUTH_RE.test(text(file, n));
};
const joinPath = (a, b) => ("/" + [a, b].join("/")).replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
const lineOf = (file, n) => `${path.relative(root, file).replace(/\\/g, "/")}:${n.loc ? n.loc.start.line : 0}`;

// Public prefixes declared by the gate's own file (array literal named PUBLIC_*), mounted relative to the gate mount.
function gatePublicPrefixes(file, vars, handlerNode) {
  let target = null;
  if (handlerNode.type === "MemberExpression") {
    const r = requireOf(handlerNode);
    if (r) target = resolveRequire(file, r.spec);
  }
  if (!target) return [];
  const ast = parseFile(target);
  const res = [];
  if (ast)
    walk(ast, (n) => {
      if (n.type === "VariableDeclarator" && n.id.name && /PUBLIC/i.test(n.id.name) && n.init && n.init.type === "ArrayExpression")
        n.init.elements.forEach((e) => strOf(e) && res.push(strOf(e)));
    });
  return res;
}

const visited = new Set();
function scanRouterFile(file, mount, gates, inheritedAuth, via) {
  const key = file + "|" + mount;
  if (visited.has(key)) return;
  visited.add(key);
  const ast = parseFile(file);
  if (!ast) return;
  const vars = varRequires(file, ast);
  let routerAuth = inheritedAuth;
  const calls = [];
  walk(ast, (n) => n.type === "CallExpression" && calls.push(n));
  calls.sort((a, b) => a.start - b.start);
  for (const c of calls) {
    const callee = c.callee;
    if (callee.type !== "MemberExpression" || callee.computed) continue;
    const m = callee.property.name;
    const objName = callee.object.type === "Identifier" ? callee.object.name : null;
    // router.route("/x").get(...).post(...)
    let routePath = null;
    let chainRoot = callee.object;
    while (chainRoot.type === "CallExpression" && chainRoot.callee.type === "MemberExpression") {
      if (chainRoot.callee.property.name === "route") {
        routePath = strOf(chainRoot.arguments[0]);
        break;
      }
      chainRoot = chainRoot.callee.object;
    }
    if (METHODS.has(m) && routePath !== null) {
      push(file, c, m, mount, routePath, c.arguments, vars, gates, routerAuth);
      continue;
    }
    if (!objName || !/^(app|router|r|api|server|route\w*)$/i.test(objName)) continue;
    if (METHODS.has(m) && c.arguments.length >= 1) {
      const p = strOf(c.arguments[0]);
      if (p !== null) push(file, c, m, mount, p, c.arguments.slice(1), vars, gates, routerAuth);
    } else if (m === "use") {
      let args = c.arguments;
      let sub = "";
      if (strOf(args[0]) !== null) {
        sub = strOf(args[0]);
        args = args.slice(1);
      }
      const full = joinPath(mount, sub);
      const authArgs = args.filter((a) => isAuthExpr(file, a, vars));
      const routerArgs = args.filter((a) => !authArgs.includes(a));
      if (authArgs.length && routerArgs.length === 0) {
        if (full === mount || full === "/" || sub === "") routerAuth = routerAuth || { by: lineOf(file, c), prefix: full };
        else gates.push({ prefix: full, public: gatePublicPrefixes(file, vars, authArgs[0]), by: lineOf(file, c) });
        if (sub !== "" && (full === "/api" || full.split("/").length <= 2)) {
          /* gate registered above */
        }
        continue;
      }
      for (const r of routerArgs) {
        const rq = r.type === "Identifier" ? vars.get(r.name) : requireOf(r);
        const target = rq && resolveRequire(file, rq.spec);
        if (target) scanRouterFile(target, full, gates, authArgs.length ? { by: lineOf(file, c), prefix: full } : routerAuth, "router");
      }
    }
  }
}
function push(file, c, method, mount, p, handlers, vars, gates, routerAuth) {
  const full = joinPath(mount, p);
  const own = handlers.some((h) => isAuthExpr(file, h, vars));
  let auth = false;
  let by = "none";
  if (own) (auth = true), (by = "route middleware");
  else if (routerAuth) (auth = true), (by = "router middleware");
  else {
    const gate = gates.find((g) => full === g.prefix || full.startsWith(g.prefix + "/"));
    if (gate) {
      const rel = full.slice(gate.prefix.length) || "/";
      const pub = gate.public.some((pp) => rel === pp || rel.startsWith(pp + "/"));
      if (pub) by = "global gate (path is in gate's public list)";
      else (auth = true), (by = "global gate");
    }
  }
  out.routes.push({ method: method.toUpperCase(), path: full, authenticated: auth, via: by, location: lineOf(file, c) });
}

if (!fs.existsSync(entry)) {
  out.warnings.push(`DETECTION FAILED: entry ${path.relative(root, entry)} not found. This is NOT "zero routes".`);
  console.log(out.warnings[0]);
  finish(2);
}
scanRouterFile(entry, "/", [], null, "app");

// Allowlist
let allow = [];
try {
  allow = JSON.parse(fs.readFileSync(path.join(root, "security/public-routes.json"), "utf8"));
} catch {
  out.warnings.push("security/public-routes.json missing or invalid: every unauthenticated route is reported");
}
const norm = (p) => p.replace(/:[A-Za-z_]\w*/g, ":p");
const allowed = (r) =>
  allow.some((a) => {
    if (a.method && a.method !== "ALL" && a.method.toUpperCase() !== r.method) return false;
    const ap = norm(a.path || "");
    return ap.endsWith("/*") ? norm(r.path) === ap.slice(0, -2) || norm(r.path).startsWith(ap.slice(0, -1)) : norm(r.path) === ap;
  });
for (const r of out.routes) r.allowlisted = !r.authenticated && allowed(r);
out.unauthenticatedNotAllowlisted = out.routes.filter((r) => !r.authenticated && !r.allowlisted);
if (out.routes.length === 0) {
  out.warnings.push("DETECTION FAILED: parsed the entry but found 0 routes. This is NOT 'all routes protected'.");
  console.log(out.warnings.at(-1));
  finish(2);
}
if (out.unparsed.length) out.warnings.push(`Could not parse: ${out.unparsed.join(", ")} (routes there may be missing)`);

console.log(`framework=express routes=${out.routes.length} unauthenticated=${out.routes.filter((r) => !r.authenticated).length} unauthenticated_not_allowlisted=${out.unauthenticatedNotAllowlisted.length}`);
console.log("METHOD  AUTH  ALLOW  PATH  (via, location)");
for (const r of out.routes) console.log(`${r.method.padEnd(7)} ${r.authenticated ? "yes " : "NO  "}  ${r.allowlisted ? "yes " : "-   "}  ${r.path}  (${r.via}, ${r.location})`);
out.warnings.forEach((w) => console.log("WARN " + w));
finish(out.unauthenticatedNotAllowlisted.length ? 1 : 0);
