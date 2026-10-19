import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

type TopicBlock = {
  id: number;
  title: string;
  summary: string | null;
  documentFilename?: string | null;
  facts: { id: number; factText: string }[];
};

export function AdminTopicsPage() {
  const [categories, setCategories] = useState<
    { id: number; name: string; topics: TopicBlock[] }[]
  >([]);
  const [uncategorized, setUncategorized] = useState<TopicBlock[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [topicQuery, setTopicQuery] = useState('');

  async function refresh() {
    const data = await api.topics();
    setCategories(data.categories);
    setUncategorized(data.uncategorized);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, []);

  async function removeTopic(id: number) {
    if (!confirm('Delete this topic and its facts?')) return;
    setBusy(true);
    try {
      await api.deleteTopic(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeFact(id: number) {
    setBusy(true);
    try {
      await api.deleteFact(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const query = topicQuery.trim().toLowerCase();
    const narrow = (topics: TopicBlock[], categoryName: string) => {
      if (!query) return topics;
      const categoryHit = categoryName.toLowerCase().includes(query);
      return topics.flatMap((topic) => {
        const topicHit = [topic.title, topic.summary || '', topic.documentFilename || '']
          .join('\n')
          .toLowerCase()
          .includes(query);
        if (categoryHit || topicHit) return [topic];
        const facts = topic.facts.filter((fact) => fact.factText.toLowerCase().includes(query));
        return facts.length ? [{ ...topic, facts }] : [];
      });
    };

    return {
      categories: categories
        .map((category) => ({ ...category, topics: narrow(category.topics, category.name) }))
        .filter((category) => !query || category.topics.length > 0),
      uncategorized: narrow(uncategorized, 'uncategorized'),
    };
  }, [categories, uncategorized, topicQuery]);

  const totalTopics = categories.reduce((count, category) => count + category.topics.length, 0) + uncategorized.length;
  const visibleTopics =
    filtered.categories.reduce((count, category) => count + category.topics.length, 0) +
    filtered.uncategorized.length;

  function renderTopics(topics: TopicBlock[]) {
    if (!topics.length) return <p className="muted">No topics yet for this category.</p>;
    return topics.map((t) => (
      <article
        key={t.id}
        style={{
          padding: '1rem 0',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 0.35rem' }}>{t.title}</h3>
            {t.summary && <p className="muted" style={{ margin: 0 }}>{t.summary}</p>}
            {t.documentFilename && (
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
                Source: {t.documentFilename}
              </p>
            )}
          </div>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => removeTopic(t.id)}>
            Delete topic
          </button>
        </div>
        <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem' }}>
          {t.facts.map((f) => (
            <li key={f.id} style={{ marginBottom: '0.4rem' }}>
              {f.factText}{' '}
              <button
                type="button"
                onClick={() => removeFact(f.id)}
                disabled={busy}
                style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      </article>
    ));
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {error && <p className="error">{error}</p>}
      <section className="panel" style={{ padding: '1.25rem' }}>
        <label className="field" style={{ maxWidth: 520 }}>
          Search topics
          <input
            type="search"
            value={topicQuery}
            onChange={(e) => setTopicQuery(e.target.value)}
            placeholder="Topic, fact, category, or source file"
          />
        </label>
        {topicQuery.trim() && totalTopics > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {visibleTopics} of {totalTopics}
          </p>
        )}
      </section>
      {filtered.categories.map((c) => (
        <section key={c.id} className="panel" style={{ padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0 }}>{c.name}</h2>
          {renderTopics(c.topics)}
        </section>
      ))}
      {filtered.uncategorized.length > 0 && (
        <section className="panel" style={{ padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0 }}>Uncategorized</h2>
          {renderTopics(filtered.uncategorized)}
        </section>
      )}
      {topicQuery.trim() && totalTopics > 0 && visibleTopics === 0 && (
        <section className="panel" style={{ padding: '1.25rem' }}>
          <p className="muted">No topics match that search.</p>
        </section>
      )}
      {!categories.length && !uncategorized.length && (
        <section className="panel" style={{ padding: '1.25rem' }}>
          <p className="muted">
            No topics yet. Upload documents and run training to populate categories and key facts.
          </p>
        </section>
      )}
    </div>
  );
}
