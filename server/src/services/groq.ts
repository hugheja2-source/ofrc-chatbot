import { config } from '../config';

type GroqMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ContextChunk = {
  content: string;
  documentFilename: string;
};

export type ExtractedTopic = {
  title: string;
  summary: string;
  facts: string[];
};

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_INSTRUCTION = `You are the OFRC (Odd Fellows Recreation Club) assistant.
Answer ONLY using the provided club document context.
Do not use general world knowledge or the public internet.
If the context is insufficient, say you do not have that information in the club documents.
If the question is ambiguous, ask ONE short clarifying question instead of guessing.
Be concise, friendly, and practical.
Never invent rules, fees, dates, phone numbers, email addresses, or policies not present in the context.
When several dates are listed, read the whole list. For what is next or upcoming, choose the earliest date that is still on or after today. Do not skip earlier dates in that list.
When your answer is based on document excerpts, name the source exactly as it appears in the context.
Do not invent or shorten source names. A source may be an uploaded PDF or an imported OFRCNews.com page.`;

function redactSecrets(value: string): string {
  return value
    .replace(/gsk_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 300);
}

function groqError(status: number, detail: string): Error {
  const clean = redactSecrets(detail || `HTTP ${status}`);
  if (status === 401 || status === 403) return new Error(`GROQ_AUTH: ${clean}`);
  if (status === 429) return new Error(`GROQ_RATE_LIMIT: ${clean}`);
  return new Error(`GROQ_ERROR: ${clean}`);
}

function assertKey(): void {
  if (!config.groqApiKey) {
    throw new Error('GROQ_AUTH: GROQ_API_KEY is empty');
  }
}

async function errorDetail(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error && typeof payload.error.message === 'string') return payload.error.message;
  return `HTTP ${response.status}`;
}

function buildChatMessages(params: {
  question: string;
  contextChunks: ContextChunk[];
  history: ChatTurn[];
}): GroqMessage[] {
  const contextBlock =
    params.contextChunks.length > 0
      ? params.contextChunks
          .map((c, i) => `[${i + 1}] Source: ${c.documentFilename}\n${c.content}`)
          .join('\n\n')
      : '(No matching club document excerpts were found.)';

  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  const prompt = `Today is ${today}.

Club document context:
${contextBlock}

Current user question:
${params.question}

Respond with plain text for the user. Do not use markdown, asterisks, or headings. If you used any sources above, mention those source names in your answer.`;

  return [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...params.history.slice(-6).map(
      (turn): GroqMessage => ({
        role: turn.role,
        content: turn.content,
      })
    ),
    { role: 'user', content: prompt },
  ];
}

function openGroqChat(body: unknown, timeoutMs: number): {
  response: Promise<Response>;
  done: () => void;
} {
  assertKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  };
  const response = (async () => {
    try {
      const result = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.groqApiKey}`,
          'User-Agent': `ofrc-chatbot/${config.appRelease}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!result.ok) {
        const detail = await errorDetail(result);
        throw groqError(result.status, detail);
      }
      return result;
    } catch (err) {
      done();
      if (err instanceof Error && err.message.startsWith('GROQ_')) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(reason)) {
        throw new Error(`GROQ_TIMEOUT: ${config.groqChatModel} did not respond in time`);
      }
      throw new Error(`GROQ_UNAVAILABLE: cannot reach Groq (${redactSecrets(reason)})`);
    }
  })();
  return { response, done };
}

export async function* streamGroundedReply(params: {
  question: string;
  contextChunks: ContextChunk[];
  history: ChatTurn[];
}): AsyncGenerator<string> {
  const request = openGroqChat(
    {
      model: config.groqChatModel,
      stream: true,
      temperature: 0,
      reasoning_effort: 'low',
      max_tokens: 400,
      messages: buildChatMessages(params),
    },
    60_000
  );
  const response = await request.response;
  if (!response.body) {
    request.done();
    throw new Error('GROQ_ERROR: empty chat stream');
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
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string } | string;
        };
        if (typeof chunk.error === 'string') {
          throw new Error(`GROQ_ERROR: ${redactSecrets(chunk.error)}`);
        }
        if (chunk.error && typeof chunk.error.message === 'string') {
          throw new Error(`GROQ_ERROR: ${redactSecrets(chunk.error.message)}`);
        }
        const text = chunk.choices?.[0]?.delta?.content || '';
        if (text) yield text;
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (reason.startsWith('GROQ_')) throw err;
    if (/abort/i.test(reason)) {
      throw new Error(`GROQ_TIMEOUT: ${config.groqChatModel} did not respond in time`);
    }
    throw new Error(`GROQ_ERROR: ${redactSecrets(reason)}`);
  } finally {
    request.done();
  }
}

function textForExtraction(documentText: string): string {
  const limit = 10_000;
  if (documentText.length <= limit) return documentText;
  const tail = documentText.slice(-4_000);
  const head = documentText.slice(0, limit - tail.length - 30);
  return `${head}\n\n[End of the document]\n\n${tail}`;
}

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
  const truncated = textForExtraction(documentText);
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
- Copy dates, phone numbers, and email addresses exactly as written
- A long document includes its beginning and its end. Schedules and contact lists are often at the end

Document text:
${truncated}`;

  const request = openGroqChat(
    {
      model: config.groqChatModel,
      stream: false,
      temperature: 0,
      reasoning_effort: 'low',
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    },
    120_000
  );
  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    const response = await request.response;
    payload = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } finally {
    request.done();
  }
  const raw = payload.choices?.[0]?.message?.content || '';
  try {
    return parseTopics(raw);
  } catch {
    console.warn('Failed to parse topic extraction JSON');
    return [];
  }
}
