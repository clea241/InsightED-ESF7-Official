/**
 * Environment detection utility for InsightED eSF7.
 * Robustly detects whether the current deployment or session is running in STAGING mode.
 */

export function isStagingEnvironment() {
  // 1. Build-time Vite environment variables (set during build or deployment scripts)
  if (import.meta.env?.VITE_APP_ENV === "staging") return true;
  if (
    import.meta.env?.VITE_IS_STAGING === "true" ||
    import.meta.env?.VITE_IS_STAGING === true
  ) {
    return true;
  }
  if (String(import.meta.env?.VITE_BASE_PATH || "").includes("staging")) {
    return true;
  }
  if (String(import.meta.env?.BASE_URL || "").includes("staging")) {
    return true;
  }
  if (String(import.meta.env?.VITE_API_URL || "").includes("staging")) {
    return true;
  }

  // 2. Runtime browser checks (subpath, hostname, port, and query params)
  if (typeof window !== "undefined" && window.location) {
    const pathname = String(window.location.pathname || "").toLowerCase();
    const hostname = String(window.location.hostname || "").toLowerCase();
    const port = String(window.location.port || "");
    const search = String(window.location.search || "").toLowerCase();

    // Check for staging subpaths: /insighted-esf7-staging/, /staging/, etc.
    if (
      pathname.includes("/insighted-esf7-staging") ||
      pathname.includes("-staging") ||
      pathname.includes("/staging/")
    ) {
      return true;
    }

    // Check hostname
    if (hostname.includes("staging")) {
      return true;
    }

    // Direct port 5035 (insighted-esf7-staging-backend)
    if (port === "5035") {
      return true;
    }

    // Manual test parameter for local testing: e.g. http://localhost:5173/?staging=1
    if (
      search.includes("staging=1") ||
      search.includes("staging=true") ||
      search.includes("test_mode=1")
    ) {
      return true;
    }
  }

  return false;
}
