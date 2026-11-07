// Extra endpoints for the "catalog" admin pages. Add new routes under /api/admin/x/catalog/... only:
// the permission gate (server/admin-accounts.js) reads the area from that path (GET = view, other = edit).
export const register = (app) => {
  void app;
};
