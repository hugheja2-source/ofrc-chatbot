import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { assertRuntimeConfig, config } from './config';
import { ensureRecoveryAdmin } from './services/recovery';
import { authRouter } from './routes/auth';
import { categoriesRouter } from './routes/categories';
import { chatRouter } from './routes/chat';
import { documentsRouter } from './routes/documents';
import { healthRouter } from './routes/health';
import { topicsRouter } from './routes/topics';

assertRuntimeConfig();
fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || config.allowedOrigins.includes(origin) || config.nodeEnv === 'development') {
        cb(null, true);
        return;
      }
      cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/chat', chatRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Server error';
    if (message.includes('Only PDF') || message.includes('File too large')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
);

async function start() {
  try {
    await ensureRecoveryAdmin();
  } catch (err) {
    console.error('Failed to seed recovery admin:', err);
  }

  app.listen(config.port, () => {
    console.log(`OFRC Chatbot API listening on :${config.port}`);
  });
}

start();
