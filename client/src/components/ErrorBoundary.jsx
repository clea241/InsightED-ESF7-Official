import React from "react";
import { reportError } from "../services/errorAlert";

// Wraps the routes: a rendering crash shows the shared error dialog plus a recoverable fallback instead of a blank page.
// `resetKey` (the active view) clears the error when the user navigates elsewhere.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error, {
      title: "This screen crashed",
      action: `Showing ${this.props.label || "this screen"}`,
      handler:
        (info && info.componentStack
          ? info.componentStack
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)[0]
          : "") || "",
      source: "React render error",
    });
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey)
      this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          margin: "32px auto",
          maxWidth: 560,
          background: "#FFFBEB",
          border: "1px solid #FCD34D",
          color: "#78350F",
          borderRadius: 12,
          padding: "20px 22px",
        }}
      >
        <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>
          This screen could not be shown
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13 }}>
          Your saved work is not affected. The error details were shown in a
          dialog (use Copy details to share them).
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => window.location.reload()}
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
