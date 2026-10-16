import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/create")({
  beforeLoad: () => {
    throw redirect({ to: "/commander" });
  },
});
