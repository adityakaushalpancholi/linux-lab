# Linux Lab

A browser-based Linux terminal for learning the command line. Everything runs
client-side — a virtual Unix filesystem and shell written in JavaScript — so
there is no server, no database, no login, and nothing a learner types can
damage their real machine.

Built to cover Kalvium Module 1: workstation setup through the graduation
challenge.

## What it does

**A real-feeling shell.** Pipes, redirection (`>`, `>>`, `<`), chaining
(`;`, `&&`, `||`), background jobs (`&`), heredocs, globs (`*`, `?`, `[abc]`),
quoting, variables and aliases all work. So do `less` (with `/search`, `n`, `q`),
`nano`, `top`, and `tail -f` streaming live lines.

**Autocorrect that teaches.** When a command is wrong it explains why and offers
a fix:

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

Two modes, toggled in the header:

- **Suggest** (default) — runs what you typed, shows the real error, then offers
  the fix as a button. You stay in control.
- **Auto-fix** — runs the corrected command and shows what it changed.

**Eight missions** with reading, clickable commands, auto-checked tasks and
quizzes. Tasks tick themselves by watching both the commands you ran *and* the
resulting filesystem, so building `backend/controllers` only counts when those
folders actually exist.

**A pre-built world** to explore: `ProjectAtlas/`, a `TreasureHunt/`, a 46-line
`atlas-server.log` seeded with exactly 11 errors (two of them payment failures),
a search lab with `JWT_SECRET` and `TODO`s scattered through it, and a local
Bandit training ground mirroring OverTheWire levels 0–5.

**Safety rails that teach instead of scold.** `rm -rf /` and `kill 1` are
refused with an explanation of what would have happened on a real machine.

**PDF export.** One file with your name, per-mission task checklists, command
transcripts, quiz results, reflections, and a full appendix log — which is what
the assignments ask you to submit.

Progress saves to `localStorage`, so closing the tab costs nothing.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

## Deploy to Vercel

The repo is already configured (`vercel.json`). Either route works:

**From the dashboard** — push this folder to a GitHub repo, then at
[vercel.com/new](https://vercel.com/new) import it. Vercel detects Vite; leave
the defaults (build `npm run build`, output `dist`) and deploy. Every later push
redeploys automatically.

**From the terminal:**

```bash
npx vercel --prod
```

Answer the prompts once and it links the project. There are no environment
variables or secrets to configure.

The build output is plain static files, so Netlify, Cloudflare Pages and GitHub
Pages work equally well if you change your mind.

## Project layout

```
src/
├── fs/
│   ├── filesystem.js    virtual filesystem: nodes, paths, permissions
│   └── seed.js          the starting disk image
├── shell/
│   ├── parser.js        tokenizer + grammar (quotes, pipes, redirects)
│   ├── glob.js          wildcard expansion
│   ├── shell.js         executor: pipelines, chaining, jobs, history
│   ├── autocorrect.js   typo detection, suggestions, tab completion
│   └── commands/        ~45 command implementations
├── lessons/lessons.js   all eight missions and their task checks
├── ui/
│   ├── Terminal.jsx     the terminal, plus less/nano/top/tail -f modes
│   └── LessonPane.jsx   lesson rendering, tasks, quizzes
├── report/pdf.js        PDF generation (jsPDF, lazy-loaded)
└── state/progress.js    localStorage persistence
```

## Tests

```bash
node scripts/smoke.mjs
```

130 assertions covering every command, the lesson workflows, the challenges and
each autocorrect category. Run it after touching anything in `src/shell/`.

## Adding a lesson

Add an object to the array at the bottom of `src/lessons/lessons.js`. Sections
use `kind: 'text' | 'commands' | 'callout' | 'table' | 'tree' | 'cards' |
'compare' | 'challenge'`. Task `check` functions receive
`{ commands, fs, shell, cwd, aliases }` and there are helpers (`ran`, `exists`,
`isDir`, `isFile`, `all`, `any`) at the top of the file.

## A note on the terminal

This is a simulator, not a Linux kernel. It is accurate for everything in
Module 1 and deliberately forgiving where being exact would only confuse a
beginner (foreground `sleep` returns instantly so the page never freezes;
`chown` works here even though Git Bash cannot really do it). Once the habits
are built, install Git Bash, WSL2 or Ubuntu and the same commands carry over.
