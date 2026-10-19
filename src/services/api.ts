const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('ofrc_chat_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders(),
    ...(init.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  topicIntro: () => request<{ intro: string }>('/topics/intro'),

  health: () =>
    request<{
      ok: boolean;
      release?: string;
      chatModel?: string;
      chatModelName?: string;
      embedModel?: string;
    }>('/health'),

  login: (username: string, password: string) =>
    request<{
      token: string;
      admin: { id: number; username: string; isRecovery: boolean };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{ admin: { id: number; username: string; isRecovery: boolean } }>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  listAdmins: () =>
    request<{ admins: { id: number; username: string; isRecovery: boolean }[] }>(
      '/auth/admins'
    ),

  createAdmin: (username: string, password: string) =>
    request<{ admin: { id: number; username: string } }>('/auth/admins', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  resetAdminPassword: (id: number, newPassword: string) =>
    request<{ ok: boolean }>(`/auth/admins/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  categories: () =>
    request<{ categories: { id: number; name: string; slug: string }[] }>('/categories'),

  createCategory: (name: string, sortOrder = 0) =>
    request<{ category: { id: number; name: string } }>('/categories', {
      method: 'POST',
      body: JSON.stringify({ name, sortOrder }),
    }),

  documents: () =>
    request<{
      documents: {
        id: number;
        original_filename: string;
        status: string;
        error_message: string | null;
        category_id: number | null;
        category_name: string | null;
        ingested_at: string | null;
        source_url: string | null;
        source_kind: string;
      }[];
    }>('/documents'),

  ofrcNews: (refresh = false) =>
    request<{
      items: {
        kind: 'page' | 'post' | 'pdf';
        title: string;
        url: string;
        modified: string | null;
        documentId: number | null;
        status: string | null;
      }[];
    }>(`/documents/ofrcnews${refresh ? '?refresh=1' : ''}`),

  importOfrcNews: (url: string, categoryId?: number) =>
    request<{
      document: {
        id: number;
        status: string;
        error_message: string | null;
        original_filename: string;
        source_url: string | null;
      };
    }>('/documents/ofrcnews/import', {
      method: 'POST',
      body: JSON.stringify({ url, categoryId }),
    }),

  uploadDocument: async (file: File, categoryId?: number) => {
    const form = new FormData();
    form.append('file', file);
    if (categoryId) form.append('categoryId', String(categoryId));
    return request<{ document: { id: number; status: string } }>('/documents', {
      method: 'POST',
      body: form,
    });
  },

  ingestDocument: (id: number) =>
    request<{ document: { id: number; status: string; error_message: string | null } }>(
      `/documents/${id}/ingest`,
      { method: 'POST' }
    ),

  deleteDocument: (id: number) =>
    request<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),

  updateDocumentCategory: (id: number, categoryId: number | null) =>
    request<{
      document: {
        id: number;
        category_id: number | null;
        category_name: string | null;
        original_filename: string;
        status: string;
      };
    }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ categoryId }),
    }),

  topics: () =>
    request<{
      categories: {
        id: number;
        name: string;
        topics: {
          id: number;
          title: string;
          summary: string | null;
          documentFilename: string | null;
          facts: { id: number; factText: string }[];
        }[];
      }[];
      uncategorized: {
        id: number;
        title: string;
        summary: string | null;
        facts: { id: number; factText: string }[];
      }[];
    }>('/topics'),

  deleteTopic: (id: number) => request<{ ok: boolean }>(`/topics/${id}`, { method: 'DELETE' }),

  deleteFact: (id: number) =>
    request<{ ok: boolean }>(`/topics/facts/${id}`, { method: 'DELETE' }),

  chat: (
    message: string,
    sessionId: string | null | undefined,
    onToken: (text: string) => void
  ) => streamChat(message, sessionId, onToken),
};

export type ChatResult = {
  sessionId: string;
  answer: string;
  sources: { document: string }[];
};

async function streamChat(
  message: string,
  sessionId: string | null | undefined,
  onToken: (text: string) => void
): Promise<ChatResult> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ message, sessionId }),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  if (!res.body) {
    throw new Error('Chat failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ChatResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of part.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      const data = JSON.parse(dataLines.join('\n')) as {
        text?: string;
        error?: string;
        sessionId?: string;
        answer?: string;
        sources?: { document: string }[];
      };
      if (event === 'token' && data.text) onToken(data.text);
      if (event === 'error') throw new Error(data.error || 'Chat failed');
      if (event === 'done' && data.sessionId && data.answer) {
        result = {
          sessionId: data.sessionId,
          answer: data.answer,
          sources: data.sources || [],
        };
      }
    }
  }

  if (!result) throw new Error('Chat ended before a reply was saved');
  return result;
}
