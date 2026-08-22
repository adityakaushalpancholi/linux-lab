import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle
} from 'react';

const MS = String.fromCharCode(1);
const ME = String.fromCharCode(2);
const MARK_RE = new RegExp(MS + '([dxm])([\\s\\S]*?)' + ME, 'g');

const KIND_CLASS = { d: 'tok-dir', x: 'tok-exec', m: 'tok-match' };

// Turn the colour markers the shell emits into styled spans.
function Marked({ text }) {
  const parts = [];
  let last = 0;
  let m;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={parts.length} className={KIND_CLASS[m[1]] || ''}>
        {m[2]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function stripMarkers(text) {
  MARK_RE.lastIndex = 0;
  return text.replace(MARK_RE, '$2');
}

/* ------------------------------------------------------------- tail -f --- */

const FOLLOW_LINES = [
  'INFO  [api]     GET /projects 200 29ms',
  'INFO  [auth]    Session refreshed user=rohit',
  'INFO  [cache]   Cache hit ratio 0.94',
  'ERROR [payment] Payment Failed order=AT-511 reason=card_declined',
  'INFO  [worker]  Email queued to=maya@atlas.dev',
  'INFO  [api]     POST /login 200 61ms',
  'ERROR [auth]    Token Expired user=maya token=exp_2041',
  'INFO  [system]  Health check ok',
  'INFO  [db]      Connection pool 12/20',
  'ERROR [api]     Rate Limit Exceeded ip=10.0.4.88'
];

/* ------------------------------------------------------------ component --- */

const Terminal = forwardRef(function Terminal(
  { shell, onCommand, autofix, onFsReset, onOpenLesson },
  ref
) {
  const [blocks, setBlocks] = useState(() => [
    {
      type: 'banner',
      text:
        'Linux Lab — a safe practice terminal.\n' +
        'Type  help  to see every command, or click a command in the lesson to try it.\n' +
        'Nothing here can damage your real computer.'
    }
  ]);
  const [input, setInput] = useState('');
  const [histIndex, setHistIndex] = useState(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null); // multi-line continuation
  const [mode, setMode] = useState(null);
  const [rSearch, setRSearch] = useState(null);

  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, []);

  useEffect(scrollToEnd, [blocks, mode, scrollToEnd]);

  const focus = useCallback(() => {
    if (!mode && inputRef.current) inputRef.current.focus();
  }, [mode]);

  useImperativeHandle(ref, () => ({
    insert(cmd) {
      setInput(cmd);
      setHistIndex(null);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(cmd.length, cmd.length);
        }
      });
    },
    insertAndRun(cmd) {
      submit(cmd);
    },
    focus
  }));

  const push = useCallback((...items) => {
    setBlocks((b) => [...b, ...items]);
  }, []);

  /* --------------------------------------------------------- execution --- */

  const runLine = useCallback(
    (fullText, displayLine) => {
      const promptInfo = shell.prompt();
      const result = shell.run(fullText);

      if (result.continuation) {
        setPending({ buffer: fullText, ...result.continuation });
        push({ type: 'command', prompt: promptInfo, text: displayLine, continued: true });
        return;
      }

      const outText = result.outputs
        .filter((o) => o.stream === 'out' || o.stream === 'err')
        .map((o) => o.text)
        .join('');

      if (result.clear) {
        setBlocks([]);
      } else {
        push({ type: 'command', prompt: promptInfo, text: displayLine });
      }

      for (const o of result.outputs) {
        if (o.stream === 'echo') push({ type: 'echo', text: o.text });
        else if (o.text) push({ type: o.stream === 'err' ? 'err' : 'out', text: o.text });
      }

      if (result.resetFs) {
        shell.resetFilesystem();
        setBlocks([
          { type: 'banner', text: 'Filesystem restored to its starting state. Your task progress is kept.' }
        ]);
        if (onFsReset) onFsReset();
      }

      if (result.mode) setMode(result.mode);

      onCommand({
        input: displayLine,
        output: stripMarkers(outText),
        cwd: promptInfo.path,
        code: result.code
      });
    },
    [shell, push, onCommand, onFsReset]
  );

  const submit = useCallback(
    (rawValue) => {
      const value = rawValue !== undefined ? rawValue : input;
      setInput('');
      setHistIndex(null);
      setRSearch(null);

      // Continuation: we are collecting a heredoc body or an unclosed quote.
      if (pending) {
        const buffer = pending.buffer + '\n' + value;
        push({ type: 'continuation', text: value });
        // Test for completeness by parsing only. Running it here would apply
        // the command's side effects a second time.
        const stillOpen = shell.needsMoreInput(buffer);
        if (stillOpen) {
          setPending({ buffer, ...stillOpen });
          return;
        }
        setPending(null);
        runLine(buffer, buffer.split('\n')[0]);
        return;
      }

      if (!value.trim()) {
        push({ type: 'command', prompt: shell.prompt(), text: '' });
        return;
      }

      const suggestion = shell.check(value);

      if (suggestion && suggestion.corrected && autofix) {
        push({
          type: 'autofix',
          from: value,
          to: suggestion.corrected,
          message: suggestion.message,
          why: suggestion.why
        });
        runLine(suggestion.corrected, suggestion.corrected);
        return;
      }

      runLine(value, value);

      if (suggestion) {
        push({
          type: 'suggestion',
          message: suggestion.message,
          why: suggestion.why,
          corrected: suggestion.corrected,
          kind: suggestion.type
        });
      }
    },
    [input, pending, shell, autofix, push, runLine]
  );

  /* ------------------------------------------------------------- keys --- */

  const onKeyDown = (e) => {
    const el = inputRef.current;

    if (rSearch) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const found = rSearch.match;
        setRSearch(null);
        if (found) submit(found);
        return;
      }
      if (e.key === 'Escape' || (e.ctrlKey && e.key === 'g')) {
        e.preventDefault();
        setRSearch(null);
        return;
      }
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        const next = findInHistory(rSearch.query, rSearch.index + 1);
        setRSearch({ ...rSearch, match: next.match, index: next.index });
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        const q = rSearch.query.slice(0, -1);
        const found = findInHistory(q, 0);
        setRSearch({ query: q, match: found.match, index: found.index });
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const q = rSearch.query + e.key;
        const found = findInHistory(q, 0);
        setRSearch({ query: q, match: found.match, index: found.index });
        return;
      }
      return;
    }

    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      setRSearch({ query: '', match: null, index: 0 });
      return;
    }
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      push({ type: 'command', prompt: shell.prompt(), text: input + '^C' });
      setInput('');
      setPending(null);
      return;
    }
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      setBlocks([]);
      return;
    }
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      setInput('');
      return;
    }
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault();
      el.setSelectionRange(0, 0);
      return;
    }
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      el.setSelectionRange(input.length, input.length);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const res = shell.complete(input);
      if (res.input !== input) setInput(res.input);
      if (res.options.length) {
        push({ type: 'completions', options: res.options });
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = shell.history;
      if (!h.length) return;
      const next = histIndex === null ? h.length - 1 : Math.max(0, histIndex - 1);
      if (histIndex === null) setDraft(input);
      setHistIndex(next);
      setInput(h[next]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = shell.history;
      if (histIndex === null) return;
      const next = histIndex + 1;
      if (next >= h.length) {
        setHistIndex(null);
        setInput(draft);
      } else {
        setHistIndex(next);
        setInput(h[next]);
      }
    }
  };

  function findInHistory(query, startBack) {
    const h = shell.history;
    if (!query) return { match: null, index: 0 };
    let seen = 0;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].includes(query)) {
        if (seen >= startBack) return { match: h[i], index: seen };
        seen++;
      }
    }
    return { match: null, index: 0 };
  }

  /* -------------------------------------------------------------- view --- */

  const promptInfo = shell.prompt();

  return (
    <div className="terminal" onClick={focus}>
      <div className="term-bar">
        <span className="dots">
          <i /> <i /> <i />
        </span>
        <span className="term-title">
          {shell.env.USER}@{shell.env.HOSTNAME}: {promptInfo.path}
        </span>
        <button
          className="term-clear"
          onClick={(e) => {
            e.stopPropagation();
            setBlocks([]);
            focus();
          }}
          title="Clear the screen (Ctrl + L)"
        >
          clear
        </button>
      </div>

      <div className="term-body" ref={scrollRef}>
        {blocks.map((b, i) => (
          <Block key={i} block={b} onRun={(cmd) => submit(cmd)} onInsert={(cmd) => setInput(cmd)} />
        ))}

        {!mode && (
          <div className="term-line input-line">
            {pending ? (
              <span className="cont-prompt">&gt;</span>
            ) : (
              <Prompt info={promptInfo} />
            )}
            <input
              ref={inputRef}
              className="term-input"
              value={input}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Terminal input"
            />
          </div>
        )}

        {rSearch && (
          <div className="rsearch">
            (reverse-i-search)`{rSearch.query}&apos;: <strong>{rSearch.match || ''}</strong>
            <span className="rsearch-hint">Ctrl+R again for older · Enter to run · Esc to cancel</span>
          </div>
        )}

        {pending && (
          <div className="pending-hint">
            {pending.kind === 'heredoc'
              ? `Collecting input. Type ${pending.delimiter} on its own line to finish.`
              : `Unclosed ${pending.delimiter} quote. Finish the quote and press Enter.`}
          </div>
        )}
      </div>

      {mode && (
        <ModeOverlay
          mode={mode}
          shell={shell}
          onExit={(note) => {
            setMode(null);
            if (note) push({ type: 'out', text: note });
            requestAnimationFrame(focus);
          }}
        />
      )}
    </div>
  );
});

function Prompt({ info }) {
  return (
    <span className="prompt">
      <span className="p-user">
        {info.user}@{info.host}
      </span>
      <span className="p-sep">:</span>
      <span className="p-path">{info.path}</span>
      <span className="p-dollar">$</span>
    </span>
  );
}

function Block({ block, onRun, onInsert }) {
  switch (block.type) {
    case 'banner':
      return <div className="blk-banner">{block.text}</div>;

    case 'command':
      return (
        <div className="term-line">
          <Prompt info={block.prompt} />
          <span className="cmd-text">{block.text}</span>
        </div>
      );

    case 'continuation':
      return (
        <div className="term-line">
          <span className="cont-prompt">&gt;</span>
          <span className="cmd-text">{block.text}</span>
        </div>
      );

    case 'echo':
      return <div className="blk-echo">{block.text}</div>;

    case 'out':
      return (
        <pre className="blk-out">
          <Marked text={block.text} />
        </pre>
      );

    case 'err':
      return <pre className="blk-err">{block.text}</pre>;

    case 'completions':
      return (
        <div className="blk-completions">
          {block.options.map((o) => (
            <button key={o} onClick={() => onInsert(o)} className="comp-chip">
              {o}
            </button>
          ))}
        </div>
      );

    case 'autofix':
      return (
        <div className="blk-fix">
          <div className="fix-head">
            <span className="fix-badge">auto-corrected</span>
            <code className="fix-from">{block.from}</code>
            <span className="fix-arrow">→</span>
            <code className="fix-to">{block.to}</code>
          </div>
          <div className="fix-why">{block.why}</div>
        </div>
      );

    case 'suggestion':
      return (
        <div className={'blk-suggest s-' + block.kind}>
          <div className="sg-message">{block.message}</div>
          {block.why && <div className="sg-why">{block.why}</div>}
          {block.corrected && (
            <div className="sg-actions">
              <button className="sg-run" onClick={() => onRun(block.corrected)}>
                Run <code>{block.corrected}</code>
              </button>
              <button className="sg-edit" onClick={() => onInsert(block.corrected)}>
                Put it in the prompt
              </button>
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

/* --------------------------------------------------------------- modes --- */

function ModeOverlay({ mode, shell, onExit }) {
  if (mode.kind === 'less') return <LessMode mode={mode} onExit={onExit} />;
  if (mode.kind === 'nano') return <NanoMode mode={mode} shell={shell} onExit={onExit} />;
  if (mode.kind === 'top') return <TopMode shell={shell} onExit={onExit} />;
  if (mode.kind === 'tailf') return <TailMode mode={mode} onExit={onExit} />;
  return null;
}

function LessMode({ mode, onExit }) {
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(null);
  const [status, setStatus] = useState('');
  const boxRef = useRef(null);
  const PAGE = 18;
  const lines = mode.lines;
  const maxOffset = Math.max(0, lines.length - PAGE);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const searchFrom = (q, start, back = false) => {
    if (!q) return null;
    const step = back ? -1 : 1;
    for (let i = start; i >= 0 && i < lines.length; i += step) {
      if (lines[i].toLowerCase().includes(q.toLowerCase())) return i;
    }
    return null;
  };

  const onKey = (e) => {
    if (typing !== null) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const found = searchFrom(typing, offset);
        if (found === null) setStatus(`Pattern not found: ${typing}`);
        else {
          setOffset(Math.min(found, maxOffset));
          setQuery(typing);
          setStatus('');
        }
        setTyping(null);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTyping(null);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setTyping(typing.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        setTyping(typing + e.key);
      }
      return;
    }

    e.preventDefault();
    switch (e.key) {
      case 'q':
        onExit();
        break;
      case '/':
        setTyping('');
        setStatus('');
        break;
      case 'n': {
        const found = searchFrom(query, offset + 1);
        if (found === null) setStatus('Pattern not found');
        else {
          setOffset(Math.min(found, maxOffset));
          setStatus('');
        }
        break;
      }
      case 'N': {
        const found = searchFrom(query, offset - 1, true);
        if (found === null) setStatus('Pattern not found');
        else {
          setOffset(found);
          setStatus('');
        }
        break;
      }
      case 'ArrowDown':
      case 'j':
        setOffset((o) => Math.min(maxOffset, o + 1));
        break;
      case 'ArrowUp':
      case 'k':
        setOffset((o) => Math.max(0, o - 1));
        break;
      case ' ':
      case 'PageDown':
        setOffset((o) => Math.min(maxOffset, o + PAGE));
        break;
      case 'b':
      case 'PageUp':
        setOffset((o) => Math.max(0, o - PAGE));
        break;
      case 'g':
        setOffset(0);
        break;
      case 'G':
        setOffset(maxOffset);
        break;
      default:
        break;
    }
  };

  const visible = lines.slice(offset, offset + PAGE);
  const percent = maxOffset === 0 ? 100 : Math.round((offset / maxOffset) * 100);

  return (
    <div className="mode-overlay" tabIndex={0} ref={boxRef} onKeyDown={onKey}>
      <pre className="mode-body">
        {visible.map((line, i) => (
          <div key={offset + i} className="less-line">
            {query && line.toLowerCase().includes(query.toLowerCase())
              ? highlightParts(line, query)
              : line || ' '}
          </div>
        ))}
      </pre>
      <div className="mode-status">
        {typing !== null ? (
          <span className="less-search">/{typing}</span>
        ) : (
          <>
            <span>
              {mode.name} — line {offset + 1}-{Math.min(offset + PAGE, lines.length)} of {lines.length} ({percent}%)
            </span>
            <span className="mode-help">
              {status || '/word search · n next · N previous · space page · q quit'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function highlightParts(line, query) {
  const out = [];
  const lower = line.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  while (i < line.length) {
    const at = lower.indexOf(q, i);
    if (at === -1) {
      out.push(line.slice(i));
      break;
    }
    if (at > i) out.push(line.slice(i, at));
    out.push(
      <mark key={at} className="less-hit">
        {line.slice(at, at + q.length)}
      </mark>
    );
    i = at + q.length;
  }
  return out;
}

function NanoMode({ mode, shell, onExit }) {
  const [text, setText] = useState(mode.content);
  const [flash, setFlash] = useState('');
  const areaRef = useRef(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const save = () => {
    const body = text.endsWith('\n') || text === '' ? text : text + '\n';
    shell.fs.writeFile(mode.path, body);
    setFlash(`Wrote ${body.split('\n').length - 1} lines`);
    setTimeout(() => setFlash(''), 1600);
    return body;
  };

  const onKey = (e) => {
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      save();
      return;
    }
    if (e.ctrlKey && e.key === 'x') {
      e.preventDefault();
      onExit();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = areaRef.current;
      const s = el.selectionStart;
      setText(text.slice(0, s) + '  ' + text.slice(el.selectionEnd));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  return (
    <div className="mode-overlay nano">
      <div className="nano-head">
        GNU nano 6.2 &nbsp;&nbsp; <strong>{mode.name}</strong>
        {flash && <span className="nano-flash">{flash}</span>}
      </div>
      <textarea
        ref={areaRef}
        className="nano-area"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="nano-foot">
        <span>
          <b>^O</b> Write Out
        </span>
        <span>
          <b>^X</b> Exit
        </span>
        <span className="nano-tip">Add your alias lines, save with Ctrl+O, leave with Ctrl+X</span>
      </div>
    </div>
  );
}

function TopMode({ shell, onExit }) {
  const [, tick] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    boxRef.current?.focus();
    const id = setInterval(() => tick((n) => n + 1), 1500);
    return () => clearInterval(id);
  }, []);

  const procs = [
    { pid: 1, user: 'root', cmd: '/sbin/init', cpu: 0.0, mem: 0.1 },
    { pid: 421, user: 'root', cmd: '/usr/sbin/sshd -D', cpu: 0.0, mem: 0.2 },
    { pid: 1021, user: shell.env.USER, cmd: '-bash', cpu: jitter(0.3), mem: 0.1 },
    { pid: 2317, user: shell.env.USER, cmd: 'node backend/app.js', cpu: jitter(1.6), mem: 3.6 },
    ...shell.processes.map((p) => ({ pid: p.pid, user: shell.env.USER, cmd: p.cmd, cpu: 0.0, mem: 0.1 }))
  ];

  const load = (0.2 + Math.random() * 0.4).toFixed(2);

  return (
    <div
      className="mode-overlay top"
      tabIndex={0}
      ref={boxRef}
      onKeyDown={(e) => {
        if (e.key === 'q') onExit();
      }}
    >
      <pre className="mode-body">
        {`top - ${new Date().toLocaleTimeString()} up 2:14,  1 user,  load average: ${load}
Tasks: ${procs.length} total,   1 running, ${procs.length - 1} sleeping
%Cpu(s):  ${(2 + Math.random() * 4).toFixed(1)} us,  1.2 sy, 96.4 id
MiB Mem :   7940.0 total,   4102.5 free,   1988.2 used

    PID USER      %CPU  %MEM  COMMAND
${procs
  .map(
    (p) =>
      `${String(p.pid).padStart(7)} ${p.user.padEnd(9)} ${p.cpu.toFixed(1).padStart(5)} ${p.mem
        .toFixed(1)
        .padStart(5)}  ${p.cmd}`
  )
  .join('\n')}`}
      </pre>
      <div className="mode-status">
        <span>top — live process monitor</span>
        <span className="mode-help">press q to quit</span>
      </div>
    </div>
  );
}

function jitter(base) {
  return Math.max(0, base + (Math.random() - 0.5) * base);
}

function TailMode({ mode, onExit }) {
  const [lines, setLines] = useState(mode.initial);
  const boxRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    boxRef.current?.focus();
    const id = setInterval(() => {
      setLines((prev) => [...prev, FOLLOW_LINES[Math.floor(Math.random() * FOLLOW_LINES.length)]].slice(-200));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      className="mode-overlay tailf"
      tabIndex={0}
      ref={boxRef}
      onKeyDown={(e) => {
        if ((e.ctrlKey && e.key === 'c') || e.key === 'q') {
          e.preventDefault();
          onExit('^C\n');
        }
      }}
    >
      <pre className="mode-body" ref={bodyRef}>
        {lines.map((l, i) => (
          <div key={i} className={l.startsWith('ERROR') ? 'follow-err' : ''}>
            {l}
          </div>
        ))}
      </pre>
      <div className="mode-status">
        <span className="live">
          <i className="live-dot" /> following {mode.name}
        </span>
        <span className="mode-help">new lines arrive live · Ctrl + C to stop</span>
      </div>
    </div>
  );
}

export default Terminal;
