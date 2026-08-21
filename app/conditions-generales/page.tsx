import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Conditions générales de vente — Jiboo",
  description:
    "Conditions générales de vente de Jiboo : commande, paiement à la livraison, délais de livraison et politique de retour.",
};

const SECTIONS = [
  {
    title: "1. Objet",
    body: [
      "Les présentes conditions générales de vente régissent les relations contractuelles entre Jiboo et toute personne effectuant un achat sur ce site (le « client »). Toute commande passée sur ce site implique l'acceptation pleine et entière de ces conditions.",
    ],
  },
  {
    title: "2. Le vendeur",
    body: [
      "Jiboo est exploité par un vendeur individuel et ne constitue pas, à ce jour, une société enregistrée. Les coordonnées de contact figurent en bas de chaque page du site.",
    ],
  },
  {
    title: "3. Produits et prix",
    body: [
      "Les produits proposés à la vente sont ceux présentés sur le site au jour de la consultation, dans la limite des stocks disponibles. Les prix sont indiqués en dinars tunisiens (DT), toutes taxes comprises lorsque applicable, hors frais de livraison qui sont précisés séparément avant la validation de la commande.",
      "Jiboo se réserve le droit de modifier ses prix à tout moment ; les produits sont facturés sur la base des tarifs en vigueur au moment de la validation de la commande.",
    ],
  },
  {
    title: "4. Commande",
    body: [
      "La commande peut être passée sans création de compte. Le client renseigne son nom, son numéro de téléphone, son adresse de livraison et sélectionne une zone de livraison. La commande est confirmée par l'affichage d'une référence de suivi et, le cas échéant, par un message envoyé via WhatsApp pour validation finale.",
      "Jiboo se réserve le droit d'annuler ou de refuser toute commande en cas de rupture de stock, d'anomalie manifeste ou de suspicion d'abus (voir également la politique de limitation des commandes ci-dessous).",
    ],
  },
  {
    title: "5. Paiement",
    body: [
      "Le paiement s'effectue exclusivement à la livraison (paiement en espèces au livreur, « cash on delivery »). Aucun paiement en ligne n'est requis ni accepté au moment de la commande.",
    ],
  },
  {
    title: "6. Livraison",
    body: [
      "Les délais de livraison sont généralement compris entre 2 et 5 jours ouvrés, selon la zone de livraison sélectionnée. Ces délais sont donnés à titre indicatif et peuvent varier selon la disponibilité du produit et les conditions logistiques.",
      "Les frais de livraison, qui dépendent de la zone choisie, sont affichés avant la validation de la commande et inclus dans le total à payer à la livraison.",
    ],
  },
  {
    title: "7. Retours",
    body: [
      "Les retours sont acceptés dans un délai de 7 jours à compter de la réception de la commande, à condition que le produit n'ait pas été utilisé ou installé et qu'il soit retourné dans son état et son emballage d'origine.",
      "Pour initier un retour, le client contacte Jiboo via les coordonnées indiquées en bas de page en précisant sa référence de commande. Les frais de retour restent à la charge du client, sauf en cas d'erreur ou de défaut imputable à Jiboo.",
    ],
  },
  {
    title: "8. Limitation des commandes",
    body: [
      "Afin de protéger le service contre les abus, un nombre maximal de commandes par numéro de téléphone et par adresse IP peut être appliqué sur une période donnée. Une commande refusée pour ce motif peut être retentée ultérieurement.",
    ],
  },
  {
    title: "9. Responsabilité",
    body: [
      "Jiboo s'efforce de décrire et de présenter les produits avec la plus grande exactitude possible. Les photographies et descriptions sont fournies à titre indicatif et n'engagent pas Jiboo de manière contractuelle en cas d'erreur manifeste.",
    ],
  },
  {
    title: "10. Données personnelles",
    body: [
      "Les informations collectées lors de la commande (nom, téléphone, adresse) sont utilisées exclusivement dans le cadre du traitement et de la livraison de la commande, et ne sont pas transmises à des tiers autres que ceux nécessaires à l'exécution de la livraison.",
    ],
  },
  {
    title: "11. Droit applicable",
    body: [
      "Les présentes conditions générales de vente sont soumises au droit tunisien. Tout litige relatif à leur interprétation ou à leur exécution relève de la compétence des juridictions tunisiennes.",
    ],
  },
];

export default function ConditionsGeneralesPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-tn-offwhite">
        <section className="relative overflow-hidden bg-tn-black pb-20 pt-12 sm:pb-24 sm:pt-16">
          <div className="tn-diagonal-bottom absolute inset-x-0 bottom-0 h-10 bg-tn-offwhite sm:h-14" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="max-w-2xl text-3xl font-black uppercase leading-[1.05] tracking-wide text-tn-white sm:text-4xl lg:text-5xl">
              Conditions <span className="text-tn-amber">générales</span> de{" "}
              <span className="text-tn-red">vente</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm text-tn-white/70 sm:text-base">
              Dernière mise à jour : {new Date().toLocaleDateString("fr-TN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="rounded-2xl border-2 border-tn-black bg-tn-white p-6 shadow-[4px_4px_0_0_var(--tn-black)] sm:p-10">
            <div className="flex flex-col gap-8">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <h2 className="text-base font-black uppercase tracking-wide text-tn-black sm:text-lg">
                    {section.title}
                  </h2>
                  <div className="mt-2 flex flex-col gap-3">
                    {section.body.map((paragraph, i) => (
                      <p key={i} className="text-sm leading-relaxed text-tn-black-soft">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
