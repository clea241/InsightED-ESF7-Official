// Date columns (DATE type) must receive a real date or NULL. Forms and old imports leave text like "N/A" in them.
// coerceDateField: placeholder/blank -> null, valid date -> 'YYYY-MM-DD', anything else -> 422 naming the field.

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

const isDatePlaceholder = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && PLACEHOLDERS.has(value.trim().toUpperCase()));

function coerceDateField(value, field) {
  if (isDatePlaceholder(value)) return null;
  const fail = () => {
    const err = new Error(
      `Invalid date for "${field}": "${String(value).slice(0, 40)}". Use YYYY-MM-DD or leave it blank.`,
    );
    err.status = 422;
    err.field = field;
    return err;
  };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw fail();
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (
      Number.isNaN(d.getTime()) ||
      d.toISOString().slice(0, 10) !== `${iso[1]}-${iso[2]}-${iso[3]}`
    )
      throw fail();
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const iso2 = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    const d = new Date(`${iso2}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso2)
      throw fail();
    return iso2;
  }
  throw fail();
}

module.exports = { coerceDateField, isDatePlaceholder };
