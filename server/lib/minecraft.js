const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const { createHttpError, coerceNullableString } = require("./utils");

const VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000;

let manifestCache = {
  expiresAt: 0,
  payload: null
};

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw createHttpError(502, `Nie udalo sie pobrac danych Minecraft z ${url}.`);
  }

  return response.json();
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
    type: versionEntry.type,
    release_time: versionEntry.releaseTime,
    url: serverDownload.url,
    sha1: serverDownload.sha1 || null
  };
}

async function downloadMinecraftServerJar(projectPath, versionId, targetFileName = "server.jar") {
  const download = await getMinecraftServerDownload(versionId);
  const response = await fetch(download.url);

  if (!response.ok) {
    throw createHttpError(
      502,
      `Nie udalo sie pobrac server.jar dla wersji ${download.version_id}.`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (download.sha1) {
    const actualSha1 = crypto.createHash("sha1").update(buffer).digest("hex");
    if (actualSha1 !== download.sha1) {
      throw createHttpError(
        502,
        `Pobrany server.jar dla wersji ${download.version_id} ma niepoprawna sume kontrolna.`
      );
    }
  }

  await fs.mkdir(projectPath, { recursive: true });

  const targetPath = path.join(projectPath, targetFileName);
  const tempPath = `${targetPath}.download`;

  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, targetPath);

  return {
    minecraft_version: download.version_id,
    entry_file: targetFileName,
    download_url: download.url
  };
}

module.exports = {
  listMinecraftVersions,
  resolveMinecraftVersion,
  getMinecraftServerDownload,
  downloadMinecraftServerJar
};
