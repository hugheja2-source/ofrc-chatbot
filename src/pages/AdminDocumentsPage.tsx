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
      setMessage(`Re-trained document #${id}`);
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
        {message && <p style={{ color: 'var(--accent)' }}>{message}</p>}
        {error && <p className="error">{error}</p>}
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
                  {d.error_message ? ` · ${d.error_message}` : ''}
                </div>
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
                  Re-train
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
