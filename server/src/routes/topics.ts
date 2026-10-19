import { Router } from 'express';
import { query } from '../db/pool';
import { requireAdmin } from '../middleware/auth';
import { loadTopicIntro } from '../services/topicIntro';

export const topicsRouter = Router();

topicsRouter.get('/intro', async (_req, res, next) => {
  try {
    const intro = await loadTopicIntro();
    res.json({ intro });
  } catch (err) {
    next(err);
  }
});

topicsRouter.get('/', requireAdmin, async (_req, res, next) => {
  try {
    const categories = await query<{ id: number; name: string; slug: string; sort_order: number }>(
      `SELECT id, name, slug, sort_order FROM categories ORDER BY sort_order ASC, name ASC`
    );

    const topics = await query<{
      id: number;
      title: string;
      summary: string | null;
      category_id: number | null;
      document_id: number | null;
      original_filename: string | null;
    }>(
      `SELECT t.id, t.title, t.summary, t.category_id, t.document_id, d.original_filename
       FROM topics t
       LEFT JOIN documents d ON d.id = t.document_id
       ORDER BY t.title ASC`
    );

    const facts = await query<{
      id: number;
      topic_id: number;
      fact_text: string;
    }>(`SELECT id, topic_id, fact_text FROM key_facts ORDER BY id ASC`);

    const factsByTopic = new Map<number, { id: number; factText: string }[]>();
    for (const f of facts.rows) {
      const list = factsByTopic.get(f.topic_id) || [];
      list.push({ id: f.id, factText: f.fact_text });
      factsByTopic.set(f.topic_id, list);
    }

    const topicsByCategory = new Map<number | null, typeof topics.rows>();
    for (const t of topics.rows) {
      const key = t.category_id;
      const list = topicsByCategory.get(key) || [];
      list.push(t);
      topicsByCategory.set(key, list);
    }

    const categorized = categories.rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      topics: (topicsByCategory.get(c.id) || []).map((t) => ({
        id: t.id,
        title: t.title,
        summary: t.summary,
        documentFilename: t.original_filename,
        facts: factsByTopic.get(t.id) || [],
      })),
    }));

    const uncategorized = (topicsByCategory.get(null) || []).map((t) => ({
      id: t.id,
      title: t.title,
      summary: t.summary,
      documentFilename: t.original_filename,
      facts: factsByTopic.get(t.id) || [],
    }));

    res.json({ categories: categorized, uncategorized });
  } catch (err) {
    next(err);
  }
});

topicsRouter.delete('/facts/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await query(`DELETE FROM key_facts WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Fact not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

topicsRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await query(`DELETE FROM topics WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
