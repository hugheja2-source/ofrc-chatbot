const DEFAULT_CHUNK = 1200;
const DEFAULT_MAX = 3200;
const DEFAULT_OVERLAP = 400;

/**
 * Pack club documents into chunks.
 * A contact list or date schedule is one block of single-spaced lines. Those
 * blocks stay whole up to maxChunk so a later row is not retrieved without
 * the earlier rows. Longer prose still splits on a sentence or line, never
 * in the middle of a line.
 */
export function chunkText(
  text: string,
  opts: { chunkSize?: number; overlap?: number; maxChunk?: number } = {}
): string[] {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;
  const maxChunk = Math.max(chunkSize, opts.maxChunk ?? DEFAULT_MAX);
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunk) return [cleaned];

  const blocks = cleaned.split(/\n\n+/).map((block) => block.trim()).filter(Boolean);
  const chunks: string[] = [];
  let packed: string[] = [];
  let packedLen = 0;

  const flushPacked = () => {
    const piece = packed.join('\n\n').trim();
    if (piece) chunks.push(piece);
    packed = [];
    packedLen = 0;
  };

  for (const block of blocks) {
    if (block.length > maxChunk) {
      flushPacked();
      chunks.push(...splitLongBlock(block, chunkSize, overlap));
      continue;
    }
    const nextLen = packedLen + (packedLen ? 2 : 0) + block.length;
    if (packed.length && (nextLen > chunkSize || block.length > chunkSize)) flushPacked();
    packed.push(block);
    packedLen += (packed.length > 1 ? 2 : 0) + block.length;
    if (block.length > chunkSize) flushPacked();
  }
  flushPacked();
  return chunks;
}

function splitLongBlock(block: string, chunkSize: number, overlap: number): string[] {
  const lines = block.split('\n');
  const chunks: string[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let length = 0;
    while (end < lines.length) {
      const lineLen = lines[end].length + 1;
      if (end > start && length + lineLen > chunkSize) break;
      length += lineLen;
      end += 1;
    }
    if (end === start) end = start + 1;
    const piece = lines.slice(start, end).join('\n').trim();
    if (piece) chunks.push(piece);
    if (end >= lines.length) break;
    let next = end;
    let kept = 0;
    while (next > start && kept < overlap) {
      next -= 1;
      kept += lines[next].length + 1;
    }
    start = next < end ? next : end;
  }
  return chunks;
}
