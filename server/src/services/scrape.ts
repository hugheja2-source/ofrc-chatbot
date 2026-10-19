import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';

const SITE_HOST = 'ofrcnews.com';
const SITE_ORIGIN = `https://${SITE_HOST}`;
const USER_AGENT = `OFRC-Chatbot/${config.appRelease} (club knowledge import; +https://ofrcnews.com)`;
const SKIP_PATHS = ['/cart/', '/checkout/', '/my-account/', '/shop/', '/thank-you/', '/cancel/'];
const MIN_PAGE_TEXT = 40;

export type NewsKind = 'page' | 'post' | 'pdf';

export type CatalogItem = {
  kind: NewsKind;
  id: number;
  title: string;
  url: string;
  modified: string | null;
};

type WpListItem = {
  id: number;
  link?: string;
  slug?: string;
  modified?: string;
  title?: { rendered?: string };
  source_url?: string;
  mime_type?: string;
};

const BLOCK_BREAKS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'tr',
  'blockquote',
  'section',
  'article',
  'br',
]);

let catalogCache: { at: number; items: CatalogItem[] } | null = null;

export function sourceLabel(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 160);
  return `${clean} — ofrcnews.com`;
}

function allowedNewsUrl(raw: string, keepSearch: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a full OFRCNews.com address.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only OFRCNews.com pages can be imported.');
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== SITE_HOST) {
    throw new Error('Only public pages on ofrcnews.com can be imported.');
  }
  url.protocol = 'https:';
  url.hostname = SITE_HOST;
  url.hash = '';
  url.username = '';
  url.password = '';
  if (!keepSearch) url.search = '';
  return url;
}

export function normalizeNewsUrl(raw: string): string {
  return allowedNewsUrl(raw, false).toString();
}

function isSkippedPath(url: string): boolean {
  const pathname = new URL(url).pathname;
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return SKIP_PATHS.some((skip) => withSlash === skip);
}

function linkTarget(attrs: string): string | null {
  const match = attrs.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const raw = decodeHtml((match?.[1] || match?.[2] || match?.[3] || '').replace(/\s+/g, '')).trim();
  if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, `${SITE_ORIGIN}/`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') return null;
  if (url.hash.startsWith('#:~:')) url.hash = '';
  return url.toString().replace(/%20$/i, '');
}

export function htmlToText(html: string): string {
  const parts: string[] = [];
  const stack: { tag: string; skipping: boolean }[] = [];
  const anchors: Array<string | null> = [];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9:-]+)\s*>|<([a-zA-Z0-9:-]+)([^>]*)>|[^<]+/g;
  let match: RegExpExecArray | null;

  const skipping = () => stack.some((frame) => frame.skipping);

  while ((match = re.exec(html))) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;

    if (token.startsWith('</')) {
      const tag = match[1].toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        const frame = stack.pop();
        if (frame?.tag === tag) break;
      }
      if (tag === 'a') {
        const href = anchors.pop();
        if (href && !skipping()) parts.push(`(${href})`);
      }
      if (!skipping() && BLOCK_BREAKS.has(tag)) parts.push('\n');
      continue;
    }

    if (token.startsWith('<')) {
      const tag = match[2].toLowerCase();
      const attrs = match[3] || '';
      const selfClosing =
        /\/>\s*$/.test(token) ||
        ['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr'].includes(tag);
      const noisy =
        ['script', 'style', 'noscript', 'svg', 'form', 'iframe', 'template', 'button', 'textarea', 'select'].includes(
          tag
        ) ||
        (tag === 'div' && /contact-form|grunion|jetpack-contact-form|wp-block-jetpack/i.test(attrs));

      if (tag === 'a') anchors.push(skipping() ? null : linkTarget(attrs));
      if (!selfClosing) {
        stack.push({ tag, skipping: noisy || skipping() });
      } else if (tag === 'a') {
        const href = anchors.pop();
        if (href && !skipping()) parts.push(`(${href})`);
      }
      if (!skipping() && tag === 'li') parts.push('\n- ');
      else if (!skipping() && (tag === 'br' || BLOCK_BREAKS.has(tag))) parts.push('\n');
      continue;
    }

    if (!skipping()) parts.push(token);
  }

  const decoded = decodeHtml(parts.join(' '))
    .replace(/\[[a-z0-9_:-]+[^\]]*\]/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return decoded
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== 'Δ')
    .join('\n');
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return entity;
      return String.fromCodePoint(code);
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

function plainTitle(rendered: string | undefined, fallback: string): string {
  const text = decodeHtml(String(rendered || '').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

async function fetchAllowed(url: string, redirectsLeft = 3): Promise<Response> {
  const target = allowedNewsUrl(url, true);
  const response = await fetch(target, {
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/html, application/pdf;q=0.9, */*;q=0.8',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location || redirectsLeft <= 0) {
      throw new Error('OFRCNews.com redirected too many times.');
    }
    const next = allowedNewsUrl(new URL(location, target).toString(), true).toString();
    return fetchAllowed(next, redirectsLeft - 1);
  }

  return response;
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      throw new Error('OFRCNews.com returned a page that is too large to import.');
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error('OFRCNews.com returned a page that is too large to import.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function wpGet(pathname: string): Promise<{ items: WpListItem[]; totalPages: number }> {
  const response = await fetchAllowed(`${SITE_ORIGIN}${pathname}`);
  if (response.status === 400) {
    return { items: [], totalPages: 0 };
  }
  if (!response.ok) {
    throw new Error(`OFRCNews.com did not return page data (${response.status}).`);
  }
  const body = await readLimitedText(response, 3_000_000);
  let parsed: WpListItem[] | { code?: string };
  try {
    parsed = JSON.parse(body) as WpListItem[] | { code?: string };
  } catch {
    throw new Error('OFRCNews.com returned a page that was not data.');
  }
  if (!Array.isArray(parsed)) {
    if (parsed.code === 'rest_post_invalid_page_number') {
      return { items: [], totalPages: 0 };
    }
    throw new Error('OFRCNews.com returned an unexpected response.');
  }
  const totalPages = Number(response.headers.get('x-wp-totalpages') || 1);
  return { items: parsed, totalPages };
}

async function wpList(resource: 'pages' | 'posts'): Promise<WpListItem[]> {
  const all: WpListItem[] = [];
  for (let page = 1; page <= 10; page++) {
    const { items, totalPages } = await wpGet(
      `/wp-json/wp/v2/${resource}?per_page=100&page=${page}&status=publish&_fields=id,link,slug,title,modified`
    );
    all.push(...items);
    if (page >= totalPages || items.length === 0) break;
  }
  return all;
}

async function loadCatalog(): Promise<CatalogItem[]> {
  const [pages, posts, media] = await Promise.all([
    wpList('pages'),
    wpList('posts'),
    (async () => {
      const all: WpListItem[] = [];
      for (let page = 1; page <= 10; page++) {
        const { items, totalPages } = await wpGet(
          `/wp-json/wp/v2/media?per_page=100&page=${page}&media_type=application&_fields=id,source_url,mime_type,title,modified`
        );
        all.push(...items);
        if (page >= totalPages || items.length === 0) break;
      }
      return all;
    })(),
  ]);

  const items: CatalogItem[] = [];
  const seen = new Set<string>();

  const remember = (url: string) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  };

  for (const page of pages) {
    if (!page.link) continue;
    const url = normalizeNewsUrl(page.link);
    if (isSkippedPath(url) || !remember(url)) continue;
    items.push({
      kind: 'page',
      id: page.id,
      title: plainTitle(page.title?.rendered, 'OFRC News page'),
      url,
      modified: page.modified || null,
    });
  }

  for (const post of posts) {
    if (!post.link) continue;
    const url = normalizeNewsUrl(post.link);
    if (isSkippedPath(url) || !remember(url)) continue;
    items.push({
      kind: 'post',
      id: post.id,
      title: plainTitle(post.title?.rendered, 'OFRC News post'),
      url,
      modified: post.modified || null,
    });
  }

  for (const file of media) {
    if (file.mime_type !== 'application/pdf' || !file.source_url) continue;
    const url = normalizeNewsUrl(file.source_url);
    if (!url.toLowerCase().endsWith('.pdf') || !remember(url)) continue;
    const fallback = path.basename(new URL(url).pathname);
    items.push({
      kind: 'pdf',
      id: file.id,
      title: plainTitle(file.title?.rendered, fallback),
      url,
      modified: file.modified || null,
    });
  }

  const rank: Record<NewsKind, number> = { page: 0, post: 1, pdf: 2 };
  items.sort((a, b) => rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title));
  return items;
}

export async function listOfrcNewsCatalog(force = false): Promise<CatalogItem[]> {
  if (!force && catalogCache && Date.now() - catalogCache.at < 60_000) {
    return catalogCache.items;
  }
  const items = await loadCatalog();
  catalogCache = { at: Date.now(), items };
  return items;
}

export async function resolveOfrcNewsItem(url: string): Promise<CatalogItem> {
  const normalized = normalizeNewsUrl(url);
  let items = await listOfrcNewsCatalog();
  let item = items.find((entry) => entry.url === normalized);
  if (!item) {
    items = await listOfrcNewsCatalog(true);
    item = items.find((entry) => entry.url === normalized);
  }
  if (!item) {
    throw new Error('That address is not a public OFRCNews.com page, post, or PDF.');
  }
  return item;
}

async function fetchRenderedContent(item: CatalogItem): Promise<string> {
  const resource = item.kind === 'post' ? 'posts' : 'pages';
  const response = await fetchAllowed(
    `${SITE_ORIGIN}/wp-json/wp/v2/${resource}/${item.id}?_fields=content,title`
  );
  if (!response.ok) {
    throw new Error(`Could not read “${item.title}” from OFRCNews.com (${response.status}).`);
  }
  const body = await readLimitedText(response, 3_000_000);
  let parsed: { content?: { rendered?: string } };
  try {
    parsed = JSON.parse(body) as { content?: { rendered?: string } };
  } catch {
    throw new Error('OFRCNews.com returned a page that was not data.');
  }
  return htmlToText(parsed.content?.rendered || '');
}

export async function saveOfrcNewsSource(
  url: string,
  destPath: string
): Promise<{ title: string; kind: 'webpage' | 'web_pdf'; filename: string }> {
  const item = await resolveOfrcNewsItem(url);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const filename = sourceLabel(item.title);

  if (item.kind === 'pdf') {
    const pdf = await downloadPdf(item.url);
    await fs.writeFile(destPath, pdf);
    return { title: item.title, kind: 'web_pdf', filename };
  }

  const text = await fetchRenderedContent(item);
  if (text.length < MIN_PAGE_TEXT) {
    throw new Error(
      `“${item.title}” does not have enough readable text to train. It may be a form, calendar, or image.`
    );
  }
  const documentText = [`Title: ${item.title}`, `Source: ${item.url}`, '', text].join('\n');
  await fs.writeFile(destPath, documentText, 'utf8');
  return { title: item.title, kind: 'webpage', filename };
}

async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetchAllowed(url);
  if (!response.ok) {
    throw new Error(`Could not download the PDF (${response.status}).`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    assertPdf(buffer);
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > config.uploadMaxBytes) {
      await reader.cancel();
      throw new Error('That PDF is larger than the upload limit.');
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  assertPdf(buffer);
  return buffer;
}

function assertPdf(buffer: Buffer): void {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('utf8') !== '%PDF-') {
    throw new Error('OFRCNews.com did not return a PDF for that file.');
  }
}
