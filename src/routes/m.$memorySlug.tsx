import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * The server normally streams /m/:memorySlug before the app is rendered.
 * This fallback covers client-side navigation, which otherwise stays inside
 * TanStack Router and would never request the server video response.
 */
export const Route = createFileRoute("/m/$memorySlug")({
  component: MemoryLinkRedirect,
});

function MemoryLinkRedirect() {
  useEffect(() => {
    window.location.replace(window.location.href);
  }, []);

  return null;
}
