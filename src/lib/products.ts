import moments from "@/assets/product-moments.jpg";
import box from "@/assets/product-box.jpg";
import hero from "@/assets/hero.jpg";
import scan from "@/assets/scan.jpg";

export type Category = "plaques" | "boxes" | "frames" | "gifts" | "collections";

export const CATEGORIES: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All products" },
  { id: "plaques", label: "Photo plaques" },
  { id: "boxes", label: "Memory boxes" },
  { id: "frames", label: "Digital frames" },
  { id: "gifts", label: "Personalized gifts" },
  { id: "collections", label: "Collections" },
];

export type Product = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: Category;
  price: number; // TND
  images: string[];
  materials: string[];
  dimensions: string;
  connectivity: ("nfc" | "qr")[];
  occasions: string[];
  style: "minimal" | "classic" | "romantic" | "modern";
  delivery: string;
};

// Demonstration catalogue — prices and content are editable by the administrator.
export const PRODUCTS: Product[] = [
  {
    id: "p1",
    slug: "memora-moments",
    name: "MÉMORA Moments",
    tagline: "A single moment, held in oak and glass.",
    description:
      "A floating glass photo plaque set in solid oak. A discreet engraved code opens a private digital page with the photos, videos and words behind the picture.",
    category: "plaques",
    price: 129,
    images: [moments, hero],
    materials: ["Solid oak", "Tempered glass"],
    dimensions: "20 × 25 cm",
    connectivity: ["nfc", "qr"],
    occasions: ["love", "family", "special"],
    style: "minimal",
    delivery: "Crafted in 5–7 days. Delivery across Tunisia in 2–3 days.",
  },
  {
    id: "p2",
    slug: "memora-box",
    name: "MÉMORA Box",
    tagline: "Printed photographs, a sealed letter, a story inside.",
    description:
      "A hand-wrapped leather keepsake box with twelve archival prints, a wax-sealed personal letter and a linen card linked to your digital memory.",
    category: "boxes",
    price: 189,
    images: [box, hero],
    materials: ["Vegan leather", "Archival paper", "Linen"],
    dimensions: "28 × 18 × 6 cm",
    connectivity: ["nfc", "qr"],
    occasions: ["love", "birthday", "wedding"],
    style: "romantic",
    delivery: "Crafted in 6–8 days. Delivery across Tunisia in 2–3 days.",
  },
  {
    id: "p3",
    slug: "memora-stories",
    name: "MÉMORA Stories",
    tagline: "A family album that keeps speaking.",
    description:
      "A linen-bound album of your chosen chapters, each page linked to voice messages, videos and letters through a single elegant code.",
    category: "collections",
    price: 249,
    images: [hero, box],
    materials: ["Linen cover", "Matte archival paper"],
    dimensions: "24 × 30 cm, 40 pages",
    connectivity: ["qr"],
    occasions: ["family", "travel", "wedding"],
    style: "classic",
    delivery: "Crafted in 8–10 days. Delivery across Tunisia in 2–3 days.",
  },
  {
    id: "p4",
    slug: "memora-living",
    name: "MÉMORA Living",
    tagline: "A frame for the home, a doorway to every memory.",
    description:
      "An ivory frame with an integrated NFC tag. Tap a phone to open a living gallery that your family can keep adding to over the years.",
    category: "frames",
    price: 219,
    images: [scan, moments],
    materials: ["Lacquered wood", "Brass trim"],
    dimensions: "30 × 24 cm",
    connectivity: ["nfc", "qr"],
    occasions: ["family", "special", "birthday"],
    style: "modern",
    delivery: "Crafted in 5–7 days. Delivery across Tunisia in 2–3 days.",
  },
  {
    id: "p5",
    slug: "memora-letter",
    name: "MÉMORA Letter",
    tagline: "Words you can hold, a voice you can hear.",
    description:
      "A letterpress card on cotton paper with a printed code linking to your recorded voice message.",
    category: "gifts",
    price: 49,
    images: [hero, box],
    materials: ["Cotton paper"],
    dimensions: "A5",
    connectivity: ["qr"],
    occasions: ["love", "birthday", "special"],
    style: "romantic",
    delivery: "Crafted in 3 days. Delivery across Tunisia in 2–3 days.",
  },
  {
    id: "p6",
    slug: "memora-voyage",
    name: "MÉMORA Voyage",
    tagline: "Every journey, mapped and remembered.",
    description:
      "An engraved oak plaque for travellers, opening a timeline of places, photos and notes from the road.",
    category: "plaques",
    price: 149,
    images: [moments, scan],
    materials: ["Solid oak"],
    dimensions: "15 × 20 cm",
    connectivity: ["nfc", "qr"],
    occasions: ["travel", "special"],
    style: "minimal",
    delivery: "Crafted in 5–7 days. Delivery across Tunisia in 2–3 days.",
  },
];

export const getProduct = (slugOrId: string) =>
  PRODUCTS.find((p) => p.slug === slugOrId || p.id === slugOrId);

export const formatPrice = (n: number) => `${n.toLocaleString("fr-TN")} TND`;
