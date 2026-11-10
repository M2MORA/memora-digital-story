-- MEMORA - Stop anyone from listing memories with the public API key.
--
-- Step 2 of 2. Apply this AFTER the code using get_memory_by_slug is live.
-- Applied earlier, memory pages would stop loading.
--
-- Admin and owner access stay covered by "Admins read all memories".
-- This file is ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

DROP POLICY IF EXISTS "Public read active memories" ON public.memories;

COMMIT;
