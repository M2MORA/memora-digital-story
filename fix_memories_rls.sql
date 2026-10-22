-- Politiques d'accès Administrateur pour la table memories
DROP POLICY IF EXISTS "Admins insert memories" ON public.memories;
CREATE POLICY "Admins insert memories"
ON public.memories FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  OR (select auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Admins update memories" ON public.memories;
CREATE POLICY "Admins update memories"
ON public.memories FOR UPDATE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  OR (select auth.uid()) = user_id
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  OR (select auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Admins read all memories" ON public.memories;
CREATE POLICY "Admins read all memories"
ON public.memories FOR SELECT TO authenticated
USING (
  status = 'active'
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  OR (select auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Admins delete memories" ON public.memories;
CREATE POLICY "Admins delete memories"
ON public.memories FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  OR (select auth.uid()) = user_id
);
