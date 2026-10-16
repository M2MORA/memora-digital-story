import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  [
    "Délais de fabrication & Expédition",
    "Chaque tirage photo MÉMORA est fabriqué à la demande dans nos ateliers sous 48 heures ouvrées. L'expédition s'effectue sous 3 à 5 jours ouvrés.",
  ],
  [
    "Modes de livraison & Suivi",
    "Nous expédions avec des transporteurs réputés (Aramex et Rapid-Poste) partout en Tunisie. Un lien de suivi par email vous permet de suivre l'acheminement de votre colis en direct.",
  ],
  [
    "Livraison Offerte dès 250 DT",
    "La livraison standard est offerte pour toute commande atteignant ou dépassant 250 DT d'achat TTC.",
  ],
  [
    "Emballage protecteur renforcé",
    "Nos photos, magnets et cadres sont protégés par des étuis cartonnés renforcés et du papier de soie protecteur pour arriver en parfait état.",
  ],
];

export const Route = createFileRoute("/shipping-policy")({
  head: () => ({
    meta: [
      { title: "Livraison & Expédition — MÉMORA" },
      {
        name: "description",
        content: "Délais de fabrication, tarifs d'expédition et livraison offerte dès 250 DT chez MÉMORA.",
      },
      { property: "og:title", content: "Livraison & Expédition — MÉMORA" },
      { property: "og:description", content: "Fabrication soignée en 48h, suivi de colis et expédition protégée." },
    ],
  }),
  component: () => <LegalPage title="Livraison & Expédition" sections={SECTIONS} />,
});
