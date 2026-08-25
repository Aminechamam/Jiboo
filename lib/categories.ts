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
 * The `categories` table carries duplicate rows for some names (e.g. two
 * separate "Éclairage" rows, two "Électricité" rows) left over from merging
 * the two Supabase projects during consolidation. Every place that lists or
 * filters by category should go through this so a duplicate row doesn't
 * show up twice — the underlying duplicate rows are still in Supabase and
 * should eventually be cleaned up there too.
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
