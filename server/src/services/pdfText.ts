export type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type Glyph = {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
};

type Line = {
  y: number;
  size: number;
  glyphs: Glyph[];
};

/** Join PDF text items into reading order, keeping superscripts on their date line. */
export function assemblePageText(items: PdfTextItem[]): string {
  const glyphs: Glyph[] = [];
  for (const item of items) {
    const str = item.str ?? '';
    if (!str) continue;
    const transform = item.transform || [];
    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;
    const size = Math.min(Math.abs(transform[3] || item.height || 11), 28) || 11;
    const width = item.width && item.width > 0 ? item.width : Math.max(str.length * size * 0.45, 1);
    glyphs.push({ str, x, y, width, size });
  }
  if (!glyphs.length) return '';

  glyphs.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Line[] = [];
  for (const glyph of glyphs) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - glyph.y) <= 2.5) {
      current.glyphs.push(glyph);
      if (glyph.size > current.size) current.size = glyph.size;
      continue;
    }
    lines.push({ y: glyph.y, size: glyph.size, glyphs: [glyph] });
  }

  // A superscript ordinal is its own short line a few points above the date.
  // Attach it to the baseline under it. Do not merge other wrapped rows.
  for (let i = 0; i < lines.length - 1; i++) {
    if (!isOrdinalLine(lines[i])) continue;
    const baseline = lines[i + 1];
    const gap = lines[i].y - baseline.y;
    if (gap < 0 || gap > 6.5) continue;
    baseline.glyphs.push(...lines[i].glyphs);
    lines.splice(i, 1);
    i -= 1;
  }

  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = joinLine(lines[i]);
    if (!line) continue;
    const previous = lines[i - 1];
    if (previous && parts.length) {
      const gap = previous.y - lines[i].y;
      if (gap > 26) parts.push('');
    }
    parts.push(line);
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isOrdinalLine(line: Line): boolean {
  const text = line.glyphs.map((glyph) => glyph.str).join('').trim();
  return /^(st|nd|rd|th)$/i.test(text);
}

function joinLine(line: Line): string {
  const ordered = [...line.glyphs].sort((a, b) => a.x - b.x);
  let text = '';
  let cursor = Number.NEGATIVE_INFINITY;
  for (const glyph of ordered) {
    if (text) {
      const gap = glyph.x - cursor;
      const opened = text[text.length - 1] !== ' ' && !glyph.str.startsWith(' ');
      if (opened && gap > Math.max(2, glyph.size * 0.22)) text += ' ';
    }
    text += glyph.str;
    cursor = Math.max(cursor, glyph.x + glyph.width);
  }
  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

export async function renderPdfPage(pageData: {
  getTextContent: (options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
}): Promise<string> {
  const content = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });
  return assemblePageText(content.items || []);
}
