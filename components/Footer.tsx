import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 bg-tn-black text-tn-white">
      <div className="tn-stripes h-3 w-full" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tn-red font-black text-tn-white">
              JB
            </span>
            <span className="text-lg font-black uppercase tracking-wide">
              Jib<span className="text-tn-amber">oo</span>
            </span>
          </div>
          <p className="mt-4 text-sm text-tn-white/60">
            Pièces détachées auto certifiées, livrées partout en Tunisie.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-black uppercase tracking-wide text-tn-amber">
            Navigation
          </h4>
          <ul className="mt-4 space-y-2 text-sm text-tn-white/70">
            <li>Accueil</li>
            <li>Catalogue</li>
            <li>Promotions</li>
            <li>À propos</li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-black uppercase tracking-wide text-tn-amber">
            Contact
          </h4>
          <ul className="mt-4 space-y-2 text-sm text-tn-white/70">
            <li>40 rue Hedi Chaker, Tunis, Tunisie</li>
            <li>+216 57 099 154</li>
            <li>contact@jiboo.tn</li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-black uppercase tracking-wide text-tn-amber">
            Suivez-nous
          </h4>
          <div className="mt-4 flex gap-3">
            {["FB", "IG", "TT"].map((label) => (
              <span
                key={label}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-tn-black-soft text-xs font-black text-tn-white transition-all duration-200 hover:scale-110 hover:bg-tn-red"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 border-t border-tn-white/10 px-4 py-4 text-center text-xs text-tn-white/40 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <span>© {new Date().getFullYear()} Jiboo — Pièces détachées auto en Tunisie.</span>
        <Link
          href="/conditions-generales"
          className="text-tn-white/50 underline decoration-tn-white/20 underline-offset-2 transition-colors duration-200 hover:text-tn-amber"
        >
          Conditions générales de vente
        </Link>
      </div>
    </footer>
  );
}
