import {
  db,
  json,
  body,
  handler,
  methodGuard,
  hashPassword,
  createSession,
  setSessionCookie,
  normalisePhone,
  validateName,
  validatePassword,
  publicUser
} from './_lib/core.js';

export default handler(async (req, res) => {
  if (!methodGuard(req, res, 'POST')) return;

  const input = await body(req);
  const phone = normalisePhone(input.phone);
  const name = validateName(input.name);
  const password = validatePassword(input.password);

  if (!name) return json(res, 400, { error: 'Please enter your name.', field: 'name' });
  if (!phone) {
    return json(res, 400, {
      error: 'That phone number does not look right. Use 7 to 15 digits.',
      field: 'phone'
    });
  }
  if (!password) {
    return json(res, 400, {
      error: 'Your password needs to be at least 8 characters.',
      field: 'password'
    });
  }

  const supabase = db();

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return json(res, 409, {
      error: 'That number already has an account. Sign in instead.',
      field: 'phone'
    });
  }

  const { data: user, error } = await supabase
    .from('users')
    .insert({ phone, name, password_hash: await hashPassword(password) })
    .select()
    .single();

  if (error) {
    // A race between the check above and the insert lands here.
    if (error.code === '23505') {
      return json(res, 409, {
        error: 'That number already has an account. Sign in instead.',
        field: 'phone'
      });
    }
    return json(res, 500, { error: 'Could not create the account. Try again.' });
  }

  await supabase.from('progress').insert({ user_id: user.id, state: {} });

  setSessionCookie(res, await createSession(user.id));
  json(res, 201, { user: publicUser(user), progress: null });
});
