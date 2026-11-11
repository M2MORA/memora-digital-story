import { createFileRoute, redirect } from "@tanstack/react-router";

// Contenu fusionné dans « Comment ça marche » ; on garde l'adresse pour les anciens liens.
export const Route = createFileRoute("/digital-memories")({
  beforeLoad: () => {
    throw redirect({ to: "/how-it-works" });
  },
});
