# Linux Lab

A Linux terminal that lives in the browser, wrapped in eight guided missions.
The shell and filesystem are written in JavaScript and run entirely on the
learner's machine, so nothing they type can damage anything — but accounts and
progress are real, stored in Postgres, and follow them to any device.

**Live:** https://linux-lab-gold.vercel.app

Covers Kalvium Module 1: workstation setup through the graduation challenge.

---

## What it does

### A shell that behaves like a shell

Pipes, redirection (`>`, `>>`, `<`), chaining (`;`, `&&`, `||`), background
jobs (`&`), heredocs, globs (`*`, `?`, `[abc]`), quoting, variables and aliases.
Around 45 commands, including interactive `less` (with `/search`, `n`, `q`),
`nano`, `top`, and `tail -f` that streams new lines live.

### Autocorrect that explains

When a command is wrong it says why and offers the fix:

| You type | It says |
| --- | --- |
| `pdw` | command not found — did you mean `pwd`? |
| `dir` | `dir` is a Windows command. Here it is `ls`. |
| `cd..` | `cd..` is missing a space. |
| `cd downloads` | does not exist, but `Downloads` does — Linux is case sensitive. |
| `cd Downlods` | did you mean `Downloads`? Tab completion would have caught this. |
| `ls -z` | `-z` is not an option — did you mean `-a`? |
| `rm Documents` | that is a directory. Removing it needs `-r`. |
| `cd .bashrc` | that is a file, not a folder. Use `cat`. |

Typo matching is Damerau-Levenshtein, so transpositions — the mistake fingers
actually make — count as one edit rather than two.

Two modes, toggled in the header:

- **Suggest** (default) — runs what you typed, shows the real error, then offers
  the fix as a button. The learner stays in control.
- **Auto-fix** — runs the corrected command and shows what changed.

### Eight missions that check themselves

Tasks tick by inspecting both the command history *and* the resulting
filesystem, so `backend/controllers` only counts when those folders exist. It
does not matter how the learner got there, which means fifty people produce
fifty genuinely different reports.

### A file explorer with no create button

A live, read-only tree beside the terminal. Run `mkdir docs` and the folder
appears. The current directory is highlighted, files preview with their
permissions and line count. There is deliberately no way to create anything
through the interface — structure is built with `mkdir` and `touch`, which is
the entire point.

### Accounts and progress

Sign in with a phone number and password. Progress syncs to Postgres, debounced,
with a visible saving indicator, and falls back to local-only if the server is
unreachable. Sign in on another laptop and the filesystem, tasks, quiz answers
and reflections are all there.

### The rest

- **15 achievements**, derived from progress so they cannot disagree with it
- **PDF export** — tasks, command transcripts, quiz results, reflections, and a
  full appendix log
- **A pre-built world**: `ProjectAtlas/`, a treasure hunt, a 46-line server log
  seeded with exactly 11 errors (two of them payment failures), a search lab
  with `JWT_SECRET` and `TODO`s, and a local Bandit ground mirroring
  OverTheWire levels 0–5
- **Safety rails that teach** — `rm -rf /` and `kill 1` are refused with an
  explanation of what would have happened on a real machine

---

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Vite does not serve the `/api` routes, so the app
runs in guest mode locally unless you use `vercel dev`.

## Tests

```bash
npm test
```

168 assertions: 130 covering the shell, lesson workflows, challenges and every
autocorrect category, and 38 covering phone normalisation, password hashing,
sessions and cookie flags. Run it after touching anything under `src/shell/` or
`api/`.

---

## Setting up accounts

The app works without any of this — it just stays in guest mode and tells
visitors so. These steps switch accounts on.

**1. Create the database.** A new project at [supabase.com](https://supabase.com).
Free tier is enough.

**2. Create the tables.** Supabase → SQL Editor → paste all of
[`supabase/schema.sql`](supabase/schema.sql) → Run. Safe to run more than once.

**3. Collect three values.**

| Variable | Where |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, the `service_role` key |
| `JWT_SECRET` | generate one, see below |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> The `service_role` key bypasses every database rule. It belongs in Vercel's
> environment variables and nowhere else — never in `src/`, never committed.
> `.env` files are gitignored for this reason.

**4. Add them to Vercel.** Project → Settings → Environment Variables, ticking
all three environments. Redeploy. The "accounts are not switched on" notice
disappears by itself.

### Running a class

`supabase/schema.sql` creates a `class_progress` view. Supabase → Table Editor →
`class_progress` shows every learner's name, percent complete and last-active,
sorted by progress. No SQL required.

**Password resets:** there is no SMS or email, so resets are manual by design.
Table Editor → `users` → find the person → set `reset_pending` to `true`. The
next password they type when signing in becomes their new one.

---

## Deploying

```bash
npx vercel --prod
```

`vercel.json` is already configured. Connecting the GitHub repo in the Vercel
dashboard makes every push deploy automatically.

---

## Project layout

```
api/                     serverless functions
├── _lib/core.js         database client, sessions, hashing, validation
├── signup.js  login.js  logout.js  me.js  progress.js
src/
├── fs/
│   ├── filesystem.js    virtual filesystem: nodes, paths, permissions
│   └── seed.js          the starting disk image
├── shell/
│   ├── parser.js        tokenizer + grammar (quotes, pipes, redirects)
│   ├── glob.js          wildcard expansion
│   ├── shell.js         executor: pipelines, chaining, jobs, history
│   ├── autocorrect.js   typo detection, suggestions, tab completion
│   └── commands/        the command implementations
├── lessons/lessons.js   all eight missions and their task checks
├── ui/
│   ├── Terminal.jsx     terminal, plus less/nano/top/tail -f modes
│   ├── LessonPane.jsx   lesson rendering, tasks, quizzes
│   ├── FileExplorer.jsx read-only filesystem tree
│   ├── AuthScreen.jsx   landing page and sign in
│   └── AchievementsPanel.jsx
├── state/               progress, achievements, API client
├── report/pdf.js        PDF generation (jsPDF, lazy-loaded)
└── styles*.css          base, auth, polish
supabase/schema.sql      tables, class view, row level security
```

## Adding a lesson

Add an object to the array at the bottom of `src/lessons/lessons.js`. Sections
use `kind: 'text' | 'commands' | 'callout' | 'table' | 'tree' | 'cards' |
'compare' | 'challenge'`. Task `check` functions receive
`{ commands, fs, shell, cwd, aliases }`, and helpers (`ran`, `exists`, `isDir`,
`isFile`, `all`, `any`) sit at the top of the file.

## A note on the terminal

This is a simulator, not a kernel. It is accurate for everything in Module 1 and
deliberately forgiving where precision would only confuse a beginner —
foreground `sleep` returns instantly so the page never freezes, and `chown`
works here even though Git Bash cannot really do it. Once the habits are built,
install Git Bash, WSL2 or Ubuntu and the same commands carry over.

There is a signature hidden in this project. You already have the tools to find
it.
