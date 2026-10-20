export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const request = async (method, url, body) => {
  const isForm = body instanceof FormData;
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : {},
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', 0, null);
  }
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  if (!response.ok) {
    if (response.status === 401 && !url.includes('/auth/')) window.dispatchEvent(new Event('admin-unauthorized'));
    throw new ApiError(data?.error || response.statusText, response.status, data);
  }
  return data;
};

export const api = {
  me: () => request('GET', '/api/auth/me'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  logout: () => request('POST', '/api/auth/logout'),
  list: (q, page) => request('GET', `/api/admin/anime?q=${encodeURIComponent(q)}&page=${page}&limit=15`),
  get: (slug) => request('GET', `/api/anime/${encodeURIComponent(slug)}`),
  create: (payload) => request('POST', '/api/anime', payload),
  update: (slug, payload) => request('PUT', `/api/anime/${encodeURIComponent(slug)}`, payload),
  setAiringDay: (slug, airingDay) => request('PATCH', `/api/admin/anime/${encodeURIComponent(slug)}/airing-day`, { airingDay }),
  remove: (slug) => request('DELETE', `/api/anime/${encodeURIComponent(slug)}`),
  uploadCover: (slug, file) => {
    const form = new FormData();
    form.append('cover', file);
    return request('POST', `/api/anime/${encodeURIComponent(slug)}/cover`, form);
  },
  jikanSearch: (q) => request('GET', `/api/admin/jikan/search?q=${encodeURIComponent(q)}`),
  jikanImport: (malId, currentSlug = '') => request('POST', '/api/admin/jikan/import', { malId, currentSlug }),
  bulkImport: ({ from, to, mediaType, preview, ids, discover, genre, year, minScore }) => request('POST', '/api/admin/anime/import-bulk', {
    ...(from !== undefined ? { from, to } : {}),
    ...(ids !== undefined ? { ids } : {}),
    ...(discover ? { discover: true, genre, year, minScore } : {}),
    ...(preview ? { preview: true } : {}),
    mediaType,
  }),
  // Queue 25: manga management.
  mangaList: () => request('GET', '/api/manga'),
  mangaRemove: (slug) => request('DELETE', `/api/admin/manga/${encodeURIComponent(slug)}`),
  mangaUpdate: (slug, patch) => request('PATCH', `/api/admin/manga/${encodeURIComponent(slug)}`, patch),
  mangaRefresh: (slug) => request('POST', `/api/admin/manga/${encodeURIComponent(slug)}/refresh`),
  mangaRefreshAll: () => request('POST', '/api/admin/manga/refresh-all'),
  setMangaBilingual: (slug, { titleFa, synopsisFa }) => request('PATCH', `/api/admin/manga/${slug}`, { titleFa, synopsisFa }),
  refresh: (slug) => request('POST', `/api/admin/anime/${encodeURIComponent(slug)}/refresh`),
  refreshAll: () => request('POST', '/api/admin/anime/refresh-all'),
  // Site-user management
  usersList: (q, page) => request('GET', `/api/admin/users?q=${encodeURIComponent(q)}&page=${page}&limit=15`),
  usersGet: (username) => request('GET', `/api/admin/users/${encodeURIComponent(username)}`),
  usersCreate: (payload) => request('POST', '/api/admin/users', payload),
  usersPatch: (username, payload) => request('PATCH', `/api/admin/users/${encodeURIComponent(username)}`, payload),
  usersRemove: (username) => request('DELETE', `/api/admin/users/${encodeURIComponent(username)}`),
  usersRemoveEntry: (username, mediaType, slug) => request('DELETE', `/api/admin/users/${encodeURIComponent(username)}/entries/${mediaType}/${encodeURIComponent(slug)}`),
  stats: () => request('GET', '/api/admin/stats'),
};
