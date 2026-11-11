import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Loader2, ShoppingBag, X } from "lucide-react";
import { placePhoto, type PhotoCrop, type Size } from "@/lib/photo-crop";
import { useT } from "@/i18n";

export function OrderHeader({
  onBack,
  cartCount,
  onOpenCart,
}: {
  onBack?: (() => void) | undefined;
  cartCount: number;
  onOpenCart: () => void;
}) {
  const o = useT().order;
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-m-line bg-m-linen/95 px-3.5 backdrop-blur-sm">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={o.back}
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-m-line bg-m-paper text-m-ink transition-colors hover:bg-m-blush"
        >
          <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" />
        </button>
      ) : (
        <span className="w-11" aria-hidden="true" />
      )}
      <Link
        to="/"
        aria-label={o.homeLabel}
        className="keep-tracking pl-[0.18em] font-serif text-[25px] font-semibold tracking-[0.18em] text-m-wine"
      >
        MÉMORA
      </Link>
      <button
        type="button"
        onClick={onOpenCart}
        disabled={cartCount === 0}
        aria-label={o.cartLabel(cartCount)}
        className="relative flex h-11 w-11 items-center justify-center text-m-ink disabled:cursor-default"
      >
        <ShoppingBag className="h-6 w-6" strokeWidth={1.8} />
        {cartCount > 0 && (
          <span className="absolute end-0 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-m-wine px-1 text-[11px] font-bold text-m-linen">
            {cartCount}
          </span>
        )}
      </button>
    </header>
  );
}

export function OrderStepper({ current }: { current: number }) {
  const o = useT().order;
  return (
    <ol
      aria-label={o.stepsLabel}
      className="flex shrink-0 justify-between gap-1 border-b border-m-line px-4 py-3.5"
    >
      {o.steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-1.5 text-[13px] ${
              active ? "font-bold text-m-ink" : done ? "text-m-sage" : "text-m-step"
            }`}
          >
            <span
              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] font-bold ${
                active
                  ? "border-m-wine bg-m-wine text-m-linen"
                  : done
                    ? "border-m-sage bg-m-sage text-white"
                    : "border-m-dot"
              }`}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-label={o.stepDone} />
              ) : (
                i + 1
              )}
            </span>
            <span className={active ? "" : "max-[359px]:sr-only"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 shrink-0 border-t border-m-line bg-m-linen px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
      {children}
    </div>
  );
}

export function OrderCta({
  label,
  onClick,
  disabled = false,
  busy = false,
  type = "button",
  form,
  showArrow = true,
}: {
  label: string;
  onClick?: (() => void) | undefined;
  disabled?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
  form?: string | undefined;
  showArrow?: boolean;
}) {
  const inactive = disabled && !busy;
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`flex h-[58px] w-full items-center justify-center gap-2.5 rounded-full text-[17px] font-bold transition-colors ${
        inactive
          ? "cursor-not-allowed bg-m-off text-m-off-ink"
          : `bg-m-wine text-m-linen shadow-[0_10px_24px_rgba(84,31,50,0.28)] ${busy ? "cursor-wait" : "hover:bg-m-ink"}`
      }`}
    >
      {busy && <Loader2 className="h-5 w-5 animate-spin" />}
      <span>{label}</span>
      {showArrow && !busy && <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />}
    </button>
  );
}

/** Feuille qui monte du bas de l'écran, comme dans la maquette */
export function BottomSheet({
  titleId,
  title,
  subtitle,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  subtitle?: string | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  const o = useT().order;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-m-night/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="mx-auto flex max-h-[92dvh] w-full max-w-[430px] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-m-paper px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[22px] outline-none animate-in slide-in-from-bottom duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-sans text-[22px] font-bold tracking-normal text-m-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-m-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={o.close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-m-blush text-m-ink"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** La photo telle qu'elle sera imprimée ; glissable quand onPan est fourni */
export function CroppedPhoto({
  photoUrl,
  natural,
  crop,
  box,
  className = "",
  onPan,
}: {
  photoUrl: string;
  natural: Size;
  crop: PhotoCrop;
  box: Size;
  className?: string;
  onPan?: ((dx: number, dy: number) => void) | undefined;
}) {
  const o = useT().order;
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const p = placePhoto(natural, box, crop);

  const handlers = onPan
    ? {
        tabIndex: 0,
        role: "img",
        "aria-label": o.panHint,
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        },
        onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          drag.current = { id: d.id, x: e.clientX, y: e.clientY };
          onPan(e.clientX - d.x, e.clientY - d.y);
        },
        onPointerUp: () => {
          drag.current = null;
        },
        onPointerCancel: () => {
          drag.current = null;
        },
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-12, 0],
            ArrowRight: [12, 0],
            ArrowUp: [0, -12],
            ArrowDown: [0, 12],
          };
          const move = moves[e.key];
          if (!move) return;
          e.preventDefault();
          onPan(move[0], move[1]);
        },
      }
    : {};

  return (
    <div
      {...handlers}
      className={`relative shrink-0 overflow-hidden ${onPan ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""} ${className}`}
      style={{ width: box.width, height: box.height }}
    >
      <img
        src={photoUrl}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none"
        style={{ left: p.x, top: p.y, width: p.width, height: p.height }}
      />
    </div>
  );
}
