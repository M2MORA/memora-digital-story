-- MEMORA - Admin P0: paid orders locked in the database, exact stats, paging index.
--
-- 1. A paid order can no longer be changed through the API (the lock used to exist
--    only in the admin screen; the RLS policy allowed any UPDATE).
-- 2. An admin session can only change the status of an order, never the amount,
--    the items or the customer details.
-- 3. admin_stats(): exact numbers computed by the database, so the admin does not
--    have to download every order to count them.
-- 4. Index for the "newest first" order list and its paging.
--
-- Escape hatch: the SQL editor / postgres role carries no API token, so a manual
-- correction of a paid order stays possible there (and only there).
-- ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
BEGIN
  -- Not an API call (SQL editor, migration, FK action): leave it alone.
  IF v_role NOT IN ('authenticated', 'anon', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'Order % is paid: it is locked and cannot be modified', OLD.order_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- Admin sessions (browser): the status is the only editable field.
  IF v_role IN ('authenticated', 'anon')
     AND (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Only the status of an order can be changed from the admin'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.guard_order_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_order_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_order_update ON public.orders;
CREATE TRIGGER trg_guard_order_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_update();

-- Newest-first list and cursor paging
CREATE INDEX IF NOT EXISTS idx_orders_created_at_id
  ON public.orders (created_at DESC, id DESC);

-- Exact numbers for the admin overview. SECURITY INVOKER: RLS applies, so a
-- non-admin simply sees zeros.
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'count',      (SELECT count(*) FROM public.orders),
    'by_status',  coalesce(
                    (SELECT jsonb_object_agg(status, n)
                       FROM (SELECT status, count(*) AS n FROM public.orders GROUP BY status) s),
                    '{}'::jsonb),
    'todo',       (SELECT count(*) FROM public.orders WHERE status NOT IN ('paid', 'cancelled')),
    'collected',  (SELECT coalesce(sum(total), 0) FROM public.orders WHERE status = 'paid'),
    'to_collect', (SELECT coalesce(sum(total), 0) FROM public.orders WHERE status IN ('shipped', 'delivered')),
    'views',      (SELECT coalesce(sum(view_count), 0) FROM public.memories)
  );
$$;

ALTER FUNCTION public.admin_stats() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

COMMIT;
