// Identity, environment and odds-and-ends commands.

import { parseArgs, ok, fail, joinLines } from './util.js';

export const coreCommands = {
  whoami: {
    summary: 'Print the username you are currently logged in as.',
    usage: 'whoami',
    flags: {},
    run: (ctx) => ok(ctx.shell.env.USER + '\n')
  },

  hostname: {
    summary: 'Print the name of this machine.',
    usage: 'hostname',
    flags: {},
    run: (ctx) => ok(ctx.shell.env.HOSTNAME + '\n')
  },

  id: {
    summary: 'Print user and group identity numbers.',
    usage: 'id',
    flags: {},
    run: (ctx) => ok(`uid=1000(${ctx.shell.env.USER}) gid=1000(${ctx.shell.env.USER}) groups=1000(${ctx.shell.env.USER}),27(sudo)\n`)
  },

  echo: {
    summary: 'Print text back to the screen. Proves the shell can output.',
    usage: 'echo [-n] text...',
    flags: { n: 'do not print the trailing newline' },
    run: (ctx) => {
      const { flags, args } = parseArgs(ctx.argv);
      const text = args.join(' ');
      return ok(flags.has('n') ? text : text + '\n');
    }
  },

  uname: {
    summary: 'Print system information about the kernel and machine.',
    usage: 'uname [-a] [-s] [-r] [-m]',
    flags: {
      a: 'all information at once',
      s: 'kernel name only',
      r: 'kernel release',
      m: 'machine hardware name'
    },
    run: (ctx) => {
      const { flags } = parseArgs(ctx.argv);
      const kernel = 'Linux';
      const host = ctx.shell.env.HOSTNAME;
      const release = '5.15.146.1-microsoft-standard-WSL2';
      const version = '#1 SMP Thu Jan 11 04:09:03 UTC 2024';
      const machine = 'x86_64';
      if (flags.has('a')) {
        return ok(`${kernel} ${host} ${release} ${version} ${machine} ${machine} ${machine} GNU/Linux\n`);
      }
      if (flags.has('r')) return ok(release + '\n');
      if (flags.has('m')) return ok(machine + '\n');
      return ok(kernel + '\n');
    }
  },

  date: {
    summary: 'Print the current date and time.',
    usage: 'date',
    flags: {},
    run: () => {
      const d = new Date();
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const pad = (n) => String(n).padStart(2, '0');
      return ok(
        `${days[d.getDay()]} ${months[d.getMonth()]} ${pad(d.getDate())} ` +
          `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} IST ${d.getFullYear()}\n`
      );
    }
  },

  clear: {
    summary: 'Clear the terminal screen.',
    usage: 'clear',
    flags: {},
    run: () => ({ out: '', err: '', code: 0, clear: true })
  },

  env: {
    summary: 'Print the environment variables of the current shell.',
    usage: 'env',
    flags: {},
    run: (ctx) => ok(joinLines(Object.entries(ctx.shell.env).map(([k, v]) => `${k}=${v}`)))
  },

  export: {
    summary: 'Set an environment variable for this shell.',
    usage: 'export NAME=value',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (!args.length) {
        return ok(joinLines(Object.entries(ctx.shell.env).map(([k, v]) => `declare -x ${k}="${v}"`)));
      }
      for (const a of args) {
        const eq = a.indexOf('=');
        if (eq === -1) continue;
        ctx.shell.env[a.slice(0, eq)] = a.slice(eq + 1);
      }
      return ok();
    }
  },

  which: {
    summary: 'Show where a command lives, if it exists.',
    usage: 'which command',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      const out = [];
      let code = 0;
      for (const a of args) {
        if (ctx.shell.commands[a]) out.push(`/usr/bin/${a}`);
        else code = 1;
      }
      return { out: joinLines(out), err: '', code };
    }
  },

  sleep: {
    summary: 'Pause for a number of seconds. Useful as a safe practice process.',
    usage: 'sleep seconds',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      const secs = Number(args[0]);
      if (!args.length || Number.isNaN(secs)) return fail('sleep: missing operand\n');
      // Foreground sleep is simulated instantly so the lab never freezes.
      // Backgrounded (`sleep 300 &`) becomes a real entry in the process table.
      return { out: '', err: '', code: 0, sleptFor: secs };
    }
  },

  help: {
    summary: 'List every command available in this lab.',
    usage: 'help [command]',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (args.length) {
        const cmd = ctx.shell.commands[args[0]];
        if (!cmd) return fail(`help: no help topic for '${args[0]}'\n`);
        const flagLines = Object.entries(cmd.flags || {}).map(([f, d]) => `  -${f}   ${d}`);
        return ok(
          `${args[0]} - ${cmd.summary}\n\nUsage: ${cmd.usage}\n` +
            (flagLines.length ? '\nOptions:\n' + joinLines(flagLines) : '')
        );
      }
      const names = Object.keys(ctx.shell.commands).sort();
      const grouped = [];
      for (let i = 0; i < names.length; i += 6) {
        grouped.push('  ' + names.slice(i, i + 6).map((n) => n.padEnd(11)).join('').trimEnd());
      }
      return ok(
        'Commands available in this lab:\n\n' +
          joinLines(grouped) +
          '\nType  man <command>  or  help <command>  for detail.\n' +
          'Type  reset           to restore the filesystem to its starting state.\n'
      );
    }
  },

  man: {
    summary: 'Show the manual page for a command.',
    usage: 'man command',
    flags: {},
    run: (ctx) => {
      const { args } = parseArgs(ctx.argv);
      if (!args.length) return fail('What manual page do you want?\n');
      const name = args[0];
      const cmd = ctx.shell.commands[name];
      if (!cmd) return fail(`No manual entry for ${name}\n`);
      const flagLines = Object.entries(cmd.flags || {}).map(([f, d]) => `       -${f}\n              ${d}`);
      return ok(
        `${name.toUpperCase()}(1)\n\n` +
          `NAME\n       ${name} - ${cmd.summary}\n\n` +
          `SYNOPSIS\n       ${cmd.usage}\n\n` +
          (flagLines.length ? `OPTIONS\n${flagLines.join('\n')}\n\n` : '') +
          (cmd.examples ? `EXAMPLES\n${cmd.examples.map((e) => '       ' + e).join('\n')}\n` : '')
      );
    }
  }
};
