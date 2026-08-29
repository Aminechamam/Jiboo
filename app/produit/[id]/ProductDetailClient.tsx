"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PartPlaceholder } from "@/components/PartPlaceholder";
import { useCart } from "@/components/CartContext";
import {
  fetchProductById,
  formatPrice,
  type Product,
  type ProductCompatibility,
} from "@/lib/supabase";

function formatYearRange(yearFrom: number | null, yearTo: number | null): string | null {
  if (yearFrom && yearTo) return `${yearFrom}–${yearTo}`;
  if (yearFrom) return `À partir de ${yearFrom}`;
  if (yearTo) return `Jusqu'à ${yearTo}`;
  return null;
}

function CompatibilityRow({ item }: { item: ProductCompatibility }) {
  const yearRange = formatYearRange(item.year_from, item.year_to);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-tn-black/10 py-2.5 text-sm last:border-b-0">
      <span className="font-bold uppercase text-tn-black">
        {item.make} {item.model}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-tn-black-soft/70">
        {yearRange && (
          <span className="rounded-full bg-tn-offwhite px-2.5 py-1 font-bold">{yearRange}</span>
        )}
        {item.engine && (
          <span className="rounded-full bg-tn-offwhite px-2.5 py-1 font-bold">{item.engine}</span>
        )}
      </span>
    </li>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="grid animate-pulse gap-8 lg:grid-cols-2">
      <div className="aspect-square w-full rounded-2xl bg-tn-black/10" />
      <div className="flex flex-col gap-4">
        <div className="h-4 w-1/4 rounded bg-tn-black/10" />
        <div className="h-8 w-3/4 rounded bg-tn-black/10" />
        <div className="h-4 w-1/3 rounded bg-tn-black/10" />
        <div className="h-24 w-full rounded bg-tn-black/10" />
        <div className="h-10 w-1/2 rounded bg-tn-black/10" />
      </div>
    </div>
  );
}

export default function ProductDetailClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { addItem, showToast } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  // Client-side only: this fetch runs in the visitor's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  // The state resets are deferred into a timeout (same pattern as
  // CartContext's hydration effect) so the effect body itself never calls
  // setState synchronously.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      setNotFound(false);
      fetchProductById(id)
        .then((data) => {
          if (cancelled) return;
          if (!data) {
            setNotFound(true);
            return;
          }
          setProduct(data);
        })
        .catch(() => {
          if (!cancelled) {
            setLoadError("Impossible de charger ce produit. Veuillez réessayer plus tard.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  const outOfStock = product ? product.stock <= 0 : false;
  const lowStock = product ? !outOfStock && product.stock <= product.lowStockThreshold : false;

  const handleAdd = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!product || outOfStock) return;
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      reference: product.reference,
      photoUrl: product.photoUrl,
    });
    setPulseKey((k) => k + 1);
    showToast(`${product.name} ajouté au panier`);
  };

  return (
    <>
      <Header />
      <main className="flex-1 bg-tn-offwhite">
        <section className="relative overflow-hidden bg-tn-black pb-16 pt-10 sm:pb-20 sm:pt-14">
          <div className="tn-diagonal-bottom absolute inset-x-0 bottom-0 h-10 bg-tn-offwhite sm:h-14" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Link
              href="/catalogue"
              className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-tn-white/70 transition-colors duration-200 hover:text-tn-amber"
            >
              ← Retour au catalogue
            </Link>
            <span className="tn-ribbon mt-5 inline-block bg-tn-red px-4 py-1 text-xs font-black uppercase tracking-widest text-tn-white">
              Fiche produit
            </span>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {loading ? (
            <ProductDetailSkeleton />
          ) : notFound ? (
            <div className="rounded-2xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
                Produit introuvable.
              </p>
              <Link
                href="/catalogue"
                className="mt-6 inline-block rounded-lg bg-tn-red px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
              >
                Voir le catalogue
              </Link>
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border-2 border-dashed border-tn-red/40 bg-tn-white p-12 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-tn-red">{loadError}</p>
              <Link
                href="/catalogue"
                className="mt-6 inline-block rounded-lg bg-tn-red px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
              >
                Voir le catalogue
              </Link>
            </div>
          ) : product ? (
            <div className="grid gap-8 lg:grid-cols-2">
              {/* PHOTO */}
              <div className="relative">
                {lowStock && (
                  <span className="tn-ribbon absolute left-3 top-3 z-10 bg-tn-amber px-3 py-1 text-xs font-black uppercase tracking-wide text-tn-black">
                    Stock limité
                  </span>
                )}
                <div className="rounded-2xl border-2 border-tn-black bg-tn-white p-4 shadow-[6px_6px_0_0_var(--tn-black)]">
                  <PartPlaceholder
                    categoryName={product.category?.name}
                    photoUrl={product.photoUrl}
                    alt={product.name}
                  />
                </div>
              </div>

              {/* DETAILS */}
              <div className="flex flex-col gap-4">
                <span className="w-fit rounded-full bg-tn-black px-3 py-1 text-[11px] font-black uppercase tracking-wide text-tn-amber">
                  {product.category?.name ?? "Autre"}
                </span>
                <h1 className="text-2xl font-black uppercase leading-tight tracking-wide text-tn-black sm:text-3xl">
                  {product.name}
                </h1>
                <p className="text-xs font-bold uppercase tracking-wide text-tn-black-soft/50">
                  Réf. {product.reference}
                </p>
                <div className="flex items-center gap-3">
                  {outOfStock ? (
                    <span className="rounded-full bg-tn-black-soft/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-tn-black-soft/50">
                      Rupture de stock
                    </span>
                  ) : lowStock ? (
                    <span className="rounded-full bg-tn-amber px-3 py-1 text-xs font-black uppercase tracking-wide text-tn-black">
                      Stock limité — {product.stock} restant{product.stock > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#1a9d5c]/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-[#1a9d5c]">
                      En stock
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)]">
                  <span className="text-3xl font-black text-tn-red">{formatPrice(product.price)}</span>
                  {outOfStock ? (
                    <span className="cursor-not-allowed rounded-lg bg-tn-black-soft/20 px-5 py-3 text-xs font-black uppercase tracking-wide text-tn-black-soft/50">
                      Rupture de stock
                    </span>
                  ) : (
                    <a
                      key={pulseKey}
                      href="#"
                      onClick={handleAdd}
                      className={`rounded-lg bg-tn-black px-5 py-3 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-red active:scale-95 ${
                        pulseKey > 0
                          ? "motion-safe:[animation:tn-add-bump_320ms_cubic-bezier(0.34,1.56,0.64,1)]"
                          : ""
                      }`}
                    >
                      Ajouter au panier
                    </a>
                  )}
                </div>

                {/* COMPATIBILITY — uniquement pertinent pour le rayon Pièces Auto */}
                {product.category?.department?.slug === "pieces-auto" && (
                  <div className="rounded-2xl border-2 border-tn-black bg-tn-white p-5 shadow-[4px_4px_0_0_var(--tn-black)]">
                    <h2 className="text-xs font-black uppercase tracking-widest text-tn-black-soft/50">
                      Véhicules compatibles
                    </h2>
                    {product.compatibilityList.length === 0 ? (
                      <p className="mt-2 text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
                        Toutes marques
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-col">
                        {product.compatibilityList.map((item, i) => (
                          <CompatibilityRow key={`${item.make}-${item.model}-${i}`} item={item} />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </main>
      <Footer />
    </>
  );
}
