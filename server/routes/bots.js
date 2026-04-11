const fs = require("fs/promises");
const express = require("express");
const multer = require("multer");

const { MAX_UPLOAD_BYTES, TMP_DIR } = require("../config");
const { requireAuth } = require("../lib/auth");
const {
  listBots,
  createBot,
  getBotWithRuntime,
  updateBot,
  deleteBotById,
  listBotBackups,
  createBotBackup,
  restoreBotBackup,
  deleteBotBackup,
  startBot,
  stopBot,
  restartBot,
  installDependencies,
  updateBotArchive,
  executeBotConsoleCommand,
  searchMinecraftAddons,
  listMinecraftAddonVersions,
  installMinecraftAddon,
  getBotLogsPayload,
  getBotFiles,
  createBotFile,
  updateBotFile,
  deleteBotFile,
  uploadBotFiles,
  updateBotEnv
} = require("../lib/bots");

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: MAX_UPLOAD_BYTES
  }
});

async function cleanupFiles(files) {
  for (const file of files) {
    if (file?.path) {
      await fs.rm(file.path, { force: true });
    }
  }
}

router.get("/", async (request, response, next) => {
  try {
    response.json(await listBots(request.user));
  } catch (error) {
    next(error);
  }
});

router.post("/", upload.single("archive"), async (request, response, next) => {
  try {
    response.status(201).json(await createBot(request.user, request.body, request.file));
  } catch (error) {
    await cleanupFiles([request.file].filter(Boolean));
    next(error);
  }
});

router.post("/:id/archive", upload.single("archive"), async (request, response, next) => {
  try {
    response.json(await updateBotArchive(request.params.id, request.user, request.file, request.body));
  } catch (error) {
    await cleanupFiles([request.file].filter(Boolean));
    next(error);
  }
});

router.get("/:id/backups", async (request, response, next) => {
  try {
    response.json(await listBotBackups(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/backups", async (request, response, next) => {
  try {
    response.status(201).json(await createBotBackup(request.params.id, request.user, request.body));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/backups/:backupId/restore", async (request, response, next) => {
  try {
    response.json(
      await restoreBotBackup(
        request.params.id,
        request.user,
        request.params.backupId,
        request.body
      )
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/backups/:backupId", async (request, response, next) => {
  try {
    response.json(
      await deleteBotBackup(request.params.id, request.user, request.params.backupId)
    );
  } catch (error) {
    next(error);
  }
});

router.get("/:id/logs", async (request, response, next) => {
  try {
    response.json(await getBotLogsPayload(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/console", async (request, response, next) => {
  try {
    response.json(await executeBotConsoleCommand(request.params.id, request.user, request.body));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/minecraft-addons", async (request, response, next) => {
  try {
    response.json(await searchMinecraftAddons(request.params.id, request.user, request.query));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/minecraft-addons/:projectId/versions", async (request, response, next) => {
  try {
    response.json(
      await listMinecraftAddonVersions(
        request.params.id,
        request.user,
        request.params.projectId,
        request.query
      )
    );
  } catch (error) {
    next(error);
  }
});

router.post("/:id/minecraft-addons/install", async (request, response, next) => {
  try {
    response.json(await installMinecraftAddon(request.params.id, request.user, request.body));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/files", async (request, response, next) => {
  try {
    response.json(await getBotFiles(request.params.id, request.user, request.query.path || ""));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/files", async (request, response, next) => {
  try {
    response.status(201).json(await createBotFile(request.params.id, request.user, request.body));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/files", async (request, response, next) => {
  try {
    response.json(await updateBotFile(request.params.id, request.user, request.body));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/files", async (request, response, next) => {
  try {
    response.json(await deleteBotFile(request.params.id, request.user, request.query.path || ""));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/upload", upload.array("files"), async (request, response, next) => {
  try {
    response
      .status(201)
      .json(
        await uploadBotFiles(
          request.params.id,
          request.user,
          request.body.target_path || "",
          request.files || []
        )
      );
  } catch (error) {
    await cleanupFiles(request.files || []);
    next(error);
  }
});

router.patch("/:id/env", async (request, response, next) => {
  try {
    response.json(await updateBotEnv(request.params.id, request.user, request.body.content || ""));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/start", async (request, response, next) => {
  try {
    response.json(await startBot(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/stop", async (request, response, next) => {
  try {
    response.json(await stopBot(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/restart", async (request, response, next) => {
  try {
    response.json(await restartBot(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/install", async (request, response, next) => {
  try {
    response.json(await installDependencies(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (request, response, next) => {
  try {
    response.json(await getBotWithRuntime(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (request, response, next) => {
  try {
    response.json(await updateBot(request.params.id, request.user, request.body));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (request, response, next) => {
  try {
    response.json(await deleteBotById(request.params.id, request.user));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
