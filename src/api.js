const TOKEN_STORAGE_KEY = "bytehost.jwt";

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function setStoredToken(token) {
  if (!token) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function emitUnauthorized() {
  window.dispatchEvent(new Event("bytehost:unauthorized"));
}

function buildWebSocketUrl(pathname) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(pathname, `${protocol}//${window.location.host}`);
  const token = getStoredToken();

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}

async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const token = options.skipAuth ? "" : getStoredToken();
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(payload?.error || "Wystapil blad zadania.");
    error.statusCode = response.status;
    error.details = payload?.details || null;

    if (response.status === 401) {
      clearStoredToken();
      emitUnauthorized();
    }

    throw error;
  }

  return payload;
}

export const api = {
  getAuthToken: getStoredToken,
  setAuthToken: setStoredToken,
  clearAuthToken: clearStoredToken,
  login: (payload) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true
    }),
  register: (payload) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true
    }),
  getMe: () => request("/api/auth/me"),
  getBots: () => request("/api/bots"),
  createBot: (formData) => request("/api/bots", { method: "POST", body: formData }),
  updateBotArchive: (id, formData) =>
    request(`/api/bots/${id}/archive`, { method: "POST", body: formData }),
  getBotBackups: (id) => request(`/api/bots/${id}/backups`),
  createBotBackup: (id, payload) =>
    request(`/api/bots/${id}/backups`, { method: "POST", body: JSON.stringify(payload) }),
  restoreBotBackup: (id, backupId, payload = {}) =>
    request(`/api/bots/${id}/backups/${backupId}/restore`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteBotBackup: (id, backupId) =>
    request(`/api/bots/${id}/backups/${backupId}`, { method: "DELETE" }),
  getBot: (id) => request(`/api/bots/${id}`),
  updateBot: (id, payload) =>
    request(`/api/bots/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteBot: (id) => request(`/api/bots/${id}`, { method: "DELETE" }),
  startBot: (id) => request(`/api/bots/${id}/start`, { method: "POST" }),
  stopBot: (id) => request(`/api/bots/${id}/stop`, { method: "POST" }),
  restartBot: (id) => request(`/api/bots/${id}/restart`, { method: "POST" }),
  installBot: (id) => request(`/api/bots/${id}/install`, { method: "POST" }),
  runConsoleCommand: (id, payload) =>
    request(`/api/bots/${id}/console`, { method: "POST", body: JSON.stringify(payload) }),
  searchMinecraftAddons: (id, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    });
    return request(`/api/bots/${id}/minecraft-addons?${query.toString()}`);
  },
  getMinecraftAddonVersions: (id, projectId, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    });
    return request(
      `/api/bots/${id}/minecraft-addons/${encodeURIComponent(projectId)}/versions?${query.toString()}`
    );
  },
  installMinecraftAddon: (id, payload) =>
    request(`/api/bots/${id}/minecraft-addons/install`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getLogs: (id) => request(`/api/bots/${id}/logs`),
  getTerminalSocketUrl: (id) =>
    buildWebSocketUrl(`/api/bots/${encodeURIComponent(id)}/terminal`),
  getFiles: (id, relativePath = "") =>
    request(`/api/bots/${id}/files?path=${encodeURIComponent(relativePath)}`),
  createFile: (id, payload) =>
    request(`/api/bots/${id}/files`, { method: "POST", body: JSON.stringify(payload) }),
  updateFile: (id, payload) =>
    request(`/api/bots/${id}/files`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteFile: (id, relativePath) =>
    request(`/api/bots/${id}/files?path=${encodeURIComponent(relativePath)}`, {
      method: "DELETE"
    }),
  uploadFiles: (id, formData) =>
    request(`/api/bots/${id}/upload`, { method: "POST", body: formData }),
  updateEnv: (id, content) =>
    request(`/api/bots/${id}/env`, {
      method: "PATCH",
      body: JSON.stringify({ content })
    }),
  getSystemStats: () => request("/api/system/stats"),
  getMinecraftVersions: () => request("/api/system/minecraft-versions"),
  updateSystemLimits: (payload) =>
    request("/api/system/limits", { method: "PATCH", body: JSON.stringify(payload) }),
  getUsers: () => request("/api/admin/users"),
  createUser: (payload) =>
    request("/api/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) =>
    request(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: "DELETE" })
};
