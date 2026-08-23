import dotenv from 'dotenv';

dotenv.config();

const parseOrigins = (raw) => {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const configuredOrigins = parseOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN);

const required = ['MONGODB_URI', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  mongodbUri: process.env.MONGODB_URI,
  mongodbDbName: process.env.MONGODB_DB_NAME || 'orl_platform_dems',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins:
    configuredOrigins.length > 0
      ? configuredOrigins
      : parseOrigins('http://localhost:3000,http://localhost:5000'),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  chargily: {
    secretKey: process.env.CHARGILY_SECRET_KEY || '',
    // 'test' uses https://pay.chargily.net/test/api/v2, 'live' uses https://pay.chargily.net/api/v2
    mode: String(process.env.CHARGILY_MODE || 'test').toLowerCase() === 'live' ? 'live' : 'test',
    webhookSecret: process.env.CHARGILY_WEBHOOK_SECRET || process.env.CHARGILY_SECRET_KEY || '',
    frontendUrl: String(process.env.FRONTEND_URL || '').replace(/\/$/, '') || 'http://localhost:3000',
    backendUrl: String(process.env.BACKEND_URL || '').replace(/\/$/, '') || '',
  },
};
