const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'what', 'when',
  'where', 'who', 'whom', 'whose', 'why', 'how', 'which', 'that', 'this', 'these', 'those',
  'next', 'please', 'can', 'you', 'me', 'my', 'our', 'your', 'about', 'there', 'their',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'into', 'over', 'under',
  'any', 'some', 'tell', 'give', 'show', 'find', 'need', 'want', 'know', 'upcoming',
]);

/** Words that match almost every club document, so they are useless as a text lookup. */
const BROAD_WORDS = new Set([
  'meeting', 'meetings', 'board', 'club', 'member', 'members', 'document', 'report',
  'committee', 'annual', 'session', 'general', 'scheduled', 'schedule',
]);

const CONTACT_WORDS = new Set([
  'secretary', 'treasurer', 'president', 'director', 'phone', 'email', 'contact',
  'address', 'number',
]);

const PHONE = /\b\d{3}-\d{3}-\d{4}\b/;

export type RankedChunk = {
  id: number;
  content: string;
  document_id: number;
  original_filename: string;
  distance: number;
};

/** Distinctive words worth an exact-text lookup. */
export function queryTerms(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
  const unique = [...new Set(words)];
  const specific = unique.filter(
    (word) => word.length >= 4 && !STOP_WORDS.has(word) && !BROAD_WORDS.has(word)
  );
  const contact = unique.filter((word) => CONTACT_WORDS.has(word));
  return [...new Set([...contact, ...specific])].slice(0, 6);
}

export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Prefer a chunk that actually contains the asked-for name or role, especially
 * when that same chunk also has a phone number or email address.
 */
export function rankChunks(rows: RankedChunk[], terms: string[], limit: number): RankedChunk[] {
  const asksContact = terms.some((term) => CONTACT_WORDS.has(term));
  const best = new Map<number, { row: RankedChunk; score: number }>();
  for (const row of rows) {
    const lower = row.content.toLowerCase();
    const hits = terms.filter((term) => lower.includes(term)).length;
    const hasPhone = PHONE.test(row.content);
    const hasEmail = lower.includes('@');
    let bonus = hits * 0.06;
    if (asksContact && hits > 0 && hasPhone) bonus += 0.2;
    if (asksContact && hits > 0 && hasEmail) bonus += 0.2;
    const score = Number(row.distance) - bonus;
    const existing = best.get(row.id);
    if (!existing || score < existing.score) best.set(row.id, { row, score });
  }
  return [...best.values()]
    .sort((a, b) => a.score - b.score || Number(a.row.distance) - Number(b.row.distance))
    .slice(0, limit)
    .map((entry) => entry.row);
}
