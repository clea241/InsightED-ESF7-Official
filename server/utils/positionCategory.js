/**
 * Canonical DepEd Position Categories for Electronic School Form 7 (eSF7).
 * Single source of truth across client, server, and database.
 */

const ALLOWED_POSITION_CATEGORIES = Object.freeze([
  "TEACHING",
  "RELATED TEACHING",
  "NON-TEACHING",
]);

const POSITION_CATEGORY_OPTIONS = Object.freeze([
  { value: "TEACHING", label: "TEACHING PERSONNEL", type: "teaching" },
  {
    value: "RELATED TEACHING",
    label: "RELATED TEACHING PERSONNEL",
    type: "teaching-related",
  },
  {
    value: "NON-TEACHING",
    label: "NON-TEACHING PERSONNEL",
    type: "non-teaching",
  },
]);

/**
 * Normalizes any category, type, or position variation to the canonical
 * position category ('TEACHING' | 'RELATED TEACHING' | 'NON-TEACHING').
 * Returns null if the category is invalid and cannot be resolved.
 */
function normalizePositionCategory(rawCategory, fallbackPosition = "") {
  if (rawCategory !== undefined && rawCategory !== null) {
    const raw = String(rawCategory).trim();
    if (raw) {
      const upper = raw.toUpperCase();

      // Exact matches
      if (upper === "TEACHING" || upper === "TEACHING PERSONNEL") {
        return "TEACHING";
      }
      if (
        upper === "RELATED TEACHING" ||
        upper === "TEACHING-RELATED" ||
        upper === "TEACHING_RELATED" ||
        upper === "TEACHING RELATED" ||
        upper === "RELATED TEACHING PERSONNEL" ||
        upper === "RELATED"
      ) {
        return "RELATED TEACHING";
      }
      if (
        upper === "NON-TEACHING" ||
        upper === "NON_TEACHING" ||
        upper === "NON TEACHING" ||
        upper === "NON-TEACHING PERSONNEL" ||
        upper === "NONTEACHING"
      ) {
        return "NON-TEACHING";
      }

      // Lowercase code values
      const lower = raw.toLowerCase();
      if (lower === "teaching") return "TEACHING";
      if (
        lower === "teaching-related" ||
        lower === "teaching_related" ||
        lower === "related"
      ) {
        return "RELATED TEACHING";
      }
      if (lower === "non-teaching" || lower === "non_teaching") {
        return "NON-TEACHING";
      }

      // Pattern matching
      if (upper.includes("NON")) return "NON-TEACHING";
      if (upper.includes("RELATED")) return "RELATED TEACHING";
      if (upper.includes("TEACH")) return "TEACHING";

      // If a non-empty string was provided that does NOT match any category:
      return null;
    }
  }

  // Fallback to position keyword if provided
  if (fallbackPosition) {
    const pos = String(fallbackPosition).trim().toUpperCase();
    if (pos === "COOK" || pos.includes("COOK")) return "NON-TEACHING";
    if (
      pos.includes("ADMINISTRATIVE") ||
      pos.includes("ADAS") ||
      pos.includes("ADA ") ||
      pos.includes("UTILITY") ||
      pos.includes("CLERK") ||
      pos.includes("GUARD") ||
      pos.includes("NURSE")
    ) {
      return "NON-TEACHING";
    }
    if (
      pos.includes("PRINCIPAL") ||
      pos.includes("HEAD TEACHER") ||
      pos.includes("SUPERVISOR") ||
      pos.includes("GUIDANCE") ||
      pos.includes("LIBRARIAN")
    ) {
      return "RELATED TEACHING";
    }
    if (pos.includes("TEACHER")) {
      return "TEACHING";
    }
  }

  return null;
}

function isValidPositionCategory(cat) {
  return ALLOWED_POSITION_CATEGORIES.includes(cat);
}

function formatInvalidCategoryMessage(invalidVal) {
  return `Invalid position category "${invalidVal}". Allowed options are: ${ALLOWED_POSITION_CATEGORIES.join(", ")}.`;
}

module.exports = {
  ALLOWED_POSITION_CATEGORIES,
  POSITION_CATEGORY_OPTIONS,
  normalizePositionCategory,
  isValidPositionCategory,
  formatInvalidCategoryMessage,
};
