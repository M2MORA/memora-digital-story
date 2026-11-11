import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, type Order, type OrderStatus, type Memory } from "./supabase";

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

const defaultEnvUrl = String(import.meta.env["VITE_SITE_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");

// Adresse écrite sur les puces NFC : toujours le site public, jamais l'adresse
// du serveur local utilisée par l'admin pour ses appels API.
export const publicSiteUrl = String(import.meta.env["VITE_PUBLIC_SITE_URL"] ?? "https://www.memora.tn").replace(/\/+$/, "");

// Le lien NFC reste stable ; la route publique le résout en URL vidéo R2 signée à chaque scan.
export const nfcLinkFor = (slug: string) => `${publicSiteUrl}/m/${encodeURIComponent(slug)}`;

export const qrCodeFor = (link: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(link)}`;

export function useAdminData() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [uploadIntents, setUploadIntents] = useState<UploadIntent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  // URL de base configurable (médias + suppression des commandes)
  const [siteUrl, setSiteUrl] = useState(() => {
    try {
      return localStorage.getItem("memora_admin_site_url") || defaultEnvUrl;
    } catch {
      return defaultEnvUrl;
    }
  });

  // « memora.tn » saisi sans https:// serait lu comme un chemin relatif à l'admin
  const apiBase = (() => {
    const raw = !siteUrl ? defaultEnvUrl : /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
    try {
      const api = new URL(raw);
      const site = new URL(publicSiteUrl);
      // memora.tn redirige vers www.memora.tn, et le navigateur bloque une suppression redirigée
      if (site.hostname === `www.${api.hostname}`) return site.origin;
      return api.origin;
    } catch {
      return raw;
    }
  })();

  const handleSiteUrlChange = (newUrl: string) => {
    const clean = newUrl.trim().replace(/\/+$/, "");
    setSiteUrl(clean);
    try {
      localStorage.setItem("memora_admin_site_url", clean);
    } catch {
      // stockage indisponible : la valeur reste pour cette session
    }
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
    if (kind === "photo" && existingMemory?.photo_url) return existingMemory.photo_url;
    if (kind === "video" && existingMemory?.video_url) return existingMemory.video_url;

    const direct = (kind === "photo"
      ? it["photoUrl"] || it["photo_url"] || it["photoPreviewUrl"] || it["photo"] || it["previewUrl"]
      : it["videoUrl"] || it["video_url"] || it["videoPreviewUrl"]) as string | undefined;
    if (direct) return direct;

    const intent = intentFor(o, it, kind);
    if (intent?.storage_key) {
      return `${apiBase}/api/media?key=${encodeURIComponent(intent.storage_key)}`;
    }
    return undefined;
  };

  const downloadMedia = async (url: string, filename: string) => {
    if (!url) return;
    setDownloadingUrl(url);

    try {
      if (url.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // Téléchargement par blob pour forcer le téléchargement local sans blocage Cross-Origin
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      console.warn("Échec du téléchargement direct blob, repli Supabase/navigateur:", err);
      // Pour Supabase Storage, ?download force l'en-tête Content-Disposition: attachment
      const downloadUrl = url.includes("supabase.co/storage/v1/object/public")
        ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`
        : url;

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloadingUrl(null);
    }
  };

  const downloadPhoto10x15 = async (url: string, filename: string) => {
    if (!url) return;
    setDownloadingUrl(url);

    try {
      // Préparation du tirage photo au ratio standard 10x15 cm à 300 DPI
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = url;
      });

      const isLandscape = img.naturalWidth > img.naturalHeight;
      // Standard tirage laboratoire 10x15 cm à 300 DPI = 1200 x 1800 px (ou 1800 x 1200 px)
      const targetW = isLandscape ? 1800 : 1200;
      const targetH = isLandscape ? 1200 : 1800;

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Cadrage photo proportionnel centré sans déformation
        const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
        const scaledW = img.naturalWidth * scale;
        const scaledH = img.naturalHeight * scale;
        const offsetX = (targetW - scaledW) / 2;
        const offsetY = (targetH - scaledH) / 2;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.96),
        );

        if (blob) {
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          const cleanName = filename.replace(/\.[a-zA-Z0-9]+$/, "");
          a.download = `${cleanName}-10x15.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
          return;
        }
      }
      // Repli si échec canvas
      await downloadMedia(url, filename);
    } catch (err) {
      console.warn("Échec du calibrage canvas 10x15, téléchargement direct:", err);
      await downloadMedia(url, filename);
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
    if (o.error) setError(o.error.message);
    else setOrders(o.data as Order[]);
    if (m.error) setError(m.error.message);
    else setMemories(m.data as Memory[]);
    if (!u.error && u.data) setUploadIntents(u.data as UploadIntent[]);
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

    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return setError(error.message);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
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
      // 1. Tenter via le point de terminaison sécurisé du serveur
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée, veuillez vous reconnecter.");

      const res = await fetch(`${apiBase}/api/admin/orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        return true;
      }
      const data = await res.json().catch(() => null);
      if (data?.error) {
        throw new Error(data.error);
      }
      // 2. Repli direct Supabase si l'API serveur n'est pas joignable
      const { error: delError } = await supabase.from("orders").delete().eq("id", id);
      if (delError) throw delError;
      setOrders((prev) => prev.filter((o) => o.id !== id));
      return true;
    } catch (err: any) {
      setError(`Échec de la suppression de la commande #${orderNumber}: ${err.message || err}`);
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
    const videoUrl = resolveMedia(o, it, "video", itemIndex);
    const photoUrl = resolveMedia(o, it, "photo", itemIndex);

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

  const stats = useMemo(() => {
    const valid = orders.filter((o) => o.status !== "cancelled");
    return {
      count: orders.length,
      todo: orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length,
      revenue: valid.reduce((s, o) => s + Number(o.total), 0),
      views: memories.reduce((s, m) => s + (m.view_count ?? 0), 0),
    };
  }, [orders, memories]);

  return {
    orders,
    memories,
    error,
    setError,
    loading,
    copiedSlug,
    downloadingUrl,
    siteUrl,
    handleSiteUrlChange,
    slugFor,
    resolveMedia,
    copyLink,
    downloadMedia,
    downloadPhoto10x15,
    load,
    updateStatus,
    deleteOrder,
    setMemoryStatus,
    createMemory,
    stats,
  };
}

export type AdminData = ReturnType<typeof useAdminData>;
