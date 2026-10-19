import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export function AdminLayout() {
  const navigate = useNavigate();
  const adminRaw = localStorage.getItem('ofrc_chat_admin');
  const admin = adminRaw ? (JSON.parse(adminRaw) as { username: string; isRecovery: boolean }) : null;

  async function logout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem('ofrc_chat_token');
    localStorage.removeItem('ofrc_chat_admin');
    navigate('/admin/login');
  }

  return (
    <main className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Admin</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Signed in as {admin?.username || 'admin'}
            {admin?.isRecovery ? ' (recovery)' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <NavLink to="/admin/topics">Topics</NavLink>
          <NavLink to="/admin/documents">Documents</NavLink>
          <NavLink to="/admin/account">Account</NavLink>
          <NavLink to="/admin/help">Help</NavLink>
          <NavLink to="/admin/release-notes">Release notes</NavLink>
          <Link to="/">Public chat</Link>
          <button type="button" className="btn secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
      <Outlet />
    </main>
  );
}
