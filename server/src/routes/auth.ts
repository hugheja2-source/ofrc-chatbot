import { Router } from 'express';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { query } from '../db/pool';
import { AuthedRequest, requireAdmin, requireRecovery } from '../middleware/auth';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const result = await query<{
      id: number;
      username: string;
      password_hash: string;
      is_recovery: boolean;
    }>(`SELECT id, username, password_hash, is_recovery FROM admins WHERE username = $1`, [
      username,
    ]);

    const admin = result.rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const sessionId = randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + config.sessionTtlDays);

    await query(`INSERT INTO sessions (id, admin_id, expires_at) VALUES ($1, $2, $3)`, [
      sessionId,
      admin.id,
      expires.toISOString(),
    ]);

    res.json({
      token: sessionId,
      admin: {
        id: admin.id,
        username: admin.username,
        isRecovery: admin.is_recovery,
      },
      expiresAt: expires.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAdmin, async (req: AuthedRequest, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      await query(`DELETE FROM sessions WHERE id = $1`, [token]);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAdmin, async (req: AuthedRequest, res) => {
  res.json({
    admin: {
      id: req.admin!.id,
      username: req.admin!.username,
      isRecovery: req.admin!.is_recovery,
    },
  });
});

authRouter.post('/change-password', requireAdmin, async (req: AuthedRequest, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const result = await query<{ password_hash: string }>(
      `SELECT password_hash FROM admins WHERE id = $1`,
      [req.admin!.id]
    );
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await query(`UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      hash,
      req.admin!.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/admins', requireAdmin, requireRecovery, async (_req, res, next) => {
  try {
    const result = await query<{ id: number; username: string; is_recovery: boolean }>(
      `SELECT id, username, is_recovery FROM admins ORDER BY is_recovery DESC, username ASC`
    );
    res.json({
      admins: result.rows.map((a) => ({
        id: a.id,
        username: a.username,
        isRecovery: a.is_recovery,
      })),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/admins', requireAdmin, requireRecovery, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || password.length < 8) {
      res.status(400).json({ error: 'Username and password (8+ chars) required' });
      return;
    }
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    const result = await query<{ id: number; username: string }>(
      `INSERT INTO admins (username, password_hash, is_recovery)
       VALUES ($1, $2, FALSE)
       RETURNING id, username`,
      [username, hash]
    );
    res.status(201).json({ admin: { id: result.rows[0].id, username: result.rows[0].username } });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    next(err);
  }
});

authRouter.post(
  '/admins/:id/reset-password',
  requireAdmin,
  requireRecovery,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const newPassword = String(req.body.newPassword || '');
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters' });
        return;
      }

      const target = await query<{ id: number; is_recovery: boolean }>(
        `SELECT id, is_recovery FROM admins WHERE id = $1`,
        [id]
      );
      if (!target.rows[0]) {
        res.status(404).json({ error: 'Admin not found' });
        return;
      }

      const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
      await query(`UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
        hash,
        id,
      ]);
      await query(`DELETE FROM sessions WHERE admin_id = $1`, [id]);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);
