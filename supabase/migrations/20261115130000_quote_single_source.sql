-- MEMORA - Quote: calculate_order_quote is the only SQL copy of the prices.
--
-- Before: finalize_order_with_intents charged the totals from
-- calculate_order_quote but kept its own copy of the tier table and frame
-- prices to store unit_price / frame_price on each order item.
-- Now calculate_order_quote also returns `lines` (one per input item, same
-- order): {format, qty, unit_price, frame_price} where frame_price is the
-- format's frame price (finalization applies it only when withFrame).
-- Finalization reads the item prices from there, so a price lives in exactly
-- one SQL place. Totals are unchanged for every existing input.
--
-- The TypeScript twin is calculateQuote in src/lib/pricing.ts; parity is
-- checked by src/test/quote-parity-db.test.ts (LOCAL_DB_TEST=1).
-- CREATE OR REPLACE keeps owner and grants from 20261018220000.

BEGIN;

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
    v_lines JSONB := '[]'::jsonb;
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

        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'format', v_format,
            'qty', v_qty,
            'unit_price', v_unit_price,
            'frame_price', v_frame_price
        ));

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
        'total_quantity', v_total_qty,
        'lines', v_lines
    );
END;
$$;

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
    v_line JSONB;
    v_idx INT := 0;
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

        -- Prices come from calculate_order_quote (lines are in item order).
        v_line := v_server_quote -> 'lines' -> v_idx;
        v_idx := v_idx + 1;
        v_format := v_line ->> 'format';
        v_unit_price := (v_line ->> 'unit_price')::numeric;
        v_frame_price := (v_line ->> 'frame_price')::numeric;

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

COMMIT;
