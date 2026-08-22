// Navigation and file-management commands.

import { parseArgs, ok, fail, joinLines, columnize, padLeft } from './util.js';
import {
  resolvePath,
  basename,
  dirname,
  joinPath,
  normalize,
  modeString,
  sizeOf,
  timeString,
  humanSize,
  DIR
} from '../../fs/filesystem.js';

// Colour markers. Only emitted when stdout is the terminal, exactly like
// real ls, so piping into grep still sees clean text.
export const MARK_START = String.fromCharCode(1);
export const MARK_END = String.fromCharCode(2);

const MARK = (kind, text, tty) => (tty ? MARK_START + kind + text + MARK_END : text);

function decorate(node, name, tty) {
  if (node.type === DIR) return MARK('d', name, tty);
  if (node.mode & 0o111) return MARK('x', name, tty);
  return name;
}

function listOne(fs, path, node, ctx, flags) {
  const long = flags.has('l');
  const all = flags.has('a');
  const human = flags.has('h');
  const tty = ctx.isTTY;

  if (node.type !== DIR) {
    const name = basename(path);
    if (!long) return decorate(node, name, tty);
    return formatLong(fs, [[name, node]], human, tty).join('\n');
  }

  let names = fs.list(path);
  if (all) names = ['.', '..', ...names];
  else names = names.filter((n) => !n.startsWith('.'));

  if (!long) {
    const shown = names.map((n) => {
      const child = n === '.' ? node : n === '..' ? fs.get(dirname(path)) || node : fs.get(joinPath(path, n));
      return decorate(child, n, tty);
    });
    return flags.has('1') ? joinLines(shown).trimEnd() : columnize(shown).trimEnd();
  }

  const entries = names.map((n) => {
    const child = n === '.' ? node : n === '..' ? fs.get(dirname(path)) || node : fs.get(joinPath(path, n));
    return [n, child];
  });
  const total = entries.reduce((sum, [, c]) => sum + Math.ceil(sizeOf(c) / 1024) * 4, 0);
  return ['total ' + total, ...formatLong(fs, entries, human, tty)].join('\n');
}

function formatLong(fs, entries, human, tty) {
  const sizes = entries.map(([, n]) => (human ? humanSize(sizeOf(n)) : String(sizeOf(n))));
  const sizeWidth = Math.max(...sizes.map((s) => s.length), 1);
  const ownerWidth = Math.max(...entries.map(([, n]) => n.owner.length), 1);
  const groupWidth = Math.max(...entries.map(([, n]) => n.group.length), 1);

  return entries.map(([name, node], i) => {
    const links = node.type === DIR ? Object.keys(node.children).length + 2 : 1;
    return (
      `${modeString(node)} ${padLeft(links, 2)} ` +
      `${node.owner.padEnd(ownerWidth)} ${node.group.padEnd(groupWidth)} ` +
      `${padLeft(sizes[i], sizeWidth)} ${timeString(node.mtime)} ` +
      decorate(node, name, tty)
    );
  });
}

function recursiveList(fs, path, ctx, flags, out) {
  out.push(`${path}:`);
  out.push(listOne(fs, path, fs.get(path), ctx, flags));
  out.push('');
  for (const name of fs.list(path) || []) {
    if (name.startsWith('.') && !flags.has('a')) continue;
    const child = joinPath(path, name);
    if (fs.isDir(child)) recursiveList(fs, child, ctx, flags, out);
  }
}

export const fileCommands = {
  pwd: {
    summary: 'Print the working directory: where you are standing right now.',
    usage: 'pwd',
    flags: {},
    examples: ['pwd'],
    run: (ctx) => ok(ctx.shell.cwd + '\n')
  },

  cd: {
    summary: 'Change directory. Moves your terminal to another folder.',
    usage: 'cd [directory]',
    flags: {},
    examples: ['cd Downloads', 'cd ..', 'cd ~', 'cd /', 'cd -'],
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      const shell = ctx.shell;
      let target = args[0];

      if (!target) target = shell.env.HOME;
      else if (target === '-') {
        target = shell.env.OLDPWD || shell.cwd;
        const resolved = resolvePath(shell.cwd, target, shell.env.HOME);
        shell.env.OLDPWD = shell.cwd;
        shell.cwd = resolved;
        return ok(resolved + '\n');
      }

      const path = resolvePath(shell.cwd, target, shell.env.HOME);
      const node = ctx.fs.get(path);
      if (!node) return fail(`cd: ${args[0]}: No such file or directory\n`);
      if (node.type !== DIR) return fail(`cd: ${args[0]}: Not a directory\n`);

      shell.env.OLDPWD = shell.cwd;
      shell.cwd = path;
      shell.env.PWD = path;
      return ok();
    }
  },

  ls: {
    summary: 'List what is inside a folder. Your way of looking around the room.',
    usage: 'ls [-l] [-a] [-h] [-R] [path...]',
    flags: {
      l: 'long format: permissions, owner, size and date',
      a: 'show hidden entries that start with a dot',
      h: 'human readable sizes, use together with -l',
      R: 'list every sub-directory recursively',
      1: 'one entry per line'
    },
    examples: ['ls', 'ls -l', 'ls -a', 'ls -lh', 'ls -R'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      const fs = ctx.fs;
      const targets = args.length ? args : ['.'];
      const out = [];
      const errs = [];
      let code = 0;

      for (const t of targets) {
        const path = resolvePath(ctx.shell.cwd, t, ctx.shell.env.HOME);
        const node = fs.get(path);
        if (!node) {
          errs.push(`ls: cannot access '${t}': No such file or directory`);
          code = 2;
          continue;
        }
        if (flags.has('R') && node.type === DIR) {
          const buf = [];
          recursiveList(fs, path, ctx, flags, buf);
          out.push(buf.join('\n').trimEnd());
          continue;
        }
        if (targets.length > 1 && node.type === DIR) out.push(`${t}:`);
        const body = listOne(fs, path, node, ctx, flags);
        if (body) out.push(body);
        if (targets.length > 1) out.push('');
      }

      return {
        out: out.length ? out.join('\n').replace(/\n*$/, '\n') : '',
        err: joinLines(errs),
        code
      };
    }
  },

  tree: {
    summary: 'Draw the folder structure as a visual tree.',
    usage: 'tree [-L depth] [-a] [path]',
    flags: { L: 'limit how many levels deep to draw', a: 'include hidden entries' },
    examples: ['tree', 'tree -L 1 /', 'tree -L 2'],
    run: (ctx) => {
      const { flags, opts, args } = parseArgs(ctx.argv, ['L']);
      const fs = ctx.fs;
      const start = resolvePath(ctx.shell.cwd, args[0] || '.', ctx.shell.env.HOME);
      if (!fs.exists(start)) return fail(`${args[0] || '.'} [error opening dir]\n`);
      const maxDepth = opts.L ? parseInt(opts.L, 10) : Infinity;
      if (opts.L && Number.isNaN(maxDepth)) return fail('tree: Invalid level, must be greater than 0.\n');

      const out = [args[0] || '.'];
      let dirs = 0;
      let files = 0;

      const walk = (path, prefix, depth) => {
        if (depth >= maxDepth) return;
        let names = fs.list(path) || [];
        if (!flags.has('a')) names = names.filter((n) => !n.startsWith('.'));
        names.forEach((name, i) => {
          const last = i === names.length - 1;
          const child = fs.get(joinPath(path, name));
          const branch = last ? '└── ' : '├── ';
          out.push(prefix + branch + decorate(child, name, ctx.isTTY));
          if (child.type === DIR) {
            dirs++;
            walk(joinPath(path, name), prefix + (last ? '    ' : '│   '), depth + 1);
          } else {
            files++;
          }
        });
      };

      walk(start, '', 0);
      out.push('');
      out.push(`${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`);
      return ok(joinLines(out));
    }
  },

  mkdir: {
    summary: 'Make a new directory. This is how you build the rooms of a project.',
    usage: 'mkdir [-p] directory...',
    flags: { p: 'create parent directories as needed, no error if it exists' },
    examples: ['mkdir Project-Atlas', 'mkdir frontend backend docs assets', 'mkdir -p a/b/c'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      if (!args.length) return fail('mkdir: missing operand\n');
      const errs = [];
      for (const a of args) {
        const path = resolvePath(ctx.shell.cwd, a, ctx.shell.env.HOME);
        const res = ctx.fs.mkdir(path, { parents: flags.has('p') });
        if (res.error) errs.push('mkdir: ' + res.error);
      }
      return { out: '', err: joinLines(errs), code: errs.length ? 1 : 0 };
    }
  },

  touch: {
    summary: 'Create an empty file, or update the timestamp of an existing one.',
    usage: 'touch file...',
    flags: {},
    examples: ['touch README.md', 'touch app.js index.js'],
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (!args.length) return fail('touch: missing file operand\n');
      const errs = [];
      for (const a of args) {
        const path = resolvePath(ctx.shell.cwd, a, ctx.shell.env.HOME);
        const res = ctx.fs.touch(path);
        if (res.error) errs.push('touch: ' + res.error);
      }
      return { out: '', err: joinLines(errs), code: errs.length ? 1 : 0 };
    }
  },

  rm: {
    summary: 'Remove files or directories. Powerful, and permanent. Check twice.',
    usage: 'rm [-r] [-f] target...',
    flags: { r: 'remove a directory and everything inside it', f: 'force, ignore missing files' },
    examples: ['rm notes.txt', 'rm -r temp'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      if (!args.length) return flags.has('f') ? ok() : fail('rm: missing operand\n');
      const errs = [];

      for (const a of args) {
        const path = resolvePath(ctx.shell.cwd, a, ctx.shell.env.HOME);

        // The lesson everybody should learn without losing their machine.
        if (path === '/' || path === ctx.shell.env.HOME) {
          return {
            out: '',
            err:
              `rm: refusing to remove '${a}'\n\n` +
              'This lab just stopped you from running the single most destructive\n' +
              'command in Linux. On a real machine there is no undo, no recycle bin,\n' +
              'and no confirmation. Before any rm, ask three questions:\n' +
              '  1. Where am I?  (pwd)\n' +
              '  2. What is actually in there?  (ls)\n' +
              '  3. Can I recreate this if I am wrong?  (cp a backup first)\n',
            code: 1
          };
        }

        const res = ctx.fs.remove(path, { recursive: flags.has('r') });
        if (res.error && !flags.has('f')) errs.push('rm: ' + res.error);
      }
      return { out: '', err: joinLines(errs), code: errs.length ? 1 : 0 };
    }
  },

  rmdir: {
    summary: 'Remove an empty directory.',
    usage: 'rmdir directory...',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      const errs = [];
      for (const a of args) {
        const path = resolvePath(ctx.shell.cwd, a, ctx.shell.env.HOME);
        const node = ctx.fs.get(path);
        if (!node) errs.push(`rmdir: failed to remove '${a}': No such file or directory`);
        else if (node.type !== DIR) errs.push(`rmdir: failed to remove '${a}': Not a directory`);
        else if (Object.keys(node.children).length) errs.push(`rmdir: failed to remove '${a}': Directory not empty`);
        else ctx.fs.remove(path, { recursive: true });
      }
      return { out: '', err: joinLines(errs), code: errs.length ? 1 : 0 };
    }
  },

  cp: {
    summary: 'Copy a file or folder. The original stays exactly where it was.',
    usage: 'cp [-r] source... destination',
    flags: { r: 'copy a directory and its contents' },
    examples: ['cp README.md README_BACKUP.md', 'cp -r assets assets-backup'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      if (args.length < 2) return fail('cp: missing destination file operand\n');
      const dest = args[args.length - 1];
      const sources = args.slice(0, -1);
      const destPath = resolvePath(ctx.shell.cwd, dest, ctx.shell.env.HOME);
      if (sources.length > 1 && !ctx.fs.isDir(destPath)) {
        return fail(`cp: target '${dest}' is not a directory\n`);
      }
      const errs = [];
      for (const s of sources) {
        const srcPath = resolvePath(ctx.shell.cwd, s, ctx.shell.env.HOME);
        const res = ctx.fs.copy(srcPath, destPath, { recursive: flags.has('r') });
        if (res.error) errs.push('cp: ' + res.error);
      }
      return { out: '', err: joinLines(errs), code: errs.length ? 1 : 0 };
    }
  },

  mv: {
    summary: 'Move a file to another folder, or rename it. Nothing is duplicated.',
    usage: 'mv source... destination',
    flags: {},
    examples: ['mv setup.md docs/', 'mv README.md README_PROJECT.md'],
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (args.length < 2) return fail('mv: missing destination file operand\n');
      const dest = args[args.length - 1];
      const sources = args.slice(0, -1);
      const destPath = resolvePath(ctx.shell.cwd, dest, ctx.shell.env.HOME);
      if (sources.length > 1 && !ctx.fs.isDir(destPath)) {
        return fail(`mv: target '${dest}' is not a directory\n`);
      }
      const errs = [];
      for (const s of sources) {
        const srcPath = resolvePath(ctx.shell.cwd, s, ctx.shell.env.HOME);
        const res = ctx.fs.move(srcPath, destPath);
        if (res.error) errs.push('mv: ' + res.error);
      }
      return { out: '', err: joinLines(errs), code: errs.length ? 1 : 0 };
    }
  }
};

export { normalize };
