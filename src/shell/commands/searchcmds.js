// Searching and filtering: grep and find.

import { parseArgs, ok, fail, lines, joinLines } from './util.js';
import { resolvePath, joinPath, normalize, basename, DIR, FILE, sizeOf } from '../../fs/filesystem.js';
import { globToRegex, matchesGlob } from '../glob.js';
import { MARK_START, MARK_END } from './filecmds.js';

const highlight = (text, re, tty) =>
  tty ? text.replace(re, (m) => MARK_START + 'm' + m + MARK_END) : text;

// Relative display path, so `grep -r x .` prints ./backend/app.js not /home/...
function displayPath(abs, baseAbs, baseArg) {
  if (baseArg.startsWith('/')) return abs;
  if (abs === baseAbs) return baseArg;
  const rel = abs.slice(baseAbs.length + 1);
  return baseArg === '.' ? './' + rel : baseArg.replace(/\/$/, '') + '/' + rel;
}

export const searchCommands = {
  grep: {
    summary: 'Print only the lines that match a pattern. A highlighter for text.',
    usage: 'grep [-n] [-i] [-v] [-r] [-c] [-w] [-l] pattern [file...]',
    flags: {
      n: 'show the line number of each match',
      i: 'ignore upper and lower case',
      v: 'invert: show lines that do NOT match',
      r: 'search recursively through every file in a folder',
      c: 'print only the count of matching lines',
      w: 'match whole words only',
      l: 'print only the names of files that contain a match',
      E: 'treat the pattern as an extended regular expression'
    },
    examples: [
      'grep "ERROR" logs/server.log',
      'grep -n "ERROR" logs/server.log',
      'grep -i login logs/server.log',
      'grep -v INFO logs/server.log',
      'grep -r "JWT_SECRET" .'
    ],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      if (!args.length) return fail('usage: grep [-nivrcwl] pattern [file...]\n');

      const patternText = args[0];
      const fileArgs = args.slice(1);
      let source;
      try {
        const body = flags.has('w') ? `\\b(?:${patternText})\\b` : patternText;
        source = new RegExp(body, flags.has('i') ? 'gi' : 'g');
      } catch {
        return fail(`grep: invalid pattern: ${patternText}\n`);
      }
      const test = (line) => {
        source.lastIndex = 0;
        return source.test(line);
      };

      // Build the list of files to scan.
      const targets = [];
      const errors = [];

      if (!fileArgs.length && !flags.has('r')) {
        if (ctx.stdin === null || ctx.stdin === undefined) {
          return fail('grep: no input. Give it a file, or pipe something in.\n');
        }
        targets.push({ label: null, content: ctx.stdin });
      } else {
        const roots = fileArgs.length ? fileArgs : ['.'];
        for (const arg of roots) {
          const abs = resolvePath(ctx.shell.cwd, arg, ctx.shell.env.HOME);
          const node = ctx.fs.get(abs);
          if (!node) {
            errors.push(`grep: ${arg}: No such file or directory`);
            continue;
          }
          if (node.type === DIR) {
            if (!flags.has('r')) {
              errors.push(`grep: ${arg}: Is a directory`);
              continue;
            }
            ctx.fs.walk(abs, (p, n) => {
              if (n.type === FILE) targets.push({ label: displayPath(p, abs, arg), content: n.content });
            });
          } else {
            targets.push({ label: arg, content: node.content });
          }
        }
      }

      const showName = targets.length > 1 || flags.has('r');
      const out = [];
      let matchTotal = 0;

      for (const t of targets) {
        const fileLines = lines(t.content);
        let count = 0;
        const hits = [];
        fileLines.forEach((line, i) => {
          const isMatch = test(line);
          if (flags.has('v') ? !isMatch : isMatch) {
            count++;
            matchTotal++;
            const prefix =
              (showName && t.label ? t.label + ':' : '') + (flags.has('n') ? i + 1 + ':' : '');
            hits.push(prefix + (flags.has('v') ? line : highlight(line, source, ctx.isTTY)));
          }
        });
        if (flags.has('l')) {
          if (count && t.label) out.push(t.label);
        } else if (flags.has('c')) {
          out.push((showName && t.label ? t.label + ':' : '') + count);
        } else {
          out.push(...hits);
        }
      }

      return {
        out: joinLines(out),
        err: joinLines(errors),
        code: errors.length ? 2 : matchTotal ? 0 : 1
      };
    }
  },

  find: {
    summary: 'Locate files and folders by name, type or size, anywhere below a path.',
    usage: 'find [path] [-name pattern] [-type f|d] [-maxdepth n] [-size n[c]]',
    flags: {},
    examples: [
      'find .',
      'find . -name "*.js"',
      'find . -type d',
      'find . -name "README.md"',
      'find . -type f -size +1000c'
    ],
    run: (ctx) => {
      const argv = ctx.argv.slice(1);
      const roots = [];
      const tests = [];
      let maxDepth = Infinity;
      let i = 0;

      while (i < argv.length && !argv[i].startsWith('-')) roots.push(argv[i++]);
      if (!roots.length) roots.push('.');

      while (i < argv.length) {
        const opt = argv[i];
        const val = argv[i + 1];
        switch (opt) {
          case '-name':
            if (val === undefined) return fail('find: missing argument to `-name\'\n');
            tests.push((p, n, name) => matchesGlob(name, val));
            i += 2;
            break;
          case '-iname':
            if (val === undefined) return fail('find: missing argument to `-iname\'\n');
            tests.push((p, n, name) => globToRegex(val.toLowerCase()).test(name.toLowerCase()));
            i += 2;
            break;
          case '-type':
            if (val === undefined) return fail('find: missing argument to `-type\'\n');
            tests.push((p, n) => (val === 'd' ? n.type === DIR : n.type === FILE));
            i += 2;
            break;
          case '-maxdepth':
            maxDepth = parseInt(val, 10);
            i += 2;
            break;
          case '-size': {
            if (val === undefined) return fail('find: missing argument to `-size\'\n');
            const m = val.match(/^([+-]?)(\d+)([cbk]?)$/);
            if (!m) return fail(`find: invalid -size argument '${val}'\n`);
            const unit = m[3] === 'k' ? 1024 : 1;
            const want = parseInt(m[2], 10) * unit;
            tests.push((p, n) => {
              const s = sizeOf(n);
              if (m[1] === '+') return s > want;
              if (m[1] === '-') return s < want;
              return s === want;
            });
            i += 2;
            break;
          }
          case '-empty':
            tests.push((p, n) => (n.type === DIR ? !Object.keys(n.children).length : !n.content.length));
            i += 1;
            break;
          default:
            return fail(`find: unknown predicate '${opt}'\n`);
        }
      }

      const out = [];
      const errors = [];

      for (const rootArg of roots) {
        const abs = resolvePath(ctx.shell.cwd, rootArg, ctx.shell.env.HOME);
        if (!ctx.fs.exists(abs)) {
          errors.push(`find: '${rootArg}': No such file or directory`);
          continue;
        }
        ctx.fs.walk(abs, (p, n, depth) => {
          if (depth > maxDepth) return;
          const name = p === '/' ? '/' : basename(p);
          if (tests.every((t) => t(p, n, name))) out.push(displayPath(p, abs, rootArg));
        });
      }

      return { out: joinLines(out), err: joinLines(errors), code: errors.length ? 1 : 0 };
    }
  }
};

export { normalize, joinPath, ok };
