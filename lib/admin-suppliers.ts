// Admin-only supplier + supplier-purchase-order data access against the same
// Supabase project as the public site, via PostgREST.
//
// IMPORTANT: same rule as lib/supabase.ts, lib/admin-auth.ts and
// lib/admin-data.ts — every export here must only ever be called from
// client-side code ("use client" components, inside useEffect/event
// handlers), never from a Server Component or at module scope, since
// `next build` runs network-sandboxed here.
//
// Unlike products/orders, the suppliers/supplier_orders/supplier_order_items
// tables have NO public/anon read policy at all — this is internal-only
// data (RLS: is_staff() for select/insert/update, is_admin() for delete).
// Every call below, including reads, is authenticated with the signed-in
// admin's own access token (see authedHeaders in lib/admin-auth.ts) so
// Postgres RLS resolves auth.uid() to that user.

import { SUPABASE_URL } from "./supabase";
import { authedHeaders } from "./admin-auth";
import { SessionExpiredError } from "./admin-data";

// Re-exported so pages that only touch this file don't also need to import
// directly from lib/admin-data.ts for the common "session died mid-action"
// case.
export { SessionExpiredError };

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; msg?: string };
    return data.message ?? data.msg ?? fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
};

type RawSupplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

function mapSupplier(row: RawSupplier): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function fetchSuppliers(accessToken: string): Promise<Supplier[]> {
  const url = `${SUPABASE_URL}/rest/v1/suppliers?select=*&order=name.asc`;
  const res = await fetch(url, { headers: authedHeaders(accessToken) });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de charger les fournisseurs."));
  }
  const rows = (await res.json()) as RawSupplier[];
  return rows.map(mapSupplier);
}

export async function fetchSupplierById(
  accessToken: string,
  id: string
): Promise<Supplier | null> {
  const url = `${SUPABASE_URL}/rest/v1/suppliers?id=eq.${id}&select=*`;
  const res = await fetch(url, { headers: authedHeaders(accessToken) });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de charger ce fournisseur."));
  }
  const rows = (await res.json()) as RawSupplier[];
  const row = rows[0];
  return row ? mapSupplier(row) : null;
}

export type SupplierInput = {
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export async function createSupplier(
  accessToken: string,
  data: SupplierInput
): Promise<Supplier> {
  const url = `${SUPABASE_URL}/rest/v1/suppliers`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authedHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de créer le fournisseur."));
  }
  const rows = (await res.json()) as RawSupplier[];
  const row = rows[0];
  if (!row) throw new Error("Réponse invalide du serveur lors de la création du fournisseur.");
  return mapSupplier(row);
}

export type SupplierPatch = Partial<SupplierInput>;

export async function updateSupplier(
  accessToken: string,
  id: string,
  patch: SupplierPatch
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/suppliers?id=eq.${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...authedHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de mettre à jour le fournisseur."));
  }
}

// ---------------------------------------------------------------------------
// Supplier purchase orders
// ---------------------------------------------------------------------------

export const SUPPLIER_ORDER_STATUSES = [
  "en_attente",
  "confirmee",
  "recue",
  "annulee",
] as const;

export type SupplierOrderStatus = (typeof SUPPLIER_ORDER_STATUSES)[number];

function isSupplierOrderStatus(value: string): value is SupplierOrderStatus {
  return (SUPPLIER_ORDER_STATUSES as readonly string[]).includes(value);
}

export type SupplierOrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

export type SupplierOrder = {
  id: string;
  supplierId: string;
  reference: string | null;
  status: SupplierOrderStatus;
  notes: string | null;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
  items: SupplierOrderItem[];
};

type RawSupplierOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: string | number;
  line_total: string | number;
};

type RawSupplierOrder = {
  id: string;
  supplier_id: string;
  reference: string | null;
  status: string;
  notes: string | null;
  total_cost: string | number;
  created_at: string;
  updated_at: string;
  supplier_order_items: RawSupplierOrderItem[];
};

function mapSupplierOrder(row: RawSupplierOrder): SupplierOrder {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    reference: row.reference,
    status: isSupplierOrderStatus(row.status) ? row.status : "en_attente",
    notes: row.notes,
    totalCost: Number(row.total_cost),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.supplier_order_items ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      unitCost: Number(item.unit_cost),
      lineTotal: Number(item.line_total),
    })),
  };
}

export async function fetchSupplierOrders(
  accessToken: string,
  supplierId: string
): Promise<SupplierOrder[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/supplier_orders?supplier_id=eq.${supplierId}` +
    `&select=*,supplier_order_items(*)&order=created_at.desc`;
  const res = await fetch(url, { headers: authedHeaders(accessToken) });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(
      await parseErrorMessage(res, "Impossible de charger les commandes fournisseur.")
    );
  }
  const rows = (await res.json()) as RawSupplierOrder[];
  return rows.map(mapSupplierOrder);
}

export type SupplierOrderItemInput = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
};

export type SupplierOrderInput = {
  reference: string | null;
  status: SupplierOrderStatus;
  notes: string | null;
  items: SupplierOrderItemInput[];
};

/** Creates a supplier purchase order then its line items, in two sequential
 *  requests (PostgREST has no single-call way to insert a parent row plus a
 *  batch of related child rows together). `total_cost` is computed
 *  client-side as the sum of `quantity * unit_cost` across the items before
 *  the first request. If the line-items insert fails after the order row
 *  was already created, the order is left in place with zero items — this
 *  is an internal tool, so no compensating rollback is attempted; the
 *  thrown error message says as much so the admin knows to check/retry. */
export async function createSupplierOrder(
  accessToken: string,
  supplierId: string,
  data: SupplierOrderInput
): Promise<SupplierOrder> {
  const totalCost = data.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);

  const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/supplier_orders`, {
    method: "POST",
    headers: {
      ...authedHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      supplier_id: supplierId,
      reference: data.reference,
      status: data.status,
      notes: data.notes,
      total_cost: totalCost,
    }),
  });
  if (!orderRes.ok) {
    if (orderRes.status === 401) throw new SessionExpiredError();
    throw new Error(
      await parseErrorMessage(orderRes, "Impossible de créer la commande fournisseur.")
    );
  }
  const orderRows = (await orderRes.json()) as RawSupplierOrder[];
  const orderRow = orderRows[0];
  if (!orderRow) {
    throw new Error("Réponse invalide du serveur lors de la création de la commande.");
  }

  const itemsBody = data.items.map((item) => ({
    supplier_order_id: orderRow.id,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    line_total: item.quantity * item.unit_cost,
  }));

  const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/supplier_order_items`, {
    method: "POST",
    headers: {
      ...authedHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(itemsBody),
  });
  if (!itemsRes.ok) {
    if (itemsRes.status === 401) throw new SessionExpiredError();
    const detail = await parseErrorMessage(
      itemsRes,
      "Impossible d'enregistrer les articles de la commande."
    );
    throw new Error(
      `La commande ${orderRow.reference ?? orderRow.id} a été créée sans ses articles : ${detail}`
    );
  }
  const itemRows = (await itemsRes.json()) as RawSupplierOrderItem[];

  return mapSupplierOrder({ ...orderRow, supplier_order_items: itemRows });
}

export async function updateSupplierOrderStatus(
  accessToken: string,
  orderId: string,
  status: SupplierOrderStatus
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/supplier_orders?id=eq.${orderId}`;
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
