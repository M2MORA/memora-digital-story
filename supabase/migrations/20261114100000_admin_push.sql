-- MEMORA - Admin push notifications: "new order" reaches the admin phone.
--
-- Web orders are created by the customer's browser (RPC finalize_order_with_intents)
-- and WhatsApp orders by the server, so the only common point is the INSERT into
-- public.orders. A trigger calls the site (pg_net, asynchronous) with the order id
-- ONLY; the site then reads the order and sends the Web Push.
--
-- The trigger never blocks or fails an order: any error is swallowed.
--
-- After applying this file, configure the webhook ONCE in the SQL editor
-- (secret = the ORDER_WEBHOOK_SECRET value set on the site):
--
--   insert into public.admin_push_config (id, webhook_url, webhook_secret)
--   values (1, 'https://www.memora.tn/api/internal/order-created', '<ORDER_WEBHOOK_SECRET>')
--   on conflict (id) do update
--     set webhook_url = excluded.webhook_url, webhook_secret = excluded.webhook_secret;
--
-- To stop notifications: delete from public.admin_push_config;
-- ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Devices (one row per browser/phone) that receive the notifications
CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL CHECK (char_length(endpoint) BETWEEN 20 AND 2048),
  p256dh TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
  auth TEXT NOT NULL CHECK (char_length(auth) BETWEEN 8 AND 100),
  user_agent TEXT CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  failures INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_push_subscriptions_user
  ON public.admin_push_subscriptions(user_id);

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- An admin sees and removes only their own devices. Adding goes through the
-- server (it validates the endpoint), which writes with the service role.
DROP POLICY IF EXISTS "Admins read own push subscriptions" ON public.admin_push_subscriptions;
CREATE POLICY "Admins read own push subscriptions"
ON public.admin_push_subscriptions FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' AND user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins delete own push subscriptions" ON public.admin_push_subscriptions;
CREATE POLICY "Admins delete own push subscriptions"
ON public.admin_push_subscriptions FOR DELETE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' AND user_id = (select auth.uid()));

REVOKE ALL ON TABLE public.admin_push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, DELETE ON TABLE public.admin_push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_push_subscriptions TO service_role;

-- 2. Where the trigger calls. RLS on and NO policy: nobody but the database owner
--    and the service role can read the secret.
CREATE TABLE IF NOT EXISTS public.admin_push_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  webhook_url TEXT NOT NULL CHECK (webhook_url LIKE 'https://%'),
  webhook_secret TEXT NOT NULL CHECK (char_length(webhook_secret) >= 24)
);

ALTER TABLE public.admin_push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_push_config FROM PUBLIC, anon, authenticated;

-- 3. The trigger: order id only, never customer data
CREATE OR REPLACE FUNCTION public.notify_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, net, pg_temp
AS $$
DECLARE
  v_cfg public.admin_push_config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.admin_push_config WHERE id = 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_cfg.webhook_url,
    body := jsonb_build_object('order_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cfg.webhook_secret
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification problem must never prevent an order.
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_order_created() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_order_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_order_created ON public.orders;
CREATE TRIGGER trg_notify_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_created();

COMMIT;
