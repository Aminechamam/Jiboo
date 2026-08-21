"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { CategoryIcon, iconForCategoryName } from "@/components/CategoryIcon";
import { fetchCategories, fetchProducts, type Category, type Product } from "@/lib/supabase";

const benefits = [
  { title: "Livraison rapide", detail: "24 à 48h partout en Tunisie" },
  { title: "Pièces certifiées", detail: "Contrôle qualité systématique" },
  { title: "Garantie", detail: "Jusqu'à 12 mois selon la pièce" },
  { title: "Paiement à la livraison", detail: "Payez à réception, en toute confiance" },
];

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Client-side only: this fetch runs in the visitor's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCategories(), fetchProducts()])
      .then(([c, p]) => {
        if (cancelled) return;
        setCategories(c);
        setProducts(p);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Impossible de charger les données. Veuillez réessayer plus tard.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const popularProducts = products.slice(0, 6);

  return (
    <>
      <Header />
      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden bg-tn-black pb-24 pt-16 sm:pb-32 sm:pt-24">
          <div className="tn-diagonal-bottom absolute inset-x-0 bottom-0 h-24 bg-tn-red" />
          <div
            className="absolute -right-24 top-0 hidden h-full w-1/2 bg-tn-red/90 md:block"
            style={{ clipPath: "polygon(30% 0, 100% 0, 100% 100%, 0 100%)" }}
          />
          <div
            className="absolute -right-24 top-0 hidden h-full w-1/3 bg-tn-amber/90 md:block"
            style={{ clipPath: "polygon(55% 0, 100% 0, 100% 100%, 25% 100%)" }}
          />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <span className="tn-ribbon inline-block bg-tn-amber px-4 py-1 text-xs font-black uppercase tracking-widest text-tn-black">
                Nouveau catalogue 2026
              </span>
              <h1 className="mt-6 text-4xl font-black uppercase leading-[1.05] tracking-wide text-tn-white sm:text-5xl lg:text-6xl">
                Les pièces qui <span className="text-tn-red">boostent</span>{" "}
                <span className="text-tn-amber">votre moteur</span>
              </h1>
              <p className="mt-6 max-w-lg text-base text-tn-white/70 sm:text-lg">
                Freinage, moteur, suspension, carrosserie&nbsp;: des pièces
                détachées certifiées pour toutes les marques, livrées vite,
                partout en Tunisie.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/catalogue"
                  className="rounded-lg bg-tn-red px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
                >
                  Voir le catalogue
                </Link>
                <a
                  href="#populaires"
                  className="rounded-lg border-2 border-tn-white px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:border-tn-amber hover:text-tn-amber active:scale-95"
                >
                  Produits populaires
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST / BENEFITS STRIP */}
        <section className="bg-tn-amber py-8">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
            {benefits.map((b) => (
              <div key={b.title} className="flex flex-col items-start gap-1">
                <span className="text-sm font-black uppercase tracking-wide text-tn-black">
                  {b.title}
                </span>
                <span className="text-xs font-medium text-tn-black/70">{b.detail}</span>
              </div>
            ))}
          </div>
        </section>

        {/* POPULAR PRODUCTS */}
        <section id="populaires" className="relative overflow-hidden bg-tn-offwhite py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 flex items-end justify-between">
              <h2 className="text-2xl font-black uppercase tracking-wide text-tn-black sm:text-3xl">
                Produits populaires
              </h2>
              <Link
                href="/catalogue"
                className="text-sm font-black uppercase tracking-wide text-tn-red transition-colors duration-200 hover:text-tn-black"
              >
                Tout voir →
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-80 animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white"
                  />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-xl border-2 border-dashed border-tn-red/40 bg-tn-white p-12 text-center">
                <p className="text-sm font-bold uppercase tracking-wide text-tn-red">
                  {loadError}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
                {popularProducts.map((p, i) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    className="motion-safe:opacity-0 motion-safe:[animation:tn-rise-in_500ms_cubic-bezier(0.22,1,0.36,1)_both]"
                    style={{ animationDelay: `${i * 40}ms` }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CATEGORIES */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 flex items-end justify-between">
            <h2 className="text-2xl font-black uppercase tracking-wide text-tn-black sm:text-3xl">
              Catégories
            </h2>
            <div className="tn-stripes h-2 w-24 rounded-full" />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl border-2 border-tn-black/10 bg-tn-white"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {categories.map((cat, i) => (
                <Link
                  key={cat.id}
                  href="/catalogue"
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="group flex flex-col items-center gap-3 rounded-xl border-2 border-tn-black bg-tn-white p-5 text-center shadow-[3px_3px_0_0_var(--tn-black)] transition-all duration-200 hover:-translate-y-1 hover:scale-105 hover:bg-tn-black hover:shadow-[6px_6px_0_0_var(--tn-red)] motion-safe:opacity-0 motion-safe:[animation:tn-rise-in_500ms_cubic-bezier(0.22,1,0.36,1)_both]"
                >
                  <span className="text-tn-red transition-transform duration-200 group-hover:-translate-y-1 group-hover:text-tn-amber">
                    <CategoryIcon icon={iconForCategoryName(cat.name)} className="h-9 w-9" />
                  </span>
                  <span className="text-xs font-extrabold uppercase tracking-wide text-tn-black group-hover:text-tn-white">
                    {cat.name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* CTA BANNER */}
        <section className="tn-diagonal-both relative bg-tn-red py-14">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-black uppercase tracking-wide text-tn-white sm:text-3xl">
              Besoin d&apos;une pièce précise&nbsp;?
            </h2>
            <p className="max-w-xl text-sm text-tn-white/80 sm:text-base">
              Parcourez le catalogue complet et filtrez par catégorie pour
              trouver la pièce compatible avec votre véhicule.
            </p>
            <Link
              href="/catalogue"
              className="mt-2 rounded-lg bg-tn-amber px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-black transition-all duration-200 hover:scale-105 hover:bg-tn-white active:scale-95"
            >
              Explorer le catalogue
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
