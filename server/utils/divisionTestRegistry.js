/**
 * DepEd 222 Schools Division Offices (SDO) Master Registry for Testing
 * Maps each division to a normalized login handle (<slug>.test) and dedicated test school ID (900001 - 900222).
 */

const DIVISION_LIST = [
  // REGION I (14 Divisions)
  { region: "REGION I", division: "ALAMINOS CITY" },
  { region: "REGION I", division: "BATAC CITY" },
  { region: "REGION I", division: "CANDON CITY" },
  { region: "REGION I", division: "DAGUPAN CITY" },
  { region: "REGION I", division: "ILOCOS NORTE" },
  { region: "REGION I", division: "ILOCOS SUR" },
  { region: "REGION I", division: "LA UNION" },
  { region: "REGION I", division: "LAOAG CITY" },
  { region: "REGION I", division: "PANGASINAN I" },
  { region: "REGION I", division: "PANGASINAN II" },
  { region: "REGION I", division: "SAN CARLOS CITY" },
  { region: "REGION I", division: "SAN FERNANDO CITY" },
  { region: "REGION I", division: "URDANETA CITY" },
  { region: "REGION I", division: "VIGAN CITY" },

  // REGION II (9 Divisions)
  { region: "REGION II", division: "BATANES" },
  { region: "REGION II", division: "CAGAYAN" },
  { region: "REGION II", division: "CAUAYAN CITY" },
  { region: "REGION II", division: "CITY OF ILAGAN" },
  { region: "REGION II", division: "ISABELA" },
  { region: "REGION II", division: "NUEVA VIZCAYA" },
  { region: "REGION II", division: "QUIRINO" },
  { region: "REGION II", division: "SANTIAGO CITY" },
  { region: "REGION II", division: "TUGUEGARAO CITY" },

  // REGION III (20 Divisions)
  { region: "REGION III", division: "ANGELES CITY" },
  { region: "REGION III", division: "AURORA" },
  { region: "REGION III", division: "BALANGA CITY" },
  { region: "REGION III", division: "BATAAN" },
  { region: "REGION III", division: "BULACAN" },
  { region: "REGION III", division: "CABANATUAN CITY" },
  { region: "REGION III", division: "CITY OF SAN FERNANDO" },
  { region: "REGION III", division: "GAPAN CITY" },
  { region: "REGION III", division: "MABALACAT CITY" },
  { region: "REGION III", division: "MALOLOS CITY" },
  { region: "REGION III", division: "MEYCAUAYAN CITY" },
  { region: "REGION III", division: "NUEVA ECIJA" },
  { region: "REGION III", division: "OLONGAPO CITY" },
  { region: "REGION III", division: "PAMPANGA" },
  { region: "REGION III", division: "SAN JOSE CITY" },
  { region: "REGION III", division: "SAN JOSE DEL MONTE CITY" },
  { region: "REGION III", division: "SCIENCE CITY OF MUÑOZ" },
  { region: "REGION III", division: "TARLAC" },
  { region: "REGION III", division: "TARLAC CITY" },
  { region: "REGION III", division: "ZAMBALES" },

  // REGION IV-A (23 Divisions)
  { region: "REGION IV-A", division: "ANTIPOLO CITY" },
  { region: "REGION IV-A", division: "BACOOR CITY" },
  { region: "REGION IV-A", division: "BATANGAS" },
  { region: "REGION IV-A", division: "BATANGAS CITY" },
  { region: "REGION IV-A", division: "BIÑAN CITY" },
  { region: "REGION IV-A", division: "CABUYAO CITY" },
  { region: "REGION IV-A", division: "CALACA CITY" },
  { region: "REGION IV-A", division: "CALAMBA CITY" },
  { region: "REGION IV-A", division: "CARMONA CITY" },
  { region: "REGION IV-A", division: "CAVITE" },
  { region: "REGION IV-A", division: "CAVITE CITY" },
  { region: "REGION IV-A", division: "DASMARIÑAS CITY" },
  { region: "REGION IV-A", division: "GENERAL TRIAS CITY" },
  { region: "REGION IV-A", division: "IMUS CITY" },
  { region: "REGION IV-A", division: "LAGUNA" },
  { region: "REGION IV-A", division: "LIPA CITY" },
  { region: "REGION IV-A", division: "LUCENA CITY" },
  { region: "REGION IV-A", division: "QUEZON" },
  { region: "REGION IV-A", division: "RIZAL" },
  { region: "REGION IV-A", division: "SAN PABLO CITY" },
  { region: "REGION IV-A", division: "SAN PEDRO CITY" },
  { region: "REGION IV-A", division: "STA. ROSA CITY" },
  { region: "REGION IV-A", division: "STO. TOMAS CITY" },
  { region: "REGION IV-A", division: "TANAUAN CITY" },
  { region: "REGION IV-A", division: "TAYABAS CITY" },

  // MIMAROPA / REGION IV-B (7 Divisions)
  { region: "MIMAROPA REGION", division: "CALAPAN CITY" },
  { region: "MIMAROPA REGION", division: "MARINDUQUE" },
  { region: "MIMAROPA REGION", division: "OCCIDENTAL MINDORO" },
  { region: "MIMAROPA REGION", division: "ORIENTAL MINDORO" },
  { region: "MIMAROPA REGION", division: "PALAWAN" },
  { region: "MIMAROPA REGION", division: "PUERTO PRINCESA CITY" },
  { region: "MIMAROPA REGION", division: "ROMBLON" },

  // REGION V (13 Divisions)
  { region: "REGION V", division: "ALBAY" },
  { region: "REGION V", division: "CAMARINES NORTE" },
  { region: "REGION V", division: "CAMARINES SUR" },
  { region: "REGION V", division: "CATANDUANES" },
  { region: "REGION V", division: "IRIGA CITY" },
  { region: "REGION V", division: "LEGASPI CITY" },
  { region: "REGION V", division: "LIGAO CITY" },
  { region: "REGION V", division: "MASBATE" },
  { region: "REGION V", division: "MASBATE CITY" },
  { region: "REGION V", division: "NAGA CITY" },
  { region: "REGION V", division: "SORSOGON" },
  { region: "REGION V", division: "SORSOGON CITY" },
  { region: "REGION V", division: "TABACO CITY" },

  // REGION VI (14 Divisions)
  { region: "REGION VI", division: "AKLAN" },
  { region: "REGION VI", division: "ANTIQUE" },
  { region: "REGION VI", division: "BACOLOD CITY" },
  { region: "REGION VI", division: "BAGO CITY" },
  { region: "REGION VI", division: "CADIZ CITY" },
  { region: "REGION VI", division: "CAPIZ" },
  { region: "REGION VI", division: "ESCALANTE CITY" },
  { region: "REGION VI", division: "GUIMARAS" },
  { region: "REGION VI", division: "HIMAMAYLAN CITY" },
  { region: "REGION VI", division: "ILOILO" },
  { region: "REGION VI", division: "ILOILO CITY" },
  { region: "REGION VI", division: "KABANKALAN CITY" },
  { region: "REGION VI", division: "LA CARLOTA CITY" },
  { region: "REGION VI", division: "NEGROS OCCIDENTAL" },
  { region: "REGION VI", division: "PASSI CITY" },
  { region: "REGION VI", division: "ROXAS CITY" },
  { region: "REGION VI", division: "SAGAY CITY" },
  { region: "REGION VI", division: "SAN CARLOS CITY (NEGROS)" },
  { region: "REGION VI", division: "SILAY CITY" },
  { region: "REGION VI", division: "SIPALAY CITY" },
  { region: "REGION VI", division: "VICTORIAS CITY" },

  // REGION VII (19 Divisions)
  { region: "REGION VII", division: "BAIS CITY" },
  { region: "REGION VII", division: "BAYAWAN CITY" },
  { region: "REGION VII", division: "BOGO CITY" },
  { region: "REGION VII", division: "BOHOL" },
  { region: "REGION VII", division: "CANLAON CITY" },
  { region: "REGION VII", division: "CARCAR CITY" },
  { region: "REGION VII", division: "CEBU" },
  { region: "REGION VII", division: "CEBU CITY" },
  { region: "REGION VII", division: "CITY OF NAGA, CEBU" },
  { region: "REGION VII", division: "DANAO CITY" },
  { region: "REGION VII", division: "DUMAGUETE CITY" },
  { region: "REGION VII", division: "GUIHULNGAN CITY" },
  { region: "REGION VII", division: "LAPU-LAPU CITY" },
  { region: "REGION VII", division: "MANDAUE CITY" },
  { region: "REGION VII", division: "NEGROS ORIENTAL" },
  { region: "REGION VII", division: "SIQUIJOR" },
  { region: "REGION VII", division: "TAGBILARAN CITY" },
  { region: "REGION VII", division: "TALISAY CITY" },
  { region: "REGION VII", division: "TANJAY CITY" },
  { region: "REGION VII", division: "TOLEDO CITY" },

  // REGION VIII (13 Divisions)
  { region: "REGION VIII", division: "BAYBAY CITY" },
  { region: "REGION VIII", division: "BILIRAN" },
  { region: "REGION VIII", division: "BORONGAN CITY" },
  { region: "REGION VIII", division: "CALBAYOG CITY" },
  { region: "REGION VIII", division: "CATBALOGAN CITY" },
  { region: "REGION VIII", division: "EASTERN SAMAR" },
  { region: "REGION VIII", division: "LEYTE" },
  { region: "REGION VIII", division: "MAASIN CITY" },
  { region: "REGION VIII", division: "NORTHERN SAMAR" },
  { region: "REGION VIII", division: "ORMOC CITY" },
  { region: "REGION VIII", division: "SAMAR (WESTERN SAMAR)" },
  { region: "REGION VIII", division: "SOUTHERN LEYTE" },
  { region: "REGION VIII", division: "TACLOBAN CITY" },

  // REGION IX (8 Divisions)
  { region: "REGION IX", division: "DAPITAN CITY" },
  { region: "REGION IX", division: "DIPOLOG CITY" },
  { region: "REGION IX", division: "ISABELA CITY" },
  { region: "REGION IX", division: "PAGADIAN CITY" },
  { region: "REGION IX", division: "ZAMBOANGA CITY" },
  { region: "REGION IX", division: "ZAMBOANGA DEL NORTE" },
  { region: "REGION IX", division: "ZAMBOANGA DEL SUR" },
  { region: "REGION IX", division: "ZAMBOANGA SIBUGAY" },

  // REGION X (14 Divisions)
  { region: "REGION X", division: "BUKIDNON" },
  { region: "REGION X", division: "CAGAYAN DE ORO CITY" },
  { region: "REGION X", division: "CAMIGUIN" },
  { region: "REGION X", division: "EL SALVADOR CITY" },
  { region: "REGION X", division: "GINGOOG CITY" },
  { region: "REGION X", division: "ILIGAN CITY" },
  { region: "REGION X", division: "LANAO DEL NORTE" },
  { region: "REGION X", division: "MALAYBALAY CITY" },
  { region: "REGION X", division: "MISAMIS OCCIDENTAL" },
  { region: "REGION X", division: "MISAMIS ORIENTAL" },
  { region: "REGION X", division: "OROQUIETA CITY" },
  { region: "REGION X", division: "OZAMIZ CITY" },
  { region: "REGION X", division: "TANGUB CITY" },
  { region: "REGION X", division: "VALENCIA CITY" },

  // REGION XI (11 Divisions)
  { region: "REGION XI", division: "DAVAO CITY" },
  { region: "REGION XI", division: "DAVAO DE ORO" },
  { region: "REGION XI", division: "DAVAO DEL NORTE" },
  { region: "REGION XI", division: "DAVAO DEL SUR" },
  { region: "REGION XI", division: "DAVAO OCCIDENTAL" },
  { region: "REGION XI", division: "DAVAO ORIENTAL" },
  { region: "REGION XI", division: "DIGOS CITY" },
  { region: "REGION XI", division: "ISLAND GARDEN CITY OF SAMAL" },
  { region: "REGION XI", division: "MATI CITY" },
  { region: "REGION XI", division: "PANABO CITY" },
  { region: "REGION XI", division: "TAGUM CITY" },

  // REGION XII (8 Divisions)
  { region: "REGION XII", division: "COTABATO" },
  { region: "REGION XII", division: "GENERAL SANTOS CITY" },
  { region: "REGION XII", division: "KIDAPAWAN CITY" },
  { region: "REGION XII", division: "KORONADAL CITY" },
  { region: "REGION XII", division: "SARANGANI" },
  { region: "REGION XII", division: "SOUTH COTABATO" },
  { region: "REGION XII", division: "SULTAN KUDARAT" },
  { region: "REGION XII", division: "TACURONG CITY" },

  // CARAGA / REGION XIII (12 Divisions)
  { region: "REGION XIII", division: "AGUSAN DEL NORTE" },
  { region: "REGION XIII", division: "AGUSAN DEL SUR" },
  { region: "REGION XIII", division: "BAYUGAN CITY" },
  { region: "REGION XIII", division: "BISLIG CITY" },
  { region: "REGION XIII", division: "BUTUAN CITY" },
  { region: "REGION XIII", division: "CABADBARAN CITY" },
  { region: "REGION XIII", division: "DINAGAT ISLANDS" },
  { region: "REGION XIII", division: "SIARGAO" },
  { region: "REGION XIII", division: "SURIGAO CITY" },
  { region: "REGION XIII", division: "SURIGAO DEL NORTE" },
  { region: "REGION XIII", division: "SURIGAO DEL SUR" },
  { region: "REGION XIII", division: "TANDAG CITY" },

  // NCR (16 Divisions)
  { region: "NCR", division: "CALOOCAN CITY" },
  { region: "NCR", division: "CITY OF SAN JUAN" },
  { region: "NCR", division: "LAS PIÑAS CITY" },
  { region: "NCR", division: "MAKATI CITY" },
  { region: "NCR", division: "MALABON CITY" },
  { region: "NCR", division: "MANDALUYONG CITY" },
  { region: "NCR", division: "MANILA" },
  { region: "NCR", division: "MARIKINA CITY" },
  { region: "NCR", division: "MUNTINLUPA CITY" },
  { region: "NCR", division: "NAVOTAS CITY" },
  { region: "NCR", division: "PARAÑAQUE CITY" },
  { region: "NCR", division: "PASAY CITY" },
  { region: "NCR", division: "PASIG CITY" },
  { region: "NCR", division: "QUEZON CITY" },
  { region: "NCR", division: "TAGUIG CITY AND PATEROS" },
  { region: "NCR", division: "VALENZUELA CITY" },

  // CAR (8 Divisions)
  { region: "CAR", division: "ABRA" },
  { region: "CAR", division: "APAYAO" },
  { region: "CAR", division: "BAGUIO CITY" },
  { region: "CAR", division: "BENGUET" },
  { region: "CAR", division: "IFUGAO" },
  { region: "CAR", division: "KALINGA" },
  { region: "CAR", division: "MOUNTAIN PROVINCE" },
  { region: "CAR", division: "TABUK CITY" },

  // BARMM (11 Divisions)
  { region: "BARMM", division: "BASILAN" },
  { region: "BARMM", division: "COTABATO CITY" },
  { region: "BARMM", division: "LANAO DEL SUR I" },
  { region: "BARMM", division: "LANAO DEL SUR II" },
  { region: "BARMM", division: "MAGUINDANAO DEL NORTE" },
  { region: "BARMM", division: "MAGUINDANAO DEL SUR" },
  { region: "BARMM", division: "MARAWI CITY" },
  { region: "BARMM", division: "SPECIAL GEOGRAPHIC AREA" },
  { region: "BARMM", division: "SULU" },
  { region: "BARMM", division: "TAWI-TAWI" },
  { region: "BARMM", division: "LAMITAN CITY" },
];

/**
 * Creates a normalized slug for a region name
 * E.g., 'CAR' -> 'rcar', 'REGION V' -> 'r5', 'NCR' -> 'rncr', 'REGION IV-A' -> 'r4a'
 */
function getRegionSlug(region) {
  const norm = String(region || "")
    .toUpperCase()
    .trim();
  if (norm === "REGION I" || norm === "REGION 1") return "r1";
  if (norm === "REGION II" || norm === "REGION 2") return "r2";
  if (norm === "REGION III" || norm === "REGION 3") return "r3";
  if (norm === "REGION IV-A" || norm === "REGION 4A" || norm === "CALABARZON")
    return "r4a";
  if (
    norm.includes("MIMAROPA") ||
    norm === "REGION IV-B" ||
    norm === "REGION 4B"
  )
    return "r4b";
  if (norm === "REGION V" || norm === "REGION 5") return "r5";
  if (norm === "REGION VI" || norm === "REGION 6") return "r6";
  if (norm === "REGION VII" || norm === "REGION 7") return "r7";
  if (norm === "REGION VIII" || norm === "REGION 8") return "r8";
  if (norm === "REGION IX" || norm === "REGION 9") return "r9";
  if (norm === "REGION X" || norm === "REGION 10") return "r10";
  if (norm === "REGION XI" || norm === "REGION 11") return "r11";
  if (norm === "REGION XII" || norm === "REGION 12" || norm === "SOCCSKSARGEN")
    return "r12";
  if (norm === "REGION XIII" || norm === "REGION 13" || norm === "CARAGA")
    return "r13";
  if (norm === "NCR" || norm === "NATIONAL CAPITAL REGION") return "rncr";
  if (norm === "CAR" || norm === "CORDILLERA ADMINISTRATIVE REGION")
    return "rcar";
  if (norm === "BARMM" || norm === "BANGSAMORO") return "rbarmm";
  return "r" + toSlug(norm);
}

/**
 * Creates a normalized slug for a division name
 * E.g., 'LEGASPI CITY' -> 'legaspicity', 'CEBU CITY' -> 'cebucity', 'ALBAY' -> 'albay'
 */
function toSlug(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents (e.g. ñ -> n)
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Extracts multiple search tokens and aliases for a division name
 */
function getDivisionAliases(divisionName) {
  const raw = String(divisionName || "").toUpperCase();
  const slugs = new Set();

  // Full slug (e.g. 'cityofnagacebu')
  slugs.add(toSlug(raw));

  // Stripped parentheticals and qualifiers: remove '(...)', ', ...'
  const cleaned = raw
    .replace(/\([^)]*\)/g, "")
    .replace(/,[^,]*$/g, "")
    .trim();
  slugs.add(toSlug(cleaned)); // e.g. 'cityofnaga'

  // Strip 'CITY OF ' and ' CITY'
  const withoutCity = cleaned
    .replace(/^CITY\s+OF\s+/i, "")
    .replace(/\s+CITY$/i, "")
    .trim();
  slugs.add(toSlug(withoutCity)); // e.g. 'naga'
  slugs.add(toSlug(withoutCity) + "city"); // e.g. 'nagacity'
  slugs.add("cityof" + toSlug(withoutCity)); // e.g. 'cityofnaga'

  // Special handling for acronyms or combined names
  if (raw.includes("TAGUIG") && raw.includes("PATEROS")) {
    slugs.add("taguig");
    slugs.add("taguigpateros");
    slugs.add("taguigcityandpateros");
  }
  if (raw.includes("SAMAL")) {
    slugs.add("samal");
    slugs.add("igacos");
    slugs.add("islandgardencityofsamal");
  }
  if (raw.includes("MUÑOZ") || raw.includes("MUNOZ")) {
    slugs.add("munoz");
    slugs.add("sciencecityofmunoz");
  }
  if (raw.includes("DAVAO DE ORO")) {
    slugs.add("davaodeoro");
    slugs.add("comval");
    slugs.add("compostelavalley");
  }
  if (raw.includes("SPECIAL GEOGRAPHIC AREA")) {
    slugs.add("sga");
    slugs.add("specialgeographicarea");
  }

  return Array.from(slugs).filter(Boolean);
}

// Build the fully resolved 230 division test accounts registry (1 Division = 1 Account)
const TEST_DIVISIONS = DIVISION_LIST.map((item, index) => {
  const schoolId = String(900001 + index);
  const rSlug = getRegionSlug(item.region);
  const aliases = getDivisionAliases(item.division);
  const primarySlug =
    aliases[aliases.length - 2] || aliases[0] || toSlug(item.division);
  const handle = `${rSlug}.${primarySlug}.test`;
  const schoolName = `${item.division.toUpperCase()} DEMONSTRATION SCHOOL`;

  return {
    index: index + 1,
    schoolId,
    region: item.region,
    division: item.division.toUpperCase(),
    rSlug,
    dSlug: toSlug(item.division),
    aliases,
    handle,
    schoolName,
  };
});

// 6 DepEd MCOC Archetype Test Accounts (900223 - 900229)
const MCOC_ARCHETYPES = [
  {
    schoolId: "900223",
    mcoc: "PURELY ES",
    curricularOffering: "Purely ES",
    division: "MCOC PURE ELEMENTARY",
    region: "REGION V",
    handle: "mcoc.elem.test",
    shortHandle: "mcoc.es.test",
    aliases: ["elem", "es", "purees", "purelyes"],
    schoolName: "MABINI ELEMENTARY SCHOOL (PURE ES)",
  },
  {
    schoolId: "900224",
    mcoc: "PURELY JHS",
    curricularOffering: "Purely JHS",
    division: "MCOC PURE JUNIOR HIGH",
    region: "REGION V",
    handle: "mcoc.jhs.test",
    shortHandle: "mcoc.jhs",
    aliases: ["jhs", "purejhs", "purelyjhs"],
    schoolName: "RIZAL MEMORIAL JUNIOR HIGH SCHOOL (PURE JHS)",
  },
  {
    schoolId: "900225",
    mcoc: "PURELY SHS",
    curricularOffering: "Purely SHS",
    division: "MCOC PURE SENIOR HIGH",
    region: "REGION V",
    handle: "mcoc.shs.test",
    shortHandle: "mcoc.shs",
    aliases: ["shs", "pureshs", "purelyshs"],
    schoolName: "ALBAY NATIONAL SENIOR HIGH SCHOOL (PURE SHS)",
  },
  {
    schoolId: "900226",
    mcoc: "INTEGRATED (K-10)",
    curricularOffering: "Elementary + JHS",
    division: "MCOC INTEGRATED SCHOOL",
    region: "REGION V",
    handle: "mcoc.integrated.test",
    shortHandle: "mcoc.is.test",
    aliases: ["integrated", "is", "k10"],
    schoolName: "DARAGA INTEGRATED MEMORIAL SCHOOL (K-10)",
  },
  {
    schoolId: "900227",
    mcoc: "MULTIGRADE ES",
    curricularOffering: "Multigrade ES",
    division: "MCOC MULTIGRADE SCHOOL",
    region: "REGION V",
    handle: "mcoc.multigrade.test",
    shortHandle: "mcoc.mg.test",
    aliases: ["multigrade", "mg"],
    schoolName: "SAN ISIDRO MULTIGRADE SCHOOL (MG ES)",
  },
  {
    schoolId: "900228",
    mcoc: "K TO 12 COMPREHENSIVE",
    curricularOffering: "Comprehensive (K-12)",
    division: "MCOC K-12 COMPREHENSIVE",
    region: "REGION V",
    handle: "mcoc.k12.test",
    shortHandle: "mcoc.complete.test",
    aliases: ["k12", "complete", "comprehensive"],
    schoolName: "BICOL REGIONAL COMPREHENSIVE HIGH SCHOOL (K-12)",
  },
  {
    schoolId: "900229",
    mcoc: "SPECIAL INCLUSIVE (SNED/ALS)",
    curricularOffering: "Special Inclusive Education",
    division: "MCOC INCLUSIVE SNED ALS",
    region: "REGION V",
    handle: "mcoc.inclusive.test",
    shortHandle: "mcoc.sned.test",
    aliases: ["inclusive", "sned", "als", "sped"],
    schoolName: "ALBAY SPECIAL EDUCATION & INCLUSIVE CENTER",
  },
  {
    schoolId: "900230",
    mcoc: "ALL OFFERING",
    curricularOffering: "All Offerings (ES + JHS + SHS + Inclusive)",
    division: "MCOC ALL OFFERINGS",
    region: "REGION V",
    handle: "mcoc.all.test",
    shortHandle: "mcoc.all",
    aliases: [
      "all",
      "allofferings",
      "alloffering",
      "mega",
      "full",
      "alloffer",
      "alloff",
    ],
    schoolName: "BICOL NATIONAL COMPREHENSIVE SCHOOL (ALL OFFERINGS)",
  },
];

// Combine all test accounts
const ALL_TEST_ACCOUNTS = [...TEST_DIVISIONS, ...MCOC_ARCHETYPES];

// Lookup map by handle and schoolId
const HANDLE_MAP = new Map();
const SCHOOL_ID_MAP = new Map();

for (const entry of ALL_TEST_ACCOUNTS) {
  // 1. Primary canonical handle (e.g. 'r5.naga.test', 'r7.naga.test', 'mcoc.elem.test')
  HANDLE_MAP.set(entry.handle.toLowerCase(), entry);
  HANDLE_MAP.set(entry.handle.toLowerCase().replace(/\.test$/i, ""), entry);

  // 2. Short alias if available (e.g. 'mcoc.es.test')
  if (entry.shortHandle) {
    HANDLE_MAP.set(entry.shortHandle.toLowerCase(), entry);
    HANDLE_MAP.set(
      entry.shortHandle.toLowerCase().replace(/\.test$/i, ""),
      entry,
    );
  }

  // 3. Register all computed aliases for this region (e.g. 'r7.naga.test', 'r7.nagacity.test', 'r7.cityofnagacebu.test')
  if (Array.isArray(entry.aliases) && entry.rSlug) {
    for (const alias of entry.aliases) {
      const aliasHandle = `${entry.rSlug}.${alias}.test`;
      HANDLE_MAP.set(aliasHandle.toLowerCase(), entry);
      HANDLE_MAP.set(aliasHandle.toLowerCase().replace(/\.test$/i, ""), entry);
    }
  }

  // 4. Standalone slug if unique
  if (entry.dSlug && !HANDLE_MAP.has(`${entry.dSlug}.test`)) {
    HANDLE_MAP.set(`${entry.dSlug}.test`, entry);
    HANDLE_MAP.set(entry.dSlug, entry);
  }

  // 5. Map School ID
  SCHOOL_ID_MAP.set(entry.schoolId, entry);
}

/**
 * Resolves any test login identifier (e.g., 'rcar.benguet.test', 'r7.naga.test', 'r5.naga.test', 'mcoc.elem.test', '900223')
 */
function resolveTestDivision(identifier) {
  if (!identifier) return null;
  const clean = String(identifier)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ".");

  if (HANDLE_MAP.has(clean)) return HANDLE_MAP.get(clean);
  if (SCHOOL_ID_MAP.has(clean)) return SCHOOL_ID_MAP.get(clean);

  const withoutTest = clean.replace(/\.test$/i, "");
  if (HANDLE_MAP.has(withoutTest)) return HANDLE_MAP.get(withoutTest);

  // Try normalized slug format
  const parts = withoutTest.split(".");
  if (parts.length >= 2) {
    const rPart = parts[0];
    const dPart = toSlug(parts.slice(1).join(""));

    const directTestHandle = `${rPart}.${dPart}.test`;
    if (HANDLE_MAP.has(directTestHandle))
      return HANDLE_MAP.get(directTestHandle);

    // Smart region-scoped fuzzy match: find any division in this region whose aliases or dSlug contain dPart
    for (const entry of ALL_TEST_ACCOUNTS) {
      if (entry.rSlug === rPart || getRegionSlug(entry.region) === rPart) {
        if (entry.aliases && entry.aliases.includes(dPart)) return entry;
        if (
          entry.dSlug &&
          (entry.dSlug.includes(dPart) || dPart.includes(entry.dSlug))
        )
          return entry;
        const normDiv = toSlug(entry.division);
        if (normDiv.includes(dPart) || dPart.includes(normDiv)) return entry;
      }
    }
  }

  return null;
}

function isTestDivisionSchoolId(schoolId) {
  const num = parseInt(schoolId, 10);
  return num >= 900001 && num <= 900300;
}

module.exports = {
  DIVISION_LIST,
  TEST_DIVISIONS,
  MCOC_ARCHETYPES,
  ALL_TEST_ACCOUNTS,
  resolveTestDivision,
  isTestDivisionSchoolId,
  getRegionSlug,
  toSlug,
};
