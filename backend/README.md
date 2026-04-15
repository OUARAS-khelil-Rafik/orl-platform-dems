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
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/google/start`
- `POST /api/auth/google/connect-start` (auth)
- `POST /api/auth/google/disconnect` (auth)
- `GET /api/auth/google/callback`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/admin-create` (admin)
- `DELETE /api/auth/users/:uid`
- `POST /api/auth/seed-demo` (initialise uniquement les comptes admin depuis `INITIAL_ADMIN_ACCOUNTS` dans `.env`)
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

## Google OAuth Setup
Set these variables in `.env`:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (default: `http://localhost:4000/api/auth/google/callback`)
- `FRONTEND_URL` (default: `http://localhost:3000`)
- `GOOGLE_AUTH_SUCCESS_REDIRECT` (default: `http://localhost:3000/oauth/google`)
- `GOOGLE_AUTH_FAILURE_REDIRECT` (default: `http://localhost:3000/sign-in`)

In Google Cloud Console (OAuth client):
- Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
- Authorized JavaScript origin: `http://localhost:3000`

## Password Reset Setup
Optional variables in `.env`:
- `PASSWORD_RESET_TOKEN_TTL_MINUTES` (default: `30`, min: `5`, max: `180`)
- `PASSWORD_RESET_EXPOSE_LINK` (default: `true` in non-production, `false` in production)
- `SMTP_HOST`
- `SMTP_PORT` (default recommended: `587`)
- `SMTP_SECURE` (`true` for 465, `false` for 587/starttls)
- `SMTP_USER` (optional if your SMTP relay allows unauthenticated trusted IP)
- `SMTP_PASS`
- `SMTP_FROM_NAME` (default: `DEMS ENT`)
- `SMTP_FROM_EMAIL` (required for email sending)

Notes:
- The API always returns a generic message on `POST /api/auth/forgot-password` to reduce account enumeration.
- When SMTP is configured, the reset email is sent automatically.
- The reset URL is returned only when `PASSWORD_RESET_EXPOSE_LINK=true` and email delivery failed/unavailable.
- In production, keep `PASSWORD_RESET_EXPOSE_LINK=false`.
- If you use Gmail SMTP and get `EAUTH 534 5.7.9`, enable 2-Step Verification and set `SMTP_PASS` to a Google App Password (16 chars).
