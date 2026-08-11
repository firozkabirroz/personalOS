// Tiny fetch wrapper with auth
export function token() { return localStorage.getItem('pos_token') || ''; }
export function setToken(t) { t ? localStorage.setItem('pos_token', t) : localStorage.removeItem('pos_token'); }

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token()) headers['Authorization'] = `Bearer ${token()}`;
  const resp = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body :
      options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try { data = await resp.json(); } catch {}
  if (resp.status === 401 && !path.startsWith('/auth')) {
    setToken('');
    location.reload();
    throw new Error('Session expired');
  }
  if (!resp.ok) {
    const err = new Error(data?.error || `Request failed (${resp.status})`);
    throw err;
  }
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });
