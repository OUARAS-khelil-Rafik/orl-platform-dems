import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Collections à surveiller pour temps réel
const WATCHED_COLLECTIONS = [
  'videos',
  'qcms',
  'openQuestions',
  'clinicalCases',
  'diagrams',
  'users',
  'payments',
  'notifications',
  'supportChats',
  'supportChatMessages',
  'pedagogicalFeedback',
  'clinicalCaseFeedback',
  'appSettings',
];

const getCollectionVersion = async (db, collectionName) => {
  try {
    const col = db.collection(collectionName);
    // count - use estimated for speed where possible (faster than countDocuments)
    const count = await col.estimatedDocumentCount().catch(() => col.countDocuments().catch(() => 0));

    // latest doc by updatedAt / createdAt / _id
    const latestDocs = await col
      .find({}, { projection: { updatedAt: 1, createdAt: 1, updated_at: 1, created_at: 1 } })
      .sort({ updatedAt: -1, updated_at: -1, createdAt: -1, created_at: -1, _id: -1 })
      .limit(1)
      .toArray()
      .catch(() => []);

    let timestamp = 0;
    if (latestDocs.length > 0) {
      const doc = latestDocs[0];
      const raw = doc.updatedAt || doc.updated_at || doc.createdAt || doc.created_at || null;
      if (raw) {
        if (raw instanceof Date) timestamp = raw.getTime();
        else if (typeof raw === 'number') timestamp = raw;
        else if (typeof raw === 'string') {
          const parsed = new Date(raw).getTime();
          timestamp = Number.isNaN(parsed) ? 0 : parsed;
        } else if (typeof raw === 'object' && raw.$date) {
          timestamp = new Date(raw.$date).getTime() || 0;
        }
      }
      // Fallback to ObjectId timestamp if no date field
      if (!timestamp && doc._id && typeof doc._id.getTimestamp === 'function') {
        try {
          timestamp = doc._id.getTimestamp().getTime();
        } catch {}
      }
    }

    // Also consider Mongoose users timestamps may be ISO strings in top-level
    // For safety, if timestamp still 0 but count>0, use Date.now truncated to avoid constant 0 causing no diff
    // We'll keep 0 -> means empty

    return { count, updatedAt: timestamp };
  } catch {
    return { count: 0, updatedAt: 0 };
  }
};

let cachedVersions = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1500;

const buildVersions = async (db) => {
  const now = Date.now();
  if (cachedVersions && now - cachedAt < CACHE_TTL_MS) {
    return { ...cachedVersions, _ts: now, _cached: true };
  }
  const versions = {};
  const results = await Promise.all(
    WATCHED_COLLECTIONS.map(async (name) => {
      const v = await getCollectionVersion(db, name);
      return [name, v];
    })
  );
  for (const [name, v] of results) {
    versions[name] = v;
  }
  // global hash for quick change detection (sum of counts + timestamps)
  let hash = 0;
  for (const v of Object.values(versions)) {
    hash ^= (v.count * 1000003) ^ (v.updatedAt & 0xffffffff);
  }
  versions._hash = String(hash);
  versions._ts = now;
  cachedVersions = { ...versions };
  cachedAt = now;
  return versions;
};

// GET /api/realtime/versions
// Public, lightweight polling endpoint (no auth required, returns global versions)
router.get('/versions', async (_req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) {
      return res.status(503).json({ message: 'DB not ready', _hash: '0', _ts: Date.now() });
    }
    const versions = await buildVersions(db);
    // Cache control: no cache, but allow polling
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return res.json(versions);
  } catch (error) {
    console.error('[realtime] versions error:', error);
    return res.status(500).json({ message: 'Failed to get versions' });
  }
});

// GET /api/realtime/stream  (SSE)
// Streams versions every 3s + immediate on connect. Client: new EventSource('/api/realtime/stream')
router.get('/stream', async (req, res) => {
  const db = mongoose.connection?.db;
  if (!db) {
    return res.status(503).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // CORS for SSE (reuse cors middleware already handles, but ensure)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Flush headers immediately
  res.flushHeaders?.();

  let closed = false;
  const send = async () => {
    if (closed) return;
    try {
      const versions = await buildVersions(db);
      const payload = `data: ${JSON.stringify(versions)}\n\n`;
      res.write(payload);
    } catch (e) {
      // ignore
    }
  };

  // Send initial
  await send();

  const interval = setInterval(send, 3000);

  // heartbeat comment to keep connection alive (every 15s)
  const heartbeat = setInterval(() => {
    if (closed) return;
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    closed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
    try { res.end(); } catch {}
  });
});

export default router;
