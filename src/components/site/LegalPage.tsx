export function LegalPage({ title, sections }: { title: string; sections: [string, string][] }) {
  return (
    <section className="container-x max-w-3xl pb-32 pt-40">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-6 text-5xl md:text-6xl">{title}</h1>
      <p className="mt-6 border-l-2 border-sand bg-cream p-4 text-sm text-muted-foreground">
        Placeholder content — must be reviewed by a legal professional before publication.
      </p>
      {sections.map(([h, p]) => (
        <div key={h} className="mt-12">
          <h2 className="text-3xl">{h}</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">{p}</p>
        </div>
      ))}
    </section>
  );
}
