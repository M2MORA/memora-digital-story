import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { dictFromMatches } from "@/i18n";

export const Route = createFileRoute("/privacy-policy")({
  head: ({ matches }) => ({
    meta: [{ title: `${dictFromMatches(matches).legal.privacy.title} — MÉMORA` }],
  }),
  component: () => <LegalPage page="privacy" />,
});
