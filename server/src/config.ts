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
  // Keep in sync with src/release.ts when cutting a release.
  appRelease: '1.1.12',
  chatModelName: 'Gemma 3 4B',
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || 'gemma3:4b',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  ollamaNumCtx: Number(process.env.OLLAMA_NUM_CTX || 4096),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  recoveryUsername: process.env.RECOVERY_USERNAME || 'recovery',
  recoveryPassword: process.env.RECOVERY_PASSWORD || '',
  chatRateLimitWindowMs: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000),
  chatRateLimitMax: Number(process.env.CHAT_RATE_LIMIT_MAX || 30),
};

export function assertRuntimeConfig(): void {
  console.log(
    `LLM: Ollama ${config.chatModelName} (${config.ollamaChatModel}) via ${config.ollamaBaseUrl}; embeddings ${config.ollamaEmbedModel}`
  );
  if (!config.ollamaBaseUrl) {
    console.warn('WARNING: OLLAMA_BASE_URL is empty; chat and ingest will fail.');
  }
  if (!config.recoveryPassword && config.nodeEnv !== 'test') {
    console.warn(
      'WARNING: RECOVERY_PASSWORD is not set; recovery admin will not be seeded/updated.'
    );
  }
}
