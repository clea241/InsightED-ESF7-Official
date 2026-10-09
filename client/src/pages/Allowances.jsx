import React, { useEffect, useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import PageTransition from "../components/PageTransition";
import PortalHeader from "../components/PortalHeader";
import { isAllowanceDisabled } from "@shared/allowances.js";
import {
  FiCheck,
  FiMap,
  FiCheckSquare,
  FiSquare,
  FiMinusSquare,
  FiFilter,
  FiUsers,
  FiSearch,
  FiCheckCircle,
  FiXCircle,
  FiBriefcase,
  FiUserCheck,
  FiLayers,
  FiLock,
  FiAlertCircle,
} from "react-icons/fi";

export default function Allowances() {
  const {
    personnel,
    showToast,
    allowancesMap,
    toggleAllowance,
    setAllowanceDisabled,
    bulkToggleAllowances,
    fetchAllowances,
    schoolInfo,
    setActiveView,
    bypassNodeLocks,
  } = useApp();

  const isLocked = false; // Node 09 (Allowances & Incentives) is fixed as UNLOCKED

  const currentSchoolYear = schoolInfo?.schoolYear || "SY 26-27";

  const [activeCategory, setActiveCategory] = useState("all"); // 'all' | 'teaching' | 'teaching-related' | 'non-teaching'
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (fetchAllowances) {
      fetchAllowances(currentSchoolYear);
    }
  }, [currentSchoolYear]);

  // Configured Allowance Items (Boolean tracking per personnel - PERA removed)
  const allowanceConfig = [
    {
      key: "uniform",
      label: "Uniform Allowance",
      desc: "Clothing & Uniform Allowance",
    },
    {
      key: "supplies",
      label: "Teaching Supplies",
      desc: "Cash Allowance for Teaching Supplies (Teaching Only)",
    },
    {
      key: "medical",
      label: "Medical Allowance",
      desc: "Fixed Medical Allowance (₱7,000)",
    },
    {
      key: "hardship",
      label: "Special Hardship",
      desc: "Special Hardship Allowance",
    },
  ];

  // Helper to normalize and categorize personnel
  const getPersonnelCategory = (p) => {
    const rawType = p.type || p.personnelType || "";
    const t = String(rawType).toLowerCase().trim();
    if (t.includes("related") || t === "teaching-related")
      return "teaching-related";
    if (t.includes("non") || t === "non-teaching") return "non-teaching";

    const pos = String(
      p.position || p.plantilla_position || p.position_title || "",
    ).toUpperCase();
    if (
      pos.includes("PRINCIPAL") ||
      pos.includes("HEAD TEACHER") ||
      pos.includes("HT ") ||
      pos.includes("SUPERVISOR")
    ) {
      return "teaching-related";
    }
    if (
      pos.includes("ADMINISTRATIVE") ||
      pos.includes("ADAS") ||
      pos.includes("BOOKKEEPER") ||
      pos.includes("SECURITY") ||
      pos.includes("UTILITY") ||
      pos.includes("NURSE") ||
      pos.includes("DRIVER") ||
      pos.includes("AIDE") ||
      pos.includes("ACCOUNTANT") ||
      pos.includes("DISBURSING") ||
      pos.includes("CLERK")
    ) {
      return "non-teaching";
    }
    return "teaching";
  };

  // Active personnel (exclude draft and shared personnel)
  const activePersonnelList = useMemo(() => {
    return (personnel || []).filter((p) => !p.isDraft && !p.isShared);
  }, [personnel]);

  // Personnel counts by category
  const categoryCounts = useMemo(() => {
    let teaching = 0;
    let related = 0;
    let nonTeaching = 0;

    activePersonnelList.forEach((p) => {
      const cat = getPersonnelCategory(p);
      if (cat === "teaching") teaching++;
      else if (cat === "teaching-related") related++;
      else if (cat === "non-teaching") nonTeaching++;
    });

    return {
      all: activePersonnelList.length,
      teaching,
      "teaching-related": related,
      "non-teaching": nonTeaching,
    };
  }, [activePersonnelList]);

  // Filtered personnel based on category and search
  const filteredPersonnel = useMemo(() => {
    return activePersonnelList.filter((p) => {
      const cat = getPersonnelCategory(p);
      if (activeCategory !== "all" && cat !== activeCategory) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const fullName =
          `${p.lastName} ${p.firstName} ${p.middleName || ""}`.toLowerCase();
        const pos = String(p.position || "").toLowerCase();
        return fullName.includes(query) || pos.includes(query);
      }
      return true;
    });
  }, [activePersonnelList, activeCategory, searchTerm]);

  // Single Checkbox Toggle
  const handleCheckboxToggle = async (personId, name, conf, category) => {
    if (isLocked) {
      return showToast(
        "The Allowances module is currently locked for policy alignment.",
        "warning",
      );
    }

    if (conf.key === "supplies" && category === "non-teaching") {
      return showToast(
        "Non-Teaching personnel are not eligible for Teaching Supplies Allowance.",
        "warning",
      );
    }

    const personAllowances = allowancesMap[personId] || {};
    if (isAllowanceDisabled(personAllowances, conf.key)) {
      return showToast(
        `${conf.label} is disabled for ${name}. Enable it first.`,
        "warning",
      );
    }
    const currentlyGranted = Boolean(personAllowances[conf.key]);
    const nextGranted = !currentlyGranted;

    const res = await toggleAllowance(
      personId,
      conf.key,
      nextGranted,
      currentSchoolYear,
    );
    if (res && res.success !== false) {
      if (nextGranted) {
        showToast(`Granted ${conf.label} for ${name}`);
      } else {
        showToast(`Removed ${conf.label} for ${name}`);
      }
    } else {
      showToast(`Failed to update ${conf.label} for ${name}`, "error");
    }
  };

  // Bulk toggle for a specific column across all currently filtered personnel
  const handleColumnBulkToggle = async (confKey, confLabel, targetState) => {
    if (isLocked) {
      return showToast(
        "The Allowances module is currently locked for policy alignment.",
        "warning",
      );
    }

    let eligiblePersonnel = filteredPersonnel;
    if (confKey === "supplies") {
      eligiblePersonnel = filteredPersonnel.filter(
        (p) => getPersonnelCategory(p) !== "non-teaching",
      );
    }

    const targetIds = eligiblePersonnel.map((p) => p.id);
    if (targetIds.length === 0) {
      if (confKey === "supplies" && activeCategory === "non-teaching") {
        return showToast(
          "Non-Teaching personnel are not eligible for Teaching Supplies Allowance.",
          "warning",
        );
      }
      return;
    }

    const categoryLabel =
      activeCategory === "all"
        ? "Eligible Personnel"
        : activeCategory === "teaching"
          ? "Teaching Staff"
          : activeCategory === "teaching-related"
            ? "Teaching-Related Staff"
            : "Non-Teaching Staff";

    if (bulkToggleAllowances) {
      await bulkToggleAllowances(
        targetIds,
        [confKey],
        targetState,
        currentSchoolYear,
      );
    } else {
      for (const id of targetIds) {
        await toggleAllowance(id, confKey, targetState, currentSchoolYear);
      }
    }

    showToast(
      targetState
        ? `Granted ${confLabel} to ${targetIds.length} ${categoryLabel}.`
        : `Removed ${confLabel} from ${targetIds.length} ${categoryLabel}.`,
    );
  };

  // Disable / re-enable one allowance for one person (e.g. Special Hardship). Disabled = ignored by compliance.
  const handleDisableToggle = async (personId, name, conf, nextDisabled) => {
    if (isLocked) return;
    const res = await setAllowanceDisabled(
      personId,
      conf.key,
      nextDisabled,
      currentSchoolYear,
    );
    if (res && res.success !== false) {
      showToast(
        `${nextDisabled ? "Disabled" : "Enabled"} ${conf.label} for ${name}`,
      );
    } else {
      showToast(`Failed to update ${conf.label} for ${name}`, "error");
    }
  };

  // Bulk toggle for ALL allowance columns across all currently filtered personnel
  const handleAllAllowancesBulkToggle = async (targetState) => {
    if (isLocked) {
      return showToast(
        "The Allowances module is currently locked for policy alignment.",
        "warning",
      );
    }

    if (filteredPersonnel.length === 0) return;

    for (const p of filteredPersonnel) {
      const cat = getPersonnelCategory(p);
      const keys =
        cat === "non-teaching"
          ? allowanceConfig
              .filter((c) => c.key !== "supplies")
              .map((c) => c.key)
          : allowanceConfig.map((c) => c.key);

      if (bulkToggleAllowances) {
        await bulkToggleAllowances(
          [p.id],
          keys,
          targetState,
          currentSchoolYear,
        );
      } else {
        for (const k of keys) {
          await toggleAllowance(p.id, k, targetState, currentSchoolYear);
        }
      }
    }

    const categoryLabel =
      activeCategory === "all"
        ? "All Personnel"
        : activeCategory === "teaching"
          ? "Teaching Staff"
          : activeCategory === "teaching-related"
            ? "Teaching-Related Staff"
            : "Non-Teaching Staff";

    showToast(
      targetState
        ? `Granted all eligible allowances to ${filteredPersonnel.length} ${categoryLabel}.`
        : `Cleared all allowances for ${filteredPersonnel.length} ${categoryLabel}.`,
    );
  };

  // Helper for column header master checkbox status: 'checked' | 'unchecked' | 'indeterminate'
  const getColumnCheckStatus = (confKey) => {
    const eligiblePersonnel =
      confKey === "supplies"
        ? filteredPersonnel.filter(
            (p) => getPersonnelCategory(p) !== "non-teaching",
          )
        : filteredPersonnel;

    if (eligiblePersonnel.length === 0) return "unchecked";
    let grantedCount = 0;
    eligiblePersonnel.forEach((p) => {
      const personAllowances = allowancesMap[p.id] || {};
      if (personAllowances[confKey]) grantedCount++;
    });

    if (grantedCount === 0) return "unchecked";
    if (grantedCount === eligiblePersonnel.length) return "checked";
    return "indeterminate";
  };

  return (
    <PageTransition>
      <div
        style={{
          padding: "30px",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {/* Portal Header with Node Navigation */}
        <PortalHeader
          title="Allowances & Incentives Portal"
          description={`Select allowances and manage financial incentives for registered school personnel (${currentSchoolYear}).`}
          onBack={() => setActiveView("nodemap")}
        />

        {/* LOCKED BANNER NOTICE */}
        {isLocked && (
          <div
            style={{
              background: "linear-gradient(135deg, #FEF2F2 0%, #FFF1F2 100%)",
              borderRadius: "16px",
              border: "1.5px solid #FECDD3",
              padding: "16px 20px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              boxShadow: "0 2px 8px rgba(239, 68, 68, 0.06)",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "#FEE2E2",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FiLock size={20} />
            </div>
            <div>
              <div
                style={{
                  fontWeight: "800",
                  fontSize: "13.5px",
                  color: "#991B1B",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                ALLOWANCES MODULE LOCKED
                <span
                  style={{
                    fontSize: "9.5px",
                    fontWeight: "800",
                    padding: "2px 7px",
                    borderRadius: "4px",
                    background: "#FEE2E2",
                    color: "#B91C1C",
                    letterSpacing: "0.04em",
                  }}
                >
                  POLICY BENCHMARK
                </span>
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#7F1D1D",
                  marginTop: "2px",
                  lineHeight: "1.4",
                }}
              >
                The Allowances &amp; Incentives module is currently locked for
                policy alignment. All records are currently in read-only audit
                mode.
              </div>
            </div>
          </div>
        )}

        {/* TOP FILTER & BULK CONTROLS TOOLBAR */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1.5px solid var(--line, #e2e8f0)",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
          }}
        >
          {/* Category Filter Pills */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: "800",
                color: "#64748b",
                textTransform: "uppercase",
                marginRight: "4px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <FiFilter size={13} /> Filter:
            </span>

            {[
              {
                id: "all",
                label: "All Personnel",
                count: categoryCounts.all,
                icon: FiUsers,
                color: "#3B82F6",
              },
              {
                id: "teaching",
                label: "Teaching",
                count: categoryCounts.teaching,
                icon: FiUserCheck,
                color: "#0284C7",
              },
              {
                id: "teaching-related",
                label: "Related Teaching",
                count: categoryCounts["teaching-related"],
                icon: FiBriefcase,
                color: "#8B5CF6",
              },
              {
                id: "non-teaching",
                label: "Non-Teaching",
                count: categoryCounts["non-teaching"],
                icon: FiLayers,
                color: "#F59E0B",
              },
            ].map((cat) => {
              const isActive = activeCategory === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: isActive ? "800" : "600",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background: isActive ? cat.color : "#F8FAFC",
                    color: isActive ? "#FFFFFF" : "#475569",
                    border: `1.5px solid ${isActive ? cat.color : "#E2E8F0"}`,
                    boxShadow: isActive ? `0 4px 12px ${cat.color}33` : "none",
                  }}
                >
                  <Icon size={14} />
                  <span>{cat.label}</span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "800",
                      padding: "1px 6px",
                      borderRadius: "12px",
                      background: isActive
                        ? "rgba(255, 255, 255, 0.25)"
                        : "#E2E8F0",
                      color: isActive ? "#FFFFFF" : "#64748B",
                    }}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box & Master Bulk Actions */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* Search Input */}
            <div style={{ position: "relative", width: "240px" }}>
              <FiSearch
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
                size={14}
              />
              <input
                type="text"
                placeholder="Search staff name / position..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 34px",
                  borderRadius: "10px",
                  border: "1.5px solid #E2E8F0",
                  fontSize: "12px",
                  color: "#1e293b",
                  outline: "none",
                  background: "#F8FAFC",
                }}
              />
            </div>

            {/* Grant All Allowances to Filtered */}
            <button
              type="button"
              onClick={() => handleAllAllowancesBulkToggle(true)}
              disabled={isLocked || filteredPersonnel.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: "700",
                cursor:
                  isLocked || filteredPersonnel.length === 0
                    ? "not-allowed"
                    : "pointer",
                background: isLocked ? "#F1F5F9" : "#ECFDF5",
                color: isLocked ? "#94A3B8" : "#059669",
                border: isLocked ? "1px solid #CBD5E1" : "1.5px solid #A7F3D0",
              }}
              title={
                isLocked
                  ? "Module is locked"
                  : "Grant all configured allowances to currently filtered personnel"
              }
            >
              <FiCheckCircle size={14} />
              <span>Grant All to Filtered</span>
            </button>

            {/* Clear All Allowances for Filtered */}
            <button
              type="button"
              onClick={() => handleAllAllowancesBulkToggle(false)}
              disabled={isLocked || filteredPersonnel.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: "700",
                cursor:
                  isLocked || filteredPersonnel.length === 0
                    ? "not-allowed"
                    : "pointer",
                background: isLocked ? "#F1F5F9" : "#FEF2F2",
                color: isLocked ? "#94A3B8" : "#DC2626",
                border: isLocked ? "1px solid #CBD5E1" : "1.5px solid #FECDD3",
              }}
              title={
                isLocked
                  ? "Module is locked"
                  : "Clear all allowances for currently filtered personnel"
              }
            >
              <FiXCircle size={14} />
              <span>Clear Filtered</span>
            </button>
          </div>
        </div>

        {/* ALLOWANCE MATRIX TABLE */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1.5px solid var(--line, #e2e8f0)",
            overflow: "hidden",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", width: "100%", overflow: "hidden" }}>
            {/* LEFT SIDE: FIXED PERSONNEL INFO COLUMN */}
            <div
              style={{
                width: "320px",
                flexShrink: 0,
                borderRight: "2px solid var(--line, #cbd5e1)",
                background: "#ffffff",
                zIndex: 2,
              }}
            >
              {/* Header */}
              <div
                style={{
                  height: "64px",
                  padding: "0 20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  borderBottom: "2px solid var(--line, #cbd5e1)",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontWeight: "800",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#1E293B",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FiUsers size={13} /> Personnel List (
                  {filteredPersonnel.length})
                </div>
                <div
                  style={{
                    fontSize: "9.5px",
                    color: "#94a3b8",
                    textTransform: "none",
                    fontWeight: "normal",
                    marginTop: "2px",
                  }}
                >
                  Registered School Plantilla &amp; Staff
                </div>
              </div>

              {/* Rows */}
              {filteredPersonnel.length === 0 ? (
                <div
                  style={{
                    padding: "30px 20px",
                    color: "#94a3b8",
                    fontSize: "13px",
                    textAlign: "center",
                  }}
                >
                  No personnel found in this category.
                </div>
              ) : (
                filteredPersonnel.map((p) => {
                  const fullName =
                    `${p.lastName}, ${p.firstName}`.toUpperCase();
                  const cat = getPersonnelCategory(p);
                  const catBadgeStyle =
                    cat === "teaching"
                      ? { bg: "#E0F2FE", color: "#0369A1", label: "Teaching" }
                      : cat === "teaching-related"
                        ? { bg: "#EDE9FE", color: "#6D28D9", label: "Related" }
                        : {
                            bg: "#FEF3C7",
                            color: "#B45309",
                            label: "Non-Teaching",
                          };

                  return (
                    <div
                      key={p.id}
                      style={{
                        height: "60px",
                        padding: "0 20px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        borderBottom: "1px solid var(--line, #e2e8f0)",
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: "700",
                            fontSize: "13px",
                            color: "var(--navy, #0f172a)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {fullName}
                        </div>
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: "800",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: catBadgeStyle.bg,
                            color: catBadgeStyle.color,
                            flexShrink: 0,
                          }}
                        >
                          {catBadgeStyle.label}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#64748b",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.position || "Staff"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* RIGHT SIDE: SCROLLABLE ALLOWANCE CHECKBOX COLUMNS */}
            <div style={{ flexGrow: 1, overflowX: "auto" }}>
              {/* Headers with Master Select All / Unselect All */}
              <div
                style={{
                  display: "flex",
                  height: "64px",
                  borderBottom: "2px solid var(--line, #cbd5e1)",
                  background: "#f8fafc",
                }}
              >
                {allowanceConfig.map((conf) => {
                  const checkStatus = getColumnCheckStatus(conf.key);
                  const isAllChecked = checkStatus === "checked";
                  const isIndeterminate = checkStatus === "indeterminate";

                  return (
                    <div
                      key={conf.key}
                      style={{
                        flex: 1,
                        minWidth: "220px",
                        padding: "8px 16px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        borderRight: "1px solid var(--line, #cbd5e1)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "8px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: "800",
                              fontSize: "11px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: "#1E293B",
                            }}
                          >
                            {conf.label}
                          </div>
                          <div
                            style={{
                              fontSize: "9px",
                              color: "#94a3b8",
                              textTransform: "none",
                              fontWeight: "normal",
                              marginTop: "1px",
                            }}
                          >
                            {conf.desc}
                          </div>
                        </div>

                        {/* Master Header Checkbox */}
                        <button
                          type="button"
                          onClick={() =>
                            handleColumnBulkToggle(
                              conf.key,
                              conf.label,
                              !isAllChecked,
                            )
                          }
                          disabled={isLocked || filteredPersonnel.length === 0}
                          style={{
                            background: "none",
                            border: "none",
                            cursor:
                              isLocked || filteredPersonnel.length === 0
                                ? "not-allowed"
                                : "pointer",
                            color: isAllChecked
                              ? "#10B981"
                              : isIndeterminate
                                ? "#F59E0B"
                                : "#94A3B8",
                            padding: "2px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          title={
                            isLocked
                              ? "Module is locked"
                              : isAllChecked
                                ? `Unselect all for ${conf.label}`
                                : `Select all for ${conf.label}`
                          }
                        >
                          {isAllChecked ? (
                            <FiCheckSquare
                              size={17}
                              color={isLocked ? "#94A3B8" : "#10B981"}
                            />
                          ) : isIndeterminate ? (
                            <FiMinusSquare
                              size={17}
                              color={isLocked ? "#94A3B8" : "#F59E0B"}
                            />
                          ) : (
                            <FiSquare size={17} color="#94A3B8" />
                          )}
                        </button>
                      </div>

                      {/* Header Quick Select / Clear Links */}
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          alignItems: "center",
                          marginTop: "2px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleColumnBulkToggle(conf.key, conf.label, true)
                          }
                          disabled={
                            isLocked ||
                            filteredPersonnel.length === 0 ||
                            isAllChecked
                          }
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: "9.5px",
                            fontWeight: "700",
                            color:
                              isLocked || isAllChecked ? "#94A3B8" : "#0284C7",
                            cursor:
                              isLocked || isAllChecked ? "default" : "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          Select All
                        </button>
                        <span style={{ fontSize: "9px", color: "#CBD5E1" }}>
                          •
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleColumnBulkToggle(conf.key, conf.label, false)
                          }
                          disabled={
                            isLocked ||
                            filteredPersonnel.length === 0 ||
                            checkStatus === "unchecked"
                          }
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: "9.5px",
                            fontWeight: "700",
                            color:
                              isLocked || checkStatus === "unchecked"
                                ? "#94A3B8"
                                : "#DC2626",
                            cursor:
                              isLocked || checkStatus === "unchecked"
                                ? "default"
                                : "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          Unselect All
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              {filteredPersonnel.length === 0 ? (
                <div
                  style={{
                    height: "60px",
                    borderBottom: "1px solid var(--line, #e2e8f0)",
                  }}
                ></div>
              ) : (
                filteredPersonnel.map((p) => {
                  const fullName =
                    `${p.lastName}, ${p.firstName}`.toUpperCase();
                  const cat = getPersonnelCategory(p);
                  const personAllowances = allowancesMap[p.id] || {};

                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        height: "60px",
                        borderBottom: "1px solid var(--line, #e2e8f0)",
                        transition: "background-color 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = "#f1f5f9")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      {allowanceConfig.map((conf) => {
                        const isNonTeachingSupplies =
                          conf.key === "supplies" && cat === "non-teaching";
                        const isOptedOut = isAllowanceDisabled(
                          personAllowances,
                          conf.key,
                        );
                        const isChecked =
                          !isNonTeachingSupplies &&
                          !isOptedOut &&
                          Boolean(personAllowances[conf.key]);
                        const isInputDisabled =
                          isLocked || isNonTeachingSupplies || isOptedOut;

                        return (
                          <div
                            key={conf.key}
                            style={{
                              flex: 1,
                              minWidth: "220px",
                              padding: "0 16px",
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              borderRight: "1px solid var(--line, #e2e8f0)",
                            }}
                          >
                            {isNonTeachingSupplies ? (
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "800",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  background: "#F8FAFC",
                                  color: "#94A3B8",
                                  border: "1px solid #E2E8F0",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                N/A (NON-TEACHING)
                              </span>
                            ) : (
                              <>
                                <input
                                  type="checkbox"
                                  disabled={isInputDisabled}
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    minHeight: "auto",
                                    padding: "0",
                                    margin: "0",
                                    border: "none",
                                    background: "none",
                                    cursor: isInputDisabled
                                      ? "not-allowed"
                                      : "pointer",
                                    appearance: "checkbox",
                                    WebkitAppearance: "checkbox",
                                  }}
                                  checked={isChecked}
                                  onChange={() =>
                                    handleCheckboxToggle(
                                      p.id,
                                      fullName,
                                      conf,
                                      cat,
                                    )
                                  }
                                />

                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "bold",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    background: isChecked
                                      ? "#dcfce7"
                                      : "#f1f5f9",
                                    color: isChecked ? "#15803d" : "#94a3b8",
                                    border: isChecked
                                      ? "1px solid #bbf7d0"
                                      : "1px solid #e2e8f0",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  {isChecked ? (
                                    <>
                                      <FiCheck size={11} /> GRANTED
                                    </>
                                  ) : isOptedOut ? (
                                    "DISABLED"
                                  ) : (
                                    "OFF"
                                  )}
                                </span>
                                <button
                                  type="button"
                                  disabled={isLocked}
                                  onClick={() =>
                                    handleDisableToggle(
                                      p.id,
                                      fullName,
                                      conf,
                                      !isOptedOut,
                                    )
                                  }
                                  title={
                                    isOptedOut
                                      ? `Enable ${conf.label} for this personnel`
                                      : `Disable ${conf.label} for this personnel (ignored in compliance)`
                                  }
                                  style={{
                                    marginLeft: "auto",
                                    background: "none",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "6px",
                                    fontSize: "10px",
                                    fontWeight: "700",
                                    padding: "2px 6px",
                                    color: isOptedOut ? "#B45309" : "#64748b",
                                    cursor: isLocked
                                      ? "not-allowed"
                                      : "pointer",
                                  }}
                                >
                                  {isOptedOut ? "Enable" : "Disable"}
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div
          style={{
            marginTop: "30px",
            padding: "16px 24px",
            background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
            borderRadius: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.3)",
          }}
        >
          <div>
            <h4
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: "800",
                color: "#F8FAFC",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Allowances &amp; Incentives{" "}
              {isLocked ? "(Read-Only)" : "(Active)"}
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "800",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: isLocked
                    ? "rgba(255, 255, 255, 0.15)"
                    : "#059669",
                  color: "#FFFFFF",
                }}
              >
                {isLocked ? "LOCKED" : "DEV UNLOCKED"}
              </span>
            </h4>
            <p style={{ margin: 0, fontSize: "11px", color: "#94A3B8" }}>
              {isLocked
                ? "Module is locked for policy alignment. Proceed to Node 11 (Validation Center) for quality audits & submission."
                : "DEV mode active: Allowances can be audited and edited for testing."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setActiveView("nodemap")}
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "#FFFFFF",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "10px",
                padding: "10px 18px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FiMap size={14} />
              <span>Return to Node Map</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("validation")}
              style={{
                background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: "800",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>Proceed to Validation Center ➔</span>
            </button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
