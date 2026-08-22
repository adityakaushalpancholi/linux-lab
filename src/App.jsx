import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Terminal from './ui/Terminal.jsx';
import LessonPane from './ui/LessonPane.jsx';
import { Shell } from './shell/shell.js';
import { lessons, lessonById, evaluateTasks } from './lessons/lessons.js';
import { loadProgress, saveProgress, clearProgress, countDone, overallProgress } from './state/progress.js';
import { downloadReport } from './report/pdf.js';

export default function App() {
  const [state, setState] = useState(loadProgress);
  const [shell] = useState(() => Shell.restore(state.shell));
  const [tick, setTick] = useState(0); // forces a re-render when shell state changes
  const [paneOpen, setPaneOpen] = useState('lesson'); // mobile toggle
  const termRef = useRef(null);

  const lesson = lessonById(state.currentLesson);
  const progress = useMemo(() => overallProgress(state, lessons), [state]);

  useEffect(() => {
    shell.autofix = state.autofix;
  }, [shell, state.autofix]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    saveProgress({ ...state, shell: shell.serialise() });
  }, [state, shell, tick]);

  // Re-check tasks whenever the world changes.
  const snapshot = useCallback(
    () => ({
      commands: shell.history,
      fs: shell.fs,
      shell,
      cwd: shell.cwd,
      aliases: shell.aliases,
      reportGenerated: state.reportGenerated
    }),
    [shell, state.reportGenerated]
  );

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
          const existing = tasks[l.id] || {};
          const merged = { ...existing };
          for (const id of passed) {
            if (!merged[id]) {
              merged[id] = true;
              changed = true;
            }
          }
          if (changed) tasks[l.id] = merged;
        }
        return changed ? { ...next, tasks } : next;
      });
    },
    [shell]
  );

  const handleCommand = useCallback(
    (entry) => {
      setState((prev) => {
        const lessonId = prev.currentLesson;
        const existing = prev.transcript[lessonId] || [];
        const trimmed = [...existing, entry].slice(-120);
        return {
          ...prev,
          transcript: { ...prev.transcript, [lessonId]: trimmed },
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

  const [exporting, setExporting] = useState(false);

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
      'Reset everything? This clears your task progress, quiz answers, reflections and the practice filesystem. This cannot be undone.'
    );
    if (!sure) return;
    clearProgress();
    window.location.reload();
  };

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
                className={
                  'nav-pill' + (l.id === lesson.id ? ' active' : '') + (complete ? ' complete' : '')
                }
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
          <label className="autofix" title="Suggest shows a hint. Auto-fix runs the corrected command for you.">
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

          <button className="ghost-btn" onClick={handleReset} title="Start completely over">
            Reset
          </button>

          <button className="primary-btn" onClick={handleReport} disabled={exporting}>
            {exporting ? 'Building…' : 'Export report'}
          </button>
        </div>
      </header>

      <div className="progress-strip">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: progress.percent + '%' }} />
        </div>
        <span className="progress-text">
          {progress.done} of {progress.total} tasks · {progress.percent}%
        </span>
        <input
          className="name-input"
          value={state.name}
          placeholder="Your name (for the report)"
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
          <Terminal
            ref={termRef}
            shell={shell}
            autofix={state.autofix}
            onCommand={handleCommand}
            onFsReset={() => setTick((t) => t + 1)}
          />
        </div>
      </main>
    </div>
  );
}
