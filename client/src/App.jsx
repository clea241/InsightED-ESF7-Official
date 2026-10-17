import React from "react";
import { AppProvider, useApp } from "./context/AppContext";
import Topbar from "./components/Topbar";
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const NodeMap = React.lazy(() => import("./pages/NodeMap"));
const Roster = React.lazy(() => import("./pages/Roster"));
const PersonnelProfile = React.lazy(() => import("./pages/PersonnelProfile"));
const OrganizedClasses = React.lazy(() => import("./pages/OrganizedClasses"));
const Workload = React.lazy(() => import("./pages/Workload"));
const Overload = React.lazy(() => import("./pages/Overload"));
const ValidationCenter = React.lazy(() => import("./pages/ValidationCenter"));
const RoomQR = React.lazy(() => import("./pages/RoomQR"));
const RequestCenter = React.lazy(() => import("./pages/RequestCenter"));
const RoomProfiling = React.lazy(() => import("./pages/RoomProfiling"));
const SchoolProfile = React.lazy(() => import("./pages/SchoolProfile"));
const Allowances = React.lazy(() => import("./pages/Allowances"));
const Designations = React.lazy(() => import("./pages/Designations"));
const Deployment = React.lazy(() => import("./pages/Deployment"));
const Submission = React.lazy(() => import("./pages/Submission"));
import SchoolHeadChatWidget from "./components/SchoolHeadChatWidget";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import LoadingScreen from "./components/LoadingScreen";
import ServerHealthModal from "./components/ServerHealthModal";
import { subscribeHealth } from "./services/serverHealth";
import { FiAlertTriangle, FiCheckCircle, FiLock } from "react-icons/fi";
import ErrorBoundary from "./components/ErrorBoundary";
import { setErrorAlertContext } from "./services/errorAlert";
import {
  subscribeDraftError,
  setDraftErrorContext,
  buildErrorReport,
  copyTextToClipboard,
} from "./services/draftErrorReporter";

const VIEW_LABELS = {
  dashboard: "School Dashboard",
  nodemap: "eSF7 Process Map",
  school: "School Profile",
  roster: "Faculty & Staff Roster",
  profile: "Personnel Profiling",
  designation: "Personnel Designations",
  classes: "Organized Classes & Sections",
  organized_classes: "Organized Classes & Sections",
  "organized-classes": "Organized Classes & Sections",
  workload: "Faculty Workload & Timetable",
  deployment: "Faculty Deployment",
  overload: "Teaching Overload & Payroll",
  allowances: "Personnel Allowances",
  validation: "eSF7 Validation & Integrity Center",
  submission: "Official eSF7 Submission",
  "room-qr": "Faculty Room QR Profiling",
  requests: "Inter-School Request Center",
};

function MainAppContent() {
  const urlParams = new URLSearchParams(window.location.search);
  const isRoomProfiling = urlParams.get("view") === "room-profiling";

  const { user, loading: authLoading } = useAuth();
  const appState = useApp() || {};
  const {
    activeView = "landing",
    setActiveView = () => {},
    toast = null,
    setToast = () => {},
    customModal = null,
    isInitialized = false,
  } = appState;

  // Hooks must always be declared unconditionally at top
  const [pageTransitionLoading, setPageTransitionLoading] =
    React.useState(false);
  const prevViewRef = React.useRef(activeView);

  // One shared draft-error notice (auto-save / journey save / personnel fetch); cleared by the next success.
  const [draftError, setDraftError] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [serverLocked, setServerLocked] = React.useState(false);
  React.useEffect(
    () =>
      subscribeDraftError((e) => {
        setDraftError(e);
        setCopied(false);
      }),
    [],
  );
  React.useEffect(
    () => subscribeHealth((h) => setServerLocked(!!h.locked)),
    [],
  );
  React.useEffect(() => {
    setDraftErrorContext({
      userId: user?.id || user?.email || user?.username || null,
      role: user?.role || null,
    });
    setErrorAlertContext({
      userId: user?.id || user?.email || user?.username || null,
      role: user?.role || null,
    });
  }, [user]);
  const handleCopyDraftError = async () => {
    if (!draftError) return;
    if (await copyTextToClipboard(buildErrorReport(draftError))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);

  React.useEffect(() => {
    if (
      user &&
      isInitialized &&
      prevViewRef.current !== activeView &&
      activeView !== "landing"
    ) {
      prevViewRef.current = activeView;
      setPageTransitionLoading(true);
      const timer = setTimeout(() => {
        setPageTransitionLoading(false);
      }, 350);
      return () => clearTimeout(timer);
    }
    prevViewRef.current = activeView;
  }, [activeView, user, isInitialized]);

  // While a save is running nothing behind the modal can be used: no navigation away, no reload prompt-less
  // exits, and Esc / Tab are swallowed (the overlay also covers every click).
  const savingLoading =
    customModal?.type === "saving" && customModal.status === "loading";
  React.useEffect(() => {
    if (!savingLoading) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [savingLoading]);

  // Public Faculty Room QR Profiling bypass (No Login Required)
  if (isRoomProfiling || activeView === "room-profiling") {
    return (
      <React.Suspense fallback={<LoadingScreen message="Loading..." />}>
        <RoomProfiling />
      </React.Suspense>
    );
  }

  const renderSavingModal = () => {
    const m = customModal;
    const tone =
      m.status === "success"
        ? { color: "#15803D", bg: "#DCFCE7", mark: "✓" }
        : m.status === "error"
          ? { color: "#DC2626", bg: "#FEE2E2", mark: "✕" }
          : null;
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-busy={m.status === "loading"}
        tabIndex={-1}
        ref={(el) => el && !el.contains(document.activeElement) && el.focus()}
        onKeyDown={(e) => {
          if (m.status === "loading" && (e.key === "Escape" || e.key === "Tab"))
            e.preventDefault();
          if (m.status !== "loading" && e.key === "Escape" && m.onClose)
            m.onClose();
        }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 25, 47, 0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000001,
          outline: "none",
        }}
      >
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "16px",
            width: "440px",
            maxWidth: "90%",
            padding: "24px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            border: "1.5px solid var(--line)",
            animation: "scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            {m.status === "loading" ? (
              <svg
                width="44"
                height="44"
                viewBox="0 0 44 44"
                aria-hidden="true"
              >
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="4"
                />
                <path
                  d="M22 4a18 18 0 0 1 18 18"
                  fill="none"
                  stroke="var(--blue, #2563EB)"
                  strokeWidth="4"
                  strokeLinecap="round"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 22 22"
                    to="360 22 22"
                    dur="0.8s"
                    repeatCount="indefinite"
                  />
                </path>
              </svg>
            ) : (
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: tone.bg,
                  color: tone.color,
                  fontSize: "24px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {tone.mark}
              </div>
            )}
          </div>
          <h3
            style={{
              margin: "14px 0 10px",
              fontSize: "18px",
              color: "var(--navy)",
              fontWeight: "800",
            }}
          >
            {m.title}
          </h3>
          <div
            style={{
              margin: "0 0 20px",
              fontSize: "14px",
              color: "#475569",
              lineHeight: "1.5",
              whiteSpace: "pre-line",
              wordBreak: "break-word",
              textAlign: m.status === "error" ? "left" : "center",
            }}
          >
            {m.message}
          </div>
          {m.status !== "loading" && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              {m.status === "error" && (
                <button
                  className="btn secondary"
                  onClick={m.onClose}
                  style={{ minHeight: "38px", padding: "0 16px" }}
                >
                  Close
                </button>
              )}
              <button
                className="btn"
                autoFocus
                onClick={
                  m.status === "error" && m.canRetry ? m.onRetry : m.onClose
                }
                style={{
                  minHeight: "38px",
                  padding: "0 16px",
                  background:
                    "linear-gradient(180deg, var(--blue), var(--navy))",
                  borderColor: "var(--navy)",
                  color: "white",
                }}
              >
                {m.status === "error" ? (m.canRetry ? "Retry" : "OK") : "OK"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCustomModal = () => {
    if (!customModal) return null;
    if (customModal.type === "saving") return renderSavingModal();
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 25, 47, 0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100005,
        }}
      >
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "16px",
            width: "440px",
            maxWidth: "90%",
            padding: "24px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            border: "1.5px solid var(--line)",
            animation: "scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: "18px",
              color: "var(--navy)",
              fontWeight: "800",
            }}
          >
            {customModal.title}
          </h3>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "14px",
              color: "#475569",
              lineHeight: "1.5",
            }}
          >
            {customModal.message}
          </p>
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            {customModal.type === "confirm" && (
              <button
                className="btn secondary"
                onClick={customModal.onCancel}
                style={{ minHeight: "38px", padding: "0 16px" }}
              >
                Cancel
              </button>
            )}
            <button
              className="btn"
              onClick={customModal.onConfirm}
              style={{
                minHeight: "38px",
                padding: "0 16px",
                background: "linear-gradient(180deg, var(--blue), var(--navy))",
                borderColor: "var(--navy)",
                color: "white",
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (authLoading) {
    return (
      <>
        <LoadingScreen message="Authenticating session..." />
        {renderCustomModal()}
      </>
    );
  }

  // Enforce Login first: Users see Login BEFORE entering the app
  if (!user) {
    return (
      <>
        <Login />
        {renderCustomModal()}
      </>
    );
  }

  // If user is authenticated and AppContext is still initializing initial data from DB / cloud draft
  if (!isInitialized) {
    return (
      <>
        <LoadingScreen message="Loading InsightED eSF7 Database..." />
        {renderCustomModal()}
      </>
    );
  }

  // After login: show Landing Page when activeView === 'landing'
  if (activeView === "landing") {
    return (
      <>
        <Landing onGetStarted={() => setActiveView("dashboard")} />
        {renderCustomModal()}
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {pageTransitionLoading && (
        <LoadingScreen
          message={`Loading ${VIEW_LABELS[activeView] || "Module"}...`}
        />
      )}

      <div className="app">
        <main className="main" style={{ marginLeft: 0, width: "100%" }}>
          <Topbar />
          <ErrorBoundary resetKey={activeView} label={VIEW_LABELS[activeView]}>
            <React.Suspense
              fallback={<LoadingScreen message="Loading module..." />}
            >
              {activeView === "dashboard" && <Dashboard />}
              {activeView === "nodemap" && <NodeMap />}
              {activeView === "school" && <SchoolProfile />}
              {activeView === "roster" && <Roster />}
              {activeView === "profile" && <PersonnelProfile />}
              {(activeView === "designation" ||
                activeView === "designations") && <Designations />}
              {(activeView === "classes" ||
                activeView === "organized_classes" ||
                activeView === "organized-classes") && <OrganizedClasses />}
              {activeView === "workload" && <Workload />}
              {/* DepEd Locked Modules: Allowances, Overload */}
              {!appState.bypassNodeLocks &&
              (activeView === "allowances" || activeView === "overload") ? (
                <div
                  style={{
                    padding: "60px 20px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "65vh",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "20px",
                      background: "#F8FAFC",
                      border: "1.5px solid #E2E8F0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748B",
                      fontSize: "32px",
                      marginBottom: "20px",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <FiLock />
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "800",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#94A3B8",
                      marginBottom: "6px",
                    }}
                  >
                    DepEd Policy Review
                  </span>
                  <h2
                    style={{
                      fontSize: "22px",
                      fontWeight: "800",
                      color: "#0F172A",
                      margin: "0 0 10px",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Module Temporarily Locked
                  </h2>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#64748B",
                      maxWidth: "460px",
                      margin: "0 0 24px",
                      lineHeight: "1.55",
                    }}
                  >
                    The <strong>{VIEW_LABELS[activeView]}</strong> module is
                    temporarily locked pending final DepEd policy alignment and
                    administrative review. Please proceed with other active eSF7
                    milestones.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveView("nodemap")}
                    style={{
                      background:
                        "linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 22px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)",
                    }}
                  >
                    Return to Process Map
                  </button>
                </div>
              ) : (
                <>
                  {activeView === "overload" && <Overload />}
                  {activeView === "allowances" && <Allowances />}
                </>
              )}
              {activeView === "deployment" && <Deployment />}
              {activeView === "validation" && <ValidationCenter />}
              {activeView === "submission" && <Submission />}
              {activeView === "room-qr" && <RoomQR />}
              {activeView === "requests" && <RequestCenter />}
            </React.Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Toast Notification Banner */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background:
              toast.type === "error"
                ? "linear-gradient(135deg, #EF4444, #B91C1C)"
                : "linear-gradient(135deg, #059669, #047857)",
            color: "white",
            padding: "12px 24px",
            borderRadius: "12px",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            zIndex: 99999,
            fontSize: "14px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            minWidth: "320px",
            justifyContent: "center",
          }}
        >
          {toast.type === "error" ? (
            <FiAlertTriangle size={18} />
          ) : (
            <FiCheckCircle size={18} />
          )}{" "}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Draft save/sync failure notice (single instance, updates in place) */}
      {draftError && !serverLocked && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: toast ? "84px" : "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(135deg, #EF4444, #B91C1C)",
            color: "white",
            padding: "12px 24px",
            borderRadius: "12px",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            zIndex: 99998,
            fontSize: "14px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            minWidth: "320px",
            maxWidth: "90vw",
          }}
        >
          <FiAlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Saving or syncing failed ({draftError.action}). Your draft is still
            kept locally on this device.
          </span>
          {draftError.retry && (
            <button
              onClick={() => {
                try {
                  draftError.retry();
                } catch (e) {}
              }}
              style={{
                background: "white",
                color: "#B91C1C",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Retry
            </button>
          )}
          <button
            onClick={handleCopyDraftError}
            style={{
              background: "rgba(255,255,255,0.2)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "Copied" : "Copy error details"}
          </button>
        </div>
      )}

      {/* Global Custom Modal Pop-up */}
      {renderCustomModal()}

      {/* Floating Chat Widget for School Head */}
      <SchoolHeadChatWidget />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MainAppContent />
        <ServerHealthModal />
      </AppProvider>
    </AuthProvider>
  );
}
