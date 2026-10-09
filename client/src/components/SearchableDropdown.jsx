import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiEdit3, FiSearch, FiX } from "react-icons/fi";

export default function SearchableDropdown({
  options = [],
  value = "",
  onChange,
  placeholder = "Select...",
  disabled = false,
  required = false,
  allowCustom = false,
  compact = false,
  placement = "auto",
  style = {},
  menuStyle = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(placement === "top");
  const [coords, setCoords] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    width: 0,
  });
  const [search, setSearch] = useState("");
  const wrapperRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  const updatePosition = () => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let isUp = false;
    if (placement === "top") {
      isUp = true;
    } else if (placement === "bottom") {
      isUp = false;
    } else {
      isUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    }
    setOpenUpward(isUp);

    const minW = compact ? 180 : 220;
    const menuWidth = Math.max(rect.width, minW);
    let leftPos = rect.left;
    if (leftPos + menuWidth > window.innerWidth - 8) {
      leftPos = Math.max(8, window.innerWidth - menuWidth - 8);
    }

    setCoords({
      top: rect.bottom + 4,
      bottom: window.innerHeight - rect.top + 4,
      left: leftPos,
      width: menuWidth,
    });
  };

  // Keep menu positioned accurately and listen for parent/window scrolls
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScrollOrResize = () => {
        updatePosition();
      };

      window.addEventListener("resize", handleScrollOrResize);
      window.addEventListener("scroll", handleScrollOrResize, true);

      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus({ preventScroll: true });
        }
      }, 30);

      return () => {
        window.removeEventListener("resize", handleScrollOrResize);
        window.removeEventListener("scroll", handleScrollOrResize, true);
        clearTimeout(timer);
      };
    }
  }, [isOpen, placement, compact]);

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target) &&
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Reset search text when closed
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  // Normalize options to { value, label } objects
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === "object" && opt !== null) {
      return {
        value: opt.value !== undefined ? opt.value : opt.id || "",
        label: opt.label || opt.name || String(opt.value || ""),
      };
    }
    return { value: String(opt), label: String(opt) };
  });

  const filteredOptions = normalizedOptions.filter((opt) => {
    const s = search.toLowerCase();
    return (
      String(opt.label).toLowerCase().includes(s) ||
      String(opt.value).toLowerCase().includes(s)
    );
  });

  const selectedOpt = normalizedOptions.find(
    (opt) => String(opt.value) === String(value),
  );
  const displayLabel = selectedOpt
    ? selectedOpt.label
    : typeof value === "string" && value
      ? value
      : "";
  const isRed = required && !displayLabel;

  const isCustomOptionMatch =
    allowCustom &&
    search.trim().length > 0 &&
    !normalizedOptions.some(
      (opt) =>
        String(opt.label).toUpperCase() === search.trim().toUpperCase() ||
        String(opt.value).toUpperCase() === search.trim().toUpperCase(),
    );

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isCustomOptionMatch) {
        onChange(search.trim().toUpperCase());
        setIsOpen(false);
      } else if (filteredOptions.length > 0) {
        onChange(filteredOptions[0].value);
        setIsOpen(false);
      }
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="searchable-dropdown-container"
      style={{ position: "relative", width: "100%", ...style }}
    >
      <div
        className={`searchable-dropdown-toggle ${isOpen ? "active" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: compact ? "4px 8px" : "10px 14px",
          background: disabled ? "#f1f5f9" : "white",
          border: isRed
            ? "1.5px solid var(--red, #EF4444)"
            : isOpen
              ? "1.5px solid var(--blue, #0284C7)"
              : "1.5px solid #CBD5E1",
          borderRadius: compact ? "6px" : "12px",
          color: disabled ? "#94a3b8" : displayLabel ? "#0F172A" : "#64748B",
          cursor: disabled ? "not-allowed" : "pointer",
          minHeight: compact ? "32px" : "42px",
          fontSize: compact ? "12px" : "14px",
          fontWeight: compact ? "700" : "normal",
          boxSizing: "border-box",
          boxShadow:
            !disabled && isOpen ? "0 0 0 2.5px rgba(2, 132, 199, 0.2)" : "none",
          transition: "all 0.15s ease",
          userSelect: "none",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginRight: "4px",
          }}
        >
          {displayLabel || placeholder}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: disabled ? "#94a3b8" : "#0284C7",
            flexShrink: 0,
            transition: "transform 0.2s",
            transform: isOpen
              ? openUpward
                ? "rotate(0deg)"
                : "rotate(180deg)"
              : openUpward
                ? "rotate(180deg)"
                : "rotate(0deg)",
          }}
        >
          <FiChevronDown size={compact ? 12 : 14} />
        </span>
      </div>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="searchable-dropdown-menu"
            style={{
              position: "fixed",
              ...(openUpward
                ? {
                    bottom: `${coords.bottom}px`,
                    top: "auto",
                    boxShadow:
                      "0 -10px 25px -5px rgba(15, 23, 42, 0.2), 0 -8px 10px -6px rgba(15, 23, 42, 0.15)",
                  }
                : {
                    top: `${coords.top}px`,
                    bottom: "auto",
                    boxShadow:
                      "0 10px 25px -5px rgba(15, 23, 42, 0.2), 0 8px 10px -6px rgba(15, 23, 42, 0.15)",
                  }),
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 999999,
              background: "white",
              border: "1.5px solid #CBD5E1",
              borderRadius: compact ? "8px" : "12px",
              overflow: "hidden",
              maxHeight: "260px",
              display: "flex",
              flexDirection: "column",
              ...menuStyle,
            }}
          >
            <div
              style={{
                padding: "6px 8px",
                borderBottom: "1.5px solid #E2E8F0",
                background: "#F8FAFC",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FiSearch size={13} color="#64748B" style={{ flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  background: "white",
                  border: "1px solid #CBD5E1",
                  borderRadius: "6px",
                  color: "#0F172A",
                  fontSize: "12px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#94A3B8",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <FiX size={12} />
                </button>
              )}
            </div>
            <div style={{ overflowY: "auto", flex: 1, maxHeight: "200px" }}>
              {isCustomOptionMatch && (
                <div
                  onClick={() => {
                    onChange(search.trim().toUpperCase());
                    setIsOpen(false);
                  }}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "#0284C7",
                    fontWeight: "700",
                    background: "#F0F9FF",
                    borderBottom: "1px dashed #BAE6FD",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FiEdit3 size={12} style={{ flexShrink: 0 }} /> Use Custom: "
                  {search.trim().toUpperCase()}"
                </div>
              )}
              {filteredOptions.length > 0
                ? filteredOptions.map((opt) => {
                    const isSelected = String(opt.value) === String(value);
                    return (
                      <div
                        key={String(opt.value)}
                        onClick={() => {
                          onChange(opt.value);
                          setIsOpen(false);
                        }}
                        style={{
                          padding: compact ? "6px 10px" : "8px 12px",
                          cursor: "pointer",
                          fontSize: compact ? "12px" : "13px",
                          color: isSelected ? "#0284C7" : "#0F172A",
                          fontWeight: isSelected ? "700" : "500",
                          background: isSelected ? "#E0F2FE" : "transparent",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.background = "#F1F5F9";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {opt.label}
                      </div>
                    );
                  })
                : !isCustomOptionMatch && (
                    <div
                      style={{
                        padding: "12px 14px",
                        color: "#94A3B8",
                        fontSize: "12px",
                        textAlign: "center",
                        fontStyle: "italic",
                      }}
                    >
                      No matching options found
                    </div>
                  )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
