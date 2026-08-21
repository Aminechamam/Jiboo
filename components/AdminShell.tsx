"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAdminAuth } from "./AdminAuthContext";

const LOGIN_PATH = "/admin/login";

const NAV_LINKS = [
  { href: "/admin", label: "Commandes" },
  { href: "/admin/produits", label: "Produits" },
  { href: "/admin/fournisseurs", label: "Fournisseurs" },
  { href: "/admin/equipe", label: "Équipe" },
] as const;

/** Route guard + chrome for every /admin/* page. The login page renders its
 *  own full-bleed layout and is exempt from the auth check (it's the
 *  destination the check redirects to). Every other admin page requires a
 *  valid session on mount; if it's missing/expired/invalid, redirect to
 *  /admin/login client-side. There is no server-side data fetching to
 *  protect here — the real authorization boundary is Postgres RLS on every
 *  request, regardless of what this client-side check does. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading, logout } = useAdminAuth();
  const isLoginPage = pathname === LOGIN_PATH;

  useEffect(() => {
    if (isLoginPage || loading) return;
    if (!session) router.replace(LOGIN_PATH);
  }, [isLoginPage, loading, session, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tn-black">
        <p className="text-xs font-black uppercase tracking-widest text-tn-white/50">
          Vérification de la session…
        </p>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.replace(LOGIN_PATH);
  };

  return (
    <div className="min-h-screen bg-tn-offwhite">
      <header className="border-b-4 border-tn-amber bg-tn-black">
        <div className="tn-stripes h-1.5 w-full" />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-tn-red text-sm font-black text-tn-white">
                JB
              </span>
              <span className="text-sm font-black uppercase tracking-wide text-tn-white">
                Jiboo <span className="text-tn-amber">— Espace admin</span>
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive =
                  link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      isActive
                        ? "bg-tn-red text-tn-white"
                        : "text-tn-white/70 hover:-translate-y-0.5 hover:text-tn-amber"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-xs font-black uppercase tracking-wide text-tn-white">
                {session.user.fullName || session.user.email}
              </p>
              <p className="text-[11px] text-tn-white/50">{session.user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border-2 border-tn-white/20 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:border-tn-red hover:bg-tn-red active:scale-95"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
