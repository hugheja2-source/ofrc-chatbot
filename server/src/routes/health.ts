import { Router } from 'express';
import { query } from '../db/pool';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({
      ok: true,
      service: 'ofrc-chatbot-api',
      time: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});
