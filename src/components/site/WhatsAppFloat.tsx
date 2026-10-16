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
        className="flex items-center gap-2.5 rounded-full bg-[#25D366] px-4 py-3 text-xs font-semibold text-white shadow-xl transition-all duration-300 hover:scale-105 hover:bg-[#20bd5a] hover:shadow-2xl"
      >
        <MessageCircle className="h-4 w-4 fill-current shrink-0" />
        <span className="hidden sm:inline">Besoin d'aide ? WhatsApp</span>
        <span className="sm:hidden">WhatsApp</span>
      </a>
    </aside>
  );
}

