# ORL Platform DEMS

Plateforme pédagogique ORL pour le DEMS (Algérie) — vidéos, QCM, cas cliniques, schémas, planning et gestion administrative.

> **Stack :** Next.js 16 + React 19 (frontend) — Express 4 + MongoDB/Mongoose + Cloudinary (backend) — Hébergement Vercel (frontend) + Render / Vercel (backend)

---

## 1. Structure du projet

```
orl-platform-dems/
├── README.md                 # ← ce fichier (guide complet)
├── render.yaml               # déploiement backend sur Render (Docker + ffmpeg)
│
├── backend/                  # API Express — orl-platform-dems-backend
│   ├── src/
│   │   ├── server.js         # app Express + CORS + dashboard "/" + /api/*
│   │   ├── config/           # env.js, mongodb.js, cloudinary.js, mailer.js
│   │   ├── routes/           # auth.routes.js, collections.routes.js, uploads.routes.js, realtime.routes.js, contact.routes.js
│   │   ├── middleware/       # auth.js (JWT)
│   │   ├── models/           # User.js (Mongoose)
│   │   ├── utils/            # id.js, collection-name.js
│   │   └── dashboard/        # html.js (dashboard embarqué)
│   ├── api/index.js          # entrée serverless Vercel
│   ├── public/index.html     # dashboard HTML (fallback)
│   ├── Dockerfile            # Node 20 + ffmpeg (vidéos >100 MB)
│   ├── vercel.json
│   └── .env.example
│
└── frontend/                 # App Next.js — orl-platform-dems-frontend (Pages Router)
    ├── pages/                # routes fichier-système
    │   ├── index.tsx         # /
    │   ├── _app.tsx
    │   ├── admin.tsx, dashboard.tsx, planning.tsx, pricing.tsx, ...
    │   ├── videos/
    │   │   ├── index.tsx     # /videos (catalogue)
    │   │   └── [id].tsx      # /videos/:id (ex video-detail)
    │   ├── specialties/
    │   │   ├── index.tsx     # /specialties
    │   │   └── [slug].tsx    # /specialties/:slug (ex specialty-detail)
    │   ├── checkout/
    │   │   ├── index.tsx     # /checkout
    │   │   ├── [type].tsx    # /checkout/:type (ex checkout-type)
    │   │   └── subscription.tsx # /checkout/subscription
    │   ├── oauth/google.tsx
    │   └── *.tsx             # 404, cgv, confidentialite, contact, faq, ...
    │       # shims legacy : video-detail.tsx, specialty-detail.tsx, checkout-type.tsx, checkout-subscription.tsx → redirect 301 vers nouveaux chemins
    ├── components/
    │   ├── layout/           # navbar.tsx, footer.tsx
    │   ├── providers/        # auth-provider.tsx, cart-provider.tsx, realtime-provider.tsx
    │   ├── features/
    │   │   ├── admin/        # content-manager.tsx (5095l), seed-data.tsx
    │   │   ├── planning/     # agenda.tsx (= ex PlannerAgenda) + programme.tsx (= ex PlanningProgramme) — fusion planner+planning
    │   │   ├── search/       # search-modal.tsx
    │   │   ├── support/      # support-chat-attachment.tsx
    │   │   └── video/        # seamless-player.tsx
    │   ├── ui/               # alert-modal.tsx
    │   ├── icons/            # specialty-icons.tsx
    │   └── security/         # content-protection.tsx
    ├── lib/
    │   ├── api/client.ts     # client API (ex lib/data/local-data.ts) — auth, db, realtime, cloudinary helpers
    │   ├── domain/models.ts  # types partagés (Video, Qcm, ClinicalCase...)
    │   ├── hooks/useRealtimeRefresh.ts
    │   ├── security/access-control.ts
    │   └── utils/            # media-fallback, name-utils, oauth-error, support-chat-attachments
    ├── public/               # logo, favicons, fallbacks
    ├── styles/globals.css
    ├── tests/                # vitest (9 suites)
    ├── next.config.ts        # redirects (/planner→/planning, /tarifs→/pricing) — plus de rewrites : routing natif
    ├── vercel.json
    └── .env.example
```

**Points de réorganisation (v2)**
- `backend/src/routes/data.routes.js` → `collections.routes.js` (nom explicite, monté à `/api/data` pour compat)
- `backend/src/routes/upload.routes.js` → `uploads.routes.js` (pluriel cohérent)
- `frontend/lib/data/local-data.ts` → `frontend/lib/api/client.ts` (vrai client API, plus de "local-data")
- `frontend/components/features/planner/` + `planning/` → `features/planning/{agenda.tsx, programme.tsx}` (dossier unique, noms cohérents)
- `frontend/pages` : passage au **routing fichier-système natif** (`videos/[id]`, `specialties/[slug]`, `checkout/[type]`) — supprime les `rewrites` artificiels ; shims legacy gardés pour compat `?id=` / `?slug=`
- `frontend/pages/planner.tsx` supprimé (redirect `next.config.ts` suffit)

**Conventions**
- `kebab-case` fichiers/dossiers, `PascalCase` composants (`SearchModal`, `PlannerAgenda` via agenda.tsx)
- `lib/api/client.ts` = seul point d'accès API (plus de `lib/data/local-data`)
- Routing Next.js natif : pas de `rewrites` pour vidéos/spécialités/checkout
- TypeScript strict, pas de `any`, textes UI en français

---

## 2. Prérequis

- **Node.js 20.x** (`node -v` doit afficher `v20`)
- **npm 9+** (`npm -v`)
- Un cluster **MongoDB Atlas** (ou local)
- Un compte **Cloudinary** (uploads vidéo/image)
- (Optionnel) Identifiants **Google OAuth** et **SMTP** pour emails

---

## 3. Installation — étape par étape

### Étape 1 — Cloner

```bash
git clone <url-du-repo>
cd orl-platform-dems
```

### Étape 2 — Backend

```bash
cd backend
cp .env.example .env
# → ouvrir .env et remplir au minimum :
#   MONGODB_URI, JWT_SECRET
npm install
npm run dev
# → http://localhost:4000
# → dashboard : http://localhost:4000/
# → health    : http://localhost:4000/api/health
```

### Étape 3 — Frontend

Dans un **second terminal** :

```bash
cd frontend
cp .env.example .env
# → vérifier que NEXT_PUBLIC_API_URL pointe vers le backend :
#   NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm install
npm run dev
# → http://localhost:3000
```

> Les deux apps doivent tourner en même temps en local.

---

## 4. Variables d'environnement

### Backend (`backend/.env`)

Copiez `backend/.env.example` — variables minimales :

| Variable | Obligatoire | Exemple |
|---|---|---|
| `PORT` | non (défaut `4000`) | `4000` |
| `MONGODB_URI` | **oui** | `mongodb+srv://user:pass@cluster/db?retryWrites=true` |
| `MONGODB_DB_NAME` | non | `orl-platform-dems` |
| `JWT_SECRET` | **oui** | chaîne longue aléatoire |
| `JWT_EXPIRES_IN` | non | `7d` |
| `CORS_ORIGINS` | non | `http://localhost:3000` |
| `CLOUDINARY_CLOUD_NAME` | pour uploads | `xxx` |
| `CLOUDINARY_API_KEY` | pour uploads | `xxx` |
| `CLOUDINARY_API_SECRET` | pour uploads | `xxx` |
| `INITIAL_ADMIN_ACCOUNTS` | pour seed | `[{"email":"admin@ex.com","displayName":"Admin","phoneNumber":"0600","initialPassword":"ChangeMe123!"}]` |
| `GOOGLE_CLIENT_ID` | pour OAuth | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | pour OAuth | `xxx` |
| `GOOGLE_REDIRECT_URI` | pour OAuth | `http://localhost:4000/api/auth/google/callback` |
| `FRONTEND_URL` | pour OAuth | `http://localhost:3000` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | pour emails | `smtp.gmail.com` / `587` |
| `CONTACT_TO_EMAIL` | pour contact | `kh.ouaras@univ-alger.dz` |

### Frontend (`frontend/.env`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
# En production Render :
# NEXT_PUBLIC_API_URL=https://orl-platform-backend.onrender.com/api
```

---

## 5. Scripts disponibles

### Backend (`cd backend`)

| Commande | Description |
|---|---|
| `npm run dev` | Lance avec `nodemon` (reload auto) |
| `npm start` | Lance en production (`node src/server.js`) |
| `npm test` | Tests natifs Node (`node --test` → collections) |

### Frontend (`cd frontend`)

| Commande | Description |
|---|---|
| `npm run dev` | Dev Next.js (`http://localhost:3000`) |
| `npm run build` | Build production |
| `npm start` | Serve build production |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (une fois) |
| `npm run test:watch` | Vitest en watch |
| `npm run test:coverage` | Couverture |

---

## 6. API — aperçu

Base URL locale : `http://localhost:4000`

- `GET  /` → dashboard HTML (ou JSON si `Accept: application/json`)
- `GET  /api/health` / `GET /health` → santé
- `GET  /api/meta` → version, env, Mongo, CORS, features
- `POST /api/auth/signup` · `POST /api/auth/signin` · `GET /api/auth/me` · `PATCH /api/auth/profile` · `POST /api/auth/forgot-password` · `POST /api/auth/reset-password` · `GET /api/auth/google/start` · `POST /api/auth/google/connect-start` etc.
- `GET  /api/data/:collection` · `POST /api/data/query` · `POST /api/data/:collection` · `PUT/PATCH/DELETE /api/data/:collection/:id` (fichier `collections.routes.js`)
- `POST /api/uploads/cloudinary` · `DELETE /api/uploads/cloudinary` · `POST /api/uploads/avatar` (fichier `uploads.routes.js`)
- `GET  /api/realtime/versions` · `GET /api/realtime/stream` (SSE)
- `POST /api/contact` · `GET /api/contact/health`

Dashboard complet avec catalogue testable sur `http://localhost:4000/` quand le backend tourne.

---

## 7. Déploiement

### Backend — Render (recommandé, avec ffmpeg)

1. Connectez le repo à Render.
2. Render détecte `render.yaml` automatiquement (runtime `docker`, `rootDir: backend`).
3. Dans **Dashboard Render → Environment**, renseignez les variables `sync: false` (MONGODB_URI, JWT_SECRET, CLOUDINARY_*, GOOGLE_*, SMTP_*).
4. Deploy → health check sur `/api/health`.

> Alternative Vercel : `backend/vercel.json` + `api/index.js` sont déjà configurés (sans ffmpeg → vidéos >100 MB échoueront).

### Frontend — Vercel

1. Importez le repo sur Vercel, **Root Directory = `frontend`**.
2. Variable d'env : `NEXT_PUBLIC_API_URL=https://<votre-backend>.onrender.com/api`.
3. Build command : `npm run build` — Vercel détecte Next.js automatiquement.

---

## 8. Tests & qualité

```bash
# Frontend
cd frontend
npm run lint
npm run typecheck
npm test
npm run test:coverage

# Backend
cd backend
npm test
```

Conventions : TypeScript strict, textes UI en français, modèles centralisés dans `frontend/lib/domain/models.ts`, client API unique dans `frontend/lib/api/client.ts`, gestion d'erreurs explicite, tests sur les zones critiques.

---

## 9. Dépannage

| Problème | Solution |
|---|---|
| `Missing required environment variable: MONGODB_URI` | Remplir `backend/.env` depuis `.env.example` |
| CORS bloqué | Ajouter l'origine frontend dans `CORS_ORIGINS` (séparées par `,`) |
| Upload vidéo >100 MB → 500 | Utiliser Render Docker (ffmpeg inclus) — pas Vercel natif |
| `EAUTH 534 5.7.9` Gmail | Activer 2FA Google + utiliser un **App Password** (16 chars) dans `SMTP_PASS` |
| Page `/videos/[id]` 404 après migration | Vider `.next` et `npm run build` ; vérifier que `pages/videos/index.tsx` et `[id].tsx` existent bien |

---

## 10. Licence

Projet privé DEMS ENT — tous droits réservés.
