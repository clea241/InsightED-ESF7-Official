import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  loadScheduleRules,
  loadTimeAllotment,
  loadAllowanceRules,
} = require("../../utils/sharedRules.js");

describe("sharedRules dynamic import loader", () => {
  it("successfully loads scheduleRules without ERR_MODULE_NOT_FOUND", async () => {
    const rules = await loadScheduleRules();
    expect(rules).toBeDefined();
    // Verify QR_VALIDITY_MS or other exports exist
    expect(rules.QR_VALIDITY_MS).toBeDefined();
    expect(typeof rules.QR_VALIDITY_MS).toBe("number");
  });

  it("successfully loads timeAllotment without errors", async () => {
    const ta = await loadTimeAllotment();
    expect(ta).toBeDefined();
  });

  it("successfully loads allowanceRules without errors", async () => {
    const allowances = await loadAllowanceRules();
    expect(allowances).toBeDefined();
  });
});
