// Extra endpoints for the "system" admin pages. Add new routes under /api/admin/x/system/... only:
// the permission gate (server/admin-accounts.js) reads the area from that path (GET = view, other = edit).
export const register = (app) => {
  void app;
};
