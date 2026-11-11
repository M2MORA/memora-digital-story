import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type FaqItem = { id: string; q: string; a: string };

/** Questions dépliables, accessibles au clavier (Radix Accordion) */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <Accordion type="multiple" className="border-t border-m-line-strong">
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id} className="border-m-line-strong">
          <AccordionTrigger className="min-h-16 gap-4 py-4 text-start font-serif text-[21px] font-semibold leading-snug text-m-ink hover:no-underline sm:text-[23px] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-m-wine">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="max-w-[65ch] pb-6 text-[17px] leading-relaxed text-m-muted">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
