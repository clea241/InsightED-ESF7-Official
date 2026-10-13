import React, { useState } from "react";
import { FiArrowLeft, FiLogOut, FiRotateCcw, FiMap, FiSave } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { checkBeforeLeave, isAnyScreenDirty } from "../services/dirtyGuard";
import LogoutPasscodeModal from "./LogoutPasscodeModal";

export default function PortalHeader({
  departmentText = "DEPARTMENT OF EDUCATION",
  bureauText,
  title = "Registry Management Portal",
  description = "Access, audit, and organize personnel registries across regional divisions in a unified visual system.",
  onBack,
  backText = "Back to Node Map",
  actionButton,
  onLogout,
  showLogout = false,
  showDiscard = true,
  onDiscard,
  showNodeMap = false,
  onNodeMap,
  onContinue,
  continueText = "Save",
  continueDisabled = false,
  onSave,
  saveText,
  saveDisabled,
}) {
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const auth = useAuth();
  const app = useApp();

  const authLogout = auth?.logout || null;
  const schoolInfo = app?.schoolInfo || null;
  const appDiscardDraft = app?.discardLocalDraft || null;
  const appSetActiveView = app?.setActiveView || null;
  const isSaveDisabled =
    saveDisabled !== undefined ? saveDisabled : continueDisabled;

  const rawSchoolId =
    schoolInfo?.schoolId ||
    schoolInfo?.school_id ||
    auth?.user?.school_id ||
    auth?.user?.schoolId ||
    "";
  const displaySchoolId = rawSchoolId
    ? String(rawSchoolId).replace(/^SCH-/i, "").trim()
    : "";

  const dynamicBureauText =
    bureauText ||
    (schoolInfo && schoolInfo.schoolName
      ? (displaySchoolId
          ? `${String(schoolInfo.schoolName).toUpperCase()} • ${displaySchoolId} • ${schoolInfo.schoolYear || "SY 2026-2027"}`
          : `${String(schoolInfo.schoolName).toUpperCase()} • ${schoolInfo.schoolYear || "SY 2026-2027"}`)
      : (displaySchoolId
          ? `PURO INTEGRATED SCHOOL • ${displaySchoolId} • SY 2026-2027`
          : "PURO INTEGRATED SCHOOL • SY 2026-2027"));

  const handleLogoutClick = async () => {
    if (isAnyScreenDirty()) {
      const canProceed = await checkBeforeLeave({ actionType: "logout" });
      if (!canProceed) return;
    }
    setIsLogoutModalOpen(true);
  };

  const handleDiscardClick = () => {
    if (onDiscard) {
      onDiscard();
    } else if (appDiscardDraft) {
      appDiscardDraft();
    }
  };

  return (
    <>
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          margin: "0 0 16px 0",
          gap: "12px",
        }}
      >
        {/* 1. 50% Lighter Translucent Gray Glass Header Card */}
        <header
          style={{
            width: "100%",
            background: "rgba(248, 250, 252, 0.35)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(226, 232, 240, 0.6)",
            borderRadius: "16px",
            padding: "18px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "4px",
            boxShadow: "0 8px 20px -4px rgba(15, 23, 42, 0.02)",
          }}
        >
          {/* Dual-Accent Eyebrow Tag with Pipe Separator */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
              marginBottom: "2px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: "900",
                letterSpacing: "0.18em",
                color: "#1D4ED8",
                textTransform: "uppercase",
                lineHeight: "1.4",
              }}
            >
              {departmentText}
            </span>
            <span
              style={{ color: "#CBD5E1", fontSize: "11px", fontWeight: "600" }}
            >
              |
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "800",
                letterSpacing: "0.18em",
                color: "#D97706",
                textTransform: "uppercase",
                lineHeight: "1.4",
              }}
            >
              {dynamicBureauText}
            </span>
          </div>

          {/* H1 Main Title */}
          <h1
            style={{
              fontSize: "30px",
              fontWeight: "800",
              color: "#0F172A",
              letterSpacing: "-0.025em",
              lineHeight: "1.2",
              margin: 0,
            }}
          >
            {title}
          </h1>

          {/* Subtitle Description */}
          <p
            style={{
              fontSize: "13.5px",
              fontWeight: "500",
              color: "#475569",
              maxWidth: "850px",
              lineHeight: "1.5",
              marginTop: "4px",
              margin: 0,
            }}
          >
            {description}
          </p>
        </header>

        {/* 2. Standalone Controls Row BELOW Header Card */}
        {(onBack ||
          actionButton ||
          showDiscard ||
          showNodeMap ||
          onSave ||
          onContinue ||
          (showLogout && (handleLogoutClick || onLogout || authLogout))) && (
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            {/* Left Side: Back Button OR Executive Dashboard Logout Button */}
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "38px",
                  boxSizing: "border-box",
                  gap: "8px",
                  padding: "0 18px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  lineHeight: 1,
                  color: "#FFFFFF",
                  background:
                    "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 18px rgba(37, 99, 235, 0.45)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow =
                    "0 4px 12px rgba(37, 99, 235, 0.35)";
                }}
              >
                <FiArrowLeft style={{ fontSize: "15px", color: "#FFFFFF", flexShrink: 0 }} />
                <span>{backText}</span>
              </button>
            ) : showLogout ? (
              <button
                type="button"
                onClick={handleLogoutClick}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "38px",
                  boxSizing: "border-box",
                  gap: "6px",
                  padding: "0 16px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  lineHeight: 1,
                  color: "#DC2626",
                  background: "rgba(254, 226, 226, 0.7)",
                  border: "1px solid rgba(252, 165, 165, 0.8)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.03)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#EF4444";
                  e.currentTarget.style.color = "#FFFFFF";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 12px rgba(239, 68, 68, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(254, 226, 226, 0.7)";
                  e.currentTarget.style.color = "#DC2626";
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow =
                    "0 2px 6px rgba(0, 0, 0, 0.03)";
                }}
                title="Log out of InsightED"
              >
                <FiLogOut
                  style={{ fontSize: "14px", transform: "scaleX(-1)", flexShrink: 0 }}
                />
                <span>Logout</span>
              </button>
            ) : (
              <div />
            )}

            {/* Right Side: Save, Discard Changes, Node Map, & Custom Action Buttons */}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              {(onSave || onContinue) && (
                <button
                  type="button"
                  onClick={onSave || onContinue}
                  disabled={isSaveDisabled}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "38px",
                    boxSizing: "border-box",
                    gap: "7px",
                    padding: "0 22px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: "900",
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                    color: "#FFFFFF",
                    background: isSaveDisabled
                      ? "linear-gradient(135deg, rgba(16, 185, 129, 0.55) 0%, rgba(5, 150, 105, 0.55) 100%)"
                      : "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                    border: isSaveDisabled
                      ? "1px solid rgba(16, 185, 129, 0.4)"
                      : "none",
                    cursor: isSaveDisabled ? "not-allowed" : "pointer",
                    boxShadow: isSaveDisabled
                      ? "0 2px 8px rgba(16, 185, 129, 0.18)"
                      : "0 4px 14px rgba(16, 185, 129, 0.45)",
                    opacity: isSaveDisabled ? 0.85 : 1,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaveDisabled) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow =
                        "0 6px 18px rgba(16, 185, 129, 0.55)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSaveDisabled) {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow =
                        "0 4px 14px rgba(16, 185, 129, 0.45)";
                    }
                  }}
                >
                  <FiSave style={{ fontSize: "14px", flexShrink: 0 }} />
                  <span>
                    {saveText ||
                      (continueText === "Save & Continue ➔"
                        ? "Save"
                        : continueText)}
                  </span>
                </button>
              )}

              {showDiscard && (
                <button
                  type="button"
                  onClick={handleDiscardClick}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "38px",
                    boxSizing: "border-box",
                    gap: "6px",
                    padding: "0 15px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: "700",
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                    color: isSaveDisabled ? "#94A3B8" : "#DC2626",
                    background: isSaveDisabled
                      ? "rgba(248, 250, 252, 0.85)"
                      : "#FFFFFF",
                    border: isSaveDisabled
                      ? "1px solid #E2E8F0"
                      : "1px solid rgba(239, 68, 68, 0.35)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: isSaveDisabled
                      ? "none"
                      : "0 1px 3px rgba(0, 0, 0, 0.04)",
                  }}
                  onMouseEnter={(e) => {
                    if (isSaveDisabled) {
                      e.currentTarget.style.background = "#F1F5F9";
                      e.currentTarget.style.borderColor = "#CBD5E1";
                      e.currentTarget.style.color = "#64748B";
                    } else {
                      e.currentTarget.style.background = "#FEF2F2";
                      e.currentTarget.style.borderColor =
                        "rgba(239, 68, 68, 0.55)";
                      e.currentTarget.style.color = "#B91C1C";
                      e.currentTarget.style.boxShadow =
                        "0 2px 8px rgba(239, 68, 68, 0.15)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isSaveDisabled) {
                      e.currentTarget.style.background =
                        "rgba(248, 250, 252, 0.85)";
                      e.currentTarget.style.borderColor = "#E2E8F0";
                      e.currentTarget.style.color = "#94A3B8";
                    } else {
                      e.currentTarget.style.background = "#FFFFFF";
                      e.currentTarget.style.borderColor =
                        "rgba(239, 68, 68, 0.35)";
                      e.currentTarget.style.color = "#DC2626";
                      e.currentTarget.style.boxShadow =
                        "0 1px 3px rgba(0, 0, 0, 0.04)";
                    }
                  }}
                  title="Discard unsaved local changes and reload template"
                >
                  <FiRotateCcw style={{ fontSize: "13px", flexShrink: 0 }} />
                  <span>Discard Changes</span>
                </button>
              )}

              {showNodeMap && (
                <button
                  type="button"
                  onClick={
                    onNodeMap ||
                    (() => appSetActiveView && appSetActiveView("nodemap"))
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "38px",
                    boxSizing: "border-box",
                    gap: "6px",
                    padding: "0 16px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: "800",
                    lineHeight: 1,
                    color: "var(--navy, #08315F)",
                    background: "#FFFFFF",
                    border: "1px solid var(--line, #BAE6FD)",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.03)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--blue, #0284C7)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(2, 132, 199, 0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--line, #BAE6FD)";
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow =
                      "0 2px 6px rgba(0, 0, 0, 0.03)";
                  }}
                  title="Return to Journey Node Map"
                >
                  <FiMap style={{ fontSize: "13px", flexShrink: 0 }} />
                  <span>Node Map</span>
                </button>
              )}

              {actionButton}
            </div>
          </div>
        )}
      </div>

      {/* Security Passcode Modal on Logout */}
      <LogoutPasscodeModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
      />
    </>
  );
}
