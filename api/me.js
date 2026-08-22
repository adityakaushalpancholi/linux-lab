import {
  db,
  json,
  handler,
  methodGuard,
  readSession,
  publicUser,
  accountsConfigured
} from './_lib/core.js';

// Called on page load: who is signed in, and where did they leave off?
export default handler(async (req, res) => {
  if (!methodGuard(req, res, 'GET')) return;

  const accountsReady = accountsConfigured();
  if (!accountsReady) return json(res, 200, { user: null, progress: null, accountsReady: false });

  const userId = await readSession(req);
  if (!userId) return json(res, 200, { user: null, progress: null, accountsReady: true });

  const supabase = db();
  const { data: user } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (!user) return json(res, 200, { user: null, progress: null, accountsReady: true });

  const { data: progress } = await supabase
    .from('progress')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();

  json(res, 200, { user: publicUser(user), progress: progress?.state ?? null, accountsReady: true });
});
