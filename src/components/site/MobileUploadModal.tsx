import { useState, useEffect } from "react";
import { X, Smartphone, QrCode, Copy, Check, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function MobileUploadModal({
  isOpen,
  onClose,
  onVideoReceived,
}: {
  isOpen: boolean;
  onClose: () => void;
  onVideoReceived: (videoData: { url: string; name: string; durationSec: number }) => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(7140); // ~1h 59m
  const [copied, setCopied] = useState(false);
  const [isSimulatingUpload, setIsSimulatingUpload] = useState(false);
  const sessionId = "mob_" + Math.random().toString(36).substring(2, 10);
  const mobileUrl = `${typeof window !== "undefined" ? window.location.origin : "https://memora.tn"}/m-upload/${sessionId}`;

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${hours > 0 ? `${hours} H ` : ""}${minutes.toString().padStart(2, "0")} MIN ${seconds.toString().padStart(2, "0")} S`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    toast.success("Lien copié dans le presse-papiers");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSimulateMobileUpload = () => {
    setIsSimulatingUpload(true);
    setTimeout(() => {
      setIsSimulatingUpload(false);
      onVideoReceived({
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        name: "video_mobile_souvenir.mp4",
        durationSec: 15,
      });
      toast.success("Vidéo reçue depuis votre smartphone !");
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl sm:p-8 animate-in zoom-in-95">
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-cream hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sand/30 text-deep-brown mb-3">
            <Smartphone className="h-6 w-6" />
          </div>
          <h3 className="font-serif text-2xl">Transférer depuis votre téléphone</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Vos vidéos les plus récentes sont souvent sur votre smartphone.
          </p>
        </div>

        {/* QR Code and Countdown Card */}
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-border bg-cream/40 p-6 text-center">
          {/* Validity Countdown */}
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-[11px] font-semibold text-deep-brown shadow-2xs border border-border">
            <Clock className="h-3 w-3" />
            <span>SESSION VALABLE {timeFormatted}</span>
          </div>

          {/* Realistic QR Code Graphic */}
          <div className="relative flex h-48 w-48 items-center justify-center rounded-xl bg-white p-3 shadow-md border border-border">
            {/* SVG QR Code representation */}
            <svg
              className="h-full w-full text-charcoal"
              viewBox="0 0 100 100"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Corner position markers */}
              <rect x="5" y="5" width="26" height="26" rx="2" fill="currentColor" />
              <rect x="9" y="9" width="18" height="18" fill="white" />
              <rect x="13" y="13" width="10" height="10" fill="currentColor" />

              <rect x="69" y="5" width="26" height="26" rx="2" fill="currentColor" />
              <rect x="73" y="9" width="18" height="18" fill="white" />
              <rect x="77" y="13" width="10" height="10" fill="currentColor" />

              <rect x="5" y="69" width="26" height="26" rx="2" fill="currentColor" />
              <rect x="9" y="73" width="18" height="18" fill="white" />
              <rect x="13" y="77" width="10" height="10" fill="currentColor" />

              {/* Data modules pattern */}
              <rect x="36" y="8" width="5" height="5" />
              <rect x="46" y="8" width="5" height="5" />
              <rect x="56" y="8" width="5" height="5" />
              <rect x="36" y="18" width="5" height="5" />
              <rect x="51" y="18" width="5" height="5" />
              <rect x="36" y="28" width="5" height="5" />
              <rect x="46" y="28" width="5" height="5" />
              <rect x="56" y="28" width="5" height="5" />

              <rect x="8" y="36" width="5" height="5" />
              <rect x="18" y="36" width="5" height="5" />
              <rect x="28" y="36" width="5" height="5" />
              <rect x="38" y="36" width="5" height="5" />
              <rect x="48" y="36" width="5" height="5" />
              <rect x="58" y="36" width="5" height="5" />
              <rect x="68" y="36" width="5" height="5" />
              <rect x="78" y="36" width="5" height="5" />
              <rect x="88" y="36" width="5" height="5" />

              <rect x="38" y="46" width="6" height="6" />
              <rect x="48" y="46" width="6" height="6" />
              <rect x="68" y="46" width="6" height="6" />
              <rect x="88" y="46" width="6" height="6" />

              <rect x="8" y="56" width="5" height="5" />
              <rect x="23" y="56" width="5" height="5" />
              <rect x="38" y="56" width="5" height="5" />
              <rect x="53" y="56" width="5" height="5" />
              <rect x="68" y="56" width="5" height="5" />
              <rect x="83" y="56" width="5" height="5" />

              <rect x="36" y="69" width="5" height="5" />
              <rect x="46" y="69" width="5" height="5" />
              <rect x="56" y="69" width="5" height="5" />
              <rect x="76" y="69" width="5" height="5" />
              <rect x="86" y="69" width="5" height="5" />

              <rect x="41" y="79" width="5" height="5" />
              <rect x="61" y="79" width="5" height="5" />
              <rect x="81" y="79" width="5" height="5" />

              <rect x="36" y="89" width="5" height="5" />
              <rect x="51" y="89" width="5" height="5" />
              <rect x="71" y="89" width="5" height="5" />
              <rect x="86" y="89" width="5" height="5" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-white p-1.5 shadow-xs border border-border">
                <QrCode className="h-6 w-6 text-deep-brown" />
              </span>
            </div>
          </div>

          <p className="mt-4 text-xs font-medium text-charcoal">
            Pointez l'appareil photo de votre mobile vers ce QR code
          </p>

          {/* Polling status */}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-taupe">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-deep-brown opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-deep-brown"></span>
            </span>
            <span>En attente de connexion depuis votre mobile...</span>
          </div>
        </div>

        {/* Fallback link */}
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-background border border-border p-3 text-xs">
          <span className="truncate text-muted-foreground">{mobileUrl}</span>
          <button
            onClick={handleCopyLink}
            className="flex shrink-0 items-center gap-1 rounded-sm bg-cream px-2.5 py-1 text-charcoal hover:bg-sand transition-colors font-medium"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-deep-brown" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>

        {/* Fast simulation button for demo testing */}
        <div className="mt-5 text-center">
          <button
            onClick={handleSimulateMobileUpload}
            disabled={isSimulatingUpload}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-deep-brown underline underline-offset-4"
          >
            {isSimulatingUpload ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Réception de la vidéo en cours...
              </>
            ) : (
              "Tester directement avec une vidéo d'exemple mobile"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
