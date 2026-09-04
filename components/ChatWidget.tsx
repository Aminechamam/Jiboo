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

const WELCOME: Message = {
  role: "assistant",
  content:
    "Salut, je suis l'assistant jiboo. Décris-moi la pièce ou le problème (ex. \"j'ai une Golf 6 de 2015, mes plaquettes avant sont usées\"), je cherche dans le catalogue. Je peux aussi donner des pistes pour un bruit ou une panne, mais ça ne remplace pas l'avis d'un mécanicien.",
};

/** Widget de chat flottant, disponible sur tout le site. Positionné en bas
 *  à gauche pour ne jamais chevaucher le CartToast (bas-droite). Aucune clé
 *  API ici : chaque message part vers /api/chat, seule la route serveur
 *  parle à Anthropic. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, products, open]);

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
        body: JSON.stringify({ messages: nextMessages }),
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
        className="fixed bottom-4 left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-tn-black bg-tn-black text-tn-white shadow-[3px_3px_0_0_var(--tn-red)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-tn-red sm:bottom-6 sm:left-6"
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
        <div className="fixed bottom-20 left-4 z-40 flex h-[70vh] max-h-[560px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-tn-black bg-tn-white shadow-[5px_5px_0_0_var(--tn-black)] sm:bottom-24 sm:left-6">
          <div className="flex-none border-b-2 border-tn-black bg-tn-black px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-tn-white">
              Assistant jiboo
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-tn-white/60">
              Ne remplace pas l&apos;avis d&apos;un mécanicien.
            </p>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
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
                <p className="rounded-xl border-2 border-tn-black/10 bg-tn-offwhite px-3 py-2 text-sm text-tn-black-soft/50">
                  …
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
                    className="flex items-center justify-between gap-2 rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 shadow-[2px_2px_0_0_var(--tn-black)] transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black uppercase tracking-wide text-tn-black">
                        {p.name}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-tn-black-soft/60">
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
              className="min-w-0 flex-1 rounded-lg border-2 border-tn-black bg-tn-white px-3 py-2 text-sm font-medium text-tn-black placeholder:text-tn-black-soft/40 focus:outline-none focus:shadow-[2px_2px_0_0_var(--tn-red)]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex-none rounded-lg bg-tn-black px-3 py-2 text-xs font-black uppercase tracking-wide text-tn-white transition-all duration-200 hover:bg-tn-red disabled:cursor-not-allowed disabled:opacity-40"
            >
              Envoyer
            </button>
          </form>
        </div>
      )}
    </>
  );
}
