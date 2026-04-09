export const statusTheme = {
  ONLINE: "success",
  OFFLINE: "muted",
  ERROR: "danger",
  EXPIRED: "warning",
  "CRASH LOOP": "danger"
};

const MB_PER_GB = 1024;

export function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return `0${suffix}`;
  }

  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`;
}

export function formatDate(value) {
  if (!value) {
    return "Brak";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Brak";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function formatCountdown(value) {
  if (!value) {
    return "Bez limitu";
  }

  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) {
    return "Wygasl";
  }

  return formatDuration(Math.floor(diff / 1000));
}

export function toDatetimeLocal(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input) => String(input).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocal(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

export function serviceTypeLabel(serviceType) {
  if (serviceType === "minecraft_server") {
    return "Serwer Minecraft";
  }

  return "Bot Discord";
}

export function serviceArtifactLabel(serviceType) {
  if (serviceType === "minecraft_server") {
    return "Plik serwera (JAR / ZIP / RAR)";
  }

  return "Archiwum projektu (ZIP / RAR)";
}

export function serviceJoinAddress(service) {
  if (service?.service_type !== "minecraft_server" || !service.public_host) {
    return "Brak";
  }

  const port = service.public_port || 25565;
  return port === 25565 ? service.public_host : `${service.public_host}:${port}`;
}

export function accountStatusLabel(status) {
  switch (status) {
    case "ACTIVE":
      return "Aktywne";
    case "PENDING_APPROVAL":
      return "Czeka na aktywacje";
    case "EXPIRED":
      return "Wygasle";
    case "INACTIVE":
      return "Nieaktywne";
    default:
      return "Nieznany";
  }
}

export function userRoleLabel(role) {
  return role === "owner" ? "Owner" : "Uzytkownik";
}

export function formatLimitValue(value, suffix = "") {
  if (value === null || value === undefined || Number(value) === 0) {
    return "Bez limitu";
  }

  return formatNumber(value, suffix);
}

export function formatMemoryFromMb(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0 MB";
  }

  const numeric = Number(value);
  if (numeric >= MB_PER_GB) {
    return `${new Intl.NumberFormat("pl-PL", {
      maximumFractionDigits: numeric % MB_PER_GB === 0 ? 0 : 2
    }).format(numeric / MB_PER_GB)} GB`;
  }

  return `${formatNumber(numeric, " MB")}`;
}

export function formatMemoryLimit(value) {
  if (value === null || value === undefined || Number(value) === 0) {
    return "Bez limitu";
  }

  return formatMemoryFromMb(value);
}

export function mbToGbInput(value, fallback = "") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const gbValue = numeric / MB_PER_GB;
  return String(Number.isInteger(gbValue) ? gbValue : Math.round(gbValue * 100) / 100);
}

export function gbInputToMb(value, fallback = "") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return String(Math.max(0, Math.round(numeric * MB_PER_GB)));
}
