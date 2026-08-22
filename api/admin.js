import {
  db,
  json,
  body,
  handler,
  methodGuard,
  isAdmin,
  adminConfigured,
  adminPasswordMatches,
  createAdminSession,
  setAdminCookie,
  clearAdminCookie
} from './_lib/core.js';

// One endpoint for the whole admin surface. Everything except `login` and
// `status` requires a valid admin cookie.
//
// Note there is deliberately no action that reveals a password. Passwords are
// bcrypt hashed and cannot be read back by anyone, including whoever runs this
// site. Resetting is the only supported recovery path.

export default handler(async (req, res) => {
  if (!methodGuard(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    return json(res, 200, {
      configured: adminConfigured(),
      signedIn: await isAdmin(req)
    });
  }

  const input = await body(req);
  const action = input.action;

  if (action === 'login') {
    if (!adminConfigured()) {
      return json(res, 503, {
        error: 'No admin password is set on this site yet. Add ADMIN_PASSWORD in Vercel.'
      });
    }
    if (!adminPasswordMatches(input.password)) {
      return json(res, 401, { error: 'Wrong admin password.' });
    }
    setAdminCookie(res, await createAdminSession());
    return json(res, 200, { ok: true });
  }

  if (action === 'logout') {
    clearAdminCookie(res);
    return json(res, 200, { ok: true });
  }

  if (!(await isAdmin(req))) {
    return json(res, 401, { error: 'Admin sign-in required.' });
  }

  const supabase = db();

  if (action === 'list') {
    const { data, error } = await supabase
      .from('class_progress')
      .select('*')
      .order('tasks_done', { ascending: false });
    if (error) return json(res, 500, { error: 'Could not load the class list.' });
    return json(res, 200, { learners: data ?? [] });
  }

  if (action === 'reset') {
    if (!input.userId) return json(res, 400, { error: 'Which learner?' });
    const { error } = await supabase
      .from('users')
      .update({ reset_pending: true })
      .eq('id', input.userId);
    if (error) return json(res, 500, { error: 'Could not flag that account for reset.' });
    return json(res, 200, {
      ok: true,
      message: 'Done. The next password they type when signing in becomes their new one.'
    });
  }

  if (action === 'clearProgress') {
    if (!input.userId) return json(res, 400, { error: 'Which learner?' });
    const { error } = await supabase
      .from('progress')
      .update({ state: {}, tasks_done: 0, tasks_total: 0, updated_at: new Date().toISOString() })
      .eq('user_id', input.userId);
    if (error) return json(res, 500, { error: 'Could not clear that progress.' });
    return json(res, 200, { ok: true, message: 'Progress cleared. The account still works.' });
  }

  if (action === 'delete') {
    if (!input.userId) return json(res, 400, { error: 'Which learner?' });
    const { error } = await supabase.from('users').delete().eq('id', input.userId);
    if (error) return json(res, 500, { error: 'Could not remove that account.' });
    return json(res, 200, { ok: true, message: 'Account and progress removed.' });
  }

  return json(res, 400, { error: `Unknown action: ${action}` });
});
