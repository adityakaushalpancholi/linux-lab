import { coreCommands } from './core.js';
import { fileCommands } from './filecmds.js';
import { textCommands } from './textcmds.js';
import { searchCommands } from './searchcmds.js';
import { sysCommands } from './syscmds.js';

export const commands = {
  ...coreCommands,
  ...fileCommands,
  ...textCommands,
  ...searchCommands,
  ...sysCommands
};

export const commandNames = Object.keys(commands).filter((n) => /^[a-z]/.test(n));
