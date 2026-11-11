import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { dictFromMatches } from "@/i18n";

export const Route = createFileRoute("/refund-policy")({
  head: ({ matches }) => ({
    meta: [{ title: `${dictFromMatches(matches).legal.refund.title} — MÉMORA` }],
  }),
  component: () => <LegalPage page="refund" />,
});
