-- MEMORA - Read one memory by its slug without exposing the memories table.
--
-- Step 1 of 2. Apply this BEFORE deploying the code that calls the function.
-- It only adds a function, so the current site keeps working.
--
-- Returns no storage location: the video is requested from the server by slug.
-- This file is ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_memory_by_slug(p_slug text)
RETURNS TABLE (id uuid, slug text, title text, description text, has_photo boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT m.id, m.slug, m.title, m.description, m.photo_url IS NOT NULL
  FROM public.memories m
  WHERE m.slug = p_slug
    AND m.status = 'active'
  LIMIT 1;
$$;

ALTER FUNCTION public.get_memory_by_slug(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_memory_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_memory_by_slug(text) TO anon, authenticated, service_role;

COMMIT;
