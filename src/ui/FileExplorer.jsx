import React, { useState, useMemo, useEffect } from 'react';
import { joinPath, dirname, modeString, sizeOf, humanSize } from '../fs/filesystem.js';

// A read-only view of the virtual filesystem. Deliberately has no "New folder"
// button: the whole point of the course is that structure gets built with
// mkdir and touch. This panel only ever reflects what the terminal did.

export default function FileExplorer({ shell, tick, onInsertCommand }) {
  const [expanded, setExpanded] = useState(() => new Set(['/', '/home', '/home/student']));
  const [preview, setPreview] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const cwd = shell.cwd;

  // Always keep the path down to the current directory open, so the tree
  // follows the learner as they cd around.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let p = cwd;
      while (p && p !== '/') {
        next.add(p);
        p = dirname(p);
      }
      next.add('/');
      return next;
    });
  }, [cwd]);

  // Recompute whenever a command has run.
  const root = useMemo(() => shell.fs.get('/'), [shell, tick]);

  const toggle = (path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openFile = (path) => {
    const node = shell.fs.get(path);
    if (!node) return;
    setPreview({ path, node });
  };

  const shortPath = (p) => (p.startsWith(shell.env.HOME) ? '~' + p.slice(shell.env.HOME.length) : p);

  if (collapsed) {
    return (
      <div className="explorer collapsed">
        <button className="explorer-toggle" onClick={() => setCollapsed(false)} title="Show the file tree">
          <span className="ex-icon">▤</span>
          <span className="ex-vert">FILES</span>
        </button>
      </div>
    );
  }

  return (
    <div className="explorer">
      <div className="explorer-head">
        <span className="explorer-title">Files</span>
        <button className="explorer-hide" onClick={() => setCollapsed(true)} title="Hide the file tree">
          ×
        </button>
      </div>

      <div className="explorer-tree">
        <Node
          path="/"
          name="/"
          node={root}
          depth={0}
          shell={shell}
          expanded={expanded}
          toggle={toggle}
          openFile={openFile}
          cwd={cwd}
          onInsertCommand={onInsertCommand}
          shortPath={shortPath}
          tick={tick}
        />
      </div>

      <div className="explorer-note">
        Read-only on purpose. Build folders with <code>mkdir</code>, files with <code>touch</code>.
      </div>

      {preview && (
        <FilePreview
          path={preview.path}
          node={preview.node}
          shortPath={shortPath}
          onClose={() => setPreview(null)}
          onInsertCommand={onInsertCommand}
        />
      )}
    </div>
  );
}

function Node({
  path,
  name,
  node,
  depth,
  shell,
  expanded,
  toggle,
  openFile,
  cwd,
  onInsertCommand,
  shortPath,
  tick
}) {
  if (!node) return null;
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(path);
  const isCwd = path === cwd;
  const hidden = name.startsWith('.') && name !== '/';
  const executable = !isDir && (node.mode & 0o111) !== 0;

  const children = isDir && isOpen ? shell.fs.list(path) || [] : [];

  return (
    <div className="ex-node">
      <div
        className={
          'ex-row' +
          (isCwd ? ' is-cwd' : '') +
          (hidden ? ' is-hidden' : '') +
          (isDir ? ' is-dir' : ' is-file')
        }
        style={{ paddingLeft: 6 + depth * 13 }}
      >
        <button
          className="ex-label"
          onClick={() => (isDir ? toggle(path) : openFile(path))}
          title={isDir ? path : `${path} — ${modeString(node)} ${sizeOf(node)} bytes`}
        >
          <span className="ex-caret">{isDir ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="ex-glyph">{isDir ? (isOpen ? '📂' : '📁') : executable ? '⚙' : '📄'}</span>
          <span className="ex-name">{name}</span>
          {isCwd && <span className="ex-here">you are here</span>}
        </button>

        {isDir && !isCwd && (
          <button
            className="ex-cd"
            title={`Put "cd ${shortPath(path)}" in the terminal`}
            onClick={() => onInsertCommand(`cd ${shortPath(path)}`)}
          >
            cd
          </button>
        )}
      </div>

      {isOpen &&
        children.map((child) => (
          <Node
            key={child}
            path={joinPath(path, child)}
            name={child}
            node={shell.fs.get(joinPath(path, child))}
            depth={depth + 1}
            shell={shell}
            expanded={expanded}
            toggle={toggle}
            openFile={openFile}
            cwd={cwd}
            onInsertCommand={onInsertCommand}
            shortPath={shortPath}
            tick={tick}
          />
        ))}
    </div>
  );
}

function FilePreview({ path, node, shortPath, onClose, onInsertCommand }) {
  const lines = node.content ? node.content.split('\n') : [];
  const shown = lines.slice(0, 200);
  const truncated = lines.length > shown.length;

  return (
    <div className="ex-preview" role="dialog" aria-label={`Preview of ${path}`}>
      <div className="ex-preview-head">
        <div>
          <div className="ex-preview-name">{path.slice(path.lastIndexOf('/') + 1)}</div>
          <div className="ex-preview-meta">
            {modeString(node)} · {humanSize(sizeOf(node))} · {lines.length - (node.content.endsWith('\n') ? 1 : 0)} lines
          </div>
        </div>
        <button className="ex-preview-close" onClick={onClose}>
          ×
        </button>
      </div>

      <pre className="ex-preview-body">{node.content || '(empty file)'}</pre>

      {truncated && <div className="ex-preview-more">Showing the first 200 lines.</div>}

      <div className="ex-preview-foot">
        <span>Read it properly in the terminal:</span>
        <button onClick={() => onInsertCommand(`cat ${shortPath(path)}`)}>cat</button>
        <button onClick={() => onInsertCommand(`less ${shortPath(path)}`)}>less</button>
        <button onClick={() => onInsertCommand(`wc -l ${shortPath(path)}`)}>wc -l</button>
      </div>
    </div>
  );
}
