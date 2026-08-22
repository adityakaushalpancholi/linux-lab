// Tokenizer + parser for the subset of bash grammar this course needs:
// quotes, escapes, pipes, redirection, heredocs, chaining and background jobs.

const OPERATOR_CHARS = /[|&;<>]/;

export class ParseError extends Error {
  constructor(message, { unterminated = null } = {}) {
    super(message);
    this.unterminated = unterminated;
  }
}

export function tokenize(line) {
  const tokens = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) break; // comment

    if (ch === '|') {
      tokens.push({ t: 'op', v: line[i + 1] === '|' ? '||' : '|' });
      i += line[i + 1] === '|' ? 2 : 1;
      continue;
    }
    if (ch === '&') {
      tokens.push({ t: 'op', v: line[i + 1] === '&' ? '&&' : '&' });
      i += line[i + 1] === '&' ? 2 : 1;
      continue;
    }
    if (ch === ';') {
      tokens.push({ t: 'op', v: ';' });
      i++;
      continue;
    }
    if (ch === '>') {
      tokens.push({ t: 'op', v: line[i + 1] === '>' ? '>>' : '>' });
      i += line[i + 1] === '>' ? 2 : 1;
      continue;
    }
    if (ch === '<') {
      tokens.push({ t: 'op', v: line[i + 1] === '<' ? '<<' : '<' });
      i += line[i + 1] === '<' ? 2 : 1;
      continue;
    }

    // A word, possibly containing quoted runs.
    let word = '';
    let hadQuotes = false;
    let hadSingleQuotes = false;
    while (i < line.length && !/\s/.test(line[i]) && !OPERATOR_CHARS.test(line[i])) {
      const c = line[i];
      if (c === "'") {
        hadQuotes = true;
        hadSingleQuotes = true;
        i++;
        const close = line.indexOf("'", i);
        if (close === -1) throw new ParseError('unterminated single quote', { unterminated: "'" });
        word += line.slice(i, close);
        i = close + 1;
        continue;
      }
      if (c === '"') {
        hadQuotes = true;
        i++;
        let buf = '';
        let closed = false;
        while (i < line.length) {
          if (line[i] === '\\' && i + 1 < line.length && '"\\$'.includes(line[i + 1])) {
            buf += line[i + 1];
            i += 2;
            continue;
          }
          if (line[i] === '"') {
            closed = true;
            i++;
            break;
          }
          buf += line[i++];
        }
        if (!closed) throw new ParseError('unterminated double quote', { unterminated: '"' });
        word += buf;
        continue;
      }
      if (c === '\\' && i + 1 < line.length) {
        hadQuotes = true;
        word += line[i + 1];
        i += 2;
        continue;
      }
      word += c;
      i++;
    }
    tokens.push({ t: 'word', v: word, quoted: hadQuotes, single: hadSingleQuotes });
  }

  return tokens;
}

// tokens -> [{ pipeline: [command], op, background }]
// command = { argv: [], redirects: [], heredoc: null }
export function parse(tokens) {
  const groups = [];
  let pipeline = [];
  let current = { argv: [], redirects: [], heredoc: null };
  let pendingOp = ';';

  const flushCommand = () => {
    if (current.argv.length || current.redirects.length) pipeline.push(current);
    current = { argv: [], redirects: [], heredoc: null };
  };

  const flushGroup = (op, background) => {
    flushCommand();
    if (pipeline.length) groups.push({ pipeline, op: pendingOp, background });
    pipeline = [];
    pendingOp = op;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.t === 'word') {
      current.argv.push(tok);
      continue;
    }

    switch (tok.v) {
      case '|':
        flushCommand();
        break;
      case ';':
        flushGroup(';', false);
        break;
      case '&&':
        flushGroup('&&', false);
        break;
      case '||':
        flushGroup('||', false);
        break;
      case '&':
        flushGroup(';', true);
        if (groups.length) groups[groups.length - 1].background = true;
        break;
      case '>':
      case '>>':
      case '<':
      case '<<': {
        const target = tokens[i + 1];
        if (!target || target.t !== 'word') {
          throw new ParseError('syntax error near unexpected token `newline\'');
        }
        if (tok.v === '<<') {
          current.heredoc = { delimiter: target.v, quoted: target.quoted, body: null };
        } else {
          current.redirects.push({ type: tok.v, target: target.v });
        }
        i++;
        break;
      }
      default:
        break;
    }
  }

  flushGroup(';', false);
  return groups;
}

export function parseLine(line) {
  return parse(tokenize(line));
}

// Does this parsed line open a heredoc that still needs its body?
export function pendingHeredoc(groups) {
  for (const g of groups) {
    for (const cmd of g.pipeline) {
      if (cmd.heredoc && cmd.heredoc.body === null) return cmd.heredoc;
    }
  }
  return null;
}
