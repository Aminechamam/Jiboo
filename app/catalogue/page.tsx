"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { CategoryIcon, iconForCategoryName } from "@/components/CategoryIcon";
import { fetchCategories, fetchProducts, type Category, type Product } from "@/lib/supabase";

const ALL_CATEGORIES = "Toutes";

type SortKey = "default" | "price-asc" | "price-desc" | "name-asc";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "default", label: "Pertinence" },
  { value: "price-asc", label: "Prix croissant" },
  { value: "price-desc", label: "Prix décroissant" },
  { value: "name-asc", label: "Nom A → Z" },
];

// Simulated "filter pending" delay before the grid re-enters — there is no
// real network call for filtering (all products are already loaded), this
// only exists to give the re-filter a felt transition instead of an instant
// swap.
const FILTER_TRANSITION_MS = 180;

export default function CataloguePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [isPending, setIsPending] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  // Client-side only: this fetch runs in the visitor's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProducts(), fetchCategories()])
      .then(([p, c]) => {
        if (cancelled) return;
        setProducts(p);
        setCategories(c);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Impossible de charger le catalogue. Veuillez réessayer plus tard.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // isPending flips to true from the chip/select handlers below (an event,
  // not the effect body) so the effect only owns the "settle back down"
  // half of the transition — avoids a setState-in-effect-body lint issue.
  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => {
      setIsPending(false);
      setRenderKey((k) => k + 1);
    }, FILTER_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  const handleCategoryChange = (id: string) => {
    setActiveCategory(id);
    setIsPending(true);
  };

  const handleSortChange = (value: SortKey) => {
    setSortKey(value);
    setIsPending(true);
  };

  const filteredProducts = useMemo(() => {
    const base =
      activeCategory === ALL_CATEGORIES
        ? products
        : products.filter((p) => p.category?.id === activeCategory);

    const sorted = [...base];
    switch (sortKey) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "fr"));
        break;
      default:
        break;
    }
    return sorted;
  }, [products, activeCategory, sortKey]);

  const activeCategoryLabel =
    activeCategory === ALL_CATEGORIES
      ? null
      : categories.find((c) => c.id === activeCategory)?.name ?? null;

  const chips: { id: string; label: string; icon?: ReturnType<typeof iconForCategoryName> }[] = [
    { id: ALL_CATEGORIES, label: "Toutes" },
    ...categories.map((c) => ({ id: c.id, label: c.name, icon: iconForCategoryName(c.name) })),
  ];

  return (
    <>
      <Header />
      <main className="flex-1 bg-tn-offwhite">
        {/* PAGE HEADER */}
        <section className="relative overflow-hidden bg-tn-black pb-20 pt-12 sm:pb-24 sm:pt-16">
          <div className="tn-diagonal-bottom absolute inset-x-0 bottom-0 h-10 bg-tn-offwhite sm:h-14" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <span className="tn-ribbon inline-block bg-tn-red px-4 py-1 text-xs font-black uppercase tracking-widest text-tn-white">
              Catalogue complet
            </span>
            <h1 className="mt-5 max-w-2xl text-3xl font-black uppercase leading-[1.05] tracking-wide text-tn-white sm:text-4xl lg:text-5xl">
              Toutes les <span className="text-tn-amber">pièces</span>,
              filtrées à votre <span className="text-tn-red">façon</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm text-tn-white/70 sm:text-base">
              Freinage, moteur, filtration, suspension, éclairage, carrosserie
              — filtrez par catégorie et triez pour trouver la pièce qu&apos;il
              vous faut.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {/* FILTER BAR */}
          <div className="mb-8 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60">
                Filtrer par catégorie
              </h2>

              <div className="flex items-center gap-3">
                <label
                  htmlFor="sort"
                  className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60"
                >
                  Trier
                </label>
                <select
                  id="sort"
                  value={sortKey}
                  onChange={(e) => handleSortChange(e.target.value as SortKey)}
                  className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {chips.map((chip) => {
                const isActive = chip.id === activeCategory;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => handleCategoryChange(chip.id)}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1.5 rounded-full border-2 border-tn-black px-4 py-2 text-xs font-black uppercase tracking-wide transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:scale-105 active:scale-95 ${
                      isActive
                        ? "-translate-y-0.5 bg-tn-red text-tn-white shadow-[3px_3px_0_0_var(--tn-black)]"
                        : "bg-tn-white text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] hover:shadow-[4px_4px_0_0_var(--tn-red)]"
                    }`}
                  >
                    {chip.icon && <CategoryIcon icon={chip.icon} className="h-4 w-4" />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* LIVE COUNT */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-black uppercase leading-none tracking-wide text-tn-black sm:text-4xl">
              {filteredProducts.length}
            </span>
            <span className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/70">
              {filteredProducts.length > 1 ? "pièces trouvées" : "pièce trouvée"}
              {activeCategoryLabel && (
                <>
                  {" "}
                  en <span className="text-tn-red">{activeCategoryLabel}</span>
                </>
              )}
            </span>
            <div className="tn-stripes h-1.5 flex-1 rounded-full opacity-60" />
          </div>

          {/* GRID */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white p-3"
                >
                  <div className="aspect-square w-full rounded-lg bg-tn-black/10" />
                  <div className="mt-3 h-3 w-2/3 rounded bg-tn-black/10" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-tn-black/10" />
                  <div className="mt-4 h-6 w-1/3 rounded bg-tn-black/10" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-12 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-tn-red">{loadError}</p>
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-2 gap-4 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 ${
                  isPending ? "scale-[0.98] opacity-40" : "scale-100 opacity-100"
                }`}
              >
                {filteredProducts.map((p, i) => (
                  <ProductCard
                    key={`${p.id}-${renderKey}`}
                    product={p}
                    className="motion-safe:opacity-0 motion-safe:[animation:tn-card-in_320ms_cubic-bezier(0.22,1,0.36,1)_both]"
                    style={{ animationDelay: `${Math.min(i, 16) * 40}ms` }}
                  />
                ))}
              </div>

              {filteredProducts.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
                  <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
                    Aucune pièce ne correspond à ce filtre.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
