import { MessageCircle } from "lucide-react";

export function WhatsAppFloat() {
  const whatsappUrl =
    "https://wa.me/21698000000?text=Bonjour%20M%C3%A9mora%2C%20je%20souhaite%20des%20informations%20ou%20passer%20une%20commande.";

  return (
    <aside
      aria-label="Contact WhatsApp"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 group"
    >
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Discuter sur WhatsApp"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] p-0 text-xs font-semibold text-white shadow-xl transition-all duration-300 hover:scale-105 hover:bg-[#20bd5a] hover:shadow-2xl md:h-auto md:w-auto md:gap-2.5 md:px-4 md:py-3"
      >
        <MessageCircle className="h-5 w-5 fill-current shrink-0 md:h-4 md:w-4" />
        <span className="hidden md:inline">Besoin d'aide ? WhatsApp</span>
      </a>
    </aside>
  );
}

