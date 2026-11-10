// Recadrage de la photo imprimée sur la carte 15 × 10 cm.
// Les calculs sont purs (testés) ; le rendu canvas sert à produire le fichier envoyé à l'impression.

export type CardOrientation = "landscape" | "portrait";

export interface PhotoCrop {
  orientation: CardOrientation;
  /** 1 = la photo couvre juste la carte, 2 = zoom × 2 */
  zoom: number;
  /** Position dans la marge disponible : -1 (bord gauche/haut visible) à 1, 0 = centrée */
  offsetX: number;
  offsetY: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement extends Size {
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 2;
/** Carte 15 × 10 cm à 300 dpi */
export const PRINT_LONG_SIDE_PX = 1800;
/** Vignette légère pour le panier (gardée dans le localStorage) */
export const THUMB_LONG_SIDE_PX = 480;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function defaultCrop(natural: Size): PhotoCrop {
  return {
    orientation: natural.width >= natural.height ? "landscape" : "portrait",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

/** Taille de la carte (ratio 3:2) pour un grand côté donné */
export function cardSize(orientation: CardOrientation, longSide: number): Size {
  const shortSide = (longSide * 2) / 3;
  return orientation === "landscape"
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
}

/** Où dessiner la photo dans la carte : elle la couvre toujours entièrement */
export function placePhoto(natural: Size, box: Size, crop: PhotoCrop): Placement {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  const cover = Math.max(box.width / natural.width, box.height / natural.height);
  const width = natural.width * cover * zoom;
  const height = natural.height * cover * zoom;
  const spareX = (width - box.width) / 2;
  const spareY = (height - box.height) / 2;

  return {
    x: -spareX + clamp(crop.offsetX, -1, 1) * spareX,
    y: -spareY + clamp(crop.offsetY, -1, 1) * spareY,
    width,
    height,
  };
}

/** Déplace la photo du nombre de pixels glissés à l'écran, sans jamais laisser de bord vide */
export function panCrop(
  crop: PhotoCrop,
  natural: Size,
  box: Size,
  dx: number,
  dy: number,
): PhotoCrop {
  const placement = placePhoto(natural, box, crop);
  const spareX = (placement.width - box.width) / 2;
  const spareY = (placement.height - box.height) / 2;

  return {
    ...crop,
    offsetX: spareX > 0 ? clamp(crop.offsetX + dx / spareX, -1, 1) : 0,
    offsetY: spareY > 0 ? clamp(crop.offsetY + dy / spareY, -1, 1) : 0,
  };
}

export function withOrientation(crop: PhotoCrop, orientation: CardOrientation): PhotoCrop {
  return { ...crop, orientation, offsetX: 0, offsetY: 0 };
}

export function withZoom(crop: PhotoCrop, zoom: number): PhotoCrop {
  return { ...crop, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) };
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de lire cette photo."));
    img.src = url;
  });
}

function drawCrop(img: HTMLImageElement, crop: PhotoCrop, longSide: number): HTMLCanvasElement {
  const size = cardSize(crop.orientation, longSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size.width);
  canvas.height = Math.round(size.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Le recadrage n'est pas disponible sur ce navigateur.");

  const natural = { width: img.naturalWidth, height: img.naturalHeight };
  const p = placePhoto(natural, { width: canvas.width, height: canvas.height }, crop);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, p.x, p.y, p.width, p.height);
  return canvas;
}

/** Fichier JPEG de la carte telle que le client l'a cadrée (envoyé à l'impression) et sa vignette */
export async function renderCroppedPhoto(
  photoUrl: string,
  crop: PhotoCrop,
  fileName: string,
): Promise<{ file: File; thumbUrl: string }> {
  const img = await loadImage(photoUrl);
  const printCanvas = drawCrop(img, crop, PRINT_LONG_SIDE_PX);
  const blob = await new Promise<Blob>((resolve, reject) => {
    printCanvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("La photo n'a pas pu être préparée.")),
      "image/jpeg",
      0.92,
    );
  });
  const thumbUrl = drawCrop(img, crop, THUMB_LONG_SIDE_PX).toDataURL("image/jpeg", 0.82);
  return { file: new File([blob], fileName, { type: "image/jpeg" }), thumbUrl };
}
