import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Move,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Sparkles,
  Sliders,
  Type,
  Check,
  Frame,
  Layers,
} from "lucide-react";

export type PhotoTemplateId = "classic" | "gallery" | "polaroid" | "minimal-gold" | "cinematic";

export interface CropSettings {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
  fineAngle: number;
  flipH: boolean;
  template: PhotoTemplateId;
  caption: string;
  aspect?: string;
}

export interface PhotoCustomizerProps {
  rawPhotoUrl: string;
  format?: string;
  cardMessage?: string;
  onComposedChange?: (composedDataUrl: string, settings: CropSettings) => void;
  className?: string;
}

export const TEMPLATES: {
  id: PhotoTemplateId;
  name: string;
  tagline: string;
  badge?: string;
}[] = [
  {
    id: "classic",
    name: "Plein Format 10×15",
    tagline: "Photo bord à bord sans marge",
    badge: "Classique",
  },
  {
    id: "gallery",
    name: "Galerie d'Art",
    tagline: "Marge blanche musée & signature",
    badge: "Élégant",
  },
  {
    id: "polaroid",
    name: "Polaroid Vintage",
    tagline: "Bordure rétro avec légende",
    badge: "Tendance",
  },
  {
    id: "minimal-gold",
    name: "Liseré Précieux",
    tagline: "Double filet or champagne",
    badge: "Luxe",
  },
  {
    id: "cinematic",
    name: "Cinématique",
    tagline: "Bandes 16:9 & sous-titre poétique",
    badge: "Émotion",
  },
];

export default function PhotoCustomizer({
  rawPhotoUrl,
  format = "10x15",
  cardMessage = "Pour toujours, je t'aime.",
  onComposedChange,
  className = "",
}: PhotoCustomizerProps) {
  // Crop & Transform state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [fineAngle, setFineAngle] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [template, setTemplate] = useState<PhotoTemplateId>("classic");
  const [caption, setCaption] = useState<string>(cardMessage || "Nos plus beaux souvenirs");
  const [previewSide, setPreviewSide] = useState<"recto" | "verso">("recto");
  const [activeTab, setActiveTab] = useState<"templates" | "crop" | "text">("templates");

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Hidden Canvas for 300 DPI Export
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Synchronize caption if cardMessage updates
  useEffect(() => {
    if (cardMessage && (!caption || caption === "Nos plus beaux souvenirs")) {
      setCaption(cardMessage);
    }
  }, [cardMessage]);

  // Handle Drag / Pan (Mouse & Touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (previewSide === "verso") return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStartRef.current.x) / (rect.width / 2);
    const dy = (e.clientY - dragStartRef.current.y) / (rect.height / 2);

    // Limit pan bounds based on zoom
    const maxPan = Math.max(0.2, zoom - 0.5);
    const newX = Math.max(-maxPan, Math.min(maxPan, panStartRef.current.x + dx));
    const newY = Math.max(-maxPan, Math.min(maxPan, panStartRef.current.y + dy));

    setPan({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Preset Fits
  const handleFit = () => {
    setZoom(0.85);
    setPan({ x: 0, y: 0 });
    setFineAngle(0);
  };

  const handleFill = () => {
    setZoom(1.15);
    setPan({ x: 0, y: 0 });
    setFineAngle(0);
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFineAngle(0);
    setFlipH(false);
    setTemplate("classic");
  };

  // Render high-res 10x15 photo onto canvas & notify parent
  const renderComposedImage = useCallback(async () => {
    if (!rawPhotoUrl) return;

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = rawPhotoUrl;
      });

      // Standard photo lab 10x15 cm @ 300 DPI = 1200 x 1800 px (2:3)
      const targetW = 1200;
      const targetH = 1800;

      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // 1. Background fill based on template
      ctx.fillStyle = template === "cinematic" ? "#181513" : "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);

      // 2. Photo Area bounding box
      let photoX = 0;
      let photoY = 0;
      let photoW = targetW;
      let photoH = targetH;

      if (template === "gallery") {
        const margin = 90;
        photoX = margin;
        photoY = margin;
        photoW = targetW - margin * 2;
        photoH = targetH - margin * 2 - 90; // space for bottom typography
      } else if (template === "polaroid") {
        const marginSide = 80;
        photoX = marginSide;
        photoY = marginSide;
        photoW = targetW - marginSide * 2;
        photoH = targetH - 360; // classic thick bottom border
      } else if (template === "cinematic") {
        photoH = Math.round(targetW * (9 / 16));
        photoX = 0;
        photoY = Math.round((targetH - photoH) / 2);
        photoW = targetW;
      }

      // 3. Clip photo inside target box
      ctx.save();
      ctx.beginPath();
      ctx.rect(photoX, photoY, photoW, photoH);
      ctx.clip();

      // Transform coordinate system
      const centerX = photoX + photoW / 2 + pan.x * (photoW / 2);
      const centerY = photoY + photoH / 2 + pan.y * (photoH / 2);

      ctx.translate(centerX, centerY);
      const totalAngle = (rotation + fineAngle) * (Math.PI / 180);
      ctx.rotate(totalAngle);
      if (flipH) ctx.scale(-1, 1);

      // Scale photo to cover photo area
      const baseScale = Math.max(photoW / img.naturalWidth, photoH / img.naturalHeight);
      const finalScale = baseScale * zoom;
      const drawW = img.naturalWidth * finalScale;
      const drawH = img.naturalHeight * finalScale;

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      // 4. Draw Template Overlays & Typography
      if (template === "gallery") {
        // Fine inner border
        ctx.strokeStyle = "rgba(90, 62, 43, 0.25)";
        ctx.lineWidth = 2;
        ctx.strokeRect(photoX, photoY, photoW, photoH);

        // Elegant gallery caption
        ctx.fillStyle = "#5a3e2b";
        ctx.font = "italic 28px 'Cormorant Garamond', Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(caption || "MÉMORA · TIRAGE D'ART", targetW / 2, targetH - 70);
      } else if (template === "polaroid") {
        // Vintage polaroid caption
        ctx.fillStyle = "#2a2522";
        ctx.font = "italic 36px 'Cormorant Garamond', Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(caption || "Un instant précieux", targetW / 2, targetH - 160);

        ctx.fillStyle = "#8a7d70";
        ctx.font = "600 18px 'Inter', sans-serif";
        ctx.letterSpacing = "0.2em";
        ctx.fillText("MÉMORA", targetW / 2, targetH - 90);
      } else if (template === "minimal-gold") {
        // Double champagne gold lines
        ctx.strokeStyle = "#c8a45d";
        ctx.lineWidth = 6;
        ctx.strokeRect(36, 36, targetW - 72, targetH - 72);

        ctx.strokeStyle = "rgba(200, 164, 93, 0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(48, 48, targetW - 96, targetH - 96);
      } else if (template === "cinematic") {
        // Cinematic subtitle
        ctx.fillStyle = "#f5efe6";
        ctx.font = "italic 28px 'Cormorant Garamond', Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(caption ? `« ${caption} »` : "M É M O R A", targetW / 2, targetH - 140);
      }

      // Convert to dataUrl and notify parent
      const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
      if (onComposedChange) {
        onComposedChange(dataUrl, {
          zoom,
          pan,
          rotation,
          fineAngle,
          flipH,
          template,
          caption,
          aspect: format,
        });
      }
    } catch (err) {
      console.warn("Could not bake composed canvas:", err);
    }
  }, [rawPhotoUrl, zoom, pan, rotation, fineAngle, flipH, template, caption, format, onComposedChange]);

  // Debounced update
  useEffect(() => {
    const timer = setTimeout(() => {
      void renderComposedImage();
    }, 150);
    return () => clearTimeout(timer);
  }, [renderComposedImage]);

  return (
    <div className={`photo-customizer-root ${className}`}>
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] items-start">
        {/* =========================================================
            LEFT COLUMN : 10x15 INTERACTIVE CANVAS PREVIEW
           ========================================================= */}
        <div className="flex flex-col items-center">
          {/* Main 10x15 Photo Card Container */}
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`relative w-full max-w-[310px] sm:max-w-[340px] aspect-[10/15] rounded-2xl shadow-luxury-lg overflow-hidden select-none touch-none transition-all ring-1 ring-black/5 ${
              isDragging ? "cursor-grabbing shadow-2xl ring-2 ring-deep-brown" : "cursor-grab"
            } ${template === "cinematic" ? "bg-[#181513]" : "bg-white"} border-4 border-white`}
          >
            {previewSide === "recto" ? (
              <div className="relative h-full w-full flex flex-col justify-between overflow-hidden">
                {/* 1. Template Overlays Structure */}
                {template === "classic" && (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={rawPhotoUrl}
                      alt="Photo tirage"
                      draggable={false}
                      style={{
                        transform: `translate(${pan.x * 50}%, ${pan.y * 50}%) scale(${zoom}) rotate(${rotation + fineAngle}deg) ${
                          flipH ? "scaleX(-1)" : ""
                        }`,
                        transformOrigin: "center center",
                        transition: isDragging ? "none" : "transform 0.15s ease-out",
                      }}
                      className="h-full w-full object-cover pointer-events-none"
                    />
                  </div>
                )}

                {template === "gallery" && (
                  <div className="absolute inset-0 p-5 flex flex-col justify-between">
                    <div className="relative flex-1 overflow-hidden rounded-xs border border-deep-brown/20 bg-cream/40">
                      <img
                        src={rawPhotoUrl}
                        alt="Photo tirage"
                        draggable={false}
                        style={{
                          transform: `translate(${pan.x * 50}%, ${pan.y * 50}%) scale(${zoom}) rotate(${rotation + fineAngle}deg) ${
                            flipH ? "scaleX(-1)" : ""
                          }`,
                          transformOrigin: "center center",
                          transition: isDragging ? "none" : "transform 0.15s ease-out",
                        }}
                        className="h-full w-full object-cover pointer-events-none"
                      />
                    </div>
                    <div className="pt-3 text-center">
                      <p className="font-serif italic text-xs tracking-wider text-deep-brown truncate px-2">
                        {caption || "MÉMORA · TIRAGE D'ART"}
                      </p>
                    </div>
                  </div>
                )}

                {template === "polaroid" && (
                  <div className="absolute inset-0 p-4 pb-6 flex flex-col justify-between">
                    <div className="relative flex-1 overflow-hidden rounded-xs bg-black/5 shadow-inner">
                      <img
                        src={rawPhotoUrl}
                        alt="Photo tirage"
                        draggable={false}
                        style={{
                          transform: `translate(${pan.x * 50}%, ${pan.y * 50}%) scale(${zoom}) rotate(${rotation + fineAngle}deg) ${
                            flipH ? "scaleX(-1)" : ""
                          }`,
                          transformOrigin: "center center",
                          transition: isDragging ? "none" : "transform 0.15s ease-out",
                        }}
                        className="h-full w-full object-cover pointer-events-none"
                      />
                    </div>
                    <div className="pt-4 pb-1 text-center">
                      <p className="font-serif italic text-sm text-charcoal truncate px-2">
                        {caption || "Un instant inoubliable"}
                      </p>
                      <p className="text-[9px] tracking-[0.25em] font-semibold text-taupe mt-1">
                        MÉMORA
                      </p>
                    </div>
                  </div>
                )}

                {template === "minimal-gold" && (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={rawPhotoUrl}
                      alt="Photo tirage"
                      draggable={false}
                      style={{
                        transform: `translate(${pan.x * 50}%, ${pan.y * 50}%) scale(${zoom}) rotate(${rotation + fineAngle}deg) ${
                          flipH ? "scaleX(-1)" : ""
                        }`,
                        transformOrigin: "center center",
                        transition: isDragging ? "none" : "transform 0.15s ease-out",
                      }}
                      className="h-full w-full object-cover pointer-events-none"
                    />
                    {/* Double Gold Line Inset */}
                    <div className="pointer-events-none absolute inset-3 border-2 border-[#c8a45d]" />
                    <div className="pointer-events-none absolute inset-4 border border-[#c8a45d]/40" />
                  </div>
                )}

                {template === "cinematic" && (
                  <div className="absolute inset-0 flex flex-col justify-between py-6">
                    <div className="flex-1" />
                    <div className="relative aspect-[16/9] w-full overflow-hidden shadow-2xl">
                      <img
                        src={rawPhotoUrl}
                        alt="Photo tirage"
                        draggable={false}
                        style={{
                          transform: `translate(${pan.x * 50}%, ${pan.y * 50}%) scale(${zoom}) rotate(${rotation + fineAngle}deg) ${
                            flipH ? "scaleX(-1)" : ""
                          }`,
                          transformOrigin: "center center",
                          transition: isDragging ? "none" : "transform 0.15s ease-out",
                        }}
                        className="h-full w-full object-cover pointer-events-none"
                      />
                    </div>
                    <div className="pt-4 text-center">
                      <p className="font-serif italic text-xs text-ivory/90 truncate px-4">
                        {caption ? `« ${caption} »` : "M É M O R A"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Floating Guide badge */}
                <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-charcoal/80 px-3 py-1 text-[10px] text-ivory backdrop-blur-md shadow-sm font-medium">
                  <Move className="h-3 w-3 text-champagne" />
                  <span>Glissez pour cadrer</span>
                </div>

                <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-deep-brown/95 backdrop-blur-md px-2.5 py-0.5 text-[9px] font-semibold text-ivory shadow-xs">
                  10 × 15 cm
                </div>
              </div>
            ) : (
              /* Verso Preview */
              <div className="p-6 text-center bg-[#FBF9F5] h-full w-full flex flex-col justify-between">
                <div>
                  <p className="font-serif text-xl tracking-wider text-charcoal">MÉMORA</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                    Tirage Photo NFC Authentique
                  </p>
                </div>
                <div className="my-auto rounded-2xl border border-dashed border-taupe/40 bg-sand/20 p-5 shadow-xs">
                  <p className="text-xs font-semibold text-charcoal">Puce NFC Haute Précision</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Approchez votre téléphone ici pour lancer la vidéo
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Sans application · Compatible iOS & Android</p>
                  <p className="text-[9px] text-taupe mt-1">Format 10x15 cm · Papier d'art 300g</p>
                </div>
              </div>
            )}

            {/* Flip Card toggle */}
            <button
              type="button"
              onClick={() => setPreviewSide(previewSide === "recto" ? "verso" : "recto")}
              className="absolute bottom-3 right-3 z-10 rounded-full bg-charcoal/90 px-3.5 py-2 text-[10px] uppercase tracking-wider text-ivory backdrop-blur hover:bg-charcoal transition-all shadow-md active:scale-95"
            >
              {previewSide === "recto" ? "Voir le verso (NFC)" : "Voir la photo"}
            </button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground text-center">
            💡 Astuce : <strong>Cliquez et déplacez</strong> la photo avec votre souris ou votre doigt pour la positionner parfaitement.
          </p>
        </div>

        {/* =========================================================
            RIGHT COLUMN : CONTROLS & TEMPLATES PICKER
           ========================================================= */}
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <div>
              <h3 className="font-serif text-2xl text-charcoal">Personnalisation du Tirage</h3>
              <p className="text-xs text-muted-foreground">Format 10×15 cm standard d'art</p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-deep-brown transition-colors py-1"
              title="Réinitialiser tous les réglages"
            >
              <RefreshCcw className="h-3 w-3" />
              <span>Réinitialiser</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 rounded-2xl bg-cream/60 p-1.5 border border-border/80 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab("templates")}
              className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "templates"
                  ? "bg-card text-deep-brown shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-charcoal"
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-champagne" />
              <span>1. Modèles & Cadres</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("crop")}
              className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "crop"
                  ? "bg-card text-deep-brown shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-charcoal"
              }`}
            >
              <Sliders className="h-3.5 w-3.5 text-champagne" />
              <span>2. Taille & Zoom</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("text")}
              className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "text"
                  ? "bg-card text-deep-brown shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-charcoal"
              }`}
            >
              <Type className="h-3.5 w-3.5 text-champagne" />
              <span>3. Légende</span>
            </button>
          </div>

          {/* TAB 1: TEMPLATES */}
          {activeTab === "templates" && (
            <div className="space-y-3 animate-in fade-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                Choisissez votre style de tirage d'art :
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {TEMPLATES.map((t) => {
                  const isSelected = template === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(t.id)}
                      className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                        isSelected
                          ? "border-deep-brown bg-sand/25 shadow-xs ring-1 ring-deep-brown/20"
                          : "border-border/80 bg-background hover:bg-cream/40"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-serif text-sm font-semibold text-charcoal">{t.name}</span>
                        {isSelected && (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-deep-brown text-ivory shadow-xs">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{t.tagline}</p>
                      {t.badge && (
                        <span className="mt-2 rounded-full bg-cream border border-border/60 px-2 py-0.5 text-[9px] font-medium text-deep-brown">
                          {t.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {template !== "classic" && (
                <div className="rounded-xl border border-sand bg-cream/30 p-3.5 mt-2">
                  <p className="text-xs font-medium text-deep-brown">
                    ✨ Modèle actif : <strong>{TEMPLATES.find((t) => t.id === template)?.name}</strong>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Vous pouvez personnaliser le texte et la légende dans l'onglet « 3. Légende ».
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CROP & ADJUSTMENTS */}
          {activeTab === "crop" && (
            <div className="space-y-5 animate-in fade-in">
              {/* Zoom controls */}
              <div>
                <div className="flex justify-between items-center text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-semibold text-charcoal">
                    <ZoomIn className="h-3.5 w-3.5 text-champagne" />
                    Zoom & Redimensionnement
                  </span>
                  <span className="rounded-md bg-cream border border-border/60 px-2 py-0.5 font-mono text-[11px] text-deep-brown font-semibold">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.6, parseFloat((z - 0.1).toFixed(2))))}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-background hover:bg-cream transition-colors shadow-xs"
                    title="Zoom arrière"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="range"
                    min={0.6}
                    max={2.5}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="flex-1 accent-deep-brown"
                  />
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2.5, parseFloat((z + 0.1).toFixed(2))))}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-background hover:bg-cream transition-colors shadow-xs"
                    title="Zoom avant"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleFill}
                    className="flex-1 rounded-xl border border-border/80 bg-background py-2 text-[11px] font-medium hover:bg-cream transition-colors flex items-center justify-center gap-1 shadow-xs"
                  >
                    <Maximize2 className="h-3 w-3" />
                    <span>Remplir (10×15)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFit}
                    className="flex-1 rounded-xl border border-border/80 bg-background py-2 text-[11px] font-medium hover:bg-cream transition-colors flex items-center justify-center gap-1 shadow-xs"
                  >
                    <Minimize2 className="h-3 w-3" />
                    <span>Photo entière (Fit)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPan({ x: 0, y: 0 })}
                    className="rounded-xl border border-border/80 bg-background px-3 py-2 text-[11px] font-medium hover:bg-cream transition-colors shadow-xs"
                    title="Recentrer"
                  >
                    Centrer
                  </button>
                </div>
              </div>

              {/* Rotation & Flip */}
              <div className="pt-2 border-t border-border/60">
                <div className="flex justify-between items-center text-xs font-medium text-muted-foreground mb-2">
                  <span className="flex items-center gap-1.5 font-semibold text-charcoal">
                    <RotateCw className="h-3.5 w-3.5 text-champagne" />
                    Orientation & Miroir
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-charcoal">{rotation}°</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="flex-1 rounded-xl border border-border/80 bg-background py-2.5 text-xs font-medium hover:bg-cream transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>Pivoter 90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipH((f) => !f)}
                    className={`flex-1 rounded-xl border py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-xs ${
                      flipH
                        ? "border-deep-brown bg-sand/30 text-deep-brown"
                        : "border-border/80 bg-background hover:bg-cream"
                    }`}
                  >
                    <FlipHorizontal className="h-3.5 w-3.5" />
                    <span>Effet Miroir</span>
                  </button>
                </div>
              </div>

              {/* Fine horizon alignment */}
              <div className="pt-2 border-t border-border/60">
                <div className="flex justify-between items-center text-xs font-medium text-muted-foreground mb-1">
                  <span>Redresser l'horizon (alignement fin)</span>
                  <span className="font-mono text-[11px] font-semibold text-charcoal">{fineAngle > 0 ? `+${fineAngle}` : fineAngle}°</span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={fineAngle}
                  onChange={(e) => setFineAngle(parseFloat(e.target.value))}
                  className="w-full accent-deep-brown"
                />
              </div>
            </div>
          )}

          {/* TAB 3: TEXT & CAPTION */}
          {activeTab === "text" && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-charcoal flex justify-between">
                  <span>Légende ou date sur le tirage</span>
                  <span className="text-[11px] font-normal text-muted-foreground">{caption.length}/60 car.</span>
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Ex : Mariage de Sarah & Yassine · 2026"
                  className="mt-1.5 w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-hidden focus:border-champagne focus:ring-1 focus:ring-champagne/30 shadow-xs"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Cette légende apparaît élégamment sur les modèles <strong>Polaroid</strong>, <strong>Galerie d'Art</strong> et <strong>Cinématique</strong>.
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-cream/40 p-4 shadow-xs">
                <p className="text-xs font-semibold text-charcoal">Exemples d'inspirations :</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {[
                    "Pour toujours, je t'aime.",
                    "Notre plus beau voyage",
                    "Le plus beau jour de notre vie",
                    "17 Octobre 2026",
                    "Moments précieux en famille",
                  ].map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => setCaption(phrase)}
                      className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs hover:border-champagne hover:text-deep-brown transition-colors shadow-xs"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
