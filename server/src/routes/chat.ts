import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { query } from '../db/pool';
import { streamGroundedReply, ChatTurn } from '../services/groq';
import { searchChunks } from '../services/ingest';

export const chatRouter = Router();

const chatLimiter = rateLimit({
  windowMs: config.chatRateLimitWindowMs,
  max: config.chatRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please wait a moment.' },
});

chatRouter.post('/', chatLimiter, async (req, res, next) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Message required' });
      return;
    }

    let sessionId = String(req.body.sessionId || '').trim();
    if (!sessionId) {
      sessionId = randomUUID();
      await query(`INSERT INTO chat_sessions (id) VALUES ($1)`, [sessionId]);
    } else {
      const existing = await query(`SELECT id FROM chat_sessions WHERE id = $1`, [sessionId]);
      if (!existing.rows[0]) {
        await query(`INSERT INTO chat_sessions (id) VALUES ($1)`, [sessionId]);
      }
    }

    await query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
      [sessionId, message]
    );
    await query(`UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`, [sessionId]);

    const historyRes = await query<{ role: 'user' | 'assistant'; content: string }>(
      `SELECT role, content FROM chat_messages
       WHERE session_id = $1
       ORDER BY id DESC
       LIMIT 8`,
      [sessionId]
    );
    const history: ChatTurn[] = historyRes.rows.reverse().slice(0, -1);

    let chunks: Awaited<ReturnType<typeof searchChunks>> = [];
    try {
      chunks = await searchChunks(message, 4);
    } catch (err) {
      console.error('Retrieval failed:', err);
    }

    const strongChunks = chunks.filter((c) => Number(c.distance) < 0.55);
    const usedChunks = (strongChunks.length > 0 ? strongChunks : chunks).slice(0, 3);
    const contextChunks = usedChunks.map((c) => ({
      content: c.content,
      documentFilename: c.original_filename,
    }));

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let rawAnswer = '';
    for await (const token of streamGroundedReply({
      question: message,
      contextChunks,
      history,
    })) {
      rawAnswer += token;
      writeEvent('token', { text: token });
    }

    const sourceNames = [
      ...new Set(usedChunks.map((c) => c.original_filename).filter(Boolean)),
    ];
    const answer = rawAnswer.replace(/\n+\s*references\s*:\s*[\s\S]*$/i, '').trim();
    if (!answer) {
      throw new Error('GROQ_ERROR: empty chat response');
    }

    await query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
      [sessionId, answer]
    );

    writeEvent('done', {
      sessionId,
      answer,
      sources: sourceNames.map((document) => ({ document })),
    });
    res.end();
    } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).replace(
      /gsk_[A-Za-z0-9]+/g,
      '[redacted]'
    );
    console.error(message);
    const publicError = message.includes('GROQ_AUTH')
      ? 'The AI service could not authenticate. Please try again later.'
      : message.includes('GROQ_RATE_LIMIT')
        ? 'The AI service is busy. Please wait a moment and try again.'
        : message.includes('GROQ_TIMEOUT') || message.includes('AbortError')
          ? 'The AI model took too long to answer. Please try a shorter question.'
          : message.includes('GROQ_UNAVAILABLE')
            ? 'The AI service is unavailable. Please try again in a moment.'
            : message.includes('GROQ_ERROR')
              ? 'Chat failed. Please try again.'
              : '';
    if (res.headersSent) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: publicError || 'Chat failed. Please try again.',
        })}\n\n`
      );
      res.end();
      return;
    }
    if (publicError && message.includes('GROQ_RATE_LIMIT')) {
      res.status(429).json({ error: publicError });
      return;
    }
    if (publicError && (message.includes('GROQ_TIMEOUT') || message.includes('AbortError'))) {
      res.status(504).json({ error: publicError });
      return;
    }
    if (publicError && (message.includes('GROQ_AUTH') || message.includes('GROQ_UNAVAILABLE'))) {
      res.status(503).json({ error: publicError });
      return;
    }
    if (publicError) {
      res.status(502).json({ error: publicError });
      return;
    }
    next(err);
  }
});
