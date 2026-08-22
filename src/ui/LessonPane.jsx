import React, { useState } from 'react';

export default function LessonPane({
  lesson,
  done,
  quizAnswers,
  reflection,
  onRunCommand,
  onInsertCommand,
  onAnswerQuiz,
  onReflection
}) {
  const doneCount = lesson.tasks.filter((t) => done[t.id]).length;

  return (
    <div className="lesson">
      <header className="lesson-head">
        <div className="lesson-eyebrow">
          Mission {lesson.number} · {lesson.minutes} min
        </div>
        <h1>{lesson.title}</h1>
        <p className="lesson-sub">{lesson.subtitle}</p>
        <blockquote className="lesson-hero">{lesson.hero}</blockquote>
      </header>

      <TaskList lesson={lesson} done={done} doneCount={doneCount} onInsertCommand={onInsertCommand} />

      {lesson.sections.map((s, i) => (
        <Section key={i} section={s} onRun={onRunCommand} onInsert={onInsertCommand} />
      ))}

      <Quiz lesson={lesson} answers={quizAnswers} onAnswer={onAnswerQuiz} />

      <section className="card reflection">
        <h2>Reflection</h2>
        <p className="muted">
          Write two or three sentences: what you chose, what surprised you, and what you would check first if
          it broke. This goes straight into your PDF report.
        </p>
        <textarea
          value={reflection || ''}
          placeholder="I used Git Bash because my laptop is low on RAM. The command that surprised me was..."
          onChange={(e) => onReflection(e.target.value)}
        />
      </section>
    </div>
  );
}

function TaskList({ lesson, done, doneCount, onInsertCommand }) {
  return (
    <section className="card tasks">
      <div className="tasks-head">
        <h2>Mission tasks</h2>
        <span className={'tasks-count' + (doneCount === lesson.tasks.length ? ' complete' : '')}>
          {doneCount} / {lesson.tasks.length}
        </span>
      </div>
      <p className="muted">
        These tick themselves as you work in the terminal. Nothing to submit here — the report reads from this
        list.
      </p>
      <ul className="task-items">
        {lesson.tasks.map((t) => (
          <li key={t.id} className={done[t.id] ? 'task done' : 'task'}>
            <span className="task-box" aria-hidden>
              {done[t.id] ? '✓' : ''}
            </span>
            <div className="task-body">
              <div className="task-title">{t.title}</div>
              {!done[t.id] && t.hint && (
                <button className="task-hint" onClick={() => onInsertCommand(firstCommand(t.hint))}>
                  Hint: {t.hint}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Pull a runnable command out of a hint string so the hint button is useful.
function firstCommand(hint) {
  const m = hint.match(/^([a-z!.][^,.]*)/);
  return m ? m[1].trim() : hint;
}

function Section({ section, onRun, onInsert }) {
  switch (section.kind) {
    case 'text':
      return (
        <section className="card">
          {section.title && <h2>{section.title}</h2>}
          {section.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      );

    case 'commands':
      return (
        <section className="card">
          {section.title && <h2>{section.title}</h2>}
          {section.note && <p className="muted">{section.note}</p>}
          <ul className="cmd-list">
            {section.items.map((item, i) => (
              <li key={i}>
                <button
                  className="cmd-chip"
                  title={item.multiline ? 'Insert this block into the terminal' : 'Run in the terminal'}
                  onClick={() =>
                    item.multiline ? onInsert(item.multiline[0]) : onRun(item.cmd)
                  }
                >
                  <span className="chip-dollar">$</span>
                  <code>{item.cmd}</code>
                </button>
                {item.note && <span className="cmd-note">{item.note}</span>}
                {item.multiline && (
                  <pre className="cmd-block">{item.multiline.join('\n')}</pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      );

    case 'callout':
      return (
        <section className={'callout tone-' + section.tone}>
          <div className="callout-label">{section.tone}</div>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </section>
      );

    case 'table':
      return (
        <section className="card">
          {section.title && <h2>{section.title}</h2>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {section.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{j === 0 ? <code>{cell}</code> : cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );

    case 'tree':
      return (
        <section className="card">
          {section.title && <h2>{section.title}</h2>}
          {section.note && <p className="muted">{section.note}</p>}
          <pre className="tree-block">{section.body}</pre>
        </section>
      );

    case 'cards':
      return (
        <section className="card">
          {section.title && <h2>{section.title}</h2>}
          {section.note && <p className="muted">{section.note}</p>}
          <div className="path-cards">
            {section.cards.map((c) => (
              <article key={c.name} className="path-card">
                <h3>{c.name}</h3>
                <div className="path-tags">
                  {c.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <p>
                  <strong>Use when:</strong> {c.use}
                </p>
                <p className="tradeoff">
                  <strong>Trade-off:</strong> {c.tradeoff}
                </p>
                <a href={c.link} target="_blank" rel="noreferrer noopener">
                  Official guide ↗
                </a>
              </article>
            ))}
          </div>
        </section>
      );

    case 'compare':
      return (
        <section className="card">
          {section.title && <h2>{section.title}</h2>}
          {section.note && <p className="muted">{section.note}</p>}
          <div className="compare">
            {[section.left, section.right].map((side, i) => (
              <div key={i} className="compare-side">
                <div className="compare-label">{side.label}</div>
                <p>{side.body}</p>
                <button className="cmd-chip" onClick={() => onRun(side.code)}>
                  <span className="chip-dollar">$</span>
                  <code>{side.code}</code>
                </button>
              </div>
            ))}
          </div>
        </section>
      );

    case 'challenge':
      return <Challenge section={section} onRun={onRun} />;

    default:
      return null;
  }
}

function Challenge({ section, onRun }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <section className="card challenge">
      <div className="challenge-label">challenge</div>
      <h2>{section.title}</h2>
      <p>{section.story}</p>
      <ol className="challenge-steps">
        {section.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <div className="challenge-actions">
        {section.start && (
          <button className="cmd-chip" onClick={() => onRun(section.start)}>
            <span className="chip-dollar">$</span>
            <code>{section.start}</code>
          </button>
        )}
        {section.link && (
          <a className="challenge-link" href={section.link} target="_blank" rel="noreferrer noopener">
            Play the real thing ↗
          </a>
        )}
        {section.answer && (
          <button className="reveal" onClick={() => setRevealed((r) => !r)}>
            {revealed ? 'Hide answer' : 'Reveal answer'}
          </button>
        )}
      </div>
      {revealed && section.answer && <p className="challenge-answer">{section.answer}</p>}
    </section>
  );
}

function Quiz({ lesson, answers, onAnswer }) {
  const correct = lesson.quiz.filter((q, i) => answers[i] === q.answer).length;
  const answered = lesson.quiz.filter((q, i) => answers[i] !== undefined).length;

  return (
    <section className="card quiz">
      <div className="tasks-head">
        <h2>Quick check</h2>
        {answered > 0 && (
          <span className={'tasks-count' + (correct === lesson.quiz.length ? ' complete' : '')}>
            {correct} / {lesson.quiz.length}
          </span>
        )}
      </div>
      {lesson.quiz.map((q, qi) => {
        const chosen = answers[qi];
        return (
          <div key={qi} className="quiz-q">
            <p className="quiz-text">{q.q}</p>
            <div className="quiz-options">
              {q.options.map((opt, oi) => {
                let cls = 'quiz-opt';
                if (chosen !== undefined) {
                  if (oi === q.answer) cls += ' correct';
                  else if (oi === chosen) cls += ' wrong';
                }
                return (
                  <button
                    key={oi}
                    className={cls}
                    disabled={chosen !== undefined}
                    onClick={() => onAnswer(qi, oi)}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {chosen !== undefined && <p className="quiz-explain">{q.explain}</p>}
          </div>
        );
      })}
    </section>
  );
}
