import { Router } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { query } from '../db/pool';
import { requireAdmin } from '../middleware/auth';
import { ingestDocument } from '../services/ingest';

export const documentsRouter = Router();

function ensureUploadDir(): void {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    const now = new Date();
    const sub = path.join(
      config.uploadDir,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0')
    );
    fs.mkdirSync(sub, { recursive: true });
    cb(null, sub);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

documentsRouter.get('/', requireAdmin, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT d.id, d.original_filename, d.status, d.error_message, d.page_count,
              d.ingested_at, d.created_at, d.category_id, c.name AS category_name
       FROM documents d
       LEFT JOIN categories c ON c.id = d.category_id
       ORDER BY d.created_at DESC`
    );
    res.json({ documents: result.rows });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/', requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'PDF file required' });
      return;
    }
    const categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
    const result = await query(
      `INSERT INTO documents
         (category_id, original_filename, stored_filename, storage_path, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, original_filename, status, category_id`,
      [categoryId, req.file.originalname, req.file.filename, req.file.path]
    );
    res.status(201).json({ document: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/:id/ingest', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exists = await query(`SELECT id FROM documents WHERE id = $1`, [id]);
    if (!exists.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    try {
      await ingestDocument(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await query(
        `SELECT id, status, error_message, ingested_at, page_count FROM documents WHERE id = $1`,
        [id]
      );
      res.status(500).json({
        error: message,
        document: updated.rows[0] || null,
      });
      return;
    }
    const updated = await query(
      `SELECT id, status, error_message, ingested_at, page_count FROM documents WHERE id = $1`,
      [id]
    );
    res.json({ document: updated.rows[0] });
  } catch (err) {
    next(err);
  }
});

documentsRouter.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const categoryId =
      req.body.categoryId === null || req.body.categoryId === ''
        ? null
        : Number(req.body.categoryId);

    if (categoryId !== null && Number.isNaN(categoryId)) {
      res.status(400).json({ error: 'Invalid categoryId' });
      return;
    }

    const result = await query(
      `UPDATE documents SET category_id = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, category_id, original_filename, status`,
      [id, categoryId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Keep extracted topics aligned with the document's category.
    await query(
      `UPDATE topics SET category_id = $2, updated_at = NOW() WHERE document_id = $1`,
      [id, categoryId]
    );

    const withName = await query(
      `SELECT d.id, d.category_id, d.original_filename, d.status, c.name AS category_name
       FROM documents d
       LEFT JOIN categories c ON c.id = d.category_id
       WHERE d.id = $1`,
      [id]
    );
    res.json({ document: withName.rows[0] });
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await query<{ storage_path: string }>(
      `DELETE FROM documents WHERE id = $1 RETURNING storage_path`,
      [id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    try {
      await fsp.unlink(result.rows[0].storage_path);
    } catch {
      // file may already be gone
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
