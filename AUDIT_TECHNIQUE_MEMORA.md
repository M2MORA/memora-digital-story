# 📋 Audit Technique Complet du Projet MÉMORA

> **Document de Référence pour Architecture & Intégration Cloudflare R2**  
> **Date de réalisation :** Octobre 2026  
> **Auteur :** Antigravity Senior Software Architect  
> **Projet :** MÉMORA — Souvenirs Digitaux & Objets Connectés (NFC / QR)  
> **Format :** Prêt à être transmis à ChatGPT / Claude / Équipe Technique  

---

## 📑 Sommaire
1. [Vue d'Ensemble & Contexte Métier](#1-vue-densemble--contexte-métier)
2. [Audit Détaillé de l'Existant (10 Points Clés)](#2-audit-détaillé-de-lexistant-10-points-clés)
   - [2.1 Frontend & Architecture Client](#21-frontend--architecture-client)
   - [2.2 Backend & Architecture API](#22-backend--architecture-api)
   - [2.3 Base de Données & Modèles de Données](#23-base-de-données--modèles-de-données)
   - [2.4 Système d'Authentification](#24-système-dauthentification)
   - [2.5 Création & Gestion des Souvenirs (Memories)](#25-création--gestion-des-souvenirs-memories)
   - [2.6 Téléversement & Stockage Actuel des Médias](#26-téléversement--stockage-actuel-des-médias)
   - [2.7 URLs & Fonctionnement des Puces NFC / QR](#27-urls--fonctionnement-des-puces-nfc--qr)
   - [2.8 Interfaces Client vs Portail Administrateur](#28-interfaces-client-vs-portail-administrateur)
   - [2.9 Déploiement & Variables d'Environnement](#29-déploiement--variables-denvironnement)
   - [2.10 Limitations Actuelles de Sécurité & de Coût](#210-limitations-actuelles-de-sécurité--de-coût)
3. [Cycle de Vie & Flux Opérationnels](#3-cycle-de-vie--flux-opérationnels)
   - [Flux 1 : Création d'une commande par le client](#flux-1--création-dune-commande-par-le-client)
   - [Flux 2 : Traitement en atelier, encodage NFC & création du souvenir](#flux-2--traitement-en-atelier-encodage-nfc--création-du-souvenir)
   - [Flux 3 : Consultation immersive via NFC / QR par le destinataire](#flux-3--consultation-immersive-via-nfc--qr-par-le-destinataire)
4. [Pourquoi Intégrer Cloudflare R2 ? (Analyse Comparative)](#4-pourquoi-intégrer-cloudflare-r2--analyse-comparative)
5. [Stratégie d'Intégration Propre de Cloudflare R2 (Zéro Régression)](#5-stratégie-dintégration-propre-de-cloudflare-r2-zéro-régression)
   - [5.1 Architecture Cible](#51-architecture-cible)
   - [5.2 Roadmap d'Implémentation Étape par Étape](#52-roadmap-dimplémentation-étape-par-étape)
6. [Guide de Prompting pour ChatGPT](#6-guide-de-prompting-pour-chatgpt)

---

## 1. Vue d'Ensemble & Contexte Métier

**MÉMORA** est une solution e-commerce et technologique tunisienne combinant un **objet physique premium** (carte imprimée avec cadre photo 10x15, boîte cadeau) et une **capsule temporelle numérique** accessible via puce sans contact **NFC (NTAG213/215)** et **QR code**.

### Le problème adressé par l'intégration R2 :
Actuellement, les vidéos et photos des clients sont envoyées vers **Supabase Storage**. Pour un service vidéo avec des fichiers HD/4K (50 Mo à 500+ Mo par souvenir) et de multiples lectures lors de scans NFC, Supabase Storage pose deux freins majeurs :
1. **Frais d'egress prohibitifs** : Supabase facture la bande passante sortante au-delà du quota de base.
2. **Quotas d'upload et scalabilité** : Le streaming direct depuis Supabase Storage n'est pas optimisé pour un trafic mondial ou un grand volume de streaming vidéo continu.
3. **Cloudflare R2** offre **0 $ de frais de bande passante sortante (Zéro Egress Fees)**, une compatibilité totale avec l'API S3 et une intégration native au CDN mondial Cloudflare.

---

## 2. Audit Détaillé de l'Existant (10 Points Clés)

### 2.1 Frontend & Architecture Client
- **Framework & Runtime :** React 19 (`react@^19.0.0`, `react-dom@^19.0.0`), TypeScript, Vite 8.
- **Framework Full-Stack / SSR :** TanStack Start (`@tanstack/react-start`) avec TanStack Router (`@tanstack/react-router`).
- **Styles & UI :** Tailwind CSS (`tailwindcss@^3.4.17`), Tailwind Merge, Lucide React, Framer Motion.
- **Routage basé sur les fichiers (`src/routes/`) :**
  - `src/routes/__root.tsx` : Layout racine. Il contient une détection intelligente :
    ```typescript
    const isMemoryPage = location.pathname.startsWith('/m/')
    ```
    Si l'URL commence par `/m/`, **toute la navigation du site (Navbar, Footer, Cart Drawer, Banner) est masquée** pour garantir une expérience 100% immersive au destinataire.
  - `src/routes/index.tsx` : Page d'accueil (Hero, Démo interactive, Produits phares, Avis).
  - `src/routes/create.$productId.tsx` : Studio de personnalisation client (import vidéo, découpe/trimmer, lettre personnalisée, audio de fond, recadrage photo 10x15 et templates).
  - `src/routes/commander.tsx` : Tunnel de commande adapté au marché tunisien (Cash On Delivery / Paiement à la livraison, 24 gouvernorats tunisiens, validation téléphone à 8 chiffres).
  - `src/routes/m.$memorySlug.tsx` : Lecteur autonome de souvenir pour puce NFC/QR.
  - `src/routes/catalogue.tsx` : Catalogue produit.
  - `src/routes/suivi.tsx` : Suivi d'expédition de commande.

### 2.2 Backend & Architecture API
L'application possède une architecture hybride :
1. **Coupe Edge / SSR :** TanStack Start compilé avec Nitro pour **Cloudflare Workers** (fichiers `.wrangler/deploy/config.json`, `.output/server/wrangler.json`, `src/server.ts`).
2. **BaaS (Backend as a Service) :** **Supabase** (PostgreSQL managé, Storage S3-compatible, Authentification GoTrue).
3. **Appels API :**
   - Le frontend web appelle directement le SDK client Supabase (`@supabase/supabase-js`) via `src/lib/supabase.ts`.
   - Le portail d'administration possède son propre client Supabase dans `admin/src/lib/supabase.ts`.

### 2.3 Base de Données & Modèles de Données
La base PostgreSQL est définie dans `supabase/schema.sql` et complétée par `supabase/admin.sql`.

#### Table 1 : `public.orders` (Commandes)
```sql
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    governorate TEXT NOT NULL,
    address TEXT NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    shipping_cost NUMERIC(10, 2) DEFAULT 7.00,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'manufacturing', 'shipped', 'delivered', 'cancelled')),
    payment_method TEXT DEFAULT 'cod',
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Contient les articles du panier avec video_url, photo_url, note, options
    notes TEXT
);
```

#### Table 2 : `public.memories` (Souvenirs liés aux puces NFC)
```sql
CREATE TABLE public.memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    slug TEXT UNIQUE NOT NULL,             -- Identifiant NFC (ex: "mariage-sarah-mehdi")
    title TEXT NOT NULL,                   -- Titre affiché sur le lecteur
    video_url TEXT NOT NULL,               -- URL publique de la vidéo (MP4/HLS)
    audio_url TEXT,                        -- URL piste audio optionnelle
    cover_image_url TEXT,                  -- URL de la photo de couverture
    written_note TEXT,                     -- Lettre/message d'accompagnement
    pin_code TEXT,                         -- Code PIN optionnel de protection (ex: "1234")
    view_count INTEGER DEFAULT 0,          -- Nombre de scans NFC
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);
```

### 2.4 Système d'Authentification
- **Côté Client :** **Aucune authentification requise** (Guest Checkout). Les clients passent commande sans créer de compte pour maximiser le taux de conversion en Tunisie.
- **Côté Admin :** Authentification via Supabase Auth (`supabase.auth.signInWithPassword`). Le contrôle d'accès vérifie les métadonnées de rôle :
  ```typescript
  user.app_metadata.role === 'admin'
  ```
- **Politiques de Sécurité RLS (Row Level Security) :**
  - `orders` : `INSERT` public ouvert aux clients anonymes ; `SELECT`, `UPDATE`, `DELETE` strictement réservés aux admins authentifiés.
  - `memories` : `SELECT` public basé sur le `slug` ; `INSERT`, `UPDATE`, `DELETE` restreints aux admins.

### 2.5 Création & Gestion des Souvenirs (Memories)
Le processus est volontairement scindé en deux temps :
1. **Temps 1 (Client - `/create/:productId` + `/commander`) :** Le client téléverse sa vidéo et sa photo. Les métadonnées et URLs sont sauvegardées dans le champ `items` (JSONB) de la commande `orders`.
2. **Temps 2 (Admin - `admin/src/components/OrdersList.tsx` + `MemoryModal.tsx`) :**
   - L'artisan en atelier valide l'impression photo 10x15.
   - L'admin ouvre la commande, clique sur **"Créer la capsule NFC"**, renseigne un `slug` unique (généré automatiquement ou personnalisé).
   - L'enregistrement est inséré dans `public.memories`.
   - L'artisan prend la puce NFC physique, l'approche de son encodeur (NFC Tools / ACR122U) et écrit l'URL `https://memora.tn/m/[slug]`.

### 2.6 Téléversement & Stockage Actuel des Médias
Actuellement localisé dans `src/lib/supabase.ts` et `admin/src/lib/supabase.ts` :
- **Fonctions existantes :**
  - `uploadVideo(file, onProgress)` : Téléverse le fichier dans le bucket Supabase `videos` avec support de reprises (TUS protocol ou standard upload multipart).
  - `uploadPhoto(file)` : Téléverse dans le bucket Supabase `photos`.
  - Récupération de l'URL publique :
    ```typescript
    supabase.storage.from('videos').getPublicUrl(filePath).data.publicUrl
    ```
- **Buckets Supabase :** `videos` et `photos` configurés en accès public.

### 2.7 URLs & Fonctionnement des Puces NFC / QR
- **Puce physique :** NTAG213 (144 octets) ou NTAG215 (504 octets), ou QR code vectoriel gravé au laser / imprimé au dos.
- **Payload NDEF :** Enregistrement URI standard `https://memora.tn/m/:memorySlug`.
- **Composant de lecture :** `src/routes/m.$memorySlug.tsx`.
- **Comportement au scan :**
  1. Le smartphone (iOS ou Android) lit la puce et ouvre le navigateur par défaut.
  2. Le routeur charge `m.$memorySlug.tsx` sans header ni footer.
  3. La fonction `loader` interroge Supabase :
     ```typescript
     supabase.from('memories').select('*').eq('slug', memorySlug).single()
     ```
  4. Si un `pin_code` est configuré, un pavé numérique s'affiche.
  5. Le lecteur vidéo HTML5 / Canvas démarre la lecture du souvenir avec le son et l'accès à la lettre.
  6. Le compteur `view_count` est incrémenté.

### 2.8 Interfaces Client vs Portail Administrateur
Le dépôt comprend **deux applications distinctes** :
1. **L'application principale (`src/`) :**
   - Vite 8 + TanStack Start (SSR).
   - Vitrine publique, Studio de création, Panier local externe (`src/lib/cart.ts`), Tunnel de commande.
2. **Le portail d'administration (`admin/`) :**
   - Application React 19 SPA indépendante (dossier `admin/`).
   - Dashboard financier en Dinars Tunisiens (TND).
   - Gestion des statuts de commande : En attente ➔ Confirmée ➔ En fabrication ➔ Expédiée ➔ Livrée.
   - Téléchargement des photos haute résolution 10x15 pour l'imprimante thermique.
   - Téléchargement et inspection vidéo HD.
   - Encodage NFC et liaison des slugs.

### 2.9 Déploiement & Variables d'Environnement
- **Hébergement Frontend :** Prévu pour **Cloudflare Workers** via Nitro (fichier de config `.output/server/wrangler.json` et `.wrangler/deploy/config.json`).
- **Variables d'environnement actuelles (`.env`) :**
  ```env
  VITE_SUPABASE_URL=https://[votre-projet].supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
  ```
- **Variables à ajouter pour Cloudflare R2 :**
  ```env
  R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET_NAME=memora-media
  R2_PUBLIC_URL=https://media.memora.tn
  ```

### 2.10 Limitations Actuelles de Sécurité & de Coût
1. **Facturation de la bande passante :** Chaque vue d'un souvenir vidéo de 100 Mo consomme 100 Mo d'egress Supabase. 1 000 vues = 100 Go de bande passante payante.
2. **Sécurité des buckets Supabase :** Le bucket `videos` étant public pour permettre la lecture sans token temporaire, n'importe quel script peut énumérer ou télécharger des vidéos sans restriction.
3. **Limitation de taille :** Les uploads directs via l'API REST de Supabase rencontrent des timeouts sur les connexions mobiles lentes en Tunisie (3G/4G).

---

## 3. Cycle de Vie & Flux Opérationnels

```
+-----------------------------------------------------------------------------------+
|                        PARCOURS COMPLET D'UN SOUVENIR                             |
+-----------------------------------------------------------------------------------+

1. CRÉATION (Client sur mobile/desktop)
   [Vidéo / Photo] ---> Upload direct vers Stockage Cloud (Supabase actuellement / R2 cible)
                       ---> Génération de l'URL publique ou CDN
                       ---> Sauvegarde dans le Panier Local (localStorage)

2. COMMANDE (Client sur /commander)
   Validation coordonnées (Nom, Tél, Ville)
   ---> Insertion dans la table `public.orders` (Statut 'pending')
   ---> Données médias enregistrées dans le champ `items` JSONB

3. FABRICATION & ATELIER (Admin sur /admin)
   Opérateur ouvre la commande
   ---> Télécharge la photo 10x15 pour impression physique
   ---> Clique sur "Créer Capsule"
   ---> Insertion dans `public.memories` avec un `slug` unique

4. ENCODAGE NFC
   Opérateur approche la carte physique de l'encodeur NFC
   ---> Écriture de l'URL NDEF : https://memora.tn/m/{slug}
   ---> Expédition de la carte physique au client

5. LECTURE & EXPÉRIENCE (Destinataire final)
   Scan de la carte avec son smartphone
   ---> Ouverture directe de https://memora.tn/m/{slug}
   ---> Interface 100% immersive sans chrome commercial
   ---> Streaming direct de la vidéo depuis le CDN
```

---

## 4. Pourquoi Intégrer Cloudflare R2 ? (Analyse Comparative)

| Critère | Supabase Storage (Actuel) | Cloudflare R2 (Cible) |
| :--- | :--- | :--- |
| **Frais de sortie (Egress)** | 💰 Payant au-delà du quota (~0.09 $/Go) | 🆓 **0,00 $ (Zéro frais d'egress à vie)** |
| **Compatibilité API** | API propriétaire Supabase + TUS | **API standard S3** (`@aws-sdk/client-s3`) |
| **CDN & Caching Vidéo** | CDN Supabase standard | **Réseau mondial Cloudflare Edge (300+ villes)** |
| **Génération Presigned URLs** | Possible mais limité | **Natif S3 Presigned URLs** (`getSignedUrl`) |
| **Déploiement existant** | Séparé | Déjà déployé sur l'écosystème Cloudflare Workers |
| **Coût stockage pur** | 0.021 $/Go/mois | **0.015 $/Go/mois** (avec 10 Go gratuits/mois) |

---

## 5. Stratégie d'Intégration Propre de Cloudflare R2 (Zéro Régression)

### 5.1 Architecture Cible

Pour ne casser **aucune** logique existante :
1. **Les tables de la base de données ne changent pas :**
   - `orders.items` continuera à stocker des URLs standards sous forme de chaînes de caractères.
   - `memories.video_url` et `memories.cover_image_url` continueront à stocker des URLs HTTPS classiques.
2. **Le lecteur `/m/:memorySlug` reste intact :**
   - Le composant `<video src={memory.video_url} controls playsInline />` ne se soucie pas de l'hébergeur du fichier ; il lit une URL standard.
3. **Le changement se concentre sur l'étape d'upload :**
   - Remplacement de `uploadVideo()` et `uploadPhoto()` dans `src/lib/supabase.ts` (ou création d'un module dédié `src/lib/storage-r2.ts`).
   - L'upload s'effectue via une **URL présignée S3** (Presigned URL) générée côté serveur (via un endpoint TanStack Start / Nitro ou une Cloudflare Worker Function), puis le client effectue un simple `PUT` HTTP avec une barre de progression XMLHttpRequest standard.

```
+-------------------------------------------------------------------------------+
|                       FLUX D'UPLOAD OPTIMISÉ AVEC R2                          |
+-------------------------------------------------------------------------------+

[Client Browser]                                              [Backend / Nitro Server]               [Cloudflare R2]
       |                                                                 |                                  |
       |  1. Demande d'upload (filename, contentType, fileSize)          |                                  |
       |---------------------------------------------------------------->|                                  |
       |                                                                 | 2. Génération Presigned URL      |
       |                                                                 |    via @aws-sdk/s3-request-presigner
       |                                                                 |--------------------------------->|
       |  3. Réponse : { uploadUrl, publicUrl, key }                     |                                  |
       |<----------------------------------------------------------------|                                  |
       |                                                                                                    |
       |  4. Upload direct binaire (HTTP PUT) avec barre de progression                                     |
       |--------------------------------------------------------------------------------------------------->|
       |                                                                                                    |
       |  5. Upload terminé ! Le client utilise `publicUrl` pour le panier et la commande                  |
```

### 5.2 Roadmap d'Implémentation Étape par Étape

1. **Étape 1 : Configuration du Bucket R2 sur Cloudflare**
   - Création du bucket `memora-media`.
   - Configuration d'un sous-domaine personnalisé avec certificat SSL automatique (ex: `https://media.memora.tn`).
   - Configuration des règles CORS sur le bucket R2 :
     ```json
     [
       {
         "AllowedOrigins": ["http://localhost:5173", "http://localhost:5174", "https://memora.tn", "https://*.memora.tn"],
         "AllowedMethods": ["GET", "PUT", "HEAD"],
         "AllowedHeaders": ["*"],
         "ExposeHeaders": ["ETag"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```

2. **Étape 2 : Endpoint Serveur de Signature d'Upload**
   - Création d'une fonction serveur (API Route Nitro / TanStack Start dans `src/routes/api/upload-url.ts` ou Cloudflare Worker function).
   - Utilisation de `@aws-sdk/client-s3` et `@aws-sdk/s3-request-presigner`.
   - Clés secrètes R2 conservées strictement côté serveur (jamais exposées au navigateur).

3. **Étape 3 : Module d'Upload Client**
   - Création de `src/lib/r2-upload.ts` :
     - Appel à l'endpoint de signature.
     - Upload direct via `XMLHttpRequest` ou `fetch` pour calculer le pourcentage d'avancement exact `onProgress(percent)`.
   - Remplacement transparent dans le studio `src/routes/create.$productId.tsx` et dans le composant de recadrage photo `src/components/site/PhotoCustomizer.tsx`.

4. **Étape 4 : Portail Admin & Rétrocompatibilité**
   - Dans le portail admin (`admin/`), conservation de la compatibilité avec les anciens médias déjà stockés sur Supabase.
   - Les boutons de téléchargement HD (`telecharger hd`) fonctionnent directement car ils lisent n'importe quelle URL HTTPS valide.

---

## 6. Guide de Prompting pour ChatGPT

Pour continuer ce travail avec ChatGPT, copiez-collez l'intégralité de ce document `.md`, puis utilisez l'un des prompts suivants selon votre étape :

### 💬 Prompt A : Pour générer l'API Route de signature Presigned URL
> *"Voici l'audit technique complet de mon projet MÉMORA (voir document ci-dessus). Nous voulons implémenter l'étape 2 : générer une URL présignée Cloudflare R2 via l'API S3. Fournis-moi le code complet et sécurisé de l'API route sous TanStack Start / Nitro (TypeScript) avec validation des extensions (MP4, MOV, JPG, PNG, WEBP) et des tailles maximales."*

### 💬 Prompt B : Pour créer le client d'upload avec barre de progression
> *"En te basant sur l'audit technique de MÉMORA, écris la fonction client TypeScript `uploadMediaToR2(file: File, folder: 'videos' | 'photos', onProgress: (pct: number) => void): Promise<{ publicUrl: string, key: string }>` qui gère la barre de progression propre et la gestion d'erreurs en cas de coupure réseau."*

### 💬 Prompt C : Pour configurer CORS et les règles de cache Cloudflare
> *"Donne-moi le fichier de configuration JSON pour les règles CORS de mon bucket Cloudflare R2, ainsi que la configuration des en-têtes HTTP de cache pour que les vidéos streamées sur `/m/:slug` soient mises en cache sur le CDN Cloudflare."*

---
*Fin du document d'audit technique — MÉMORA Digital Story.*
