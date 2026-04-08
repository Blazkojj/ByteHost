const fs = require("fs/promises");
const path = require("path");
const mime = require("mime-types");
const { isBinaryFile } = require("isbinaryfile");

const { TEXT_FILE_MAX_BYTES } = require("../config");
const {
  resolveBotPath,
  ensureParentDirectory,
  pathExists
} = require("./storage");
const { createHttpError, normalizeRelativePath } = require("./utils");

function formatEntryPath(currentPath, name) {
  return normalizeRelativePath(path.posix.join(currentPath || "", name));
}

async function serializeEntry(targetPath, relativePath, entry) {
  const stats = await fs.stat(path.join(targetPath, entry.name));
  return {
    name: entry.name,
    path: formatEntryPath(relativePath, entry.name),
    type: entry.isDirectory() ? "directory" : "file",
    size: stats.size,
    modified_at: stats.mtime.toISOString(),
    extension: entry.isDirectory() ? null : path.extname(entry.name).toLowerCase()
  };
}

async function listDirectory(botId, relativePath = "") {
  const normalizedPath = normalizeRelativePath(relativePath);
  const targetPath = resolveBotPath(botId, normalizedPath);
  const stats = await fs.stat(targetPath);

  if (!stats.isDirectory()) {
    throw createHttpError(400, "Podana ścieżka nie wskazuje katalogu.");
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const serializedEntries = await Promise.all(
    entries.map((entry) => serializeEntry(targetPath, normalizedPath, entry))
  );

  serializedEntries.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "pl");
  });

  return {
    kind: "directory",
    path: normalizedPath,
    parent_path:
      normalizedPath.indexOf("/") === -1
        ? ""
        : normalizedPath.split("/").slice(0, -1).join("/"),
    entries: serializedEntries
  };
}

async function readFileEntry(botId, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);

  if (!normalizedPath) {
    return listDirectory(botId, "");
  }

  const targetPath = resolveBotPath(botId, normalizedPath);
  const stats = await fs.stat(targetPath);

  if (stats.isDirectory()) {
    return listDirectory(botId, normalizedPath);
  }

  const binary = await isBinaryFile(targetPath);
  let content = null;

  if (!binary) {
    if (stats.size > TEXT_FILE_MAX_BYTES) {
      throw createHttpError(
        413,
        `Plik jest zbyt duży do edycji w panelu (maks. ${TEXT_FILE_MAX_BYTES} bajtów).`
      );
    }

    content = await fs.readFile(targetPath, "utf8");
  }

  return {
    kind: "file",
    path: normalizedPath,
    name: path.basename(normalizedPath),
    size: stats.size,
    modified_at: stats.mtime.toISOString(),
    is_text: !binary,
    mime: mime.lookup(targetPath) || "application/octet-stream",
    content
  };
}

async function createEntry(botId, payload) {
  const relativePath = normalizeRelativePath(payload.path);
  if (!relativePath) {
    throw createHttpError(400, "Podaj ścieżkę nowego pliku lub folderu.");
  }

  const targetPath = resolveBotPath(botId, relativePath);

  if (payload.type === "folder") {
    await fs.mkdir(targetPath, { recursive: true });
    return readFileEntry(botId, relativePath);
  }

  await ensureParentDirectory(targetPath);
  await fs.writeFile(targetPath, payload.content || "", "utf8");
  return readFileEntry(botId, relativePath);
}

async function updateFileContent(botId, payload) {
  const relativePath = normalizeRelativePath(payload.path);
  if (!relativePath) {
    throw createHttpError(400, "Podaj ścieżkę pliku do zapisania.");
  }

  const targetPath = resolveBotPath(botId, relativePath);
  const stats = await fs.stat(targetPath);

  if (!stats.isFile()) {
    throw createHttpError(400, "Edytować można tylko pliki.");
  }

  await fs.writeFile(targetPath, payload.content || "", "utf8");
  return readFileEntry(botId, relativePath);
}

async function deleteEntry(botId, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    throw createHttpError(400, "Nie można usunąć katalogu głównego bota.");
  }

  const targetPath = resolveBotPath(botId, normalizedPath);
  await fs.rm(targetPath, { recursive: true, force: true });
  return { ok: true };
}

async function uploadFiles(botId, targetRelativePath, files) {
  const normalizedPath = normalizeRelativePath(targetRelativePath);
  const targetDirectory = resolveBotPath(botId, normalizedPath || "");

  if (!(await pathExists(targetDirectory))) {
    await fs.mkdir(targetDirectory, { recursive: true });
  }

  for (const file of files) {
    const destinationPath = path.join(targetDirectory, file.originalname);
    await fs.rm(destinationPath, { recursive: true, force: true });
    await ensureParentDirectory(destinationPath);
    await fs.rename(file.path, destinationPath);
  }

  return listDirectory(botId, normalizedPath);
}

module.exports = {
  listDirectory,
  readFileEntry,
  createEntry,
  updateFileContent,
  deleteEntry,
  uploadFiles
};
