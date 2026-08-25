"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearStoredSession,
  loadStoredSession,
  loginAdmin,
  refreshAdminSession,
  resetLoginAttempts,
  storeSession,
  type AdminSession,
} from "@/lib/admin-auth";

// Refresh strategy: proactive. A short interval checks whether the current
// access token is within REFRESH_MARGIN_MS of expiring and, if so, silently
// refreshes it in the background. This keeps a long-idle admin tab from
// hitting a 401 on its next action instead of reacting to one.
const REFRESH_MARGIN_MS = 60 * 1000;
const REFRESH_CHECK_INTERVAL_MS = 20 * 1000;

type AdminAuthContextValue = {
  session: AdminSession | null;
  loading: boolean;
  login: (email: string, password: string, captchaToken?: string) => Promise<void>;
  logout: () => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Load any persisted session once mounted in the browser (deferred into a
  // timeout, same pattern as CartContext's hydration effect, to avoid a
  // set-state-in-effect-body lint issue and any SSR/hydration mismatch).
  useEffect(() => {
    const timer = setTimeout(() => {
      const stored = loadStoredSession();
      if (!stored) {
        setLoading(false);
        return;
      }
      if (stored.expiresAt - Date.now() <= REFRESH_MARGIN_MS) {
        refreshAdminSession(stored.refreshToken)
          .then((fresh) => {
            storeSession(fresh);
            setSession(fresh);
          })
          .catch(() => {
            clearStoredSession();
            setSession(null);
          })
          .finally(() => setLoading(false));
      } else {
        setSession(stored);
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Proactive background refresh — see REFRESH_MARGIN_MS comment above.
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      setSession((current) => {
        if (!current) return current;
        if (current.expiresAt - Date.now() > REFRESH_MARGIN_MS) return current;
        refreshAdminSession(current.refreshToken)
          .then((fresh) => {
            storeSession(fresh);
            setSession(fresh);
          })
          .catch(() => {
            clearStoredSession();
            setSession(null);
          });
        return current;
      });
    }, REFRESH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session]);

  const login = useCallback(async (email: string, password: string, captchaToken?: string) => {
    const fresh = await loginAdmin(email, password, captchaToken);
    storeSession(fresh);
    resetLoginAttempts();
    setSession(fresh);
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    setSession(null);
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ session, loading, login, logout }),
    [session, loading, login, logout]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return ctx;
}
