const crypto = require("crypto");

function createHttpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) {
    error.details = details;
  }

  return error;
}

function coerceBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function coerceNullableNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceNullableString(value, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeRelativePath(value) {
  if (!value) {
    return "";
  }

  return String(value).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function nowIso() {
  return new Date().toISOString();
}

function toMb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function fromMb(value) {
  return Number(value || 0) * 1024 * 1024;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function randomId() {
  return crypto.randomUUID();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

module.exports = {
  createHttpError,
  coerceBoolean,
  coerceNullableNumber,
  coerceNullableString,
  normalizeRelativePath,
  nowIso,
  toMb,
  fromMb,
  round,
  randomId,
  slugify
};
