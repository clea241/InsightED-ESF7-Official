// Allowance rules shared by client and server. An allowance can be disabled per personnel record
// (e.g. Special Hardship / "SHA"); a disabled allowance is ignored by compliance checks and totals.
export const ALLOWANCE_KEYS = [
  "pera",
  "uniform",
  "supplies",
  "medical",
  "hardship",
];

export const isAllowanceDisabled = (personAllowances, key) =>
  Array.isArray(personAllowances?.disabled) &&
  personAllowances.disabled.includes(key);

// Granted AND not disabled. Existing records have no disabled list, so they behave exactly as before.
export const isAllowanceActive = (personAllowances, key) =>
  Boolean(personAllowances?.[key]) &&
  !isAllowanceDisabled(personAllowances, key);

export const hasActiveAllowance = (personAllowances) =>
  ALLOWANCE_KEYS.some((key) => isAllowanceActive(personAllowances, key));
