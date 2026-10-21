import { config } from '../config';

async function ollamaFetch(path: string, body: unknown, timeoutMs = 180_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.ollamaBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(reason)) {
      throw new Error(`OLLAMA_TIMEOUT: ${config.ollamaEmbedModel} did not respond in time`);
    }
    throw new Error(
      `OLLAMA_UNAVAILABLE: cannot reach ${config.ollamaBaseUrl} (${reason})`
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    const detail = payload.error || `HTTP ${response.status}`;
    if (/not found|try pulling/i.test(detail)) {
      throw new Error(`OLLAMA_MODEL_MISSING: ${detail}`);
    }
    throw new Error(`OLLAMA_ERROR: ${detail}`);
  }
  return payload;
}

export async function embedText(
  text: string,
  purpose: 'query' | 'document' = 'document'
): Promise<number[]> {
  const prefix = purpose === 'query' ? 'search_query: ' : 'search_document: ';
  const payload = (await ollamaFetch('/api/embed', {
    model: config.ollamaEmbedModel,
    input: `${prefix}${text.slice(0, 2000)}`,
    keep_alive: '10m',
  })) as { embeddings?: number[][] };

  const values = payload.embeddings?.[0];
  if (!values?.length) {
    throw new Error(`Empty embedding returned from ${config.ollamaEmbedModel}`);
  }
  if (values.length !== 768) {
    throw new Error(
      `Expected 768-dimension embedding from ${config.ollamaEmbedModel}, got ${values.length}`
    );
  }
  return values;
}
