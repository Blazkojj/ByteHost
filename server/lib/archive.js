const fs = require("fs/promises");
const path = require("path");
const extractZip = require("extract-zip");

const { spawnBuffered } = require("./commands");
const { createHttpError } = require("./utils");

function getArchiveExtension(archivePath, originalName) {
  return path.extname(originalName || archivePath || "").toLowerCase();
}

async function detectArchiveFormat(archivePath, originalName) {
  const extension = getArchiveExtension(archivePath, originalName);
  if (extension === ".zip" || extension === ".rar") {
    return extension;
  }

  const handle = await fs.open(archivePath, "r");

  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);

    if (header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b) {
      return ".zip";
    }

    if (
      header.length >= 7 &&
      header[0] === 0x52 &&
      header[1] === 0x61 &&
      header[2] === 0x72 &&
      header[3] === 0x21 &&
      header[4] === 0x1a &&
      header[5] === 0x07
    ) {
      return ".rar";
    }
  } finally {
    await handle.close();
  }

  throw createHttpError(400, "Obslugiwane formaty archiwum to ZIP oraz RAR.");
}

function detectUploadedArtifactKind(uploadPath, originalName) {
  const extension = getArchiveExtension(uploadPath, originalName);
  if (extension === ".jar") {
    return Promise.resolve(".jar");
  }

  return detectArchiveFormat(uploadPath, originalName);
}

async function removeMacArtifacts(targetDirectory) {
  const macOsDirectory = path.join(targetDirectory, "__MACOSX");
  await fs.rm(macOsDirectory, { recursive: true, force: true });

  const walk = async (currentDirectory) => {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.name === ".DS_Store") {
        await fs.rm(entryPath, { force: true });
        continue;
      }

      if (entry.isDirectory()) {
        await walk(entryPath);
      }
    }
  };

  await walk(targetDirectory);
}

async function flattenSingleDirectory(targetDirectory) {
  const entries = (await fs.readdir(targetDirectory, { withFileTypes: true })).filter(
    (entry) => entry.name !== "__MACOSX"
  );

  if (entries.length !== 1 || !entries[0].isDirectory()) {
    return;
  }

  const nestedDirectory = path.join(targetDirectory, entries[0].name);
  const nestedEntries = await fs.readdir(nestedDirectory, { withFileTypes: true });

  for (const entry of nestedEntries) {
    await fs.rename(path.join(nestedDirectory, entry.name), path.join(targetDirectory, entry.name));
  }

  await fs.rm(nestedDirectory, { recursive: true, force: true });
}

async function extractRar(archivePath, destination) {
  try {
    await spawnBuffered("unrar", ["x", "-o+", "-idq", archivePath, destination], {
      cwd: destination,
      timeoutMs: 120000
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw createHttpError(
        500,
        "RAR wymaga zainstalowanego polecenia `unrar` na serwerze Ubuntu."
      );
    }

    throw createHttpError(400, `Nie udalo sie rozpakowac archiwum RAR: ${error.message}`);
  }
}

async function copyJar(uploadPath, destination, originalName) {
  const targetName = path.basename(originalName || "server.jar");
  await fs.mkdir(destination, { recursive: true });
  await fs.copyFile(uploadPath, path.join(destination, targetName));
}

async function extractArchive(archivePath, destination, options = {}) {
  await fs.mkdir(destination, { recursive: true });

  const format = await detectArchiveFormat(archivePath, options.originalName);

  if (format === ".zip") {
    await extractZip(archivePath, { dir: destination });
  } else if (format === ".rar") {
    await extractRar(archivePath, destination);
  } else {
    throw createHttpError(400, "Obslugiwane formaty archiwum to ZIP oraz RAR.");
  }

  await removeMacArtifacts(destination);
  await flattenSingleDirectory(destination);
}

async function importProjectArtifact(uploadPath, destination, options = {}) {
  const kind = await detectUploadedArtifactKind(uploadPath, options.originalName);

  if (kind === ".jar") {
    await copyJar(uploadPath, destination, options.originalName);
    return { kind };
  }

  await extractArchive(uploadPath, destination, options);
  return { kind };
}

module.exports = {
  detectArchiveFormat,
  detectUploadedArtifactKind,
  extractArchive,
  getArchiveExtension,
  importProjectArtifact
};
