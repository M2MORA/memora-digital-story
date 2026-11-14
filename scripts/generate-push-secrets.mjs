// Génère les secrets des notifications push de l'admin. Aucune dépendance : node scripts/generate-push-secrets.mjs
//
// Les valeurs s'affichent une seule fois dans le terminal. Ne les colle ni dans un fichier du dépôt,
// ni dans un message : seulement dans les variables d'environnement du site (Vercel).
import { generateKeyPairSync, randomBytes } from "node:crypto";

const b64u = (buffer) => Buffer.from(buffer).toString("base64url");

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });

// Clé publique VAPID = point non compressé : 0x04 || x || y (65 octets)
const publicKeyBytes = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);

console.log("Variables à créer sur Vercel (projet du site), environnement Production :\n");
console.log(`VAPID_PUBLIC_KEY=${b64u(publicKeyBytes)}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log("VAPID_SUBJECT=mailto:contact@memora.tn   (remplace par ton adresse)");
console.log(`ORDER_WEBHOOK_SECRET=${b64u(randomBytes(32))}`);
console.log("\nPuis, dans le SQL Editor de Supabase (même valeur pour ORDER_WEBHOOK_SECRET) :\n");
console.log("insert into public.admin_push_config (id, webhook_url, webhook_secret)");
console.log("values (1, 'https://www.memora.tn/api/internal/order-created', '<ORDER_WEBHOOK_SECRET>')");
console.log("on conflict (id) do update set webhook_url = excluded.webhook_url, webhook_secret = excluded.webhook_secret;");
