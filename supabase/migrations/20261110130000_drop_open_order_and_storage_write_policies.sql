-- MEMORA - Remove the open client write paths on orders and Supabase Storage.
--
-- "Allow guests and users to create order" let anyone insert an order with any
-- total, skipping server-side pricing. Checkout goes through the SECURITY
-- DEFINER function public.finalize_order_with_intents, which recalculates
-- totals and does not depend on this policy.
--
-- "Public media upload" let anyone upload any file to the public videos and
-- photos buckets. Customer media now goes to Cloudflare R2.
--
-- "Public media view" is kept so existing files in those buckets stay readable.
--
-- This file is ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

DROP POLICY IF EXISTS "Allow guests and users to create order" ON public.orders;
DROP POLICY IF EXISTS "Public media upload" ON storage.objects;

COMMIT;
