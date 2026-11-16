/**
 * Comparaison cryptographique sécurisée (Double-HMAC via Web Crypto API standard).
 * Utilise une clé éphémère pour générer un HMAC de chaque chaîne avant vérification.
 * Garantit la non-divulgation de la longueur de la chaîne secrète et s'exécute dans
 * le moteur cryptographique natif (BoringSSL/OpenSSL).
 */
export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);

  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sigA = await crypto.subtle.sign("HMAC", key, aBytes);
  return await crypto.subtle.verify("HMAC", key, sigA, bBytes);
}

/**
 * Calcul SHA-256 hexadécimal UTF-8 (strictement équivalent à public.memora_sha256).
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const buf = await crypto.subtle.digest("SHA-256", bytes as any);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
