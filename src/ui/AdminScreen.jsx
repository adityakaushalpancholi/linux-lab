import React, { useState, useEffect, useCallback, useMemo } from 'react';

async function adminCall(payload) {
  try {
    const res = await fetch('/api/admin', {
      method: payload ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, error: 'The server is not reachable.' };
    }
    if (!res.ok) return { ok: false, error: data.error || 'Something went wrong.' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'No connection.' };
  }
}

export default function AdminScreen({ onExit }) {
  const [phase, setPhase] = useState('checking'); // checking | locked | ready
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [learners, setLearners] = useState([]);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    const res = await adminCall({ action: 'list' });
    if (res.ok) {
      setLearners(res.data.learners);
      setPhase('ready');
    } else {
      setPhase('locked');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await adminCall(null);
      if (res.ok && res.data.signedIn) load();
      else {
        setPhase('locked');
        if (res.ok && !res.data.configured) {
          setError('No admin password is set on this site yet. Add ADMIN_PASSWORD in Vercel.');
        }
      }
    })();
  }, [load]);

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await adminCall({ action: 'login', password });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPassword('');
    load();
  };

  const act = async (action, learner) => {
    setConfirming(null);
    setBusy(true);
    const res = await adminCall({ action, userId: learner.id });
    setBusy(false);
    if (!res.ok) return setFlash({ tone: 'bad', text: res.error });
    setFlash({ tone: 'good', text: `${learner.name}: ${res.data.message}` });
    load();
  };

  const signOut = async () => {
    await adminCall({ action: 'logout' });
    setPhase('locked');
    setLearners([]);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return learners;
    return learners.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.phone || '').includes(q)
    );
  }, [learners, query]);

  const stats = useMemo(() => {
    const active = learners.filter((l) => l.tasks_done > 0).length;
    const finished = learners.filter((l) => l.tasks_total > 0 && l.tasks_done >= l.tasks_total).length;
    const avg = learners.length
      ? Math.round(learners.reduce((s, l) => s + Number(l.percent || 0), 0) / learners.length)
      : 0;
    return { total: learners.length, active, finished, avg };
  }, [learners]);

  if (phase === 'checking') {
    return (
      <div className="boot">
        <div className="boot-mark">$_</div>
        <div className="boot-text">Checking…</div>
      </div>
    );
  }

  if (phase === 'locked') {
    return (
      <div className="admin-lock">
        <form className="admin-lock-card" onSubmit={signIn}>
          <div className="admin-lock-mark">$_</div>
          <h1>Admin</h1>
          <p>Class dashboard for Linux Lab.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            autoComplete="current-password"
          />
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
          <button type="button" className="admin-back" onClick={onExit}>
            Back to the lab
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>Class dashboard</h1>
          <p>
            {stats.total} {stats.total === 1 ? 'learner' : 'learners'} · {stats.active} started ·{' '}
            {stats.finished} finished · {stats.avg}% average
          </p>
        </div>
        <div className="admin-head-actions">
          <input
            className="admin-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or number"
          />
          <button className="ghost-btn" onClick={load} disabled={busy}>
            Refresh
          </button>
          <button className="ghost-btn" onClick={onExit}>
            Back to lab
          </button>
          <button className="ghost-btn" onClick={signOut}>
            Lock
          </button>
        </div>
      </header>

      {flash && (
        <div className={'admin-flash ' + flash.tone} onClick={() => setFlash(null)}>
          {flash.text}
        </div>
      )}

      <div className="admin-note">
        Passwords are stored as bcrypt hashes and cannot be read back by anyone, including you. Use
        <strong> Reset password</strong> instead: the next password they type when signing in becomes
        their new one.
      </div>

      {!filtered.length ? (
        <div className="admin-empty">
          {learners.length ? 'Nobody matches that search.' : 'No accounts yet. Share the link.'}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th className="col-progress">Progress</th>
                <th>Last active</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const percent = Number(l.percent || 0);
                const done = percent >= 100;
                return (
                  <tr key={l.id}>
                    <td className="cell-name">{l.name}</td>
                    <td className="cell-phone">{l.phone}</td>
                    <td>
                      <div className="admin-bar">
                        <div
                          className={'admin-bar-fill' + (done ? ' done' : '')}
                          style={{ width: Math.max(percent, 2) + '%' }}
                        />
                      </div>
                      <span className="admin-bar-label">
                        {l.tasks_done}/{l.tasks_total || '?'} · {percent}%
                      </span>
                    </td>
                    <td className="cell-when">{relative(l.last_active)}</td>
                    <td className="cell-actions">
                      {confirming === l.id ? (
                        <>
                          <span className="confirm-q">Remove permanently?</span>
                          <button className="danger" onClick={() => act('delete', l)}>
                            Yes, remove
                          </button>
                          <button onClick={() => setConfirming(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => act('reset', l)} disabled={busy}>
                            Reset password
                          </button>
                          <button onClick={() => act('clearProgress', l)} disabled={busy}>
                            Clear progress
                          </button>
                          <button className="danger" onClick={() => setConfirming(l.id)}>
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function relative(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
