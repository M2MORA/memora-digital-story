/**
 * Transforme un média enregistré pour un souvenir en adresse lisible par le téléphone.
 *
 * Les fichiers privés passent par /api/media, qui redirige vers un lien R2 signé :
 * la vidéo est servie directement par R2, sans transiter par Vercel. L'origine
 * enregistrée est ignorée, car elle peut être celle de l'admin (ex. localhost).
 */
export function resolveMemoryMediaSrc(stored: string): string {
  if (stored.startsWith("/")) return stored;

  if (!/^https?:\/\//i.test(stored)) {
    return `/api/media?key=${encodeURIComponent(stored)}`;
  }

  try {
    const url = new URL(stored);
    if (url.pathname === "/api/media") {
      return `/api/media${url.search}`;
    }
  } catch {
    // Adresse invalide : renvoyée telle quelle, le lecteur affichera son état d'erreur
  }

  return stored;
}
