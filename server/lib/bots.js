const fs = require("fs/promises");
const path = require("path");

const { DEFAULT_BOT_LIMITS, BOTS_DIR } = require("../config");
const { getDb, mapBotRow } = require("./db");
const { extractArchive } = require("./archive");
const { analyzeProject } = require("./analyzer");
const { runShellCommand } = require("./commands");
const { getBotLogs, removeBotLogs } = require("./logs");
const { mergeBotWithRuntime, deriveBotRuntime, isExpired } = require("./runtime");
const {
  ensureBotDirectory,
  getDirectorySize,
  removePath,
  resolveBotPath
} = require("./storage");
const {
  getBotProcessName,
  listBytehostProcesses,
  describeProcess,
  deleteProcess,
  stopProcess,
  startBotProcess
} = require("./pm2");
const { getSystemLimits } = require("./system");
const { readFileEntry, createEntry, updateFileContent, deleteEntry, uploadFiles } = require("./files");
const {
  createHttpError,
  coerceBoolean,
  coerceNullableNumber,
  coerceNullableString,
  normalizeRelativePath,
  nowIso,
  randomId,
  round,
  slugify,
  toMb
} = require("./utils");

const ALLOWED_LANGUAGES = new Set(["Node.js", "TypeScript", "Python"]);

function sanitizeLanguage(value, fallback) {
  if (!value) {
    return fallback;
  }

  return ALLOWED_LANGUAGES.has(value) ? value : fallback;
}

function normalizeExpiresAt(value) {
  const normalized = coerceNullableString(value, null);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, "Nieprawidłowa data wygaśnięcia.");
  }

  return parsed.toISOString();
}

function listBotRows() {
  return getDb().prepare("SELECT * FROM bots ORDER BY created_at DESC").all().map(mapBotRow);
}

function getBotRow(botId) {
  const bot = mapBotRow(getDb().prepare("SELECT * FROM bots WHERE id = ?").get(botId));

  if (!bot) {
    throw createHttpError(404, "Bot nie został znaleziony.");
  }

  return bot;
}

function updateBotRow(botId, changes) {
  const fields = Object.keys(changes);
  if (fields.length === 0) {
    return getBotRow(botId);
  }

  const payload = { ...changes, id: botId };
  const setClause = fields.map((field) => `${field} = @${field}`).join(", ");
  getDb().prepare(`UPDATE bots SET ${setClause} WHERE id = @id`).run(payload);
  return getBotRow(botId);
}

function createBotRecord(record) {
  getDb()
    .prepare(
      `
        INSERT INTO bots (
          id, name, slug, description, language, detected_language, entry_file, detected_entry_file,
          start_command, detected_start_command, install_command, detected_install_command, package_manager,
          project_path, status, status_message, expires_at, auto_restart, restart_delay, max_restarts,
          restart_count, last_restart_at, stability_status, ram_limit_mb, cpu_limit_percent, archive_name,
          pm2_name, created_at, updated_at
        )
        VALUES (
          @id, @name, @slug, @description, @language, @detected_language, @entry_file, @detected_entry_file,
          @start_command, @detected_start_command, @install_command, @detected_install_command, @package_manager,
          @project_path, @status, @status_message, @expires_at, @auto_restart, @restart_delay, @max_restarts,
          @restart_count, @last_restart_at, @stability_status, @ram_limit_mb, @cpu_limit_percent, @archive_name,
          @pm2_name, @created_at, @updated_at
        )
      `
    )
    .run({
      ...record,
      auto_restart: record.auto_restart ? 1 : 0
    });

  return getBotRow(record.id);
}

async function assertStorageWithinLimit() {
  const limits = getSystemLimits();
  const storageUsageMb = toMb(await getDirectorySize(BOTS_DIR));

  if (limits.storage_limit_mb && storageUsageMb > limits.storage_limit_mb) {
    throw createHttpError(
      400,
      `Limit storage został przekroczony (${round(storageUsageMb)} MB / ${limits.storage_limit_mb} MB).`
    );
  }
}

function getReservedRam(bot) {
  return Number(bot.ram_limit_mb || DEFAULT_BOT_LIMITS.ram_limit_mb);
}

function getReservedCpu(bot) {
  return Number(bot.cpu_limit_percent || DEFAULT_BOT_LIMITS.cpu_limit_percent);
}

async function assertStartWithinLimits(bot) {
  const limits = getSystemLimits();
  const processList = await listBytehostProcesses().catch(() => []);
  const processMap = new Map(processList.map((processInfo) => [processInfo.name, processInfo]));

  let currentRamMb = 0;
  let currentCpuPercent = 0;

  for (const currentBot of listBotRows()) {
    if (currentBot.id === bot.id) {
      continue;
    }

    const runtime = deriveBotRuntime(currentBot, processMap.get(currentBot.pm2_name));
    if (runtime.status !== "ONLINE") {
      continue;
    }

    currentRamMb += runtime.ram_usage_mb;
    currentCpuPercent += runtime.cpu_usage_percent;
  }

  const projectedRamMb = currentRamMb + getReservedRam(bot);
  const projectedCpuPercent = currentCpuPercent + getReservedCpu(bot);

  if (limits.ram_limit_mb && projectedRamMb > limits.ram_limit_mb) {
    throw createHttpError(
      400,
      `Start zablokowany: globalny limit RAM zostałby przekroczony (${round(projectedRamMb)} MB / ${limits.ram_limit_mb} MB).`
    );
  }

  if (limits.cpu_limit_percent && projectedCpuPercent > limits.cpu_limit_percent) {
    throw createHttpError(
      400,
      `Start zablokowany: globalny limit CPU zostałby przekroczony (${round(projectedCpuPercent)}% / ${limits.cpu_limit_percent}%).`
    );
  }

  await assertStorageWithinLimit();
}

async function getBotWithRuntime(botId) {
  const bot = getBotRow(botId);
  const processInfo = await describeProcess(bot.pm2_name);

  return {
    ...mergeBotWithRuntime(bot, processInfo),
    storage_usage_mb: round(toMb(await getDirectorySize(bot.project_path)))
  };
}

async function listBots() {
  const processList = await listBytehostProcesses().catch(() => []);
  const processMap = new Map(processList.map((processInfo) => [processInfo.name, processInfo]));

  return Promise.all(
    listBotRows().map(async (bot) => ({
      ...mergeBotWithRuntime(bot, processMap.get(bot.pm2_name)),
      storage_usage_mb: round(toMb(await getDirectorySize(bot.project_path)))
    }))
  );
}

async function createBot(payload, archiveFile) {
  const limits = getSystemLimits();
  const currentBotCount = getDb().prepare("SELECT COUNT(*) AS total FROM bots").get().total;

  if (limits.max_bots && currentBotCount >= limits.max_bots) {
    throw createHttpError(400, `Osiągnięto limit liczby botów (${limits.max_bots}).`);
  }

  const botId = randomId();
  const botDirectory = await ensureBotDirectory(botId);

  try {
    if (archiveFile) {
      await extractArchive(archiveFile.path, botDirectory);
    }

    const analysis = await analyzeProject(botDirectory);
    const createdAt = nowIso();
    const expiresAt = normalizeExpiresAt(payload.expires_at);
    const derivedName =
      coerceNullableString(payload.name, null) ||
      path.basename(
        archiveFile?.originalname || `bot-${botId.slice(0, 8)}`,
        path.extname(archiveFile?.originalname || "")
      );

    createBotRecord({
      id: botId,
      name: derivedName,
      slug: slugify(derivedName) || botId.slice(0, 8),
      description: coerceNullableString(payload.description, "") || "",
      language: sanitizeLanguage(payload.language, analysis.detected_language || "Node.js"),
      detected_language: analysis.detected_language,
      entry_file: normalizeRelativePath(
        coerceNullableString(payload.entry_file, analysis.detected_entry_file) || ""
      ),
      detected_entry_file: analysis.detected_entry_file,
      start_command: coerceNullableString(payload.start_command, analysis.detected_start_command),
      detected_start_command: analysis.detected_start_command,
      install_command: analysis.install_command,
      detected_install_command: analysis.install_command,
      package_manager: analysis.package_manager,
      project_path: botDirectory,
      status: isExpired(expiresAt) ? "EXPIRED" : "OFFLINE",
      status_message: isExpired(expiresAt) ? "Bot wygasł i został zablokowany." : null,
      expires_at: expiresAt,
      auto_restart: coerceBoolean(payload.auto_restart, true),
      restart_delay: coerceNullableNumber(payload.restart_delay, DEFAULT_BOT_LIMITS.restart_delay),
      max_restarts: coerceNullableNumber(payload.max_restarts, DEFAULT_BOT_LIMITS.max_restarts),
      restart_count: 0,
      last_restart_at: null,
      stability_status: "STOPPED",
      ram_limit_mb: coerceNullableNumber(payload.ram_limit_mb, DEFAULT_BOT_LIMITS.ram_limit_mb),
      cpu_limit_percent: coerceNullableNumber(
        payload.cpu_limit_percent,
        DEFAULT_BOT_LIMITS.cpu_limit_percent
      ),
      archive_name: archiveFile?.originalname || null,
      pm2_name: getBotProcessName(botId),
      created_at: createdAt,
      updated_at: createdAt
    });

    await assertStorageWithinLimit();

    if (archiveFile) {
      await fs.rm(archiveFile.path, { force: true });
    }

    if (coerceBoolean(payload.install_on_create, false)) {
      await installDependencies(botId);
    }

    return getBotWithRuntime(botId);
  } catch (error) {
    await removePath(botDirectory);
    if (archiveFile) {
      await fs.rm(archiveFile.path, { force: true });
    }
    throw error;
  }
}

async function updateBot(botId, payload) {
  const existingBot = getBotRow(botId);
  const nextExpiresAt =
    payload.expires_at !== undefined ? normalizeExpiresAt(payload.expires_at) : existingBot.expires_at;

  const changes = {
    name: coerceNullableString(payload.name, existingBot.name) || existingBot.name,
    description:
      payload.description !== undefined
        ? coerceNullableString(payload.description, "") || ""
        : existingBot.description,
    language: sanitizeLanguage(payload.language, existingBot.language),
    entry_file:
      payload.entry_file !== undefined
        ? normalizeRelativePath(coerceNullableString(payload.entry_file, "") || "")
        : existingBot.entry_file,
    start_command:
      payload.start_command !== undefined
        ? coerceNullableString(payload.start_command, null)
        : existingBot.start_command,
    expires_at: nextExpiresAt,
    auto_restart:
      payload.auto_restart !== undefined
        ? coerceBoolean(payload.auto_restart, existingBot.auto_restart)
        : existingBot.auto_restart,
    restart_delay:
      payload.restart_delay !== undefined
        ? coerceNullableNumber(payload.restart_delay, existingBot.restart_delay)
        : existingBot.restart_delay,
    max_restarts:
      payload.max_restarts !== undefined
        ? coerceNullableNumber(payload.max_restarts, existingBot.max_restarts)
        : existingBot.max_restarts,
    ram_limit_mb:
      payload.ram_limit_mb !== undefined
        ? coerceNullableNumber(payload.ram_limit_mb, existingBot.ram_limit_mb)
        : existingBot.ram_limit_mb,
    cpu_limit_percent:
      payload.cpu_limit_percent !== undefined
        ? coerceNullableNumber(payload.cpu_limit_percent, existingBot.cpu_limit_percent)
        : existingBot.cpu_limit_percent,
    updated_at: nowIso()
  };

  if (isExpired(nextExpiresAt)) {
    changes.status = "EXPIRED";
    changes.status_message = "Bot wygasł i został zatrzymany przez scheduler.";
  } else if (existingBot.status === "EXPIRED") {
    changes.status = "OFFLINE";
    changes.status_message = null;
  }

  updateBotRow(botId, {
    ...changes,
    auto_restart: changes.auto_restart ? 1 : 0
  });

  if (isExpired(nextExpiresAt)) {
    await stopProcess(existingBot.pm2_name);
  }

  const requiresRestart =
    existingBot.status === "ONLINE" &&
    (payload.entry_file !== undefined ||
      payload.start_command !== undefined ||
      payload.auto_restart !== undefined ||
      payload.restart_delay !== undefined ||
      payload.max_restarts !== undefined ||
      payload.ram_limit_mb !== undefined);

  if (requiresRestart) {
    await restartBot(botId);
  }

  return getBotWithRuntime(botId);
}

async function deleteBotById(botId) {
  const bot = getBotRow(botId);
  await deleteProcess(bot.pm2_name);
  await removeBotLogs(bot.id);
  await removePath(bot.project_path);
  getDb().prepare("DELETE FROM bots WHERE id = ?").run(botId);
  return { ok: true };
}

async function startBot(botId) {
  const bot = getBotRow(botId);

  if (isExpired(bot.expires_at)) {
    throw createHttpError(400, "Bot wygasł. Zmień expires_at, aby go uruchomić.");
  }

  if (!bot.start_command) {
    throw createHttpError(400, "Brakuje komendy startowej.");
  }

  await assertStartWithinLimits(bot);
  await startBotProcess(bot);
  updateBotRow(botId, {
    status: "ONLINE",
    status_message: null,
    last_restart_at: nowIso(),
    updated_at: nowIso()
  });

  return getBotWithRuntime(botId);
}

async function stopBot(botId) {
  const bot = getBotRow(botId);
  await stopProcess(bot.pm2_name);
  updateBotRow(botId, {
    status: "OFFLINE",
    status_message: null,
    updated_at: nowIso()
  });
  return getBotWithRuntime(botId);
}

async function restartBot(botId) {
  await deleteProcess(getBotRow(botId).pm2_name);
  return startBot(botId);
}

async function installDependencies(botId) {
  const bot = getBotRow(botId);
  const command = bot.install_command || bot.detected_install_command;

  if (!command) {
    return {
      bot: await getBotWithRuntime(botId),
      install: {
        skipped: true,
        command: null,
        stdout: "",
        stderr: "",
        message: "Nie wykryto komendy instalacji zależności."
      }
    };
  }

  try {
    const result = await runShellCommand(command, {
      cwd: bot.project_path,
      maxOutput: 200000
    });

    return {
      bot: await getBotWithRuntime(botId),
      install: {
        skipped: false,
        command,
        stdout: result.stdout,
        stderr: result.stderr
      }
    };
  } catch (error) {
    throw createHttpError(400, `Instalacja zależności nie powiodła się: ${error.message}`, {
      stdout: error.stdout,
      stderr: error.stderr
    });
  }
}

async function getBotLogsPayload(botId) {
  getBotRow(botId);
  return getBotLogs(botId);
}

async function getBotFiles(botId, relativePath = "") {
  getBotRow(botId);
  return readFileEntry(botId, relativePath);
}

async function createBotFile(botId, payload) {
  getBotRow(botId);
  await createEntry(botId, payload);
  await assertStorageWithinLimit();
  return getBotFiles(botId, payload.path);
}

async function updateBotFile(botId, payload) {
  getBotRow(botId);
  return updateFileContent(botId, payload);
}

async function deleteBotFile(botId, relativePath) {
  getBotRow(botId);
  const normalizedPath = normalizeRelativePath(relativePath);
  await deleteEntry(botId, normalizedPath);
  const parentPath = path.posix.dirname(normalizedPath);
  return getBotFiles(botId, parentPath === "." ? "" : parentPath);
}

async function uploadBotFiles(botId, targetPath, files) {
  getBotRow(botId);
  const response = await uploadFiles(botId, targetPath, files);
  await assertStorageWithinLimit();
  return response;
}

async function updateBotEnv(botId, content) {
  getBotRow(botId);
  const envPath = resolveBotPath(botId, ".env");
  await fs.writeFile(envPath, content || "", "utf8");
  return readFileEntry(botId, ".env");
}

module.exports = {
  listBots,
  createBot,
  getBotWithRuntime,
  updateBot,
  deleteBotById,
  startBot,
  stopBot,
  restartBot,
  installDependencies,
  getBotLogsPayload,
  getBotFiles,
  createBotFile,
  updateBotFile,
  deleteBotFile,
  uploadBotFiles,
  updateBotEnv
};
