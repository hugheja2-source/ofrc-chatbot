import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

function client(): GoogleGenerativeAI {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenerativeAI(config.geminiApiKey);
}

export async function embedText(text: string): Promise<number[]> {
  // Use REST so we can set outputDimensionality (SDK request type omits it).
  // Keep 768 dims to match chunks.embedding vector(768) in migrations.
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(config.geminiEmbedModel)}:embedContent` +
    `?key=${encodeURIComponent(config.geminiApiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: 768,
    }),
  });

  const payload = (await response.json()) as {
    embedding?: { values?: number[] };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `Embedding request failed (${response.status}) for model ${config.geminiEmbedModel}`
    );
  }

  const values = payload.embedding?.values;
  if (!values?.length) {
    throw new Error('Empty embedding returned from Gemini');
  }
  return values;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) {
    out.push(await embedText(text));
  }
  return out;
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ContextChunk = {
  content: string;
  documentFilename: string;
};

export async function generateGroundedReply(params: {
  question: string;
  contextChunks: ContextChunk[];
  history: ChatTurn[];
}): Promise<{ answer: string; needsClarification: boolean }> {
  const genAI = client();
  const model = genAI.getGenerativeModel({
    model: config.geminiChatModel,
    systemInstruction: `You are the OFRC (Odd Fellows Recreation Club) assistant.
Answer ONLY using the provided club document context.
Do not use general world knowledge or the public internet.
If the context is insufficient, say you do not have that information in the club documents.
If the question is ambiguous, ask ONE short clarifying question instead of guessing.
Be concise, friendly, and practical.
Never invent rules, fees, dates, or policies not present in the context.
When your answer is based on document excerpts, name the source file(s) in the answer
(for example: "According to cabin-rules.pdf, …"). Do not invent filenames.`,
  });

  const contextBlock =
    params.contextChunks.length > 0
      ? params.contextChunks
          .map(
            (c, i) =>
              `[${i + 1}] Source file: ${c.documentFilename}\n${c.content}`
          )
          .join('\n\n')
      : '(No matching club document excerpts were found.)';

  const historyBlock = params.history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `Club document context:
${contextBlock}

Recent conversation:
${historyBlock || '(none)'}

Current user question:
${params.question}

Respond with plain text for the user. If you used any source files above, mention those filenames in your answer.`;

  const result = await model.generateContent(prompt);
  const answer = result.response.text().trim();
  const needsClarification = /\?/.test(answer) && answer.split('?').length <= 3;
  return { answer, needsClarification };
}

export type ExtractedTopic = {
  title: string;
  summary: string;
  facts: string[];
};

export async function extractTopicsAndFacts(
  categoryName: string,
  documentText: string
): Promise<ExtractedTopic[]> {
  const genAI = client();
  const model = genAI.getGenerativeModel({
    model: config.geminiChatModel,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const truncated = documentText.slice(0, 100_000);
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

Document text:
${truncated}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  try {
    const parsed = JSON.parse(raw) as { topics?: ExtractedTopic[] };
    return (parsed.topics || []).filter((t) => t.title && Array.isArray(t.facts));
  } catch {
    console.warn('Failed to parse topic extraction JSON');
    return [];
  }
}
