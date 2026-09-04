// Courtes descriptions des marques de fabricants utilisees dans le
// catalogue (colonne products.brand). Affichees sous le nom de la marque
// sur la fiche produit (ProductDetailClient.tsx) pour donner un peu de
// contexte au client plutot que d'afficher seulement le nom brut.
//
// Une marque absente de cette liste reste affichee normalement (juste son
// nom, sans description) : pas besoin de completer cette liste avant de
// pouvoir utiliser une nouvelle marque en admin.
export const BRAND_DESCRIPTIONS: Record<string, string> = {
  harden: "Harden, marque taiwanaise d'outillage a main professionnel (cles, tournevis, embouts, outillage d'atelier).",
  textar: "Textar, marque allemande specialisee dans le freinage (plaquettes, disques), reference historique en pieces d'origine et de rechange.",
  ferodo: "Ferodo, marque britannique pionniere du freinage automobile, plaquettes et disques de frein.",
  trw: "TRW, equipementier automobile, pieces de freinage et de direction de qualite equivalente origine.",
  bosch: "Bosch, equipementier automobile generaliste (freinage, allumage, electricite).",
  lpr: "LPR, marque italienne de pieces de freinage et d'embrayage (disques, plaquettes, machoires, cylindres, butees et recepteurs d'embrayage).",
};

/** Description courte d'une marque, ou null si inconnue (ou si `brand` est
 *  vide/absent) — le composant appelant doit alors se rabattre sur un
 *  simple affichage du nom. */
export function getBrandDescription(brand: string | null | undefined): string | null {
  if (!brand) return null;
  return BRAND_DESCRIPTIONS[brand.trim().toLowerCase()] ?? null;
}
