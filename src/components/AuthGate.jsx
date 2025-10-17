import React from 'react';
import { auth, listenAuth, signInWithGoogle, logout } from '../firebase/auth';

const ADMIN_EMAIL = 'megancetech@gmail.com';

export default function AuthGate({ children }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    const unsub = listenAuth((u) => { setUser(u); setLoading(false); });
    return () => unsub();
  }, []);

  const onLogin = async () => {
    setErr('');
    try { await signInWithGoogle(); } catch (e) { setErr(e?.message || 'Failed to sign in'); }
  };

  if (loading) return <div className="toolbar"><h1>Loading…</h1></div>;

  if (!user || user.email !== ADMIN_EMAIL) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, background: '#fff' }}>
          <h2 style={{ marginTop: 0 }}>Admin Login</h2>
          <p style={{ marginTop: 6, color: '#555' }}>Sign in with the admin Google account to continue.</p>
          {user && user.email !== ADMIN_EMAIL && (
            <p style={{ color: '#a61717', fontSize: 13 }}>Signed in as {user.email}. This account is not authorized.</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {!user ? (
              <button onClick={onLogin}>Continue with Google</button>
            ) : (
              <button onClick={logout}>Switch Account</button>
            )}
          </div>
          {err && <div style={{ color: '#a61717', marginTop: 8, fontSize: 13 }}>{err}</div>}
        </div>
      </div>
    );
  }

  return children;
}

