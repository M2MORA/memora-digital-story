import { handleNfcMemoryRoute } from "../src/server";

/**
 * Vercel deployment adapter for the permanent public NFC route.
 * `vercel.json` rewrites /m/:slug here without changing the browser URL.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Méthode non autorisée", {
        status: 405,
        headers: { Allow: "GET, HEAD", "cache-control": "no-store" },
      });
    }

    const slug = new URL(request.url).searchParams.get("slug") ?? "";
    return handleNfcMemoryRoute(request, process.env, slug);
  },
};
