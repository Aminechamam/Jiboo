"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/AdminAuthContext";
import { Spinner } from "@/components/Spinner";
import { formatPrice } from "@/lib/supabase";
import {
  ORDER_STATUSES,
  SessionExpiredError,
  fetchMonthlyStats,
  fetchOrders,
  updateOrderStatus,
  type MonthlyStats,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";

const CURRENT_MONTH_LABEL = new Date().toLocaleDateString("fr-TN", {
  month: "long",
  year: "numeric",
});

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border-2 border-tn-black bg-tn-white p-4 shadow-[3px_3px_0_0_var(--tn-black)]">
      <span className="text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
        {label}
      </span>
      <span className="truncate text-2xl font-black leading-tight text-tn-black sm:text-3xl">
        {value}
      </span>
      {sub && (
        <span className="text-xs font-bold uppercase tracking-wide text-tn-red">{sub}</span>
      )}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white p-4">
      <div className="h-2.5 w-2/3 rounded bg-tn-black/10" />
      <div className="mt-3 h-6 w-1/2 rounded bg-tn-black/10" />
    </div>
  );
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  preparee: "Préparée",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée",
};

// Picked from the site's red/amber/black palette, with a single green
// accent (internal-tool-only exception, not used on the public site) for
// "delivered" so it reads as a distinct, positive end state at a glance.
const STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  en_attente: "bg-tn-amber text-tn-black",
  confirmee: "bg-tn-black text-tn-white",
  preparee: "bg-tn-black-soft text-tn-amber",
  expediee: "bg-tn-red text-tn-white",
  livree: "bg-[#1a9d5c] text-tn-white",
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

export default function AdminOrdersPage() {
  const router = useRouter();
  const { session, logout } = useAdminAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(() => {
    logout();
    router.replace("/admin/login");
  }, [logout, router]);

  // Client-side only: this fetch runs in the admin's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  const loadOrders = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    fetchOrders(session.accessToken)
      .then(setOrders)
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Impossible de charger les commandes.");
      })
      .finally(() => setLoading(false));
  }, [session, handleSessionExpired]);

  // Separate from loadOrders — a dashboard stats failure shouldn't block the
  // orders list (and vice versa), so each has its own loading/error state.
  const loadStats = useCallback(() => {
    if (!session) return;
    setStatsLoading(true);
    setStatsError(null);
    fetchMonthlyStats(session.accessToken)
      .then(setStats)
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setStatsError(
          err instanceof Error ? err.message : "Impossible de charger les statistiques."
        );
      })
      .finally(() => setStatsLoading(false));
  }, [session, handleSessionExpired]);

  // Deferred into a timeout (same pattern as CartContext's hydration effect)
  // so the initial setLoading/fetch call isn't a synchronous setState call
  // in the effect body itself.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
      loadStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadOrders, loadStats]);

  const handleStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    if (!session || nextStatus === order.status) return;
    setUpdatingId(order.id);
    setActionError(null);
    const previousStatus = order.status;

    // Optimistic update — rolled back below if the PATCH fails.
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));

    try {
      await updateOrderStatus(session.accessToken, order.id, nextStatus);
      // A status change into/out of "annulee" affects the sales/count/basket
      // figures (cancelled orders are excluded) — keep the cards in sync.
      loadStats();
    } catch (err) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: previousStatus } : o)));
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setActionError(err instanceof Error ? err.message : "Impossible de mettre à jour le statut.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="tn-ribbon inline-block bg-tn-red px-3 py-1 text-[11px] font-black uppercase tracking-widest text-tn-white">
            Commandes
          </span>
          <h1 className="mt-3 text-2xl font-black uppercase tracking-wide text-tn-black sm:text-3xl">
            Gestion des commandes
          </h1>
        </div>
        {!loading && !loadError && (
          <span className="text-xs font-black uppercase tracking-wide text-tn-black-soft/50">
            {orders.length} commande{orders.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* MONTHLY STATS */}
      <div className="mb-8">
        <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
          Ce mois-ci — {CURRENT_MONTH_LABEL}
        </p>
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : statsError ? (
          <div className="rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-tn-red">{statsError}</p>
            <button
              type="button"
              onClick={loadStats}
              className="mt-2 rounded-lg bg-tn-red px-4 py-1.5 text-[11px] font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
            >
              Réessayer
            </button>
          </div>
        ) : (
          stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Ventes du mois" value={formatPrice(stats.totalSales)} />
              <StatCard label="Commandes du mois" value={String(stats.orderCount)} />
              <StatCard label="En attente de traitement" value={String(stats.pendingCount)} />
              <StatCard label="Panier moyen" value={formatPrice(stats.averageBasket)} />
              <StatCard
                label="Produit le plus vendu"
                value={stats.topProductName ?? "—"}
                sub={
                  stats.topProductName
                    ? `${stats.topProductQuantity} vendu${stats.topProductQuantity > 1 ? "s" : ""}`
                    : undefined
                }
              />
            </div>
          )
        )}
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border-2 border-tn-red bg-tn-red/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white p-4"
            >
              <div className="h-3 w-1/3 rounded bg-tn-black/10" />
              <div className="mt-3 h-3 w-1/2 rounded bg-tn-black/10" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-red">{loadError}</p>
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
            Aucune commande pour le moment.
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
                      {order.trackingReference}
                    </span>
                    <span className="text-xs text-tn-black-soft/70">
                      {order.deliveryFullName} — {order.deliveryPhone}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-tn-black-soft/50">{formatDate(order.createdAt)}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${STATUS_BADGE_CLASSES[order.status]}`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-sm font-black text-tn-red">{formatPrice(order.total)}</span>
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
                          Livraison
                        </h3>
                        <p className="mt-1.5 text-sm font-bold text-tn-black">{order.deliveryFullName}</p>
                        <p className="text-sm text-tn-black-soft">{order.deliveryPhone}</p>
                        <p className="text-sm text-tn-black-soft">{order.deliveryAddress}</p>
                        {order.deliveryZoneName && (
                          <p className="text-sm text-tn-black-soft">Zone : {order.deliveryZoneName}</p>
                        )}
                      </div>

                      <div>
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-tn-black-soft/50">
                          Statut
                        </h3>
                        <select
                          value={order.status}
                          disabled={updatingId === order.id}
                          onChange={(e) => handleStatusChange(order, e.target.value as OrderStatus)}
                          className="mt-1.5 rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {ORDER_STATUSES.map((s) => (
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
                            {item.productReference && (
                              <span className="ml-1.5 text-xs font-normal text-tn-black-soft/50">
                                Réf. {item.productReference}
                              </span>
                            )}
                          </span>
                          <span className="font-black text-tn-black-soft">
                            {formatPrice(item.lineTotal)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex flex-col items-end gap-1 text-sm">
                      <div className="flex gap-4">
                        <span className="text-tn-black-soft/70">Sous-total</span>
                        <span className="w-24 text-right font-black text-tn-black">
                          {formatPrice(order.subtotal)}
                        </span>
                      </div>
                      <div className="flex gap-4">
                        <span className="text-tn-black-soft/70">Livraison</span>
                        <span className="w-24 text-right font-black text-tn-black">
                          {formatPrice(order.deliveryFee)}
                        </span>
                      </div>
                      <div className="flex gap-4 border-t-2 border-tn-black pt-1.5">
                        <span className="font-black uppercase text-tn-black">Total</span>
                        <span className="w-24 text-right text-lg font-black text-tn-red">
                          {formatPrice(order.total)}
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
