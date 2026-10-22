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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-sand/20 pb-6">
        <div>
          <p className="eyebrow text-deep-brown font-semibold tracking-[0.2em]">Make Memories Last</p>
          <h1 className="font-serif text-4xl sm:text-5xl text-charcoal tracking-tight mt-1">Mon Panier</h1>
        </div>
        <Link
          to="/commander"
          className="inline-flex items-center gap-2 rounded-full border border-sand/40 bg-sand/15 px-4 py-2 text-xs uppercase tracking-wider text-charcoal hover:bg-sand/30 transition-all shrink-0 font-medium"
        >
          <Plus className="h-4 w-4" />
          <span>Créer un autre tirage</span>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="py-24 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-sand/20 border border-sand/30 flex items-center justify-center mb-4 text-deep-brown">
            <Sparkles className="h-7 w-7" />
          </div>
          <p className="text-xl font-serif text-charcoal">Votre panier est encore vide</p>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Vos plus beaux souvenirs méritent mieux qu'un écran éphémère. Transformez vos instants précieux en tirages scellés pour toujours.
          </p>
          <Link
            to="/commander"
            className="mt-8 inline-block rounded-full bg-primary px-8 py-3.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg font-semibold"
          >
            Découvrir les supports &amp; Créer
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          {/* Items */}
          <div className="space-y-5">
            {items.map((item) => {
              const unitPrice = getUnitPrice(item.format, quote.totalQuantity);
              const durationExtra = getVideoSurcharge(item.videoDurationSec, item.qty);

              return (
                <div
                  key={item.key}
                  className="rounded-2xl border border-sand/20 bg-card p-6 shadow-luxury hover:shadow-luxury-lg transition-all"
                >
                  <div className="flex gap-5">
                    <img
                      src={item.photoPreviewUrl || hero}
                      alt="Photo tirage"
                      className="h-28 w-24 rounded-xl object-cover border border-sand/20 shrink-0 shadow-xs"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-serif text-xl sm:text-2xl text-charcoal">
                            {item.format === "box" || item.productId === "p2"
                              ? "Mémora Coffret (Box, Carte & Lettre)"
                              : "Mémora Simple (Enveloppe & Carte)"}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Vidéo : {item.videoName || "video_souvenir.mp4"} ({Math.floor(item.videoDurationSec / 60)}m)
                          </p>
                          {item.cardMessage && (
                            <p className="mt-1 text-xs text-muted-foreground italic font-serif">
                              Message carte : « {item.cardMessage} »
                            </p>
                          )}
                          {item.letterContent && (
                            <p className="mt-1 text-[11px] text-deep-brown font-medium flex items-center gap-1">
                              <span>✓</span> Lettre d'émotion personnalisée incluse
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-serif text-2xl text-charcoal">{formatTND(unitPrice * item.qty)}</p>
                          <p className="text-[11px] text-muted-foreground">{formatTND(unitPrice)} /u</p>
                        </div>
                      </div>

                      {/* Quantity Controls & Tools */}
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-sand/15 pt-4 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">Quantité :</span>
                          <div className="flex items-center rounded-full border border-sand/30 bg-muted/30 px-1 py-0.5 shadow-2xs">
                            <button
                              onClick={() => cart.setQty(item.key, item.qty - 1)}
                              className="p-1.5 hover:bg-sand/30 rounded-full transition-colors"
                              aria-label="Diminuer la quantité"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-3 font-semibold text-charcoal">{item.qty}</span>
                            <button
                              onClick={() => cart.setQty(item.key, item.qty + 1)}
                              className="p-1.5 hover:bg-sand/30 rounded-full transition-colors"
                              aria-label="Augmenter la quantité"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => cart.duplicate(item.key, "same_photo_new_video")}
                            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-deep-brown transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            <span>Dupliquer</span>
                          </button>
                          <button
                            onClick={() => cart.remove(item.key)}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Supprimer</span>
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
          <div className="h-fit rounded-3xl border border-sand/30 bg-linear-to-b from-cream via-cream/60 to-ivory p-6 sm:p-8 shadow-luxury">
            <h3 className="font-serif text-2xl border-b border-sand/20 pb-4 text-charcoal">Total Panier</h3>

            <div className="mt-5 space-y-3.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total tirages ({quote.totalQuantity} ex.)</span>
                <span className="font-medium text-charcoal">{formatTND(quote.itemsSubtotal)}</span>
              </div>

              {quote.framesSubtotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cadres en bois noble</span>
                  <span className="font-medium text-charcoal">+{formatTND(quote.framesSubtotal)}</span>
                </div>
              )}

              {quote.videoSurcharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplément durée vidéo</span>
                  <span className="font-medium text-charcoal">+{formatTND(quote.videoSurcharges)}</span>
                </div>
              )}

              {quote.discount > 0 && (
                <div className="flex justify-between text-deep-brown font-medium">
                  <span>Réduction appliquée</span>
                  <span>-{formatTND(quote.discount)}</span>
                </div>
              )}

              <div className="flex justify-between border-t border-sand/20 pt-3">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-deep-brown" />
                  <span>Livraison express</span>
                </span>
                <span>
                  {quote.isFreeShipping ? (
                    <strong className="text-deep-brown">Offerte</strong>
                  ) : (
                    <span className="font-medium text-charcoal">{formatTND(quote.shippingCost)}</span>
                  )}
                </span>
              </div>

              <div className="flex justify-between border-t border-sand/20 pt-4 text-xl font-serif font-bold text-charcoal">
                <span>Total à régler</span>
                <span className="text-2xl text-charcoal">{formatTND(quote.total)}</span>
              </div>
            </div>

            <button
              onClick={() => navigate({ to: "/commander", search: { stage: "delivery" } })}
              className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-charcoal transition-all shadow-luxury hover:shadow-luxury-lg hover:scale-[1.01] active:scale-[0.99] font-semibold cursor-pointer"
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
