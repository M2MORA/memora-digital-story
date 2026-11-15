-- MEMORA - Order lifecycle: one function owns status changes.
--
-- set_order_status(order, status) is the only way the admin changes a status:
-- 1. Transition graph (cash on delivery, "paid" is last and locks the order):
--      pending   -> printing | cancelled
--      printing  -> shipped  | cancelled
--      shipped   -> delivered
--      delivered -> paid
--      paid, cancelled: final
--    Mirrored in admin/src/lib/format.ts (TRANSITIONS), checked by a test.
-- 2. Cancelling archives the order's active Memories in the same transaction,
--    so a cancelled order's NFC card stops playing (no half-done state).
-- 3. Refusals are returned, not raised: {ok:false, reason}. Reasons:
--    invalid_status | not_found | paid_locked | transition_not_allowed.
--
-- SECURITY INVOKER: the admin RLS policies apply (a non-admin gets not_found).
-- trg_guard_order_update stays as the second line of defence.
-- ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_archived uuid[];
BEGIN
  IF p_status IS NULL
     OR p_status NOT IN ('pending', 'paid', 'printing', 'shipped', 'delivered', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  -- Row lock: two admins clicking at once are serialized.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paid_locked', 'from', v_order.status, 'to', p_status);
  END IF;

  IF NOT (v_order.status || '>' || p_status) = ANY (ARRAY[
    'pending>printing', 'pending>cancelled',
    'printing>shipped', 'printing>cancelled',
    'shipped>delivered',
    'delivered>paid'
  ]) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'transition_not_allowed', 'from', v_order.status, 'to', p_status);
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = p_order_id RETURNING * INTO v_order;

  IF p_status = 'cancelled' THEN
    WITH archived AS (
      UPDATE public.memories SET status = 'archived'
       WHERE order_id = p_order_id AND status = 'active'
      RETURNING id
    )
    SELECT array_agg(id) INTO v_archived FROM archived;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order', to_jsonb(v_order),
    'archived_memory_ids', to_jsonb(coalesce(v_archived, '{}'::uuid[]))
  );
END;
$$;

ALTER FUNCTION public.set_order_status(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;

COMMIT;
