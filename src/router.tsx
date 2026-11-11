import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Fondu court entre les pages (navigateurs compatibles ; sinon, navigation normale)
    defaultViewTransition: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
