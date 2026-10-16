export function LegalPage({ title, sections }: { title: string; sections: [string, string][] }) {
  return (
    <section className="container-x max-w-3xl pb-32 pt-36">
      <p className="eyebrow">Informations Légales</p>
      <h1 className="mt-4 font-serif text-4xl sm:text-6xl">{title}</h1>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-cream border border-border px-3.5 py-1 text-xs text-muted-foreground">
        <span>Conforme à la loi tunisienne sur la protection des données personnelles</span>
      </div>
      <div className="mt-12 space-y-10 divide-y divide-border">
        {sections.map(([h, p]) => (
          <div key={h} className="pt-8 first:pt-0">
            <h2 className="font-serif text-2xl text-charcoal">{h}</h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
