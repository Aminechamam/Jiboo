/** A single authored loading indicator reused everywhere the site waits on
 *  Supabase: an inline arc, not a full ring, so it reads as motion rather
 *  than a static badge. Sizing/color are controlled by the caller via
 *  `className` (width/height + `currentColor`-driven `text-*`). */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Chargement"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="42"
        strokeDashoffset="14"
        opacity="0.9"
      />
    </svg>
  );
}
