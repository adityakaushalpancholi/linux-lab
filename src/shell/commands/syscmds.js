// Permissions, processes and shell built-ins.

import { parseArgs, ok, fail, lines, joinLines, padLeft } from './util.js';
import { resolvePath, modeString, DIR } from '../../fs/filesystem.js';

/* ---------------------------------------------------------------- chmod --- */

function applySymbolic(mode, spec) {
  const m = spec.match(/^([ugoa]*)([+\-=])([rwx]*)$/);
  if (!m) return null;
  const who = m[1] || 'a';
  const op = m[2];
  const perms = m[3];

  let bits = 0;
  if (perms.includes('r')) bits |= 4;
  if (perms.includes('w')) bits |= 2;
  if (perms.includes('x')) bits |= 1;

  const targets = [];
  if (who.includes('u') || who.includes('a')) targets.push(6);
  if (who.includes('g') || who.includes('a')) targets.push(3);
  if (who.includes('o') || who.includes('a')) targets.push(0);

  let out = mode;
  for (const shift of targets) {
    if (op === '+') out |= bits << shift;
    else if (op === '-') out &= ~(bits << shift);
    else out = (out & ~(7 << shift)) | (bits << shift);
  }
  return out;
}

/* -------------------------------------------------------------- process --- */

export function baselineProcesses(user) {
  return [
    { pid: 1, user: 'root', cmd: '/sbin/init', cpu: 0.0, mem: 0.1, stat: 'Ss', time: '0:04' },
    { pid: 421, user: 'root', cmd: '/usr/sbin/sshd -D', cpu: 0.0, mem: 0.2, stat: 'Ss', time: '0:00' },
    { pid: 1021, user, cmd: '-bash', cpu: 0.0, mem: 0.1, stat: 'Ss', time: '0:00' },
    { pid: 2317, user, cmd: 'node backend/app.js', cpu: 1.4, mem: 3.6, stat: 'Sl', time: '0:12' }
  ];
}

function allProcesses(shell) {
  return [
    ...baselineProcesses(shell.env.USER),
    ...shell.processes.map((p) => ({
      pid: p.pid,
      user: shell.env.USER,
      cmd: p.cmd,
      cpu: 0.0,
      mem: 0.1,
      stat: 'S',
      time: '0:00'
    }))
  ].sort((a, b) => a.pid - b.pid);
}

export const sysCommands = {
  chmod: {
    summary: 'Change who may read, write or execute a file.',
    usage: 'chmod mode file...   (mode is +x, u+x, 755, 644 ...)',
    flags: { R: 'apply recursively to a folder and everything inside' },
    examples: ['chmod +x deploy.sh', 'chmod 755 deploy.sh', 'chmod u+x,g-w script.sh'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      // chmod +x is parsed as a flag by the generic parser, so recover it.
      const argv = ctx.argv.slice(1);
      const spec = argv[0];
      const files = argv.slice(1);
      if (!spec || !files.length) return fail('chmod: missing operand\n');

      const errors = [];
      const apply = (path) => {
        const node = ctx.fs.get(path);
        if (!node) {
          errors.push(`chmod: cannot access '${path}': No such file or directory`);
          return;
        }
        if (/^[0-7]{3,4}$/.test(spec)) {
          node.mode = parseInt(spec, 8) & 0o777;
        } else {
          let mode = node.mode;
          for (const part of spec.split(',')) {
            const next = applySymbolic(mode, part);
            if (next === null) {
              errors.push(`chmod: invalid mode: '${spec}'`);
              return;
            }
            mode = next;
          }
          node.mode = mode;
        }
        node.mtime = Date.now();
        if (flags.has('R') && node.type === DIR) {
          ctx.fs.walk(path, (p) => {
            if (p !== path) apply(p);
          });
        }
      };

      for (const f of files) apply(resolvePath(ctx.shell.cwd, f, ctx.shell.env.HOME));
      return { out: '', err: joinLines(errors), code: errors.length ? 1 : 0 };
    }
  },

  chown: {
    summary: 'Change which user and group own a file.',
    usage: 'chown user[:group] file...',
    flags: { R: 'apply recursively' },
    examples: ['chown student deploy.sh', 'chown student:student deploy.sh'],
    run: (ctx) => {
      const argv = ctx.argv.slice(1);
      const spec = argv[0];
      const files = argv.filter((a) => !a.startsWith('-')).slice(1);
      if (!spec || !files.length) return fail('chown: missing operand\n');
      const [user, group] = spec.split(':');
      const errors = [];
      for (const f of files) {
        const path = resolvePath(ctx.shell.cwd, f, ctx.shell.env.HOME);
        const node = ctx.fs.get(path);
        if (!node) {
          errors.push(`chown: cannot access '${f}': No such file or directory`);
          continue;
        }
        node.owner = user || node.owner;
        node.group = group || node.group;
      }
      return { out: '', err: joinLines(errors), code: errors.length ? 1 : 0 };
    }
  },

  stat: {
    summary: 'Show detailed information about one file.',
    usage: 'stat file',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (!args.length) return fail('stat: missing operand\n');
      const path = resolvePath(ctx.shell.cwd, args[0], ctx.shell.env.HOME);
      const node = ctx.fs.get(path);
      if (!node) return fail(`stat: cannot stat '${args[0]}': No such file or directory\n`);
      const size = node.type === DIR ? 4096 : node.content.length;
      return ok(
        `  File: ${args[0]}\n` +
          `  Size: ${size}\tBlocks: ${Math.ceil(size / 512)}\t${node.type === DIR ? 'directory' : 'regular file'}\n` +
          `Access: (${(node.mode & 0o777).toString(8).padStart(4, '0')}/${modeString(node)})  ` +
          `Uid: (1000/${node.owner})   Gid: (1000/${node.group})\n` +
          `Modify: ${new Date(node.mtime).toISOString()}\n`
      );
    }
  },

  ps: {
    summary: 'List the processes currently running.',
    usage: 'ps [aux]',
    flags: { a: 'processes from all users', u: 'user-oriented columns', x: 'include processes without a terminal' },
    examples: ['ps', 'ps aux'],
    run: (ctx) => {
      const raw = ctx.argv.slice(1).join('');
      const wide = /[aux]/.test(raw);
      const procs = allProcesses(ctx.shell);

      if (!wide) {
        const rows = ['    PID TTY          TIME CMD'];
        for (const p of procs) {
          if (p.user !== ctx.shell.env.USER) continue;
          rows.push(`${padLeft(p.pid, 7)} pts/0    ${padLeft(p.time, 8)} ${p.cmd.split(' ')[0]}`);
        }
        return ok(joinLines(rows));
      }

      const rows = ['USER         PID %CPU %MEM STAT   TIME COMMAND'];
      for (const p of procs) {
        rows.push(
          `${p.user.padEnd(10)} ${padLeft(p.pid, 5)} ${padLeft(p.cpu.toFixed(1), 4)} ` +
            `${padLeft(p.mem.toFixed(1), 4)} ${p.stat.padEnd(4)} ${padLeft(p.time, 6)} ${p.cmd}`
        );
      }
      return ok(joinLines(rows));
    }
  },

  top: {
    summary: 'Live view of processes and resource use. Press q to quit.',
    usage: 'top',
    flags: {},
    run: (ctx) => {
      if (!ctx.isTTY) return sysCommands.ps.run({ ...ctx, argv: ['ps', 'aux'] });
      return { out: '', err: '', code: 0, mode: { kind: 'top' } };
    }
  },

  jobs: {
    summary: 'List background jobs started from this shell.',
    usage: 'jobs',
    flags: {},
    run: (ctx) => {
      const rows = ctx.shell.processes.map(
        (p, i) => `[${i + 1}]${i === ctx.shell.processes.length - 1 ? '+' : '-'}  Running                 ${p.cmd} &`
      );
      return ok(joinLines(rows));
    }
  },

  kill: {
    summary: 'Stop a running process by its PID. Identify the target first.',
    usage: 'kill [-9] PID',
    flags: { 9: 'force kill, the process gets no chance to clean up' },
    examples: ['sleep 300 &', 'ps', 'kill 4420'],
    run: (ctx) => {
      const argv = ctx.argv.slice(1).filter((a) => !/^-\d+$/.test(a) && a !== '-KILL' && a !== '-TERM');
      if (!argv.length) return fail('kill: usage: kill [-9] pid\n');
      const errors = [];
      const notes = [];

      for (const arg of argv) {
        const pid = parseInt(arg, 10);
        if (Number.isNaN(pid)) {
          errors.push(`kill: ${arg}: arguments must be process ids`);
          continue;
        }
        const idx = ctx.shell.processes.findIndex((p) => p.pid === pid);
        if (idx !== -1) {
          const [proc] = ctx.shell.processes.splice(idx, 1);
          notes.push(`[1]+  Terminated              ${proc.cmd}`);
          continue;
        }
        const baseline = baselineProcesses(ctx.shell.env.USER).find((p) => p.pid === pid);
        if (baseline) {
          errors.push(
            `kill: (${pid}) - Operation not permitted\n\n` +
              'That PID belongs to a system process, not to something you started.\n' +
              'This lab refuses on purpose. On a real server, killing PID 1 or a\n' +
              'database process takes the whole machine down. Start your own safe\n' +
              'target first with  sleep 300 &  and kill that instead.'
          );
          continue;
        }
        errors.push(`kill: (${pid}) - No such process`);
      }

      return { out: joinLines(notes), err: joinLines(errors), code: errors.length ? 1 : 0 };
    }
  },

  /* ------------------------------------------------------------ builtins --- */

  history: {
    summary: 'Show the numbered list of commands you have run.',
    usage: 'history [-c]',
    flags: { c: 'clear the history list' },
    examples: ['history', '!!', '!25'],
    run: (ctx) => {
      const { flags } = parseArgs(ctx.argv);
      if (flags.has('c')) {
        ctx.shell.history.length = 0;
        return ok();
      }
      return ok(joinLines(ctx.shell.history.map((h, i) => `${padLeft(i + 1, 5)}  ${h}`)));
    }
  },

  alias: {
    summary: 'Give a long command a short name.',
    usage: 'alias name="command"',
    flags: {},
    examples: ['alias ll="ls -lah"', 'alias gs="git status"', 'alias atlas="cd ~/Project-Atlas"'],
    run: (ctx) => {
      const argv = ctx.argv.slice(1);
      if (!argv.length) {
        return ok(
          joinLines(
            Object.entries(ctx.shell.aliases)
              .sort()
              .map(([k, v]) => `alias ${k}='${v}'`)
          )
        );
      }
      const errors = [];
      for (const a of argv) {
        const eq = a.indexOf('=');
        if (eq === -1) {
          if (ctx.shell.aliases[a]) errors.push(`alias ${a}='${ctx.shell.aliases[a]}'`);
          else errors.push(`alias: ${a}: not found`);
          continue;
        }
        ctx.shell.aliases[a.slice(0, eq)] = a.slice(eq + 1);
      }
      return { out: '', err: joinLines(errors), code: 0 };
    }
  },

  unalias: {
    summary: 'Remove an alias.',
    usage: 'unalias name',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      for (const a of args) delete ctx.shell.aliases[a];
      return ok();
    }
  },

  source: {
    summary: 'Read a file and run every line in the current shell. Reloads ~/.bashrc.',
    usage: 'source file',
    flags: {},
    examples: ['source ~/.bashrc'],
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (!args.length) return fail('source: filename argument required\n');
      const path = resolvePath(ctx.shell.cwd, args[0], ctx.shell.env.HOME);
      const node = ctx.fs.get(path);
      if (!node || node.type === DIR) return fail(`source: ${args[0]}: No such file or directory\n`);
      return { out: '', err: '', code: 0, sourceLines: lines(node.content) };
    }
  },

  reset: {
    summary: 'Restore the practice filesystem to its original state.',
    usage: 'reset',
    flags: {},
    run: () => ({ out: '', err: '', code: 0, resetFs: true })
  }
};

sysCommands['.'] = { ...sysCommands.source, summary: 'Same as source.' };
