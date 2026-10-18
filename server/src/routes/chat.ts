import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { query } from '../db/pool';
import { generateGroundedReply, ChatTurn } from '../services/gemini';
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
      chunks = await searchChunks(message, 6);
    } catch (err) {
      console.error('Retrieval failed:', err);
    }

    const strongChunks = chunks.filter((c) => Number(c.distance) < 0.55);
    const usedChunks = strongChunks.length > 0 ? strongChunks : chunks.slice(0, 3);
    const contextChunks = usedChunks.map((c) => ({
      content: c.content,
      documentFilename: c.original_filename,
    }));

    const { answer: rawAnswer } = await generateGroundedReply({
      question: message,
      contextChunks,
      history,
    });

    const sourceNames = [
      ...new Set(usedChunks.map((c) => c.original_filename).filter(Boolean)),
    ];
    const looksLikeRefusal =
      /do not have that information|don't have that information|no matching|not in the club documents/i.test(
        rawAnswer
      );
    let answer = rawAnswer;
    if (sourceNames.length > 0 && !looksLikeRefusal) {
      const missingCitation = sourceNames.some(
        (name) => !rawAnswer.toLowerCase().includes(name.toLowerCase())
      );
      if (missingCitation) {
        answer = `${rawAnswer}\n\nReferences: ${sourceNames.join(', ')}`;
      }
    }

    await query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
      [sessionId, answer]
    );

    res.json({
      sessionId,
      answer,
      sources: sourceNames.map((document) => ({ document })),
    });
    } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('GEMINI_API_KEY')) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured. Add a free Google AI Studio key to server/.env and restart the API.',
      });
      return;
    }
    if (
      message.includes('429') ||
      /quota|rate.?limit|Too Many Requests/i.test(message)
    ) {
      res.status(429).json({
        error:
          'The free Gemini quota for the chat model was exceeded. Wait for the daily reset, or set GEMINI_CHAT_MODEL in server/.env to another free model (for example gemini-3.1-flash-lite) and restart the API.',
      });
      return;
    }
    next(err);
  }
});
