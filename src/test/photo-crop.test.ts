import { describe, expect, it } from "vitest";
import {
  cardSize,
  defaultCrop,
  MAX_ZOOM,
  panCrop,
  placePhoto,
  withOrientation,
  withZoom,
  type PhotoCrop,
} from "@/lib/photo-crop";

const landscapeCard = cardSize("landscape", 300); // 300 × 200
const portraitCard = cardSize("portrait", 300); // 200 × 300

describe("photo-crop — recadrage de la carte 15 × 10", () => {
  it("choisit l'orientation de la carte selon la photo", () => {
    expect(defaultCrop({ width: 4000, height: 3000 }).orientation).toBe("landscape");
    expect(defaultCrop({ width: 3000, height: 4000 }).orientation).toBe("portrait");
    expect(defaultCrop({ width: 1000, height: 1000 }).orientation).toBe("landscape");
  });

  it("garde le ratio 3:2 de la carte", () => {
    expect(landscapeCard).toEqual({ width: 300, height: 200 });
    expect(portraitCard).toEqual({ width: 200, height: 300 });
  });

  it("couvre toute la carte et centre la photo par défaut", () => {
    const natural = { width: 400, height: 400 };
    const p = placePhoto(natural, landscapeCard, defaultCrop(natural));
    expect(p.width).toBe(300);
    expect(p.height).toBe(300);
    expect(p.x).toBe(0);
    expect(p.y).toBe(-50);
  });

  it("une photo paysage dans une carte portrait déborde sur les côtés", () => {
    const natural = { width: 600, height: 400 };
    const crop: PhotoCrop = { orientation: "portrait", zoom: 1, offsetX: 0, offsetY: 0 };
    const p = placePhoto(natural, portraitCard, crop);
    expect(p.height).toBe(300);
    expect(p.width).toBe(450);
    expect(p.x).toBe(-125);
    expect(p.y).toBe(0);
  });

  it("les décalages extrêmes montrent exactement un bord, jamais du vide", () => {
    const natural = { width: 600, height: 400 };
    const base: PhotoCrop = { orientation: "portrait", zoom: 1, offsetX: 1, offsetY: 0 };
    expect(placePhoto(natural, portraitCard, base).x).toBe(0);
    const right = placePhoto(natural, portraitCard, { ...base, offsetX: -1 });
    expect(right.x + right.width).toBe(portraitCard.width);
    // Valeurs hors limites ramenées dans [-1, 1]
    expect(placePhoto(natural, portraitCard, { ...base, offsetX: 5 }).x).toBe(0);
  });

  it("le zoom agrandit la photo et reste borné", () => {
    const natural = { width: 300, height: 200 };
    const zoomed = placePhoto(natural, landscapeCard, { ...defaultCrop(natural), zoom: 1.5 });
    expect(zoomed.width).toBe(450);
    expect(zoomed.x).toBe(-75);
    expect(withZoom(defaultCrop(natural), 9).zoom).toBe(MAX_ZOOM);
    expect(withZoom(defaultCrop(natural), 0.2).zoom).toBe(1);
  });

  it("glisser déplace la photo dans la marge disponible puis s'arrête au bord", () => {
    const natural = { width: 600, height: 400 };
    const crop: PhotoCrop = { orientation: "portrait", zoom: 1, offsetX: 0, offsetY: 0 };
    // Marge de 125 px de chaque côté : glisser de 62,5 px = moitié du chemin
    const half = panCrop(crop, natural, portraitCard, 62.5, 40);
    expect(half.offsetX).toBeCloseTo(0.5);
    // Pas de marge verticale : la photo ne bouge pas en hauteur
    expect(half.offsetY).toBe(0);
    expect(panCrop(half, natural, portraitCard, 1000, 0).offsetX).toBe(1);
    expect(panCrop(half, natural, portraitCard, -1000, 0).offsetX).toBe(-1);
  });

  it("changer d'orientation recentre la photo et garde le zoom", () => {
    const crop: PhotoCrop = { orientation: "landscape", zoom: 1.4, offsetX: 0.7, offsetY: -0.3 };
    expect(withOrientation(crop, "portrait")).toEqual({
      orientation: "portrait",
      zoom: 1.4,
      offsetX: 0,
      offsetY: 0,
    });
  });
});
