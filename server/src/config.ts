import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4100),
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || 'chatbot_dev',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    url: process.env.DATABASE_URL,
  },
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 25 * 1024 * 1024),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // Prefer Flash-Lite for higher free-tier headroom than gemini-3.8-flash (20 RPD).
  geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite',
  geminiEmbedModel: process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  recoveryUsername: process.env.RECOVERY_USERNAME || 'recovery',
  recoveryPassword: process.env.RECOVERY_PASSWORD || '',
  chatRateLimitWindowMs: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000),
  chatRateLimitMax: Number(process.env.CHAT_RATE_LIMIT_MAX || 30),
};

export function assertRuntimeConfig(): void {
  if (config.nodeEnv === 'production' && !config.geminiApiKey) {
    console.warn('WARNING: GEMINI_API_KEY is not set; chat and ingest will fail.');
  }
  if (!config.recoveryPassword && config.nodeEnv !== 'test') {
    console.warn(
      'WARNING: RECOVERY_PASSWORD is not set; recovery admin will not be seeded/updated.'
    );
  }
}
