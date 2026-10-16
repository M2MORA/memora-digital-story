-- ==============================================================================
-- MÉMORA - Schéma de Base de Données Supabase
-- Exécutez ce script dans : Dashboard Supabase -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Table des Souvenirs Numériques (reliés aux puces NFC et liens /m/:slug)
CREATE TABLE IF NOT EXISTS public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  photo_url TEXT,
  aspect_ratio TEXT DEFAULT '9:16',
  view_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  nfc_uid TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index pour les recherches rapides par slug (utilisé lors du scan NFC /m/:slug)
CREATE INDEX IF NOT EXISTS idx_memories_slug ON public.memories(slug);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON public.memories(user_id);

-- Activation du Row Level Security (RLS) obligatoire
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour memories :
-- Tout le monde (visiteur scannant le NFC) peut lire les souvenirs actifs
CREATE POLICY "Public read active memories"
ON public.memories
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- Les utilisateurs authentifiés peuvent gérer leurs propres souvenirs
CREATE POLICY "Users can insert own memories"
ON public.memories
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own memories"
ON public.memories
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- 2. Table des Commandes (Tunnel de commande /commander)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'printing', 'shipped', 'delivered', 'cancelled')),
  payment_provider TEXT,
  payment_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);

-- Activation du RLS pour les commandes
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Autoriser la création de commande (clients invités ou connectés lors du checkout)
CREATE POLICY "Allow guests and users to create order"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Les clients connectés peuvent voir leurs propres commandes
CREATE POLICY "Users can view own orders"
ON public.orders
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

-- 3. Configuration des Buckets Storage pour photos et vidéos
-- (Supabase Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('videos', 'videos', true),
  ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Storage : accès en lecture publique pour les photos et vidéos
CREATE POLICY "Public media view"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id IN ('videos', 'photos'));

-- Autoriser les uploads anonymes ou connectés pour la commande
CREATE POLICY "Public media upload"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id IN ('videos', 'photos'));
