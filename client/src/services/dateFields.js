// Date columns on the personnel record must be a real date or null. Old imports and forms leave text like "N/A" in
// them, which the database rejects ("invalid input syntax for type date"). Mirrors server/utils/dateInput.js.
const PLACEHOLDERS = new Set([
  "",
  "N/A",
  "NA",
  "N.A.",
  "NONE",
  "NULL",
  "UNDEFINED",
  "-",
  "--",
  "—",
  "NOT APPLICABLE",
  "TBD",
]);

export const isDatePlaceholder = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === "string" && PLACEHOLDERS.has(v.trim().toUpperCase()));

// Employment dates: a placeholder becomes null. Birthdate: a placeholder is left out so the stored date is kept.
const EMPLOYMENT_DATE_KEYS = [
  "first_service_date",
  "firstServiceDate",
  "last_promotion_date",
  "lastPromotionDate",
  "new_station_date",
  "newStationDate",
  "last_lateral_movement_date",
  "lastLateralMovementDate",
];
const BIRTHDATE_KEYS = ["birthdate"];

export function cleanPersonnelDates(person) {
  if (!person || typeof person !== "object") return person;
  const out = { ...person };
  for (const k of EMPLOYMENT_DATE_KEYS)
    if (k in out && isDatePlaceholder(out[k])) out[k] = null;
  for (const k of BIRTHDATE_KEYS)
    if (
      k in out &&
      typeof out[k] === "string" &&
      isDatePlaceholder(out[k]) &&
      out[k].trim() !== ""
    )
      delete out[k];
  return out;
}
