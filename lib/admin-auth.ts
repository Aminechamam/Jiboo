// Admin authentication against Supabase Auth (GoTrue) via plain fetch().
//
// IMPORTANT: exactly like lib/supabase.ts, every export here must only ever
// be called from client-side code ("use client" components, inside
// useEffect/event handlers). `next build`'s prerendering step runs
// network-sandboxed in this environment, so any of these calls made from a
// Server Component or at module scope during static generation would break
// the build.
//
// There is no @supabase/supabase-js SDK installed (offline install, no
// network to fetch it) — auth is implemented by talking to the GoTrue REST
// API directly, the same way lib/supabase.ts already talks to PostgREST.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
};

export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms timestamp at which accessToken expires. */
  expiresAt: number;
  user: AdminUser;
};

export class AdminAuthError extends Error {}

const SESSION_STORAGE_KEY = "jiboo-admin-session";
const ATTEMPTS_STORAGE_KEY = "jiboo-admin-login-attempts";

const MAX_LOGIN_ATTEMPTS = 5;
const ATTEMPTS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Headers for an authenticated PostgREST call — the user's own access
 *  token as bearer (not the anon key) so Postgres RLS resolves auth.uid()
 *  to this user. Distinct from the `headers` constant in lib/supabase.ts,
 *  which stays anon-only and is used by the public guest-checkout site. */
export function authedHeaders(accessToken: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };
}

// ---------------------------------------------------------------------------
// Session storage (localStorage)
// ---------------------------------------------------------------------------

export function loadStoredSession(): AdminSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.expiresAt === "number" &&
      parsed.user &&
      typeof parsed.user.id === "string"
    ) {
      return parsed as AdminSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function storeSession(session: AdminSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — session simply
    // won't survive a reload; nothing else to do here.
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Client-side login rate limiting
// ---------------------------------------------------------------------------

type LoginAttempts = { count: number; firstAttemptAt: number };

function readAttempts(): LoginAttempts | null {
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.count === "number" && typeof parsed.firstAttemptAt === "number") {
      return parsed as LoginAttempts;
    }
    return null;
  } catch {
    return null;
  }
}

function writeAttempts(attempts: LoginAttempts): void {
  try {
    window.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
  } catch {
    // Ignore.
  }
}

export type LoginLockState = { locked: boolean; remainingMs: number };

/** Whether the login form should currently be locked out, and for how much
 *  longer, based on failed attempts recorded in the last 15 minutes. */
export function getLoginLockState(): LoginLockState {
  const attempts = readAttempts();
  if (!attempts) return { locked: false, remainingMs: 0 };

  const elapsed = Date.now() - attempts.firstAttemptAt;
  if (elapsed >= ATTEMPTS_WINDOW_MS) {
    // Window has rolled over — stale record, not locked.
    return { locked: false, remainingMs: 0 };
  }
  if (attempts.count < MAX_LOGIN_ATTEMPTS) {
    return { locked: false, remainingMs: 0 };
  }
  return { locked: true, remainingMs: ATTEMPTS_WINDOW_MS - elapsed };
}

export function recordFailedLoginAttempt(): void {
  const existing = readAttempts();
  const now = Date.now();
  if (!existing || now - existing.firstAttemptAt >= ATTEMPTS_WINDOW_MS) {
    writeAttempts({ count: 1, firstAttemptAt: now });
    return;
  }
  writeAttempts({ count: existing.count + 1, firstAttemptAt: existing.firstAttemptAt });
}

export function resetLoginAttempts(): void {
  try {
    window.localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// GoTrue calls
// ---------------------------------------------------------------------------

type GoTrueTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
};

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.msg === "string" && obj.msg) return obj.msg;
  if (typeof obj.error_description === "string" && obj.error_description) {
    return obj.error_description;
  }
  if (typeof obj.error === "string" && obj.error) return obj.error;
  if (typeof obj.message === "string" && obj.message) return obj.message;
  return null;
}

async function requestToken(
  body: Record<string, string>,
  grantType: string,
  captchaToken?: string
): Promise<GoTrueTokenResponse> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    // GoTrue only looks at gotrue_meta_security.captcha_token when captcha
    // protection is turned on for the project (Supabase dashboard > Auth >
    // Bot and Abuse Protection). Until that's configured there, this field
    // is simply ignored — safe to always send.
    body: JSON.stringify(
      captchaToken ? { ...body, gotrue_meta_security: { captcha_token: captchaToken } } : body
    ),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // No/invalid JSON body — fall through to generic error handling below.
  }

  if (!res.ok) {
    const message = extractErrorMessage(data) ?? "Email ou mot de passe incorrect.";
    throw new AdminAuthError(message);
  }

  return data as GoTrueTokenResponse;
}

type RawProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

async function fetchOwnProfile(accessToken: string, userId: string): Promise<RawProfile | null> {
  const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,email,full_name,role&id=eq.${userId}`;
  const res = await fetch(url, { headers: authedHeaders(accessToken) });
  if (!res.ok) {
    throw new AdminAuthError("Impossible de vérifier votre profil. Veuillez réessayer.");
  }
  const rows = (await res.json()) as RawProfile[];
  return rows[0] ?? null;
}

/** Full login flow: authenticate with GoTrue, then server-verify (via RLS,
 *  not just client trust) that the account has the "admin" role. Throws
 *  AdminAuthError with a user-facing French message on any failure —
 *  including a successfully authenticated non-admin account, which must be
 *  rejected here since this panel is admin-only. Never reveals whether the
 *  rejection was due to the email not existing vs. a wrong password. */
export async function loginAdmin(
  email: string,
  password: string,
  captchaToken?: string
): Promise<AdminSession> {
  const token = await requestToken({ email, password }, "password", captchaToken);

  const profile = await fetchOwnProfile(token.access_token, token.user.id);
  if (!profile || profile.role !== "admin") {
    throw new AdminAuthError("Accès réservé aux administrateurs.");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    user: {
      id: token.user.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
    },
  };
}

/** Refreshes an access token using the stored refresh token. Re-reads the
 *  profile too, in case the role changed since the last login (e.g. an
 *  admin got demoted to employee mid-session) — if it's no longer "admin"
 *  the session is invalidated the same way a fresh login would be. */
export async function refreshAdminSession(refreshToken: string): Promise<AdminSession> {
  const token = await requestToken({ refresh_token: refreshToken }, "refresh_token");

  const profile = await fetchOwnProfile(token.access_token, token.user.id);
  if (!profile || profile.role !== "admin") {
    throw new AdminAuthError("Accès réservé aux administrateurs.");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    user: {
      id: token.user.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
    },
  };
}
