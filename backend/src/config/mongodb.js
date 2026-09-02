import mongoose from 'mongoose';
import { env } from './env.js';

let isConnecting = false;
let reconnectTimeout = null;
let reconnectLoopStarted = false;
let wasDisconnected = false;

// ── M0-optimised pool ─────────────────────────────────────────────
// M0 (free) max 500 connections. Avec Vercel + Render + N lambdas,
// maxPoolSize 25 sature très vite (25 * 20 lambdas = 500).
// On force un pool minimal et on réutilise la connexion serverless.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const mongoOptions = {
  dbName: env.mongodbDbName,
  // Vercel serverless : 5 max, Render/long-running : 10 max
  maxPoolSize: isServerless ? 5 : 10,
  minPoolSize: isServerless ? 0 : 1,
  maxIdleTimeMS: 15000,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  // Éviter création auto d'index en prod (surcharge inutile)
  autoCreate: false,
};

// Cache global pour Vercel/serverless : évite N pools par lambda chaude
// Voir https://mongoosejs.com/docs/lambda.html
const globalCache = globalThis;
if (!globalCache._mongooseCache) {
  globalCache._mongooseCache = { promise: null };
}

const isMongoBusy = () => {
  const state = mongoose.connection.readyState;
  return state === 2 || state === 3;
};

const clearReconnectTimeout = () => {
  if (!reconnectTimeout) {
    return;
  }

  clearTimeout(reconnectTimeout);
  reconnectTimeout = null;
};

export const isMongoConnected = () => mongoose.connection.readyState === 1;

export const connectMongo = async () => {
  if (isMongoConnected()) {
    return;
  }

  // Serverless : réutiliser la promesse en cours pour éviter N connect() concurrents
  const cached = globalCache._mongooseCache;
  if (cached?.promise) {
    try {
      await cached.promise;
      if (isMongoConnected()) return;
    } catch {
      cached.promise = null;
    }
  }

  if (isConnecting || isMongoBusy()) {
    return;
  }

  isConnecting = true;
  const promise = mongoose.connect(env.mongodbUri, mongoOptions);
  if (cached) cached.promise = promise;
  try {
    await promise;
  } finally {
    isConnecting = false;
    if (cached) cached.promise = null;
  }
};

export const connectMongoSafely = async () => {
  try {
    await connectMongo();
    return true;
  } catch (error) {
    isConnecting = false;
    console.error('[mongo] initial connection failed:', error?.message || error);
    return false;
  }
};

export const ensureMongoReconnectLoop = (retryDelayMs = 10000) => {
  if (reconnectLoopStarted) {
    return;
  }

  reconnectLoopStarted = true;
  const delay = Math.max(2000, Number(retryDelayMs) || 10000);

  const scheduleReconnect = () => {
    if (reconnectTimeout || isMongoConnected() || isConnecting || isMongoBusy()) {
      return;
    }

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      void attemptReconnect();
    }, delay);
  };

  const attemptReconnect = async () => {
    if (isMongoConnected() || isConnecting || isMongoBusy()) {
      return;
    }

    try {
      await connectMongo();
    } catch (error) {
      console.error('[mongo] reconnect failed, retrying soon:', error?.message || error);
      scheduleReconnect();
    }
  };

  mongoose.connection.on('connected', () => {
    clearReconnectTimeout();

    if (wasDisconnected) {
      console.log('[mongo] reconnected successfully.');
      wasDisconnected = false;
    }
  });

  mongoose.connection.on('disconnected', () => {
    if (!wasDisconnected) {
      console.warn('[mongo] disconnected.');
    }

    wasDisconnected = true;
    // Nettoyer le cache serverless pour forcer une nouvelle connexion au prochain appel
    if (globalCache._mongooseCache) {
      globalCache._mongooseCache.promise = null;
    }
    scheduleReconnect();
  });

  mongoose.connection.on('error', (error) => {
    console.error('[mongo] connection error:', error?.message || error);
  });

  void attemptReconnect();
};
