(function initMiniadsAdminAuth(global) {
  const defaults = {
    email: "",
    password: "",
    sessionKey: "miniads-admin-session"
  };

  const existing = global.MINIADS_ADMIN_AUTH && typeof global.MINIADS_ADMIN_AUTH === "object"
    ? global.MINIADS_ADMIN_AUTH
    : {};

  const config = {
    email: existing.email || defaults.email,
    password: existing.password || defaults.password,
    sessionKey: existing.sessionKey || defaults.sessionKey
  };

  global.MINIADS_ADMIN_AUTH = Object.freeze(config);
})(window);
