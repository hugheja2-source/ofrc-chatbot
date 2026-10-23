import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  firstWordMs?: number;
  finishedMs?: number;
};

type RecentQuestion = {
  id: string;
  question: string;
  answer?: string;
  sources?: string[];
  askedAt: number;
  firstWordMs?: number;
  finishedMs?: number;
};

const SESSION_KEY = 'ofrc_chat_session';
const RECENT_KEY = 'ofrc_chat_recent_questions';
const RECENT_LIMIT = 10;

/** Per-tab only — not shared across browsers, profiles, or other tabs. */
const tabStore = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

function wasPageReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

function loadRecent(): RecentQuestion[] {
  try {
    // Drop legacy shared history so Empty cache / hard reload and new tabs start clean.
    localStorage.removeItem(RECENT_KEY);
    if (wasPageReload()) {
      tabStore?.removeItem(RECENT_KEY);
      return [];
    }
    const raw = tabStore?.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentQuestion[];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveRecent(items: RecentQuestion[]) {
  tabStore?.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_LIMIT)));
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentQuestion[]>(() => loadRecent());
  const [sessionId, setSessionId] = useState<string | null>(() => {
    localStorage.removeItem(SESSION_KEY); // legacy cross-tab session
    return tabStore?.getItem(SESSION_KEY) ?? null;
  });
  const threadRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (messages.length === 0) return;
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages, busy]);

  function upsertRecent(entry: RecentQuestion) {
    setRecent((prev) => {
      const without = prev.filter((r) => r.id !== entry.id);
      const next = [entry, ...without].slice(0, RECENT_LIMIT);
      saveRecent(next);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const questionId = newId();
    const userMsg: Msg = { id: questionId, role: 'user', content: text };
    setInput('');
    setError('');
    setActiveQuestionId(questionId);
    setMessages((m) => [...m, userMsg]);
    upsertRecent({ id: questionId, question: text, askedAt: Date.now() });
    setBusy(true);
    setReceiving(false);

    const assistantId = `${questionId}-a`;
    const startedAt = performance.now();
    let firstWordMs: number | undefined;
    try {
      const res = await api.chat(text, sessionId, (token) => {
        if (firstWordMs === undefined) {
          firstWordMs = performance.now() - startedAt;
        }
        const seenAt = firstWordMs;
        setReceiving(true);
        setMessages((current) => {
          const existing = current.find((msg) => msg.id === assistantId);
          if (!existing) {
            return [
              ...current,
              { id: assistantId, role: 'assistant', content: token, firstWordMs: seenAt },
            ];
          }
          return current.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: msg.content + token, firstWordMs: msg.firstWordMs ?? seenAt }
              : msg
          );
        });
      });
      const finishedMs = performance.now() - startedAt;
      setSessionId(res.sessionId);
      tabStore?.setItem(SESSION_KEY, res.sessionId);
      const sources = (res.sources || []).map((s) => s.document).filter(Boolean);
      setMessages((current) => {
        const existing = current.find((msg) => msg.id === assistantId);
        if (!existing) {
          return [
            ...current,
            {
              id: assistantId,
              role: 'assistant',
              content: res.answer,
              sources,
              firstWordMs,
              finishedMs,
            },
          ];
        }
        return current.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: res.answer, sources, firstWordMs, finishedMs }
            : msg
        );
      });
      upsertRecent({
        id: questionId,
        question: text,
        answer: res.answer,
        sources,
        askedAt: Date.now(),
        firstWordMs,
        finishedMs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setBusy(false);
      setReceiving(false);
    }
  }

  function newChat() {
    tabStore?.removeItem(SESSION_KEY);
    setSessionId(null);
    setMessages([]);
    setActiveQuestionId(null);
    setError('');
  }

  function openRecent(item: RecentQuestion) {
    setActiveQuestionId(item.id);
    setError('');

    const existing = messages.find((m) => m.id === item.id);
    if (existing) {
      requestAnimationFrame(() => {
        const el = messageRefs.current[item.id];
        const thread = threadRef.current;
        if (!el || !thread) return;
        const elRect = el.getBoundingClientRect();
        const threadRect = thread.getBoundingClientRect();
        thread.scrollTop +=
          elRect.top - threadRect.top - thread.clientHeight / 2 + el.clientHeight / 2;
      });
      return;
    }

    const restored: Msg[] = [
      { id: item.id, role: 'user', content: item.question },
    ];
    if (item.answer) {
      restored.push({
        id: `${item.id}-a`,
        role: 'assistant',
        content: item.answer,
        sources: item.sources,
        firstWordMs: item.firstWordMs,
        finishedMs: item.finishedMs,
      });
    }
    setMessages(restored);
  }

  async function copyResponse(message: Msg) {
    const text = message.content;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(message.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === message.id ? null : current));
      }, 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  }

  return (
    <main className="page chat-layout">
      <section className="panel chat-main">
        <div className="chat-header">
          <div className="chat-intro">
            <h1 className="chat-title">How can we help?</h1>
            <p className="chat-lede">
              Ask about camping, cabins, RV's, events, reservations, contact information and events,
              meeting or work weekend dates, in addition to other topics.
            </p>
            <p className="chat-lede">
              All answers are generated from documents the club has shared with this chat.
            </p>
          </div>
          <div className="chat-toolbar">
            <button type="button" className="btn secondary" onClick={newChat}>
              New chat
            </button>
          </div>
        </div>

        <div className="chat-thread" ref={threadRef}>
          {messages.map((m) => (
            <div
              key={m.id}
              ref={(el) => {
                messageRefs.current[m.id] = el;
              }}
              className={
                m.role === 'user'
                  ? activeQuestionId === m.id
                    ? 'chat-bubble chat-bubble-user is-active'
                    : 'chat-bubble chat-bubble-user'
                  : 'chat-bubble chat-bubble-assistant'
              }
            >
              {m.content}
              {m.role === 'assistant' && (
                <div className="chat-bubble-actions">
                  {m.firstWordMs != null && (
                    <span className="chat-timing">First word {formatDuration(m.firstWordMs)}</span>
                  )}
                  <span className="chat-timing-finished">
                    {m.finishedMs != null && (
                      <span className="chat-timing">Finished {formatDuration(m.finishedMs)}</span>
                    )}
                    <button
                      type="button"
                      className="chat-copy-btn"
                      onClick={() => copyResponse(m)}
                      aria-label="Copy response"
                    >
                      {copiedId === m.id ? 'Copied' : 'Copy'}
                    </button>
                  </span>
                </div>
              )}
            </div>
          ))}
          {busy && !receiving && <p className="muted chat-thinking">Thinking…</p>}
        </div>

        {error && <p className="error chat-error">{error}</p>}

        <form onSubmit={onSubmit} className="chat-form">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={busy}
            className="chat-input"
            aria-label="Ask a question"
          />
          <button className="btn" type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </section>

      <aside className="chat-side">
        <section className="panel chat-about" aria-label="About this chatbot">
          <h2 className="chat-sidebar-title">About this chatbot</h2>
          <div className="chat-contact">
            <p className="chat-contact-line">
              See{' '}
              <a href="https://ofrcnews.com" target="_blank" rel="noopener noreferrer">
                OFRCNews.com
              </a>{' '}
              for documents referenced here.
            </p>
            <p className="chat-contact-line">
              Direct questions or any requests for support to{' '}
              <a href="mailto:ofrcassistant@outlook.com">ofrcassistant@outlook.com</a>.
            </p>
            <p className="chat-contact-line">
              For after-hours emergencies (non life-threatening), contact{' '}
              <a href="tel:7079090700">707-909-0700</a>
            </p>
            <p className="chat-contact-line chat-contact-911">
              In the event of a life-threatening emergency, call <a href="tel:911">911</a>.
            </p>
          </div>
        </section>

        <section
          id="chat-recent-panel"
          className="panel chat-recent"
          aria-label="Recent questions"
        >
        <div className="chat-sidebar-head">
          <h2 className="chat-sidebar-title">Recent questions</h2>
        </div>
        {recent.length === 0 ? (
          <p className="muted chat-sidebar-empty">
            Your last ten questions in this browser tab will appear here.
          </p>
        ) : (
          <ul className="chat-sidebar-list">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    activeQuestionId === item.id
                      ? 'chat-sidebar-item is-active'
                      : 'chat-sidebar-item'
                  }
                  onClick={() => openRecent(item)}
                  title={item.question}
                >
                  {item.question}
                </button>
              </li>
            ))}
          </ul>
        )}
        </section>
      </aside>
    </main>
  );
}
