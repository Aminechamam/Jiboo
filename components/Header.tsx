"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";

export function Header() {
  const { itemCount, toggleCart } = useCart();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = searchTerm.trim();
    router.push(term ? `/catalogue?q=${encodeURIComponent(term)}` : "/catalogue");
  };

  return (
    <header className="sticky top-0 z-40 border-b-4 border-tn-amber bg-tn-black">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:flex-nowrap sm:gap-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tn-red font-black text-tn-white">
            JB
          </span>
          <span className="text-lg font-black uppercase tracking-wide text-tn-white">
            Jib<span className="text-tn-amber">oo</span>
          </span>
        </Link>

        <form
          onSubmit={handleSearch}
          role="search"
          className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto sm:max-w-xs sm:flex-1"
        >
          <label htmlFor="site-search" className="sr-only">
            Rechercher une pièce
          </label>
          <div className="flex w-full items-center gap-2 rounded-lg border-2 border-tn-white/20 bg-tn-black-soft px-3 py-1.5 transition-colors duration-200 focus-within:border-tn-amber">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4 flex-none text-tn-white/50"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              id="site-search"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Disque de frein, pompe à eau..."
              className="w-full bg-transparent text-xs font-bold text-tn-white placeholder:text-tn-white/40 focus:outline-none sm:text-sm"
            />
          </div>
        </form>

        <nav className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-tn-white sm:gap-6 sm:text-sm">
          <Link href="/" className="transition-colors duration-200 hover:text-tn-amber">
            Accueil
          </Link>
          <Link
            href="/catalogue"
            className="transition-colors duration-200 hover:text-tn-amber"
          >
            Catalogue
          </Link>
          <button
            type="button"
            onClick={toggleCart}
            aria-haspopup="dialog"
            className="relative rounded-lg bg-tn-red px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black sm:px-4 sm:py-2 sm:text-xs"
          >
            <span className="sm:hidden">Panier</span>
            <span className="hidden sm:inline">Mon panier</span>
            {itemCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-tn-black bg-tn-amber text-[10px] font-black text-tn-black">
                {itemCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      <CartDrawer />
    </header>
  );
}
