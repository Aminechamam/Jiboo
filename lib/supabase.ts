// Thin REST client for the Jiboo Supabase project.
//
// IMPORTANT: every export here must only ever be called from client-side code
// ("use client" components, inside useEffect/event handlers). `next build`'s
// prerendering step runs network-sandboxed in this environment, so any of
// these calls made from a Server Component or at module scope during static
// generation would break the build. Plain fetch() only actually executes in
// the end user's browser at runtime.

export const SUPABASE_URL = "https://hytbgsrqysvluuqihfyv.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_g7W4G7qJ05DazkxVChvGZQ_dfaDuSdx";

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export type Category = {
  id: string;
  name: string;
};

export type DeliveryZone = {
  id: string;
  name: string;
  fee: number;
};

export type ProductCompatibility = {
  make: string;
  model: string;
  year_from: number | null;
  year_to: number | null;
  engine: string | null;
};

export type Product = {
  id: string;
  reference: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  photoUrl: string | null;
  lowStockThreshold: number;
  category: Category | null;
  /** Short display summary, e.g. "Peugeot 208 / Golf 7". */
  compatibility: string;
  /** Full per-vehicle compatibility rows — used by the product detail page. */
  compatibilityList: ProductCompatibility[];
};

type RawProduct = {
  id: string;
  reference: string;
  name: string;
  description: string;
  price: string | number;
  stock: number;
  photo_url: string | null;
  low_stock_threshold: number;
  categories: Category | null;
  product_compatibility: ProductCompatibility[] | null;
};

type RawDeliveryZone = {
  id: string;
  name: string;
  fee: string | number;
};

function buildCompatibility(rows: ProductCompatibility[] | null | undefined): string {
  if (!rows || rows.length === 0) return "Toutes marques";
  return rows
    .slice(0, 2)
    .map((r) => `${r.make} ${r.model}`.trim())
    .join(" / ");
}

/** Format a TND price the way the rest of the site does: "24,500 DT". */
export function formatPrice(price: number): string {
  return `${price.toFixed(3).replace(".", ",")} DT`;
}

export async function fetchProducts(): Promise<Product[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/products?select=id,reference,name,description,price,stock,photo_url,low_stock_threshold,` +
    `categories(id,name),product_compatibility(make,model,year_from,year_to,engine)&order=created_at.asc`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger les produits.");
  }
  const rows: RawProduct[] = await res.json();

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    photoUrl: row.photo_url,
    lowStockThreshold: row.low_stock_threshold,
    category: row.categories ?? null,
    compatibility: buildCompatibility(row.product_compatibility),
    compatibilityList: row.product_compatibility ?? [],
  }));
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=id,reference,name,description,price,stock,photo_url,low_stock_threshold,` +
    `categories(id,name),product_compatibility(make,model,year_from,year_to,engine)`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger ce produit.");
  }
  const rows: RawProduct[] = await res.json();
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    reference: row.reference,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    photoUrl: row.photo_url,
    lowStockThreshold: row.low_stock_threshold,
    category: row.categories ?? null,
    compatibility: buildCompatibility(row.product_compatibility),
    compatibilityList: row.product_compatibility ?? [],
  };
}

export async function fetchCategories(): Promise<Category[]> {
  const url = `${SUPABASE_URL}/rest/v1/categories?select=id,name&order=name.asc`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger les catégories.");
  }
  return res.json();
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  const url = `${SUPABASE_URL}/rest/v1/delivery_zones?select=id,name,fee&order=name.asc`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger les zones de livraison.");
  }
  const rows: RawDeliveryZone[] = await res.json();
  return rows.map((r) => ({ id: r.id, name: r.name, fee: Number(r.fee) }));
}

export type PlaceOrderPayload = {
  p_full_name: string;
  p_phone: string;
  p_address: string;
  p_delivery_zone_id: string;
  p_items: { product_id: string; quantity: number }[];
};

export type PlaceOrderResult = {
  orderId: string;
  trackingReference: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
};

type RawOrderResult = {
  order_id: string | null;
  tracking_reference: string | null;
  subtotal: string | number | null;
  delivery_fee: string | number | null;
  total: string | number | null;
  /** Set (with every other field null) when the RPC completes normally but
   *  rejects the request — currently only the anti-abuse rate limit. This
   *  is a deliberate 200-OK "soft error" for that one case specifically,
   *  not a raised exception, because raising would roll back the abuse-log
   *  row the function writes right before returning it. Every other
   *  validation (empty cart, bad zone, insufficient stock, ...) still
   *  raises and is handled by the !res.ok branch below. */
  error_message: string | null;
};

export async function placeGuestOrder(
  payload: PlaceOrderPayload
): Promise<PlaceOrderResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/place_guest_order`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // No JSON body (e.g. empty response) — fall through to error handling below.
  }

  if (!res.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Une erreur est survenue lors de la commande. Veuillez réessayer.";
    throw new Error(message);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RawOrderResult | null | undefined;
  if (!row) {
    throw new Error("Réponse invalide du serveur.");
  }
  if (row.error_message) {
    throw new Error(row.error_message);
  }
  if (!row.order_id || !row.tracking_reference) {
    throw new Error("Réponse invalide du serveur.");
  }

  return {
    orderId: String(row.order_id),
    trackingReference: String(row.tracking_reference),
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
  };
}
