// Thin wrapper: the single real script lives in server/scripts/ (repo convention for migration scripts).
require("../../../../server/scripts/disaggregate_room_roster_cache.js")
  .main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((e) => { console.error(e.message); process.exit(1); });
