-- MEMORA - Order lifecycle: only a cancelled order can be deleted, enforced by the database.
--
-- The admin delete goes through DELETE /api/admin/orders with the service role,
-- which bypasses RLS, so the guard is a trigger: it applies to every caller
-- (service role, admin session, SQL editor). There is still NO DELETE policy on
-- public.orders and there must never be one.
-- Rows that point to the order (memories, upload_intents, wa_*) keep their
-- ON DELETE SET NULL behaviour when a cancelled order is deleted.
-- To delete a non-cancelled order by hand: cancel it first.
-- ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Order % is %: only cancelled orders can be deleted', OLD.order_number, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION public.guard_order_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_order_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_order_delete ON public.orders;
CREATE TRIGGER trg_guard_order_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_delete();

COMMIT;
