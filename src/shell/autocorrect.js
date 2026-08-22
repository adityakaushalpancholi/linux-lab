// Autocorrect: catches the mistakes beginners actually make, explains them,
// and offers a corrected command line.
//
// Every suggestion returns { type, message, corrected, note } where `corrected`
// is a complete command line the learner (or the shell, in auto-fix mode) can run.

import { resolvePath, dirname, basename, DIR } from '../fs/filesystem.js';

/* ------------------------------------------------------------- distance --- */

// Damerau-Levenshtein: counts a swap of two neighbouring letters as one edit,
// not two. That matters here because transposition is the typo people actually
// make on the keyboard -- pdw for pwd, sl for ls, mkidr for mkdir.
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prevPrev = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prevPrev[j - 2] + 1);
      }
      curr[j] = best;
    }
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

function closest(word, candidates, maxDistance = 2) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = levenshtein(word.toLowerCase(), c.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = c;
    }
  }
  const limit = word.length <= 3 ? 1 : maxDistance;
  return bestScore <= limit ? { value: best, distance: bestScore } : null;
}

/* ---------------------------------------------------------- known fixes --- */

// Windows / DOS habits, and the equivalent that actually works here.
const DOS_MAP = {
  dir: { to: 'ls', why: 'dir is the Windows Command Prompt way. In Linux the same job belongs to ls.' },
  cls: { to: 'clear', why: 'cls clears the screen in Windows. Linux uses clear (or Ctrl + L).' },
  del: { to: 'rm', why: 'del deletes in Windows. Linux uses rm, and it does not ask twice.' },
  erase: { to: 'rm', why: 'erase is the DOS name. Linux uses rm.' },
  copy: { to: 'cp', why: 'copy is DOS. Linux shortens it to cp, and the original still stays put.' },
  xcopy: { to: 'cp -r', why: 'xcopy copied folders in DOS. In Linux that is cp -r.' },
  move: { to: 'mv', why: 'move is DOS. Linux uses mv, which also handles renaming.' },
  ren: { to: 'mv', why: 'Linux has no separate rename command. Renaming is just mv old new.' },
  rename: { to: 'mv', why: 'Linux has no separate rename command. Renaming is just mv old new.' },
  md: { to: 'mkdir', why: 'md is the DOS short form. Linux spells it out as mkdir.' },
  rd: { to: 'rmdir', why: 'rd is the DOS short form. Linux spells it out as rmdir.' },
  type: { to: 'cat', why: 'type printed a file in DOS. Linux uses cat.' },
  cd_: { to: 'cd', why: '' },
  chdir: { to: 'cd', why: 'chdir is the DOS name for changing directory. Linux uses cd.' },
  ipconfig: { to: 'ifconfig', why: 'ipconfig is Windows. Linux uses ifconfig or ip addr.' },
  tasklist: { to: 'ps aux', why: 'tasklist shows processes in Windows. Linux uses ps aux.' },
  taskkill: { to: 'kill', why: 'taskkill ends a process in Windows. Linux uses kill with a PID.' },
  cmd: { to: 'bash', why: 'You are already in a shell. There is no cmd here.' },
  ls_: { to: 'ls', why: '' },
  more_: { to: 'less', why: '' }
};

// Mistakes that are about shape rather than spelling.
const SHAPE_RULES = [
  {
    test: /^cd\.\.$/,
    fix: () => 'cd ..',
    why: 'cd and .. are two separate words. The shell reads the first word as the command, so it needs the space.'
  },
  {
    test: /^cd~$/,
    fix: () => 'cd ~',
    why: 'cd and ~ are two separate words. Put a space between the command and where you want to go.'
  },
  {
    test: /^cd\/$/,
    fix: () => 'cd /',
    why: 'cd and / are two separate words.'
  },
  {
    test: /^cd\.\.\/(.+)$/,
    fix: (m) => `cd ../${m[1]}`,
    why: 'The path needs to be its own word, separated from cd by a space.'
  }
];

/* ------------------------------------------------- which args are paths --- */

const PATH_ARG_RULE = {
  cd: 'all',
  ls: 'all',
  cat: 'all',
  less: 'all',
  more: 'all',
  head: 'all',
  tail: 'all',
  wc: 'all',
  rm: 'all',
  rmdir: 'all',
  cp: 'allButLast',
  mv: 'allButLast',
  tree: 'all',
  stat: 'all',
  source: 'all',
  sort: 'all',
  uniq: 'all',
  cut: 'all',
  grep: 'skipFirst',
  chmod: 'skipFirst',
  chown: 'skipFirst'
};

// Commands where an unrecognised dash argument should NOT be flagged,
// because their real syntax does not use plain short flags.
const SKIP_FLAG_CHECK = new Set(['ps', 'chmod', 'chown', 'find', 'kill', 'alias', 'export', 'echo']);

function isFlagToken(t) {
  return t.startsWith('-') && t.length > 1;
}

/* ----------------------------------------------------------- the engine --- */

export function analyse(input, shell) {
  const line = input.trim();
  if (!line) return null;

  // Only look at the first segment; suggesting across pipes gets noisy.
  const segment = line.split(/\s*(?:\|\||&&|\||;)\s*/)[0].trim();
  if (!segment) return null;

  const tokens = segment.split(/\s+/);
  const head = tokens[0];
  const rest = tokens.slice(1);
  const known = Object.prototype.hasOwnProperty.bind(shell.commands);
  const isKnown = known(head) || Object.prototype.hasOwnProperty.call(shell.aliases, head);

  /* 1. The command itself is not recognised. */
  if (!isKnown) {
    for (const rule of SHAPE_RULES) {
      const m = head.match(rule.test) || segment.match(rule.test);
      if (m) {
        const fixed = rule.fix(m);
        return {
          type: 'spacing',
          typed: head,
          message: `${head} is missing a space.`,
          why: rule.why,
          corrected: line.replace(segment, [fixed, ...rest].join(' ').trim())
        };
      }
    }

    // "ls-l", "mkdir-p": a valid command glued to its flag.
    const glued = head.match(/^([a-z]+)(-{1,2}[a-zA-Z]+)$/);
    if (glued && known(glued[1])) {
      const fixed = `${glued[1]} ${glued[2]}`;
      return {
        type: 'spacing',
        typed: head,
        message: `${head} needs a space before the flag.`,
        why: `The shell reads ${glued[1]} as the command and ${glued[2]} as an option. Glued together it looks like one unknown command.`,
        corrected: line.replace(segment, [fixed, ...rest].join(' ').trim())
      };
    }

    const dos = DOS_MAP[head.toLowerCase()];
    if (dos) {
      return {
        type: 'dos',
        typed: head,
        message: `${head} is a Windows command. Here it is ${dos.to}.`,
        why: dos.why,
        corrected: line.replace(segment, [dos.to, ...rest].join(' ').trim())
      };
    }

    const candidates = [...Object.keys(shell.commands), ...Object.keys(shell.aliases)];
    const near = closest(head, candidates);
    if (near) {
      const cmd = shell.commands[near.value];
      return {
        type: 'command',
        typed: head,
        message: `command not found: ${head} — did you mean ${near.value}?`,
        why: cmd ? cmd.summary : `${near.value} is an alias for: ${shell.aliases[near.value]}`,
        corrected: line.replace(segment, [near.value, ...rest].join(' ').trim())
      };
    }

    return {
      type: 'unknown',
      typed: head,
      message: `command not found: ${head}`,
      why: 'Nothing close to that name exists here. Type  help  to see everything this lab understands.',
      corrected: null
    };
  }

  /* 2. Command is fine. Check its arguments. */
  const cmd = shell.commands[head];
  if (!cmd) return null; // an alias; let it expand and be checked on the next pass

  // 2a. Unknown short flags.
  if (!SKIP_FLAG_CHECK.has(head)) {
    const valid = Object.keys(cmd.flags || {});
    for (const tok of rest) {
      if (!isFlagToken(tok) || tok.startsWith('--')) continue;
      const chars = tok.slice(1).split('');
      if (chars.every((c) => /\d/.test(c))) continue; // head -5, tail -20
      const bad = chars.find((c) => !valid.includes(c));
      if (bad === undefined) continue;
      const near = valid.length ? closest(bad, valid, 1) : null;
      const fixedTok = near ? tok.replace(bad, near.value) : null;
      return {
        type: 'flag',
        typed: tok,
        message: near
          ? `${head}: -${bad} is not an option — did you mean -${near.value}?`
          : `${head}: -${bad} is not an option here.`,
        why: near
          ? `-${near.value} means: ${cmd.flags[near.value]}`
          : valid.length
            ? `${head} accepts: ${valid.map((v) => '-' + v).join(', ')}. Run  man ${head}  for detail.`
            : `${head} does not take short options.`,
        corrected: fixedTok ? line.replace(tok, fixedTok) : null
      };
    }
  }

  // 2b. A path argument that does not exist, but something similar does.
  const rule = PATH_ARG_RULE[head];
  if (rule) {
    const positional = rest.filter((t) => !isFlagToken(t));
    let checkable = positional;
    if (rule === 'skipFirst') checkable = positional.slice(1);
    if (rule === 'allButLast') checkable = positional.slice(0, -1);

    for (const arg of checkable) {
      if (/[*?[]/.test(arg)) continue; // globs legitimately match nothing
      const abs = resolvePath(shell.cwd, arg, shell.env.HOME);
      if (shell.fs.exists(abs)) {
        // Right path, wrong tool: cd into a file is a classic.
        if (head === 'cd' && !shell.fs.isDir(abs)) {
          return {
            type: 'usage',
            typed: arg,
            message: `cd: ${arg} is a file, not a folder.`,
            why: 'cd only moves between directories. To look inside a file use cat, or less for a long one.',
            corrected: line.replace(segment, `cat ${arg}`)
          };
        }
        continue;
      }

      const parentPath = dirname(abs);
      const siblings = shell.fs.list(parentPath) || [];
      const wanted = basename(abs);

      // Same name, different capitals. Worth its own message, and it has to be
      // checked before fuzzy matching or the generic typo hint swallows it.
      const caseMatch = siblings.find((n) => n.toLowerCase() === wanted.toLowerCase());
      if (caseMatch) {
        return {
          type: 'case',
          typed: arg,
          message: `${head}: ${arg} does not exist, but ${caseMatch} does.`,
          why: 'Linux filenames are case sensitive. Downloads and downloads are two completely different names, unlike on Windows.',
          corrected: line.replace(arg, arg.slice(0, arg.length - wanted.length) + caseMatch)
        };
      }

      const near = closest(wanted, siblings);
      if (near) {
        const fixedArg = arg.slice(0, arg.length - basename(abs).length) + near.value;
        return {
          type: 'path',
          typed: arg,
          message: `${head}: ${arg} does not exist — did you mean ${near.value}?`,
          why: `Tab completion would have caught this: type the first few letters and press Tab instead of typing the whole name.`,
          corrected: line.replace(arg, fixedArg)
        };
      }

      return {
        type: 'missing',
        typed: arg,
        message: `${head}: ${arg}: No such file or directory`,
        why: `Run  ls  to see what is actually here, and  pwd  to confirm where you are standing.`,
        corrected: null
      };
    }
  }

  // 2c. Command-specific gotchas worth teaching.
  if (head === 'rm') {
    const positional = rest.filter((t) => !isFlagToken(t));
    const hasR = rest.some((t) => isFlagToken(t) && t.includes('r'));
    const target = positional[0];
    if (target && !hasR) {
      const abs = resolvePath(shell.cwd, target, shell.env.HOME);
      const node = shell.fs.get(abs);
      if (node && node.type === DIR) {
        return {
          type: 'usage',
          typed: target,
          message: `rm: ${target} is a directory.`,
          why: 'Removing a folder needs -r, which means "and everything inside it". Look inside with ls first so you know what you are about to lose.',
          corrected: line.replace(segment, `rm -r ${target}`)
        };
      }
    }
  }

  if (head === 'cp') {
    const positional = rest.filter((t) => !isFlagToken(t));
    const hasR = rest.some((t) => isFlagToken(t) && t.includes('r'));
    if (positional.length >= 2 && !hasR) {
      const abs = resolvePath(shell.cwd, positional[0], shell.env.HOME);
      if (shell.fs.isDir(abs)) {
        return {
          type: 'usage',
          typed: positional[0],
          message: `cp: ${positional[0]} is a directory.`,
          why: 'Copying a folder needs -r so cp walks everything inside it.',
          corrected: line.replace(segment, `cp -r ${positional.join(' ')}`)
        };
      }
    }
  }

  if (head === 'grep' && rest.filter((t) => !isFlagToken(t)).length === 1) {
    const hasR = rest.some((t) => isFlagToken(t) && t.includes('r'));
    if (!hasR) {
      return {
        type: 'usage',
        typed: segment,
        message: 'grep needs something to search.',
        why: 'Give it a file (grep ERROR server.log), add -r to search a whole folder, or pipe text into it.',
        corrected: `${segment} .`.replace('grep', 'grep -r')
      };
    }
  }

  return null;
}

/* --------------------------------------------------------- tab complete --- */

export function complete(input, cursorAtEnd, shell) {
  const trailingSpace = /\s$/.test(input);
  const tokens = input.split(/\s+/).filter(Boolean);
  const editing = trailingSpace ? '' : tokens[tokens.length - 1] || '';
  const isFirstWord = tokens.length === 0 || (tokens.length === 1 && !trailingSpace);

  let options = [];
  let replaceFrom = editing;

  if (isFirstWord) {
    options = [...Object.keys(shell.commands), ...Object.keys(shell.aliases)]
      .filter((n) => n.startsWith(editing))
      .sort();
  } else {
    // Complete a path.
    const slash = editing.lastIndexOf('/');
    const dirPart = slash === -1 ? '' : editing.slice(0, slash + 1);
    const namePart = slash === -1 ? editing : editing.slice(slash + 1);
    const searchDir = resolvePath(shell.cwd, dirPart || '.', shell.env.HOME);
    const entries = shell.fs.list(searchDir) || [];
    options = entries
      .filter((n) => n.startsWith(namePart))
      .filter((n) => !n.startsWith('.') || namePart.startsWith('.'))
      .map((n) => dirPart + n + (shell.fs.isDir(resolvePath(searchDir, n, shell.env.HOME)) ? '/' : ''))
      .sort();
    replaceFrom = editing;
  }

  if (!options.length) return { input, options: [] };

  if (options.length === 1) {
    const completed = options[0];
    const base = trailingSpace ? input : input.slice(0, input.length - replaceFrom.length);
    const suffix = completed.endsWith('/') ? '' : ' ';
    return { input: base + completed + suffix, options: [] };
  }

  // Extend to the longest shared prefix, then show the choices.
  let prefix = options[0];
  for (const o of options) {
    while (!o.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const base = trailingSpace ? input : input.slice(0, input.length - replaceFrom.length);
  return { input: prefix.length > replaceFrom.length ? base + prefix : input, options };
}
