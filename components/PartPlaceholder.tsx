import { CategoryIcon, iconForCategoryName, type IconKey } from "./CategoryIcon";

// Alternates block color per category icon so the catalogue grid doesn't
// look monotone. Keyed by icon rather than raw category name so any of the
// 10 real Supabase categories (matched via iconForCategoryName) still gets
// one of the original palette treatments.
const paletteFor = (icon: IconKey) => {
  switch (icon) {
    case "brake":
      return "bg-tn-black text-tn-amber";
    case "engine":
      return "bg-tn-red text-tn-white";
    case "filter":
      return "bg-tn-amber text-tn-black";
    case "suspension":
      return "bg-tn-black-soft text-tn-amber";
    case "light":
      return "bg-tn-red-dark text-tn-amber";
    case "body":
      return "bg-tn-black text-tn-red";
    default:
      return "bg-tn-black-soft text-tn-white";
  }
};

export function PartPlaceholder({
  categoryName,
  photoUrl,
  alt,
}: {
  categoryName?: string | null;
  /** Real product photo from Supabase Storage — rendered instead of the icon
   *  placeholder whenever it's available. */
  photoUrl?: string | null;
  alt?: string;
}) {
  const icon = iconForCategoryName(categoryName);

  if (photoUrl) {
    return (
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-tn-black-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt={alt ?? ""} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg ${paletteFor(
        icon
      )}`}
    >
      {/* corner stripe accent */}
      <div className="tn-stripes absolute -right-6 -top-6 h-16 w-16 rotate-45 opacity-90" />
      <CategoryIcon icon={icon} className="h-16 w-16 sm:h-20 sm:w-20" />
    </div>
  );
}
