# 🏗️ Architecture & Guide Technique MÉMORA

Ce document détaille l'architecture logicielle, le cycle de vie des données et le fonctionnement interne du projet **MÉMORA Digital Story**.

---

## 🎯 Vue d'Ensemble du Système

Le projet MÉMORA repose sur 4 sous-systèmes interconnectés :

```text
┌────────────────────────────────────────────────────────┐
│               1. OBJET PHYSIQUE (NFC / QR)             │
│   Puce NFC NTAG213/215 ou QR gravé au dos de la carte  │
└───────────────────────────┬────────────────────────────┘
                            │ Scan / Tap sans app
                            ▼
┌────────────────────────────────────────────────────────┐
│               2. STOREFRONT & READER (Vite + TanStack)  │
│   • Vitrine publique & Catalogue de produits           │
│   • Studio de personnalisation vidéo/photo (/create)   │
│   • Lecteur de souvenirs immersif (/m/:memorySlug)     │
└───────────────────────────┬────────────────────────────┘
                            │ REST / GraphQL / Realtime
                            ▼
┌────────────────────────────────────────────────────────┐
│               3. BACKEND & STOCKAGE (Supabase)         │
│   • PostgreSQL avec Row Level Security (RLS)           │
│   • Buckets Supabase Storage (vidéos, audio, photos)   │
│   • Authentification des administrateurs               │
└───────────────────────────▲────────────────────────────┘
                            │ Supervision & Traitement
┌───────────────────────────┴────────────────────────────┐
│               4. PORTAIL ADMIN (admin/ - React 19)     │
│   • Pipeline de commande & validation d'impression     │
│   • Attribution des slugs et encodage des puces NFC    │
│   • Statistiques et métriques financières (TND)        │
└────────────────────────────────────────────────────────┘
```

---

## 🔑 Parcours Utilisateur & Flux de Données

### 1. Création & Personnalisation de Souvenir (`/create/:productId`)
- L'utilisateur sélectionne un produit physique dans le catalogue (`src/lib/products.ts`).
- Dans le studio, il téléverse :
  - Une vidéo de souvenir (MP4/MOV).
  - Un extrait musical ou message audio.
  - Une lettre ou mot manuscrit personnalisé.
- Le composant **Frame Scrubber** permet d'extraire une image exacte de la vidéo au format Canvas haute résolution pour l'impression physique sur la carte.
- Le contenu est lié au panier local (`src/lib/cart.ts`) avec des identifiants temporaires et des URLs Blob.

### 2. Validation & Commande COD (`/commander`)
- Le panier applique les remises sur quantité définies dans `src/lib/pricing.ts` :
  - **1 carte** : Prix de base standard.
  - **2 cartes** : Remise de 10%.
  - **3 cartes et plus** : Remise de 20% + livraison gratuite.
- Le client renseigne ses coordonnées en Tunisie (Nom, Téléphone tunisien 8 chiffres, Ville/Gouvernorat, Adresse).
- À la validation, une entrée est créée dans la table Supabase `orders`, et les médias sont téléversés dans le bucket sécurisé `memories-media`.

### 3. Encodage Physique & Fabrication (Espace Admin `admin/`)
- L'équipe atelier ouvre le portail d'administration.
- Une commande est passée à l'état `En fabrication`.
- L'opérateur génère ou associe un slug unique (ex: `mariage-sarah-mehdi-2026`).
- L'URL finale est encodée sur la puce NFC physique :
  ```text
  https://memora.tn/m/mariage-sarah-mehdi-2026
  ```
- La carte physique est imprimée avec la photo sélectionnée et emballée dans son étui cadeau.

### 4. Expérience de Lecture du Souvenir (`/m/:memorySlug`)
- Dès que le destinataire touche la carte avec son smartphone :
  - Le navigateur mobile s'ouvre directement sur `/m/:memorySlug`.
  - La route est configurée en mode **100% immersif** : les barres de navigation du site et les pieds de page sont automatiquement masqués via le composant racine `src/routes/__root.tsx`.
  - La vidéo se lance en plein écran avec options de lecture audio, affichage de la lettre et téléchargement du souvenir.

---

## 🗄️ Schéma de Base de Données

### Table `orders`
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
    notes TEXT
);
```

### Table `memories`
```sql
CREATE TABLE public.memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    audio_url TEXT,
    cover_image_url TEXT,
    written_note TEXT,
    pin_code TEXT,
    view_count INTEGER DEFAULT 0
);
```

---

## 🛡️ Règles de Sécurité RLS (Row Level Security)

1. **Table `memories`** :
   - `SELECT` : Publique pour les utilisateurs connaissant le slug (et saisissant le code PIN si défini).
   - `INSERT / UPDATE / DELETE` : Réservé aux administrateurs authentifiés.
2. **Table `orders`** :
   - `INSERT` : Autorisé pour la création de commande client.
   - `SELECT / UPDATE / DELETE` : Restreint exclusivement aux administrateurs authentifiés via `supabase/admin.sql`.

---

## 🚀 Bonnes Pratiques pour les Nouveaux Développeurs

- **Toujours tester les résolutions mobiles** : 85% de nos utilisateurs ouvrent MÉMORA sur un écran de smartphone (iPhone Safari / Android Chrome).
- **Préserver l'isolation de `/m/*`** : Les routes sous `/m/*` doivent rester dépouillées de tout chrome commercial pour conserver l'effet « capsule temporelle ».
