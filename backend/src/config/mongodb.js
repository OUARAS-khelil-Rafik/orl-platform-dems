import mongoose from 'mongoose';
import { env } from './env.js';

let isConnecting = false;

export const isMongoConnected = () => mongoose.connection.readyState === 1;

export const connectMongo = async () => {
  if (isMongoConnected() || isConnecting) {
    return;
  }

  isConnecting = true;
  await mongoose.connect(env.mongodbUri, {
    dbName: env.mongodbDbName,
    maxPoolSize: 25,
    minPoolSize: 2,
    maxIdleTimeMS: 60000,
    serverSelectionTimeoutMS: 5000,
  });
  isConnecting = false;
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
  const delay = Math.max(2000, Number(retryDelayMs) || 10000);

  const attemptReconnect = async () => {
    if (isMongoConnected()) {
      return;
    }

    try {
      await connectMongo();
      console.log('[mongo] reconnected successfully.');
    } catch (error) {
      isConnecting = false;
      console.error('[mongo] reconnect failed, retrying soon:', error?.message || error);
    }
  };

  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected.');
  });

  setInterval(() => {
    void attemptReconnect();
  }, delay);

  void attemptReconnect();
};
