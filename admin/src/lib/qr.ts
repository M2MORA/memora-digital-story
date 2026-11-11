import qrcode from "qrcode-generator";

/**
 * QR code dessiné dans le navigateur : le lien NFC secret n'est envoyé à aucun site externe.
 */
export function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(4, 2);
}
