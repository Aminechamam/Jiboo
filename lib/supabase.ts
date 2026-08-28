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

/** A rayon (Pièces Auto, Quincaillerie, ...) — chaque catégorie appartient à
 *  un seul département. Utilisé pour n'afficher les filtres/infos propres
 *  aux véhicules (marque, modèle, compatibilité) que pour Pièces Auto. */
export type Department = {
  id: string;
  name: string;
  slug: string;
};

export type Category = {
  id: string;
  name: string;
  department: Department | null;
};

/** Forme brute renvoyée par PostgREST pour une catégorie jointe — le nom de
 *  la relation FK est `departments` (pluriel, nom de la table), remappé en
 *  `department` (singulier) dans le type applicatif `Category` ci-dessus. */
type RawCategory = {
  id: string;
  name: string;
  departments: Department | null;
};

function mapCategory(raw: RawCategory | null | undefined): Category | null {
  if (!raw) return null;
  return { id: raw.id, name: raw.name, department: raw.departments };
}

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
  /** Fournisseur ayant livré ce produit — indépendant de `category`, qui
   *  décrit le type de pièce. Utilisé côté admin uniquement (filtre, tri
   *  par lot) ; pas de jointure sur `suppliers` ici (RLS anon-only sur
   *  cette table), juste l'id brut, résolu en nom via `fetchSuppliers()`
   *  côté admin. */
  supplierId: string | null;
  /** Short display summary, e.g. "Peugeot 208 / Golf 7". Vide (pas "Toutes
   *  marques") en dehors du rayon Pièces Auto, où la compatibilité véhicule
   *  n'a pas de sens. */
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
  categories: RawCategory | null;
  supplier_id: string | null;
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

function mapProduct(row: RawProduct): Product {
  const category = mapCategory(row.categories);
  // La compatibilité véhicule (marque/modèle/année) n'a de sens que pour le
  // rayon Pièces Auto — un produit de quincaillerie sans ligne de
  // compatibilité ne doit pas s'afficher comme "Toutes marques".
  const isPiecesAuto = category?.department?.slug === "pieces-auto";
  return {
    id: row.id,
    reference: row.reference,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    photoUrl: row.photo_url,
    lowStockThreshold: row.low_stock_threshold,
    category,
    supplierId: row.supplier_id,
    compatibility: isPiecesAuto ? buildCompatibility(row.product_compatibility) : "",
    compatibilityList: row.product_compatibility ?? [],
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/products?select=id,reference,name,description,price,stock,photo_url,low_stock_threshold,supplier_id,` +
    `categories(id,name,departments(id,name,slug)),product_compatibility(make,model,year_from,year_to,engine)&order=created_at.asc`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger les produits.");
  }
  const rows: RawProduct[] = await res.json();
  return rows.map(mapProduct);
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=id,reference,name,description,price,stock,photo_url,low_stock_threshold,supplier_id,` +
    `categories(id,name,departments(id,name,slug)),product_compatibility(make,model,year_from,year_to,engine)`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger ce produit.");
  }
  const rows: RawProduct[] = await res.json();
  const row = rows[0];
  if (!row) return null;
  return mapProduct(row);
}

export async function fetchCategories(): Promise<Category[]> {
  const url = `${SUPABASE_URL}/rest/v1/categories?select=id,name,departments(id,name,slug)&order=name.asc`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger les catégories.");
  }
  const rows: RawCategory[] = await res.json();
  return rows.map((r) => ({ id: r.id, name: r.name, department: r.departments }));
}

export async function fetchDepartments(): Promise<Department[]> {
  const url = `${SUPABASE_URL}/rest/v1/departments?select=id,name,slug&order=name.asc`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger les rayons.");
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
