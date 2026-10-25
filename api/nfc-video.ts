import { handleNfcMemoryRoute } from "../src/server";

/**
 * Vercel deployment adapter for the permanent NFC direct video streaming endpoint.
 * Accepts GET/HEAD requests to /api/nfc-video?slug=:slug.
 * Compatible with Vercel Node.js Serverless runtime and Web Request/Response API.
 */
export default async function handler(req: any, res?: any) {
  // If invoked in Web Standard Request/Response runtime (Edge or Fetch)
  if (req instanceof Request || (req && typeof req.headers?.get === "function" && req.url && !res)) {
    return handleWebFetch(req);
  }

  // Node.js serverless function on Vercel
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.setHeader("Cache-Control", "no-store");
      res.end("Méthode non autorisée");
      return;
    }

    const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "memora.tn";
    const proto = req.headers?.["x-forwarded-proto"] || "https";
    const fullUrl = new URL(req.url || "/", `${proto}://${host}`);
    const slug = fullUrl.searchParams.get("slug") ?? "";

    const headers = new Headers();
    if (req.headers) {
      for (const [key, val] of Object.entries(req.headers)) {
        if (typeof val === "string") {
          headers.set(key, val);
        } else if (Array.isArray(val)) {
          headers.set(key, val.join(", "));
        }
      }
    }

    const webRequest = new Request(fullUrl.toString(), {
      method: req.method,
      headers,
    });

    const webResponse = await handleNfcMemoryRoute(webRequest, process.env, slug);

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val: string, key: string) => {
      res.setHeader(key, val);
    });

    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err: any) {
    console.error("[api/nfc-video] Error:", err);
    if (res && !res.headersSent) {
      res.statusCode = 503;
      res.end("Service vidéo indisponible");
    }
  }
}

async function handleWebFetch(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Méthode non autorisée", {
      status: 405,
      headers: { Allow: "GET, HEAD", "cache-control": "no-store" },
    });
  }

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  return handleNfcMemoryRoute(request, process.env, slug);
}

// Keep .fetch on handler for tests compatibility
handler.fetch = handleWebFetch;
