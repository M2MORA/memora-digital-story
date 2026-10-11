import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  ["Use of the service", "By ordering you agree to these terms."],
  ["Your content", "You keep full ownership of the memories you upload and grant us only the rights needed to provide the service."],
  ["Liability", "Limited to the extent permitted by Tunisian law."],
];

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — MÉMORA" },
      { name: "description", content: "The terms governing use of the MÉMORA website and products." },
      { property: "og:title", content: "Terms of service — MÉMORA" },
      { property: "og:description", content: "The terms governing use of the MÉMORA website and products." },
    ],
  }),
  component: () => <LegalPage title="Terms of service" sections={SECTIONS} />,
});
