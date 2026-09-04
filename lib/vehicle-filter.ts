import type { Product } from "./supabase";

export type VehicleFilter = {
  make: string | null;
  model: string | null;
  year: number | null;
};

/**
 * Whether a product fits the selected vehicle. A product with no
 * compatibility rows at all (compatibilityList.length === 0) is treated as
 * fitting any vehicle -- this mirrors buildCompatibility() in lib/supabase.ts,
 * which already displays such products as "Toutes marques". Filtering out
 * those products here would silently hide universal parts (tools, generic
 * fluids, etc.) the moment a visitor picks a vehicle, which would be worse
 * than not filtering them at all.
 */
export function productMatchesVehicle(product: Product, filter: VehicleFilter): boolean {
  if (!filter.make) return true;
  if (product.compatibilityList.length === 0) return true;

  return product.compatibilityList.some((row) => {
    if (row.make !== filter.make) return false;
    if (filter.model && row.model !== filter.model) return false;
    if (filter.year != null) {
      if (row.year_from != null && filter.year < row.year_from) return false;
      if (row.year_to != null && filter.year > row.year_to) return false;
    }
    return true;
  });
}

function sortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "fr"));
}

export function distinctMakes(products: Product[]): string[] {
  return sortedUnique(
    products.flatMap((p) => p.compatibilityList.map((row) => row.make))
  );
}

export function distinctModels(products: Product[], make: string): string[] {
  return sortedUnique(
    products
      .flatMap((p) => p.compatibilityList)
      .filter((row) => row.make === make && row.model !== "")
      .map((row) => row.model)
  );
}

/** Inclusive [min, max] year span covered by matching compatibility rows, or
 *  null when no row has a bounded year (nothing to build a year select from). */
export function yearRangeFor(
  products: Product[],
  make: string,
  model: string | null
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const p of products) {
    for (const row of p.compatibilityList) {
      if (row.make !== make) continue;
      if (model && row.model !== model) continue;
      if (row.year_from != null) min = Math.min(min, row.year_from);
      if (row.year_to != null) max = Math.max(max, row.year_to);
    }
  }
  if (min === Infinity || max === -Infinity) return null;
  return { min, max };
}
