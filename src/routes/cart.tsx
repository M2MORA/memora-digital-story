import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Copy, Minus, Plus, Trash2 } from "lucide-react";
import { cart, useStore } from "@/lib/cart";
import { getUnitPrice } from "@/lib/pricing";
import { buttonStyles } from "@/components/site/kit";
import { useHydrated } from "@/hooks/use-hydrated";
import { dictFromMatches, useT } from "@/i18n";
import hero from "@/assets/hero-v2.jpg";

export const Route = createFileRoute("/cart")({
  head: ({ matches }) => ({
    meta: [
      { title: `${dictFromMatches(matches).cart.title} — MÉMORA` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

const QTY_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-full border border-m-line bg-m-linen text-m-ink transition-colors hover:bg-m-blush";
const ITEM_ACTION =
  "inline-flex min-h-11 items-center gap-1.5 text-[15px] text-m-muted transition-colors hover:text-m-ink";

function CartPage() {
  const t = useT();
  const c = t.cart;
  const navigate = useNavigate();
  const { items } = useStore();
  const hydrated = useHydrated();
  const quote = cart.getQuote();

  return (
    <section className="container-x max-w-5xl pb-20 pt-10 md:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-m-line pb-6">
        <h1 className="font-serif text-[40px] leading-tight text-m-ink sm:text-[52px]">
          {c.title}
        </h1>
        {items.length > 0 && (
          <Link to="/commander" className={buttonStyles({ variant: "secondary", size: "md" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {c.add}
          </Link>
        )}
      </div>

      {!hydrated ? (
        <CartSkeleton />
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-serif text-[28px] text-m-ink">{c.emptyTitle}</p>
          <p className="mt-2 text-[17px] text-m-muted">{c.emptyLead}</p>
          <Link to="/commander" className={buttonStyles({ className: "mt-8" })}>
            {t.common.create}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <ul className="space-y-4">
            {items.map((item) => {
              const unitPrice = getUnitPrice(item.format, quote.totalQuantity);
              const minutes = Math.max(1, Math.round(item.videoDurationSec / 60));
              return (
                <li
                  key={item.key}
                  className="rounded-[20px] border border-m-line bg-m-paper p-4 sm:p-5"
                >
                  <div className="flex gap-4">
                    <img
                      src={item.photoPreviewUrl || hero}
                      alt=""
                      className="h-28 w-[84px] shrink-0 rounded-[3px] object-cover shadow-paper"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-serif text-[22px] leading-tight text-m-ink">
                            {t.product.name}
                          </h2>
                          <p className="mt-1 truncate text-[15px] text-m-muted">
                            {c.video(item.videoName || c.yourVideo, minutes)}
                          </p>
                          {item.cardMessage && (
                            <p className="mt-1 font-serif text-[17px] italic text-m-muted">
                              « {item.cardMessage} »
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-end">
                          <p className="font-serif text-[22px] font-semibold text-m-ink">
                            {t.money(unitPrice * item.qty)}
                          </p>
                          <p className="text-sm text-m-step">
                            {t.money(unitPrice)} {c.each}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-m-line pt-3">
                        <div className="flex items-center gap-2" role="group" aria-label={c.qty}>
                          <button
                            type="button"
                            onClick={() => cart.setQty(item.key, item.qty - 1)}
                            className={QTY_BUTTON}
                            aria-label={c.less}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span
                            className="min-w-8 text-center text-[17px] font-semibold text-m-ink"
                            aria-live="polite"
                          >
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => cart.setQty(item.key, item.qty + 1)}
                            className={QTY_BUTTON}
                            aria-label={c.more}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => cart.duplicate(item.key, "same_photo_new_video")}
                            className={ITEM_ACTION}
                          >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                            {c.duplicate}
                          </button>
                          <button
                            type="button"
                            onClick={() => cart.remove(item.key)}
                            className={`${ITEM_ACTION} hover:text-destructive`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {c.remove}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside
            aria-labelledby="total"
            className="h-fit rounded-[20px] border border-m-line bg-m-paper p-6 lg:sticky lg:top-24"
          >
            <h2 id="total" className="font-serif text-[26px] text-m-ink">
              {c.total}
            </h2>
            <dl className="mt-4 space-y-3 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-m-muted">{c.photos(quote.totalQuantity)}</dt>
                <dd className="text-m-ink">{t.money(quote.itemsSubtotal)}</dd>
              </div>
              {quote.framesSubtotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-m-muted">{c.frames}</dt>
                  <dd className="text-m-ink">+{t.money(quote.framesSubtotal)}</dd>
                </div>
              )}
              {quote.videoSurcharges > 0 && (
                <div className="flex justify-between">
                  <dt className="text-m-muted">{c.extraMinutes}</dt>
                  <dd className="text-m-ink">+{t.money(quote.videoSurcharges)}</dd>
                </div>
              )}
              {quote.discount > 0 && (
                <div className="flex justify-between text-m-sage">
                  <dt>{c.discount}</dt>
                  <dd>−{t.money(quote.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-m-muted">{c.shipping}</dt>
                <dd className="text-m-ink">
                  {quote.isFreeShipping ? (
                    <strong className="font-semibold text-m-sage">{c.free}</strong>
                  ) : (
                    t.money(quote.shippingCost)
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-m-line pt-4 font-serif text-[24px] font-semibold text-m-ink">
                <dt>{c.toPay}</dt>
                <dd className="shrink-0">{t.money(quote.total)}</dd>
              </div>
            </dl>
            {!quote.isFreeShipping && <p className="mt-3 text-sm text-m-step">{c.freeFrom}</p>}
            <button
              type="button"
              onClick={() => navigate({ to: "/commander", search: { stage: "delivery" } })}
              className={buttonStyles({ className: "mt-6 w-full" })}
            >
              {c.checkout}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}

/** Formes grises aux dimensions d'un article et du total, le temps de lire le panier */
function CartSkeleton() {
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]" aria-hidden="true">
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex gap-4 rounded-[20px] border border-m-line bg-m-paper p-4 sm:p-5"
          >
            <div className="h-28 w-[84px] shrink-0 animate-pulse rounded-[3px] bg-m-blush" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="h-5 w-2/3 animate-pulse rounded bg-m-blush" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-m-blush" />
              <div className="mt-6 h-11 w-36 animate-pulse rounded-full bg-m-blush" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[20px] border border-m-line bg-m-paper" />
    </div>
  );
}
