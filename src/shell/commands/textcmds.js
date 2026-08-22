// Reading and inspecting file contents.

import { parseArgs, ok, fail, lines, joinLines, padLeft } from './util.js';
import { resolvePath, basename, DIR } from '../../fs/filesystem.js';

// Collect the inputs a text command should read: named files, or stdin.
function readInputs(ctx, args) {
  const results = [];
  const errors = [];
  if (!args.length) {
    results.push({ name: '-', content: ctx.stdin || '' });
    return { results, errors };
  }
  for (const a of args) {
    if (a === '-') {
      results.push({ name: '-', content: ctx.stdin || '' });
      continue;
    }
    const path = resolvePath(ctx.shell.cwd, a, ctx.shell.env.HOME);
    const node = ctx.fs.get(path);
    if (!node) errors.push(`${a}: No such file or directory`);
    else if (node.type === DIR) errors.push(`${a}: Is a directory`);
    else results.push({ name: a, content: node.content, path });
  }
  return { results, errors };
}

export const textCommands = {
  cat: {
    summary: 'Print a whole file to the screen. Fine for short files, painful for logs.',
    usage: 'cat [-n] [file...]',
    flags: { n: 'number every output line' },
    examples: ['cat README.md', 'cat -n application.log'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      const { results, errors } = readInputs(ctx, args);
      let out = results.map((r) => r.content).join('');
      if (flags.has('n')) {
        out = joinLines(lines(out).map((l, i) => `${padLeft(i + 1, 6)}\t${l}`));
      }
      return {
        out,
        err: joinLines(errors.map((e) => 'cat: ' + e)),
        code: errors.length ? 1 : 0
      };
    }
  },

  head: {
    summary: 'Read the first lines of a file. Shows how the story begins.',
    usage: 'head [-n count] [file...]',
    flags: { n: 'how many lines to show (default 10)' },
    examples: ['head application.log', 'head -n 1 assets/atlas-server.log'],
    run: (ctx) => {
      const { flags, opts, args } = parseArgs(ctx.argv, ['n']);
      let count = opts.n !== undefined ? parseInt(opts.n, 10) : 10;
      for (const f of flags) if (/^\d+$/.test(f)) count = parseInt(f, 10);
      if (Number.isNaN(count)) return fail('head: invalid number of lines\n');

      const { results, errors } = readInputs(ctx, args);
      const out = [];
      results.forEach((r) => {
        if (results.length > 1) out.push(`==> ${r.name} <==`);
        out.push(...lines(r.content).slice(0, count));
        if (results.length > 1) out.push('');
      });
      return {
        out: joinLines(out),
        err: joinLines(errors.map((e) => 'head: cannot open ' + e)),
        code: errors.length ? 1 : 0
      };
    }
  },

  tail: {
    summary: 'Read the last lines of a file. In logs the newest events sit at the bottom.',
    usage: 'tail [-n count] [-f] [file]',
    flags: { n: 'how many lines to show (default 10)', f: 'follow the file live as new lines arrive' },
    examples: ['tail assets/atlas-server.log', 'tail -n 1 application.log', 'tail -f assets/atlas-server.log'],
    run: (ctx) => {
      const { flags, opts, args } = parseArgs(ctx.argv, ['n']);
      let count = opts.n !== undefined ? parseInt(opts.n, 10) : 10;
      for (const f of flags) if (/^\d+$/.test(f)) count = parseInt(f, 10);
      if (Number.isNaN(count)) return fail('tail: invalid number of lines\n');

      const { results, errors } = readInputs(ctx, args);

      if (flags.has('f')) {
        if (!ctx.isTTY) return fail('tail: -f needs a terminal\n');
        if (!results.length) return { out: '', err: joinLines(errors.map((e) => 'tail: ' + e)), code: 1 };
        return {
          out: '',
          err: '',
          code: 0,
          mode: {
            kind: 'tailf',
            name: results[0].name,
            initial: lines(results[0].content).slice(-count)
          }
        };
      }

      const out = [];
      results.forEach((r) => {
        if (results.length > 1) out.push(`==> ${r.name} <==`);
        out.push(...lines(r.content).slice(-count));
        if (results.length > 1) out.push('');
      });
      return {
        out: joinLines(out),
        err: joinLines(errors.map((e) => 'tail: cannot open ' + e)),
        code: errors.length ? 1 : 0
      };
    }
  },

  wc: {
    summary: 'Count lines, words and characters. Measures how big the case is.',
    usage: 'wc [-l] [-w] [-c] [file...]',
    flags: { l: 'count lines only', w: 'count words only', c: 'count characters only' },
    examples: ['wc application.log', 'wc -l assets/atlas-server.log'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      const { results, errors } = readInputs(ctx, args);
      const want = { l: flags.has('l'), w: flags.has('w'), c: flags.has('c') };
      const none = !want.l && !want.w && !want.c;

      const rows = [];
      const totals = { l: 0, w: 0, c: 0 };

      for (const r of results) {
        const l = lines(r.content).length;
        const w = r.content.split(/\s+/).filter(Boolean).length;
        const c = r.content.length;
        totals.l += l;
        totals.w += w;
        totals.c += c;
        const parts = [];
        if (none || want.l) parts.push(padLeft(l, 7));
        if (none || want.w) parts.push(padLeft(w, 7));
        if (none || want.c) parts.push(padLeft(c, 7));
        rows.push(parts.join('') + (r.name !== '-' ? ' ' + r.name : ''));
      }

      if (results.length > 1) {
        const parts = [];
        if (none || want.l) parts.push(padLeft(totals.l, 7));
        if (none || want.w) parts.push(padLeft(totals.w, 7));
        if (none || want.c) parts.push(padLeft(totals.c, 7));
        rows.push(parts.join('') + ' total');
      }

      return {
        out: joinLines(rows),
        err: joinLines(errors.map((e) => 'wc: ' + e)),
        code: errors.length ? 1 : 0
      };
    }
  },

  less: {
    summary: 'Page through a large file. Search with /word, n for next, q to quit.',
    usage: 'less file',
    flags: {},
    examples: ['less assets/atlas-server.log'],
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (!ctx.isTTY) {
        // Piped into something else: behave like cat, which is what real less does.
        const { results, errors } = readInputs(ctx, args);
        return { out: results.map((r) => r.content).join(''), err: joinLines(errors), code: 0 };
      }
      const { results, errors } = readInputs(ctx, args);
      if (errors.length) return fail(joinLines(errors.map((e) => 'less: ' + e)));
      if (!results.length) return fail('less: missing filename\n');
      return {
        out: '',
        err: '',
        code: 0,
        mode: { kind: 'less', name: results[0].name, lines: lines(results[0].content) }
      };
    }
  },

  more: {
    summary: 'Older sibling of less. Pages through a file.',
    usage: 'more file',
    flags: {},
    run: (ctx) => textCommands.less.run(ctx)
  },

  nano: {
    summary: 'Small text editor. Used here to edit ~/.bashrc and save your aliases.',
    usage: 'nano file',
    flags: {},
    examples: ['nano ~/.bashrc'],
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (!ctx.isTTY) return fail('nano: needs a terminal\n');
      if (!args.length) return fail('nano: missing filename\n');
      const path = resolvePath(ctx.shell.cwd, args[0], ctx.shell.env.HOME);
      const node = ctx.fs.get(path);
      if (node && node.type === DIR) return fail(`nano: ${args[0]}: Is a directory\n`);
      return {
        out: '',
        err: '',
        code: 0,
        mode: {
          kind: 'nano',
          path,
          name: basename(path),
          content: node ? node.content : ''
        }
      };
    }
  },

  sort: {
    summary: 'Sort lines alphabetically, or numerically with -n.',
    usage: 'sort [-r] [-n] [-u] [file...]',
    flags: { r: 'reverse the order', n: 'compare as numbers', u: 'drop duplicate lines' },
    examples: ['sort names.txt', 'grep ERROR log | sort | uniq -c'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      const { results, errors } = readInputs(ctx, args);
      let all = results.flatMap((r) => lines(r.content));
      all.sort((a, b) =>
        flags.has('n') ? parseFloat(a) - parseFloat(b) : a.localeCompare(b)
      );
      if (flags.has('r')) all.reverse();
      if (flags.has('u')) all = all.filter((l, i) => i === 0 || l !== all[i - 1]);
      return { out: joinLines(all), err: joinLines(errors.map((e) => 'sort: ' + e)), code: errors.length ? 1 : 0 };
    }
  },

  uniq: {
    summary: 'Collapse repeated neighbouring lines. Pair it with sort.',
    usage: 'uniq [-c] [file]',
    flags: { c: 'show how many times each line repeated' },
    examples: ['sort log | uniq', 'sort log | uniq -c'],
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      const { results, errors } = readInputs(ctx, args);
      const all = results.flatMap((r) => lines(r.content));
      const out = [];
      let i = 0;
      while (i < all.length) {
        let n = 1;
        while (i + n < all.length && all[i + n] === all[i]) n++;
        out.push(flags.has('c') ? `${padLeft(n, 7)} ${all[i]}` : all[i]);
        i += n;
      }
      return { out: joinLines(out), err: joinLines(errors.map((e) => 'uniq: ' + e)), code: errors.length ? 1 : 0 };
    }
  },

  cut: {
    summary: 'Pull selected columns out of each line.',
    usage: 'cut -d delimiter -f fields [file...]',
    flags: { d: 'the character that separates fields', f: 'which field numbers to keep' },
    examples: ['cut -d : -f 1 /etc/passwd'],
    run: (ctx) => {
      const { opts, args } = parseArgs(ctx.argv, ['d', 'f']);
      if (opts.f === undefined) return fail('cut: you must specify a list of fields\n');
      const delim = opts.d === undefined ? '\t' : opts.d;
      const fields = String(opts.f)
        .split(',')
        .flatMap((part) => {
          const m = part.match(/^(\d+)-(\d+)$/);
          if (!m) return [parseInt(part, 10)];
          const out = [];
          for (let i = +m[1]; i <= +m[2]; i++) out.push(i);
          return out;
        })
        .filter((n) => !Number.isNaN(n));

      const { results, errors } = readInputs(ctx, args);
      const out = results.flatMap((r) =>
        lines(r.content).map((l) => {
          const parts = l.split(delim);
          return fields.map((f) => parts[f - 1]).filter((v) => v !== undefined).join(delim);
        })
      );
      return { out: joinLines(out), err: joinLines(errors.map((e) => 'cut: ' + e)), code: errors.length ? 1 : 0 };
    }
  }
};
