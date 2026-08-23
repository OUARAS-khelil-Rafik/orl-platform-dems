# Render Dockerfile — Node 20 + ffmpeg for large video splitting
FROM node:20-bullseye-slim

# ffmpeg + ffprobe required for splitVideo (>100MB) in src/routes/upload.routes.js:344
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install

COPY . .

ENV NODE_ENV=production
EXPOSE 10000

# Render sets PORT at runtime; fallback to 10000 for local docker run
CMD ["sh", "-c", "PORT=${PORT:-10000} node src/server.js"]
