"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/AdminAuthContext";
import { Spinner } from "@/components/Spinner";
import {
  AdminAuthError,
  getLoginLockState,
  recordFailedLoginAttempt,
  type LoginLockState,
} from "@/lib/admin-auth";

// Cloudflare Turnstile — a low-friction captcha (usually a single checkbox,
// sometimes nothing visible at all) that stops scripted brute-force login
// attempts regardless of the client-side attempt counter below.
//
const TURNSTILE_SITE_KEY = "0x4AAAAAAEb3yCBibf-BrpNq";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { session, loading, login } = useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockState, setLockState] = useState<LoginLockState>({ locked: false, remainingMs: 0 });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  // Already-locked-out state can persist across a page reload (it lives in
  // localStorage), so re-derive it on mount, then tick once a second while
  // locked so the countdown is visibly live and the form re-enables itself
  // the moment the 15-minute window rolls over.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLockState(getLoginLockState());
    }, 0);
    const interval = setInterval(() => {
      setLockState(getLoginLockState());
    }, 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/admin");
    }
  }, [loading, session, router]);

  // Render the Turnstile widget once its script has loaded — explicit
  // rendering (rather than the auto-render div) so we can reset it below
  // after a failed attempt, since each token is single-use.
  useEffect(() => {
    if (!turnstileScriptReady || !window.turnstile || !turnstileContainerRef.current) return;
    if (turnstileWidgetIdRef.current) return;
    turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => setCaptchaToken(null),
    });
  }, [turnstileScriptReady]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || lockState.locked) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await login(email.trim(), password, captchaToken ?? undefined);
      router.push("/admin");
    } catch (err) {
      recordFailedLoginAttempt();
      setLockState(getLoginLockState());
      setError(err instanceof AdminAuthError ? err.message : "Email ou mot de passe incorrect.");
      // Tokens are single-use — reset the widget so the next attempt gets a
      // fresh one instead of silently failing captcha verification.
      if (window.turnstile && turnstileWidgetIdRef.current) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
      setCaptchaToken(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-tn-black px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tn-red font-black text-tn-white">
              JB
            </span>
            <span className="text-lg font-black uppercase tracking-wide text-tn-white">
              Jib<span className="text-tn-amber">oo</span>
            </span>
          </Link>
          <p className="mt-2 text-xs font-black uppercase tracking-widest text-tn-white/50">
            Espace admin
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border-2 border-tn-amber bg-tn-black-soft p-6 shadow-[6px_6px_0_0_var(--tn-red)] sm:p-8"
        >
          <h1 className="text-xl font-black uppercase tracking-wide text-tn-white">Connexion</h1>

          <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-white/60">
            Email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={lockState.locked}
              className="rounded-lg border-2 border-tn-white/20 bg-tn-black px-3 py-2 text-sm font-medium normal-case text-tn-white transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:border-tn-amber focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-white/60">
            Mot de passe
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={lockState.locked}
              className="rounded-lg border-2 border-tn-white/20 bg-tn-black px-3 py-2 text-sm font-medium normal-case text-tn-white transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:border-tn-amber focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          {error && !lockState.locked && (
            <p className="rounded-lg border-2 border-tn-red bg-tn-red/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
              {error}
            </p>
          )}

          {lockState.locked && (
            <p className="rounded-lg border-2 border-tn-amber bg-tn-amber/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tn-amber">
              Trop de tentatives. Réessayez dans {formatRemaining(lockState.remainingMs)}.
            </p>
          )}

          {!lockState.locked && <div ref={turnstileContainerRef} />}

          <button
            type="submit"
            disabled={isSubmitting || lockState.locked || !captchaToken}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-tn-red px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-tn-red disabled:hover:text-tn-white"
          >
            {isSubmitting && <Spinner className="size-4" />}
            {lockState.locked
              ? `Réessayez dans ${formatRemaining(lockState.remainingMs)}`
              : isSubmitting
                ? "Connexion en cours…"
                : "Se connecter"}
          </button>
        </form>
      </div>

      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        onLoad={() => setTurnstileScriptReady(true)}
      />
    </div>
  );
}
