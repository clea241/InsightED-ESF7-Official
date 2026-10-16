import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";

import { pauseForAuth, resumeAfterLogin } from "../services/draftSaver";
import { onSessionExpired, clearSessionExpired } from "../services/session";
import { checkBeforeLeave, isAnyScreenDirty } from "../services/dirtyGuard";
import { hasFailedEntries } from "../services/outbox";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("token");
      const storedUser = localStorage.getItem("remembered_user");
      if (storedToken && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          localStorage.removeItem("token");
          localStorage.removeItem("remembered_user");
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  // A 401 on an authenticated call (expired token, rotated JWT_SECRET) sends the user to the login screen.
  // Unlike an ordinary error it first keeps the newest local state on this device and queues the unsent save;
  // logout() below removes only session keys, never drafts, IndexedDB or the draft version/unsynced markers.
  const logoutRef = useRef(() => {});
  useEffect(
    () =>
      onSessionExpired(async () => {
        await pauseForAuth();
        await logoutRef.current({ skipGuard: true });
        if (
          typeof window !== "undefined" &&
          window.location &&
          !window.location.pathname.includes("/login")
        ) {
          const basePath = import.meta.env.BASE_URL || "/";
          const loginPath = basePath.endsWith("/")
            ? `${basePath}login`
            : `${basePath}/login`;
          window.location.replace(loginPath);
        }
      }),
    [],
  );

  const login = (userData, tokenVal) => {
    clearSessionExpired();
    localStorage.setItem("token", tokenVal);
    localStorage.setItem("remembered_user", JSON.stringify(userData));
    localStorage.setItem("schoolId", userData.school_id || "");
    localStorage.setItem("school_id", userData.school_id || "");
    localStorage.setItem("activeSchoolId", userData.school_id || "");
    setUser(userData);
    setToken(tokenVal);
    // Replay whatever was queued when the session ended (version checks still apply).
    resumeAfterLogin(userData.school_id || userData.schoolId || null);
  };

  const logout = async (options = {}) => {
    const { skipGuard = false } =
      typeof options === "boolean" ? { skipGuard: options } : options;
    if (!skipGuard && isAnyScreenDirty()) {
      const canProceed = await checkBeforeLeave({ actionType: "logout" });
      if (!canProceed) {
        return false;
      }
    }

    if (!skipGuard) {
      try {
        const sId =
          user?.school_id ||
          user?.schoolId ||
          localStorage.getItem("schoolId") ||
          localStorage.getItem("activeSchoolId");
        const uName = user?.username || user?.email || "anonymous";
        const hasFailed = await hasFailedEntries(sId, uName);
        if (hasFailed) {
          const [{ default: Swal }] = await Promise.all([
            import("sweetalert2"),
            import("sweetalert2/dist/sweetalert2.min.css"),
          ]);
          const result = await Swal.fire({
            title: "Unsaved Changes Exist",
            text: "You have unsent changes that failed to save to the server. If you log out now, they will remain on this device only and won't be visible on other devices.",
            icon: "warning",
            iconColor: "#d97706",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#4f46e5",
            confirmButtonText: "Log Out Anyway",
            cancelButtonText: "Stay & Review Changes",
            reverseButtons: true,
          });
          if (!result.isConfirmed) {
            return false;
          }
        }
      } catch (e) {
        console.warn("Failed checking outbox before logout:", e);
      }
    }
    localStorage.removeItem("token");
    localStorage.removeItem("remembered_user");
    localStorage.removeItem("schoolId");
    localStorage.removeItem("school_id");
    localStorage.removeItem("activeSchoolId");
    localStorage.removeItem("insighted_personnel_cache");
    setUser(null);
    setToken(null);
    return true;
  };

  logoutRef.current = logout;

  const confirmLogout = async () => {
    return await logout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        token,
        setToken,
        login,
        logout,
        confirmLogout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  return context || {};
};
