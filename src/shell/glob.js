// Wildcard expansion: *, ? and [abc] character sets.

import { resolvePath, joinPath, normalize } from '../fs/filesystem.js';

export function hasGlob(word) {
  return /[*?[]/.test(word);
}

export function globToRegex(pattern, { anchored = true } = {}) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close === -1) {
        out += '\\[';
      } else {
        let set = pattern.slice(i + 1, close);
        let negate = '';
        if (set.startsWith('!') || set.startsWith('^')) {
          negate = '^';
          set = set.slice(1);
        }
        out += '[' + negate + set.replace(/\\/g, '\\\\').replace(/\]/g, '\\]') + ']';
        i = close;
      }
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(anchored ? `^${out}$` : out);
}

export function matchesGlob(name, pattern) {
  return globToRegex(pattern).test(name);
}

// Expand one word against the filesystem. Returns [word] unchanged when
// nothing matches, which is what bash does by default.
export function expandGlob(fs, cwd, word, home) {
  if (!hasGlob(word)) return [word];

  const absolute = word.startsWith('/');
  const startsHome = word.startsWith('~');
  const base = absolute ? '/' : startsHome ? home : cwd;
  const stripped = absolute ? word.slice(1) : startsHome ? word.replace(/^~\/?/, '') : word;
  const segments = stripped.split('/').filter(Boolean);

  let candidates = [base];
  for (const seg of segments) {
    const next = [];
    for (const dir of candidates) {
      if (!fs.isDir(dir)) continue;
      if (!/[*?[]/.test(seg)) {
        const child = joinPath(dir, seg);
        if (fs.exists(child)) next.push(child);
        continue;
      }
      const re = globToRegex(seg);
      for (const name of fs.list(dir) || []) {
        // A leading dot is only matched by an explicit leading dot.
        if (name.startsWith('.') && !seg.startsWith('.')) continue;
        if (re.test(name)) next.push(joinPath(dir, name));
      }
    }
    candidates = next;
  }

  if (!candidates.length) return [word];

  // Present results the way the user addressed them: relative stays relative.
  return candidates
    .map((abs) => {
      if (absolute) return abs;
      const prefix = normalize(base);
      if (prefix === '/') return abs.slice(1);
      return abs.startsWith(prefix + '/') ? abs.slice(prefix.length + 1) : abs;
    })
    .sort();
}

export function expandArgv(fs, cwd, tokens, home) {
  const out = [];
  for (const tok of tokens) {
    if (tok.quoted) {
      out.push(tok.v);
      continue;
    }
    out.push(...expandGlob(fs, cwd, tok.v, home));
  }
  return out;
}

export { resolvePath };
