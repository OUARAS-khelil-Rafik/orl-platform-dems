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

const app = express();

const allowedOrigins = new Set(env.corsOrigins);

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

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'orl-platform-dems-backend',
    mongoConnected: isMongoConnected(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/uploads', uploadRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err?.status === 413 || err?.statusCode === 413 || err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Fichier trop volumineux.' });
    return;
  }

  res.status(500).json({ message: 'Unexpected server error.' });
});

const start = async () => {
  const connected = await connectMongoSafely();
  if (!connected) {
    console.warn('[mongo] API started without DB connection. Background reconnect is active.');
  }

  ensureMongoReconnectLoop(10000);

  app.listen(env.port, () => {
    console.log(`Backend running on http://localhost:${env.port}`);
  });
};

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exitCode = 1;
});
