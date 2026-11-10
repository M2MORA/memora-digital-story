-- MEMORA - Remove user_metadata from the public.memories admin policies.
--
-- user_metadata can be edited by any signed-in user through auth.updateUser(),
-- so it must never grant admin rights. Only app_metadata is trusted here.
--
-- Effective access is unchanged for real admins, owners and the public:
--   * Owner insert and update stay covered by "Users can insert own memories"
--     and "Users can update own memories".
--   * Public read of active memories stays covered by "Public read active memories".
--   * Owner read of their own draft or archived memories has no other policy,
--     so it is kept in "Admins read all memories".
--
-- This file is ASCII only on purpose: pasting accented SQL into a client with
-- the wrong encoding has already garbled function bodies on this project.

BEGIN;

DROP POLICY IF EXISTS "Admins read all memories" ON public.memories;
CREATE POLICY "Admins read all memories"
ON public.memories FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (select auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Admins update memories" ON public.memories;
CREATE POLICY "Admins update memories"
ON public.memories FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins insert memories" ON public.memories;
CREATE POLICY "Admins insert memories"
ON public.memories FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

COMMIT;
