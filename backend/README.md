# Backend — ORL Platform DEMS

API Express pour la plateforme ORL DEMS. Voir aussi le **README racine** (`../README.md`) pour le guide complet step-by-step.

---

## Stack

- Node.js 20
- Express 4
- MongoDB / Mongoose 8 (Atlas)
- Cloudinary 2 (uploads)
- JWT + bcrypt
- Nodemailer (emails)

## Structure

```
src/
├── server.js          # app Express, CORS, dashboard "/", /api/health, /api/meta
├── config/
│   ├── env.js         # validation MONGODB_URI, JWT_SECRET, CORS_ORIGINS...
│   ├── mongodb.js     # connexion + reconnect loop
│   ├── cloudinary.js  # config per-admin + fallback global
│   └── mailer.js      # SMTP (Nodemailer)
├── routes/
│   ├── auth.routes.js         # signup, signin, Google OAuth, forgot/reset, profile
│   ├── collections.routes.js  # CRUD générique + imports QCM/cas/diagrammes (ex data.routes.js, monté à /api/data)
│   ├── uploads.routes.js      # Cloudinary (video split ffmpeg >100 MB), avatar (ex upload.routes.js)
│   ├── realtime.routes.js     # /versions + /stream (SSE)
│   └── contact.routes.js      # formulaire contact + rate-limit
├── middleware/auth.js
├── models/User.js
├── utils/             # id.js, collection-name.js
└── dashboard/html.js  # HTML embarqué (fallback si public/ absent)

api/index.js           # entrée Vercel serverless (import app)
public/index.html      # dashboard statique (servi en "/")
Dockerfile             # Node 20 + ffmpeg (Render)
vercel.json            # routes Vercel
```

## Installation

```bash
cp .env.example .env   # remplir MONGODB_URI et JWT_SECRET au minimum
npm install
npm run dev            # http://localhost:4000
```

## Variables d'environnement

Voir `.env.example` et le README racine §4. Minimales :

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=change-me-long-random
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | `nodemon src/server.js` |
| `npm start` | `node src/server.js` (prod) |
| `npm test` | `node --test` |

## Endpoints principaux

- `GET /` — dashboard (HTML) ou JSON si `Accept: application/json`
- `GET /api/health` + `GET /health` — santé
- `GET /api/meta` — métadonnées (version, uptime, Mongo, CORS, features)
- `POST /api/auth/signup`, `POST /api/auth/signin`, `GET /api/auth/me`, `PATCH /api/auth/profile`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `GET /api/auth/google/start`, etc.
- `GET /api/data/:collection`, `POST /api/data/query`, CRUD `POST/PUT/PATCH/DELETE /api/data/:collection/:id`
- `POST /api/uploads/cloudinary`, `DELETE /api/uploads/cloudinary`, `POST /api/uploads/avatar`
- `GET /api/realtime/versions`, `GET /api/realtime/stream`
- `POST /api/contact`, `GET /api/contact/health`

Dashboard interactif sur `http://localhost:4000/` quand le serveur tourne.

## Déploiement

- **Render** (recommandé) : `render.yaml` à la racine — runtime Docker avec `ffmpeg` pour le split vidéo >100 MB.
- **Vercel** : `vercel.json` + `api/index.js` déjà configurés (sans ffmpeg — gros uploads échoueront).

## Notes

- Cloudinary per-admin : stocké dans `users.cloudinary`, prioritaire sur les vars globales.
- Google OAuth : `GOOGLE_REDIRECT_URI` doit correspondre à l'URI autorisée dans Google Cloud Console.
- SMTP Gmail : utiliser un App Password (16 chars) si `EAUTH 534`.
