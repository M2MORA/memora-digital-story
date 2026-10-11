import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  ["Personalized items", "As each piece is made for you, it cannot be returned unless defective."],
  ["Defects", "Contact us within 14 days of delivery and we will remake or refund your piece."],
];

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund policy — MÉMORA" },
      { name: "description", content: "Returns and refunds for MÉMORA personalized products." },
      { property: "og:title", content: "Refund policy — MÉMORA" },
      { property: "og:description", content: "Returns and refunds for MÉMORA personalized products." },
    ],
  }),
  component: () => <LegalPage title="Refund policy" sections={SECTIONS} />,
});
