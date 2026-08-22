import { db, json, handler, methodGuard, readSession, publicUser } from './_lib/core.js';

// Called on page load: who is signed in, and where did they leave off?
export default handler(async (req, res) => {
  if (!methodGuard(req, res, 'GET')) return;

  const userId = await readSession(req);
  if (!userId) return json(res, 200, { user: null, progress: null });

  const supabase = db();
  const { data: user } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (!user) return json(res, 200, { user: null, progress: null });

  const { data: progress } = await supabase
    .from('progress')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();

  json(res, 200, { user: publicUser(user), progress: progress?.state ?? null });
});
