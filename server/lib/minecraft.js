const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const { createHttpError, coerceNullableString } = require("./utils");

const VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const PAPERMC_API_BASE = "https://fill.papermc.io/v3/projects";
const FABRIC_META_BASE = "https://meta.fabricmc.net/v2";
const PURPUR_API_BASE = "https://api.purpurmc.org/v2/purpur";
const MINECRAFT_DOWNLOAD_USER_AGENT =
  process.env.MINECRAFT_DOWNLOAD_USER_AGENT ||
  process.env.MODRINTH_USER_AGENT ||
  "Blazkoj/ByteHost/1.0 (bytehost.online)";
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000;

const MINECRAFT_SERVER_TYPES = [
  {
    id: "vanilla",
    label: "Vanilla",
    hint: "Oficjalny server.jar od Mojang"
  },
  {
    id: "paper",
    label: "Paper",
    hint: "Najpopularniejszy silnik pod pluginy Bukkit/Spigot/Paper"
  },
  {
    id: "bukkit",
    label: "Bukkit / Spigot compatible",
    hint: "Pobiera Paper, czyli praktyczny silnik kompatybilny z pluginami Bukkit/Spigot"
  },
  {
    id: "purpur",
    label: "Purpur",
    hint: "Fork Paper z dodatkowymi ustawieniami"
  },
  {
    id: "folia",
    label: "Folia",
    hint: "Eksperymentalny fork Paper pod regionized multithreading"
  },
  {
    id: "fabric",
    label: "Fabric",
    hint: "Loader Fabric pod mody w folderze mods/"
  }
];

const MINECRAFT_SERVER_TYPE_IDS = new Set(MINECRAFT_SERVER_TYPES.map((entry) => entry.id));

let manifestCache = {
  expiresAt: 0,
  payload: null
};

function sanitizeMinecraftServerType(value, fallback = "vanilla") {
  const normalized = coerceNullableString(value, fallback).toLowerCase();

  if (normalized === "spigot" || normalized === "craftbukkit") {
    return "bukkit";
  }

  return MINECRAFT_SERVER_TYPE_IDS.has(normalized) ? normalized : fallback;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": MINECRAFT_DOWNLOAD_USER_AGENT,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw createHttpError(502, `Nie udalo sie pobrac danych Minecraft z ${url}.`);
  }

  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": MINECRAFT_DOWNLOAD_USER_AGENT
    }
  });

  if (!response.ok) {
    throw createHttpError(502, `Nie udalo sie pobrac pliku serwera Minecraft z ${url}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function getVersionManifest() {
  if (manifestCache.payload && manifestCache.expiresAt > Date.now()) {
    return manifestCache.payload;
  }

  const payload = await fetchJson(VERSION_MANIFEST_URL);
  manifestCache = {
    payload,
    expiresAt: Date.now() + MANIFEST_CACHE_TTL_MS
  };

  return payload;
}

async function listMinecraftVersions(options = {}) {
  const includeSnapshots = Boolean(options.includeSnapshots);
  const limit = Number(options.limit || 60);
  const manifest = await getVersionManifest();
  const versions = manifest.versions
    .filter((entry) => includeSnapshots || entry.type === "release")
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      release_time: entry.releaseTime,
      is_latest_release: entry.id === manifest.latest?.release,
      is_latest_snapshot: entry.id === manifest.latest?.snapshot
    }));

  return {
    latest_release: manifest.latest?.release || null,
    latest_snapshot: manifest.latest?.snapshot || null,
    server_types: MINECRAFT_SERVER_TYPES,
    versions
  };
}

async function resolveMinecraftVersion(versionId) {
  const manifest = await getVersionManifest();
  const normalizedVersionId = coerceNullableString(versionId, manifest.latest?.release || null);

  if (!normalizedVersionId) {
    throw createHttpError(400, "Nie znaleziono domyslnej wersji Minecraft.");
  }

  const versionEntry = manifest.versions.find((entry) => entry.id === normalizedVersionId);

  if (!versionEntry) {
    throw createHttpError(400, `Nie znaleziono wersji Minecraft: ${normalizedVersionId}.`);
  }

  return versionEntry;
}

async function getMinecraftServerDownload(versionId) {
  const versionEntry = await resolveMinecraftVersion(versionId);
  const versionPayload = await fetchJson(versionEntry.url);
  const serverDownload = versionPayload?.downloads?.server;

  if (!serverDownload?.url) {
    throw createHttpError(
      400,
      `Wersja ${versionEntry.id} nie udostepnia oficjalnego pliku server.jar.`
    );
  }

  return {
    version_id: versionEntry.id,
    server_type: "vanilla",
    type: versionEntry.type,
    release_time: versionEntry.releaseTime,
    url: serverDownload.url,
    sha1: serverDownload.sha1 || null
  };
}

function verifySha1(buffer, expectedSha1, versionId) {
  if (!expectedSha1) {
    return;
  }

  const actualSha1 = crypto.createHash("sha1").update(buffer).digest("hex");
  if (actualSha1 !== expectedSha1) {
    throw createHttpError(
      502,
      `Pobrany server.jar dla wersji ${versionId} ma niepoprawna sume SHA1.`
    );
  }
}

function verifySha256(buffer, expectedSha256, versionId) {
  if (!expectedSha256) {
    return;
  }

  const actualSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw createHttpError(
      502,
      `Pobrany server.jar dla wersji ${versionId} ma niepoprawna sume SHA256.`
    );
  }
}

async function getPaperMcDownload(project, versionId, requestedServerType) {
  let version = coerceNullableString(versionId, null);

  if (!version) {
    const projectPayload = await fetchJson(`${PAPERMC_API_BASE}/${encodeURIComponent(project)}`);
    const versionGroups = projectPayload?.versions || {};
    version = Object.values(versionGroups).flat().find(Boolean);
  }

  if (!version) {
    throw createHttpError(502, `Nie udalo sie znalezc wersji ${requestedServerType}.`);
  }

  const builds = await fetchJson(
    `${PAPERMC_API_BASE}/${encodeURIComponent(project)}/versions/${encodeURIComponent(version)}/builds`
  );

  const buildList = Array.isArray(builds) ? builds : [];
  const build =
    buildList.find((entry) => String(entry.channel || "").toUpperCase() === "STABLE") ||
    buildList[0];
  const download = build?.downloads?.["server:default"];

  if (!download?.url) {
    throw createHttpError(
      400,
      `Nie znaleziono builda ${requestedServerType} dla Minecraft ${version}.`
    );
  }

  return {
    version_id: version,
    server_type: requestedServerType,
    build: build.id,
    url: download.url,
    file_name: download.name || null,
    sha256: download.checksums?.sha256 || null
  };
}

async function getPurpurDownload(versionId) {
  const payload = await fetchJson(PURPUR_API_BASE);
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  const version = coerceNullableString(versionId, null) || versions[versions.length - 1];

  if (!version || !versions.includes(version)) {
    throw createHttpError(400, `Purpur nie ma wersji Minecraft ${version || versionId}.`);
  }

  return {
    version_id: version,
    server_type: "purpur",
    url: `${PURPUR_API_BASE}/${encodeURIComponent(version)}/latest/download`,
    file_name: `purpur-${version}.jar`
  };
}

async function getLatestFabricComponent(type) {
  const payload = await fetchJson(`${FABRIC_META_BASE}/versions/${type}`);
  const versions = Array.isArray(payload) ? payload : [];
  const selected = versions.find((entry) => entry.stable) || versions[0];

  if (!selected?.version) {
    throw createHttpError(502, `Nie udalo sie znalezc wersji Fabric ${type}.`);
  }

  return selected.version;
}

async function getFabricDownload(versionId) {
  const version = coerceNullableString(versionId, null) || (await getVersionManifest()).latest?.release;
  const loaderVersion = await getLatestFabricComponent("loader");
  const installerVersion = await getLatestFabricComponent("installer");

  return {
    version_id: version,
    server_type: "fabric",
    build: `${loaderVersion}/${installerVersion}`,
    url: `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(
      loaderVersion
    )}/${encodeURIComponent(installerVersion)}/server/jar`,
    file_name: `fabric-server-${version}.jar`
  };
}

async function getMinecraftServerDownloadForType(serverType, versionId) {
  const normalizedServerType = sanitizeMinecraftServerType(serverType);

  if (normalizedServerType === "vanilla") {
    return getMinecraftServerDownload(versionId);
  }

  if (normalizedServerType === "paper" || normalizedServerType === "bukkit") {
    return getPaperMcDownload("paper", versionId, normalizedServerType);
  }

  if (normalizedServerType === "folia") {
    return getPaperMcDownload("folia", versionId, normalizedServerType);
  }

  if (normalizedServerType === "purpur") {
    return getPurpurDownload(versionId);
  }

  if (normalizedServerType === "fabric") {
    return getFabricDownload(versionId);
  }

  return getMinecraftServerDownload(versionId);
}

async function downloadMinecraftServerJar(
  projectPath,
  versionId,
  targetFileName = "server.jar",
  options = {}
) {
  const serverType = sanitizeMinecraftServerType(options.serverType || options.minecraft_server_type);
  const download = await getMinecraftServerDownloadForType(serverType, versionId);
  const buffer = await fetchBuffer(download.url);
  verifySha1(buffer, download.sha1, download.version_id);
  verifySha256(buffer, download.sha256, download.version_id);

  await fs.mkdir(projectPath, { recursive: true });

  const targetPath = path.join(projectPath, targetFileName);
  const tempPath = `${targetPath}.download`;

  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, targetPath);

  return {
    minecraft_version: download.version_id,
    minecraft_server_type: download.server_type || serverType,
    build: download.build || null,
    entry_file: targetFileName,
    download_url: download.url
  };
}

module.exports = {
  MINECRAFT_SERVER_TYPES,
  sanitizeMinecraftServerType,
  listMinecraftVersions,
  resolveMinecraftVersion,
  getMinecraftServerDownload,
  getMinecraftServerDownloadForType,
  downloadMinecraftServerJar
};
