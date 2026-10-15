// Which person is reported as the school head (reports, SF7, Validation Center). Used by the client.
// Precedence: the school head designated in the roster ALWAYS wins; the SDO-supplied OIC record
// (esf7_school_head_sdo) is only used when the roster has no designated head.
export const isRosterSchoolHead = (p) =>
  Boolean(p) &&
  (p.isSchoolHead === true ||
    p.is_school_head === true ||
    p.isSchoolHead === "true" ||
    p.is_school_head === "true");

export const isMainSchoolHead = (p) =>
  Boolean(p) &&
  isRosterSchoolHead(p) &&
  (p.isMainSchoolHead === true ||
    p.is_main_school_head === true ||
    p.is_main_sh === true ||
    p.isMainSchoolHead === "true" ||
    p.is_main_school_head === "true" ||
    p.is_main_sh === "true");

export const findRosterSchoolHead = (personnel) => {
  const heads = (personnel || []).filter(isRosterSchoolHead);
  if (heads.length === 0) return null;
  const main = heads.find(isMainSchoolHead);
  return main || heads[0];
};

export const findAllRosterSchoolHeads = (personnel) =>
  (personnel || []).filter(isRosterSchoolHead);

/**
 * Determines educational levels offered by the school based on school_iern.mcoc
 * or curricularOffering array.
 * @param {string} mcoc - Modified Curricular Offering Classification (from school_iern.mcoc)
 * @param {Array|string} curricularOffering - Fallback curricular offering array
 * @returns {Array<string>} List of educational levels (e.g. ['Elementary'], ['Elementary', 'Junior High School'], etc.)
 */
export function getEducationalLevelsFromMCOC(mcoc, curricularOffering) {
  const s = String(mcoc || "")
    .toUpperCase()
    .trim();

  // 1. Check for 3 levels (All Offering / K-12)
  if (
    s.includes("ALL OFFERING") ||
    s.includes("K TO 12") ||
    s.includes("K-12") ||
    s.includes("COMPREHENSIVE") ||
    ((s.includes("ELEM") ||
      s.includes("ES") ||
      s.includes("PRIMARY") ||
      s.includes("KINDER")) &&
      (s.includes("JHS") || s.includes("JUNIOR")) &&
      (s.includes("SHS") || s.includes("SENIOR")))
  ) {
    return ["Elementary", "Junior High School", "Senior High School"];
  }

  // 2. Check for 2 levels: Elementary + JHS
  if (
    s.includes("ES AND JHS") ||
    s.includes("K TO 10") ||
    s.includes("K-10") ||
    s.includes("ELEMENTARY AND JUNIOR HIGH") ||
    s.includes("ELEMENTARY + JHS") ||
    ((s.includes("ELEM") || s.includes("ES") || s.includes("PRIMARY")) &&
      (s.includes("JHS") || s.includes("JUNIOR")) &&
      !s.includes("SHS") &&
      !s.includes("SENIOR"))
  ) {
    return ["Elementary", "Junior High School"];
  }

  // 3. Check for 2 levels: JHS + SHS
  if (
    s.includes("JHS WITH SHS") ||
    s.includes("JHS AND SHS") ||
    s.includes("JUNIOR HIGH AND SENIOR HIGH") ||
    s.includes("JUNIOR HIGH & SENIOR HIGH") ||
    s.includes("7 TO 12") ||
    s.includes("7-12") ||
    ((s.includes("JHS") || s.includes("JUNIOR")) &&
      (s.includes("SHS") || s.includes("SENIOR")) &&
      !s.includes("ELEM") &&
      !s.includes("ES"))
  ) {
    return ["Junior High School", "Senior High School"];
  }

  // 4. Check for 2 levels: Elementary + SHS (rare)
  if (
    (s.includes("ELEM") || s.includes("ES")) &&
    (s.includes("SHS") || s.includes("SENIOR")) &&
    !s.includes("JHS") &&
    !s.includes("JUNIOR")
  ) {
    return ["Elementary", "Senior High School"];
  }

  // 5. Check for 1 level: Purely Elementary
  if (
    s.includes("PURELY ELEMENTARY") ||
    s.includes("PURELY KINDERGARTEN") ||
    s.includes("PURELY ES") ||
    s === "ELEMENTARY" ||
    s === "ES"
  ) {
    return ["Elementary"];
  }

  // 6. Check for 1 level: Purely Junior High School
  if (
    s.includes("PURELY JUNIOR") ||
    s.includes("PURELY JHS") ||
    s === "JUNIOR HIGH SCHOOL" ||
    s === "JHS"
  ) {
    return ["Junior High School"];
  }

  // 7. Check for 1 level: Purely Senior High School
  if (
    s.includes("PURELY SENIOR") ||
    s.includes("PURELY SHS") ||
    s === "SENIOR HIGH SCHOOL" ||
    s === "SHS"
  ) {
    return ["Senior High School"];
  }

  // Fallback to curricularOffering if mcoc wasn't definitive
  const list = Array.isArray(curricularOffering)
    ? curricularOffering.map((x) => String(x).toUpperCase().trim())
    : typeof curricularOffering === "string"
      ? curricularOffering.split(",").map((x) => x.toUpperCase().trim())
      : [];

  const hasElem = list.some(
    (x) => x.includes("ELEM") || x.includes("ES") || x.includes("KINDER"),
  );
  const hasJhs = list.some(
    (x) => x.includes("JHS") || x.includes("JUNIOR") || x.includes("SEC"),
  );
  const hasShs = list.some((x) => x.includes("SHS") || x.includes("SENIOR"));

  if (hasElem && hasJhs && hasShs) {
    return ["Elementary", "Junior High School", "Senior High School"];
  }
  if (hasElem && hasJhs) {
    return ["Elementary", "Junior High School"];
  }
  if (hasJhs && hasShs) {
    return ["Junior High School", "Senior High School"];
  }
  if (hasElem && hasShs) {
    return ["Elementary", "Senior High School"];
  }
  if (hasJhs) {
    return ["Junior High School"];
  }
  if (hasShs) {
    return ["Senior High School"];
  }

  return ["Elementary"];
}

/** Returns { source: 'roster' | 'sdo', person?, name, positionTitle, email } or null when neither exists. */
export function resolveSchoolHead(personnel, sdoRecord) {
  const head = findRosterSchoolHead(personnel);
  if (head) {
    const mid =
      head.middleName && !["N/A", "NONE"].includes(head.middleName)
        ? ` ${head.middleName.charAt(0)}.`
        : "";
    return {
      source: "roster",
      person: head,
      name: `${head.lastName || ""}, ${head.firstName || ""}${mid}`.toUpperCase(),
      positionTitle: head.position || head.plantilla_position || "",
      email: head.depedEmail || head.deped_email || "",
    };
  }
  if (sdoRecord && sdoRecord.name) {
    return {
      source: "sdo",
      person: null,
      name: String(sdoRecord.name).toUpperCase(),
      positionTitle: sdoRecord.positionTitle || "",
      email: sdoRecord.email || "",
    };
  }
  return null;
}
