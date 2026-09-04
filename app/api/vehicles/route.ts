// Liste des marques/modèles compatibles, pour le sélecteur véhicule du
// chatbot (ChatWidget.tsx). Volontairement séparée de fetchProducts() :
// on n'a besoin ici que de make/model, pas des produits entiers avec photos
// et prix, donc on interroge product_compatibility directement pour rester
// léger (~300 lignes make/model, quelques Ko).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export const runtime = "nodejs";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

type CompatibilityRow = { make: string; model: string };

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/product_compatibility?select=make,model&order=make.asc,model.asc`,
      { headers: SUPABASE_HEADERS, cache: "no-store" }
    );

    if (!res.ok) {
      throw new Error(`Supabase error ${res.status}`);
    }

    const rows: CompatibilityRow[] = await res.json();

    const modelsByMake: Record<string, string[]> = {};
    for (const row of rows) {
      if (!row.make) continue;
      if (!modelsByMake[row.make]) modelsByMake[row.make] = [];
      if (row.model && !modelsByMake[row.make].includes(row.model)) {
        modelsByMake[row.make].push(row.model);
      }
    }

    const makes = Object.keys(modelsByMake).sort((a, b) => a.localeCompare(b, "fr"));
    for (const make of makes) {
      modelsByMake[make].sort((a, b) => a.localeCompare(b, "fr"));
    }

    return Response.json({ makes, modelsByMake });
  } catch (err) {
    console.error("vehicles route error", err);
    return Response.json(
      { error: "Impossible de charger la liste des véhicules." },
      { status: 502 }
    );
  }
}
