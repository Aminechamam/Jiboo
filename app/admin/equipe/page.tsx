"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/AdminAuthContext";
import { Spinner } from "@/components/Spinner";
import {
  SessionExpiredError,
  fetchProfiles,
  updateProfileRole,
  type Profile,
  type ProfileRole,
} from "@/lib/admin-data";

const ROLE_LABELS: Record<ProfileRole, string> = {
  admin: "Admin",
  employee: "Employé",
};

export default function AdminEquipePage() {
  const router = useRouter();
  const { session, logout } = useAdminAuth();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(() => {
    logout();
    router.replace("/admin/login");
  }, [logout, router]);

  // Client-side only: this fetch runs in the admin's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  const loadProfiles = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    fetchProfiles(session.accessToken)
      .then(setProfiles)
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Impossible de charger l'équipe.");
      })
      .finally(() => setLoading(false));
  }, [session, handleSessionExpired]);

  // Deferred into a timeout (same pattern as CartContext's hydration effect)
  // so the initial setLoading/fetch call isn't a synchronous setState call
  // in the effect body itself.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadProfiles();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadProfiles]);

  const handleRoleChange = async (profile: Profile, nextRole: ProfileRole) => {
    if (!session || nextRole === profile.role) return;
    setUpdatingId(profile.id);
    setActionError(null);
    const previousRole = profile.role;

    // Optimistic update — rolled back below if the PATCH fails.
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, role: nextRole } : p)));

    try {
      await updateProfileRole(session.accessToken, profile.id, nextRole);
    } catch (err) {
      setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, role: previousRole } : p)));
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setActionError(err instanceof Error ? err.message : "Impossible de mettre à jour le rôle.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <span className="tn-ribbon inline-block bg-tn-red px-3 py-1 text-[11px] font-black uppercase tracking-widest text-tn-white">
          Équipe
        </span>
        <h1 className="mt-3 text-2xl font-black uppercase tracking-wide text-tn-black sm:text-3xl">
          Gestion de l&apos;équipe
        </h1>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border-2 border-tn-red bg-tn-red/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white p-4"
            >
              <div className="h-3 w-1/3 rounded bg-tn-black/10" />
              <div className="mt-3 h-3 w-1/4 rounded bg-tn-black/10" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-red">{loadError}</p>
          <button
            type="button"
            onClick={loadProfiles}
            className="mt-4 rounded-lg bg-tn-red px-5 py-2 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
          >
            Réessayer
          </button>
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
            Aucun membre d&apos;équipe pour le moment.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-tn-black bg-tn-white shadow-[3px_3px_0_0_var(--tn-black)]">
          <ul className="divide-y-2 divide-tn-black/10">
            {profiles.map((profile) => {
              const isSelf = profile.id === session?.user.id;
              return (
                <li
                  key={profile.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-black uppercase tracking-wide text-tn-black">
                      {profile.fullName || profile.email}
                      {isSelf && (
                        <span className="ml-2 text-[10px] font-bold normal-case tracking-normal text-tn-black-soft/50">
                          (vous)
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-tn-black-soft/60">{profile.email}</span>
                  </div>

                  {isSelf ? (
                    <span className="rounded-lg border-2 border-tn-black/10 bg-tn-offwhite px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black-soft/60">
                      {ROLE_LABELS[profile.role]}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {updatingId === profile.id && (
                        <Spinner className="size-3.5 text-tn-black-soft/50" />
                      )}
                      <select
                        value={profile.role}
                        disabled={updatingId === profile.id}
                        onChange={(e) => handleRoleChange(profile, e.target.value as ProfileRole)}
                        className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="admin">{ROLE_LABELS.admin}</option>
                        <option value="employee">{ROLE_LABELS.employee}</option>
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
