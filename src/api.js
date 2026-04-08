async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(payload?.error || "Wystapil blad zadania.");
  }

  return payload;
}

export const api = {
  getBots: () => request("/api/bots"),
  createBot: (formData) => request("/api/bots", { method: "POST", body: formData }),
  updateBotArchive: (id, formData) =>
    request(`/api/bots/${id}/archive`, { method: "POST", body: formData }),
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
  getLogs: (id) => request(`/api/bots/${id}/logs`),
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
    request("/api/system/limits", { method: "PATCH", body: JSON.stringify(payload) })
};
