# Contribuer — ORL Platform DEMS (Frontend)

> Guide complet d'installation dans le **README racine** (`../README.md`). Ce fichier complète avec les conventions frontend.

---

## Prérequis

- Node.js 20.x
- npm 9+

## Installation rapide

```bash
cp .env.example .env   # vérifier NEXT_PUBLIC_API_URL
npm install
npm run dev            # http://localhost:3000
```

## Structure frontend (après réorganisation v2)

```
pages/                 # Pages Router — routing fichier-système natif
  index.tsx, _app.tsx, admin.tsx, dashboard.tsx, planning.tsx, ...
  videos/index.tsx + videos/[id].tsx       (ex videos.tsx + video-detail.tsx)
  specialties/index.tsx + specialties/[slug].tsx (ex specialties + specialty-detail)
  checkout/index.tsx + checkout/[type].tsx + checkout/subscription.tsx
  oauth/google.tsx, 404.tsx, ...
  # shims legacy : video-detail.tsx, specialty-detail.tsx, checkout-type.tsx, checkout-subscription.tsx → redirect
components/
  layout/              # navbar, footer
  providers/           # auth-provider, cart-provider, realtime-provider
  features/
    admin/             # content-manager, seed-data
    planning/          # agenda.tsx (ex PlannerAgenda) + programme.tsx (ex PlanningProgramme)
    search/            # search-modal
    support/           # support-chat-attachment
    video/             # seamless-player
  ui/                  # alert-modal
  icons/               # specialty-icons
  security/            # content-protection
lib/
  api/client.ts        # client API unique (ex lib/data/local-data.ts) — auth, db, realtime, cloudinary
  domain/models.ts     # types partagés (source de vérité)
  hooks/               # useRealtimeRefresh
  security/access-control.ts
  utils/               # media-fallback, name-utils, oauth-error...
public/                # favicons, logo, fallbacks
styles/globals.css
tests/                 # vitest (incl. pages/videos/[id].tsx)
```

## Commandes

```bash
npm run dev            # dev
npm run build          # build prod
npm start              # serve prod
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run test:watch     # vitest watch
npm run test:coverage  # couverture
```

## Conventions

- **TypeScript strict** — éviter `any`, typer les props et retours.
- **Modèles centralisés** dans `lib/domain/models.ts`.
- **Client API** unique dans `lib/api/client.ts` (remplace `lib/data/local-data.ts`).
- **Planning** : un seul dossier `features/planning/` avec `agenda.tsx` + `programme.tsx` (fusion planner+planning).
- **Routing** : fichier-système natif Next.js — `/videos/[id]`, `/specialties/[slug]`, `/checkout/[type]` — plus de `rewrites` artificiels ; `next.config.ts` garde seulement les `redirects` (`/planner`→`/planning`, `/tarifs`→`/pricing`).
- **Textes UI en français** cohérents.
- **Composants** : `PascalCase`, **fichiers** : `kebab-case`.
- Ajouter des **tests** sur les zones critiques à chaque évolution.

## Workflow

1. Créer une branche (`feat/xxx`, `fix/xxx`).
2. Implémenter avec gestion d'erreurs explicite.
3. Ajouter/adapter les tests.
4. Vérifier :
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run test:coverage
   ```
5. Ouvrir la PR avec contexte fonctionnel + technique.

## Definition of Done

- [ ] Lint, typecheck, tests et couverture passent.
- [ ] Cas limites traités (données manquantes/invalides).
- [ ] Pas de régression sur les flux principaux (auth, vidéos, panier, planning).
- [ ] Documentation mise à jour si besoin.
