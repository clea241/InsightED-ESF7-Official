const { monitorEventLoopDelay } = require("perf_hooks");

// LIVENESS route for the PM2 watchdog: proves only that this process answers.
// It must stay free of DB / Redis / auth so a slow dependency can never make it fail.
//
// event_loop_lag_ms is the p99 of monitorEventLoopDelay since the previous poll (the histogram is reset on every
// read, so the ONLY poller should be the PM2 watchdog). The 20 ms timer resolution is included in the percentile,
// so an idle process reads around 20-25 ms; the watchdog's 500 ms threshold is unaffected by that offset.
//
// Exposure: nginx proxies /insighted-esf7-staging/api/ (and sets X-Forwarded-For) and also proxies
// /insighted-esf7-staging/health* WITHOUT forwarding headers. Only /api/health/live is registered because a
// loopback check cannot be made reliable behind the second block (nginx itself connects from 127.0.0.1).
// Requests that arrive through nginx always carry X-Forwarded-For / X-Real-IP on /api/, so they are answered 404.

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const isDirectLoopback = (req) =>
  LOOPBACK.has(req.socket && req.socket.remoteAddress) &&
  !req.headers["x-forwarded-for"] &&
  !req.headers["x-real-ip"];

// One histogram per process, shared by the main-port route and the per-instance listener.
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

const createLivenessHandler =
  (env = process.env) =>
  (req, res) => {
    if (!isDirectLoopback(req)) {
      return res.status(404).json({ error: "Not found" });
    }
    const lagMs = Math.round(loopDelay.percentile(99) / 1e6);
    loopDelay.reset();
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      status: "ok",
      event_loop_lag_ms: lagMs,
      uptime_s: Math.round(process.uptime()),
      rss_mb: Math.round(process.memoryUsage().rss / 1048576),
      instance: env.NODE_APP_INSTANCE ?? null,
    });
  };

module.exports = {
  createLivenessHandler,
  isDirectLoopback,
};
