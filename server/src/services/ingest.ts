import fs from 'fs/promises';
import path from 'path';
import { query } from '../db/pool';
import { chunkText } from './chunking';
import { extractTopicsAndFacts } from './groq';
import { embedText } from './ollama';
import { saveOfrcNewsSource } from './scrape';

// Avoid pdf-parse package root side effects; use the library entry directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  data: Buffer
) => Promise<{ text: string; numpages: number }>;

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export async function extractPdfText(filePath: string): Promise<{ text: string; pages: number }> {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  return { text: parsed.text || '', pages: parsed.numpages || 0 };
}

export async function ingestDocument(documentId: number): Promise<void> {
  const docRes = await query<{
    id: number;
    storage_path: string;
    category_id: number | null;
    category_name: string | null;
    source_url: string | null;
    source_kind: string;
  }>(
    `SELECT d.id, d.storage_path, d.category_id, c.name AS category_name,
            d.source_url, d.source_kind
     FROM documents d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.id = $1`,
    [documentId]
  );

  const doc = docRes.rows[0];
  if (!doc) throw new Error(`Document ${documentId} not found`);

  await query(
    `UPDATE documents SET status = 'processing', error_message = NULL, updated_at = NOW() WHERE id = $1`,
    [documentId]
  );

  try {
    const absolutePath = path.isAbsolute(doc.storage_path)
      ? doc.storage_path
      : path.resolve(doc.storage_path);

    let text = '';
    let pages = 0;
    const fromWeb = doc.source_kind === 'webpage' || doc.source_kind === 'web_pdf';
    if (fromWeb) {
      if (!doc.source_url) throw new Error('Imported page is missing its OFRCNews.com address');
      const saved = await saveOfrcNewsSource(doc.source_url, absolutePath);
      await query(`UPDATE documents SET original_filename = $2, updated_at = NOW() WHERE id = $1`, [
        documentId,
        saved.filename,
      ]);
      if (saved.kind === 'webpage') {
        text = await fs.readFile(absolutePath, 'utf8');
        pages = 1;
      } else {
        const parsed = await extractPdfText(absolutePath);
        text = parsed.text;
        pages = parsed.pages;
      }
    } else {
      const parsed = await extractPdfText(absolutePath);
      text = parsed.text;
      pages = parsed.pages;
    }

    if (!text.trim()) {
      throw new Error(fromWeb ? 'No readable text found on that page' : 'No extractable text found in PDF');
    }

    await query(`DELETE FROM topics WHERE document_id = $1`, [documentId]);
    await query(`DELETE FROM chunks WHERE document_id = $1`, [documentId]);

    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embedText(chunks[i], 'document');
      await query(
        `INSERT INTO chunks (document_id, content, chunk_index, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [documentId, chunks[i], i, toVectorLiteral(embedding)]
      );
    }

    const categoryName = doc.category_name || 'General';
    try {
      const topics = await extractTopicsAndFacts(categoryName, text);
      for (const topic of topics) {
        const topicInsert = await query<{ id: number }>(
          `INSERT INTO topics (category_id, document_id, title, summary)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [doc.category_id, documentId, topic.title, topic.summary || null]
        );
        const topicId = topicInsert.rows[0].id;
        for (const fact of topic.facts.slice(0, 12)) {
          await query(
            `INSERT INTO key_facts (topic_id, document_id, fact_text)
             VALUES ($1, $2, $3)`,
            [topicId, documentId, fact]
          );
        }
      }
    } catch (topicErr) {
      console.warn(
        `Topic extraction failed for document ${documentId}:`,
        topicErr instanceof Error ? topicErr.message : topicErr
      );
    }

    await query(
      `UPDATE documents
       SET status = 'ready', page_count = $2, ingested_at = NOW(), updated_at = NOW(), error_message = NULL
       WHERE id = $1`,
      [documentId, pages]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE documents
       SET status = 'failed', error_message = $2, updated_at = NOW()
       WHERE id = $1`,
      [documentId, message.slice(0, 1000)]
    );
    throw err;
  }
}

export async function searchChunks(question: string, limit = 6) {
  const embedding = await embedText(question, 'query');
  const result = await query<{
    id: number;
    content: string;
    document_id: number;
    original_filename: string;
    distance: number;
  }>(
    `SELECT c.id, c.content, c.document_id, d.original_filename,
            (c.embedding <=> $1::vector) AS distance
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.status = 'ready' AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [toVectorLiteral(embedding), limit]
  );
  return result.rows;
}
