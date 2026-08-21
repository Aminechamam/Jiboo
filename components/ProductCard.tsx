"use client";

import { useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import type { Product } from "@/lib/supabase";
import { formatPrice } from "@/lib/supabase";
import { PartPlaceholder } from "./PartPlaceholder";
import { useCart } from "./CartContext";

export function ProductCard({
  product,
  className = "",
  style,
}: {
  product: Product;
  /** Extra classes appended to the root card — used by callers to layer in
   *  entrance-animation utilities (e.g. `motion-safe:[animation:...]`). */
  className?: string;
  /** Inline style passthrough — used for staggered `animationDelay`. */
  style?: CSSProperties;
}) {
  const { addItem } = useCart();
  // Bumped on every successful "add" click. Used as the anchor's `key` so the
  // scale-pulse confirmation animation restarts on repeated clicks — a fresh
  // element mount is the simplest way to retrigger a CSS keyframe animation.
  const [pulseKey, setPulseKey] = useState(0);

  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= product.lowStockThreshold;

  const handleAdd = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (outOfStock) return;
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      reference: product.reference,
      photoUrl: product.photoUrl,
    });
    setPulseKey((k) => k + 1);
  };

  return (
    <div
      style={style}
      className={`group relative flex flex-col overflow-hidden rounded-xl border-2 border-tn-black bg-tn-white shadow-[4px_4px_0_0_var(--tn-black)] transition-all duration-200 ease-out hover:-translate-y-1 hover:-rotate-1 hover:scale-105 hover:shadow-[8px_8px_0_0_var(--tn-red)] ${className}`}
    >
      {lowStock && (
        <span className="tn-ribbon absolute left-3 top-3 z-10 bg-tn-amber px-3 py-1 text-xs font-black uppercase tracking-wide text-tn-black">
          Stock limité
        </span>
      )}

      <Link href={`/produit/${product.id}`} className="flex flex-1 flex-col">
        <div className="p-3">
          <PartPlaceholder
            categoryName={product.category?.name}
            photoUrl={product.photoUrl}
            alt={product.name}
          />
        </div>

        <div className="flex flex-1 flex-col gap-2 px-4">
          <span className="w-fit rounded-full bg-tn-offwhite px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-tn-black-soft">
            {product.category?.name ?? "Autre"}
          </span>
          <h3 className="text-base font-extrabold uppercase leading-snug tracking-wide text-tn-black">
            {product.name}
          </h3>
          <p className="text-sm text-tn-black-soft/80">{product.compatibility}</p>
          <p className="text-xs text-tn-black-soft/60">Réf. {product.reference}</p>
          <p className="line-clamp-2 text-sm text-tn-black-soft">{product.description}</p>
        </div>
      </Link>

      <div className="flex flex-col px-4 pb-4">
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xl font-black text-tn-red">{formatPrice(product.price)}</span>
          {outOfStock ? (
            <span className="cursor-not-allowed rounded-lg bg-tn-black-soft/20 px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black-soft/50">
              Rupture de stock
            </span>
          ) : (
            <a
              key={pulseKey}
              href="#"
              onClick={handleAdd}
              className={`rounded-lg bg-tn-black px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-red active:scale-95 ${
                pulseKey > 0
                  ? "motion-safe:[animation:tn-add-bump_320ms_cubic-bezier(0.34,1.56,0.64,1)]"
                  : ""
              }`}
            >
              Ajouter au panier
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
