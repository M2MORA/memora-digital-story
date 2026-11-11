import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { dictFromMatches } from "@/i18n";

export const Route = createFileRoute("/terms")({
  head: ({ matches }) => ({
    meta: [{ title: `${dictFromMatches(matches).legal.terms.title} — MÉMORA` }],
  }),
  component: () => <LegalPage page="terms" />,
});
