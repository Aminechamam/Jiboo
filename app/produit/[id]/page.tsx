import type { Metadata } from "next";
import { fetchProductById } from "@/lib/supabase";
import ProductDetailClient from "./ProductDetailClient";

// This route must run at REQUEST time, not at `next build` time — see the
// warning in lib/supabase.ts. force-dynamic keeps generateMetadata's fetch
// off the build-time (network-sandboxed) path.
export const dynamic = "force-dynamic";

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const product = await fetchProductById(id);
    if (!product) {
      return {
        title: "Produit introuvable — Jiboo",
        description: "Ce produit n'est plus disponible sur Jiboo.",
      };
    }

    const description = product.description
      ? product.description.slice(0, 160)
      : `${product.name} — Réf. ${product.reference}. Pièce détachée auto certifiée, livrée partout en Tunisie.`;

    return {
      title: `${product.name} — Jiboo`,
      description,
    };
  } catch {
    // Supabase briefly unreachable — fall back to generic metadata rather
    // than failing the page.
    return {
      title: "Jiboo — Pièces détachées auto en Tunisie",
      description:
        "Jiboo : pièces détachées automobiles certifiées, livraison rapide partout en Tunisie, paiement à la livraison.",
    };
  }
}

export default function ProduitDetailPage() {
  return <ProductDetailClient />;
}
