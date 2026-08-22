import {
  db,
  json,
  body,
  handler,
  methodGuard,
  verifyPassword,
  hashPassword,
  createSession,
  setSessionCookie,
  normalisePhone,
  validatePassword,
  publicUser
} from './_lib/core.js';

export default handler(async (req, res) => {
  if (!methodGuard(req, res, 'POST')) return;

  const input = await body(req);
  const phone = normalisePhone(input.phone);
  const password = typeof input.password === 'string' ? input.password : '';

  if (!phone || !password) {
    return json(res, 400, { error: 'Enter your phone number and password.' });
  }

  const supabase = db();
  const { data: user } = await supabase.from('users').select('*').eq('phone', phone).maybeSingle();

  // Same message either way, so this cannot be used to discover which numbers
  // have accounts.
  const wrong = { error: 'Wrong phone number or password.' };

  if (!user) return json(res, 401, wrong);

  // The dashboard reset path: an admin flips reset_pending, and the next
  // sign-in sets whatever password they type as the new one.
  if (user.reset_pending) {
    const fresh = validatePassword(input.password);
    if (!fresh) {
      return json(res, 400, {
        error: 'Your password was reset. Choose a new one, at least 8 characters.',
        field: 'password',
        resetPending: true
      });
    }
    await supabase
      .from('users')
      .update({
        password_hash: await hashPassword(fresh),
        reset_pending: false,
        last_seen_at: new Date().toISOString()
      })
      .eq('id', user.id);

    setSessionCookie(res, await createSession(user.id));
    const { data: progress } = await supabase
      .from('progress')
      .select('state')
      .eq('user_id', user.id)
      .maybeSingle();
    return json(res, 200, {
      user: publicUser(user),
      progress: progress?.state ?? null,
      passwordWasReset: true
    });
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    return json(res, 401, wrong);
  }

  await supabase
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id);

  const { data: progress } = await supabase
    .from('progress')
    .select('state')
    .eq('user_id', user.id)
    .maybeSingle();

  setSessionCookie(res, await createSession(user.id));
  json(res, 200, { user: publicUser(user), progress: progress?.state ?? null });
});
