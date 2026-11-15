import { useCallback, useState } from "react";
import { supabase, type Order, type Memory } from "./supabase";
import { FETCH_BATCH, chunk, displayMediaUrl, mediaPath, mergeById, whatsappMediaKey } from "./rules";
import { publicSiteUrl } from "./api";
import { qrDataUrl } from "./qr";
import { downloadPhotoPdf as downloadPdf, printPhoto } from "./print";

export type UploadIntent = {
  id: string;
  order_id: string | null;
  draft_id: string;
  item_id: string;
  file_kind: "photo" | "video";
  storage_key: string;
  file_name: string;
  status?: string;
};

// Le lien NFC reste stable ; la route publique le résout en URL vidéo R2 signée à chaque scan.
export const nfcLinkFor = (slug: string) => `${publicSiteUrl}/m/${encodeURIComponent(slug)}`;

export const qrCodeFor = (link: string) => qrDataUrl(link);

/** Fichiers des clients des commandes affichées seulement (pas toute la table). */
async function fetchIntentsFor(list: Order[]) {
  const found: UploadIntent[] = [];
  for (const part of chunk(list, 25)) {
    const orderIds = part.map((o) => o.id).join(",");
    const draftIds = part.map((o) => o.draft_id).filter((d): d is string => !!d);
    const filter = draftIds.length
      ? `order_id.in.(${orderIds}),draft_id.in.(${draftIds.join(",")})`
      : `order_id.in.(${orderIds})`;
    const { data, error } = await supabase.from("upload_intents").select("*").or(filter);
    if (error) throw new Error(error.message);
    found.push(...((data ?? []) as UploadIntent[]));
  }
  return found;
}

/** Tous les souvenirs, par lots de 1 000 : PostgREST coupe en silence au-delà. */
async function fetchAllMemories() {
  const rows: Memory[] = [];
  for (let from = 0; ; from += FETCH_BATCH) {
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + FETCH_BATCH - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Memory[]));
    if (!data || data.length < FETCH_BATCH) return rows;
  }
}

/** Souvenirs (liens NFC) et fichiers envoyés par les clients (upload_intents). */
export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [uploadIntents, setUploadIntents] = useState<UploadIntent[]>([]);
  const [error, setError] = useState("");
  // Vrai si la liste des fichiers clients n'a pas pu être chargée : « pas de photo »
  // ne doit alors pas être affiché comme un fait.
  const [mediaUnavailable, setMediaUnavailable] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  const apiBase = publicSiteUrl;

  const load = useCallback(async () => {
    setError("");
    try {
      setMemories(await fetchAllMemories());
    } catch (err) {
      setError(`Souvenirs non chargés : ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  /** Fichiers des commandes données : remplace la liste (premier chargement) ou la complète (page suivante). */
  const loadIntentsFor = useCallback(async (list: Order[], mode: "replace" | "append") => {
    try {
      const found = await fetchIntentsFor(list);
      if (mode === "replace") {
        setUploadIntents(found);
        setMediaUnavailable(false);
      } else {
        setUploadIntents((prev) => mergeById(prev, found));
      }
    } catch (err) {
      const message = `Fichiers des clients non chargés : ${err instanceof Error ? err.message : String(err)}`;
      // Premier chargement : s'ajoute à l'erreur des souvenirs éventuelle, comme avant.
      setError((prev) => (mode === "replace" && prev ? `${prev} · ${message}` : message));
      setMediaUnavailable(true);
    }
  }, []);

  /** Souvenirs archivés par la base lors de l'annulation d'une commande. */
  const markArchived = (ids: string[]) => {
    const set = new Set(ids);
    if (set.size) setMemories((prev) => prev.map((x) => (set.has(x.id) ? { ...x, status: "archived" } : x)));
  };

  const intentFor = (o: Order, it: Record<string, unknown>, kind: "photo" | "video") => {
    const itemId = (it["id"] || it["key"]) as string | undefined;
    return uploadIntents
      .filter(
        (ui) =>
          (ui.order_id === o.id || (o.draft_id && ui.draft_id === o.draft_id)) &&
          (!itemId || ui.item_id === itemId) &&
          ui.file_kind === kind,
      )
      .sort((a, b) => {
        const scoreA = (a.order_id === o.id ? 10 : 0) + (a.status === "consumed" ? 5 : 0);
        const scoreB = (b.order_id === o.id ? 10 : 0) + (b.status === "consumed" ? 5 : 0);
        return scoreB - scoreA;
      })[0];
  };

  // Le lien NFC ne doit pas pouvoir être deviné : il reprend l'identifiant aléatoire de la
  // vidéo. Un souvenir déjà créé avec l'ancien format garde son lien.
  const slugFor = (o: Order, itemIndex: number) => {
    const legacySlug =
      o.items.length > 1 ? `${o.order_number.toLowerCase()}-${itemIndex + 1}` : o.order_number.toLowerCase();
    if (memories.some((m) => m.slug === legacySlug)) return legacySlug;

    const item = o.items[itemIndex] as Record<string, unknown> | undefined;
    const videoIntent = item ? intentFor(o, item, "video") : undefined;
    return videoIntent ? videoIntent.id.replace(/-/g, "") : legacySlug;
  };

  const copyLink = async (slug: string) => {
    await navigator.clipboard.writeText(nfcLinkFor(slug));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 3000);
  };

  const resolveMedia = (o: Order, it: Record<string, unknown>, kind: "photo" | "video", itemIndex?: number) => {
    const idx = itemIndex !== undefined ? itemIndex : o.items.indexOf(it);
    const slug = slugFor(o, idx >= 0 ? idx : 0);
    const existingMemory = memories.find((m) => m.slug === slug);
    if (kind === "photo" && existingMemory?.photo_url) return displayMediaUrl(existingMemory.photo_url, apiBase);
    if (kind === "video" && existingMemory?.video_url) return displayMediaUrl(existingMemory.video_url, apiBase);

    const direct = (kind === "photo"
      ? it["photoUrl"] || it["photo_url"] || it["photoPreviewUrl"] || it["photo"] || it["previewUrl"]
      : it["videoUrl"] || it["video_url"] || it["videoPreviewUrl"]) as string | undefined;
    if (direct) return displayMediaUrl(direct, apiBase);

    const waKey = whatsappMediaKey(it, kind);
    if (waKey) return `${apiBase}${mediaPath(waKey)}`;

    const intent = intentFor(o, it, kind);
    if (intent?.storage_key) {
      return `${apiBase}${mediaPath(intent.storage_key)}`;
    }
    return undefined;
  };

  /**
   * Adresse à enregistrer dans un souvenir : relative (/api/media?key=…), pour qu'elle
   * reste lisible depuis n'importe quel poste. La page NFC publique l'accepte telle quelle.
   */
  const storedMediaFor = (o: Order, it: Record<string, unknown>, kind: "photo" | "video", itemIndex: number) => {
    const intent = intentFor(o, it, kind);
    if (intent?.storage_key) return mediaPath(intent.storage_key);
    const waKey = whatsappMediaKey(it, kind);
    if (waKey) return mediaPath(waKey);
    return resolveMedia(o, it, kind, itemIndex);
  };

  /** Photo prête à imprimer : PDF 10 × 15 cm, 300 dpi. */
  const downloadPhotoPdf = async (url: string, filename: string) => {
    if (!url) return;
    setDownloadingUrl(url);
    try {
      await downloadPdf(url, filename);
    } catch {
      // Le stockage refuse la lecture des pixels (pas de règle CORS) : impression 10 × 15
      // du navigateur, où l'on peut imprimer directement ou « Enregistrer au format PDF ».
      try {
        await printPhoto(url);
      } catch (err) {
        setError(`Photo non imprimable : ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setDownloadingUrl(null);
    }
  };

  const setMemoryStatus = async (id: string, status: Memory["status"]) => {
    const { error } = await supabase.from("memories").update({ status }).eq("id", id);
    if (error) return setError(error.message);
    setMemories((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
  };

  /** Crée le souvenir d'un article. Renvoie "no_video" si la vidéo n'a pas été reçue (rien n'est créé). */
  const createMemory = async (o: Order, itemIndex: number): Promise<"no_video" | undefined> => {
    const it = o.items[itemIndex];
    if (!it) return;
    const slug = slugFor(o, itemIndex);
    const videoUrl = storedMediaFor(o, it, "video", itemIndex);
    const photoUrl = storedMediaFor(o, it, "photo", itemIndex);

    if (!videoUrl) return "no_video";

    const userRes = await supabase.auth.getUser();
    const currentUserId = userRes.data.user?.id ?? null;

    const { data, error } = await supabase
      .from("memories")
      .insert([
        {
          slug,
          title: `Souvenir de ${o.customer_name}`,
          description: (it["cardMessage"] as string | undefined) ?? null,
          video_url: videoUrl,
          photo_url: photoUrl ?? null,
          status: "active",
          order_id: o.id,
          user_id: currentUserId,
        },
      ])
      .select()
      .single();

    if (error) {
      setError(error.message);
      return;
    }
    setMemories((prev) => [data as Memory, ...prev]);
    await copyLink(slug);
  };

  /** Adresse d'affichage d'un média enregistré dans un souvenir (liste Souvenirs). */
  const memoryMediaUrl = (stored: string | null | undefined) => displayMediaUrl(stored, apiBase);

  return {
    memories,
    error,
    setError,
    mediaUnavailable,
    memoryMediaUrl,
    copiedSlug,
    downloadingUrl,
    slugFor,
    resolveMedia,
    copyLink,
    downloadPhotoPdf,
    load,
    loadIntentsFor,
    markArchived,
    setMemoryStatus,
    createMemory,
  };
}

export type MemoriesData = ReturnType<typeof useMemories>;
