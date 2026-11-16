-- MEMORA - Catalogue photos in Supabase Storage.
--
-- Public bucket `catalogue` for article gallery photos (products.images holds
-- their ordered public URLs). Admin form uploads to catalogue/<article id>/.
-- Anyone reads; only admins (app_metadata.role = 'admin') upload, replace and
-- delete. The bucket itself caps size (5 MB) and type (JPEG, PNG, WebP), same
-- limits as the admin form (admin/src/lib/rules.ts validateImageFile).
-- Customer media does not go here: it stays on Cloudflare R2.
-- Access: src/test/catalogue-storage-db.test.ts (LOCAL_DB_TEST=1).
--
-- This file is ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalogue', 'catalogue', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Anyone reads catalogue photos" ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'catalogue');
CREATE POLICY "Admins upload catalogue photos" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'catalogue' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins update catalogue photos" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'catalogue' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK (bucket_id = 'catalogue' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admins delete catalogue photos" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'catalogue' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

COMMIT;
