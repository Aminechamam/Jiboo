"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/AdminAuthContext";
import { PartPlaceholder } from "@/components/PartPlaceholder";
import { Spinner } from "@/components/Spinner";
import {
  fetchCategories,
  fetchDepartments,
  fetchProducts,
  formatPrice,
  type Category,
  type Department,
  type Product,
} from "@/lib/supabase";
import {
  SessionExpiredError,
  bulkImportProducts,
  countProductOrders,
  createProduct,
  deleteProduct,
  parseProductsCsv,
  replaceProductPhotos,
  updateProduct,
  CSV_EXPECTED_HEADER,
  type ImportSummary,
  type RowIssue,
} from "@/lib/admin-products";
import { fetchSuppliers, type Supplier } from "@/lib/admin-suppliers";

type Draft = {
  reference: string;
  name: string;
  description: string;
  /** Voir le commentaire sur `Product.cardSubtitle` dans lib/supabase.ts. */
  cardSubtitle: string;
  /** Voir le commentaire sur `Product.brand` dans lib/supabase.ts. */
  brand: string;
  /** Voir le commentaire sur `Product.oemReference` dans lib/supabase.ts. */
  oemReference: string;
  price: string;
  stock: string;
  categoryId: string;
  photoUrl: string;
  /** Photos secondaires (galerie fiche produit) — voir le commentaire sur
   *  `Product.photoUrls` dans lib/supabase.ts. Chaque entrée est une URL en
   *  cours de saisie ; les entrées vides sont filtrées avant l'enregistrement. */
  photoUrls: string[];
  supplierId: string;
};

function productToDraft(product: Product): Draft {
  return {
    reference: product.reference,
    name: product.name,
    description: product.description,
    cardSubtitle: product.cardSubtitle ?? "",
    brand: product.brand ?? "",
    oemReference: product.oemReference ?? "",
    price: String(product.price),
    stock: String(product.stock),
    categoryId: product.category?.id ?? "",
    photoUrl: product.photoUrl ?? "",
    photoUrls: product.photoUrls.length > 0 ? product.photoUrls : [],
    supplierId: product.supplierId ?? "",
  };
}

const EMPTY_NEW_PRODUCT: Draft = {
  reference: "",
  name: "",
  description: "",
  cardSubtitle: "",
  brand: "",
  oemReference: "",
  price: "",
  stock: "",
  categoryId: "",
  photoUrl: "",
  photoUrls: [],
  supplierId: "",
};

/** Parses + validates a Draft's numeric fields. Returns an error message on
 *  the first problem found, or null if the draft is submittable. */
function validateDraft(draft: Draft): string | null {
  if (!draft.reference.trim() || !draft.name.trim()) {
    return "Référence et nom sont obligatoires.";
  }
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price < 0) {
    return "Le prix doit être un nombre positif ou nul.";
  }
  const stock = Number(draft.stock);
  if (!Number.isInteger(stock) || stock < 0) {
    return "Le stock doit être un entier positif ou nul.";
  }
  return null;
}

/** Options d'un <select> de catégorie, groupées par rayon (department) —
 *  une catégorie sans rayon (ne devrait plus arriver après la migration
 *  departments, gardé par sécurité) tombe dans un groupe "Sans rayon". */
function CategoryOptions({ categories }: { categories: Category[] }) {
  const groups = new Map<string, { label: string; items: Category[] }>();
  for (const c of categories) {
    const key = c.department?.id ?? "none";
    const label = c.department?.name ?? "Sans rayon";
    const group = groups.get(key);
    if (group) {
      group.items.push(c);
    } else {
      groups.set(key, { label, items: [c] });
    }
  }
  return (
    <>
      {Array.from(groups.values()).map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Options d'un <select> de fournisseur — liste plate (pas de groupement,
 *  contrairement aux catégories), triée par nom côté fetchSuppliers(). */
function SupplierOptions({ suppliers }: { suppliers: Supplier[] }) {
  return (
    <>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </>
  );
}

/** Case marque du formulaire produit — menu deroulant des marques deja
 *  utilisees dans le catalogue (pour eviter les fautes de frappe qui
 *  creeraient une marque en double, ex. "Ferodo" vs "ferodo "). Un choix
 *  "+ Nouvelle marque" fait basculer sur un champ texte libre pour les cas
 *  ou une marque encore jamais utilisee doit etre ajoutee. */
function BrandField({
  value,
  onChange,
  brands,
}: {
  value: string;
  onChange: (next: string) => void;
  brands: string[];
}) {
  const isKnownValue = value.trim() === "" || brands.includes(value);
  const [customMode, setCustomMode] = useState(!isKnownValue);

  if (customMode) {
    return (
      <div className="flex flex-col gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex. : Ferodo"
          className={inputClass}
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
          className="w-fit text-[11px] font-bold uppercase tracking-wide text-tn-black-soft/50 underline decoration-dotted underline-offset-2 hover:text-tn-red"
        >
          Choisir dans la liste
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setCustomMode(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      className={inputClass}
    >
      <option value="">Aucune</option>
      {brands.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
      <option value="__new__">+ Nouvelle marque...</option>
    </select>
  );
}

/** Liste éditable d'URLs de photos secondaires — une ligne par photo, avec
 *  bouton de suppression et bouton d'ajout. Les champs vides ne sont filtrés
 *  qu'au moment de l'enregistrement (voir replaceProductPhotos), pas ici, pour
 *  ne pas gêner la saisie pendant qu'un champ est en cours de frappe. */
function PhotoUrlsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder="https://..."
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="flex-none rounded-lg border-2 border-tn-black bg-tn-white px-2.5 py-2 text-[11px] font-black uppercase tracking-wide text-tn-black-soft/60 transition-colors duration-200 hover:border-tn-red hover:text-tn-red"
          >
            Retirer
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="w-fit rounded-lg border-2 border-dashed border-tn-black-soft/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-tn-black-soft/60 transition-colors duration-200 hover:border-tn-red hover:text-tn-red"
      >
        + Ajouter une photo
      </button>
    </div>
  );
}

function StockBadge({ product }: { product: Product }) {
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= product.lowStockThreshold;
  if (outOfStock) {
    return (
      <span className="rounded-full bg-tn-black-soft/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-tn-black-soft/50">
        Rupture
      </span>
    );
  }
  if (lowStock) {
    return (
      <span className="rounded-full bg-tn-amber px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-tn-black">
        {product.stock} — limité
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#1a9d5c]/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[#1a9d5c]">
      {product.stock} en stock
    </span>
  );
}

const inputClass =
  "rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-sm font-medium normal-case text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const labelClass = "flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70";

export default function AdminProduitsPage() {
  const router = useRouter();
  const { session, logout } = useAdminAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filtres de la liste — client-side uniquement, pensés pour retrouver
  // rapidement le lot d'un fournisseur donné (ex. "Rekik") pendant le
  // rattachement manuel des photos après un import CSV.
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [onlyMissingPhoto, setOnlyMissingPhoto] = useState(false);
  const [nameQuery, setNameQuery] = useState<string>("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [newProduct, setNewProduct] = useState<Draft>(EMPTY_NEW_PRODUCT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvProgress, setCsvProgress] = useState<{ done: number; total: number } | null>(null);
  const [csvSummary, setCsvSummary] = useState<ImportSummary | null>(null);
  const [csvParseErrors, setCsvParseErrors] = useState<RowIssue[]>([]);
  const [csvDepartmentId, setCsvDepartmentId] = useState<string>("");

  // Delete confirmation: deleteTarget !== null opens the modal.
  // orderCount is null while it's still being fetched.
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteOrderCount, setDeleteOrderCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(() => {
    logout();
    router.replace("/admin/login");
  }, [logout, router]);

  // Client-side only: these fetches run in the admin's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  // Reads reuse the public fetchProducts()/fetchCategories() — RLS only
  // restricts writes, not reads, on these tables. fetchSuppliers() is the
  // exception — suppliers has no anon SELECT policy at all, so it needs the
  // signed-in admin's access token (AdminShell guarantees `session` is set
  // by the time this page renders).
  const loadAll = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchProducts(),
      fetchCategories(),
      fetchDepartments(),
      fetchSuppliers(session.accessToken),
    ])
      .then(([p, c, d, s]) => {
        setProducts(p);
        setCategories(c);
        setDepartments(d);
        setSuppliers(s);
        setNewProduct((prev) => ({ ...prev, categoryId: prev.categoryId || c[0]?.id || "" }));
        setCsvDepartmentId((prev) => prev || d[0]?.id || "");
      })
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setLoadError("Impossible de charger les produits. Veuillez réessayer.");
      })
      .finally(() => setLoading(false));
  }, [session, handleSessionExpired]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const handleExpand = (product: Product) => {
    if (expandedId === product.id) {
      setExpandedId(null);
      setDraft(null);
      setRowError(null);
      return;
    }
    setExpandedId(product.id);
    setDraft(productToDraft(product));
    setRowError(null);
  };

  const handleSave = async (product: Product) => {
    if (!session || !draft) return;
    const validationError = validateDraft(draft);
    if (validationError) {
      setRowError(validationError);
      return;
    }

    setSavingId(product.id);
    setRowError(null);

    const nextPrice = Number(draft.price);
    const nextStock = Number(draft.stock);
    const nextCategory = categories.find((c) => c.id === draft.categoryId) ?? null;
    const previous = product;

    const cleanedPhotoUrls = draft.photoUrls.map((u) => u.trim()).filter(Boolean);

    // Optimistic update — rolled back below if the PATCH fails.
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              reference: draft.reference.trim(),
              name: draft.name.trim(),
              description: draft.description.trim(),
              cardSubtitle: draft.cardSubtitle.trim() || null,
              brand: draft.brand.trim() || null,
              oemReference: draft.oemReference.trim() || null,
              price: nextPrice,
              stock: nextStock,
              category: nextCategory,
              photoUrl: draft.photoUrl.trim() || null,
              photoUrls: cleanedPhotoUrls,
              supplierId: draft.supplierId || null,
            }
          : p
      )
    );

    try {
      await updateProduct(session.accessToken, product.id, {
        reference: draft.reference.trim(),
        name: draft.name.trim(),
        description: draft.description.trim(),
        card_subtitle: draft.cardSubtitle.trim() || null,
        brand: draft.brand.trim() || null,
        oem_reference: draft.oemReference.trim() || null,
        price: nextPrice,
        stock: nextStock,
        category_id: draft.categoryId || null,
        photo_url: draft.photoUrl.trim() || null,
        supplier_id: draft.supplierId || null,
      });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? previous : p)));
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setRowError(err instanceof Error ? err.message : "Impossible de mettre à jour le produit.");
      setSavingId(null);
      return;
    }

    // Le produit principal est déjà enregistré à ce stade — une erreur ici ne
    // le remet pas en cause, elle ne concerne que les photos secondaires ;
    // on garde donc le panneau d'édition ouvert pour permettre de réessayer
    // plutôt que de rollback tout le formulaire.
    try {
      await replaceProductPhotos(session.accessToken, product.id, cleanedPhotoUrls);
      setExpandedId(null);
      setDraft(null);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setRowError(
        err instanceof Error
          ? `Produit enregistré, mais : ${err.message}`
          : "Produit enregistré, mais impossible de mettre à jour les photos secondaires."
      );
    } finally {
      setSavingId(null);
    }
  };

  const openDeleteConfirm = (product: Product) => {
    if (!session) return;
    setDeleteTarget(product);
    setDeleteOrderCount(null);
    setDeleteError(null);
    countProductOrders(session.accessToken, product.id)
      .then(setDeleteOrderCount)
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleSessionExpired();
          return;
        }
        setDeleteOrderCount(0);
      });
  };

  const closeDeleteConfirm = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteOrderCount(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!session || !deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteProduct(session.accessToken, deleteTarget.id);
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setDraft(null);
      }
      setDeleteTarget(null);
      setDeleteOrderCount(null);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setDeleteError(err instanceof Error ? err.message : "Impossible de supprimer le produit.");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session || creating) return;
    const validationError = validateDraft(newProduct);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const created = await createProduct(session.accessToken, {
        reference: newProduct.reference.trim(),
        name: newProduct.name.trim(),
        description: newProduct.description.trim(),
        card_subtitle: newProduct.cardSubtitle.trim() || null,
        brand: newProduct.brand.trim() || null,
        oem_reference: newProduct.oemReference.trim() || null,
        price: Number(newProduct.price),
        stock: Number(newProduct.stock),
        category_id: newProduct.categoryId || null,
        photo_url: newProduct.photoUrl.trim() || null,
        supplier_id: newProduct.supplierId || null,
      });

      const category = categories.find((c) => c.id === created.category_id) ?? null;
      const isPiecesAuto = category?.department?.slug === "pieces-auto";
      const cleanedPhotoUrls = newProduct.photoUrls.map((u) => u.trim()).filter(Boolean);
      const product: Product = {
        id: created.id,
        reference: created.reference,
        name: created.name,
        description: created.description,
        cardSubtitle: created.card_subtitle,
        brand: created.brand,
        oemReference: created.oem_reference,
        price: created.price,
        stock: created.stock,
        photoUrl: created.photo_url,
        photoUrls: cleanedPhotoUrls,
        lowStockThreshold: created.low_stock_threshold,
        category,
        supplierId: created.supplier_id,
        compatibility: isPiecesAuto ? "Toutes marques" : "",
        compatibilityList: [],
      };
      setProducts((prev) => [product, ...prev]);
      setNewProduct({ ...EMPTY_NEW_PRODUCT, categoryId: newProduct.categoryId, supplierId: newProduct.supplierId });

      // Le produit est déjà créé à ce stade — une erreur ici ne le remet pas
      // en cause, elle ne concerne que les photos secondaires.
      if (cleanedPhotoUrls.length > 0) {
        try {
          await replaceProductPhotos(session.accessToken, created.id, cleanedPhotoUrls);
        } catch (photoErr) {
          if (photoErr instanceof SessionExpiredError) {
            handleSessionExpired();
            return;
          }
          setCreateError(
            photoErr instanceof Error
              ? `Produit créé, mais : ${photoErr.message}`
              : "Produit créé, mais impossible d'enregistrer les photos secondaires."
          );
        }
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setCreateError(err instanceof Error ? err.message : "Impossible de créer le produit.");
    } finally {
      setCreating(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !session) return;

    setCsvSummary(null);
    setCsvParseErrors([]);
    setCsvBusy(true);
    setCsvProgress(null);

    try {
      const text = await file.text();
      const { rows, errors } = parseProductsCsv(text);
      setCsvParseErrors(errors);

      if (rows.length === 0) {
        setCsvBusy(false);
        return;
      }

      const chosenDepartment = departments.find((d) => d.id === csvDepartmentId);
      if (!chosenDepartment) {
        setCsvParseErrors((prev) => [
          ...prev,
          { row: 0, reason: "Choisissez un rayon avant d'importer." },
        ]);
        setCsvBusy(false);
        return;
      }

      setCsvProgress({ done: 0, total: rows.length });
      const summary = await bulkImportProducts(
        session.accessToken,
        rows,
        categories,
        suppliers,
        chosenDepartment,
        (done, total) => {
          setCsvProgress({ done, total });
        }
      );
      setCsvSummary(summary);
      loadAll();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }
      setCsvParseErrors((prev) => [
        ...prev,
        { row: 0, reason: err instanceof Error ? err.message : "Erreur lors de l'import." },
      ]);
    } finally {
      setCsvBusy(false);
    }
  };

  const existingBrands = Array.from(
    new Set(
      products
        .map((p) => p.brand?.trim())
        .filter((b): b is string => !!b)
    )
  ).sort((a, b) => a.localeCompare(b));

  const trimmedNameQuery = nameQuery.trim().toLowerCase();

  const visibleProducts = products.filter((product) => {
    if (supplierFilter === "none" && product.supplierId) return false;
    if (supplierFilter && supplierFilter !== "none" && product.supplierId !== supplierFilter) {
      return false;
    }
    if (onlyMissingPhoto && product.photoUrl) return false;
    if (
      trimmedNameQuery &&
      !product.reference.toLowerCase().includes(trimmedNameQuery) &&
      !product.name.toLowerCase().includes(trimmedNameQuery) &&
      !(product.brand ?? "").toLowerCase().includes(trimmedNameQuery)
    ) {
      return false;
    }
    return true;
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="tn-ribbon inline-block bg-tn-red px-3 py-1 text-[11px] font-black uppercase tracking-widest text-tn-white">
            Produits
          </span>
          <h1 className="mt-3 text-2xl font-black uppercase tracking-wide text-tn-black sm:text-3xl">
            Gestion des produits
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCsvImport((v) => !v)}
            aria-expanded={showCsvImport}
            className="flex items-center gap-2 rounded-lg border-2 border-tn-black bg-tn-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-tn-black transition-all duration-200 hover:scale-105 hover:bg-tn-offwhite active:scale-95"
          >
            {showCsvImport ? "Fermer" : "Import CSV"}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            aria-expanded={showAddForm}
            className="flex items-center gap-2 rounded-lg bg-tn-red px-5 py-2.5 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
          >
            {showAddForm ? "Fermer" : "+ Ajouter un produit"}
          </button>
        </div>
      </div>

      {/* ADD PRODUCT */}
      {showAddForm && (
      <form
        onSubmit={handleCreate}
        className="mb-8 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-6"
      >
        <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60">
          Ajouter un produit
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            Référence
            <input
              required
              value={newProduct.reference}
              onChange={(e) => setNewProduct((p) => ({ ...p, reference: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Nom
            <input
              required
              value={newProduct.name}
              onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Catégorie
            <select
              value={newProduct.categoryId}
              onChange={(e) => setNewProduct((p) => ({ ...p, categoryId: e.target.value }))}
              className={inputClass}
            >
              <option value="">Aucune</option>
              <CategoryOptions categories={categories} />
            </select>
          </label>
          <label className={labelClass}>
            Fournisseur
            <select
              value={newProduct.supplierId}
              onChange={(e) => setNewProduct((p) => ({ ...p, supplierId: e.target.value }))}
              className={inputClass}
            >
              <option value="">Aucun</option>
              <SupplierOptions suppliers={suppliers} />
            </select>
          </label>
          <label className={labelClass}>
            Marque (fabricant)
            <BrandField
              value={newProduct.brand}
              onChange={(next) => setNewProduct((p) => ({ ...p, brand: next }))}
              brands={existingBrands}
            />
          </label>
          <label className={labelClass}>
            Référence origine (OEM) — pièces auto, optionnel
            <input
              value={newProduct.oemReference}
              onChange={(e) => setNewProduct((p) => ({ ...p, oemReference: e.target.value }))}
              placeholder="Ex. : T153401310BB"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Prix (DT)
            <input
              required
              type="number"
              min="0"
              step="0.001"
              value={newProduct.price}
              onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Stock
            <input
              required
              type="number"
              min="0"
              step="1"
              value={newProduct.stock}
              onChange={(e) => setNewProduct((p) => ({ ...p, stock: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Photo principale (URL, optionnel)
            <input
              value={newProduct.photoUrl}
              onChange={(e) => setNewProduct((p) => ({ ...p, photoUrl: e.target.value }))}
              className={inputClass}
            />
          </label>
          <div className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
            Photos secondaires (galerie fiche produit, optionnel)
            <PhotoUrlsField
              value={newProduct.photoUrls}
              onChange={(next) => setNewProduct((p) => ({ ...p, photoUrls: next }))}
            />
          </div>
          <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
            Description
            <textarea
              rows={2}
              value={newProduct.description}
              onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
              className={`${inputClass} resize-none`}
            />
          </label>
          <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
            Accroche carte produit (affichée sur la carte catalogue/accueil, à la place de la référence)
            <input
              value={newProduct.cardSubtitle}
              onChange={(e) => setNewProduct((p) => ({ ...p, cardSubtitle: e.target.value }))}
              placeholder="Ex. : Compatible toutes marques — livraison 24h"
              className={inputClass}
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
          {creating ? "Création…" : "Ajouter le produit"}
        </button>
      </form>
      )}

      {/* CSV IMPORT */}
      {showCsvImport && (
      <div className="mb-8 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60">
          Import CSV
        </h2>
        <p className="mt-2 text-xs text-tn-black-soft/70">
          En-tête attendu (ordre libre, casse ignorée) :
        </p>
        <code className="mt-1 block w-fit rounded-lg bg-tn-offwhite px-3 py-1.5 text-[11px] font-bold text-tn-black-soft">
          {CSV_EXPECTED_HEADER}
        </code>
        <p className="mt-2 text-xs text-tn-black-soft/70">
          <code className="font-bold">reference</code> et <code className="font-bold">name</code>{" "}
          sont obligatoires. <code className="font-bold">category</code> et{" "}
          <code className="font-bold">supplier</code> sont créés automatiquement s&apos;ils
          n&apos;existent pas encore. <code className="font-bold">photo_url</code> est optionnelle.{" "}
          <code className="font-bold">card_subtitle</code> est optionnelle : c&apos;est le texte
          affiché sur la carte produit (catalogue/accueil) à la place de la référence.{" "}
          <code className="font-bold">brand</code> est optionnelle : c&apos;est la marque du
          fabricant (ex. Ferodo, Harden), utilisée par le filtre par marque du catalogue.{" "}
          <code className="font-bold">oem_reference</code> est optionnelle : c&apos;est la
          référence pièce d&apos;origine (OEM) constructeur, pertinente pour les pièces auto
          uniquement. Les lignes sont importées une par une&nbsp;: une ligne en erreur (prix invalide,
          stock invalide…) n&apos;empêche pas les autres d&apos;être importées. Une{" "}
          <code className="font-bold">reference</code> déjà présente dans le catalogue n&apos;est
          plus un échec&nbsp;: le produit existant est mis à jour avec les valeurs de la ligne
          (utile pour réimporter le même fichier après avoir ajouté les <code className="font-bold">photo_url</code>).
        </p>

        <label className={`${labelClass} mt-4 max-w-xs`}>
          Rayon (pour toute nouvelle catégorie créée par cet import)
          <select
            value={csvDepartmentId}
            onChange={(e) => setCsvDepartmentId(e.target.value)}
            className={inputClass}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            disabled={csvBusy}
            onChange={handleFileChange}
            className="text-xs font-bold text-tn-black-soft file:mr-3 file:rounded-lg file:border-2 file:border-tn-black file:bg-tn-black file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-wide file:text-tn-white file:transition-all file:duration-200 hover:file:scale-105 hover:file:bg-tn-red disabled:cursor-not-allowed disabled:opacity-50"
          />
          {csvBusy && csvProgress && (
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/60">
              <Spinner className="size-3.5" />
              Import en cours… {csvProgress.done}/{csvProgress.total}
            </span>
          )}
        </div>

        {csvBusy && csvProgress && csvProgress.total > 0 && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-tn-offwhite">
            <div
              className="h-full rounded-full bg-tn-red transition-all duration-200"
              style={{ width: `${Math.round((csvProgress.done / csvProgress.total) * 100)}%` }}
            />
          </div>
        )}

        {csvParseErrors.length > 0 && (
          <div className="mt-4 rounded-lg border-2 border-tn-red bg-tn-red/10 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-tn-red">
              {csvParseErrors.length} ligne{csvParseErrors.length > 1 ? "s" : ""} ignorée
              {csvParseErrors.length > 1 ? "s" : ""} avant import
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {csvParseErrors.map((issue, i) => (
                <li key={i} className="text-xs text-tn-red/90">
                  {issue.row > 0 ? `Ligne ${issue.row}` : "Erreur"} : {issue.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {csvSummary && (
          <div className="mt-4 rounded-lg border-2 border-tn-black bg-tn-offwhite p-3">
            <p className="text-xs font-black uppercase tracking-wide text-tn-black">
              {csvSummary.createdCount} créé{csvSummary.createdCount > 1 ? "s" : ""}
              {csvSummary.updatedCount > 0 &&
                `, ${csvSummary.updatedCount} mis à jour`}
              {csvSummary.failures.length > 0 &&
                ` — ${csvSummary.failures.length} échec${csvSummary.failures.length > 1 ? "s" : ""}`}
            </p>
            {csvSummary.failures.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {csvSummary.failures.map((issue, i) => (
                  <li key={i} className="text-xs text-tn-red">
                    Ligne {issue.row}
                    {issue.reference ? ` (${issue.reference})` : ""} : {issue.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      )}

      {/* FILTERS */}
      {!loading && !loadError && products.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border-2 border-tn-black bg-tn-white p-4 shadow-[3px_3px_0_0_var(--tn-black)]">
          <label className={`${labelClass} min-w-[220px]`}>
            Rechercher (référence, nom ou marque)
            <input
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Ex. : FDB1001, plaquettes ou Textar"
              className={inputClass}
            />
          </label>
          <label className={`${labelClass} min-w-[200px]`}>
            Filtrer par fournisseur
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">Tous les fournisseurs</option>
              <option value="none">Sans fournisseur</option>
              <SupplierOptions suppliers={suppliers} />
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70">
            <input
              type="checkbox"
              checked={onlyMissingPhoto}
              onChange={(e) => setOnlyMissingPhoto(e.target.checked)}
              className="size-4 accent-tn-red"
            />
            Sans photo uniquement
          </label>
        </div>
      )}

      {/* PRODUCT LIST */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white p-4">
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
            onClick={loadAll}
            className="mt-4 rounded-lg bg-tn-red px-5 py-2 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
          >
            Réessayer
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
            Aucun produit pour le moment.
          </p>
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
            Aucun produit ne correspond à ce filtre.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleProducts.map((product) => {
            const isExpanded = expandedId === product.id;
            const supplierName = suppliers.find((s) => s.id === product.supplierId)?.name;
            return (
              <div
                key={product.id}
                className="overflow-hidden rounded-xl border-2 border-tn-black bg-tn-white shadow-[3px_3px_0_0_var(--tn-black)]"
              >
                <button
                  type="button"
                  onClick={() => handleExpand(product)}
                  aria-expanded={isExpanded}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-tn-offwhite"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                      <PartPlaceholder
                        categoryName={product.category?.name}
                        photoUrl={product.photoUrl}
                        alt={product.name}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-black uppercase tracking-wide text-tn-black">
                        {product.name}
                      </span>
                      <span className="text-xs text-tn-black-soft/60">
                        Réf. {product.reference} — {product.category?.name ?? "Autre"}
                        {supplierName ? ` — ${supplierName}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StockBadge product={product} />
                    <span className="text-sm font-black text-tn-red">{formatPrice(product.price)}</span>
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

                {isExpanded && draft && (
                  <div className="border-t-2 border-tn-black/10 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className={labelClass}>
                        Référence
                        <input
                          value={draft.reference}
                          onChange={(e) => setDraft((d) => (d ? { ...d, reference: e.target.value } : d))}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Nom
                        <input
                          value={draft.name}
                          onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Catégorie
                        <select
                          value={draft.categoryId}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, categoryId: e.target.value } : d))
                          }
                          className={inputClass}
                        >
                          <option value="">Aucune</option>
                          <CategoryOptions categories={categories} />
                        </select>
                      </label>
                      <label className={labelClass}>
                        Fournisseur
                        <select
                          value={draft.supplierId}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, supplierId: e.target.value } : d))
                          }
                          className={inputClass}
                        >
                          <option value="">Aucun</option>
                          <SupplierOptions suppliers={suppliers} />
                        </select>
                      </label>
                      <label className={labelClass}>
                        Marque (fabricant)
                        <BrandField
                          value={draft.brand}
                          onChange={(next) => setDraft((d) => (d ? { ...d, brand: next } : d))}
                          brands={existingBrands}
                        />
                      </label>
                      <label className={labelClass}>
                        Référence origine (OEM) — pièces auto, optionnel
                        <input
                          value={draft.oemReference}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, oemReference: e.target.value } : d))
                          }
                          placeholder="Ex. : T153401310BB"
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Prix (DT)
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={draft.price}
                          onChange={(e) => setDraft((d) => (d ? { ...d, price: e.target.value } : d))}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Stock
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.stock}
                          onChange={(e) => setDraft((d) => (d ? { ...d, stock: e.target.value } : d))}
                          className={inputClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Photo principale (URL)
                        <input
                          value={draft.photoUrl}
                          onChange={(e) => setDraft((d) => (d ? { ...d, photoUrl: e.target.value } : d))}
                          className={inputClass}
                        />
                      </label>
                      <div className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
                        Photos secondaires (galerie fiche produit)
                        <PhotoUrlsField
                          value={draft.photoUrls}
                          onChange={(next) => setDraft((d) => (d ? { ...d, photoUrls: next } : d))}
                        />
                      </div>
                      <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
                        Description
                        <textarea
                          rows={3}
                          value={draft.description}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, description: e.target.value } : d))
                          }
                          className={`${inputClass} resize-none`}
                        />
                      </label>
                      <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
                        Accroche carte produit (affichée sur la carte catalogue/accueil, à la place de la référence)
                        <input
                          value={draft.cardSubtitle}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, cardSubtitle: e.target.value } : d))
                          }
                          placeholder="Ex. : Compatible toutes marques — livraison 24h"
                          className={inputClass}
                        />
                      </label>
                    </div>

                    {rowError && (
                      <p className="mt-3 rounded-lg border-2 border-tn-red bg-tn-red/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
                        {rowError}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSave(product)}
                        disabled={savingId === product.id}
                        className="flex items-center gap-2 rounded-lg bg-tn-red px-6 py-2.5 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingId === product.id && <Spinner className="size-3.5" />}
                        {savingId === product.id ? "Enregistrement…" : "Enregistrer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm(product)}
                        className="rounded-lg border-2 border-tn-red px-6 py-2.5 text-xs font-black uppercase tracking-wide text-tn-red transition-all duration-200 hover:scale-105 hover:bg-tn-red hover:text-tn-white active:scale-95"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer la suppression"
          className="fixed inset-0 z-50 flex items-center justify-center bg-tn-black/60 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border-2 border-tn-black bg-tn-white p-6 shadow-[6px_6px_0_0_var(--tn-red)]"
          >
            <h2 className="text-lg font-black uppercase tracking-wide text-tn-black">
              Supprimer &laquo;&nbsp;{deleteTarget.name}&nbsp;&raquo; ?
            </h2>

            {deleteOrderCount === null ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-tn-black-soft">
                <Spinner className="size-3.5" />
                Vérification des commandes liées…
              </p>
            ) : deleteOrderCount > 0 ? (
              <p className="mt-3 text-sm text-tn-black-soft">
                Ce produit apparaît dans <strong>{deleteOrderCount}</strong> ligne
                {deleteOrderCount > 1 ? "s" : ""} de commande existante
                {deleteOrderCount > 1 ? "s" : ""}. Les commandes passées ne seront{" "}
                <strong>pas</strong> affectées — elles conservent le nom, la référence et le prix
                du produit tels qu&apos;ils étaient au moment de la commande. Le produit ne sera
                simplement plus disponible dans le catalogue.
              </p>
            ) : (
              <p className="mt-3 text-sm text-tn-black-soft">
                Ce produit n&apos;apparaît dans aucune commande. Cette action est irréversible.
              </p>
            )}

            {deleteError && (
              <p className="mt-3 rounded-lg border-2 border-tn-red bg-tn-red/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleting}
                className="rounded-lg border-2 border-tn-black px-5 py-2.5 text-xs font-black uppercase tracking-wide text-tn-black transition-all duration-200 hover:scale-105 hover:bg-tn-offwhite active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || deleteOrderCount === null}
                className="flex items-center gap-2 rounded-lg bg-tn-red px-5 py-2.5 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting && <Spinner className="size-3.5" />}
                {deleting ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
