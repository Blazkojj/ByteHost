const fs = require("fs/promises");
const path = require("path");

const { BOTS_DIR, BACKUPS_DIR, TMP_DIR, LOGS_DIR } = require("../config");
const { createHttpError, normalizeRelativePath } = require("./utils");

async function ensureStorageDirectories() {
  await Promise.all([
    fs.mkdir(BOTS_DIR, { recursive: true }),
    fs.mkdir(BACKUPS_DIR, { recursive: true }),
    fs.mkdir(TMP_DIR, { recursive: true }),
    fs.mkdir(LOGS_DIR, { recursive: true })
  ]);
}

function getBotDirectory(botId) {
  return path.join(BOTS_DIR, String(botId));
}

async function ensureBotDirectory(botId) {
  const botDirectory = getBotDirectory(botId);
  await fs.mkdir(botDirectory, { recursive: true });
  return botDirectory;
}

function assertInsideBotDirectory(botDirectory, resolvedPath) {
  if (resolvedPath === botDirectory) {
    return;
  }

  const prefix = botDirectory.endsWith(path.sep) ? botDirectory : `${botDirectory}${path.sep}`;
  if (!resolvedPath.startsWith(prefix)) {
    throw createHttpError(400, "Nieprawidłowa ścieżka pliku.");
  }
}

function resolveBotPath(botId, relativePath = "") {
  const botDirectory = getBotDirectory(botId);
  const safeRelativePath = normalizeRelativePath(relativePath);
  const resolvedPath = path.resolve(botDirectory, safeRelativePath || ".");
  assertInsideBotDirectory(botDirectory, resolvedPath);
  return resolvedPath;
}

async function ensureParentDirectory(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

async function getDirectorySize(targetPath) {
  try {
    const stats = await fs.stat(targetPath);

    if (!stats.isDirectory()) {
      return stats.size;
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return 0;
    }

    throw error;
  }

  let total = 0;
  const entries = await fs.readdir(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath);
    } else if (entry.isFile()) {
      const stats = await fs.stat(entryPath);
      total += stats.size;
    }
  }

  return total;
}

async function removePath(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

module.exports = {
  ensureStorageDirectories,
  getBotDirectory,
  ensureBotDirectory,
  resolveBotPath,
  ensureParentDirectory,
  pathExists,
  getDirectorySize,
  removePath
};
