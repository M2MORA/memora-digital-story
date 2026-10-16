# 🤝 Guide de Contribution — Organisation M2MORA

Bienvenue dans l'équipe d'ingénierie et de design de **M2MORA** ! Ce guide rassemble les conventions, les flux de travail et les bonnes pratiques pour collaborer efficacement sur nos projets.

---

## 🧭 Nos Principes Clés

1. **Expérience Premium d'Abord** : MÉMORA est une marque haut de gamme. Chaque interaction, animation ou temps de chargement doit sembler fluide, soigné et luxueux.
2. **Architecture Résiliente** : Séparation claire entre la vitrine client (`src/`), le lecteur de souvenirs standalone (`/m/:slug`), le portail d'administration (`admin/`) et le backend Supabase.
3. **Sécurité & Confidentialité** : Les souvenirs de nos clients sont privés. Aucune donnée personnelle ni clé secrète ne doit fuiter.

---

## 🌿 Flux Git & Stratégie de Branches

Nous utilisons une variante allégée de GitHub Flow :

```text
main (production stable)
  │
  ├── feat/studio-audio-recorder
  ├── fix/mobile-cart-drawer
  └── refactor/supabase-storage-cache
```

### Nommage des branches :
- `feat/<nom-en-kebab-case>` : Nouvelle fonctionnalité (ex: `feat/whatsapp-order-notification`)
- `fix/<nom-en-kebab-case>` : Correction de bogue (ex: `fix/nfc-reader-android-compat`)
- `refactor/<nom>` : Amélioration de code sans changement fonctionnel
- `docs/<nom>` : Modification de documentation ou ajout d'actifs médias

### Cycle de développement :
1. Créez votre branche locale depuis `main` à jour :
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/ma-fonctionnalite
   ```
2. Développez et testez localement vos modifications :
   ```bash
   npm run test
   npm run lint
   npm run build
   ```
3. Commitez vos modifications avec des messages conventionnels :
   ```bash
   git commit -m "feat(studio): add real-time video duration validator"
   ```
4. Poussez votre branche sur le dépôt distant :
   ```bash
   git push -u origin feat/ma-fonctionnalite
   ```
5. Ouvrez une **Pull Request** sur GitHub vers `main`.

---

## 📝 Conventions de Commits

Nous respectons la spécification [Conventional Commits](https://www.conventionalcommits.org/) :

| Préfixe | Usage |
| :--- | :--- |
| `feat:` | Ajout d'une nouvelle fonctionnalité utilisateur ou technique |
| `fix:` | Correction d'un bogue |
| `refactor:` | Refactorisation sans modification du comportement extérieur |
| `perf:` | Optimisation des performances |
| `docs:` | Documentation, schémas, guides README |
| `style:` | Formatage, espacements, CSS cosmétique |
| `test:` | Ajout ou mise à jour de tests automatisés |
| `chore:` | Maintenance des dépendances, configuration des outils |

---

## 🧪 Tests & Qualité de Code

Avant toute soumission de Pull Request, assurez-vous que :
1. **Tests unitaires** : `npm run test` passe sans échec.
2. **Linting** : `npm run lint` ne renvoie aucune erreur bloquante.
3. **Build de production** : `npm run build` et `cd admin && npm run build` compilent correctement.
4. **TypeScript** : Pas de types `any` injustifiés.

---

## 🔐 Gestion des Secrets

- Ne commitez **JAMAIS** de fichiers `.env` ou `.env.local`.
- Utilisez toujours `.env.example` pour documenter de nouvelles variables d'environnement requises.
- Les clés API privées Supabase (`service_role`) ne doivent **JAMAIS** être exposées dans le code client front-end.

---

## 💬 Poser une Question ou Signaler un Problème

- Ouvrez une **Issue** sur le dépôt en utilisant les templates fournis.
- En cas d'urgence sur un déploiement ou un bogue critique de paiement/commande, contactez directement l'équipe via le canal de coordination d'équipe.
