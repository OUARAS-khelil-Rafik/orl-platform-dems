import express from 'express';
import cors from 'cors';
import {
  connectMongoSafely,
  ensureMongoReconnectLoop,
  isMongoConnected,
} from './config/mongodb.js';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import dataRoutes from './routes/data.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import realtimeRoutes from './routes/realtime.routes.js';
import contactRoutes from './routes/contact.routes.js';

const app = express();

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

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Lazy-connect for serverless / Render: ensure DB ready on every request (no-op if already connected)
// Harmless on Render (already connected), required on Vercel cold starts
app.use(async (_req, _res, next) => {
  if (!isMongoConnected()) {
    await connectMongoSafely();
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'orl-platform-dems-backend',
    mongoConnected: isMongoConnected(),
  });
});

// Render health-check endpoint (same as /api/health but without /api prefix for some probes)
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'orl-platform-dems-backend', mongoConnected: isMongoConnected() });
});

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/uploads', uploadRoutes);
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

  // Render requires host 0.0.0.0; Vercel uses serverless export (no listen)
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
