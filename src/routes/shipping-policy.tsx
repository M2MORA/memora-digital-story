import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  ["Production", "Most pieces are crafted in 5–10 days."],
  ["Delivery", "Delivered across Tunisia in 2–3 working days. International shipping coming soon."],
];

export const Route = createFileRoute("/shipping-policy")({
  head: () => ({
    meta: [
      { title: "Shipping policy — MÉMORA" },
      { name: "description", content: "Production times and delivery for MÉMORA orders." },
      { property: "og:title", content: "Shipping policy — MÉMORA" },
      { property: "og:description", content: "Production times and delivery for MÉMORA orders." },
    ],
  }),
  component: () => <LegalPage title="Shipping policy" sections={SECTIONS} />,
});
