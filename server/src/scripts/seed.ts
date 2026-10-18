import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { query, pool } from '../db/pool';
import { ensureRecoveryAdmin } from '../services/recovery';
import { ingestDocument } from '../services/ingest';

const SEED_CATEGORIES = [
  { name: 'Bylaws', slug: 'bylaws', sort: 1, file: 'bylaws.pdf' },
  {
    name: 'Reservations & Booking',
    slug: 'reservations-booking',
    sort: 2,
    file: 'reservation-booking-guide.pdf',
  },
  { name: 'Event Sites', slug: 'event-sites', sort: 3, file: 'event-site-descriptions.pdf' },
  { name: 'Event Agreement', slug: 'event-agreement', sort: 4, file: 'event-agreement.pdf' },
  { name: 'Campground Rules', slug: 'campground-rules', sort: 5, file: 'campground-rules.pdf' },
  { name: 'Cabin Rules', slug: 'cabin-rules', sort: 6, file: 'cabin-rules.pdf' },
];

async function copySeedFile(filename: string): Promise<{ dest: string; original: string }> {
  const candidates = [
    path.resolve(process.cwd(), '../seed/documents', filename),
    path.resolve(process.cwd(), 'seed/documents', filename),
    path.resolve(__dirname, '../../../seed/documents', filename),
  ];

  let source: string | null = null;
  for (const c of candidates) {
    try {
      await fs.access(c);
      source = c;
      break;
    } catch {
      // try next
    }
  }
  if (!source) {
    throw new Error(`Seed file not found: ${filename}`);
  }

  const now = new Date();
  const sub = path.join(
    config.uploadDir,
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0')
  );
  await fs.mkdir(sub, { recursive: true });
  const stored = `${path.parse(filename).name}-${Date.now()}.pdf`;
  const dest = path.join(sub, stored);
  await fs.copyFile(source, dest);
  return { dest, original: filename };
}

async function main() {
  await ensureRecoveryAdmin();

  for (const cat of SEED_CATEGORIES) {
    const upsert = await query<{ id: number }>(
      `INSERT INTO categories (name, slug, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [cat.name, cat.slug, cat.sort]
    );
    const categoryId = upsert.rows[0].id;

    const existing = await query<{ id: number; status: string }>(
      `SELECT id, status FROM documents
       WHERE category_id = $1 AND original_filename = $2
       ORDER BY id DESC LIMIT 1`,
      [categoryId, cat.file]
    );

    let documentId: number;
    if (existing.rows[0]?.status === 'ready') {
      console.log(`Skip ingest (already ready): ${cat.file}`);
      continue;
    }

    if (existing.rows[0]) {
      documentId = existing.rows[0].id;
    } else {
      const { dest, original } = await copySeedFile(cat.file);
      const inserted = await query<{ id: number }>(
        `INSERT INTO documents
           (category_id, original_filename, stored_filename, storage_path, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id`,
        [categoryId, original, path.basename(dest), dest]
      );
      documentId = inserted.rows[0].id;
    }

    console.log(`Ingesting ${cat.file} (document ${documentId})...`);
    await ingestDocument(documentId);
    console.log(`Ready: ${cat.file}`);
  }

  console.log('Seed complete.');
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
