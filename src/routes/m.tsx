import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/m")({
  // This route is the parent of /m/$memorySlug, so beforeLoad also runs for the child.
  // Only redirect the bare /m path, otherwise we get an infinite redirect loop.
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/m") {
      throw redirect({ to: "/m/$memorySlug", params: { memorySlug: "demo-leila-and-sami" } });
    }
  },
  component: Outlet,
});
