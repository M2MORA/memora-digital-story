-- MEMORA - Admin statistics page: payment date + sales numbers computed by the database.
--
-- 1. orders.paid_at: the date an order became "paid" (it did not exist, so the
--    admin could not say when money came in). Existing paid orders get their
--    creation date, which is an ESTIMATE (the real date was never recorded).
-- 2. admin_sales_kpis / admin_sales_stats: one call returns the figures, the
--    curve and the previous period, so the browser never downloads the orders.
--
-- SECURITY INVOKER everywhere: the admin RLS policies apply, a non-admin sees zeros.
-- ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- The guard from the previous migration must ignore paid_at (the trigger below sets it).
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
     AND (to_jsonb(NEW) - 'status' - 'paid_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'paid_at') THEN
    RAISE EXCEPTION 'Only the status of an order can be changed from the admin'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Record the payment date when the status becomes "paid".
-- Trigger order is alphabetical: trg_guard_order_update runs first, then this one.
CREATE OR REPLACE FUNCTION public.set_order_paid_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    NEW.paid_at := now();
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_order_paid_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_order_paid_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_set_paid_at ON public.orders;
CREATE TRIGGER trg_set_paid_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_paid_at();

-- Estimate for orders paid before this migration (creation date)
UPDATE public.orders SET paid_at = created_at WHERE status = 'paid' AND paid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
  ON public.orders (status, created_at DESC);

-- Figures for one period [p_from, p_to)
CREATE OR REPLACE FUNCTION public.admin_sales_kpis(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'orders',     count(*) FILTER (WHERE status <> 'cancelled'
                                   AND created_at >= p_from AND created_at < p_to),
    'revenue',    coalesce(sum(total) FILTER (WHERE status <> 'cancelled'
                                   AND created_at >= p_from AND created_at < p_to), 0),
    'cancelled',  count(*) FILTER (WHERE status = 'cancelled'
                                   AND created_at >= p_from AND created_at < p_to),
    'all_orders', count(*) FILTER (WHERE created_at >= p_from AND created_at < p_to),
    'collected',  coalesce(sum(total) FILTER (WHERE status = 'paid'
                                   AND coalesce(paid_at, created_at) >= p_from
                                   AND coalesce(paid_at, created_at) < p_to), 0),
    'to_collect', coalesce(sum(total) FILTER (WHERE status IN ('shipped', 'delivered')
                                   AND created_at >= p_from AND created_at < p_to), 0)
  )
  FROM public.orders
  WHERE created_at < p_to
    AND (created_at >= p_from OR (status = 'paid' AND coalesce(paid_at, created_at) >= p_from));
$$;

-- Everything the statistics page shows, in one call.
-- p_bucket: 'day' | 'week' | 'month' (days are Tunisian days).
CREATE OR REPLACE FUNCTION public.admin_sales_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text DEFAULT 'day'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_len interval;
  v_series jsonb;
  v_by_status jsonb;
  v_by_source jsonb;
BEGIN
  IF p_bucket NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'Invalid bucket %', p_bucket USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'Invalid period' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > interval '800 days' THEN
    RAISE EXCEPTION 'Period too long (800 days max)' USING ERRCODE = '22023';
  END IF;
  v_len := p_to - p_from;

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'bucket',  to_char(b.d, 'YYYY-MM-DD'),
             'orders',  coalesce(o.n, 0),
             'revenue', coalesce(o.rev, 0)
           ) ORDER BY b.d), '[]'::jsonb)
    INTO v_series
    FROM generate_series(
           date_trunc(p_bucket, p_from AT TIME ZONE 'Africa/Tunis'),
           date_trunc(p_bucket, (p_to - interval '1 microsecond') AT TIME ZONE 'Africa/Tunis'),
           ('1 ' || p_bucket)::interval
         ) AS b(d)
    LEFT JOIN (
      SELECT date_trunc(p_bucket, created_at AT TIME ZONE 'Africa/Tunis') AS d,
             count(*) AS n,
             sum(total) AS rev
        FROM public.orders
       WHERE created_at >= p_from AND created_at < p_to AND status <> 'cancelled'
       GROUP BY 1
    ) o ON o.d = b.d;

  SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
    INTO v_by_status
    FROM (SELECT status, count(*) AS n FROM public.orders
           WHERE created_at >= p_from AND created_at < p_to GROUP BY status) s;

  SELECT coalesce(jsonb_object_agg(src, jsonb_build_object('orders', n, 'revenue', rev)), '{}'::jsonb)
    INTO v_by_source
    FROM (SELECT coalesce(source, 'web') AS src, count(*) AS n, coalesce(sum(total), 0) AS rev
            FROM public.orders
           WHERE created_at >= p_from AND created_at < p_to AND status <> 'cancelled'
           GROUP BY 1) s;

  RETURN jsonb_build_object(
    'from',      p_from,
    'to',        p_to,
    'bucket',    p_bucket,
    'current',   public.admin_sales_kpis(p_from, p_to),
    'previous',  public.admin_sales_kpis(p_from - v_len, p_from),
    'series',    v_series,
    'by_status', v_by_status,
    'by_source', v_by_source
  );
END;
$$;

ALTER FUNCTION public.admin_sales_kpis(timestamptz, timestamptz) OWNER TO postgres;
ALTER FUNCTION public.admin_sales_stats(timestamptz, timestamptz, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_sales_kpis(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sales_stats(timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_kpis(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_stats(timestamptz, timestamptz, text) TO authenticated;

COMMIT;
