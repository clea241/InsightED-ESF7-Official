import React, { useState, useRef, useEffect } from "react";
import { FiCheck } from "react-icons/fi";

/**
 * PasscodeDeck - An interactive "Hand of Cards" OTP / Passcode Deck micro-interaction.
 * Features:
 * - Shared pivot point: transform-origin: 50% 320% creates a natural playing card fan arc.
 * - Masked input mode: numbers are hidden behind sleek glowing password discs.
 * - On submit / loading: cards smoothly gather together into a stacked deck in the center with a glowing spinner.
 * - On success: deck locks together in emerald green and pops an animated checkmark icon.
 * - Dynamic SVG perimeter laser spark on keystroke using stroke-dashoffset animation.
 * - Auto-advance, auto-recede on backspace, arrow navigation, and clipboard paste.
 */
export default function PasscodeDeck({
  length = 6,
  value = ["", "", "", "", "", ""],
  onChange,
  onComplete,
  isError = false,
  isLoading = false,
  isSuccess = false,
  masked = true,
  disabled = false,
  autoFocus = true,
  className = "",
  style = {},
}) {
  const [focusedIndex, setFocusedIndex] = useState(autoFocus ? 0 : -1);
  const [sparkingIndex, setSparkingIndex] = useState(-1);
  const inputsRef = useRef([]);

  const isGathered = isLoading || isSuccess;

  // Calculate deck spread angles and translations dynamically based on length
  const slots = Array.from({ length }, (_, i) => {
    const mid = (length - 1) / 2;
    const offset = i - mid;
    // Angle spread: smoothly spans from -6.5deg to +6.5deg
    const angle = (offset / mid) * 6.5;
    const dx = offset * 2.5;
    const dy = Math.abs(offset) * 1.5;
    return {
      index: i,
      val: Array.isArray(value) ? value[i] || "" : String(value)[i] || "",
      angle,
      dx,
      dy,
    };
  });

  // Focus management
  useEffect(() => {
    if (autoFocus && inputsRef.current[0] && !disabled && !isGathered) {
      inputsRef.current[0].focus();
    }
  }, [autoFocus, disabled, isGathered]);

  const triggerSpark = (index) => {
    setSparkingIndex(index);
    setTimeout(() => {
      setSparkingIndex((curr) => (curr === index ? -1 : curr));
    }, 650);
  };

  const handleInputChange = (index, rawVal) => {
    if (disabled || isGathered) return;
    const char = rawVal.replace(/\D/g, "").slice(-1);

    const currentArr = Array.isArray(value)
      ? [...value]
      : Array.from({ length }, (_, i) => String(value)[i] || "");

    currentArr[index] = char;

    if (char) {
      triggerSpark(index);
    }

    if (onChange) {
      onChange(currentArr, currentArr.join(""));
    }

    // Auto-advance to next input
    if (char && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }

    // Check if fully filled
    if (char && index === length - 1) {
      const fullPin = currentArr.join("");
      if (fullPin.length === length && onComplete) {
        onComplete(fullPin);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (disabled || isGathered) return;

    if (e.key === "Backspace") {
      const currentVal = Array.isArray(value)
        ? value[index]
        : String(value)[index] || "";
      if (!currentVal && index > 0) {
        e.preventDefault();
        const currentArr = Array.isArray(value)
          ? [...value]
          : Array.from({ length }, (_, i) => String(value)[i] || "");
        currentArr[index - 1] = "";
        if (onChange) onChange(currentArr, currentArr.join(""));
        inputsRef.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (disabled || isGathered) return;
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!pasted) return;

    const newArr = Array.from({ length }, (_, i) => pasted[i] || "");
    if (onChange) {
      onChange(newArr, newArr.join(""));
    }

    pasted.split("").forEach((_, i) => {
      setTimeout(() => triggerSpark(i), i * 50);
    });

    const targetFocus = Math.min(pasted.length, length - 1);
    inputsRef.current[targetFocus]?.focus();
    setFocusedIndex(targetFocus);

    if (pasted.length === length && onComplete) {
      onComplete(pasted);
    }
  };

  return (
    <div
      className={`passcode-deck-wrapper ${isError ? "passcode-deck-error" : ""} ${isGathered ? "passcode-deck-gathered" : ""} ${isSuccess ? "passcode-deck-success" : ""} ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "16px 8px 14px",
        perspective: "1000px",
        position: "relative",
        minHeight: "84px",
        ...style,
      }}
      onPaste={handlePaste}
    >
      <div
        className="passcode-deck-fan"
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {slots.map(({ index, val, angle, dx, dy }) => {
          const isFocused = focusedIndex === index && !isGathered;
          const isFilled = Boolean(val);
          const isSparking = sparkingIndex === index && !isGathered;

          // Normal fanned card transform vs lifted when active vs stacked deck when gathered
          const baseTransform = `translate(${dx}px, ${dy}px) rotate(${angle}deg)`;
          const activeTransform = `translate(${dx}px, ${dy - 7}px) rotate(${angle * 0.75}deg) scale(1.06)`;

          // When gathered/stacked (loading or success):
          // Each card converges from its 54px slot directly to the center with a slight card-deck tilt
          const mid = (length - 1) / 2;
          const stackOffset = index - mid;
          const gatheredTransform = `translate(${stackOffset * -54 + stackOffset * 1.5}px, ${Math.abs(stackOffset) * -0.6}px) rotate(${stackOffset * 0.75}deg) scale(0.98)`;

          return (
            <div
              key={index}
              className={`passcode-deck-slot ${isFocused ? "focused" : ""} ${isFilled ? "filled" : ""} ${isSparking ? "sparking" : ""}`}
              onClick={() => {
                if (!disabled && !isGathered) {
                  inputsRef.current[index]?.focus();
                  setFocusedIndex(index);
                }
              }}
              style={{
                position: "relative",
                width: "46px",
                height: "56px",
                transformOrigin: "50% 320%",
                transform: isGathered
                  ? gatheredTransform
                  : isFocused
                    ? activeTransform
                    : baseTransform,
                transition:
                  "transform 0.45s cubic-bezier(0.34, 1.35, 0.64, 1), box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease",
                borderRadius: "14px",
                background: isSuccess
                  ? "#F0FDF4"
                  : disabled
                    ? "#F1F5F9"
                    : isFocused
                      ? "#FFFFFF"
                      : isFilled
                        ? "#F8FAFC"
                        : "#FFFFFF",
                border: isError
                  ? "2px solid #EF4444"
                  : isSuccess
                    ? "2.5px solid #16A34A"
                    : isFocused
                      ? "2px solid #0284C7"
                      : isFilled
                        ? "2px solid #94A3B8"
                        : "2px solid #CBD5E1",
                boxShadow: isError
                  ? "0 0 16px rgba(239, 68, 68, 0.35)"
                  : isSuccess
                    ? "0 10px 24px -4px rgba(22, 163, 74, 0.4), 0 0 0 3px rgba(34, 197, 94, 0.2)"
                    : isGathered
                      ? "0 8px 16px -2px rgba(15, 23, 42, 0.12), 0 2px 4px rgba(15, 23, 42, 0.06)"
                      : isFocused
                        ? "0 12px 24px -6px rgba(2, 132, 199, 0.3), 0 0 0 3px rgba(56, 189, 248, 0.25)"
                        : "0 2px 6px rgba(15, 23, 42, 0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: disabled || isGathered ? "default" : "pointer",
                userSelect: "none",
                zIndex: isGathered ? index + 1 : isFocused ? 20 : 10 - Math.abs(offsetMid(index, length)),
              }}
            >
              {/* Hidden Accessible Real Input */}
              <input
                ref={(el) => (inputsRef.current[index] = el)}
                id={`passcode-deck-${index}`}
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength="1"
                value={val}
                disabled={disabled || isGathered}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={() => !isGathered && setFocusedIndex(index)}
                onBlur={() =>
                  setFocusedIndex((curr) => (curr === index ? -1 : curr))
                }
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  width: "100%",
                  height: "100%",
                  cursor: isGathered ? "default" : "pointer",
                  margin: 0,
                  padding: 0,
                  border: "none",
                  zIndex: 5,
                }}
              />

              {/* Masked Password Bullet or Plain Digit */}
              {!isGathered && (
                <>
                  {isFilled ? (
                    masked ? (
                      /* Masked Glowing Disc (Input is NOT visible) */
                      <span
                        className="passcode-deck-dot"
                        style={{
                          width: "11px",
                          height: "11px",
                          borderRadius: "50%",
                          background: isError ? "#EF4444" : "#0284C7",
                          boxShadow: isError
                            ? "0 0 8px rgba(239, 68, 68, 0.7)"
                            : "0 0 8px rgba(56, 189, 248, 0.8)",
                          display: "inline-block",
                          animation:
                            "passcodeDotPop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                        }}
                      />
                    ) : (
                      /* Unmasked plain digit */
                      <span
                        className="passcode-deck-digit"
                        style={{
                          fontSize: "22px",
                          fontWeight: "900",
                          color: isError ? "#EF4444" : "#0F172A",
                          letterSpacing: "-0.5px",
                          fontFamily:
                            "'Plus Jakarta Sans', monospace, sans-serif",
                          animation:
                            "passcodeDigitPop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                        }}
                      >
                        {val}
                      </span>
                    )
                  ) : isFocused ? (
                    /* Glowing Neon Cursor */
                    <span
                      className="passcode-deck-cursor"
                      style={{
                        width: "2.5px",
                        height: "20px",
                        background: isError ? "#EF4444" : "#0284C7",
                        borderRadius: "2px",
                        boxShadow: isError
                          ? "0 0 8px #EF4444"
                          : "0 0 10px rgba(56, 189, 248, 0.8)",
                        animation: "passcodeBlink 0.9s infinite",
                      }}
                    />
                  ) : null}

                  {/* SVG Spark Laser Trail on Keystroke */}
                  <svg
                    className={`passcode-deck-spark-svg ${isSparking ? "active" : ""}`}
                    viewBox="0 0 46 56"
                    fill="none"
                    style={{
                      position: "absolute",
                      inset: "-2px",
                      width: "calc(100% + 4px)",
                      height: "calc(100% + 4px)",
                      pointerEvents: "none",
                      borderRadius: "14px",
                      overflow: "visible",
                      zIndex: 2,
                      opacity: isSparking ? 1 : 0,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <rect
                      x="2"
                      y="2"
                      width="42"
                      height="52"
                      rx="13"
                      pathLength="1"
                      stroke={isError ? "#EF4444" : "#38BDF8"}
                      strokeWidth="2.5"
                      strokeDasharray="0.25 0.75"
                      strokeDashoffset="0"
                      style={{
                        filter: isError
                          ? "drop-shadow(0 0 6px rgba(239, 68, 68, 0.9))"
                          : "drop-shadow(0 0 7px rgba(56, 189, 248, 0.95))",
                        animation: isSparking
                          ? "passcodeSparkLap 0.62s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                          : "none",
                      }}
                    />
                  </svg>
                </>
              )}
            </div>
          );
        })}

        {/* GATHERED DECK CENTER OVERLAY: Loading Spinner or Success Checkmark */}
        {isGathered && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 35,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            {isSuccess ? (
              /* Success Green Checkmark Pop */
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "#16A34A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  boxShadow:
                    "0 8px 20px rgba(22, 163, 74, 0.5), 0 0 0 4px rgba(34, 197, 94, 0.25)",
                  animation:
                    "passcodeSuccessPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                }}
              >
                <FiCheck size={26} strokeWidth={3.5} />
              </div>
            ) : isLoading ? (
              /* Loading Spinner inside the gathered deck */
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: "3px solid rgba(2, 132, 199, 0.2)",
                  borderTopColor: "#0284C7",
                  boxShadow: "0 0 12px rgba(56, 189, 248, 0.5)",
                  animation: "passcodeDeckSpin 0.75s linear infinite",
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Embedded High-Performance Keyframe Styles */}
      <style>{`
        @keyframes passcodeSparkLap {
          0% {
            stroke-dashoffset: 1;
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0;
          }
        }

        @keyframes passcodeDotPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          70% {
            transform: scale(1.35);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes passcodeDigitPop {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          70% {
            transform: scale(1.18);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes passcodeBlink {
          0%, 100% { opacity: 1; transform: scaleY(1); }
          50% { opacity: 0.15; transform: scaleY(0.85); }
        }

        @keyframes passcodeDeckSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes passcodeSuccessPop {
          0% {
            transform: scale(0.2) rotate(-20deg);
            opacity: 0;
          }
          75% {
            transform: scale(1.18) rotate(4deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        .passcode-deck-error .passcode-deck-fan {
          animation: passcodeDeckShake 0.45s ease-in-out;
        }

        @keyframes passcodeDeckShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px) rotate(-1.5deg); }
          40% { transform: translateX(8px) rotate(1.5deg); }
          60% { transform: translateX(-5px) rotate(-0.8deg); }
          80% { transform: translateX(5px) rotate(0.8deg); }
        }
      `}</style>
    </div>
  );
}

function offsetMid(index, length) {
  return index - (length - 1) / 2;
}
