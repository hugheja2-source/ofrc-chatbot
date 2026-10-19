import { query, pool } from '../db/pool';
import { ingestDocument } from '../services/ingest';

async function main(): Promise<void> {
  const docs = await query<{ id: number; original_filename: string; status: string }>(
    `SELECT id, original_filename, status
     FROM documents
     WHERE status IN ('ready', 'failed', 'pending')
     ORDER BY id`
  );
  console.log(`Retraining ${docs.rows.length} document(s) with the current embedding model`);
  for (const doc of docs.rows) {
    console.log(`Retrain ${doc.id} (${doc.status}) ${doc.original_filename}`);
    try {
      await ingestDocument(doc.id);
      console.log(`Ready ${doc.id}`);
    } catch (err) {
      console.error(
        `Failed ${doc.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
