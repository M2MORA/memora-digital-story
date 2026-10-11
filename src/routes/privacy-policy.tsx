import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

const SECTIONS: [string, string][] = [
  ["Data we collect", "Account details, order information and the memories you choose to upload."],
  ["How we use it", "Only to craft your products, host your digital memories and support you."],
  ["Your rights", "You may access, export or delete your data at any time by contacting us."],
];

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — MÉMORA" },
      { name: "description", content: "How MÉMORA collects, stores and protects your personal data and memories." },
      { property: "og:title", content: "Privacy policy — MÉMORA" },
      { property: "og:description", content: "How MÉMORA collects, stores and protects your personal data and memories." },
    ],
  }),
  component: () => <LegalPage title="Privacy policy" sections={SECTIONS} />,
});
