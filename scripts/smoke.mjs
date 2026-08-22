// Engine smoke test. Run with: node scripts/smoke.mjs
import { Shell } from '../src/shell/shell.js';

const shell = new Shell();
let pass = 0;
let fail = 0;

// Remove the colour markers ls/grep add when writing to a terminal.
const MARK_START = String.fromCharCode(1);
const MARK_END = String.fromCharCode(2);
const MARK_RE = new RegExp(MARK_START + '[dxm]|' + MARK_END, 'g');

function strip(text) {
  return text.replace(MARK_RE, '');
}

function t(label, input, expect) {
  const res = shell.run(input);
  const got = strip(
    res.outputs.filter((o) => o.stream !== 'echo').map((o) => o.text).join('')
  );
  const okResult = typeof expect === 'function' ? expect(got, res) : got === expect;
  if (okResult) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${label}`);
    console.log(`  input:    ${JSON.stringify(input)}`);
    console.log(`  got:      ${JSON.stringify(got)}`);
    if (typeof expect !== 'function') console.log(`  expected: ${JSON.stringify(expect)}`);
  }
}

const has = (needle) => (got) => got.includes(needle);
const notHas = (needle) => (got) => !got.includes(needle);

/* ------------------------------------------------------------ lesson 1.4 */
t('whoami', 'whoami', 'student\n');
t('pwd at home', 'pwd', '/home/student\n');
t('echo', 'echo "Hello Kalvium"', 'Hello Kalvium\n');
t('uname -a', 'uname -a', has('Linux atlas-workstation'));
t('date runs', 'date', (g) => /\d{4}\n$/.test(g));

/* --------------------------------------------------------- navigation */
t('cd ..', 'cd ..', '');
t('pwd after cd ..', 'pwd', '/home\n');
t('cd ~', 'cd ~', '');
t('pwd back home', 'pwd', '/home/student\n');
t('cd /', 'cd /', '');
t('ls /', 'ls', has('home'));
t('tree -L 1 /', 'tree -L 1 /', has('etc'));
t('cd home/student', 'cd /home/student', '');
t('cd nonexistent', 'cd nowhere', 'cd: nowhere: No such file or directory\n');
t('cd relative up-down', 'cd ../student', '');
t('absolute path', 'cd /home/student/Downloads && pwd', '/home/student/Downloads\n');
t('cd - returns', 'cd -', has('/home/student'));

/* ---------------------------------------------------------- ls options */
t('ls home', 'cd ~ && ls', has('Documents'));
t('ls -a shows hidden', 'ls -a', has('.bashrc'));
t('ls hides hidden by default', 'ls', notHas('.bashrc'));
t('ls -l has perms', 'ls -l', has('drwxr-xr-x'));
t('ls -lh human', 'ls -lh Documents', has('notes.txt'));

/* ------------------------------------------------------- file creation */
t('mkdir', 'mkdir Project-Atlas', '');
t('cd into new dir', 'cd Project-Atlas', '');
t('mkdir many', 'mkdir frontend backend docs assets', '');
t('touch', 'touch README.md', '');
t('ls sees all five', 'ls', (g) =>
  ['frontend', 'backend', 'docs', 'assets', 'README.md'].every((n) => g.includes(n))
);
t('mkdir -p deep', 'mkdir -p backend/controllers/v1', '');
t('mkdir existing errors', 'mkdir frontend', has('File exists'));
t('backend structure', 'cd backend && mkdir routes models && touch app.js && ls', has('app.js'));

/* --------------------------------------------------------- cp / mv / rm */
t('back to project', 'cd ~/Project-Atlas', '');
t('touch setup', 'touch setup.md', '');
t('mv into folder', 'mv setup.md docs/', '');
t('setup moved', 'ls docs', 'setup.md\n');
t('setup gone from root', 'ls', notHas('setup.md'));
t('mv rename', 'mv README.md README_PROJECT.md', '');
t('rename took effect', 'ls', has('README_PROJECT.md'));
t('cp keeps original', 'cp README_PROJECT.md README_BACKUP.md', '');
t('both exist', 'ls', (g) => g.includes('README_PROJECT.md') && g.includes('README_BACKUP.md'));
t('rm dir needs -r', 'mkdir temp && rm temp', has('Is a directory'));
t('rm -r works', 'rm -r temp', '');
t('temp gone', 'ls', notHas('temp'));
t('rm / is blocked', 'rm -rf /', has('refusing to remove'));
t('cp -r folder', 'cp -r docs docs-backup && ls docs-backup', 'setup.md\n');

/* ------------------------------------------------------------ inspection */
t('heredoc creates file', 'cd ~ && cat > application.log <<EOF\nINFO Server Started\nINFO Database Connected\nERROR Password Incorrect\nINFO Retry Login\nEOF', '');
t('cat reads it', 'cat application.log', has('ERROR Password Incorrect'));
t('head -n 1', 'head -n 1 application.log', 'INFO Server Started\n');
t('tail -n 1', 'tail -n 1 application.log', 'INFO Retry Login\n');
t('wc -l', 'wc -l application.log', has('4'));
t('wc all three', 'wc application.log', (g) => g.trim().split(/\s+/).length >= 4);

/* ------------------------------------------------------- the atlas log */
t('log has 46 lines', 'wc -l assets/atlas-server.log', has('46'));
t('11 errors', 'grep -c ERROR assets/atlas-server.log', '11\n');
t('2 payment failures', 'grep "Payment Failed" assets/atlas-server.log | wc -l', has('2'));
t('first entry', 'head -n 1 assets/atlas-server.log', has('Atlas server starting'));
t('last entry', 'tail -n 1 assets/atlas-server.log', has('steady state'));
t('grep -n gives numbers', 'grep -n "Token Expired" assets/atlas-server.log', has('24:'));
t('grep -i case insensitive', 'grep -ic error assets/atlas-server.log', '11\n');
t('grep -v excludes', 'grep -v INFO assets/atlas-server.log | wc -l', (g) => parseInt(g.trim(), 10) === 12);

/* -------------------------------------------------------- search lab */
t('enter lab', 'cd ~/assets/atlas-search-lab', '');
t('find login.js finds two', 'find . -name "login.js"', (g) => g.trim().split('\n').length === 2);
t('find README', 'find . -name "README.md"', './README.md\n');
t('find config.json', 'find . -name "config.json"', './config/config.json\n');
t('find -type d', 'find . -type d', has('./backend/auth'));
t('grep -r JWT_SECRET', 'grep -r "JWT_SECRET" .', (g) => g.split('\n').filter(Boolean).length >= 4);
t('grep -r TODO', 'grep -r "TODO" .', (g) => g.split('\n').filter(Boolean).length >= 3);
t('wildcard *.js', 'ls backend/auth/*.js', (g) => g.includes('authController.js') && g.includes('login.js'));
t('find piped to grep', 'find . -name "*.js" | grep login', (g) => g.includes('login.js'));

/* ------------------------------------------------------------- pipes */
t('sort uniq count', 'cd ~ && grep ERROR assets/atlas-server.log | cut -d " " -f 1 | sort | uniq -c', has('11'));
t('redirect to file', 'grep ERROR assets/atlas-server.log > errors.txt', '');
t('redirect wrote it', 'wc -l errors.txt', has('11'));
t('append', 'echo "extra" >> errors.txt && tail -n 1 errors.txt', 'extra\n');
t('chain with &&', 'mkdir chain-test && cd chain-test && pwd', '/home/student/chain-test\n');
t('|| on failure', 'cd /nope || echo "fallback"', has('fallback'));
t('semicolon runs both', 'cd ~ ; pwd', '/home/student\n');

/* ------------------------------------------------- permissions & process */
t('setup demo', 'mkdir -p permissions-demo && cd permissions-demo && touch deploy.sh', '');
t('default not executable', 'ls -l deploy.sh', has('-rw-r--r--'));
t('chmod +x', 'chmod +x deploy.sh', '');
t('now executable', 'ls -l deploy.sh', has('-rwxr-xr-x'));
t('chmod 644 back', 'chmod 644 deploy.sh', '');
t('back to rw', 'ls -l deploy.sh', has('-rw-r--r--'));
t('chmod 755', 'chmod 755 deploy.sh', '');
t('755 is rwxr-xr-x', 'ls -l deploy.sh', has('-rwxr-xr-x'));
t('chmod u+x g-w', 'chmod u+x,g-w deploy.sh', '');
t('chown', 'chown student:student deploy.sh', '');
t('ps lists bash', 'ps', has('bash'));
t('ps aux wider', 'ps aux', has('%CPU'));
t('background sleep', 'sleep 300 &', (g) => /^\[1\] \d+\n$/.test(g));
t('ps shows sleep', 'ps', has('sleep'));
t('jobs lists it', 'jobs', has('sleep 300'));
t('kill system pid refused', 'kill 1', has('Operation not permitted'));
t('kill unknown pid', 'kill 99999', has('No such process'));

const sleepPid = shell.processes[0].pid;
t('kill our sleep', `kill ${sleepPid}`, has('Terminated'));
t('sleep gone', 'ps', notHas('sleep'));

/* -------------------------------------------------------- aliases etc */
t('alias set', 'alias ll="ls -lah"', '');
t('alias works', 'cd ~ && ll', has('drwxr-xr-x'));
t('alias listed', 'alias', has("alias ll='ls -lah'"));
t('alias with cd', 'alias atlas="cd ~/Project-Atlas" && atlas && pwd', '/home/student/Project-Atlas\n');
t('unalias', 'unalias ll && ll', has('command not found'));
t('history not empty', 'history | wc -l', (g) => parseInt(g.trim(), 10) > 10);
t('bang bang repeats', 'cd ~ && pwd', '/home/student\n');
t('!! reruns', '!!', has('/home/student'));

t('bashrc alias persists via source', 'echo \'alias gs="echo git status"\' >> ~/.bashrc && source ~/.bashrc && gs', has('git status'));

/* ------------------------------------------------------ treasure hunt */
t('hunt start', 'cd ~/TreasureHunt && ls', (g) => g.includes('Castle') && g.includes('Village'));
t('wrong turn', 'cd Village && ls', 'notice.txt\n');
t('back and into castle', 'cd .. && cd Castle && ls', (g) => g.includes('Secret'));
t('treasure', 'cd Secret && cat Treasure.txt', has('You found it'));

/* ------------------------------------------------- escape the directory */
t('deep in docs', 'cd ~/ProjectAtlas/docs/tutorial/setup/linux && pwd', has('/docs/tutorial/setup/linux'));
t('escape with relative path', 'cd ../../../../frontend && pwd', '/home/student/ProjectAtlas/frontend\n');

/* --------------------------------------------------------- local bandit */
t('bandit 0', 'cd ~/bandit/level0 && cat readme', has('boJ9jbbUNNfktd78OOpsqOltutMc3MY1'));
t('bandit 1 dash file', 'cd ../level1 && cat ./-', has('CV1DtqXWVFXTvM2F0k09SHz0YwRINYA9'));
t('bandit 2 spaces', 'cd ../level2 && cat "spaces in this filename"', has('UmHadQclWmgdLOKQ3YNgjWxGoRMb5luK'));
t('bandit 3 hidden', 'cd ../level3/inhere && ls -a', has('.hidden'));
t('bandit 3 read', 'cat .hidden', has('pIwrPrtPN36QITSp3EQaw936yaFoFgAB'));
t('bandit 5 find by size', 'cd ~/bandit/level5 && find . -type f -size +1000c', has('maybehere02'));

/* ------------------------------------------------------------ autocorrect */
function ac(label, input, expectType, expectCorrected) {
  const s = shell.check(input);
  const okResult =
    expectType === null
      ? s === null
      : !!s && s.type === expectType && (!expectCorrected || s.corrected === expectCorrected);
  if (okResult) pass++;
  else {
    fail++;
    console.log(`FAIL  autocorrect ${label}`);
    console.log(`  input: ${JSON.stringify(input)}`);
    console.log(`  got:   ${JSON.stringify(s)}`);
    console.log(`  want:  type=${expectType} corrected=${expectCorrected}`);
  }
}

shell.run('cd ~');
ac('typo pdw', 'pdw', 'command', 'pwd');
ac('typo sl', 'sl', 'command', 'ls');
ac('typo mkidr', 'mkidr test', 'command', 'mkdir test');
ac('dos dir', 'dir', 'dos', 'ls');
ac('dos cls', 'cls', 'dos', 'clear');
ac('dos del', 'del notes.txt', 'dos', 'rm notes.txt');
ac('dos copy', 'copy a b', 'dos', 'cp a b');
ac('no space cd..', 'cd..', 'spacing', 'cd ..');
ac('no space ls-l', 'ls-l', 'spacing', 'ls -l');
ac('bad flag', 'ls -z', 'flag');
ac('path typo', 'cd Downlods', 'path', 'cd Downloads');
ac('case typo', 'cd downloads', 'case', 'cd Downloads');
ac('cd into file', 'cd .bashrc', 'usage', 'cat .bashrc');
ac('rm needs -r', 'rm Documents', 'usage', 'rm -r Documents');
ac('nothing wrong', 'ls -la', null);

const clean = shell.check('pwd');
if (clean === null) pass++;
else {
  fail++;
  console.log('FAIL  autocorrect should stay quiet on valid input:', clean);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
