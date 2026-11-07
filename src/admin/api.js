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
  missingTitles: () => request('GET', '/api/admin/missing-titles'),
  missingDismiss: (items) => request('POST', '/api/admin/missing-titles/dismiss', { items }),
  catalogSearch: (q, type = 'anime') => request('GET', `/api/admin/catalog/search?q=${encodeURIComponent(q)}&type=${type}`),
  catalogImport: (malId, currentSlug = '') => request('POST', '/api/admin/catalog/import', { malId, currentSlug }),
  bulkImport: ({ from, to, mediaType, preview, ids, discover, genre, year, minScore }) => request('POST', '/api/admin/anime/import-bulk', {
    ...(from !== undefined ? { from, to } : {}),
    ...(ids !== undefined ? { ids } : {}),
    ...(discover ? { discover: true, genre, year, minScore } : {}),
    ...(preview ? { preview: true } : {}),
    mediaType,
  }),
  // Queue 25: manga management.
  mangaList: () => request('GET', '/api/manga'),
  mangaPage: (q, page) => request('GET', `/api/admin/manga?q=${encodeURIComponent(q)}&page=${page}&limit=20`),
  mangaRemove: (slug) => request('DELETE', `/api/admin/manga/${encodeURIComponent(slug)}`),
  mangaUpdate: (slug, patch) => request('PATCH', `/api/admin/manga/${encodeURIComponent(slug)}`, patch),
  mangaRefresh: (slug) => request('POST', `/api/admin/manga/${encodeURIComponent(slug)}/refresh`),
  mangaRefreshAll: () => request('POST', '/api/admin/manga/refresh-all'),
  mangaRefreshAllStatus: () => request('GET', '/api/admin/manga/refresh-all'),
  setMangaBilingual: (slug, { titleFa, synopsisFa }) => request('PATCH', `/api/admin/manga/${slug}`, { titleFa, synopsisFa }),
  refresh: (slug) => request('POST', `/api/admin/anime/${encodeURIComponent(slug)}/refresh`),
  refreshAll: () => request('POST', '/api/admin/anime/refresh-all'),
  refreshAllStatus: () => request('GET', '/api/admin/anime/refresh-all'),
  // Persian backfill job (local NLLB engine): one bounded slice per call.
  reviewList: (params = {}) => request('GET', `/api/admin/translate/review?${new URLSearchParams(params)}`),
  reviewAct: (media, slug, body) => request('POST', `/api/admin/translate/review/${media}/${encodeURIComponent(slug)}`, body),
  reviewBulk: (items) => request('POST', '/api/admin/translate/review-bulk', { items }),
  translateStatus: () => request('GET', '/api/admin/translate/status'),
  vpnGet: () => request('GET', '/api/admin/vpn'),
  vpnApply: (kind, config) => request('POST', '/api/admin/vpn', { kind, config }),
  vpnActivate: (kind) => request('POST', '/api/admin/vpn/activate', { kind }),
  vpnTest: () => request('POST', '/api/admin/vpn/test'),
  vpnTurnOff: () => request('DELETE', '/api/admin/vpn'),
  vpnDeleteProfile: (kind) => request('DELETE', `/api/admin/vpn/${kind}`),
  health: () => request('GET', '/api/admin/health'),
  healthProbe: () => request('POST', '/api/admin/health/probe', {}),
  autoImportGet: () => request('GET', '/api/admin/auto-import'),
  autoImportSet: (enabled) => request('POST', '/api/admin/auto-import', { enabled }),
  autoImportRun: () => request('POST', '/api/admin/auto-import/run'),
  importAllGet: () => request('GET', '/api/admin/import-all'),
  importAllDo: (action) => request('POST', '/api/admin/import-all', { action }),
  backfill: (body = {}) => request('POST', '/api/admin/translate/backfill', body),
  // Site-user management
  reviewsList: (q, page) => request('GET', `/api/admin/reviews?q=${encodeURIComponent(q)}&page=${page}&limit=15`),
  suggestionsList: (status) => request('GET', `/api/admin/suggestions?status=${status}`),
  suggestionApprove: (id) => request('POST', `/api/admin/suggestions/${id}/approve`, {}),
  suggestionReject: (id, reason) => request('POST', `/api/admin/suggestions/${id}/reject`, { reason }),
  reviewsRemove: (id) => request('DELETE', `/api/admin/reviews/${id}`),
  recsList: (q, page) => request('GET', `/api/admin/recs?q=${encodeURIComponent(q)}&page=${page}&limit=15`),
  recsRemove: (id) => request('DELETE', `/api/admin/recs/${id}`),
  usersList: (q, page) => request('GET', `/api/admin/users?q=${encodeURIComponent(q)}&page=${page}&limit=15`),
  usersGet: (username) => request('GET', `/api/admin/users/${encodeURIComponent(username)}`),
  usersCreate: (payload) => request('POST', '/api/admin/users', payload),
  usersPatch: (username, payload) => request('PATCH', `/api/admin/users/${encodeURIComponent(username)}`, payload),
  usersRemove: (username) => request('DELETE', `/api/admin/users/${encodeURIComponent(username)}`),
  usersRemoveEntry: (username, mediaType, slug) => request('DELETE', `/api/admin/users/${encodeURIComponent(username)}/entries/${mediaType}/${encodeURIComponent(slug)}`),
  stats: () => request('GET', '/api/admin/stats'),
};

// Starts a server-side bulk job and polls it until it finishes (a single long request would be cut by the CDN).
// A few failed polls in a row are tolerated: the job keeps running on the server.
export async function runBulkJob(start, status, onProgress) {
  let state = await start();
  let misses = 0;
  while (state.running) {
    onProgress?.(state);
    await new Promise((resolve) => { setTimeout(resolve, 2000); });
    try {
      state = await status();
      misses = 0;
    } catch (error) {
      misses += 1;
      if (misses >= 8) throw error;
    }
  }
  return state;
}
