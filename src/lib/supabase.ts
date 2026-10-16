import { createClient } from "@supabase/supabase-js";

// Normaliser l'URL Supabase en supprimant d'éventuels suffixes comme /rest/v1 ou des slashs finaux
const rawUrl = String(import.meta.env["VITE_SUPABASE_URL"] ?? "").trim();
export const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
export const supabaseAnonKey = String(import.meta.env["VITE_SUPABASE_ANON_KEY"] ?? "").trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("your-project-id") &&
    !supabaseAnonKey.includes("your-anon-or-publishable-key"),
);

// Client Supabase connecté à votre projet
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export type MemoryRecord = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  video_url: string;
  photo_url?: string | null;
  aspect_ratio?: string;
  view_count?: number;
  status: "active" | "draft" | "archived";
  nfc_uid?: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at?: string;
};

export type OrderRecord = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  shipping_address: Record<string, unknown>;
  items: unknown[];
  subtotal: number;
  shipping_fee: number;
  total: number;
  currency: string;
  status: "pending" | "paid" | "printing" | "shipped" | "delivered" | "cancelled";
  payment_provider?: string;
  payment_id?: string;
  created_at: string;
};

export type NewOrderPayload = {
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  shipping_address: Record<string, unknown>;
  items: unknown[];
  subtotal: number;
  shipping_fee: number;
  total: number;
  currency?: string;
  status?: "pending" | "paid" | "printing" | "shipped" | "delivered" | "cancelled";
};

/**
 * Récupère un souvenir depuis Supabase par son slug (utilisé lors du scan NFC /m/:slug)
 */
export async function getMemoryBySlug(slug: string): Promise<MemoryRecord | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.warn("Erreur lecture souvenir Supabase:", error.message);
      return null;
    }

    // Incrémenter le compteur de scans/vues de manière discrète
    if (data?.id) {
      void supabase.rpc("increment_memory_views", { memory_id: data.id }).then(({ error: rpcErr }) => {
        if (rpcErr) {
          // Fallback simple si la fonction RPC n'existe pas encore
          void supabase
            .from("memories")
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq("id", data.id);
        }
      });
    }

    return data as MemoryRecord | null;
  } catch (err) {
    console.error("Exception lecture souvenir:", err);
    return null;
  }
}

/**
 * Enregistre une nouvelle commande directement dans la table `orders` de Supabase
 */
export async function saveOrderToSupabase(orderData: NewOrderPayload): Promise<{ success: boolean; data?: OrderRecord; error?: string }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: "Supabase non configuré" };
  }

  try {
    const { error } = await supabase.from("orders").insert([
      {
        order_number: orderData.order_number,
        customer_name: orderData.customer_name,
        customer_email: orderData.customer_email,
        customer_phone: orderData.customer_phone || null,
        shipping_address: orderData.shipping_address,
        items: orderData.items,
        subtotal: orderData.subtotal,
        shipping_fee: orderData.shipping_fee,
        total: orderData.total,
        currency: orderData.currency || "TND",
        status: orderData.status || "pending",
      },
    ]);

    if (error) {
      console.error("Erreur enregistrement commande Supabase:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Exception enregistrement commande:", err);
    return { success: false, error: err?.message || "Erreur inconnue" };
  }
}

const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;

/**
 * Upload résumable (protocole TUS) par morceaux de 6 Mo, avec reprises automatiques.
 */
async function uploadResumable(
  file: File,
  bucket: string,
  objectName: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const tus = await import("tus-js-client");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const projectHost = new URL(supabaseUrl).hostname.replace(".supabase.co", "");
  const headers: Record<string, string> = { apikey: supabaseAnonKey, "x-upsert": "false" };
  if (session?.access_token) headers["authorization"] = `Bearer ${session.access_token}`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${projectHost}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // imposé par Supabase
      onError: reject,
      onProgress: (sent, total) => onProgress?.(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    });
    void upload.findPreviousUploads().then((prev) => {
      if (prev[0]) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}

/**
 * Uploade une vidéo ou photo vers Supabase Storage (résumable au-delà de 6 Mo)
 */
export async function uploadMediaToSupabase(
  file: File,
  bucket: "videos" | "photos",
  customPath?: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string | null; error?: string }> {
  if (!isSupabaseConfigured) {
    return { url: null, error: "Supabase non configuré" };
  }

  try {
    const ext = file.name.split(".").pop() || (bucket === "videos" ? "mp4" : "jpg");
    const fileName = customPath || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;

    let uploaded = false;
    if (file.size > RESUMABLE_THRESHOLD) {
      try {
        await uploadResumable(file, bucket, fileName, onProgress);
        uploaded = true;
      } catch (tusErr) {
        console.warn("Upload résumable échoué, tentative standard :", tusErr);
      }
    }

    if (!uploaded) {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) {
        return { url: null, error: uploadError.message };
      }
      onProgress?.(100);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return { url: data.publicUrl };
  } catch (err: any) {
    return { url: null, error: err?.message || "Erreur upload" };
  }
}

/**
 * Envoie un média du navigateur (blob: ou data:) vers Supabase Storage.
 * Les URL http(s) distantes (ex. médias de démo) sont renvoyées telles quelles.
 */
export async function uploadFromBrowserUrl(
  url: string | undefined,
  bucket: "videos" | "photos",
  orderNumber: string,
  label: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string | null; error?: string }> {
  if (!url) return { url: null };
  if (/^https?:\/\//i.test(url)) return { url };
  if (!url.startsWith("blob:") && !url.startsWith("data:")) return { url: null };

  try {
    const blob = await (await fetch(url)).blob();
    const ext =
      blob.type.split("/")[1]?.split(";")[0] || (bucket === "videos" ? "mp4" : "jpg");
    const file = new File([blob], `${label}.${ext}`, { type: blob.type });
    return await uploadMediaToSupabase(file, bucket, `${orderNumber}/${label}.${ext}`, onProgress);
  } catch (err: any) {
    return { url: null, error: err?.message || "Erreur lecture fichier" };
  }
}
