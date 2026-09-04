"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { CategoryIcon, iconForCategoryName } from "@/components/CategoryIcon";
import {
  fetchCategories,
  fetchDepartments,
  fetchProducts,
  type Category,
  type Department,
  type Product,
} from "@/lib/supabase";
import { dedupeCategories, normalizeText } from "@/lib/categories";
import {
  productMatchesVehicle,
  distinctMakes,
  distinctModels,
  yearRangeFor,
  type VehicleFilter,
} from "@/lib/vehicle-filter";

const ALL_CATEGORIES = "Toutes";
const ALL_BRANDS = "Toutes";
const DEFAULT_DEPARTMENT_SLUG = "pieces-auto";

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

function CatalogueContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeDepartmentSlug, setActiveDepartmentSlug] = useState<string>(DEFAULT_DEPARTMENT_SLUG);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  // Marque du fabricant (ex. Ferodo, Harden) — distinct de la compatibilité
  // véhicule ci-dessous (qui porte sur la marque du VÉHICULE, pas du produit).
  const [activeBrand, setActiveBrand] = useState<string>(ALL_BRANDS);
  // Recherche "par véhicule" (marque/modèle/année du véhicule du client,
  // distincte de activeBrand qui est la marque du FABRICANT de la pièce) —
  // "" = pas de filtre à ce niveau, cf. lib/vehicle-filter.ts.
  const [vehicleMake, setVehicleMake] = useState<string>("");
  const [vehicleModel, setVehicleModel] = useState<string>("");
  const [vehicleYear, setVehicleYear] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [isPending, setIsPending] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  // Sync ?rayon=, ?categorie= and ?q= from the URL. useSearchParams (unlike
  // reading window.location once on mount) returns a new object identity on
  // every navigation — including a header search or a home-page category
  // link fired while already on this page — so those actually update the
  // page instead of silently doing nothing.
  const searchParams = useSearchParams();
  useEffect(() => {
    setSearchTerm(searchParams.get("q") ?? "");
    const rayon = searchParams.get("rayon");
    if (rayon) setActiveDepartmentSlug(rayon);
    const categorie = searchParams.get("categorie");
    setActiveCategory(categorie ?? ALL_CATEGORIES);
  }, [searchParams]);

  // Client-side only: this fetch runs in the visitor's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProducts(), fetchCategories(), fetchDepartments()])
      .then(([p, c, d]) => {
        if (cancelled) return;
        setProducts(p);
        setCategories(c);
        setDepartments(d);
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

  const handleDepartmentChange = (slug: string) => {
    setActiveDepartmentSlug(slug);
    setActiveCategory(ALL_CATEGORIES);
    setActiveBrand(ALL_BRANDS);
    setVehicleMake("");
    setVehicleModel("");
    setVehicleYear("");
    setIsPending(true);
  };

  const handleCategoryChange = (id: string) => {
    setActiveCategory(id);
    setIsPending(true);
  };

  const handleBrandChange = (value: string) => {
    setActiveBrand(value || ALL_BRANDS);
    setIsPending(true);
  };

  const handleVehicleMakeChange = (value: string) => {
    setVehicleMake(value);
    setVehicleModel("");
    setVehicleYear("");
    setIsPending(true);
  };

  const handleVehicleModelChange = (value: string) => {
    setVehicleModel(value);
    setVehicleYear("");
    setIsPending(true);
  };

  const handleVehicleYearChange = (value: string) => {
    setVehicleYear(value);
    setIsPending(true);
  };

  const handleSortChange = (value: SortKey) => {
    setSortKey(value);
    setIsPending(true);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setIsPending(true);
  };

  const activeDepartment = departments.find((d) => d.slug === activeDepartmentSlug) ?? null;
  const isQuincaillerie = activeDepartmentSlug === "quincaillerie";

  // Un produit hors rayon actif ne doit jamais apparaître, même si un filtre
  // catégorie/recherche matcherait autrement — c'est ce qui garantit une
  // séparation nette entre rayons plutôt qu'un simple tri visuel.
  const departmentProducts = useMemo(
    () => products.filter((p) => p.category?.department?.slug === activeDepartmentSlug),
    [products, activeDepartmentSlug]
  );

  // Marques produit (fabricant) disponibles dans le rayon actif.
  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    departmentProducts.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [departmentProducts]);

  // Véhicules (marque/modèle/année) couverts par la compatibilité déjà
  // connue des produits du rayon actif — alimente le bloc "Trouver par
  // véhicule" ci-dessous. Vide en Quincaillerie (aucune ligne de
  // compatibilité là-bas), ce qui masque naturellement le bloc.
  const vehicleMakes = useMemo(() => distinctMakes(departmentProducts), [departmentProducts]);
  const vehicleModels = useMemo(
    () => (vehicleMake ? distinctModels(departmentProducts, vehicleMake) : []),
    [departmentProducts, vehicleMake]
  );
  const vehicleYearRange = useMemo(
    () => (vehicleMake ? yearRangeFor(departmentProducts, vehicleMake, vehicleModel || null) : null),
    [departmentProducts, vehicleMake, vehicleModel]
  );
  const vehicleYearOptions = useMemo(() => {
    if (!vehicleYearRange) return [];
    const { min, max } = vehicleYearRange;
    const years: number[] = [];
    for (let y = max; y >= min; y--) years.push(y);
    return years;
  }, [vehicleYearRange]);

  // Duplicate category rows (e.g. two "Éclairage") collapse into one chip —
  // see lib/categories.ts. Scoped to the active department only.
  const departmentCategories = useMemo(
    () => categories.filter((c) => c.department?.slug === activeDepartmentSlug),
    [categories, activeDepartmentSlug]
  );
  const dedupedCategories = useMemo(
    () => dedupeCategories(departmentCategories),
    [departmentCategories]
  );

  const activeGroup = dedupedCategories.find((g) => g.id === activeCategory) ?? null;
  const activeCategoryIds = activeGroup?.ids ?? [activeCategory];
  const activeCategoryLabel = activeCategory === ALL_CATEGORIES ? null : activeGroup?.name ?? null;

  const chips: { id: string; label: string; icon?: ReturnType<typeof iconForCategoryName> }[] = [
    { id: ALL_CATEGORIES, label: "Toutes" },
    ...dedupedCategories.map((g) => ({ id: g.id, label: g.name, icon: iconForCategoryName(g.name) })),
  ];

  const filteredProducts = useMemo(() => {
    const query = normalizeText(searchTerm.trim());

    // Une recherche par référence (ou nom) doit retrouver le produit même
    // s'il n'appartient pas au rayon ou à la catégorie actuellement
    // sélectionnés : on ignore donc les filtres rayon et catégorie dès
    // qu'une recherche est en cours (ex. une référence quincaillerie doit
    // remonter même si l'onglet actif est "Pièces auto"). Sans recherche,
    // la séparation stricte entre rayons reste appliquée comme avant.
    const searchScope = query ? products : departmentProducts;

    const byCategory =
      query || activeCategory === ALL_CATEGORIES
        ? searchScope
        : searchScope.filter((p) => p.category?.id && activeCategoryIds.includes(p.category.id));

    const byBrand =
      activeBrand === ALL_BRANDS ? byCategory : byCategory.filter((p) => p.brand === activeBrand);

    const vehicleFilter: VehicleFilter = {
      make: vehicleMake || null,
      model: vehicleModel || null,
      year: vehicleYear ? Number(vehicleYear) : null,
    };
    const byVehicle = vehicleMake
      ? byBrand.filter((p) => productMatchesVehicle(p, vehicleFilter))
      : byBrand;

    const base = query
      ? byVehicle.filter((p) =>
          [p.name, p.reference, p.compatibility, p.description]
            .filter(Boolean)
            .some((field) => normalizeText(field as string).includes(query))
        )
      : byVehicle;

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
  }, [
    products,
    departmentProducts,
    activeCategory,
    activeCategoryIds,
    activeBrand,
    vehicleMake,
    vehicleModel,
    vehicleYear,
    sortKey,
    searchTerm,
  ]);

  return (
    <>
      <Header />
      <main className="flex-1 bg-tn-offwhite">
        {/* PAGE HEADER */}
        <section className="relative overflow-hidden bg-tn-black pb-20 pt-12 sm:pb-24 sm:pt-16">
          <div className="tn-diagonal-bottom absolute inset-x-0 bottom-0 h-10 bg-tn-offwhite sm:h-14" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <span className="tn-ribbon inline-block bg-tn-red px-4 py-1 text-xs font-black uppercase tracking-widest text-tn-white">
              {isQuincaillerie ? "Quincaillerie" : "Catalogue complet"}
            </span>
            <h1 className="mt-5 max-w-2xl text-3xl font-black uppercase leading-[1.05] tracking-wide text-tn-white sm:text-4xl lg:text-5xl">
              {isQuincaillerie ? (
                <>
                  Toute la <span className="text-tn-amber">quincaillerie</span>, filtrée à votre{" "}
                  <span className="text-tn-red">façon</span>
                </>
              ) : (
                <>
                  Toutes les <span className="text-tn-amber">pièces</span>, filtrées à votre{" "}
                  <span className="text-tn-red">façon</span>
                </>
              )}
            </h1>
            <p className="mt-4 max-w-xl text-sm text-tn-white/70 sm:text-base">
              {isQuincaillerie
                ? "Outillage, fixations et accessoires — filtrez par catégorie et triez pour trouver ce qu'il vous faut."
                : "Freinage, moteur, filtration, suspension, éclairage, carrosserie — filtrez par catégorie et triez pour trouver la pièce qu'il vous faut."}
            </p>

            {/* RAYON SWITCH — la séparation nette entre les deux univers du site */}
            {departments.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {departments.map((d) => {
                  const isActive = d.slug === activeDepartmentSlug;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleDepartmentChange(d.slug)}
                      aria-pressed={isActive}
                      className={`rounded-full border-2 px-5 py-2 text-xs font-black uppercase tracking-wide transition-all duration-200 ${
                        isActive
                          ? "border-tn-amber bg-tn-amber text-tn-black"
                          : "border-tn-white/40 bg-transparent text-tn-white hover:border-tn-amber hover:text-tn-amber"
                      }`}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {/* FILTER BAR */}
          <div className="mb-8 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-6">
            <div className="mb-5 flex items-center gap-2 rounded-lg border-2 border-tn-black bg-tn-offwhite px-3 py-2.5 transition-all duration-200 focus-within:shadow-[3px_3px_0_0_var(--tn-red)]">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4 flex-none text-tn-black-soft/50"
                aria-hidden="true"
              >
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
                <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <label htmlFor="catalogue-search" className="sr-only">
                Rechercher un produit par nom ou référence
              </label>
              <input
                id="catalogue-search"
                type="search"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={
                  isQuincaillerie
                    ? "Rechercher : visseuse, boulon, référence..."
                    : "Rechercher : disque de frein, pompe à eau, référence..."
                }
                className="w-full bg-transparent text-sm font-bold text-tn-black placeholder:text-tn-black-soft/40 focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  aria-label="Effacer la recherche"
                  className="flex-none rounded-full px-2 py-1 text-xs font-black uppercase text-tn-black-soft/50 transition-colors duration-200 hover:text-tn-red"
                >
                  Effacer
                </button>
              )}
            </div>

            {/* TROUVER PAR VÉHICULE — marque/modèle/année du véhicule du
                client, appuyé sur product_compatibility ; distinct du filtre
                "Marque" plus bas qui porte sur le fabricant de la pièce. Ne
                s'affiche que s'il y a des véhicules à proposer (jamais en
                Quincaillerie). */}
            {!isQuincaillerie && vehicleMakes.length > 0 && (
              <div className="mb-5 rounded-xl border-2 border-tn-black bg-amber-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/70">
                    Trouver les pièces compatibles avec votre véhicule
                  </h2>
                  {(vehicleMake || vehicleModel || vehicleYear) && (
                    <button
                      type="button"
                      onClick={() => handleVehicleMakeChange("")}
                      className="text-[11px] font-black uppercase tracking-wide text-tn-black-soft/50 underline decoration-dotted underline-offset-2 transition-colors duration-200 hover:text-tn-red"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <select
                    aria-label="Marque du véhicule"
                    value={vehicleMake}
                    onChange={(e) => handleVehicleMakeChange(e.target.value)}
                    className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                  >
                    <option value="">Marque du véhicule</option>
                    {vehicleMakes.map((make) => (
                      <option key={make} value={make}>
                        {make}
                      </option>
                    ))}
                  </select>

                  {vehicleMake && vehicleModels.length > 0 && (
                    <select
                      aria-label="Modèle du véhicule"
                      value={vehicleModel}
                      onChange={(e) => handleVehicleModelChange(e.target.value)}
                      className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                    >
                      <option value="">Tous les modèles</option>
                      {vehicleModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  )}

                  {vehicleMake && vehicleYearOptions.length > 0 && (
                    <select
                      aria-label="Année du véhicule"
                      value={vehicleYear}
                      onChange={(e) => handleVehicleYearChange(e.target.value)}
                      className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                    >
                      <option value="">Toutes les années</option>
                      {vehicleYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60">
                Filtrer par catégorie
              </h2>

              <div className="flex flex-wrap items-center gap-3">
                {availableBrands.length > 0 && (
                  <>
                    <label
                      htmlFor="brand"
                      className="text-xs font-black uppercase tracking-widest text-tn-black-soft/60"
                    >
                      Marque
                    </label>
                    <select
                      id="brand"
                      value={activeBrand}
                      onChange={(e) => handleBrandChange(e.target.value)}
                      className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                    >
                      <option value={ALL_BRANDS}>Toutes les marques</option>
                      {availableBrands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </select>
                  </>
                )}
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
              {filteredProducts.length > 1 ? "produits trouvés" : "produit trouvé"}
              {activeCategoryLabel && !searchTerm.trim() && (
                <>
                  {" "}
                  en <span className="text-tn-red">{activeCategoryLabel}</span>
                </>
              )}
              {activeBrand !== ALL_BRANDS && (
                <>
                  {" "}
                  · marque <span className="text-tn-red">{activeBrand}</span>
                </>
              )}
              {vehicleMake && (
                <>
                  {" "}
                  · véhicule{" "}
                  <span className="text-tn-red">
                    {[vehicleMake, vehicleModel, vehicleYear].filter(Boolean).join(" ")}
                  </span>
                </>
              )}
              {activeDepartment && !searchTerm.trim() && (
                <>
                  {" "}
                  · rayon <span className="text-tn-red">{activeDepartment.name}</span>
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
                    Aucun produit ne correspond à ce filtre.
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

export default function CataloguePage() {
  return (
    <Suspense fallback={<Header />}>
      <CatalogueContent />
    </Suspense>
  );
}
