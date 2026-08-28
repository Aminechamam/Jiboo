import type { Category } from "./supabase";

/**
 * Accent- and case-insensitive normalization, e.g. so "pompe a eau" matches
 * "pompe à eau" in search, and "Éclairage" / "éclairage" are recognized as
 * the same category name.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type CategoryGroup = { id: string; name: string; ids: string[] };

/**
 * Groups categories that share a (normalized) name into a single entry.
 *
 * The `categories` table used to carry duplicate rows for some names (two
 * separate "Éclairage" rows, two "Électricité" rows) left over from merging
 * two Supabase projects during consolidation. Those duplicate rows were
 * cleaned up directly in Supabase (verified 2026-08-28: one row per name).
 * This function is kept as a defensive safeguard, not a workaround for a
 * known issue — category imports (see lib CSV import) could reintroduce a
 * duplicate name, and grouping here means the UI never shows it twice even
 * if that happens again.
 */
export function dedupeCategories(categories: Category[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const c of categories) {
    const key = normalizeText(c.name);
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(c.id);
    } else {
      groups.set(key, { id: c.id, name: c.name, ids: [c.id] });
    }
  }
  return Array.from(groups.values());
}
