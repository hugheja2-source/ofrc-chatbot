import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (localStorage.getItem('ofrc_chat_token')) {
    return <Navigate to="/admin/topics" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.login(username, password);
      localStorage.setItem('ofrc_chat_token', res.token);
      localStorage.setItem('ofrc_chat_admin', JSON.stringify(res.admin));
      navigate('/admin/topics');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 420 }}>
      <section className="panel" style={{ padding: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Admin login</h1>
        <p className="muted">Manage documents, topics, and training for OFRC Chat.</p>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label className="field">
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
