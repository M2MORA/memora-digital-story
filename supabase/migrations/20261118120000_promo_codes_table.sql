-- MEMORA - Promo codes live in the database.
--
-- promo_codes holds every promo code (code upper-cased, percent 0-100,
-- active), seeded with the codes hardcoded until now. Only admins
-- (app_metadata.role = 'admin') can read or write it: the list is never sent
-- to browsers, and get_pricing() does not include it. Nobody deletes a code:
-- it is deactivated.
-- check_promo_code(code) is the only customer-facing read: one code in, its
-- percent out (0 when unknown or inactive).
-- calculate_order_quote is unchanged except that its discount now comes from
-- the active codes of promo_codes.
-- Access: src/test/pricing-access-db.test.ts; parity:
-- src/test/quote-parity-db.test.ts (LOCAL_DB_TEST=1).

BEGIN;

CREATE TABLE public.promo_codes (
    code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
    percent NUMERIC(5, 2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
    active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.promo_codes (code, percent) VALUES
    ('MEMORA10', 10.00),
    ('BIENVENUE', 10.00),
    ('VIP20', 20.00);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- No DELETE grant to anyone but the service role: codes are deactivated.
REVOKE ALL ON TABLE public.promo_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.promo_codes TO authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;

CREATE POLICY "Admins read promo codes" ON public.promo_codes FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins insert promo codes" ON public.promo_codes FOR INSERT TO authenticated
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins update promo codes" ON public.promo_codes FOR UPDATE TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Percent of one code, matched trimmed and upper-cased; 0 when empty, unknown or inactive.
CREATE OR REPLACE FUNCTION public.check_promo_code(p_code TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT p.percent FROM public.promo_codes p WHERE p.code = upper(trim(p_code)) AND p.active),
        0.00
    );
$$;

ALTER FUNCTION public.check_promo_code(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_promo_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_promo_code(TEXT) TO anon, authenticated, service_role;

-- Copied from 20261116120000; only the promo lookup changes. CREATE OR REPLACE keeps owner and grants.
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
    v_settings public.pricing_settings%ROWTYPE;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Le panier est vide ou le format des articles est invalide' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO STRICT v_settings FROM public.pricing_settings;

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
            IF NOT EXISTS (SELECT 1 FROM public.formats f WHERE f.code = v_format AND f.active) THEN
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
               OR (v_item ->> 'videoDurationSec')::numeric > v_settings.max_video_seconds THEN
                RAISE EXCEPTION 'Durée vidéo invalide pour l''article % (doit être un entier compris entre 0 et % s)', v_item ->> 'productId', v_settings.max_video_seconds USING ERRCODE = '22023';
            END IF;
            v_video_dur := (v_item ->> 'videoDurationSec')::int;
        ELSE
            v_video_dur := 0;
        END IF;

        SELECT f.frame_price INTO v_frame_price
        FROM public.formats f
        WHERE f.code = v_format AND f.active;
        -- Highest tier whose min_qty the cart total reaches.
        SELECT t.unit_price INTO v_unit_price
        FROM public.price_tiers t
        WHERE t.format = v_format AND t.min_qty <= v_total_qty
        ORDER BY t.min_qty DESC
        LIMIT 1;
        IF v_frame_price IS NULL OR v_unit_price IS NULL THEN
            RAISE EXCEPTION 'Format de produit inconnu : %', v_format USING ERRCODE = '22023';
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

        IF v_video_dur > v_settings.included_video_seconds THEN
            v_extra_mins := ceil((v_video_dur - v_settings.included_video_seconds) / 60.0);
            v_video_surcharges := v_video_surcharges + (v_extra_mins * v_settings.surcharge_per_minute * v_qty);
        END IF;
    END LOOP;

    v_subtotal := v_items_subtotal + v_frames_subtotal + v_video_surcharges;

    IF p_promo_code IS NOT NULL AND trim(p_promo_code) <> '' THEN
        v_clean_code := upper(trim(p_promo_code));
        SELECT COALESCE(
            (SELECT p.percent FROM public.promo_codes p WHERE p.code = v_clean_code AND p.active),
            0.00
        ) INTO v_discount_pct;
        v_discount := round((v_subtotal * v_discount_pct) / 100.0, 2);
    END IF;

    v_clean_carrier := lower(trim(COALESCE(p_shipping_carrier, 'aramex')));
    IF (v_subtotal - v_discount) >= v_settings.free_shipping_threshold THEN
        v_shipping_fee := 0.00;
    ELSIF v_clean_carrier IN ('mondial_relay', 'rapid_poste', 'rapid-poste', 'poste') THEN
        v_shipping_fee := v_settings.shipping_fee_mondial_relay;
    ELSIF v_clean_carrier IN ('aramex', 'aramex_express', 'express') THEN
        v_shipping_fee := v_settings.shipping_fee_aramex;
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

COMMIT;
