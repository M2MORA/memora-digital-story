/**
 * Impression : photo en PDF 10 × 15 cm prêt à imprimer, et QR code 3 × 3 cm.
 * Aucun service externe, aucune dépendance : le PDF est écrit à la main.
 */

const CM_TO_PT = 72 / 2.54;
const PRINT_DPI = 300;
const PX_PER_CM = PRINT_DPI / 2.54;

/** Taille du tirage selon l'orientation de la photo, en centimètres. */
export function printSizeCm(widthPx: number, heightPx: number) {
  return widthPx > heightPx ? { w: 15, h: 10 } : { w: 10, h: 15 };
}

/**
 * Écrit un PDF d'une page contenant une image JPEG qui remplit toute la page.
 * Le JPEG est inséré tel quel (filtre DCTDecode), sans recompression.
 */
export function buildJpegPdf(jpeg: Uint8Array, imgW: number, imgH: number, pageWcm: number, pageHcm: number): Uint8Array {
  const W = (pageWcm * CM_TO_PT).toFixed(2);
  const H = (pageHcm * CM_TO_PT).toFixed(2);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);

  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");

  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const xref = length;
  let table = "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("La photo n'a pas pu être chargée."));
    img.src = url;
  });
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

/**
 * Télécharge la photo en PDF 10 × 15 cm (15 × 10 si paysage), 300 dpi, sans marge.
 * La photo est déjà recadrée par le client : elle remplit la page, centrée.
 */
export async function downloadPhotoPdf(url: string, filename: string): Promise<void> {
  const img = await loadImage(url);
  const size = printSizeCm(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size.w * PX_PER_CM);
  canvas.height = Math.round(size.h * PX_PER_CM);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Ton navigateur ne peut pas préparer le PDF.");

  const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("Ton navigateur ne peut pas préparer le PDF.");
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = buildJpegPdf(jpeg, canvas.width, canvas.height, size.w, size.h);
  saveBlob(new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" }), filename);
}

/** Ouvre l'impression du navigateur sur une page HTML isolée (iframe invisible). */
function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Impression indisponible dans ce navigateur.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  const img = doc.querySelector("img");
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  if (img && !img.complete) img.onload = go;
  else go();
}

const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Imprime le QR code seul, 3 × 3 cm, centré sur la page. */
export function printQr(dataUrl: string): void {
  printHtml(
    `<!doctype html><html><head><title>QR code</title><style>` +
      `@page{margin:1cm}html,body{margin:0;height:100%}` +
      `body{display:flex;align-items:center;justify-content:center}` +
      `img{width:3cm;height:3cm;image-rendering:pixelated}` +
      `</style></head><body><img src="${escapeAttr(dataUrl)}" alt=""></body></html>`,
  );
}

/**
 * Impression de la photo sur une page exacte de 10 × 15 cm, sans marge.
 * Sert quand le PDF ne peut pas être fabriqué (stockage sans règle CORS) :
 * la fenêtre d'impression permet d'imprimer directement ou d'enregistrer en PDF.
 */
export async function printPhoto(url: string): Promise<void> {
  const probe = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("La photo n'a pas pu être chargée."));
    img.src = url;
  });
  const size = printSizeCm(probe.naturalWidth, probe.naturalHeight);
  printHtml(
    `<!doctype html><html><head><title>Photo ${size.w}x${size.h}</title><style>` +
      `@page{size:${size.w}cm ${size.h}cm;margin:0}html,body{margin:0}` +
      `img{display:block;width:${size.w}cm;height:${size.h}cm;object-fit:cover}` +
      `</style></head><body><img src="${escapeAttr(url)}" alt=""></body></html>`,
  );
}
