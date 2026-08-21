"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/AdminAuthContext";
import { Spinner } from "@/components/Spinner";
import { fetchProducts, formatPrice, type Product } from "@/lib/supabase";
import {
  SUPPLIER_ORDER_STATUSES,
  SessionExpiredError,
  createSupplierOrder,
  fetchSupplierById,
  fetchSupplierOrders,
  updateSupplierOrderStatus,
  type Supplier,
  type SupplierOrder,
  type SupplierOrderStatus,
} from "@/lib/admin-suppliers";

const STATUS_LABELS: Record<SupplierOrderStatus, string> = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  recue: "Reçue",
  annulee: "Annulée",
};

// Same red/amber/black palette convention as the customer-orders page, with
// the single green accent (internal-tool-only exception) for the positive
// end state — here "reçue" instead of "livrée".
const STATUS_BADGE_CLASSES: Record<SupplierOrderStatus, string> = {
  en_attente: "bg-tn-amber text-tn-black",
  confirmee: "bg-tn-black text-tn-white",
  recue: "bg-[#1a9d5c] text-tn-white",
  annulee: "bg-tn-black-soft/10 text-tn-black-soft/50",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-TN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type LineDraft = {
  productId: string | null;
  productName: string;
  quantity: string;
  unitCost: string;
};

function emptyLine(): LineDraft {
  return { productId: null, productName: "", quantity: "1", unitCost: "" };
}

const inputClass =
  "rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-sm font-medium normal-case text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const labelClass = "flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70";

export default function AdminFournisseurDetailPage() {
  const params = useParams<{ id: string }>();
  const supplierId = params.id;
  const router = useRouter();
  const { session, logout } = useAdminAuth();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<Product[]>([]);

  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<SupplierOrderStatus>("en_attente");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(() => {
    logout();
    router.replace("/admin/login");
  }, [logout, router]);

  // Client-side only: these fetches run in the admin's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  const loadSupplier = useCallback(() => {
    if (!session || !supplierId) return;
    setSupplierLoading(true);
    setSupplierError(null);
    fetchSupplierById(session.accessToken, supplierId)
      .then((s) => {
        if (!s) {
          setSupplierError("Fournisseur introuvable.");
          return;
        }
        setSupplier(s);
      })
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setSupplierError(err instanceof Error ? err.message : "Impossible de charger ce fournisseur.");
      })
      .finally(() => setSupplierLoading(false));
  }, [session, supplierId, handleSessionExpired]);

  const loadOrders = useCallback(() => {
    if (!session || !supplierId) return;
    setOrdersLoading(true);
    setOrdersError(null);
    fetchSupplierOrders(session.accessToken, supplierId)
      .then(setOrders)
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setOrdersError(
          err instanceof Error ? err.message : "Impossible de charger les commandes fournisseur."
        );
      })
      .finally(() => setOrdersLoading(false));
  }, [session, supplierId, handleSessionExpired]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSupplier();
      loadOrders();
      // Catalog is publicly readable (only writes are RLS-restricted), so
      // this reuses the same fetchProducts() the storefront uses — best
      // effort only: if it fails, the free-text product_name field still
      // works, so the failure is swallowed rather than shown as a blocking
      // error on this page.
      fetchProducts()
        .then(setCatalog)
        .catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSupplier, loadOrders]);

  const handleStatusChange = async (order: SupplierOrder, nextStatus: SupplierOrderStatus) => {
    if (!session || nextStatus === order.status) return;
    setUpdatingId(order.id);
    setStatusActionError(null);
    const previousStatus = order.status;

    // Optimistic update — rolled back below if the PATCH fails.
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));

    try {
      await updateSupplierOrderStatus(session.accessToken, order.id, nextStatus);
    } catch (err) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: previousStatus } : o)));
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setStatusActionError(err instanceof Error ? err.message : "Impossible de mettre à jour le statut.");
    } finally {
      setUpdatingId(null);
    }
  };

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const runningTotal = lines.reduce((sum, l) => {
    const qty = Number(l.quantity);
    const cost = Number(l.unitCost);
    if (!Number.isFinite(qty) || !Number.isFinite(cost)) return sum;
    return sum + qty * cost;
  }, 0);

  const resetForm = () => {
    setReference("");
    setStatus("en_attente");
    setNotes("");
    setLines([emptyLine()]);
  };

  const handleCreateOrder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session || creating || !supplierId) return;

    const preparedItems: { product_id: string | null; product_name: string; quantity: number; unit_cost: number }[] =
      [];
    for (const line of lines) {
      const name = line.productName.trim();
      if (!name) continue; // Skip fully-empty lines rather than erroring.
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setCreateError(`Quantité invalide pour "${name}" (doit être un entier positif).`);
        return;
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        setCreateError(`Coût unitaire invalide pour "${name}" (doit être positif ou nul).`);
        return;
      }
      preparedItems.push({
        product_id: line.productId,
        product_name: name,
        quantity,
        unit_cost: unitCost,
      });
    }

    if (preparedItems.length === 0) {
      setCreateError("Ajoutez au moins un article à la commande.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const created = await createSupplierOrder(session.accessToken, supplierId, {
        reference: reference.trim() || null,
        status,
        notes: notes.trim() || null,
        items: preparedItems,
      });
      setOrders((prev) => [created, ...prev]);
      resetForm();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setCreateError(err instanceof Error ? err.message : "Impossible de créer la commande.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/fournisseurs"
          className="text-xs font-black uppercase tracking-wide text-tn-black-soft/50 transition-colors duration-200 hover:text-tn-red"
        >
          ← Fournisseurs
        </Link>
      </div>

      {/* SUPPLIER INFO */}
      {supplierLoading ? (
        <div className="mb-8 animate-pulse rounded-2xl border-2 border-tn-black/10 bg-tn-white p-6">
          <div className="h-4 w-1/3 rounded bg-tn-black/10" />
          <div className="mt-3 h-3 w-1/2 rounded bg-tn-black/10" />
        </div>
      ) : supplierError ? (
        <div className="mb-8 rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-8 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-red">{supplierError}</p>
          <button
            type="button"
            onClick={loadSupplier}
            className="mt-4 rounded-lg bg-tn-red px-5 py-2 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
          >
            Réessayer
          </button>
        </div>
      ) : supplier ? (
        <div className="mb-8 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-6">
          <span className="tn-ribbon inline-block bg-tn-red px-3 py-1 text-[11px] font-black uppercase tracking-widest text-tn-white">
            Fournisseur
          </span>
          <h1 className="mt-3 text-2xl font-black uppercase tracking-wide text-tn-black sm:text-3xl">
            {supplier.name}
          </h1>
          <div className="mt-3 grid gap-1 text-sm text-tn-black-soft sm:grid-cols-2">
            {supplier.contactName && <p>Contact : {supplier.contactName}</p>}
            {supplier.phone && <p>Téléphone : {supplier.phone}</p>}
            {supplier.email && <p>Email : {supplier.email}</p>}
            {supplier.address && <p>Adresse : {supplier.address}</p>}
          </div>
          {supplier.notes && (
            <p className="mt-3 text-sm text-tn-black-soft/70">{supplier.notes}</p>
          )}
        </div>
      ) : null}

      {/* ADD SUPPLIER ORDER */}
      <form
        onSubmit={handleCreateOrder}
        className="mb-8 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-6"
      >
        <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60">
          Ajouter une commande fournisseur
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            Référence (optionnel)
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Statut
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SupplierOrderStatus)}
              className={inputClass}
            >
              {SUPPLIER_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Notes (optionnel)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </label>
        </div>

        <h3 className="mt-5 text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
          Articles
        </h3>
        <div className="mt-2 flex flex-col gap-2">
          {lines.map((line, index) => {
            const qty = Number(line.quantity);
            const cost = Number(line.unitCost);
            const lineTotal = Number.isFinite(qty) && Number.isFinite(cost) ? qty * cost : 0;
            return (
              <div
                key={index}
                className="grid gap-2 rounded-lg border-2 border-tn-black/10 p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-end"
              >
                <label className={labelClass}>
                  Produit
                  {catalog.length > 0 ? (
                    <select
                      value={line.productId ?? ""}
                      onChange={(e) => {
                        const productId = e.target.value || null;
                        const product = catalog.find((p) => p.id === productId);
                        updateLine(index, {
                          productId,
                          productName: product ? product.name : line.productName,
                        });
                      }}
                      className={inputClass}
                    >
                      <option value="">Article libre…</option>
                      {catalog.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    value={line.productName}
                    onChange={(e) => updateLine(index, { productId: null, productName: e.target.value })}
                    placeholder="Nom de l'article"
                    className={`${inputClass} ${catalog.length > 0 ? "mt-1.5" : ""}`}
                  />
                </label>
                <label className={labelClass}>
                  Quantité
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Coût unit. (DT)
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.unitCost}
                    onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-black uppercase tracking-wide text-tn-black-soft/70">
                    Total ligne
                  </span>
                  <span className="py-2 text-sm font-black text-tn-black">{formatPrice(lineTotal)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                  className="h-fit rounded-lg border-2 border-tn-black px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black transition-all duration-200 hover:scale-105 hover:border-tn-red hover:bg-tn-red hover:text-tn-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Retirer
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="mt-3 rounded-lg border-2 border-dashed border-tn-black/40 px-4 py-2 text-xs font-black uppercase tracking-wide text-tn-black-soft/70 transition-all duration-200 hover:border-tn-black hover:text-tn-black"
        >
          + Ajouter un article
        </button>

        <div className="mt-4 flex items-center justify-end gap-3 border-t-2 border-tn-black pt-3">
          <span className="text-xs font-black uppercase tracking-wide text-tn-black-soft/70">
            Total commande
          </span>
          <span className="text-lg font-black text-tn-red">{formatPrice(runningTotal)}</span>
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
          {creating ? "Création…" : "Créer la commande"}
        </button>
      </form>

      {/* SUPPLIER ORDERS */}
      <div className="mb-3">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
          Commandes passées auprès de ce fournisseur
        </h2>
      </div>

      {statusActionError && (
        <div className="mb-4 rounded-lg border-2 border-tn-red bg-tn-red/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
          {statusActionError}
        </div>
      )}

      {ordersLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white p-4">
              <div className="h-3 w-1/3 rounded bg-tn-black/10" />
              <div className="mt-3 h-3 w-1/2 rounded bg-tn-black/10" />
            </div>
          ))}
        </div>
      ) : ordersError ? (
        <div className="rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-red">{ordersError}</p>
          <button
            type="button"
            onClick={loadOrders}
            className="mt-4 rounded-lg bg-tn-red px-5 py-2 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
          >
            Réessayer
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
            Aucune commande fournisseur pour le moment.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => {
            const isExpanded = expandedId === order.id;
            return (
              <div
                key={order.id}
                className="overflow-hidden rounded-xl border-2 border-tn-black bg-tn-white shadow-[3px_3px_0_0_var(--tn-black)]"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-tn-offwhite"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-black uppercase tracking-wide text-tn-black">
                      {order.reference || `Commande du ${formatDate(order.createdAt)}`}
                    </span>
                    <span className="text-xs text-tn-black-soft/70">
                      {order.items.length} article{order.items.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-tn-black-soft/50">{formatDate(order.createdAt)}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${STATUS_BADGE_CLASSES[order.status]}`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-sm font-black text-tn-red">{formatPrice(order.totalCost)}</span>
                    <span
                      className={`text-tn-black-soft/40 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    >
                      ▾
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t-2 border-tn-black/10 px-4 py-4">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
                          Statut
                        </h3>
                        <select
                          value={order.status}
                          disabled={updatingId === order.id}
                          onChange={(e) => handleStatusChange(order, e.target.value as SupplierOrderStatus)}
                          className="mt-1.5 rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {SUPPLIER_ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        {updatingId === order.id && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-tn-black-soft/50">
                            <Spinner className="size-3" />
                            Mise à jour…
                          </p>
                        )}
                      </div>
                      {order.notes && (
                        <div>
                          <h3 className="text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
                            Notes
                          </h3>
                          <p className="mt-1.5 text-sm text-tn-black-soft">{order.notes}</p>
                        </div>
                      )}
                    </div>

                    <h3 className="mt-5 text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
                      Articles
                    </h3>
                    <ul className="mt-2 flex flex-col gap-2">
                      {order.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-tn-black/10 pb-2 text-sm"
                        >
                          <span className="font-bold text-tn-black">
                            {item.quantity}× {item.productName}
                            <span className="ml-1.5 text-xs font-normal text-tn-black-soft/50">
                              ({formatPrice(item.unitCost)} / unité)
                            </span>
                          </span>
                          <span className="font-black text-tn-black-soft">{formatPrice(item.lineTotal)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex flex-col items-end gap-1 text-sm">
                      <div className="flex gap-4 border-t-2 border-tn-black pt-1.5">
                        <span className="font-black uppercase text-tn-black">Total</span>
                        <span className="w-24 text-right text-lg font-black text-tn-red">
                          {formatPrice(order.totalCost)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
