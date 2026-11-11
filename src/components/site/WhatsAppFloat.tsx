import { MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/contact";
import { useT } from "@/i18n";

/** Bouton WhatsApp flottant, sur ordinateur seulement (sur mobile il vit dans la barre du bas) */
export function WhatsAppFloat() {
  const t = useT();
  return (
    <a
      href={whatsappLink(t.common.whatsappHello)}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 end-6 z-40 hidden min-h-12 items-center gap-2.5 rounded-full bg-m-ink px-5 text-[15px] font-semibold text-m-linen shadow-paper transition-colors hover:bg-m-wine md:inline-flex"
    >
      <MessageCircle className="h-5 w-5" aria-hidden="true" />
      <span>{t.whatsappFloat}</span>
    </a>
  );
}
