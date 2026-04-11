const crypto = require("crypto");

const {
  createHttpError,
  coerceNullableNumber,
  coerceNullableString
} = require("./utils");

const MODRINTH_API_BASE = "https://api.modrinth.com/v2";
const MODRINTH_USER_AGENT =
  process.env.MODRINTH_USER_AGENT || "Blazkoj/ByteHost/1.0 (bytehost.online)";

const INSTALL_PROFILES = {
  modpack: {
    label: "Modpack",
    projectType: "modpack",
    targetDirectory: "modpacks",
    searchCategories: []
  },
  mod: {
    label: "Mod",
    projectType: "mod",
    targetDirectory: "mods",
    searchCategories: ["fabric", "forge", "neoforge", "quilt"]
  },
  plugin: {
    label: "Plugin",
    projectType: "plugin",
    targetDirectory: "plugins",
    searchCategories: []
  },
  datapack: {
    label: "Datapack",
    projectType: "datapack",
    targetDirectory: "world/datapacks",
    searchCategories: []
  },
  resourcepack: {
    label: "Resource pack",
    projectType: "resourcepack",
    targetDirectory: "resourcepacks",
    searchCategories: []
  },
  shader: {
    label: "Shader pack",
    projectType: "shader",
    targetDirectory: "shaderpacks",
    searchCategories: []
  }
};

const SORTS = new Set(["relevance", "downloads", "follows", "newest", "updated"]);

function getInstallProfile(type) {
  const normalizedType = coerceNullableString(type, "modpack");
  return INSTALL_PROFILES[normalizedType] || INSTALL_PROFILES.modpack;
}

function getInstallProfileKey(type) {
  const normalizedType = coerceNullableString(type, "modpack");
  return INSTALL_PROFILES[normalizedType] ? normalizedType : "modpack";
}

function getTargetDirectory(type) {
  return getInstallProfile(type).targetDirectory;
}

function buildSearchFacets(type, gameVersion = "", loader = "") {
  const profile = getInstallProfile(type);
  const facets = [[`project_type:${profile.projectType}`]];
  const normalizedVersion = coerceNullableString(gameVersion, "");
  const normalizedLoader = coerceNullableString(loader, "");

  if (normalizedVersion) {
    facets.push([`versions:${normalizedVersion}`]);
  }

  if (normalizedLoader) {
    facets.push([`categories:${normalizedLoader}`]);
  } else if (profile.searchCategories.length > 0) {
    facets.push(profile.searchCategories.map((category) => `categories:${category}`));
  }

  return facets;
}

function getPrimaryFile(version) {
  const files = Array.isArray(version?.files) ? version.files : [];
  return files.find((file) => file.primary) || files[0] || null;
}

function sanitizeSort(value) {
  return SORTS.has(value) ? value : "downloads";
}

function sanitizeLimit(value, fallback = 20) {
  const limit = Math.trunc(coerceNullableNumber(value, fallback));
  return Math.min(Math.max(limit, 1), 100);
}

function sanitizePage(value) {
  const page = Math.trunc(coerceNullableNumber(value, 1));
  return Math.max(page, 1);
}

async function modrinthFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": MODRINTH_USER_AGENT,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = `Modrinth zwrocil blad ${response.status}.`;

    try {
      const payload = await response.json();
      message = payload.description || payload.error || message;
    } catch (_error) {
      // Response body is not always JSON, keep the generic message.
    }

    throw createHttpError(response.status >= 500 ? 502 : 400, message);
  }

  return response;
}

async function modrinthJson(pathname, query = null) {
  const url = new URL(pathname, `${MODRINTH_API_BASE}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await modrinthFetch(url);
  return response.json();
}

function toProjectHit(hit) {
  return {
    id: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    icon_url: hit.icon_url || null,
    project_type: hit.project_type,
    source: "modrinth",
    project_url: `https://modrinth.com/${hit.project_type}/${hit.slug}`,
    categories: hit.categories || [],
    display_categories: hit.display_categories || [],
    client_side: hit.client_side,
    server_side: hit.server_side,
    downloads: hit.downloads || 0,
    follows: hit.follows || 0,
    latest_version: hit.latest_version || null,
    date_modified: hit.date_modified || null,
    gallery: hit.gallery || []
  };
}

function toVersionEntry(version) {
  const primaryFile = getPrimaryFile(version);

  return {
    id: version.id,
    project_id: version.project_id,
    name: version.name,
    version_number: version.version_number,
    version_type: version.version_type,
    source: "modrinth",
    game_versions: version.game_versions || [],
    loaders: version.loaders || [],
    date_published: version.date_published || null,
    downloads: version.downloads || 0,
    file_name: primaryFile?.filename || null,
    file_size: primaryFile?.size || 0
  };
}

async function searchModrinthProjects(options = {}) {
  const type = getInstallProfileKey(options.type);
  const limit = sanitizeLimit(options.limit, 10);
  const page = sanitizePage(options.page);
  const loader = coerceNullableString(options.loader, null);
  const payload = await modrinthJson("search", {
    query: coerceNullableString(options.query, ""),
    facets: JSON.stringify(buildSearchFacets(type, options.gameVersion, loader)),
    index: sanitizeSort(options.sort),
    limit,
    offset: (page - 1) * limit
  });

  return {
    type,
    source: "modrinth",
    loader,
    profile: getInstallProfile(type),
    page,
    limit,
    total_hits: payload.total_hits || 0,
    hits: Array.isArray(payload.hits) ? payload.hits.map(toProjectHit) : []
  };
}

async function listModrinthProjectVersions(projectId, options = {}) {
  const normalizedProjectId = coerceNullableString(projectId, null);
  if (!normalizedProjectId) {
    throw createHttpError(400, "Brakuje ID projektu Modrinth.");
  }

  const query = {
    include_changelog: "false"
  };
  const gameVersion = coerceNullableString(options.gameVersion, null);
  const loader = coerceNullableString(options.loader, null);

  if (gameVersion) {
    query.game_versions = JSON.stringify([gameVersion]);
  }

  if (loader) {
    query.loaders = JSON.stringify([loader]);
  }

  const versions = await modrinthJson(`project/${encodeURIComponent(normalizedProjectId)}/version`, query);

  return {
    source: "modrinth",
    loader,
    versions: Array.isArray(versions) ? versions.map(toVersionEntry) : []
  };
}

async function getModrinthVersion(versionId) {
  const normalizedVersionId = coerceNullableString(versionId, null);
  if (!normalizedVersionId) {
    throw createHttpError(400, "Brakuje ID wersji Modrinth.");
  }

  return modrinthJson(`version/${encodeURIComponent(normalizedVersionId)}`);
}

async function downloadModrinthFile(file) {
  if (!file?.url) {
    throw createHttpError(400, "Wybrana wersja nie ma pliku do pobrania.");
  }

  const response = await modrinthFetch(file.url);
  const buffer = Buffer.from(await response.arrayBuffer());

  if (file.hashes?.sha512) {
    const actual = crypto.createHash("sha512").update(buffer).digest("hex");
    if (actual !== file.hashes.sha512) {
      throw createHttpError(502, `Plik ${file.filename} ma niepoprawna sume SHA512.`);
    }
  } else if (file.hashes?.sha1) {
    const actual = crypto.createHash("sha1").update(buffer).digest("hex");
    if (actual !== file.hashes.sha1) {
      throw createHttpError(502, `Plik ${file.filename} ma niepoprawna sume SHA1.`);
    }
  }

  return buffer;
}

module.exports = {
  getInstallProfile,
  getInstallProfileKey,
  getPrimaryFile,
  getTargetDirectory,
  searchModrinthProjects,
  listModrinthProjectVersions,
  getModrinthVersion,
  downloadModrinthFile
};
