// Route serveur du chatbot jiboo. Ne tourne QUE côté serveur (Route Handler
// Next.js) : c'est le seul endroit où la clé ANTHROPIC_API_KEY est lue,
// jamais exposée au navigateur. Le widget client (components/ChatWidget.tsx)
// envoie l'historique de conversation ici à chaque message et récupère la
// réponse, plus la liste structurée des produits trouvés le cas échéant
// (pour affichage en cartes cliquables côté client, sans jamais laisser le
// modèle inventer un prix, une référence ou une URL de produit).

import { fetchProducts, formatPrice, type Product } from "@/lib/supabase";
import { productMatchesVehicle } from "@/lib/vehicle-filter";

export const runtime = "nodejs";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Sonnet 5 choisi par Amine dès le départ (diagnostic auto plus fiable que
// Haiku), malgré un coût par requête environ deux fois plus élevé.
// Haiku 4.5 reste disponible via ANTHROPIC_MODEL si besoin de réduire le coût.
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 700;
const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_TOOL_ROUNDS = 3;

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type ProductCard = {
  id: string;
  name: string;
  brand: string | null;
  reference: string;
  price: string;
  inStock: boolean;
  compatibility: string;
  url: string;
};

const SYSTEM_PROMPT = `Tu es l'assistant de jiboo.tn, un site tunisien de vente de pièces détachées automobiles (rayon "Pièces Auto") et de quincaillerie/outillage (rayon "Quincaillerie", marque Harden notamment). Tu réponds toujours en français.

Format de réponse, important : reste bref et clair. Phrases courtes, pas de blabla ni de longue introduction. 3-4 phrases suffisent la plupart du temps. Si tu dois lister plusieurs points (étapes, causes possibles), utilise des tirets courts plutôt qu'un paragraphe dense. L'utilisateur lit ça dans une petite fenêtre de chat, un pavé de texte est illisible.

Ton rôle :
1. Aider un client à trouver une pièce ou un outil dans le catalogue jiboo.tn. Utilise l'outil search_products dès que tu as assez d'informations (type de pièce recherché, et pour une pièce auto idéalement la marque/modèle/année du véhicule) plutôt que d'inventer un produit, un prix ou une référence : tu n'as connaissance du catalogue QUE via cet outil. Si l'outil ne renvoie rien, dis-le clairement et propose de préciser la recherche, ne prétends jamais qu'un produit existe si tu ne l'as pas vu dans un résultat d'outil.
2. Répondre à des questions générales de diagnostic automobile (bruits, pannes, symptômes). Tu peux donner des pistes plausibles, mais reste prudent : précise que ce n'est qu'une orientation et qu'un mécanicien doit confirmer le diagnostic avant toute intervention, surtout pour tout ce qui touche au freinage ou à la sécurité. Dès que tu identifies une ou deux pièces plausibles (ex. courroie de distribution, pompe à eau pour un moteur qui chauffe), appelle immédiatement search_products pour ces pièces, en plus de ta réponse texte, pour que les produits correspondants s'affichent tout de suite plutôt que d'attendre que l'utilisateur redemande. Reste sur 1-2 pistes principales, pas une recherche pour chaque cause possible. N'invente jamais de référence pièce précise pour "confirmer" un diagnostic : c'est justement le rôle de search_products.

Règle stricte sur le véhicule : n'invente et ne suppose JAMAIS une marque ou un modèle de véhicule. Ne dis jamais "pour une Mercedes-Benz" ou toute autre marque si le client ne l'a pas donnée lui-même (texte tapé, ou sélecteur véhicule décrit plus bas). Si tu ne connais pas le véhicule et que ça t'aiderait pour chercher un produit compatible, dis-le simplement et invite le client à choisir sa voiture dans le sélecteur affiché au-dessus du champ de message, ne lui demande pas de le taper. Tu peux quand même chercher et lister des pièces sans véhicule précisé (le client verra alors des résultats non filtrés par compatibilité).

Le prix affiché est toujours en dinars tunisiens (DT). Ne donne jamais de prix, référence ou lien produit qui ne vient pas directement d'un résultat de search_products.`;

type VehicleContext = { make: string; model: string | null };

/** Ajoute au prompt système la vérité terrain sur le véhicule quand elle
 *  existe (choisie par le client via le sélecteur de ChatWidget.tsx, jamais
 *  tapée en texte libre), ou rappelle explicitement au modèle qu'il n'a
 *  aucun véhicule fiable pour l'instant. Sans ce rappel systématique, le
 *  modèle a tendance à réutiliser les exemples de marques du schéma de
 *  l'outil (voir SEARCH_PRODUCTS_TOOL) comme si c'était une vraie donnée
 *  client. */
function buildSystemPrompt(vehicle: VehicleContext | null): string {
  const vehicleNote = vehicle
    ? `\n\nVéhicule du client, choisi de façon fiable via le sélecteur (ce n'est pas une supposition) : ${vehicle.make}${
        vehicle.model ? " " + vehicle.model : ""
      }. Utilise-le directement dans search_products (champs make/model) sans le redemander.`
    : `\n\nAucun véhicule n'est renseigné pour l'instant, le sélecteur au-dessus du champ de message est vide.`;
  return SYSTEM_PROMPT + vehicleNote;
}

const SEARCH_PRODUCTS_TOOL = {
  name: "search_products",
  description:
    "Cherche des produits dans le catalogue jiboo.tn (pièces auto ou quincaillerie) par mots-clés, et optionnellement par véhicule (marque/modèle) pour une pièce auto. Renvoie jusqu'à 5 produits réels avec prix, référence et disponibilité. N'utilise make/model QUE si le client les a donnés (texte ou sélecteur) : ne les devine jamais et n'utilise jamais un exemple de ce schéma comme une vraie valeur.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Mots-clés du produit recherché, ex. 'plaquette de frein avant', 'clé mixte 13mm', 'disque de frein'.",
      },
      make: {
        type: "string",
        description:
          "Marque du véhicule, uniquement si le client l'a explicitement donnée (texte tapé ou sélecteur). Ne jamais inventer ou supposer une marque.",
      },
      model: {
        type: "string",
        description:
          "Modèle du véhicule, uniquement si le client l'a explicitement donné (texte tapé ou sélecteur). Ne jamais inventer ou supposer un modèle.",
      },
      year: {
        type: "number",
        description: "Année du véhicule si mentionnée.",
      },
    },
    required: [],
  },
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function toCard(p: Product): ProductCard {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    reference: p.reference,
    price: formatPrice(p.price),
    inStock: p.stock > 0,
    compatibility: p.compatibility,
    url: `/produit/${p.id}`,
  };
}

async function runSearchProducts(input: {
  query?: string;
  make?: string;
  model?: string;
  year?: number;
}): Promise<ProductCard[]> {
  const products = await fetchProducts();

  const queryWords = (input.query ?? "")
    .split(/\s+/)
    .map(normalize)
    .filter((w) => w.length >= 3);

  let candidates = products;

  if (queryWords.length > 0) {
    candidates = candidates.filter((p) => {
      const haystack = normalize(
        [p.name, p.brand ?? "", p.description, p.cardSubtitle ?? "", p.reference].join(" ")
      );
      return queryWords.some((w) => haystack.includes(w));
    });
  }

  if (input.make) {
    candidates = candidates.filter((p) =>
      productMatchesVehicle(p, {
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
      })
    );
  }

  // En stock d'abord, puis le reste, dans l'ordre déjà renvoyé par fetchProducts.
  const sorted = [...candidates].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));

  return sorted.slice(0, 5).map(toCard);
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicResponse = {
  content: AnthropicContentBlock[];
  stop_reason: string;
};

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: "user" | "assistant"; content: AnthropicContentBlock[] | string }[]
): Promise<AnthropicResponse> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: [SEARCH_PRODUCTS_TOOL],
      messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 500)}`);
  }

  return res.json();
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Le chatbot n'est pas encore configuré (clé API manquante)." },
      { status: 503 }
    );
  }

  let body: { messages?: ChatMessage[]; vehicle?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  // Le véhicule vient exclusivement du sélecteur de ChatWidget.tsx (deux
  // <select> alimentés par /api/vehicles), jamais d'un champ texte libre :
  // c'est une donnée fiable, pas une supposition du modèle.
  let vehicle: VehicleContext | null = null;
  if (
    body.vehicle &&
    typeof body.vehicle === "object" &&
    typeof (body.vehicle as { make?: unknown }).make === "string" &&
    (body.vehicle as { make: string }).make.trim().length > 0
  ) {
    const raw = body.vehicle as { make: string; model?: unknown };
    vehicle = {
      make: raw.make.trim().slice(0, 80),
      model: typeof raw.model === "string" && raw.model.trim().length > 0 ? raw.model.trim().slice(0, 80) : null,
    };
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const trimmed = incoming
    .filter(
      (m): m is ChatMessage =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ ...m, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

  if (trimmed.length === 0) {
    return Response.json({ error: "Message vide." }, { status: 400 });
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const system = buildSystemPrompt(vehicle);

  // Historique au format Anthropic, content commence en string simple, et
  // peut ensuite contenir des blocs tool_use / tool_result une fois qu'on
  // entre dans la boucle d'appel d'outil ci-dessous.
  const conversation: { role: "user" | "assistant"; content: AnthropicContentBlock[] | string }[] =
    trimmed.map((m) => ({ role: m.role, content: m.content }));

  const matchedProducts: ProductCard[] = [];
  const seenProductIds = new Set<string>();

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await callAnthropic(apiKey, model, system, conversation);

      const toolUses = response.content.filter(
        (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> => b.type === "tool_use"
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = response.content
          .filter((b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return Response.json({
          reply: text || "Désolé, je n'ai pas de réponse à te proposer là.",
          products: matchedProducts,
        });
      }

      conversation.push({ role: "assistant", content: response.content });

      const toolResults: AnthropicContentBlock[] = [];
      for (const toolUse of toolUses) {
        if (toolUse.name !== "search_products") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "Outil inconnu.",
          });
          continue;
        }
        const results = await runSearchProducts(toolUse.input as Record<string, unknown>);
        for (const card of results) {
          if (!seenProductIds.has(card.id)) {
            seenProductIds.add(card.id);
            matchedProducts.push(card);
          }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content:
            results.length > 0
              ? JSON.stringify(results.map(({ name, brand, reference, price, inStock, compatibility }) => ({ name, brand, reference, price, inStock, compatibility })))
              : "Aucun produit trouvé pour cette recherche.",
        });
      }

      conversation.push({ role: "user", content: toolResults });
    }

    return Response.json({
      reply: "Je n'arrive pas à finaliser la recherche, peux-tu reformuler ta demande ?",
      products: matchedProducts,
    });
  } catch (err) {
    console.error("chat route error", err);
    return Response.json(
      { error: "Le chatbot est momentanément indisponible, réessaie dans un instant." },
      { status: 502 }
    );
  }
}
