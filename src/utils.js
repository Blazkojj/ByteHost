export const statusTheme = {
  ONLINE: "success",
  OFFLINE: "muted",
  ERROR: "danger",
  EXPIRED: "warning",
  "CRASH LOOP": "danger"
};

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
    return "Wygasł";
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
