-- ==============================================================================
-- MÉMORA — Migration Phase 1.6 (Audit Final Post-Audit Indépendant)
-- Fichier : supabase/migrations/20261018220000_phase1_upload_intents_and_order_finalization.sql
-- 
-- CORRECTIFS DE SÉCURITÉ APPLIQUÉS (Phase 1.6) :
-- 1. PGCRYPTO DYNAMIQUE & RÉSILIENCE MULTI-SCHÉMAS :
--    - Détection dynamique du véritable schéma contenant digest(text, text) via pg_proc / pg_namespace.
--    - Vérification d'existence et de signature stricte (signature text, text ou bytea, text).
--    - Appel dynamique sécurisé via EXECUTE format avec qualification stricte de l'identifiant (%I).
--    - Gestion explicite de l'absence de pgcrypto avec code d'erreur standard 0A000.
-- 2. INSPECTION STRUCTURALE COMPLÈTE DE L'INDEX D'IDEMPOTENCE :
--    - Utilisation combinée de pg_index, pg_get_expr et pg_get_indexdef.
--    - Contrôle de l'unicité (indisunique), mono-colonne (idempotency_key) et prédicat (WHERE idempotency_key IS NOT NULL).
--    - Suppression ciblée de uq_orders_idempotency_key UNIQUEMENT si sa définition est non conforme.
--    - Préservation absolue des index composites tiers.
-- 3. SÉRIALISATION CONCURRENTIELLE & VERROUILLAGE D'IDEMPOTENCE :
--    - Acquisition préventive d'un verrou transactionnel exclusif pg_advisory_xact_lock sur la clé d'idempotence
--      ET sur le draft_id AVANT la première lecture de orders.
--    - Recherche sous verrou (Double-Checked Lookup) garantissant le rejeu sans collision.
--    - Détection et rejet immédiat (23505) si le même draft tente d'être finalisé avec deux clés distinctes.
-- 4. DURCISSEMENT SECURITY DEFINER & SEARCH_PATH :
--    - search_path systématiquement fixé à : "pg_catalog, public, extensions, pg_temp" (pg_temp strictement dernier).
--    - Révocation formelle de CREATE sur le schéma public pour PUBLIC et anon.
--    - Fonctions sensibles (complete_upload_intent, claim_orphan, confirm_purge) réservées EXCLUSIVEMENT à service_role.
--    - Attribution explicite de l'ownership à postgres pour toutes les fonctions.
-- 5. VALIDATION EXHAUSTIVE DES TYPES & SCHÉMAS JSON :
--    - Rejet immédiat si p_order_payload n'est pas un objet ou si items / mappings ne sont pas des tableaux.
--    - Validation stricte des types primitifs (qty entier > 0, withFrame booléen, videoDurationSec nombre <= 1800).
--    - Validation regex UUID de intent_id avant tout cast Postgres pour éliminer les erreurs 22P02 non contrôlées.
--    - Rejet des identifiants d'articles dupliqués au sein d'une même commande (23505).
-- 6. INTÉGRITÉ TRANSACTIONNELLE DE L'EXPIRATION & PROPRIÉTÉ ITEM :
--    - Transition vers 'expired' persistée via RETURN structuré sans rollback destructeur.
--    - Interdiction formelle de réassigner un intent déjà lié à un item_id non NULL (22023).
--
-- RÈGLE STRICTE : CE SCRIPT EST PRÉPARÉ POUR AUDIT ET VALIDATION LOCALE/STAGING.
-- NE PAS EXÉCUTER SUR L'INSTANCE DE PRODUCTION SANS AUTORISATION EXPLICITE SÉPARÉE.
-- ==============================================================================

-- 1. SÉCURISATION DU SCHÉMA & GESTION MULTI-SCHÉMAS DE PGCRYPTO
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon;

DO $$
DECLARE
    v_ext_schema TEXT;
BEGIN
    SELECT n.nspname INTO v_ext_schema
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto';

    IF v_ext_schema IS NULL THEN
        -- Si pgcrypto n'est pas installé, l'installer dans extensions si disponible, sinon dans public
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'extensions') THEN
            CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
        ELSE
            CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;
        END IF;
    END IF;
END $$;

-- Fonction interne cryptographiquement sûre, identifiant dynamiquement la fonction digest
-- dans son véritable schéma d'installation avec vérification d'existence et de signature
CREATE OR REPLACE FUNCTION public.memora_sha256(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_schema TEXT;
    v_hash TEXT;
BEGIN
    IF p_input IS NULL THEN
        RETURN NULL;
    END IF;

    -- Identification dynamique du véritable schéma contenant digest(text, text)
    -- strictement lié à l'extension pgcrypto via pg_depend (P1 / Correction B)
    SELECT n.nspname INTO v_schema
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_depend d 
        ON d.objid = p.oid 
       AND d.classid = 'pg_catalog.pg_proc'::regclass
       AND d.deptype = 'e'
    JOIN pg_catalog.pg_extension e 
        ON e.oid = d.refobjid 
       AND d.refclassid = 'pg_catalog.pg_extension'::regclass
    WHERE p.proname = 'digest'
      AND e.extname = 'pgcrypto'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'text, text'
    ORDER BY CASE 
        WHEN n.nspname = 'extensions' THEN 1
        WHEN n.nspname = 'public' THEN 2
        ELSE 3
    END
    LIMIT 1;

    IF v_schema IS NULL THEN
        RAISE EXCEPTION 'Fonction cryptographique digest(text, text) introuvable dans l''extension pgcrypto.'
            USING ERRCODE = '0A000';
    END IF;

    -- Appel dynamique sécurisé avec identifiant de schéma qualifié et paramètre bindé ($1)
    EXECUTE format('SELECT encode(%I.digest($1, ''sha256''), ''hex'')', v_schema)
    INTO v_hash
    USING p_input;

    RETURN v_hash;
END;
$$;

-- Nettoyage préventif des surcharges antérieures obsolètes
DROP FUNCTION IF EXISTS public.create_upload_intent(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.heartbeat_upload_intent(UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_upload_intent(UUID, TEXT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_upload_intent(UUID, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.complete_upload_intent(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_upload_intent(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_upload_intent_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.calculate_order_quote(JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.finalize_order_with_intents(JSONB, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.claim_orphan_upload_intents_for_purge(INT, INT);
DROP FUNCTION IF EXISTS public.confirm_purge_upload_intents(UUID[], UUID);
DROP FUNCTION IF EXISTS public.increment_memory_views(UUID);

-- ==============================================================================
-- 2. ÉVOLUTION DU SCHÉMA EXISTANT (Compatibilité ascendante garantie)
-- ==============================================================================

-- 2.1 Ajout sécurisé de la colonne order_id sur public.memories avant l'index
ALTER TABLE public.memories 
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memories_order_id 
    ON public.memories(order_id);

-- 2.2 Ajout de l'idempotence et de la propriété de draft sur public.orders
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS payload_hash TEXT,
    ADD COLUMN IF NOT EXISTS draft_id TEXT,
    ADD COLUMN IF NOT EXISTS draft_token_hash TEXT;

-- CORRECTION B & C (Phase 1.6) : Inspection exhaustive et sécurisée de l'index d'idempotence
DO $$
DECLARE
    v_dup_count INT;
    v_idx_oid OID;
    v_relkind "char";
    v_is_unique BOOLEAN;
    v_is_valid BOOLEAN;
    v_is_ready BOOLEAN;
    v_is_live BOOLEAN;
    v_natts INT;
    v_nkeyatts INT;
    v_indexprs TEXT;
    v_pred TEXT;
    v_col_name TEXT;
    v_index_conforme BOOLEAN := false;
BEGIN
    -- 0. Verrouillage préalable de la table public.orders contre toute écriture concurrente
    LOCK TABLE public.orders IN SHARE MODE;

    -- 1. Contrôle préalable des doublons de clés non nulles dans public.orders
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'idempotency_key'
    ) THEN
        SELECT count(*) INTO v_dup_count
        FROM (
            SELECT idempotency_key
            FROM public.orders
            WHERE idempotency_key IS NOT NULL
            GROUP BY idempotency_key
            HAVING count(*) > 1
        ) dups;

        IF v_dup_count > 0 THEN
            RAISE EXCEPTION 'Migration interrompue : % valeur(s) en doublon détectée(s) pour idempotency_key dans public.orders', v_dup_count
                USING ERRCODE = '23505';
        END IF;
    END IF;

    -- 2. Inspection approfondie de l'index uq_orders_idempotency_key via pg_index, pg_class et pg_attribute
    SELECT 
        i.indexrelid,
        c.relkind,
        i.indisunique,
        i.indisvalid,
        i.indisready,
        i.indislive,
        i.indnatts,
        i.indnkeyatts,
        i.indexprs,
        pg_catalog.pg_get_expr(i.indpred, i.indrelid),
        CASE WHEN i.indkey[0] > 0 THEN a.attname ELSE NULL END
    INTO 
        v_idx_oid,
        v_relkind,
        v_is_unique,
        v_is_valid,
        v_is_ready,
        v_is_live,
        v_natts,
        v_nkeyatts,
        v_indexprs,
        v_pred,
        v_col_name
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
    JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
    JOIN pg_catalog.pg_namespace nc ON nc.oid = c.relnamespace
    JOIN pg_catalog.pg_namespace nt ON nt.oid = t.relnamespace
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE c.relname = 'uq_orders_idempotency_key'
      AND t.relname = 'orders'
      AND nt.nspname = 'public'
      AND nc.nspname = 'public'
      AND i.indrelid = 'public.orders'::regclass;

    IF v_idx_oid IS NOT NULL THEN
        -- Vérification exhaustive sans suppression automatique
        IF v_relkind = 'i'
           AND v_is_unique = true 
           AND v_is_valid = true 
           AND v_is_ready = true 
           AND v_is_live = true 
           AND v_natts = 1 
           AND v_nkeyatts = 1 
           AND v_indexprs IS NULL 
           AND v_col_name = 'idempotency_key' 
           AND trim(v_pred) = '(idempotency_key IS NOT NULL)' THEN
            v_index_conforme := true;
        ELSE
            RAISE EXCEPTION 'Index public.uq_orders_idempotency_key existant mais non conforme (définition ou validité invalide). Suppression automatique interdite : intervention manuelle requise.'
                USING ERRCODE = '55000';
        END IF;
    END IF;

    -- 3. Création garantie de l'index UNIQUE partiel conforme uniquement si absent
    IF NOT v_index_conforme THEN
        CREATE UNIQUE INDEX uq_orders_idempotency_key 
            ON public.orders(idempotency_key)
            WHERE idempotency_key IS NOT NULL;
    END IF;
END $$;

-- CORRECTION G & Décision Métier 1 (Phase 1.6) : Unicité stricte de orders.draft_id avec verrouillage et introspection
DO $$
DECLARE
    v_draft_dup_count INT;
    v_idx_oid OID;
    v_relkind "char";
    v_is_unique BOOLEAN;
    v_is_valid BOOLEAN;
    v_is_ready BOOLEAN;
    v_is_live BOOLEAN;
    v_natts INT;
    v_nkeyatts INT;
    v_indexprs TEXT;
    v_pred TEXT;
    v_col_name TEXT;
    v_index_conforme BOOLEAN := false;
BEGIN
    -- 0. Vérification préalable de l'existence de la table et de la colonne
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'orders'
    ) THEN
        RAISE EXCEPTION 'Table public.orders introuvable' USING ERRCODE = '42P01';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'draft_id'
    ) THEN
        RAISE EXCEPTION 'Colonne draft_id introuvable dans public.orders' USING ERRCODE = '42703';
    END IF;

    -- 1. Verrouillage exclusif en lecture/écriture concurrente maintenu pendant tout le contrôle et la création
    LOCK TABLE public.orders IN SHARE MODE;

    -- 2. Contrôle d'absence de doublons historiques (exécuté sous verrou, sans modifier aucune commande existante)
    SELECT count(*) INTO v_draft_dup_count
    FROM (
        SELECT draft_id
        FROM public.orders
        WHERE draft_id IS NOT NULL
        GROUP BY draft_id
        HAVING count(*) > 1
    ) dups;

    IF v_draft_dup_count > 0 THEN
        RAISE EXCEPTION 'Migration interrompue : % doublon(s) de draft_id détecté(s) dans public.orders. Aucune commande existante n''a été modifiée. Résolution manuelle requise.', v_draft_dup_count
            USING ERRCODE = '23505';
    END IF;

    -- 3. Introspection catalogue exhaustive de uq_orders_draft_id sur public.orders
    SELECT 
        i.indexrelid,
        c.relkind,
        i.indisunique,
        i.indisvalid,
        i.indisready,
        i.indislive,
        i.indnatts,
        i.indnkeyatts,
        i.indexprs,
        pg_catalog.pg_get_expr(i.indpred, i.indrelid),
        CASE WHEN i.indkey[0] > 0 THEN a.attname ELSE NULL END
    INTO 
        v_idx_oid,
        v_relkind,
        v_is_unique,
        v_is_valid,
        v_is_ready,
        v_is_live,
        v_natts,
        v_nkeyatts,
        v_indexprs,
        v_pred,
        v_col_name
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
    JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
    JOIN pg_catalog.pg_namespace nc ON nc.oid = c.relnamespace
    JOIN pg_catalog.pg_namespace nt ON nt.oid = t.relnamespace
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE c.relname = 'uq_orders_draft_id'
      AND t.relname = 'orders'
      AND nt.nspname = 'public'
      AND nc.nspname = 'public'
      AND i.indrelid = 'public.orders'::regclass;

    IF v_idx_oid IS NOT NULL THEN
        -- Vérification stricte : physique, unique, valide, prêt, vivant, mono-colonne draft_id, sans expression, prédicat exact
        IF v_relkind = 'i'
           AND v_is_unique = true 
           AND v_is_valid = true 
           AND v_is_ready = true 
           AND v_is_live = true 
           AND v_natts = 1 
           AND v_nkeyatts = 1 
           AND v_indexprs IS NULL 
           AND v_col_name = 'draft_id' 
           AND trim(v_pred) = '(draft_id IS NOT NULL)' THEN
            v_index_conforme := true;
        ELSE
            RAISE EXCEPTION 'Index public.uq_orders_draft_id existant mais non conforme (définition ou validité invalide). Suppression automatique interdite : intervention manuelle requise.'
                USING ERRCODE = '55000';
        END IF;
    END IF;

    -- 4. Création garantie de l'index UNIQUE partiel uniquement si absent
    IF NOT v_index_conforme THEN
        CREATE UNIQUE INDEX uq_orders_draft_id 
            ON public.orders(draft_id) 
            WHERE draft_id IS NOT NULL;
    END IF;
END $$;

-- ==============================================================================
-- 3. TABLE DES INTENTIONS DE TÉLÉVERSEMENT (UPLOAD INTENTS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.upload_intents (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    draft_id TEXT NOT NULL,
    draft_token_hash TEXT NOT NULL,
    item_id TEXT,
    file_kind TEXT NOT NULL CHECK (file_kind IN ('video', 'photo')),
    storage_key TEXT UNIQUE NOT NULL,
    file_name TEXT NOT NULL,
    file_extension TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    client_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'ready', 'consumed', 'purging', 'cancelled', 'expired')),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    consumed_at TIMESTAMPTZ,
    purge_token UUID,
    purge_lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_intents_draft_id 
    ON public.upload_intents(draft_id);

CREATE INDEX IF NOT EXISTS idx_upload_intents_order_id 
    ON public.upload_intents(order_id);

CREATE INDEX IF NOT EXISTS idx_upload_intents_purge 
    ON public.upload_intents(expires_at) 
    WHERE status IN ('pending', 'uploading', 'cancelled', 'expired', 'ready', 'purging');

CREATE INDEX IF NOT EXISTS idx_upload_intents_draft_item 
    ON public.upload_intents(draft_id, item_id);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) & PRIVILÈGES DE TABLE
-- ==============================================================================
ALTER TABLE public.upload_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.upload_intents FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Admins full access on upload_intents" ON public.upload_intents;

CREATE POLICY "Admins full access on upload_intents"
    ON public.upload_intents
    FOR ALL
    TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.upload_intents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.upload_intents TO service_role;

-- ==============================================================================
-- 5. FONCTIONS MÉTIER & RPC SÉCURISÉES (DURCIES SECURITY DEFINER)
-- ==============================================================================

-- 5.1 Création d'une intention d'upload
CREATE OR REPLACE FUNCTION public.create_upload_intent(
    p_draft_id TEXT,
    p_draft_token TEXT,
    p_file_kind TEXT,
    p_file_name TEXT,
    p_mime_type TEXT,
    p_file_size_bytes BIGINT,
    p_file_extension TEXT,
    p_item_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_clean_ext TEXT;
    v_token_hash TEXT;
    v_storage_key TEXT;
    v_intent_id UUID;
    v_active_count INT;
    v_expires_at TIMESTAMPTZ;
    v_clean_item_id TEXT;
BEGIN
    IF p_draft_id IS NULL OR trim(p_draft_id) = '' THEN
        RAISE EXCEPTION 'draft_id obligatoire' USING ERRCODE = '22023';
    END IF;
    IF trim(p_draft_id) !~ '^[a-zA-Z0-9_-]{3,64}$' THEN
        RAISE EXCEPTION 'draft_id invalide : format non conforme (caractères alphanumériques, tiret ou souligné attendus, longueur 3 à 64)'
            USING ERRCODE = '22023';
    END IF;
    IF p_draft_token IS NULL OR trim(p_draft_token) = '' THEN
        RAISE EXCEPTION 'draft_token obligatoire' USING ERRCODE = '22023';
    END IF;
    IF p_file_kind NOT IN ('video', 'photo') THEN
        RAISE EXCEPTION 'file_kind invalide (attendu: video ou photo)' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('memora_draft_quota:' || trim(p_draft_id)));

    v_clean_ext := lower(trim(leading '.' FROM trim(p_file_extension)));
    v_clean_item_id := NULLIF(trim(p_item_id), '');

    IF p_file_kind = 'video' THEN
        IF v_clean_ext NOT IN ('mp4', 'mov', 'webm') THEN
            RAISE EXCEPTION 'Extension vidéo non autorisée (mp4, mov, webm requis)' USING ERRCODE = '22023';
        END IF;
        IF p_mime_type NOT LIKE 'video/%' AND p_mime_type NOT IN ('application/octet-stream') THEN
            RAISE EXCEPTION 'MIME type vidéo invalide: %', p_mime_type USING ERRCODE = '22023';
        END IF;
        IF p_file_size_bytes > 5368709120 THEN
            RAISE EXCEPTION 'Fichier vidéo trop volumineux (max 5 Go)' USING ERRCODE = '22023';
        END IF;
    ELSIF p_file_kind = 'photo' THEN
        IF v_clean_ext NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
            RAISE EXCEPTION 'Extension photo non autorisée (jpg, png, webp requis)' USING ERRCODE = '22023';
        END IF;
        IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
            RAISE EXCEPTION 'MIME type photo invalide: %', p_mime_type USING ERRCODE = '22023';
        END IF;
        IF p_file_size_bytes > 26214400 THEN
            RAISE EXCEPTION 'Fichier photo trop volumineux (max 25 Mo)' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT count(*) INTO v_active_count
    FROM public.upload_intents
    WHERE draft_id = p_draft_id
      AND status IN ('pending', 'uploading', 'ready');

    IF v_active_count >= 20 THEN
        RAISE EXCEPTION 'Quota de fichiers atteint pour ce panier (max 20)' USING ERRCODE = '22023';
    END IF;

    v_token_hash := public.memora_sha256(p_draft_token);
    v_intent_id := pg_catalog.gen_random_uuid();
    v_expires_at := now() + interval '2 hours';
    v_storage_key := 'staging/' || p_draft_id || '/' || v_intent_id::text || '.' || v_clean_ext;

    INSERT INTO public.upload_intents (
        id,
        draft_id,
        draft_token_hash,
        item_id,
        file_kind,
        storage_key,
        file_name,
        file_extension,
        mime_type,
        file_size_bytes,
        status,
        last_heartbeat_at,
        expires_at
    ) VALUES (
        v_intent_id,
        p_draft_id,
        v_token_hash,
        v_clean_item_id,
        p_file_kind,
        v_storage_key,
        p_file_name,
        v_clean_ext,
        p_mime_type,
        p_file_size_bytes,
        'pending',
        now(),
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'intent_id', v_intent_id,
        'storage_key', v_storage_key,
        'expires_at', v_expires_at,
        'status', 'pending'
    );
END;
$$;

-- 5.2 Heartbeat pour maintenir l'intent actif
CREATE OR REPLACE FUNCTION public.heartbeat_upload_intent(
    p_intent_id UUID,
    p_draft_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_intent RECORD;
    v_token_hash TEXT;
    v_new_expires_at TIMESTAMPTZ;
BEGIN
    IF p_draft_token IS NULL OR trim(p_draft_token) = '' THEN
        RAISE EXCEPTION 'draft_token obligatoire' USING ERRCODE = '22023';
    END IF;
    IF p_intent_id IS NULL THEN
        RAISE EXCEPTION 'intent_id obligatoire' USING ERRCODE = '22023';
    END IF;

    v_token_hash := public.memora_sha256(p_draft_token);

    SELECT id, draft_token_hash, status, expires_at
    INTO v_intent
    FROM public.upload_intents
    WHERE id = p_intent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    IF v_intent.draft_token_hash IS DISTINCT FROM v_token_hash THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
    END IF;

    IF v_intent.status NOT IN ('pending', 'uploading') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_status', 'status', v_intent.status);
    END IF;

    IF v_intent.expires_at < now() THEN
        UPDATE public.upload_intents
        SET status = 'expired', updated_at = now()
        WHERE id = p_intent_id;
        RETURN jsonb_build_object('success', false, 'reason', 'expired');
    END IF;

    v_new_expires_at := now() + interval '2 hours';

    UPDATE public.upload_intents
    SET last_heartbeat_at = now(),
        expires_at = v_new_expires_at,
        status = 'uploading',
        updated_at = now()
    WHERE id = p_intent_id;

    RETURN jsonb_build_object(
        'success', true,
        'intent_id', p_intent_id,
        'expires_at', v_new_expires_at,
        'status', 'uploading'
    );
END;
$$;

-- 5.3 Complétion & Vérification d'un upload (Exclusif au service_role après HeadObject R2)
CREATE OR REPLACE FUNCTION public.complete_upload_intent(
    p_intent_id UUID,
    p_draft_token TEXT,
    p_verified_size_bytes BIGINT,
    p_verified_etag TEXT DEFAULT NULL,
    p_client_sha256 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_intent RECORD;
    v_token_hash TEXT;
BEGIN
    IF p_draft_token IS NULL OR trim(p_draft_token) = '' THEN
        RAISE EXCEPTION 'draft_token obligatoire' USING ERRCODE = '22023';
    END IF;
    IF p_intent_id IS NULL THEN
        RAISE EXCEPTION 'intent_id obligatoire' USING ERRCODE = '22023';
    END IF;
    IF p_verified_size_bytes IS NULL OR p_verified_size_bytes <= 0 THEN
        RAISE EXCEPTION 'Taille vérifiée obligatoire et supérieure à 0' USING ERRCODE = '22023';
    END IF;

    v_token_hash := public.memora_sha256(p_draft_token);

    SELECT id, draft_token_hash, status, expires_at, file_size_bytes, storage_key
    INTO v_intent
    FROM public.upload_intents
    WHERE id = p_intent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    IF v_intent.draft_token_hash IS DISTINCT FROM v_token_hash THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
    END IF;

    IF v_intent.status NOT IN ('pending', 'uploading') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_status', 'status', v_intent.status);
    END IF;

    IF v_intent.expires_at < now() THEN
        UPDATE public.upload_intents SET status = 'expired', updated_at = now() WHERE id = p_intent_id;
        RETURN jsonb_build_object('success', false, 'reason', 'expired');
    END IF;

    IF p_verified_size_bytes IS DISTINCT FROM v_intent.file_size_bytes THEN
        RAISE EXCEPTION 'Taille constatée sur R2 (% octets) non conforme à la taille déclarée (% octets)',
            p_verified_size_bytes, v_intent.file_size_bytes USING ERRCODE = '22023';
    END IF;

    UPDATE public.upload_intents
    SET status = 'ready',
        client_sha256 = COALESCE(p_client_sha256, client_sha256),
        updated_at = now()
    WHERE id = p_intent_id;

    RETURN jsonb_build_object(
        'success', true,
        'intent_id', p_intent_id,
        'status', 'ready',
        'storage_key', v_intent.storage_key,
        'verified_size_bytes', p_verified_size_bytes
    );
END;
$$;

-- 5.4 Consultation sécurisée de statut d'upload par le propriétaire du draft
CREATE OR REPLACE FUNCTION public.get_upload_intent_status(
    p_intent_id UUID,
    p_draft_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_intent RECORD;
    v_token_hash TEXT;
BEGIN
    IF p_draft_token IS NULL OR trim(p_draft_token) = '' THEN
        RAISE EXCEPTION 'draft_token obligatoire' USING ERRCODE = '22023';
    END IF;
    IF p_intent_id IS NULL THEN
        RAISE EXCEPTION 'intent_id obligatoire' USING ERRCODE = '22023';
    END IF;

    v_token_hash := public.memora_sha256(p_draft_token);

    SELECT id, status, file_kind, file_name, file_size_bytes, expires_at
    INTO v_intent
    FROM public.upload_intents
    WHERE id = p_intent_id AND draft_token_hash = v_token_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'intent_id', v_intent.id,
        'status', v_intent.status,
        'file_kind', v_intent.file_kind,
        'file_name', v_intent.file_name,
        'file_size_bytes', v_intent.file_size_bytes,
        'expires_at', v_intent.expires_at
    );
END;
$$;

-- 5.5 Moteur de tarification faisant autorité côté serveur
CREATE OR REPLACE FUNCTION public.calculate_order_quote(
    p_items JSONB,
    p_promo_code TEXT DEFAULT NULL,
    p_shipping_carrier TEXT DEFAULT 'aramex'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_total_qty INT := 0;
    v_items_subtotal NUMERIC(10, 2) := 0.00;
    v_frames_subtotal NUMERIC(10, 2) := 0.00;
    v_video_surcharges NUMERIC(10, 2) := 0.00;
    v_subtotal NUMERIC(10, 2) := 0.00;
    v_discount NUMERIC(10, 2) := 0.00;
    v_discount_pct NUMERIC(5, 2) := 0.00;
    v_shipping_fee NUMERIC(10, 2) := 0.00;
    v_total NUMERIC(10, 2) := 0.00;
    v_item JSONB;
    v_raw_format TEXT;
    v_product_id TEXT;
    v_format TEXT;
    v_qty INT;
    v_with_frame BOOLEAN;
    v_video_dur INT;
    v_unit_price NUMERIC(10, 2);
    v_frame_price NUMERIC(10, 2);
    v_extra_mins INT;
    v_clean_code TEXT;
    v_clean_carrier TEXT;
    v_qty_val INT;
    v_quantity_val INT;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Le panier est vide ou le format des articles est invalide' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'Format d''article invalide : objet JSON attendu' USING ERRCODE = '22023';
        END IF;

        v_qty_val := NULL;
        v_quantity_val := NULL;

        -- 1. Validation indépendante de 'qty'
        IF v_item ? 'qty' THEN
            IF jsonb_typeof(v_item -> 'qty') <> 'number' 
               OR (v_item ->> 'qty')::numeric % 1 <> 0 
               OR (v_item ->> 'qty')::numeric > 10000 
               OR (v_item ->> 'qty')::numeric <= 0 THEN
                RAISE EXCEPTION 'Quantité qty invalide pour l''article % (doit être un entier positif <= 10000)', v_item ->> 'productId' 
                    USING ERRCODE = '22023';
            END IF;
            v_qty_val := (v_item ->> 'qty')::int;
        END IF;

        -- 2. Validation indépendante de 'quantity'
        IF v_item ? 'quantity' THEN
            IF jsonb_typeof(v_item -> 'quantity') <> 'number' 
               OR (v_item ->> 'quantity')::numeric % 1 <> 0 
               OR (v_item ->> 'quantity')::numeric > 10000 
               OR (v_item ->> 'quantity')::numeric <= 0 THEN
                RAISE EXCEPTION 'Quantité quantity invalide pour l''article % (doit être un entier positif <= 10000)', v_item ->> 'productId' 
                    USING ERRCODE = '22023';
            END IF;
            v_quantity_val := (v_item ->> 'quantity')::int;
        END IF;

        -- 3. Priorité : qty prévaut sur quantity si les deux sont valides
        v_qty := COALESCE(v_qty_val, v_quantity_val, 1);
        v_total_qty := v_total_qty + v_qty;
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_raw_format := v_item ->> 'format';
        IF v_raw_format IS NOT NULL AND trim(v_raw_format) <> '' THEN
            v_format := lower(trim(v_raw_format));
            IF v_format NOT IN ('10x15', 'box', 'magnet', '20x30', '30x45') THEN
                RAISE EXCEPTION 'Format de produit inconnu : %', v_format USING ERRCODE = '22023';
            END IF;
        ELSE
            v_product_id := lower(trim(COALESCE(v_item ->> 'productId', v_item ->> 'id', '')));
            IF v_product_id IN ('p1', 'memora-simple-enveloppe') OR v_product_id LIKE '%enveloppe%' THEN
                v_format := '10x15';
            ELSIF v_product_id IN ('p2', 'memora-coffret-box') OR v_product_id LIKE '%box%' OR v_product_id LIKE '%coffret%' THEN
                v_format := 'box';
            ELSIF v_product_id LIKE '%magnet%' THEN
                v_format := 'magnet';
            ELSIF v_product_id LIKE '%20x30%' THEN
                v_format := '20x30';
            ELSIF v_product_id LIKE '%30x45%' THEN
                v_format := '30x45';
            ELSE
                RAISE EXCEPTION 'Format de produit manquant ou inconnu pour l''article %', v_item ->> 'productId' USING ERRCODE = '22023';
            END IF;
        END IF;

        v_qty_val := NULL;
        v_quantity_val := NULL;
        IF v_item ? 'qty' THEN v_qty_val := (v_item ->> 'qty')::int; END IF;
        IF v_item ? 'quantity' THEN v_quantity_val := (v_item ->> 'quantity')::int; END IF;
        v_qty := COALESCE(v_qty_val, v_quantity_val, 1);

        IF v_item ? 'withFrame' AND jsonb_typeof(v_item -> 'withFrame') <> 'boolean' THEN
            RAISE EXCEPTION 'Le champ withFrame pour l''article % doit être un booléen', v_item ->> 'productId' USING ERRCODE = '22023';
        END IF;
        v_with_frame := COALESCE((v_item ->> 'withFrame')::boolean, false);

        IF v_item ? 'videoDurationSec' THEN
            IF jsonb_typeof(v_item -> 'videoDurationSec') <> 'number' 
               OR (v_item ->> 'videoDurationSec')::numeric % 1 <> 0 
               OR (v_item ->> 'videoDurationSec')::numeric < 0 
               OR (v_item ->> 'videoDurationSec')::numeric > 1800 THEN
                RAISE EXCEPTION 'Durée vidéo invalide pour l''article % (doit être un entier compris entre 0 et 1800 s)', v_item ->> 'productId' USING ERRCODE = '22023';
            END IF;
            v_video_dur := (v_item ->> 'videoDurationSec')::int;
        ELSE
            v_video_dur := 0;
        END IF;

        IF v_format = '10x15' THEN
            IF v_total_qty >= 100 THEN v_unit_price := 20.00;
            ELSIF v_total_qty >= 50 THEN v_unit_price := 25.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 32.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 42.00;
            ELSE v_unit_price := 49.00;
            END IF;
            v_frame_price := 50.00;
        ELSIF v_format = 'box' THEN
            IF v_total_qty >= 100 THEN v_unit_price := 49.00;
            ELSIF v_total_qty >= 50 THEN v_unit_price := 59.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 69.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 79.00;
            ELSE v_unit_price := 89.00;
            END IF;
            v_frame_price := 0.00;
        ELSIF v_format = 'magnet' THEN
            IF v_total_qty >= 100 THEN v_unit_price := 27.00;
            ELSIF v_total_qty >= 50 THEN v_unit_price := 34.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 44.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 57.00;
            ELSE v_unit_price := 65.00;
            END IF;
            v_frame_price := 0.00;
        ELSIF v_format = '20x30' THEN
            IF v_total_qty >= 50 THEN v_unit_price := 82.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 98.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 115.00;
            ELSE v_unit_price := 129.00;
            END IF;
            v_frame_price := 120.00;
        ELSIF v_format = '30x45' THEN
            IF v_total_qty >= 50 THEN v_unit_price := 130.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 150.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 175.00;
            ELSE v_unit_price := 199.00;
            END IF;
            v_frame_price := 150.00;
        END IF;

        v_items_subtotal := v_items_subtotal + (v_unit_price * v_qty);

        IF v_with_frame THEN
            v_frames_subtotal := v_frames_subtotal + (v_frame_price * v_qty);
        END IF;

        IF v_video_dur > 480 THEN
            v_extra_mins := ceil((v_video_dur - 480) / 60.0);
            v_video_surcharges := v_video_surcharges + (v_extra_mins * 1.50 * v_qty);
        END IF;
    END LOOP;

    v_subtotal := v_items_subtotal + v_frames_subtotal + v_video_surcharges;

    IF p_promo_code IS NOT NULL AND trim(p_promo_code) <> '' THEN
        v_clean_code := upper(trim(p_promo_code));
        IF v_clean_code IN ('MEMORA10', 'BIENVENUE') THEN
            v_discount_pct := 10.00;
        ELSIF v_clean_code = 'VIP20' THEN
            v_discount_pct := 20.00;
        END IF;
        v_discount := round((v_subtotal * v_discount_pct) / 100.0, 2);
    END IF;

    v_clean_carrier := lower(trim(COALESCE(p_shipping_carrier, 'aramex')));
    IF (v_subtotal - v_discount) >= 250.00 THEN
        v_shipping_fee := 0.00;
    ELSIF v_clean_carrier IN ('mondial_relay', 'rapid_poste', 'rapid-poste', 'poste') THEN
        v_shipping_fee := 6.00;
    ELSIF v_clean_carrier IN ('aramex', 'aramex_express', 'express') THEN
        v_shipping_fee := 8.00;
    ELSE
        RAISE EXCEPTION 'Transporteur inconnu : % (modes autorisés : aramex, mondial_relay/rapid_poste)', p_shipping_carrier
            USING ERRCODE = '22023';
    END IF;

    v_total := (v_subtotal - v_discount) + v_shipping_fee;

    RETURN jsonb_build_object(
        'items_subtotal', v_items_subtotal,
        'frames_subtotal', v_frames_subtotal,
        'video_surcharges', v_video_surcharges,
        'subtotal', v_subtotal,
        'discount', v_discount,
        'shipping_fee', v_shipping_fee,
        'total', v_total,
        'total_quantity', v_total_qty
    );
END;
$$;

-- 5.6 Finalisation atomique & idempotente d'une commande (CORRECTIONS A, B, C, D, E, F)
CREATE OR REPLACE FUNCTION public.finalize_order_with_intents(
    p_order_payload JSONB,
    p_draft_id TEXT,
    p_draft_token TEXT,
    p_intent_mappings JSONB,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_order_id UUID;
    v_order_number TEXT;
    v_existing_order RECORD;
    v_draft_conflict RECORD;
    v_elem JSONB;
    v_intent_id UUID;
    v_raw_intent_id TEXT;
    v_item_id TEXT;
    v_file_kind TEXT;
    v_intent RECORD;
    v_mapping_count INT;
    v_distinct_intents INT;
    v_distinct_slots INT;
    v_intent_ids UUID[];
    v_order_item_ids TEXT[] := ARRAY[]::TEXT[];
    v_server_quote JSONB;
    v_payload_hash TEXT;
    v_authoritative_subtotal NUMERIC(10, 2);
    v_authoritative_shipping NUMERIC(10, 2);
    v_authoritative_total NUMERIC(10, 2);
    v_item JSONB;
    v_raw_format TEXT;
    v_product_id TEXT;
    v_format TEXT;
    v_qty INT;
    v_with_frame BOOLEAN;
    v_video_dur INT;
    v_unit_price NUMERIC(10, 2);
    v_frame_price NUMERIC(10, 2);
    v_normalized_items JSONB := '[]'::jsonb;
    v_total_qty INT;
    v_has_video BOOLEAN;
    v_has_photo BOOLEAN;
    v_qty_val INT;
    v_quantity_val INT;
BEGIN
    -- 1. Validations préliminaires strictes des types et présences
    IF p_draft_id IS NULL OR trim(p_draft_id) = '' THEN
        RAISE EXCEPTION 'draft_id obligatoire' USING ERRCODE = '22023';
    END IF;
    IF trim(p_draft_id) !~ '^[a-zA-Z0-9_-]{3,64}$' THEN
        RAISE EXCEPTION 'draft_id invalide : format non conforme (caractères alphanumériques, tiret ou souligné attendus, longueur 3 à 64)'
            USING ERRCODE = '22023';
    END IF;
    IF p_draft_token IS NULL OR trim(p_draft_token) = '' THEN
        RAISE EXCEPTION 'draft_token obligatoire' USING ERRCODE = '22023';
    END IF;
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'idempotency_key obligatoire pour finaliser la commande' USING ERRCODE = '22023';
    END IF;
    IF p_order_payload IS NULL OR jsonb_typeof(p_order_payload) <> 'object' THEN
        RAISE EXCEPTION 'p_order_payload obligatoire et doit être un objet JSON' USING ERRCODE = '22023';
    END IF;
    IF p_intent_mappings IS NULL OR jsonb_typeof(p_intent_mappings) <> 'array' THEN
        RAISE EXCEPTION 'p_intent_mappings obligatoire et doit être un tableau JSON' USING ERRCODE = '22023';
    END IF;

    v_token_hash := public.memora_sha256(p_draft_token);
    v_order_number := trim(COALESCE(p_order_payload ->> 'order_number', ''));
    IF v_order_number = '' THEN
        RAISE EXCEPTION 'order_number obligatoire dans payload' USING ERRCODE = '22023';
    END IF;

    v_payload_hash := public.memora_sha256(p_order_payload::text || '::' || p_intent_mappings::text);

    -- 2. Concurrence & Idempotence : Acquisition des verrous transactionnels exclusifs
    -- Sérialisation stricte par clé d'idempotence ET par draft_id AVANT toute lecture de orders
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('memora_order_finalize:' || trim(p_idempotency_key)));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('memora_draft_finalize:' || trim(p_draft_id)));

    -- Double-Checked Lookup sous verrou exclusif
    SELECT id, order_number, total, payload_hash, draft_id, draft_token_hash
    INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = trim(p_idempotency_key);

    IF FOUND THEN
        IF v_existing_order.draft_id IS DISTINCT FROM p_draft_id
           OR v_existing_order.draft_token_hash IS DISTINCT FROM v_token_hash THEN
            RAISE EXCEPTION 'Accès refusé : cette clé d''idempotence n''appartient pas à ce panier'
                USING ERRCODE = '42501';
        END IF;

        IF v_existing_order.payload_hash IS NOT DISTINCT FROM v_payload_hash THEN
            RETURN jsonb_build_object(
                'success', true,
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'total', v_existing_order.total,
                'idempotent_replay', true
            );
        ELSE
            RAISE EXCEPTION 'Collision d''idempotence : cette clé a déjà été utilisée avec un contenu de commande différent' 
                USING ERRCODE = '23505';
        END IF;
    END IF;

    -- Contrôle anti-collision : Vérifier si ce draft n'a pas déjà été finalisé sous une AUTRE clé
    SELECT id, order_number, idempotency_key
    INTO v_draft_conflict
    FROM public.orders
    WHERE draft_id = p_draft_id
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Ce panier a déjà été finalisé sous une autre clé d''idempotence (commande %)', v_draft_conflict.order_number
            USING ERRCODE = '23505';
    END IF;

    -- 3. Validation approfondie du tableau des articles et recalcul serveur des totaux
    IF jsonb_typeof(p_order_payload -> 'items') <> 'array' THEN
        RAISE EXCEPTION 'items doit être un tableau JSON dans le payload' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_order_payload -> 'items') = 0 THEN
        RAISE EXCEPTION 'Le panier est vide' USING ERRCODE = '22023';
    END IF;

    v_server_quote := public.calculate_order_quote(
        p_order_payload -> 'items',
        p_order_payload ->> 'promo_code',
        COALESCE(p_order_payload ->> 'shipping_carrier', 'aramex')
    );
    v_authoritative_subtotal := (v_server_quote ->> 'subtotal')::numeric;
    v_authoritative_shipping := (v_server_quote ->> 'shipping_fee')::numeric;
    v_authoritative_total := (v_server_quote ->> 'total')::numeric;
    v_total_qty := (v_server_quote ->> 'total_quantity')::int;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_payload -> 'items')
    LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'Chaque article dans items doit être un objet JSON valide' USING ERRCODE = '22023';
        END IF;

        v_item_id := trim(COALESCE(v_item ->> 'id', v_item ->> 'key', v_item ->> 'item_id', ''));
        IF v_item_id = '' THEN
            RAISE EXCEPTION 'Chaque article de la commande doit comporter un identifiant unique (id/key)' 
                USING ERRCODE = '22023';
        END IF;

        -- Rejet des identifiants d'articles dupliqués dans la commande
        IF v_item_id = ANY(v_order_item_ids) THEN
            RAISE EXCEPTION 'Identifiant d''article dupliqué dans la commande : %', v_item_id 
                USING ERRCODE = '23505';
        END IF;
        v_order_item_ids := array_append(v_order_item_ids, v_item_id);

        v_qty_val := NULL;
        v_quantity_val := NULL;

        -- 1. Validation indépendante de 'qty'
        IF v_item ? 'qty' THEN
            IF jsonb_typeof(v_item -> 'qty') <> 'number' 
               OR (v_item ->> 'qty')::numeric % 1 <> 0 
               OR (v_item ->> 'qty')::numeric > 10000 
               OR (v_item ->> 'qty')::numeric <= 0 THEN
                RAISE EXCEPTION 'Quantité qty invalide pour l''article % (doit être un entier positif <= 10000)', v_item_id 
                    USING ERRCODE = '22023';
            END IF;
            v_qty_val := (v_item ->> 'qty')::int;
        END IF;

        -- 2. Validation indépendante de 'quantity'
        IF v_item ? 'quantity' THEN
            IF jsonb_typeof(v_item -> 'quantity') <> 'number' 
               OR (v_item ->> 'quantity')::numeric % 1 <> 0 
               OR (v_item ->> 'quantity')::numeric > 10000 
               OR (v_item ->> 'quantity')::numeric <= 0 THEN
                RAISE EXCEPTION 'Quantité quantity invalide pour l''article % (doit être un entier positif <= 10000)', v_item_id 
                    USING ERRCODE = '22023';
            END IF;
            v_quantity_val := (v_item ->> 'quantity')::int;
        END IF;

        -- 3. Priorité : qty prévaut sur quantity si les deux sont valides
        v_qty := COALESCE(v_qty_val, v_quantity_val, 1);

        -- Validation du champ withFrame
        IF v_item ? 'withFrame' AND jsonb_typeof(v_item -> 'withFrame') <> 'boolean' THEN
            RAISE EXCEPTION 'Le champ withFrame pour l''article % doit être un booléen', v_item_id USING ERRCODE = '22023';
        END IF;
        v_with_frame := COALESCE((v_item ->> 'withFrame')::boolean, false);

        -- Validation du champ videoDurationSec
        IF v_item ? 'videoDurationSec' THEN
            IF jsonb_typeof(v_item -> 'videoDurationSec') <> 'number' 
               OR (v_item ->> 'videoDurationSec')::numeric % 1 <> 0 
               OR (v_item ->> 'videoDurationSec')::numeric < 0 
               OR (v_item ->> 'videoDurationSec')::numeric > 1800 THEN
                RAISE EXCEPTION 'Durée vidéo invalide pour l''article % (doit être un entier compris entre 0 et 1800 s)', v_item_id USING ERRCODE = '22023';
            END IF;
            v_video_dur := (v_item ->> 'videoDurationSec')::int;
        ELSE
            v_video_dur := 0;
        END IF;

        v_raw_format := v_item ->> 'format';
        IF v_raw_format IS NOT NULL AND trim(v_raw_format) <> '' THEN
            v_format := lower(trim(v_raw_format));
        ELSE
            v_product_id := lower(trim(COALESCE(v_item ->> 'productId', v_item ->> 'id', '')));
            IF v_product_id IN ('p1', 'memora-simple-enveloppe') OR v_product_id LIKE '%enveloppe%' THEN v_format := '10x15';
            ELSIF v_product_id IN ('p2', 'memora-coffret-box') OR v_product_id LIKE '%box%' OR v_product_id LIKE '%coffret%' THEN v_format := 'box';
            ELSIF v_product_id LIKE '%magnet%' THEN v_format := 'magnet';
            ELSIF v_product_id LIKE '%20x30%' THEN v_format := '20x30';
            ELSIF v_product_id LIKE '%30x45%' THEN v_format := '30x45';
            ELSE v_format := '10x15';
            END IF;
        END IF;

        IF v_format = '10x15' THEN
            IF v_total_qty >= 100 THEN v_unit_price := 20.00;
            ELSIF v_total_qty >= 50 THEN v_unit_price := 25.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 32.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 42.00;
            ELSE v_unit_price := 49.00;
            END IF;
            v_frame_price := 50.00;
        ELSIF v_format = 'box' THEN
            IF v_total_qty >= 100 THEN v_unit_price := 49.00;
            ELSIF v_total_qty >= 50 THEN v_unit_price := 59.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 69.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 79.00;
            ELSE v_unit_price := 89.00;
            END IF;
            v_frame_price := 0.00;
        ELSIF v_format = 'magnet' THEN
            IF v_total_qty >= 100 THEN v_unit_price := 27.00;
            ELSIF v_total_qty >= 50 THEN v_unit_price := 34.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 44.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 57.00;
            ELSE v_unit_price := 65.00;
            END IF;
            v_frame_price := 0.00;
        ELSIF v_format = '20x30' THEN
            IF v_total_qty >= 50 THEN v_unit_price := 82.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 98.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 115.00;
            ELSE v_unit_price := 129.00;
            END IF;
            v_frame_price := 120.00;
        ELSIF v_format = '30x45' THEN
            IF v_total_qty >= 50 THEN v_unit_price := 130.00;
            ELSIF v_total_qty >= 10 THEN v_unit_price := 150.00;
            ELSIF v_total_qty >= 5 THEN v_unit_price := 175.00;
            ELSE v_unit_price := 199.00;
            END IF;
            v_frame_price := 150.00;
        END IF;

        v_normalized_items := v_normalized_items || jsonb_build_array(
            jsonb_build_object(
                'id', v_item_id,
                'productId', v_item ->> 'productId',
                'format', v_format,
                'qty', v_qty,
                'withFrame', v_with_frame,
                'videoDurationSec', v_video_dur,
                'unit_price', v_unit_price,
                'frame_price', CASE WHEN v_with_frame THEN v_frame_price ELSE 0.00 END,
                'cardMessage', v_item ->> 'cardMessage',
                'letterContent', v_item ->> 'letterContent',
                'personalization', v_item -> 'personalization'
            )
        );
    END LOOP;

    -- 4. Validation des mappages de médias
    v_mapping_count := jsonb_array_length(p_intent_mappings);
    IF v_mapping_count = 0 THEN
        RAISE EXCEPTION 'Mappages de médias obligatoires : chaque article doit être associé à sa photo et sa vidéo' 
            USING ERRCODE = '22023';
    END IF;

    -- Validation préalable de chaque entrée de mapping JSON avant tout cast
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_intent_mappings)
    LOOP
        IF jsonb_typeof(v_elem) <> 'object' THEN
            RAISE EXCEPTION 'Chaque entrée de intent_mappings doit être un objet JSON valide' 
                USING ERRCODE = '22023';
        END IF;

        v_raw_intent_id := trim(COALESCE(v_elem ->> 'intent_id', ''));
        IF v_raw_intent_id = '' THEN
            RAISE EXCEPTION 'intent_id obligatoire dans chaque mapping' USING ERRCODE = '22023';
        END IF;
        IF v_raw_intent_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RAISE EXCEPTION 'intent_id invalide (format UUID attendu): %', v_raw_intent_id 
                USING ERRCODE = '22023';
        END IF;

        v_item_id := trim(COALESCE(v_elem ->> 'item_id', ''));
        IF v_item_id = '' THEN
            RAISE EXCEPTION 'item_id obligatoire dans chaque mapping' USING ERRCODE = '22023';
        END IF;

        v_file_kind := lower(trim(COALESCE(v_elem ->> 'file_kind', '')));
        IF v_file_kind NOT IN ('video', 'photo') THEN
            RAISE EXCEPTION 'file_kind invalide dans le mapping pour % (attendu: video ou photo)', v_item_id 
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    -- Vérification de l'exhaustivité des médias pour chaque article
    FOREACH v_item_id IN ARRAY v_order_item_ids
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_intent_mappings) AS m
            WHERE trim(m ->> 'item_id') = v_item_id AND lower(trim(m ->> 'file_kind')) = 'photo'
        ) INTO v_has_photo;

        SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_intent_mappings) AS m
            WHERE trim(m ->> 'item_id') = v_item_id AND lower(trim(m ->> 'file_kind')) = 'video'
        ) INTO v_has_video;

        IF NOT v_has_photo OR NOT v_has_video THEN
            RAISE EXCEPTION 'Mappage média incomplet pour l''article % : une photo et une vidéo sont obligatoires (photo: %, video: %)',
                v_item_id, v_has_photo, v_has_video USING ERRCODE = '22023';
        END IF;
    END LOOP;

    -- Unicité stricte des uploadIntentId
    SELECT count(DISTINCT (m ->> 'intent_id')::uuid)
    INTO v_distinct_intents
    FROM jsonb_array_elements(p_intent_mappings) AS m;

    IF v_distinct_intents <> v_mapping_count THEN
        RAISE EXCEPTION 'Doublon détecté dans intent_mappings : chaque uploadIntentId doit être unique' 
            USING ERRCODE = '23505';
    END IF;

    -- Unicité des créneaux (item_id + file_kind)
    SELECT count(DISTINCT trim(m ->> 'item_id') || ':' || lower(trim(m ->> 'file_kind')))
    INTO v_distinct_slots
    FROM jsonb_array_elements(p_intent_mappings) AS m;

    IF v_distinct_slots <> v_mapping_count THEN
        RAISE EXCEPTION 'Doublon détecté : un même article ne peut avoir deux intents pour le même type de fichier' 
            USING ERRCODE = '23505';
    END IF;

    SELECT array_agg((m ->> 'intent_id')::uuid)
    INTO v_intent_ids
    FROM jsonb_array_elements(p_intent_mappings) AS m;

    -- Verrouillage pessimiste atomique FOR UPDATE sur les lignes d'intent
    PERFORM id 
    FROM public.upload_intents
    WHERE id = ANY(v_intent_ids)
    FOR UPDATE;

    -- Validation de chaque intent
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_intent_mappings)
    LOOP
        v_intent_id := (v_elem ->> 'intent_id')::uuid;
        v_item_id := trim(v_elem ->> 'item_id');
        v_file_kind := lower(trim(v_elem ->> 'file_kind'));

        IF NOT (v_item_id = ANY(v_order_item_ids)) THEN
            RAISE EXCEPTION 'L''intent mapping référence un article inexistant dans la commande : %', v_item_id 
                USING ERRCODE = '22023';
        END IF;

        SELECT * INTO v_intent
        FROM public.upload_intents
        WHERE id = v_intent_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Intention d''upload introuvable : %', v_intent_id USING ERRCODE = '02000';
        END IF;

        IF v_intent.draft_id IS DISTINCT FROM p_draft_id OR v_intent.draft_token_hash IS DISTINCT FROM v_token_hash THEN
            RAISE EXCEPTION 'Accès refusé : l''intent % n''appartient pas à ce panier', v_intent_id 
                USING ERRCODE = '42501';
        END IF;

        -- Contrôle d'assignation item : interdire la réassignation si créé pour un article spécifique
        IF v_intent.item_id IS NOT NULL AND v_intent.item_id IS DISTINCT FROM v_item_id THEN
            RAISE EXCEPTION 'L''intent % a été créé pour l''article % et ne peut pas être réassigné à l''article %',
                v_intent_id, v_intent.item_id, v_item_id USING ERRCODE = '22023';
        END IF;

        IF v_intent.status = 'consumed' THEN
            RAISE EXCEPTION 'L''intent % a déjà été consommé pour la commande %', v_intent_id, v_intent.order_id 
                USING ERRCODE = '23505';
        END IF;

        -- Expiration transactionnelle sans rollback destructeur
        IF v_intent.expires_at < now() THEN
            UPDATE public.upload_intents 
            SET status = 'expired', updated_at = now() 
            WHERE id = v_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'reason', 'intent_expired',
                'message', 'L''intention d''upload ' || v_intent_id::text || ' a expiré et ne peut plus être finalisée',
                'intent_id', v_intent_id,
                'expires_at', v_intent.expires_at
            );
        END IF;

        IF v_intent.status <> 'ready' THEN
            RAISE EXCEPTION 'L''intent % n''est pas prêt (statut actuel: %)', v_intent_id, v_intent.status 
                USING ERRCODE = '22023';
        END IF;

        IF v_intent.file_kind <> v_file_kind THEN
            RAISE EXCEPTION 'Incohérence de type pour % : attendu %, intent est %', 
                v_intent_id, v_file_kind, v_intent.file_kind USING ERRCODE = '22023';
        END IF;
    END LOOP;

    -- 5. Insertion de la commande avec totaux vérifiés et statut forcé à 'pending'
    BEGIN
        INSERT INTO public.orders (
            order_number,
            customer_name,
            customer_email,
            customer_phone,
            shipping_address,
            items,
            subtotal,
            shipping_fee,
            total,
            currency,
            status,
            idempotency_key,
            payload_hash,
            draft_id,
            draft_token_hash
        ) VALUES (
            v_order_number,
            COALESCE(p_order_payload ->> 'customer_name', 'Client Mémora'),
            COALESCE(p_order_payload ->> 'customer_email', 'client@memora.tn'),
            p_order_payload ->> 'customer_phone',
            COALESCE(p_order_payload -> 'shipping_address', '{}'::jsonb),
            v_normalized_items,
            v_authoritative_subtotal,
            v_authoritative_shipping,
            v_authoritative_total,
            'TND',
            'pending',
            trim(p_idempotency_key),
            v_payload_hash,
            p_draft_id,
            v_token_hash
        )
        RETURNING id INTO v_order_id;
    EXCEPTION WHEN unique_violation THEN
        SELECT id, order_number, total, payload_hash, draft_id, draft_token_hash
        INTO v_existing_order
        FROM public.orders
        WHERE idempotency_key = trim(p_idempotency_key);

        IF FOUND THEN
            IF v_existing_order.draft_id IS DISTINCT FROM p_draft_id
               OR v_existing_order.draft_token_hash IS DISTINCT FROM v_token_hash THEN
                RAISE EXCEPTION 'Accès refusé : cette clé d''idempotence n''appartient pas à ce panier'
                    USING ERRCODE = '42501';
            END IF;

            IF v_existing_order.payload_hash IS NOT DISTINCT FROM v_payload_hash THEN
                RETURN jsonb_build_object(
                    'success', true,
                    'order_id', v_existing_order.id,
                    'order_number', v_existing_order.order_number,
                    'total', v_existing_order.total,
                    'idempotent_replay', true
                );
            ELSE
                RAISE EXCEPTION 'Collision d''idempotence : cette clé a déjà été utilisée avec un contenu de commande différent' 
                    USING ERRCODE = '23505';
            END IF;
        END IF;
        RAISE;
    END;

    -- 6. Consommation atomique des intents & association définitive des item_id
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_intent_mappings)
    LOOP
        v_intent_id := (v_elem ->> 'intent_id')::uuid;
        v_item_id := trim(v_elem ->> 'item_id');

        UPDATE public.upload_intents
        SET status = 'consumed',
            order_id = v_order_id,
            item_id = v_item_id,
            consumed_at = now(),
            updated_at = now()
        WHERE id = v_intent_id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_authoritative_subtotal,
        'shipping_fee', v_authoritative_shipping,
        'total', v_authoritative_total,
        'status', 'pending'
    );
END;
$$;

-- 5.7 Protocole de Purge R2 Fiable à Bail en Deux Phases (Bornage strict)
CREATE OR REPLACE FUNCTION public.claim_orphan_upload_intents_for_purge(
    p_batch_size INT DEFAULT 50,
    p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE (
    claimed_id UUID,
    storage_key TEXT,
    purge_token UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_purge_token UUID := pg_catalog.gen_random_uuid();
    v_batch_size INT;
    v_lease_duration INTERVAL;
BEGIN
    IF p_batch_size IS NOT NULL AND (p_batch_size < 1 OR p_batch_size > 500) THEN
        RAISE EXCEPTION 'p_batch_size invalide (%): doit être compris entre 1 et 500', p_batch_size 
            USING ERRCODE = '22023';
    END IF;
    IF p_lease_seconds IS NOT NULL AND (p_lease_seconds < 30 OR p_lease_seconds > 3600) THEN
        RAISE EXCEPTION 'p_lease_seconds invalide (%): doit être compris entre 30 et 3600 secondes', p_lease_seconds 
            USING ERRCODE = '22023';
    END IF;

    v_batch_size := COALESCE(p_batch_size, 50);
    v_lease_duration := (COALESCE(p_lease_seconds, 300) || ' seconds')::interval;

    RETURN QUERY
    WITH targets AS (
        SELECT id
        FROM public.upload_intents
        WHERE (
            (status IN ('pending', 'uploading', 'cancelled', 'expired') AND expires_at < now())
            OR (status = 'ready' AND order_id IS NULL AND expires_at < now())
            OR (status = 'purging' AND purge_lease_expires_at < now())
        )
        AND order_id IS NULL
        ORDER BY expires_at ASC
        LIMIT v_batch_size
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.upload_intents ui
        SET status = 'purging',
            purge_token = v_purge_token,
            purge_lease_expires_at = now() + v_lease_duration,
            updated_at = now()
        FROM targets t
        WHERE ui.id = t.id
        RETURNING ui.id, ui.storage_key, v_purge_token AS token
    )
    SELECT c.id, c.storage_key, c.token FROM claimed c;
END;
$$;

-- Phase 2 : Confirmation de suppression définitive en base UNIQUEMENT après succès S3 / R2
CREATE OR REPLACE FUNCTION public.confirm_purge_upload_intents(
    p_purged_ids UUID[],
    p_purge_token UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    IF p_purge_token IS NULL THEN
        RAISE EXCEPTION 'purge_token obligatoire' USING ERRCODE = '22023';
    END IF;
    IF p_purged_ids IS NULL OR array_length(p_purged_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;
    IF array_length(p_purged_ids, 1) > 500 THEN
        RAISE EXCEPTION 'Taille du lot p_purged_ids excessive (max 500)' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.upload_intents
    WHERE id = ANY(p_purged_ids)
      AND purge_token = p_purge_token
      AND status = 'purging'
      AND order_id IS NULL
      AND purge_lease_expires_at > now();

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- 5.8 Incrémentation atomique des vues de souvenirs
CREATE OR REPLACE FUNCTION public.increment_memory_views(memory_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.memories
  SET view_count = coalesce(view_count, 0) + 1,
      updated_at = now()
  WHERE id = memory_id AND status = 'active';
$$;

-- ==============================================================================
-- 6. GESTION DES PRIVILÈGES D'EXÉCUTION & OWNERSHIP POSTGRES
-- ==============================================================================
ALTER FUNCTION public.memora_sha256(TEXT) OWNER TO postgres;
ALTER FUNCTION public.create_upload_intent(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION public.heartbeat_upload_intent(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.complete_upload_intent(UUID, TEXT, BIGINT, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION public.get_upload_intent_status(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.calculate_order_quote(JSONB, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION public.finalize_order_with_intents(JSONB, TEXT, TEXT, JSONB, TEXT) OWNER TO postgres;
ALTER FUNCTION public.claim_orphan_upload_intents_for_purge(INT, INT) OWNER TO postgres;
ALTER FUNCTION public.confirm_purge_upload_intents(UUID[], UUID) OWNER TO postgres;
ALTER FUNCTION public.increment_memory_views(UUID) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.memora_sha256(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_upload_intent(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_upload_intent(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_upload_intent(UUID, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_upload_intent_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_order_quote(JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_order_with_intents(JSONB, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_orphan_upload_intents_for_purge(INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_purge_upload_intents(UUID[], UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_memory_views(UUID) FROM PUBLIC, anon, authenticated;

-- Fonctions internes cryptographiques (authenticated et service_role uniquement)
GRANT EXECUTE ON FUNCTION public.memora_sha256(TEXT) TO authenticated, service_role;

-- Fonctions publiques / clientes (anonymes et connectés)
GRANT EXECUTE ON FUNCTION public.create_upload_intent(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_upload_intent(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_upload_intent_status(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_order_with_intents(JSONB, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_memory_views(UUID) TO anon, authenticated, service_role;

-- Fonctions de calcul tarifaire (authenticated et service_role)
GRANT EXECUTE ON FUNCTION public.calculate_order_quote(JSONB, TEXT, TEXT) TO authenticated, service_role;

-- Fonctions strictement serveur / administratives (service_role ONLY - Exclusivité backend)
GRANT EXECUTE ON FUNCTION public.complete_upload_intent(UUID, TEXT, BIGINT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_orphan_upload_intents_for_purge(INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_purge_upload_intents(UUID[], UUID) TO service_role;
