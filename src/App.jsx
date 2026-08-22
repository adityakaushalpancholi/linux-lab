import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Terminal from './ui/Terminal.jsx';
import LessonPane from './ui/LessonPane.jsx';
import FileExplorer from './ui/FileExplorer.jsx';
import AuthScreen from './ui/AuthScreen.jsx';
import AchievementsPanel from './ui/AchievementsPanel.jsx';
import { Shell } from './shell/shell.js';
import { lessons, lessonById, evaluateTasks } from './lessons/lessons.js';
import { loadProgress, saveProgress, clearProgress, countDone, overallProgress } from './state/progress.js';
import { computeAchievements, earnedCount } from './state/achievements.js';
import { api } from './state/api.js';
import { downloadReport } from './report/pdf.js';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState(null); // { id, name, phone } or null for guest
  const [guest, setGuest] = useState(false);
  const [accountsAvailable, setAccountsAvailable] = useState(true);

  const [state, setState] = useState(loadProgress);
  const [shell, setShell] = useState(() => Shell.restore(loadProgress().shell));
  const [tick, setTick] = useState(0);
  const [paneOpen, setPaneOpen] = useState('lesson');
  const [exporting, setExporting] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [syncState, setSyncState] = useState('idle'); // idle | saving | saved | error

  const termRef = useRef(null);
  const syncTimer = useRef(null);
  const lastSynced = useRef('');

  const lesson = lessonById(state.currentLesson);
  const progress = useMemo(() => overallProgress(state, lessons), [state]);
  const achievements = useMemo(() => computeAchievements(state, lessons), [state]);
  const badgesEarned = earnedCount(achievements);

  /* ---------------------------------------------------------------- boot --- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.me();
      if (cancelled) return;

      if (res.ok && res.data.user) {
        adoptServerState(res.data.user, res.data.progress);
      } else if (res.offline) {
        // The API is missing or misconfigured. Still show the landing page,
        // but make it clear that only guest mode will work.
        setAccountsAvailable(false);
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function adoptServerState(user, serverState) {
    setAccount(user);
    setGuest(false);
    if (serverState && Object.keys(serverState).length) {
      const merged = { ...loadProgress(), ...serverState, name: serverState.name || user.name };
      setState(merged);
      setShell(Shell.restore(merged.shell));
      lastSynced.current = JSON.stringify(stripForSync(merged));
    } else {
      // Brand new account: keep whatever they did as a guest, so nothing is lost.
      setState((prev) => ({ ...prev, name: prev.name || user.name }));
    }
    setTick((t) => t + 1);
  }

  /* ------------------------------------------------------------ theme etc --- */

  useEffect(() => {
    shell.autofix = state.autofix;
  }, [shell, state.autofix]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    saveProgress({ ...state, shell: shell.serialise() });
  }, [state, shell, tick]);

  /* -------------------------------------------------------- cloud syncing --- */

  const stripForSync = (s) => {
    const { shell: _ignored, ...rest } = s;
    return rest;
  };

  useEffect(() => {
    if (!account) return;
    const snapshot = { ...state, shell: shell.serialise() };
    const fingerprint = JSON.stringify(stripForSync(snapshot));
    if (fingerprint === lastSynced.current) return;

    clearTimeout(syncTimer.current);
    setSyncState('saving');
    syncTimer.current = setTimeout(async () => {
      const res = await api.saveProgress(snapshot, progress.done, progress.total);
      if (res.ok) {
        lastSynced.current = fingerprint;
        setSyncState('saved');
        setTimeout(() => setSyncState((s) => (s === 'saved' ? 'idle' : s)), 2000);
      } else {
        setSyncState('error');
      }
    }, 1500);

    return () => clearTimeout(syncTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tick, account]);

  /* ------------------------------------------------------------- checking --- */

  const recheck = useCallback(
    (extra) => {
      setState((prev) => {
        const next = { ...prev, ...extra };
        const snap = {
          commands: shell.history,
          fs: shell.fs,
          shell,
          cwd: shell.cwd,
          aliases: shell.aliases,
          reportGenerated: next.reportGenerated
        };
        const tasks = { ...next.tasks };
        let changed = false;
        for (const l of lessons) {
          const passed = evaluateTasks(l, snap);
          if (!passed.length) continue;
          const merged = { ...(tasks[l.id] || {}) };
          let touched = false;
          for (const id of passed) {
            if (!merged[id]) {
              merged[id] = true;
              touched = true;
            }
          }
          if (touched) {
            tasks[l.id] = merged;
            changed = true;
          }
        }
        return changed || extra ? { ...next, tasks } : next;
      });
    },
    [shell]
  );

  const handleCommand = useCallback(
    (entry) => {
      setState((prev) => {
        const lessonId = prev.currentLesson;
        const existing = prev.transcript[lessonId] || [];
        return {
          ...prev,
          transcript: { ...prev.transcript, [lessonId]: [...existing, entry].slice(-120) },
          sessionLog: [...(prev.sessionLog || []), entry].slice(-400)
        };
      });
      recheck();
      setTick((t) => t + 1);
    },
    [recheck]
  );

  const runCommand = useCallback((cmd) => {
    setPaneOpen('terminal');
    termRef.current?.insertAndRun(cmd);
  }, []);

  const insertCommand = useCallback((cmd) => {
    setPaneOpen('terminal');
    termRef.current?.insert(cmd);
  }, []);

  /* -------------------------------------------------------------- actions --- */

  const handleReport = async () => {
    const nextState = { ...state, reportGenerated: true };
    setState(nextState);
    setExporting(true);
    try {
      await downloadReport(nextState, lessons);
      recheck({ reportGenerated: true });
    } catch (err) {
      window.alert('Could not build the PDF: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    const sure = window.confirm(
      'Reset everything? This clears your task progress, quiz answers, reflections and the practice ' +
        'filesystem. This cannot be undone.'
    );
    if (!sure) return;
    clearProgress();
    window.location.reload();
  };

  const handleSignOut = async () => {
    await api.logout();
    clearProgress();
    window.location.reload();
  };

  /* ----------------------------------------------------------------- view --- */

  if (booting) {
    return (
      <div className="boot">
        <div className="boot-mark">$_</div>
        <div className="boot-text">Starting Linux Lab…</div>
      </div>
    );
  }

  if (!account && !guest) {
    return (
      <AuthScreen
        accountsAvailable={accountsAvailable}
        onAuthenticated={(user, serverState, meta) => {
          adoptServerState(user, serverState);
          if (meta?.passwordWasReset) {
            setTimeout(() => window.alert('Password updated. You are signed in.'), 100);
          }
        }}
        onSkip={() => setGuest(true)}
      />
    );
  }

  const doneMap = state.tasks[lesson.id] || {};

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">$_</span>
          <div>
            <div className="brand-name">Linux Lab</div>
            <div className="brand-sub">Module 1 · Project Atlas</div>
          </div>
        </div>

        <nav className="lesson-nav">
          {lessons.map((l) => {
            const d = countDone(state.tasks, l);
            const complete = d === l.tasks.length;
            return (
              <button
                key={l.id}
                className={'nav-pill' + (l.id === lesson.id ? ' active' : '') + (complete ? ' complete' : '')}
                onClick={() => {
                  setState((p) => ({ ...p, currentLesson: l.id }));
                  setPaneOpen('lesson');
                }}
                title={`${l.title} — ${d}/${l.tasks.length} tasks`}
              >
                <span className="pill-num">{l.number}</span>
                <span className="pill-name">{l.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="topbar-right">
          <button
            className="badge-btn"
            onClick={() => setShowAchievements(true)}
            title="Your achievements"
          >
            🏆 <span>{badgesEarned}</span>
          </button>

          <label className="autofix" title="Suggest shows a hint. Auto-fix runs the corrected command.">
            <input
              type="checkbox"
              checked={state.autofix}
              onChange={(e) => setState((p) => ({ ...p, autofix: e.target.checked }))}
            />
            <span className="switch" />
            <span className="autofix-label">{state.autofix ? 'Auto-fix' : 'Suggest'}</span>
          </label>

          <button
            className="icon-btn"
            onClick={() => setState((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}
            title="Switch theme"
          >
            {state.theme === 'dark' ? '☀' : '☾'}
          </button>

          <button className="primary-btn" onClick={handleReport} disabled={exporting}>
            {exporting ? 'Building…' : 'Export report'}
          </button>

          <AccountMenu
            account={account}
            syncState={syncState}
            onSignOut={handleSignOut}
            onReset={handleReset}
            onSignIn={() => setGuest(false)}
          />
        </div>
      </header>

      <div className="progress-strip">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: progress.percent + '%' }} />
        </div>
        <span className="progress-text">
          {progress.done} of {progress.total} tasks · {progress.percent}%
        </span>
        {account ? (
          <span className={'sync-chip sync-' + syncState}>
            {syncState === 'saving' && 'Saving…'}
            {syncState === 'saved' && 'Saved to your account'}
            {syncState === 'error' && 'Could not save — check your connection'}
            {syncState === 'idle' && `Signed in as ${account.name}`}
          </span>
        ) : (
          <span className="sync-chip sync-guest">
            Guest mode — this device only.{' '}
            <button onClick={() => setGuest(false)}>Sign in to save</button>
          </span>
        )}
        <input
          className="name-input"
          value={state.name}
          placeholder="Name for the report"
          onChange={(e) => setState((p) => ({ ...p, name: e.target.value }))}
        />
      </div>

      <div className="mobile-tabs">
        <button className={paneOpen === 'lesson' ? 'active' : ''} onClick={() => setPaneOpen('lesson')}>
          Lesson
        </button>
        <button className={paneOpen === 'terminal' ? 'active' : ''} onClick={() => setPaneOpen('terminal')}>
          Terminal
        </button>
      </div>

      <main className="workspace">
        <div className={'pane lesson-pane' + (paneOpen === 'lesson' ? ' show' : '')}>
          <LessonPane
            lesson={lesson}
            done={doneMap}
            quizAnswers={state.quiz[lesson.id] || {}}
            reflection={state.reflections[lesson.id]}
            onRunCommand={runCommand}
            onInsertCommand={insertCommand}
            onAnswerQuiz={(qi, oi) =>
              setState((p) => ({
                ...p,
                quiz: { ...p.quiz, [lesson.id]: { ...(p.quiz[lesson.id] || {}), [qi]: oi } }
              }))
            }
            onReflection={(text) =>
              setState((p) => ({ ...p, reflections: { ...p.reflections, [lesson.id]: text } }))
            }
          />
        </div>

        <div className={'pane term-pane' + (paneOpen === 'terminal' ? ' show' : '')}>
          <FileExplorer shell={shell} tick={tick} onInsertCommand={insertCommand} />
          <Terminal
            ref={termRef}
            shell={shell}
            autofix={state.autofix}
            onCommand={handleCommand}
            onFsReset={() => setTick((t) => t + 1)}
          />
        </div>
      </main>

      {showAchievements && (
        <AchievementsPanel
          achievements={achievements}
          progress={progress}
          onClose={() => setShowAchievements(false)}
        />
      )}
    </div>
  );
}

function AccountMenu({ account, onSignOut, onReset, onSignIn }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const initials = account
    ? account.name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '?';

  return (
    <div className="account" ref={ref}>
      <button className="account-btn" onClick={() => setOpen((o) => !o)} title="Account">
        {initials}
      </button>
      {open && (
        <div className="account-menu">
          {account ? (
            <>
              <div className="account-who">
                <strong>{account.name}</strong>
                <span>{account.phone}</span>
              </div>
              <button onClick={onReset}>Reset my progress</button>
              <button onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <div className="account-who">
                <strong>Guest</strong>
                <span>Not saved to an account</span>
              </div>
              <button onClick={onSignIn}>Sign in or create account</button>
              <button onClick={onReset}>Reset my progress</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
