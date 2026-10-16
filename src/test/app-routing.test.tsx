import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  const testPaths = [
    "/",
    "/shop",
    "/commander",
    "/cart",
    "/how-it-works",
    "/editeasy",
    "/espace-entreprise",
    "/faq",
    "/our-story",
    "/contact",
    "/gift-finder",
    "/digital-memories",
    "/privacy-policy",
    "/terms",
    "/shipping-policy",
    "/refund-policy",
    "/product/memora-classique",
    "/product/memora-magnet",
    "/product/memora-20x30-encadre",
    "/create/p1",
    "/m/demo-leila-and-sami",
  ];

  testPaths.forEach((path) => {
    it(`matches an existing route for ${path}`, () => {
      const matches = router.matchRoutes(path);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    });
  });
});
