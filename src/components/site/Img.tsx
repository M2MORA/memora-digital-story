import type { CSSProperties } from "react";
import type { OptimizedImage } from "@/lib/images.gen";

/**
 * Photo optimisée : WebP à la bonne taille pour l'écran (480 / 960 / 1600 px),
 * JPG d'origine en repli, et un aperçu flou affiché tant que la vraie photo
 * n'est pas arrivée (utile sur connexion lente).
 *
 * <picture> est en display: contents, donc les classes posées sur <img>
 * (absolute, object-cover…) se comportent comme avant.
 */
export function Img({
  image,
  alt,
  sizes,
  className,
  priority = false,
  objectPosition,
  width,
  height,
}: {
  image: OptimizedImage;
  alt: string;
  /** Largeur affichée, pour que le navigateur choisisse la bonne version */
  sizes: string;
  className?: string;
  /** Photo visible dès l'ouverture : chargée en premier, jamais en différé */
  priority?: boolean;
  objectPosition?: string;
  width?: number;
  height?: number;
}) {
  const style: CSSProperties = {
    backgroundImage: `url("${image.placeholder}")`,
    backgroundSize: "cover",
    backgroundPosition: objectPosition ?? "center",
    ...(objectPosition ? { objectPosition } : {}),
  };

  return (
    <picture className="contents">
      <source type="image/webp" srcSet={image.srcSet} sizes={sizes} />
      <img
        src={image.src}
        alt={alt}
        width={width ?? image.width}
        height={height ?? image.height}
        decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
        style={style}
        className={className}
      />
    </picture>
  );
}
