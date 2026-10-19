import { FormEvent, useEffect, useState } from 'react';
import { api } from '../services/api';

type Category = { id: number; name: string };
type Doc = {
  id: number;
  original_filename: string;
  status: string;
  error_message: string | null;
  category_id: number | null;
  category_name: string | null;
  ingested_at: string | null;
  source_url: string | null;
  source_kind: string;
};

type NewsItem = {
  kind: 'page' | 'post' | 'pdf';
  title: string;
  url: string;
  modified: string | null;
  documentId: number | null;
  status: string | null;
};

const KIND_LABEL: Record<NewsItem['kind'], string> = {
  page: 'Page',
  post: 'Post',
  pdf: 'PDF',
};

export function AdminDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [newsCategoryId, setNewsCategoryId] = useState('');

  async function refresh() {
    const [d, c] = await Promise.all([api.documents(), api.categories()]);
    setDocs(d.documents);
    setCategories(c.categories);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, []);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const uploaded = await api.uploadDocument(
        file,
        categoryId ? Number(categoryId) : undefined
      );
      setMessage(`Uploaded. Ingesting document #${uploaded.document.id}…`);
      await api.ingestDocument(uploaded.document.id);
      setFile(null);
      setMessage('Upload and training complete.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setBusy(true);
    try {
      await api.createCategory(newCategory.trim());
      setNewCategory('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create category');
    } finally {
      setBusy(false);
    }
  }

  async function reiningest(id: number) {
    setBusy(true);
    setError('');
    try {
      await api.ingestDocument(id);
      await refresh();
      const current = docs.find((doc) => doc.id === id);
      setMessage(
        current?.source_url
          ? `Refreshed ${current.original_filename}`
          : `Re-trained document #${id}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this document and its trained chunks?')) return;
    setBusy(true);
    try {
      await api.deleteDocument(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function loadNews() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api.ofrcNews(true);
      setNews(data.items);
      setSelected(data.items.filter((item) => !item.documentId).map((item) => item.url));
      setMessage(
        data.items.length
          ? `Found ${data.items.length} public pages, posts, and PDFs on OFRCNews.com.`
          : 'OFRCNews.com did not list any public pages.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read OFRCNews.com');
    } finally {
      setBusy(false);
    }
  }

  function toggleNews(url: string) {
    setSelected((current) =>
      current.includes(url) ? current.filter((item) => item !== url) : [...current, url]
    );
  }

  async function importNews(e: FormEvent) {
    e.preventDefault();
    if (!news || selected.length === 0) return;
    const items = news.filter((item) => selected.includes(item.url));
    setBusy(true);
    setError('');
    setMessage('');
    const failures: string[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setMessage(`Importing ${i + 1} of ${items.length}: ${item.title}`);
        try {
          await api.importOfrcNews(item.url, newsCategoryId ? Number(newsCategoryId) : undefined);
        } catch (err) {
          failures.push(`${item.title}: ${err instanceof Error ? err.message : 'Import failed'}`);
        }
      }
      await refresh();
      const data = await api.ofrcNews(true);
      setNews(data.items);
      setSelected([]);
      if (failures.length) {
        setError(failures.join('\n'));
        setMessage(
          `Imported ${items.length - failures.length} of ${items.length}. The rest need another try.`
        );
      } else {
        setMessage(
          `Imported and trained ${items.length} item${items.length === 1 ? '' : 's'} from OFRCNews.com.`
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function changeCategory(id: number, nextCategoryId: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.updateDocumentCategory(
        id,
        nextCategoryId ? Number(nextCategoryId) : null
      );
      setMessage(`Updated category for document #${id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update category');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {(message || error) && (
        <section className="panel" style={{ padding: '1rem 1.25rem' }}>
          {message && <p style={{ color: 'var(--accent)', whiteSpace: 'pre-wrap', margin: 0 }}>{message}</p>}
          {error && (
            <p className="error" style={{ whiteSpace: 'pre-wrap', margin: message ? '0.75rem 0 0' : 0 }}>
              {error}
            </p>
          )}
        </section>
      )}
      <section className="panel" style={{ padding: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Upload & train</h2>
        <form onSubmit={onUpload} style={{ display: 'grid', gap: '0.85rem', maxWidth: 520 }}>
          <label className="field">
            PDF file
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <label className="field">
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit" disabled={busy || !file}>
            {busy ? 'Working…' : 'Upload & train'}
          </button>
        </form>
        <form onSubmit={onCreateCategory} style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', maxWidth: 520 }}>
          <input
            placeholder="New category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{ flex: 1, borderRadius: 12, border: '1px solid var(--line)', padding: '0.7rem 0.9rem' }}
          />
          <button className="btn secondary" type="submit" disabled={busy}>
            Add category
          </button>
        </form>
      </section>

      <section className="panel" style={{ padding: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Import from OFRCNews.com</h2>
        <p className="muted" style={{ maxWidth: 720 }}>
          Pull public pages, posts, and PDFs from ofrcnews.com into the knowledge base. Chat still
          answers only from trained material. Member-only pages behind a login are not included.
          Shop, cart, and checkout pages are skipped.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button type="button" className="btn secondary" disabled={busy} onClick={loadNews}>
            {busy && !news ? 'Loading…' : 'Load OFRCNews.com'}
          </button>
        </div>
        {news && (
          <form onSubmit={importNews} style={{ display: 'grid', gap: '0.85rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setSelected(news.map((item) => item.url))}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() =>
                  setSelected(news.filter((item) => !item.documentId).map((item) => item.url))
                }
              >
                Select new
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gap: '0.35rem',
                maxHeight: 420,
                overflow: 'auto',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '0.5rem 0.75rem',
              }}
            >
              {news.map((item) => (
                <label
                  key={item.url}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '0.75rem',
                    alignItems: 'start',
                    padding: '0.45rem 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(item.url)}
                    disabled={busy}
                    onChange={() => toggleNews(item.url)}
                    style={{ marginTop: '0.3rem' }}
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <span className="muted"> · {KIND_LABEL[item.kind]}</span>
                    {item.documentId && (
                      <span className="muted"> · In library{item.status ? ` · ${item.status}` : ''}</span>
                    )}
                    <div className="muted" style={{ wordBreak: 'break-all' }}>
                      {item.url}
                    </div>
                  </span>
                </label>
              ))}
            </div>
            <label className="field" style={{ maxWidth: 520 }}>
              Category for new imports
              <select
                value={newsCategoryId}
                onChange={(e) => setNewsCategoryId(e.target.value)}
                disabled={busy}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit" disabled={busy || selected.length === 0}>
              {busy ? 'Working…' : `Import & train (${selected.length})`}
            </button>
            <p className="muted" style={{ margin: 0 }}>
              Pages already in the library are downloaded again and re-trained. A category here
              applies to new imports, and to an existing page only when you choose one.
            </p>
          </form>
        )}
      </section>

      <section className="panel" style={{ padding: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Documents</h2>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {docs.length === 0 && <p className="muted">No documents yet.</p>}
          {docs.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                padding: '0.85rem 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong>{d.original_filename}</strong>
                <div className="muted" style={{ marginBottom: '0.5rem' }}>
                  {d.status}
                  {d.source_kind === 'webpage' ? ' · OFRCNews page' : ''}
                  {d.source_kind === 'web_pdf' ? ' · OFRCNews PDF' : ''}
                  {d.error_message ? ` · ${d.error_message}` : ''}
                </div>
                {d.source_url && (
                  <div className="muted" style={{ marginBottom: '0.5rem', wordBreak: 'break-all' }}>
                    <a href={d.source_url} target="_blank" rel="noopener noreferrer">
                      {d.source_url}
                    </a>
                  </div>
                )}
                <label className="field" style={{ maxWidth: 280 }}>
                  Category
                  <select
                    value={d.category_id ?? ''}
                    disabled={busy}
                    onChange={(e) => changeCategory(d.id, e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => reiningest(d.id)}>
                  {d.source_url ? 'Refresh' : 'Re-train'}
                </button>
                <button type="button" className="btn danger" disabled={busy} onClick={() => remove(d.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
