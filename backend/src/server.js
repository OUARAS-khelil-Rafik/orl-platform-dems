import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectMongoSafely,
  ensureMongoReconnectLoop,
  isMongoConnected,
} from './config/mongodb.js';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import collectionsRoutes from './routes/collections.routes.js';
import uploadsRoutes from './routes/uploads.routes.js';
import realtimeRoutes from './routes/realtime.routes.js';
import contactRoutes from './routes/contact.routes.js';
import { isSmtpMailerConfigured } from './config/mailer.js';
import { dashboardHtml as bundledDashboardHtml } from './dashboard/html.js';

const app = express();

// ── Meta & Dashboard setup ──────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const startTime = Date.now();

let appVersion = '1.0.0';
try {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw);
  if (pkg?.version) appVersion = String(pkg.version);
} catch {
  // keep default
}

const dashboardPath = path.join(__dirname, '..', 'public', 'index.html');
let dashboardHtmlCache = null;
let dashboardCacheMtimeMs = 0;

const FALLBACK_HTML = bundledDashboardHtml || `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ORL Platform — Backend</title><style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px} .c{background:white;border:1px solid #e2e8f0;border-radius:16px;padding:28px;max-width:560px;box-shadow:0 4px 24px rgba(15,23,42,.08)} h1{margin:0 0 8px;font-size:22px} p{color:#64748b} code{background:#f1f5f9;padding:2px 6px;border-radius:6px} a{color:#4f46e5}</style></head><body><div class="c"><h1>ORL Platform — Backend</h1><p>Dashboard indisponible.</p><p><a href="/api/health">/api/health</a> • <a href="/api/meta">/api/meta</a></p></div></body></html>`;

const getDashboardHtml = () => {
  try {
    const stat = fs.statSync(dashboardPath);
    const mtime = stat.mtimeMs || 0;
    if (dashboardHtmlCache && mtime === dashboardCacheMtimeMs) return dashboardHtmlCache;
    dashboardHtmlCache = fs.readFileSync(dashboardPath, 'utf-8');
    dashboardCacheMtimeMs = mtime;
    return dashboardHtmlCache;
  } catch {
    // Vercel serverless: FS may not include public/, fallback to bundled HTML
    return dashboardHtmlCache || FALLBACK_HTML;
  }
};

const buildHealthPayload = () => ({
  ok: true,
  service: 'orl-platform-dems-backend',
  version: appVersion,
  env: process.env.NODE_ENV || 'development',
  mongoConnected: isMongoConnected(),
  uptime: Math.floor((Date.now() - startTime) / 1000),
  timestamp: new Date().toISOString(),
  nodeVersion: process.version,
});

const buildMetaPayload = () => {
  const hasGoogleAuth = Boolean(
    String(process.env.GOOGLE_CLIENT_ID || '').trim() &&
      String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  );
  const hasCloudinary =
    Boolean(String(process.env.CLOUDINARY_CLOUD_NAME || '').trim()) ||
    Boolean(env?.cloudinary?.cloudName);
  return {
    ok: true,
    service: 'orl-platform-dems-backend',
    version: appVersion,
    env: process.env.NODE_ENV || 'development',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    mongoConnected: isMongoConnected(),
    mongoDbName: env.mongodbDbName || process.env.MONGODB_DB_NAME || '—',
    corsOrigins: env.corsOrigins || [],
    corsOriginsCount: Array.isArray(env.corsOrigins) ? env.corsOrigins.length : 0,
    jwtExpiresIn: env.jwtExpiresIn || '7d',
    features: {
      googleAuth: hasGoogleAuth,
      cloudinary: hasCloudinary,
      mailer: Boolean(isSmtpMailerConfigured),
    },
  };
};

// ── CORS ────────────────────────────────────────────────────────────
const allowedOrigins = new Set(env.corsOrigins);

const isLoopbackOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    const hostname = String(parsed.hostname || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
};

const isPrivateNetworkOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    const hostname = String(parsed.hostname || '').toLowerCase();
    // Autorise le réseau local (192.168.x.x, 10.x.x.x, 172.16-31.x.x) en dev
    if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      if (isLoopbackOrigin(origin)) {
        callback(null, true);
        return;
      }

      if (isPrivateNetworkOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Lazy-connect for serverless / Render: ensure DB ready on demande (no-op si déjà connecté)
// Health/meta/dashboard ne forcent pas de connexion -> réduit la pression M0
const SKIP_DB_CONNECT_PATHS = new Set([
  '/api/health',
  '/health',
  '/api/meta',
  '/',
  '/dashboard',
  '/favicon.ico',
]);

app.use(async (req, _res, next) => {
  // Ne jamais bloquer health/dashboard sur la DB
  if (SKIP_DB_CONNECT_PATHS.has(req.path)) {
    next();
    return;
  }

  if (!isMongoConnected()) {
    await connectMongoSafely();
  }
  next();
});

// ── Dashboard (root) — must be before /api routes for "/" ─────────
app.get('/', (req, res) => {
  // Content-negotiation: if client explicitly wants JSON and not HTML, return JSON meta
  const accept = String(req.headers.accept || '').toLowerCase();
  const wantsJson = accept.includes('application/json') && !accept.includes('text/html');
  const wantsJsonExplicit = String(req.query.format || '').toLowerCase() === 'json';

  if (wantsJson || wantsJsonExplicit) {
    return res.json(buildHealthPayload());
  }

  const html = getDashboardHtml();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache: no-store for dashboard (always fresh), but allow ETag via content hash if desired
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  return res.send(html);
});

// favicon: silent 204 (HTML uses data URI, but some browsers probe /favicon.ico)
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// Redirect /dashboard → /  (user wants root, not /dashboard)
app.get('/dashboard', (_req, res) => res.redirect(301, '/'));

// ── Health & Meta ───────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json(buildHealthPayload());
});

// Render health-check endpoint (same as /api/health but without /api prefix)
app.get('/health', (_req, res) => {
  res.json(buildHealthPayload());
});

app.get('/api/meta', (_req, res) => {
  res.json(buildMetaPayload());
});

// ── API routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/data', collectionsRoutes); // collections = /api/data/:collection (compat)
app.use('/api/uploads', uploadsRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/contact', contactRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err?.status === 413 || err?.statusCode === 413 || err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Fichier trop volumineux.' });
    return;
  }

  res.status(500).json({ message: 'Unexpected server error.' });
});

// ─────────────────────────────────────────────────────────────
// Vercel serverless compatibility
// Export app for @vercel/node
// In local/dev, start() listens; on Vercel, VERCEL=1 so we skip listen
// ─────────────────────────────────────────────────────────────
export default app;

const start = async () => {
  const connected = await connectMongoSafely();
  if (!connected) {
    console.warn('[mongo] API started without DB connection. Background reconnect is active.');
  }

  ensureMongoReconnectLoop(10000);

  const host = process.env.HOST || '0.0.0.0';
  app.listen(env.port, host, () => {
    console.log(`Backend running on http://${host}:${env.port}`);
  });
};

// Vercel sets VERCEL=1 -> serverless export, no listen
// Render / local -> normal listen
if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error('Failed to start backend:', error);
    process.exitCode = 1;
  });
} else {
  void connectMongoSafely().then((connected) => {
    if (!connected) console.warn('[mongo] Vercel lambda started without DB connection.');
    ensureMongoReconnectLoop(10000);
  });
}
