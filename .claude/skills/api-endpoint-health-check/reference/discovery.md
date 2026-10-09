# Route discovery in Express

Read when `discover_routes.js` reports unresolved routes/mounts, or you need to trust/complete the manifest.

What the script does (static, regex plus bracket matching, no dependencies):
- Starts at `entryFile`, finds `app.use('/prefix', require('./router'))` and `app.use('/prefix', routerVar)` mounts, resolves relative requires (`.js`, `/index.js`), and recurses into nested `router.use('/sub', require(...))`.
- Extracts `X.get|post|put|patch|delete|all|head|options('/path', ...handlers)` and `router.route('/p').get(h).post(h)` chains where X is `app` or a variable assigned `express.Router()`.
- Joins the mount prefix and route path. The same router mounted under several prefixes produces one endpoint per prefix (eSF7 mounts `schools` at `/api/school` and `/api/schools`).
- Records the middleware chain (route level, router level via `router.use(mw)`, and path-scoped entry middleware) and the handler's file:line.
- Second count: greps every `router|app.METHOD('...'` call in the scanned files and compares with distinct declarations (`countCheck`).
- Cross-checks any OpenAPI/Swagger/Postman JSON in the repo (YAML is not parsed; compare by hand).

What it cannot see (it lists these in `unresolvedRoutes`; resolve them by reading the code):
- Route paths built from variables or template strings, regex paths, routes added in loops.
- Mounts made through `app.use(someFunction(app))`, plugin registration, or `require` with a computed path.
- Routers composed with `Router().use(otherRouter)` through helper factories.
- Routes in files that are never required from the entry (dead code); compare with a plain grep for the whole controllers folder.

Completing the manifest by hand: add objects to `endpoints` with the same fields, `source: "manual"` and a `routeDeclaredAt`. Say so in the report. Do not invent routes you did not find in code.
