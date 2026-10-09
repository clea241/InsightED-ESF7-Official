import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import SearchableDropdown from "../components/SearchableDropdown";
import {
  useApp,
  POSITION_OPTIONS_BY_CATEGORY,
  detectPersonnelTypeFromPosition,
  isCanonicalPosition,
  getCategoryForCanonicalPosition,
  RELIGION_OPTIONS,
  ETHNIC_GROUP_OPTIONS,
  MAJOR_OPTIONS,
  MINOR_OPTIONS,
  DISCIPLINE_OPTIONS,
  PRC_SPECIALIZATION_OPTIONS,
  NATURE_OF_APPOINTMENT_OPTIONS,
  HIRING_ARRANGEMENT_OPTIONS,
  HIGHEST_EDUCATIONAL_ATTAINMENT_OPTIONS,
  HIGHEST_EDUCATIONAL_ATTAINMENT_TEACHING_OPTIONS,
  HIGHEST_EDUCATIONAL_ATTAINMENT_NON_TEACHING_OPTIONS,
  SHS_TRACK_OPTIONS,
  TESDA_NC_LEVEL_OPTIONS,
  TESDA_COURSE_TO_LEVELS_MAP,
  TESDA_COURSES,
  POST_GRADUATE_DEGREE_OPTIONS,
  COLLEGE_DEGREE_OPTIONS,
  TESDA_CERTIFICATION_OPTIONS,
  NEAP_TRAINING_OPTIONS,
  validateDepEdEmail,
} from "../context/AppContext";
import { NATIONAL_FUND_ELIGIBLE_NATURES } from "@shared/scheduleRules.js";
import { getHourlyPasscode, get10MinPasscode } from "../utils/passcode";
import { api } from "../services/api";
import {
  FiLock,
  FiUnlock,
  FiUser,
  FiBriefcase,
  FiAward,
  FiBook,
  FiLayers,
  FiFileText,
  FiTrash2,
  FiCheck,
  FiAlertCircle,
  FiInfo,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiKey,
  FiUserCheck,
  FiArrowLeft,
  FiArrowRight,
  FiShield,
  FiClock,
  FiPlus,
  FiSave,
} from "react-icons/fi";

export const getAge = (dobString) => {
  if (!dobString) return null;
  const cleanDob =
    typeof dobString === "string" ? dobString.substring(0, 10) : "";
  if (!cleanDob) return null;
  const birth = new Date(cleanDob + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate()))
    age--;
  return age;
};

export const getEffectiveCollegeDegrees = (p) => {
  if (!p) return [];
  if (Array.isArray(p.collegeDegrees) && p.collegeDegrees.length > 0) {
    return p.collegeDegrees.map((d) =>
      typeof d === "string" ? { collegeDegree: d, major: "", minor: "" } : d,
    );
  }
  if (
    p.collegeDegree &&
    !["NONE", "N/A", ""].includes(String(p.collegeDegree).toUpperCase())
  ) {
    return [
      {
        collegeDegree: p.collegeDegree,
        major: p.major || "",
        minor: p.minor || "",
      },
    ];
  }
  return [];
};

export const getEffectivePostGradDisciplines = (p) => {
  if (!p)
    return {
      mastersWithUnits: [],
      mastersGraduated: [],
      doctorateWithUnits: [],
      doctorateGraduated: [],
    };

  let mastersWithUnits = Array.isArray(p.mastersWithUnitsDisciplines)
    ? p.mastersWithUnitsDisciplines
    : [];
  let mastersGraduated = Array.isArray(p.mastersGraduatedDisciplines)
    ? p.mastersGraduatedDisciplines
    : [];
  let doctorateWithUnits = Array.isArray(p.doctorateWithUnitsDisciplines)
    ? p.doctorateWithUnitsDisciplines
    : [];
  let doctorateGraduated = Array.isArray(p.doctorateGraduatedDisciplines)
    ? p.doctorateGraduatedDisciplines
    : [];

  if (
    mastersWithUnits.length === 0 &&
    mastersGraduated.length === 0 &&
    doctorateWithUnits.length === 0 &&
    doctorateGraduated.length === 0
  ) {
    const raw = p.postGraduateDiscipline || p.post_graduate_discipline || "";
    if (raw) {
      if (typeof raw === "object" && raw !== null) {
        mastersWithUnits = Array.isArray(raw.mastersWithUnits)
          ? raw.mastersWithUnits
          : [];
        mastersGraduated = Array.isArray(raw.mastersGraduated)
          ? raw.mastersGraduated
          : [];
        doctorateWithUnits = Array.isArray(raw.doctorateWithUnits)
          ? raw.doctorateWithUnits
          : [];
        doctorateGraduated = Array.isArray(raw.doctorateGraduated)
          ? raw.doctorateGraduated
          : [];
      } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed);
            mastersWithUnits = Array.isArray(parsed.mastersWithUnits)
              ? parsed.mastersWithUnits
              : [];
            mastersGraduated = Array.isArray(parsed.mastersGraduated)
              ? parsed.mastersGraduated
              : [];
            doctorateWithUnits = Array.isArray(parsed.doctorateWithUnits)
              ? parsed.doctorateWithUnits
              : [];
            doctorateGraduated = Array.isArray(parsed.doctorateGraduated)
              ? parsed.doctorateGraduated
              : [];
          } catch (e) {}
        } else {
          const split = trimmed
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const attainment = String(
            p.highestEducationalAttainment || "",
          ).toUpperCase();
          if (attainment.includes("DOCTOR")) {
            if (attainment.includes("WITH UNITS")) doctorateWithUnits = split;
            else doctorateGraduated = split;
          } else {
            if (attainment.includes("WITH UNITS")) mastersWithUnits = split;
            else mastersGraduated = split;
          }
        }
      }
    }
  }

  if (
    mastersWithUnits.length === 0 &&
    mastersGraduated.length === 0 &&
    (p.mastersDiscipline || p.masters_discipline)
  ) {
    const list = String(p.mastersDiscipline || p.masters_discipline)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const attainment = String(
      p.highestEducationalAttainment || "",
    ).toUpperCase();
    if (attainment === "MASTER'S DEGREE (WITH UNITS)") mastersWithUnits = list;
    else mastersGraduated = list;
  }
  if (
    doctorateWithUnits.length === 0 &&
    doctorateGraduated.length === 0 &&
    (p.doctorateDiscipline ||
      p.doctorate_discipline ||
      p.phdDiscipline ||
      p.phd_discipline)
  ) {
    const docDisc =
      p.doctorateDiscipline ||
      p.doctorate_discipline ||
      p.phdDiscipline ||
      p.phd_discipline;
    const list = String(docDisc)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const attainment = String(
      p.highestEducationalAttainment || "",
    ).toUpperCase();
    if (attainment === "DOCTORATE DEGREE (WITH UNITS)")
      doctorateWithUnits = list;
    else doctorateGraduated = list;
  }

  return {
    mastersWithUnits,
    mastersGraduated,
    doctorateWithUnits,
    doctorateGraduated,
  };
};

const CURRICULUM_ERAS = [
  {
    key: "1973-2002",
    label: "1973–2002 (NSEC / NEP)",
    startYear: 1973,
    endYear: 2002,
  },
  {
    key: "2002-2011",
    label: "2002–2011 (2002 Basic Education Curriculum)",
    startYear: 2002,
    endYear: 2011,
  },
  {
    key: "2011-2023",
    label: "2011–2023 (K to 12 Basic Education Program)",
    startYear: 2011,
    endYear: 2023,
  },
  {
    key: "2023-Present",
    label: "2023–Present (MATATAG Curriculum)",
    startYear: 2023,
    endYear: 2099,
  },
];

const PRIMARY_SUBJECTS = [
  "Kinder",
  "Filipino",
  "English",
  "Mathematics",
  "Science",
  "Araling Panlipunan (AP)",
  "Edukasyon sa Pagpapakatao (EsP)",
  "Technology and Livelihood Education (TLE)",
  "MAPEH",
];

const OTHER_TRAINING_OPTIONS = [
  "OTHER (SPECIFY CUSTOM...)",
  "SCHOOL-BASED INSET",
  "DIVISION TRAINING WORKSHOP",
  "REGIONAL MASS TRAINING",
  "LEARNING ACTION CELL",
  "RESEARCH CAPABILITY BUILDING",
  "DRRM TRAINING",
  "CHILD PROTECTION TRAINING",
  "MENTAL HEALTH AND PSYCHOSOCIAL SUPPORT",
];

export const computeStepIncrement = (firstServiceDate, lastPromotionDate) => {
  const effectiveDateStr =
    lastPromotionDate &&
    lastPromotionDate !== "N/A" &&
    String(lastPromotionDate).trim() !== ""
      ? lastPromotionDate
      : firstServiceDate;

  if (!effectiveDateStr || effectiveDateStr === "N/A") {
    return { step: 1, years: 0, basedOn: "Initial Appointment" };
  }

  const cleanDate =
    typeof effectiveDateStr === "string"
      ? effectiveDateStr.substring(0, 10)
      : "";
  const baseDate = new Date(cleanDate + "T00:00:00");
  if (isNaN(baseDate.getTime())) {
    return { step: 1, years: 0, basedOn: "Initial Appointment" };
  }

  const now = new Date();
  let years = now.getFullYear() - baseDate.getFullYear();
  const mDiff = now.getMonth() - baseDate.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < baseDate.getDate())) {
    years--;
  }
  years = Math.max(0, years);

  const computedStep = Math.min(8, Math.max(1, 1 + Math.floor(years / 3)));
  const basedOn =
    lastPromotionDate &&
    lastPromotionDate !== "N/A" &&
    String(lastPromotionDate).trim() !== ""
      ? "Last Promotion Date"
      : "First Day of Service";

  return { step: computedStep, years, basedOn };
};

export const PostGradDisciplineSection = ({
  title,
  levelLabel,
  isRequired,
  graduatedList = [],
  withUnitsList = [],
  defaultStatus = "GRADUATED",
  onAdd,
  onRemove,
}) => {
  const [selectedDisc, setSelectedDisc] = useState("");
  const [status, setStatus] = useState(defaultStatus);

  useEffect(() => {
    setStatus(defaultStatus);
  }, [defaultStatus]);

  const handleAdd = () => {
    if (!selectedDisc || !selectedDisc.trim()) return;
    onAdd(selectedDisc.trim().toUpperCase(), status);
    setSelectedDisc("");
  };

  const handleSelectDiscipline = (val) => {
    if (val && val.trim()) {
      onAdd(val.trim().toUpperCase(), status);
      setSelectedDisc("");
    } else {
      setSelectedDisc("");
    }
  };

  const totalCount = graduatedList.length + withUnitsList.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        marginTop: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <label
          style={{
            fontSize: "13px",
            fontWeight: "700",
            color: "var(--navy)",
            margin: 0,
          }}
        >
          {title} {isRequired && <span style={{ color: "#EF4444" }}>*</span>}
        </label>
        {totalCount > 0 && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: "var(--blue)",
              background: "#EFF6FF",
              padding: "2px 8px",
              borderRadius: "8px",
            }}
          >
            {totalCount} {totalCount === 1 ? "Discipline" : "Disciplines"}
          </span>
        )}
      </div>

      <div
        style={{
          background: "#F8FAFC",
          border: "1.5px solid #E2E8F0",
          borderRadius: "12px",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {totalCount > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {graduatedList.map((disc, idx) => (
              <div
                key={`grad-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#F0FDF4",
                  border: "1.5px solid #BBF7D0",
                  borderRadius: "10px",
                  padding: "4px 10px",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "#14532D",
                    fontWeight: "bold",
                  }}
                >
                  {disc}
                </span>
                <span
                  style={{
                    fontSize: "9px",
                    color: "#16A34A",
                    background: "#DCFCE7",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    fontWeight: "800",
                  }}
                >
                  GRADUATED
                </span>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "#16A34A",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "12px",
                    padding: 0,
                  }}
                  onClick={() => onRemove(disc, "GRADUATED")}
                  title="Remove discipline"
                >
                  ✕
                </button>
              </div>
            ))}
            {withUnitsList.map((disc, idx) => (
              <div
                key={`units-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#EFF6FF",
                  border: "1.5px solid #BAE6FD",
                  borderRadius: "10px",
                  padding: "4px 10px",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "#0F172A",
                    fontWeight: "bold",
                  }}
                >
                  {disc}
                </span>
                <span
                  style={{
                    fontSize: "9px",
                    color: "#0284C7",
                    background: "#E0F2FE",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    fontWeight: "800",
                  }}
                >
                  WITH UNITS
                </span>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "#0284C7",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "12px",
                    padding: 0,
                  }}
                  onClick={() => onRemove(disc, "WITH UNITS")}
                  title="Remove discipline"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <SearchableDropdown
            options={DISCIPLINE_OPTIONS}
            value={selectedDisc}
            onChange={handleSelectDiscipline}
            placeholder={`+ Select ${levelLabel || "post-graduate"} discipline...`}
            allowCustom={true}
          />
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1.5px solid #CBD5E1",
                fontSize: "12px",
                fontWeight: "bold",
                color: "var(--navy)",
                background: "#FFFFFF",
              }}
            >
              <option value="GRADUATED">GRADUATED (Completed Degree)</option>
              <option value="WITH UNITS">WITH UNITS (Ongoing Studies)</option>
            </select>
            <button
              type="button"
              className="btn"
              disabled={!selectedDisc}
              onClick={handleAdd}
              style={{
                fontSize: "12px",
                padding: "8px 14px",
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}
            >
              + Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function DatePickerDropdowns({
  value,
  onChange,
  disabled = false,
  maxDate,
  minDate,
  required = false,
  placement = "top",
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const containerRef = useRef(null);

  const formatDate = (date) => {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const cleanValue = value
    ? typeof value === "string"
      ? value.substring(0, 10)
      : formatDate(value)
    : "";
  const maxDateStr = maxDate ? formatDate(maxDate) : "";
  const minDateStr = minDate ? formatDate(minDate) : "";

  const parsedMaxDate = maxDateStr ? new Date(maxDateStr + "T00:00:00") : null;
  const parsedMinDate = minDateStr ? new Date(minDateStr + "T00:00:00") : null;

  const handleOpenCalendar = () => {
    if (disabled) return;
    if (!showCalendar) {
      if (cleanValue) {
        const d = new Date(cleanValue + "T00:00:00");
        if (!isNaN(d.getTime())) setViewDate(d);
      } else if (parsedMaxDate && new Date() > parsedMaxDate) {
        setViewDate(parsedMaxDate);
      } else if (parsedMinDate && new Date() < parsedMinDate) {
        setViewDate(parsedMinDate);
      } else {
        setViewDate(new Date());
      }
    }
    setShowCalendar(!showCalendar);
  };

  useEffect(() => {
    if (!showCalendar && cleanValue) {
      const d = new Date(cleanValue + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [cleanValue, showCalendar]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDisplayDate = () => {
    if (!cleanValue) return "Select date...";
    const d = new Date(cleanValue + "T00:00:00");
    if (isNaN(d.getTime())) return "Select date...";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const currentMaxYear = parsedMaxDate
    ? parsedMaxDate.getFullYear()
    : new Date().getFullYear();
  const currentMinYear = parsedMinDate
    ? parsedMinDate.getFullYear()
    : currentMaxYear - 80;

  const isPrevDisabled = Boolean(
    minDateStr &&
    formatDate(new Date(year, month, 0)) < minDateStr.substring(0, 7) + "-01",
  );
  const isNextDisabled = Boolean(
    maxDateStr && formatDate(new Date(year, month + 1, 1)) > maxDateStr,
  );

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    if (isPrevDisabled) return;
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    if (isNextDisabled) return;
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value, 10);
    setViewDate(new Date(newYear, month, 1));
  };

  const handleMonthChange = (e) => {
    const newMonth = parseInt(e.target.value, 10);
    setViewDate(new Date(year, newMonth, 1));
  };

  const handleDaySelect = (day) => {
    if (disabled) return;
    const selected = new Date(year, month, day);
    const cellStr = formatDate(selected);
    if (maxDateStr && cellStr > maxDateStr) return;
    if (minDateStr && cellStr < minDateStr) return;

    if (typeof onChange === "function") {
      onChange(cellStr);
    }
    setShowCalendar(false);
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const yearsOptions = [];
  for (let y = currentMaxYear; y >= currentMinYear; y--) {
    yearsOptions.push(y);
  }

  const [actualPlacement, setActualPlacement] = useState(placement);

  useEffect(() => {
    if (showCalendar && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const calendarHeight = 360;

      if (placement === "bottom") {
        if (spaceBelow < 200 && spaceAbove >= calendarHeight) {
          setActualPlacement("top");
        } else {
          setActualPlacement("bottom");
        }
      } else if (placement === "top") {
        if (spaceAbove < calendarHeight) {
          setActualPlacement("bottom");
        } else {
          setActualPlacement("top");
        }
      } else {
        if (spaceAbove >= calendarHeight && spaceAbove > spaceBelow) {
          setActualPlacement("top");
        } else {
          setActualPlacement("bottom");
        }
      }
    } else {
      setActualPlacement(placement);
    }
  }, [showCalendar, placement]);

  const isTop = actualPlacement === "top";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        zIndex: showCalendar ? 99999 : "auto",
      }}
      ref={containerRef}
    >
      <div
        onClick={handleOpenCalendar}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1.5px solid var(--line)",
          background: disabled ? "#F1F5F9" : "#FFFFFF",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "13px",
          color: cleanValue ? "var(--navy)" : "var(--muted)",
          fontWeight: cleanValue ? "600" : "normal",
          boxSizing: "border-box",
        }}
      >
        <span>{getDisplayDate()}</span>
        <FiCalendar size={15} color="var(--blue)" />
      </div>

      {showCalendar && (
        <div
          style={{
            position: "absolute",
            bottom: isTop ? "100%" : "auto",
            top: isTop ? "auto" : "100%",
            left: 0,
            right: 0,
            marginBottom: isTop ? "6px" : "0",
            marginTop: isTop ? "0" : "6px",
            background: "#FFFFFF",
            border: "1.5px solid var(--line)",
            borderRadius: "14px",
            boxShadow:
              "0 25px 50px -12px rgba(0,0,0,0.25), 0 12px 24px -6px rgba(0,0,0,0.15)",
            padding: "14px",
            zIndex: 999999,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
              gap: "6px",
            }}
          >
            <button
              type="button"
              disabled={isPrevDisabled}
              onClick={handlePrevMonth}
              style={{
                background: "#F1F5F9",
                border: 0,
                borderRadius: "6px",
                padding: "6px 8px",
                cursor: isPrevDisabled ? "not-allowed" : "pointer",
              }}
            >
              <FiChevronLeft size={14} />
            </button>

            <div style={{ display: "flex", gap: "4px", flex: 1 }}>
              <select
                value={month}
                onChange={handleMonthChange}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                }}
              >
                {monthNames.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>

              <select
                value={year}
                onChange={handleYearChange}
                style={{
                  width: "80px",
                  padding: "4px 6px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                }}
              >
                {yearsOptions.map((yVal) => (
                  <option key={yVal} value={yVal}>
                    {yVal}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={isNextDisabled}
              onClick={handleNextMonth}
              style={{
                background: "#F1F5F9",
                border: 0,
                borderRadius: "6px",
                padding: "6px 8px",
                cursor: isNextDisabled ? "not-allowed" : "pointer",
              }}
            >
              <FiChevronRight size={14} />
            </button>
          </div>

          {/* Days Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "4px",
              textAlign: "center",
            }}
          >
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dStr) => (
              <div
                key={dStr}
                style={{
                  fontSize: "10px",
                  fontWeight: "800",
                  color: "var(--muted)",
                  padding: "4px 0",
                }}
              >
                {dStr}
              </div>
            ))}

            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dNum = i + 1;
              const cellDate = new Date(year, month, dNum);
              const cellStr = formatDate(cellDate);
              const isSelected = cleanValue === cellStr;
              const isDisabled =
                (parsedMaxDate && cellDate > parsedMaxDate) ||
                (parsedMinDate && cellDate < parsedMinDate);

              return (
                <button
                  key={dNum}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleDaySelect(dNum)}
                  style={{
                    padding: "6px 0",
                    borderRadius: "8px",
                    border: isSelected
                      ? "1.5px solid var(--blue)"
                      : "1px solid transparent",
                    background: isSelected
                      ? "var(--blue)"
                      : isDisabled
                        ? "#F8FAFC"
                        : "#FFFFFF",
                    color: isSelected
                      ? "#FFFFFF"
                      : isDisabled
                        ? "#CBD5E1"
                        : "var(--navy)",
                    fontWeight: isSelected ? "800" : "600",
                    fontSize: "12px",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {dNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoomProfiling() {
  const {
    personnel: appPersonnel,
    setPersonnel,
    scannedRoom,
    schoolInfo: appSchoolInfo,
    classSections: appClassSections,
  } = useApp() || {};

  const filterEligiblePersonnel = (list) => {
    if (!Array.isArray(list)) return [];
    return list;
  };

  const [personnelList, setPersonnelList] = useState(() =>
    filterEligiblePersonnel(appPersonnel || []),
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [formData, setFormData] = useState(null);
  const [activeTab, setActiveTab] = useState("personal"); // 'personal' | 'employment' | 'education' | 'development' | 'teaching' | 'learning-area'
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [authStep, setAuthStep] = useState(1); // Step 1: Passcode, Step 2: Last Name & Birth Year
  const [candidateTeacher, setCandidateTeacher] = useState(null);
  const [enteredPasscode, setEnteredPasscode] = useState("");
  const [enteredLastName, setEnteredLastName] = useState("");
  const [enteredBirthYear, setEnteredBirthYear] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [syncedSchoolInfo, setSyncedSchoolInfo] = useState(() => {
    try {
      const stored = localStorage.getItem("insighted_synced_school_info");
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });
  const [syncedClassSections, setSyncedClassSections] = useState(() => {
    try {
      const stored = localStorage.getItem("insighted_synced_class_sections");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Available grade levels for Teacher Profiling
  const offeredGradeLevels = useMemo(() => {
    const list = [
      "Kinder",
      "Grade 1",
      "Grade 2",
      "Grade 3",
      "Grade 4",
      "Grade 5",
      "Grade 6",
      "Grade 7",
      "Grade 8",
      "Grade 9",
      "Grade 10",
      "Grade 11",
      "Grade 12",
      "SNED (NON-GRADED)",
      "ALS",
    ];

    // Also include any custom grade level that explicitly appears in classSections
    const sections =
      syncedClassSections && syncedClassSections.length > 0
        ? syncedClassSections
        : appClassSections || [];
    sections.forEach((s) => {
      const g = String(s.gradeLevel || "").trim();
      if (g && !list.includes(g)) list.push(g);
    });

    return list;
  }, [syncedSchoolInfo, syncedClassSections, appSchoolInfo, appClassSections]);

  // RA 1080 specify modal state
  const [showRa1080Modal, setShowRa1080Modal] = useState(false);
  const [ra1080InputText, setRa1080InputText] = useState("");

  // 3-Attempt Security Lockout State
  const [failedAttempts, setFailedAttempts] = useState(() => {
    try {
      const stored = localStorage.getItem("room_profiling_failed_attempts");
      return stored ? parseInt(stored, 10) || 0 : 0;
    } catch (e) {
      return 0;
    }
  });

  const [lockoutUntil, setLockoutUntil] = useState(() => {
    try {
      const stored = localStorage.getItem("room_profiling_lockout_until");
      return stored ? parseInt(stored, 10) || 0 : 0;
    } catch (e) {
      return 0;
    }
  });

  const [lockoutRemainingSecs, setLockoutRemainingSecs] = useState(0);

  // Monitor and tick lockout countdown
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      if (lockoutUntil && lockoutUntil > now) {
        setLockoutRemainingSecs(Math.ceil((lockoutUntil - now) / 1000));
      } else {
        if (lockoutUntil && lockoutUntil <= now) {
          setLockoutUntil(0);
          setFailedAttempts(0);
          setLockoutRemainingSecs(0);
          try {
            localStorage.removeItem("room_profiling_lockout_until");
            localStorage.setItem("room_profiling_failed_attempts", "0");
          } catch (e) {}
        } else {
          setLockoutRemainingSecs(0);
        }
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const isLockedOut = lockoutRemainingSecs > 0;

  const formatLockoutCountdown = (totalSecs) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleRecordFailedAttempt = async (
    customMsg,
    specificCode,
    specificPersonId,
  ) => {
    const urlParams = new URLSearchParams(window.location.search);
    const activeSchoolId =
      urlParams.get("schoolId") || urlParams.get("school_id") || "502624";
    const targetCode = specificCode || enteredPasscode || "";
    const targetPersonId = specificPersonId || candidateTeacher?.id || "";

    let serverRes = null;
    try {
      serverRes = await api.recordPasscodeAttempt({
        schoolId: activeSchoolId,
        passcode: targetCode,
        personnelId: targetPersonId,
        isSuccess: false,
      });
    } catch (e) {}

    const nextAttempts =
      serverRes && typeof serverRes.failedAttempts === "number"
        ? serverRes.failedAttempts
        : failedAttempts + 1;
    const serverLocked = Boolean(serverRes && serverRes.isLockedOut);

    setFailedAttempts(nextAttempts);
    try {
      localStorage.setItem(
        "room_profiling_failed_attempts",
        String(nextAttempts),
      );
    } catch (e) {}

    if (serverLocked || nextAttempts >= 3) {
      const remainingSecs =
        serverRes && serverRes.lockoutRemainingSecs
          ? serverRes.lockoutRemainingSecs
          : 600;
      const lockTime = Date.now() + remainingSecs * 1000;
      setLockoutUntil(lockTime);
      setLockoutRemainingSecs(remainingSecs);
      try {
        localStorage.setItem("room_profiling_lockout_until", String(lockTime));
      } catch (e) {}
      setErrorMessage(
        "3 failed attempts reached. Passcode entry is locked across all devices for 10 minutes.",
      );
    } else {
      const attemptsLeft = Math.max(0, 3 - nextAttempts);
      setErrorMessage(
        `${customMsg} (${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining before 10-minute lockout).`,
      );
    }
  };

  useEffect(() => {
    const loadRoster = async () => {
      // 1. Immediately check AppContext
      if (Array.isArray(appPersonnel) && appPersonnel.length > 0) {
        const filtered = filterEligiblePersonnel(appPersonnel);
        setPersonnelList(filtered);
        try {
          localStorage.setItem(
            "insighted_personnel_cache",
            JSON.stringify(filtered),
          );
        } catch (e) {}
      } else {
        // 2. Check localStorage cache
        try {
          const raw =
            localStorage.getItem("insighted_personnel_cache") ||
            localStorage.getItem("insighted_active_personnel");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPersonnelList(filterEligiblePersonnel(parsed));
            }
          }
        } catch (e) {}
      }

      const urlParams = new URLSearchParams(window.location.search);
      const targetSchoolId =
        urlParams.get("schoolId") || urlParams.get("school_id") || "502624";

      // 1. Prioritize real-time synchronized roster broadcast from the School Head's laptop
      try {
        const synced = await api.getRoomRoster(targetSchoolId);
        if (Array.isArray(synced) && synced.length > 0) {
          const filtered = filterEligiblePersonnel(synced);
          setPersonnelList(filtered);
          try {
            localStorage.setItem(
              "insighted_personnel_cache",
              JSON.stringify(filtered),
            );
          } catch (e) {}
          return;
        }
      } catch (e) {}

      // 2. Query backend for database personnel
      try {
        const res = await api.getPersonnel(targetSchoolId);
        if (Array.isArray(res) && res.length > 0) {
          const filtered = filterEligiblePersonnel(res);
          setPersonnelList(filtered);
          try {
            localStorage.setItem(
              "insighted_personnel_cache",
              JSON.stringify(filtered),
            );
          } catch (e) {}
          return;
        }
      } catch (err) {}

      // 3. Fallback to autofill template
      try {
        const tmpl = await api.getAutofillTemplate(targetSchoolId);
        if (Array.isArray(tmpl) && tmpl.length > 0) {
          setPersonnelList(filterEligiblePersonnel(tmpl));
        }
      } catch (e) {}
    };

    loadRoster();
  }, [appPersonnel]);

  // STEP 1: Verify Passcode against active school roster
  const handleVerifyPasscode = async (e) => {
    if (e) e.preventDefault();
    if (isLockedOut) return;
    setErrorMessage("");

    const cleanCode = (enteredPasscode || "")
      .replace(/\s|-/g, "")
      .trim()
      .toUpperCase();
    if (!cleanCode || cleanCode.length < 6) {
      setErrorMessage("Please enter your active 8-character passcode.");
      return;
    }

    // Check cross-device lockout status from server
    const urlParams = new URLSearchParams(window.location.search);
    const activeSchoolId =
      urlParams.get("schoolId") || urlParams.get("school_id") || "502624";
    try {
      const lockCheck = await api.checkPasscodeLockout({
        schoolId: activeSchoolId,
        passcode: cleanCode,
      });
      if (lockCheck && lockCheck.isLockedOut) {
        const lockTime = Date.now() + lockCheck.lockoutRemainingSecs * 1000;
        setLockoutUntil(lockTime);
        setLockoutRemainingSecs(lockCheck.lockoutRemainingSecs);
        setErrorMessage(
          `This passcode is currently locked across all devices for ${formatLockoutCountdown(lockCheck.lockoutRemainingSecs)}.`,
        );
        return;
      }
    } catch (e) {}

    // 1. Try authoritative server verification
    try {
      const verifyRes = await api.verifyRoomPasscode({
        schoolId: activeSchoolId,
        passcode: cleanCode,
      });
      if (verifyRes && verifyRes.success && verifyRes.teacher) {
        setCandidateTeacher(verifyRes.teacher);
        setAuthStep(2);
        setErrorMessage("");
        return;
      }
    } catch (err) {
      console.warn("[Room Profiling Server Verify Notice]:", err.message);
    }

    // 2. Fallback: Resolve active roster from state, context, or localStorage cache
    let activeRoster = personnelList;
    if (!activeRoster || activeRoster.length === 0) {
      if (Array.isArray(appPersonnel) && appPersonnel.length > 0) {
        activeRoster = appPersonnel;
      } else {
        try {
          const raw =
            localStorage.getItem("insighted_personnel_cache") ||
            localStorage.getItem("insighted_active_personnel");
          if (raw) activeRoster = JSON.parse(raw);
        } catch (e) {}
      }
    }

    // Match against any teacher belonging to this school across all key formats and time offsets (-1, 0, +1)
    let matched = null;
    for (const teacher of activeRoster || []) {
      const fn = (teacher.firstName || teacher.first_name || "")
        .toUpperCase()
        .trim();
      const ln = (teacher.lastName || teacher.last_name || "")
        .toUpperCase()
        .trim();

      const candidateKeys = [
        teacher.id,
        teacher.prn,
        fn && ln ? `${ln}_${fn}` : null,
        fn && ln ? `${ln}, ${fn}` : null,
        teacher.name,
        teacher.profilingCode,
      ].filter(Boolean);

      for (const k of candidateKeys) {
        const cleanK = String(k).toUpperCase().trim();
        if (cleanCode === cleanK) {
          matched = teacher;
          break;
        }
        for (const offset of [0, -1, 1]) {
          if (getHourlyPasscode(cleanK, offset) === cleanCode) {
            matched = teacher;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) break;
    }

    if (matched) {
      setCandidateTeacher(matched);
      setAuthStep(2);
      setErrorMessage("");
    } else {
      await handleRecordFailedAttempt(
        "Invalid passcode for this school.",
        cleanCode,
      );
    }
  };

  // STEP 2: Verify Last Name and Birth Year for the matched teacher
  const handleVerifyIdentity = async (e) => {
    if (e) e.preventDefault();
    if (isLockedOut) return;
    setErrorMessage("");

    const cleanLastName = (enteredLastName || "").trim().toUpperCase();
    const cleanBirthYear = (enteredBirthYear || "").trim();

    if (!cleanLastName) {
      setErrorMessage("Please enter your Last Name.");
      return;
    }
    if (!cleanBirthYear || cleanBirthYear.length !== 4) {
      setErrorMessage("Please enter your 4-digit Birth Year (e.g. 1985).");
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const activeSchoolId =
      urlParams.get("schoolId") || urlParams.get("school_id") || "502624";
    try {
      const lockCheck = await api.checkPasscodeLockout({
        schoolId: activeSchoolId,
        passcode: enteredPasscode,
        personnelId: candidateTeacher.id,
      });
      if (lockCheck && lockCheck.isLockedOut) {
        const lockTime = Date.now() + lockCheck.lockoutRemainingSecs * 1000;
        setLockoutUntil(lockTime);
        setLockoutRemainingSecs(lockCheck.lockoutRemainingSecs);
        setErrorMessage(
          `This teacher passcode is currently locked across all devices for ${formatLockoutCountdown(lockCheck.lockoutRemainingSecs)}.`,
        );
        return;
      }
    } catch (e) {}

    const normalizeLastName = (val) => {
      return String(val || "")
        .trim()
        .toUpperCase()
        .replace(/[\u00f1\u00d1]/g, "N")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^(MR\.|MS\.|MRS\.|DR\.)\s+/gi, "")
        .replace(/\s+(JR\.|SR\.|III|II|IV|V|JR|SR)$/gi, "")
        .replace(/[^A-Z0-9]/g, "");
    };

    const extractBirthYear = (val) => {
      if (!val) return "";
      if (typeof val === "number") return String(val);
      const str = String(val).trim();
      const match = str.match(/\b(19\d{2}|20\d{2})\b/);
      if (match) return match[1];

      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const yr = parsed.getFullYear();
        if (yr >= 1900 && yr <= 2099) return String(yr);
      }

      const digits = str.replace(/[^0-9]/g, "");
      if (digits.length === 4) return digits;
      if (digits.length >= 8) {
        if (digits.startsWith("19") || digits.startsWith("20"))
          return digits.substring(0, 4);
        const endYear = digits.substring(digits.length - 4);
        if (endYear.startsWith("19") || endYear.startsWith("20"))
          return endYear;
      }
      return "";
    };

    const rawActualLast =
      candidateTeacher.lastName ||
      candidateTeacher.last_name ||
      (candidateTeacher.name && candidateTeacher.name.includes(",")
        ? candidateTeacher.name.split(",")[0]
        : candidateTeacher.name);

    const targetLast = normalizeLastName(rawActualLast);
    const inputLast = normalizeLastName(cleanLastName);

    const isLastNameMatch = Boolean(
      (targetLast && inputLast && targetLast === inputLast) ||
      (targetLast &&
        inputLast &&
        (targetLast.includes(inputLast) || inputLast.includes(targetLast))),
    );

    const candYear = extractBirthYear(
      candidateTeacher.birthdate ||
        candidateTeacher.birth_date ||
        candidateTeacher.birthYear ||
        candidateTeacher.birth_year ||
        candidateTeacher.dob,
    );

    const isYearMatch = !candYear || candYear === cleanBirthYear;

    if (!isLastNameMatch) {
      await handleRecordFailedAttempt(
        "Incorrect Last Name. Please verify the spelling.",
        enteredPasscode,
        candidateTeacher.id,
      );
      return;
    }

    if (!isYearMatch) {
      await handleRecordFailedAttempt(
        "Incorrect Birth Year. Please enter your correct 4-digit birth year.",
        enteredPasscode,
        candidateTeacher.id,
      );
      return;
    }

    if (isLastNameMatch && isYearMatch) {
      // Clear security lockout counters
      setFailedAttempts(0);
      setLockoutUntil(0);
      setLockoutRemainingSecs(0);
      try {
        localStorage.removeItem("room_profiling_failed_attempts");
        localStorage.removeItem("room_profiling_lockout_until");
        await api.recordPasscodeAttempt({
          schoolId: activeSchoolId,
          passcode: enteredPasscode,
          personnelId: candidateTeacher.id,
          isSuccess: true,
        });
      } catch (e) {}

      setSelectedTeacherId(candidateTeacher.id);

      // Load cached local draft if available
      let draftData = {};
      try {
        const rawDraft = localStorage.getItem(
          `draft_personnel_${candidateTeacher.id}`,
        );
        if (rawDraft) draftData = JSON.parse(rawDraft);
      } catch (e) {}

      // Load cached learning areas
      let learningAreaDraft = {};
      try {
        const rawLA = localStorage.getItem(
          `draft_learning_areas_${candidateTeacher.id}`,
        );
        if (rawLA) learningAreaDraft = JSON.parse(rawLA);
      } catch (e) {}

      const matchedRosterPerson =
        (personnelList || []).find(
          (p) => String(p.id) === String(candidateTeacher.id),
        ) || {};
      const sourceTeacher = { ...matchedRosterPerson, ...candidateTeacher };

      const rawNature =
        draftData.natureOfAppointment ||
        sourceTeacher.natureOfAppointment ||
        sourceTeacher.nature_of_appointment ||
        sourceTeacher.appointmentStatus ||
        "REGULAR PERMANENT";
      const personType =
        draftData.type ||
        sourceTeacher.type ||
        detectPersonnelTypeFromPosition(
          sourceTeacher.position || sourceTeacher.plantilla_position,
        ) ||
        "teaching";
      const isNT = personType === "non-teaching";

      let initHiring =
        draftData.hiringArrangement ||
        sourceTeacher.hiringArrangement ||
        sourceTeacher.hiring_arrangement;
      let initFund =
        draftData.fundSource ||
        sourceTeacher.fundSource ||
        sourceTeacher.fund_source;

      if (rawNature === "REGULAR PERMANENT") {
        if (!initFund) initFund = "NATIONAL";
        if (isNT) {
          if (!initHiring) initHiring = "REGULAR";
        } else if (
          !initHiring ||
          initHiring === "N/A" ||
          !["REGULAR", "SPIMS", "4PS", "DOST"].includes(
            String(initHiring).toUpperCase(),
          )
        ) {
          initHiring = "REGULAR";
        }
      } else if (rawNature === "PROVISIONAL") {
        if (!initFund) initFund = "NATIONAL";
        if (!initHiring) initHiring = "DOST";
      } else if (
        [
          "CONTRACTUAL",
          "SUBSTITUTE",
          "CASUAL/EMERGENCY",
          "JOB ORDER/CONTRACT OF SERVICE",
          "VOLUNTEER",
        ].includes(rawNature)
      ) {
        if (!initHiring) initHiring = "N/A";
        if (!initFund || initFund === "NATIONAL") {
          initFund = "SEF";
        }
      } else {
        if (!initFund) initFund = "NATIONAL";
        if (!initHiring) initHiring = "REGULAR";
      }

      // Resolve Degrees
      const rawDegreeRows =
        Array.isArray(draftData.degreeRows) && draftData.degreeRows.length > 0
          ? draftData.degreeRows
          : Array.isArray(sourceTeacher.degreeRows) &&
              sourceTeacher.degreeRows.length > 0
            ? sourceTeacher.degreeRows
            : Array.isArray(sourceTeacher.collegeDegrees) &&
                sourceTeacher.collegeDegrees.length > 0
              ? sourceTeacher.collegeDegrees.map((d, idx) =>
                  typeof d === "string"
                    ? {
                        clientKey: `deg-${idx}`,
                        level: "BACCALAUREATE",
                        collegeDegree: d,
                        major: "",
                        minor: "",
                      }
                    : {
                        clientKey: `deg-${idx}`,
                        level: d.level || "BACCALAUREATE",
                        collegeDegree: d.collegeDegree || d.degree,
                        major: d.major || "",
                        minor: d.minor || "",
                      },
                )
              : getEffectiveCollegeDegrees(sourceTeacher).map((d, idx) => ({
                  clientKey: `baccalaureate-${idx}`,
                  level: "BACCALAUREATE",
                  collegeDegree: d.collegeDegree,
                  major: d.major,
                  minor: d.minor,
                }));

      // Resolve Post-grad disciplines
      const pgDiscs = getEffectivePostGradDisciplines(
        draftData.postGraduateDiscipline ? draftData : sourceTeacher,
      );

      // Resolve Trainings
      const neapRows =
        Array.isArray(draftData.neapTrainingRows) &&
        draftData.neapTrainingRows.length > 0
          ? draftData.neapTrainingRows
          : Array.isArray(sourceTeacher.neapTrainingRows) &&
              sourceTeacher.neapTrainingRows.length > 0
            ? sourceTeacher.neapTrainingRows
            : Array.isArray(sourceTeacher.neap_training_rows)
              ? sourceTeacher.neap_training_rows
              : [];

      const certRows =
        Array.isArray(draftData.certificationRows) &&
        draftData.certificationRows.length > 0
          ? draftData.certificationRows
          : Array.isArray(sourceTeacher.certificationRows) &&
              sourceTeacher.certificationRows.length > 0
            ? sourceTeacher.certificationRows
            : Array.isArray(sourceTeacher.certification_rows)
              ? sourceTeacher.certification_rows
              : [];

      const otherRows =
        Array.isArray(draftData.otherTrainingRows) &&
        draftData.otherTrainingRows.length > 0
          ? draftData.otherTrainingRows
          : Array.isArray(sourceTeacher.otherTrainingRows) &&
              sourceTeacher.otherTrainingRows.length > 0
            ? sourceTeacher.otherTrainingRows
            : Array.isArray(sourceTeacher.other_training_rows)
              ? sourceTeacher.other_training_rows
              : [];

      // Resolve Assigned Grades
      const assignedGrades =
        Array.isArray(draftData.assignedGradeLevels) &&
        draftData.assignedGradeLevels.length > 0
          ? draftData.assignedGradeLevels
          : Array.isArray(sourceTeacher.assignedGradeLevels) &&
              sourceTeacher.assignedGradeLevels.length > 0
            ? sourceTeacher.assignedGradeLevels
            : Array.isArray(sourceTeacher.gradeLevelsTaught) &&
                sourceTeacher.gradeLevelsTaught.length > 0
              ? sourceTeacher.gradeLevelsTaught
              : Array.isArray(sourceTeacher.assigned_grade_levels)
                ? sourceTeacher.assigned_grade_levels
                : [];

      // Resolve Learning Area Matrix
      const laMap =
        Object.keys(learningAreaDraft).length > 0
          ? learningAreaDraft
          : sourceTeacher.learningAreaMap ||
            sourceTeacher.matrix_data ||
            sourceTeacher.matrixData ||
            {};

      // Compute step increment if service date exists
      const effFirst =
        draftData.firstServiceDate ||
        sourceTeacher.firstServiceDate ||
        sourceTeacher.first_service_date ||
        "";
      const effProm =
        draftData.lastPromotionDate !== undefined
          ? draftData.lastPromotionDate
          : sourceTeacher.lastPromotionDate ||
            sourceTeacher.last_promotion_date ||
            "";
      let computedStep = 1;
      if (effFirst) {
        const cleanDate =
          typeof (effProm && effProm !== "N/A" ? effProm : effFirst) ===
          "string"
            ? (effProm && effProm !== "N/A" ? effProm : effFirst).substring(
                0,
                10,
              )
            : "";
        const baseDate = new Date(cleanDate + "T00:00:00");
        if (!isNaN(baseDate.getTime())) {
          const now = new Date();
          let years = now.getFullYear() - baseDate.getFullYear();
          const mDiff = now.getMonth() - baseDate.getMonth();
          if (mDiff < 0 || (mDiff === 0 && now.getDate() < baseDate.getDate()))
            years--;
          years = Math.max(0, years);
          computedStep = Math.min(8, Math.max(1, 1 + Math.floor(years / 3)));
        }
      }

      const merged = {
        ...sourceTeacher,
        ...draftData,
        firstName:
          draftData.firstName ||
          sourceTeacher.firstName ||
          sourceTeacher.first_name ||
          "",
        lastName:
          draftData.lastName ||
          sourceTeacher.lastName ||
          sourceTeacher.last_name ||
          "",
        middleName:
          draftData.middleName ||
          sourceTeacher.middleName ||
          sourceTeacher.middle_name ||
          "",
        nameExtension:
          draftData.nameExtension ||
          sourceTeacher.nameExtension ||
          sourceTeacher.extensionName ||
          sourceTeacher.name_extension ||
          "",
        depedEmail:
          draftData.depedEmail ||
          sourceTeacher.depedEmail ||
          sourceTeacher.deped_email ||
          sourceTeacher.email ||
          "",
        noDepedEmail:
          draftData.noDepedEmail !== undefined
            ? draftData.noDepedEmail
            : !!(
                sourceTeacher.noDepedEmail ||
                sourceTeacher.no_deped_email ||
                sourceTeacher.depedEmail === "N/A" ||
                sourceTeacher.deped_email === "N/A"
              ),
        no_deped_email:
          draftData.no_deped_email !== undefined
            ? draftData.no_deped_email
            : !!(
                sourceTeacher.noDepedEmail ||
                sourceTeacher.no_deped_email ||
                sourceTeacher.depedEmail === "N/A" ||
                sourceTeacher.deped_email === "N/A"
              ),
        birthdate:
          draftData.birthdate ||
          (sourceTeacher.birthdate
            ? String(sourceTeacher.birthdate).substring(0, 10)
            : ""),
        philsysNo:
          draftData.philsysNo ||
          sourceTeacher.philsysNo ||
          sourceTeacher.philsys_no ||
          "",
        noPhilsys:
          draftData.noPhilsys !== undefined
            ? draftData.noPhilsys
            : !!(sourceTeacher.noPhilsys || sourceTeacher.no_philsys),
        tin: draftData.tin || sourceTeacher.tin || "",
        noTin:
          draftData.noTin !== undefined
            ? draftData.noTin
            : !!(sourceTeacher.noTin || sourceTeacher.no_tin),
        sexAtBirth:
          draftData.sexAtBirth ||
          sourceTeacher.sexAtBirth ||
          sourceTeacher.sex_at_birth ||
          sourceTeacher.sex ||
          "FEMALE",
        civilStatus:
          draftData.civilStatus ||
          sourceTeacher.civilStatus ||
          sourceTeacher.civil_status ||
          "SINGLE",
        soloParent:
          draftData.soloParent !== undefined
            ? draftData.soloParent
            : sourceTeacher.soloParent || sourceTeacher.solo_parent || "NO",
        religion:
          draftData.religion || sourceTeacher.religion || "ROMAN CATHOLIC",
        ethnicGroup:
          draftData.ethnicGroup ||
          sourceTeacher.ethnicGroup ||
          sourceTeacher.ethnic_group ||
          "TAGALOG",
        employeeNo:
          draftData.employeeNo ||
          sourceTeacher.employeeNo ||
          sourceTeacher.employee_no ||
          "",
        position:
          draftData.position ||
          sourceTeacher.position ||
          sourceTeacher.plantilla_position ||
          sourceTeacher.position_title ||
          "TEACHER I",
        type: personType,
        natureOfAppointment: rawNature,
        hiringArrangement: initHiring,
        fundSource: initFund,
        firstServiceDate: effFirst,
        lastPromotionDate: effProm || "N/A",
        newStationDate:
          (draftData.newStationDate !== undefined
            ? draftData.newStationDate
            : sourceTeacher.newStationDate || sourceTeacher.new_station_date) ||
          effFirst ||
          "N/A",
        lastLateralMovementDate:
          (draftData.lastLateralMovementDate !== undefined
            ? draftData.lastLateralMovementDate
            : sourceTeacher.lastLateralMovementDate ||
              sourceTeacher.last_lateral_movement_date) || "N/A",
        stepIncrement:
          draftData.stepIncrement ||
          sourceTeacher.stepIncrement ||
          sourceTeacher.step_increment ||
          computedStep,
        stepIncrementConfirmed: true,
        highestEducationalAttainment:
          draftData.highestEducationalAttainment ||
          sourceTeacher.highestEducationalAttainment ||
          sourceTeacher.highest_educational_attainment ||
          (rawDegreeRows.length > 0
            ? "COLLEGE GRADUATE / BACCALAUREATE"
            : "COLLEGE UNDERGRADUATE"),
        collegeDegrees: rawDegreeRows,
        degreeRows: rawDegreeRows,
        mastersWithUnitsDisciplines: pgDiscs.mastersWithUnits,
        mastersGraduatedDisciplines: pgDiscs.mastersGraduated,
        doctorateWithUnitsDisciplines: pgDiscs.doctorateWithUnits,
        doctorateGraduatedDisciplines: pgDiscs.doctorateGraduated,
        mastersDisciplines: [
          ...new Set([
            ...pgDiscs.mastersWithUnits,
            ...pgDiscs.mastersGraduated,
          ]),
        ],
        doctorateDisciplines: [
          ...new Set([
            ...pgDiscs.doctorateWithUnits,
            ...pgDiscs.doctorateGraduated,
          ]),
        ],
        mastersDiscipline:
          draftData.mastersDiscipline ||
          draftData.masters_discipline ||
          sourceTeacher.mastersDiscipline ||
          sourceTeacher.masters_discipline ||
          [
            ...new Set([
              ...pgDiscs.mastersWithUnits,
              ...pgDiscs.mastersGraduated,
            ]),
          ].join(", "),
        masters_discipline:
          draftData.mastersDiscipline ||
          draftData.masters_discipline ||
          sourceTeacher.mastersDiscipline ||
          sourceTeacher.masters_discipline ||
          [
            ...new Set([
              ...pgDiscs.mastersWithUnits,
              ...pgDiscs.mastersGraduated,
            ]),
          ].join(", "),
        doctorateDiscipline:
          draftData.doctorateDiscipline ||
          draftData.doctorate_discipline ||
          draftData.phdDiscipline ||
          draftData.phd_discipline ||
          sourceTeacher.doctorateDiscipline ||
          sourceTeacher.doctorate_discipline ||
          sourceTeacher.phdDiscipline ||
          sourceTeacher.phd_discipline ||
          [
            ...new Set([
              ...pgDiscs.doctorateWithUnits,
              ...pgDiscs.doctorateGraduated,
            ]),
          ].join(", "),
        doctorate_discipline:
          draftData.doctorateDiscipline ||
          draftData.doctorate_discipline ||
          draftData.phdDiscipline ||
          draftData.phd_discipline ||
          sourceTeacher.doctorateDiscipline ||
          sourceTeacher.doctorate_discipline ||
          sourceTeacher.phdDiscipline ||
          sourceTeacher.phd_discipline ||
          [
            ...new Set([
              ...pgDiscs.doctorateWithUnits,
              ...pgDiscs.doctorateGraduated,
            ]),
          ].join(", "),
        phdDiscipline:
          draftData.doctorateDiscipline ||
          draftData.doctorate_discipline ||
          draftData.phdDiscipline ||
          draftData.phd_discipline ||
          sourceTeacher.doctorateDiscipline ||
          sourceTeacher.doctorate_discipline ||
          sourceTeacher.phdDiscipline ||
          sourceTeacher.phd_discipline ||
          [
            ...new Set([
              ...pgDiscs.doctorateWithUnits,
              ...pgDiscs.doctorateGraduated,
            ]),
          ].join(", "),
        phd_discipline:
          draftData.doctorateDiscipline ||
          draftData.doctorate_discipline ||
          draftData.phdDiscipline ||
          draftData.phd_discipline ||
          sourceTeacher.doctorateDiscipline ||
          sourceTeacher.doctorate_discipline ||
          sourceTeacher.phdDiscipline ||
          sourceTeacher.phd_discipline ||
          [
            ...new Set([
              ...pgDiscs.doctorateWithUnits,
              ...pgDiscs.doctorateGraduated,
            ]),
          ].join(", "),
        postGraduateDiscipline:
          typeof (
            draftData.postGraduateDiscipline ||
            draftData.post_graduate_discipline ||
            sourceTeacher.postGraduateDiscipline ||
            sourceTeacher.post_graduate_discipline
          ) === "object"
            ? JSON.stringify(
                draftData.postGraduateDiscipline ||
                  draftData.post_graduate_discipline ||
                  sourceTeacher.postGraduateDiscipline ||
                  sourceTeacher.post_graduate_discipline,
              )
            : draftData.postGraduateDiscipline ||
              draftData.post_graduate_discipline ||
              sourceTeacher.postGraduateDiscipline ||
              sourceTeacher.post_graduate_discipline ||
              JSON.stringify({
                mastersWithUnits: pgDiscs.mastersWithUnits,
                mastersGraduated: pgDiscs.mastersGraduated,
                doctorateWithUnits: pgDiscs.doctorateWithUnits,
                doctorateGraduated: pgDiscs.doctorateGraduated,
                masters: [
                  ...new Set([
                    ...pgDiscs.mastersWithUnits,
                    ...pgDiscs.mastersGraduated,
                  ]),
                ],
                doctorate: [
                  ...new Set([
                    ...pgDiscs.doctorateWithUnits,
                    ...pgDiscs.doctorateGraduated,
                  ]),
                ],
              }),
        post_graduate_discipline:
          typeof (
            draftData.postGraduateDiscipline ||
            draftData.post_graduate_discipline ||
            sourceTeacher.postGraduateDiscipline ||
            sourceTeacher.post_graduate_discipline
          ) === "object"
            ? JSON.stringify(
                draftData.postGraduateDiscipline ||
                  draftData.post_graduate_discipline ||
                  sourceTeacher.postGraduateDiscipline ||
                  sourceTeacher.post_graduate_discipline,
              )
            : draftData.postGraduateDiscipline ||
              draftData.post_graduate_discipline ||
              sourceTeacher.postGraduateDiscipline ||
              sourceTeacher.post_graduate_discipline ||
              JSON.stringify({
                mastersWithUnits: pgDiscs.mastersWithUnits,
                mastersGraduated: pgDiscs.mastersGraduated,
                doctorateWithUnits: pgDiscs.doctorateWithUnits,
                doctorateGraduated: pgDiscs.doctorateGraduated,
                masters: [
                  ...new Set([
                    ...pgDiscs.mastersWithUnits,
                    ...pgDiscs.mastersGraduated,
                  ]),
                ],
                doctorate: [
                  ...new Set([
                    ...pgDiscs.doctorateWithUnits,
                    ...pgDiscs.doctorateGraduated,
                  ]),
                ],
              }),
        eligibility:
          draftData.eligibility ||
          sourceTeacher.eligibility ||
          "LICENSURE EXAMINATION FOR TEACHERS",
        prcSpecialization:
          draftData.prcSpecialization ||
          sourceTeacher.prcSpecialization ||
          sourceTeacher.prc_specialization ||
          "",
        neapTrainingRows: neapRows,
        certificationRows: certRows,
        otherTrainingRows: otherRows,
        assignedGradeLevels:
          assignedGrades.length > 0 ? assignedGrades : ["Grade 7"],
        learningAreaMap: laMap,
      };

      setFormData(merged);
      setIsUnlocked(true);
      setErrorMessage("");
    }
  };

  const handleLockSession = () => {
    setIsUnlocked(false);
    setAuthStep(1);
    setCandidateTeacher(null);
    setFormData(null);
    setSelectedTeacherId("");
    setEnteredPasscode("");
    setEnteredLastName("");
    setEnteredBirthYear("");
    setErrorMessage("");
  };

  const handleFieldChange = (key, value) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        [key]: value,
      };
      if (prev?.id) {
        try {
          localStorage.setItem(
            `draft_personnel_${prev.id}`,
            JSON.stringify(updated),
          );
        } catch (e) {}
      }
      return updated;
    });
  };

  const handleMultipleFieldsChange = (updates) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        ...updates,
      };
      if (prev?.id) {
        try {
          localStorage.setItem(
            `draft_personnel_${prev.id}`,
            JSON.stringify(updated),
          );
        } catch (e) {}
      }
      return updated;
    });
  };

  const handleEmailLocalChange = (val) => {
    const trimmed = String(val || "").trim();
    if (trimmed.toLowerCase() === "n/a" || trimmed.toLowerCase() === "na") {
      handleMultipleFieldsChange({
        depedEmail: "N/A",
        deped_email: "N/A",
        noDepedEmail: true,
        no_deped_email: true,
      });
      return;
    }
    const raw = trimmed
      .replace(/@/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9.ñ]/g, "");
    if (!raw) {
      handleMultipleFieldsChange({
        depedEmail: "",
        deped_email: "",
        noDepedEmail: false,
        no_deped_email: false,
      });
      return;
    }
    handleMultipleFieldsChange({
      depedEmail: `${raw}@deped.gov.ph`,
      deped_email: `${raw}@deped.gov.ph`,
      noDepedEmail: false,
      no_deped_email: false,
    });
  };

  // DepEd email local sync helpers
  const getEmailLocal = (email) => {
    if (!email) return "";
    if (email === "N/A") return "N/A";
    if (email.endsWith("@deped.gov.ph")) {
      return email.slice(0, -13);
    }
    return email;
  };

  const handleTrainingChange = (key, index, field, value) => {
    let sanitizedValue = value;
    if (field === "totalHours") {
      if (typeof sanitizedValue === "string") {
        sanitizedValue = sanitizedValue.replace(/\D/g, "").slice(0, 3);
        sanitizedValue = sanitizedValue ? Number(sanitizedValue) : "";
      } else if (typeof sanitizedValue === "number") {
        const numStr = String(sanitizedValue).replace(/\D/g, "").slice(0, 3);
        sanitizedValue = numStr ? Number(numStr) : "";
      }
    }
    const rows = [...(formData[key] || [])];
    rows[index] = { ...rows[index], [field]: sanitizedValue };

    // Automatically recalculate NO. OF DAYS
    if (field === "startDate" || field === "endDate") {
      const cleanStart =
        rows[index].startDate && typeof rows[index].startDate === "string"
          ? rows[index].startDate.substring(0, 10)
          : "";
      const cleanEnd =
        rows[index].endDate && typeof rows[index].endDate === "string"
          ? rows[index].endDate.substring(0, 10)
          : "";
      const start = cleanStart ? new Date(cleanStart + "T00:00:00") : null;
      const end = cleanEnd ? new Date(cleanEnd + "T00:00:00") : null;

      // Enforce end date must be on or after start date
      if (start && end && end < start) {
        rows[index].endDate = "";
        rows[index].days = 0;
      } else if (start && end && end >= start) {
        const days = Math.round((end - start) / 86400000) + 1;
        rows[index].days = days;
      } else {
        rows[index].days = 0;
      }
    }

    handleFieldChange(key, rows);
  };

  const addTrainingRow = (key) => {
    const rows = [...(formData[key] || [])];
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    rows.push({
      clientKey: tempId,
      title: "",
      startDate: "",
      endDate: "",
      days: 0,
      totalHours: "",
    });
    handleFieldChange(key, rows);
  };

  const removeTrainingRow = (key, index) => {
    const rows = [...(formData[key] || [])].filter((_, idx) => idx !== index);
    handleFieldChange(key, rows);
  };

  // Learning Area Matrix Helpers
  const getMaxAllowedServiceYears = (person) => {
    const d = person?.firstServiceDate || person?.first_service_date || "";
    if (!d || typeof d !== "string" || d.length < 4) return 70;
    const startYear = parseInt(d.substring(0, 4), 10);
    if (isNaN(startYear)) return 70;
    const currentYear = new Date().getFullYear();
    const years = currentYear - startYear;
    return Math.min(70, Math.max(1, years));
  };

  const getTotalAssignedLearningYears = (map) => {
    let sum = 0;
    Object.keys(map || {}).forEach((k) => {
      if (map[k]?.checked) {
        sum += Number(map[k]?.years || 0);
      }
    });
    return sum;
  };

  const getCellMaxYears = (eraKey, subjectKey, person, currentMap) => {
    const totalMaxService = getMaxAllowedServiceYears(person);
    const d = person?.firstServiceDate || person?.first_service_date || "";
    const firstServiceYear =
      d && typeof d === "string" && d.length >= 4
        ? parseInt(d.substring(0, 4), 10)
        : null;
    const currentYear = new Date().getFullYear();

    const era = CURRICULUM_ERAS.find((e) => e.key === eraKey);
    let eraMax = totalMaxService;
    if (era && firstServiceYear !== null) {
      const start = Math.max(era.startYear, firstServiceYear);
      const end = Math.min(era.endYear, currentYear);
      eraMax = Math.max(1, end - start + 1);
    }

    const currentCellKey = `${eraKey}||${subjectKey}`;
    const currentCellYears = currentMap?.[currentCellKey]?.checked
      ? Number(currentMap[currentCellKey]?.years || 0)
      : 0;
    const otherCellsSum =
      getTotalAssignedLearningYears(currentMap) - currentCellYears;

    const remainingGlobal = Math.max(0, totalMaxService - otherCellsSum);
    return Math.min(totalMaxService, eraMax, remainingGlobal);
  };

  const handleToggleLearningAreaCell = (eraKey, subjectKey) => {
    if (!formData?.id) return;
    const key = `${eraKey}||${subjectKey}`;
    const currentMap = formData.learningAreaMap || formData.matrix_data || {};
    const existing = currentMap[key];
    const newChecked = !existing?.checked;

    let newYears = 0;
    if (newChecked) {
      const totalMax = getMaxAllowedServiceYears(formData);
      const currentTotal = getTotalAssignedLearningYears(currentMap);
      if (currentTotal >= totalMax) {
        alert(
          `Maximum teaching experience limit (${totalMax} yrs) has already been reached. Cannot add more subjects.`,
        );
        return;
      }
      const cellMax = getCellMaxYears(eraKey, subjectKey, formData, currentMap);
      if (cellMax <= 0) {
        alert(
          `Cannot add ${subjectKey}. Total service limit (${totalMax} yrs) reached.`,
        );
        return;
      }
      newYears = Math.min(cellMax, Math.max(1, existing?.years || 1));
    }

    const updatedMap = {
      ...currentMap,
      [key]: { checked: newChecked, years: newYears },
    };
    handleMultipleFieldsChange({
      learningAreaMap: updatedMap,
      matrix_data: updatedMap,
    });
    try {
      localStorage.setItem(
        `draft_learning_areas_${formData.id}`,
        JSON.stringify(updatedMap),
      );
    } catch (e) {}
  };

  const handleLearningAreaYearsChange = (eraKey, subjectKey, yearsVal) => {
    if (!formData?.id) return;
    const key = `${eraKey}||${subjectKey}`;
    let cleanVal = String(yearsVal || "").replace(/\D/g, "");
    if (cleanVal.length > 2) cleanVal = cleanVal.slice(0, 2);
    const currentMap = formData.learningAreaMap || formData.matrix_data || {};
    const cellMax = getCellMaxYears(eraKey, subjectKey, formData, currentMap);
    const inputVal = parseInt(cleanVal || "1", 10);
    const parsed = Math.min(cellMax, Math.max(1, inputVal));

    const updatedMap = {
      ...currentMap,
      [key]: { ...currentMap[key], checked: true, years: parsed },
    };
    handleMultipleFieldsChange({
      learningAreaMap: updatedMap,
      matrix_data: updatedMap,
    });
    try {
      localStorage.setItem(
        `draft_learning_areas_${formData.id}`,
        JSON.stringify(updatedMap),
      );
    } catch (e) {}
  };

  // VALIDATION LOGIC
  const maxBirthdate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d;
  }, []);

  const isPhilsysValid = useMemo(() => {
    if (!formData) return true;
    if (formData.noPhilsys) return true;
    const clean = String(formData.philsysNo || "").replace(/\D/g, "");
    return clean.length === 16;
  }, [formData]);

  const areTrainingsValid = useMemo(() => {
    if (!formData) return true;
    const checkRows = (rows = []) => {
      return rows.every((r) => {
        if (
          !r.title ||
          !r.startDate ||
          !r.endDate ||
          r.totalHours === "" ||
          Number(r.totalHours) <= 0 ||
          Number(r.totalHours) > 999
        ) {
          return false;
        }
        if (new Date(r.startDate) > new Date(r.endDate)) {
          return false;
        }
        return true;
      });
    };
    return (
      checkRows(formData.neapTrainingRows) &&
      checkRows(formData.certificationRows) &&
      checkRows(formData.otherTrainingRows)
    );
  }, [formData]);

  const isEmailValid = useMemo(() => {
    if (!formData) return true;
    const isPermanent =
      String(formData.natureOfAppointment || "").toUpperCase() ===
      "REGULAR PERMANENT";
    if (
      !isPermanent &&
      (formData.noDepedEmail ||
        formData.no_deped_email ||
        formData.depedEmail === "N/A")
    )
      return true;
    const email = formData.depedEmail;
    if (!email || email === "N/A") return !isPermanent;
    const val = validateDepEdEmail(
      email,
      formData.firstName,
      formData.lastName,
      formData.middleName,
    );
    return val.isValid;
  }, [formData]);

  const isFirstNameValid = useMemo(() => {
    return Boolean(
      formData && (formData.firstName || formData.first_name || "").trim(),
    );
  }, [formData]);

  const isLastNameValid = useMemo(() => {
    return Boolean(
      formData && (formData.lastName || formData.last_name || "").trim(),
    );
  }, [formData]);

  const isBirthdateValid = useMemo(() => {
    return Boolean(formData && formData.birthdate);
  }, [formData]);

  const currentAge = useMemo(() => {
    if (!formData || !formData.birthdate) return null;
    return getAge(formData.birthdate);
  }, [formData?.birthdate]);

  const cleanPhilsys = formData
    ? String(formData.philsysNo || "").replace(/\D/g, "")
    : "";
  const isEmailNA = Boolean(
    formData &&
    (formData.noDepedEmail ||
      formData.no_deped_email ||
      formData.depedEmail === "N/A"),
  );
  const localVal = formData
    ? isEmailNA
      ? "N/A"
      : getEmailLocal(formData.depedEmail)
    : "";
  const emailVal =
    formData && formData.depedEmail && !isEmailNA
      ? validateDepEdEmail(
          formData.depedEmail,
          formData.firstName,
          formData.lastName,
          formData.middleName,
        )
      : { isValid: true, error: null };
  const hasEmailError = Boolean(
    formData && !emailVal.isValid && formData.depedEmail && !isEmailNA,
  );

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData) return;

    const pos =
      formData.position ||
      formData.plantilla_position ||
      formData.position_title ||
      "";
    const pType =
      detectPersonnelTypeFromPosition(pos) || formData.type || "teaching";
    const isNonTeaching =
      ["non-teaching", "NON-TEACHING"].includes(pType) ||
      ["non-teaching", "NON-TEACHING"].includes(formData.type) ||
      ["NON-TEACHING"].includes(formData.positionCategory);

    // 1. Identity & Demographics
    if (!formData.firstName?.trim() || !formData.lastName?.trim()) {
      alert(
        "Please fill First Name and Last Name in the Personal Info section.",
      );
      return;
    }

    if (!formData.sexAtBirth && !formData.sex) {
      alert("Please select Sex at Birth in the Personal Info section.");
      return;
    }

    if (!formData.birthdate) {
      alert("Please enter your valid Birthdate in the Personal Info section.");
      return;
    }

    if (!isPhilsysValid) {
      alert(
        'PhilSys Card Number must be exactly 16 digits (or check "No PhilSys available").',
      );
      return;
    }

    const isPermanent =
      String(formData.natureOfAppointment || "").toUpperCase() ===
      "REGULAR PERMANENT";
    if (isPermanent) {
      if (
        !formData.depedEmail ||
        formData.depedEmail === "N/A" ||
        formData.noDepedEmail ||
        formData.no_deped_email
      ) {
        alert(
          "DepEd Official Email (@deped.gov.ph) is mandatory for Regular Permanent personnel.",
        );
        return;
      }
    }

    if (!isEmailValid) {
      const eVal = validateDepEdEmail(
        formData.depedEmail,
        formData.firstName,
        formData.lastName,
        formData.middleName,
      );
      alert(`Invalid DepEd Email: ${eVal.error}`);
      return;
    }

    // 2. Employment
    if (!formData.natureOfAppointment) {
      alert("Please select Nature of Appointment in the Employment section.");
      return;
    }

    if (!formData.hiringArrangement) {
      alert("Please select Hiring Arrangement in the Employment section.");
      return;
    }

    if (!formData.fundSource) {
      alert("Please select Fund Source in the Employment section.");
      return;
    }

    const currentNature = String(
      formData.natureOfAppointment || "",
    ).toUpperCase();
    if (
      [
        "CONTRACTUAL",
        "SUBSTITUTE",
        "CASUAL/EMERGENCY",
        "JOB ORDER/CONTRACT OF SERVICE",
        "VOLUNTEER",
      ].includes(currentNature)
    ) {
      if (
        String(formData.fundSource).toUpperCase() === "NATIONAL" &&
        !NATIONAL_FUND_ELIGIBLE_NATURES.includes(currentNature)
      ) {
        alert(
          "Only Contractual and Job Order/COS appointments can be NATIONAL funded. Please select SEF, LGU, PTA, NGO, or SCHOOL MOOE.",
        );
        return;
      }
    }

    if (!formData.firstServiceDate) {
      alert(
        "Please enter your Date of First Day of Service in the Employment section.",
      );
      return;
    }

    if (!formData.stepIncrementConfirmed) {
      alert(
        "Please confirm your Salary Step Increment by clicking your actual step button (1–8) in the Employment section.",
      );
      return;
    }

    // 3. Education / Qualifications (for teaching & teaching-related staff)
    if (!isNonTeaching) {
      if (!formData.highestEducationalAttainment) {
        alert(
          "Please select Highest Educational Attainment in the Education section.",
        );
        return;
      }

      const attainment = formData.highestEducationalAttainment || "";
      const isSHS = attainment === "SENIOR HIGH SCHOOL GRADUATE";
      const isVocational = attainment === "VOCATIONAL / TECH-VOC COURSE";
      const isCollege = [
        "COLLEGE GRADUATE / BACCALAUREATE",
        "COLLEGE UNDERGRADUATE",
      ].includes(attainment);
      const isPostGrad =
        attainment.includes("MASTER") || attainment.includes("DOCTOR");

      if (isCollege || isPostGrad || (!isSHS && !isVocational)) {
        const degrees = getEffectiveCollegeDegrees(formData);
        const hasValidDegree =
          degrees.length > 0
            ? degrees.some(
                (d) =>
                  d.collegeDegree?.trim() &&
                  d.collegeDegree !== "NONE" &&
                  d.collegeDegree !== "N/A",
              )
            : !!(
                formData.collegeDegree?.trim() &&
                formData.collegeDegree !== "NONE" &&
                formData.collegeDegree !== "N/A"
              );
        if (!hasValidDegree) {
          alert(
            "Please enter your College Degree / Baccalaureate in the Education section.",
          );
          return;
        }

        let missingMajor = false;
        if (degrees.length > 0) {
          degrees.forEach((d) => {
            const str = String(d.collegeDegree || "").toUpperCase();
            if (
              str.includes("EDUCATION") ||
              str.includes("SPECIAL ED") ||
              str.includes("KINDERGARTEN") ||
              str.includes("EARLY CHILDHOOD")
            ) {
              if (!d.major?.trim()) missingMajor = true;
            }
          });
        }
        if (missingMajor) {
          alert(
            "Please specify your Major in Education for your education degree.",
          );
          return;
        }
      }

      const eligList = Array.isArray(formData.eligibility)
        ? formData.eligibility
        : String(formData.eligibility || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      const eligStr = eligList.join(",").toUpperCase();
      const hasLet =
        eligStr.includes("LET") ||
        eligStr.includes("PBET") ||
        eligStr.includes("LICENSURE EXAMINATION FOR TEACHERS") ||
        eligStr.includes("PROFESSIONAL BOARD EXAMINATION FOR TEACHERS") ||
        eligStr.includes("PROVISIONAL");
      if (!hasLet) {
        alert(
          "Teaching personnel must possess Licensure Examination for Teachers (LET/PBET) or Provisional eligibility in the Education section.",
        );
        return;
      }
      if (
        (eligStr.includes("LET") ||
          eligStr.includes("PBET") ||
          eligStr.includes("LICENSURE") ||
          eligStr.includes("PROFESSIONAL BOARD")) &&
        !formData.prcSpecialization?.trim()
      ) {
        alert(
          "Please select your PRC Specialization in the Education section.",
        );
        return;
      }
    }

    // 4. Professional Development / Trainings (for teaching & teaching-related staff)
    if (!isNonTeaching) {
      const totalTrainingsCount =
        (formData.neapTrainingRows || []).length +
        (formData.certificationRows || []).length +
        (formData.otherTrainingRows || []).length;
      if (totalTrainingsCount === 0) {
        alert(
          "Please add at least one Professional Development / Training record (NEAP, TESDA, or Other Training) in Section 4.",
        );
        return;
      }

      if (!areTrainingsValid) {
        alert(
          "Please fill all required Training fields: Title, Start Date, End Date, and Total Hours (1–999).",
        );
        return;
      }
    }

    // 5. Teaching Assignment & Grade Levels
    if (!isNonTeaching) {
      if (
        !Array.isArray(formData.assignedGradeLevels) ||
        formData.assignedGradeLevels.length === 0
      ) {
        alert(
          "Please select at least one Assigned Grade Level in Section 5 (Teaching Assignment).",
        );
        return;
      }
    }

    // 6. Learning Area Matrix (Full Service Allocation)
    if (!isNonTeaching) {
      const maxYears = getMaxAllowedServiceYears(formData);
      const totalAssigned = getTotalAssignedLearningYears(
        formData.learningAreaMap || formData.matrix_data,
      );
      if (totalAssigned !== maxYears) {
        alert(
          `Learning Area Matrix Incomplete: You must fully allocate all ${maxYears} years of teaching experience across the curriculum matrix (Currently allocated: ${totalAssigned}/${maxYears} yrs).`,
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const activeSchoolId =
        urlParams.get("schoolId") ||
        urlParams.get("school_id") ||
        formData.school_id ||
        "502624";

      // Auto-compute stepIncrement for payload
      const effFirst = formData.firstServiceDate || "";
      const effProm = formData.lastPromotionDate || "";
      let computedStep = 1;
      if (effFirst) {
        const cleanDate =
          typeof (effProm && effProm !== "N/A" ? effProm : effFirst) ===
          "string"
            ? (effProm && effProm !== "N/A" ? effProm : effFirst).substring(
                0,
                10,
              )
            : "";
        const baseDate = new Date(cleanDate + "T00:00:00");
        if (!isNaN(baseDate.getTime())) {
          const now = new Date();
          let years = now.getFullYear() - baseDate.getFullYear();
          const mDiff = now.getMonth() - baseDate.getMonth();
          if (mDiff < 0 || (mDiff === 0 && now.getDate() < baseDate.getDate()))
            years--;
          years = Math.max(0, years);
          computedStep = Math.min(8, Math.max(1, 1 + Math.floor(years / 3)));
        }
      }

      const resolvedPersonnelId = String(
        formData.id ||
          formData.prn ||
          candidateTeacher?.id ||
          candidateTeacher?.prn ||
          selectedTeacherId ||
          "",
      ).trim();
      const resolvedPersonnelName =
        `${formData.lastName || ""}, ${formData.firstName || ""}`.trim() ||
        formData.name ||
        candidateTeacher?.name ||
        "Teacher";

      const payload = {
        schoolId: activeSchoolId,
        room: scannedRoom || "ROOM-01",
        personnelId: resolvedPersonnelId,
        personnelName: resolvedPersonnelName,
        profileData: {
          ...formData,
          id: resolvedPersonnelId,
          noEmployeeNo: !!(
            formData.noEmployeeNo ||
            formData.no_employee_no ||
            formData.employeeNo === "N/A" ||
            formData.employee_no === "N/A"
          ),
          no_employee_no: !!(
            formData.noEmployeeNo ||
            formData.no_employee_no ||
            formData.employeeNo === "N/A" ||
            formData.employee_no === "N/A"
          ),
          employeeNo:
            formData.noEmployeeNo ||
            formData.no_employee_no ||
            formData.employeeNo === "N/A" ||
            formData.employee_no === "N/A"
              ? "N/A"
              : formData.employeeNo || formData.employee_no || "",
          employee_no:
            formData.noEmployeeNo ||
            formData.no_employee_no ||
            formData.employeeNo === "N/A" ||
            formData.employee_no === "N/A"
              ? "N/A"
              : formData.employeeNo || formData.employee_no || "",
          prcSpecialization:
            formData.prcSpecialization || formData.prc_specialization || "N/A",
          prc_specialization:
            formData.prcSpecialization || formData.prc_specialization || "N/A",
          noDepedEmail: !!(
            formData.noDepedEmail ||
            formData.no_deped_email ||
            formData.depedEmail === "N/A"
          ),
          no_deped_email: !!(
            formData.noDepedEmail ||
            formData.no_deped_email ||
            formData.depedEmail === "N/A"
          ),
          depedEmail:
            formData.noDepedEmail ||
            formData.no_deped_email ||
            formData.depedEmail === "N/A"
              ? "N/A"
              : formData.depedEmail || "",
          deped_email:
            formData.noDepedEmail ||
            formData.no_deped_email ||
            formData.depedEmail === "N/A"
              ? "N/A"
              : formData.depedEmail || "",
          stepIncrement: formData.stepIncrement || computedStep,
          step_increment: formData.stepIncrement || computedStep,
          stepIncrementConfirmed: true,
          step_increment_confirmed: true,
          lastPromotionDate: formData.lastPromotionDate || "N/A",
          last_promotion_date: formData.lastPromotionDate || "N/A",
          newStationDate:
            formData.newStationDate || formData.firstServiceDate || "N/A",
          new_station_date:
            formData.newStationDate || formData.firstServiceDate || "N/A",
          lastLateralMovementDate: formData.lastLateralMovementDate || "N/A",
          last_lateral_movement_date: formData.lastLateralMovementDate || "N/A",
          mastersWithUnitsDisciplines: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            return ep.mastersWithUnits || [];
          })(),
          mastersGraduatedDisciplines: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            return ep.mastersGraduated || [];
          })(),
          doctorateWithUnitsDisciplines: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            return ep.doctorateWithUnits || [];
          })(),
          doctorateGraduatedDisciplines: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            return ep.doctorateGraduated || [];
          })(),
          mastersDisciplines: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            return [
              ...new Set([
                ...(ep.mastersWithUnits || []),
                ...(ep.mastersGraduated || []),
              ]),
            ];
          })(),
          doctorateDisciplines: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            return [
              ...new Set([
                ...(ep.doctorateWithUnits || []),
                ...(ep.doctorateGraduated || []),
              ]),
            ];
          })(),
          mastersDiscipline: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            const allM = [
              ...new Set([
                ...(ep.mastersWithUnits || []),
                ...(ep.mastersGraduated || []),
              ]),
            ];
            return (
              formData.mastersDiscipline ||
              formData.masters_discipline ||
              (allM.length > 0 ? allM.join(", ") : "")
            );
          })(),
          masters_discipline: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            const allM = [
              ...new Set([
                ...(ep.mastersWithUnits || []),
                ...(ep.mastersGraduated || []),
              ]),
            ];
            return (
              formData.mastersDiscipline ||
              formData.masters_discipline ||
              (allM.length > 0 ? allM.join(", ") : "")
            );
          })(),
          doctorateDiscipline: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            const allD = [
              ...new Set([
                ...(ep.doctorateWithUnits || []),
                ...(ep.doctorateGraduated || []),
              ]),
            ];
            return (
              formData.doctorateDiscipline ||
              formData.doctorate_discipline ||
              formData.phdDiscipline ||
              formData.phd_discipline ||
              (allD.length > 0 ? allD.join(", ") : "")
            );
          })(),
          doctorate_discipline: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            const allD = [
              ...new Set([
                ...(ep.doctorateWithUnits || []),
                ...(ep.doctorateGraduated || []),
              ]),
            ];
            return (
              formData.doctorateDiscipline ||
              formData.doctorate_discipline ||
              formData.phdDiscipline ||
              formData.phd_discipline ||
              (allD.length > 0 ? allD.join(", ") : "")
            );
          })(),
          phdDiscipline: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            const allD = [
              ...new Set([
                ...(ep.doctorateWithUnits || []),
                ...(ep.doctorateGraduated || []),
              ]),
            ];
            return (
              formData.doctorateDiscipline ||
              formData.doctorate_discipline ||
              formData.phdDiscipline ||
              formData.phd_discipline ||
              (allD.length > 0 ? allD.join(", ") : "")
            );
          })(),
          phd_discipline: (() => {
            const ep = getEffectivePostGradDisciplines(formData);
            const allD = [
              ...new Set([
                ...(ep.doctorateWithUnits || []),
                ...(ep.doctorateGraduated || []),
              ]),
            ];
            return (
              formData.doctorateDiscipline ||
              formData.doctorate_discipline ||
              formData.phdDiscipline ||
              formData.phd_discipline ||
              (allD.length > 0 ? allD.join(", ") : "")
            );
          })(),
          postGraduateDiscipline: (() => {
            if (
              typeof formData.postGraduateDiscipline === "string" &&
              formData.postGraduateDiscipline.startsWith("{")
            ) {
              return formData.postGraduateDiscipline;
            }
            if (
              typeof formData.post_graduate_discipline === "string" &&
              formData.post_graduate_discipline.startsWith("{")
            ) {
              return formData.post_graduate_discipline;
            }
            const ep = getEffectivePostGradDisciplines(formData);
            const allM = [
              ...new Set([
                ...(ep.mastersWithUnits || []),
                ...(ep.mastersGraduated || []),
              ]),
            ];
            const allD = [
              ...new Set([
                ...(ep.doctorateWithUnits || []),
                ...(ep.doctorateGraduated || []),
              ]),
            ];
            return JSON.stringify({
              mastersWithUnits: ep.mastersWithUnits || [],
              mastersGraduated: ep.mastersGraduated || [],
              doctorateWithUnits: ep.doctorateWithUnits || [],
              doctorateGraduated: ep.doctorateGraduated || [],
              masters: allM,
              doctorate: allD,
            });
          })(),
          post_graduate_discipline: (() => {
            if (
              typeof formData.postGraduateDiscipline === "string" &&
              formData.postGraduateDiscipline.startsWith("{")
            ) {
              return formData.postGraduateDiscipline;
            }
            if (
              typeof formData.post_graduate_discipline === "string" &&
              formData.post_graduate_discipline.startsWith("{")
            ) {
              return formData.post_graduate_discipline;
            }
            const ep = getEffectivePostGradDisciplines(formData);
            const allM = [
              ...new Set([
                ...(ep.mastersWithUnits || []),
                ...(ep.mastersGraduated || []),
              ]),
            ];
            const allD = [
              ...new Set([
                ...(ep.doctorateWithUnits || []),
                ...(ep.doctorateGraduated || []),
              ]),
            ];
            return JSON.stringify({
              mastersWithUnits: ep.mastersWithUnits || [],
              mastersGraduated: ep.mastersGraduated || [],
              doctorateWithUnits: ep.doctorateWithUnits || [],
              doctorateGraduated: ep.doctorateGraduated || [],
              masters: allM,
              doctorate: allD,
            });
          })(),
          school_id: activeSchoolId,
          lastVerifiedAt: new Date().toISOString(),
        },
      };

      await api.submitRoomProfiling(payload);
      setIsSubmitted(true);
    } catch (err) {
      console.error("Error submitting room verification:", err);
      alert(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isNonTeaching = Boolean(
    formData?.type === "non-teaching" ||
    detectPersonnelTypeFromPosition(formData?.position) === "non-teaching" ||
    (candidateTeacher &&
      (candidateTeacher.type === "non-teaching" ||
        detectPersonnelTypeFromPosition(candidateTeacher.position) ===
          "non-teaching")),
  );

  useEffect(() => {
    if (
      isNonTeaching &&
      (activeTab === "teaching" || activeTab === "learning-area")
    ) {
      setActiveTab("personal");
    }
  }, [isNonTeaching, activeTab]);

  const navTabs = [
    { id: "personal", label: "Personal", icon: FiUser },
    { id: "employment", label: "Employment", icon: FiBriefcase },
    { id: "education", label: "Education", icon: FiAward },
    { id: "development", label: "L&D Trainings", icon: FiFileText },
    ...(!isNonTeaching
      ? [
          { id: "teaching", label: "Teaching", icon: FiLayers },
          { id: "learning-area", label: "Learning Areas", icon: FiBook },
        ]
      : []),
  ];

  const activeTabIndex = navTabs.findIndex((t) => t.id === activeTab);
  const handlePrevTab = () => {
    if (activeTabIndex > 0) setActiveTab(navTabs[activeTabIndex - 1].id);
  };
  const handleNextTab = () => {
    if (activeTabIndex < navTabs.length - 1)
      setActiveTab(navTabs[activeTabIndex + 1].id);
  };

  if (isSubmitted) {
    return (
      <div
        style={{
          maxWidth: "640px",
          margin: "40px auto",
          padding: "0 16px",
          minHeight: "80vh",
          display: "flex",
          alignItems: "center",
        }}
      >
        <article
          className="card"
          style={{
            width: "100%",
            border: "2.5px solid var(--outline)",
            borderRadius: "24px",
            textAlign: "center",
            background: "#FFFFFF",
          }}
        >
          <div
            className="card-inner"
            style={{
              padding: "40px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                background: "#ECFDF5",
                display: "grid",
                placeItems: "center",
                color: "#10B981",
              }}
            >
              <FiCheck size={36} />
            </div>
            <div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#10B981",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Verification Submitted
              </span>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "var(--navy)",
                  margin: "4px 0 8px 0",
                }}
              >
                Profile Successfully Updated!
              </h1>
              <p
                className="subtext"
                style={{
                  fontSize: "14px",
                  color: "var(--muted)",
                  margin: 0,
                  lineHeight: "1.6",
                }}
              >
                Thank you,{" "}
                <strong>
                  Teacher {formData?.firstName} {formData?.lastName}
                </strong>
                . Your updated identity, employment, education, and credentials
                have been transmitted to your School Head for{" "}
                <strong>Room ID: {scannedRoom || "ROOM-01"}</strong>.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                width: "100%",
                marginTop: "16px",
                maxWidth: "360px",
              }}
            >
              <button
                className="btn secondary"
                onClick={handleLockSession}
                style={{ flex: 1, minHeight: "44px" }}
              >
                Exit / Done
              </button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "840px",
        margin: "0 auto",
        padding: "16px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Header Banner */}
      <header
        style={{
          background: "linear-gradient(135deg, var(--navy), var(--blue))",
          padding: "20px 22px",
          borderRadius: "20px",
          color: "white",
          boxShadow: "0 10px 30px rgba(8, 49, 95, 0.15)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "var(--gold)",
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: "11px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            INSIGHTED FACULTY PORTAL
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              background: "rgba(255,255,255,0.2)",
              padding: "2px 8px",
              borderRadius: "12px",
            }}
          >
            Room ID: {scannedRoom || "ROOM-01"}
          </span>
        </div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, margin: 0 }}>
          Teacher Self-Service Profiling
        </h1>
        <p style={{ margin: "2px 0 0 0", fontSize: "12px", opacity: 0.9 }}>
          Update all personal credentials, education, service history, and
          learning areas.
        </p>
      </header>

      {/* 2-Step Sequential Authentication Gate */}
      {!isUnlocked && (
        <article
          className="card"
          style={{
            border: "2.5px solid var(--outline)",
            borderRadius: "22px",
            background: "#FFFFFF",
            overflow: "hidden",
          }}
        >
          <div
            className="card-inner"
            style={{
              padding: "32px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* Step Progress Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: authStep === 1 ? "var(--navy)" : "#10B981",
                  color: "#FFFFFF",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: "12px",
                }}
              >
                {authStep > 1 ? <FiCheck size={16} /> : "1"}
              </div>
              <div
                style={{
                  width: "40px",
                  height: "2px",
                  background: authStep === 2 ? "#10B981" : "#E2E8F0",
                }}
              />
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: authStep === 2 ? "var(--navy)" : "#F1F5F9",
                  color: authStep === 2 ? "#FFFFFF" : "#94A3B8",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: "12px",
                }}
              >
                2
              </div>
            </div>

            {/* Lockout Notice if 3 failed attempts */}
            {isLockedOut && (
              <div
                style={{
                  width: "100%",
                  padding: "14px",
                  background: "#FEF2F2",
                  border: "1.5px solid #F87171",
                  borderRadius: "12px",
                  color: "#991B1B",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  textAlign: "left",
                }}
              >
                <FiShield size={24} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: "13px" }}>
                    Security Lockout Active
                  </div>
                  <div style={{ fontSize: "12px", marginTop: "2px" }}>
                    3 failed attempts reached. Passcode entry is disabled across
                    all devices.
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "#DC2626",
                      marginTop: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <FiClock size={14} /> Unlocks in:{" "}
                    {formatLockoutCountdown(lockoutRemainingSecs)}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1 FORM: Enter Passcode */}
            {authStep === 1 && (
              <form
                onSubmit={handleVerifyPasscode}
                style={{
                  width: "100%",
                  maxWidth: "360px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "#F0F9FF",
                    margin: "0 auto",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--blue)",
                  }}
                >
                  <FiKey size={26} />
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "var(--navy)",
                      margin: "0 0 4px 0",
                    }}
                  >
                    Step 1: Enter Passcode
                  </h2>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      margin: 0,
                    }}
                  >
                    Enter the active 8-character passcode provided by your
                    School Head.
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label
                    style={{
                      fontWeight: 800,
                      fontSize: "11px",
                      color: "var(--navy)",
                    }}
                  >
                    8-Character Passcode
                  </label>
                  <input
                    type="text"
                    autoFocus
                    disabled={isLockedOut}
                    maxLength={8}
                    placeholder="e.g. 9Y67JBUG"
                    value={enteredPasscode}
                    onChange={(e) =>
                      setEnteredPasscode(e.target.value.toUpperCase())
                    }
                    style={{
                      textAlign: "center",
                      fontFamily: "monospace",
                      fontSize: "20px",
                      fontWeight: 900,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      padding: "10px",
                    }}
                  />
                </div>

                {errorMessage && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#DC2626",
                      fontWeight: 700,
                      padding: "8px",
                      background: "#FEF2F2",
                      borderRadius: "8px",
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn"
                  disabled={isLockedOut || !enteredPasscode.trim()}
                  style={{
                    minHeight: "44px",
                    fontWeight: 800,
                    fontSize: "14px",
                    width: "100%",
                  }}
                >
                  Verify Passcode ➔
                </button>
              </form>
            )}

            {/* STEP 2 FORM: Enter Last Name & Birth Year */}
            {authStep === 2 && (
              <form
                onSubmit={handleVerifyIdentity}
                style={{
                  width: "100%",
                  maxWidth: "360px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "#ECFDF5",
                    margin: "0 auto",
                    display: "grid",
                    placeItems: "center",
                    color: "#10B981",
                  }}
                >
                  <FiUserCheck size={26} />
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "var(--navy)",
                      margin: "0 0 4px 0",
                    }}
                  >
                    Step 2: Confirm Identity
                  </h2>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      margin: 0,
                    }}
                  >
                    Enter your Last Name and Birth Year to unlock your personal
                    profiling record.
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label
                    style={{
                      fontWeight: 800,
                      fontSize: "11px",
                      color: "var(--navy)",
                    }}
                  >
                    Last Name / Surname
                  </label>
                  <input
                    type="text"
                    autoFocus
                    disabled={isLockedOut}
                    placeholder="e.g. DELA CRUZ"
                    value={enteredLastName}
                    onChange={(e) =>
                      setEnteredLastName(e.target.value.toUpperCase())
                    }
                    style={{
                      fontWeight: 700,
                      fontSize: "14px",
                      textTransform: "uppercase",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label
                    style={{
                      fontWeight: 800,
                      fontSize: "11px",
                      color: "var(--navy)",
                    }}
                  >
                    Birth Year (YYYY)
                  </label>
                  <input
                    type="text"
                    disabled={isLockedOut}
                    maxLength={4}
                    placeholder="e.g. 1985"
                    value={enteredBirthYear}
                    onChange={(e) =>
                      setEnteredBirthYear(
                        e.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                    style={{
                      textAlign: "center",
                      fontFamily: "monospace",
                      fontWeight: 800,
                      fontSize: "16px",
                    }}
                  />
                </div>

                {errorMessage && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#DC2626",
                      fontWeight: 700,
                      padding: "8px",
                      background: "#FEF2F2",
                      borderRadius: "8px",
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 2fr",
                    gap: "10px",
                  }}
                >
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setAuthStep(1);
                      setErrorMessage("");
                    }}
                    style={{ minHeight: "44px" }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn"
                    disabled={
                      isLockedOut ||
                      !enteredLastName.trim() ||
                      enteredBirthYear.length !== 4
                    }
                    style={{
                      minHeight: "44px",
                      fontWeight: 800,
                      fontSize: "14px",
                    }}
                  >
                    Unlock Profile ➔
                  </button>
                </div>
              </form>
            )}
          </div>
        </article>
      )}

      {/* FULL 6-SECTION PROFILING SUITE (Rendered once unlocked) */}
      {isUnlocked && formData && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Active Teacher Banner */}
          <div
            style={{
              padding: "12px 16px",
              background: "#F0FDF4",
              border: "1.5px solid #BBF7D0",
              borderRadius: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <FiUserCheck size={20} color="#16A34A" />
              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 800,
                    color: "#14532D",
                  }}
                >
                  {formData.lastName}, {formData.firstName}{" "}
                  {formData.nameExtension || ""}
                </div>
                <div style={{ fontSize: "11px", color: "#15803D" }}>
                  {formData.position || "Teacher"} ·{" "}
                  {formData.natureOfAppointment || "Permanent"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn secondary"
              onClick={handleLockSession}
              style={{ fontSize: "11px", padding: "4px 10px", fontWeight: 700 }}
            >
              <FiLock size={12} /> Lock
            </button>
          </div>

          {/* 6-Section Mobile Tab Bar */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              paddingBottom: "4px",
              scrollbarWidth: "none",
            }}
          >
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: isActive
                      ? "1.5px solid var(--blue)"
                      : "1px solid var(--line)",
                    background: isActive ? "var(--blue)" : "#FFFFFF",
                    color: isActive ? "#FFFFFF" : "var(--navy)",
                    fontWeight: isActive ? 800 : 600,
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Tab Content Card */}
          <article
            className="card"
            style={{
              border: "2px solid var(--outline)",
              borderRadius: "18px",
              background: "#FFFFFF",
            }}
          >
            <div
              className="card-inner"
              style={{
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {/* TAB 1: PERSONAL INFORMATION */}
              {activeTab === "personal" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      fontWeight: 800,
                      color: "var(--navy)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FiUser size={16} /> 1. Identity &amp; Demographics
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={formData.firstName || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            "firstName",
                            e.target.value.toUpperCase(),
                          )
                        }
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Middle Name
                      </label>
                      <input
                        type="text"
                        value={formData.middleName || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            "middleName",
                            e.target.value.toUpperCase(),
                          )
                        }
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={formData.lastName || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            "lastName",
                            e.target.value.toUpperCase(),
                          )
                        }
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Name Extension (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. JR., III"
                        value={formData.nameExtension || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            "nameExtension",
                            e.target.value.toUpperCase(),
                          )
                        }
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Sex at Birth *
                      </label>
                      <SearchableDropdown
                        options={["FEMALE", "MALE"]}
                        value={formData.sexAtBirth || ""}
                        onChange={(val) => handleFieldChange("sexAtBirth", val)}
                        placeholder="Select Sex..."
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Civil Status *
                      </label>
                      <SearchableDropdown
                        options={[
                          "SINGLE",
                          "MARRIED",
                          "WIDOWED",
                          "LEGALLY SEPARATED",
                        ]}
                        value={formData.civilStatus || ""}
                        onChange={(val) =>
                          handleFieldChange("civilStatus", val)
                        }
                        placeholder="Select Civil Status..."
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Solo Parent
                      </label>
                      <SearchableDropdown
                        options={["NO", "YES"]}
                        value={formData.soloParent || "NO"}
                        onChange={(val) => handleFieldChange("soloParent", val)}
                        placeholder="Solo Parent..."
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Religion *
                      </label>
                      <SearchableDropdown
                        options={RELIGION_OPTIONS.map((r) => r.toUpperCase())}
                        value={formData.religion || ""}
                        onChange={(val) => handleFieldChange("religion", val)}
                        placeholder="Select Religion..."
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Ethnic Group *
                      </label>
                      <SearchableDropdown
                        options={ETHNIC_GROUP_OPTIONS}
                        value={formData.ethnicGroup || ""}
                        onChange={(val) =>
                          handleFieldChange("ethnicGroup", val)
                        }
                        placeholder="Select Ethnic Group..."
                      />
                    </div>
                  </div>

                  {/* Credentials: DepEd Email, PhilSys, TIN */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      marginTop: "6px",
                    }}
                  >
                    {/* DepEd Email */}
                    <div>
                      {(() => {
                        const isPermanent =
                          String(
                            formData?.natureOfAppointment ||
                              formData?.nature_of_appointment ||
                              "",
                          ).toUpperCase() === "REGULAR PERMANENT";
                        const isEmailNA =
                          !isPermanent &&
                          Boolean(
                            formData.noDepedEmail ||
                            formData.no_deped_email ||
                            formData.depedEmail === "N/A",
                          );
                        return (
                          <>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "4px",
                              }}
                            >
                              <label
                                style={{ fontSize: "11px", fontWeight: 700 }}
                              >
                                DepEd Official Email (@deped.gov.ph)
                              </label>
                              {isEmailNA && (
                                <span
                                  style={{
                                    fontSize: "10px",
                                    color: "#64748B",
                                    fontWeight: 700,
                                    background: "#F1F5F9",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  N/A
                                </span>
                              )}
                            </div>
                            {isEmailNA ? (
                              <div
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  background: "#F8FAFC",
                                  border: "1.5px dashed #CBD5E1",
                                  color: "#64748B",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                N/A (No DepEd email issued)
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  borderRadius: "8px",
                                  border: hasEmailError
                                    ? "2px solid #EF4444"
                                    : "1.5px solid var(--line)",
                                  background: hasEmailError
                                    ? "#FEF2F2"
                                    : "white",
                                  overflow: "hidden",
                                }}
                              >
                                <input
                                  type="text"
                                  value={localVal}
                                  onChange={(e) =>
                                    handleEmailLocalChange(e.target.value)
                                  }
                                  placeholder="first.last"
                                  style={{
                                    flex: 1,
                                    border: 0,
                                    padding: "8px 12px",
                                    fontSize: "12px",
                                    outline: "none",
                                  }}
                                />
                                <span
                                  style={{
                                    padding: "0 10px",
                                    background: "#F0F9FF",
                                    borderLeft: "1px solid var(--line)",
                                    fontSize: "11px",
                                    fontWeight: "bold",
                                    color: "var(--blue)",
                                  }}
                                >
                                  @deped.gov.ph
                                </span>
                              </div>
                            )}
                            {hasEmailError && !isEmailNA && (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "11px",
                                  color: "#DC2626",
                                  fontWeight: 700,
                                }}
                              >
                                <FiAlertCircle size={12} /> {emailVal.error}
                              </p>
                            )}
                            {!isPermanent && (
                              <label
                                style={{
                                  fontSize: "11px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  marginTop: "6px",
                                  whiteSpace: "nowrap",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isEmailNA}
                                  onChange={(e) => {
                                    handleMultipleFieldsChange({
                                      noDepedEmail: e.target.checked,
                                      no_deped_email: e.target.checked,
                                      depedEmail: e.target.checked ? "N/A" : "",
                                      deped_email: e.target.checked
                                        ? "N/A"
                                        : "",
                                    });
                                  }}
                                />{" "}
                                No DepEd email issued (N/A)
                              </label>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* PhilSys */}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <label style={{ fontSize: "11px", fontWeight: 700 }}>
                          PhilSys No. (National ID)
                        </label>
                        <span
                          style={{
                            fontSize: "10px",
                            color: formData.noPhilsys
                              ? "#64748B"
                              : cleanPhilsys.length === 16
                                ? "#10B981"
                                : "#DC2626",
                            fontWeight: 700,
                          }}
                        >
                          {formData.noPhilsys
                            ? "N/A"
                            : `${cleanPhilsys.length}/16 digits`}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          disabled={formData.noPhilsys}
                          maxLength={16}
                          placeholder="16-digit PhilSys Number"
                          value={
                            formData.noPhilsys ? "" : formData.philsysNo || ""
                          }
                          onChange={(e) =>
                            handleFieldChange(
                              "philsysNo",
                              e.target.value.replace(/\D/g, ""),
                            )
                          }
                          style={{ flex: 1 }}
                        />
                        <label
                          style={{
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!formData.noPhilsys}
                            onChange={(e) => {
                              handleMultipleFieldsChange({
                                noPhilsys: e.target.checked,
                                philsysNo: e.target.checked
                                  ? ""
                                  : formData.philsysNo,
                              });
                            }}
                          />{" "}
                          No PhilSys
                        </label>
                      </div>
                    </div>

                    {/* TIN */}
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        TIN (Tax Identification Number)
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          disabled={formData.noTin}
                          maxLength={11}
                          placeholder="123-456-789"
                          value={formData.noTin ? "" : formData.tin || ""}
                          onChange={(e) => {
                            let val = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 9);
                            let formatted = "";
                            if (val.length > 0) formatted += val.slice(0, 3);
                            if (val.length > 3)
                              formatted += "-" + val.slice(3, 6);
                            if (val.length > 6)
                              formatted += "-" + val.slice(6, 9);
                            handleFieldChange("tin", formatted);
                          }}
                          style={{ flex: 1 }}
                        />
                        <label
                          style={{
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!formData.noTin}
                            onChange={(e) => {
                              handleMultipleFieldsChange({
                                noTin: e.target.checked,
                                tin: e.target.checked ? "" : formData.tin,
                              });
                            }}
                          />{" "}
                          No TIN
                        </label>
                      </div>
                    </div>

                    {/* Employee No. */}
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Employee No. (DepEd / Plantilla Item No.)
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          disabled={
                            !!(
                              formData.noEmployeeNo ||
                              formData.no_employee_no ||
                              formData.employeeNo === "N/A" ||
                              formData.employee_no === "N/A"
                            )
                          }
                          placeholder={
                            formData.noEmployeeNo ||
                            formData.no_employee_no ||
                            formData.employeeNo === "N/A" ||
                            formData.employee_no === "N/A"
                              ? "N/A (No Issuance)"
                              : "e.g. 4589211"
                          }
                          value={
                            formData.noEmployeeNo ||
                            formData.no_employee_no ||
                            formData.employeeNo === "N/A" ||
                            formData.employee_no === "N/A"
                              ? "N/A"
                              : formData.employeeNo &&
                                  !String(formData.employeeNo)
                                    .toUpperCase()
                                    .startsWith("PRN")
                                ? formData.employeeNo
                                : formData.employee_no &&
                                    !String(formData.employee_no)
                                      .toUpperCase()
                                      .startsWith("PRN")
                                  ? formData.employee_no
                                  : ""
                          }
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            handleMultipleFieldsChange({
                              employeeNo: val,
                              employee_no: val,
                              noEmployeeNo: false,
                              no_employee_no: false,
                            });
                          }}
                          style={{ flex: 1 }}
                        />
                        <label
                          style={{
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={
                              !!(
                                formData.noEmployeeNo ||
                                formData.no_employee_no ||
                                formData.employeeNo === "N/A" ||
                                formData.employee_no === "N/A"
                              )
                            }
                            onChange={(e) => {
                              handleMultipleFieldsChange({
                                noEmployeeNo: e.target.checked,
                                no_employee_no: e.target.checked,
                                employeeNo: e.target.checked ? "N/A" : "",
                                employee_no: e.target.checked ? "N/A" : "",
                              });
                            }}
                          />{" "}
                          No Employee No.
                        </label>
                      </div>
                    </div>

                    {/* Birthdate & Age */}
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Birthdate *
                      </label>
                      <DatePickerDropdowns
                        value={formData.birthdate || ""}
                        onChange={(val) => handleFieldChange("birthdate", val)}
                        maxDate={maxBirthdate}
                      />
                      {currentAge !== null && (
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "var(--blue)",
                            marginTop: "4px",
                          }}
                        >
                          Age: {currentAge} years old
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EMPLOYMENT */}
              {activeTab === "employment" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      fontWeight: 800,
                      color: "var(--navy)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FiBriefcase size={16} /> 2. Employment &amp; Appointment
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Personnel Category *
                      </label>
                      <SearchableDropdown
                        options={[
                          "TEACHING",
                          "RELATED TEACHING",
                          "NON-TEACHING",
                        ]}
                        value={
                          formData.type === "non-teaching"
                            ? "NON-TEACHING"
                            : formData.type === "teaching-related"
                              ? "RELATED TEACHING"
                              : "TEACHING"
                        }
                        onChange={(val) => {
                          const mapping = {
                            TEACHING: "teaching",
                            "RELATED TEACHING": "teaching-related",
                            "NON-TEACHING": "non-teaching",
                          };
                          const newType = mapping[val] || "teaching";
                          const currentNature = String(
                            formData.natureOfAppointment || "",
                          ).toUpperCase();
                          const updates = { type: newType };
                          if (newType === "non-teaching") {
                            if (
                              ["PROVISIONAL", "SUBSTITUTE"].includes(
                                currentNature,
                              )
                            ) {
                              updates.natureOfAppointment = "REGULAR PERMANENT";
                              updates.hiringArrangement = "REGULAR";
                              updates.fundSource = "NATIONAL";
                            } else if (currentNature === "REGULAR PERMANENT") {
                              updates.hiringArrangement = "REGULAR";
                              updates.fundSource = "NATIONAL";
                            }
                          }
                          handleMultipleFieldsChange(updates);
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Plantilla Position *
                      </label>
                      <SearchableDropdown
                        options={(() => {
                          const catKey =
                            formData.type === "teaching-related"
                              ? "teaching-related"
                              : formData.type === "non-teaching"
                                ? "non-teaching"
                                : "teaching";
                          return (
                            POSITION_OPTIONS_BY_CATEGORY[catKey] || []
                          ).map((p) => p.toUpperCase());
                        })()}
                        value={formData.position || ""}
                        onChange={(val) => {
                          const detectedType =
                            detectPersonnelTypeFromPosition(val);
                          const isCook =
                            String(val || "")
                              .trim()
                              .toUpperCase() === "COOK";
                          const updates = { position: val };
                          if (isCook) {
                            updates.type = "non-teaching";
                            updates.natureOfAppointment = "CONTRACTUAL";
                            updates.hiringArrangement = "CONTRACTUAL";
                            updates.fundSource = "SBFP";
                          } else {
                            if (
                              String(
                                formData.fundSource || "",
                              ).toUpperCase() === "SBFP"
                            ) {
                              updates.fundSource = "NATIONAL";
                            }
                            if (detectedType) {
                              updates.type = detectedType;
                              if (detectedType === "non-teaching") {
                                const currentNature = String(
                                  formData.natureOfAppointment || "",
                                ).toUpperCase();
                                if (
                                  ["PROVISIONAL", "SUBSTITUTE"].includes(
                                    currentNature,
                                  )
                                ) {
                                  updates.natureOfAppointment =
                                    "REGULAR PERMANENT";
                                  updates.hiringArrangement = "REGULAR";
                                  updates.fundSource = "NATIONAL";
                                } else if (
                                  currentNature === "REGULAR PERMANENT"
                                ) {
                                  updates.hiringArrangement = "REGULAR";
                                  updates.fundSource = "NATIONAL";
                                }
                              }
                            }
                          }
                          handleMultipleFieldsChange(updates);
                        }}
                        placeholder="Select Position..."
                      />
                    </div>

                    {(() => {
                      const personCategory =
                        detectPersonnelTypeFromPosition(formData.position) ||
                        formData.type ||
                        "teaching";
                      const isNonTeaching = personCategory === "non-teaching";
                      const isCookPosition =
                        String(formData.position || "")
                          .trim()
                          .toUpperCase() === "COOK";
                      const currentNature = String(
                        formData.natureOfAppointment || "",
                      ).toUpperCase();

                      // 1. Nature of Appointment Options
                      const natureOptions = isNonTeaching
                        ? [
                            "REGULAR PERMANENT",
                            "CONTRACTUAL",
                            "CASUAL/EMERGENCY",
                            "JOB ORDER/CONTRACT OF SERVICE",
                            "VOLUNTEER",
                          ]
                        : [
                            "REGULAR PERMANENT",
                            "PROVISIONAL",
                            "CONTRACTUAL",
                            "SUBSTITUTE",
                            "CASUAL/EMERGENCY",
                            "JOB ORDER/CONTRACT OF SERVICE",
                            "VOLUNTEER",
                          ];

                      // 2. Hiring Arrangement Config
                      let hiringOptions = [];
                      let isHiringDisabled = false;
                      let hiringValue = formData.hiringArrangement || "";

                      if (currentNature === "REGULAR PERMANENT") {
                        if (isNonTeaching) {
                          hiringOptions = ["REGULAR"];
                          hiringValue = "REGULAR";
                          isHiringDisabled = true;
                        } else {
                          hiringOptions = ["REGULAR", "SPIMS", "4PS", "DOST"];
                          isHiringDisabled = false;
                          if (
                            !hiringValue ||
                            hiringValue === "N/A" ||
                            !hiringOptions.includes(hiringValue.toUpperCase())
                          ) {
                            hiringValue = "REGULAR";
                          }
                        }
                      } else if (currentNature === "PROVISIONAL") {
                        hiringOptions = ["DOST"];
                        hiringValue = "DOST";
                        isHiringDisabled = true;
                      } else if (
                        [
                          "CONTRACTUAL",
                          "SUBSTITUTE",
                          "CASUAL/EMERGENCY",
                          "JOB ORDER/CONTRACT OF SERVICE",
                          "VOLUNTEER",
                        ].includes(currentNature)
                      ) {
                        hiringOptions = isCookPosition
                          ? ["CONTRACTUAL", "REGULAR", "N/A"]
                          : ["N/A"];
                        hiringValue = isCookPosition
                          ? formData.hiringArrangement || "CONTRACTUAL"
                          : "N/A";
                        isHiringDisabled = !isCookPosition;
                      } else {
                        hiringOptions = isNonTeaching
                          ? ["REGULAR", "N/A"]
                          : ["REGULAR", "SPIMS", "4PS", "DOST", "N/A"];
                        isHiringDisabled = false;
                      }

                      // 3. Fund Source Config
                      let fundOptions = [];
                      let isFundDisabled = false;
                      let fundValue = formData.fundSource || "";

                      if (
                        currentNature === "REGULAR PERMANENT" ||
                        currentNature === "PROVISIONAL"
                      ) {
                        fundOptions = ["NATIONAL"];
                        fundValue = "NATIONAL";
                        isFundDisabled = true;
                      } else if (
                        [
                          "CONTRACTUAL",
                          "SUBSTITUTE",
                          "CASUAL/EMERGENCY",
                          "JOB ORDER/CONTRACT OF SERVICE",
                          "VOLUNTEER",
                        ].includes(currentNature)
                      ) {
                        const allowsNational =
                          NATIONAL_FUND_ELIGIBLE_NATURES.includes(
                            currentNature,
                          );
                        fundOptions = isCookPosition
                          ? [
                              "SBFP",
                              ...(allowsNational ? ["NATIONAL"] : []),
                              "SEF",
                              "LGU",
                              "PTA",
                              "NGO",
                              "SCHOOL MOOE",
                            ]
                          : [
                              ...(allowsNational ? ["NATIONAL"] : []),
                              "SEF",
                              "LGU",
                              "PTA",
                              "NGO",
                              "SCHOOL MOOE",
                            ];
                        isFundDisabled = false;
                        if (
                          !isCookPosition &&
                          String(fundValue).toUpperCase() === "SBFP"
                        ) {
                          fundValue = "SEF";
                        } else if (
                          (String(fundValue).toUpperCase() === "NATIONAL" &&
                            !allowsNational) ||
                          !fundValue
                        ) {
                          fundValue = isCookPosition ? "SBFP" : "SEF";
                        } else if (String(fundValue).toUpperCase() === "MOOE") {
                          fundValue = "SCHOOL MOOE";
                        }
                      } else {
                        fundOptions = isCookPosition
                          ? [
                              "SBFP",
                              "NATIONAL",
                              "SEF",
                              "LGU",
                              "PTA",
                              "NGO",
                              "SCHOOL MOOE",
                            ]
                          : [
                              "NATIONAL",
                              "SEF",
                              "LGU",
                              "PTA",
                              "NGO",
                              "SCHOOL MOOE",
                            ];
                        isFundDisabled = false;
                        if (
                          !isCookPosition &&
                          String(fundValue).toUpperCase() === "SBFP"
                        ) {
                          fundValue = "NATIONAL";
                        }
                      }

                      const handleNatureChange = (newNature) => {
                        const natureUpper = String(
                          newNature || "",
                        ).toUpperCase();
                        let newHiring = formData.hiringArrangement;
                        let newFund = formData.fundSource;

                        if (natureUpper === "REGULAR PERMANENT") {
                          newFund = "NATIONAL";
                          if (isNonTeaching) {
                            newHiring = "REGULAR";
                          } else {
                            if (
                              !newHiring ||
                              newHiring === "N/A" ||
                              !["REGULAR", "SPIMS", "4PS", "DOST"].includes(
                                newHiring.toUpperCase(),
                              )
                            ) {
                              newHiring = "REGULAR";
                            }
                          }
                        } else if (natureUpper === "PROVISIONAL") {
                          newFund = "NATIONAL";
                          newHiring = "DOST";
                        } else if (
                          [
                            "CONTRACTUAL",
                            "SUBSTITUTE",
                            "CASUAL/EMERGENCY",
                            "JOB ORDER/CONTRACT OF SERVICE",
                            "VOLUNTEER",
                          ].includes(natureUpper)
                        ) {
                          newHiring = "N/A";
                          if (
                            (String(newFund).toUpperCase() === "NATIONAL" &&
                              !NATIONAL_FUND_ELIGIBLE_NATURES.includes(
                                natureUpper,
                              )) ||
                            !newFund
                          ) {
                            newFund = "SEF";
                          }
                        }

                        const updates = {
                          natureOfAppointment: newNature,
                          hiringArrangement: newHiring,
                          fundSource: newFund,
                        };

                        if (natureUpper === "REGULAR PERMANENT") {
                          if (
                            formData.depedEmail === "N/A" ||
                            formData.deped_email === "N/A" ||
                            formData.noDepedEmail ||
                            formData.no_deped_email
                          ) {
                            updates.depedEmail = "";
                            updates.deped_email = "";
                            updates.noDepedEmail = false;
                            updates.no_deped_email = false;
                          }
                        }

                        handleMultipleFieldsChange(updates);
                      };

                      return (
                        <>
                          <div>
                            <label
                              style={{ fontSize: "11px", fontWeight: 700 }}
                            >
                              Nature of Appointment *
                            </label>
                            <SearchableDropdown
                              options={natureOptions}
                              value={formData.natureOfAppointment || ""}
                              onChange={handleNatureChange}
                              placeholder="Select Nature..."
                              required
                            />
                          </div>

                          <div>
                            <label
                              style={{ fontSize: "11px", fontWeight: 700 }}
                            >
                              Hiring Arrangement *
                            </label>
                            <SearchableDropdown
                              options={hiringOptions}
                              value={hiringValue}
                              disabled={isHiringDisabled}
                              onChange={(val) =>
                                handleFieldChange("hiringArrangement", val)
                              }
                              placeholder="Select Arrangement..."
                              required
                            />
                          </div>

                          <div>
                            <label
                              style={{ fontSize: "11px", fontWeight: 700 }}
                            >
                              Fund Source *
                            </label>
                            <SearchableDropdown
                              options={fundOptions}
                              value={fundValue}
                              disabled={isFundDisabled}
                              onChange={(val) =>
                                handleFieldChange("fundSource", val)
                              }
                              placeholder="Select Fund Source..."
                              required
                            />
                          </div>
                        </>
                      );
                    })()}

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Employee No.
                      </label>
                      {(() => {
                        const cleanEmpNo =
                          formData.employeeNo &&
                          !String(formData.employeeNo)
                            .toUpperCase()
                            .startsWith("PRN")
                            ? formData.employeeNo
                            : "";
                        return (
                          <input
                            type="text"
                            placeholder="e.g. 4250732"
                            value={cleanEmpNo}
                            onChange={(e) =>
                              handleFieldChange("employeeNo", e.target.value)
                            }
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "8px",
                              border: "1.5px solid var(--line)",
                              fontSize: "13px",
                              background: "#FFFFFF",
                              boxSizing: "border-box",
                            }}
                          />
                        );
                      })()}
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 700 }}>
                        Date of 1st Day of Service
                      </label>
                      <DatePickerDropdowns
                        value={formData.firstServiceDate || ""}
                        onChange={(val) => {
                          const updates = {
                            firstServiceDate: val,
                            stepIncrementConfirmed: false,
                          };
                          if (
                            val &&
                            typeof val === "string" &&
                            val.length >= 10
                          ) {
                            const firstStr = val.substring(0, 10);
                            if (
                              formData.lastPromotionDate &&
                              formData.lastPromotionDate !== "N/A" &&
                              formData.lastPromotionDate.substring(0, 10) <
                                firstStr
                            ) {
                              updates.lastPromotionDate = "";
                            }
                            if (
                              formData.newStationDate &&
                              formData.newStationDate !== "N/A" &&
                              formData.newStationDate.substring(0, 10) <
                                firstStr
                            ) {
                              updates.newStationDate = "";
                            }
                            if (
                              formData.lastLateralMovementDate &&
                              formData.lastLateralMovementDate !== "N/A" &&
                              formData.lastLateralMovementDate.substring(
                                0,
                                10,
                              ) < firstStr
                            ) {
                              updates.lastLateralMovementDate = "";
                            }
                          }
                          handleMultipleFieldsChange(updates);
                        }}
                        maxDate={new Date()}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            margin: 0,
                          }}
                        >
                          Date of Last Promotion
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                            margin: 0,
                            fontWeight: "normal",
                          }}
                        >
                          <input
                            type="checkbox"
                            style={{
                              width: "auto",
                              minHeight: "auto",
                              margin: 0,
                            }}
                            checked={formData.lastPromotionDate === "N/A"}
                            onChange={(e) =>
                              handleMultipleFieldsChange({
                                lastPromotionDate: e.target.checked
                                  ? "N/A"
                                  : "",
                                stepIncrementConfirmed: false,
                              })
                            }
                          />
                          N/A
                        </label>
                      </div>
                      <DatePickerDropdowns
                        value={
                          formData.lastPromotionDate === "N/A"
                            ? ""
                            : formData.lastPromotionDate || ""
                        }
                        onChange={(val) =>
                          handleMultipleFieldsChange({
                            lastPromotionDate: val,
                            stepIncrementConfirmed: false,
                          })
                        }
                        maxDate={new Date()}
                        minDate={
                          formData.firstServiceDate
                            ? new Date(formData.firstServiceDate + "T00:00:00")
                            : undefined
                        }
                        disabled={formData.lastPromotionDate === "N/A"}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            margin: 0,
                          }}
                        >
                          Date of First Day in Current Station
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                            margin: 0,
                            fontWeight: "normal",
                          }}
                        >
                          <input
                            type="checkbox"
                            style={{
                              width: "auto",
                              minHeight: "auto",
                              margin: 0,
                            }}
                            checked={formData.newStationDate === "N/A"}
                            onChange={(e) =>
                              handleFieldChange(
                                "newStationDate",
                                e.target.checked ? "N/A" : "",
                              )
                            }
                          />
                          N/A
                        </label>
                      </div>
                      <DatePickerDropdowns
                        value={
                          formData.newStationDate === "N/A"
                            ? ""
                            : formData.newStationDate || ""
                        }
                        onChange={(val) =>
                          handleFieldChange("newStationDate", val)
                        }
                        maxDate={new Date()}
                        minDate={
                          formData.firstServiceDate
                            ? new Date(formData.firstServiceDate + "T00:00:00")
                            : undefined
                        }
                        disabled={formData.newStationDate === "N/A"}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            margin: 0,
                          }}
                        >
                          Date of Last Lateral Movement
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                            margin: 0,
                            fontWeight: "normal",
                          }}
                        >
                          <input
                            type="checkbox"
                            style={{
                              width: "auto",
                              minHeight: "auto",
                              margin: 0,
                            }}
                            checked={formData.lastLateralMovementDate === "N/A"}
                            onChange={(e) =>
                              handleFieldChange(
                                "lastLateralMovementDate",
                                e.target.checked ? "N/A" : "",
                              )
                            }
                          />
                          N/A
                        </label>
                      </div>
                      <DatePickerDropdowns
                        value={
                          formData.lastLateralMovementDate === "N/A"
                            ? ""
                            : formData.lastLateralMovementDate || ""
                        }
                        onChange={(val) =>
                          handleFieldChange("lastLateralMovementDate", val)
                        }
                        maxDate={new Date()}
                        minDate={
                          formData.firstServiceDate
                            ? new Date(formData.firstServiceDate + "T00:00:00")
                            : undefined
                        }
                        disabled={formData.lastLateralMovementDate === "N/A"}
                      />
                    </div>
                  </div>

                  {/* Step Increment Selector (1 to 8) */}
                  <div style={{ marginTop: "8px" }}>
                    {(() => {
                      const computed = computeStepIncrement(
                        formData.firstServiceDate,
                        formData.lastPromotionDate,
                      );
                      const isConfirmed = Boolean(
                        formData.stepIncrementConfirmed,
                      );
                      const selectedStep =
                        formData.stepIncrement || computed.step || 1;

                      return (
                        <>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <label
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                margin: 0,
                              }}
                            >
                              Step Increment (1–8) *
                            </label>
                            {isConfirmed ? (
                              <span
                                style={{
                                  fontSize: "10px",
                                  color: "#16A34A",
                                  fontWeight: 800,
                                  background: "#DCFCE7",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                }}
                              >
                                ✓ Confirmed: Step {selectedStep}
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "10px",
                                  color: "#0369A1",
                                  fontWeight: 800,
                                  background: "#E0F2FE",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                }}
                              >
                                ✨ Suggested: Step {computed.step} (Click to
                                confirm)
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: "4px",
                              marginTop: "4px",
                            }}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((sNum) => {
                              const isStepConfirmed =
                                isConfirmed && selectedStep === sNum;
                              const isStepSuggested =
                                !isConfirmed && computed.step === sNum;

                              let bg = "#FFFFFF";
                              let color = "var(--navy)";
                              let border = "1px solid var(--line)";
                              let boxShadow = "none";

                              if (isStepConfirmed) {
                                bg = "var(--blue, #0284C7)";
                                color = "#FFFFFF";
                                border = "1.5px solid var(--blue, #0284C7)";
                                boxShadow = "0 2px 6px rgba(2, 132, 199, 0.35)";
                              } else if (isStepSuggested) {
                                bg = "#E0F2FE";
                                color = "#0369A1";
                                border = "1.5px dashed #0284C7";
                                boxShadow =
                                  "0 0 0 2px rgba(56, 189, 248, 0.25)";
                              }

                              return (
                                <button
                                  key={sNum}
                                  type="button"
                                  onClick={() =>
                                    handleMultipleFieldsChange({
                                      stepIncrement: sNum,
                                      stepIncrementConfirmed: true,
                                    })
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "8px 4px",
                                    borderRadius: "8px",
                                    border,
                                    background: bg,
                                    color,
                                    fontWeight: 800,
                                    fontSize: "13px",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    boxShadow,
                                  }}
                                  title={
                                    isStepSuggested
                                      ? `Click to confirm Step ${sNum}`
                                      : `Select Step ${sNum}`
                                  }
                                >
                                  {sNum}
                                </button>
                              );
                            })}
                          </div>

                          {!isConfirmed ? (
                            <p
                              style={{
                                fontSize: "11px",
                                color: "#0369A1",
                                margin: "6px 0 0 0",
                                fontWeight: 600,
                                lineHeight: 1.4,
                              }}
                            >
                              ✨ <strong>Step {computed.step}</strong>{" "}
                              suggested.{" "}
                              <em>
                                Click Step {computed.step} or your actual step
                                above to confirm.
                              </em>
                            </p>
                          ) : (
                            <p
                              style={{
                                fontSize: "11px",
                                color: "#16A34A",
                                margin: "6px 0 0 0",
                                fontWeight: 600,
                                lineHeight: 1.4,
                              }}
                            >
                              ✓ <strong>Step {selectedStep}</strong> confirmed
                              by personnel.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* TAB 3: EDUCATION */}
              {activeTab === "education" &&
                (() => {
                  const personType = detectPersonnelTypeFromPosition(
                    formData?.position || candidateTeacher?.position || "",
                  );
                  const isNonTeaching = personType === "non-teaching";
                  const isTeachingRelated = personType === "teaching-related";

                  const attainment = String(
                    formData.highestEducationalAttainment || "",
                  ).toUpperCase();
                  const postGrads = getEffectivePostGradDisciplines(formData);
                  const mastersWithUnits = postGrads.mastersWithUnits;
                  const mastersGraduated = postGrads.mastersGraduated;
                  const doctorateWithUnits = postGrads.doctorateWithUnits;
                  const doctorateGraduated = postGrads.doctorateGraduated;

                  const showMasters =
                    attainment.includes("MASTER") ||
                    attainment.includes("DOCTOR") ||
                    mastersWithUnits.length > 0 ||
                    mastersGraduated.length > 0;

                  const showDoctorate =
                    attainment.includes("DOCTOR") ||
                    doctorateWithUnits.length > 0 ||
                    doctorateGraduated.length > 0;

                  const updatePostGradDisciplines = ({
                    nextMastersWithUnits = mastersWithUnits,
                    nextMastersGraduated = mastersGraduated,
                    nextDoctorateWithUnits = doctorateWithUnits,
                    nextDoctorateGraduated = doctorateGraduated,
                  }) => {
                    const allMasters = [
                      ...new Set([
                        ...nextMastersWithUnits,
                        ...nextMastersGraduated,
                      ]),
                    ];
                    const allDoctorate = [
                      ...new Set([
                        ...nextDoctorateWithUnits,
                        ...nextDoctorateGraduated,
                      ]),
                    ];
                    const jsonStr = JSON.stringify({
                      mastersWithUnits: nextMastersWithUnits,
                      mastersGraduated: nextMastersGraduated,
                      doctorateWithUnits: nextDoctorateWithUnits,
                      doctorateGraduated: nextDoctorateGraduated,
                      masters: allMasters,
                      doctorate: allDoctorate,
                    });
                    handleMultipleFieldsChange({
                      mastersWithUnitsDisciplines: nextMastersWithUnits,
                      mastersGraduatedDisciplines: nextMastersGraduated,
                      doctorateWithUnitsDisciplines: nextDoctorateWithUnits,
                      doctorateGraduatedDisciplines: nextDoctorateGraduated,
                      mastersDisciplines: allMasters,
                      doctorateDisciplines: allDoctorate,
                      mastersDiscipline: allMasters.join(", "),
                      masters_discipline: allMasters.join(", "),
                      doctorateDiscipline: allDoctorate.join(", "),
                      doctorate_discipline: allDoctorate.join(", "),
                      phdDiscipline: allDoctorate.join(", "),
                      phd_discipline: allDoctorate.join(", "),
                      postGraduateDiscipline: jsonStr,
                      post_graduate_discipline: jsonStr,
                    });
                  };

                  const defaultMastersStatus =
                    attainment === "MASTER'S DEGREE (WITH UNITS)"
                      ? "WITH UNITS"
                      : "GRADUATED";
                  const defaultDoctorateStatus =
                    attainment === "DOCTORATE DEGREE (WITH UNITS)"
                      ? "WITH UNITS"
                      : "GRADUATED";

                  const effectiveDegrees =
                    Array.isArray(formData.collegeDegrees) &&
                    formData.collegeDegrees.length > 0
                      ? formData.collegeDegrees
                      : [{ collegeDegree: "", major: "", minor: "" }];

                  return (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "15px",
                          fontWeight: 800,
                          color: "var(--navy)",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <FiAward size={16} /> 3. Educational Attainment
                      </h3>

                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 700 }}>
                          Highest Educational Attainment *
                        </label>
                        <SearchableDropdown
                          options={
                            isNonTeaching
                              ? HIGHEST_EDUCATIONAL_ATTAINMENT_NON_TEACHING_OPTIONS
                              : HIGHEST_EDUCATIONAL_ATTAINMENT_TEACHING_OPTIONS
                          }
                          value={
                            formData.highestEducationalAttainment ||
                            (isNonTeaching
                              ? "HIGH SCHOOL GRADUATE"
                              : "COLLEGE GRADUATE / BACCALAUREATE")
                          }
                          onChange={(val) =>
                            handleFieldChange(
                              "highestEducationalAttainment",
                              val,
                            )
                          }
                        />
                      </div>

                      {/* Baccalaureate Degrees List */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "12px",
                              fontWeight: 800,
                              color: "var(--navy)",
                              margin: 0,
                            }}
                          >
                            College / Baccalaureate Degree(s) *
                          </label>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                            onClick={() => {
                              const nextList = [
                                ...effectiveDegrees,
                                { collegeDegree: "", major: "", minor: "" },
                              ];
                              handleMultipleFieldsChange({
                                collegeDegrees: nextList,
                                collegeDegree: nextList[0]?.collegeDegree || "",
                              });
                            }}
                          >
                            <FiPlus size={12} /> Add Degree
                          </button>
                        </div>

                        {effectiveDegrees.map((degRow, dIdx) => {
                          const d = (degRow.collegeDegree || "").toUpperCase();
                          const isEdu =
                            degRow.collegeDegree &&
                            degRow.collegeDegree !== "NONE" &&
                            degRow.collegeDegree !== "N/A" &&
                            (d.includes("EDUCATION") ||
                              d.includes("SPECIAL ED") ||
                              d.includes("KINDERGARTEN") ||
                              d.includes("EARLY CHILDHOOD") ||
                              d.includes("TEACHER") ||
                              d.includes("PEDAGOGY") ||
                              d.includes("BSE") ||
                              d.includes("BEED") ||
                              d.includes("BSED"));

                          return (
                            <div
                              key={dIdx}
                              style={{
                                background: "#F8FAFC",
                                border: "1.5px solid var(--line)",
                                borderRadius: "12px",
                                padding: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    color: "var(--blue)",
                                  }}
                                >
                                  {dIdx === 0
                                    ? "PRIMARY BACCALAUREATE / COLLEGE DEGREE"
                                    : `ADDITIONAL COLLEGE DEGREE #${dIdx + 1}`}
                                </span>
                                {effectiveDegrees.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextList = effectiveDegrees.filter(
                                        (_, i) => i !== dIdx,
                                      );
                                      handleMultipleFieldsChange({
                                        collegeDegrees: nextList,
                                        collegeDegree:
                                          nextList[0]?.collegeDegree || "",
                                        major: nextList[0]?.major || "",
                                        minor: nextList[0]?.minor || "",
                                      });
                                    }}
                                    style={{
                                      background: "transparent",
                                      border: 0,
                                      color: "#DC2626",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                    }}
                                  >
                                    <FiTrash2 size={13} />
                                  </button>
                                )}
                              </div>
                              <SearchableDropdown
                                options={COLLEGE_DEGREE_OPTIONS}
                                value={degRow.collegeDegree || ""}
                                onChange={(val) => {
                                  const list = [...effectiveDegrees];
                                  const valUp = (val || "").toUpperCase();
                                  const willBeEdu =
                                    val &&
                                    val !== "NONE" &&
                                    val !== "N/A" &&
                                    (valUp.includes("EDUCATION") ||
                                      valUp.includes("SPECIAL ED") ||
                                      valUp.includes("KINDERGARTEN") ||
                                      valUp.includes("EARLY CHILDHOOD") ||
                                      valUp.includes("TEACHER") ||
                                      valUp.includes("PEDAGOGY") ||
                                      valUp.includes("BSE") ||
                                      valUp.includes("BEED") ||
                                      valUp.includes("BSED"));
                                  list[dIdx] = {
                                    ...list[dIdx],
                                    collegeDegree: val,
                                    major: willBeEdu ? list[dIdx].major : "",
                                    minor: willBeEdu ? list[dIdx].minor : "",
                                  };
                                  handleMultipleFieldsChange({
                                    collegeDegrees: list,
                                    collegeDegree: list[0]?.collegeDegree || "",
                                    major: list[0]?.major || "",
                                    minor: list[0]?.minor || "",
                                  });
                                }}
                                placeholder="Select Degree Title..."
                              />
                              {isEdu && (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "8px",
                                  }}
                                >
                                  <div>
                                    <label
                                      style={{
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        color: "#475569",
                                        display: "block",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Major in Education *
                                    </label>
                                    <SearchableDropdown
                                      options={MAJOR_OPTIONS}
                                      value={degRow.major || ""}
                                      onChange={(val) => {
                                        const list = [...effectiveDegrees];
                                        list[dIdx] = {
                                          ...list[dIdx],
                                          major: val,
                                        };
                                        handleMultipleFieldsChange({
                                          collegeDegrees: list,
                                          major: list[0]?.major || "",
                                        });
                                      }}
                                      placeholder="Select major..."
                                    />
                                  </div>
                                  <div>
                                    <label
                                      style={{
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        color: "#475569",
                                        display: "block",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Minor (Optional)
                                    </label>
                                    <SearchableDropdown
                                      options={MINOR_OPTIONS}
                                      value={degRow.minor || ""}
                                      onChange={(val) => {
                                        const list = [...effectiveDegrees];
                                        list[dIdx] = {
                                          ...list[dIdx],
                                          minor: val,
                                        };
                                        handleMultipleFieldsChange({
                                          collegeDegrees: list,
                                          minor: list[0]?.minor || "",
                                        });
                                      }}
                                      placeholder="Select minor subject..."
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Post-Graduate Master's & Doctorate Section — Conditionally Rendered */}
                      {showMasters && (
                        <PostGradDisciplineSection
                          title="Master's Degree Discipline(s)"
                          levelLabel="Master's"
                          isRequired={attainment.includes("MASTER")}
                          graduatedList={mastersGraduated}
                          withUnitsList={mastersWithUnits}
                          defaultStatus={defaultMastersStatus}
                          onAdd={(disc, status) => {
                            if (status === "WITH UNITS") {
                              if (!mastersWithUnits.includes(disc)) {
                                updatePostGradDisciplines({
                                  nextMastersWithUnits: [
                                    ...mastersWithUnits,
                                    disc,
                                  ],
                                });
                              }
                            } else {
                              if (!mastersGraduated.includes(disc)) {
                                updatePostGradDisciplines({
                                  nextMastersGraduated: [
                                    ...mastersGraduated,
                                    disc,
                                  ],
                                });
                              }
                            }
                          }}
                          onRemove={(disc, status) => {
                            if (status === "WITH UNITS") {
                              updatePostGradDisciplines({
                                nextMastersWithUnits: mastersWithUnits.filter(
                                  (d) => d !== disc,
                                ),
                              });
                            } else {
                              updatePostGradDisciplines({
                                nextMastersGraduated: mastersGraduated.filter(
                                  (d) => d !== disc,
                                ),
                              });
                            }
                          }}
                        />
                      )}

                      {showDoctorate && (
                        <PostGradDisciplineSection
                          title="Doctorate Degree Discipline(s)"
                          levelLabel="Doctorate"
                          isRequired={attainment.includes("DOCTOR")}
                          graduatedList={doctorateGraduated}
                          withUnitsList={doctorateWithUnits}
                          defaultStatus={defaultDoctorateStatus}
                          onAdd={(disc, status) => {
                            if (status === "WITH UNITS") {
                              if (!doctorateWithUnits.includes(disc)) {
                                updatePostGradDisciplines({
                                  nextDoctorateWithUnits: [
                                    ...doctorateWithUnits,
                                    disc,
                                  ],
                                });
                              }
                            } else {
                              if (!doctorateGraduated.includes(disc)) {
                                updatePostGradDisciplines({
                                  nextDoctorateGraduated: [
                                    ...doctorateGraduated,
                                    disc,
                                  ],
                                });
                              }
                            }
                          }}
                          onRemove={(disc, status) => {
                            if (status === "WITH UNITS") {
                              updatePostGradDisciplines({
                                nextDoctorateWithUnits:
                                  doctorateWithUnits.filter((d) => d !== disc),
                              });
                            } else {
                              updatePostGradDisciplines({
                                nextDoctorateGraduated:
                                  doctorateGraduated.filter((d) => d !== disc),
                              });
                            }
                          }}
                        />
                      )}

                      {/* Multi-Select Eligibilities & PRC Specialization */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          marginTop: "8px",
                        }}
                      >
                        <label style={{ fontSize: "11px", fontWeight: 700 }}>
                          Board / Civil Service Eligibility (Select All That
                          Apply)
                        </label>

                        {/* List of currently selected eligibilities */}
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                            minHeight: "28px",
                          }}
                        >
                          {(Array.isArray(formData.eligibility)
                            ? formData.eligibility
                            : String(formData.eligibility || "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                          ).map((el, index) => (
                            <div
                              key={index}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                background: "#F0F9FF",
                                border: "1.5px solid #BAE6FD",
                                borderRadius: "12px",
                                padding: "4px 10px",
                                gap: "6px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "var(--navy)",
                                  fontWeight: "bold",
                                }}
                              >
                                {el}
                              </span>
                              <button
                                type="button"
                                style={{
                                  background: "transparent",
                                  border: 0,
                                  color: "#0284C7",
                                  cursor: "pointer",
                                  fontWeight: "bold",
                                  fontSize: "12px",
                                  padding: 0,
                                }}
                                onClick={() => {
                                  const currentList = Array.isArray(
                                    formData.eligibility,
                                  )
                                    ? formData.eligibility
                                    : String(formData.eligibility || "")
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                  const newList = currentList.filter(
                                    (_, idx) => idx !== index,
                                  );
                                  handleFieldChange(
                                    "eligibility",
                                    newList.join(", "),
                                  );
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Dropdown to add another eligibility */}
                        <div>
                          <select
                            value=""
                            onChange={(e) => {
                              const selectedVal = e.target.value;
                              if (!selectedVal) return;
                              const currentList = Array.isArray(
                                formData.eligibility,
                              )
                                ? formData.eligibility
                                : String(formData.eligibility || "")
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                              const isDup =
                                currentList.includes(selectedVal) ||
                                currentList.some(
                                  (el) =>
                                    el.startsWith(selectedVal) &&
                                    selectedVal.startsWith("RA 1080"),
                                );
                              if (isDup) {
                                alert(
                                  "This eligibility category has already been added.",
                                );
                                return;
                              }
                              if (
                                selectedVal ===
                                "RA 1080 (OTHERS, PLEASE SPECIFY)"
                              ) {
                                setRa1080InputText("");
                                setShowRa1080Modal(true);
                              } else {
                                handleFieldChange(
                                  "eligibility",
                                  [...currentList, selectedVal].join(", "),
                                );
                              }
                            }}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "8px",
                              border: "1.5px solid var(--line)",
                              background: "white",
                              fontSize: "13px",
                              color: "var(--navy)",
                              outline: "none",
                            }}
                          >
                            <option value="">
                              {(Array.isArray(formData.eligibility)
                                ? formData.eligibility.length
                                : String(formData.eligibility || "")
                                    .split(",")
                                    .filter(Boolean).length) > 0
                                ? `+ Add another eligibility (${
                                    Array.isArray(formData.eligibility)
                                      ? formData.eligibility.length
                                      : String(formData.eligibility || "")
                                          .split(",")
                                          .filter(Boolean).length
                                  } added)...`
                                : "+ Add Board / Civil Service Eligibility..."}
                            </option>
                            <option value="LICENSURE EXAMINATION FOR TEACHERS">
                              LICENSURE EXAMINATION FOR TEACHERS
                            </option>
                            <option value="PROFESSIONAL BOARD EXAMINATION FOR TEACHERS (PBET)">
                              PROFESSIONAL BOARD EXAMINATION FOR TEACHERS (PBET)
                            </option>
                            <option value="PROVISIONAL TEACHERS">
                              PROVISIONAL TEACHERS
                            </option>
                            <option value="PROVISIONAL TEACHERS - DOST SCHOLAR GRADUATES">
                              PROVISIONAL TEACHERS - DOST SCHOLAR GRADUATES
                            </option>
                            <option value="REGISTERED GUIDANCE COUNSELOR">
                              REGISTERED GUIDANCE COUNSELOR
                            </option>
                            <option value="REGISTERED LIBRARIAN">
                              REGISTERED LIBRARIAN
                            </option>
                            <option value="REGISTERED NURSE">
                              REGISTERED NURSE
                            </option>
                            {(isNonTeaching || isTeachingRelated) && (
                              <>
                                <option value="CS - 1ST LEVEL (SUB-PROFESSIONAL)">
                                  CS - 1ST LEVEL (SUB-PROFESSIONAL)
                                </option>
                                <option value="CS - 2ND LEVEL (PROFESSIONAL)">
                                  CS - 2ND LEVEL (PROFESSIONAL)
                                </option>
                              </>
                            )}
                            <option value="BAR/BOARD ELIGIBILITY (RA 1080)">
                              BAR/BOARD ELIGIBILITY (RA 1080)
                            </option>
                            <option value="RA 1080 (OTHERS, PLEASE SPECIFY)">
                              RA 1080 (OTHERS, PLEASE SPECIFY)
                            </option>
                            {isNonTeaching && <option value="N/A">N/A</option>}
                          </select>
                        </div>

                        {/* PRC Specialization (Strictly Conditional on LET / PBET eligibility) */}
                        {(() => {
                          const elStr = (
                            Array.isArray(formData.eligibility)
                              ? formData.eligibility.join(",")
                              : String(formData.eligibility || "")
                          ).toUpperCase();
                          const isLetPbet =
                            elStr.includes(
                              "LICENSURE EXAMINATION FOR TEACHERS",
                            ) ||
                            elStr.includes(
                              "PROFESSIONAL BOARD EXAMINATION FOR TEACHERS",
                            ) ||
                            elStr.includes("LET") ||
                            elStr.includes("PBET");
                          if (!isLetPbet) return null;
                          return (
                            <div style={{ marginTop: "10px" }}>
                              <label
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  display: "block",
                                  marginBottom: "4px",
                                }}
                              >
                                PRC Specialization{" "}
                                <span style={{ color: "#EF4444" }}>*</span>
                              </label>
                              <SearchableDropdown
                                options={PRC_SPECIALIZATION_OPTIONS}
                                value={formData.prcSpecialization || ""}
                                onChange={(val) =>
                                  handleFieldChange("prcSpecialization", val)
                                }
                                placeholder="Select specialization..."
                              />
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}

              {/* TAB 4: L&D / TRAININGS */}
              {activeTab === "development" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      fontWeight: 800,
                      color: "var(--navy)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FiFileText size={16} /> 4. Learning &amp; Development
                    (L&amp;D)
                  </h3>

                  {/* NEAP SECTION */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "var(--navy)",
                          margin: 0,
                        }}
                      >
                        NEAP-Accredited Trainings
                      </label>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => addTrainingRow("neapTrainingRows")}
                      >
                        <FiPlus size={11} /> Add NEAP
                      </button>
                    </div>

                    {(formData.neapTrainingRows || []).map((tr, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "#F8FAFC",
                          border: "1.5px solid var(--line)",
                          borderRadius: "10px",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "var(--blue)",
                            }}
                          >
                            NEAP PROGRAM #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              removeTrainingRow("neapTrainingRows", idx)
                            }
                            style={{
                              background: 0,
                              border: 0,
                              color: "#DC2626",
                              cursor: "pointer",
                            }}
                          >
                            <FiTrash2 size={12} />
                          </button>
                        </div>
                        <SearchableDropdown
                          options={[
                            "OTHER (SPECIFY CUSTOM...)",
                            ...NEAP_TRAINING_OPTIONS,
                          ]}
                          value={tr.title || ""}
                          onChange={(val) =>
                            handleTrainingChange(
                              "neapTrainingRows",
                              idx,
                              "title",
                              val,
                            )
                          }
                          placeholder="SELECT NEAP TRAINING OR TYPE CUSTOM..."
                          allowCustom={true}
                        />
                        {(tr.title === "OTHER (SPECIFY CUSTOM...)" ||
                          (tr.title &&
                            !NEAP_TRAINING_OPTIONS.includes(tr.title))) && (
                          <input
                            type="text"
                            placeholder="Type custom NEAP training title *"
                            value={
                              tr.title === "OTHER (SPECIFY CUSTOM...)"
                                ? ""
                                : tr.title
                            }
                            onChange={(e) =>
                              handleTrainingChange(
                                "neapTrainingRows",
                                idx,
                                "title",
                                e.target.value.toUpperCase(),
                              )
                            }
                            style={{
                              fontSize: "12px",
                              background: "#FFFBEB",
                              borderColor: "#F59E0B",
                            }}
                            required
                          />
                        )}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 60px 80px",
                            gap: "6px",
                          }}
                        >
                          <DatePickerDropdowns
                            value={tr.startDate || ""}
                            onChange={(val) =>
                              handleTrainingChange(
                                "neapTrainingRows",
                                idx,
                                "startDate",
                                val,
                              )
                            }
                            minDate={new Date("2020-01-01T00:00:00")}
                            maxDate={new Date()}
                            placement="bottom"
                          />
                          <DatePickerDropdowns
                            value={tr.endDate || ""}
                            onChange={(val) =>
                              handleTrainingChange(
                                "neapTrainingRows",
                                idx,
                                "endDate",
                                val,
                              )
                            }
                            maxDate={new Date()}
                            minDate={
                              tr.startDate
                                ? new Date(
                                    tr.startDate.substring(0, 10) + "T00:00:00",
                                  )
                                : new Date("2020-01-01T00:00:00")
                            }
                            placement="bottom"
                          />
                          <input
                            type="text"
                            value={tr.days ? `${tr.days}d` : "0d"}
                            disabled
                            placeholder="Days"
                            style={{
                              textAlign: "center",
                              fontWeight: "bold",
                              background: "#f1f5f9",
                              fontSize: "11px",
                            }}
                            title="No. of Days"
                          />
                          <input
                            type="number"
                            min="1"
                            max="999"
                            maxLength={3}
                            inputMode="numeric"
                            placeholder="Hours *"
                            value={tr.totalHours || ""}
                            onChange={(e) =>
                              handleTrainingChange(
                                "neapTrainingRows",
                                idx,
                                "totalHours",
                                e.target.value,
                              )
                            }
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          />
                        </div>
                      </div>
                    ))}
                    {(formData.neapTrainingRows || []).length === 0 && (
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "#F0F9FF",
                          color: "var(--blue)",
                          border: "1.5px solid var(--line)",
                          borderRadius: "10px",
                          fontSize: "11.5px",
                          textAlign: "center",
                        }}
                      >
                        No NEAP trainings added yet. Click "+ Add NEAP" to
                        encode credentials, dates (2020 – present), and hours.
                      </div>
                    )}
                  </div>

                  {/* TESDA NC SECTION */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "var(--navy)",
                          margin: 0,
                        }}
                      >
                        TESDA NC / Certifications
                      </label>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => addTrainingRow("certificationRows")}
                      >
                        <FiPlus size={11} /> Add TESDA
                      </button>
                    </div>

                    {(formData.certificationRows || []).map((tr, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "#F8FAFC",
                          border: "1.5px solid var(--line)",
                          borderRadius: "10px",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "var(--blue)",
                            }}
                          >
                            CERTIFICATION #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              removeTrainingRow("certificationRows", idx)
                            }
                            style={{
                              background: 0,
                              border: 0,
                              color: "#DC2626",
                              cursor: "pointer",
                            }}
                          >
                            <FiTrash2 size={12} />
                          </button>
                        </div>
                        <SearchableDropdown
                          options={TESDA_CERTIFICATION_OPTIONS}
                          value={tr.title || ""}
                          onChange={(val) =>
                            handleTrainingChange(
                              "certificationRows",
                              idx,
                              "title",
                              val,
                            )
                          }
                          placeholder="Select TESDA Course / NC..."
                        />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 60px 80px",
                            gap: "6px",
                          }}
                        >
                          <DatePickerDropdowns
                            value={tr.startDate || ""}
                            onChange={(val) =>
                              handleTrainingChange(
                                "certificationRows",
                                idx,
                                "startDate",
                                val,
                              )
                            }
                            minDate={new Date("2020-01-01T00:00:00")}
                            maxDate={new Date()}
                            placement="bottom"
                          />
                          <DatePickerDropdowns
                            value={tr.endDate || ""}
                            onChange={(val) =>
                              handleTrainingChange(
                                "certificationRows",
                                idx,
                                "endDate",
                                val,
                              )
                            }
                            maxDate={new Date()}
                            minDate={
                              tr.startDate
                                ? new Date(
                                    tr.startDate.substring(0, 10) + "T00:00:00",
                                  )
                                : new Date("2020-01-01T00:00:00")
                            }
                            placement="bottom"
                          />
                          <input
                            type="text"
                            value={tr.days ? `${tr.days}d` : "0d"}
                            disabled
                            placeholder="Days"
                            style={{
                              textAlign: "center",
                              fontWeight: "bold",
                              background: "#f1f5f9",
                              fontSize: "11px",
                            }}
                            title="No. of Days"
                          />
                          <input
                            type="number"
                            min="1"
                            max="999"
                            maxLength={3}
                            inputMode="numeric"
                            placeholder="Hours *"
                            value={tr.totalHours || ""}
                            onChange={(e) =>
                              handleTrainingChange(
                                "certificationRows",
                                idx,
                                "totalHours",
                                e.target.value,
                              )
                            }
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          />
                        </div>
                      </div>
                    ))}
                    {(formData.certificationRows || []).length === 0 && (
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "#F0F9FF",
                          color: "var(--blue)",
                          border: "1.5px solid var(--line)",
                          borderRadius: "10px",
                          fontSize: "11.5px",
                          textAlign: "center",
                        }}
                      >
                        No TESDA certifications added yet. Click "+ Add TESDA"
                        to encode credentials, dates (2020 – present), and
                        hours.
                      </div>
                    )}
                  </div>

                  {/* OTHER TRAININGS SECTION */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "var(--navy)",
                          margin: 0,
                        }}
                      >
                        Other Training Programs
                      </label>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => addTrainingRow("otherTrainingRows")}
                      >
                        <FiPlus size={11} /> Add Other
                      </button>
                    </div>

                    {(formData.otherTrainingRows || []).map((tr, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "#F8FAFC",
                          border: "1.5px solid var(--line)",
                          borderRadius: "10px",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "var(--blue)",
                            }}
                          >
                            TRAINING #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              removeTrainingRow("otherTrainingRows", idx)
                            }
                            style={{
                              background: 0,
                              border: 0,
                              color: "#DC2626",
                              cursor: "pointer",
                            }}
                          >
                            <FiTrash2 size={12} />
                          </button>
                        </div>
                        <SearchableDropdown
                          options={OTHER_TRAINING_OPTIONS}
                          value={tr.title || ""}
                          onChange={(val) =>
                            handleTrainingChange(
                              "otherTrainingRows",
                              idx,
                              "title",
                              val,
                            )
                          }
                          placeholder="SELECT OTHER TRAINING OR TYPE CUSTOM..."
                          allowCustom={true}
                        />
                        {(tr.title === "OTHER (SPECIFY CUSTOM...)" ||
                          (tr.title &&
                            !OTHER_TRAINING_OPTIONS.includes(tr.title))) && (
                          <input
                            type="text"
                            placeholder="Type custom training title *"
                            value={
                              tr.title === "OTHER (SPECIFY CUSTOM...)"
                                ? ""
                                : tr.title
                            }
                            onChange={(e) =>
                              handleTrainingChange(
                                "otherTrainingRows",
                                idx,
                                "title",
                                e.target.value.toUpperCase(),
                              )
                            }
                            style={{
                              fontSize: "12px",
                              background: "#FFFBEB",
                              borderColor: "#F59E0B",
                            }}
                            required
                          />
                        )}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 60px 80px",
                            gap: "6px",
                          }}
                        >
                          <DatePickerDropdowns
                            value={tr.startDate || ""}
                            onChange={(val) =>
                              handleTrainingChange(
                                "otherTrainingRows",
                                idx,
                                "startDate",
                                val,
                              )
                            }
                            minDate={new Date("2020-01-01T00:00:00")}
                            maxDate={new Date()}
                            placement="bottom"
                          />
                          <DatePickerDropdowns
                            value={tr.endDate || ""}
                            onChange={(val) =>
                              handleTrainingChange(
                                "otherTrainingRows",
                                idx,
                                "endDate",
                                val,
                              )
                            }
                            maxDate={new Date()}
                            minDate={
                              tr.startDate
                                ? new Date(
                                    tr.startDate.substring(0, 10) + "T00:00:00",
                                  )
                                : new Date("2020-01-01T00:00:00")
                            }
                            placement="bottom"
                          />
                          <input
                            type="text"
                            value={tr.days ? `${tr.days}d` : "0d"}
                            disabled
                            placeholder="Days"
                            style={{
                              textAlign: "center",
                              fontWeight: "bold",
                              background: "#f1f5f9",
                              fontSize: "11px",
                            }}
                            title="No. of Days"
                          />
                          <input
                            type="number"
                            min="1"
                            max="999"
                            maxLength={3}
                            inputMode="numeric"
                            placeholder="Hours *"
                            value={tr.totalHours || ""}
                            onChange={(e) =>
                              handleTrainingChange(
                                "otherTrainingRows",
                                idx,
                                "totalHours",
                                e.target.value,
                              )
                            }
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          />
                        </div>
                      </div>
                    ))}
                    {(formData.otherTrainingRows || []).length === 0 && (
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "#F0F9FF",
                          color: "var(--blue)",
                          border: "1.5px solid var(--line)",
                          borderRadius: "10px",
                          fontSize: "11.5px",
                          textAlign: "center",
                        }}
                      >
                        No other trainings added yet. Click "+ Add Other" to
                        encode credentials, dates, and hours.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: TEACHING ASSIGNMENTS & GRADE LEVELS */}
              {activeTab === "teaching" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "15px",
                          fontWeight: 800,
                          color: "var(--navy)",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <FiLayers size={16} /> 5. Teaching Assignment &amp;
                        Grade Levels
                      </h3>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: "11px",
                          color: "var(--muted)",
                        }}
                      >
                        Select the grade levels you are assigned to teach this
                        School Year.
                      </p>
                    </div>

                    {/* Quick Action Presets */}
                    {(() => {
                      const currentList = (
                        Array.isArray(formData.assignedGradeLevels)
                          ? formData.assignedGradeLevels
                          : []
                      ).map((g) => {
                        const u = String(g || "").toUpperCase();
                        if (u.includes("KINDER")) return "Kinder";
                        if (
                          u === "SNED" ||
                          u === "SPED" ||
                          u === "NON-GRADED" ||
                          u === "NON GRADED" ||
                          u.includes("SNED") ||
                          u.includes("NON-GRADED") ||
                          u.includes("NON GRADED")
                        )
                          return "SNED (NON-GRADED)";
                        if (
                          u === "ALS" ||
                          u.startsWith("ALS-") ||
                          u.startsWith("ALS ")
                        )
                          return "ALS";
                        return g;
                      });

                      const updateGrades = (newList) => {
                        const hasShs = newList.some(
                          (g) =>
                            String(g).includes("11") ||
                            String(g).includes("12"),
                        );
                        handleMultipleFieldsChange({
                          assignedGradeLevels: newList,
                          assigned_grade_levels: newList,
                          gradeLevelsTaught: newList,
                          grade_levels_taught: newList,
                          teachesShs: hasShs,
                          teaches_shs: hasShs,
                        });
                      };

                      return (
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="btn secondary"
                            style={{
                              fontSize: "10.5px",
                              padding: "3px 8px",
                              fontWeight: 700,
                            }}
                            onClick={() => {
                              const elemGrades = [
                                "Kinder",
                                "Grade 1",
                                "Grade 2",
                                "Grade 3",
                                "Grade 4",
                                "Grade 5",
                                "Grade 6",
                              ];
                              const merged = Array.from(
                                new Set([...currentList, ...elemGrades]),
                              );
                              updateGrades(merged);
                            }}
                          >
                            + All Elem (K-6)
                          </button>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{
                              fontSize: "10.5px",
                              padding: "3px 8px",
                              fontWeight: 700,
                            }}
                            onClick={() => {
                              const jhsGrades = [
                                "Grade 7",
                                "Grade 8",
                                "Grade 9",
                                "Grade 10",
                              ];
                              const merged = Array.from(
                                new Set([...currentList, ...jhsGrades]),
                              );
                              updateGrades(merged);
                            }}
                          >
                            + All JHS (7-10)
                          </button>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{
                              fontSize: "10.5px",
                              padding: "3px 8px",
                              fontWeight: 700,
                            }}
                            onClick={() => {
                              const shsGrades = ["Grade 11", "Grade 12"];
                              const merged = Array.from(
                                new Set([...currentList, ...shsGrades]),
                              );
                              updateGrades(merged);
                            }}
                          >
                            + All SHS (11-12)
                          </button>
                          {currentList.length > 0 && (
                            <button
                              type="button"
                              className="btn secondary"
                              style={{
                                fontSize: "10.5px",
                                padding: "3px 8px",
                                color: "#DC2626",
                                borderColor: "#FCA5A5",
                              }}
                              onClick={() => updateGrades([])}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Grouped Grade Badges */}
                  {(() => {
                    const groups = [
                      {
                        title: "Elementary",
                        grades: [
                          "Kinder",
                          "Grade 1",
                          "Grade 2",
                          "Grade 3",
                          "Grade 4",
                          "Grade 5",
                          "Grade 6",
                        ],
                      },
                      {
                        title: "Junior High School",
                        grades: ["Grade 7", "Grade 8", "Grade 9", "Grade 10"],
                      },
                      {
                        title: "Senior High School",
                        grades: ["Grade 11", "Grade 12"],
                      },
                      {
                        title: "Inclusive & Special Programs",
                        grades: ["SNED (NON-GRADED)", "ALS"],
                      },
                    ];

                    const currentList = (
                      Array.isArray(formData.assignedGradeLevels)
                        ? formData.assignedGradeLevels
                        : []
                    ).map((g) => {
                      const u = String(g || "").toUpperCase();
                      if (u.includes("KINDER")) return "Kinder";
                      if (
                        u === "SNED" ||
                        u === "SPED" ||
                        u === "NON-GRADED" ||
                        u === "NON GRADED" ||
                        u.includes("SNED") ||
                        u.includes("NON-GRADED") ||
                        u.includes("NON GRADED")
                      )
                        return "SNED (NON-GRADED)";
                      if (
                        u === "ALS" ||
                        u.startsWith("ALS-") ||
                        u.startsWith("ALS ")
                      )
                        return "ALS";
                      return g;
                    });

                    const updateGrades = (newList) => {
                      const hasShs = newList.some(
                        (g) =>
                          String(g).includes("11") || String(g).includes("12"),
                      );
                      handleMultipleFieldsChange({
                        assignedGradeLevels: newList,
                        assigned_grade_levels: newList,
                        gradeLevelsTaught: newList,
                        grade_levels_taught: newList,
                        teachesShs: hasShs,
                        teaches_shs: hasShs,
                      });
                    };

                    return (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {groups.map((grp, gIdx) => (
                          <div
                            key={gIdx}
                            style={{
                              background: "#F8FAFC",
                              padding: "10px 12px",
                              borderRadius: "12px",
                              border: "1px solid #E2E8F0",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                color: "#64748B",
                                marginBottom: "6px",
                              }}
                            >
                              {grp.title}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "6px",
                              }}
                            >
                              {grp.grades.map((gLevel) => {
                                const isSelected = currentList.includes(gLevel);
                                return (
                                  <button
                                    key={gLevel}
                                    type="button"
                                    onClick={() => {
                                      const updated = isSelected
                                        ? currentList.filter(
                                            (g) => g !== gLevel,
                                          )
                                        : [...currentList, gLevel];
                                      updateGrades(updated);
                                    }}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: "8px",
                                      border: isSelected
                                        ? "1.5px solid #0284C7"
                                        : "1px solid #CBD5E1",
                                      background: isSelected
                                        ? "linear-gradient(135deg, #0284C7, #0369A1)"
                                        : "#FFFFFF",
                                      color: isSelected ? "#FFFFFF" : "#1E293B",
                                      fontSize: "11.5px",
                                      fontWeight: isSelected ? 800 : 600,
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      boxShadow: isSelected
                                        ? "0 2px 4px rgba(2,132,199,0.2)"
                                        : "none",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    {isSelected ? (
                                      <FiCheck size={13} color="#FFFFFF" />
                                    ) : (
                                      <div
                                        style={{
                                          width: "10px",
                                          height: "10px",
                                          borderRadius: "50%",
                                          border: "1.5px solid #94A3B8",
                                        }}
                                      />
                                    )}
                                    <span>{gLevel}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 6: LEARNING AREA MATRIX */}
              {activeTab === "learning-area" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "15px",
                          fontWeight: 800,
                          color: "var(--navy)",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <FiBook size={16} /> 6. Learning Area Matrix
                      </h3>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: "11px",
                          color: "var(--muted)",
                        }}
                      >
                        Record taught primary subjects across DepEd curriculum
                        eras.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ fontSize: "11px", padding: "4px 10px" }}
                        onClick={() => {
                          const totalMax = getMaxAllowedServiceYears(formData);
                          let budget = totalMax;
                          const newMap = {};
                          const firstServiceYear = (() => {
                            const d =
                              formData?.firstServiceDate ||
                              formData?.first_service_date ||
                              "";
                            if (!d) return null;
                            const y = parseInt(d.substring(0, 4), 10);
                            return isNaN(y) ? null : y;
                          })();
                          const activeEras = [...CURRICULUM_ERAS].reverse();
                          for (const era of activeEras) {
                            const isDisabled =
                              firstServiceYear !== null &&
                              firstServiceYear > era.endYear;
                            if (!isDisabled && budget > 0) {
                              for (const sub of PRIMARY_SUBJECTS) {
                                if (budget > 0) {
                                  newMap[`${era.key}||${sub}`] = {
                                    checked: true,
                                    years: 1,
                                  };
                                  budget -= 1;
                                }
                              }
                            }
                          }
                          handleMultipleFieldsChange({
                            learningAreaMap: newMap,
                            matrix_data: newMap,
                          });
                          try {
                            localStorage.setItem(
                              `draft_learning_areas_${formData.id}`,
                              JSON.stringify(newMap),
                            );
                          } catch (e) {}
                        }}
                      >
                        Select All Active
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ fontSize: "11px", padding: "4px 10px" }}
                        onClick={() => {
                          handleMultipleFieldsChange({
                            learningAreaMap: {},
                            matrix_data: {},
                          });
                          try {
                            localStorage.setItem(
                              `draft_learning_areas_${formData.id}`,
                              JSON.stringify({}),
                            );
                          } catch (e) {}
                        }}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const maxYears = getMaxAllowedServiceYears(formData);
                    const totalAssigned = getTotalAssignedLearningYears(
                      formData.learningAreaMap || formData.matrix_data,
                    );
                    const isComplete = totalAssigned === maxYears;
                    const isOver = totalAssigned > maxYears;
                    const isUnder = totalAssigned < maxYears;
                    const serviceStartYear =
                      formData?.firstServiceDate ||
                      formData?.first_service_date;

                    return (
                      <div
                        style={{
                          background: isComplete
                            ? "#F0FDF4"
                            : isOver
                              ? "#FEF2F2"
                              : "#FFFBEB",
                          border: `1.5px solid ${isComplete ? "#86EFAC" : isOver ? "#FCA5A5" : "#FDE68A"}`,
                          borderRadius: "12px",
                          padding: "10px 14px",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 800,
                              color: isComplete
                                ? "#15803D"
                                : isOver
                                  ? "#991B1B"
                                  : "#92400E",
                            }}
                          >
                            {isComplete
                              ? "✓ Full Service Experience Accounted"
                              : isOver
                                ? "⚠️ Over-Allocated Experience"
                                : "⚠️ Full Allocation Required"}
                          </span>
                          <span
                            style={{
                              fontWeight: 900,
                              fontSize: "12px",
                              color: isComplete
                                ? "#15803D"
                                : isOver
                                  ? "#991B1B"
                                  : "#92400E",
                              background: isComplete
                                ? "#DCFCE7"
                                : isOver
                                  ? "#FEE2E2"
                                  : "#FEF3C7",
                              padding: "2px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            {totalAssigned} / {maxYears} Years{" "}
                            {totalAssigned >= maxYears ? "(Max Reached)" : ""}
                          </span>
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "11px",
                            color: isComplete
                              ? "#166534"
                              : isOver
                                ? "#B91C1C"
                                : "#B45309",
                            lineHeight: 1.3,
                          }}
                        >
                          {isComplete &&
                            `All ${maxYears} years of teaching experience from your first day of service (${serviceStartYear ? serviceStartYear.substring(0, 10) : "Service Start"}) have been fully allocated across the matrix.`}
                          {isUnder &&
                            `You must fully allocate all ${maxYears} years across the subjects/eras you have taught (${maxYears - totalAssigned} yr(s) remaining). Max calculated from 1st Service Date: ${serviceStartYear ? serviceStartYear.substring(0, 10) : "N/A"}.`}
                          {isOver &&
                            `Total allocated years (${totalAssigned} yrs) exceeds your maximum service record (${maxYears} yrs). Please adjust years.`}
                        </p>
                      </div>
                    );
                  })()}

                  <div
                    style={{
                      overflowX: "auto",
                      border: "1.5px solid var(--line)",
                      borderRadius: "12px",
                      background: "#FFFFFF",
                    }}
                  >
                    <table
                      style={{
                        borderCollapse: "collapse",
                        width: "100%",
                        fontSize: "11px",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: "#F8FAFC",
                            borderBottom: "1.5px solid var(--line)",
                          }}
                        >
                          <th
                            style={{
                              padding: "8px 10px",
                              textAlign: "left",
                              fontWeight: 800,
                              minWidth: "150px",
                              borderRight: "1px solid var(--line)",
                            }}
                          >
                            Era ↓ / Subject →
                          </th>
                          {PRIMARY_SUBJECTS.map((sub) => (
                            <th
                              key={sub}
                              style={{
                                padding: "8px 6px",
                                textAlign: "center",
                                fontWeight: 800,
                                minWidth: "78px",
                                borderRight: "1px solid var(--line)",
                              }}
                            >
                              {sub}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const firstServiceYear = (() => {
                            const d =
                              formData?.firstServiceDate ||
                              formData?.first_service_date ||
                              "";
                            if (!d) return null;
                            const y = parseInt(d.substring(0, 4), 10);
                            return isNaN(y) ? null : y;
                          })();
                          const totalMax = getMaxAllowedServiceYears(formData);
                          const currentTotal = getTotalAssignedLearningYears(
                            formData.learningAreaMap || formData.matrix_data,
                          );
                          const isCapacityFull = currentTotal >= totalMax;

                          return CURRICULUM_ERAS.map((era) => {
                            const isDisabledEra =
                              firstServiceYear !== null &&
                              firstServiceYear > era.endYear;

                            return (
                              <tr
                                key={era.key}
                                style={{
                                  borderBottom: "1px solid var(--line)",
                                  background: isDisabledEra
                                    ? "#F1F5F9"
                                    : "#FFFFFF",
                                  opacity: isDisabledEra ? 0.65 : 1,
                                }}
                              >
                                <td
                                  style={{
                                    padding: "8px 10px",
                                    fontWeight: 800,
                                    color: isDisabledEra
                                      ? "#64748B"
                                      : "var(--navy)",
                                    borderRight: "1px solid var(--line)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "2px",
                                    }}
                                  >
                                    <span>{era.label}</span>
                                    {isDisabledEra && (
                                      <span
                                        style={{
                                          fontSize: "9px",
                                          fontWeight: "bold",
                                          color: "#94A3B8",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.02em",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "3px",
                                        }}
                                      >
                                        <FiLock size={9} /> Prior to Service (
                                        {firstServiceYear})
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {PRIMARY_SUBJECTS.map((sub) => {
                                  const key = `${era.key}||${sub}`;
                                  const cell = (formData.learningAreaMap ||
                                    formData.matrix_data ||
                                    {})[key];
                                  const isChecked = !!cell?.checked;
                                  const isCheckboxDisabled =
                                    isDisabledEra ||
                                    (!isChecked && isCapacityFull);

                                  return (
                                    <td
                                      key={sub}
                                      style={{
                                        textAlign: "center",
                                        padding: "6px 4px",
                                        borderRight: "1px solid var(--line)",
                                        background:
                                          isChecked && !isDisabledEra
                                            ? "#EFF6FF"
                                            : "transparent",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          alignItems: "center",
                                          gap: "3px",
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() =>
                                            handleToggleLearningAreaCell(
                                              era.key,
                                              sub,
                                            )
                                          }
                                          disabled={isCheckboxDisabled}
                                          style={{
                                            cursor: isCheckboxDisabled
                                              ? "not-allowed"
                                              : "pointer",
                                            width: "16px",
                                            height: "16px",
                                            accentColor: "#0284C7",
                                            opacity:
                                              !isChecked && isCapacityFull
                                                ? 0.35
                                                : 1,
                                          }}
                                        />
                                        {isChecked && !isDisabledEra && (
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "2px",
                                              marginTop: "2px",
                                            }}
                                          >
                                            {(() => {
                                              const cellMax = getCellMaxYears(
                                                era.key,
                                                sub,
                                                formData,
                                                formData.learningAreaMap ||
                                                  formData.matrix_data,
                                              );
                                              return (
                                                <input
                                                  type="number"
                                                  min="1"
                                                  max={cellMax}
                                                  value={cell.years || 1}
                                                  onInput={(e) => {
                                                    if (
                                                      e.target.value.length > 2
                                                    )
                                                      e.target.value =
                                                        e.target.value.slice(
                                                          0,
                                                          2,
                                                        );
                                                    if (
                                                      parseInt(
                                                        e.target.value,
                                                        10,
                                                      ) > cellMax
                                                    )
                                                      e.target.value =
                                                        String(cellMax);
                                                  }}
                                                  onChange={(e) =>
                                                    handleLearningAreaYearsChange(
                                                      era.key,
                                                      sub,
                                                      e.target.value,
                                                    )
                                                  }
                                                  style={{
                                                    width: "36px",
                                                    textAlign: "center",
                                                    fontSize: "10px",
                                                    fontWeight: "bold",
                                                    padding: "2px",
                                                    borderRadius: "4px",
                                                    border:
                                                      "1px solid var(--blue)",
                                                    background: "#FFFFFF",
                                                  }}
                                                />
                                              );
                                            })()}
                                            <span
                                              style={{
                                                fontSize: "9px",
                                                fontWeight: "700",
                                                color: "var(--navy)",
                                              }}
                                            >
                                              yr{cell.years > 1 ? "s" : ""}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bottom Navigation & Sticky Submission Controls */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "12px",
                  paddingTop: "14px",
                  borderTop: "1.5px solid var(--line)",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  disabled={activeTabIndex === 0}
                  onClick={handlePrevTab}
                  style={{ fontSize: "12px", padding: "8px 14px" }}
                >
                  <FiArrowLeft size={13} /> Prev
                </button>

                <div style={{ display: "flex", gap: "8px" }}>
                  {activeTabIndex < navTabs.length - 1 && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={handleNextTab}
                      style={{ fontSize: "12px", padding: "8px 14px" }}
                    >
                      Next <FiArrowRight size={13} />
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn"
                    disabled={isSubmitting}
                    onClick={handleSubmit}
                    style={{
                      background: "#10B981",
                      borderColor: "#10B981",
                      color: "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 800,
                      padding: "8px 18px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FiSave size={14} />
                    <span>
                      {isSubmitting
                        ? "Transmitting..."
                        : "Submit Profile Updates"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}

      {/* RA 1080 Custom Board Exam Modal */}
      {showRa1080Modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "20px",
              maxWidth: "400px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 800,
                color: "var(--navy)",
              }}
            >
              Specify RA 1080 Details
            </h3>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
              Enter the exact board exam or profession (e.g. MECHANICAL
              ENGINEER, REGISTERED SOCIAL WORKER).
            </p>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Mechanical Engineer"
              value={ra1080InputText}
              onChange={(e) => setRa1080InputText(e.target.value)}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
              }}
            >
              <button
                className="btn secondary"
                type="button"
                onClick={() => setShowRa1080Modal(false)}
              >
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                disabled={!ra1080InputText.trim()}
                onClick={() => {
                  const currentList = Array.isArray(formData.eligibility)
                    ? formData.eligibility
                    : String(formData.eligibility || "")
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                  handleFieldChange(
                    "eligibility",
                    [
                      ...currentList,
                      `RA 1080 (${ra1080InputText.trim().toUpperCase()})`,
                    ].join(", "),
                  );
                  setShowRa1080Modal(false);
                  setRa1080InputText("");
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
