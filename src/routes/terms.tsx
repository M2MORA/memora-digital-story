import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  [
    "Objet & Champ d'application",
    "Les présentes Conditions Générales de Vente (CGV) régissent l'ensemble des commandes passées sur le site MÉMORA pour l'achat de tirages photographiques connectés intégrant une puce NFC.",
  ],
  [
    "Propriété de vos contenus",
    "Vous conservez l'entière et exclusive propriété de vos photos et vidéos. En passant commande, vous nous concédez uniquement les droits techniques nécessaires à l'impression et à l'encodage de la puce NFC.",
  ],
  [
    "Tarifs & Modalités de paiement",
    "Les prix sont indiqués en dinars tunisiens (DT) TTC. Les réductions dégressives s'appliquent automatiquement en fonction du nombre d'exemplaires dans le panier. Le paiement s'effectue par carte bancaire sécurisée ou en espèces à la livraison.",
  ],
  [
    "Garantie de fonctionnement NFC",
    "Chaque tirage fait l'objet d'un contrôle qualité individuel avant expédition pour vérifier la lisibilité de la puce NFC sur smartphones récents (iPhone XS+ et Android NFC).",
  ],
];

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Conditions Générales de Vente (CGV) — MÉMORA" },
      {
        name: "description",
        content: "Conditions générales de vente et d'utilisation du service MÉMORA.",
      },
      { property: "og:title", content: "CGV — MÉMORA" },
      { property: "og:description", content: "Conditions générales de vente applicables aux commandes MÉMORA." },
    ],
  }),
  component: () => <LegalPage title="Conditions Générales de Vente" sections={SECTIONS} />,
});
