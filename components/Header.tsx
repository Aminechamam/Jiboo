"use client";

import Link from "next/link";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";

export function Header() {
  const { itemCount, toggleCart } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b-4 border-tn-amber bg-tn-black">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tn-red font-black text-tn-white">
            JB
          </span>
          <span className="text-lg font-black uppercase tracking-wide text-tn-white">
            Jib<span className="text-tn-amber">oo</span>
          </span>
        </Link>

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
