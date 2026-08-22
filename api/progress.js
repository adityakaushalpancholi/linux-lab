import { db, json, body, handler, methodGuard, readSession } from './_lib/core.js';

// The client sends its whole state snapshot here, debounced. Keeping it as one
// JSONB blob means the schema never has to change when a lesson is added.
const MAX_BYTES = 900_000;

export default handler(async (req, res) => {
  if (!methodGuard(req, res, 'PUT', 'GET')) return;

  const userId = await readSession(req);
  if (!userId) return json(res, 401, { error: 'Not signed in.' });

  const supabase = db();

  if (req.method === 'GET') {
    const { data } = await supabase
      .from('progress')
      .select('state, tasks_done, tasks_total, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    return json(res, 200, data ?? { state: null });
  }

  const input = await body(req);
  const state = input.state;

  if (!state || typeof state !== 'object') {
    return json(res, 400, { error: 'Expected a state object.' });
  }

  if (JSON.stringify(state).length > MAX_BYTES) {
    return json(res, 413, {
      error: 'That progress snapshot is too large to store. Try Reset in the header.'
    });
  }

  const tasksDone = Number.isFinite(input.tasksDone) ? input.tasksDone : 0;
  const tasksTotal = Number.isFinite(input.tasksTotal) ? input.tasksTotal : 0;

  const { error } = await supabase.from('progress').upsert(
    {
      user_id: userId,
      state,
      tasks_done: tasksDone,
      tasks_total: tasksTotal,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  );

  if (error) return json(res, 500, { error: 'Could not save your progress.' });

  json(res, 200, { ok: true, savedAt: new Date().toISOString() });
});
