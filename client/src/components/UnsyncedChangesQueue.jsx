import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FiClock,
  FiAlertTriangle,
  FiRefreshCw,
  FiTrash2,
  FiEye,
  FiDownload,
  FiWifi,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { resolveSchoolId } from "../services/session";
import {
  getOutboxEntries,
  subscribeOutbox,
  retryOutboxEntry,
  removeOutboxEntry,
  resolveOutboxConflict,
  exportOutboxToJson,
} from "../services/outbox";

export default function UnsyncedChangesQueue() {
  const { user } = useAuth();
  const { schoolInfo, showToast, showConfirm } = useApp();

  const [entries, setEntries] = useState([]);
  const [retryingId, setRetryingId] = useState(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [reviewEntry, setReviewEntry] = useState(null);
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);

  const schoolId = useMemo(() => {
    return (
      schoolInfo?.school_id ||
      schoolInfo?.schoolId ||
      schoolInfo?.id ||
      resolveSchoolId() ||
      user?.school_id ||
      user?.schoolId ||
      ""
    );
  }, [schoolInfo, user]);

  const username = useMemo(() => {
    return user?.username || user?.email || "anonymous";
  }, [user]);

  const loadEntries = useCallback(async () => {
    if (!schoolId && !username) {
      setEntries([]);
      return;
    }
    try {
      const list = await getOutboxEntries({ schoolId, user: username });
      setEntries(list);
    } catch (err) {
      console.warn("[UnsyncedChangesQueue] Failed to load entries:", err);
    }
  }, [schoolId, username]);

  useEffect(() => {
    loadEntries();
    const unsubscribe = subscribeOutbox(() => {
      loadEntries();
    });
    return () => {
      unsubscribe();
    };
  }, [loadEntries]);

  // Online connection listener
  useEffect(() => {
    const handleOnline = () => {
      if (entries.length > 0) {
        setShowOnlineBanner(true);
      }
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [entries.length]);

  const handleRetrySingle = async (entry) => {
    setRetryingId(entry.id);
    try {
      const res = await retryOutboxEntry(entry);
      if (res && res.success) {
        if (showToast) {
          showToast(`✓ Saved ${formatModuleName(entry.module)} to server.`, "success");
        }
        await loadEntries();
      } else {
        if (showToast) {
          showToast(`Could not save ${formatModuleName(entry.module)}. Kept in queue.`, "error");
        }
      }
    } catch (err) {
      console.warn("Retry failed:", err);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAll = async () => {
    if (entries.length === 0 || retryingAll) return;
    setRetryingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const entry of entries) {
      try {
        const res = await retryOutboxEntry(entry);
        if (res && res.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    setRetryingAll(false);
    setShowOnlineBanner(false);
    await loadEntries();

    if (successCount > 0 && failCount === 0) {
      if (showToast) showToast(`✓ All ${successCount} unsynced items saved to server!`, "success");
    } else if (successCount > 0 && failCount > 0) {
      if (showToast) showToast(`Saved ${successCount} items; ${failCount} items still in queue.`, "warning");
    } else if (failCount > 0) {
      if (showToast) showToast(`Save failed for ${failCount} items. They remain in queue.`, "error");
    }
  };

  const handleDiscardSingle = async (entry) => {
    const confirmed = await (showConfirm
      ? showConfirm(
          "Discard Unsynced Changes?",
          `Are you sure you want to discard your unsent changes for "${formatModuleName(entry.module)}"? This cannot be undone.`,
        )
      : window.confirm("Are you sure you want to discard these unsynced changes?"));

    if (!confirmed) return;

    try {
      await removeOutboxEntry(entry.id);
      if (showToast) showToast(`Discarded unsynced changes for ${formatModuleName(entry.module)}.`);
      if (reviewEntry?.id === entry.id) {
        setReviewEntry(null);
      }
      await loadEntries();
    } catch (err) {
      console.warn("Failed to discard entry:", err);
    }
  };

  const handleResolveConflict = async (entry, choice) => {
    try {
      await resolveOutboxConflict(entry.id, choice);
      if (choice === "keep_server") {
        if (showToast) showToast("Discarded local version; kept server version.");
        setReviewEntry(null);
      } else {
        if (showToast) showToast("Marked for overwrite; ready to retry.");
        // Attempt retry immediately
        handleRetrySingle(entry);
        setReviewEntry(null);
      }
      await loadEntries();
    } catch (err) {
      console.warn("Failed resolving conflict:", err);
    }
  };

  const formatModuleName = (mod) => {
    switch (mod) {
      case "school_profile":
        return "School Profile";
      case "organized_classes":
      case "sections":
        return "Organized Classes";
      case "personnel_profile":
      case "personnel":
        return "Personnel Profile";
      case "workload":
        return "Workload Schedule";
      default:
        return mod || "Form Section";
    }
  };

  const isOldEntry = (createdAt) => {
    if (!createdAt) return false;
    const diff = Date.now() - new Date(createdAt).getTime();
    return diff > 30 * 24 * 60 * 60 * 1000; // > 30 days
  };

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: "24px",
        background: "#FFFFFF",
        borderRadius: "16px",
        border: "1.5px solid #FCD34D",
        boxShadow: "0 4px 12px -2px rgba(245, 158, 11, 0.12)",
        overflow: "hidden",
      }}
    >
      {/* Online restored banner */}
      {showOnlineBanner && (
        <div
          style={{
            background: "#ECFDF5",
            borderBottom: "1px solid #A7F3D0",
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "13px",
            color: "#065F46",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
            <FiWifi style={{ fontSize: "16px", color: "#059669" }} />
            <span>Connection restored! You have unsent changes waiting to be saved.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              style={{
                background: "#059669",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              {retryingAll ? "Retrying..." : "Retry All Now"}
            </button>
            <button
              onClick={() => setShowOnlineBanner(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#065F46",
                cursor: "pointer",
                padding: "4px",
              }}
              title="Dismiss banner"
            >
              <FiX style={{ fontSize: "15px" }} />
            </button>
          </div>
        </div>
      )}

      {/* Main Queue Header */}
      <div
        style={{
          padding: "16px 20px",
          background: "#FFFBEB",
          borderBottom: "1px solid #FEF3C7",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#FDE68A",
              color: "#B45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
            }}
          >
            <FiAlertTriangle />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px", fontWeight: "700", color: "#92400E" }}>
                Unsynced Changes
              </span>
              <span
                style={{
                  background: "#F59E0B",
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: "700",
                  padding: "2px 8px",
                  borderRadius: "12px",
                }}
              >
                {entries.length} {entries.length === 1 ? "item" : "items"}
              </span>
            </div>
            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#B45309" }}>
              Changes made offline or during connection errors are held safely in your browser outbox.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => exportOutboxToJson({ schoolId, user: username })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#FFFFFF",
              border: "1px solid #D1D5DB",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: "600",
              color: "#374151",
              cursor: "pointer",
            }}
            title="Download full JSON backup of unsynced items"
          >
            <FiDownload style={{ fontSize: "14px" }} />
            <span>Export JSON</span>
          </button>

          <button
            onClick={handleRetryAll}
            disabled={retryingAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#2563EB",
              border: "none",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: "600",
              color: "#FFFFFF",
              cursor: retryingAll ? "not-allowed" : "pointer",
              opacity: retryingAll ? 0.7 : 1,
            }}
          >
            <FiRefreshCw
              style={{
                fontSize: "14px",
                animation: retryingAll ? "spin 1s linear infinite" : "none",
              }}
            />
            <span>{retryingAll ? "Retrying All..." : "Retry All"}</span>
          </button>
        </div>
      </div>

      {/* Queue Items List */}
      <div style={{ maxHeight: "320px", overflowY: "auto" }}>
        {entries.map((entry) => {
          const isFailed = entry.kind === "failed";
          const isConflict = Boolean(entry.inConflict);
          const isOld = isOldEntry(entry.createdAt);
          const isRetrying = retryingId === entry.id;

          return (
            <div
              key={entry.id}
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid #F3F4F6",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                transition: "background 0.15s ease",
              }}
            >
              {/* Left Column: Info & Status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "#1F2937" }}>
                    {formatModuleName(entry.module)}
                  </span>

                  {/* Kind Badge */}
                  {isFailed ? (
                    <span
                      style={{
                        background: "#FEE2E2",
                        color: "#991B1B",
                        fontSize: "11px",
                        fontWeight: "600",
                        padding: "1px 7px",
                        borderRadius: "6px",
                        border: "1px solid #FECACA",
                      }}
                    >
                      Failed to save
                    </span>
                  ) : (
                    <span
                      style={{
                        background: "#E0E7FF",
                        color: "#3730A3",
                        fontSize: "11px",
                        fontWeight: "600",
                        padding: "1px 7px",
                        borderRadius: "6px",
                        border: "1px solid #C7D2FE",
                      }}
                    >
                      Recovered, unsaved
                    </span>
                  )}

                  {/* Conflict Badge */}
                  {isConflict && (
                    <span
                      style={{
                        background: "#FEF3C7",
                        color: "#92400E",
                        fontSize: "11px",
                        fontWeight: "600",
                        padding: "1px 7px",
                        borderRadius: "6px",
                        border: "1px solid #FDE68A",
                      }}
                    >
                      Conflict: server modified
                    </span>
                  )}

                  {/* Old (>30d) Badge */}
                  {isOld && (
                    <span
                      style={{
                        background: "#F3F4F6",
                        color: "#6B7280",
                        fontSize: "11px",
                        fontWeight: "600",
                        padding: "1px 7px",
                        borderRadius: "6px",
                        border: "1px solid #E5E7EB",
                      }}
                    >
                      Old (&gt;30d)
                    </span>
                  )}

                  <span style={{ fontSize: "12px", color: "#6B7280" }}>
                    {entry.schoolYear || "Current SY"} • {entry.term || "1st Term"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginTop: "4px",
                    fontSize: "12px",
                    color: "#6B7280",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <FiClock style={{ fontSize: "12px" }} />
                    {entry.createdAt
                      ? new Date(entry.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Recently"}
                  </span>

                  {entry.attempts > 0 && (
                    <span>
                      Attempts: <strong>{entry.attempts}</strong>
                    </span>
                  )}

                  {entry.lastError && (
                    <span
                      style={{
                        color: "#DC2626",
                        maxWidth: "280px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={entry.lastError}
                    >
                      Error: {entry.lastError}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Column: Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => handleRetrySingle(entry)}
                  disabled={isRetrying || retryingAll}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "#2563EB",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    padding: "5px 11px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: isRetrying ? "not-allowed" : "pointer",
                    opacity: isRetrying ? 0.7 : 1,
                  }}
                  title="Retry sending to server"
                >
                  <FiRefreshCw
                    style={{
                      fontSize: "13px",
                      animation: isRetrying ? "spin 1s linear infinite" : "none",
                    }}
                  />
                  <span>{isRetrying ? "Retrying..." : "Retry"}</span>
                </button>

                <button
                  onClick={() => setReviewEntry(entry)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "#FFFFFF",
                    color: "#374151",
                    border: "1px solid #D1D5DB",
                    borderRadius: "6px",
                    padding: "5px 10px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                  title="Review unsent payload & diff"
                >
                  <FiEye style={{ fontSize: "13px" }} />
                  <span>Review</span>
                </button>

                <button
                  onClick={() => handleDiscardSingle(entry)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "#FFFFFF",
                    color: "#DC2626",
                    border: "1px solid #FCA5A5",
                    borderRadius: "6px",
                    padding: "5px 10px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                  title="Discard changes permanently"
                >
                  <FiTrash2 style={{ fontSize: "13px" }} />
                  <span>Discard</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Review Modal */}
      {reviewEntry && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setReviewEntry(null)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              maxWidth: "760px",
              width: "100%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#F8FAFC",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#0F172A" }}>
                  Review Unsent Changes: {formatModuleName(reviewEntry.module)}
                </h3>
                <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#64748B" }}>
                  Stable Key: <code>{reviewEntry.stableKey}</code>
                </p>
              </div>
              <button
                onClick={() => setReviewEntry(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "18px",
                  color: "#64748B",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <FiX />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {reviewEntry.inConflict ? (
                <div>
                  <div
                    style={{
                      background: "#FFFBEB",
                      border: "1px solid #FCD34D",
                      borderRadius: "10px",
                      padding: "14px",
                      marginBottom: "16px",
                      fontSize: "13px",
                      color: "#92400E",
                    }}
                  >
                    <strong>⚠️ Server Version Conflict:</strong> The server's saved data was updated by
                    another session or user since your changes were made. Choose which version you wish
                    to keep.
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "700", color: "#1E293B" }}>
                        Your Local Queued Changes
                      </h4>
                      <pre
                        style={{
                          background: "#F1F5F9",
                          borderRadius: "8px",
                          padding: "12px",
                          fontSize: "11px",
                          fontFamily: "monospace",
                          maxHeight: "260px",
                          overflow: "auto",
                          border: "1px solid #CBD5E1",
                        }}
                      >
                        {JSON.stringify(reviewEntry.payload, null, 2)}
                      </pre>
                      <button
                        onClick={() => handleResolveConflict(reviewEntry, "keep_queued")}
                        style={{
                          marginTop: "10px",
                          width: "100%",
                          padding: "8px 12px",
                          background: "#2563EB",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Keep My Version (Overwrite Server)
                      </button>
                    </div>

                    <div>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "700", color: "#1E293B" }}>
                        Base Server Version
                      </h4>
                      <pre
                        style={{
                          background: "#F8FAFC",
                          borderRadius: "8px",
                          padding: "12px",
                          fontSize: "11px",
                          fontFamily: "monospace",
                          maxHeight: "260px",
                          overflow: "auto",
                          border: "1px solid #E2E8F0",
                        }}
                      >
                        {reviewEntry.baseVersion
                          ? JSON.stringify(reviewEntry.baseVersion, null, 2)
                          : "No base version recorded"}
                      </pre>
                      <button
                        onClick={() => handleResolveConflict(reviewEntry, "keep_server")}
                        style={{
                          marginTop: "10px",
                          width: "100%",
                          padding: "8px 12px",
                          background: "#64748B",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Take Server Version (Discard Mine)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: "16px" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "700", color: "#1E293B" }}>
                      Queued Payload
                    </h4>
                    <pre
                      style={{
                        background: "#0F172A",
                        color: "#E2E8F0",
                        borderRadius: "10px",
                        padding: "14px",
                        fontSize: "12px",
                        fontFamily: "monospace",
                        maxHeight: "300px",
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(reviewEntry.payload, null, 2)}
                    </pre>
                  </div>

                  {reviewEntry.lastError && (
                    <div
                      style={{
                        background: "#FEF2F2",
                        border: "1px solid #FECACA",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        fontSize: "12px",
                        color: "#991B1B",
                      }}
                    >
                      <strong>Last Error:</strong> {reviewEntry.lastError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid #E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                background: "#F8FAFC",
              }}
            >
              <button
                onClick={() => handleDiscardSingle(reviewEntry)}
                style={{
                  padding: "7px 14px",
                  background: "#FFFFFF",
                  border: "1px solid #FCA5A5",
                  color: "#DC2626",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Discard Entry
              </button>
              <button
                onClick={() => {
                  handleRetrySingle(reviewEntry);
                  setReviewEntry(null);
                }}
                style={{
                  padding: "7px 16px",
                  background: "#2563EB",
                  border: "none",
                  color: "#FFFFFF",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Retry Sending Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
