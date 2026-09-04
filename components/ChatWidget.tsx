"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };
type ProductCard = {
  name: string;
  brand: string | null;
  reference: string;
  price: string;
  inStock: boolean;
  compatibility: string;
  url: string;
};
type VehicleData = { makes: string[]; modelsByMake: Record<string, string[]> };

const WELCOME: Message = {
  role: "assistant",
  content:
    "Salut, je suis l'assistant jiboo. Décris-moi la pièce ou le problème (ex. \"mon moteur chauffe\"), je te donne des pistes et je cherche dans le catalogue. Choisis ta voiture ci-dessus pour voir directement les pièces compatibles. Ça ne remplace pas l'avis d'un mécanicien.",
};

/** Widget de chat flottant, disponible sur tout le site. Positionné en bas
 *  à droite (convention habituelle), au-dessus du CartToast qui s'affiche
 *  ponctuellement au même coin. Aucune clé API ici : chaque message part
 *  vers /api/chat, seule la route serveur parle à Anthropic.
 *
 *  Le sélecteur véhicule (marque/modèle) n'est PAS du texte libre : c'est un
 *  choix fiable envoyé tel quel à /api/chat, pour que le modèle n'ait jamais
 *  à deviner ou halluciner une marque que le client n'a pas donnée. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dotCount, setDotCount] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, products, loading, open]);

  // Chargé au premier ouverture du chat seulement (pas au chargement du
  // site), pour ne pas déclencher une requête inutile pour les visiteurs qui
  // n'ouvrent jamais le chat.
  useEffect(() => {
    if (!open || vehicleData) return;
    fetch("/api/vehicles")
      .then((res) => res.json())
      .then((data: VehicleData) => {
        if (Array.isArray(data?.makes)) setVehicleData(data);
      })
      .catch(() => {});
  }, [open, vehicleData]);

  // Puces "en train d'écrire" en pur texte, sans animation CSS : après deux
  // tentatives d'indicateur animé (utilitaires Tailwind arbitraires puis
  // classe CSS dédiée) restées invisibles côté client, on garde la version
  // la plus simple possible, garantie de s'afficher.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setDotCount((d) => (d % 3) + 1), 400);
    return () => clearInterval(id);
  }, [loading]);

  const models = vehicleMake ? vehicleData?.modelsByMake[vehicleMake] ?? [] : [];
  const hasVehicle = vehicleMake.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          vehicle: hasVehicle ? { make: vehicleMake, model: vehicleModel || null } : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Le chatbot est momentanément indisponible.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setProducts(data.products ?? []);
    } catch {
      setError("Connexion impossible, réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Fermer l'assistant jiboo" : "Ouvrir l'assistant jiboo"}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-tn-black bg-tn-black text-tn-white shadow-[3px_3px_0_0_var(--tn-red)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-tn-red sm:bottom-6 sm:right-6"
      >
        {open ? (
          <svg viewBox="0 0 20 20" fill="none" className="h-6 w-6" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
            <path
              d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[75vh] max-h-[640px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-tn-black bg-tn-white shadow-[5px_5px_0_0_var(--tn-black)] motion-safe:[animation:tn-card-in_220ms_cubic-bezier(0.34,1.56,0.64,1)_both] sm:bottom-24 sm:right-6 sm:max-w-md lg:max-w-lg">
          <div className="flex-none border-b-2 border-tn-black bg-tn-black px-5 py-4">
            <p className="text-sm font-black uppercase tracking-wide text-tn-white">
              Assistant jiboo
            </p>
            <p className="mt-0.5 text-xs font-medium text-tn-white/60">
              Ne remplace pas l&apos;avis d&apos;un mécanicien.
            </p>
          </div>

          <div className="flex-none border-b-2 border-tn-black bg-tn-offwhite px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={vehicleMake}
                onChange={(e) => {
                  setVehicleMake(e.target.value);
                  setVehicleModel("");
                }}
                className="min-w-0 flex-1 rounded-lg border-2 border-tn-black bg-tn-white px-2 py-1.5 text-[11px] font-black uppercase tracking-wide text-tn-black focus:outline-none"
              >
                <option value="">Marque</option>
                {vehicleData?.makes.map((make) => (
                  <option key={make} value={make}>
                    {make}
                  </option>
                ))}
              </select>
              <select
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                disabled={!hasVehicle || models.length === 0}
                className="min-w-0 flex-1 rounded-lg border-2 border-tn-black bg-tn-white px-2 py-1.5 text-[11px] font-black uppercase tracking-wide text-tn-black focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                <option value="">Modèle</option>
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              {hasVehicle && (
                <button
                  type="button"
                  onClick={() => {
                    setVehicleMake("");
                    setVehicleModel("");
                  }}
                  className="flex-none text-[11px] font-black uppercase tracking-wide text-tn-black-soft/50 underline decoration-dotted underline-offset-2 transition-colors duration-200 hover:text-tn-red"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <p
                  className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-[15px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-tn-black text-tn-white"
                      : "border-2 border-tn-black/10 bg-tn-offwhite text-tn-black"
                  }`}
                >
                  {m.content}
                </p>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <p className="rounded-xl border-2 border-tn-black/10 bg-tn-offwhite px-4 py-2.5 text-[15px] font-medium text-tn-black-soft/70">
                  L&apos;assistant réfléchit{".".repeat(dotCount)}
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-xl border-2 border-tn-red/30 bg-tn-red/5 px-3 py-2 text-xs font-bold text-tn-red">
                {error}
              </p>
            )}

            {products.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                {products.map((p) => (
                  <Link
                    key={p.url}
                    href={p.url}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-lg border-2 border-tn-black bg-tn-white px-3.5 py-2.5 shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black uppercase tracking-wide text-tn-black">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs font-medium text-tn-black-soft/60">
                        {p.brand ? `${p.brand} · ` : ""}
                        {p.compatibility || "Toutes marques"}
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block text-sm font-black text-tn-red">{p.price}</span>
                      {!p.inStock && (
                        <span className="block text-[10px] font-bold uppercase text-tn-black-soft/40">
                          Rupture
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-none items-center gap-2 border-t-2 border-tn-black p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Écris ta question..."
              disabled={loading}
              className="min-w-0 flex-1 rounded-lg border-2 border-tn-black bg-tn-white px-3.5 py-3 text-[15px] font-medium text-tn-black placeholder:text-tn-black-soft/40 focus:outline-none focus:shadow-[2px_2px_0_0_var(--tn-red)]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex-none rounded-lg bg-tn-black px-4 py-3 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:bg-tn-red disabled:cursor-not-allowed disabled:opacity-40"
            >
              Envoyer
            </button>
          </form>
        </div>
      )}
    </>
  );
}
