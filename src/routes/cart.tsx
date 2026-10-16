import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Minus, Trash2, Copy, Sparkles, ArrowRight, Truck } from "lucide-react";
import { cart, useStore } from "@/lib/cart";
import { formatTND, FREE_SHIPPING_THRESHOLD_TND, getUnitPrice, getVideoSurcharge } from "@/lib/pricing";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Votre Panier — MÉMORA" },
      { name: "description", content: "Vérifiez vos créations Mémora avant de finaliser la commande." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const { items, promoCode } = useStore();
  const quote = cart.getQuote();

  return (
    <section className="container-x min-h-[75vh] pb-28 pt-36 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="eyebrow text-deep-brown font-semibold">Make Memories Last</p>
          <h1 className="font-serif text-4xl sm:text-6xl">Mon Panier</h1>
        </div>
        <Link
          to="/commander"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-cream px-4 py-2 text-xs uppercase tracking-wider text-charcoal hover:bg-sand transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Créer un autre tirage</span>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-xl text-muted-foreground">Votre panier est encore vide.</p>
          <p className="mt-2 text-sm text-muted-foreground">Vos photos méritent mieux qu'un écran. Transformez vos instants en souvenirs pour toujours.</p>
          <Link
            to="/commander"
            className="mt-8 inline-block rounded-sm bg-primary px-8 py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-xs"
          >
            Découvrir les supports & Créer
          </Link>
        </div>
      ) : (
        <div className="mt-12 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
          {/* Items */}
          <div className="space-y-6">
            {items.map((item) => {
              const unitPrice = getUnitPrice(item.format, quote.totalQuantity);
              const durationExtra = getVideoSurcharge(item.videoDurationSec, item.qty);

              return (
                <div
                  key={item.key}
                  className="rounded-2xl border border-border bg-background p-6 shadow-xs"
                >
                  <div className="flex gap-5">
                    <img
                      src={item.photoPreviewUrl || hero}
                      alt="Photo tirage"
                      className="h-28 w-24 rounded-lg object-cover border border-border shrink-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-serif text-2xl">
                            {item.format === "box" || item.productId === "p2"
                              ? "Mémora Coffret (Box, Carte & Lettre)"
                              : "Mémora Simple (Enveloppe & Carte)"}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Vidéo : {item.videoName || "video_souvenir.mp4"} ({Math.floor(item.videoDurationSec / 60)}m)
                          </p>
                          {item.cardMessage && (
                            <p className="mt-1 text-xs text-muted-foreground italic">
                              Message carte : « {item.cardMessage} »
                            </p>
                          )}
                          {item.letterContent && (
                            <p className="mt-0.5 text-[11px] text-deep-brown font-medium">
                              ✓ Lettre d'émotion personnalisée incluse
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-serif text-2xl">{formatTND(unitPrice * item.qty)}</p>
                          <p className="text-[11px] text-muted-foreground">{formatTND(unitPrice)} /u</p>
                        </div>
                      </div>

                      {/* Quantity Controls & Tools */}
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">Quantité :</span>
                          <div className="flex items-center rounded-md border border-border">
                            <button
                              onClick={() => cart.setQty(item.key, item.qty - 1)}
                              className="p-1.5 hover:bg-cream"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-3 font-semibold">{item.qty}</span>
                            <button
                              onClick={() => cart.setQty(item.key, item.qty + 1)}
                              className="p-1.5 hover:bg-cream"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => cart.duplicate(item.key, "same_photo_new_video")}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-deep-brown"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            <span>Dupliquer</span>
                          </button>
                          <button
                            onClick={() => cart.remove(item.key)}
                            className="text-muted-foreground hover:text-destructive underline"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checkout summary */}
          <div className="h-fit rounded-2xl border border-border bg-cream/40 p-6 sm:p-8 shadow-xs">
            <h3 className="font-serif text-2xl border-b border-border pb-4">Total Panier</h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total tirages ({quote.totalQuantity} ex.)</span>
                <span>{formatTND(quote.itemsSubtotal)}</span>
              </div>

              {quote.framesSubtotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cadres en bois noble</span>
                  <span>+{formatTND(quote.framesSubtotal)}</span>
                </div>
              )}

              {quote.videoSurcharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplément durée vidéo</span>
                  <span>+{formatTND(quote.videoSurcharges)}</span>
                </div>
              )}

              {quote.discount > 0 && (
                <div className="flex justify-between text-deep-brown font-medium">
                  <span>Réduction appliquée</span>
                  <span>-{formatTND(quote.discount)}</span>
                </div>
              )}

              <div className="flex justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Livraison</span>
                <span>
                  {quote.isFreeShipping ? (
                    <strong className="text-deep-brown">Offerte</strong>
                  ) : (
                    formatTND(quote.shippingCost)
                  )}
                </span>
              </div>

              <div className="flex justify-between border-t border-border pt-4 text-xl font-serif font-bold text-charcoal">
                <span>Total à régler</span>
                <span>{formatTND(quote.total)}</span>
              </div>
            </div>

            <button
              onClick={() => navigate({ to: "/commander", search: { stage: "delivery" } })}
              className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-sm bg-primary py-4 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-colors shadow-md"
            >
              <span>Finaliser ma commande</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
