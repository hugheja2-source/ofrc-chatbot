import { Router } from 'express';
import { query } from '../db/pool';
import { requireAdmin } from '../middleware/auth';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, slug, sort_order FROM categories ORDER BY sort_order ASC, name ASC`
    );
    res.json({ categories: result.rows });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Name required' });
      return;
    }
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const sortOrder = Number(req.body.sortOrder ?? 0);
    const result = await query(
      `INSERT INTO categories (name, slug, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, sort_order`,
      [name, slug, sortOrder]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      res.status(409).json({ error: 'Category already exists' });
      return;
    }
    next(err);
  }
});
