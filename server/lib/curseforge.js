const crypto = require("crypto");

const { getInstallProfile, getInstallProfileKey } = require("./modrinth");
const {
  createHttpError,
  coerceNullableNumber,
  coerceNullableString
} = require("./utils");

const CURSEFORGE_API_BASE = "https://api.curseforge.com/v1";
const CURSEFORGE_MINECRAFT_GAME_ID = 432;
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || "";

const CURSEFORGE_CLASS_IDS = {
  modpack: 4471,
  mod: 6,
  plugin: 5,
  datapack: 6552,
  resourcepack: 12,
  shader: 6552
};

const CURSEFORGE_LOADER_TYPES = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
};

const CURSEFORGE_LOADER_LABELS = {
  1: "forge",
  4: "fabric",
  5: "quilt",
  6: "neoforge"
};

const CURSEFORGE_SORT_FIELDS = {
  relevance: 1,
  follows: 2,
  updated: 3,
  downloads: 6,
  newest: 11
};

function sanitizeLimit(value, fallback = 20) {
  const limit = Math.trunc(coerceNullableNumber(value, fallback));
  return Math.min(Math.max(limit, 1), 50);
}

function sanitizePage(value) {
  const page = Math.trunc(coerceNullableNumber(value, 1));
  return Math.max(page, 1);
}

function assertCurseForgeConfigured() {
  if (!CURSEFORGE_API_KEY) {
    throw createHttpError(
      400,
      "CurseForge wymaga klucza API. Dodaj CURSEFORGE_API_KEY do pliku .env i zrestartuj panel ByteHost."
    );
  }
}

async function curseForgeFetch(url, options = {}) {
  assertCurseForgeConfigured();

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "x-api-key": CURSEFORGE_API_KEY,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = `CurseForge zwrocil blad ${response.status}.`;

    try {
      const payload = await response.json();
      message = payload.message || payload.error || message;
    } catch (_error) {
      // CurseForge sometimes returns an empty response body for errors.
    }

    throw createHttpError(response.status >= 500 ? 502 : 400, message);
  }

  return response;
}

async function curseForgeJson(pathname, query = null) {
  const url = new URL(pathname.replace(/^\/+/, ""), `${CURSEFORGE_API_BASE}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await curseForgeFetch(url);
  return response.json();
}

function getCurseForgeLoaderType(loader) {
  const normalizedLoader = coerceNullableString(loader, null)?.toLowerCase();
  return normalizedLoader ? CURSEFORGE_LOADER_TYPES[normalizedLoader] || null : null;
}

function deriveCurseForgeLoaders(file) {
  const loaders = new Set();
  const latestIndexLoader = CURSEFORGE_LOADER_LABELS[Number(file?.modLoader || 0)];

  if (latestIndexLoader) {
    loaders.add(latestIndexLoader);
  }

  for (const version of file?.gameVersions || []) {
    const normalized = String(version || "").toLowerCase();
    if (["forge", "fabric", "quilt", "neoforge"].includes(normalized)) {
      loaders.add(normalized);
    }
  }

  return [...loaders];
}

function buildCurseForgeProjectUrl(mod, type) {
  if (mod?.links?.websiteUrl) {
    return mod.links.websiteUrl;
  }

  const slug = mod?.slug || mod?.id;
  const paths = {
    modpack: "modpacks",
    mod: "mc-mods",
    plugin: "bukkit-plugins",
    resourcepack: "texture-packs",
    datapack: "customization",
    shader: "shaders"
  };

  return `https://www.curseforge.com/minecraft/${paths[type] || "mc-mods"}/${slug}`;
}

function toProjectHit(mod, type) {
  const categories = Array.isArray(mod.categories) ? mod.categories : [];
  const latestFilesIndexes = Array.isArray(mod.latestFilesIndexes) ? mod.latestFilesIndexes : [];
  const latestFileIndex = latestFilesIndexes[0] || null;

  return {
    id: String(mod.id),
    slug: mod.slug || String(mod.id),
    title: mod.name,
    description: mod.summary || "",
    author: Array.isArray(mod.authors) ? mod.authors[0]?.name || null : null,
    icon_url: mod.logo?.thumbnailUrl || mod.logo?.url || null,
    project_type: type,
    source: "curseforge",
    project_url: buildCurseForgeProjectUrl(mod, type),
    categories: categories.map((category) => category.slug || category.name).filter(Boolean),
    display_categories: categories.map((category) => category.name || category.slug).filter(Boolean),
    client_side: null,
    server_side: null,
    downloads: mod.downloadCount || 0,
    follows: mod.thumbsUpCount || mod.rating || 0,
    latest_version: latestFileIndex?.gameVersion || null,
    date_modified: mod.dateModified || mod.dateReleased || null,
    gallery: Array.isArray(mod.screenshots)
      ? mod.screenshots.map((screenshot) => screenshot.thumbnailUrl || screenshot.url).filter(Boolean)
      : []
  };
}

function toVersionEntry(file, projectId) {
  const modId = String(projectId || file.modId);

  return {
    id: `${modId}:${file.id}`,
    project_id: modId,
    name: file.displayName || file.fileName,
    version_number: file.displayName || file.fileName,
    version_type: file.releaseType === 1 ? "release" : file.releaseType === 2 ? "beta" : "alpha",
    source: "curseforge",
    game_versions: Array.isArray(file.gameVersions) ? file.gameVersions : [],
    loaders: deriveCurseForgeLoaders(file),
    date_published: file.fileDate || null,
    downloads: file.downloadCount || 0,
    file_name: file.fileName || null,
    file_size: file.fileLength || file.fileSizeOnDisk || 0
  };
}

function toNormalizedVersion(file, projectId) {
  const version = toVersionEntry(file, projectId);

  return {
    ...version,
    files: [
      {
        source: "curseforge",
        url: file.downloadUrl || null,
        filename: file.fileName || version.file_name,
        size: file.fileLength || file.fileSizeOnDisk || 0,
        hashes: Array.isArray(file.hashes) ? file.hashes : [],
        project_id: version.project_id,
        file_id: String(file.id)
      }
    ]
  };
}

async function searchCurseForgeProjects(options = {}) {
  const type = getInstallProfileKey(options.type);
  const limit = sanitizeLimit(options.limit, 10);
  const page = sanitizePage(options.page);
  const gameVersion = coerceNullableString(options.gameVersion, null);
  const loaderType = getCurseForgeLoaderType(options.loader);
  const query = {
    gameId: CURSEFORGE_MINECRAFT_GAME_ID,
    classId: CURSEFORGE_CLASS_IDS[type] || undefined,
    searchFilter: coerceNullableString(options.query, ""),
    gameVersion,
    sortField: CURSEFORGE_SORT_FIELDS[options.sort] || CURSEFORGE_SORT_FIELDS.downloads,
    sortOrder: "desc",
    index: (page - 1) * limit,
    pageSize: limit
  };

  if (loaderType && gameVersion) {
    query.modLoaderType = loaderType;
  }

  const payload = await curseForgeJson("mods/search", query);
  const pagination = payload.pagination || {};

  return {
    type,
    source: "curseforge",
    loader: coerceNullableString(options.loader, null),
    profile: getInstallProfile(type),
    page,
    limit,
    total_hits: pagination.totalCount || 0,
    warning:
      loaderType && !gameVersion
        ? "CurseForge filtruje loader tylko razem z konkretna wersja Minecraft."
        : null,
    hits: Array.isArray(payload.data) ? payload.data.map((entry) => toProjectHit(entry, type)) : []
  };
}

async function listCurseForgeProjectVersions(projectId, options = {}) {
  const normalizedProjectId = coerceNullableString(projectId, null);
  if (!normalizedProjectId) {
    throw createHttpError(400, "Brakuje ID projektu CurseForge.");
  }

  const gameVersion = coerceNullableString(options.gameVersion, null);
  const loaderType = getCurseForgeLoaderType(options.loader);
  const query = {
    gameVersion,
    pageSize: sanitizeLimit(options.limit, 50),
    index: 0
  };

  if (loaderType && gameVersion) {
    query.modLoaderType = loaderType;
  }

  const payload = await curseForgeJson(
    `mods/${encodeURIComponent(normalizedProjectId)}/files`,
    query
  );

  return {
    source: "curseforge",
    loader: coerceNullableString(options.loader, null),
    warning:
      loaderType && !gameVersion
        ? "CurseForge filtruje loader tylko razem z konkretna wersja Minecraft."
        : null,
    versions: Array.isArray(payload.data)
      ? payload.data.map((entry) => toVersionEntry(entry, normalizedProjectId))
      : []
  };
}

async function getCurseForgeVersion(versionId) {
  const normalizedVersionId = coerceNullableString(versionId, null);
  if (!normalizedVersionId || !normalizedVersionId.includes(":")) {
    throw createHttpError(400, "Brakuje ID wersji CurseForge.");
  }

  const [projectId, fileId] = normalizedVersionId.split(":");
  const payload = await curseForgeJson(
    `mods/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`
  );

  return toNormalizedVersion(payload.data, projectId);
}

function validateDownloadedFile(buffer, file) {
  const hashes = Array.isArray(file.hashes) ? file.hashes : [];
  const sha1 = hashes.find((hash) => Number(hash.algo) === 1 || String(hash.value || "").length === 40);
  const md5 = hashes.find((hash) => Number(hash.algo) === 2 || String(hash.value || "").length === 32);

  if (sha1?.value) {
    const actual = crypto.createHash("sha1").update(buffer).digest("hex");
    if (actual !== String(sha1.value).toLowerCase()) {
      throw createHttpError(502, `Plik ${file.filename} ma niepoprawna sume SHA1.`);
    }
  } else if (md5?.value) {
    const actual = crypto.createHash("md5").update(buffer).digest("hex");
    if (actual !== String(md5.value).toLowerCase()) {
      throw createHttpError(502, `Plik ${file.filename} ma niepoprawna sume MD5.`);
    }
  }
}

async function downloadCurseForgeFile(file) {
  let downloadUrl = coerceNullableString(file?.url, null);

  if (!downloadUrl && file?.project_id && file?.file_id) {
    const payload = await curseForgeJson(
      `mods/${encodeURIComponent(file.project_id)}/files/${encodeURIComponent(file.file_id)}/download-url`
    );
    downloadUrl = coerceNullableString(payload.data, null);
  }

  if (!downloadUrl) {
    throw createHttpError(
      400,
      "CurseForge nie udostepnil linku pobierania dla tej wersji. Wybierz inna wersje dodatku."
    );
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw createHttpError(502, `Nie udalo sie pobrac pliku z CurseForge (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  validateDownloadedFile(buffer, file);
  return buffer;
}

module.exports = {
  searchCurseForgeProjects,
  listCurseForgeProjectVersions,
  getCurseForgeVersion,
  downloadCurseForgeFile
};
