import bcrypt from 'bcrypt';
import { config } from '../config';
import { query } from '../db/pool';

export async function ensureRecoveryAdmin(): Promise<void> {
  if (!config.recoveryPassword) {
    return;
  }

  const hash = await bcrypt.hash(config.recoveryPassword, config.bcryptRounds);
  const existing = await query<{ id: number }>(
    `SELECT id FROM admins WHERE is_recovery = TRUE LIMIT 1`
  );

  if (existing.rows[0]) {
    await query(
      `UPDATE admins
       SET username = $1, password_hash = $2, updated_at = NOW()
       WHERE id = $3`,
      [config.recoveryUsername, hash, existing.rows[0].id]
    );
    console.log(`Recovery admin updated: ${config.recoveryUsername}`);
    return;
  }

  const byName = await query<{ id: number; is_recovery: boolean }>(
    `SELECT id, is_recovery FROM admins WHERE username = $1`,
    [config.recoveryUsername]
  );

  if (byName.rows[0]) {
    await query(
      `UPDATE admins
       SET password_hash = $1, is_recovery = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [hash, byName.rows[0].id]
    );
    console.log(`Existing admin promoted to recovery: ${config.recoveryUsername}`);
    return;
  }

  await query(
    `INSERT INTO admins (username, password_hash, is_recovery)
     VALUES ($1, $2, TRUE)`,
    [config.recoveryUsername, hash]
  );
  console.log(`Recovery admin created: ${config.recoveryUsername}`);
}
