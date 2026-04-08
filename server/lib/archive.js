const fs = require("fs/promises");
const path = require("path");
const extractZip = require("extract-zip");

const { spawnBuffered } = require("./commands");
const { createHttpError } = require("./utils");

function getArchiveExtension(archivePath, originalName) {
  return path.extname(originalName || archivePath || "").toLowerCase();
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
    const sourcePath = path.join(nestedDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);
    await fs.rename(sourcePath, targetPath);
  }

  await fs.rm(nestedDirectory, { recursive: true, force: true });
}

async function extractRar(archivePath, destination) {
  try {
    await spawnBuffered("unrar", ["x", "-o+", "-idq", archivePath, destination], {
      cwd: destination
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw createHttpError(
        500,
        "RAR wymaga zainstalowanego polecenia `unrar` na serwerze Ubuntu."
      );
    }

    throw createHttpError(400, `Nie udało się rozpakować archiwum RAR: ${error.message}`);
  }
}

async function extractArchive(archivePath, destination, options = {}) {
  await fs.mkdir(destination, { recursive: true });

  const extension = getArchiveExtension(archivePath, options.originalName);

  if (extension === ".zip") {
    await extractZip(archivePath, { dir: destination });
  } else if (extension === ".rar") {
    await extractRar(archivePath, destination);
  } else {
    throw createHttpError(400, "Obsługiwane formaty archiwum to ZIP oraz RAR.");
  }

  await removeMacArtifacts(destination);
  await flattenSingleDirectory(destination);
}

module.exports = {
  extractArchive,
  getArchiveExtension
};
