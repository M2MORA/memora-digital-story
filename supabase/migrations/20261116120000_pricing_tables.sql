-- MEMORA - Pricing lives in the database.
--
-- formats, price_tiers and pricing_settings hold every price except promo
-- codes, seeded with exactly the values hardcoded until now. Anyone can read
-- them; only admins (app_metadata.role = 'admin') can write.
-- calculate_order_quote keeps its signature, outputs (including `lines`) and
-- error messages; it now reads tiers, frame prices, shipping fees, the
-- free-shipping threshold and the video limits from these tables, and its
-- format whitelist is the active formats. Promo codes are unchanged (still
-- hardcoded here and in src/lib/pricing.ts).
-- get_pricing() returns formats, tiers and settings as one JSON document for
-- the storefront, the WhatsApp agent and the TS Quote (src/lib/pricing.ts).
-- Parity: src/test/quote-parity-db.test.ts (LOCAL_DB_TEST=1).

BEGIN;

CREATE TABLE public.formats (
    code TEXT PRIMARY KEY,
    frame_price NUMERIC(10, 2) NOT NULL CHECK (frame_price >= 0),
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE public.price_tiers (
    format TEXT NOT NULL REFERENCES public.formats (code) ON UPDATE CASCADE,
    min_qty INT NOT NULL CHECK (min_qty >= 1),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (format, min_qty)
);

-- Single row: id is always true.
CREATE TABLE public.pricing_settings (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    shipping_fee_aramex NUMERIC(10, 2) NOT NULL CHECK (shipping_fee_aramex >= 0),
    shipping_fee_mondial_relay NUMERIC(10, 2) NOT NULL CHECK (shipping_fee_mondial_relay >= 0),
    free_shipping_threshold NUMERIC(10, 2) NOT NULL CHECK (free_shipping_threshold >= 0),
    included_video_seconds INT NOT NULL CHECK (included_video_seconds >= 0),
    surcharge_per_minute NUMERIC(10, 2) NOT NULL CHECK (surcharge_per_minute >= 0),
    max_video_seconds INT NOT NULL CHECK (max_video_seconds >= included_video_seconds)
);

INSERT INTO public.formats (code, frame_price) VALUES
    ('10x15', 50.00),
    ('box', 0.00),
    ('magnet', 0.00),
    ('20x30', 120.00),
    ('30x45', 150.00);

INSERT INTO public.price_tiers (format, min_qty, unit_price) VALUES
    ('10x15', 1, 49.00), ('10x15', 5, 42.00), ('10x15', 10, 32.00), ('10x15', 50, 25.00), ('10x15', 100, 20.00),
    ('box', 1, 89.00), ('box', 5, 79.00), ('box', 10, 69.00), ('box', 50, 59.00), ('box', 100, 49.00),
    ('magnet', 1, 65.00), ('magnet', 5, 57.00), ('magnet', 10, 44.00), ('magnet', 50, 34.00), ('magnet', 100, 27.00),
    ('20x30', 1, 129.00), ('20x30', 5, 115.00), ('20x30', 10, 98.00), ('20x30', 50, 82.00),
    ('30x45', 1, 199.00), ('30x45', 5, 175.00), ('30x45', 10, 150.00), ('30x45', 50, 130.00);

INSERT INTO public.pricing_settings (
    shipping_fee_aramex, shipping_fee_mondial_relay, free_shipping_threshold,
    included_video_seconds, surcharge_per_minute, max_video_seconds
) VALUES (8.00, 6.00, 250.00, 480, 1.50, 1800);

-- Every format has a tier starting at quantity 1, so every cart has a price.
-- Deferred: a grid can be rewritten inside one transaction.
CREATE OR REPLACE FUNCTION public.check_first_price_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_format TEXT;
BEGIN
    SELECT f.code INTO v_format
    FROM public.formats f
    WHERE NOT EXISTS (
        SELECT 1 FROM public.price_tiers t WHERE t.format = f.code AND t.min_qty = 1
    )
    LIMIT 1;
    IF v_format IS NOT NULL THEN
        RAISE EXCEPTION 'Format %: the first price tier must start at quantity 1', v_format
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

ALTER FUNCTION public.check_first_price_tier() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_first_price_tier() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER trg_price_tiers_first_tier
AFTER INSERT OR UPDATE OR DELETE ON public.price_tiers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_first_price_tier();

CREATE CONSTRAINT TRIGGER trg_formats_first_tier
AFTER INSERT OR UPDATE ON public.formats
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_first_price_tier();

-- Access: anyone reads, admins write. pricing_settings is update-only (single row).
ALTER TABLE public.formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.formats, public.price_tiers, public.pricing_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.formats, public.price_tiers, public.pricing_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.formats, public.price_tiers TO authenticated;
GRANT UPDATE ON TABLE public.pricing_settings TO authenticated;
GRANT ALL ON TABLE public.formats, public.price_tiers, public.pricing_settings TO service_role;

CREATE POLICY "Anyone reads formats" ON public.formats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins insert formats" ON public.formats FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins update formats" ON public.formats FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins delete formats" ON public.formats FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Anyone reads price tiers" ON public.price_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins insert price tiers" ON public.price_tiers FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins update price tiers" ON public.price_tiers FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins delete price tiers" ON public.price_tiers FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Anyone reads pricing settings" ON public.pricing_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins update pricing settings" ON public.pricing_settings FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Public read of the whole grid: {formats: [...], tiers: [...], settings: {...}}. Never promo codes.
CREATE OR REPLACE FUNCTION public.get_pricing()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'formats', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('code', f.code, 'frame_price', f.frame_price, 'active', f.active) ORDER BY f.code)
            FROM public.formats f
        ), '[]'::jsonb),
        'tiers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('format', t.format, 'min_qty', t.min_qty, 'unit_price', t.unit_price) ORDER BY t.format, t.min_qty)
            FROM public.price_tiers t
        ), '[]'::jsonb),
        'settings', (
            SELECT jsonb_build_object(
                'shipping_fee_aramex', s.shipping_fee_aramex,
                'shipping_fee_mondial_relay', s.shipping_fee_mondial_relay,
                'free_shipping_threshold', s.free_shipping_threshold,
                'included_video_seconds', s.included_video_seconds,
                'surcharge_per_minute', s.surcharge_per_minute,
                'max_video_seconds', s.max_video_seconds
            )
            FROM public.pricing_settings s
        )
    );
$$;

ALTER FUNCTION public.get_pricing() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_pricing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pricing() TO anon, authenticated, service_role;

-- CREATE OR REPLACE keeps owner and grants from 20261018220000.
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
        IF v_clean_code IN ('MEMORA10', 'BIENVENUE') THEN
            v_discount_pct := 10.00;
        ELSIF v_clean_code = 'VIP20' THEN
            v_discount_pct := 20.00;
        END IF;
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
