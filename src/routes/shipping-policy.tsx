import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { dictFromMatches } from "@/i18n";

export const Route = createFileRoute("/shipping-policy")({
  head: ({ matches }) => ({
    meta: [{ title: `${dictFromMatches(matches).legal.shipping.title} — MÉMORA` }],
  }),
  component: () => <LegalPage page="shipping" />,
});
