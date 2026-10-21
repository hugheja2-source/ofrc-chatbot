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
  appRelease: '1.1.15',
  chatModelName: 'GPT-OSS 120B',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqChatModel:
    process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b',
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  recoveryUsername: process.env.RECOVERY_USERNAME || 'recovery',
  recoveryPassword: process.env.RECOVERY_PASSWORD || '',
  chatRateLimitWindowMs: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000),
  chatRateLimitMax: Number(process.env.CHAT_RATE_LIMIT_MAX || 30),
};

export function assertRuntimeConfig(): void {
  console.log(
    `LLM: Groq ${config.chatModelName} (${config.groqChatModel}); embeddings Ollama ${config.ollamaEmbedModel} via ${config.ollamaBaseUrl}`
  );
  if (!config.groqApiKey) {
    console.warn('WARNING: GROQ_API_KEY is empty; chat and topic extraction will fail.');
  }
  if (!config.ollamaBaseUrl) {
    console.warn('WARNING: OLLAMA_BASE_URL is empty; embeddings will fail.');
  }
  if (!config.recoveryPassword && config.nodeEnv !== 'test') {
    console.warn(
      'WARNING: RECOVERY_PASSWORD is not set; recovery admin will not be seeded/updated.'
    );
  }
}
