// Tests the auth logic that does not need a database.
// Run with: node scripts/api-test.mjs

process.env.JWT_SECRET = 'test-secret-value-for-local-verification-only';

const {
  normalisePhone,
  validateName,
  validatePassword,
  hashPassword,
  verifyPassword,
  createSession,
  readSession,
  setSessionCookie,
  clearSessionCookie
} = await import('../api/_lib/core.js');

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) pass++;
  else {
    fail++;
    console.log(`FAIL  ${label}\n  got:      ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  }
}

function truthy(label, value) {
  if (value) pass++;
  else {
    fail++;
    console.log(`FAIL  ${label} (expected truthy, got ${JSON.stringify(value)})`);
  }
}

/* ---------------------------------------------------------------- phone --- */

check('plain 10-digit', normalisePhone('9876543210'), '9876543210');
check('with spaces', normalisePhone('98765 43210'), '9876543210');
check('with country code', normalisePhone('+91 98765 43210'), '9876543210');
check('country code, no spaces', normalisePhone('+919876543210'), '9876543210');
check('country code without plus', normalisePhone('919876543210'), '9876543210');
check('leading zero dropped', normalisePhone('09876543210'), '9876543210');
check('with dashes', normalisePhone('98765-43210'), '9876543210');
check('with brackets', normalisePhone('(987) 654-3210'), '9876543210');
check('too short', normalisePhone('12345'), null);
check('too long', normalisePhone('1234567890123456'), null);
check('letters rejected', normalisePhone('98765abcde'), null);
check('empty rejected', normalisePhone(''), null);
check('non-string rejected', normalisePhone(null), null);

// The same human number typed two ways must land on one account.
check(
  'spacing does not create a second account',
  normalisePhone('98765 43210') === normalisePhone('9876543210'),
  true
);

// Every way a person might type one number has to reach one account.
const oneNumber = [
  '9876543210',
  '98765 43210',
  '98765-43210',
  '+91 98765 43210',
  '+919876543210',
  '919876543210',
  '09876543210'
].map(normalisePhone);
check('all spellings of one number agree', new Set(oneNumber).size, 1);

// But a genuinely different number must stay different.
check('different numbers stay apart', normalisePhone('9876543210') === normalisePhone('9876543211'), false);
check('short numbers untouched', normalisePhone('918765432'), '918765432');

/* ----------------------------------------------------------------- name --- */

check('name trimmed', validateName('  Aditya Sharma  '), 'Aditya Sharma');
check('inner spaces collapsed', validateName('Aditya    Sharma'), 'Aditya Sharma');
check('single char rejected', validateName('A'), null);
check('empty rejected', validateName('   '), null);
check('very long rejected', validateName('x'.repeat(61)), null);

/* ------------------------------------------------------------- password --- */

check('8 chars accepted', validatePassword('12345678'), '12345678');
check('7 chars rejected', validatePassword('1234567'), null);
check('non-string rejected', validatePassword(12345678), null);

const hash = await hashPassword('correct horse battery');
truthy('hash is produced', typeof hash === 'string' && hash.length > 20);
check('hash is not the plaintext', hash === 'correct horse battery', false);
check('correct password verifies', await verifyPassword('correct horse battery', hash), true);
check('wrong password rejected', await verifyPassword('wrong password here', hash), false);

const hash2 = await hashPassword('correct horse battery');
check('same password hashes differently (salted)', hash === hash2, false);
check('both salted hashes still verify', await verifyPassword('correct horse battery', hash2), true);

/* -------------------------------------------------------------- session --- */

const userId = '11111111-2222-3333-4444-555555555555';
const token = await createSession(userId);
truthy('token produced', typeof token === 'string' && token.split('.').length === 3);

const fakeReq = (cookie) => ({ headers: { cookie } });
check('valid cookie resolves to user', await readSession(fakeReq(`linuxlab_session=${token}`)), userId);
check('no cookie resolves to null', await readSession(fakeReq('')), null);
check('junk cookie resolves to null', await readSession(fakeReq('linuxlab_session=nonsense')), null);
check('other cookies ignored', await readSession(fakeReq('theme=dark; other=1')), null);
check(
  'session found among several cookies',
  await readSession(fakeReq(`theme=dark; linuxlab_session=${token}; x=1`)),
  userId
);

// A token signed with a different secret must be rejected.
process.env.JWT_SECRET = 'a-completely-different-secret-value-here';
check('token from another secret rejected', await readSession(fakeReq(`linuxlab_session=${token}`)), null);
process.env.JWT_SECRET = 'test-secret-value-for-local-verification-only';

/* --------------------------------------------------------------- cookie --- */

let captured = null;
const fakeRes = { setHeader: (_k, v) => (captured = v) };

setSessionCookie(fakeRes, token);
truthy('cookie is HttpOnly', /HttpOnly/.test(captured));
truthy('cookie is SameSite=Lax', /SameSite=Lax/.test(captured));
truthy('cookie has a Max-Age', /Max-Age=\d+/.test(captured));
truthy('cookie is scoped to the whole site', /Path=\//.test(captured));

clearSessionCookie(fakeRes);
truthy('logout expires the cookie', /Max-Age=0/.test(captured));

process.env.VERCEL = '1';
setSessionCookie(fakeRes, token);
truthy('cookie is Secure in production', /Secure/.test(captured));
delete process.env.VERCEL;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
