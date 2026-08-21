"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/AdminAuthContext";
import { Spinner } from "@/components/Spinner";
import {
  SessionExpiredError,
  createSupplier,
  fetchSuppliers,
  type Supplier,
} from "@/lib/admin-suppliers";

type NewSupplierDraft = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const EMPTY_DRAFT: NewSupplierDraft = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

const inputClass =
  "rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-sm font-medium normal-case text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const labelClass = "flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70";

export default function AdminFournisseursPage() {
  const router = useRouter();
  const { session, logout } = useAdminAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<NewSupplierDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(() => {
    logout();
    router.replace("/admin/login");
  }, [logout, router]);

  // Client-side only: this fetch runs in the admin's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  const loadSuppliers = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    fetchSuppliers(session.accessToken)
      .then(setSuppliers)
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Impossible de charger les fournisseurs.");
      })
      .finally(() => setLoading(false));
  }, [session, handleSessionExpired]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSuppliers();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSuppliers]);

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session || creating) return;
    if (!draft.name.trim()) {
      setCreateError("Le nom du fournisseur est obligatoire.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const created = await createSupplier(session.accessToken, {
        name: draft.name.trim(),
        contact_name: draft.contactName.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        address: draft.address.trim() || null,
        notes: draft.notes.trim() || null,
      });
      setSuppliers((prev) => [created, ...prev]);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setCreateError(err instanceof Error ? err.message : "Impossible de créer le fournisseur.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="tn-ribbon inline-block bg-tn-red px-3 py-1 text-[11px] font-black uppercase tracking-widest text-tn-white">
            Fournisseurs
          </span>
          <h1 className="mt-3 text-2xl font-black uppercase tracking-wide text-tn-black sm:text-3xl">
            Gestion des fournisseurs
          </h1>
        </div>
        {!loading && !loadError && (
          <span className="text-xs font-black uppercase tracking-wide text-tn-black-soft/50">
            {suppliers.length} fournisseur{suppliers.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ADD SUPPLIER */}
      <form
        onSubmit={handleCreate}
        className="mb-8 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-6"
      >
        <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60">
          Ajouter un fournisseur
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            Nom
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Contact
            <input
              value={draft.contactName}
              onChange={(e) => setDraft((d) => ({ ...d, contactName: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Téléphone
            <input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Email
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Adresse
            <input
              value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
            Notes
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className={`${inputClass} resize-none`}
            />
          </label>
        </div>

        {createError && (
          <p className="mt-3 rounded-lg border-2 border-tn-red bg-tn-red/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
            {createError}
          </p>
        )}

        <button
          type="submit"
          disabled={creating}
          className="mt-4 flex items-center gap-2 rounded-lg bg-tn-red px-6 py-2.5 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating && <Spinner className="size-3.5" />}
          {creating ? "Création…" : "Ajouter le fournisseur"}
        </button>
      </form>

      {/* SUPPLIER LIST */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white p-4">
              <div className="h-3 w-1/2 rounded bg-tn-black/10" />
              <div className="mt-3 h-3 w-2/3 rounded bg-tn-black/10" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-red">{loadError}</p>
          <button
            type="button"
            onClick={loadSuppliers}
            className="mt-4 rounded-lg bg-tn-red px-5 py-2 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
          >
            Réessayer
          </button>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
            Aucun fournisseur pour le moment.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((supplier) => (
            <Link
              key={supplier.id}
              href={`/admin/fournisseurs/${supplier.id}`}
              className="flex flex-col gap-1.5 rounded-xl border-2 border-tn-black bg-tn-white p-4 shadow-[3px_3px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--tn-red)]"
            >
              <span className="text-sm font-black uppercase tracking-wide text-tn-black">
                {supplier.name}
              </span>
              {supplier.contactName && (
                <span className="text-xs text-tn-black-soft/70">{supplier.contactName}</span>
              )}
              <div className="mt-1 flex flex-col gap-0.5 text-xs text-tn-black-soft/60">
                {supplier.phone && <span>{supplier.phone}</span>}
                {supplier.email && <span>{supplier.email}</span>}
                {!supplier.phone && !supplier.email && <span>&nbsp;</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
