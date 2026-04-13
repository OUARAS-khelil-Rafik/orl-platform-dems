import mongoose from 'mongoose';
import { env } from './env.js';

let isConnecting = false;
let reconnectTimeout = null;
let reconnectLoopStarted = false;
let wasDisconnected = false;

const mongoOptions = {
  dbName: env.mongodbDbName,
  maxPoolSize: 25,
  minPoolSize: 2,
  maxIdleTimeMS: 60000,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 30000,
};

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
  if (isMongoConnected() || isConnecting || isMongoBusy()) {
    return;
  }

  isConnecting = true;
  try {
    await mongoose.connect(env.mongodbUri, mongoOptions);
  } finally {
    isConnecting = false;
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
    scheduleReconnect();
  });

  mongoose.connection.on('error', (error) => {
    console.error('[mongo] connection error:', error?.message || error);
  });

  void attemptReconnect();
};
