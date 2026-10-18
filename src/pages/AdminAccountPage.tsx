import { FormEvent, useEffect, useState } from 'react';
import { api } from '../services/api';

export function AdminAccountPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [admins, setAdmins] = useState<{ id: number; username: string; isRecovery: boolean }[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [resetId, setResetId] = useState<number | ''>('');
  const [resetPassword, setResetPassword] = useState('');

  const adminRaw = localStorage.getItem('ofrc_chat_admin');
  const isRecovery = adminRaw
    ? (JSON.parse(adminRaw) as { isRecovery: boolean }).isRecovery
    : false;

  useEffect(() => {
    if (!isRecovery) return;
    api
      .listAdmins()
      .then((res) => setAdmins(res.admins))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load admins'));
  }, [isRecovery]);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.changePassword(currentPassword, newPassword);
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function onCreateAdmin(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.createAdmin(newUsername, newAdminPassword);
      setNewUsername('');
      setNewAdminPassword('');
      const res = await api.listAdmins();
      setAdmins(res.admins);
      setMessage('Admin created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    if (!resetId) return;
    setError('');
    try {
      await api.resetAdminPassword(Number(resetId), resetPassword);
      setResetPassword('');
      setMessage('Password reset. Their sessions were cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <section className="panel" style={{ padding: '1.25rem', maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Change my password</h2>
        <form onSubmit={onChangePassword} style={{ display: 'grid', gap: '0.85rem' }}>
          <label className="field">
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="field">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <button className="btn" type="submit">
            Update password
          </button>
        </form>
      </section>

      {isRecovery && (
        <>
          <section className="panel" style={{ padding: '1.25rem', maxWidth: 520 }}>
            <h2 style={{ marginTop: 0 }}>Create admin</h2>
            <form onSubmit={onCreateAdmin} style={{ display: 'grid', gap: '0.85rem' }}>
              <label className="field">
                Username
                <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
              </label>
              <label className="field">
                Temporary password
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                />
              </label>
              <button className="btn" type="submit">
                Create
              </button>
            </form>
          </section>

          <section className="panel" style={{ padding: '1.25rem', maxWidth: 520 }}>
            <h2 style={{ marginTop: 0 }}>Reset admin password</h2>
            <form onSubmit={onReset} style={{ display: 'grid', gap: '0.85rem' }}>
              <label className="field">
                Admin
                <select value={resetId} onChange={(e) => setResetId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select…</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.username}
                      {a.isRecovery ? ' (recovery)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                New password
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </label>
              <button className="btn" type="submit">
                Reset password
              </button>
            </form>
            <ul>
              {admins.map((a) => (
                <li key={a.id}>
                  {a.username}
                  {a.isRecovery ? ' — recovery account' : ''}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {message && <p style={{ color: 'var(--accent)' }}>{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
