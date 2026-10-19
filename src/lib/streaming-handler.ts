/**
 * MÉMORA — Gestionnaire de Streaming Vidéo & Plages d'Octets HTTP (Phase 1.1)
 *
 * Conforme RFC 9110 / RFC 7233 :
 * - Gestion complète du header `Range: bytes=start-end`.
 * - Évaluation rigoureuse de `If-None-Match` (ETags forts et faibles, listes, wildcard '*') -> 304 Not Modified.
 * - Évaluation rigoureuse de `If-Modified-Since` -> 304 Not Modified.
 * - Évaluation rigoureuse de `If-Range` (validateur fort requis) -> 206 vs 200.
 * - Traitement des requêtes HEAD (mêmes en-têtes que GET sans corps).
 * - Traitement des plages invalides ou insatisfiables -> HTTP 416 Range Not Satisfiable.
 * - En-têtes standards : `Content-Range`, `Content-Length`, `Accept-Ranges: bytes`, `ETag`, `Last-Modified`.
 */

export interface RangeSpec {
  start: number;
  end: number;
}

export interface StreamingRequestOptions {
  method?: "GET" | "HEAD";
  rangeHeader: string | null;
  ifRangeHeader?: string | null;
  ifNoneMatchHeader?: string | null;
  ifModifiedSinceHeader?: string | null;
  totalSize: number;
  contentType: string;
  etag: string;
  lastModified?: string;
}

export type StreamingDecision =
  | {
      status: 200;
      headers: Record<string, string>;
      range: null;
      isHead: boolean;
    }
  | {
      status: 206;
      headers: Record<string, string>;
      range: RangeSpec;
      isHead: boolean;
    }
  | {
      status: 304;
      headers: Record<string, string>;
      range: null;
      isHead: boolean;
    }
  | {
      status: 416;
      headers: Record<string, string>;
      range: null;
      isHead: boolean;
    };

/**
 * Normalise un ETag en retirant les guillemets et le préfixe W/
 */
export function normalizeEtag(etag: string | undefined | null): string {
  if (!etag) return "";
  return etag.trim().replace(/^W\//, "").replace(/^"/, "").replace(/"$/, "");
}

/**
 * Vérifie si un ETag est faible (Weak ETag)
 */
export function isWeakEtag(etag: string | undefined | null): boolean {
  if (!etag) return false;
  return etag.trim().startsWith("W/");
}

/**
 * Compare deux ETags pour If-Range.
 * Selon RFC 9110 §13.1.5 : La comparaison pour If-Range requiert une correspondance forte (strong comparison).
 * Si le validateur de l'entité ou du header est faible, la comparaison forte échoue -> renvoi 200 complet.
 */
export function matchesIfRangeEtag(headerEtag: string, currentEtag: string): boolean {
  const cleanHeader = headerEtag.trim();
  const cleanCurrent = currentEtag.trim();

  // Si l'un des deux est marqué faible (W/), ce n'est pas un match fort pour If-Range
  if (cleanHeader.startsWith("W/") || cleanCurrent.startsWith("W/")) {
    return false;
  }

  return normalizeEtag(cleanHeader) === normalizeEtag(cleanCurrent);
}

/**
 * Évalue If-None-Match (RFC 9110 §13.1.2) :
 * - Correspondance faible autorisée (weak comparison).
 * - Supporte wildcard '*' et listes séparées par des virgules.
 */
export function matchesIfNoneMatch(ifNoneMatchHeader: string, currentEtag: string): boolean {
  const trimmed = ifNoneMatchHeader.trim();
  if (trimmed === "*") {
    return true;
  }

  const tags = trimmed.split(",").map((t) => t.trim());
  const cleanTarget = normalizeEtag(currentEtag);

  for (const tag of tags) {
    if (tag === "*" || normalizeEtag(tag) === cleanTarget) {
      return true;
    }
  }

  return false;
}

/**
 * Analyse le header Range et extrait les plages demandées
 */
export function parseByteRange(rangeHeader: string, totalSize: number): RangeSpec[] | null {
  if (!rangeHeader.startsWith("bytes=")) {
    return null;
  }

  const rawRanges = rangeHeader.slice(6).split(",");
  const ranges: RangeSpec[] = [];

  for (const part of rawRanges) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const dashIdx = trimmed.indexOf("-");
    if (dashIdx === -1) return null;

    const startStr = trimmed.slice(0, dashIdx).trim();
    const endStr = trimmed.slice(dashIdx + 1).trim();

    if (startStr === "" && endStr === "") {
      return null;
    }

    if (startStr === "") {
      // Suffix range : bytes=-500 -> les 500 derniers octets
      const suffixLen = parseInt(endStr, 10);
      if (isNaN(suffixLen) || suffixLen <= 0) return null;
      const start = Math.max(0, totalSize - suffixLen);
      ranges.push({ start, end: totalSize - 1 });
    } else if (endStr === "") {
      // Open range : bytes=500- -> du 500e octet jusqu'à la fin
      const start = parseInt(startStr, 10);
      if (isNaN(start) || start < 0) return null;
      ranges.push({ start, end: totalSize - 1 });
    } else {
      // Explicit range : bytes=100-200
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < 0) return null;
      ranges.push({ start, end: Math.min(end, totalSize - 1) });
    }
  }

  return ranges.length > 0 ? ranges : null;
}

/**
 * Prend la décision de streaming et de cache pour une requête vidéo
 */
export function resolveStreamingResponse(options: StreamingRequestOptions): StreamingDecision {
  const {
    method = "GET",
    rangeHeader,
    ifRangeHeader,
    ifNoneMatchHeader,
    ifModifiedSinceHeader,
    totalSize,
    contentType,
    etag,
    lastModified,
  } = options;

  const isHead = method === "HEAD";

  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
    ETag: etag,
  };
  if (lastModified) {
    baseHeaders["Last-Modified"] = lastModified;
  }

  // 1. Évaluation conditionnelle If-None-Match (RFC 9110 §13.1.2) -> 304 Not Modified
  if (ifNoneMatchHeader && matchesIfNoneMatch(ifNoneMatchHeader, etag)) {
    return {
      status: 304,
      headers: baseHeaders,
      range: null,
      isHead,
    };
  }

  // 2. Évaluation conditionnelle If-Modified-Since si If-None-Match absent
  if (!ifNoneMatchHeader && ifModifiedSinceHeader && lastModified) {
    const reqDate = Date.parse(ifModifiedSinceHeader);
    const modDate = Date.parse(lastModified);
    if (!isNaN(reqDate) && !isNaN(modDate) && modDate <= reqDate) {
      return {
        status: 304,
        headers: baseHeaders,
        range: null,
        isHead,
      };
    }
  }

  // 3. Sans en-tête Range : réponse complète 200 OK
  if (!rangeHeader) {
    return {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": totalSize.toString(),
      },
      range: null,
      isHead,
    };
  }

  // 4. Évaluation de If-Range (si présent)
  if (ifRangeHeader) {
    const ifRange = ifRangeHeader.trim();
    const isEtag = ifRange.includes('"') || ifRange.startsWith("W/");

    let matches = false;
    if (isEtag) {
      matches = matchesIfRangeEtag(ifRange, etag);
    } else if (lastModified) {
      matches = Date.parse(ifRange) === Date.parse(lastModified);
    }

    // Si If-Range ne correspond pas -> on envoie la ressource complète en 200 OK
    if (!matches) {
      return {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Length": totalSize.toString(),
        },
        range: null,
        isHead,
      };
    }
  }

  // 5. Analyse des plages d'octets
  const parsedRanges = parseByteRange(rangeHeader, totalSize);

  // Syntaxe invalide ou non reconnue
  if (!parsedRanges || parsedRanges.length === 0) {
    return {
      status: 416,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes */${totalSize}`,
      },
      range: null,
      isHead,
    };
  }

  // En cas de plages multiples, on prend la première plage satisfiable
  const primaryRange = parsedRanges[0]!;

  // 6. Vérification de validité de la plage (start <= end et start < totalSize)
  if (
    primaryRange.start >= totalSize ||
    primaryRange.start > primaryRange.end ||
    totalSize === 0
  ) {
    return {
      status: 416,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes */${totalSize}`,
      },
      range: null,
      isHead,
    };
  }

  const length = primaryRange.end - primaryRange.start + 1;

  // 7. Réponse partielle 206 Partial Content
  return {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${primaryRange.start}-${primaryRange.end}/${totalSize}`,
      "Content-Length": length.toString(),
    },
    range: primaryRange,
    isHead,
  };
}
