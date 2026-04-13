# ORL Platform Backend

## Stack
- Node.js
- Express.js
- MongoDB Atlas (Mongoose)
- Cloudinary (server-side uploads)

## Setup
1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:
   - `npm install`
3. Run in dev:
   - `npm run dev`

Backend runs on `http://localhost:4000` by default.

## API Overview
- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/admin-create` (admin)
- `DELETE /api/auth/users/:uid`
- `POST /api/auth/seed-demo`
- `POST /api/data/query`
- `GET /api/data/:collection`
- `GET /api/data/:collection/:id`
- `POST /api/data/:collection`
- `PUT /api/data/:collection/:id`
- `PATCH /api/data/:collection/:id`
- `DELETE /api/data/:collection/:id`
- `POST /api/uploads/avatar` (auth)
- `POST /api/uploads/cloudinary` (auth)

## Cloudinary Per Admin
Admin Cloudinary settings are saved from frontend `appSettings/cloudinary`, but are persisted per admin user account in MongoDB (`users.cloudinary`). Upload endpoints prioritize that admin-specific config.
