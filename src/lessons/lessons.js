// Course content. Eight missions, each with reading, runnable commands,
// auto-checked tasks and a quiz.
//
// A task `check` receives a snapshot: { commands, fs, shell, cwd, aliases }.
// Checks are re-run after every command and are sticky: once a task passes it
// stays passed, so the PDF report reflects everything the learner achieved.

/* --------------------------------------------------------------- checks --- */

const ran = (re) => (s) => s.commands.some((c) => re.test(c));
const ranAll = (...res) => (s) => res.every((re) => s.commands.some((c) => re.test(c)));
const exists = (p) => (s) => s.fs.exists(p);
const isDir = (p) => (s) => s.fs.isDir(p);
const isFile = (p) => (s) => s.fs.isFile(p);
const all = (...fns) => (s) => fns.every((f) => f(s));
const any = (...fns) => (s) => fns.some((f) => f(s));
const fileHas = (p, needle) => (s) => {
  const n = s.fs.get(p);
  return !!n && n.type === 'file' && n.content.includes(needle);
};
const modeHasExec = (p) => (s) => {
  const n = s.fs.get(p);
  return !!n && (n.mode & 0o100) !== 0;
};
const aliasSet = (name) => (s) => Object.prototype.hasOwnProperty.call(s.aliases, name);

const HOME = '/home/student';

/* ---------------------------------------------------------------- 1 setup --- */

const setup = {
  id: 'setup',
  number: 1,
  title: 'Build Your Developer Workstation',
  subtitle: 'Prove your terminal works before you write a line of code.',
  minutes: 25,
  hero:
    'Think of a film crew before a shoot. Nobody begins with the final scene. First they check the camera, ' +
    'lights, microphone, batteries and storage. If the equipment is not ready, the best script still fails. ' +
    'Your terminal is the engineering version of that equipment check.',
  sections: [
    {
      kind: 'text',
      title: 'Why this matters',
      body: [
        'In school, a computer means a browser, a document editor and a few apps. In software engineering your computer becomes a workstation: terminal, editor, documentation, browser, GitHub and project folders all working together.',
        'From the next mission onward, every instruction assumes you have a working Linux-like terminal. This mission is about proving that you do.'
      ]
    },
    {
      kind: 'cards',
      title: 'Three setup paths on a real laptop',
      note: 'The terminal on the right simulates Linux, so you can learn today. Install one of these on your own machine to keep the habit.',
      cards: [
        {
          name: 'Git Bash',
          tags: ['low-end laptops', 'fast setup'],
          use: 'You want a lightweight terminal on Windows that supports most Linux-style commands.',
          tradeoff: 'Not a full Linux system, so a few advanced commands behave differently.',
          link: 'https://gitforwindows.org/'
        },
        {
          name: 'WSL2',
          tags: ['Windows 10/11', 'real Linux'],
          use: 'Your Windows laptop supports WSL2 and you want a real Linux kernel inside Windows.',
          tradeoff: 'Setup may need Windows features, updates and a restart.',
          link: 'https://learn.microsoft.com/en-us/windows/wsl/install'
        },
        {
          name: 'Ubuntu in VirtualBox',
          tags: ['optional', 'full separate OS'],
          use: 'You want a complete Ubuntu desktop and have the RAM and storage for it.',
          tradeoff: 'Heavier. Low-end laptops will feel slow.',
          link: 'https://ubuntu.com/tutorials/how-to-run-ubuntu-desktop-on-a-virtual-machine-using-virtualbox'
        }
      ]
    },
    {
      kind: 'callout',
      tone: 'rule',
      title: 'Do not fight over tools',
      body: 'Git Bash, WSL2 and Ubuntu VM are all valid if they let you run the verification commands. The goal is a working terminal habit, not tool loyalty.'
    },
    {
      kind: 'commands',
      title: 'Core verification',
      note: 'Click any command to drop it into the terminal. Exact output differs by device, and that is normal.',
      items: [
        { cmd: 'whoami', note: 'shows which user you are' },
        { cmd: 'pwd', note: 'shows the folder you are standing in' },
        { cmd: 'uname -a', note: 'shows kernel and machine information' },
        { cmd: 'echo "Hello Kalvium"', note: 'proves the shell can print text' }
      ]
    },
    {
      kind: 'commands',
      title: 'Navigation check',
      note: 'Read it as a small journey: where am I, one level up, confirm, back home, confirm.',
      items: [
        { cmd: 'pwd', note: 'where you started' },
        { cmd: 'cd ..', note: 'move one folder up' },
        { cmd: 'pwd', note: 'confirm the new location' },
        { cmd: 'cd ~', note: 'return to your home folder' },
        { cmd: 'pwd', note: 'confirm you are back home' }
      ]
    },
    {
      kind: 'tree',
      title: 'First look at the Linux file system',
      note: 'Everything lives under the root folder, written as a single slash.',
      body: ['/', '├── home', '├── etc', '├── usr', '├── var', '└── tmp'].join('\n')
    },
    {
      kind: 'table',
      title: 'What each top-level folder is for',
      head: ['Folder', 'Purpose'],
      rows: [
        ['/home', 'Personal files and user folders'],
        ['/etc', 'System and application configuration'],
        ['/usr', 'Installed software and shared resources'],
        ['/var', 'Logs and changing application data'],
        ['/tmp', 'Temporary files that do not need to last']
      ]
    },
    {
      kind: 'commands',
      title: 'Explore the root',
      items: [
        { cmd: 'cd /', note: 'go to the very top' },
        { cmd: 'ls', note: 'see the top-level folders' },
        { cmd: 'tree -L 1 /', note: 'the same thing drawn as a tree' }
      ]
    },
    {
      kind: 'commands',
      title: 'Final readiness proof',
      note: 'The last line is your signal that the workstation milestone is complete.',
      items: [
        { cmd: 'echo "My workstation is ready"' },
        { cmd: 'date' },
        { cmd: 'clear' },
        { cmd: 'echo "Linux Environment Successfully Configured"' }
      ]
    },
    {
      kind: 'callout',
      tone: 'tip',
      title: 'Using AI when setup breaks',
      body: 'Installation issues are normal. Ask AI as a troubleshooting partner, not a replacement for understanding: "Git Bash is installed on Windows but will not open. Help me troubleshoot step by step. Ask me for details before suggesting risky changes." In your report, note the prompt you used, what it suggested and whether it worked. If you did not use AI, write "Not used".'
    }
  ],
  tasks: [
    {
      id: 'identity',
      title: 'Run the identity commands: whoami and pwd',
      hint: 'Type whoami, press Enter, then pwd.',
      check: ranAll(/^\s*whoami\b/, /^\s*pwd\b/)
    },
    {
      id: 'system',
      title: 'Prove the shell can report the system and print text',
      hint: 'uname -a and then echo "Hello Kalvium"',
      check: ranAll(/^\s*uname\s+-a\b/, /^\s*echo\s+.*Hello Kalvium/i)
    },
    {
      id: 'navigate',
      title: 'Move up a level and return home',
      hint: 'cd .. then pwd then cd ~ then pwd',
      check: ranAll(/^\s*cd\s+\.\.\s*$/, /^\s*cd\s+~\s*$/)
    },
    {
      id: 'root',
      title: 'Visit the root folder and list what is there',
      hint: 'cd / then ls',
      check: all(ran(/^\s*cd\s+\/\s*$/), ran(/^\s*(ls|tree)\b/))
    },
    {
      id: 'ready',
      title: 'Print the final readiness message',
      hint: 'echo "Linux Environment Successfully Configured"',
      check: ran(/echo\s+.*Linux Environment Successfully Configured/i)
    }
  ],
  quiz: [
    {
      q: 'Which command answers the question "which user am I right now?"',
      options: ['pwd', 'whoami', 'uname -a', 'echo'],
      answer: 1,
      explain: 'whoami prints the current username. pwd prints the folder, uname describes the system.'
    },
    {
      q: 'Your uname -a output looks different from your friend\'s. What does that mean?',
      options: [
        'Your setup is broken',
        'You must reinstall Linux',
        'Nothing is wrong. Different kernels and machines report different details',
        'You typed the command incorrectly'
      ],
      answer: 2,
      explain: 'uname reports the actual kernel and hardware. Git Bash, WSL2 and a VM all legitimately differ.'
    },
    {
      q: 'What does cd ~ do?',
      options: [
        'Moves one folder up',
        'Moves to the root of the filesystem',
        'Returns you to your home folder',
        'Deletes the current folder'
      ],
      answer: 2,
      explain: 'The tilde is shorthand for your home directory, /home/student here.'
    }
  ]
};

/* ------------------------------------------------------------ 2 navigate --- */

const navigate = {
  id: 'navigate',
  number: 2,
  title: 'Navigating the Filesystem',
  subtitle: 'pwd, ls, cd and tree — move through code you have never seen.',
  minutes: 30,
  hero:
    'Your mentor says: "Clone Project Atlas. The bug is somewhere inside backend/auth/controllers." There are nearly 2,000 files. ' +
    'How do you reach the right folder without clicking randomly? That is the skill in this mission.',
  sections: [
    {
      kind: 'text',
      title: 'The real industry skill',
      body: [
        'Professional developers rarely work in tiny folders with three files. They join codebases with backend folders, frontend folders, config files, scripts, logs, tests and hidden files.',
        'Think of terminal navigation like a map app. You need three habits: know where you are, know what is around you, and know how to move to the target.'
      ]
    },
    {
      kind: 'text',
      title: 'Part 1 — Where am I?',
      body: [
        'When you open a terminal you are always somewhere. That somewhere is your current working directory. On a map, pwd is the blue dot: it tells you your location before you decide where to go.'
      ]
    },
    {
      kind: 'commands',
      items: [{ cmd: 'pwd', note: 'print working directory' }]
    },
    {
      kind: 'text',
      title: 'Part 2 — What is around me?',
      body: ['If pwd is your blue dot, ls is looking around the room. Different flags change how much detail you see. Do not memorise them all today.']
    },
    {
      kind: 'commands',
      title: 'Folder exploration kit',
      items: [
        { cmd: 'ls', note: 'basic list of files and folders' },
        { cmd: 'ls -l', note: 'long format: permissions, owner, size, date' },
        { cmd: 'ls -a', note: 'reveals hidden files that start with a dot' },
        { cmd: 'ls -lh', note: 'long format with readable sizes' },
        { cmd: 'ls -R', note: 'recursive. Careful in large folders' }
      ]
    },
    {
      kind: 'text',
      title: 'Part 3 — Moving with cd',
      body: ['The command cd means change directory. Four symbols do most of the work.']
    },
    {
      kind: 'table',
      head: ['Symbol', 'Means', 'Example'],
      rows: [
        ['.', 'the folder you are in right now', 'ls .'],
        ['..', 'one level above', 'cd ..'],
        ['~', 'your personal home folder', 'cd ~'],
        ['/', 'the top of the filesystem', 'cd /']
      ]
    },
    {
      kind: 'commands',
      title: 'Try the sequence',
      items: [
        { cmd: 'cd Downloads' },
        { cmd: 'pwd' },
        { cmd: 'cd ..' },
        { cmd: 'pwd' },
        { cmd: 'cd ~' },
        { cmd: 'cd /' },
        { cmd: 'pwd' }
      ]
    },
    {
      kind: 'compare',
      title: 'Part 4 — Absolute vs relative paths',
      note: 'You are in /home/student/Downloads and you need /home/student/Documents.',
      left: {
        label: 'Relative path',
        body: 'Start from where you are now. Like saying "go back one street, then turn into Documents."',
        code: 'cd ../Documents'
      },
      right: {
        label: 'Absolute path',
        body: 'Start from the root with the full address. Like giving the complete address from the city entrance.',
        code: 'cd /home/student/Documents'
      }
    },
    {
      kind: 'commands',
      title: 'Part 5 — Seeing structure with tree',
      note: 'Reading folders one at a time is slow. tree shows the shape at a glance.',
      items: [
        { cmd: 'cd ~/ProjectAtlas', note: 'a realistic project is waiting here' },
        { cmd: 'tree' },
        { cmd: 'tree -L 2', note: 'limit the depth for large folders' }
      ]
    },
    {
      kind: 'callout',
      tone: 'tip',
      title: 'Part 6 — Two tricks that make you fast',
      body: 'Tab completion: type part of a name and press Tab. The terminal finishes it, which kills spelling mistakes and reveals folder names you did not know. Up Arrow: bring back previous commands instead of retyping them. These are not small tricks — they are most of what makes an experienced developer look quick.'
    },
    {
      kind: 'challenge',
      title: 'Filesystem Treasure Hunt',
      story: 'Start inside TreasureHunt. Reach the treasure using terminal navigation only. No File Explorer, no mouse.',
      steps: [
        'Move into the folder where villagers live.',
        'Wrong place. Go back.',
        'The treasure is inside the royal building.',
        'Look around and find Secret.',
        'Open Treasure.txt.'
      ],
      start: 'cd ~/TreasureHunt'
    },
    {
      kind: 'challenge',
      title: 'End challenge — Escape the Directory',
      story: 'You are stranded deep inside the docs tree. Reach ProjectAtlas/frontend using only cd.',
      steps: [
        'Start: ProjectAtlas/docs/tutorial/setup/linux',
        'Goal: ProjectAtlas/frontend',
        'Rule: only cd. Try the relative route, then try the absolute one.'
      ],
      start: 'cd ~/ProjectAtlas/docs/tutorial/setup/linux'
    }
  ],
  tasks: [
    {
      id: 'locate',
      title: 'Locate yourself and look around',
      hint: 'pwd, then ls',
      check: ranAll(/^\s*pwd\b/, /^\s*ls\s*$/)
    },
    {
      id: 'hidden',
      title: 'Reveal hidden files and inspect the long listing',
      hint: 'ls -a and ls -l',
      check: all(ran(/^\s*ls\b.*-\w*a/), ran(/^\s*ls\b.*-\w*l/))
    },
    {
      id: 'symbols',
      title: 'Use all four path symbols: a folder, .. , ~ and /',
      hint: 'cd Downloads, cd .., cd ~, cd /',
      check: ranAll(/^\s*cd\s+\.\./, /^\s*cd\s+~\s*$/, /^\s*cd\s+\/\s*$/)
    },
    {
      id: 'tree',
      title: 'Draw the Project Atlas structure with tree',
      hint: 'cd ~/ProjectAtlas then tree, then tree -L 2',
      check: ran(/^\s*tree\b/)
    },
    {
      id: 'treasure',
      title: 'Finish the Treasure Hunt: read Treasure.txt',
      hint: 'cd ~/TreasureHunt, then Village, back out, Castle, Secret, cat Treasure.txt',
      check: ran(/^\s*(cat|less|more)\s+.*Treasure\.txt/)
    },
    {
      id: 'escape',
      title: 'Escape the directory: reach ProjectAtlas/frontend from the docs tree',
      hint: 'From .../setup/linux use cd ../../../../frontend, or the absolute path.',
      check: (s) =>
        s.commands.some((c) => /setup\/linux/.test(c)) &&
        s.commands.some((c) => /^\s*cd\s+.*frontend/.test(c))
    }
  ],
  quiz: [
    {
      q: 'You are in /home/student/Downloads and want /home/student/Documents. Which is the relative path?',
      options: ['cd /home/student/Documents', 'cd ../Documents', 'cd ~Documents', 'cd Documents'],
      answer: 1,
      explain: '.. goes up to /home/student, then Documents goes back down. The first option is the absolute route — also correct, just a different style.'
    },
    {
      q: 'Which command reveals files that start with a dot?',
      options: ['ls -l', 'ls -R', 'ls -a', 'ls -h'],
      answer: 2,
      explain: '-a means all, including the hidden dotfiles like .bashrc.'
    },
    {
      q: 'Why does your pwd output look different from your friend\'s?',
      options: [
        'One of you installed Linux wrongly',
        'Because usernames and folder layouts differ between machines',
        'Because pwd is unreliable',
        'Because one of you used the wrong shell'
      ],
      answer: 1,
      explain: 'pwd reports the truth about your machine. /c/Users/Sriman and /home/student are both valid.'
    },
    {
      q: 'What is the fastest way to avoid typing a long folder name wrongly?',
      options: ['Copy it from File Explorer', 'Type it slowly', 'Press Tab to complete it', 'Use ls -R first'],
      answer: 2,
      explain: 'Tab completion finishes the name for you and proves the folder exists.'
    }
  ]
};

/* --------------------------------------------------------------- 3 files --- */

const files = {
  id: 'files',
  number: 3,
  title: 'Creating & Managing Files',
  subtitle: 'mkdir, touch, cp, mv, rm — set up Project Atlas like a film studio.',
  minutes: 35,
  hero:
    'A film shoot never starts with the camera rolling. First the crew builds sets, labels departments, moves props into place, ' +
    'keeps backup copies and clears what is not needed. Preparing a software project is exactly the same job.',
  sections: [
    {
      kind: 'text',
      title: 'These commands are really about organisation',
      body: [
        'Imagine a movie set where scripts, costumes, cameras and cables are thrown into one pile. Even a brilliant crew would waste hours searching. Software projects fail the same way when files have no home.',
        'mkdir and mv are not terminal trivia. They are how a developer keeps the set organised so the next person finds things instantly.'
      ]
    },
    {
      kind: 'table',
      title: 'Meet the crew: five commands, five roles',
      head: ['Command', 'Role', 'What it does'],
      rows: [
        ['mkdir', 'Set Builder', 'Builds the rooms. frontend, backend, docs and assets each get their own space.'],
        ['touch', 'Slate Assistant', 'Puts a blank clapperboard in place — an empty README.md or app.js, ready to fill later.'],
        ['mv', 'Prop Master', 'Moves a prop to the right department, or relabels it with a clearer name.'],
        ['cp', 'Backup Editor', 'Keeps a duplicate of important footage before anyone risks changing it.'],
        ['rm', 'Set Cleaner', 'Strikes the set and removes what is no longer needed. Carefully, never blindly.']
      ]
    },
    {
      kind: 'commands',
      title: 'Build the studio',
      note: 'Four frames of film: create the studio, add departments, place the slate, look around.',
      items: [
        { cmd: 'cd ~', note: 'start from home' },
        { cmd: 'mkdir Project-Atlas', note: 'create the main project folder' },
        { cmd: 'cd Project-Atlas' },
        { cmd: 'mkdir frontend backend docs assets', note: 'one room per kind of work' },
        { cmd: 'touch README.md', note: 'the title page every crew member reads first' },
        { cmd: 'ls', note: 'confirm the set is prepared' }
      ]
    },
    {
      kind: 'commands',
      title: 'Build the backend department',
      note: 'controllers hold request logic, routes connect addresses to that logic, models describe data, app.js starts everything.',
      items: [
        { cmd: 'cd backend' },
        { cmd: 'mkdir controllers routes models' },
        { cmd: 'touch app.js' },
        { cmd: 'ls' }
      ]
    },
    {
      kind: 'commands',
      title: 'Organise the props with mv',
      note: 'mv does two related jobs: move a prop to another department, or relabel it in place.',
      items: [
        { cmd: 'cd ~/Project-Atlas' },
        { cmd: 'touch setup.md' },
        { cmd: 'mv setup.md docs/', note: 'move into the docs department' },
        { cmd: 'mv README.md README_PROJECT.md', note: 'rename in place' },
        { cmd: 'ls' }
      ]
    },
    {
      kind: 'compare',
      title: 'The concept students confuse most',
      left: {
        label: 'cp — the original stays',
        body: 'Like keeping the original footage safe and printing a second copy to edit. You now have two files.',
        code: 'cp README_PROJECT.md README_BACKUP.md'
      },
      right: {
        label: 'mv — the original changes',
        body: 'Like relabelling one prop. There is still only one file, just in a new place or with a new name.',
        code: 'mv README.md README_PROJECT.md'
      }
    },
    {
      kind: 'callout',
      tone: 'safety',
      title: 'The delete risk meter',
      body: 'Deletion is part of the job, but careless deletion has ended real careers. Before deleting, ask three questions: where am I, what is this folder, and can I recreate it? Avoid rm -rf casually — it removes folders forcefully and does not ask twice. Professionals slow down, check the path, and keep a backup first. This lab will stop you if you aim rm at / or your home folder, and explain why.'
    },
    {
      kind: 'commands',
      title: 'Backup, then clean safely',
      items: [
        { cmd: 'cp README_PROJECT.md README_BACKUP.md', note: 'backup first' },
        { cmd: 'mkdir temp' },
        { cmd: 'rm -r temp', note: 'a folder you created, so it is safe to remove' }
      ]
    },
    {
      kind: 'commands',
      title: 'Final walk-through',
      note: 'A director always does a final walk before rolling camera.',
      items: [
        { cmd: 'cd ~/Project-Atlas' },
        { cmd: 'pwd' },
        { cmd: 'tree' },
        { cmd: 'ls -R', note: 'the alternative if tree is unavailable' }
      ]
    }
  ],
  tasks: [
    {
      id: 'studio',
      title: 'Build the studio: Project-Atlas with four departments',
      hint: 'mkdir Project-Atlas, cd into it, then mkdir frontend backend docs assets',
      check: all(
        isDir(`${HOME}/Project-Atlas/frontend`),
        isDir(`${HOME}/Project-Atlas/backend`),
        isDir(`${HOME}/Project-Atlas/docs`),
        isDir(`${HOME}/Project-Atlas/assets`)
      )
    },
    {
      id: 'backend',
      title: 'Build the backend department: controllers, routes, models and app.js',
      hint: 'cd backend, mkdir controllers routes models, touch app.js',
      check: all(
        isDir(`${HOME}/Project-Atlas/backend/controllers`),
        isDir(`${HOME}/Project-Atlas/backend/routes`),
        isDir(`${HOME}/Project-Atlas/backend/models`),
        isFile(`${HOME}/Project-Atlas/backend/app.js`)
      )
    },
    {
      id: 'props',
      title: 'Move setup.md into docs and rename README.md to README_PROJECT.md',
      hint: 'touch setup.md, mv setup.md docs/, mv README.md README_PROJECT.md',
      check: all(isFile(`${HOME}/Project-Atlas/docs/setup.md`), isFile(`${HOME}/Project-Atlas/README_PROJECT.md`))
    },
    {
      id: 'backup',
      title: 'Keep a backup copy without losing the original',
      hint: 'cp README_PROJECT.md README_BACKUP.md — both files must exist afterwards',
      check: all(isFile(`${HOME}/Project-Atlas/README_PROJECT.md`), isFile(`${HOME}/Project-Atlas/README_BACKUP.md`))
    },
    {
      id: 'clean',
      title: 'Create a temp folder and remove it safely',
      hint: 'mkdir temp, then rm -r temp',
      check: all(ran(/^\s*mkdir\s+.*\btemp\b/), ran(/^\s*rm\s+.*-\w*r\w*\s+.*\btemp\b/)),
      also: (s) => !s.fs.exists(`${HOME}/Project-Atlas/temp`)
    },
    {
      id: 'verify',
      title: 'Verify the finished set with tree or ls -R',
      hint: 'pwd, then tree (or ls -R)',
      check: any(ran(/^\s*tree\b/), ran(/^\s*ls\s+.*-\w*R/))
    }
  ],
  quiz: [
    {
      q: 'The director asks you to keep a copy of README_PROJECT.md before cleaning up. Which command shows the safest habit?',
      options: [
        'rm README_PROJECT.md',
        'cp README_PROJECT.md README_BACKUP.md',
        'mv README_PROJECT.md docs/',
        'touch README_PROJECT.md'
      ],
      answer: 1,
      explain: 'cp duplicates it. mv would move the only copy, rm would destroy it, touch would only change the timestamp.'
    },
    {
      q: 'You want README.md renamed to README_PROJECT.md with no extra copies left behind. Which fits?',
      options: [
        'cp README.md README_PROJECT.md',
        'mv README.md README_PROJECT.md',
        'mkdir README_PROJECT.md',
        'rm README.md'
      ],
      answer: 1,
      explain: 'mv renames in place. cp would leave you with two files.'
    },
    {
      q: 'Why does rm on a folder fail without -r?',
      options: [
        'Because folders cannot be deleted in Linux',
        'Because -r tells rm to go inside and remove the contents too',
        'Because you need to be root',
        'Because the folder is open'
      ],
      answer: 1,
      explain: 'Removing a folder means removing everything in it. -r makes that explicit, which is a deliberate speed bump.'
    }
  ]
};

/* ------------------------------------------------------------- 4 inspect --- */

const inspect = {
  id: 'inspect',
  number: 4,
  title: 'Inspecting Files Like a Log Detective',
  subtitle: 'cat, less, head, tail, tail -f and wc.',
  minutes: 30,
  hero:
    'A customer reports that login is broken. Your mentor slides a case file across the desk: a server log with thousands of lines. ' +
    'There is no VS Code, no editor, only a terminal on a Linux server. The clue is in that file. Find it.',
  sections: [
    {
      kind: 'text',
      title: 'Why not just open an editor?',
      body: [
        'A production log can be enormous. A 2 GB file can freeze a graphical editor. Many servers are reached over SSH and have no graphical screen at all.',
        'So engineers inspect files the smart way: quick terminal tools that answer one question at a time.'
      ]
    },
    {
      kind: 'table',
      title: 'The detective gadget drawer',
      head: ['Gadget', 'Command', 'Use it when'],
      rows: [
        ['Read the whole file aloud', 'cat file', 'The file is short. A bad idea for a giant log.'],
        ['Magnifying glass', 'less file', 'The file is huge. Search with /ERROR, n for next, q to quit.'],
        ['Opening scene', 'head file', 'You want to know how the story begins, or the file format.'],
        ['Latest scene', 'tail file', 'You want the newest events, which sit at the bottom of a log.'],
        ['Stakeout camera', 'tail -f file', 'The incident is still happening and you want it live.'],
        ['Evidence counter', 'wc file', 'You need to know how big the case actually is.']
      ]
    },
    {
      kind: 'commands',
      title: 'Practice on a small case first',
      note: 'This creates a file using a heredoc. Type the lines, then EOF on its own line to finish.',
      items: [
        { cmd: 'cd ~' },
        {
          cmd: 'cat > application.log <<EOF',
          note: 'then type the log lines, and EOF alone on the last line',
          multiline: [
            'cat > application.log <<EOF',
            'INFO Server Started',
            'INFO Database Connected',
            'INFO User Login',
            'ERROR Password Incorrect',
            'INFO Retry Login',
            'INFO User Logged In',
            'EOF'
          ]
        },
        { cmd: 'cat application.log' },
        { cmd: 'head application.log' },
        { cmd: 'tail application.log' },
        { cmd: 'wc application.log' }
      ]
    },
    {
      kind: 'callout',
      tone: 'tip',
      title: 'Inside less',
      body: '/ERROR searches for the word ERROR. n jumps to the next match. N goes back. q closes less. Arrow keys and Space scroll. This is the tool that makes a 2 GB file harmless.'
    },
    {
      kind: 'commands',
      title: 'The real case: atlas-server.log',
      note: 'A genuine-looking server log is waiting in your assets folder.',
      items: [
        { cmd: 'head assets/atlas-server.log' },
        { cmd: 'tail assets/atlas-server.log' },
        { cmd: 'wc -l assets/atlas-server.log' },
        { cmd: 'less assets/atlas-server.log', note: 'then type /ERROR and press n a few times' },
        { cmd: 'tail -f assets/atlas-server.log', note: 'live stakeout. Ctrl + C ends it' }
      ]
    },
    {
      kind: 'callout',
      tone: 'rule',
      title: 'Read one scene either side',
      body: 'When you find an error, do not stop there. Read the lines just before and after it. A log is a story, not a single frame, and the real cause is often hiding one scene away.'
    },
    {
      kind: 'challenge',
      title: 'Log Detective Challenge',
      story: 'Work like a real incident responder. Use assets/atlas-server.log and answer each question with commands only.',
      steps: [
        'What is the first log entry? Use head -n 1.',
        'What is the last log entry? Use tail -n 1.',
        'How many total lines exist? Use wc -l.',
        'How many ERROR entries exist? Try grep -c ERROR, or search inside less.',
        'Search for Payment and find the failure lines.'
      ],
      start: 'cd ~',
      answer: 'The file has 46 lines and 11 ERROR entries. Two of those errors are payment failures.'
    }
  ],
  tasks: [
    {
      id: 'create',
      title: 'Create application.log with a heredoc',
      hint: 'cat > application.log <<EOF, then your lines, then EOF alone on a line',
      check: isFile(`${HOME}/application.log`)
    },
    {
      id: 'gadgets',
      title: 'Use cat, head and tail on a file',
      hint: 'cat application.log, head application.log, tail application.log',
      check: ranAll(/^\s*cat\s+\S/, /^\s*head\b/, /^\s*tail\b/)
    },
    {
      id: 'count',
      title: 'Count the evidence with wc',
      hint: 'wc application.log and wc -l assets/atlas-server.log',
      check: ran(/^\s*wc\b/)
    },
    {
      id: 'first-last',
      title: 'Pull exactly the first and the last line of the Atlas log',
      hint: 'head -n 1 assets/atlas-server.log and tail -n 1 assets/atlas-server.log',
      check: all(
        ran(/^\s*head\s+-n\s*1\b.*atlas-server\.log/),
        ran(/^\s*tail\s+-n\s*1\b.*atlas-server\.log/)
      )
    },
    {
      id: 'less',
      title: 'Open the Atlas log in less and search it',
      hint: 'less assets/atlas-server.log then type /ERROR',
      check: ran(/^\s*less\b.*atlas-server\.log/)
    },
    {
      id: 'stakeout',
      title: 'Run a live stakeout with tail -f',
      hint: 'tail -f assets/atlas-server.log, then Ctrl + C to stop',
      check: ran(/^\s*tail\s+.*-\w*f/)
    }
  ],
  quiz: [
    {
      q: 'You have a huge log and need to search for ERROR without loading it into an editor. Which gadget first?',
      options: ['cat atlas-server.log', 'less atlas-server.log', 'mkdir atlas-server.log', 'rm atlas-server.log'],
      answer: 1,
      explain: 'less pages through the file and searches with /ERROR. cat would dump the whole thing at you.'
    },
    {
      q: 'The newest issue just happened and you want only the latest lines. Which fits best?',
      options: ['tail atlas-server.log', 'head atlas-server.log', 'wc atlas-server.log', 'touch atlas-server.log'],
      answer: 0,
      explain: 'New log lines are appended at the bottom, so tail shows the most recent events.'
    },
    {
      q: 'What does tail -f add?',
      options: [
        'It finds a word in the file',
        'It follows the file live, printing new lines as they arrive',
        'It forces the file to be deleted',
        'It formats the output'
      ],
      answer: 1,
      explain: '-f means follow. It is the stakeout camera for an incident that is still unfolding.'
    },
    {
      q: 'wc -l assets/atlas-server.log tells you what?',
      options: ['The number of errors', 'The number of words', 'The number of lines', 'The file size in bytes'],
      answer: 2,
      explain: '-l counts lines. Without flags, wc prints lines, words and characters together.'
    }
  ]
};

/* --------------------------------------------------------- 5 permissions --- */

const permissions = {
  id: 'permissions',
  number: 5,
  title: 'Permissions & Processes',
  subtitle: 'chmod, ownership, ps, top and a safe kill.',
  minutes: 30,
  hero:
    'During deployment your mentor notices two problems: a deployment script will not run because its permissions are wrong, ' +
    'and one process has become unresponsive. Investigate, fix, monitor, and terminate safely.',
  sections: [
    {
      kind: 'text',
      title: 'Permissions are access badges',
      body: [
        'Think of permissions like badges in a lab. A researcher may read a file, a manager may edit it, and only a trained operator should run the machine.',
        'Processes are the experiments currently running. You do not switch off random equipment. You identify the right one, confirm it is safe, then stop it carefully.'
      ]
    },
    {
      kind: 'commands',
      title: 'Set up a safe practice folder',
      items: [
        { cmd: 'cd ~' },
        { cmd: 'mkdir permissions-demo' },
        { cmd: 'cd permissions-demo' },
        { cmd: 'touch deploy.sh' },
        { cmd: 'ls -l', note: 'read the badge before changing anything' }
      ]
    },
    {
      kind: 'text',
      title: 'Decode the permission string',
      body: [
        'A line like -rw-r--r-- 1 student student 0 Jul 31 10:00 deploy.sh breaks into four parts.',
        'The first character is the type: - for a file, d for a directory. Then three groups of three: owner, group, others. In each group r means read, w means write, x means execute, and a dash means that permission is missing.',
        'So -rw-r--r-- says: the owner can read and write but not execute, the group can only read, and everyone else can only read. That is exactly why a fresh script will not run.'
      ]
    },
    {
      kind: 'commands',
      title: 'Make the script executable',
      items: [
        { cmd: 'chmod +x deploy.sh' },
        { cmd: 'ls -l', note: 'the x appears in all three groups' },
        { cmd: 'chmod 644 deploy.sh', note: 'take it away again' },
        { cmd: 'ls -l' },
        { cmd: 'chmod 755 deploy.sh', note: 'the common script permission' },
        { cmd: 'ls -l' }
      ]
    },
    {
      kind: 'table',
      title: 'What 755 means',
      head: ['Digit', 'Applies to', 'Grants'],
      rows: [
        ['7', 'Owner', 'read + write + execute (4 + 2 + 1)'],
        ['5', 'Group', 'read + execute (4 + 1)'],
        ['5', 'Others', 'read + execute (4 + 1)']
      ]
    },
    {
      kind: 'callout',
      tone: 'safety',
      title: 'Permissions are power, not decoration',
      body: 'Do not give execute permission to every file. Only scripts and programs meant to run should get it. A stray executable is an invitation.'
    },
    {
      kind: 'commands',
      title: 'Ownership',
      note: 'Ownership tells you which user and group are responsible for a file. Understanding it matters more than running chown, which behaves differently across Git Bash, WSL and Ubuntu.',
      items: [
        { cmd: 'ls -l' },
        { cmd: 'whoami' },
        { cmd: 'chown student:student deploy.sh', note: 'works here; may not work in Git Bash' }
      ]
    },
    {
      kind: 'commands',
      title: 'Inspect running processes',
      items: [
        { cmd: 'ps', note: 'your processes' },
        { cmd: 'ps aux', note: 'everything, with CPU and memory columns' },
        { cmd: 'top', note: 'a live monitor. Press q to quit' }
      ]
    },
    {
      kind: 'callout',
      tone: 'safety',
      title: 'Safe termination protocol',
      body: 'Create your own target, identify its PID, terminate that PID, then verify it is gone. Never copy a PID from someone else, and never kill a system process. This lab refuses if you aim kill at PID 1 or the database, and tells you why.'
    },
    {
      kind: 'commands',
      title: 'The four steps',
      items: [
        { cmd: 'sleep 300 &', note: '1. create a safe demo process in the background' },
        { cmd: 'ps', note: '2. identify — copy the PID next to sleep' },
        { cmd: 'jobs', note: 'another way to see your background jobs' },
        { cmd: 'kill PID', note: '3. terminate — replace PID with the real number you saw' },
        { cmd: 'ps', note: '4. verify it disappeared' }
      ]
    }
  ],
  tasks: [
    {
      id: 'demo',
      title: 'Create permissions-demo with deploy.sh inside',
      hint: 'mkdir permissions-demo, cd permissions-demo, touch deploy.sh',
      check: isFile(`${HOME}/permissions-demo/deploy.sh`)
    },
    {
      id: 'read-first',
      title: 'Read the permissions before changing them',
      hint: 'ls -l',
      check: ran(/^\s*ls\s+.*-\w*l/)
    },
    {
      id: 'exec',
      title: 'Give the script execute permission',
      hint: 'chmod +x deploy.sh',
      check: all(ran(/^\s*chmod\b/), modeHasExec(`${HOME}/permissions-demo/deploy.sh`))
    },
    {
      id: 'numeric',
      title: 'Use numeric mode at least once (755 or 644)',
      hint: 'chmod 755 deploy.sh',
      check: ran(/^\s*chmod\s+[0-7]{3,4}\b/)
    },
    {
      id: 'processes',
      title: 'Inspect the process table',
      hint: 'ps and then ps aux',
      check: all(ran(/^\s*ps\b/), any(ran(/^\s*ps\s+\w*a/), ran(/^\s*top\b/)))
    },
    {
      id: 'safe-kill',
      title: 'Start sleep 300 in the background, then kill that PID',
      hint: 'sleep 300 &, ps, kill <the pid you saw>, ps',
      check: all(ran(/^\s*sleep\s+\d+\s*&/), ran(/^\s*kill\s+\d+/))
    }
  ],
  quiz: [
    {
      q: 'A deployment script exists but will not run. Which command safely adds execute permission?',
      options: ['chmod +x deploy.sh', 'kill deploy.sh', 'ps deploy.sh', 'whoami deploy.sh'],
      answer: 0,
      explain: 'chmod changes the mode. +x adds the execute bit that a script needs.'
    },
    {
      q: 'Why do we use sleep 300 before practising kill?',
      options: [
        'It creates a safe demo process to terminate',
        'It deletes all old processes',
        'It changes file ownership',
        'It grants chmod permission'
      ],
      answer: 0,
      explain: 'You own it, nothing depends on it, and killing it teaches the workflow without risk.'
    },
    {
      q: 'In -rwxr-xr-x, what can "others" do?',
      options: ['Read, write and execute', 'Read and execute', 'Only write', 'Nothing'],
      answer: 1,
      explain: 'The last group is r-x: read and execute, but no write.'
    },
    {
      q: 'What does chmod 644 grant?',
      options: [
        'Owner read/write; group and others read only',
        'Everybody full access',
        'Owner execute only',
        'Nobody any access'
      ],
      answer: 0,
      explain: '6 = read + write for the owner, 4 = read for group and others.'
    }
  ]
};

/* -------------------------------------------------------------- 6 search --- */

const search = {
  id: 'search',
  number: 6,
  title: 'Searching & Filtering',
  subtitle: 'grep, find and wildcards — become a code detective.',
  minutes: 35,
  hero:
    'Day one at a real company. Your tech lead messages: "Login is broken for some users. Can you find where the token check happens?" ' +
    'You open the project and freeze — hundreds of folders, thousands of files. Here is the secret every engineer learns fast: you do not read a codebase, you search it.',
  sections: [
    {
      kind: 'text',
      title: 'Three superpowers',
      body: [
        'find locates files when you know the name, type or folder. grep searches inside files when you know a word, error, function or config key. Wildcards match a shape of name when the exact name varies.',
        'A detective does not interview every person in the city. They follow clues, filter suspects, and zoom in on the one detail that cracks the case.'
      ]
    },
    {
      kind: 'table',
      title: 'Wildcards: describe the shape of a name',
      head: ['Pattern', 'Meaning', 'Example'],
      rows: [
        ['*', 'any number of characters', '*.js matches app.js and login.js'],
        ['?', 'exactly one character', 'file?.txt matches file1.txt'],
        ['[ ]', 'one character from a set', 'file[12].txt matches file1.txt and file2.txt']
      ]
    },
    {
      kind: 'commands',
      title: 'find — locate files and folders',
      items: [
        { cmd: 'cd ~/assets/atlas-search-lab', note: 'a realistic repo to hunt through' },
        { cmd: 'find .', note: 'everything below here' },
        { cmd: 'find . -name "*.js"', note: 'every JavaScript file' },
        { cmd: 'find . -type d', note: 'folders only' },
        { cmd: 'find . -name "README.md"' },
        { cmd: 'find . -type f -size +1000c', note: 'files larger than 1000 bytes' }
      ]
    },
    {
      kind: 'commands',
      title: 'grep — highlight the lines that matter',
      items: [
        { cmd: 'grep "ERROR" logs/server.log' },
        { cmd: 'grep -n "ERROR" logs/server.log', note: '-n adds line numbers' },
        { cmd: 'grep -i login logs/server.log', note: '-i ignores case' },
        { cmd: 'grep -v INFO logs/server.log', note: '-v inverts: show what does NOT match' },
        { cmd: 'grep -c ERROR logs/server.log', note: '-c counts instead of printing' },
        { cmd: 'grep -r "JWT_SECRET" .', note: '-r searches the whole project. This is the magic moment' }
      ]
    },
    {
      kind: 'callout',
      tone: 'story',
      title: 'Why -r matters in real life',
      body: 'A company realises a password was accidentally written into the code. Instead of checking thousands of files by hand, one engineer runs a single recursive search and finds every place it appears, in seconds.'
    },
    {
      kind: 'commands',
      title: 'Two-stage investigation: find, then filter',
      note: 'The pipe sends the output of one command into the next. More on that in the next mission.',
      items: [
        { cmd: 'find . -name "*.js" | grep login' },
        { cmd: 'grep -r "ERROR" . | wc -l' }
      ]
    },
    {
      kind: 'table',
      title: 'Four regular-expression shapes worth knowing today',
      head: ['Symbol', 'Means'],
      rows: [
        ['.', 'any single character'],
        ['*', 'repeat the previous pattern'],
        ['^', 'start of the line'],
        ['$', 'end of the line']
      ]
    },
    {
      kind: 'challenge',
      title: 'Project Atlas Grep Hunt',
      story: 'The Atlas login system is failing. One repository, six clues. Fastest correct run wins.',
      steps: [
        'Find login.js — there is more than one.',
        'Find README.md.',
        'Find every ERROR in the project.',
        'Find every TODO left behind.',
        'Find config.json.',
        'Find every place JWT_SECRET appears.'
      ],
      start: 'cd ~/assets/atlas-search-lab'
    }
  ],
  tasks: [
    {
      id: 'find-name',
      title: 'Find files by name with find -name',
      hint: 'find . -name "*.js"',
      check: ran(/^\s*find\b.*-name/)
    },
    {
      id: 'find-type',
      title: 'Find only directories with find -type d',
      hint: 'find . -type d',
      check: ran(/^\s*find\b.*-type\s+d/)
    },
    {
      id: 'grep-basic',
      title: 'Search inside a file with grep',
      hint: 'grep "ERROR" logs/server.log',
      check: ran(/^\s*grep\b(?!.*-\w*r\b).*\S+\s+\S+/)
    },
    {
      id: 'grep-flags',
      title: 'Use at least two grep flags (-n, -i, -v or -c)',
      hint: 'grep -n ERROR logs/server.log, then grep -i login logs/server.log',
      check: (s) => {
        const used = new Set();
        for (const c of s.commands) {
          const m = c.match(/^\s*grep\s+(-\w+)/);
          if (m) for (const ch of m[1].slice(1)) if ('nivc'.includes(ch)) used.add(ch);
        }
        return used.size >= 2;
      }
    },
    {
      id: 'grep-r',
      title: 'Search the whole project recursively for JWT_SECRET',
      hint: 'grep -r "JWT_SECRET" .',
      check: ran(/^\s*grep\s+.*-\w*r\w*\s+.*JWT_SECRET/i)
    },
    {
      id: 'hunt',
      title: 'Complete the Grep Hunt: locate config.json and every TODO',
      hint: 'find . -name "config.json" and grep -r "TODO" .',
      check: all(ran(/^\s*find\b.*config\.json/), ran(/^\s*grep\b.*TODO/))
    }
  ],
  quiz: [
    {
      q: 'Which command finds every JavaScript file under the current folder?',
      options: ['find . -name "*.js"', 'grep "*.js" .', 'wc "*.js"', 'ls *.js'],
      answer: 0,
      explain: 'find walks the whole tree. ls *.js would only match the current folder.'
    },
    {
      q: 'Which command searches the whole project for JWT_SECRET?',
      options: ['grep -r "JWT_SECRET" .', 'find . -type d', 'tail JWT_SECRET', 'chmod JWT_SECRET'],
      answer: 0,
      explain: '-r means recursive: grep descends into every folder below the path you give it.'
    },
    {
      q: 'What does grep -v INFO do?',
      options: [
        'Shows only lines containing INFO',
        'Shows every line except those containing INFO',
        'Counts INFO lines',
        'Shows INFO in verbose mode'
      ],
      answer: 1,
      explain: '-v inverts the match. It is how you strip the noise out of a log.'
    },
    {
      q: 'What is the difference between find and grep?',
      options: [
        'They are the same command',
        'find locates files by name or property; grep searches text inside files',
        'find is for folders, grep is for folders too',
        'grep is faster than find at everything'
      ],
      answer: 1,
      explain: 'find answers "where is the file?". grep answers "which lines contain this?".'
    }
  ]
};

/* --------------------------------------------------------------- 7 pipes --- */

const pipes = {
  id: 'pipes',
  number: 7,
  title: 'Pipes, Redirection & Chaining',
  subtitle: 'Join small commands into one answer.',
  minutes: 25,
  hero:
    'Every command you have learned does one small job well. The pipe is what turns a drawer of single-purpose tools ' +
    'into an assembly line that answers a question no single command could.',
  sections: [
    {
      kind: 'text',
      title: 'Three streams',
      body: [
        'Every command reads from standard input, writes results to standard output, and writes complaints to standard error. Pipes and redirection are just rewiring those streams.',
        'A pipe connects the output of one command to the input of the next. Redirection sends output into a file instead of the screen.'
      ]
    },
    {
      kind: 'table',
      title: 'The operators',
      head: ['Operator', 'Means', 'Example'],
      rows: [
        ['|', 'send output into the next command', 'grep ERROR log | wc -l'],
        ['>', 'write output to a file, replacing it', 'grep ERROR log > errors.txt'],
        ['>>', 'append output to the end of a file', 'echo "done" >> errors.txt'],
        ['<', 'feed a file in as input', 'wc -l < errors.txt'],
        [';', 'run this, then that, regardless', 'cd /tmp ; pwd'],
        ['&&', 'run the next only if this succeeded', 'mkdir build && cd build'],
        ['||', 'run the next only if this failed', 'cd nope || echo "fallback"']
      ]
    },
    {
      kind: 'commands',
      title: 'Build a pipeline one stage at a time',
      note: 'Each line adds a stage. Run them in order and watch the output narrow.',
      items: [
        { cmd: 'cd ~' },
        { cmd: 'cat assets/atlas-server.log', note: 'everything: too much' },
        { cmd: 'grep ERROR assets/atlas-server.log', note: 'only the errors' },
        { cmd: 'grep ERROR assets/atlas-server.log | wc -l', note: 'just how many' },
        { cmd: 'grep ERROR assets/atlas-server.log | cut -d " " -f 2 | sort | uniq -c', note: 'errors grouped by component' }
      ]
    },
    {
      kind: 'callout',
      tone: 'tip',
      title: 'Read a pipeline left to right',
      body: 'grep ERROR log | cut -d " " -f 2 | sort | uniq -c reads as: take the error lines, keep the second column, put them in order, then count each repeated value. Every stage is a command you already know.'
    },
    {
      kind: 'commands',
      title: 'Redirection: keep the evidence',
      items: [
        { cmd: 'grep ERROR assets/atlas-server.log > errors.txt', note: 'save the findings' },
        { cmd: 'wc -l errors.txt' },
        { cmd: 'echo "reviewed by student" >> errors.txt', note: 'append a note' },
        { cmd: 'tail -n 1 errors.txt' }
      ]
    },
    {
      kind: 'commands',
      title: 'Chaining: express intent, not just sequence',
      items: [
        { cmd: 'mkdir report-build && cd report-build && pwd', note: 'each step only runs if the last succeeded' },
        { cmd: 'cd /does-not-exist || echo "could not enter, staying put"' },
        { cmd: 'cd ~ ; pwd', note: 'semicolon does not care whether the first worked' }
      ]
    },
    {
      kind: 'challenge',
      title: 'Pipeline challenge',
      story: 'Answer each question with a single line. No manual counting.',
      steps: [
        'How many lines in the Atlas log are NOT informational?',
        'How many payment-related lines are there in total?',
        'Save every auth-related line to auth-report.txt.',
        'Count how many distinct components appear in the ERROR lines.'
      ],
      start: 'cd ~'
    }
  ],
  tasks: [
    {
      id: 'pipe',
      title: 'Connect two commands with a pipe',
      hint: 'grep ERROR assets/atlas-server.log | wc -l',
      check: ran(/\S\s*\|\s*\S/)
    },
    {
      id: 'three-stage',
      title: 'Build a pipeline with three or more stages',
      hint: 'grep ERROR assets/atlas-server.log | cut -d " " -f 2 | sort | uniq -c',
      check: (s) => s.commands.some((c) => (c.match(/\|/g) || []).length >= 2)
    },
    {
      id: 'redirect',
      title: 'Save command output into a file with >',
      hint: 'grep ERROR assets/atlas-server.log > errors.txt',
      check: all(ran(/[^>]>[^>]/), exists(`${HOME}/errors.txt`))
    },
    {
      id: 'append',
      title: 'Append to that file with >>',
      hint: 'echo "reviewed by student" >> errors.txt',
      check: ran(/>>/)
    },
    {
      id: 'chain-and',
      title: 'Use && so a step only runs when the previous one succeeded',
      hint: 'mkdir report-build && cd report-build && pwd',
      check: ran(/&&/)
    },
    {
      id: 'chain-or',
      title: 'Use || to provide a fallback when a command fails',
      hint: 'cd /does-not-exist || echo "fallback"',
      check: ran(/\|\|/)
    }
  ],
  quiz: [
    {
      q: 'What does grep ERROR log | wc -l tell you?',
      options: [
        'The text of every error',
        'How many lines contain ERROR',
        'The size of the log in bytes',
        'Nothing, the syntax is invalid'
      ],
      answer: 1,
      explain: 'grep filters to the matching lines, then wc -l counts them instead of printing them.'
    },
    {
      q: 'What is the difference between > and >>?',
      options: [
        'There is none',
        '> appends, >> replaces',
        '> replaces the file contents, >> adds to the end',
        '> works on folders, >> works on files'
      ],
      answer: 2,
      explain: 'A single > overwrites without warning. Reach for >> when you want to keep what is already there.'
    },
    {
      q: 'mkdir build && cd build — what happens if mkdir fails?',
      options: [
        'cd build runs anyway',
        'cd build is skipped',
        'The shell exits',
        'The folder is created twice'
      ],
      answer: 1,
      explain: '&& only continues on success. That is what makes it safer than a semicolon here.'
    }
  ]
};

/* -------------------------------------------------------- 8 productivity --- */

const productivity = {
  id: 'productivity',
  number: 8,
  title: 'Terminal Productivity & the Graduation Challenge',
  subtitle: 'aliases, .bashrc, history, shortcuts and Bandit levels 0 to 5.',
  minutes: 40,
  hero:
    'Knowing commands does not make you a developer. Speed, comfort and confidence do. A slow developer and a fast developer ' +
    'often know the same commands. The difference is the workflow around them.',
  sections: [
    {
      kind: 'text',
      title: 'Make the terminal yours',
      body: [
        'An alias is a short name for a longer command. Developers create them for whatever they type twenty times a day.',
        'An alias you type in the terminal disappears when you close the window. To keep it, you save it in a startup file — usually ~/.bashrc — and reload that file with source.'
      ]
    },
    {
      kind: 'commands',
      title: 'Create aliases',
      items: [
        { cmd: 'alias ll="ls -lah"' },
        { cmd: 'alias cls="clear"' },
        { cmd: 'alias atlas="cd ~/Project-Atlas"' },
        { cmd: 'alias be="cd backend"' },
        { cmd: 'alias', note: 'list everything you have defined' },
        { cmd: 'll', note: 'try it' }
      ]
    },
    {
      kind: 'commands',
      title: 'Make them permanent',
      note: 'nano opens a small editor. Type your alias lines, then Ctrl + O to save and Ctrl + X to exit.',
      items: [
        { cmd: 'nano ~/.bashrc' },
        { cmd: 'source ~/.bashrc', note: 'reload the file so the aliases work immediately' },
        { cmd: 'cat ~/.bashrc' }
      ]
    },
    {
      kind: 'callout',
      tone: 'tip',
      title: 'The time challenge',
      body: 'Time yourself doing this the long way: cd ~/Project-Atlas, then cd backend, then ls -lah. Now do it as: atlas, be, ll. The point lands instantly. Aliases are not a trick — they are saved time on every command you repeat.'
    },
    {
      kind: 'commands',
      title: 'Recall commands instead of retyping them',
      items: [
        { cmd: 'history', note: 'the numbered list of what you have run' },
        { cmd: '!!', note: 'run the last command again' },
        { cmd: '!25', note: 'run command number 25 from the list' },
        { cmd: 'history | grep grep', note: 'find that clever command from earlier' }
      ]
    },
    {
      kind: 'table',
      title: 'Shortcuts professionals use thousands of times a day',
      head: ['Key', 'Does'],
      rows: [
        ['Tab', 'Auto-complete a file or folder name'],
        ['Up / Down arrow', 'Walk back and forth through previous commands'],
        ['Ctrl + R', 'Reverse search: start typing part of an old command'],
        ['Ctrl + C', 'Stop the running command'],
        ['Ctrl + L', 'Clear the screen'],
        ['Ctrl + A', 'Jump to the start of the line'],
        ['Ctrl + E', 'Jump to the end of the line'],
        ['Ctrl + U', 'Clear the line you are typing']
      ]
    },
    {
      kind: 'callout',
      tone: 'rule',
      title: 'Pick two today',
      body: 'Do not try to absorb all eight. Force yourself to use Tab completion and Up Arrow for the rest of this session. Speed becomes muscle memory, and muscle memory is what you are actually building.'
    },
    {
      kind: 'challenge',
      title: 'The final boss — Bandit levels 0 to 5',
      story:
        'The real game lives at overthewire.org/wargames/bandit and is played over SSH. A local training ground with the same six puzzles is waiting in ~/bandit so you can rehearse here first. Each level revises a skill from an earlier mission.',
      steps: [
        'Level 0 — cd ~/bandit/level0 and read the file. Plain cat.',
        'Level 1 — the file is named a single dash. cat will not take it plainly.',
        'Level 2 — the filename has spaces. Quote it, or escape them.',
        'Level 3 — the file is hidden. Which ls flag reveals it?',
        'Level 4 — many files, only one is human readable. Inspect them.',
        'Level 5 — find the file by its properties: a regular file over 1000 bytes.'
      ],
      start: 'cd ~/bandit',
      link: 'https://overthewire.org/wargames/bandit/'
    },
    {
      kind: 'callout',
      tone: 'tip',
      title: 'AI as a workflow coach',
      body: 'Ask for hints, not answers: "I am stuck on Bandit Level 4. Give me a hint, not the answer." or "Suggest five useful bash aliases for a backend developer and explain each one." The badge means you can work independently, so protect that.'
    }
  ],
  tasks: [
    {
      id: 'alias',
      title: 'Create an alias and use it',
      hint: 'alias ll="ls -lah" then run ll',
      check: (s) => Object.keys(s.aliases).length > 0 && s.commands.some((c) => /^\s*alias\s+\w+=/.test(c))
    },
    {
      id: 'bashrc',
      title: 'Save an alias into ~/.bashrc and reload it with source',
      hint: 'nano ~/.bashrc (or echo an alias line >> ~/.bashrc), then source ~/.bashrc',
      check: all(fileHas(`${HOME}/.bashrc`, 'alias'), ran(/^\s*(source|\.)\s+.*bashrc/))
    },
    {
      id: 'history',
      title: 'Use the history list and re-run something from it',
      hint: 'history, then !! or !25',
      check: all(ran(/^\s*history\b/), ran(/^\s*!/))
    },
    {
      id: 'bandit-3',
      title: 'Bandit: clear levels 0 to 3',
      hint: 'cat readme, cat ./-, cat "spaces in this filename", ls -a then cat .hidden',
      check: all(
        ran(/cat\s+.*readme/),
        ran(/cat\s+\.\/-/),
        ran(/cat\s+.*spaces in this filename/),
        ran(/cat\s+.*\.hidden/)
      )
    },
    {
      id: 'bandit-5',
      title: 'Bandit: clear levels 4 and 5',
      hint: 'Inspect the files in level4/inhere, then use find with -type f -size +1000c in level5',
      check: all(ran(/level4/), ran(/^\s*find\b.*-size/))
    },
    {
      id: 'report',
      title: 'Generate your PDF report',
      hint: 'Use the Export report button in the header once your tasks are green.',
      check: (s) => s.reportGenerated === true
    }
  ],
  quiz: [
    {
      q: 'You added an alias but it disappears after you close the window. What is the fix?',
      options: [
        'Save it in ~/.bashrc and run source ~/.bashrc',
        'Run the alias twice each time',
        'Restart the computer after each alias',
        'Aliases cannot be made permanent'
      ],
      answer: 0,
      explain: '~/.bashrc runs every time an interactive shell starts, so anything in there comes back automatically.'
    },
    {
      q: 'Which shortcut finds an old command by typing part of it?',
      options: ['Ctrl + R', 'Ctrl + C', 'Ctrl + L', 'Ctrl + A'],
      answer: 0,
      explain: 'Ctrl + R is reverse search. Keep typing to narrow it, Enter to run it.'
    },
    {
      q: 'What does source ~/.bashrc actually do?',
      options: [
        'Opens the file in an editor',
        'Deletes and recreates the file',
        'Runs every line of the file in your current shell',
        'Copies the file to the home folder'
      ],
      answer: 2,
      explain: 'That is why your new aliases start working immediately instead of after a restart.'
    },
    {
      q: 'In Bandit level 1 the file is named a single dash. Why does plain cat - fail?',
      options: [
        'Because the file does not exist',
        'Because a lone dash means "read from standard input" to most commands',
        'Because dashes are illegal in filenames',
        'Because you need sudo'
      ],
      answer: 1,
      explain: 'Give it a path instead: cat ./- makes it unambiguous that you mean the file.'
    }
  ]
};

export const lessons = [setup, navigate, files, inspect, permissions, search, pipes, productivity];

export function lessonById(id) {
  return lessons.find((l) => l.id === id) || lessons[0];
}

// Runs every task check against the current snapshot and returns the ids that pass.
export function evaluateTasks(lesson, snapshot) {
  const passed = [];
  for (const task of lesson.tasks) {
    try {
      let okResult = task.check(snapshot);
      if (okResult && task.also) okResult = task.also(snapshot);
      if (okResult) passed.push(task.id);
    } catch {
      /* a check that throws simply does not pass yet */
    }
  }
  return passed;
}
