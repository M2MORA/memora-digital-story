import envelopeImg from "@/assets/product-envelope.jpg";
import boxLetterImg from "@/assets/product-box-letter.jpg";
import moments from "@/assets/product-moments.jpg";
import box from "@/assets/product-box.jpg";
import hero from "@/assets/hero.jpg";
import scan from "@/assets/scan.jpg";
import { formatTND, Format } from "./pricing";

export type Category = "enveloppe" | "coffret-box" | "classique" | "magnet" | "grand-format" | "gift-card" | "sur-mesure";

export const CATEGORIES: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "Tous les produits" },
  { id: "enveloppe", label: "L'Enveloppe & Carte" },
  { id: "coffret-box", label: "Le Coffret Box & Lettre" },
];

export type Product = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: Category;
  priceTND: number; // TND base price
  price: number; // backward compatibility alias
  formatCode: Format;
  images: string[];
  materials: string[];
  dimensions: string;
  connectivity: ("nfc" | "qr")[];
  occasions: string[];
  style: "minimal" | "classic" | "romantic" | "modern";
  delivery: string;
  badge?: string;
  includedVideoMin: number;
};

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    slug: "memora-simple-enveloppe",
    name: "Mémora Simple (Enveloppe & Carte)",
    tagline: "La photo souvenir avec puce NFC dans son enveloppe d'art et sa carte avec message.",
    description:
      "L'émotion à l'état pur. Un tirage photographique d'art 10×15 cm sur papier noble 300g/m² avec puce invisible. Glissé délicatement dans une élégante enveloppe texturée cachetée, accompagné d'une carte avec votre message personnalisé. Approchez votre smartphone sans aucune application requise : votre vidéo se lance instantanément.",
    category: "enveloppe",
    priceTND: 49,
    price: 49,
    formatCode: "10x15",
    images: [envelopeImg, moments, hero],
    materials: [
      "Tirage photo d'art 300g/m²",
      "Puce NFC invisible intégrée",
      "Enveloppe haut de gamme texturée",
      "Carte avec message simple personnalisé",
    ],
    dimensions: "10 × 15 cm",
    connectivity: ["nfc"],
    occasions: ["love", "family", "special", "birthday", "travel"],
    style: "classic",
    delivery: "Fabrication artisanale en 48h. Livraison soignée en 2 à 3 jours.",
    badge: "L'Essentiel",
    includedVideoMin: 8,
  },
  {
    id: "p2",
    slug: "memora-coffret-box",
    name: "Mémora Coffret (Box, Carte & Lettre)",
    tagline: "Le coffret prestige : tirage photo NFC, boîte cadeau luxueuse, carte et lettre d'émotion.",
    description:
      "L'expérience cadeau ultime et mémorable. Présenté dans un somptueux coffret rigide aux finitions d'exception, découvrez votre tirage photo connecté NFC, une carte souvenir dédiée et une véritable lettre personnalisée rédigée sur papier d'art pour immortaliser vos sentiments. Un déballage unique pour un moment inoubliable.",
    category: "coffret-box",
    priceTND: 89,
    price: 89,
    formatCode: "box",
    images: [boxLetterImg, box, scan],
    materials: [
      "Coffret rigide luxueux à fermeture aimantée",
      "Tirage photo d'art 300g/m² avec puce NFC",
      "Lettre d'émotion rédigée sur papier vergé d'art",
      "Carte souvenir personnalisée",
    ],
    dimensions: "Coffret 14 × 19 cm (Tirage 10 × 15 cm)",
    connectivity: ["nfc"],
    occasions: ["love", "wedding", "birthday", "family", "special"],
    style: "romantic",
    delivery: "Confection artisanale en 48h. Livraison express Aramex en 2 à 3 jours.",
    badge: "Coffret Cadeau Prestige",
    includedVideoMin: 8,
  },
];

export const getProduct = (slugOrId: string) => {
  const found = PRODUCTS.find((p) => p.slug === slugOrId || p.id === slugOrId);
  if (found) return found;
  if (slugOrId.includes("box") || slugOrId.includes("magnet") || slugOrId.includes("encadre") || slugOrId.includes("p2")) {
    return PRODUCTS[1];
  }
  return PRODUCTS[0];
};

export const formatPrice = (n: number) => formatTND(n);

