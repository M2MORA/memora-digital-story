import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, type Order, type OrderStatus, type Memory } from "./supabase";
import { computeStats, deleteOrderViaApi, displayMediaUrl, mediaPath, whatsappMediaKey } from "./rules";
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

// Le site public : adresse écrite sur les puces NFC, et serveur appelé par l'admin
// (médias, suppression). Toujours en https://www.memora.tn : memora.tn redirige vers www,
// et le navigateur bloque une suppression redirigée.
export const publicSiteUrl = String(import.meta.env["VITE_PUBLIC_SITE_URL"] ?? "https://www.memora.tn").replace(/\/+$/, "");

// Le lien NFC reste stable ; la route publique le résout en URL vidéo R2 signée à chaque scan.
export const nfcLinkFor = (slug: string) => `${publicSiteUrl}/m/${encodeURIComponent(slug)}`;

export const qrCodeFor = (link: string) => qrDataUrl(link);

export function useAdminData() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [uploadIntents, setUploadIntents] = useState<UploadIntent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Vrai si la liste des fichiers clients n'a pas pu être chargée : « pas de photo »
  // ne doit alors pas être affiché comme un fait.
  const [mediaUnavailable, setMediaUnavailable] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  const apiBase = publicSiteUrl;

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

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    const [o, m, u] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("memories").select("*").order("created_at", { ascending: false }),
      supabase.from("upload_intents").select("*"),
    ]);
    const problems: string[] = [];
    if (o.error) problems.push(`Commandes non chargées : ${o.error.message}`);
    else setOrders(o.data as Order[]);
    if (m.error) problems.push(`Souvenirs non chargés : ${m.error.message}`);
    else setMemories(m.data as Memory[]);
    if (u.error) {
      problems.push(`Fichiers des clients non chargés : ${u.error.message}`);
      setMediaUnavailable(true);
    } else {
      setUploadIntents((u.data ?? []) as UploadIntent[]);
      setMediaUnavailable(false);
    }
    if (problems.length) setError(problems.join(" · "));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const currentOrder = orders.find((o) => o.id === id);
    if (currentOrder?.status === "paid") {
      alert("Cette commande a été marquée comme 'Payée'. Elle est définitivement verrouillée et ne peut plus être modifiée ou supprimée.");
      return;
    }

    if (status === "paid") {
      const confirmPaid = window.confirm(
        `Êtes-vous sûr de marquer la commande #${currentOrder?.order_number || ""} comme 'Payée' ?\n\nATTENTION : Une fois marquée comme Payée, cette commande sera définitivement verrouillée : son statut ne pourra plus jamais être changé et elle ne pourra JAMAIS être supprimée.`,
      );
      if (!confirmPaid) return;
    }

    const activeLinks = memories.filter((m) => m.order_id === id && m.status === "active");
    if (status === "cancelled" && currentOrder?.status !== "cancelled") {
      const linkNote = activeLinks.length
        ? `\n\nSon lien NFC sera désactivé : la vidéo ne s'ouvrira plus. Tu pourras le réactiver dans Souvenirs.`
        : "";
      if (!window.confirm(`Annuler la commande #${currentOrder?.order_number || ""} ?${linkNote}`)) return;
    }

    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return setError(error.message);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

    // Une commande annulée ne doit plus diffuser la vidéo du client.
    if (status === "cancelled" && activeLinks.length) {
      const { data: archived, error: memError } = await supabase
        .from("memories")
        .update({ status: "archived" })
        .eq("order_id", id)
        .eq("status", "active")
        .select("id");
      if (memError) {
        return setError(
          `Commande annulée, mais son lien NFC est toujours actif (${memError.message}). Archive-le dans Souvenirs.`,
        );
      }
      const ids = new Set((archived ?? []).map((r: { id: string }) => r.id));
      setMemories((prev) => prev.map((x) => (ids.has(x.id) ? { ...x, status: "archived" } : x)));
    }
  };

  const deleteOrder = async (id: string, orderNumber: string): Promise<boolean> => {
    const target = orders.find((o) => o.id === id);
    if (target?.status === "paid") {
      alert("Action impossible : une commande payée ne peut JAMAIS être supprimée.");
      return false;
    }
    if (target?.status !== "cancelled") {
      alert("Seules les commandes ayant le statut 'Annulée' peuvent être supprimées de la base de données.");
      return false;
    }

    if (!window.confirm(`Voulez-vous vraiment supprimer définitivement la commande annulée #${orderNumber} de la base de données ?`)) {
      return false;
    }
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée, veuillez vous reconnecter.");

      await deleteOrderViaApi({ apiBase, accessToken: session.access_token, orderId: id });
      setOrders((prev) => prev.filter((o) => o.id !== id));
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Échec de la suppression de la commande #${orderNumber} : ${message}`);
      return false;
    }
  };

  const setMemoryStatus = async (id: string, status: Memory["status"]) => {
    const { error } = await supabase.from("memories").update({ status }).eq("id", id);
    if (error) return setError(error.message);
    setMemories((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
  };

  const createMemory = async (o: Order, itemIndex: number) => {
    const it = o.items[itemIndex];
    if (!it) return;
    const slug = slugFor(o, itemIndex);
    const videoUrl = storedMediaFor(o, it, "video", itemIndex);
    const photoUrl = storedMediaFor(o, it, "photo", itemIndex);

    if (!videoUrl) {
      alert("Attention : la vidéo de ce tirage n'a pas été reçue.");
      return;
    }

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

    if (error) return setError(error.message);
    setMemories((prev) => [data as Memory, ...prev]);
    await copyLink(slug);
  };

  const stats = useMemo(() => computeStats(orders, memories), [orders, memories]);

  /** Adresse d'affichage d'un média enregistré dans un souvenir (liste Souvenirs). */
  const memoryMediaUrl = (stored: string | null | undefined) => displayMediaUrl(stored, apiBase);

  return {
    orders,
    memories,
    error,
    setError,
    loading,
    mediaUnavailable,
    memoryMediaUrl,
    copiedSlug,
    downloadingUrl,
    slugFor,
    resolveMedia,
    copyLink,
    downloadPhotoPdf,
    load,
    updateStatus,
    deleteOrder,
    setMemoryStatus,
    createMemory,
    stats,
  };
}

export type AdminData = ReturnType<typeof useAdminData>;
