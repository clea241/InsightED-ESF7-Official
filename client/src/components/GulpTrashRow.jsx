import React, { useState, useEffect, useRef } from "react";

/**
 * GulpTrashRow
 * Provides the "Bin Eats The Label" micro-interaction for table rows.
 * Features:
 * - Articulated SVG trash can with flip-up lid, chomping jitter, and snap-shut crunch.
 * - Exact vector calculation from the Personnel Name to the Trash Can mouth.
 * - Parabolic letter flight animation with rotational spin and scale-down.
 * - Gentle row collapse before permanent removal.
 */

export function GulpTrashIcon({
  isOpen = false,
  isEating = false,
  isChomped = false,
  size = 15,
  color = "currentColor",
}) {
  return (
    <span
      className={`gulp-bin-wrapper ${isEating ? "eating" : ""} ${isChomped ? "chomped" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        width: `${size + 4}px`,
        height: `${size + 6}px`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size + 4}
        height={size + 6}
        fill="none"
        style={{
          overflow: "visible",
          transition: "transform 0.15s ease",
        }}
      >
        {/* Articulated Lid (pivots open and snaps shut) */}
        <g
          className="gulp-lid"
          style={{
            transformOrigin: "20px 7px",
            transform: isOpen
              ? "rotate(-44deg) translate(-2px, -3px)"
              : "rotate(0deg)",
            transition: isChomped
              ? "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : "transform 0.28s cubic-bezier(0.34, 1.3, 0.64, 1)",
          }}
        >
          {/* Lid Handle */}
          <path
            d="M9 5.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Lid Bar */}
          <rect
            x="2.5"
            y="5.5"
            width="19"
            height="2.5"
            rx="1.25"
            fill={color}
          />
        </g>

        {/* Can Body */}
        <g
          className={`gulp-can-body ${isEating ? "jittering" : ""} ${isChomped ? "snapped" : ""}`}
        >
          <path
            d="M4.5 8.5l1.3 11.2a2 2 0 0 0 2 1.8h8.4a2 2 0 0 0 2-1.8L19.5 8.5"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Ribs inside can */}
          <line
            x1="9"
            y1="11.5"
            x2="9.5"
            y2="17.5"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.6"
          />
          <line
            x1="14.5"
            y1="11.5"
            x2="14"
            y2="17.5"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.6"
          />
        </g>
      </svg>

      {/* Tiny Puff Effect on Chomp */}
      {isChomped && (
        <span
          className="gulp-chomp-puff"
          style={{
            position: "absolute",
            top: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "12px",
            lineHeight: 1,
            pointerEvents: "none",
            animation: "gulpPuffPop 0.4s ease-out forwards",
          }}
        >
          💨
        </span>
      )}
    </span>
  );
}

export function GulpFlyingText({ text, targetVector, onComplete }) {
  const letters = Array.from(text || "");
  const charsCount = letters.length;
  const completedCountRef = useRef(0);

  const dx = targetVector?.deltaX || 450;
  const dy = targetVector?.deltaY || 0;

  return (
    <span
      className="gulp-flying-text-container"
      style={{
        display: "inline-block",
        position: "relative",
        whiteSpace: "pre-wrap",
        pointerEvents: "none",
      }}
    >
      {letters.map((char, index) => {
        // Stagger each letter by 24ms
        const delayMs = index * 24;

        return (
          <span
            key={index}
            className="gulp-flying-char"
            style={{
              display: "inline-block",
              animation:
                "letterGulpFlight 0.62s cubic-bezier(0.22, 0.61, 0.36, 1) forwards",
              animationDelay: `${delayMs}ms`,
              "--target-x": `${dx}px`,
              "--target-y": `${dy}px`,
              transformOrigin: "center",
            }}
            onAnimationEnd={() => {
              completedCountRef.current += 1;
              if (
                completedCountRef.current >= charsCount &&
                typeof onComplete === "function"
              ) {
                onComplete();
              }
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        );
      })}
    </span>
  );
}

export function GulpFlyingItem({
  children,
  targetVector,
  delayMs = 0,
  duration = 0.58,
  className = "",
  style = {},
}) {
  const dx = targetVector?.deltaX || 220;
  const dy = targetVector?.deltaY || 0;

  return (
    <span
      className={`gulp-flying-item ${className}`}
      style={{
        display: "inline-block",
        position: "relative",
        animation: `itemGulpFlight ${duration}s cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
        animationDelay: `${delayMs}ms`,
        "--target-x": `${dx}px`,
        "--target-y": `${dy}px`,
        pointerEvents: "none",
        transformOrigin: "center",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function GulpGlobalStyles() {
  return (
    <style>{`
      @keyframes letterGulpFlight {
        0% {
          transform: translate(0, 0) scale(1) rotate(0deg);
          opacity: 1;
          color: inherit;
        }
        25% {
          /* Lift up into air in an arc */
          transform: translate(calc(var(--target-x) * 0.22), calc(var(--target-y) - 34px)) scale(1.12) rotate(-14deg);
          color: #DC2626;
          text-shadow: 0 0 6px rgba(220, 38, 38, 0.4);
        }
        60% {
          /* Gliding swiftly towards bin */
          transform: translate(calc(var(--target-x) * 0.72), calc(var(--target-y) - 18px)) scale(0.72) rotate(40deg);
          opacity: 0.95;
          color: #EF4444;
        }
        88% {
          /* Directly above open mouth */
          transform: translate(calc(var(--target-x) * 0.95), calc(var(--target-y) - 4px)) scale(0.38) rotate(90deg);
          opacity: 0.9;
        }
        100% {
          /* Swallowed inside! */
          transform: translate(var(--target-x), calc(var(--target-y) + 4px)) scale(0.06) rotate(160deg);
          opacity: 0;
        }
      }

      @keyframes itemGulpFlight {
        0% {
          transform: translate(0, 0) scale(1) rotate(0deg);
          opacity: 1;
        }
        30% {
          /* Arc up into the air */
          transform: translate(calc(var(--target-x) * 0.28), calc(var(--target-y) - 36px)) scale(0.96) rotate(-16deg);
          opacity: 1;
          filter: drop-shadow(0 4px 10px rgba(220, 38, 38, 0.35));
        }
        70% {
          /* Gliding swiftly towards bin mouth */
          transform: translate(calc(var(--target-x) * 0.78), calc(var(--target-y) - 14px)) scale(0.55) rotate(42deg);
          opacity: 0.95;
        }
        90% {
          /* Approaching bin */
          transform: translate(calc(var(--target-x) * 0.95), calc(var(--target-y) - 2px)) scale(0.28) rotate(80deg);
          opacity: 0.9;
        }
        100% {
          /* Swallowed inside */
          transform: translate(var(--target-x), calc(var(--target-y) + 4px)) scale(0.04) rotate(140deg);
          opacity: 0;
        }
      }

      .gulp-can-body.jittering {
        animation: gulpCanJitter 0.16s ease-in-out infinite alternate;
      }

      @keyframes gulpCanJitter {
        0% {
          transform: translateY(0) rotate(-2deg);
        }
        100% {
          transform: translateY(-1.5px) rotate(2.5deg);
        }
      }

      .gulp-can-body.snapped {
        animation: gulpCanSnap 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes gulpCanSnap {
        0% {
          transform: scale(1.25) translateY(2px);
        }
        50% {
          transform: scale(0.9, 1.15) translateY(-2px);
        }
        100% {
          transform: scale(1) translateY(0);
        }
      }

      @keyframes gulpPuffPop {
        0% {
          transform: translateX(-50%) scale(0.4);
          opacity: 0;
        }
        40% {
          transform: translateX(-50%) scale(1.2) translateY(-6px);
          opacity: 1;
        }
        100% {
          transform: translateX(-50%) scale(1.5) translateY(-14px);
          opacity: 0;
        }
      }

      .roster-row-gulp-collapsing {
        transition: all 0.38s cubic-bezier(0.4, 0, 0.2, 1) !important;
        opacity: 0 !important;
        transform: scaleY(0.2) !important;
        filter: blur(2px) !important;
        pointer-events: none !important;
      }
    `}</style>
  );
}
