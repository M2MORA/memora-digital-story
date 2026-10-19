# 📋 Spécification Technique & Audit Phase 1 — MÉMORA

> **Statut :** Phase 1 préparée — En attente de validation préalable pour exécution des migrations et déploiement  
> **Date :** 18 Octobre 2026  
> **Auteur :** Antigravity Senior Software Architect  

---

## 1. Audit Préalable Obligatoire (Étape 0)

### 1.1 Versions Installées & Environnement
| Composant | Version détectée / installée | Notes & Validation |
| :--- | :--- | :--- |
| **@supabase/supabase-js** | `2.117.3` | Client universel navigateur & SSR |
| **PostgREST** | `12.x` (Supabase Cloud) | Schéma REST, support RPC avec `Prefer: return=representation` |
| **@tanstack/react-start** | `1.168.60` | Framework SSR hybride Edge / Node |
| **@tanstack/react-router**| `1.170.41` | Routage basé sur fichiers avec isolation `/m/*` |
| **nitro** | `3.0.260603-beta` | Générateur du serveur SSR Cloudflare Worker |
| **wrangler** | Non installé en racine | Orchestré via `.wrangler/deploy/config.json` et `.output/server/wrangler.json` (target Cloudflare Workers, `nodejs_compat`, `2026-10-15`) |

### 1.2 Point d'Entrée Serveur & Build Cloudflare
- **Point d'entrée serveur :** `src/server.ts` configuré via `tanstackStart: { server: { entry: "server" } }` dans `vite.config.ts`.
- **Rôle :** Encapsule le handler `import("@tanstack/react-start/server-entry")` et normalise les erreurs silencieuses 500 de `h3` (`unhandled: true, message: "HTTPError"`).
- **Build Nitro :** Produit `.output/server/index.mjs` déployable sur Cloudflare Workers sans dépendance de runtime propriétaire.

### 1.3 Parcours Réels Cart, Checkout & Admin
- **Panier (`src/lib/cart.ts`) :** Magasin externe synchronisé avec `localStorage` (`memora-cart-v2`), supportant les sessions anonymes (`draftId`, `draftToken`), les options de recadrage photo et les allocations multi-destinataires.
- **Tunnel Checkout (`src/routes/commander.tsx`) :** Stepper dynamique 6 étapes (`picker` -> `video` -> `photo` -> `preview` -> `cart` -> `delivery` -> `payment` -> `confirmation`), adapté au marché tunisien avec paiement à la livraison (Cash on Delivery).
- **Portail Admin (`admin/`) :** Dashboard React 19 autonome permettant la supervision en atelier (étalonnage photo standard 10×15 cm à 300 DPI pour tirage d'art, encodage NFC NDEF, mise à jour des statuts).

---

## 2. Corrections des 8 Points Critiques V3.8

### 1. Heartbeat (`src/lib/upload-heartbeat.ts`)
- **Problème résolu :** Risque de requêtes fantômes lors de l'abandon de page ou de fuite de timers.
- **Implémentation :** Classe `UploadHeartbeatManager` avec contrôle d'arrêt explicite (`stop()`), propagation du signal `AbortSignal` vers Supabase / `fetch`, attente effective de la fin du vol actif (`activeFlightPromise`), exclusion stricte des requêtes concurrentes (verrou mono-vol) et repli par backoff exponentiel.

### 2. SHA-256 (`src/lib/crypto-sha256.ts`)
- **Problème résolu :** Dépassement mémoire (OOM) sur mobile lors du calcul de hash de vidéos lourdes (> 100 Mo) et vulnérabilité liée à l'acceptation crédule d'un simple ETag multipart S3 ou de quelques Magic Bytes.
- **Implémentation :** Classe `ProgressiveSha256` et fonction `computeStreamingSha256(file, chunkSize = 2MB)` traitant les flux de données par morceaux constants (< 4 Mo de RAM), certifiée sur les vecteurs de test officiels NIST FIPS 180-4.

### 3. Purge (`supabase/migrations/20261018220000_phase1_upload_intents_and_order_finalization.sql`)
- **Problème résolu :** Risque de suppression destructrice des médias des commandes payées en production lors du nettoyage des uploads inachevés.
- **Implémentation :** La fonction `purge_orphan_upload_intents()` cible **exclusivement** les statuts `pending`, `uploading` ou `cancelled` dont la date `expires_at < now()`. Les intents au statut `consumed` sont rattachés aux commandes et sont protégés de manière absolue contre toute purge automatique d'orphelins.

### 4. Mapping & Unicité (`src/lib/upload-intent-validator.ts`)
- **Problème résolu :** Risque d'attaques par rejeu, réutilisation du même fichier vidéo/photo sur plusieurs articles ou collision de créneaux.
- **Implémentation :** Vérification stricte de l'unicité de chaque `uploadIntentId` dans la commande, unicité du couple `(itemId, fileKind)`, vérification d'appartenance au `draftId`, statut impératif `ready`, et validation des extensions/MIME whitelisted.

### 5. Finalisation Atomique (`finalize_order_with_intents`)
- **Problème résolu :** Incohérences transactionnelles lors de la validation d'une commande (commande créée mais upload non rattaché, ou double consommation concurrente).
- **Implémentation :** Fonction RPC PostgreSQL exécutée en `SECURITY DEFINER` avec verrouillage pessimiste `FOR UPDATE` sur les lignes `upload_intents`. En cas de condition non satisfaite, la transaction entière fait un `ROLLBACK`.

### 6. Scheduler Cron Opérationnel
- **Option Native (PostgreSQL Supabase) :** Extension `pg_cron` intégrée :
  ```sql
  SELECT cron.schedule('memora-purge-orphan-intents', '*/15 * * * *', $$SELECT public.purge_orphan_upload_intents(100);$$);
  ```
- **Option Edge (Cloudflare Workers Cron Triggers) :** Déclenchement périodique via `wrangler.json` :
  ```json
  "triggers": { "crons": ["0 * * * *"] }
  ```
  Appelant le endpoint sécurisé avec `CRON_SECRET` et exécutant `DeleteObjectsCommand` sur R2 pour les clés supprimées en base.

### 7. Streaming HTTP & Range Requests (`src/lib/streaming-handler.ts`)
- **Problème résolu :** Échecs de lecture vidéo sur iOS Safari, comportement erratique de `If-Range` avec ETags faibles, et gestion des plages invalides.
- **Implémentation :** Module `resolveStreamingResponse()` gérant les codes 200 (complet), 206 (partiel) et 416 (Range Not Satisfiable), avec conformité RFC 9110 (exigence de validateur fort pour `If-Range`), et gestion des plages ouvertes (`bytes=900000-`) et suffixes (`bytes=-500`).

### 8. Sécurité SQL & Privilèges
- **Conformité Supabase :**
  - `ENABLE ROW LEVEL SECURITY` sur `public.upload_intents`.
  - Politiques explicites avec clause `TO` (`TO authenticated`, `TO anon, authenticated`).
  - Toutes les fonctions `SECURITY DEFINER` fixent explicitement `SET search_path = public, extensions, pg_temp;`.
  - Révocation globale des droits d'exécution `REVOKE ALL ON FUNCTION ... FROM PUBLIC;`.
  - Droits accordés sélectivement (`service_role` pour la purge, `anon`/`authenticated` pour la création/finalisation).

---

## 3. Matrice des Variables d'Environnement & Secrets

| Variable | Environnement | Visibilité Client | Usage |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Navigateur + SSR | **Oui (Publique)** | Endpoint de l'API Supabase |
| `VITE_SUPABASE_ANON_KEY` | Navigateur + SSR | **Oui (Publique)** | Clé anonyme ou publishable Supabase |
| `VITE_SITE_URL` | Admin / Outils | **Oui (Publique)** | URL racine pour l'écriture des tags NFC (`/m/:slug`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Serveur SSR / Worker UNIQUEMENT** | ❌ **SECRET ABSOLU** | Exécution des tâches de maintenance & purges |
| `R2_ACCOUNT_ID` | **Serveur SSR / Worker UNIQUEMENT** | ❌ **SECRET ABSOLU** | ID de compte Cloudflare pour l'API S3 |
| `R2_ACCESS_KEY_ID` | **Serveur SSR / Worker UNIQUEMENT** | ❌ **SECRET ABSOLU** | Clé d'accès S3 R2 |
| `R2_SECRET_ACCESS_KEY` | **Serveur SSR / Worker UNIQUEMENT** | ❌ **SECRET ABSOLU** | Secret d'accès S3 R2 |
| `R2_BUCKET_NAME` | **Serveur SSR / Worker UNIQUEMENT** | ❌ **Interne** | Nom du bucket (`memora-videos`) |
| `R2_PUBLIC_URL` | Serveur SSR / Worker | ❌ **Interne** | Domaine CDN public (ex: `https://media.memora.tn`) |
| `CRON_SECRET` | **Serveur SSR / Worker UNIQUEMENT** | ❌ **SECRET ABSOLU** | Jeton d'authentification pour les déclencheurs de cron |
