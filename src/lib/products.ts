import envelopeImg from "@/assets/product-envelope-v2.jpg";
import moments from "@/assets/product-moments-v2.jpg";
import hero from "@/assets/hero-v2.jpg";
import { formatTND, Format } from "./pricing";

export type Category = "enveloppe";

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
    delivery: "Fabriqué en 48 h, puis livré en 3 à 5 jours ouvrés partout en Tunisie.",
    badge: "L'Essentiel",
    includedVideoMin: 8,
  },
];

export const getProduct = (slugOrId: string) => {
  const found = PRODUCTS.find((p) => p.slug === slugOrId || p.id === slugOrId);
  return found ?? PRODUCTS[0]!;
};

export const formatPrice = (n: number) => formatTND(n);
