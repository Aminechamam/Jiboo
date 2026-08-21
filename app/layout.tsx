import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/CartContext";

export const metadata: Metadata = {
  title: "Jiboo — Pièces détachées auto en Tunisie",
  description:
    "Jiboo : pièces détachées automobiles certifiées, livraison rapide partout en Tunisie, paiement à la livraison.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-tn-white text-tn-black">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
