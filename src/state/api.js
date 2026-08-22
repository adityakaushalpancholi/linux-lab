// Talks to the serverless API. Every call returns { ok, data, error } so
// callers never have to think about exceptions or status codes.

async function call(path, { method = 'GET', payload } = {}) {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    });

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // An HTML error page, which means the API route is not deployed.
      return { ok: false, error: 'The server is not reachable right now.', offline: true };
    }

    if (!res.ok) {
      // 5xx means the API exists but cannot serve, usually because the
      // database keys are not configured yet. Treat it like being offline so
      // the app degrades to local-only instead of locking everybody out.
      return {
        ok: false,
        error: data.error || 'Something went wrong.',
        field: data.field,
        offline: res.status >= 500,
        data
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'No connection. Check your internet and try again.', offline: true };
  }
}

export const api = {
  me: () => call('/api/me'),
  signup: (name, phone, password) => call('/api/signup', { method: 'POST', payload: { name, phone, password } }),
  login: (phone, password) => call('/api/login', { method: 'POST', payload: { phone, password } }),
  logout: () => call('/api/logout', { method: 'POST' }),
  saveProgress: (state, tasksDone, tasksTotal) =>
    call('/api/progress', { method: 'PUT', payload: { state, tasksDone, tasksTotal } })
};
