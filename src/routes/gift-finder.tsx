import { createFileRoute, redirect } from "@tanstack/react-router";

// Le questionnaire renvoyait toujours le même produit unique : remplacé par
// la section « Pour qui ? » de l'accueil. On garde l'adresse pour les anciens liens.
export const Route = createFileRoute("/gift-finder")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "occasions" });
  },
});
