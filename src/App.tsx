import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminLayout } from './pages/AdminLayout';
import { AdminDocumentsPage } from './pages/AdminDocumentsPage';
import { AdminTopicsPage } from './pages/AdminTopicsPage';
import { AdminAccountPage } from './pages/AdminAccountPage';
import { AdminHelpPage } from './pages/AdminHelpPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('ofrc_chat_token');
  if (!token) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img
            src="/ofrc-logo.png"
            alt="OFRC — Est. 1928 on the Russian River"
            className="brand-logo"
          />
          <span className="brand-text">
            OFRC <span>Chat</span>
          </span>
        </Link>
        <nav>
          <Link to="/">Ask</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="topics" replace />} />
          <Route path="topics" element={<AdminTopicsPage />} />
          <Route path="documents" element={<AdminDocumentsPage />} />
          <Route path="account" element={<AdminAccountPage />} />
          <Route path="help" element={<AdminHelpPage />} />
        </Route>
      </Routes>
    </div>
  );
}
