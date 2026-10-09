import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import useDirtyGuard from "../hooks/useDirtyGuard";
import { confirmServerDraftSaved } from "../services/screenSave";
import {
  useApp,
  OFFICIAL_DESIGNATIONS,
  DESIGNATION_GRADE_LEVELS,
  SHS_TRACKS,
  SUBJECT_OPTIONS,
  PRIMARY_LEARNING_AREAS,
  getRegularSectionsEnrollment,
} from "../context/AppContext";
import SearchableDropdown from "../components/SearchableDropdown";
import PortalHeader from "../components/PortalHeader";
import { requiresDepartmentHead } from "@shared/schoolLevel.js";
import {
  FiCheckCircle,
  FiAlertCircle,
  FiCheck,
  FiShield,
  FiFileText,
  FiFolder,
  FiUsers,
  FiUser,
  FiSearch,
  FiTag,
  FiBook,
  FiGrid,
  FiList,
  FiTrash2,
  FiX,
  FiPlus,
  FiBookmark,
  FiAward,
  FiLayers,
  FiChevronRight,
  FiCheckSquare,
  FiSquare,
  FiGlobe,
  FiTool,
  FiMusic,
  FiHeart,
  FiZap,
  FiCompass,
  FiSettings,
  FiBookOpen,
  FiMonitor,
  FiTarget,
  FiSmile,
  FiLock,
} from "react-icons/fi";

// KEY STAGE DEFINITIONS & CONSTANTS
export const KS1_CANONICAL_GRADES = ["Kinder", "Grade 1", "Grade 2", "Grade 3"];

export const KS2_LEARNING_AREAS = [
  {
    id: "english",
    name: "English",
    altNames: ["ENGLISH"],
    icon: <FiBook size={14} color="#0284C7" />,
  },
  {
    id: "filipino",
    name: "Filipino",
    altNames: ["FILIPINO"],
    icon: <FiFileText size={14} color="#4F46E5" />,
  },
  {
    id: "mathematics",
    name: "Mathematics",
    altNames: ["MATHEMATICS", "MATH"],
    icon: <FiCompass size={14} color="#D97706" />,
  },
  {
    id: "science",
    name: "Science",
    altNames: ["SCIENCE"],
    icon: <FiZap size={14} color="#0D9488" />,
  },
  {
    id: "araling_panlipunan",
    name: "Araling Panlipunan",
    altNames: ["ARALING PANLIPUNAN", "AP"],
    icon: <FiGlobe size={14} color="#059669" />,
  },
  {
    id: "epp_tle",
    name: "EPP / TLE",
    altNames: ["EPP / TLE", "EPP/TLE", "EPP", "TLE", "TLE / TVL", "TVL"],
    icon: <FiTool size={14} color="#EA580C" />,
  },
  {
    id: "mapeh",
    name: "MAPEH",
    altNames: ["MAPEH", "MUSIC", "ARTS", "PE", "HEALTH"],
    icon: <FiMusic size={14} color="#E11D48" />,
  },
  {
    id: "gmrc_values",
    name: "GMRC / Values Education",
    altNames: [
      "GMRC / VALUES EDUCATION",
      "GMRC",
      "VALUES EDUCATION",
      "ESP",
      "EDUKASYON SA PAGPAPAKATAO",
    ],
    icon: <FiHeart size={14} color="#7C3AED" />,
  },
];

export const KS3_LEARNING_AREAS = [
  {
    id: "english",
    name: "English",
    altNames: ["ENGLISH"],
    icon: <FiBook size={14} color="#0284C7" />,
  },
  {
    id: "filipino",
    name: "Filipino",
    altNames: ["FILIPINO"],
    icon: <FiFileText size={14} color="#4F46E5" />,
  },
  {
    id: "mathematics",
    name: "Mathematics",
    altNames: ["MATHEMATICS", "MATH"],
    icon: <FiCompass size={14} color="#D97706" />,
  },
  {
    id: "science",
    name: "Science",
    altNames: ["SCIENCE"],
    icon: <FiZap size={14} color="#0D9488" />,
  },
  {
    id: "araling_panlipunan",
    name: "Araling Panlipunan",
    altNames: ["ARALING PANLIPUNAN", "AP"],
    icon: <FiGlobe size={14} color="#059669" />,
  },
  {
    id: "tle_tvl",
    name: "TLE / TVL",
    altNames: ["TLE / TVL", "TLE/TVL", "TLE", "TVL", "EPP / TLE", "EPP"],
    icon: <FiSettings size={14} color="#EA580C" />,
  },
  {
    id: "mapeh",
    name: "MAPEH",
    altNames: ["MAPEH", "MUSIC", "ARTS", "PE", "HEALTH"],
    icon: <FiMusic size={14} color="#E11D48" />,
  },
  {
    id: "values_ed",
    name: "Values Education / EsP",
    altNames: [
      "VALUES EDUCATION / ESP",
      "VALUES EDUCATION",
      "ESP",
      "EDUKASYON SA PAGPAPAKATAO",
      "GMRC / VALUES EDUCATION",
      "GMRC",
    ],
    icon: <FiHeart size={14} color="#7C3AED" />,
  },
];

export const KS4_TRACKS_LIST = [
  {
    id: "academic",
    name: "Academic Track",
    key: "DEPARTMENT HEAD - KEY STAGE 4 - ACADEMIC TRACK",
    altKeys: [
      "DEPARTMENT HEAD - KEY STAGE 4 - ACADEMIC TRACK",
      "DEPARTMENT HEAD - ACADEMIC TRACK",
      "DEPARTMENT HEAD - SHS ACADEMIC",
    ],
    icon: <FiBookOpen size={16} color="#6D28D9" />,
    description:
      "Oversees Senior High School Academic strands (STEM, ABM, HUMSS, GAS).",
  },
  {
    id: "tech_pro",
    name: "Tech-Pro Track",
    key: "DEPARTMENT HEAD - KEY STAGE 4 - TECH-PRO TRACK",
    altKeys: [
      "DEPARTMENT HEAD - KEY STAGE 4 - TECH-PRO TRACK",
      "DEPARTMENT HEAD - TECH-PRO TRACK",
      "DEPARTMENT HEAD - TVL TRACK",
      "DEPARTMENT HEAD - TECHNICAL-PROFESSIONAL TRACK",
    ],
    icon: <FiTool size={16} color="#0D9488" />,
    description:
      "Oversees Technical-Professional / TVL skills specialization strands and certifications.",
  },
];

export const parseKS1GradesFromKey = (keyStr) => {
  if (!keyStr) return [];
  const upper = String(keyStr).toUpperCase();
  if (!upper.includes("DEPARTMENT HEAD")) return [];

  // Full KS1
  if (
    upper.includes("KINDER - GRADE 3") ||
    upper.includes("KINDER TO GRADE 3") ||
    upper === "DEPARTMENT HEAD - KEY STAGE 1" ||
    upper === "DEPARTMENT HEAD - KS1"
  ) {
    return ["Kinder", "Grade 1", "Grade 2", "Grade 3"];
  }

  const detected = [];
  if (upper.includes("KINDER")) detected.push("Kinder");
  if (upper.includes("GRADE 1") || upper.includes("G1"))
    detected.push("Grade 1");
  if (upper.includes("GRADE 2") || upper.includes("G2"))
    detected.push("Grade 2");
  if (upper.includes("GRADE 3") || upper.includes("G3"))
    detected.push("Grade 3");

  return detected.length > 0
    ? detected
    : ["Kinder", "Grade 1", "Grade 2", "Grade 3"];
};

export default function Designations() {
  const {
    personnel,
    setPersonnel,
    savePersonnelChanges,
    schoolEdited,
    schoolInfo,
    setSchoolInfo,
    classSections,
    showToast,
    completeNode,
    setActiveView,
  } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState("card"); // 'card' or 'matrix'
  const [activeKsTab, setActiveKsTab] = useState("all"); // 'all', 'ks1', 'ks2', 'ks3', 'ks4'

  const savedDesignationsSnapshotRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);

  // N/A Map State for Mandatory Designations (persisted in raw_payload and localStorage)
  const [designationsNaMap, setDesignationsNaMap] = useState(() => {
    const fromRaw = schoolInfo?.raw_payload?.designations_na;
    if (fromRaw && typeof fromRaw === "object") return fromRaw;
    const fromDirect = schoolInfo?.designations_na;
    if (fromDirect && typeof fromDirect === "object") return fromDirect;
    try {
      const saved = localStorage.getItem(
        `esf7_designations_na_${schoolInfo?.schoolId || "default"}`,
      );
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const getDesignationsSnapshot = useCallback(
    () => ({
      personnel: (personnel || []).map((p) => ({
        id: p.id,
        prn: p.prn,
        designation:
          typeof p.designation === "string"
            ? p.designation
            : p.designation?.name || p.designation?.designation || "",
        designations: Array.isArray(p.designations)
          ? p.designations.map((d) =>
              typeof d === "string"
                ? d
                : d?.name || d?.designation || d?.title || "",
            )
          : [],
      })),
      naMap: { ...(designationsNaMap || {}) },
    }),
    [personnel, designationsNaMap],
  );

  useEffect(() => {
    if (
      savedDesignationsSnapshotRef.current === null &&
      personnel &&
      personnel.length > 0
    ) {
      savedDesignationsSnapshotRef.current = JSON.stringify(
        getDesignationsSnapshot(),
      );
    }
  }, [personnel, getDesignationsSnapshot]);

  const currentSnapshotStr = useMemo(
    () => JSON.stringify(getDesignationsSnapshot()),
    [getDesignationsSnapshot],
  );
  const isDirty = Boolean(
    savedDesignationsSnapshotRef.current &&
    currentSnapshotStr !== savedDesignationsSnapshotRef.current,
  );

  const handleDiscard = () => {
    if (savedDesignationsSnapshotRef.current) {
      try {
        const snap = JSON.parse(savedDesignationsSnapshotRef.current);
        if (Array.isArray(snap.personnel)) {
          const snapMap = new Map(
            snap.personnel.map((sp) => [String(sp.id), sp]),
          );
          setPersonnel((prev) =>
            (prev || []).map((p) => {
              const saved = snapMap.get(String(p.id));
              if (saved) {
                return {
                  ...p,
                  designation: saved.designation,
                  designations: saved.designations,
                };
              }
              return p;
            }),
          );
        }
        if (snap.naMap) {
          setDesignationsNaMap(snap.naMap);
        }
      } catch (e) {
        console.warn("Error discarding designations changes:", e);
      }
    }
  };

  const runSaveRef = useRef(() => Promise.resolve({ ok: true })); // the page's one save, shared with the unsaved-changes dialog
  useDirtyGuard({
    screenId: "designations",
    isDirty,
    onDiscard: handleDiscard,
    onSave: () => runSaveRef.current(),
  });

  // Key Stage 1 Checklist Assignment Form State
  const [ks1SelectedTeacherId, setKs1SelectedTeacherId] = useState("");
  const [ks1CheckedGrades, setKs1CheckedGrades] = useState([]);
  const [showKs1AssignForm, setShowKs1AssignForm] = useState(false);

  // Dynamic enrollment calculation from regular sections
  const regularEnrollment = useMemo(() => {
    return getRegularSectionsEnrollment(classSections);
  }, [classSections]);

  const isAshRequired = regularEnrollment >= 1001;

  // Modal State for Confirming N/A (requires user to type "CONFIRM")
  const [naConfirmModal, setNaConfirmModal] = useState({
    isOpen: false,
    roleId: "",
    roleName: "",
    inputVal: "",
  });

  const updateDesignationsNa = (newMap) => {
    setDesignationsNaMap(newMap);
    try {
      localStorage.setItem(
        `esf7_designations_na_${schoolInfo?.schoolId || "default"}`,
        JSON.stringify(newMap),
      );
    } catch (e) {}
    if (setSchoolInfo) {
      setSchoolInfo((prev) => {
        const prevRaw =
          prev?.raw_payload && typeof prev.raw_payload === "object"
            ? prev.raw_payload
            : {};
        return {
          ...prev,
          designations_na: newMap,
          raw_payload: {
            ...prevRaw,
            designations_na: newMap,
          },
        };
      });
    }
  };

  const handleOpenNaModal = (roleId, roleName) => {
    setNaConfirmModal({
      isOpen: true,
      roleId,
      roleName,
      inputVal: "",
    });
  };

  const handleConfirmNa = () => {
    if (naConfirmModal.inputVal.trim() !== "CONFIRM") {
      showToast(
        'Please type "CONFIRM" in exact uppercase to proceed.',
        "error",
      );
      return;
    }
    const newMap = {
      ...designationsNaMap,
      [naConfirmModal.roleId]: true,
    };
    updateDesignationsNa(newMap);
    showToast(
      `✓ Marked ${naConfirmModal.roleName} as Not Applicable (N/A).`,
      "success",
    );
    setNaConfirmModal({
      isOpen: false,
      roleId: "",
      roleName: "",
      inputVal: "",
    });
  };

  const handleUndoNa = (roleId, roleName) => {
    const newMap = { ...designationsNaMap };
    delete newMap[roleId];
    updateDesignationsNa(newMap);
    showToast(
      `✓ Re-enabled ${roleName || "role"} assignment requirement.`,
      "info",
    );
  };

  // Active personnel list (all official school staff, deduplicated by unique ID / PRN / Name)
  const activePersonnel = useMemo(() => {
    if (!Array.isArray(personnel)) return [];
    const seen = new Set();
    const result = [];
    for (const p of personnel) {
      if (!p) continue;
      const key = String(
        p.id || p.prn || `${p.firstName || ""}_${p.lastName || ""}`,
      )
        .trim()
        .toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(p);
      }
    }
    return result;
  }, [personnel]);

  // Toggle map for inline "+ Add Personnel" dropdown per designation key
  const [showAddPersonnelMap, setShowAddPersonnelMap] = useState({});
  const toggleAddPersonnel = (key, isOpen) => {
    setShowAddPersonnelMap((prev) => ({
      ...prev,
      [key]: isOpen !== undefined ? isOpen : !prev[key],
    }));
  };

  // School Curricular Offerings Detection
  const schoolOfferings = useMemo(() => {
    const offerings = (schoolInfo?.curricularOffering || []).map((o) =>
      String(o).toUpperCase(),
    );
    const hasElem =
      offerings.length === 0 ||
      offerings.some(
        (o) =>
          o.includes("ELEM") ||
          o.includes("KINDER") ||
          o.includes("PRIMARY") ||
          o.includes("INTEGRATED") ||
          o.includes("BASIC"),
      );
    const hasJHS = offerings.some(
      (o) =>
        o.includes("JHS") ||
        o.includes("JUNIOR") ||
        o.includes("SECONDARY") ||
        o.includes("HIGH SCHOOL") ||
        o.includes("INTEGRATED"),
    );
    const hasSHS = offerings.some(
      (o) =>
        o.includes("SHS") || o.includes("SENIOR") || o.includes("STANDALONE"),
    );
    const isPureElem = hasElem && !hasJHS && !hasSHS;

    return {
      hasElem,
      hasJHS,
      hasSHS,
      isPureElem,
      showKS1: hasElem,
      showKS2: hasElem,
      showKS3: hasJHS,
      showKS4: hasSHS,
    };
  }, [schoolInfo]);

  // Offered grade levels based strictly on schoolInfo.curricularOffering
  const offeredGradeLevels = useMemo(() => {
    const offerings = (schoolInfo?.curricularOffering || []).map((o) =>
      String(o).toUpperCase(),
    );
    const grades = [];
    const hasElem = offerings.some(
      (o) => o.includes("ELEM") || o.includes("KINDER"),
    );
    const hasJHS = offerings.some(
      (o) => o.includes("JHS") || o.includes("JUNIOR"),
    );
    const hasSHS = offerings.some(
      (o) => o.includes("SHS") || o.includes("SENIOR"),
    );

    if (hasElem || (!hasJHS && !hasSHS && offerings.length === 0)) {
      grades.push(
        "Kinder",
        "Grade 1",
        "Grade 2",
        "Grade 3",
        "Grade 4",
        "Grade 5",
        "Grade 6",
      );
    }
    if (hasJHS) {
      grades.push("Grade 7", "Grade 8", "Grade 9", "Grade 10");
    }
    if (hasSHS) {
      grades.push("Grade 11", "Grade 12");
    }
    return grades.length > 0 ? grades : DESIGNATION_GRADE_LEVELS;
  }, [schoolInfo]);

  // Check if a person is assigned to targetKey (matching with or without ::APPROVED_SDS suffix)
  const isAssignedToKey = (personDesignation, targetKey) => {
    if (!personDesignation || !targetKey) return false;
    const pStr =
      typeof personDesignation === "string"
        ? personDesignation
        : personDesignation?.name ||
          personDesignation?.designation ||
          personDesignation?.title ||
          String(personDesignation || "");
    const tStr =
      typeof targetKey === "string"
        ? targetKey
        : targetKey?.name ||
          targetKey?.designation ||
          targetKey?.title ||
          String(targetKey || "");
    const cleanPerson = String(pStr)
      .replace(/::APPROVED_SDS/gi, "")
      .trim()
      .toUpperCase();
    const cleanTarget = String(tStr)
      .replace(/::APPROVED_SDS/gi, "")
      .trim()
      .toUpperCase();
    return cleanPerson === cleanTarget;
  };

  // Helper to find all personnel assigned to a specific canonical key or list of alternative keys (strictly deduplicated)
  const getAssignedPersonnelForKey = (canonicalKey, altKeys = []) => {
    const allKeys = [
      canonicalKey,
      ...(Array.isArray(altKeys) ? altKeys : []),
    ].map((k) => String(k).toUpperCase());
    const matched = activePersonnel.filter((p) => {
      const pDesigStr =
        typeof p.designation === "string"
          ? p.designation
          : p.designation?.name ||
            p.designation?.designation ||
            String(p.designation || "");
      const clean = String(pDesigStr || "")
        .replace(/::APPROVED_SDS/gi, "")
        .trim()
        .toUpperCase();
      const desigsList = Array.isArray(p.designations)
        ? p.designations.map((d) => {
            const str =
              typeof d === "string"
                ? d
                : d?.name || d?.designation || d?.title || String(d || "");
            return str
              .replace(/::APPROVED_SDS/gi, "")
              .trim()
              .toUpperCase();
          })
        : [];
      return allKeys.some(
        (k) =>
          clean === k ||
          clean.startsWith(`${k} -`) ||
          clean.startsWith(`${k}:`) ||
          desigsList.some(
            (d) => d === k || d.startsWith(`${k} -`) || d.startsWith(`${k}:`),
          ),
      );
    });

    // Strictly deduplicate so the same person is NEVER displayed multiple times in the same card
    const seen = new Set();
    return matched.filter((p) => {
      const uniqueKey = String(
        p.id || p.prn || `${p.firstName || ""}_${p.lastName || ""}`,
      )
        .trim()
        .toLowerCase();
      if (seen.has(uniqueKey)) return false;
      seen.add(uniqueKey);
      return true;
    });
  };

  // Assign personnel directly to a target key
  const handleAssignDirectKey = async (targetKey, selectedPersonId) => {
    if (!selectedPersonId || !targetKey) return;

    const person = activePersonnel.find(
      (p) =>
        String(p.id) === String(selectedPersonId) ||
        (p.prn && String(p.prn) === String(selectedPersonId)),
    );
    if (!person) return;

    const currentPrimary =
      typeof person.designation === "string"
        ? person.designation
        : person.designation?.name || person.designation?.designation || "";
    const currentDesigs = Array.isArray(person.designations)
      ? person.designations.map((d) =>
          typeof d === "string"
            ? d
            : d?.name || d?.designation || d?.title || String(d || ""),
        )
      : [];

    let updatedPrimary = currentPrimary;
    let updatedDesigs = [...currentDesigs];

    if (!updatedPrimary) {
      updatedPrimary = targetKey;
    } else if (!isAssignedToKey(updatedPrimary, targetKey)) {
      if (!updatedDesigs.some((d) => isAssignedToKey(d, targetKey))) {
        updatedDesigs.push(targetKey);
      }
    }

    // Clean up duplicates and exclude primary from secondary list
    const uniqueDesigs = Array.from(
      new Set(updatedDesigs.map((d) => String(d).trim())),
    ).filter((d) => Boolean(d) && !isAssignedToKey(d, updatedPrimary));

    const updatedPerson = {
      ...person,
      designation: updatedPrimary,
      designations: uniqueDesigs,
    };
    setPersonnel((prev) =>
      prev.map((p) =>
        String(p.id) === String(person.id) ||
        (p.prn && person.prn && String(p.prn) === String(person.prn))
          ? updatedPerson
          : p,
      ),
    );
    showToast(
      `✓ Assigned ${person.firstName} ${person.lastName} as ${targetKey}`,
      "success",
    );
  };

  // Unassign personnel from designation
  const handleRemovePersonnel = async (personId, desigName) => {
    if (!personId || !desigName) return;
    const person = activePersonnel.find(
      (p) =>
        String(p.id) === String(personId) ||
        (p.prn && String(p.prn) === String(personId)),
    );
    if (!person) return;

    const currentDesigs = Array.isArray(person.designations)
      ? person.designations.map((d) =>
          typeof d === "string"
            ? d
            : d?.name || d?.designation || d?.title || String(d || ""),
        )
      : [];
    const remainingDesigs = currentDesigs.filter(
      (d) => !isAssignedToKey(d, desigName),
    );

    let updatedPrimary =
      typeof person.designation === "string"
        ? person.designation
        : person.designation?.name || person.designation?.designation || "";
    if (isAssignedToKey(updatedPrimary, desigName)) {
      updatedPrimary = remainingDesigs.length > 0 ? remainingDesigs[0] : "";
    }

    const uniqueRemaining = Array.from(
      new Set(remainingDesigs.map((d) => String(d).trim())),
    ).filter((d) => Boolean(d) && !isAssignedToKey(d, updatedPrimary));

    const updatedPerson = {
      ...person,
      designation: updatedPrimary,
      designations: uniqueRemaining,
    };
    setPersonnel((prev) =>
      prev.map((p) =>
        String(p.id) === String(person.id) ||
        (p.prn && person.prn && String(p.prn) === String(person.prn))
          ? updatedPerson
          : p,
      ),
    );
    showToast(
      `Unassigned ${person.firstName} ${person.lastName} from ${desigName}`,
      "info",
    );
  };

  // Key Stage 1 Specific Calculations, Strict Restriction & Conflict Detection
  const ks1Coverage = useMemo(() => {
    const assignments = [];
    const assignedGradesMap = {}; // grade -> { personId, personName, desigKey }
    const assignedTeacherIds = new Set();
    const assignedTeacherNames = new Set();

    activePersonnel.forEach((p) => {
      const pFullName = `${p.firstName || ""} ${p.lastName || ""}`.trim();
      const pNormalizedName = pFullName.toLowerCase();
      const keysToCheck = [];
      if (p.designation) keysToCheck.push(p.designation);
      if (Array.isArray(p.designations)) keysToCheck.push(...p.designations);

      keysToCheck.forEach((rawKey) => {
        const fullKey =
          typeof rawKey === "string"
            ? rawKey
            : rawKey?.name || rawKey?.designation || String(rawKey || "");
        const clean = String(fullKey || "")
          .replace(/::APPROVED_SDS/gi, "")
          .trim()
          .toUpperCase();
        if (
          clean.startsWith("DEPARTMENT HEAD") &&
          (clean.includes("KEY STAGE 1") ||
            clean.includes("KS1") ||
            clean.includes("KINDER") ||
            clean.includes("GRADE 1") ||
            clean.includes("GRADE 2") ||
            clean.includes("GRADE 3")) &&
          !clean.includes("KEY STAGE 2") &&
          !clean.includes("KEY STAGE 3") &&
          !clean.includes("KEY STAGE 4") &&
          !clean.includes("GRADE 4") &&
          !clean.includes("GRADE 5") &&
          !clean.includes("GRADE 6") &&
          !clean.includes("GRADE 7") &&
          !clean.includes("GRADE 8") &&
          !clean.includes("GRADE 9") &&
          !clean.includes("GRADE 10")
        ) {
          const rawGrades = parseKS1GradesFromKey(clean);

          // Deduplicate: Find if this person already has a card in assignments (by ID OR by Name)
          let existingAssignment = assignments.find(
            (a) =>
              String(a.person.id) === String(p.id) ||
              a.normalizedName === pNormalizedName,
          );

          // STRICT RESTRICTION: Mutual Exclusivity
          // A grade can ONLY be claimed by ONE person. Filter out grades that are already owned by another person.
          const validGrades = rawGrades.filter((g) => {
            const currentOwner = assignedGradesMap[g];
            if (!currentOwner) return true;
            return (
              String(currentOwner.personId) === String(p.id) ||
              currentOwner.normalizedName === pNormalizedName
            );
          });

          if (validGrades.length > 0) {
            assignedTeacherIds.add(p.id);
            assignedTeacherNames.add(pNormalizedName);

            validGrades.forEach((g) => {
              if (!assignedGradesMap[g]) {
                assignedGradesMap[g] = {
                  personId: p.id,
                  personName: pFullName,
                  normalizedName: pNormalizedName,
                  desigKey: clean,
                };
              }
            });

            if (existingAssignment) {
              validGrades.forEach((g) => {
                if (!existingAssignment.grades.includes(g))
                  existingAssignment.grades.push(g);
              });
              if (!existingAssignment.keys.includes(clean)) {
                existingAssignment.keys.push(clean);
              }
            } else {
              assignments.push({
                person: p,
                personName: pFullName,
                normalizedName: pNormalizedName,
                fullKey,
                cleanKey: clean,
                keys: [clean],
                grades: [...validGrades],
                id: `${p.id}_ks1`,
              });
            }
          }
        }
      });
    });

    const assignedGrades = Object.keys(assignedGradesMap);
    const unassignedGrades = KS1_CANONICAL_GRADES.filter(
      (g) => !assignedGradesMap[g],
    );

    return {
      assignments,
      assignedGradesMap,
      assignedTeacherIds: Array.from(assignedTeacherIds),
      assignedTeacherNames: Array.from(assignedTeacherNames),
      assignedGrades,
      unassignedGrades,
      isFullyCovered: unassignedGrades.length === 0 && assignments.length > 0,
    };
  }, [activePersonnel]);

  // Personnel available for a NEW Key Stage 1 Head assignment (excludes teachers already in KS1 or Principal roles)
  const availableKS1Personnel = useMemo(() => {
    return activePersonnel.filter((p) => {
      const pFullName = `${p.firstName || ""} ${p.lastName || ""}`
        .trim()
        .toLowerCase();
      if (
        ks1Coverage.assignedTeacherIds.includes(p.id) ||
        ks1Coverage.assignedTeacherNames.includes(pFullName)
      ) {
        return false;
      }
      const posUpper = String(p.position || "").toUpperCase();
      if (posUpper.includes("PRINCIPAL") || posUpper.includes("SCHOOL HEAD")) {
        return false;
      }
      return true;
    });
  }, [
    activePersonnel,
    ks1Coverage.assignedTeacherIds,
    ks1Coverage.assignedTeacherNames,
  ]);

  // Helper to check if a designation is a KS1 designation string
  const isKS1DesignationKey = (keyStr) => {
    if (!keyStr) return false;
    const clean = String(keyStr)
      .replace(/::APPROVED_SDS/gi, "")
      .trim()
      .toUpperCase();
    return (
      clean.startsWith("DEPARTMENT HEAD") &&
      (clean.includes("KEY STAGE 1") ||
        clean.includes("KS1") ||
        clean.includes("KINDER") ||
        clean.includes("GRADE 1") ||
        clean.includes("GRADE 2") ||
        clean.includes("GRADE 3")) &&
      !clean.includes("KEY STAGE 2") &&
      !clean.includes("KEY STAGE 3") &&
      !clean.includes("KEY STAGE 4") &&
      !clean.includes("GRADE 4") &&
      !clean.includes("GRADE 5") &&
      !clean.includes("GRADE 6") &&
      !clean.includes("GRADE 7") &&
      !clean.includes("GRADE 8") &&
      !clean.includes("GRADE 9") &&
      !clean.includes("GRADE 10")
    );
  };

  // Remove KS1 assignment (cleans up all KS1 keys for the person)
  const handleRemoveKS1Personnel = async (personId, keysList) => {
    const person = activePersonnel.find(
      (p) => String(p.id) === String(personId),
    );
    if (!person) return;

    const currentDesigs = Array.isArray(person.designations)
      ? person.designations
      : [];
    const remainingDesigs = currentDesigs.filter(
      (d) => !isKS1DesignationKey(d),
    );

    let updatedPrimary = person.designation;
    if (isKS1DesignationKey(person.designation)) {
      updatedPrimary = remainingDesigs.length > 0 ? remainingDesigs[0] : "";
    }

    const updatedPerson = {
      ...person,
      designation: updatedPrimary,
      designations: remainingDesigs.filter((d) => d !== updatedPrimary),
    };
    setPersonnel((prev) =>
      prev.map((p) => (String(p.id) === String(person.id) ? updatedPerson : p)),
    );
    showToast(
      `Unassigned ${person.firstName} ${person.lastName} from Key Stage 1`,
      "info",
    );
  };

  // Handle Key Stage 1 Checklist Assignment with Strict Restriction Rules
  const handleAssignKS1Checklist = async () => {
    if (!ks1SelectedTeacherId) {
      showToast("Please select a teacher from the roster.", "error");
      return;
    }
    const person = activePersonnel.find(
      (p) => String(p.id) === String(ks1SelectedTeacherId),
    );
    if (!person) {
      showToast("Selected personnel record not found.", "error");
      return;
    }

    const pFullName = `${person.firstName || ""} ${person.lastName || ""}`
      .trim()
      .toLowerCase();
    if (
      ks1Coverage.assignedTeacherIds.some(
        (id) => String(id) === String(person.id),
      ) ||
      ks1Coverage.assignedTeacherNames.includes(pFullName)
    ) {
      showToast(
        "Restriction: This teacher is already designated in Key Stage 1. Unassign them first to reconfigure grades.",
        "error",
      );
      return;
    }

    if (!ks1CheckedGrades || ks1CheckedGrades.length === 0) {
      showToast(
        "Restriction: Please check at least one grade level to assign.",
        "error",
      );
      return;
    }

    // Restriction: Ensure none of the checked grades are already assigned to another head
    const conflictingGrades = ks1CheckedGrades.filter(
      (g) => ks1Coverage.assignedGradesMap[g],
    );
    if (conflictingGrades.length > 0) {
      const conflictDetails = conflictingGrades
        .map(
          (g) =>
            `${g} (already assigned to ${ks1Coverage.assignedGradesMap[g].personName})`,
        )
        .join(", ");
      showToast(
        `Restriction: Grade conflict detected — ${conflictDetails}. Unassign the current head first.`,
        "error",
      );
      return;
    }

    let targetKey = "";
    if (ks1CheckedGrades.length === 4) {
      targetKey = "DEPARTMENT HEAD - KEY STAGE 1 (KINDER - GRADE 3)";
    } else {
      const sortedGrades = KS1_CANONICAL_GRADES.filter((g) =>
        ks1CheckedGrades.includes(g),
      );
      targetKey = `DEPARTMENT HEAD - KEY STAGE 1 (${sortedGrades.map((g) => g.toUpperCase()).join(", ")})`;
    }

    const currentPrimary = person.designation || "";
    const currentDesigs = Array.isArray(person.designations)
      ? [...person.designations]
      : [];

    // Strip any previous KS1 keys to ensure clean single assignment
    const remainingDesigs = currentDesigs.filter(
      (d) => !isKS1DesignationKey(d),
    );
    let updatedPrimary = currentPrimary;

    if (!updatedPrimary || isKS1DesignationKey(updatedPrimary)) {
      updatedPrimary = targetKey;
    } else if (!remainingDesigs.includes(targetKey)) {
      remainingDesigs.push(targetKey);
    }

    const updatedPerson = {
      ...person,
      designation: updatedPrimary,
      designations: remainingDesigs.filter((d) => d !== updatedPrimary),
    };
    setPersonnel((prev) =>
      prev.map((p) => (String(p.id) === String(person.id) ? updatedPerson : p)),
    );
    showToast(
      `✓ Assigned ${person.firstName} ${person.lastName} as Key Stage 1 Head (${ks1CheckedGrades.join(", ")})`,
      "success",
    );
    setKs1SelectedTeacherId("");
    setKs1CheckedGrades([]);
    setShowKs1AssignForm(false);
  };

  // DEFINITION OF MANDATORY CORE ROLES (Section 1)
  const mandatoryRoles = useMemo(() => {
    const list = [
      {
        id: "guidance_designate",
        name: "Guidance Designate",
        canonicalKey: "GUIDANCE DESIGNATE",
        altKeys: ["GUIDANCE DESIGNATE"],
        icon: <FiShield size={20} color="#0284C7" />,
        badgeColor: "#0284C7",
        description:
          "Handles student guidance, counseling, child protection policy, and student welfare support.",
        isRequired: true,
      },
      {
        id: "learner_information_officer",
        name: "Learner Information Officer",
        canonicalKey: "LEARNER INFORMATION OFFICER",
        altKeys: ["LEARNER INFORMATION OFFICER", "LEARNER FORMATION OFFICER"],
        icon: <FiFileText size={20} color="#0D9488" />,
        badgeColor: "#0D9488",
        description:
          "Oversees learner information, student records, LIS management, and learner support services.",
        isRequired: true,
      },
    ];

    if (isAshRequired) {
      list.push({
        id: "assistant_school_head_designate",
        name: "Assistant School Head Designate",
        canonicalKey: "ASSISTANT SCHOOL HEAD DESIGNATE",
        altKeys: ["ASSISTANT SCHOOL HEAD DESIGNATE", "ASSISTANT SCHOOL HEAD"],
        icon: <FiUsers size={20} color="#7C3AED" />,
        badgeColor: "#7C3AED",
        description: `Mandatory for schools with regular enrollment of 1,001 or more (Current regular enrollment: ${regularEnrollment} learners). Assists the School Head in school operations.`,
        isRequired: true,
      });
    }

    return list;
  }, [isAshRequired, regularEnrollment]);

  // Helper to check if a designation belongs to Core or Department Head sections (to exclude from Section 3)
  const isSpecialSectionKey = (designationStr) => {
    if (!designationStr) return false;
    const cleanUpper = String(designationStr)
      .replace(/::APPROVED_SDS/gi, "")
      .trim()
      .toUpperCase();
    if (
      cleanUpper.startsWith("GUIDANCE DESIGNATE") ||
      cleanUpper.startsWith("LEARNER INFORMATION OFFICER") ||
      cleanUpper.startsWith("LEARNER FORMATION OFFICER") ||
      cleanUpper.startsWith("ASSISTANT SCHOOL HEAD") ||
      cleanUpper.startsWith("DEPARTMENT HEAD")
    ) {
      return true;
    }
    return false;
  };

  // ADDITIONAL ASSIGNMENTS (Section 3: Program Coordinators, Grade Level Chairs, Learning Area Chairs, etc.)
  const additionalAssignments = useMemo(() => {
    const list = [];
    activePersonnel.forEach((p) => {
      const keysToCheck = [];
      if (p.designation) {
        const dStr =
          typeof p.designation === "string"
            ? p.designation
            : p.designation?.name ||
              p.designation?.designation ||
              String(p.designation || "");
        if (dStr && dStr !== "[object Object]") keysToCheck.push(dStr);
      }
      if (Array.isArray(p.designations)) {
        p.designations.forEach((d) => {
          if (!d) return;
          const dStr =
            typeof d === "string"
              ? d
              : d?.name || d?.designation || d?.title || String(d || "");
          if (dStr && dStr !== "[object Object]" && !keysToCheck.includes(dStr))
            keysToCheck.push(dStr);
        });
      }

      keysToCheck.forEach((rawFullKey) => {
        const fullKey =
          typeof rawFullKey === "string"
            ? rawFullKey
            : rawFullKey?.name ||
              rawFullKey?.designation ||
              String(rawFullKey || "");
        if (!fullKey || fullKey === "[object Object]") return;
        const isApproved = String(fullKey).includes("::APPROVED_SDS");
        const clean = String(fullKey)
          .replace(/::APPROVED_SDS/gi, "")
          .trim();

        if (clean && !isSpecialSectionKey(clean)) {
          let category = clean;
          let parameter = null;

          if (clean.includes(" - ")) {
            const parts = clean.split(" - ");
            category = parts[0];
            parameter = parts.slice(1).join(" - ");
          }

          list.push({
            person: p,
            fullKey,
            cleanKey: clean,
            category,
            parameter,
            isSdsApproved: isApproved,
            id: `${p.id}_${clean}`,
          });
        }
      });
    });

    return list;
  }, [activePersonnel, isAshRequired]);

  // OPTIONS AVAILABLE IN "+ ADD DESIGNATION" MODAL (Section 3)
  const additionalRoleOptions = useMemo(() => {
    return (OFFICIAL_DESIGNATIONS || []).filter((d) => {
      if (
        [
          "guidance_designate",
          "learner_information_officer",
          "department_head_designate",
          "department_head_ecp",
        ].includes(d.id)
      ) {
        return false;
      }
      if (d.id === "assistant_school_head_designate" && isAshRequired) {
        return false;
      }
      return true;
    });
  }, [isAshRequired]);

  // ADD DESIGNATION MODAL STATE (Section 3)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalRoleId, setModalRoleId] = useState("");
  const [modalGrade, setModalGrade] = useState("Grade 1");
  const [modalLearningArea, setModalLearningArea] = useState("Filipino");
  const [modalTrack, setModalTrack] = useState("ACADEMIC");
  const [modalTeacherId, setModalTeacherId] = useState("");
  const [modalError, setModalError] = useState("");

  const openAddModal = (roleId = null) => {
    const targetRole =
      roleId && additionalRoleOptions.some((r) => r.id === roleId)
        ? roleId
        : additionalRoleOptions[0]?.id || "";
    setModalRoleId(targetRole);
    setModalGrade(offeredGradeLevels[0] || "Grade 1");
    setModalLearningArea(PRIMARY_LEARNING_AREAS[0] || "Filipino");
    setModalTrack(SHS_TRACKS[0] || "ACADEMIC");
    setModalTeacherId("");
    setModalError("");
    setIsAddModalOpen(true);
  };

  const handleSaveModalDesignation = async () => {
    if (!modalTeacherId) {
      setModalError("Please select a teacher to assign.");
      return;
    }
    const selectedDesig = additionalRoleOptions.find(
      (d) => d.id === modalRoleId,
    );
    if (!selectedDesig) {
      setModalError("Please select a designation role.");
      return;
    }

    let targetKey = selectedDesig.name;
    if (selectedDesig.id === "grade_level_chairperson") {
      targetKey = `GRADE LEVEL CHAIRPERSON - ${modalGrade}`;
    } else if (selectedDesig.id === "learning_area_chairperson") {
      targetKey = `LEARNING AREA CHAIRPERSON - ${modalLearningArea}`;
    }

    await handleAssignDirectKey(targetKey, modalTeacherId);
    setIsAddModalOpen(false);
  };

  // CHECK MISSING REQUIRED DESIGNATIONS FOR WORKLOAD NAVIGATION GATE
  const [missingDesignationsModal, setMissingDesignationsModal] = useState({
    isOpen: false,
    missingList: [],
  });

  const getMissingRequiredDesignations = () => {
    const missing = [];
    mandatoryRoles.forEach((req) => {
      // If marked as N/A, do not treat as missing
      if (designationsNaMap[req.id]) return;

      const assigned = getAssignedPersonnelForKey(
        req.canonicalKey,
        req.altKeys,
      );
      if (assigned.length === 0) {
        missing.push(req);
      }
    });

    // Check if Department Head requirement is marked N/A
    const isDeptHeadNa =
      designationsNaMap["department_head_keystage"] ||
      designationsNaMap["department_head"];

    if (
      !isDeptHeadNa &&
      requiresDepartmentHead(schoolInfo?.curricularOffering)
    ) {
      // Check if at least 1 Department Head is designated in any active Key Stage
      const anyDeptHeadAssigned = activePersonnel.some((p) => {
        const pDesigStr =
          typeof p.designation === "string"
            ? p.designation
            : p.designation?.name ||
              p.designation?.designation ||
              String(p.designation || "");
        const clean = String(pDesigStr || "")
          .replace(/::APPROVED_SDS/gi, "")
          .trim()
          .toUpperCase();
        const desigsList = Array.isArray(p.designations)
          ? p.designations.map((d) =>
              String(d?.name || d?.designation || d || "")
                .replace(/::APPROVED_SDS/gi, "")
                .trim()
                .toUpperCase(),
            )
          : [];
        return (
          clean.startsWith("DEPARTMENT HEAD") ||
          desigsList.some((d) => d.startsWith("DEPARTMENT HEAD"))
        );
      });

      if (!anyDeptHeadAssigned) {
        missing.push({
          id: "department_head_keystage",
          name: "Department Head Designate (By Key Stage)",
          canonicalKey: "DEPARTMENT HEAD",
          description:
            "At least one Department Head Designate must be assigned for your school's offered Key Stages, or marked N/A.",
        });
      }
    }

    return missing;
  };

  // The one Designations save, used by the header Save button AND the unsaved-changes dialog's Save button.
  // It never opens its own alerts: it returns { ok: true } or { ok: false, title, message }.
  const runDesignationsSave = async () => {
    const missing = getMissingRequiredDesignations();
    if (missing.length > 0) {
      return {
        ok: false,
        missing,
        title: "Required Designations Missing",
        message: `Assign all required designations before saving (${missing.length} still missing).`,
      };
    }

    setIsSaving(true);
    try {
      let prevPersonnelMap = new Map();
      if (savedDesignationsSnapshotRef.current) {
        try {
          const parsed = JSON.parse(savedDesignationsSnapshotRef.current);
          if (Array.isArray(parsed.personnel)) {
            parsed.personnel.forEach((sp) =>
              prevPersonnelMap.set(String(sp.id), sp),
            );
          }
        } catch (e) {}
      }

      const changedPersonnel = (personnel || []).filter((p) => {
        const prev = prevPersonnelMap.get(String(p.id));
        if (!prev) return true;
        const curDesig =
          typeof p.designation === "string"
            ? p.designation
            : p.designation?.name || p.designation?.designation || "";
        const curList = Array.isArray(p.designations)
          ? p.designations.map((d) =>
              typeof d === "string"
                ? d
                : d?.name || d?.designation || d?.title || "",
            )
          : [];
        if (curDesig !== prev.designation) return true;
        if (
          JSON.stringify(curList.slice().sort()) !==
          JSON.stringify((prev.designations || []).slice().sort())
        )
          return true;
        return false;
      });

      for (const p of changedPersonnel) {
        if (savePersonnelChanges) {
          await savePersonnelChanges(p.id, p);
        }
        localStorage.removeItem(`draft_personnel_${p.id}`);
      }

      if (schoolInfo?.schoolId) {
        try {
          localStorage.setItem(
            `esf7_designations_na_${schoolInfo.schoolId}`,
            JSON.stringify(designationsNaMap),
          );
        } catch (e) {}
      }

      // Success is reported only after the server confirmed the database write.
      const confirmed = await confirmServerDraftSaved();
      if (!confirmed.ok) return confirmed;

      savedDesignationsSnapshotRef.current = JSON.stringify(
        getDesignationsSnapshot(),
      );

      if (completeNode) {
        completeNode("designation", null);
      }

      if (showToast) {
        showToast("Designations saved to database successfully.", "success");
      }
      return { ok: true };
    } catch (err) {
      console.warn("Failed to save designations:", err);
      return {
        ok: false,
        title: "Designations Not Saved",
        message: "Failed to save designations: " + err.message,
      };
    } finally {
      setIsSaving(false);
    }
  };
  runSaveRef.current = runDesignationsSave;

  const handleSave = async () => {
    const result = await runDesignationsSave();
    if (result.ok === false) {
      if (result.missing) {
        setMissingDesignationsModal({
          isOpen: true,
          missingList: result.missing,
        });
      } else if (showToast) {
        showToast(result.message, "error");
      }
    }
  };

  // Search filtering
  const filteredMandatoryRoles = mandatoryRoles.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const matchesName = r.name.toLowerCase().includes(term);
    const matchesDesc = r.description.toLowerCase().includes(term);
    const assigned = getAssignedPersonnelForKey(r.canonicalKey, r.altKeys);
    const matchesTeacher = assigned.some((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(term),
    );
    return matchesName || matchesDesc || matchesTeacher;
  });

  const filteredAdditionalAssignments = additionalAssignments.filter((a) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const matchesRole = a.cleanKey.toLowerCase().includes(term);
    const matchesTeacher = `${a.person.firstName} ${a.person.lastName}`
      .toLowerCase()
      .includes(term);
    return matchesRole || matchesTeacher;
  });

  const ks2Assigned = useMemo(() => {
    let count = 0;
    KS2_LEARNING_AREAS.forEach((area) => {
      const key = `DEPARTMENT HEAD - KEY STAGE 2 - ${area.name.toUpperCase()}`;
      const altKeys = (area.altNames || [area.name.toUpperCase()]).flatMap(
        (name) => [
          `DEPARTMENT HEAD - KEY STAGE 2 - ${name}`,
          `DEPARTMENT HEAD - ${name}`,
        ],
      );
      if (getAssignedPersonnelForKey(key, altKeys).length > 0) count++;
    });
    return { total: KS2_LEARNING_AREAS.length, count };
  }, [activePersonnel]);

  const ks3Assigned = useMemo(() => {
    let count = 0;
    KS3_LEARNING_AREAS.forEach((area) => {
      const key = `DEPARTMENT HEAD - KEY STAGE 3 - ${area.name.toUpperCase()}`;
      const altKeys = (area.altNames || [area.name.toUpperCase()]).flatMap(
        (name) => [
          `DEPARTMENT HEAD - KEY STAGE 3 - ${name}`,
          `DEPARTMENT HEAD - ${name}`,
        ],
      );
      if (getAssignedPersonnelForKey(key, altKeys).length > 0) count++;
    });
    return { total: KS3_LEARNING_AREAS.length, count };
  }, [activePersonnel]);

  const ks4Assigned = useMemo(() => {
    let count = 0;
    KS4_TRACKS_LIST.forEach((track) => {
      if (getAssignedPersonnelForKey(track.key, track.altKeys).length > 0)
        count++;
    });
    return { total: KS4_TRACKS_LIST.length, count };
  }, [activePersonnel]);

  return (
    <section id="designations" className="view grid">
      <style>{`
        @keyframes pulseGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.75), 0 3px 10px rgba(2, 132, 199, 0.35);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(2, 132, 199, 0), 0 5px 16px rgba(2, 132, 199, 0.5);
            transform: scale(1.02);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(2, 132, 199, 0), 0 3px 10px rgba(2, 132, 199, 0.35);
            transform: scale(1);
          }
        }
        @keyframes beaconBlink {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
            box-shadow: 0 0 8px #38BDF8, 0 0 14px #38BDF8;
          }
          50% {
            opacity: 0.25;
            transform: scale(0.8);
            box-shadow: 0 0 2px #38BDF8;
          }
        }
        .ks-card {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ks-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.06);
        }
      `}</style>

      <PortalHeader
        title="Official School Designations"
        description="Assign official faculty roles, Key Stage Department Heads, and school program coordinators."
        onBack={() => setActiveView("dashboard")}
        showNodeMap={true}
        onContinue={handleSave}
        continueText="Save"
        continueDisabled={!isDirty || isSaving}
      />

      <article className="card">
        <div style={{ padding: "24px" }}>
          {/* Top Bar with Header, View Mode Toggle, and Search */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: "800",
                  color: "var(--navy)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiTag size={20} /> School Designation Management
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "13px",
                  color: "var(--muted)",
                }}
              >
                Manage statutory school leadership roles, Key Stage Department
                Heads, and school program coordinators.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {/* Card vs Matrix View Toggle */}
              <div
                style={{
                  display: "flex",
                  border: "1.5px solid var(--line)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  background: "#F8FAFC",
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode("card")}
                  style={{
                    padding: "8px 14px",
                    border: "none",
                    background: viewMode === "card" ? "#0284C7" : "transparent",
                    color: viewMode === "card" ? "white" : "#475569",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FiGrid size={13} /> Card View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("matrix")}
                  style={{
                    padding: "8px 14px",
                    border: "none",
                    background:
                      viewMode === "matrix" ? "#0284C7" : "transparent",
                    color: viewMode === "matrix" ? "white" : "#475569",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FiList size={13} /> Matrix View
                </button>
              </div>

              {/* Search Box */}
              <div style={{ position: "relative", width: "240px" }}>
                <input
                  type="text"
                  placeholder="Search designation or teacher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 34px",
                    borderRadius: "10px",
                    border: "1.5px solid var(--line)",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <FiSearch
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94A3B8",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>
          </div>

          {/* CARD VIEW MODE */}
          {viewMode === "card" && (
            <div>
              {/* SECTION 1: CORE STATUTORY ROLES */}
              <div style={{ marginBottom: "36px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "14px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "16px",
                        fontWeight: "800",
                        color: "var(--navy)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <FiShield size={18} color="#0284C7" /> Section 1: Core
                      School Designations
                    </h3>
                    <p
                      style={{
                        margin: "3px 0 0",
                        fontSize: "12px",
                        color: "#64748B",
                      }}
                    >
                      Statutory school administration and student welfare
                      support roles.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(360px, 1fr))",
                    gap: "18px",
                  }}
                >
                  {filteredMandatoryRoles.map((role) => {
                    const assignedPersonnel = getAssignedPersonnelForKey(
                      role.canonicalKey,
                      role.altKeys,
                    );
                    const isAssigned = assignedPersonnel.length > 0;
                    const isNa = !!designationsNaMap[role.id];
                    const availablePersonnel = activePersonnel.filter(
                      (p) => !isAssignedToKey(p.designation, role.canonicalKey),
                    );

                    return (
                      <div
                        key={role.id}
                        id={`mandatory-slot-${role.id}`}
                        className="ks-card"
                        style={{
                          background: "#FFFFFF",
                          border: isAssigned
                            ? "1.5px solid #86EFAC"
                            : isNa
                              ? "1.5px dashed #94A3B8"
                              : "1.5px solid var(--line)",
                          borderRadius: "16px",
                          padding: "20px",
                          boxShadow: isAssigned
                            ? "0 4px 12px rgba(22, 163, 74, 0.06)"
                            : "0 1px 3px rgba(0,0,0,0.04)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          position: "relative",
                        }}
                      >
                        <div>
                          {/* Card Header */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              marginBottom: "10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                              }}
                            >
                              <div
                                style={{
                                  width: "38px",
                                  height: "38px",
                                  borderRadius: "10px",
                                  background: isAssigned
                                    ? "#F0FDF4"
                                    : isNa
                                      ? "#F1F5F9"
                                      : "#F8FAFC",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  border: isAssigned
                                    ? "1px solid #BBF7D0"
                                    : isNa
                                      ? "1px solid #CBD5E1"
                                      : "1px solid #E2E8F0",
                                }}
                              >
                                {role.icon}
                              </div>
                              <div>
                                <h4
                                  style={{
                                    margin: 0,
                                    fontSize: "15px",
                                    fontWeight: "800",
                                    color: isNa ? "#64748B" : "var(--navy)",
                                  }}
                                >
                                  {role.name}
                                </h4>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: "700",
                                    padding: "2px 6px",
                                    borderRadius: "6px",
                                    background: "#F1F5F9",
                                    color: "#475569",
                                    border: "1px solid #CBD5E1",
                                    display: "inline-block",
                                    marginTop: "2px",
                                  }}
                                >
                                  MANDATORY
                                </span>
                              </div>
                            </div>

                            <span
                              style={{
                                padding: "3px 10px",
                                borderRadius: "999px",
                                fontSize: "11px",
                                fontWeight: "800",
                                background: isAssigned
                                  ? "#DCFCE7"
                                  : isNa
                                    ? "#F1F5F9"
                                    : "#FEF2F2",
                                color: isAssigned
                                  ? "#166534"
                                  : isNa
                                    ? "#475569"
                                    : "#DC2626",
                                border: isAssigned
                                  ? "1px solid #86EFAC"
                                  : isNa
                                    ? "1px solid #CBD5E1"
                                    : "1px solid #FCA5A5",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              {isAssigned ? <FiCheck size={12} /> : null}
                              {isAssigned
                                ? "ASSIGNED"
                                : isNa
                                  ? "⚪ N/A (NOT APPLICABLE)"
                                  : "VACANT (REQUIRED)"}
                            </span>
                          </div>

                          <p
                            style={{
                              margin: "0 0 16px",
                              fontSize: "12px",
                              color: "#64748B",
                              lineHeight: "1.45",
                            }}
                          >
                            {role.description}
                          </p>

                          {/* Assigned Teacher Box */}
                          {isAssigned ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              {assignedPersonnel.map((person) => {
                                const initials =
                                  `${(person.firstName || "")[0] || ""}${(person.lastName || "")[0] || ""}`.toUpperCase();

                                return (
                                  <div
                                    key={person.id}
                                    style={{
                                      background: "#F8FAFC",
                                      border: "1px solid #E2E8F0",
                                      borderRadius: "12px",
                                      padding: "12px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: "10px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        minWidth: 0,
                                        flex: 1,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: "36px",
                                          height: "36px",
                                          borderRadius: "50%",
                                          background: "#0284C7",
                                          color: "white",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontWeight: "800",
                                          fontSize: "13px",
                                          flexShrink: 0,
                                        }}
                                      >
                                        {initials}
                                      </div>
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div
                                          style={{
                                            fontSize: "13px",
                                            fontWeight: "800",
                                            color: "#0F172A",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                        >
                                          {person.firstName} {person.lastName}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "11px",
                                            color: "#64748B",
                                          }}
                                        >
                                          {person.position || "Teacher"}
                                        </div>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemovePersonnel(
                                          person.id,
                                          role.canonicalKey,
                                        )
                                      }
                                      style={{
                                        background: "#FEE2E2",
                                        color: "#DC2626",
                                        border: "none",
                                        borderRadius: "6px",
                                        padding: "5px 9px",
                                        fontSize: "11px",
                                        fontWeight: "700",
                                        cursor: "pointer",
                                      }}
                                      title="Unassign teacher from this role"
                                    >
                                      Remove ✕
                                    </button>
                                  </div>
                                );
                              })}

                              {/* Inline + Add Personnel Dropdown */}
                              {showAddPersonnelMap[role.canonicalKey] ? (
                                <div
                                  style={{
                                    marginTop: "6px",
                                    padding: "10px",
                                    background: "#F0F9FF",
                                    border: "1.5px solid #BAE6FD",
                                    borderRadius: "10px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      marginBottom: "6px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "11.5px",
                                        fontWeight: "800",
                                        color: "#0369A1",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      <FiUser size={13} /> Add Additional
                                      Personnel
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAddPersonnel(
                                          role.canonicalKey,
                                          false,
                                        )
                                      }
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#64748B",
                                        cursor: "pointer",
                                        padding: "2px",
                                      }}
                                    >
                                      <FiX size={14} />
                                    </button>
                                  </div>
                                  <SearchableDropdown
                                    options={activePersonnel
                                      .filter(
                                        (p) =>
                                          !assignedPersonnel.some(
                                            (ap) =>
                                              String(ap.id) === String(p.id),
                                          ),
                                      )
                                      .map(
                                        (p) =>
                                          `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                      )}
                                    value=""
                                    onChange={(val) => {
                                      const p = activePersonnel.find(
                                        (person) =>
                                          `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                          val,
                                      );
                                      if (p) {
                                        handleAssignDirectKey(
                                          role.canonicalKey,
                                          p.id,
                                        );
                                        toggleAddPersonnel(
                                          role.canonicalKey,
                                          false,
                                        );
                                      }
                                    }}
                                    placeholder="Select faculty member to add..."
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleAddPersonnel(role.canonicalKey, true)
                                  }
                                  style={{
                                    marginTop: "4px",
                                    background: "#F0FDF4",
                                    color: "#15803D",
                                    border: "1.5px dashed #86EFAC",
                                    borderRadius: "8px",
                                    padding: "6px 12px",
                                    fontSize: "11.5px",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "6px",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  <FiPlus size={13} /> + Add Personnel
                                </button>
                              )}
                            </div>
                          ) : isNa ? (
                            <div
                              style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: "12px",
                                padding: "12px 14px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <FiCheckCircle size={16} color="#64748B" />
                                <div>
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "800",
                                      color: "#475569",
                                    }}
                                  >
                                    Marked as Not Applicable (N/A)
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "#94A3B8",
                                    }}
                                  >
                                    No faculty assigned. Excluded from Workload
                                    validation.
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUndoNa(role.id, role.name)}
                                style={{
                                  background: "#E2E8F0",
                                  color: "#334155",
                                  border: "none",
                                  borderRadius: "6px",
                                  padding: "5px 10px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                                title="Re-enable role requirement and assign faculty"
                              >
                                Re-assign / Undo N/A
                              </button>
                            </div>
                          ) : (
                            <div
                              style={{
                                background: "#F8FAFC",
                                border: "1.5px dashed #CBD5E1",
                                borderRadius: "12px",
                                padding: "14px",
                                textAlign: "center",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "800",
                                  color: "#334155",
                                  marginBottom: "6px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                }}
                              >
                                <FiUser size={14} color="#0284C7" /> Assign
                                Faculty Member
                              </div>
                              <SearchableDropdown
                                options={availablePersonnel.map(
                                  (p) =>
                                    `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                )}
                                value=""
                                onChange={(val) => {
                                  const p = availablePersonnel.find(
                                    (person) =>
                                      `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                      val,
                                  );
                                  if (p)
                                    handleAssignDirectKey(
                                      role.canonicalKey,
                                      p.id,
                                    );
                                }}
                                placeholder={`Select teacher as ${role.name}...`}
                              />
                              <div
                                style={{
                                  marginTop: "10px",
                                  display: "flex",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenNaModal(role.id, role.name)
                                  }
                                  style={{
                                    background: "transparent",
                                    border: "1px dashed #94A3B8",
                                    borderRadius: "6px",
                                    padding: "4px 10px",
                                    fontSize: "11px",
                                    fontWeight: "700",
                                    color: "#64748B",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                  title="Mark this mandatory role as Not Applicable"
                                >
                                  ⚪ Mark N/A
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: DEPARTMENT HEAD DESIGNATIONS (BY KEY STAGE) */}
              <div style={{ marginBottom: "40px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "16px",
                    paddingBottom: "14px",
                    borderBottom: "1.5px solid var(--line)",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "16px",
                        fontWeight: "800",
                        color: "var(--navy)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <FiFolder size={18} color="#D97706" /> Section 2:
                      Department Head Designations (By Key Stage)
                    </h3>
                    <p
                      style={{
                        margin: "3px 0 0",
                        fontSize: "12px",
                        color: "#64748B",
                      }}
                    >
                      {schoolOfferings.isPureElem
                        ? "Purely Elementary School: Key Stage 1 (K–G3 Checklist) and Key Stage 2 (G4–G6 Primary Learning Areas)."
                        : "Assign designated Department Heads organized by Key Stage, Grade Checklist, and Learning Area/Track."}
                    </p>
                  </div>

                  {/* Key Stage Filter Tabs */}
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveKsTab("all")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: "1px solid",
                        borderColor:
                          activeKsTab === "all" ? "#D97706" : "#E2E8F0",
                        background:
                          activeKsTab === "all" ? "#FEF3C7" : "#FFFFFF",
                        color: activeKsTab === "all" ? "#92400E" : "#475569",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      All Key Stages
                    </button>
                    {schoolOfferings.showKS1 && (
                      <button
                        type="button"
                        onClick={() => setActiveKsTab("ks1")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid",
                          borderColor:
                            activeKsTab === "ks1" ? "#D97706" : "#E2E8F0",
                          background:
                            activeKsTab === "ks1" ? "#FEF3C7" : "#FFFFFF",
                          color: activeKsTab === "ks1" ? "#92400E" : "#475569",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer",
                        }}
                      >
                        KS1 (K–G3) • {ks1Coverage.assignedGrades.length}/4
                        Grades
                      </button>
                    )}
                    {schoolOfferings.showKS2 && (
                      <button
                        type="button"
                        onClick={() => setActiveKsTab("ks2")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid",
                          borderColor:
                            activeKsTab === "ks2" ? "#0284C7" : "#E2E8F0",
                          background:
                            activeKsTab === "ks2" ? "#E0F2FE" : "#FFFFFF",
                          color: activeKsTab === "ks2" ? "#0369A1" : "#475569",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer",
                        }}
                      >
                        KS2 (G4–G6){" "}
                        {ks2Assigned.count > 0 &&
                          `• ${ks2Assigned.count}/${ks2Assigned.total}`}
                      </button>
                    )}
                    {schoolOfferings.showKS3 && (
                      <button
                        type="button"
                        onClick={() => setActiveKsTab("ks3")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid",
                          borderColor:
                            activeKsTab === "ks3" ? "#0D9488" : "#E2E8F0",
                          background:
                            activeKsTab === "ks3" ? "#CCFBF1" : "#FFFFFF",
                          color: activeKsTab === "ks3" ? "#0F766E" : "#475569",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer",
                        }}
                      >
                        KS3 (G7–G10){" "}
                        {ks3Assigned.count > 0 &&
                          `• ${ks3Assigned.count}/${ks3Assigned.total}`}
                      </button>
                    )}
                    {schoolOfferings.showKS4 && (
                      <button
                        type="button"
                        onClick={() => setActiveKsTab("ks4")}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid",
                          borderColor:
                            activeKsTab === "ks4" ? "#7C3AED" : "#E2E8F0",
                          background:
                            activeKsTab === "ks4" ? "#EDE9FE" : "#FFFFFF",
                          color: activeKsTab === "ks4" ? "#6D28D9" : "#475569",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer",
                        }}
                      >
                        KS4 (SHS){" "}
                        {ks4Assigned.count > 0 &&
                          `• ${ks4Assigned.count}/${ks4Assigned.total}`}
                      </button>
                    )}

                    {/* Department Head N/A Action */}
                    {designationsNaMap["department_head_keystage"] ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleUndoNa(
                            "department_head_keystage",
                            "Department Head Designate (By Key Stage)",
                          )
                        }
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid #CBD5E1",
                          background: "#F1F5F9",
                          color: "#475569",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        ⚪ Dept Head N/A (Undo)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenNaModal(
                            "department_head_keystage",
                            "Department Head Designate (By Key Stage)",
                          )
                        }
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px dashed #94A3B8",
                          background: "#FFFFFF",
                          color: "#64748B",
                          fontSize: "11px",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        title="Mark Department Head requirement as Not Applicable"
                      >
                        ⚪ Mark Dept Head as N/A
                      </button>
                    )}
                  </div>
                </div>

                {/* N/A Notice Banner for Department Head Designations */}
                {designationsNaMap["department_head_keystage"] && (
                  <div
                    style={{
                      background: "#F8FAFC",
                      border: "1.5px dashed #94A3B8",
                      borderRadius: "12px",
                      padding: "12px 18px",
                      marginBottom: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <FiCheckCircle size={20} color="#64748B" />
                      <div>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: "800",
                            color: "#334155",
                          }}
                        >
                          Department Head Requirement Marked as Not Applicable
                          (N/A)
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748B" }}>
                          School has certified no Department Heads are
                          designated. Workload validation gate is unblocked.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleUndoNa(
                          "department_head_keystage",
                          "Department Head Designate (By Key Stage)",
                        )
                      }
                      style={{
                        background: "#E2E8F0",
                        color: "#1E293B",
                        border: "none",
                        borderRadius: "8px",
                        padding: "6px 14px",
                        fontSize: "11px",
                        fontWeight: "700",
                        cursor: "pointer",
                      }}
                    >
                      Undo N/A & Assign Department Heads
                    </button>
                  </div>
                )}

                {/* --- KEY STAGE 1: KINDER TO GRADE 3 (CHECKLIST WORKFLOW WITH STRICT RESTRICTIONS) --- */}
                {schoolOfferings.showKS1 &&
                  (activeKsTab === "all" || activeKsTab === "ks1") && (
                    <div
                      style={{
                        background: "#FFFBEB",
                        border: "1.5px solid #FDE68A",
                        borderRadius: "16px",
                        padding: "20px",
                        marginBottom: "24px",
                      }}
                    >
                      {/* KS1 Header */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "14px",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "10px",
                              background: "#FEF3C7",
                              border: "1px solid #FDE68A",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#D97706",
                            }}
                          >
                            <FiSmile size={20} />
                          </div>
                          <div>
                            <h4
                              style={{
                                margin: 0,
                                fontSize: "15px",
                                fontWeight: "800",
                                color: "#92400E",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              Key Stage 1: Early Primary (Kinder – Grade 3)
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "800",
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  background: ks1Coverage.isFullyCovered
                                    ? "#DCFCE7"
                                    : "#FEF3C7",
                                  color: ks1Coverage.isFullyCovered
                                    ? "#166534"
                                    : "#92400E",
                                  border: ks1Coverage.isFullyCovered
                                    ? "1px solid #86EFAC"
                                    : "1px solid #FCD34D",
                                }}
                              >
                                {ks1Coverage.isFullyCovered
                                  ? "✓ ALL 4 GRADES COVERED"
                                  : `${ks1Coverage.assignedGrades.length} OF 4 GRADES COVERED`}
                              </span>
                            </h4>
                            <span
                              style={{ fontSize: "11px", color: "#B45309" }}
                            >
                              Check the specific grade levels this Department
                              Head will lead (Kinder, Grade 1, Grade 2, Grade
                              3).
                            </span>
                          </div>
                        </div>

                        {/* Add Another Head Button - Only shown if there are remaining unassigned grades */}
                        {!ks1Coverage.isFullyCovered && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowKs1AssignForm((prev) => !prev);
                              setKs1CheckedGrades(ks1Coverage.unassignedGrades);
                            }}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "8px",
                              border: "1px solid #D97706",
                              background: showKs1AssignForm
                                ? "#FDE68A"
                                : "#D97706",
                              color: showKs1AssignForm ? "#92400E" : "#FFFFFF",
                              fontSize: "11px",
                              fontWeight: "800",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <FiPlus size={13} />
                            <span>
                              {showKs1AssignForm
                                ? "Close Form"
                                : ks1Coverage.assignments.length === 0
                                  ? "Assign Key Stage 1 Head"
                                  : "Assign Another Head"}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* ASSIGNED PERSONNEL LIST IN KS1 */}
                      {ks1Coverage.assignments.length > 0 && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill, minmax(320px, 1fr))",
                            gap: "12px",
                            marginBottom: "16px",
                          }}
                        >
                          {ks1Coverage.assignments.map((item) => {
                            const initials =
                              `${(item.person.firstName || "")[0] || ""}${(item.person.lastName || "")[0] || ""}`.toUpperCase();

                            return (
                              <div
                                key={item.id}
                                style={{
                                  background: "#FFFFFF",
                                  border: "1.5px solid #86EFAC",
                                  borderRadius: "12px",
                                  padding: "14px",
                                  boxShadow:
                                    "0 2px 6px rgba(22, 163, 74, 0.05)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "10px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: "10px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "10px",
                                      minWidth: 0,
                                      flex: 1,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: "34px",
                                        height: "34px",
                                        borderRadius: "50%",
                                        background: "#D97706",
                                        color: "white",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontWeight: "800",
                                        fontSize: "12px",
                                        flexShrink: 0,
                                      }}
                                    >
                                      {initials}
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div
                                        style={{
                                          fontSize: "13px",
                                          fontWeight: "800",
                                          color: "#0F172A",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                        }}
                                      >
                                        {item.person.firstName}{" "}
                                        {item.person.lastName}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "11px",
                                          color: "#64748B",
                                        }}
                                      >
                                        {item.person.position || "Teacher"}
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveKS1Personnel(
                                        item.person.id,
                                        item.keys,
                                      )
                                    }
                                    style={{
                                      background: "#FEE2E2",
                                      color: "#DC2626",
                                      border: "none",
                                      borderRadius: "6px",
                                      padding: "4px 8px",
                                      fontSize: "11px",
                                      fontWeight: "700",
                                      cursor: "pointer",
                                    }}
                                    title="Unassign teacher and free these grade levels"
                                  >
                                    Remove ✕
                                  </button>
                                </div>

                                {/* Checked Grades Badges */}
                                <div>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      color: "#92400E",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.4px",
                                      display: "block",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Assigned Grade Levels:
                                  </span>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: "4px",
                                    }}
                                  >
                                    {KS1_CANONICAL_GRADES.map((g) => {
                                      const isIncluded =
                                        item.grades.includes(g);
                                      const otherOwner =
                                        !isIncluded &&
                                        ks1Coverage.assignedGradesMap[g]
                                          ?.personName;
                                      return (
                                        <span
                                          key={g}
                                          style={{
                                            fontSize: "10px",
                                            fontWeight: "800",
                                            padding: "2px 7px",
                                            borderRadius: "6px",
                                            background: isIncluded
                                              ? "#FEF3C7"
                                              : "#F1F5F9",
                                            color: isIncluded
                                              ? "#92400E"
                                              : "#94A3B8",
                                            border: isIncluded
                                              ? "1px solid #FCD34D"
                                              : "1px solid #E2E8F0",
                                            opacity: isIncluded ? 1 : 0.6,
                                          }}
                                          title={
                                            isIncluded
                                              ? `Designated to ${item.person.firstName} ${item.person.lastName}`
                                              : otherOwner
                                                ? `Designated to ${otherOwner}`
                                                : "Unassigned"
                                          }
                                        >
                                          {isIncluded ? "✓" : "—"} {g}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* UNASSIGNED GRADES ALERT & NEXT PROMPT */}
                      {ks1Coverage.assignments.length > 0 &&
                        ks1Coverage.unassignedGrades.length > 0 && (
                          <div
                            style={{
                              background: "#FFF7ED",
                              border: "1.5px dashed #F97316",
                              borderRadius: "12px",
                              padding: "12px 16px",
                              marginBottom: "16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: "10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                              }}
                            >
                              <FiAlertCircle size={18} color="#EA580C" />
                              <div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: "800",
                                    color: "#9A3412",
                                  }}
                                >
                                  Remaining Unassigned Grades:{" "}
                                  {ks1Coverage.unassignedGrades.join(", ")}
                                </div>
                                <div
                                  style={{ fontSize: "11px", color: "#C2410C" }}
                                >
                                  Who is designated to head{" "}
                                  {ks1Coverage.unassignedGrades.join(" & ")}?
                                </div>
                              </div>
                            </div>

                            {!showKs1AssignForm && (
                              <button
                                type="button"
                                onClick={() => {
                                  setKs1CheckedGrades(
                                    ks1Coverage.unassignedGrades,
                                  );
                                  setShowKs1AssignForm(true);
                                }}
                                style={{
                                  background: "#EA580C",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "8px",
                                  padding: "6px 12px",
                                  fontSize: "11px",
                                  fontWeight: "800",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <FiPlus size={12} /> Assign for{" "}
                                {ks1Coverage.unassignedGrades.join(" & ")} ➔
                              </button>
                            )}
                          </div>
                        )}

                      {/* INTERACTIVE CHECKLIST ASSIGNMENT FORM WITH RESTRICTION LOCKS */}
                      {!ks1Coverage.isFullyCovered &&
                        (showKs1AssignForm ||
                          ks1Coverage.assignments.length === 0) && (
                          <div
                            style={{
                              background: "#FFFFFF",
                              border: "1.5px solid #FCD34D",
                              borderRadius: "14px",
                              padding: "16px",
                              boxShadow: "0 2px 8px rgba(217, 119, 6, 0.06)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "12px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "13px",
                                  fontWeight: "800",
                                  color: "#92400E",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <FiCheckSquare size={16} color="#D97706" /> Key
                                Stage 1 Department Head Assignment Form
                              </div>
                              {ks1Coverage.assignments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setShowKs1AssignForm(false)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#64748B",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                  }}
                                >
                                  ✕ Cancel
                                </button>
                              )}
                            </div>

                            {/* Step 1: Select Teacher from Roster (Excludes Teachers Already Assigned in KS1) */}
                            <div style={{ marginBottom: "14px" }}>
                              <label
                                style={{
                                  display: "block",
                                  fontSize: "11px",
                                  fontWeight: "800",
                                  color: "#334155",
                                  marginBottom: "4px",
                                }}
                              >
                                1. Select Teacher from Roster:
                              </label>
                              {availableKS1Personnel.length === 0 ? (
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#DC2626",
                                    background: "#FEF2F2",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid #FCA5A5",
                                  }}
                                >
                                  All active personnel are already assigned or
                                  unavailable.
                                </div>
                              ) : (
                                <SearchableDropdown
                                  options={availableKS1Personnel.map(
                                    (p) =>
                                      `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                  )}
                                  value={
                                    ks1SelectedTeacherId
                                      ? (() => {
                                          const found =
                                            availableKS1Personnel.find(
                                              (p) =>
                                                String(p.id) ===
                                                String(ks1SelectedTeacherId),
                                            );
                                          return found
                                            ? `${found.firstName} ${found.lastName} (${found.position || "Teacher"})`
                                            : "";
                                        })()
                                      : ""
                                  }
                                  onChange={(val) => {
                                    const found = availableKS1Personnel.find(
                                      (p) =>
                                        `${p.firstName} ${p.lastName} (${p.position || "Teacher"})` ===
                                        val,
                                    );
                                    setKs1SelectedTeacherId(
                                      found ? found.id : "",
                                    );
                                  }}
                                  placeholder="Type or select teacher to designate..."
                                />
                              )}
                            </div>

                            {/* Step 2: Grade Level Checklist with Conflict Locks */}
                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "6px",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                }}
                              >
                                <label
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "800",
                                    color: "#334155",
                                  }}
                                >
                                  2. Checklist — Select Available Grade Levels
                                  for this Department Head:
                                </label>

                                {/* Quick Selection Preset Chips */}
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setKs1CheckedGrades(
                                        ks1Coverage.unassignedGrades,
                                      )
                                    }
                                    style={{
                                      background: "#FEF3C7",
                                      border: "1px solid #FCD34D",
                                      color: "#92400E",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      cursor: "pointer",
                                    }}
                                  >
                                    All Available (
                                    {ks1Coverage.unassignedGrades.length})
                                  </button>
                                  {ks1Coverage.unassignedGrades.includes(
                                    "Kinder",
                                  ) &&
                                    ks1Coverage.unassignedGrades.includes(
                                      "Grade 1",
                                    ) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setKs1CheckedGrades([
                                            "Kinder",
                                            "Grade 1",
                                          ])
                                        }
                                        style={{
                                          background: "#FEF3C7",
                                          border: "1px solid #FCD34D",
                                          color: "#92400E",
                                          padding: "2px 6px",
                                          borderRadius: "4px",
                                          fontSize: "10px",
                                          fontWeight: "700",
                                          cursor: "pointer",
                                        }}
                                      >
                                        Kinder & G1
                                      </button>
                                    )}
                                  {ks1Coverage.unassignedGrades.includes(
                                    "Grade 2",
                                  ) &&
                                    ks1Coverage.unassignedGrades.includes(
                                      "Grade 3",
                                    ) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setKs1CheckedGrades([
                                            "Grade 2",
                                            "Grade 3",
                                          ])
                                        }
                                        style={{
                                          background: "#FEF3C7",
                                          border: "1px solid #FCD34D",
                                          color: "#92400E",
                                          padding: "2px 6px",
                                          borderRadius: "4px",
                                          fontSize: "10px",
                                          fontWeight: "700",
                                          cursor: "pointer",
                                        }}
                                      >
                                        G2 & G3
                                      </button>
                                    )}
                                </div>
                              </div>

                              {/* 4 Interactive Checkbox Tiles with Conflict Locks */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(130px, 1fr))",
                                  gap: "8px",
                                  marginBottom: "14px",
                                }}
                              >
                                {KS1_CANONICAL_GRADES.map((grade) => {
                                  const isAlreadyAssigned =
                                    !!ks1Coverage.assignedGradesMap[grade];
                                  const assignedOwner =
                                    ks1Coverage.assignedGradesMap[grade]
                                      ?.personName;
                                  const isChecked =
                                    ks1CheckedGrades.includes(grade);

                                  if (isAlreadyAssigned) {
                                    return (
                                      <div
                                        key={grade}
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: "4px",
                                          padding: "8px 12px",
                                          borderRadius: "8px",
                                          border: "1px solid #E2E8F0",
                                          background: "#F1F5F9",
                                          cursor: "not-allowed",
                                          userSelect: "none",
                                          opacity: 0.65,
                                        }}
                                        title={`Grade ${grade} is already designated to ${assignedOwner}. Unassign them first.`}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                          }}
                                        >
                                          <FiLock size={14} color="#64748B" />
                                          <span
                                            style={{
                                              fontSize: "12px",
                                              fontWeight: "700",
                                              color: "#64748B",
                                            }}
                                          >
                                            {grade}
                                          </span>
                                        </div>
                                        <span
                                          style={{
                                            fontSize: "9px",
                                            fontWeight: "700",
                                            color: "#94A3B8",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          Assigned: {assignedOwner}
                                        </span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      key={grade}
                                      onClick={() => {
                                        setKs1CheckedGrades((prev) =>
                                          prev.includes(grade)
                                            ? prev.filter((g) => g !== grade)
                                            : [...prev, grade],
                                        );
                                      }}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        border: isChecked
                                          ? "1.5px solid #D97706"
                                          : "1px solid #CBD5E1",
                                        background: isChecked
                                          ? "#FFFBEB"
                                          : "#FFFFFF",
                                        cursor: "pointer",
                                        userSelect: "none",
                                        transition: "all 0.15s ease",
                                      }}
                                    >
                                      {isChecked ? (
                                        <FiCheckSquare
                                          size={16}
                                          color="#D97706"
                                        />
                                      ) : (
                                        <FiSquare size={16} color="#94A3B8" />
                                      )}
                                      <span
                                        style={{
                                          fontSize: "12px",
                                          fontWeight: isChecked ? "800" : "600",
                                          color: isChecked
                                            ? "#92400E"
                                            : "#475569",
                                        }}
                                      >
                                        {grade}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Submit Button */}
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  gap: "8px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={handleAssignKS1Checklist}
                                  disabled={
                                    !ks1SelectedTeacherId ||
                                    ks1CheckedGrades.length === 0
                                  }
                                  style={{
                                    padding: "8px 20px",
                                    borderRadius: "8px",
                                    border: "none",
                                    background:
                                      !ks1SelectedTeacherId ||
                                      ks1CheckedGrades.length === 0
                                        ? "#CBD5E1"
                                        : "#D97706",
                                    color: "#FFFFFF",
                                    fontSize: "12px",
                                    fontWeight: "800",
                                    cursor:
                                      !ks1SelectedTeacherId ||
                                      ks1CheckedGrades.length === 0
                                        ? "not-allowed"
                                        : "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <FiCheck size={14} /> Assign Key Stage 1 Head
                                  (
                                  {ks1CheckedGrades.join(", ") ||
                                    "Select Grades"}
                                  )
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                {/* --- KEY STAGE 2: GRADE 4 TO GRADE 6 (LEARNING AREAS) --- */}
                {schoolOfferings.showKS2 &&
                  (activeKsTab === "all" || activeKsTab === "ks2") && (
                    <div
                      style={{
                        background: "#F0F9FF",
                        border: "1.5px solid #BAE6FD",
                        borderRadius: "16px",
                        padding: "20px",
                        marginBottom: "24px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "14px",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "10px",
                              background: "#E0F2FE",
                              border: "1px solid #BAE6FD",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#0284C7",
                            }}
                          >
                            <FiBookOpen size={20} />
                          </div>
                          <div>
                            <h4
                              style={{
                                margin: 0,
                                fontSize: "15px",
                                fontWeight: "800",
                                color: "#0369A1",
                              }}
                            >
                              Key Stage 2: Intermediate Elementary (Grade 4 –
                              Grade 6)
                            </h4>
                            <span
                              style={{ fontSize: "11px", color: "#0284C7" }}
                            >
                              Department Heads assigned per Primary Learning
                              Area.
                            </span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "800",
                            color: "#0369A1",
                            background: "#E0F2FE",
                            padding: "3px 10px",
                            borderRadius: "999px",
                            border: "1px solid #7DD3FC",
                          }}
                        >
                          {ks2Assigned.count} of {ks2Assigned.total} Learning
                          Areas Assigned
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(280px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        {KS2_LEARNING_AREAS.map((area) => {
                          const targetKey = `DEPARTMENT HEAD - KEY STAGE 2 - ${area.name.toUpperCase()}`;
                          const altKeys = (
                            area.altNames || [area.name.toUpperCase()]
                          ).flatMap((name) => [
                            `DEPARTMENT HEAD - KEY STAGE 2 - ${name}`,
                            `DEPARTMENT HEAD - ${name}`,
                          ]);
                          const assigned = getAssignedPersonnelForKey(
                            targetKey,
                            altKeys,
                          );
                          const isAssigned = assigned.length > 0;
                          const available = activePersonnel.filter(
                            (p) =>
                              !assigned.some(
                                (ap) => String(ap.id) === String(p.id),
                              ),
                          );

                          return (
                            <div
                              key={area.id}
                              style={{
                                background: "#FFFFFF",
                                border: isAssigned
                                  ? "1.5px solid #86EFAC"
                                  : "1px solid #E2E8F0",
                                borderRadius: "12px",
                                padding: "12px 14px",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "8px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                    }}
                                  >
                                    {area.icon}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: "800",
                                      color: "#0F172A",
                                      fontSize: "12px",
                                    }}
                                  >
                                    {area.name}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    padding: "2px 6px",
                                    borderRadius: "999px",
                                    fontSize: "9px",
                                    fontWeight: "800",
                                    background: isAssigned
                                      ? "#DCFCE7"
                                      : "#F1F5F9",
                                    color: isAssigned ? "#166534" : "#64748B",
                                  }}
                                >
                                  {isAssigned ? "ASSIGNED" : "VACANT"}
                                </span>
                              </div>

                              {isAssigned ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                  }}
                                >
                                  {assigned.map((person) => (
                                    <div
                                      key={person.id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        background: "#F8FAFC",
                                        padding: "6px 10px",
                                        borderRadius: "8px",
                                        border: "1px solid #E2E8F0",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          minWidth: 0,
                                          flex: 1,
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: "24px",
                                            height: "24px",
                                            borderRadius: "50%",
                                            background: "#0284C7",
                                            color: "white",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: "800",
                                            fontSize: "10px",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {(person.firstName || "")[0]}
                                          {(person.lastName || "")[0]}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "11px",
                                            fontWeight: "800",
                                            color: "#0F172A",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                        >
                                          {person.firstName} {person.lastName}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemovePersonnel(
                                            person.id,
                                            targetKey,
                                          )
                                        }
                                        style={{
                                          background: "#FEE2E2",
                                          color: "#DC2626",
                                          border: "none",
                                          borderRadius: "4px",
                                          padding: "2px 6px",
                                          fontSize: "10px",
                                          fontWeight: "700",
                                          cursor: "pointer",
                                          flexShrink: 0,
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}

                                  {showAddPersonnelMap[targetKey] ? (
                                    <div
                                      style={{
                                        marginTop: "4px",
                                        padding: "8px",
                                        background: "#F0F9FF",
                                        border: "1px solid #BAE6FD",
                                        borderRadius: "8px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          marginBottom: "4px",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "11px",
                                            fontWeight: "700",
                                            color: "#0369A1",
                                          }}
                                        >
                                          Add Personnel
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleAddPersonnel(targetKey, false)
                                          }
                                          style={{
                                            background: "none",
                                            border: "none",
                                            color: "#64748B",
                                            cursor: "pointer",
                                          }}
                                        >
                                          <FiX size={12} />
                                        </button>
                                      </div>
                                      <SearchableDropdown
                                        compact
                                        options={activePersonnel
                                          .filter(
                                            (p) =>
                                              !assigned.some(
                                                (ap) =>
                                                  String(ap.id) ===
                                                  String(p.id),
                                              ),
                                          )
                                          .map(
                                            (p) =>
                                              `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                          )}
                                        value=""
                                        onChange={(val) => {
                                          const p = activePersonnel.find(
                                            (person) =>
                                              `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                              val,
                                          );
                                          if (p) {
                                            handleAssignDirectKey(
                                              targetKey,
                                              p.id,
                                            );
                                            toggleAddPersonnel(
                                              targetKey,
                                              false,
                                            );
                                          }
                                        }}
                                        placeholder="Select teacher..."
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAddPersonnel(targetKey, true)
                                      }
                                      style={{
                                        background: "#F0FDF4",
                                        color: "#15803D",
                                        border: "1px dashed #86EFAC",
                                        borderRadius: "6px",
                                        padding: "4px 8px",
                                        fontSize: "10.5px",
                                        fontWeight: "700",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <FiPlus size={11} /> + Add Personnel
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <SearchableDropdown
                                  options={available.map(
                                    (p) =>
                                      `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                  )}
                                  value=""
                                  onChange={(val) => {
                                    const p = available.find(
                                      (person) =>
                                        `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                        val,
                                    );
                                    if (p)
                                      handleAssignDirectKey(targetKey, p.id);
                                  }}
                                  placeholder={`Assign ${area.name} Head...`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* --- KEY STAGE 3: GRADE 7 TO GRADE 10 (JUNIOR HIGH SCHOOL) --- */}
                {schoolOfferings.showKS3 &&
                  (activeKsTab === "all" || activeKsTab === "ks3") && (
                    <div
                      style={{
                        background: "#F0FDFA",
                        border: "1.5px solid #99F6E4",
                        borderRadius: "16px",
                        padding: "20px",
                        marginBottom: "24px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "14px",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "10px",
                              background: "#CCFBF1",
                              border: "1px solid #99F6E4",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#0D9488",
                            }}
                          >
                            <FiAward size={20} />
                          </div>
                          <div>
                            <h4
                              style={{
                                margin: 0,
                                fontSize: "15px",
                                fontWeight: "800",
                                color: "#0F766E",
                              }}
                            >
                              Key Stage 3: Junior High School (Grade 7 – Grade
                              10)
                            </h4>
                            <span
                              style={{ fontSize: "11px", color: "#0D9488" }}
                            >
                              Department Heads assigned per JHS Learning Area.
                            </span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "800",
                            color: "#0F766E",
                            background: "#CCFBF1",
                            padding: "3px 10px",
                            borderRadius: "999px",
                            border: "1px solid #5EEAD4",
                          }}
                        >
                          {ks3Assigned.count} of {ks3Assigned.total} Learning
                          Areas Assigned
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(280px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        {KS3_LEARNING_AREAS.map((area) => {
                          const targetKey = `DEPARTMENT HEAD - KEY STAGE 3 - ${area.name.toUpperCase()}`;
                          const altKeys = (
                            area.altNames || [area.name.toUpperCase()]
                          ).flatMap((name) => [
                            `DEPARTMENT HEAD - KEY STAGE 3 - ${name}`,
                            `DEPARTMENT HEAD - ${name}`,
                          ]);
                          const assigned = getAssignedPersonnelForKey(
                            targetKey,
                            altKeys,
                          );
                          const isAssigned = assigned.length > 0;
                          const available = activePersonnel.filter(
                            (p) =>
                              !assigned.some(
                                (ap) => String(ap.id) === String(p.id),
                              ),
                          );

                          return (
                            <div
                              key={area.id}
                              style={{
                                background: "#FFFFFF",
                                border: isAssigned
                                  ? "1.5px solid #86EFAC"
                                  : "1px solid #E2E8F0",
                                borderRadius: "12px",
                                padding: "12px 14px",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "8px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                    }}
                                  >
                                    {area.icon}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: "800",
                                      color: "#0F172A",
                                      fontSize: "12px",
                                    }}
                                  >
                                    {area.name}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    padding: "2px 6px",
                                    borderRadius: "999px",
                                    fontSize: "9px",
                                    fontWeight: "800",
                                    background: isAssigned
                                      ? "#DCFCE7"
                                      : "#F1F5F9",
                                    color: isAssigned ? "#166534" : "#64748B",
                                  }}
                                >
                                  {isAssigned ? "ASSIGNED" : "VACANT"}
                                </span>
                              </div>

                              {isAssigned ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                  }}
                                >
                                  {assigned.map((person) => (
                                    <div
                                      key={person.id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        background: "#F8FAFC",
                                        padding: "6px 10px",
                                        borderRadius: "8px",
                                        border: "1px solid #E2E8F0",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          minWidth: 0,
                                          flex: 1,
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: "24px",
                                            height: "24px",
                                            borderRadius: "50%",
                                            background: "#0D9488",
                                            color: "white",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: "800",
                                            fontSize: "10px",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {(person.firstName || "")[0]}
                                          {(person.lastName || "")[0]}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "11px",
                                            fontWeight: "800",
                                            color: "#0F172A",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                        >
                                          {person.firstName} {person.lastName}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemovePersonnel(
                                            person.id,
                                            targetKey,
                                          )
                                        }
                                        style={{
                                          background: "#FEE2E2",
                                          color: "#DC2626",
                                          border: "none",
                                          borderRadius: "4px",
                                          padding: "2px 6px",
                                          fontSize: "10px",
                                          fontWeight: "700",
                                          cursor: "pointer",
                                          flexShrink: 0,
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}

                                  {showAddPersonnelMap[targetKey] ? (
                                    <div
                                      style={{
                                        marginTop: "4px",
                                        padding: "8px",
                                        background: "#F0F9FF",
                                        border: "1px solid #BAE6FD",
                                        borderRadius: "8px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          marginBottom: "4px",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "11px",
                                            fontWeight: "700",
                                            color: "#0F766E",
                                          }}
                                        >
                                          Add Personnel
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleAddPersonnel(targetKey, false)
                                          }
                                          style={{
                                            background: "none",
                                            border: "none",
                                            color: "#64748B",
                                            cursor: "pointer",
                                          }}
                                        >
                                          <FiX size={12} />
                                        </button>
                                      </div>
                                      <SearchableDropdown
                                        compact
                                        options={activePersonnel
                                          .filter(
                                            (p) =>
                                              !assigned.some(
                                                (ap) =>
                                                  String(ap.id) ===
                                                  String(p.id),
                                              ),
                                          )
                                          .map(
                                            (p) =>
                                              `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                          )}
                                        value=""
                                        onChange={(val) => {
                                          const p = activePersonnel.find(
                                            (person) =>
                                              `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                              val,
                                          );
                                          if (p) {
                                            handleAssignDirectKey(
                                              targetKey,
                                              p.id,
                                            );
                                            toggleAddPersonnel(
                                              targetKey,
                                              false,
                                            );
                                          }
                                        }}
                                        placeholder="Select teacher..."
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAddPersonnel(targetKey, true)
                                      }
                                      style={{
                                        background: "#F0FDF4",
                                        color: "#15803D",
                                        border: "1px dashed #86EFAC",
                                        borderRadius: "6px",
                                        padding: "4px 8px",
                                        fontSize: "10.5px",
                                        fontWeight: "700",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <FiPlus size={11} /> + Add Personnel
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <SearchableDropdown
                                  options={available.map(
                                    (p) =>
                                      `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                  )}
                                  value=""
                                  onChange={(val) => {
                                    const p = available.find(
                                      (person) =>
                                        `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                        val,
                                    );
                                    if (p)
                                      handleAssignDirectKey(targetKey, p.id);
                                  }}
                                  placeholder={`Assign ${area.name} Head...`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* --- KEY STAGE 4: GRADE 11 TO GRADE 12 (SENIOR HIGH SCHOOL) --- */}
                {schoolOfferings.showKS4 &&
                  (activeKsTab === "all" || activeKsTab === "ks4") && (
                    <div
                      style={{
                        background: "#FAF5FF",
                        border: "1.5px solid #DDD6FE",
                        borderRadius: "16px",
                        padding: "20px",
                        marginBottom: "24px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "14px",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "10px",
                              background: "#EDE9FE",
                              border: "1px solid #DDD6FE",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#7C3AED",
                            }}
                          >
                            <FiLayers size={20} />
                          </div>
                          <div>
                            <h4
                              style={{
                                margin: 0,
                                fontSize: "15px",
                                fontWeight: "800",
                                color: "#6D28D9",
                              }}
                            >
                              Key Stage 4: Senior High School (Grade 11 – Grade
                              12)
                            </h4>
                            <span
                              style={{ fontSize: "11px", color: "#7C3AED" }}
                            >
                              Designate exactly 2 Track Department Heads
                              (Academic Track & Tech-Pro Track).
                            </span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "800",
                            color: "#6D28D9",
                            background: "#EDE9FE",
                            padding: "3px 10px",
                            borderRadius: "999px",
                            border: "1px solid #C4B5FD",
                          }}
                        >
                          {ks4Assigned.count} of 2 Tracks Assigned
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(320px, 1fr))",
                          gap: "14px",
                        }}
                      >
                        {KS4_TRACKS_LIST.map((track) => {
                          const assigned = getAssignedPersonnelForKey(
                            track.key,
                            track.altKeys,
                          );
                          const isAssigned = assigned.length > 0;
                          const available = activePersonnel.filter(
                            (p) => !isAssignedToKey(p.designation, track.key),
                          );

                          return (
                            <div
                              key={track.id}
                              style={{
                                background: "#FFFFFF",
                                border: isAssigned
                                  ? "1.5px solid #86EFAC"
                                  : "1.5px solid #DDD6FE",
                                borderRadius: "12px",
                                padding: "16px",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                  marginBottom: "10px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "32px",
                                      height: "32px",
                                      borderRadius: "8px",
                                      background: "#FAF5FF",
                                      border: "1px solid #DDD6FE",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {track.icon}
                                  </div>
                                  <div>
                                    <h5
                                      style={{
                                        margin: 0,
                                        fontSize: "13px",
                                        fontWeight: "800",
                                        color: "#4C1D95",
                                      }}
                                    >
                                      {track.name} Department Head
                                    </h5>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#64748B",
                                        marginTop: "2px",
                                      }}
                                    >
                                      {track.description}
                                    </div>
                                  </div>
                                </div>
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "999px",
                                    fontSize: "10px",
                                    fontWeight: "800",
                                    background: isAssigned
                                      ? "#DCFCE7"
                                      : "#FAF5FF",
                                    color: isAssigned ? "#166534" : "#6D28D9",
                                    border: isAssigned
                                      ? "1px solid #86EFAC"
                                      : "1px solid #C4B5FD",
                                    flexShrink: 0,
                                  }}
                                >
                                  {isAssigned ? "ASSIGNED" : "VACANT"}
                                </span>
                              </div>

                              {isAssigned ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                  }}
                                >
                                  {assigned.map((person) => (
                                    <div
                                      key={person.id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        background: "#F8FAFC",
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        border: "1px solid #E2E8F0",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "8px",
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: "28px",
                                            height: "28px",
                                            borderRadius: "50%",
                                            background: "#7C3AED",
                                            color: "white",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: "800",
                                            fontSize: "11px",
                                          }}
                                        >
                                          {(person.firstName || "")[0]}
                                          {(person.lastName || "")[0]}
                                        </div>
                                        <div>
                                          <div
                                            style={{
                                              fontSize: "12px",
                                              fontWeight: "800",
                                              color: "#0F172A",
                                            }}
                                          >
                                            {person.firstName} {person.lastName}
                                          </div>
                                          <div
                                            style={{
                                              fontSize: "10px",
                                              color: "#64748B",
                                            }}
                                          >
                                            {person.position || "Teacher"}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemovePersonnel(
                                            person.id,
                                            track.key,
                                          )
                                        }
                                        style={{
                                          background: "#FEE2E2",
                                          color: "#DC2626",
                                          border: "none",
                                          borderRadius: "6px",
                                          padding: "4px 8px",
                                          fontSize: "11px",
                                          fontWeight: "700",
                                          cursor: "pointer",
                                        }}
                                      >
                                        Remove ✕
                                      </button>
                                    </div>
                                  ))}

                                  {showAddPersonnelMap[track.key] ? (
                                    <div
                                      style={{
                                        marginTop: "4px",
                                        padding: "8px",
                                        background: "#FAF5FF",
                                        border: "1px solid #DDD6FE",
                                        borderRadius: "8px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          marginBottom: "4px",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "11px",
                                            fontWeight: "700",
                                            color: "#6D28D9",
                                          }}
                                        >
                                          Add Track Head
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleAddPersonnel(track.key, false)
                                          }
                                          style={{
                                            background: "none",
                                            border: "none",
                                            color: "#64748B",
                                            cursor: "pointer",
                                          }}
                                        >
                                          <FiX size={12} />
                                        </button>
                                      </div>
                                      <SearchableDropdown
                                        compact
                                        options={activePersonnel
                                          .filter(
                                            (p) =>
                                              !assigned.some(
                                                (ap) =>
                                                  String(ap.id) ===
                                                  String(p.id),
                                              ),
                                          )
                                          .map(
                                            (p) =>
                                              `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                          )}
                                        value=""
                                        onChange={(val) => {
                                          const p = activePersonnel.find(
                                            (person) =>
                                              `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                              val,
                                          );
                                          if (p) {
                                            handleAssignDirectKey(
                                              track.key,
                                              p.id,
                                            );
                                            toggleAddPersonnel(
                                              track.key,
                                              false,
                                            );
                                          }
                                        }}
                                        placeholder="Select teacher..."
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAddPersonnel(track.key, true)
                                      }
                                      style={{
                                        background: "#FAF5FF",
                                        color: "#6D28D9",
                                        border: "1px dashed #C4B5FD",
                                        borderRadius: "6px",
                                        padding: "4px 8px",
                                        fontSize: "10.5px",
                                        fontWeight: "700",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <FiPlus size={11} /> + Add Personnel
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <SearchableDropdown
                                  options={available.map(
                                    (p) =>
                                      `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                  )}
                                  value=""
                                  onChange={(val) => {
                                    const p = available.find(
                                      (person) =>
                                        `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                        val,
                                    );
                                    if (p)
                                      handleAssignDirectKey(track.key, p.id);
                                  }}
                                  placeholder={`Select teacher as ${track.name} Head...`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>

              {/* SECTION 3: ADDITIONAL SCHOOL COORDINATORS & COMMITTEE CHAIRPERSONS */}
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "16px",
                    paddingBottom: "14px",
                    borderBottom: "1.5px solid var(--line)",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "16px",
                        fontWeight: "800",
                        color: "var(--navy)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <FiBookmark size={18} color="#0D9488" /> Section 3: School
                      Coordinators & Committee Chairpersons
                    </h3>
                    <p
                      style={{
                        margin: "3px 0 0",
                        fontSize: "12px",
                        color: "#64748B",
                      }}
                    >
                      Assign program coordinators (Reading, ICT, Sports,
                      Research, SNED, SELG), Grade Level Chairs, or Subject
                      Leaders.
                    </p>
                  </div>

                  {/* GLOWING ADD DESIGNATION BUTTON */}
                  <button
                    type="button"
                    onClick={() => openAddModal()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "9px",
                      padding: "10px 22px",
                      fontSize: "13px",
                      fontWeight: "800",
                      borderRadius: "12px",
                      border: "none",
                      background:
                        "linear-gradient(135deg, #0284C7 0%, #0369A1 100%)",
                      color: "#FFFFFF",
                      cursor: "pointer",
                      animation: "pulseGlow 2.2s infinite ease-in-out",
                      transition: "all 0.2s ease",
                      userSelect: "none",
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#38BDF8",
                        animation: "beaconBlink 1.4s infinite ease-in-out",
                        display: "inline-block",
                      }}
                    />
                    <FiPlus size={16} strokeWidth={2.5} />
                    <span>+ Add Designation</span>
                  </button>
                </div>

                {filteredAdditionalAssignments.length === 0 ? (
                  <div
                    style={{
                      background:
                        "linear-gradient(180deg, #F8FAFC 0%, #F0F9FF 100%)",
                      border: "2px dashed #7DD3FC",
                      borderRadius: "18px",
                      padding: "36px 24px",
                      textAlign: "center",
                      maxWidth: "720px",
                      margin: "0 auto",
                      boxShadow: "0 4px 16px rgba(2, 132, 199, 0.05)",
                    }}
                  >
                    <div
                      style={{
                        width: "58px",
                        height: "58px",
                        borderRadius: "50%",
                        background: "#E0F2FE",
                        color: "#0284C7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px",
                      }}
                    >
                      <FiLayers size={28} />
                    </div>

                    <h4
                      style={{
                        margin: "0 0 6px",
                        fontSize: "16px",
                        fontWeight: "800",
                        color: "#0F172A",
                      }}
                    >
                      Add School Program Coordinators & Chairpersons
                    </h4>
                    <p
                      style={{
                        margin: "0 0 16px",
                        fontSize: "13px",
                        color: "#475569",
                        lineHeight: "1.5",
                        maxWidth: "540px",
                        marginLeft: "auto",
                        marginRight: "auto",
                      }}
                    >
                      Does your school have designated faculty for any of the
                      following roles? Click a quick-role below or click the Add
                      button:
                    </p>

                    {/* Quick-Pick Role Chips with Feather Icons */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        justifyContent: "center",
                        marginBottom: "22px",
                      }}
                    >
                      {[
                        {
                          id: "reading_literacy_numeracy",
                          label: "Reading / Literacy Coordinator",
                          icon: <FiBookOpen size={12} color="#0284C7" />,
                        },
                        {
                          id: "ict_coordinator",
                          label: "ICT School Coordinator",
                          icon: <FiMonitor size={12} color="#0284C7" />,
                        },
                        {
                          id: "grade_level_chairperson",
                          label: "Grade Level Chairperson",
                          icon: <FiUsers size={12} color="#0284C7" />,
                        },
                        {
                          id: "learning_area_chairperson",
                          label: "Learning Area Chairperson",
                          icon: <FiLayers size={12} color="#0284C7" />,
                        },
                        {
                          id: "sports_development_adviser",
                          label: "Sports Programs Adviser",
                          icon: <FiAward size={12} color="#0284C7" />,
                        },
                        {
                          id: "research_coordinator",
                          label: "Research Coordinator",
                          icon: <FiSearch size={12} color="#0284C7" />,
                        },
                        {
                          id: "sned_coordinator",
                          label: "SNED Coordinator",
                          icon: <FiTarget size={12} color="#0284C7" />,
                        },
                        {
                          id: "selg_sslg_adviser",
                          label: "SELG / SSLG Adviser",
                          icon: <FiShield size={12} color="#0284C7" />,
                        },
                      ].map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => openAddModal(chip.id)}
                          style={{
                            background: "#FFFFFF",
                            border: "1px solid #BAE6FD",
                            color: "#0369A1",
                            padding: "6px 12px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            transition: "all 0.15s ease",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#E0F2FE";
                            e.currentTarget.style.borderColor = "#0284C7";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#FFFFFF";
                            e.currentTarget.style.borderColor = "#BAE6FD";
                          }}
                        >
                          {chip.icon}
                          <span>{chip.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Central Glowing Button */}
                    <button
                      type="button"
                      onClick={() => openAddModal()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "12px 28px",
                        fontSize: "14px",
                        fontWeight: "800",
                        borderRadius: "12px",
                        border: "none",
                        background:
                          "linear-gradient(135deg, #0284C7 0%, #0369A1 100%)",
                        color: "#FFFFFF",
                        cursor: "pointer",
                        animation: "pulseGlow 2.2s infinite ease-in-out",
                        boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
                      }}
                    >
                      <span
                        style={{
                          width: "9px",
                          height: "9px",
                          borderRadius: "50%",
                          background: "#38BDF8",
                          animation: "beaconBlink 1.4s infinite ease-in-out",
                          display: "inline-block",
                        }}
                      />
                      <FiPlus size={18} strokeWidth={2.5} />
                      <span>+ Add School Designation</span>
                    </button>
                  </div>
                ) : (
                  /* Active Additional Designation Cards Grid */
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(360px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {filteredAdditionalAssignments.map((item) => {
                      const initials =
                        `${(item.person.firstName || "")[0] || ""}${(item.person.lastName || "")[0] || ""}`.toUpperCase();

                      return (
                        <div
                          key={item.id}
                          className="ks-card"
                          style={{
                            background: "#FFFFFF",
                            border: "1.5px solid #BAE6FD",
                            borderRadius: "14px",
                            padding: "16px",
                            boxShadow: "0 2px 8px rgba(2, 132, 199, 0.06)",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: "8px",
                                marginBottom: "8px",
                              }}
                            >
                              <div>
                                <span
                                  style={{
                                    display: "inline-block",
                                    fontSize: "11px",
                                    fontWeight: "800",
                                    color: "#0369A1",
                                    background: "#EFF6FF",
                                    border: "1px solid #BFDBFE",
                                    borderRadius: "6px",
                                    padding: "3px 8px",
                                    marginBottom: "4px",
                                  }}
                                >
                                  {item.category}
                                </span>
                                {item.parameter && (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      marginLeft: "6px",
                                      fontSize: "11px",
                                      fontWeight: "800",
                                      color: "#0F766E",
                                      background: "#F0FDFA",
                                      border: "1px solid #99F6E4",
                                      borderRadius: "6px",
                                      padding: "3px 8px",
                                    }}
                                  >
                                    {item.parameter}
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRemovePersonnel(
                                    item.person.id,
                                    item.cleanKey,
                                  )
                                }
                                style={{
                                  background: "#FEE2E2",
                                  color: "#DC2626",
                                  border: "none",
                                  borderRadius: "6px",
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                                title="Remove designation"
                              >
                                Remove ✕
                              </button>
                            </div>

                            <div
                              style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: "10px",
                                padding: "10px 12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                marginTop: "6px",
                              }}
                            >
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  background: "#0D9488",
                                  color: "white",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: "800",
                                  fontSize: "12px",
                                  flexShrink: 0,
                                }}
                              >
                                {initials}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: "800",
                                    color: "#0F172A",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {item.person.firstName} {item.person.lastName}
                                </div>
                                <div
                                  style={{ fontSize: "11px", color: "#64748B" }}
                                >
                                  {item.person.position || "Teacher"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MATRIX VIEW MODE */}
          {viewMode === "matrix" && (
            <div
              style={{
                overflowX: "auto",
                border: "1.5px solid var(--line)",
                borderRadius: "14px",
                background: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#F8FAFC",
                      borderBottom: "2px solid var(--line)",
                    }}
                  >
                    <th
                      style={{
                        padding: "12px 16px",
                        fontWeight: "800",
                        color: "var(--navy)",
                      }}
                    >
                      Designation Category / Name
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontWeight: "800",
                        color: "var(--navy)",
                        width: "280px",
                      }}
                    >
                      Assigned Personnel
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontWeight: "800",
                        color: "var(--navy)",
                      }}
                    >
                      Status / Requirement
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontWeight: "800",
                        color: "var(--navy)",
                        minWidth: "220px",
                      }}
                    >
                      Quick Assign
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Group 1: Core Roles */}
                  <tr style={{ background: "#F1F5F9" }}>
                    <td
                      colSpan="4"
                      style={{
                        padding: "8px 16px",
                        fontWeight: "800",
                        color: "#0369A1",
                        fontSize: "11px",
                        letterSpacing: "0.5px",
                      }}
                    >
                      SECTION 1: CORE SCHOOL DESIGNATIONS
                    </td>
                  </tr>
                  {mandatoryRoles.map((role, idx) => {
                    const assignedPersonnel = getAssignedPersonnelForKey(
                      role.canonicalKey,
                      role.altKeys,
                    );
                    const isAssigned = assignedPersonnel.length > 0;
                    const isNa = !!designationsNaMap[role.id];
                    const availablePersonnel = activePersonnel.filter(
                      (p) => !isAssignedToKey(p.designation, role.canonicalKey),
                    );

                    return (
                      <tr
                        key={role.id}
                        style={{
                          borderBottom: "1px solid var(--line)",
                          background: idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                        }}
                      >
                        <td
                          style={{ padding: "14px 16px", verticalAlign: "top" }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: "800",
                                color: isNa ? "#64748B" : "var(--navy)",
                                fontSize: "13px",
                              }}
                            >
                              {role.name}
                            </span>
                            <span
                              style={{
                                padding: "1px 5px",
                                borderRadius: "4px",
                                background: isNa ? "#F1F5F9" : "#FEF2F2",
                                color: isNa ? "#64748B" : "#DC2626",
                                fontSize: "9px",
                                fontWeight: "800",
                                border: isNa
                                  ? "1px solid #CBD5E1"
                                  : "1px solid #FCA5A5",
                              }}
                            >
                              {isNa ? "⚪ N/A" : "* REQUIRED"}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#64748B",
                              marginTop: "2px",
                            }}
                          >
                            {role.description}
                          </div>
                          <code
                            style={{
                              display: "inline-block",
                              background: "#E0F2FE",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              color: "#0369A1",
                              fontSize: "10px",
                              marginTop: "6px",
                            }}
                          >
                            {role.canonicalKey}
                          </code>
                        </td>

                        <td
                          style={{ padding: "14px 16px", verticalAlign: "top" }}
                        >
                          {isAssigned ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              {assignedPersonnel.map((person) => (
                                <div
                                  key={person.id}
                                  style={{
                                    background: "#EFF6FF",
                                    border: "1px solid #BAE6FD",
                                    padding: "8px 10px",
                                    borderRadius: "8px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontWeight: "800",
                                      color: "#0369A1",
                                      fontSize: "12px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    <FiUser size={12} /> {person.firstName}{" "}
                                    {person.lastName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemovePersonnel(
                                        person.id,
                                        role.canonicalKey,
                                      )
                                    }
                                    style={{
                                      background: "#FEE2E2",
                                      color: "#EF4444",
                                      border: "none",
                                      borderRadius: "4px",
                                      padding: "2px 6px",
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      cursor: "pointer",
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : isNa ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "999px",
                                  background: "#F1F5F9",
                                  color: "#475569",
                                  fontSize: "11px",
                                  fontWeight: "800",
                                  border: "1px solid #CBD5E1",
                                }}
                              >
                                ⚪ N/A (Not Applicable)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUndoNa(role.id, role.name)}
                                style={{
                                  background: "#E2E8F0",
                                  color: "#334155",
                                  border: "none",
                                  borderRadius: "4px",
                                  padding: "3px 8px",
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                              >
                                Undo
                              </button>
                            </div>
                          ) : (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: "#FEF2F2",
                                color: "#DC2626",
                                fontSize: "11px",
                                fontWeight: "800",
                                border: "1px solid #FCA5A5",
                              }}
                            >
                              Vacant (Required)
                            </span>
                          )}
                        </td>

                        <td
                          style={{ padding: "14px 16px", verticalAlign: "top" }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: "700",
                              color: isAssigned
                                ? "#15803D"
                                : isNa
                                  ? "#64748B"
                                  : "#DC2626",
                            }}
                          >
                            {isAssigned
                              ? "✓ Compliant"
                              : isNa
                                ? "⚪ Not Applicable"
                                : "⚠ Action Required"}
                          </span>
                        </td>

                        <td
                          style={{ padding: "14px 16px", verticalAlign: "top" }}
                        >
                          {!isNa && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              <SearchableDropdown
                                options={activePersonnel
                                  .filter(
                                    (p) =>
                                      !assignedPersonnel.some(
                                        (ap) => String(ap.id) === String(p.id),
                                      ),
                                  )
                                  .map(
                                    (p) =>
                                      `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                  )}
                                value=""
                                onChange={(val) => {
                                  const p = activePersonnel.find(
                                    (person) =>
                                      `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                      val,
                                  );
                                  if (p)
                                    handleAssignDirectKey(
                                      role.canonicalKey,
                                      p.id,
                                    );
                                }}
                                placeholder={`+ Add / Assign ${role.name}...`}
                              />
                              {!isAssigned && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenNaModal(role.id, role.name)
                                  }
                                  style={{
                                    alignSelf: "flex-end",
                                    background: "transparent",
                                    border: "1px dashed #94A3B8",
                                    borderRadius: "4px",
                                    padding: "2px 8px",
                                    fontSize: "10px",
                                    fontWeight: "700",
                                    color: "#64748B",
                                    cursor: "pointer",
                                  }}
                                >
                                  ⚪ Mark N/A
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Group 2: Key Stage Department Heads */}
                  <tr style={{ background: "#FEF3C7" }}>
                    <td
                      colSpan="4"
                      style={{
                        padding: "8px 16px",
                        fontWeight: "800",
                        color: "#92400E",
                        fontSize: "11px",
                        letterSpacing: "0.5px",
                      }}
                    >
                      SECTION 2: DEPARTMENT HEAD DESIGNATIONS (BY KEY STAGE)
                    </td>
                  </tr>

                  {/* KS1 Matrix Row */}
                  {schoolOfferings.showKS1 && (
                    <tr
                      style={{
                        borderBottom: "1px solid var(--line)",
                        background: "#FFFFFF",
                      }}
                    >
                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        <div
                          style={{
                            fontWeight: "800",
                            color: "#92400E",
                            fontSize: "13px",
                          }}
                        >
                          Key Stage 1 (Kinder – Grade 3)
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#64748B",
                            marginTop: "2px",
                          }}
                        >
                          Early primary foundational literacy & numeracy lead.
                        </div>
                        <div style={{ marginTop: "6px" }}>
                          {KS1_CANONICAL_GRADES.map((g) => (
                            <span
                              key={g}
                              style={{
                                display: "inline-block",
                                marginRight: "4px",
                                fontSize: "9px",
                                fontWeight: "700",
                                padding: "1px 5px",
                                borderRadius: "4px",
                                background: ks1Coverage.assignedGrades.includes(
                                  g,
                                )
                                  ? "#FEF3C7"
                                  : "#F1F5F9",
                                color: ks1Coverage.assignedGrades.includes(g)
                                  ? "#92400E"
                                  : "#94A3B8",
                                border: ks1Coverage.assignedGrades.includes(g)
                                  ? "1px solid #FCD34D"
                                  : "1px solid #E2E8F0",
                              }}
                            >
                              {ks1Coverage.assignedGrades.includes(g)
                                ? "✓"
                                : "—"}{" "}
                              {g}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        {ks1Coverage.assignments.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            }}
                          >
                            {ks1Coverage.assignments.map((item) => (
                              <div
                                key={item.id}
                                style={{
                                  background: "#FEF3C7",
                                  border: "1px solid #FDE68A",
                                  padding: "6px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: "800",
                                  color: "#92400E",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span>
                                  {item.person.firstName} {item.person.lastName}{" "}
                                  ({item.grades.join(", ")})
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveKS1Personnel(
                                      item.person.id,
                                      item.keys,
                                    )
                                  }
                                  style={{
                                    background: "#FEE2E2",
                                    color: "#DC2626",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "1px 4px",
                                    fontSize: "9px",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#94A3B8", fontSize: "11px" }}>
                            Vacant
                          </span>
                        )}
                      </td>
                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            color: ks1Coverage.isFullyCovered
                              ? "#15803D"
                              : "#D97706",
                          }}
                        >
                          {ks1Coverage.isFullyCovered
                            ? "✓ 4/4 Covered"
                            : `${ks1Coverage.assignedGrades.length}/4 Covered`}
                        </span>
                      </td>
                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode("card");
                            setActiveKsTab("ks1");
                            setShowKs1AssignForm(true);
                          }}
                          style={{
                            background: "#FEF3C7",
                            border: "1px solid #D97706",
                            color: "#92400E",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          Configure Checklist ➔
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* KS2 Matrix Rows */}
                  {schoolOfferings.showKS2 &&
                    KS2_LEARNING_AREAS.map((area) => {
                      const targetKey = `DEPARTMENT HEAD - KEY STAGE 2 - ${area.name.toUpperCase()}`;
                      const assigned = getAssignedPersonnelForKey(targetKey, [
                        `DEPARTMENT HEAD - ${area.name.toUpperCase()}`,
                      ]);
                      const isAssigned = assigned.length > 0;
                      const available = activePersonnel.filter(
                        (p) => !isAssignedToKey(p.designation, targetKey),
                      );

                      return (
                        <tr
                          key={area.id}
                          style={{
                            borderBottom: "1px solid var(--line)",
                            background: "#FFFFFF",
                          }}
                        >
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "800",
                                color: "#0369A1",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span>{area.icon}</span>{" "}
                              <span>Key Stage 2: {area.name}</span>
                            </div>
                            <code
                              style={{ fontSize: "10px", color: "#64748B" }}
                            >
                              {targetKey}
                            </code>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            {isAssigned ? (
                              <div
                                style={{
                                  background: "#EFF6FF",
                                  border: "1px solid #BAE6FD",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "800",
                                    color: "#0369A1",
                                    fontSize: "11px",
                                  }}
                                >
                                  {assigned[0].firstName} {assigned[0].lastName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePersonnel(
                                      assigned[0].id,
                                      targetKey,
                                    )
                                  }
                                  style={{
                                    background: "#FEE2E2",
                                    color: "#EF4444",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "2px 5px",
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span
                                style={{ color: "#94A3B8", fontSize: "11px" }}
                              >
                                Vacant
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#0284C7",
                                fontWeight: "700",
                              }}
                            >
                              KS2 Learning Area
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            {!isAssigned && (
                              <SearchableDropdown
                                options={available.map(
                                  (p) =>
                                    `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                )}
                                value=""
                                onChange={(val) => {
                                  const p = available.find(
                                    (person) =>
                                      `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                      val,
                                  );
                                  if (p) handleAssignDirectKey(targetKey, p.id);
                                }}
                                placeholder={`Assign ${area.name}...`}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}

                  {/* KS3 Matrix Rows */}
                  {schoolOfferings.showKS3 &&
                    KS3_LEARNING_AREAS.map((area) => {
                      const targetKey = `DEPARTMENT HEAD - KEY STAGE 3 - ${area.name.toUpperCase()}`;
                      const assigned = getAssignedPersonnelForKey(targetKey, [
                        `DEPARTMENT HEAD - ${area.name.toUpperCase()}`,
                      ]);
                      const isAssigned = assigned.length > 0;
                      const available = activePersonnel.filter(
                        (p) => !isAssignedToKey(p.designation, targetKey),
                      );

                      return (
                        <tr
                          key={area.id}
                          style={{
                            borderBottom: "1px solid var(--line)",
                            background: "#FFFFFF",
                          }}
                        >
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "800",
                                color: "#0F766E",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span>{area.icon}</span>{" "}
                              <span>Key Stage 3: {area.name}</span>
                            </div>
                            <code
                              style={{ fontSize: "10px", color: "#64748B" }}
                            >
                              {targetKey}
                            </code>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            {isAssigned ? (
                              <div
                                style={{
                                  background: "#CCFBF1",
                                  border: "1px solid #99F6E4",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "800",
                                    color: "#0F766E",
                                    fontSize: "11px",
                                  }}
                                >
                                  {assigned[0].firstName} {assigned[0].lastName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePersonnel(
                                      assigned[0].id,
                                      targetKey,
                                    )
                                  }
                                  style={{
                                    background: "#FEE2E2",
                                    color: "#EF4444",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "2px 5px",
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span
                                style={{ color: "#94A3B8", fontSize: "11px" }}
                              >
                                Vacant
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#0D9488",
                                fontWeight: "700",
                              }}
                            >
                              KS3 Learning Area
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            {!isAssigned && (
                              <SearchableDropdown
                                options={available.map(
                                  (p) =>
                                    `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                )}
                                value=""
                                onChange={(val) => {
                                  const p = available.find(
                                    (person) =>
                                      `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                      val,
                                  );
                                  if (p) handleAssignDirectKey(targetKey, p.id);
                                }}
                                placeholder={`Assign ${area.name}...`}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}

                  {/* KS4 Matrix Rows */}
                  {schoolOfferings.showKS4 &&
                    KS4_TRACKS_LIST.map((track) => {
                      const assigned = getAssignedPersonnelForKey(
                        track.key,
                        track.altKeys,
                      );
                      const isAssigned = assigned.length > 0;
                      const available = activePersonnel.filter(
                        (p) => !isAssignedToKey(p.designation, track.key),
                      );

                      return (
                        <tr
                          key={track.id}
                          style={{
                            borderBottom: "1px solid var(--line)",
                            background: "#FFFFFF",
                          }}
                        >
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "800",
                                color: "#6D28D9",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span>{track.icon}</span>{" "}
                              <span>Key Stage 4: {track.name}</span>
                            </div>
                            <code
                              style={{ fontSize: "10px", color: "#64748B" }}
                            >
                              {track.key}
                            </code>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            {isAssigned ? (
                              <div
                                style={{
                                  background: "#EDE9FE",
                                  border: "1px solid #DDD6FE",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "800",
                                    color: "#6D28D9",
                                    fontSize: "11px",
                                  }}
                                >
                                  {assigned[0].firstName} {assigned[0].lastName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePersonnel(
                                      assigned[0].id,
                                      track.key,
                                    )
                                  }
                                  style={{
                                    background: "#FEE2E2",
                                    color: "#EF4444",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "2px 5px",
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span
                                style={{ color: "#94A3B8", fontSize: "11px" }}
                              >
                                Vacant
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#7C3AED",
                                fontWeight: "700",
                              }}
                            >
                              KS4 Track Head
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              verticalAlign: "top",
                            }}
                          >
                            {!isAssigned && (
                              <SearchableDropdown
                                options={available.map(
                                  (p) =>
                                    `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                                )}
                                value=""
                                onChange={(val) => {
                                  const p = available.find(
                                    (person) =>
                                      `${person.firstName} ${person.lastName} (${person.position || "Teacher"})` ===
                                      val,
                                  );
                                  if (p) handleAssignDirectKey(track.key, p.id);
                                }}
                                placeholder={`Assign ${track.name}...`}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}

                  {/* Group 3: Additional Active Roles */}
                  <tr style={{ background: "#F8FAFC" }}>
                    <td
                      colSpan="4"
                      style={{
                        padding: "8px 16px",
                        fontWeight: "800",
                        color: "#475569",
                        fontSize: "11px",
                        letterSpacing: "0.5px",
                      }}
                    >
                      SECTION 3: SCHOOL PROGRAM COORDINATORS & CHAIRPERSONS
                    </td>
                  </tr>
                  {additionalAssignments.map((item, idx) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid var(--line)",
                        background: idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                      }}
                    >
                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        <div
                          style={{
                            fontWeight: "800",
                            color: "var(--navy)",
                            fontSize: "13px",
                          }}
                        >
                          {item.category}
                        </div>
                        {item.parameter && (
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "10px",
                              fontWeight: "800",
                              color: "#0F766E",
                              background: "#F0FDFA",
                              border: "1px solid #99F6E4",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              marginTop: "4px",
                            }}
                          >
                            {item.parameter}
                          </span>
                        )}
                        <code
                          style={{
                            display: "block",
                            background: "#F1F5F9",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            color: "#475569",
                            fontSize: "10px",
                            marginTop: "6px",
                            width: "fit-content",
                          }}
                        >
                          {item.cleanKey}
                        </code>
                      </td>

                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        <div
                          style={{
                            background: "#F8FAFC",
                            border: "1px solid #CBD5E1",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "800",
                              color: "#1E293B",
                              fontSize: "12px",
                            }}
                          >
                            {item.person.firstName} {item.person.lastName}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemovePersonnel(
                                item.person.id,
                                item.cleanKey,
                              )
                            }
                            style={{
                              background: "#FEE2E2",
                              color: "#EF4444",
                              border: "none",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              fontSize: "10px",
                              fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>

                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            color: "#0369A1",
                          }}
                        >
                          Program Coordinator
                        </span>
                      </td>

                      <td
                        style={{ padding: "14px 16px", verticalAlign: "top" }}
                      >
                        <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                          Assigned
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </article>

      {/* "+ ADD DESIGNATION" MODAL (Section 3) */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "560px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "20px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
              overflow: "hidden",
              border: "1.5px solid #BAE6FD",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: "linear-gradient(135deg, #0284C7 0%, #0369A1 100%)",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "white",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FiPlus size={20} color="white" />
                </div>
                <div>
                  <h3
                    style={{ margin: 0, fontSize: "17px", fontWeight: "800" }}
                  >
                    Add School Designation
                  </h3>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: "12px",
                      opacity: 0.9,
                    }}
                  >
                    Select a program coordinator or committee chairperson to add
                    to your school.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.8,
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <div
              style={{
                padding: "22px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {modalError && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    borderRadius: "10px",
                    color: "#991B1B",
                    fontSize: "12px",
                    fontWeight: "700",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FiAlertCircle size={16} /> {modalError}
                </div>
              )}

              {/* 1. Designation Role Selector */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "800",
                    color: "#1E293B",
                    marginBottom: "6px",
                  }}
                >
                  1. Select Designation Role *
                </label>
                <select
                  value={modalRoleId}
                  onChange={(e) => {
                    setModalRoleId(e.target.value);
                    setModalError("");
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1.5px solid #CBD5E1",
                    fontSize: "13px",
                    fontWeight: "600",
                    outline: "none",
                    background: "#FFFFFF",
                  }}
                >
                  {additionalRoleOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Dynamic Parameters (Grade, Learning Area) */}
              {modalRoleId === "grade_level_chairperson" && (
                <div
                  style={{
                    background: "#F8FAFC",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "800",
                      color: "#0369A1",
                      marginBottom: "6px",
                    }}
                  >
                    Select Grade Level *
                  </label>
                  <select
                    value={modalGrade}
                    onChange={(e) => setModalGrade(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #7DD3FC",
                      fontSize: "12px",
                    }}
                  >
                    {offeredGradeLevels.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {modalRoleId === "learning_area_chairperson" && (
                <div
                  style={{
                    background: "#F8FAFC",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "800",
                      color: "#0369A1",
                      marginBottom: "6px",
                    }}
                  >
                    Select Learning Area *
                  </label>
                  <select
                    value={modalLearningArea}
                    onChange={(e) => setModalLearningArea(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #7DD3FC",
                      fontSize: "12px",
                    }}
                  >
                    {PRIMARY_LEARNING_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3. Teacher Selection */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "800",
                    color: "#1E293B",
                    marginBottom: "6px",
                  }}
                >
                  2. Select Teacher from Roster *
                </label>
                <SearchableDropdown
                  options={activePersonnel.map(
                    (p) =>
                      `${p.firstName} ${p.lastName} (${p.position || "Teacher"})`,
                  )}
                  value={
                    modalTeacherId
                      ? (() => {
                          const found = activePersonnel.find(
                            (p) => String(p.id) === String(modalTeacherId),
                          );
                          return found
                            ? `${found.firstName} ${found.lastName} (${found.position || "Teacher"})`
                            : "";
                        })()
                      : ""
                  }
                  onChange={(val) => {
                    const found = activePersonnel.find(
                      (p) =>
                        `${p.firstName} ${p.lastName} (${p.position || "Teacher"})` ===
                        val,
                    );
                    setModalTeacherId(found ? found.id : "");
                    setModalError("");
                  }}
                  placeholder="Type or select a teacher..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 24px",
                background: "#F8FAFC",
                borderTop: "1px solid #E2E8F0",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="btn secondary"
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: "700",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalDesignation}
                className="btn primary"
                style={{
                  padding: "8px 20px",
                  fontSize: "12px",
                  fontWeight: "800",
                }}
              >
                Assign Designation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY DESIGNATIONS VALIDATION GATE MODAL */}
      {missingDesignationsModal.isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() =>
            setMissingDesignationsModal((prev) => ({ ...prev, isOpen: false }))
          }
        >
          <div
            className="card"
            style={{
              maxWidth: "620px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              overflow: "hidden",
              border: "2px solid #fca5a5",
              animation: "fadeIn 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: "linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)",
                padding: "22px 28px",
                borderBottom: "1.5px solid #fecaca",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "14px" }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "14px",
                    background: "#fef2f2",
                    border: "2px solid #ef4444",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#dc2626",
                    flexShrink: 0,
                  }}
                >
                  <FiAlertCircle size={24} />
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: "900",
                      color: "#991b1b",
                    }}
                  >
                    Mandatory School Designations Incomplete
                  </h3>
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: "12px",
                      color: "#b91c1c",
                    }}
                  >
                    DepEd eSF7 requires all mandatory school roles to be
                    designated before proceeding to Workload.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setMissingDesignationsModal((prev) => ({
                    ...prev,
                    isOpen: false,
                  }))
                }
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#991b1b",
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: "24px 28px",
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  marginBottom: "18px",
                  fontSize: "13px",
                  color: "#7F1D1D",
                }}
              >
                <div style={{ fontWeight: "700", marginBottom: "4px" }}>
                  School Regular Enrollment: {regularEnrollment} Learners
                </div>
                <div style={{ fontSize: "12px", lineHeight: "1.4" }}>
                  {isAshRequired
                    ? "Schools with 1,001 or more regular learners require Guidance, LIO, Department Head, and Assistant School Head."
                    : "DepEd schools require at least Guidance Designate, Learner Information Officer, and Key Stage Department Head Designate."}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {missingDesignationsModal.missingList.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      background: "#FFFFFF",
                      border: "1.5px solid #F87171",
                      borderRadius: "14px",
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "800",
                          color: "#1E293B",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span>{m.name}</span>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "800",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            background: "#FEE2E2",
                            color: "#B91C1C",
                          }}
                        >
                          REQUIRED
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#64748B",
                          marginTop: "3px",
                        }}
                      >
                        {m.description}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          fontWeight: "700",
                          whiteSpace: "nowrap",
                          border: "1px dashed #94A3B8",
                          background: "#FFFFFF",
                          borderRadius: "8px",
                          color: "#475569",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setMissingDesignationsModal({
                            isOpen: false,
                            missingList: [],
                          });
                          handleOpenNaModal(m.id, m.name);
                        }}
                      >
                        ⚪ Mark N/A
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{
                          padding: "6px 14px",
                          fontSize: "12px",
                          fontWeight: "700",
                          whiteSpace: "nowrap",
                          borderColor: "#DC2626",
                          color: "#DC2626",
                        }}
                        onClick={() => {
                          setMissingDesignationsModal({
                            isOpen: false,
                            missingList: [],
                          });
                          const el = document.getElementById(
                            `mandatory-slot-${m.id}`,
                          );
                          if (el)
                            el.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                        }}
                      >
                        Assign Now ➔
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 28px",
                background: "#f8fafc",
                borderTop: "1px solid var(--line)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                type="button"
                className="btn primary"
                style={{ minWidth: "130px", fontWeight: "700" }}
                onClick={() =>
                  setMissingDesignationsModal((prev) => ({
                    ...prev,
                    isOpen: false,
                  }))
                }
              >
                Close & Assign Designations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* N/A CONFIRMATION MODAL WITH REQUIRED "CONFIRM" TYPED INPUT */}
      {naConfirmModal.isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
            padding: "20px",
          }}
          onClick={() =>
            setNaConfirmModal({
              isOpen: false,
              roleId: "",
              roleName: "",
              inputVal: "",
            })
          }
        >
          <div
            className="card"
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "20px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              overflow: "hidden",
              border: "2px solid #FCD34D",
              animation: "fadeIn 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
                padding: "20px 24px",
                borderBottom: "1.5px solid #FDE68A",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    background: "#FEF3C7",
                    border: "1.5px solid #F59E0B",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#D97706",
                    flexShrink: 0,
                  }}
                >
                  <FiAlertCircle size={22} />
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "17px",
                      fontWeight: "900",
                      color: "#92400E",
                    }}
                  >
                    Mark Designation as Not Applicable (N/A)
                  </h3>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: "12px",
                      color: "#B45309",
                    }}
                  >
                    Mandatory Statutory Role Confirmation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setNaConfirmModal({
                    isOpen: false,
                    roleId: "",
                    roleName: "",
                    inputVal: "",
                  })
                }
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#92400E",
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "22px 24px" }}>
              <div
                style={{
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "14px",
                  marginBottom: "18px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: "800",
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  Target Mandatory Role:
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: "900",
                    color: "#0F172A",
                  }}
                >
                  {naConfirmModal.roleName}
                </div>
              </div>

              <div
                style={{
                  fontSize: "13px",
                  color: "#475569",
                  lineHeight: "1.5",
                  marginBottom: "18px",
                }}
              >
                By marking this role as <strong>N/A</strong>, you certify that
                no teacher is designated to this statutory position. This
                requirement will not block your submission or Workload encoding.
              </div>

              <div
                style={{
                  background: "#FFF7ED",
                  border: "1px solid #FFEDD5",
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "18px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "800",
                    color: "#9A3412",
                    marginBottom: "6px",
                  }}
                >
                  Type{" "}
                  <strong
                    style={{
                      color: "#C2410C",
                      background: "#FED7AA",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    CONFIRM
                  </strong>{" "}
                  to verify:
                </label>
                <input
                  type="text"
                  value={naConfirmModal.inputVal}
                  onChange={(e) =>
                    setNaConfirmModal((prev) => ({
                      ...prev,
                      inputVal: e.target.value,
                    }))
                  }
                  placeholder="Type CONFIRM here..."
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1.5px solid #F97316",
                    fontSize: "14px",
                    fontWeight: "700",
                    outline: "none",
                    letterSpacing: "1px",
                    boxSizing: "border-box",
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      naConfirmModal.inputVal.trim() === "CONFIRM"
                    ) {
                      handleConfirmNa();
                    }
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 24px",
                background: "#F8FAFC",
                borderTop: "1px solid var(--line)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  setNaConfirmModal({
                    isOpen: false,
                    roleId: "",
                    roleName: "",
                    inputVal: "",
                  })
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={naConfirmModal.inputVal.trim() !== "CONFIRM"}
                onClick={handleConfirmNa}
                style={{
                  background:
                    naConfirmModal.inputVal.trim() === "CONFIRM"
                      ? "#D97706"
                      : "#CBD5E1",
                  borderColor:
                    naConfirmModal.inputVal.trim() === "CONFIRM"
                      ? "#B45309"
                      : "#CBD5E1",
                  cursor:
                    naConfirmModal.inputVal.trim() === "CONFIRM"
                      ? "pointer"
                      : "not-allowed",
                  fontWeight: "800",
                }}
              >
                Confirm N/A
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
