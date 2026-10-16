import React, { useState } from "react";
import {
  FiAlertTriangle,
  FiDatabase,
  FiChevronUp,
  FiChevronDown,
} from "react-icons/fi";
import { isStagingEnvironment } from "../utils/environment";

export default function StagingHeader() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Strictly render only in staging environments
  if (!isStagingEnvironment()) return null;

  if (isCollapsed) {
    return (
      <div
        role="banner"
        aria-label="Staging Environment Indicator"
        style={{
          position: "fixed",
          top: "8px",
          right: "12px",
          zIndex: 999999,
          background: "#B45309",
          color: "#FFFFFF",
          padding: "4px 10px",
          borderRadius: "999px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11px",
          fontWeight: "800",
          letterSpacing: "0.04em",
          cursor: "pointer",
          border: "1.5px solid #F59E0B",
          userSelect: "none",
        }}
        onClick={() => setIsCollapsed(false)}
        title="Click to expand testing site notice"
      >
        <FiAlertTriangle size={13} color="#FEF3C7" />
        <span>TESTING SITE</span>
        <FiChevronDown size={14} color="#FEF3C7" />
      </div>
    );
  }

  return (
    <aside
      role="banner"
      aria-label="Staging Environment Alert Header"
      style={{
        width: "100%",
        background:
          "linear-gradient(90deg, #78350F 0%, #92400E 30%, #B45309 50%, #92400E 70%, #78350F 100%)",
        borderBottom: "2px solid #F59E0B",
        boxShadow: "0 4px 16px rgba(120, 53, 15, 0.35)",
        color: "#FFFFFF",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        fontSize: "12.5px",
        fontWeight: "600",
        position: "sticky",
        top: 0,
        zIndex: 999999,
        letterSpacing: "0.01em",
        userSelect: "none",
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Left: Prominent Badge + Testing Notice */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "#FEF3C7",
            color: "#78350F",
            fontWeight: "800",
            fontSize: "10.5px",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: "6px",
            border: "1px solid #F59E0B",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
          }}
        >
          <FiAlertTriangle size={12} color="#B45309" />
          STAGING
        </span>

        <span
          style={{
            fontSize: "13px",
            fontWeight: "800",
            color: "#FEF3C7",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          THIS SITE IS FOR TESTING PURPOSES ONLY.
        </span>

        <span
          style={{
            fontSize: "12px",
            fontWeight: "500",
            color: "rgba(255, 255, 255, 0.9)",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          • Data is isolated in the staging database and will not affect
          official DepEd eSF7 records.
        </span>
      </div>

      {/* Right: DB Isolation Info + Minimize Toggle */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            fontWeight: "700",
            color: "#FEF3C7",
            background: "rgba(0, 0, 0, 0.22)",
            padding: "3px 10px",
            borderRadius: "6px",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            whiteSpace: "nowrap",
          }}
        >
          <FiDatabase size={11} color="#F59E0B" />
          <span>DB: insighted_esf7_staging</span>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255, 255, 255, 0.75)",
            cursor: "pointer",
            padding: "2px 4px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#FFFFFF";
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255, 255, 255, 0.75)";
            e.currentTarget.style.background = "transparent";
          }}
          title="Minimize header notice"
          aria-label="Minimize header notice"
        >
          <FiChevronUp size={16} />
        </button>
      </div>
    </aside>
  );
}
