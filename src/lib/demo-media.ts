/**
 * Médias de la démo publique (« Tester la démo »), servis depuis R2 via /api/media.
 *
 * Ils proviennent d'une commande de test. Ne pas supprimer ces deux fichiers R2
 * lors du nettoyage des données de test, sinon la démo affichera une erreur.
 */
const DEMO_DRAFT = "staging/dft_2d36fae3bcc38519ff3f4a33ec8441b9";

export const DEMO_VIDEO_URL = `/api/media?key=${encodeURIComponent(
  `${DEMO_DRAFT}/311b85ab-5f24-4555-b697-76b4898e19cb.mp4`,
)}`;

export const DEMO_PHOTO_URL = `/api/media?key=${encodeURIComponent(
  `${DEMO_DRAFT}/91132057-a0a8-4c89-b756-87ac779d2438.jpg`,
)}`;
