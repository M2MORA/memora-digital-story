export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>MÉMORA — Une erreur est survenue</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAF7F2; color: #2B231D; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2.5rem 2rem; background: #FFFFFF; border-radius: 1rem; border: 1px solid #EFE8DF; box-shadow: 0 4px 20px -2px rgba(43, 35, 29, 0.05); }
      .brand { font-size: 0.875rem; letter-spacing: 0.2em; text-transform: uppercase; color: #8C786A; margin-bottom: 0.75rem; font-weight: 600; }
      h1 { font-size: 1.5rem; margin: 0 0 0.75rem; font-weight: 600; color: #2B231D; }
      p { color: #6E5F55; font-size: 0.9375rem; line-height: 1.6; margin: 0 0 1.75rem; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; cursor: pointer; text-decoration: none; border: 1px solid transparent; transition: all 0.2s ease; }
      .primary { background: #8E3A59; color: #fff; }
      .primary:hover { background: #7A2F4B; }
      .secondary { background: #fff; color: #2B231D; border-color: #E0D6CB; }
      .secondary:hover { background: #FAF7F2; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">MÉMORA</div>
      <h1>Une erreur est survenue</h1>
      <p>Quelque chose s'est mal passé. Vous pouvez rafraîchir la page ou revenir à l'accueil.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Réessayer</button>
        <a class="secondary" href="/">Retour à l'accueil</a>
      </div>
    </div>
  </body>
</html>`;
}
