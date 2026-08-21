export type IconKey =
  | "brake"
  | "engine"
  | "filter"
  | "suspension"
  | "light"
  | "body"
  | "default";

/** Map a real category name (from Supabase) to one of the known icon keys,
 *  falling back to a generic "part" icon for categories that don't match
 *  one of the original six. */
export function iconForCategoryName(name?: string | null): IconKey {
  const n = (name ?? "").toLowerCase();
  if (n.includes("frein")) return "brake";
  if (n.includes("moteur")) return "engine";
  if (n.includes("filtr")) return "filter";
  if (n.includes("suspension")) return "suspension";
  if (n.includes("éclairage") || n.includes("eclairage") || n.includes("phare"))
    return "light";
  if (n.includes("carrosserie")) return "body";
  return "default";
}

export function CategoryIcon({
  icon,
  className = "w-10 h-10",
}: {
  icon: IconKey;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    xmlns: "http://www.w3.org/2000/svg",
  };

  switch (icon) {
    case "brake":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="18" />
          <circle cx="24" cy="24" r="7" />
          <circle cx="24" cy="10" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="24" cy="38" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="10" cy="24" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="38" cy="24" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "engine":
      return (
        <svg {...common}>
          <rect x="7" y="18" width="22" height="16" rx="2" />
          <rect x="13" y="10" width="6" height="8" rx="1" />
          <rect x="23" y="10" width="6" height="8" rx="1" />
          <path d="M29 22h9v10h-9" />
          <path d="M7 26h-3" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M8 10h32l-12 16v10l-8 4V26z" />
        </svg>
      );
    case "suspension":
      return (
        <svg {...common}>
          <path d="M24 4v8" />
          <path d="M17 12h14l-3 4 3 4-3 4 3 4-3 4H17" />
          <path d="M24 32v12" />
        </svg>
      );
    case "light":
      return (
        <svg {...common}>
          <path d="M8 14c0-4 4-7 10-7 10 0 18 7.5 22 11-4 3.5-12 11-22 11-6 0-10-3-10-7z" />
          <circle cx="16" cy="18" r="2.4" fill="currentColor" stroke="none" />
          <path d="M22 12l4 5M22 24l4-5" />
        </svg>
      );
    case "body":
      return (
        <svg {...common}>
          <path d="M6 28l4-10c1-2.5 3-4 6-4h16c3 0 5 1.5 6 4l4 10" />
          <path d="M4 28h40v6a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2H12v2a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
          <circle cx="14" cy="30" r="2.4" fill="currentColor" stroke="none" />
          <circle cx="34" cy="30" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "default":
    default:
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="6" />
          <path d="M24 6v8M24 34v8M6 24h8M34 24h8" />
          <path d="M11.5 11.5l5.6 5.6M31 31l5.6 5.6M36.5 11.5l-5.6 5.6M17 31l-5.6 5.6" />
        </svg>
      );
  }
}
