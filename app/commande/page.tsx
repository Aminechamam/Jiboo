"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCart } from "@/components/CartContext";
import { Spinner } from "@/components/Spinner";
import {
  fetchDeliveryZones,
  placeGuestOrder,
  formatPrice,
  type DeliveryZone,
} from "@/lib/supabase";

const WHATSAPP_NUMBER = "21657099154";

// Customers only ever type the 8-digit local number — the +216 country
// code is added programmatically so nobody has to type it on a phone
// keyboard.
const TN_PHONE_PREFIX = "+216";

export default function CommandePage() {
  const { items, subtotal, clearCart } = useCart();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmedName, setConfirmedName] = useState("");
  const [confirmation, setConfirmation] = useState<{
    trackingReference: string;
    total: number;
  } | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  // Client-side only: this fetch runs in the visitor's browser, never during
  // `next build`'s prerendering, which is network-sandboxed in this project.
  useEffect(() => {
    let cancelled = false;
    fetchDeliveryZones()
      .then((data) => {
        if (cancelled) return;
        setZones(data);
        setZoneId((prev) => prev || data[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setZonesError("Impossible de charger les zones de livraison.");
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedZone = zones.find((z) => z.id === zoneId) ?? null;
  const deliveryFee = selectedZone?.fee ?? 0;
  const total = subtotal + deliveryFee;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || items.length === 0 || !zoneId) return;

    if (!/^\d{8}$/.test(phone)) {
      setFormError("Numéro de téléphone invalide (8 chiffres).");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const trimmedName = fullName.trim();
    const trimmedPhone = `${TN_PHONE_PREFIX}${phone}`;
    const trimmedAddress = address.trim();

    try {
      const result = await placeGuestOrder({
        p_full_name: trimmedName,
        p_phone: trimmedPhone,
        p_address: trimmedAddress,
        p_delivery_zone_id: zoneId,
        p_items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      });

      const messageLines = [
        `Bonjour Jiboo, je confirme ma commande ${result.trackingReference} :`,
        "",
        ...items.map(
          (i) => `- ${i.quantity}x ${i.name} — Réf. ${i.reference} (${formatPrice(i.price)})`
        ),
        "",
        `Sous-total: ${formatPrice(result.subtotal)}`,
        `Livraison${selectedZone ? ` (${selectedZone.name})` : ""}: ${formatPrice(
          result.deliveryFee
        )}`,
        `Total: ${formatPrice(result.total)}`,
        "",
        `Nom: ${trimmedName}`,
        `Téléphone: ${trimmedPhone}`,
        `Adresse: ${trimmedAddress}`,
        `Référence commande: ${result.trackingReference}`,
      ];

      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        messageLines.join("\n")
      )}`;

      clearCart();
      setConfirmedName(trimmedName);
      setConfirmation({ trackingReference: result.trackingReference, total: result.total });
      setWhatsappUrl(url);
      window.open(url, "_blank");
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue lors de la commande. Veuillez réessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <main className="flex-1 bg-tn-offwhite">
        <section className="relative overflow-hidden bg-tn-black pb-20 pt-12 sm:pb-24 sm:pt-16">
          <div className="tn-diagonal-bottom absolute inset-x-0 bottom-0 h-10 bg-tn-offwhite sm:h-14" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <span className="tn-ribbon inline-block bg-tn-red px-4 py-1 text-xs font-black uppercase tracking-widest text-tn-white">
              Commande
            </span>
            <h1 className="mt-5 max-w-2xl text-3xl font-black uppercase leading-[1.05] tracking-wide text-tn-white sm:text-4xl lg:text-5xl">
              Finalisez votre <span className="text-tn-amber">commande</span>
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          {confirmation ? (
            <div className="rounded-2xl border-2 border-tn-black bg-tn-white p-8 text-center shadow-[6px_6px_0_0_var(--tn-black)]">
              <span className="tn-ribbon inline-block bg-tn-amber px-4 py-1 text-xs font-black uppercase tracking-widest text-tn-black">
                Commande enregistrée
              </span>
              <h2 className="mt-5 text-2xl font-black uppercase tracking-wide text-tn-black">
                Merci{confirmedName ? ` ${confirmedName}` : ""}&nbsp;!
              </h2>
              <p className="mt-3 text-sm text-tn-black-soft">Votre référence de suivi&nbsp;:</p>
              <p className="mt-1 text-xl font-black text-tn-red">
                {confirmation.trackingReference}
              </p>
              <p className="mt-3 text-sm text-tn-black-soft">
                Total à payer à la livraison&nbsp;:{" "}
                <span className="font-black text-tn-black">{formatPrice(confirmation.total)}</span>
              </p>
              <p className="mx-auto mt-4 max-w-md text-xs text-tn-black-soft/70">
                Un message WhatsApp pré-rempli s&apos;est ouvert dans un nouvel
                onglet pour confirmer votre commande. Si rien ne s&apos;est
                ouvert, cliquez ci-dessous.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                {whatsappUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(whatsappUrl, "_blank")}
                    className="rounded-lg bg-tn-red px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
                  >
                    Ouvrir WhatsApp
                  </button>
                )}
                <Link
                  href="/catalogue"
                  className="rounded-lg border-2 border-tn-black px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-black transition-all duration-200 hover:scale-105 hover:border-tn-red hover:text-tn-red active:scale-95"
                >
                  Continuer mes achats
                </Link>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-tn-black/30 bg-tn-white p-12 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-tn-black-soft/60">
                Votre panier est vide.
              </p>
              <Link
                href="/catalogue"
                className="mt-6 inline-block rounded-lg bg-tn-red px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95"
              >
                Voir le catalogue
              </Link>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
              {/* SUMMARY */}
              <div className="rounded-2xl border-2 border-tn-black bg-tn-white p-6 shadow-[4px_4px_0_0_var(--tn-black)]">
                <h2 className="text-sm font-black uppercase tracking-widest text-tn-black-soft/60">
                  Récapitulatif
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center justify-between gap-3 border-b border-tn-black/10 pb-3 text-sm"
                    >
                      <span className="font-bold uppercase text-tn-black">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="font-black text-tn-black-soft">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-bold uppercase text-tn-black-soft/70">Sous-total</span>
                  <span className="font-black text-tn-black">{formatPrice(subtotal)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-bold uppercase text-tn-black-soft/70">
                    Livraison{selectedZone ? ` — ${selectedZone.name}` : ""}
                  </span>
                  <span className="font-black text-tn-black">
                    {selectedZone ? formatPrice(deliveryFee) : "—"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t-2 border-tn-black pt-4">
                  <span className="text-base font-black uppercase text-tn-black">Total</span>
                  <span className="text-2xl font-black text-tn-red">{formatPrice(total)}</span>
                </div>
              </div>

              {/* FORM */}
              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-4 rounded-2xl border-2 border-tn-black bg-tn-white p-6 shadow-[4px_4px_0_0_var(--tn-black)]"
              >
                <h2 className="text-sm font-black uppercase tracking-widest text-tn-black-soft/60">
                  Vos informations
                </h2>

                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70">
                  Nom complet
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-sm font-medium normal-case text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70">
                  Téléphone
                  <div className="flex items-stretch rounded-lg border-2 border-tn-black bg-tn-white shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-within:-translate-y-0.5 focus-within:shadow-[4px_4px_0_0_var(--tn-red)]">
                    <span className="flex items-center border-r-2 border-tn-black bg-tn-offwhite px-2.5 text-sm font-black text-tn-black-soft">
                      {TN_PHONE_PREFIX}
                    </span>
                    <input
                      required
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      pattern="[0-9]{8}"
                      maxLength={8}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="12345678"
                      className="w-full min-w-0 rounded-r-lg bg-tn-white px-3 py-2 text-sm font-medium normal-case text-tn-black focus:outline-none"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70">
                  Adresse
                  <textarea
                    required
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="resize-none rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-sm font-medium normal-case text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-wide text-tn-black-soft/70">
                  Zone de livraison
                  <select
                    required
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    disabled={zonesLoading || zones.length === 0}
                    className="rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-black shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:-translate-y-0.5 focus:shadow-[4px_4px_0_0_var(--tn-red)] focus:outline-none"
                  >
                    {zonesLoading && <option>Chargement…</option>}
                    {!zonesLoading &&
                      zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} — {formatPrice(z.fee)}
                        </option>
                      ))}
                  </select>
                </label>

                {zonesError && (
                  <p className="text-xs font-bold uppercase tracking-wide text-tn-red">
                    {zonesError}
                  </p>
                )}

                {formError && (
                  <p className="rounded-lg border-2 border-tn-red bg-tn-red/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tn-red">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || zonesLoading || zones.length === 0}
                  className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-tn-red px-6 py-3 text-sm font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:scale-105 hover:bg-tn-amber hover:text-tn-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-tn-red disabled:hover:text-tn-white"
                >
                  {isSubmitting && <Spinner className="size-4" />}
                  {isSubmitting ? "Envoi en cours…" : "Confirmer la commande"}
                </button>
              </form>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
