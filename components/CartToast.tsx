"use client";

import { useCart } from "./CartContext";

/**
 * Fixed-position confirmation toast shown whenever `showToast` fires from
 * CartContext (product cards / product detail "Ajouter au panier"). Exists
 * because the cart-count badge alone is easy to miss — this gives an
 * unmissable, self-dismissing confirmation regardless of where on the page
 * the click happened.
 */
export function CartToast() {
  const { toastMessage } = useCart();

  if (!toastMessage) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6 sm:justify-end sm:pr-6">
      <div
        role="status"
        aria-live="polite"
        className="motion-safe:[animation:tn-toast-in_260ms_cubic-bezier(0.34,1.56,0.64,1)_both] flex items-center gap-3 rounded-xl border-2 border-tn-black bg-tn-white px-4 py-3 shadow-[4px_4px_0_0_var(--tn-black)] sm:px-5 sm:py-3.5"
      >
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-tn-amber text-tn-black">
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M4 10.5l4 4 8-9"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-xs font-black uppercase tracking-wide text-tn-black sm:text-sm">
          {toastMessage}
        </span>
      </div>
    </div>
  );
}
