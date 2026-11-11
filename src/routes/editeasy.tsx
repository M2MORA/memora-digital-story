import { createFileRoute, redirect } from "@tanstack/react-router";

// Le « montage automatique » n'était qu'une simulation (aucune vidéo produite) :
// retiré du site. L'adresse renvoie vers la commande pour ne pas casser les anciens liens.
// L'ancienne page est dans l'historique git (commit 46ff3c4 et avant) si un vrai montage voit le jour.
export const Route = createFileRoute("/editeasy")({
  beforeLoad: () => {
    throw redirect({ to: "/commander" });
  },
});
