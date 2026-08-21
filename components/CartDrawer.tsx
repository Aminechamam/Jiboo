"use client";

import Link from "next/link";
import { useCart } from "./CartContext";
import { formatPrice } from "@/lib/supabase";

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal } = useCart();

  return (
    <>
      <div
        aria-hidden={!isOpen}
        onClick={closeCart}
        className={`fixed inset-0 z-50 bg-tn-black/60 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Panier"
        aria-hidden={!isOpen}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l-4 border-tn-black bg-tn-white transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b-4 border-tn-black bg-tn-black px-5 py-4">
          <h2 className="text-lg font-black uppercase tracking-wide text-tn-white">
            Mon panier
          </h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Fermer le panier"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-tn-red text-sm font-black text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="mt-8 text-center text-sm font-bold uppercase tracking-wide text-tn-black-soft/50">
              Votre panier est vide.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex gap-3 rounded-xl border-2 border-tn-black bg-tn-white p-3 shadow-[3px_3px_0_0_var(--tn-black)]"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 border-tn-black bg-tn-black-soft">
                    {item.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photoUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-black uppercase text-tn-white/60">
                        JB
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-xs font-extrabold uppercase leading-snug tracking-wide text-tn-black">
                      {item.name}
                    </span>
                    <span className="text-[11px] text-tn-black-soft/60">
                      Réf. {item.reference}
                    </span>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          aria-label="Diminuer la quantité"
                          className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-tn-black bg-tn-white text-xs font-black transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-tn-amber active:scale-95"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-xs font-black">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          aria-label="Augmenter la quantité"
                          className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-tn-black bg-tn-white text-xs font-black transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-tn-amber active:scale-95"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-sm font-black text-tn-red">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    aria-label={`Retirer ${item.name}`}
                    className="self-start text-xs font-black text-tn-black-soft/40 transition-colors duration-200 hover:text-tn-red"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t-4 border-tn-black px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-black uppercase tracking-wide text-tn-black-soft/60">
              Sous-total
            </span>
            <span className="text-xl font-black text-tn-black">{formatPrice(subtotal)}</span>
          </div>
          <Link
            href="/commande"
            onClick={items.length > 0 ? closeCart : undefined}
            aria-disabled={items.length === 0}
            tabIndex={items.length === 0 ? -1 : undefined}
            className={`block w-full rounded-lg px-4 py-3 text-center text-sm font-black uppercase tracking-wide transition-all duration-200 ${
              items.length === 0
                ? "pointer-events-none bg-tn-black-soft/20 text-tn-black-soft/40"
                : "bg-tn-red text-tn-white hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
            }`}
          >
            Commander
          </Link>
        </div>
      </aside>
    </>
  );
}
