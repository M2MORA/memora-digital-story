-- MEMORA - Articles live in the database.
--
-- products holds every article of the shop. Copy (name, tagline, description,
-- materials) is i18n JSON: `fr` is required, `en` and `ar` are optional and
-- the storefront falls back to `fr` (src/lib/products.ts).
-- Seeded with today's only article, its copy taken from src/i18n/{fr,en,ar}.ts.
-- id stays 'p1' so carts already saved in browsers and the SQL Quote keep
-- matching it. images stays empty until the photos issue (the product page
-- gallery is still bundled with the code).
-- Anyone reads active rows; admins (app_metadata.role = 'admin') read and
-- write every row. Nobody deletes: articles are deactivated instead.
-- Access: src/test/products-access-db.test.ts (LOCAL_DB_TEST=1).

BEGIN;

CREATE TABLE public.products (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    format TEXT NOT NULL REFERENCES public.formats (code) ON UPDATE CASCADE,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    badge TEXT,
    dimensions TEXT NOT NULL DEFAULT '',
    occasions TEXT[] NOT NULL DEFAULT '{}',
    style TEXT NOT NULL DEFAULT 'classic' CHECK (style IN ('minimal', 'classic', 'romantic', 'modern')),
    included_video_min INT NOT NULL DEFAULT 8 CHECK (included_video_min >= 0),
    images TEXT[] NOT NULL DEFAULT '{}',
    name JSONB NOT NULL CHECK (jsonb_typeof(name -> 'fr') = 'string' AND name ->> 'fr' <> ''),
    tagline JSONB NOT NULL CHECK (jsonb_typeof(tagline -> 'fr') = 'string'),
    description JSONB NOT NULL CHECK (jsonb_typeof(description -> 'fr') = 'string'),
    materials JSONB NOT NULL CHECK (jsonb_typeof(materials -> 'fr') = 'array')
);

INSERT INTO public.products (
    id, slug, format, sort_order, badge, dimensions, occasions, style, included_video_min,
    name, tagline, description, materials
) VALUES (
    'p1',
    'memora-simple-enveloppe',
    '10x15',
    0,
    'L''Essentiel',
    '10 × 15 cm',
    ARRAY['love', 'family', 'special', 'birthday', 'travel'],
    'classic',
    8,
    jsonb_build_object(
        'fr', 'MÉMORA, la photo',
        'en', 'MÉMORA, the photo',
        'ar', 'MÉMORA، الصورة'
    ),
    jsonb_build_object(
        'fr', 'Une photo 10 × 15 qui ouvre votre vidéo.',
        'en', 'A 10 × 15 photo that opens your video.',
        'ar', 'صورة 10 × 15 تحلّ الفيديو متاعك.'
    ),
    jsonb_build_object(
        'fr', 'L''émotion à l''état pur. Un tirage photographique d''art 10×15 cm sur papier noble 300g/m² avec puce invisible. Glissé délicatement dans une élégante enveloppe texturée cachetée, accompagné d''une carte avec votre message personnalisé. Approchez votre smartphone sans aucune application requise : votre vidéo se lance instantanément.'
    ),
    jsonb_build_object(
        'fr', jsonb_build_array(
            'Photo 10 × 15 sur papier 300 g',
            'Puce invisible dans la photo',
            'Enveloppe texturée',
            'Carte avec votre mot'
        ),
        'en', jsonb_build_array(
            '10 × 15 photo on 300 g paper',
            'Hidden chip inside',
            'Textured envelope',
            'Card with your note'
        ),
        'ar', jsonb_build_array(
            'صورة 10 × 15 على ورق 300 غ',
            'شريحة مخفية في الصورة',
            'ظرف فاخر',
            'كارت فيه كلمتك'
        )
    )
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- No DELETE grant to anyone but the service role: articles are deactivated.
REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;

CREATE POLICY "Anyone reads active products" ON public.products FOR SELECT TO anon, authenticated
    USING (active OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins insert products" ON public.products FOR INSERT TO authenticated
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins update products" ON public.products FOR UPDATE TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

COMMIT;
