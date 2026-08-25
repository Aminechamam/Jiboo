"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";

function CartButton() {
  const { itemCount, toggleCart } = useCart();
  return (
    <button
      type="button"
      onClick={toggleCart}
      aria-haspopup="dialog"
      className="relative flex-none whitespace-nowrap rounded-lg bg-tn-red px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black sm:px-4 sm:py-2 sm:text-xs"
    >
      <span className="sm:hidden">Panier</span>
      <span className="hidden sm:inline">Mon panier</span>
      {itemCount > 0 && (
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-tn-black bg-tn-amber text-[10px] font-black text-tn-black">
          {itemCount}
        </span>
      )}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 flex-none text-tn-white/50" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Header() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = searchTerm.trim();
    router.push(term ? `/catalogue?q=${encodeURIComponent(term)}` : "/catalogue");
  };

  return (
    <header className="sticky top-0 z-40 border-b-4 border-tn-amber bg-tn-black">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        {/*
          Logo and nav (Accueil / Catalogue / Panier) always share one row,
          on every screen size — kept deliberately compact and non-wrapping
          (small text, tight gaps, whitespace-nowrap) on mobile so it fits
          on narrow Android phones exactly as reliably as on iPhone, instead
          of depending on font-metric differences between browsers to decide
          what fits. The search bar gets its own full-width row below on
          mobile (where there's no room left on the top row), and folds
          inline into the top row from `sm` up, where there's space for it.
        */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <Link href="/" className="flex flex-none items-center gap-1.5 sm:gap-2">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-tn-red text-sm font-black text-tn-white sm:h-9 sm:w-9 sm:text-base">
              JB
            </span>
            <span className="whitespace-nowrap text-base font-black uppercase tracking-wide text-tn-white sm:text-lg">
              Jib<span className="text-tn-amber">oo</span>
            </span>
          </Link>

          {/* sm and up: search fills the middle of the row */}
          <form onSubmit={handleSearch} role="search" className="hidden w-full max-w-xs flex-1 sm:block">
            <label htmlFor="site-search" className="sr-only">
              Rechercher une pièce
            </label>
            <div className="flex w-full items-center gap-2 rounded-lg border-2 border-tn-white/20 bg-tn-black-soft px-3 py-1.5 transition-colors duration-200 focus-within:border-tn-amber">
              <SearchIcon />
              <input
                id="site-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Disque de frein, pompe à eau..."
                className="w-full bg-transparent text-sm font-bold text-tn-white placeholder:text-tn-white/40 focus:outline-none"
              />
            </div>
          </form>

          <nav className="flex flex-none items-center gap-2.5 text-[10px] font-bold uppercase tracking-wide text-tn-white sm:gap-6 sm:text-sm">
            <Link href="/" className="whitespace-nowrap transition-colors duration-200 hover:text-tn-amber">
              Accueil
            </Link>
            <Link
              href="/catalogue"
              className="whitespace-nowrap transition-colors duration-200 hover:text-tn-amber"
            >
              Catalogue
            </Link>
            <CartButton />
          </nav>
        </div>

        {/* Below sm: search bar gets its own full-width row */}
        <form onSubmit={handleSearch} role="search" className="mt-3 sm:hidden">
          <label htmlFor="site-search-mobile" className="sr-only">
            Rechercher une pièce
          </label>
          <div className="flex w-full items-center gap-2 rounded-lg border-2 border-tn-white/20 bg-tn-black-soft px-3 py-1.5 transition-colors duration-200 focus-within:border-tn-amber">
            <SearchIcon />
            <input
              id="site-search-mobile"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Disque de frein, pompe à eau..."
              className="w-full bg-transparent text-xs font-bold text-tn-white placeholder:text-tn-white/40 focus:outline-none"
            />
          </div>
        </form>
      </div>

      <CartDrawer />
    </header>
  );
}
