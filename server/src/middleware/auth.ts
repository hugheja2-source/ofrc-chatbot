import { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool';

export type AdminRow = {
  id: number;
  username: string;
  is_recovery: boolean;
};

export type AuthedRequest = Request & { admin?: AdminRow };

export async function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await query<AdminRow & { expires_at: Date }>(
      `SELECT a.id, a.username, a.is_recovery, s.expires_at
       FROM sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.id = $1`,
      [token]
    );

    const row = result.rows[0];
    if (!row || new Date(row.expires_at) < new Date()) {
      if (row) {
        await query(`DELETE FROM sessions WHERE id = $1`, [token]);
      }
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.admin = {
      id: row.id,
      username: row.username,
      is_recovery: row.is_recovery,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRecovery(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.admin?.is_recovery) {
    res.status(403).json({ error: 'Recovery account required' });
    return;
  }
  next();
}
