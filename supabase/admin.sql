-- ==============================================================================
-- MÉMORA - Accès administrateur
-- Exécutez dans : Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Le rôle admin est lu dans app_metadata (non modifiable par l'utilisateur).
-- ==============================================================================

-- 1. Lecture et modification de toutes les commandes par les admins
CREATE POLICY "Admins read all orders"
ON public.orders FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins update orders"
ON public.orders FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. Lecture et modification de tous les souvenirs (y compris brouillons/archivés)
CREATE POLICY "Admins read all memories"
ON public.memories FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins update memories"
ON public.memories FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins insert memories"
ON public.memories FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 3. Donner le rôle admin à votre compte (remplacez l'email, créez d'abord
--    l'utilisateur dans Authentication -> Users -> Add user)
-- UPDATE auth.users
-- SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- WHERE email = 'votre-email@exemple.com';
