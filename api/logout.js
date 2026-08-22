import { json, handler, methodGuard, clearSessionCookie } from './_lib/core.js';

export default handler(async (req, res) => {
  if (!methodGuard(req, res, 'POST')) return;
  clearSessionCookie(res);
  json(res, 200, { ok: true });
});
