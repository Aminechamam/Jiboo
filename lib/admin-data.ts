// Admin-only data access (orders + team/profiles) against the same
// Supabase project as the public site, via PostgREST.
//
// IMPORTANT: same rule as lib/supabase.ts and lib/admin-auth.ts — every
// export here must only ever be called from client-side code ("use client"
// components, inside useEffect/event handlers), never from a Server
// Component or at module scope, since `next build` runs network-sandboxed
// here.
//
// Every call below is authenticated with the signed-in admin's own access
// token (see authedHeaders in lib/admin-auth.ts) so Postgres RLS resolves
// auth.uid() to that user — authorization is enforced by the database
// policies (orders_select_own_or_staff / is_staff(), profiles_select_staff,
// profiles_update_admin), not by anything the client does.

import { SUPABASE_URL } from "./supabase";
import { authedHeaders } from "./admin-auth";

/** Thrown instead of a generic Error when a request comes back 401 — lets
 *  callers distinguish "your session died mid-action, please log back in"
 *  from an ordinary failure without resorting to matching on message text. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Votre session a expiré. Veuillez vous reconnecter.");
    this.name = "SessionExpiredError";
  }
}

export const ORDER_STATUSES = [
  "en_attente",
  "confirmee",
  "preparee",
  "expediee",
  "livree",
  "annulee",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItem = {
  id: string;
  productName: string;
  productReference: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  trackingReference: string;
  status: OrderStatus;
  deliveryFullName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryZoneName: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
  items: OrderItem[];
};

type RawOrderItem = {
  id: string;
  product_name: string;
  product_reference: string | null;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
};

type RawOrder = {
  id: string;
  tracking_reference: string;
  status: string;
  delivery_full_name: string;
  delivery_phone: string;
  delivery_address: string;
  subtotal: string | number;
  delivery_fee: string | number;
  total: string | number;
  created_at: string;
  order_items: RawOrderItem[];
  /** Embedded via the orders.delivery_zone_id → delivery_zones.id FK. */
  delivery_zones: { name: string } | null;
};

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

function mapOrder(row: RawOrder): Order {
  return {
    id: row.id,
    trackingReference: row.tracking_reference,
    status: isOrderStatus(row.status) ? row.status : "en_attente",
    deliveryFullName: row.delivery_full_name,
    deliveryPhone: row.delivery_phone,
    deliveryAddress: row.delivery_address,
    deliveryZoneName: row.delivery_zones?.name ?? null,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    createdAt: row.created_at,
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      productName: item.product_name,
      productReference: item.product_reference,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
  };
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; msg?: string };
    return data.message ?? data.msg ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchOrders(accessToken: string): Promise<Order[]> {
  const url = `${SUPABASE_URL}/rest/v1/orders?select=*,order_items(*),delivery_zones(name)&order=created_at.desc`;
  const res = await fetch(url, { headers: authedHeaders(accessToken) });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de charger les commandes."));
  }
  const rows = (await res.json()) as RawOrder[];
  return rows.map(mapOrder);
}

export async function updateOrderStatus(
  accessToken: string,
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...authedHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de mettre à jour le statut."));
  }
}

// ---------------------------------------------------------------------------
// Monthly dashboard stats
// ---------------------------------------------------------------------------

export type MonthlyStats = {
  totalSales: number;
  orderCount: number;
  pendingCount: number;
  averageBasket: number;
  topProductName: string | null;
  topProductQuantity: number;
};

type RawMonthlyStats = {
  total_sales: string | number;
  order_count: number;
  pending_count: number;
  average_basket: string | number;
  top_product_name: string | null;
  top_product_quantity: number;
};

const EMPTY_STATS: MonthlyStats = {
  totalSales: 0,
  orderCount: 0,
  pendingCount: 0,
  averageBasket: 0,
  topProductName: null,
  topProductQuantity: 0,
};

/** Backed by the `admin_monthly_stats()` Postgres function — a single RPC
 *  call that aggregates sales/order-count/pending-count/average-basket/
 *  top-product for the current calendar month directly in the database,
 *  rather than pulling every order to the client to sum in JS. It runs
 *  SECURITY INVOKER (the default), so it only ever sees what the calling
 *  admin's own RLS already permits — no privilege bypass. */
export async function fetchMonthlyStats(accessToken: string): Promise<MonthlyStats> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/admin_monthly_stats`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authedHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de charger les statistiques."));
  }
  const rows = (await res.json()) as RawMonthlyStats[];
  const row = rows[0];
  if (!row) return EMPTY_STATS;
  return {
    totalSales: Number(row.total_sales),
    orderCount: row.order_count,
    pendingCount: row.pending_count,
    averageBasket: Number(row.average_basket),
    topProductName: row.top_product_name,
    topProductQuantity: row.top_product_quantity,
  };
}

// ---------------------------------------------------------------------------
// Team / profiles
// ---------------------------------------------------------------------------

export type ProfileRole = "admin" | "employee";

export type Profile = {
  id: string;
  email: string;
  fullName: string | null;
  role: ProfileRole;
};

type RawProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

function isProfileRole(value: string): value is ProfileRole {
  return value === "admin" || value === "employee";
}

export async function fetchProfiles(accessToken: string): Promise<Profile[]> {
  const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,email,full_name,role&order=email.asc`;
  const res = await fetch(url, { headers: authedHeaders(accessToken) });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de charger l'équipe."));
  }
  const rows = (await res.json()) as RawProfileRow[];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: isProfileRole(row.role) ? row.role : "employee",
  }));
}

export async function updateProfileRole(
  accessToken: string,
  profileId: string,
  role: ProfileRole
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...authedHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de mettre à jour le rôle."));
  }
}
