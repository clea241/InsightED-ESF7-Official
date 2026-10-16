import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  useApp,
  POSITION_OPTIONS_BY_CATEGORY,
  detectPersonnelTypeFromPosition,
  isCanonicalPosition,
  getCategoryForCanonicalPosition,
  validateDepEdEmail,
} from "../context/AppContext";
import {
  findRosterSchoolHead,
  findAllRosterSchoolHeads,
  isMainSchoolHead,
  getEducationalLevelsFromMCOC,
} from "@shared/schoolHead.js";
import SearchableDropdown from "../components/SearchableDropdown";
import DepEdEmailInfoModal from "../components/DepEdEmailInfoModal";
import ESF7UploadModal from "../components/ESF7UploadModal";
import PortalHeader from "../components/PortalHeader";
import {
  GulpTrashIcon,
  GulpFlyingText,
  GulpFlyingItem,
  GulpGlobalStyles,
} from "../components/GulpTrashRow";
import useDirtyGuard from "../hooks/useDirtyGuard";
import { cleanPersonnelDates } from "../services/dateFields";
import { api } from "../services/api";
import {
  upsertOutboxEntry,
  removeOutboxEntryByModule,
  autoSyncOutboxOnSectionOpen,
} from "../services/outbox";
import {
  FiPlus,
  FiSave,
  FiTag,
  FiLink,
  FiUser,
  FiTrash2,
  FiInfo,
  FiX,
  FiUploadCloud,
  FiRefreshCw,
  FiCheckCircle,
  FiAlertCircle,
  FiUserCheck,
  FiMaximize,
  FiSearch,
  FiStar,
  FiCheck,
  FiEdit2,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";
import RoomQR from "./RoomQR";

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

function DatePickerDropdowns({
  value,
  onChange,
  disabled = false,
  maxDate,
  minDate,
  required = false,
}) {
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(new Date());
  const containerRef = React.useRef(null);

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

  React.useEffect(() => {
    if (!showCalendar && cleanValue) {
      const d = new Date(cleanValue + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [cleanValue, showCalendar]);

  React.useEffect(() => {
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
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
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

  const firstDayOfMonth = new Date(year, month, 1);
  let startDayIndex = firstDayOfMonth.getDay() - 1;
  if (startDayIndex < 0) startDayIndex = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startDayIndex - 1; i >= 0; i--) {
    cells.push({
      day: daysInPrevMonth - i,
      monthOffset: -1,
      date: new Date(year, month - 1, daysInPrevMonth - i),
    });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i,
      monthOffset: 0,
      date: new Date(year, month, i),
    });
  }
  const totalCells = 42;
  const nextPadding = totalCells - cells.length;
  for (let i = 1; i <= nextPadding; i++) {
    cells.push({
      day: i,
      monthOffset: 1,
      date: new Date(year, month + 1, i),
    });
  }

  const handleDaySelect = (cellDate, e) => {
    e.stopPropagation();
    if (disabled) return;

    const cellStr = formatDate(cellDate);
    if (maxDateStr && cellStr > maxDateStr) return;
    if (minDateStr && cellStr < minDateStr) return;

    if (typeof onChange === "function") {
      onChange(cellStr);
    }
    setShowCalendar(false);
  };

  const isSelected = (cellDate) => {
    return cleanValue && formatDate(cellDate) === cleanValue;
  };

  const isDisabled = (cellDate) => {
    const cellStr = formatDate(cellDate);
    if (maxDateStr && cellStr > maxDateStr) return true;
    if (minDateStr && cellStr < minDateStr) return true;
    return false;
  };

  const isToday = (cellDate) => {
    return formatDate(cellDate) === formatDate(new Date());
  };

  const isRed = required && !cleanValue;

  const yearOptions = [];
  for (let y = currentMaxYear; y >= currentMinYear; y--) {
    yearOptions.push(y);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div
        onClick={handleOpenCalendar}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderRadius: "12px",
          border: disabled
            ? "1.5px solid #e2e8f0"
            : isRed
              ? "1.5px solid #EF4444"
              : "1.5px solid var(--line, #cbd5e1)",
          background: disabled ? "#f1f5f9" : isRed ? "#FEF2F2" : "white",
          color: cleanValue ? "var(--navy)" : "#94a3b8",
          fontFamily: "inherit",
          fontSize: "13px",
          minHeight: "44px",
          cursor: disabled ? "not-allowed" : "pointer",
          boxSizing: "border-box",
          transition: "all 0.2s ease",
          userSelect: "none",
        }}
      >
        <span style={{ fontWeight: cleanValue ? "600" : "normal" }}>
          {getDisplayDate()}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--blue, #0284C7)", opacity: disabled ? 0.5 : 1 }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>

      {showCalendar && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "0",
            marginTop: "8px",
            width: "290px",
            background: "white",
            border: "1.5px solid var(--line, #cbd5e1)",
            borderRadius: "16px",
            boxShadow:
              "0 20px 25px -5px rgba(0,0,0,0.15), 0 10px 10px -5px rgba(0,0,0,0.08)",
            padding: "16px",
            zIndex: 99999,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#F1F5F9",
                borderRadius: "20px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: "600",
                color: "var(--navy)",
                gap: "4px",
              }}
            >
              <select
                value={month}
                onChange={(e) =>
                  setViewDate(new Date(year, Number(e.target.value), 1))
                }
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "var(--navy)",
                  cursor: "pointer",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              >
                {monthNames.map((mName, idx) => {
                  const isMonthDisabled =
                    (parsedMaxDate &&
                      year === currentMaxYear &&
                      idx > parsedMaxDate.getMonth()) ||
                    (parsedMinDate &&
                      year === currentMinYear &&
                      idx < parsedMinDate.getMonth());
                  return (
                    <option key={idx} value={idx} disabled={isMonthDisabled}>
                      {mName.toUpperCase()}
                    </option>
                  );
                })}
              </select>
              <select
                value={year}
                onChange={(e) => {
                  const newYear = Number(e.target.value);
                  let newMonth = month;
                  if (
                    parsedMaxDate &&
                    newYear === currentMaxYear &&
                    newMonth > parsedMaxDate.getMonth()
                  ) {
                    newMonth = parsedMaxDate.getMonth();
                  }
                  if (
                    parsedMinDate &&
                    newYear === currentMinYear &&
                    newMonth < parsedMinDate.getMonth()
                  ) {
                    newMonth = parsedMinDate.getMonth();
                  }
                  setViewDate(new Date(newYear, newMonth, 1));
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "var(--navy)",
                  cursor: "pointer",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              >
                {yearOptions.map((yVal) => (
                  <option key={yVal} value={yVal}>
                    {yVal}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={isPrevDisabled}
                style={{
                  background: isPrevDisabled ? "#F1F5F9" : "#F8FAFC",
                  border: "1px solid var(--line, #cbd5e1)",
                  borderRadius: "8px",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isPrevDisabled ? "not-allowed" : "pointer",
                  color: isPrevDisabled ? "#CBD5E1" : "var(--navy)",
                  padding: 0,
                }}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                disabled={isNextDisabled}
                style={{
                  background: isNextDisabled ? "#F1F5F9" : "#F8FAFC",
                  border: "1px solid var(--line, #cbd5e1)",
                  borderRadius: "8px",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isNextDisabled ? "not-allowed" : "pointer",
                  color: isNextDisabled ? "#CBD5E1" : "var(--navy)",
                  padding: 0,
                }}
              >
                ›
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "6px",
              textAlign: "center",
              marginBottom: "8px",
            }}
          >
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span
                key={d}
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#64748b",
                }}
              >
                {d}
              </span>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "6px",
              textAlign: "center",
            }}
          >
            {cells.map((cell, idx) => {
              const active = cell.monthOffset === 0;
              const selected = isSelected(cell.date);
              const disabledDay = isDisabled(cell.date);

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabledDay}
                  onClick={(e) => handleDaySelect(cell.date, e)}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    background: selected
                      ? "#2B3945"
                      : isToday(cell.date)
                        ? "white"
                        : disabledDay
                          ? "none"
                          : "#E9EFF6",
                    border:
                      isToday(cell.date) && !selected
                        ? "1.5px solid #2B3945"
                        : "none",
                    color: selected
                      ? "white"
                      : disabledDay
                        ? "#E2E8F0"
                        : active
                          ? "#2B3945"
                          : "#94A3B8",
                    fontSize: "12px",
                    fontWeight: selected ? "700" : "normal",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: disabledDay ? "not-allowed" : "pointer",
                    outline: "none",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected && !disabledDay) {
                      e.currentTarget.style.background = "#CBD5E1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected && !disabledDay) {
                      e.currentTarget.style.background = isToday(cell.date)
                        ? "white"
                        : "#E9EFF6";
                    }
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPersonnelName(p) {
  if (!p) return "—";
  const ln = (p.lastName || p.last_name || "").trim();
  const fn = (p.firstName || p.first_name || "").trim();
  const mn = (p.middleName || p.middle_name || "").trim();
  const ext = (p.nameExtension || p.name_extension || "").trim();

  const parts = [];
  if (ln && fn) {
    parts.push(`${ln}, ${fn}`);
  } else if (ln) {
    parts.push(ln);
  } else if (fn) {
    parts.push(fn);
  }

  if (mn) parts.push(mn);
  if (ext) parts.push(ext);

  return parts.join(" ") || "—";
}

export default function Roster() {
  const {
    personnel,
    setPersonnel,
    schoolInfo,
    addPersonnel,
    deletePersonnel,
    resolveBorrowedPersonnel,
    toggleSchoolHead,
    designateSchoolHeadsConfig,
    sdoSchoolHead,
    saveSdoSchoolHead,
    commitDraftPersonnel,
    setActivePersonnelId,
    setActiveView,
    showConfirm,
    showToast,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    completeNode,
    outgoingRequests,
    requestHistory,
    user,
    activeTerm,
    refreshPersonnelList,
    deleteLocalDraft,
  } = useApp();

  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "asc",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [isEmailInfoOpen, setIsEmailInfoOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [harvestStatus, setHarvestStatus] = useState(null);
  const [isCheckingHarvest, setIsCheckingHarvest] = useState(false);
  const [isHeadRequiredModalOpen, setIsHeadRequiredModalOpen] = useState(false);
  const [highlightHeadColumn, setHighlightHeadColumn] = useState(false);
  const [newlyAddedPersonnelIds, setNewlyAddedPersonnelIds] = useState(
    () => new Set(),
  );
  const [isNewPersonnelSidebarOpen, setIsNewPersonnelSidebarOpen] =
    useState(false);
  const [isClosingSidebar, setIsClosingSidebar] = useState(false);
  const [gulpDeleteState, setGulpDeleteState] = useState(null);
  const nameRefs = useRef({});
  const categoryRefs = useRef({});
  const positionRefs = useRef({});
  const emailRefs = useRef({});
  const trashRefs = useRef({});

  const handleGulpDelete = async (p) => {
    if (gulpDeleteState) return;
    const confirmed = await showConfirm(
      "Delete Personnel?",
      `Are you sure you want to delete ${p.firstName} ${p.lastName}?`,
    );
    if (!confirmed) return;

    const trashEl = trashRefs.current[p.id];
    let vectorName = { deltaX: 520, deltaY: 0 };
    let vectorCategory = { deltaX: 240, deltaY: 0 };
    let vectorPosition = { deltaX: 110, deltaY: 0 };
    let vectorEmail = { deltaX: 380, deltaY: 0 };

    if (trashEl) {
      const tRect = trashEl.getBoundingClientRect();
      const tMidX = tRect.left + tRect.width / 2;
      const tMidY = tRect.top + tRect.height / 2;

      const nameEl = nameRefs.current[p.id];
      if (nameEl) {
        const nRect = nameEl.getBoundingClientRect();
        vectorName = {
          deltaX: tMidX - (nRect.left + 15),
          deltaY: tMidY - (nRect.top + 8),
        };
      }

      const catEl = categoryRefs.current[p.id];
      if (catEl) {
        const cRect = catEl.getBoundingClientRect();
        vectorCategory = {
          deltaX: tMidX - (cRect.left + cRect.width / 2),
          deltaY: tMidY - (cRect.top + cRect.height / 2),
        };
      }

      const posEl = positionRefs.current[p.id];
      if (posEl) {
        const pRect = posEl.getBoundingClientRect();
        vectorPosition = {
          deltaX: tMidX - (pRect.left + pRect.width / 2),
          deltaY: tMidY - (pRect.top + pRect.height / 2),
        };
      }

      const emailEl = emailRefs.current[p.id];
      if (emailEl) {
        const eRect = emailEl.getBoundingClientRect();
        vectorEmail = {
          deltaX: tMidX - (eRect.left + 20),
          deltaY: tMidY - (eRect.top + 8),
        };
      }
    }

    setGulpDeleteState({
      id: p.id,
      stage: "eating",
      vectors: {
        name: vectorName,
        category: vectorCategory,
        position: vectorPosition,
        email: vectorEmail,
      },
    });
  };

  const handleGulpComplete = (pId) => {
    setGulpDeleteState((curr) =>
      curr?.id === pId ? { ...curr, stage: "chomped" } : curr,
    );

    // After lid snaps shut with crunch & puff, collapse row then delete
    setTimeout(() => {
      setGulpDeleteState((curr) =>
        curr?.id === pId ? { ...curr, stage: "collapsing" } : curr,
      );

      setTimeout(async () => {
        const nextPersonnel = (personnel || []).filter(
          (p) => String(p.id) !== String(pId) && String(p.prn) !== String(pId),
        );
        await deletePersonnel(pId);
        syncCleanRosterSnapshot(nextPersonnel);
        setGulpDeleteState(null);
      }, 360);
    }, 400);
  };

  const closeNewPersonnelSidebar = () => {
    if (isClosingSidebar) return;
    setIsClosingSidebar(true);
    setTimeout(() => {
      setIsNewPersonnelSidebarOpen(false);
      setIsClosingSidebar(false);
    }, 280);
  };

  useEffect(() => {
    if (!isNewPersonnelSidebarOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeNewPersonnelSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNewPersonnelSidebarOpen, isClosingSidebar]);

  // Transparent auto-sync of pending offline personnel changes on section open (Zero intrusive modal popups)
  useEffect(() => {
    let isMounted = true;
    autoSyncOutboxOnSectionOpen({
      module: "personnel_roster",
      schoolId: schoolInfo?.schoolId,
      schoolYear: schoolInfo?.schoolYear || "SY 26-27",
      onSynced: () => {
        if (!isMounted) return;
        if (typeof refreshPersonnelList === "function") {
          refreshPersonnelList().catch(() => {});
        }
        if (showToast) {
          showToast("Offline personnel changes synced to database.", "success");
        }
      },
    });
    return () => {
      isMounted = false;
    };
  }, [schoolInfo?.schoolId, schoolInfo?.schoolYear]);

  // SDO-supplied school head (e.g. EPS II as OIC Principal): only offered while the roster has no designated head
  const [isSdoHeadModalOpen, setIsSdoHeadModalOpen] = useState(false);
  const [sdoHeadForm, setSdoHeadForm] = useState({
    name: "",
    email: "",
    positionTitle: "",
  });
  const [sdoHeadError, setSdoHeadError] = useState("");
  const [isSavingSdoHead, setIsSavingSdoHead] = useState(false);
  const currentHead = useMemo(
    () => findRosterSchoolHead(personnel),
    [personnel],
  );
  const allRosterHeads = useMemo(
    () => findAllRosterSchoolHeads(personnel),
    [personnel],
  );
  const rosterHasHead = Boolean(currentHead);
  const [isChangeHeadModalOpen, setIsChangeHeadModalOpen] = useState(false);
  const [headSearchQuery, setHeadSearchQuery] = useState("");

  const savedRosterSnapshotRef = useRef(null);
  const lastSchoolIdRef = useRef(schoolInfo?.schoolId);

  useEffect(() => {
    if (
      schoolInfo?.schoolId &&
      schoolInfo.schoolId !== lastSchoolIdRef.current
    ) {
      lastSchoolIdRef.current = schoolInfo.schoolId;
      savedRosterSnapshotRef.current = null;
    }
  }, [schoolInfo?.schoolId]);

  const getRosterSnapshot = useCallback(
    () =>
      (personnel || []).map((p) => ({
        id: String(p.id || "").trim(),
        isDraft: Boolean(p.isDraft),
        isSchoolHead: Boolean(p.isSchoolHead || p.is_school_head),
        position: String(p.position || p.plantilla_position || "").trim(),
        firstName: String(p.firstName || p.first_name || "")
          .trim()
          .toUpperCase(),
        lastName: String(p.lastName || p.last_name || "")
          .trim()
          .toUpperCase(),
        depedEmail: String(p.depedEmail || p.email || p.deped_email || "")
          .trim()
          .toLowerCase(),
      })),
    [personnel],
  );

  const syncCleanRosterSnapshot = useCallback(
    (cleanList = null) => {
      const list = cleanList || personnel || [];
      const snapshot = list.map((p) => ({
        id: String(p.id || "").trim(),
        isDraft: false,
        isSchoolHead: Boolean(p.isSchoolHead || p.is_school_head),
        position: String(p.position || p.plantilla_position || "").trim(),
        firstName: String(p.firstName || p.first_name || "")
          .trim()
          .toUpperCase(),
        lastName: String(p.lastName || p.last_name || "")
          .trim()
          .toUpperCase(),
        depedEmail: String(p.depedEmail || p.email || p.deped_email || "")
          .trim()
          .toLowerCase(),
      }));
      savedRosterSnapshotRef.current = JSON.stringify(snapshot);
      setNewlyAddedPersonnelIds(new Set());
      if (typeof setHasUnsavedChanges === "function") {
        setHasUnsavedChanges(false);
      }
    },
    [personnel, setHasUnsavedChanges, setNewlyAddedPersonnelIds],
  );

  useEffect(() => {
    if (
      savedRosterSnapshotRef.current === null &&
      personnel &&
      personnel.length > 0
    ) {
      savedRosterSnapshotRef.current = JSON.stringify(getRosterSnapshot());
    }
  }, [personnel, getRosterSnapshot]);

  const educationalLevels = useMemo(() => {
    return getEducationalLevelsFromMCOC(
      schoolInfo?.mcoc || schoolInfo?.raw_payload?.mcoc,
      schoolInfo?.curricularOffering || schoolInfo?.curricular_offering,
    );
  }, [
    schoolInfo?.mcoc,
    schoolInfo?.raw_payload?.mcoc,
    schoolInfo?.curricularOffering,
    schoolInfo?.curricular_offering,
  ]);

  // Modal multiple heads configuration state: null = unanswered, true = yes, false = no
  const [modalHasMultipleHeads, setModalHasMultipleHeads] = useState(null);
  const [modalHeadAssignments, setModalHeadAssignments] = useState({}); // { [level]: personId }
  const [modalMainHeadId, setModalMainHeadId] = useState(null);
  const [activeLevelSlot, setActiveLevelSlot] = useState(null);
  const [confirmDesignateTarget, setConfirmDesignateTarget] = useState(null);

  const allMultipleSlotsAssigned = useMemo(() => {
    return (
      modalHasMultipleHeads === true &&
      educationalLevels.length > 1 &&
      educationalLevels.every((lvl) => Boolean(modalHeadAssignments[lvl]))
    );
  }, [modalHasMultipleHeads, educationalLevels, modalHeadAssignments]);

  // Cascade handler when switching from "Yes (Multiple School Heads)" to "No (1 Main School Head for all)"
  const handleSwitchToSingleHead = useCallback(() => {
    const assignedEntries = Object.entries(modalHeadAssignments || {}).filter(
      ([_, id]) => Boolean(id),
    );
    const assignedIds = Array.from(
      new Set(assignedEntries.map(([_, id]) => String(id))),
    );

    // 1. Resolve who the Main School Head is
    let resolvedMainId = modalMainHeadId ? String(modalMainHeadId) : null;

    if (!resolvedMainId) {
      if (assignedIds.length === 1) {
        resolvedMainId = assignedIds[0];
      } else if (assignedIds.length > 1) {
        // Multiple candidates exist, but none chosen as Main Signatory
        if (showToast) {
          showToast(
            "Please select a Main Signatory first to determine who will remain the School Head.",
            "warning",
          );
        }
        return;
      } else if (currentHead?.id) {
        resolvedMainId = String(currentHead.id);
      }
    }

    // 2. Cascade state change: Map all educational levels to the chosen Main Head
    const newAssignments = {};
    if (resolvedMainId) {
      educationalLevels.forEach((lvl) => {
        newAssignments[lvl] = resolvedMainId;
      });
    }

    setModalHasMultipleHeads(false);
    setModalMainHeadId(resolvedMainId);
    setModalHeadAssignments(newAssignments);
    setActiveLevelSlot(null);

    // 3. Immediately clear the secondary candidate's designation from personnel in panel state
    if (resolvedMainId && assignedIds.length > 1) {
      const wipedIds = new Set(
        assignedIds.filter((id) => id !== resolvedMainId),
      );
      const updatedPersonnel = (personnel || []).map((p) => {
        const pIdStr = String(p.id);
        if (wipedIds.has(pIdStr)) {
          return {
            ...p,
            isSchoolHead: false,
            is_school_head: false,
            isMainSchoolHead: false,
            is_main_school_head: false,
            is_main_sh: false,
            schoolHeadLevel: null,
            school_head_level: null,
          };
        }
        if (pIdStr === resolvedMainId) {
          return {
            ...p,
            isSchoolHead: true,
            is_school_head: true,
            isMainSchoolHead: true,
            is_main_school_head: true,
            is_main_sh: true,
            schoolHeadLevel: null,
            school_head_level: null,
          };
        }
        return p;
      });

      if (typeof setPersonnel === "function") {
        setPersonnel(updatedPersonnel);
      }
    }
  }, [
    modalHeadAssignments,
    modalMainHeadId,
    currentHead,
    educationalLevels,
    personnel,
    showToast,
    setPersonnel,
  ]);

  // Handler when switching from "No" to "Yes (Multiple School Heads)"
  const handleSwitchToMultipleHeads = useCallback(() => {
    setModalHasMultipleHeads(true);

    // Preserve ONLY the currently chosen Main School Head for the first educational level slot.
    // All other educational levels remain unassigned so that wiped secondary candidates are NOT resurrected!
    const newAssignments = {};
    if (modalMainHeadId) {
      newAssignments[educationalLevels[0]] = String(modalMainHeadId);
      setActiveLevelSlot(educationalLevels[1] || educationalLevels[0]);
    } else {
      setActiveLevelSlot(educationalLevels[0]);
    }

    setModalHeadAssignments(newAssignments);
    setModalMainHeadId(modalMainHeadId ? String(modalMainHeadId) : null);
  }, [educationalLevels, modalMainHeadId]);

  // Save School Heads configuration (supports both multiple and single head modes across educational levels)
  const handleConfirmSaveSchoolHeads = useCallback(async () => {
    const isMultiple = Boolean(modalHasMultipleHeads);
    const targetAssignments = isMultiple
      ? modalHeadAssignments
      : Object.fromEntries(
          educationalLevels.map((lvl) => [lvl, modalMainHeadId]),
        );

    const success = await designateSchoolHeadsConfig({
      hasMultipleHeads: isMultiple,
      mainHeadId: modalMainHeadId,
      assignments: targetAssignments,
    });

    if (success) {
      setIsChangeHeadModalOpen(false);
      const assignedIds = new Set(
        Object.values(targetAssignments || {})
          .filter(Boolean)
          .map(String),
      );
      const updatedList = (personnel || []).map((item) => {
        const pIdStr = String(item.id);
        const isHead = assignedIds.has(pIdStr);
        const isMain = String(modalMainHeadId) === pIdStr;
        const lvl = isMultiple
          ? Object.entries(targetAssignments).find(
              ([_, id]) => String(id) === pIdStr,
            )?.[0] || null
          : null;
        return {
          ...item,
          isSchoolHead: isHead,
          is_school_head: isHead,
          isMainSchoolHead: isHead ? isMain : false,
          is_main_school_head: isHead ? isMain : false,
          is_main_sh: isHead ? isMain : false,
          schoolHeadLevel: isHead ? lvl : null,
          school_head_level: isHead ? lvl : null,
        };
      });
      if (typeof setPersonnel === "function") {
        setPersonnel(updatedList);
      }
      syncCleanRosterSnapshot(updatedList);
      if (showToast) {
        showToast(
          isMultiple
            ? "Multi-level School Head designations saved."
            : "School Head configuration saved (1 Main School Head for all offerings).",
          "success",
        );
      }
    }
  }, [
    modalHasMultipleHeads,
    modalHeadAssignments,
    educationalLevels,
    modalMainHeadId,
    designateSchoolHeadsConfig,
    personnel,
    setPersonnel,
    syncCleanRosterSnapshot,
    showToast,
  ]);

  useEffect(() => {
    if (isChangeHeadModalOpen) {
      setHeadSearchQuery("");
      const levels = educationalLevels;
      const currentHeads = findAllRosterSchoolHeads(personnel);

      if (levels.length === 1) {
        setModalHasMultipleHeads(false);
        const head = currentHeads[0];
        setModalHeadAssignments(head ? { [levels[0]]: String(head.id) } : {});
        setModalMainHeadId(head ? String(head.id) : null);
        setActiveLevelSlot(levels[0]);
      } else {
        if (currentHeads.length > 1) {
          setModalHasMultipleHeads(true);
          const initialAssign = {};
          levels.forEach((lvl) => {
            const found = currentHeads.find(
              (h) => h.schoolHeadLevel === lvl || h.school_head_level === lvl,
            );
            if (found) initialAssign[lvl] = String(found.id);
          });
          if (Object.keys(initialAssign).length === 0) {
            currentHeads.forEach((h, idx) => {
              if (levels[idx]) initialAssign[levels[idx]] = String(h.id);
            });
          }
          setModalHeadAssignments(initialAssign);
          const mainH =
            currentHeads.find(
              (h) => h.isMainSchoolHead || h.is_main_school_head,
            ) || currentHeads[0];
          setModalMainHeadId(mainH ? String(mainH.id) : null);
          setActiveLevelSlot(levels[0]);
        } else if (currentHeads.length === 1) {
          setModalHasMultipleHeads(false);
          const headId = String(currentHeads[0].id);
          const initialAssign = {};
          levels.forEach((lvl) => {
            initialAssign[lvl] = headId;
          });
          setModalHeadAssignments(initialAssign);
          setModalMainHeadId(headId);
          setActiveLevelSlot(null);
        } else {
          setModalHasMultipleHeads(null);
          setModalHeadAssignments({});
          setModalMainHeadId(null);
          setActiveLevelSlot(null);
        }
      }
    }
  }, [isChangeHeadModalOpen, educationalLevels, personnel]);

  const qualifiedHeadCandidates = useMemo(() => {
    return (personnel || []).filter((p) => {
      const pType =
        detectPersonnelTypeFromPosition(
          p.position || p.plantilla_position || p.position_title || "",
        ) ||
        p.type ||
        "";
      const isNonTeaching = pType === "non-teaching";
      if (isNonTeaching) return false;
      if (!headSearchQuery.trim()) return true;
      const name = formatPersonnelName(p).toLowerCase();
      const pos = (p.position || "").toLowerCase();
      const email = (p.depedEmail || "").toLowerCase();
      const q = headSearchQuery.toLowerCase();
      return name.includes(q) || pos.includes(q) || email.includes(q);
    });
  }, [personnel, headSearchQuery]);

  const openSdoHeadModal = () => {
    setSdoHeadForm({
      name: sdoSchoolHead?.name || "",
      email: sdoSchoolHead?.email || "",
      positionTitle: sdoSchoolHead?.positionTitle || "",
    });
    setSdoHeadError("");
    setIsSdoHeadModalOpen(true);
  };

  const submitSdoHead = async (e) => {
    e.preventDefault();
    setIsSavingSdoHead(true);
    setSdoHeadError("");
    try {
      await saveSdoSchoolHead(sdoHeadForm);
      setIsSdoHeadModalOpen(false);
      setHighlightHeadColumn(false);
      setIsHeadRequiredModalOpen(false);
      if (showToast) showToast("SDO school head saved.", "success");
    } catch (err) {
      setSdoHeadError(err.message || "Could not save the SDO school head.");
    } finally {
      setIsSavingSdoHead(false);
    }
  };

  const hasPendingDrafts = Boolean((personnel || []).some((p) => p.isDraft));
  const isDirty = Boolean(
    hasPendingDrafts ||
    newlyAddedPersonnelIds.size > 0 ||
    (savedRosterSnapshotRef.current &&
      JSON.stringify(getRosterSnapshot()) !== savedRosterSnapshotRef.current),
  );

  const newlyAddedList = useMemo(() => {
    return (personnel || []).filter(
      (p) => newlyAddedPersonnelIds.has(p.id) || p.isDraft,
    );
  }, [personnel, newlyAddedPersonnelIds]);

  const runSaveRef = useRef(() => Promise.resolve({ ok: true })); // the page's one save, shared with the unsaved-changes dialog
  useDirtyGuard({
    screenId: "roster",
    isDirty,
    getDirtyReasons: () => {
      const reasons = [];
      if (hasPendingDrafts) {
        reasons.push("There are pending draft personnel.");
      }
      if (newlyAddedPersonnelIds.size > 0) {
        reasons.push(
          `${newlyAddedPersonnelIds.size} newly added personnel not yet committed.`,
        );
      }
      if (
        savedRosterSnapshotRef.current &&
        JSON.stringify(getRosterSnapshot()) !== savedRosterSnapshotRef.current
      ) {
        reasons.push("Roster snapshot differs from saved baseline.");
      }
      return reasons;
    },
    onDiscard: () => {
      // Discard dirty state and synchronize snapshot to clean baseline
      syncCleanRosterSnapshot();
      try {
        const draftKey = `insighted_personnel_roster_${schoolInfo?.schoolId || "default"}`;
        localStorage.removeItem(draftKey);
      } catch (cleanErr) {}
    },
    onSave: () => runSaveRef.current(),
  });

  // Poll eSF7 Harvester Queue status if roster is empty
  useEffect(() => {
    const rawSchoolId = schoolInfo?.schoolId
      ? String(schoolInfo.schoolId).replace(/^SCH-/i, "").trim()
      : "";
    if (!rawSchoolId || personnel.length > 0) return;

    let isMounted = true;
    const checkHarvest = async () => {
      try {
        setIsCheckingHarvest(true);
        const data = await api.getHarvestStatus(rawSchoolId);
        if (!isMounted) return;

        if (data.status && data.status !== "NOT_FOUND") {
          setHarvestStatus(data);
          // If status completed, trigger personnel reload from backend
          if (data.status === "VERIFIED") {
            try {
              const rawRes = await api.getPersonnel(rawSchoolId);
              const pData = Array.isArray(rawRes) ? rawRes : rawRes?.data || [];
              if (Array.isArray(pData) && pData.length > 0 && isMounted) {
                setPersonnel(pData);
                syncCleanRosterSnapshot(pData);
                if (showToast)
                  showToast(
                    "Auto-populated faculty roster from harvested eSF7!",
                    "success",
                  );
              }
            } catch (pErr) {
              console.warn("Personnel reload warning:", pErr);
            }
          }
        }
      } catch (err) {
        console.warn("Harvest check warning:", err.message);
      } finally {
        if (isMounted) setIsCheckingHarvest(false);
      }
    };

    checkHarvest();
    const interval = setInterval(checkHarvest, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [schoolInfo?.schoolId, personnel.length]);

  // Room QR Sidebar Modal State
  const [isRoomQRDrawerOpen, setIsRoomQRDrawerOpen] = useState(false);
  const [isClosingRoomQR, setIsClosingRoomQR] = useState(false);

  const closeRoomQRDrawer = () => {
    setIsClosingRoomQR(true);
    setTimeout(() => {
      setIsRoomQRDrawerOpen(false);
      setIsClosingRoomQR(false);
    }, 280);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isRoomQRDrawerOpen) {
        closeRoomQRDrawer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRoomQRDrawerOpen]);

  // Add Personnel Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({
    salutation: "MR.",
    firstName: "",
    middleName: "",
    lastName: "",
    nameExtension: "",
    birthdate: "",
    depedEmailLocal: "",
    type: "teaching",
    position: POSITION_OPTIONS_BY_CATEGORY.teaching[0],
  });

  const maxBirthdate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 15);
    return d;
  }, []);

  const newPersonAge = getAge(newPerson.birthdate);
  let newPersonAgeStatusText = "No birthdate";
  let newPersonAgeStatusClass = "badge info";
  if (newPersonAge !== null) {
    if (newPersonAge < 15) {
      newPersonAgeStatusText = "Underage (<15 yrs)";
      newPersonAgeStatusClass = "badge warn";
    } else if (newPersonAge > 80) {
      newPersonAgeStatusText = "Questionable age (>80 yrs)";
      newPersonAgeStatusClass = "badge warn";
    } else {
      newPersonAgeStatusText = "Age valid";
      newPersonAgeStatusClass = "badge ok";
    }
  }

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // The one Roster save, used by the header Save button AND the unsaved-changes dialog's Save button.
  // It never opens its own alerts: it returns { ok: true } or { ok: false, title, message }.
  const runRosterSave = async () => {
    // 1. DepEd eSF7 School Head Verification Gate
    const currentHead = findRosterSchoolHead(personnel);
    if (!currentHead && !sdoSchoolHead) {
      return {
        ok: false,
        needsHead: true,
        title: "School Head Required",
        message: "Designate a School Head in the roster before saving.",
      };
    }

    setIsSavingDrafts(true);
    try {
      // 1b. Clean personnel list where draft flags are normalized
      const cleanPersonnel = (personnel || []).map((p) => ({
        ...p,
        isDraft: false,
      }));

      // 2. Commit any pending auto-fill drafts
      const drafts = personnel.filter((p) => p.isDraft);
      if (drafts.length > 0) {
        await commitDraftPersonnel();
      }
      if (typeof setPersonnel === "function") {
        setPersonnel(cleanPersonnel);
      }

      // 2b. Diff against saved baseline: only send rows that actually changed
      const lastSnapshotJson = savedRosterSnapshotRef.current;
      let rowsToSave = cleanPersonnel;
      if (lastSnapshotJson) {
        try {
          const baseline = JSON.parse(lastSnapshotJson);
          const baselineMap = new Map(baseline.map((b) => [String(b.id), b]));
          const changedRows = cleanPersonnel.filter((p) => {
            const b = baselineMap.get(String(p.id));
            if (!b) return true; // new row
            return (
              String(p.position || p.plantilla_position || "").trim() !==
                String(b.position || "").trim() ||
              String(p.firstName || p.first_name || "")
                .trim()
                .toUpperCase() !==
                String(b.firstName || "")
                  .trim()
                  .toUpperCase() ||
              String(p.lastName || p.last_name || "")
                .trim()
                .toUpperCase() !==
                String(b.lastName || "")
                  .trim()
                  .toUpperCase() ||
              String(p.depedEmail || p.email || p.deped_email || "")
                .trim()
                .toLowerCase() !==
                String(b.depedEmail || "")
                  .trim()
                  .toLowerCase() ||
              Boolean(p.isSchoolHead || p.is_school_head) !==
                Boolean(b.isSchoolHead)
            );
          });
          if (changedRows.length === 0) {
            // Nothing changed in roster rows
            syncCleanRosterSnapshot(cleanPersonnel);
            return { ok: true };
          }
          rowsToSave = changedRows;
        } catch (e) {
          rowsToSave = cleanPersonnel;
        }
      }

      // Strip school head fields from bulk upsert rows so designations are never accidentally overwritten
      const payloadRows = rowsToSave.map((p) => {
        const row = { ...p };
        delete row.is_school_head;
        delete row.isSchoolHead;
        delete row.isMainSchoolHead;
        delete row.is_main_sh;
        delete row.schoolHeadLevel;
        delete row.school_head_level;
        return row;
      });

      await api.saveBulkPersonnel(
        payloadRows,
        schoolInfo?.schoolId,
        schoolInfo?.schoolYear,
      );

      // Remove outbox entry right away on verified success
      await removeOutboxEntryByModule({
        schoolId: schoolInfo?.schoolId,
        user: user?.username || user?.email,
        term: activeTerm,
        module: "personnel_roster",
      });

      // Clear local draft caches now that data is safely stored in database
      try {
        const draftKey = `insighted_personnel_roster_${schoolInfo?.schoolId || "default"}`;
        localStorage.removeItem(draftKey);
        if (typeof deleteLocalDraft === "function") {
          await deleteLocalDraft(draftKey);
        }
      } catch (cleanErr) {
        console.warn("[Roster] Error clearing local draft:", cleanErr);
      }

      // 3. Mark completed node without forcing navigation
      if (completeNode) {
        completeNode("roster", null);
      }

      syncCleanRosterSnapshot(cleanPersonnel);

      if (showToast) {
        showToast(
          `Roster saved to database. School Head verified: ${currentHead.firstName} ${currentHead.lastName}`,
          "success",
        );
      }
      return { ok: true };
    } catch (err) {
      console.warn("Save roster error:", err);
      // Upsert failed payload into outbox as offline/pending buffer
      try {
        await upsertOutboxEntry({
          kind: "failed",
          schoolId: schoolInfo?.schoolId,
          user: user?.username || user?.email,
          schoolYear: schoolInfo?.schoolYear || "SY 26-27",
          term: activeTerm,
          module: "personnel_roster",
          endpoint: "/api/personnel/bulk",
          payload: personnel,
          lastError: err?.message || "Failed to save personnel roster",
        });
      } catch (outboxErr) {
        console.warn("[Outbox Failed Save Error]:", outboxErr);
      }

      const isOffline =
        !navigator.onLine ||
        err?.message?.toLowerCase().includes("network") ||
        err?.message?.toLowerCase().includes("failed to fetch") ||
        err?.message?.toLowerCase().includes("timed out");

      if (isOffline) {
        syncCleanRosterSnapshot();
        if (showToast) {
          showToast(
            "Saved offline. Your personnel roster will sync to the database when connection is restored.",
            "info",
          );
        }
        return { ok: true, offline: true };
      }

      return {
        ok: false,
        title: "Roster Not Saved",
        message: "Failed to save roster changes: " + err.message,
      };
    } finally {
      setIsSavingDrafts(false);
    }
  };
  runSaveRef.current = runRosterSave;

  const executeRosterSave = async () => {
    const result = await runRosterSave();
    if (result.ok === false) {
      if (result.needsHead) {
        setIsHeadRequiredModalOpen(true);
        setHighlightHeadColumn(true);
      } else if (showToast) {
        showToast(result.message, "error");
      }
      return false;
    }
    syncCleanRosterSnapshot();
    closeNewPersonnelSidebar();
    return true;
  };

  const handleSave = async () => {
    // 1. DepEd eSF7 School Head Verification Gate
    const currentHead = findRosterSchoolHead(personnel);
    if (!currentHead && !sdoSchoolHead) {
      setIsHeadRequiredModalOpen(true);
      setHighlightHeadColumn(true);
      return;
    }

    // 2. Newly Added Personnel Confirmation & Review Gate
    if (newlyAddedList.length > 0) {
      setIsNewPersonnelSidebarOpen(true);
      return;
    }

    // 3. Direct save if no newly added personnel
    await executeRosterSave();
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newPerson.firstName || !newPerson.lastName) {
      alert("Please fill out First Name and Last Name");
      return;
    }
    if (!newPerson.birthdate) {
      alert("Please select a valid birthdate.");
      return;
    }
    const personAge = getAge(newPerson.birthdate);
    if (personAge !== null && personAge < 15) {
      alert("Personnel must be at least 15 years old.");
      return;
    }

    const isCook =
      String(newPerson.position || "")
        .trim()
        .toUpperCase() === "COOK";

    let addedId = null;
    try {
      addedId = await addPersonnel({
        salutation: newPerson.salutation,
        firstName: newPerson.firstName.toUpperCase().trim(),
        middleName: newPerson.middleName
          ? newPerson.middleName.toUpperCase().trim()
          : "",
        lastName: newPerson.lastName.toUpperCase().trim(),
        nameExtension: newPerson.nameExtension
          ? newPerson.nameExtension.toUpperCase().trim()
          : "",
        birthdate: newPerson.birthdate || "",
        depedEmail: "",
        noDepedEmail: false,
        no_deped_email: false,
        type: newPerson.type,
        position: newPerson.position,
        natureOfAppointment: isCook
          ? "CONTRACTUAL"
          : newPerson.natureOfAppointment || "REGULAR PERMANENT",
        hiringArrangement: isCook
          ? "CONTRACTUAL"
          : newPerson.hiringArrangement || "REGULAR",
        fundSource: isCook ? "SBFP" : newPerson.fundSource || "NATIONAL",
      });
    } catch (addErr) {
      alert("Failed to save personnel: " + (addErr.message || "Unknown error"));
      return;
    }

    if (addedId) {
      // Newly added personnel is already persisted to database via addPersonnel;
      // sync clean snapshot immediately so it is treated as clean and never triggers a full bulk save.
      const currentList = personnel || [];
      const updatedList = currentList.some(
        (p) => String(p.id) === String(addedId),
      )
        ? currentList
        : [
            ...currentList,
            {
              id: addedId,
              firstName: newPerson.firstName,
              lastName: newPerson.lastName,
              position: newPerson.position,
              type: newPerson.type,
              depedEmail: "",
              isSchoolHead: false,
              is_school_head: false,
            },
          ];
      syncCleanRosterSnapshot(updatedList);
    }

    // Close modal & reset form
    setIsModalOpen(false);
    setNewPerson({
      salutation: "MR.",
      firstName: "",
      middleName: "",
      lastName: "",
      nameExtension: "",
      birthdate: "",
      type: "teaching",
      position: POSITION_OPTIONS_BY_CATEGORY.teaching[0],
    });

    try {
      await removeOutboxEntryByModule({
        schoolId: schoolInfo?.schoolId,
        user: user?.username || user?.email,
        term: activeTerm,
        module: "personnel_roster",
      });
    } catch (e) {}

    showToast("Personnel successfully added and saved to database.");
  };

  // Filter & Search Logic
  const filteredPersonnel = useMemo(() => {
    return personnel
      .filter((p) => {
        const pType =
          detectPersonnelTypeFromPosition(
            p.position || p.plantilla_position || p.position_title || "",
          ) ||
          p.type ||
          "teaching";
        const matchesType = typeFilter === "all" || pType === typeFilter;

        const fullName =
          `${p.firstName || ""} ${p.middleName || ""} ${p.lastName || ""} ${p.nameExtension || ""}`.toLowerCase();
        const email = (p.depedEmail || "").toLowerCase();
        const pos = (p.position || "").toLowerCase();
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          fullName.includes(query) ||
          email.includes(query) ||
          pos.includes(query);

        return matchesType && matchesSearch;
      })
      .sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (sortConfig.key === "name" || sortConfig.key === "lastName") {
          aValue =
            `${a.lastName || ""}, ${a.firstName || ""} ${a.middleName || ""}`
              .trim()
              .toLowerCase();
          bValue =
            `${b.lastName || ""}, ${b.firstName || ""} ${b.middleName || ""}`
              .trim()
              .toLowerCase();
        } else if (typeof aValue === "boolean") {
          aValue = aValue ? 1 : 0;
          bValue = bValue ? 1 : 0;
        } else {
          aValue = (aValue || "").toString().toLowerCase();
          bValue = (bValue || "").toString().toLowerCase();
        }
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
  }, [personnel, typeFilter, searchQuery, sortConfig]);

  // Category Counts for Roster Tabs
  const categoryCounts = useMemo(() => {
    const counts = {
      all: personnel.length,
      teaching: 0,
      "teaching-related": 0,
      "non-teaching": 0,
    };
    for (const p of personnel) {
      const pType =
        detectPersonnelTypeFromPosition(
          p.position || p.plantilla_position || p.position_title || "",
        ) ||
        p.type ||
        "teaching";
      if (counts[pType] !== undefined) {
        counts[pType]++;
      }
    }
    return counts;
  }, [personnel]);

  // Pagination Computations
  const totalItems = filteredPersonnel.length;
  const effectivePerPage =
    pageSize === "all" ? (totalItems > 0 ? totalItems : 1) : Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  // Keep currentPage valid when filtering, deleting, or switching page size
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Sliced personnel for current page
  const paginatedPersonnel = useMemo(() => {
    if (pageSize === "all") return filteredPersonnel;
    const sliceStart = (safeCurrentPage - 1) * effectivePerPage;
    return filteredPersonnel.slice(sliceStart, sliceStart + effectivePerPage);
  }, [filteredPersonnel, safeCurrentPage, effectivePerPage, pageSize]);

  const startIndex =
    totalItems === 0 ? 0 : (safeCurrentPage - 1) * effectivePerPage + 1;
  const endIndex =
    pageSize === "all"
      ? totalItems
      : Math.min(safeCurrentPage * effectivePerPage, totalItems);

  // Helper for generating page numbers (up to 3 pages)
  const getPageNumbers = (current, total) => {
    if (total <= 3) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    let start = Math.max(1, current - 1);
    let end = Math.min(total, start + 2);
    if (end - start < 2) {
      start = Math.max(1, end - 2);
    }
    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  // If a new personnel was recently added, jump to the page that contains them
  useEffect(() => {
    if (
      newlyAddedPersonnelIds &&
      newlyAddedPersonnelIds.size > 0 &&
      pageSize !== "all"
    ) {
      const latestId = Array.from(newlyAddedPersonnelIds).pop();
      const index = filteredPersonnel.findIndex(
        (p) => String(p.id) === String(latestId),
      );
      if (index !== -1) {
        const targetPage = Math.floor(index / effectivePerPage) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
      }
    }
  }, [newlyAddedPersonnelIds, filteredPersonnel, effectivePerPage, pageSize]);

  return (
    <section id="roster" className="view grid">
      <style>{`
        @keyframes headColumnPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
            border-color: #ef4444;
          }
          50% {
            box-shadow: 0 0 16px 4px rgba(239, 68, 68, 0.7);
            border-color: #dc2626;
          }
        }
        .school-head-highlight-cell {
          animation: headColumnPulse 1.8s infinite ease-in-out !important;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.6) !important;
        }
        @keyframes slideInFromRight {
          from {
            transform: translate3d(100%, 0, 0);
            opacity: 0.4;
          }
          to {
            transform: translate3d(0, 0, 0);
            opacity: 1;
          }
        }
        @keyframes slideOutToRight {
          from {
            transform: translate3d(0, 0, 0);
            opacity: 1;
          }
          to {
            transform: translate3d(100%, 0, 0);
            opacity: 0.4;
          }
        }
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOutBackdrop {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes modalSlideIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <PortalHeader
        title="Personnel Roster & Profile Directory"
        description="Master roster of all registered school personnel, position items, and status tracking."
        onBack={() => setActiveView("nodemap")}
        showNodeMap={true}
        onContinue={handleSave}
        continueText="Save"
        continueDisabled={!isDirty || isSavingDrafts}
      />
      <article className="card">
        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <h2>Personnel Roster</h2>
              <p className="subtext">
                View and manage all school staff members.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn secondary"
                type="button"
                onClick={() => setIsRoomQRDrawerOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--blue-50, #eff6ff)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "white";
                }}
                title="Open Room QR Portal for teacher passcode identity & mobile self-profiling"
              >
                <FiMaximize size={15} /> <span>Room QR Portal</span>
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setIsModalOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <FiPlus size={15} /> <span>Add Personnel</span>
              </button>
            </div>
          </div>

          {(() => {
            const drafts = personnel.filter((p) => p.isDraft);
            if (drafts.length === 0) return null;
            return (
              <div
                style={{
                  background: "#FEF3C7",
                  border: "1.5px solid #FCD34D",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "15px",
                  marginTop: "15px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "15px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1 }}>
                  <h4
                    style={{
                      color: "#92400E",
                      margin: 0,
                      fontSize: "14px",
                      fontWeight: "bold",
                    }}
                  >
                    Unsaved Auto-Fill Records Detected
                  </h4>
                  <p
                    style={{
                      color: "#B45309",
                      margin: "4px 0 0 0",
                      fontSize: "13px",
                    }}
                  >
                    {drafts.length} teacher profile(s) were auto-filled from the
                    master database as drafts. Click{" "}
                    <strong>Save Changes</strong> to commit them to the
                    database.
                  </p>
                </div>
                <button
                  className="btn"
                  type="button"
                  disabled={isSavingDrafts}
                  onClick={async () => {
                    setIsSavingDrafts(true);
                    await commitDraftPersonnel();
                    setIsSavingDrafts(false);
                  }}
                  style={{ background: "#D97706", color: "white", border: 0 }}
                >
                  {isSavingDrafts ? "Saving..." : "Save Changes"}
                </button>
              </div>
            );
          })()}

          {/* Institutional School Head Summary & Designation Card */}
          {currentHead || sdoSchoolHead ? (
            <div
              style={{
                background: "linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%)",
                border: "1.5px solid #bbf7d0",
                borderRadius: "14px",
                padding: "14px 18px",
                margin: "12px 0 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.06)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "14px" }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "#059669",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 3px 8px rgba(5, 150, 105, 0.25)",
                    flexShrink: 0,
                  }}
                >
                  <FiUserCheck size={22} />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "800",
                        color: "#065f46",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {allRosterHeads.length > 1
                        ? `Designated School Heads (${allRosterHeads.length} Educational Levels)`
                        : "Designated School Head"}
                    </span>
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#15803d",
                        border: "1px solid #86efac",
                        borderRadius: "999px",
                        padding: "1px 8px",
                        fontSize: "10px",
                        fontWeight: "700",
                      }}
                    >
                      {allRosterHeads.length > 1
                        ? "Multi-Level Head Governance"
                        : currentHead
                          ? "eSF7 Signatory"
                          : "SDO-Assigned OIC"}
                    </span>
                  </div>

                  {allRosterHeads.length > 1 ? (
                    <div
                      style={{
                        marginTop: "6px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {allRosterHeads.map((h, idx) => {
                        const isMain =
                          h.isMainSchoolHead ||
                          h.is_main_school_head ||
                          String(h.id) === String(currentHead?.id);

                        // Resolve educational level title accurately
                        let headLevel =
                          h.schoolHeadLevel || h.school_head_level || null;

                        if (
                          !headLevel &&
                          schoolInfo?.schoolHeadConfig?.assignments
                        ) {
                          const match = Object.entries(
                            schoolInfo.schoolHeadConfig.assignments,
                          ).find(
                            ([lvl, pId]) =>
                              String(pId) === String(h.id) ||
                              (h.prn && String(pId) === String(h.prn)) ||
                              (h.legacy_id &&
                                String(pId) === String(h.legacy_id)),
                          );
                          if (match) headLevel = match[0];
                        }

                        if (
                          !headLevel &&
                          Array.isArray(educationalLevels) &&
                          educationalLevels[idx]
                        ) {
                          headLevel = educationalLevels[idx];
                        }

                        const levelTitle = headLevel
                          ? /head$/i.test(headLevel.trim())
                            ? headLevel.trim()
                            : `${headLevel.trim()} Head`
                          : "School Head";

                        return (
                          <div
                            key={h.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              fontSize: "13px",
                              flexWrap: "wrap",
                            }}
                          >
                            {/* ONLY the Main School Head has the badge */}
                            {isMain && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  border: "1px solid #fcd34d",
                                  borderRadius: "6px",
                                  padding: "1px 6px",
                                  fontSize: "10px",
                                  fontWeight: "800",
                                  textTransform: "uppercase",
                                }}
                              >
                                ★ Main Head
                              </span>
                            )}
                            <strong style={{ color: "#0f172a" }}>
                              {formatPersonnelName(h)}
                            </strong>
                            <span
                              style={{
                                fontSize: "12px",
                                color: isMain ? "#b45309" : "#475569",
                                fontWeight: "700",
                              }}
                            >
                              • {levelTitle}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <h3
                        style={{
                          margin: "2px 0 0",
                          fontSize: "16px",
                          fontWeight: "800",
                          color: "#0f172a",
                        }}
                      >
                        {currentHead
                          ? formatPersonnelName(currentHead)
                          : sdoSchoolHead?.name}
                      </h3>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#475569",
                          marginTop: "3px",
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          <strong style={{ color: "#334155" }}>Item:</strong>{" "}
                          {currentHead?.position ||
                            sdoSchoolHead?.positionTitle ||
                            "School Head / Principal"}
                        </span>
                        {(currentHead?.depedEmail || sdoSchoolHead?.email) && (
                          <span>
                            <strong style={{ color: "#334155" }}>Email:</strong>{" "}
                            {currentHead?.depedEmail || sdoSchoolHead?.email}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setIsChangeHeadModalOpen(true)}
                  style={{
                    background: "#ffffff",
                    border: "1.5px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "7px 14px",
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#0f172a",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  title="Change who is designated as School Head"
                >
                  <FiRefreshCw size={13} />{" "}
                  {allRosterHeads.length > 1
                    ? "Change School Heads"
                    : "Change School Head"}
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)",
                border: "1.5px solid #fecaca",
                borderRadius: "14px",
                padding: "14px 18px",
                margin: "12px 0 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
                boxShadow: "0 2px 10px rgba(220, 38, 38, 0.08)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "14px" }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "#dc2626",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 3px 8px rgba(220, 38, 38, 0.25)",
                    flexShrink: 0,
                  }}
                >
                  <FiAlertCircle size={22} />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "800",
                        color: "#991b1b",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Institutional Compliance
                    </span>
                    <span
                      style={{
                        background: "#fee2e2",
                        color: "#b91c1c",
                        border: "1px solid #fca5a5",
                        borderRadius: "999px",
                        padding: "1px 8px",
                        fontSize: "10px",
                        fontWeight: "700",
                      }}
                    >
                      Required for eSF7
                    </span>
                  </div>
                  <h4
                    style={{
                      margin: "2px 0 0",
                      fontSize: "15px",
                      fontWeight: "800",
                      color: "#991b1b",
                    }}
                  >
                    No School Head Currently Designated
                  </h4>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: "12px",
                      color: "#b91c1c",
                    }}
                  >
                    DepEd guidelines require an official School Head (Principal,
                    TIC, or Head Teacher) before saving.
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsChangeHeadModalOpen(true)}
                  style={{
                    background:
                      "linear-gradient(135deg, #059669 0%, #047857 100%)",
                    color: "white",
                    border: 0,
                    borderRadius: "8px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)",
                  }}
                >
                  <FiUserCheck size={15} /> Select School Head
                </button>
              </div>
            </div>
          )}

          <div
            className="tabs"
            style={{
              margin: "12px 0",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {["all", "teaching", "teaching-related", "non-teaching"].map(
              (type) => (
                <button
                  key={type}
                  className={`tab ${typeFilter === type ? "active" : ""}`}
                  onClick={() => {
                    setTypeFilter(type);
                    setCurrentPage(1);
                  }}
                  type="button"
                >
                  {type === "teaching-related"
                    ? "Teaching-Related"
                    : type === "non-teaching"
                      ? "Non-Teaching"
                      : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ),
            )}

            {/* Small badge beside Non-Teaching showing Total of active tab */}
            {(() => {
              const activeCategoryTotal =
                categoryCounts[typeFilter] ?? personnel.length;
              const activeCategoryLabel =
                typeFilter === "teaching"
                  ? "Teaching"
                  : typeFilter === "teaching-related"
                    ? "Teaching-Related"
                    : typeFilter === "non-teaching"
                      ? "Non-Teaching"
                      : "Personnel";
              const isSearchFiltered =
                Boolean(searchQuery.trim()) &&
                filteredPersonnel.length !== activeCategoryTotal;

              return (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    background: "#EFF6FF",
                    color: "#1E40AF",
                    border: "1.5px solid #BFDBFE",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "700",
                    marginLeft: "4px",
                    userSelect: "none",
                    boxShadow: "0 1px 3px rgba(37, 99, 235, 0.08)",
                    cursor: isSearchFiltered ? "pointer" : "default",
                    transition: "all 0.15s ease",
                  }}
                  title={
                    isSearchFiltered
                      ? `Click to clear search query and show all ${activeCategoryTotal} ${activeCategoryLabel.toLowerCase()}`
                      : `Total registered ${activeCategoryLabel.toLowerCase()} in roster`
                  }
                  onClick={() => {
                    if (isSearchFiltered) {
                      setSearchQuery("");
                      setCurrentPage(1);
                    }
                  }}
                >
                  <FiUser size={13} style={{ color: "#2563EB" }} />
                  <span>
                    Total {activeCategoryLabel}:{" "}
                    <strong style={{ color: "#1E3A8A", fontWeight: "800" }}>
                      {activeCategoryTotal}
                    </strong>
                    {isSearchFiltered && (
                      <span
                        style={{
                          color: "#3B82F6",
                          fontWeight: "600",
                          fontSize: "11px",
                          marginLeft: "5px",
                        }}
                      >
                        ({filteredPersonnel.length} shown)
                      </span>
                    )}
                  </span>
                </span>
              );
            })()}
          </div>

          <div className="roster-search-row">
            <label>Search roster</label>
            <input
              placeholder="Search name, DepEd email, category, or plantilla position…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Empty State Hero Card when no faculty records exist */}
          {personnel.length === 0 ? (
            <div
              style={{
                margin: "24px 0",
                padding: "40px 24px",
                backgroundColor: "#F8FAFC",
                borderRadius: "16px",
                border: "2px dashed #CBD5E1",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: "#EFF6FF",
                  color: "#2563EB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                  boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.1)",
                }}
              >
                <FiUser size={32} />
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "800",
                  color: "#0F172A",
                  margin: "0 0 8px",
                }}
              >
                No Faculty Records Found for Your Station
              </h3>
              <p
                style={{
                  maxWidth: "580px",
                  color: "#64748B",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  margin: "0 0 20px",
                }}
              >
                No faculty records were detected for this school station. Click{" "}
                <strong>+ Add Personnel</strong> to encode your faculty
                profiles, plantilla positions, and item numbers.
              </p>

              {/* Ingestion Status Badge */}
              {harvestStatus &&
                (harvestStatus.status === "QUEUED" ||
                  harvestStatus.status === "HARVESTING") && (
                  <div
                    style={{
                      marginBottom: "20px",
                      padding: "10px 18px",
                      background: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      borderRadius: "10px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#1D4ED8",
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    <FiRefreshCw className="spin" size={15} />
                    <span>
                      {harvestStatus.status === "QUEUED"
                        ? "eSF7 spreadsheet queued for background ingestion..."
                        : "VM Harvester actively extracting personnel plantillas..."}
                    </span>
                  </div>
                )}

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: "10px 20px",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)",
                  }}
                  onClick={() => setIsModalOpen(true)}
                >
                  <FiPlus size={16} /> Add Personnel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <button
                          className="roster-sort-button"
                          type="button"
                          onClick={() => handleSort("name")}
                        >
                          Personnel Name
                        </button>
                      </th>
                      <th>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <button
                            className="roster-sort-button"
                            type="button"
                            onClick={() => handleSort("depedEmail")}
                          >
                            DepEd Email
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsEmailInfoOpen(true);
                            }}
                            title="DepEd Email Policy & Validation Notice"
                            style={{
                              background: "#E0F2FE",
                              color: "#0284C7",
                              border: "1px solid #BAE6FD",
                              borderRadius: "50%",
                              width: "18px",
                              height: "18px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "11px",
                              fontWeight: "800",
                              cursor: "pointer",
                              lineHeight: 1,
                              padding: 0,
                            }}
                          >
                            i
                          </button>
                        </div>
                      </th>
                      <th>
                        <button
                          className="roster-sort-button"
                          type="button"
                          onClick={() => handleSort("type")}
                        >
                          Position Category
                        </button>
                      </th>
                      <th>
                        <button
                          className="roster-sort-button"
                          type="button"
                          onClick={() => handleSort("position")}
                        >
                          Plantilla Position
                        </button>
                      </th>
                      <th style={{ width: "90px", textAlign: "center" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPersonnel.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: "48px 16px",
                            color: "#64748B",
                            fontSize: "13px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <div
                              style={{
                                width: "44px",
                                height: "44px",
                                borderRadius: "50%",
                                background: "#F1F5F9",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#64748B",
                              }}
                            >
                              <FiSearch size={22} />
                            </div>
                            <span style={{ fontWeight: 600, color: "#334155" }}>
                              No personnel match your search or filter criteria.
                            </span>
                            {(searchQuery || typeFilter !== "all") && (
                              <button
                                type="button"
                                className="btn secondary"
                                style={{
                                  marginTop: "4px",
                                  padding: "6px 14px",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                }}
                                onClick={() => {
                                  setSearchQuery("");
                                  setTypeFilter("all");
                                  setCurrentPage(1);
                                }}
                              >
                                Reset Search & Filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedPersonnel.map((p) => {
                        const isHead = Boolean(
                          p.isSchoolHead === true || p.is_school_head === true,
                        );
                        const isGulping = gulpDeleteState?.id === p.id;
                        const gulpStage = isGulping
                          ? gulpDeleteState.stage
                          : null;
                        return (
                          <tr
                            key={p.id}
                            className={`roster-row ${gulpStage === "collapsing" ? "roster-row-gulp-collapsing" : ""}`}
                            style={{
                              ...(isHead
                                ? { background: "rgba(240, 253, 244, 0.75)" }
                                : undefined),
                              ...(isGulping
                                ? { background: "rgba(254, 242, 242, 0.65)" }
                                : undefined),
                              position: "relative",
                            }}
                          >
                            <td>
                              {isGulping ? (
                                <GulpFlyingText
                                  text={formatPersonnelName(p)}
                                  targetVector={gulpDeleteState.vectors?.name}
                                  onComplete={() => handleGulpComplete(p.id)}
                                />
                              ) : (
                                <span
                                  ref={(el) => (nameRefs.current[p.id] = el)}
                                  onClick={() => {
                                    setActivePersonnelId(p.id);
                                    setActiveView("profile");
                                  }}
                                  style={{
                                    fontWeight: 600,
                                    color: "#0f172a",
                                    cursor: "pointer",
                                    transition: "color 0.15s ease",
                                  }}
                                  title="Click to view Personnel Profile"
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.color = "#0284c7")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.color = "#0f172a")
                                  }
                                >
                                  {formatPersonnelName(p)}
                                </span>
                              )}
                              {!isGulping &&
                                isHead &&
                                (allRosterHeads.length <= 1 ||
                                  p.isMainSchoolHead ||
                                  p.is_main_school_head ||
                                  String(p.id) === String(currentHead?.id)) && (
                                  <span
                                    style={{
                                      marginLeft: "8px",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      padding: "2px 8px",
                                      background: "#fef3c7",
                                      color: "#92400e",
                                      border: "1px solid #fcd34d",
                                      borderRadius: "6px",
                                      fontSize: "10px",
                                      fontWeight: "800",
                                      textTransform: "uppercase",
                                      verticalAlign: "middle",
                                    }}
                                    title="Main School Head / DepEd eSF7 Signatory"
                                  >
                                    <FiUserCheck size={11} /> Main School Head
                                  </span>
                                )}
                              {p.isDraft && (
                                <span
                                  style={{
                                    marginLeft: "6px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "2px 6px",
                                    background: "#FEF3C7",
                                    color: "#D97706",
                                    border: "1px solid #FCD34D",
                                    borderRadius: "6px",
                                    fontSize: "10px",
                                    fontWeight: "bold",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Draft
                                </span>
                              )}
                              {(() => {
                                const isRejected = (() => {
                                  if (
                                    p.reassignmentStatus === "rejected" ||
                                    p.requestStatus === "rejected"
                                  )
                                    return true;
                                  const depStatus = String(
                                    p.deploymentStatus ||
                                      p.deployment_status ||
                                      "",
                                  ).toUpperCase();
                                  if (depStatus.includes("REJECTED"))
                                    return true;

                                  const pId = String(p.id || "")
                                    .replace(/^(PER-|PRN-)/i, "")
                                    .trim();
                                  const prn = String(
                                    p.prn || p.profilingCode || "",
                                  )
                                    .replace(/^PRN-/i, "")
                                    .trim();
                                  const pFn = String(
                                    p.firstName || p.first_name || "",
                                  )
                                    .trim()
                                    .toUpperCase();
                                  const pLn = String(
                                    p.lastName || p.last_name || "",
                                  )
                                    .trim()
                                    .toUpperCase();

                                  const allReqs = [
                                    ...(outgoingRequests || []),
                                    ...(requestHistory || []),
                                  ];
                                  const matched = allReqs.find((req) => {
                                    const reqPId = String(
                                      req.personnel_id || req.personnelId || "",
                                    )
                                      .replace(/^(PER-|PRN-)/i, "")
                                      .trim();
                                    if (
                                      pId &&
                                      reqPId &&
                                      (pId === reqPId ||
                                        reqPId.endsWith(pId) ||
                                        pId.endsWith(reqPId))
                                    )
                                      return true;
                                    if (
                                      prn &&
                                      reqPId &&
                                      (prn === reqPId ||
                                        reqPId.endsWith(prn) ||
                                        prn.endsWith(reqPId))
                                    )
                                      return true;
                                    const reqName = String(
                                      req.personnel_name ||
                                        req.personnelName ||
                                        "",
                                    ).toUpperCase();
                                    if (
                                      pLn &&
                                      pFn &&
                                      reqName &&
                                      reqName.includes(pLn) &&
                                      reqName.includes(pFn)
                                    )
                                      return true;
                                    return false;
                                  });

                                  return matched
                                    ? String(
                                        matched.status || "",
                                      ).toLowerCase() === "rejected"
                                    : false;
                                })();

                                if (isRejected) {
                                  return (
                                    <span
                                      style={{
                                        marginLeft: "6px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "2px 8px",
                                        background: "#FEE2E2",
                                        color: "#DC2626",
                                        border: "1px solid #F87171",
                                        borderRadius: "6px",
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        textTransform: "uppercase",
                                      }}
                                      title="Inter-School Reassignment Request Rejected by Target School"
                                    >
                                      <FiAlertCircle
                                        size={10}
                                        style={{ marginRight: "3px" }}
                                      />{" "}
                                      REJECTED
                                    </span>
                                  );
                                }

                                if (
                                  p.isShared ||
                                  String(
                                    p.deploymentStatus ||
                                      p.deployment_status ||
                                      "",
                                  )
                                    .toUpperCase()
                                    .includes("BORROWED")
                                ) {
                                  return (
                                    <span
                                      style={{
                                        marginLeft: "6px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "2px 6px",
                                        background: String(
                                          p.deploymentStatus ||
                                            p.deployment_status ||
                                            "",
                                        )
                                          .toUpperCase()
                                          .includes("BORROWED")
                                          ? "#FEF3C7"
                                          : "#e0e7ff",
                                        color: String(
                                          p.deploymentStatus ||
                                            p.deployment_status ||
                                            "",
                                        )
                                          .toUpperCase()
                                          .includes("BORROWED")
                                          ? "#92400E"
                                          : "#3730a3",
                                        border: String(
                                          p.deploymentStatus ||
                                            p.deployment_status ||
                                            "",
                                        )
                                          .toUpperCase()
                                          .includes("BORROWED")
                                          ? "1px solid #FCD34D"
                                          : "1px solid #c7d2fe",
                                        borderRadius: "6px",
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        textTransform: "uppercase",
                                      }}
                                      title={
                                        String(
                                          p.deploymentStatus ||
                                            p.deployment_status ||
                                            "",
                                        )
                                          .toUpperCase()
                                          .includes("BORROWED")
                                          ? "Borrowed from Mother School"
                                          : "Shared Personnel"
                                      }
                                    >
                                      {String(
                                        p.deploymentStatus ||
                                          p.deployment_status ||
                                          "",
                                      )
                                        .toUpperCase()
                                        .includes("BORROWED") ? (
                                        <>
                                          <FiTag
                                            size={10}
                                            style={{ marginRight: "3px" }}
                                          />{" "}
                                          BORROWED
                                        </>
                                      ) : (
                                        <>
                                          <FiLink
                                            size={10}
                                            style={{ marginRight: "3px" }}
                                          />{" "}
                                          SHARED
                                        </>
                                      )}
                                    </span>
                                  );
                                }

                                return null;
                              })()}
                            </td>
                            <td>
                              {isGulping && p.depedEmail ? (
                                <GulpFlyingItem
                                  targetVector={gulpDeleteState.vectors?.email}
                                  delayMs={70}
                                >
                                  <span
                                    style={{
                                      color: "#0F172A",
                                      fontWeight: 500,
                                      fontSize: "13px",
                                    }}
                                  >
                                    {p.depedEmail}
                                  </span>
                                </GulpFlyingItem>
                              ) : (
                                <span
                                  ref={(el) => (emailRefs.current[p.id] = el)}
                                >
                                  {p.depedEmail}
                                </span>
                              )}
                            </td>
                            <td>
                              {(() => {
                                const isCanon = isCanonicalPosition(p.position);
                                if (!isCanon) {
                                  return (
                                    <span
                                      style={{
                                        color: "#94a3b8",
                                        fontStyle: "italic",
                                        fontSize: "12px",
                                      }}
                                    >
                                      —
                                    </span>
                                  );
                                }
                                const pType =
                                  getCategoryForCanonicalPosition(p.position) ||
                                  detectPersonnelTypeFromPosition(
                                    p.position || "",
                                  ) ||
                                  p.type ||
                                  "teaching";
                                const label =
                                  pType === "teaching"
                                    ? "Teaching"
                                    : pType === "teaching-related"
                                      ? "Related"
                                      : "Non-Teaching";
                                return isGulping ? (
                                  <GulpFlyingItem
                                    targetVector={
                                      gulpDeleteState.vectors?.category
                                    }
                                    delayMs={35}
                                  >
                                    <span
                                      className={`category-badge category-${pType}`}
                                    >
                                      {label}
                                    </span>
                                  </GulpFlyingItem>
                                ) : (
                                  <span
                                    ref={(el) =>
                                      (categoryRefs.current[p.id] = el)
                                    }
                                    className={`category-badge category-${pType}`}
                                  >
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td>
                              {isCanonicalPosition(p.position) ? (
                                isGulping ? (
                                  <GulpFlyingItem
                                    targetVector={
                                      gulpDeleteState.vectors?.position
                                    }
                                    delayMs={10}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 600,
                                        color: "#0F172A",
                                        fontSize: "13px",
                                      }}
                                    >
                                      {p.position}
                                    </span>
                                  </GulpFlyingItem>
                                ) : (
                                  <span
                                    ref={(el) =>
                                      (positionRefs.current[p.id] = el)
                                    }
                                  >
                                    {p.position}
                                  </span>
                                )
                              ) : (
                                <span
                                  style={{
                                    color: "#94a3b8",
                                    fontStyle: "italic",
                                    fontSize: "12px",
                                  }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "5px",
                                  justifyContent: "center",
                                }}
                              >
                                {p.isDraft && !isGulping && (
                                  <button
                                    className="btn"
                                    style={{
                                      minHeight: "34px",
                                      padding: "6px 12px",
                                      fontSize: "12px",
                                      background: "#D97706",
                                      color: "white",
                                      border: 0,
                                    }}
                                    onClick={async () => {
                                      await commitDraftPersonnel(p.id);
                                    }}
                                  >
                                    Save
                                  </button>
                                )}
                                <button
                                  ref={(el) => (trashRefs.current[p.id] = el)}
                                  className="btn danger"
                                  disabled={Boolean(gulpDeleteState)}
                                  style={{
                                    minHeight: "34px",
                                    padding: "6px 10px",
                                    fontSize: "12px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: isGulping
                                      ? "#B91C1C"
                                      : undefined,
                                    borderColor: isGulping
                                      ? "#991B1B"
                                      : undefined,
                                    boxShadow: isGulping
                                      ? "0 0 14px rgba(220, 38, 38, 0.45)"
                                      : undefined,
                                    transform:
                                      isGulping && gulpStage === "eating"
                                        ? "scale(1.08)"
                                        : undefined,
                                    transition:
                                      "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                  }}
                                  title="Delete Personnel"
                                  onClick={() => handleGulpDelete(p)}
                                >
                                  <GulpTrashIcon
                                    isOpen={isGulping && gulpStage === "eating"}
                                    isEating={
                                      isGulping && gulpStage === "eating"
                                    }
                                    isChomped={
                                      isGulping &&
                                      (gulpStage === "chomped" ||
                                        gulpStage === "collapsing")
                                    }
                                    size={14}
                                    color="white"
                                  />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <GulpGlobalStyles />
              </div>

              {/* Pagination Controls */}
              {totalItems > 0 && (
                <div
                  className="roster-pagination"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginTop: "16px",
                    padding: "12px 16px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: "10px",
                    fontSize: "12px",
                    color: "#64748B",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  {/* Left side: Range Info & Page Size Selector */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "nowrap",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ whiteSpace: "nowrap" }}>
                      Showing{" "}
                      <strong style={{ color: "#0F172A", fontWeight: "700" }}>
                        {startIndex}–{endIndex}
                      </strong>{" "}
                      of{" "}
                      <strong style={{ color: "#0F172A", fontWeight: "700" }}>
                        {totalItems}
                      </strong>{" "}
                      personnel
                      {totalItems !== personnel.length && (
                        <span style={{ color: "#94A3B8", marginLeft: "4px" }}>
                          (filtered from {personnel.length})
                        </span>
                      )}
                    </span>

                    <span style={{ color: "#CBD5E1", userSelect: "none" }}>
                      |
                    </span>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      <label
                        htmlFor="roster-page-size"
                        style={{
                          margin: 0,
                          color: "#64748B",
                          fontWeight: "500",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Per page:
                      </label>
                      <select
                        id="roster-page-size"
                        value={pageSize}
                        onChange={(e) => {
                          const val =
                            e.target.value === "all"
                              ? "all"
                              : Number(e.target.value);
                          setPageSize(val);
                          setCurrentPage(1);
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid #CBD5E1",
                          fontSize: "12px",
                          fontWeight: "700",
                          background: "white",
                          color: "#0F172A",
                          cursor: "pointer",
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value="all">All</option>
                      </select>
                    </div>
                  </div>

                  {/* Right side: Page Navigation Buttons */}
                  {totalPages > 1 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {/* First Page */}
                      <button
                        type="button"
                        disabled={safeCurrentPage <= 1}
                        onClick={() => setCurrentPage(1)}
                        title="First Page"
                        style={{
                          minWidth: "32px",
                          height: "32px",
                          padding: "0 6px",
                          borderRadius: "6px",
                          border: "1px solid #CBD5E1",
                          background:
                            safeCurrentPage <= 1 ? "#F8FAFC" : "white",
                          color: safeCurrentPage <= 1 ? "#94A3B8" : "#0F172A",
                          fontWeight: "700",
                          cursor:
                            safeCurrentPage <= 1 ? "not-allowed" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <FiChevronsLeft size={14} />
                      </button>

                      {/* Previous Page */}
                      <button
                        type="button"
                        disabled={safeCurrentPage <= 1}
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        title="Previous Page"
                        style={{
                          minWidth: "32px",
                          height: "32px",
                          padding: "0 10px",
                          borderRadius: "6px",
                          border: "1px solid #CBD5E1",
                          background:
                            safeCurrentPage <= 1 ? "#F8FAFC" : "white",
                          color: safeCurrentPage <= 1 ? "#94A3B8" : "#0F172A",
                          fontWeight: "700",
                          cursor:
                            safeCurrentPage <= 1 ? "not-allowed" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "12px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <FiChevronLeft size={13} />
                        <span>Prev</span>
                      </button>

                      {/* Numeric Pages with smart ellipsis */}
                      {getPageNumbers(safeCurrentPage, totalPages).map(
                        (pageNum, idx) => {
                          if (pageNum === "...") {
                            return (
                              <span
                                key={`ellipsis-${idx}`}
                                style={{
                                  minWidth: "24px",
                                  textAlign: "center",
                                  color: "#94A3B8",
                                  fontWeight: "700",
                                  fontSize: "12px",
                                  userSelect: "none",
                                }}
                              >
                                …
                              </span>
                            );
                          }

                          const isActive = pageNum === safeCurrentPage;
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setCurrentPage(pageNum)}
                              style={{
                                minWidth: "32px",
                                height: "32px",
                                padding: "0 8px",
                                borderRadius: "6px",
                                border: isActive
                                  ? "1.5px solid #2563EB"
                                  : "1px solid #CBD5E1",
                                background: isActive ? "#EFF6FF" : "white",
                                color: isActive ? "#1D4ED8" : "#334155",
                                fontWeight: isActive ? "800" : "600",
                                fontSize: "12px",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                boxShadow: isActive
                                  ? "0 1px 3px rgba(37, 99, 235, 0.15)"
                                  : "none",
                              }}
                            >
                              {pageNum}
                            </button>
                          );
                        },
                      )}

                      {/* Next Page */}
                      <button
                        type="button"
                        disabled={safeCurrentPage >= totalPages}
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        title="Next Page"
                        style={{
                          minWidth: "32px",
                          height: "32px",
                          padding: "0 10px",
                          borderRadius: "6px",
                          border: "1px solid #CBD5E1",
                          background:
                            safeCurrentPage >= totalPages ? "#F8FAFC" : "white",
                          color:
                            safeCurrentPage >= totalPages
                              ? "#94A3B8"
                              : "#0F172A",
                          fontWeight: "700",
                          cursor:
                            safeCurrentPage >= totalPages
                              ? "not-allowed"
                              : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "12px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>Next</span>
                        <FiChevronRight size={13} />
                      </button>

                      {/* Last Page */}
                      <button
                        type="button"
                        disabled={safeCurrentPage >= totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        title="Last Page"
                        style={{
                          minWidth: "32px",
                          height: "32px",
                          padding: "0 6px",
                          borderRadius: "6px",
                          border: "1px solid #CBD5E1",
                          background:
                            safeCurrentPage >= totalPages ? "#F8FAFC" : "white",
                          color:
                            safeCurrentPage >= totalPages
                              ? "#94A3B8"
                              : "#0F172A",
                          fontWeight: "700",
                          cursor:
                            safeCurrentPage >= totalPages
                              ? "not-allowed"
                              : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <FiChevronsRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </article>

      {/* Add Personnel Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Add Personnel</h2>
                <p className="subtext">
                  Encode the minimum roster information first. Additional
                  profile details can be completed later.
                </p>
              </div>
              <button
                className="btn secondary modal-close"
                onClick={() => setIsModalOpen(false)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FiX size={16} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="modal-body">
              <div className="form-grid">
                <div>
                  <label>First Name</label>
                  <input
                    placeholder="First name"
                    value={newPerson.firstName}
                    onChange={(e) =>
                      setNewPerson({
                        ...newPerson,
                        firstName: e.target.value.toUpperCase(),
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label>Middle Name (Optional)</label>
                  <input
                    placeholder="Middle name"
                    value={newPerson.middleName}
                    onChange={(e) =>
                      setNewPerson({
                        ...newPerson,
                        middleName: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
                <div>
                  <label>Last Name</label>
                  <input
                    placeholder="Last name"
                    value={newPerson.lastName}
                    onChange={(e) =>
                      setNewPerson({
                        ...newPerson,
                        lastName: e.target.value.toUpperCase(),
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label>Extension Name (Optional)</label>
                  <input
                    placeholder="e.g. JR., SR., III"
                    maxLength={5}
                    value={newPerson.nameExtension}
                    onChange={(e) =>
                      setNewPerson({
                        ...newPerson,
                        nameExtension: e.target.value.toUpperCase().slice(0, 5),
                      })
                    }
                  />
                </div>
                <div
                  style={{
                    gridColumn: "span 2",
                    display: "grid",
                    gridTemplateColumns: "1.6fr 1fr 1.2fr",
                    gap: "14px",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontWeight: "700",
                        fontSize: "12px",
                        color: "var(--navy)",
                      }}
                    >
                      Birthdate <span style={{ color: "#DC2626" }}>*</span>
                    </label>
                    <DatePickerDropdowns
                      value={newPerson.birthdate || ""}
                      onChange={(val) =>
                        setNewPerson({ ...newPerson, birthdate: val })
                      }
                      maxDate={maxBirthdate}
                      required
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontWeight: "700",
                        fontSize: "12px",
                        color: "var(--navy)",
                      }}
                    >
                      Computed Age
                    </label>
                    <input
                      value={
                        newPersonAge === null ? "—" : `${newPersonAge} yrs`
                      }
                      disabled
                      style={{
                        background: "#f1f5f9",
                        color: "#334155",
                        fontWeight: "700",
                        cursor: "not-allowed",
                        width: "100%",
                        minHeight: "44px",
                        borderRadius: "12px",
                        border: "1.5px solid var(--line, #cbd5e1)",
                        padding: "0 14px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontWeight: "700",
                        fontSize: "12px",
                        color: "var(--navy)",
                      }}
                    >
                      Age Validation
                    </label>
                    <div
                      style={{
                        minHeight: "44px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span
                        className={newPersonAgeStatusClass}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: "800",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {newPersonAgeStatusText}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <div>
                    <label>Position Category</label>
                    <select
                      value={newPerson.type}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setNewPerson({
                          ...newPerson,
                          type: newType,
                          position: POSITION_OPTIONS_BY_CATEGORY[newType][0],
                        });
                      }}
                    >
                      <option value="teaching">TEACHING PERSONNEL</option>
                      <option value="teaching-related">
                        RELATED TEACHING PERSONNEL
                      </option>
                      <option value="non-teaching">
                        NON-TEACHING PERSONNEL
                      </option>
                    </select>
                  </div>

                  <div>
                    <label>Plantilla Position</label>
                    <SearchableDropdown
                      options={
                        POSITION_OPTIONS_BY_CATEGORY[newPerson.type] || []
                      }
                      value={
                        newPerson.position?.startsWith("OTHERS")
                          ? "OTHERS"
                          : newPerson.position
                      }
                      onChange={(val) => {
                        if (val === "OTHERS") {
                          setNewPerson({ ...newPerson, position: "OTHERS" });
                        } else if (val === "COOK") {
                          setNewPerson({
                            ...newPerson,
                            position: "COOK",
                            type: "non-teaching",
                            natureOfAppointment: "CONTRACTUAL",
                            hiringArrangement: "CONTRACTUAL",
                            fundSource: "SBFP",
                          });
                        } else {
                          setNewPerson({ ...newPerson, position: val });
                        }
                      }}
                      placeholder="SELECT PLANTILLA POSITION..."
                    />
                    {newPerson.type === "non-teaching" &&
                      (newPerson.position === "OTHERS" ||
                        newPerson.position?.startsWith("OTHERS")) && (
                        <div style={{ marginTop: "8px" }}>
                          <label style={{ fontSize: "11px", color: "#64748B" }}>
                            Specify Position (Max 50 characters)
                          </label>
                          <input
                            type="text"
                            maxLength={50}
                            placeholder="Specify position title..."
                            value={
                              newPerson.position === "OTHERS"
                                ? ""
                                : newPerson.position.replace(
                                    /^OTHERS\s*-\s*/i,
                                    "",
                                  )
                            }
                            onChange={(e) => {
                              const val = e.target.value
                                .substring(0, 50)
                                .toUpperCase();
                              setNewPerson({
                                ...newPerson,
                                position: val ? `OTHERS - ${val}` : "OTHERS",
                              });
                            }}
                            required
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              fontSize: "13px",
                              borderRadius: "8px",
                              border: "1.5px solid #BAE6FD",
                              background: "#F0F9FF",
                            }}
                          />
                          <div
                            style={{
                              fontSize: "10px",
                              color: "#94A3B8",
                              textAlign: "right",
                              marginTop: "2px",
                            }}
                          >
                            {
                              (newPerson.position === "OTHERS"
                                ? ""
                                : newPerson.position.replace(
                                    /^OTHERS\s*-\s*/i,
                                    "",
                                  )
                              ).length
                            }
                            /50 characters
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="btn" type="submit">
                  Add Personnel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ESF7 Upload Modal */}
      <ESF7UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onImportSuccess={() => {
          if (showToast)
            showToast(
              "Faculty profiles auto-populated successfully!",
              "success",
            );
        }}
      />

      {/* SDO School Head (OIC Principal) entry */}
      {isSdoHeadModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() => setIsSdoHeadModalOpen(false)}
        >
          <form
            className="card"
            onSubmit={submitSdoHead}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "24px",
              padding: "24px 28px",
              display: "grid",
              gap: "12px",
            }}
          >
            <h3 style={{ margin: 0 }}>SDO School Head</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Used in reports and SF7 only while the roster has no designated
              school head (e.g. an EPS II serving as OIC Principal). It is not
              added to the roster.
            </p>
            <div>
              <label>Name</label>
              <input
                required
                value={sdoHeadForm.name}
                onChange={(e) =>
                  setSdoHeadForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="LAST NAME, FIRST NAME M.I."
              />
            </div>
            <div>
              <label>Email</label>
              <input
                required
                type="email"
                value={sdoHeadForm.email}
                onChange={(e) =>
                  setSdoHeadForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div>
              <label>Position Title</label>
              <input
                required
                value={sdoHeadForm.positionTitle}
                onChange={(e) =>
                  setSdoHeadForm((f) => ({
                    ...f,
                    positionTitle: e.target.value,
                  }))
                }
                placeholder="e.g. EPS II / OIC Principal"
              />
            </div>
            {sdoHeadError && (
              <div
                style={{ color: "#DC2626", fontSize: "13px", fontWeight: 600 }}
              >
                {sdoHeadError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="btn"
                type="button"
                onClick={() => setIsSdoHeadModalOpen(false)}
              >
                Cancel
              </button>
              <button className="btn" type="submit" disabled={isSavingSdoHead}>
                {isSavingSdoHead ? "Saving…" : sdoSchoolHead ? "Update" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* School Head Required Alert Modal */}
      {isHeadRequiredModalOpen && (
        <div
          className="modal-overlay"
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
          onClick={() => setIsHeadRequiredModalOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              overflow: "hidden",
              border: "2px solid #fed7aa",
              animation: "fadeIn 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with warm warning banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
                padding: "24px 28px",
                borderBottom: "1.5px solid #fde68a",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "16px",
                  background: "#fef3c7",
                  border: "2px solid #f59e0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d97706",
                  flexShrink: 0,
                }}
              >
                <FiAlertCircle size={26} />
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: "900",
                    color: "#92400e",
                  }}
                >
                  School Head Designation Required
                </h3>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "#b45309",
                  }}
                >
                  DepEd eSF7 Institutional Compliance Gate
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: "24px 28px",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  lineHeight: "1.6",
                  color: "#334155",
                }}
              >
                Under <strong>DepEd Electronic School Form 7 (eSF7)</strong>{" "}
                guidelines, every school must have{" "}
                <strong>at least one official School Head</strong> (Principal,
                Teacher-in-Charge, or Head Teacher) designated before continuing
                to Personnel Profiling.
              </p>

              <div
                style={{
                  background: "#fef2f2",
                  border: "1.5px solid #fecaca",
                  borderRadius: "14px",
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <div style={{ color: "#dc2626", marginTop: "2px" }}>
                  <FiAlertCircle size={18} />
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#991b1b",
                    lineHeight: "1.5",
                  }}
                >
                  <strong>Current Status:</strong> No School Head is currently
                  selected.
                  <div style={{ marginTop: "4px", color: "#7f1d1d" }}>
                    Please select an official <strong>School Head</strong> from
                    qualified teaching personnel or designate an SDO OIC.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "8px",
                }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setIsHeadRequiredModalOpen(false)}
                  style={{
                    padding: "10px 18px",
                    fontSize: "13px",
                    fontWeight: "600",
                    borderRadius: "10px",
                  }}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setIsHeadRequiredModalOpen(false);
                    setIsChangeHeadModalOpen(true);
                  }}
                  style={{
                    padding: "12px 24px",
                    fontSize: "14px",
                    fontWeight: "800",
                    background:
                      "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                    cursor: "pointer",
                  }}
                >
                  Select School Head Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Select / Change School Head Sidebar Drawer Modal */}
      {isChangeHeadModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="select-head-modal-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 99999,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "stretch",
            animation: "fadeInBackdrop 0.25s ease-out",
          }}
          onClick={() => setIsChangeHeadModalOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(620px, 96vw)",
              height: "100%",
              background: "#FFFFFF",
              boxShadow: "-8px 0 32px rgba(15, 23, 42, 0.2)",
              display: "flex",
              flexDirection: "column",
              animation: "slideInFromRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              overflow: "hidden",
            }}
          >
            {/* Top Emerald Accent Line */}
            <div
              style={{
                height: "4px",
                width: "100%",
                background:
                  "linear-gradient(90deg, #10B981 0%, #059669 50%, #047857 100%)",
                flexShrink: 0,
              }}
            />

            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(to right, #f8fafc, #ffffff)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    background: "#059669",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 10px rgba(5, 150, 105, 0.25)",
                    flexShrink: 0,
                  }}
                >
                  <FiUserCheck size={22} />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <h3
                      id="select-head-modal-title"
                      style={{
                        margin: 0,
                        fontSize: "17px",
                        fontWeight: "800",
                        color: "#0f172a",
                      }}
                    >
                      Designate School Head
                    </h3>
                    <span
                      style={{
                        background: "#e0f2fe",
                        color: "#0284c7",
                        border: "1px solid #bae6fd",
                        borderRadius: "999px",
                        padding: "1px 8px",
                        fontSize: "10px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                      }}
                    >
                      {educationalLevels.length === 1
                        ? `Purely ${educationalLevels[0]}`
                        : educationalLevels.length === 2
                          ? `${educationalLevels[0]} & ${educationalLevels[1]}`
                          : `All Offering (${educationalLevels.length} Levels)`}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    {educationalLevels.length === 1
                      ? `This school offers only 1 educational level (${educationalLevels[0]}). Select one official School Head.`
                      : `Configure School Head governance based on offering (${educationalLevels.join(", ")}).`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsChangeHeadModalOpen(false)}
                style={{
                  width: "36px",
                  height: "36px",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Modal Body Container with Scroll */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Question Banner for 2 or 3 educational levels */}
              {educationalLevels.length > 1 && (
                <div
                  style={{
                    margin: "16px 24px 0",
                    padding: "14px 18px",
                    background: "#f8fafc",
                    border: "1.5px solid #cbd5e1",
                    borderRadius: "14px",
                    display: "flex",
                    flexDirection: "column",
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
                    <FiInfo
                      size={16}
                      style={{ color: "#2563eb", flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "800",
                        color: "#1e293b",
                      }}
                    >
                      {educationalLevels.length === 2
                        ? "Do you have two School Heads for these educational levels?"
                        : "Do you have three School Heads, one for each educational level?"}
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
                  >
                    <button
                      type="button"
                      onClick={handleSwitchToMultipleHeads}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border:
                          modalHasMultipleHeads === true
                            ? "2px solid #059669"
                            : "1.5px solid #cbd5e1",
                        background:
                          modalHasMultipleHeads === true
                            ? "#ecfdf5"
                            : "#ffffff",
                        color:
                          modalHasMultipleHeads === true
                            ? "#065f46"
                            : "#475569",
                        fontWeight: "700",
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>Yes ({educationalLevels.length} School Heads)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSwitchToSingleHead}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border:
                          modalHasMultipleHeads === false
                            ? "2px solid #059669"
                            : "1.5px solid #cbd5e1",
                        background:
                          modalHasMultipleHeads === false
                            ? "#ecfdf5"
                            : "#ffffff",
                        color:
                          modalHasMultipleHeads === false
                            ? "#065f46"
                            : "#475569",
                        fontWeight: "700",
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>No (1 Main School Head for all)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Multiple Educational Level Slots: ONLY shown IF THEY CLICK YES */}
              {modalHasMultipleHeads === true &&
                educationalLevels.length > 1 && (
                  <div
                    style={{
                      margin: "14px 24px 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "800",
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Select candidate for each educational level:
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          educationalLevels.length > 2
                            ? "repeat(auto-fit, minmax(160px, 1fr))"
                            : "repeat(2, 1fr)",
                        gap: "10px",
                      }}
                    >
                      {educationalLevels.map((lvl) => {
                        const assignedId = modalHeadAssignments[lvl];
                        const assignedPerson = personnel.find(
                          (p) => String(p.id) === String(assignedId),
                        );
                        const isActiveSlot = activeLevelSlot === lvl;
                        const isMain =
                          String(modalMainHeadId) === String(assignedId) &&
                          Boolean(assignedId);

                        return (
                          <div
                            key={lvl}
                            onClick={() => setActiveLevelSlot(lvl)}
                            style={{
                              border: isActiveSlot
                                ? "2px solid #059669"
                                : assignedPerson
                                  ? "1.5px solid #bbf7d0"
                                  : "1.5px dashed #cbd5e1",
                              background: isActiveSlot
                                ? "#f0fdf4"
                                : assignedPerson
                                  ? "#f8fafc"
                                  : "#ffffff",
                              borderRadius: "12px",
                              padding: "10px 12px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              minHeight: "72px",
                            }}
                          >
                            <div>
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
                                    fontWeight: "800",
                                    color: isActiveSlot ? "#059669" : "#475569",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {lvl} Head
                                </span>
                                {isMain && (
                                  <span
                                    style={{
                                      background: "#fef3c7",
                                      color: "#92400e",
                                      border: "1px solid #fcd34d",
                                      borderRadius: "999px",
                                      padding: "0 6px",
                                      fontSize: "9px",
                                      fontWeight: "800",
                                    }}
                                  >
                                    ★ Main Head
                                  </span>
                                )}
                              </div>
                              {assignedPerson ? (
                                <div>
                                  <div
                                    style={{
                                      fontWeight: "700",
                                      fontSize: "13px",
                                      color: "#0f172a",
                                      lineHeight: "1.3",
                                    }}
                                  >
                                    {formatPersonnelName(assignedPerson)}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "#64748b",
                                      marginTop: "2px",
                                    }}
                                  >
                                    {assignedPerson.position || "Faculty"}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#94a3b8",
                                    fontStyle: "italic",
                                    marginTop: "4px",
                                  }}
                                >
                                  + Click to choose candidate below
                                </div>
                              )}
                            </div>
                            {assignedPerson && (
                              <div
                                style={{
                                  marginTop: "6px",
                                  display: "flex",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalHeadAssignments((prev) => {
                                      const next = { ...prev };
                                      delete next[lvl];
                                      return next;
                                    });
                                    setActiveLevelSlot(lvl);
                                    if (
                                      String(modalMainHeadId) ===
                                      String(assignedId)
                                    ) {
                                      const remaining = Object.entries(
                                        modalHeadAssignments,
                                      ).find(([l, id]) => l !== lvl && id);
                                      setModalMainHeadId(
                                        remaining ? String(remaining[1]) : null,
                                      );
                                    }
                                  }}
                                  style={{
                                    background: "#f1f5f9",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: "6px",
                                    color: "#334155",
                                    fontSize: "11px",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                    padding: "3px 8px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                >
                                  <FiEdit2 size={11} /> Change
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Dedicated View: Who is the Main School Head? Shown when ALL level slots are assigned */}
              {allMultipleSlotsAssigned && (
                <div
                  style={{
                    margin: "16px 24px 20px",
                    padding: "20px 22px",
                    background: "#ffffff",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    boxShadow: "0 4px 20px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  {/* Step Header Banner */}
                  <div
                    style={{
                      background:
                        "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                      border: "1px solid #bbf7d0",
                      borderRadius: "12px",
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background: "#059669",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 2px 8px rgba(5, 150, 105, 0.25)",
                      }}
                    >
                      <FiStar size={18} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "800",
                          color: "#065f46",
                        }}
                      >
                        Select Main School Head (Official Signatory)
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#047857",
                          marginTop: "2px",
                          lineHeight: "1.45",
                        }}
                      >
                        Both educational levels have designated heads. Choose
                        which School Head will serve as the{" "}
                        <strong>Official Main Signatory</strong> on DepEd eSF7
                        school forms.
                      </div>
                    </div>
                  </div>

                  {/* Signatory Cards List */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "800",
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Select Main Signatory:
                    </div>
                    {educationalLevels.map((lvl) => {
                      const pId = modalHeadAssignments[lvl];
                      if (!pId) return null;
                      const p = personnel.find(
                        (item) => String(item.id) === String(pId),
                      );
                      if (!p) return null;
                      const isMain = String(modalMainHeadId) === String(pId);

                      return (
                        <div
                          key={lvl}
                          onClick={() => setModalMainHeadId(String(pId))}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "14px 18px",
                            borderRadius: "12px",
                            border: isMain
                              ? "2px solid #059669"
                              : "1.5px solid #e2e8f0",
                            background: isMain ? "#f0fdf4" : "#ffffff",
                            cursor: "pointer",
                            transition:
                              "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                            boxShadow: isMain
                              ? "0 4px 16px rgba(5, 150, 105, 0.12)"
                              : "0 1px 3px rgba(15, 23, 42, 0.04)",
                          }}
                        >
                          {/* Left: Radio + Info */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "14px",
                              flex: 1,
                              minWidth: 0,
                              marginRight: "12px",
                            }}
                          >
                            {/* Custom Radio Button */}
                            <div
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                border: isMain
                                  ? "2px solid #059669"
                                  : "2px solid #cbd5e1",
                                background: isMain ? "#059669" : "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#ffffff",
                                flexShrink: 0,
                                transition: "all 0.15s ease",
                              }}
                            >
                              {isMain && <FiCheck size={12} strokeWidth={3} />}
                            </div>

                            {/* Name and Level Metadata */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: "800",
                                  fontSize: "14px",
                                  color: isMain ? "#065f46" : "#0f172a",
                                  lineHeight: "1.3",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatPersonnelName(p)}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  marginTop: "4px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: "800",
                                    padding: "2px 8px",
                                    borderRadius: "999px",
                                    background: isMain ? "#dcfce7" : "#e0f2fe",
                                    color: isMain ? "#15803d" : "#0369a1",
                                    border: isMain
                                      ? "1px solid #86efac"
                                      : "1px solid #bae6fd",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.4px",
                                  }}
                                >
                                  {lvl} Head
                                </span>
                                {p.position && (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "#64748b",
                                      fontWeight: "500",
                                    }}
                                  >
                                    {p.position}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Action or Selected Badge */}
                          <div style={{ flexShrink: 0 }}>
                            {isMain ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  padding: "6px 14px",
                                  borderRadius: "999px",
                                  background: "#059669",
                                  color: "#ffffff",
                                  fontWeight: "800",
                                  fontSize: "12px",
                                  boxShadow:
                                    "0 2px 6px rgba(5, 150, 105, 0.25)",
                                }}
                              >
                                <FiCheck size={13} strokeWidth={3} /> Main
                                Signatory
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModalMainHeadId(String(pId));
                                }}
                                style={{
                                  padding: "6px 14px",
                                  borderRadius: "999px",
                                  background: "#ffffff",
                                  color: "#475569",
                                  fontWeight: "700",
                                  fontSize: "12px",
                                  border: "1.5px solid #cbd5e1",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = "#059669";
                                  e.currentTarget.style.color = "#059669";
                                  e.currentTarget.style.background = "#f0fdf4";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = "#cbd5e1";
                                  e.currentTarget.style.color = "#475569";
                                  e.currentTarget.style.background = "#ffffff";
                                }}
                              >
                                Set as Main
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Guidance Footer */}
                  <div
                    style={{
                      padding: "11px 14px",
                      borderRadius: "10px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                      color: "#475569",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <FiCheckCircle
                      size={15}
                      style={{ color: "#059669", flexShrink: 0 }}
                    />
                    <span>
                      Ready to finalize. Click{" "}
                      <strong>Confirm & Save School Heads</strong> below to
                      commit designations.
                    </span>
                  </div>
                </div>
              )}

              {/* Single Head Guidance Notice & Selected Head Card: ONLY shown IF THEY CLICK NO */}
              {modalHasMultipleHeads === false &&
                educationalLevels.length > 1 && (
                  <div
                    style={{
                      margin: "14px 24px 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: "10px",
                        fontSize: "12px",
                        color: "#166534",
                        lineHeight: "1.45",
                      }}
                    >
                      <strong>Single Head Mode:</strong> One Main School Head
                      will govern all applicable educational levels (
                      {educationalLevels.join(" & ")}).
                    </div>

                    {modalMainHeadId &&
                      (() => {
                        const mainPerson = personnel.find(
                          (p) => String(p.id) === String(modalMainHeadId),
                        );
                        if (!mainPerson) return null;
                        return (
                          <div
                            style={{
                              border: "2px solid #059669",
                              background: "#f0fdf4",
                              borderRadius: "12px",
                              padding: "12px 16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              boxShadow: "0 2px 8px rgba(5, 150, 105, 0.08)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                minWidth: 0,
                                flex: 1,
                              }}
                            >
                              <div
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "10px",
                                  background: "#059669",
                                  color: "#ffffff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <FiStar size={18} />
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontWeight: "800",
                                      fontSize: "14px",
                                      color: "#065f46",
                                    }}
                                  >
                                    {formatPersonnelName(mainPerson)}
                                  </span>
                                  <span
                                    style={{
                                      background: "#fef3c7",
                                      color: "#92400e",
                                      border: "1px solid #fcd34d",
                                      borderRadius: "999px",
                                      padding: "1px 8px",
                                      fontSize: "9px",
                                      fontWeight: "800",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    ★ Main School Head (All Offerings)
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#047857",
                                    marginTop: "2px",
                                  }}
                                >
                                  {mainPerson.position || "Faculty"}{" "}
                                  {mainPerson.depedEmail
                                    ? `• ${mainPerson.depedEmail}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setModalMainHeadId(null);
                                setModalHeadAssignments({});
                              }}
                              style={{
                                background: "#ffffff",
                                border: "1px solid #cbd5e1",
                                borderRadius: "8px",
                                color: "#334155",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                                padding: "5px 10px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                flexShrink: 0,
                              }}
                            >
                              <FiEdit2 size={11} /> Change
                            </button>
                          </div>
                        );
                      })()}
                  </div>
                )}

              {/* Unanswered State Prompt Card */}
              {educationalLevels.length > 1 &&
                modalHasMultipleHeads === null && (
                  <div
                    style={{
                      margin: "24px",
                      padding: "24px 20px",
                      textAlign: "center",
                      background: "#f8fafc",
                      borderRadius: "14px",
                      border: "1.5px dashed #cbd5e1",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "12px",
                        background: "#e0f2fe",
                        color: "#0284c7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <FiInfo size={22} />
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "700",
                        color: "#1e293b",
                      }}
                    >
                      Please answer the question above
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        maxWidth: "420px",
                        lineHeight: "1.5",
                      }}
                    >
                      Select <strong>Yes</strong> if your school has separate
                      School Heads for each educational level (
                      {educationalLevels.join(" & ")}), or <strong>No</strong>{" "}
                      if one School Head oversees all levels.
                    </div>
                  </div>
                )}

              {/* Search & Candidates Section: ONLY shown when offering 1 level, OR single head mode, OR multiple heads with unassigned slots */}
              {!allMultipleSlotsAssigned &&
                (educationalLevels.length === 1 ||
                  modalHasMultipleHeads !== null) && (
                  <>
                    {/* Search Input Bar */}
                    <div
                      style={{
                        margin: "14px 24px 0",
                        padding: "0",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <FiSearch
                          size={16}
                          style={{
                            position: "absolute",
                            left: "14px",
                            color: "#94a3b8",
                          }}
                        />
                        <input
                          type="text"
                          placeholder={
                            modalHasMultipleHeads && activeLevelSlot
                              ? `Search candidate for ${activeLevelSlot} Head...`
                              : "Search qualified candidates by name, position, or email..."
                          }
                          value={headSearchQuery}
                          onChange={(e) => setHeadSearchQuery(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "10px 14px 10px 40px",
                            fontSize: "13px",
                            borderRadius: "10px",
                            border: "1.5px solid #cbd5e1",
                            background: "#ffffff",
                            outline: "none",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          color: "#64748b",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {qualifiedHeadCandidates.length} eligible
                      </span>
                    </div>

                    {/* Candidate List */}
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        padding: "12px 24px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {qualifiedHeadCandidates.length === 0 ? (
                        <div
                          style={{
                            padding: "36px 16px",
                            textAlign: "center",
                            color: "#94a3b8",
                          }}
                        >
                          <FiAlertCircle
                            size={32}
                            style={{ margin: "0 auto 8px" }}
                          />
                          <p
                            style={{
                              margin: 0,
                              fontSize: "14px",
                              fontWeight: "600",
                            }}
                          >
                            No qualified teaching personnel found matching
                            &quot;{headSearchQuery}&quot;
                          </p>
                          <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                            Note: DepEd policy restricts School Head designation
                            to teaching and teaching-related staff.
                          </p>
                        </div>
                      ) : (
                        qualifiedHeadCandidates.map((p) => {
                          const pIdStr = String(p.id);

                          // Check multiple head assignments
                          const assignedEntry = Object.entries(
                            modalHeadAssignments,
                          ).find(([lvl, id]) => String(id) === pIdStr);
                          const assignedLevel = assignedEntry
                            ? assignedEntry[0]
                            : null;

                          // Single head check
                          const isSingleCurrent = Boolean(
                            !modalHasMultipleHeads &&
                            (p.isSchoolHead === true ||
                              p.is_school_head === true ||
                              (currentHead &&
                                String(currentHead.id) === pIdStr)),
                          );

                          const isAssignedToActiveSlot = Boolean(
                            modalHasMultipleHeads &&
                            activeLevelSlot &&
                            modalHeadAssignments[activeLevelSlot] === pIdStr,
                          );
                          const isAssignedToOtherSlot = Boolean(
                            modalHasMultipleHeads &&
                            assignedLevel &&
                            assignedLevel !== activeLevelSlot,
                          );

                          const pType =
                            getCategoryForCanonicalPosition(p.position) ||
                            detectPersonnelTypeFromPosition(p.position || "") ||
                            p.type ||
                            "teaching";

                          return (
                            <div
                              key={p.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "11px 16px",
                                borderRadius: "12px",
                                border:
                                  isAssignedToActiveSlot || isSingleCurrent
                                    ? "1.5px solid #86efac"
                                    : isAssignedToOtherSlot
                                      ? "1px solid #e2e8f0"
                                      : "1px solid #e2e8f0",
                                background:
                                  isAssignedToActiveSlot || isSingleCurrent
                                    ? "#f0fdf4"
                                    : isAssignedToOtherSlot
                                      ? "#f8fafc"
                                      : "#ffffff",
                                opacity: isAssignedToOtherSlot ? 0.75 : 1,
                                transition: "all 0.15s ease",
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  marginRight: "12px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontWeight: "700",
                                      fontSize: "14px",
                                      color: "#0f172a",
                                    }}
                                  >
                                    {formatPersonnelName(p)}
                                  </span>
                                  {isSingleCurrent && (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "2px 8px",
                                        background: "#dcfce7",
                                        color: "#15803d",
                                        border: "1px solid #86efac",
                                        borderRadius: "6px",
                                        fontSize: "10px",
                                        fontWeight: "800",
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      <FiCheckCircle size={10} /> Active Head
                                    </span>
                                  )}
                                  {assignedLevel && (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "2px 8px",
                                        background: "#dcfce7",
                                        color: "#15803d",
                                        border: "1px solid #86efac",
                                        borderRadius: "6px",
                                        fontSize: "10px",
                                        fontWeight: "800",
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      {assignedLevel} Head
                                    </span>
                                  )}
                                  <span
                                    className={`category-badge category-${pType}`}
                                    style={{
                                      fontSize: "10px",
                                      padding: "2px 8px",
                                    }}
                                  >
                                    {pType === "teaching"
                                      ? "Teaching"
                                      : pType === "teaching-related"
                                        ? "Related"
                                        : "Non-Teaching"}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "12px",
                                    marginTop: "4px",
                                    fontSize: "12px",
                                    color: "#64748b",
                                  }}
                                >
                                  <span>{p.position || "—"}</span>
                                  {p.depedEmail && (
                                    <span>• {p.depedEmail}</span>
                                  )}
                                </div>
                              </div>

                              <div>
                                {modalHasMultipleHeads ? (
                                  isAssignedToActiveSlot ? (
                                    <button
                                      type="button"
                                      className="btn secondary"
                                      onClick={() => {
                                        setModalHeadAssignments((prev) => {
                                          const next = { ...prev };
                                          delete next[activeLevelSlot];
                                          return next;
                                        });
                                        if (
                                          String(modalMainHeadId) === pIdStr
                                        ) {
                                          const remaining = Object.entries(
                                            modalHeadAssignments,
                                          ).find(
                                            ([l, id]) =>
                                              l !== activeLevelSlot && id,
                                          );
                                          setModalMainHeadId(
                                            remaining
                                              ? String(remaining[1])
                                              : null,
                                          );
                                        }
                                      }}
                                      style={{
                                        padding: "6px 12px",
                                        fontSize: "12px",
                                        fontWeight: "700",
                                        color: "#dc2626",
                                        border: "1px solid #fca5a5",
                                        background: "#ffffff",
                                        borderRadius: "8px",
                                        cursor: "pointer",
                                      }}
                                    >
                                      Clear
                                    </button>
                                  ) : isAssignedToOtherSlot ? (
                                    <button
                                      type="button"
                                      disabled
                                      style={{
                                        padding: "6px 12px",
                                        fontSize: "11px",
                                        fontWeight: "700",
                                        color: "#94a3b8",
                                        border: "1px solid #e2e8f0",
                                        background: "#f1f5f9",
                                        borderRadius: "8px",
                                        cursor: "not-allowed",
                                      }}
                                    >
                                      Assigned to {assignedLevel}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn"
                                      onClick={() => {
                                        const targetSlot =
                                          activeLevelSlot ||
                                          educationalLevels.find(
                                            (l) => !modalHeadAssignments[l],
                                          ) ||
                                          educationalLevels[0];
                                        setModalHeadAssignments((prev) => ({
                                          ...prev,
                                          [targetSlot]: pIdStr,
                                        }));
                                        if (!modalMainHeadId) {
                                          setModalMainHeadId(pIdStr);
                                        }
                                        // Auto advance to next unassigned slot
                                        const nextUnassigned =
                                          educationalLevels.find(
                                            (l) =>
                                              l !== targetSlot &&
                                              !modalHeadAssignments[l],
                                          );
                                        if (nextUnassigned) {
                                          setActiveLevelSlot(nextUnassigned);
                                        }
                                      }}
                                      style={{
                                        padding: "6px 14px",
                                        fontSize: "12px",
                                        fontWeight: "700",
                                        background: "#059669",
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "8px",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      <FiUserCheck size={13} /> Assign as{" "}
                                      {activeLevelSlot || "Head"}
                                    </button>
                                  )
                                ) : /* Single Head Mode Action */
                                isSingleCurrent ? (
                                  <button
                                    type="button"
                                    className="btn secondary"
                                    onClick={() => {
                                      setModalMainHeadId(null);
                                      setModalHeadAssignments({});
                                      const updatedList = (personnel || []).map(
                                        (item) => ({
                                          ...item,
                                          isSchoolHead: false,
                                          is_school_head: false,
                                          isMainSchoolHead: false,
                                          is_main_school_head: false,
                                          is_main_sh: false,
                                          schoolHeadLevel: null,
                                          school_head_level: null,
                                        }),
                                      );
                                      if (typeof setPersonnel === "function") {
                                        setPersonnel(updatedList);
                                      }
                                      if (showToast) {
                                        showToast(
                                          "School Head designation cleared in panel.",
                                          "info",
                                        );
                                      }
                                    }}
                                    style={{
                                      padding: "6px 14px",
                                      fontSize: "12px",
                                      fontWeight: "700",
                                      color: "#dc2626",
                                      border: "1px solid #fca5a5",
                                      background: "#ffffff",
                                      borderRadius: "8px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() => {
                                      const pIdStr = String(p.id);
                                      setModalMainHeadId(pIdStr);
                                      const newAssignments = {};
                                      educationalLevels.forEach((lvl) => {
                                        newAssignments[lvl] = pIdStr;
                                      });
                                      setModalHeadAssignments(newAssignments);

                                      // Update personnel state immediately in UI
                                      const updatedList = (personnel || []).map(
                                        (item) => {
                                          const isHead =
                                            String(item.id) === pIdStr;
                                          return {
                                            ...item,
                                            isSchoolHead: isHead,
                                            is_school_head: isHead,
                                            isMainSchoolHead: isHead,
                                            is_main_school_head: isHead,
                                            is_main_sh: isHead,
                                            schoolHeadLevel: null,
                                            school_head_level: null,
                                          };
                                        },
                                      );
                                      if (typeof setPersonnel === "function") {
                                        setPersonnel(updatedList);
                                      }
                                      if (showToast) {
                                        showToast(
                                          `${formatPersonnelName(p)} designated as Main School Head for all offerings.`,
                                          "success",
                                        );
                                      }
                                    }}
                                    style={{
                                      padding: "7px 16px",
                                      fontSize: "12px",
                                      fontWeight: "700",
                                      background: "#059669",
                                      color: "#ffffff",
                                      border: "none",
                                      borderRadius: "8px",
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                    }}
                                  >
                                    <FiUserCheck size={13} /> Designate
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                {modalHasMultipleHeads === null &&
                educationalLevels.length > 1 ? (
                  <span>
                    Please select Yes or No above to configure School Heads.
                  </span>
                ) : modalHasMultipleHeads && educationalLevels.length > 1 ? (
                  <span>
                    Status:{" "}
                    <strong
                      style={{
                        color:
                          Object.keys(modalHeadAssignments).length ===
                          educationalLevels.length
                            ? "#059669"
                            : "#d97706",
                      }}
                    >
                      {Object.keys(modalHeadAssignments).length} of{" "}
                      {educationalLevels.length}
                    </strong>{" "}
                    levels assigned
                    {modalMainHeadId && " • Main Head selected"}
                  </span>
                ) : modalHasMultipleHeads === false &&
                  educationalLevels.length > 1 ? (
                  <span>
                    Status:{" "}
                    <strong
                      style={{ color: modalMainHeadId ? "#059669" : "#d97706" }}
                    >
                      {modalMainHeadId
                        ? `1 Main School Head (${formatPersonnelName(personnel.find((p) => String(p.id) === String(modalMainHeadId)))}) designated for all offerings (${educationalLevels.join(" & ")})`
                        : `Please select 1 Main School Head for all offerings (${educationalLevels.join(" & ")})`}
                    </strong>
                  </span>
                ) : (
                  <span>
                    DepEd eSF7 requires an official School Head before saving.
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setIsChangeHeadModalOpen(false)}
                  style={{
                    padding: "8px 18px",
                    fontSize: "13px",
                    fontWeight: "600",
                    borderRadius: "10px",
                  }}
                >
                  {modalHasMultipleHeads !== null ? "Cancel" : "Done"}
                </button>

                {((educationalLevels.length > 1 &&
                  modalHasMultipleHeads !== null) ||
                  educationalLevels.length === 1) && (
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      modalHasMultipleHeads
                        ? Object.keys(modalHeadAssignments).length <
                            educationalLevels.length || !modalMainHeadId
                        : !modalMainHeadId
                    }
                    onClick={handleConfirmSaveSchoolHeads}
                    style={{
                      padding: "8px 20px",
                      fontSize: "13px",
                      fontWeight: "700",
                      background: (
                        modalHasMultipleHeads
                          ? Object.keys(modalHeadAssignments).length <
                              educationalLevels.length || !modalMainHeadId
                          : !modalMainHeadId
                      )
                        ? "#cbd5e1"
                        : "#059669",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "10px",
                      cursor: (
                        modalHasMultipleHeads
                          ? Object.keys(modalHeadAssignments).length <
                              educationalLevels.length || !modalMainHeadId
                          : !modalMainHeadId
                      )
                        ? "not-allowed"
                        : "pointer",
                    }}
                  >
                    Confirm & Save School Heads
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Confirmation Modal for School Head Designation */}
      {confirmDesignateTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-designation-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 100005,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            animation: "fadeInBackdrop 0.2s ease-out",
          }}
          onClick={() => setConfirmDesignateTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              border: "1px solid #e2e8f0",
              width: "100%",
              maxWidth: "460px",
              overflow: "hidden",
              animation: "modalSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Emerald Header Accent */}
            <div
              style={{
                height: "4px",
                width: "100%",
                background:
                  "linear-gradient(90deg, #10B981 0%, #059669 50%, #047857 100%)",
              }}
            />

            {/* Header with Emerald Icon */}
            <div
              style={{
                padding: "20px 24px 16px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "#dcfce7",
                  color: "#15803d",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <FiUserCheck size={24} />
              </div>
              <div>
                <h4
                  id="confirm-designation-title"
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: "800",
                    color: "#0f172a",
                  }}
                >
                  Confirm Designation
                </h4>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: "12px",
                    color: "#64748b",
                  }}
                >
                  Official DepEd eSF7 School Head Signatory
                </p>
              </div>
            </div>

            {/* Content Body */}
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#334155",
                  lineHeight: "1.5",
                }}
              >
                Are you sure you want to designate this personnel as the
                official <strong>School Head</strong>?
              </p>

              {/* Personnel Summary Card */}
              <div
                style={{
                  padding: "12px 16px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    fontWeight: "800",
                    fontSize: "14px",
                    color: "#0f172a",
                  }}
                >
                  {formatPersonnelName(confirmDesignateTarget)}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    marginTop: "3px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <span>{confirmDesignateTarget.position || "Faculty"}</span>
                  {confirmDesignateTarget.depedEmail && (
                    <span>• {confirmDesignateTarget.depedEmail}</span>
                  )}
                </div>
              </div>

              {/* Replacement Notice if Current Head Exists */}
              {currentHead &&
                String(currentHead.id) !==
                  String(confirmDesignateTarget.id) && (
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "#fefce8",
                      border: "1px solid #fef08a",
                      borderRadius: "10px",
                      fontSize: "12px",
                      color: "#854d0e",
                      lineHeight: "1.4",
                    }}
                  >
                    <strong>Note:</strong> This will replace the currently
                    designated School Head (
                    <strong>{formatPersonnelName(currentHead)}</strong>).
                  </div>
                )}
            </div>

            {/* Actions Footer */}
            <div
              style={{
                padding: "14px 24px",
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                className="btn secondary"
                onClick={() => setConfirmDesignateTarget(null)}
                style={{
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: "600",
                  borderRadius: "10px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const target = confirmDesignateTarget;
                  setConfirmDesignateTarget(null);
                  await designateSchoolHeadsConfig({
                    hasMultipleHeads: false,
                    mainHeadId: target.id,
                    assignments: { All: target.id },
                  });
                  setIsChangeHeadModalOpen(false);
                  const updatedList = (personnel || []).map((item) => {
                    const isHead = String(item.id) === String(target.id);
                    return {
                      ...item,
                      isSchoolHead: isHead,
                      is_school_head: isHead,
                      isMainSchoolHead: isHead,
                      is_main_school_head: isHead,
                      is_main_sh: isHead,
                    };
                  });
                  if (typeof setPersonnel === "function") {
                    setPersonnel(updatedList);
                  }
                  syncCleanRosterSnapshot(updatedList);
                  if (showToast) {
                    showToast(
                      `${formatPersonnelName(target)} designated as School Head.`,
                      "success",
                    );
                  }
                }}
                style={{
                  padding: "8px 20px",
                  fontSize: "13px",
                  fontWeight: "700",
                  background: "#059669",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 8px rgba(5, 150, 105, 0.25)",
                }}
              >
                <FiUserCheck size={14} /> Yes, Designate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Newly Added Personnel Validation & Review Sidebar Popup Modal */}
      {isNewPersonnelSidebarOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-personnel-sidebar-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 99999,
            display: "flex",
            justifyContent: "flex-end",
            animation: isClosingSidebar
              ? "fadeOutBackdrop 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards"
              : "fadeInBackdrop 0.25s ease-out",
          }}
          onClick={closeNewPersonnelSidebar}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(540px, 94vw)",
              height: "100%",
              background: "#FFFFFF",
              boxShadow: "-8px 0 32px rgba(15, 23, 42, 0.2)",
              display: "flex",
              flexDirection: "column",
              animation: isClosingSidebar
                ? "slideOutToRight 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                : "slideInFromRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              overflow: "hidden",
            }}
          >
            {/* Top Emerald Accent Line */}
            <div
              style={{
                height: "4px",
                width: "100%",
                background:
                  "linear-gradient(90deg, #10B981 0%, #059669 50%, #047857 100%)",
                flexShrink: 0,
              }}
            />

            {/* Sidebar Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "14px",
                background: "#F8FAFC",
                flexShrink: 0,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "14px",
                    background: "#ECFDF5",
                    border: "1.5px solid #A7F3D0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#059669",
                    flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.15)",
                  }}
                >
                  <FiUserCheck size={24} />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10.5px",
                        fontWeight: "900",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "#059669",
                        background: "#D1FAE5",
                        padding: "2px 8px",
                        borderRadius: "6px",
                      }}
                    >
                      {newlyAddedList.length} New Personnel
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#64748B",
                      }}
                    >
                      Pre-Save Validation
                    </span>
                  </div>
                  <h2
                    id="new-personnel-sidebar-title"
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: "800",
                      color: "#0F172A",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Review Newly Added Personnel
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={closeNewPersonnelSidebar}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  border: "1px solid #CBD5E1",
                  background: "#FFFFFF",
                  color: "#64748B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#F1F5F9";
                  e.currentTarget.style.color = "#0F172A";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#FFFFFF";
                  e.currentTarget.style.color = "#64748B";
                }}
                title="Close review panel"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                background: "#F8FAFC",
              }}
            >
              {/* Informational Guidance Alert */}
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #A7F3D0",
                  borderLeft: "4px solid #10B981",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.03)",
                }}
              >
                <FiCheckCircle
                  size={18}
                  style={{ color: "#059669", marginTop: "2px", flexShrink: 0 }}
                />
                <div
                  style={{
                    fontSize: "12.5px",
                    color: "#334155",
                    lineHeight: "1.5",
                  }}
                >
                  <strong>Review Notice:</strong> Please check and confirm the
                  newly added personnel below before saving.
                </div>
              </div>

              {/* Personnel Cards List */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {newlyAddedList.map((person, index) => {
                  const fullName =
                    `${person.salutation || ""} ${person.firstName || ""} ${person.middleName && person.middleName !== "N/A" ? person.middleName + " " : ""}${person.lastName || ""} ${person.nameExtension || ""}`.trim();
                  const age = getAge(person.birthdate);
                  const isTeaching = person.type === "teaching";
                  const isRelated = person.type === "teaching-related";
                  const categoryColor = isTeaching
                    ? "#2563EB"
                    : isRelated
                      ? "#7C3AED"
                      : "#D97706";
                  const categoryBg = isTeaching
                    ? "#EFF6FF"
                    : isRelated
                      ? "#F5F3FF"
                      : "#FEF3C7";

                  const emailDisplay =
                    person.depedEmail ||
                    (person.noDepedEmail || person.no_deped_email
                      ? "Pending ITO Google Workspace (N/A)"
                      : "Pending Email Assignment");

                  return (
                    <div
                      key={person.id || index}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #E2E8F0",
                        borderRadius: "14px",
                        padding: "16px",
                        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {/* Person Header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "8px",
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
                              width: "36px",
                              height: "36px",
                              borderRadius: "10px",
                              background: categoryBg,
                              color: categoryColor,
                              fontWeight: "900",
                              fontSize: "13px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {index + 1}
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: "800",
                                color: "#0F172A",
                                letterSpacing: "-0.01em",
                              }}
                            >
                              {fullName || "Unnamed Personnel"}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#475569",
                                marginTop: "2px",
                              }}
                            >
                              {person.position || "Position Unassigned"}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "800",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            color: categoryColor,
                            background: categoryBg,
                            flexShrink: 0,
                          }}
                        >
                          {person.type || "teaching"}
                        </span>
                      </div>

                      {/* Detail Chips Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "6px 12px",
                          background: "#F8FAFC",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          border: "1px solid #F1F5F9",
                          fontSize: "11.5px",
                        }}
                      >
                        <div>
                          <span style={{ color: "#64748B", fontWeight: "600" }}>
                            Birthdate:{" "}
                          </span>
                          <span style={{ color: "#0F172A", fontWeight: "700" }}>
                            {person.birthdate
                              ? `${person.birthdate} (${age !== null ? `${age} yrs` : "Valid"})`
                              : "Not provided"}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "#64748B", fontWeight: "600" }}>
                            Appointment:{" "}
                          </span>
                          <span style={{ color: "#0F172A", fontWeight: "700" }}>
                            {person.natureOfAppointment || "REGULAR PERMANENT"}
                          </span>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <span style={{ color: "#64748B", fontWeight: "600" }}>
                            Email:{" "}
                          </span>
                          <span style={{ color: "#0F172A", fontWeight: "700" }}>
                            {emailDisplay}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sidebar Sticky Footer */}
            <div
              style={{
                padding: "18px 24px",
                background: "#FFFFFF",
                borderTop: "1px solid #E2E8F0",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={executeRosterSave}
                disabled={isSavingDrafts}
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "12px",
                  fontSize: "13.5px",
                  fontWeight: "800",
                  color: "#FFFFFF",
                  background: isSavingDrafts
                    ? "#94A3B8"
                    : "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                  border: "none",
                  cursor: isSavingDrafts ? "not-allowed" : "pointer",
                  boxShadow: isSavingDrafts
                    ? "none"
                    : "0 4px 14px rgba(16, 185, 129, 0.35)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSavingDrafts) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow =
                      "0 6px 18px rgba(16, 185, 129, 0.45)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSavingDrafts) {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow =
                      "0 4px 14px rgba(16, 185, 129, 0.35)";
                  }
                }}
              >
                <FiSave size={16} />
                <span>
                  {isSavingDrafts
                    ? "Saving changes..."
                    : `Confirm & Save (${newlyAddedList.length})`}
                </span>
              </button>

              <button
                type="button"
                onClick={closeNewPersonnelSidebar}
                disabled={isSavingDrafts}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: "12px",
                  fontSize: "12.5px",
                  fontWeight: "700",
                  color: "#475569",
                  background: "#F8FAFC",
                  border: "1px solid #CBD5E1",
                  cursor: isSavingDrafts ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#F1F5F9";
                  e.currentTarget.style.color = "#0F172A";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#F8FAFC";
                  e.currentTarget.style.color = "#475569";
                }}
              >
                Cancel / Return to Roster
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Room QR Mobile Profiling Station Sidebar Popup Modal */}
      {isRoomQRDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-qr-sidebar-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 99999,
            display: "flex",
            justifyContent: "flex-end",
            animation: isClosingRoomQR
              ? "fadeOutBackdrop 0.24s cubic-bezier(0.4, 0, 0.2, 1) forwards"
              : "fadeInBackdrop 0.28s ease-out",
          }}
          onClick={closeRoomQRDrawer}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1240px, 94vw)",
              height: "100%",
              background: "#F8FAFC",
              boxShadow:
                "-16px 0 48px rgba(15, 23, 42, 0.2), -4px 0 16px rgba(15, 23, 42, 0.06)",
              display: "flex",
              flexDirection: "column",
              animation: isClosingRoomQR
                ? "slideOutToRight 0.25s cubic-bezier(0.32, 0, 0.67, 0) forwards"
                : "slideInFromRight 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
              willChange: "transform, opacity",
              overflow: "hidden",
            }}
          >
            {/* Top Royal Blue Accent Line */}
            <div
              style={{
                height: "4px",
                width: "100%",
                background:
                  "linear-gradient(90deg, #1D4ED8 0%, #2563EB 50%, #38BDF8 100%)",
                flexShrink: 0,
              }}
            />

            {/* Sidebar Header */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                background: "#FFFFFF",
                flexShrink: 0,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#1D4ED8",
                    flexShrink: 0,
                  }}
                >
                  <FiMaximize size={20} />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <h2
                      id="room-qr-sidebar-title"
                      style={{
                        margin: 0,
                        fontSize: "18px",
                        fontWeight: "800",
                        color: "#0F172A",
                        letterSpacing: "-0.2px",
                      }}
                    >
                      Room QR Portal
                    </h2>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "#EFF6FF",
                        color: "#1D4ED8",
                        border: "1px solid #BFDBFE",
                        fontSize: "10px",
                        fontWeight: "800",
                        letterSpacing: "0.5px",
                      }}
                    >
                      POPUP MODAL
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "2px 0 0 0",
                      fontSize: "12px",
                      color: "#64748B",
                      fontWeight: "500",
                    }}
                  >
                    Teacher passcode identity, faculty room QR posters & mobile
                    self-profiling
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeRoomQRDrawer}
                style={{
                  background: "#F1F5F9",
                  border: "1px solid #E2E8F0",
                  borderRadius: "10px",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748B",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#E2E8F0";
                  e.currentTarget.style.color = "#0F172A";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#F1F5F9";
                  e.currentTarget.style.color = "#64748B";
                }}
                title="Close Room QR Portal (Esc)"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Scrollable Room QR Portal Content */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 24px 40px",
              }}
            >
              <RoomQR isModal={true} onClose={closeRoomQRDrawer} />
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
