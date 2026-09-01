// Admin-only product management (CRUD + CSV bulk import) against the same
// Supabase project as the public site, via PostgREST.
//
// IMPORTANT: same rule as lib/supabase.ts, lib/admin-auth.ts and
// lib/admin-data.ts — every export here must only ever be called from
// client-side code ("use client" components, inside useEffect/event
// handlers), never from a Server Component or at module scope, since
// `next build` runs network-sandboxed here.
//
// Reads of the product/category lists reuse the existing public
// fetchProducts()/fetchCategories() from lib/supabase.ts (products/categories
// are publicly readable — RLS only restricts writes). Every write below is
// authenticated with the signed-in admin's own access token (see
// authedHeaders in lib/admin-auth.ts) so Postgres RLS resolves auth.uid() to
// that user.

import { SUPABASE_URL, type Category, type Department } from "./supabase";
import { authedHeaders } from "./admin-auth";
import { SessionExpiredError } from "./admin-data";
import { createSupplier, type Supplier } from "./admin-suppliers";

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
// Single-product create / update
// ---------------------------------------------------------------------------

export type ProductPatch = Partial<{
  reference: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category_id: string | null;
  photo_url: string | null;
  /** Fournisseur ayant livré ce produit — indépendant de category_id, voir
   *  le commentaire sur `Product.supplierId` dans lib/supabase.ts. */
  supplier_id: string | null;
  /** Voir le commentaire sur `Product.cardSubtitle` dans lib/supabase.ts. */
  card_subtitle: string | null;
  /** Marque du fabricant (ex. "Ferodo", "Harden") — indépendant de category_id
   *  (type de pièce) et de supplier_id (grossiste qui a livré). Alimente le
   *  filtre par marque du catalogue. Null si inconnue. */
  brand: string | null;
}>;

export async function updateProduct(
  accessToken: string,
  id: string,
  patch: ProductPatch
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/products?id=eq.${id}`;
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
    throw new Error(await parseErrorMessage(res, "Impossible de mettre à jour le produit."));
  }
}

export type ProductInput = {
  reference: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category_id: string | null;
  photo_url: string | null;
  supplier_id: string | null;
  card_subtitle: string | null;
  brand: string | null;
};

/** Raw columns PostgREST hands back for a POST with
 *  `Prefer: return=representation` — no joined relations, just the inserted
 *  row itself. Callers that need a display-ready `Product` (with a resolved
 *  `Category` object) build one client-side by looking `category_id` up in
 *  an already-fetched category list. */
export type CreatedProductRow = {
  id: string;
  reference: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category_id: string | null;
  photo_url: string | null;
  low_stock_threshold: number;
  supplier_id: string | null;
  card_subtitle: string | null;
  brand: string | null;
};

export async function createProduct(
  accessToken: string,
  data: ProductInput
): Promise<CreatedProductRow> {
  const url = `${SUPABASE_URL}/rest/v1/products`;
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
    throw new Error(await parseErrorMessage(res, "Impossible de créer le produit."));
  }
  const rows = (await res.json()) as {
    id: string;
    reference: string;
    name: string;
    description: string;
    price: string | number;
    stock: number;
    category_id: string | null;
    photo_url: string | null;
    low_stock_threshold: number;
    supplier_id: string | null;
    card_subtitle: string | null;
    brand: string | null;
  }[];
  const row = rows[0];
  if (!row) throw new Error("Réponse invalide du serveur lors de la création du produit.");
  return {
    id: row.id,
    reference: row.reference,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    category_id: row.category_id,
    photo_url: row.photo_url,
    low_stock_threshold: row.low_stock_threshold,
    supplier_id: row.supplier_id,
    card_subtitle: row.card_subtitle,
    brand: row.brand,
  };
}

// ---------------------------------------------------------------------------
// Lookup by reference — used by the CSV bulk import's upsert path (see
// bulkImportProducts below) to find the existing row to PATCH when a create
// hits a duplicate `reference`.
// ---------------------------------------------------------------------------

export async function findProductIdByReference(
  accessToken: string,
  reference: string
): Promise<string | null> {
  const url = `${SUPABASE_URL}/rest/v1/products?reference=eq.${encodeURIComponent(reference)}&select=id&limit=1`;
  const res = await fetch(url, { headers: authedHeaders(accessToken) });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de retrouver ce produit."));
  }
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** How many order_items (customer orders) reference this product — shown to
 *  the admin before a delete so the confirmation is informative rather than
 *  a blind "are you sure?". This is purely informational: order_items.
 *  product_id is ON DELETE SET NULL and the row already snapshots
 *  product_name/product_reference/unit_price/line_total at order time, so
 *  deleting the product can never break the display of past orders — the
 *  count just lets the admin make a deliberate choice, it doesn't block
 *  anything. */
export async function countProductOrders(accessToken: string, productId: string): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/order_items?product_id=eq.${productId}&select=id`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: { ...authedHeaders(accessToken), Prefer: "count=exact" },
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    return 0; // Best-effort — a failed count shouldn't block the delete flow.
  }
  const range = res.headers.get("content-range"); // e.g. "*/5" or "0-4/5"
  const total = range?.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

export async function deleteProduct(accessToken: string, id: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/products?id=eq.${id}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { ...authedHeaders(accessToken), Prefer: "return=minimal" },
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(await parseErrorMessage(res, "Impossible de supprimer le produit."));
  }
}

// ---------------------------------------------------------------------------
// Category find-or-create (used by CSV import — categories are matched by
// name, case-insensitively, against an already-fetched list; if none match a
// new one is created via the categories_write_staff RLS policy).
//
// `department` is required for the CREATE path so a brand-new category never
// ends up without a rayon (which is what caused the whole "quincaillerie
// products displayed as compatible with every vehicle" bug — the CSV import
// created a "HARDEN" category with no department at all). An existing
// matched category keeps its own real department untouched.
// ---------------------------------------------------------------------------

export async function findOrCreateCategory(
  accessToken: string,
  name: string,
  existingCategories: Category[],
  department: Department
): Promise<Category> {
  const trimmed = name.trim();
  const match = existingCategories.find(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match;

  const url = `${SUPABASE_URL}/rest/v1/categories`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authedHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ name: trimmed, department_id: department.id }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(
      await parseErrorMessage(res, `Impossible de créer la catégorie "${trimmed}".`)
    );
  }
  const rows = (await res.json()) as { id: string; name: string }[];
  const row = rows[0];
  if (!row) {
    throw new Error(`Réponse invalide du serveur lors de la création de la catégorie "${trimmed}".`);
  }
  return { id: row.id, name: row.name, department };
}

// ---------------------------------------------------------------------------
// Supplier find-or-create (used by CSV import — matched by name,
// case-insensitively, against an already-fetched list; if none match, a new
// supplier is created with just a name via the suppliers_insert_staff RLS
// policy — the rest of its fields (contact, phone...) can be filled in later
// from the Fournisseurs page).
// ---------------------------------------------------------------------------

export async function findOrCreateSupplier(
  accessToken: string,
  name: string,
  existingSuppliers: Supplier[]
): Promise<Supplier> {
  const trimmed = name.trim();
  const match = existingSuppliers.find(
    (s) => s.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match;

  return createSupplier(accessToken, {
    name: trimmed,
    contact_name: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
  });
}

// ---------------------------------------------------------------------------
// CSV parsing — hand-written, no external library (offline install, none
// available). Handles quoted fields (commas/newlines inside quotes, ""
// escaping for a literal quote) which is enough for a straightforward
// RFC4180-ish product export/import file; it does not need to be bulletproof
// against every conceivable edge case.
// ---------------------------------------------------------------------------

function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      // Normalized via the following \n (or a lone trailing \r, ignored).
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // Final field/row if the file doesn't end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-blank lines (e.g. a trailing empty line at EOF).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export type CsvImportRow = {
  /** 1-based line number in the source file (header is line 1), used to
   *  point the admin at the exact offending row in any error message. */
  row: number;
  reference: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryName: string;
  photoUrl: string | null;
  supplierName: string;
  /** Voir le commentaire sur `Product.cardSubtitle` dans lib/supabase.ts.
   *  Colonne optionnelle : null si absente de l'en-tête ou vide sur la ligne. */
  cardSubtitle: string | null;
  /** Voir le commentaire sur `ProductPatch.brand` plus haut. Colonne
   *  optionnelle : null si absente de l'en-tête ou vide sur la ligne. */
  brand: string | null;
};

export type RowIssue = {
  row: number;
  reference?: string;
  reason: string;
};

export type ParseCsvResult = {
  rows: CsvImportRow[];
  errors: RowIssue[];
};

const REQUIRED_HEADERS = ["reference", "name", "price", "stock", "category"] as const;

/** Expected header row, shown in the admin UI hint block. */
export const CSV_EXPECTED_HEADER =
  "reference,name,description,card_subtitle,brand,price,stock,category,photo_url,supplier";

export function parseProductsCsv(text: string): ParseCsvResult {
  const table = parseCsvTable(text);

  if (table.length === 0) {
    return { rows: [], errors: [{ row: 0, reason: "Fichier vide." }] };
  }

  const headerRow = table[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => headerRow.indexOf(name);

  const missing = REQUIRED_HEADERS.filter((h) => colIndex(h) === -1);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          reason: `Colonnes manquantes dans l'en-tête : ${missing.join(", ")}. Attendu : ${CSV_EXPECTED_HEADER}`,
        },
      ],
    };
  }

  const idx = {
    reference: colIndex("reference"),
    name: colIndex("name"),
    description: colIndex("description"),
    cardSubtitle: colIndex("card_subtitle"),
    brand: colIndex("brand"),
    price: colIndex("price"),
    stock: colIndex("stock"),
    category: colIndex("category"),
    photoUrl: colIndex("photo_url"),
    supplier: colIndex("supplier"),
  };

  const rows: CsvImportRow[] = [];
  const errors: RowIssue[] = [];

  for (let i = 1; i < table.length; i += 1) {
    const raw = table[i];
    const rowNumber = i + 1;
    if (raw.length === 1 && raw[0].trim() === "") continue;

    const reference = (raw[idx.reference] ?? "").trim();
    const name = (raw[idx.name] ?? "").trim();
    const description = idx.description >= 0 ? (raw[idx.description] ?? "").trim() : "";
    const cardSubtitle =
      idx.cardSubtitle >= 0 ? (raw[idx.cardSubtitle] ?? "").trim() || null : null;
    const brand = idx.brand >= 0 ? (raw[idx.brand] ?? "").trim() || null : null;
    const priceRaw = (raw[idx.price] ?? "").trim();
    const stockRaw = (raw[idx.stock] ?? "").trim();
    const categoryName = (raw[idx.category] ?? "").trim();
    const photoUrl = idx.photoUrl >= 0 ? (raw[idx.photoUrl] ?? "").trim() || null : null;
    const supplierName = idx.supplier >= 0 ? (raw[idx.supplier] ?? "").trim() : "";

    if (!reference || !name) {
      errors.push({ row: rowNumber, reference, reason: "Référence et nom sont obligatoires." });
      continue;
    }

    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ row: rowNumber, reference, reason: `Prix invalide : "${priceRaw}".` });
      continue;
    }

    const stock = Number(stockRaw);
    if (!Number.isInteger(stock) || stock < 0) {
      errors.push({ row: rowNumber, reference, reason: `Stock invalide : "${stockRaw}".` });
      continue;
    }

    rows.push({
      row: rowNumber,
      reference,
      name,
      description,
      cardSubtitle,
      brand,
      price,
      stock,
      categoryName,
      photoUrl,
      supplierName,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Bulk import — sequential, one row at a time, so a single bad/duplicate row
// (e.g. duplicate `reference`, which is UNIQUE) doesn't abort the whole
// batch. Each row's error is caught individually.
//
// `department` is the rayon to use for any *new* category this batch needs
// to create (an admin picks it once for the whole file before importing —
// see the CSV import UI). Categories that already exist keep their own
// department untouched.
// ---------------------------------------------------------------------------

export type ImportSummary = {
  /** Total rows imported successfully — createdCount + updatedCount. Kept
   *  for callers that only care about the total. */
  successCount: number;
  /** New products inserted. */
  createdCount: number;
  /** Existing products (matched by reference) whose fields were overwritten
   *  by this import instead of failing as a duplicate — see the upsert
   *  comment on bulkImportProducts below. */
  updatedCount: number;
  failures: RowIssue[];
};

function isDuplicateReferenceError(message: string): boolean {
  return /duplicate key|already exists|unique constraint/i.test(message);
}

/** Turns a raw PostgREST/Postgres error message into a short, friendlier
 *  French reason for the per-row import summary — falls back to the raw
 *  message when it doesn't recognize the shape. */
function describeImportError(message: string): string {
  if (isDuplicateReferenceError(message)) {
    return "Référence déjà existante.";
  }
  if (/violates check constraint/i.test(message)) {
    return "Valeur invalide (prix ou stock négatif ?).";
  }
  if (/violates not-null constraint/i.test(message)) {
    return "Champ obligatoire manquant.";
  }
  return message;
}

/** Bulk import — sequential, one row at a time, so a single bad row doesn't
 *  abort the whole batch. Each row's error is caught individually.
 *
 *  Upsert by reference: a row whose `reference` already exists in the
 *  catalogue no longer fails the row — it PATCHes the existing product with
 *  this row's values instead (name, description, price, stock, category,
 *  photo_url, supplier). This is what makes it possible to re-import the
 *  same supplier list a second time (e.g. after adding photo_url values in
 *  bulk) without hitting "référence déjà existante" on every line.
 *
 *  `department` is the rayon to use for any *new* category this batch needs
 *  to create (an admin picks it once for the whole file before importing —
 *  see the CSV import UI). Categories/suppliers that already exist keep
 *  their own department/details untouched. */
export async function bulkImportProducts(
  accessToken: string,
  rows: CsvImportRow[],
  categories: Category[],
  suppliers: Supplier[],
  department: Department,
  onProgress?: (done: number, total: number) => void
): Promise<ImportSummary> {
  const workingCategories = [...categories];
  const workingSuppliers = [...suppliers];
  const failures: RowIssue[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      let categoryId: string | null = null;
      if (row.categoryName) {
        const category = await findOrCreateCategory(
          accessToken,
          row.categoryName,
          workingCategories,
          department
        );
        if (!workingCategories.some((c) => c.id === category.id)) {
          workingCategories.push(category);
        }
        categoryId = category.id;
      }

      let supplierId: string | null = null;
      if (row.supplierName) {
        const supplier = await findOrCreateSupplier(accessToken, row.supplierName, workingSuppliers);
        if (!workingSuppliers.some((s) => s.id === supplier.id)) {
          workingSuppliers.push(supplier);
        }
        supplierId = supplier.id;
      }

      // Every field is always set below (unlike ProductPatch, which is a
      // Partial<> meant for single-field row edits) — typed without
      // `reference` so it slots into both createProduct (full ProductInput,
      // reference added back below) and updateProduct (accepts the looser
      // ProductPatch) on the two paths below.
      const patch: Omit<ProductInput, "reference"> = {
        name: row.name,
        description: row.description,
        card_subtitle: row.cardSubtitle,
        brand: row.brand,
        price: row.price,
        stock: row.stock,
        category_id: categoryId,
        photo_url: row.photoUrl,
        supplier_id: supplierId,
      };

      try {
        await createProduct(accessToken, { reference: row.reference, ...patch });
        createdCount += 1;
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        const message = err instanceof Error ? err.message : "Erreur inconnue.";
        if (!isDuplicateReferenceError(message)) throw err;

        const existingId = await findProductIdByReference(accessToken, row.reference);
        if (!existingId) throw err; // Duplicate per Postgres but not found via RLS — surface the original error.
        await updateProduct(accessToken, existingId, patch);
        updatedCount += 1;
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      const message = err instanceof Error ? err.message : "Erreur inconnue.";
      failures.push({ row: row.row, reference: row.reference, reason: describeImportError(message) });
    } finally {
      onProgress?.(i + 1, rows.length);
    }
  }

  return { successCount: createdCount + updatedCount, createdCount, updatedCount, failures };
}
