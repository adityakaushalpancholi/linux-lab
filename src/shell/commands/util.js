// Shared helpers for command implementations.

// Parses short flags (-l, -la, -n 5, -n5) and long flags (--help, --key=value).
// `valueFlags` lists short flags that consume the next argument.
export function parseArgs(argv, valueFlags = []) {
  const flags = new Set();
  const opts = {};
  const args = [];
  const unknownCandidates = [];

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];

    if (a === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }

    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      if (eq !== -1) opts[a.slice(2, eq)] = a.slice(eq + 1);
      else flags.add(a.slice(2));
      unknownCandidates.push(a);
      continue;
    }

    if (a.startsWith('-') && a.length > 1) {
      const chars = a.slice(1);
      for (let j = 0; j < chars.length; j++) {
        const c = chars[j];
        if (valueFlags.includes(c)) {
          const rest = chars.slice(j + 1);
          if (rest) opts[c] = rest;
          else opts[c] = argv[++i];
          break;
        }
        flags.add(c);
      }
      unknownCandidates.push(a);
      continue;
    }

    args.push(a);
  }

  return { flags, opts, args, raw: unknownCandidates };
}

export function ok(out = '') {
  return { out, err: '', code: 0 };
}

export function fail(err, code = 1) {
  return { out: '', err, code };
}

export function lines(text) {
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

export function joinLines(arr) {
  return arr.length ? arr.join('\n') + '\n' : '';
}

// Column layout for bare `ls`, the way a real terminal packs names.
export function columnize(items, width = 80) {
  if (!items.length) return '';
  const longest = Math.max(...items.map((i) => i.length)) + 2;
  const perRow = Math.max(1, Math.floor(width / longest));
  if (perRow === 1) return joinLines(items);
  const rows = Math.ceil(items.length / perRow);
  const out = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < perRow; c++) {
      const idx = c * rows + r;
      if (idx >= items.length) continue;
      line += items[idx].padEnd(longest);
    }
    out.push(line.trimEnd());
  }
  return joinLines(out);
}

export function padLeft(s, n) {
  return String(s).padStart(n);
}
