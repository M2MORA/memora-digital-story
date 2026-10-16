import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  [
    "Données collectées",
    "Nous collectons uniquement les informations nécessaires au traitement de vos commandes (coordonnées de livraison, adresse email) ainsi que les fichiers photos et vidéos que vous choisissez de téléverser.",
  ],
  [
    "Hébergement & Sécurité des vidéos",
    "Vos souvenirs vidéo sont hébergés sur des serveurs sécurisés sécurisés. Ils sont protégés contre tout accès non autorisé et ne sont jamais indexés publiquement sur les moteurs de recherche.",
  ],
  [
    "Utilisation de vos données",
    "Vos visuels sont exclusivement utilisés pour programmer la puce NFC de votre tirage et assurer la lecture en streaming de votre souvenir. Nous ne vendons, ne louons et ne partageons jamais vos données personnelles ou souvenirs à des tiers.",
  ],
  [
    "Vos droits (RGPD)",
    "Conformément à la loi organique tunisienne n° 2004-63 relative à la protection des données personnelles, vous disposez d'un droit d'accès, de rectification et de suppression totale de vos données et vidéos à tout moment sur simple demande à bonjour@memora.tn.",
  ],
];

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Politique de Confidentialité — MÉMORA" },
      {
        name: "description",
        content: "Découvrez comment MÉMORA protège et sécurise vos données personnelles et vos souvenirs vidéo.",
      },
      { property: "og:title", content: "Politique de Confidentialité — MÉMORA" },
      { property: "og:description", content: "Sécurité, respect de la vie privée et hébergement sécurisé." },
    ],
  }),
  component: () => <LegalPage title="Politique de Confidentialité" sections={SECTIONS} />,
});
