import { config } from '../config';

type OllamaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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
      throw new Error(`OLLAMA_TIMEOUT: ${config.ollamaChatModel} did not respond in time`);
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

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ContextChunk = {
  content: string;
  documentFilename: string;
};

const SYSTEM_INSTRUCTION = `You are the OFRC (Odd Fellows Recreation Club) assistant.
Answer ONLY using the provided club document context.
Do not use general world knowledge or the public internet.
If the context is insufficient, say you do not have that information in the club documents.
If the question is ambiguous, ask ONE short clarifying question instead of guessing.
Be concise, friendly, and practical.
Never invent rules, fees, dates, or policies not present in the context.
When your answer is based on document excerpts, name the source file(s) in the answer
(for example: "According to cabin-rules.pdf, …"). Do not invent filenames.`;

function buildChatMessages(params: {
  question: string;
  contextChunks: ContextChunk[];
  history: ChatTurn[];
}): OllamaMessage[] {
  const contextBlock =
    params.contextChunks.length > 0
      ? params.contextChunks
          .map(
            (c, i) =>
              `[${i + 1}] Source file: ${c.documentFilename}\n${c.content}`
          )
          .join('\n\n')
      : '(No matching club document excerpts were found.)';

  const prompt = `Club document context:
${contextBlock}

Current user question:
${params.question}

Respond with plain text for the user. If you used any source files above, mention those filenames in your answer.`;

  return [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...params.history.slice(-6).map(
      (turn): OllamaMessage => ({
        role: turn.role,
        content: turn.content,
      })
    ),
    { role: 'user', content: prompt },
  ];
}

function chatRequestBody(messages: OllamaMessage[], stream: boolean) {
  return {
    model: config.ollamaChatModel,
    stream,
    messages,
    keep_alive: '10m',
    options: {
      temperature: 0.2,
      num_ctx: config.ollamaNumCtx,
      num_predict: 400,
    },
  };
}

export async function* streamGroundedReply(params: {
  question: string;
  contextChunks: ContextChunk[];
  history: ChatTurn[];
}): AsyncGenerator<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatRequestBody(buildChatMessages(params), true)),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(reason)) {
      throw new Error(`OLLAMA_TIMEOUT: ${config.ollamaChatModel} did not respond in time`);
    }
    throw new Error(`OLLAMA_UNAVAILABLE: cannot reach ${config.ollamaBaseUrl} (${reason})`);
  }

  if (!response.ok) {
    clearTimeout(timer);
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    const detail = payload.error || `HTTP ${response.status}`;
    if (/not found|try pulling/i.test(detail)) {
      throw new Error(`OLLAMA_MODEL_MISSING: ${detail}`);
    }
    throw new Error(`OLLAMA_ERROR: ${detail}`);
  }
  if (!response.body) {
    clearTimeout(timer);
    throw new Error('OLLAMA_ERROR: empty chat stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const chunk = JSON.parse(trimmed) as {
          message?: { content?: string };
          error?: string;
        };
        if (chunk.error) {
          throw new Error(`OLLAMA_ERROR: ${chunk.error}`);
        }
        const text = chunk.message?.content || '';
        if (text) yield text;
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (reason.startsWith('OLLAMA_')) throw err;
    if (/abort/i.test(reason)) {
      throw new Error(`OLLAMA_TIMEOUT: ${config.ollamaChatModel} did not respond in time`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type ExtractedTopic = {
  title: string;
  summary: string;
  facts: string[];
};

function parseTopics(raw: string): ExtractedTopic[] {
  const fenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  const json = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  const parsed = JSON.parse(json) as { topics?: ExtractedTopic[] };
  return (parsed.topics || []).filter((t) => t.title && Array.isArray(t.facts));
}

export async function extractTopicsAndFacts(
  categoryName: string,
  documentText: string
): Promise<ExtractedTopic[]> {
  // Keep the opening of long PDFs so prefill stays fast on the 2-CPU VPS.
  const truncated = documentText.slice(0, 8_000);
  const prompt = `Extract structured knowledge from this OFRC club document in category "${categoryName}".
Return JSON only as:
{
  "topics": [
    {
      "title": "short topic title",
      "summary": "1-2 sentence summary",
      "facts": ["key fact 1", "key fact 2"]
    }
  ]
}
Rules:
- 3 to 12 topics
- Facts must be concrete and grounded in the text
- No invented information
- The text may be only the beginning of a longer document

Document text:
${truncated}`;

  const payload = (await ollamaFetch(
    '/api/chat',
    {
      model: config.ollamaChatModel,
      stream: false,
      format: 'json',
      messages: [{ role: 'user', content: prompt }],
      keep_alive: '10m',
      options: {
        temperature: 0.1,
        num_ctx: config.ollamaNumCtx,
        num_predict: 1200,
      },
    },
    360_000
  )) as { message?: { content?: string } };

  const raw = payload.message?.content || '';
  try {
    return parseTopics(raw);
  } catch {
    console.warn('Failed to parse topic extraction JSON');
    return [];
  }
}
