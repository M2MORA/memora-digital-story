import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  [
    "Produits sur-mesure & Droit de rétractation",
    "Conformément à la législation tunisienne relative à la protection du consommateur, le droit de rétractation ne s'applique pas aux objets confectionnés selon les spécifications du consommateur ou nettement personnalisés (tirages avec vos propres photos et vidéos).",
  ],
  [
    "Garantie 100% Satisfaction & Remplacement sans frais",
    "Si votre tirage présente le moindre défaut d'impression, une puce NFC défectueuse ou un dommage survenu pendant le transport, contactez-nous sous 14 jours avec une photo du problème à bonjour@memora.tn : nous réimprimerons et réexpédierons votre pièce gratuitement et en priorité.",
  ],
  [
    "Cartes Cadeaux",
    "Les cartes cadeaux Mémora sont valables 12 mois à compter de leur date d'émission et ne sont ni échangeables ni remboursables une fois activées.",
  ],
];

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Garantie & Retours — MÉMORA" },
      {
        name: "description",
        content: "Garantie de qualité, remplacement sans frais en cas de défaut et politique de retours MÉMORA.",
      },
      { property: "og:title", content: "Garantie & Retours — MÉMORA" },
      { property: "og:description", content: "Garantie satisfaction et assistance client personnalisée." },
    ],
  }),
  component: () => <LegalPage title="Garantie & Retours" sections={SECTIONS} />,
});
