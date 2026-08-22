// Virtual Unix filesystem. Plain-object nodes so the whole disk can be
// serialised straight into localStorage with JSON.stringify.

export const DIR = 'dir';
export const FILE = 'file';

let inodeCounter = 1;

export function makeDir(mode = 0o755, owner = 'student', group = 'student') {
  return {
    type: DIR,
    mode,
    owner,
    group,
    mtime: Date.now(),
    inode: inodeCounter++,
    children: {}
  };
}

export function makeFile(content = '', mode = 0o644, owner = 'student', group = 'student') {
  return {
    type: FILE,
    mode,
    owner,
    group,
    mtime: Date.now(),
    inode: inodeCounter++,
    content
  };
}

/* ---------------------------------------------------------------- paths --- */

// Split a path into clean segments, resolving . and .. textually.
export function normalize(path) {
  const absolute = path.startsWith('/');
  const out = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length) out.pop();
      continue;
    }
    out.push(part);
  }
  return (absolute ? '/' : '') + out.join('/');
}

// Turn whatever the user typed into an absolute path.
export function resolvePath(cwd, input, home = '/home/student') {
  if (!input || input === '') return cwd;
  let p = input;
  if (p === '~') p = home;
  else if (p.startsWith('~/')) p = home + p.slice(1);
  if (!p.startsWith('/')) p = cwd + (cwd.endsWith('/') ? '' : '/') + p;
  const norm = normalize(p);
  return norm === '' ? '/' : norm;
}

export function dirname(path) {
  const n = normalize(path);
  if (n === '/') return '/';
  const i = n.lastIndexOf('/');
  return i <= 0 ? '/' : n.slice(0, i);
}

export function basename(path) {
  const n = normalize(path);
  if (n === '/') return '/';
  return n.slice(n.lastIndexOf('/') + 1);
}

export function joinPath(a, b) {
  return normalize(a + '/' + b);
}

/* ------------------------------------------------------------ traversal --- */

export class FileSystem {
  constructor(root) {
    this.root = root || makeDir(0o755, 'root', 'root');
  }

  // Returns the node at an absolute path, or null.
  get(path) {
    const n = normalize(path);
    if (n === '/') return this.root;
    let node = this.root;
    for (const part of n.split('/').slice(1)) {
      if (!node || node.type !== DIR) return null;
      node = node.children[part];
      if (!node) return null;
    }
    return node || null;
  }

  exists(path) {
    return this.get(path) !== null;
  }

  isDir(path) {
    const n = this.get(path);
    return !!n && n.type === DIR;
  }

  isFile(path) {
    const n = this.get(path);
    return !!n && n.type === FILE;
  }

  // Parent directory node of a path, or null if the parent chain is broken.
  parent(path) {
    return this.get(dirname(path));
  }

  list(path) {
    const n = this.get(path);
    if (!n || n.type !== DIR) return null;
    return Object.keys(n.children).sort((a, b) =>
      a.replace(/^\./, '').localeCompare(b.replace(/^\./, ''), undefined, { sensitivity: 'base' })
    );
  }

  mkdir(path, { parents = false, mode = 0o755, owner = 'student' } = {}) {
    const n = normalize(path);
    if (n === '/') return { error: 'cannot create directory: File exists' };
    const segments = n.split('/').slice(1);
    let node = this.root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const last = i === segments.length - 1;
      const child = node.children[seg];
      if (child) {
        if (last && !parents) return { error: `cannot create directory '${path}': File exists` };
        if (child.type !== DIR) return { error: `cannot create directory '${path}': Not a directory` };
        node = child;
        continue;
      }
      if (!last && !parents) {
        return { error: `cannot create directory '${path}': No such file or directory` };
      }
      const fresh = makeDir(mode, owner, owner);
      node.children[seg] = fresh;
      node.mtime = Date.now();
      node = fresh;
    }
    return { ok: true };
  }

  writeFile(path, content, { mode = 0o644, owner = 'student' } = {}) {
    const parent = this.parent(path);
    if (!parent) return { error: `cannot create '${path}': No such file or directory` };
    if (parent.type !== DIR) return { error: `cannot create '${path}': Not a directory` };
    const name = basename(path);
    const existing = parent.children[name];
    if (existing && existing.type === DIR) {
      return { error: `cannot write '${path}': Is a directory` };
    }
    if (existing) {
      existing.content = content;
      existing.mtime = Date.now();
    } else {
      parent.children[name] = makeFile(content, mode, owner, owner);
      parent.mtime = Date.now();
    }
    return { ok: true };
  }

  appendFile(path, content) {
    const node = this.get(path);
    if (node && node.type === FILE) {
      node.content += content;
      node.mtime = Date.now();
      return { ok: true };
    }
    return this.writeFile(path, content);
  }

  touch(path) {
    const node = this.get(path);
    if (node) {
      node.mtime = Date.now();
      return { ok: true };
    }
    return this.writeFile(path, '');
  }

  remove(path, { recursive = false } = {}) {
    const n = normalize(path);
    if (n === '/') return { error: 'refusing to remove /' };
    const node = this.get(n);
    if (!node) return { error: `cannot remove '${path}': No such file or directory` };
    if (node.type === DIR && !recursive) {
      return { error: `cannot remove '${path}': Is a directory` };
    }
    const parent = this.parent(n);
    delete parent.children[basename(n)];
    parent.mtime = Date.now();
    return { ok: true };
  }

  // Deep clone, used by cp -r.
  clone(node) {
    const copy = { ...node, inode: inodeCounter++, mtime: Date.now() };
    if (node.type === DIR) {
      copy.children = {};
      for (const [k, v] of Object.entries(node.children)) copy.children[k] = this.clone(v);
    }
    return copy;
  }

  copy(src, dest, { recursive = false } = {}) {
    const node = this.get(src);
    if (!node) return { error: `cannot stat '${src}': No such file or directory` };
    if (node.type === DIR && !recursive) return { error: `-r not specified; omitting directory '${src}'` };

    let target = normalize(dest);
    if (this.isDir(target)) target = joinPath(target, basename(src));
    if (normalize(src) === target) return { error: `'${src}' and '${dest}' are the same file` };

    const parent = this.parent(target);
    if (!parent || parent.type !== DIR) {
      return { error: `cannot create '${dest}': No such file or directory` };
    }
    parent.children[basename(target)] = this.clone(node);
    parent.mtime = Date.now();
    return { ok: true };
  }

  move(src, dest) {
    const node = this.get(src);
    if (!node) return { error: `cannot stat '${src}': No such file or directory` };

    let target = normalize(dest);
    if (this.isDir(target)) target = joinPath(target, basename(src));
    if (normalize(src) === target) return { ok: true };
    if (target.startsWith(normalize(src) + '/')) {
      return { error: `cannot move '${src}' into itself` };
    }

    const destParent = this.parent(target);
    if (!destParent || destParent.type !== DIR) {
      return { error: `cannot move to '${dest}': No such file or directory` };
    }
    const srcParent = this.parent(src);
    delete srcParent.children[basename(src)];
    destParent.children[basename(target)] = node;
    node.mtime = Date.now();
    srcParent.mtime = Date.now();
    destParent.mtime = Date.now();
    return { ok: true };
  }

  // Walk every path under a root. Used by find, grep -r, tree and ls -R.
  walk(start, fn, depth = 0) {
    const node = this.get(start);
    if (!node) return;
    fn(normalize(start), node, depth);
    if (node.type === DIR) {
      for (const name of this.list(start)) {
        this.walk(joinPath(start, name), fn, depth + 1);
      }
    }
  }

  toJSON() {
    return this.root;
  }
}

/* -------------------------------------------------------------- display --- */

export function modeString(node) {
  const t = node.type === DIR ? 'd' : '-';
  const bits = node.mode;
  const rwx = (n) => (n & 4 ? 'r' : '-') + (n & 2 ? 'w' : '-') + (n & 1 ? 'x' : '-');
  return t + rwx((bits >> 6) & 7) + rwx((bits >> 3) & 7) + rwx(bits & 7);
}

export function sizeOf(node) {
  return node.type === DIR ? 4096 : node.content.length;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function timeString(mtime) {
  const d = new Date(mtime);
  const pad = (n) => String(n).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function humanSize(bytes) {
  if (bytes < 1024) return String(bytes);
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(/\.0$/, '') + 'K';
  return (bytes / 1048576).toFixed(1).replace(/\.0$/, '') + 'M';
}
