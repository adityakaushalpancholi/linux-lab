// The shell: history expansion, alias expansion, pipelines, redirection,
// chaining, background jobs and interactive modes.

import { parseLine, pendingHeredoc, tokenize, ParseError } from './parser.js';
import { expandGlob } from './glob.js';
import { commands as builtinCommands } from './commands/index.js';
import { createSeedFileSystem } from '../fs/seed.js';
import { FileSystem, resolvePath, dirname } from '../fs/filesystem.js';
import { analyse, complete } from './autocorrect.js';

const MAX_ALIAS_DEPTH = 10;

export class Shell {
  constructor({ fs, cwd, env, aliases, history } = {}) {
    this.fs = fs || createSeedFileSystem();
    this.env = {
      USER: 'student',
      HOME: '/home/student',
      HOSTNAME: 'atlas-workstation',
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PWD: '/home/student',
      OLDPWD: '/home/student',
      TERM: 'xterm-256color',
      ...(env || {})
    };
    this.cwd = cwd || this.env.HOME;
    this.env.PWD = this.cwd;
    this.aliases = aliases || {};
    this.history = history || [];
    this.commands = builtinCommands;
    this.processes = [];
    this.nextPid = 4400;
    this.lastCode = 0;
    this.jobCounter = 0;
    this.transcript = [];
    this.autofix = false;
    this.onProcessChange = null;
  }

  /* ------------------------------------------------------------ persist --- */

  serialise() {
    return {
      root: this.fs.root,
      cwd: this.cwd,
      env: this.env,
      aliases: this.aliases,
      history: this.history.slice(-500)
    };
  }

  static restore(saved) {
    if (!saved || !saved.root) return new Shell();
    return new Shell({
      fs: new FileSystem(saved.root),
      cwd: saved.cwd,
      env: saved.env,
      aliases: saved.aliases,
      history: saved.history
    });
  }

  resetFilesystem() {
    this.fs = createSeedFileSystem();
    this.cwd = this.env.HOME;
    this.env.PWD = this.cwd;
    this.aliases = {};
    this.processes = [];
  }

  /* -------------------------------------------------------- completion --- */

  complete(input) {
    return complete(input, true, this);
  }

  check(input) {
    try {
      return analyse(input, this);
    } catch {
      return null;
    }
  }

  // Is this text still incomplete -- an open heredoc or an unclosed quote?
  // Parses only, so callers can test for completeness without running anything.
  needsMoreInput(text) {
    const firstLine = text.split('\n')[0];
    let groups;
    try {
      groups = parseLine(firstLine);
    } catch (e) {
      if (e instanceof ParseError && e.unterminated) {
        return { kind: 'quote', delimiter: e.unterminated };
      }
      return null;
    }
    const hd = pendingHeredoc(groups);
    if (hd && !text.split('\n').slice(1).includes(hd.delimiter)) {
      return { kind: 'heredoc', delimiter: hd.delimiter };
    }
    return null;
  }

  /* ------------------------------------------------------------ history --- */

  // !!, !42 and !prefix, the way bash resolves them before running anything.
  expandHistory(line) {
    if (!line.includes('!')) return { line, expanded: false };
    let changed = false;
    const out = line.replace(/!(!|-?\d+|[A-Za-z][\w-]*)/g, (match, ref) => {
      const h = this.history;
      if (!h.length) return match;
      if (ref === '!') {
        changed = true;
        return h[h.length - 1];
      }
      if (/^-?\d+$/.test(ref)) {
        const n = parseInt(ref, 10);
        const item = n < 0 ? h[h.length + n] : h[n - 1];
        if (item === undefined) return match;
        changed = true;
        return item;
      }
      for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].startsWith(ref)) {
          changed = true;
          return h[i];
        }
      }
      return match;
    });
    return { line: out, expanded: changed };
  }

  /* ---------------------------------------------------------- expansion --- */

  expandVariables(text) {
    return text
      .replace(/\$\{(\w+)\}/g, (_, name) => this.env[name] ?? '')
      .replace(/\$(\w+)/g, (m, name) => (name in this.env ? this.env[name] : m))
      .replace(/\$\?/g, String(this.lastCode));
  }

  expandToken(tok) {
    const value = tok.single ? tok.v : this.expandVariables(tok.v);
    if (tok.quoted) return [value];
    return expandGlob(this.fs, this.cwd, value, this.env.HOME);
  }

  resolveAliases(argv, seen = new Set(), depth = 0) {
    if (depth >= MAX_ALIAS_DEPTH) return argv;
    const head = argv[0];
    if (!head || seen.has(head)) return argv;
    const target = this.aliases[head];
    if (!target) return argv;
    seen.add(head);
    const words = tokenize(target)
      .filter((t) => t.t === 'word')
      .map((t) => t.v);
    return this.resolveAliases([...words, ...argv.slice(1)], seen, depth + 1);
  }

  /* ---------------------------------------------------------- execution --- */

  // `text` may be several lines when a heredoc body is included.
  run(text, { isTTY = true, record = true } = {}) {
    const result = {
      outputs: [],
      clear: false,
      mode: null,
      resetFs: false,
      code: 0,
      continuation: null,
      correction: null
    };

    const rawFirstLine = text.split('\n')[0];
    if (!rawFirstLine.trim()) return result;

    let groups;
    let firstLine = rawFirstLine;
    const bodyLines = text.split('\n').slice(1);

    const hist = this.expandHistory(rawFirstLine);
    if (hist.expanded) {
      firstLine = hist.line;
      result.outputs.push({ stream: 'echo', text: firstLine });
    }

    try {
      groups = parseLine(firstLine);
    } catch (e) {
      if (e instanceof ParseError && e.unterminated) {
        result.continuation = { kind: 'quote', delimiter: e.unterminated };
        return result;
      }
      result.outputs.push({ stream: 'err', text: `bash: ${e.message}\n` });
      result.code = 2;
      return result;
    }

    const hd = pendingHeredoc(groups);
    if (hd) {
      const end = bodyLines.indexOf(hd.delimiter);
      if (end === -1) {
        result.continuation = { kind: 'heredoc', delimiter: hd.delimiter };
        return result;
      }
      hd.body = bodyLines.slice(0, end).join('\n') + (end > 0 ? '\n' : '');
    }

    if (record) {
      this.history.push(firstLine);
      if (this.history.length > 1000) this.history.shift();
    }

    let previousCode = this.lastCode;
    for (const group of groups) {
      if (group.op === '&&' && previousCode !== 0) continue;
      if (group.op === '||' && previousCode === 0) continue;

      if (group.background) {
        previousCode = this.runBackground(group, result);
        continue;
      }

      previousCode = this.runPipeline(group.pipeline, result, isTTY);
      if (result.mode) break;
    }

    this.lastCode = previousCode;
    result.code = previousCode;
    return result;
  }

  runBackground(group, result) {
    const cmd = group.pipeline[0];
    const argv = cmd.argv.flatMap((t) => this.expandToken(t));
    const pid = this.nextPid++;
    const label = argv.join(' ');
    this.jobCounter++;
    const job = this.jobCounter;

    const proc = { pid, cmd: label, job, startedAt: Date.now() };
    this.processes.push(proc);
    result.outputs.push({ stream: 'out', text: `[${job}] ${pid}\n` });

    const seconds = argv[0] === 'sleep' ? Number(argv[1]) : NaN;
    if (!Number.isNaN(seconds) && seconds > 0) {
      proc.endsAt = Date.now() + seconds * 1000;
      proc.timer = setTimeout(() => {
        const i = this.processes.indexOf(proc);
        if (i !== -1) this.processes.splice(i, 1);
        if (this.onProcessChange) this.onProcessChange();
      }, seconds * 1000);
    } else if (argv[0] !== 'sleep') {
      // Anything that is not sleep still does its work, just without blocking.
      this.runPipeline(group.pipeline, result, false);
      const i = this.processes.indexOf(proc);
      if (i !== -1) this.processes.splice(i, 1);
    }

    if (this.onProcessChange) this.onProcessChange();
    return 0;
  }

  runPipeline(pipeline, result, shellIsTTY) {
    let stdin = null;
    let code = 0;

    for (let i = 0; i < pipeline.length; i++) {
      const cmd = pipeline[i];
      const isLast = i === pipeline.length - 1;

      let argv = cmd.argv.flatMap((t) => this.expandToken(t));
      argv = this.resolveAliases(argv);
      if (!argv.length) continue;

      const name = argv[0];
      const impl = this.commands[name];

      if (!impl) {
        result.outputs.push({
          stream: 'err',
          text: `bash: ${name}: command not found\n`
        });
        return 127;
      }

      // Input redirection wins over piped stdin.
      const inRedirect = cmd.redirects.find((r) => r.type === '<');
      if (inRedirect) {
        const p = resolvePath(this.cwd, inRedirect.target, this.env.HOME);
        const node = this.fs.get(p);
        if (!node || node.type === 'dir') {
          result.outputs.push({ stream: 'err', text: `bash: ${inRedirect.target}: No such file or directory\n` });
          return 1;
        }
        stdin = node.content;
      }
      if (cmd.heredoc && cmd.heredoc.body !== null) {
        stdin = cmd.heredoc.body;
      }

      const outRedirect = cmd.redirects.find((r) => r.type === '>' || r.type === '>>');
      const isTTY = shellIsTTY && isLast && !outRedirect;

      let res;
      try {
        res = impl.run({
          argv,
          stdin,
          fs: this.fs,
          shell: this,
          isTTY
        });
      } catch (e) {
        res = { out: '', err: `${name}: ${e.message}\n`, code: 1 };
      }

      code = res.code ?? 0;

      if (res.clear) result.clear = true;
      if (res.resetFs) result.resetFs = true;
      if (res.mode && isTTY) result.mode = res.mode;

      // `source` feeds its lines straight back through the shell.
      if (res.sourceLines) {
        for (const line of res.sourceLines) {
          if (!line.trim() || line.trim().startsWith('#')) continue;
          const sub = this.run(line, { isTTY: false, record: false });
          result.outputs.push(...sub.outputs);
        }
      }

      if (res.err) result.outputs.push({ stream: 'err', text: res.err });

      if (outRedirect) {
        const p = resolvePath(this.cwd, outRedirect.target, this.env.HOME);
        if (!this.fs.exists(dirname(p))) {
          result.outputs.push({ stream: 'err', text: `bash: ${outRedirect.target}: No such file or directory\n` });
          return 1;
        }
        const write =
          outRedirect.type === '>>'
            ? this.fs.appendFile(p, res.out || '')
            : this.fs.writeFile(p, res.out || '');
        if (write.error) {
          result.outputs.push({ stream: 'err', text: `bash: ${write.error}\n` });
          return 1;
        }
        stdin = null;
        continue;
      }

      if (isLast) {
        if (res.out) result.outputs.push({ stream: 'out', text: res.out });
      } else {
        stdin = res.out || '';
      }
    }

    return code;
  }

  /* --------------------------------------------------------- appearance --- */

  prompt() {
    const home = this.env.HOME;
    const short = this.cwd === home ? '~' : this.cwd.startsWith(home + '/') ? '~' + this.cwd.slice(home.length) : this.cwd;
    return { user: this.env.USER, host: this.env.HOSTNAME, path: short };
  }
}
