const fs = require("fs/promises");
const path = require("path");

const { DEFAULT_BOT_LIMITS, BOTS_DIR, TMP_DIR } = require("../config");
const { getDb, mapBotRow } = require("./db");
const { detectUploadedArtifactKind, importProjectArtifact } = require("./archive");
const { analyzeProject, buildMinecraftStartCommand } = require("./analyzer");
const { runShellCommand } = require("./commands");
const { getBotLogs, appendBotLog, removeBotLogs } = require("./logs");
const { downloadMinecraftServerJar } = require("./minecraft");
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
const {
  readFileEntry,
  createEntry,
  updateFileContent,
  deleteEntry,
  uploadFiles
} = require("./files");
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

const ALLOWED_LANGUAGES = new Set(["Node.js", "TypeScript", "Python", "Java"]);
const ALLOWED_SERVICE_TYPES = new Set(["discord_bot", "minecraft_server"]);
const DEFAULT_CONSOLE_TIMEOUT_MS = 20000;
const MAX_CONSOLE_COMMAND_LENGTH = 2000;

function sanitizeServiceType(value, fallback = "discord_bot") {
  if (!value) {
    return fallback;
  }

  return ALLOWED_SERVICE_TYPES.has(value) ? value : fallback;
}

function sanitizeLanguage(value, fallback, serviceType = "discord_bot") {
  if (serviceType === "minecraft_server") {
    return "Java";
  }

  if (!value) {
    return fallback;
  }

  return ALLOWED_LANGUAGES.has(value) ? value : fallback;
}

function sanitizePublicPort(value, fallback = null) {
  const parsed = coerceNullableNumber(value, fallback);
  if (parsed === null || parsed === undefined) {
    return fallback;
  }

  const port = Math.trunc(Number(parsed));
  if (port < 1 || port > 65535) {
    throw createHttpError(400, "Port publiczny musi byc z zakresu 1-65535.");
  }

  return port;
}

function normalizeMinecraftVersion(value, fallback = null) {
  return coerceNullableString(value, fallback);
}

function normalizeExpiresAt(value) {
  const normalized = coerceNullableString(value, null);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, "Nieprawidlowa data wygasniecia.");
  }

  return parsed.toISOString();
}

function listBotRows() {
  return getDb().prepare("SELECT * FROM bots ORDER BY created_at DESC").all().map(mapBotRow);
}

function getBotRow(botId) {
  const bot = mapBotRow(getDb().prepare("SELECT * FROM bots WHERE id = ?").get(botId));

  if (!bot) {
    throw createHttpError(404, "Usluga nie zostala znaleziona.");
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
          id, service_type, name, slug, description, language, detected_language, entry_file,
          detected_entry_file, start_command, detected_start_command, install_command,
          detected_install_command, package_manager, project_path, status, status_message,
          expires_at, auto_restart, restart_delay, max_restarts, restart_count, last_restart_at,
          stability_status, ram_limit_mb, cpu_limit_percent, accept_eula, public_host,
          public_port, minecraft_version, detected_minecraft_version, archive_name, pm2_name,
          created_at, updated_at
        )
        VALUES (
          @id, @service_type, @name, @slug, @description, @language, @detected_language,
          @entry_file, @detected_entry_file, @start_command, @detected_start_command,
          @install_command, @detected_install_command, @package_manager, @project_path, @status,
          @status_message, @expires_at, @auto_restart, @restart_delay, @max_restarts,
          @restart_count, @last_restart_at, @stability_status, @ram_limit_mb, @cpu_limit_percent,
          @accept_eula, @public_host, @public_port, @minecraft_version,
          @detected_minecraft_version, @archive_name, @pm2_name, @created_at, @updated_at
        )
      `
    )
    .run({
      ...record,
      auto_restart: record.auto_restart ? 1 : 0,
      accept_eula: record.accept_eula ? 1 : 0
    });

  return getBotRow(record.id);
}

function normalizeSettingValue(value, normalizer = (entry) => entry) {
  const normalized = normalizer(value);
  return normalized === undefined || normalized === null ? "" : normalized;
}

function resolveUpdatedSetting(currentValue, previousDetected, nextDetected, normalizer = (entry) => entry) {
  const currentNormalized = normalizeSettingValue(currentValue, normalizer);
  const previousDetectedNormalized = normalizeSettingValue(previousDetected, normalizer);

  if (!currentNormalized || currentNormalized === previousDetectedNormalized) {
    return nextDetected;
  }

  return currentValue;
}

async function readUtf8IfExists(targetPath) {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function clearDirectoryContents(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    await fs.rm(path.join(directoryPath, entry.name), { recursive: true, force: true });
  }
}

async function moveDirectoryContents(sourceDirectory, destinationDirectory) {
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    await fs.rename(
      path.join(sourceDirectory, entry.name),
      path.join(destinationDirectory, entry.name)
    );
  }
}

async function assertStorageWithinLimit() {
  const limits = getSystemLimits();
  const storageUsageMb = toMb(await getDirectorySize(BOTS_DIR));

  if (limits.storage_limit_mb && storageUsageMb > limits.storage_limit_mb) {
    throw createHttpError(
      400,
      `Limit storage zostal przekroczony (${round(storageUsageMb)} MB / ${limits.storage_limit_mb} MB).`
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
      `Start zablokowany: globalny limit RAM zostalby przekroczony (${round(projectedRamMb)} MB / ${limits.ram_limit_mb} MB).`
    );
  }

  if (limits.cpu_limit_percent && projectedCpuPercent > limits.cpu_limit_percent) {
    throw createHttpError(
      400,
      `Start zablokowany: globalny limit CPU zostalby przekroczony (${round(projectedCpuPercent)}% / ${limits.cpu_limit_percent}%).`
    );
  }

  await assertStorageWithinLimit();
}

function resolveEffectiveEntryFile(bot) {
  return normalizeRelativePath(bot.entry_file || bot.detected_entry_file || "");
}

function isUsingDetectedEntryFile(bot) {
  return !bot.entry_file || bot.entry_file === bot.detected_entry_file;
}

function isUsingDetectedMinecraftStartCommand(bot) {
  return (
    !bot.start_command ||
    bot.start_command === bot.detected_start_command ||
    bot.start_command === buildMinecraftStartCommand(resolveEffectiveEntryFile(bot), bot.ram_limit_mb)
  );
}

function resolveEffectiveStartCommand(bot) {
  if (bot.start_command) {
    return bot.start_command;
  }

  if (bot.detected_start_command) {
    return bot.detected_start_command;
  }

  if (bot.service_type === "minecraft_server") {
    return buildMinecraftStartCommand(resolveEffectiveEntryFile(bot), bot.ram_limit_mb);
  }

  return null;
}

function assertArtifactAllowed(serviceType, artifactKind) {
  if (serviceType !== "minecraft_server" && artifactKind === ".jar") {
    throw createHttpError(
      400,
      "Boty Discord obsluguja tylko ZIP albo RAR. Plik JAR jest dostepny dla serwerow Minecraft."
    );
  }
}

async function analyzeServiceProject(projectPath, serviceType, ramLimitMb) {
  return analyzeProject(projectPath, {
    serviceType,
    ramLimitMb
  });
}

function getDefaultStartCommand(serviceType, entryFile, detectedStartCommand, ramLimitMb) {
  if (serviceType === "minecraft_server") {
    return buildMinecraftStartCommand(entryFile, ramLimitMb);
  }

  return detectedStartCommand;
}

async function isMinecraftEulaAccepted(projectPath) {
  const content = await readUtf8IfExists(path.join(projectPath, "eula.txt"));
  if (!content) {
    return false;
  }

  return /^eula\s*=\s*true$/im.test(content);
}

async function ensureMinecraftEula(projectPath) {
  const eulaPath = path.join(projectPath, "eula.txt");
  const current = await readUtf8IfExists(eulaPath);

  if (current && /^eula\s*=\s*true$/im.test(current)) {
    return;
  }

  if (current && /^eula\s*=\s*false$/im.test(current)) {
    await fs.writeFile(eulaPath, current.replace(/^eula\s*=\s*false$/im, "eula=true"), "utf8");
    return;
  }

  await fs.writeFile(
    eulaPath,
    [
      "# ByteHost accepted the Minecraft EULA on behalf of the operator.",
      `# ${new Date().toISOString()}`,
      "eula=true",
      ""
    ].join("\n"),
    "utf8"
  );
}

async function downloadOfficialMinecraftServer(projectPath, versionId, currentEntryFile = "") {
  const normalizedCurrentEntry = normalizeRelativePath(currentEntryFile || "");

  if (
    normalizedCurrentEntry &&
    normalizedCurrentEntry.toLowerCase().endsWith(".jar") &&
    normalizedCurrentEntry !== "server.jar"
  ) {
    await fs.rm(path.join(projectPath, normalizedCurrentEntry), { force: true });
  }

  return downloadMinecraftServerJar(projectPath, versionId, "server.jar");
}

async function bootstrapMinecraftWorkspace(projectPath, options = {}) {
  const eulaAccepted = Boolean(options.acceptEula);
  const motd = coerceNullableString(options.name, "ByteHost Minecraft Server");
  const serverPropertiesPath = path.join(projectPath, "server.properties");
  const eulaPath = path.join(projectPath, "eula.txt");
  const readmePath = path.join(projectPath, "README_BYTEHOST_MINECRAFT.txt");

  if (!(await fileExists(serverPropertiesPath))) {
    await fs.writeFile(
      serverPropertiesPath,
      [
        "enable-query=false",
        "enable-rcon=false",
        "gamemode=survival",
        "max-players=20",
        `motd=${motd}`,
        "online-mode=true",
        "server-ip=",
        "server-port=25565",
        "view-distance=10",
        ""
      ].join("\n"),
      "utf8"
    );
  }

  if (!(await fileExists(eulaPath))) {
    await fs.writeFile(
      eulaPath,
      [
        "# ByteHost Minecraft workspace",
        `eula=${eulaAccepted ? "true" : "false"}`,
        ""
      ].join("\n"),
      "utf8"
    );
  }

  if (!(await fileExists(readmePath))) {
    await fs.writeFile(
      readmePath,
      [
        "ByteHost utworzyl pusty serwer Minecraft bez pliku JAR.",
        "Mozesz teraz:",
        "1. Wrzucic server.jar lub inny plik JAR przez przycisk aktualizacji.",
        "2. Albo wrzucic gotowy pakiet ZIP/RAR z plikami serwera.",
        "3. Po dodaniu JAR-a uruchom serwer z panelu.",
        ""
      ].join("\n"),
      "utf8"
    );
  }
}

async function replaceMinecraftServerJar(bot, artifactFile) {
  const currentEntry = resolveEffectiveEntryFile(bot);
  if (currentEntry && currentEntry.toLowerCase().endsWith(".jar")) {
    await fs.rm(path.join(bot.project_path, currentEntry), { force: true });
  }

  await importProjectArtifact(artifactFile.path, bot.project_path, {
    originalName: artifactFile.originalname
  });
}

async function recordBotFailure(bot, message, options = {}) {
  const failureStatus = options.status || "ERROR";
  const failureMessage = String(message || "Usluga zakonczona bledem.");
  const timestamp = new Date().toISOString();

  await appendBotLog(
    bot.id,
    "error",
    [`[bytehost] ${timestamp}`, failureMessage, ""].join("\n")
  ).catch(() => {});

  updateBotRow(bot.id, {
    status: failureStatus,
    status_message: failureMessage,
    stability_status: failureStatus === "CRASH LOOP" ? "CRASH LOOP" : "UNSTABLE",
    updated_at: nowIso()
  });
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

async function createBot(payload, artifactFile) {
  const limits = getSystemLimits();
  const currentBotCount = getDb().prepare("SELECT COUNT(*) AS total FROM bots").get().total;

  if (limits.max_bots && currentBotCount >= limits.max_bots) {
    throw createHttpError(400, `Osiagnieto limit liczby uslug (${limits.max_bots}).`);
  }

  const serviceType = sanitizeServiceType(payload.service_type, "discord_bot");
  const ramLimitMb = coerceNullableNumber(payload.ram_limit_mb, DEFAULT_BOT_LIMITS.ram_limit_mb);
  const requestedMinecraftVersion =
    serviceType === "minecraft_server"
      ? normalizeMinecraftVersion(payload.minecraft_version, null)
      : null;
  const botId = randomId();
  const botDirectory = await ensureBotDirectory(botId);
  let resolvedMinecraftVersion = null;

  try {
    if (artifactFile) {
      const artifactKind = await detectUploadedArtifactKind(artifactFile.path, artifactFile.originalname);
      assertArtifactAllowed(serviceType, artifactKind);
      await importProjectArtifact(artifactFile.path, botDirectory, {
        originalName: artifactFile.originalname
      });
    } else if (serviceType === "minecraft_server") {
      await bootstrapMinecraftWorkspace(botDirectory, {
        acceptEula: coerceBoolean(payload.accept_eula, false),
        name: payload.name
      });
      const download = await downloadOfficialMinecraftServer(botDirectory, requestedMinecraftVersion);
      resolvedMinecraftVersion = download.minecraft_version;
    }

    const analysis = await analyzeServiceProject(botDirectory, serviceType, ramLimitMb);
    const createdAt = nowIso();
    const expiresAt = normalizeExpiresAt(payload.expires_at);
    const derivedName =
      coerceNullableString(payload.name, null) ||
      path.basename(
        artifactFile?.originalname || `${serviceType === "minecraft_server" ? "minecraft" : "bot"}-${botId.slice(0, 8)}`,
        path.extname(artifactFile?.originalname || "")
      );
    const entryFile = normalizeRelativePath(
      coerceNullableString(payload.entry_file, analysis.detected_entry_file) || ""
    );
    const defaultStartCommand = getDefaultStartCommand(
      serviceType,
      entryFile || analysis.detected_entry_file,
      analysis.detected_start_command,
      ramLimitMb
    );

    createBotRecord({
      id: botId,
      service_type: serviceType,
      name: derivedName,
      slug: slugify(derivedName) || botId.slice(0, 8),
      description: coerceNullableString(payload.description, "") || "",
      language: sanitizeLanguage(payload.language, analysis.detected_language || "Node.js", serviceType),
      detected_language: analysis.detected_language,
      entry_file: entryFile,
      detected_entry_file: analysis.detected_entry_file,
      start_command: coerceNullableString(payload.start_command, defaultStartCommand),
      detected_start_command: defaultStartCommand || analysis.detected_start_command,
      install_command: analysis.install_command,
      detected_install_command: analysis.install_command,
      package_manager: analysis.package_manager,
      project_path: botDirectory,
      status: isExpired(expiresAt) ? "EXPIRED" : "OFFLINE",
      status_message: isExpired(expiresAt) ? "Usluga wygasla i zostala zablokowana." : null,
      expires_at: expiresAt,
      auto_restart: coerceBoolean(payload.auto_restart, true),
      restart_delay: coerceNullableNumber(payload.restart_delay, DEFAULT_BOT_LIMITS.restart_delay),
      max_restarts: coerceNullableNumber(payload.max_restarts, DEFAULT_BOT_LIMITS.max_restarts),
      restart_count: 0,
      last_restart_at: null,
      stability_status: "STOPPED",
      ram_limit_mb: ramLimitMb,
      cpu_limit_percent: coerceNullableNumber(
        payload.cpu_limit_percent,
        DEFAULT_BOT_LIMITS.cpu_limit_percent
      ),
      accept_eula: serviceType === "minecraft_server" ? coerceBoolean(payload.accept_eula, false) : false,
      public_host:
        serviceType === "minecraft_server" ? coerceNullableString(payload.public_host, null) : null,
      public_port:
        serviceType === "minecraft_server" ? sanitizePublicPort(payload.public_port, 25565) : null,
      minecraft_version:
        serviceType === "minecraft_server"
          ? normalizeMinecraftVersion(payload.minecraft_version, resolvedMinecraftVersion)
          : null,
      detected_minecraft_version:
        serviceType === "minecraft_server" ? resolvedMinecraftVersion : null,
      archive_name: artifactFile?.originalname || null,
      pm2_name: getBotProcessName(botId),
      created_at: createdAt,
      updated_at: createdAt
    });

    await assertStorageWithinLimit();

    if (artifactFile) {
      await fs.rm(artifactFile.path, { force: true });
    }

    if (coerceBoolean(payload.install_on_create, false) && serviceType !== "minecraft_server") {
      await installDependencies(botId);
    }

    return getBotWithRuntime(botId);
  } catch (error) {
    await removePath(botDirectory);
    if (artifactFile) {
      await fs.rm(artifactFile.path, { force: true });
    }
    throw error;
  }
}

async function updateBot(botId, payload) {
  const existingBot = getBotRow(botId);
  const nextExpiresAt =
    payload.expires_at !== undefined
      ? normalizeExpiresAt(payload.expires_at)
      : existingBot.expires_at;
  const nextRamLimit =
    payload.ram_limit_mb !== undefined
      ? coerceNullableNumber(payload.ram_limit_mb, existingBot.ram_limit_mb)
      : existingBot.ram_limit_mb;
  let nextEntryFile =
    payload.entry_file !== undefined
      ? normalizeRelativePath(coerceNullableString(payload.entry_file, "") || "")
      : existingBot.entry_file;
  let nextDetectedEntryFile = existingBot.detected_entry_file;
  let nextDetectedMinecraftVersion = existingBot.detected_minecraft_version;
  const nextMinecraftVersion =
    existingBot.service_type === "minecraft_server"
      ? payload.minecraft_version !== undefined
        ? normalizeMinecraftVersion(payload.minecraft_version, null)
        : normalizeMinecraftVersion(existingBot.minecraft_version, null)
      : null;

  if (existingBot.service_type === "minecraft_server") {
    const selectedEntryFile = nextEntryFile || nextDetectedEntryFile;
    const entryExists = selectedEntryFile
      ? await fileExists(path.join(existingBot.project_path, selectedEntryFile))
      : false;
    const shouldDownloadSelectedVersion =
      Boolean(nextMinecraftVersion) &&
      (payload.minecraft_version !== undefined || !entryExists);

    if (shouldDownloadSelectedVersion) {
      const download = await downloadOfficialMinecraftServer(
        existingBot.project_path,
        nextMinecraftVersion,
        resolveEffectiveEntryFile(existingBot)
      );

      nextDetectedEntryFile = download.entry_file;
      nextDetectedMinecraftVersion = download.minecraft_version;

      if (
        payload.entry_file === undefined &&
        (isUsingDetectedEntryFile(existingBot) || !nextEntryFile)
      ) {
        nextEntryFile = download.entry_file;
      }
    }
  }

  const nextMinecraftAuto = buildMinecraftStartCommand(
    nextEntryFile || nextDetectedEntryFile,
    nextRamLimit
  );
  const defaultStartCommand =
    existingBot.service_type === "minecraft_server"
      ? nextMinecraftAuto
      : existingBot.detected_start_command;

  let nextStartCommand =
    payload.start_command !== undefined
      ? coerceNullableString(payload.start_command, null)
      : existingBot.start_command;

  if (
    existingBot.service_type === "minecraft_server" &&
    payload.start_command === undefined &&
    isUsingDetectedMinecraftStartCommand(existingBot)
  ) {
    nextStartCommand = defaultStartCommand;
  }

  const changes = {
    name: coerceNullableString(payload.name, existingBot.name) || existingBot.name,
    description:
      payload.description !== undefined
        ? coerceNullableString(payload.description, "") || ""
        : existingBot.description,
    language: sanitizeLanguage(
      payload.language,
      existingBot.language,
      existingBot.service_type
    ),
    entry_file: nextEntryFile,
    detected_entry_file: nextDetectedEntryFile,
    start_command: nextStartCommand,
    detected_start_command: defaultStartCommand,
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
    ram_limit_mb: nextRamLimit,
    cpu_limit_percent:
      payload.cpu_limit_percent !== undefined
        ? coerceNullableNumber(payload.cpu_limit_percent, existingBot.cpu_limit_percent)
        : existingBot.cpu_limit_percent,
    accept_eula:
      existingBot.service_type === "minecraft_server" && payload.accept_eula !== undefined
        ? coerceBoolean(payload.accept_eula, existingBot.accept_eula)
        : existingBot.accept_eula,
    public_host:
      existingBot.service_type === "minecraft_server" && payload.public_host !== undefined
        ? coerceNullableString(payload.public_host, null)
        : existingBot.public_host,
    public_port:
      existingBot.service_type === "minecraft_server" && payload.public_port !== undefined
        ? sanitizePublicPort(payload.public_port, existingBot.public_port || 25565)
        : existingBot.public_port,
    minecraft_version:
      existingBot.service_type === "minecraft_server"
        ? nextMinecraftVersion
        : existingBot.minecraft_version,
    detected_minecraft_version:
      existingBot.service_type === "minecraft_server"
        ? nextDetectedMinecraftVersion
        : existingBot.detected_minecraft_version,
    updated_at: nowIso()
  };

  if (isExpired(nextExpiresAt)) {
    changes.status = "EXPIRED";
    changes.status_message = "Usluga wygasla i zostala zatrzymana przez scheduler.";
  } else if (existingBot.status === "EXPIRED") {
    changes.status = "OFFLINE";
    changes.status_message = null;
  }

  updateBotRow(botId, {
    ...changes,
    auto_restart: changes.auto_restart ? 1 : 0,
    accept_eula: changes.accept_eula ? 1 : 0
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
      payload.ram_limit_mb !== undefined ||
      payload.minecraft_version !== undefined);

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
  let bot = getBotRow(botId);

  try {
    if (isExpired(bot.expires_at)) {
      throw createHttpError(400, "Usluga wygasla. Zmien expires_at, aby ja uruchomic.");
    }

    if (bot.service_type === "minecraft_server") {
      const accepted = bot.accept_eula || (await isMinecraftEulaAccepted(bot.project_path));
      if (!accepted) {
        throw createHttpError(
          400,
          "Aby uruchomic serwer Minecraft, zaznacz akceptacje EULA albo ustaw eula=true w eula.txt."
        );
      }

      await ensureMinecraftEula(bot.project_path);

      let entryFile = resolveEffectiveEntryFile(bot);
      const entryPath = entryFile ? path.join(bot.project_path, entryFile) : null;
      const entryExists = entryPath ? await fileExists(entryPath) : false;

      if ((!entryFile || !entryExists) && bot.minecraft_version) {
        const download = await downloadOfficialMinecraftServer(
          bot.project_path,
          bot.minecraft_version,
          entryFile
        );

        const downloadedEntryFile = download.entry_file;
        const nextDetectedStartCommand = buildMinecraftStartCommand(
          downloadedEntryFile,
          bot.ram_limit_mb
        );
        const nextRow = {
          detected_entry_file: downloadedEntryFile,
          detected_start_command: nextDetectedStartCommand,
          detected_minecraft_version: download.minecraft_version,
          updated_at: nowIso()
        };

        if (isUsingDetectedEntryFile(bot)) {
          nextRow.entry_file = downloadedEntryFile;
        }

        if (isUsingDetectedMinecraftStartCommand(bot)) {
          nextRow.start_command = nextDetectedStartCommand;
        }

        bot = updateBotRow(botId, nextRow);
        entryFile = resolveEffectiveEntryFile(bot);
      }

      if (!entryFile) {
        throw createHttpError(
          400,
          "Serwer Minecraft nie ma jeszcze pliku JAR. Wybierz wersje albo wrzuc server.jar przez aktualizacje uslugi."
        );
      }

      if (!(await fileExists(path.join(bot.project_path, entryFile)))) {
        throw createHttpError(
          400,
          `Nie znaleziono pliku startowego ${entryFile}. Wybierz wersje do pobrania albo wrzuc plik JAR recznie.`
        );
      }
    }

    const resolvedStartCommand = resolveEffectiveStartCommand(bot);
    if (!resolvedStartCommand) {
      throw createHttpError(400, "Brakuje komendy startowej.");
    }

    const nextDetectedStartCommand =
      bot.service_type === "minecraft_server"
        ? buildMinecraftStartCommand(resolveEffectiveEntryFile(bot), bot.ram_limit_mb)
        : bot.detected_start_command;

    if (
      bot.start_command !== resolvedStartCommand ||
      bot.detected_start_command !== nextDetectedStartCommand
    ) {
      bot = updateBotRow(botId, {
        start_command: resolvedStartCommand,
        detected_start_command: nextDetectedStartCommand,
        updated_at: nowIso()
      });
    }

    await assertStartWithinLimits(bot);
    await startBotProcess({
      ...bot,
      start_command: resolvedStartCommand
    });
    updateBotRow(botId, {
      status: "ONLINE",
      status_message: null,
      last_restart_at: nowIso(),
      updated_at: nowIso()
    });

    return getBotWithRuntime(botId);
  } catch (error) {
    await recordBotFailure(bot, error.message || "Nie udalo sie uruchomic uslugi.");
    throw error;
  }
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

  if (bot.service_type === "minecraft_server") {
    return {
      bot: await getBotWithRuntime(botId),
      install: {
        skipped: true,
        command: null,
        stdout: "",
        stderr: "",
        message:
          "Serwer Minecraft nie wymaga instalacji zaleznosci przez panel. Wgraj plik JAR albo gotowy pakiet serwera."
      }
    };
  }

  const command = bot.install_command || bot.detected_install_command;

  if (!command) {
    return {
      bot: await getBotWithRuntime(botId),
      install: {
        skipped: true,
        command: null,
        stdout: "",
        stderr: "",
        message: "Nie wykryto komendy instalacji zaleznosci."
      }
    };
  }

  try {
    const result = await runShellCommand(command, {
      cwd: bot.project_path,
      maxOutput: 200000,
      timeoutMs: 300000
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
    throw createHttpError(400, `Instalacja zaleznosci nie powiodla sie: ${error.message}`, {
      stdout: error.stdout,
      stderr: error.stderr
    });
  }
}

async function updateBotArchive(botId, artifactFile, payload = {}) {
  if (!artifactFile) {
    throw createHttpError(400, "Dodaj plik JAR, ZIP albo RAR do aktualizacji uslugi.");
  }

  const bot = getBotRow(botId);
  const processInfo = await describeProcess(bot.pm2_name);
  const runtime = deriveBotRuntime(bot, processInfo);
  const wasOnline = runtime.status === "ONLINE";
  const preserveEnv =
    payload.preserve_env !== undefined ? coerceBoolean(payload.preserve_env, true) : true;
  const reinstallDependenciesFlag =
    payload.reinstall_dependencies !== undefined
      ? coerceBoolean(payload.reinstall_dependencies, true)
      : true;
  const restartAfterUpdate =
    payload.restart_after_update !== undefined
      ? coerceBoolean(payload.restart_after_update, wasOnline)
      : wasOnline;
  const artifactKind = await detectUploadedArtifactKind(artifactFile.path, artifactFile.originalname);
  let install = null;

  assertArtifactAllowed(bot.service_type, artifactKind);

  try {
    await stopProcess(bot.pm2_name);

    if (bot.service_type === "minecraft_server" && artifactKind === ".jar") {
      await replaceMinecraftServerJar(bot, artifactFile);
    } else {
      const tempDirectory = path.join(TMP_DIR, `archive-${botId}-${Date.now()}`);
      const envPath = resolveBotPath(botId, ".env");
      const preservedEnv = preserveEnv ? await readUtf8IfExists(envPath) : null;

      await fs.mkdir(tempDirectory, { recursive: true });
      await importProjectArtifact(artifactFile.path, tempDirectory, {
        originalName: artifactFile.originalname
      });
      await clearDirectoryContents(bot.project_path);
      await moveDirectoryContents(tempDirectory, bot.project_path);

      if (preservedEnv !== null) {
        await fs.writeFile(envPath, preservedEnv, "utf8");
      }

      await fs.rm(tempDirectory, { recursive: true, force: true });
    }

    const analysis = await analyzeServiceProject(bot.project_path, bot.service_type, bot.ram_limit_mb);
    const nextLanguage =
      bot.service_type === "minecraft_server"
        ? "Java"
        : resolveUpdatedSetting(
            bot.language,
            bot.detected_language,
            analysis.detected_language,
            (value) => sanitizeLanguage(value, "", bot.service_type)
          );
    const nextEntryFile = resolveUpdatedSetting(
      bot.entry_file,
      bot.detected_entry_file,
      analysis.detected_entry_file,
      (value) => normalizeRelativePath(value || "")
    );
    const previousAutoStart =
      bot.service_type === "minecraft_server"
        ? buildMinecraftStartCommand(resolveEffectiveEntryFile(bot), bot.ram_limit_mb)
        : bot.detected_start_command;
    const nextAutoStart =
      bot.service_type === "minecraft_server"
        ? buildMinecraftStartCommand(nextEntryFile || analysis.detected_entry_file, bot.ram_limit_mb)
        : analysis.detected_start_command;
    const nextStartCommand =
      bot.service_type === "minecraft_server"
        ? resolveUpdatedSetting(
            bot.start_command,
            previousAutoStart,
            nextAutoStart,
            (value) => String(value || "").trim()
          )
        : resolveUpdatedSetting(
            bot.start_command,
            bot.detected_start_command,
            analysis.detected_start_command,
            (value) => String(value || "").trim()
          );

    updateBotRow(botId, {
      language: sanitizeLanguage(nextLanguage, analysis.detected_language || "Node.js", bot.service_type),
      detected_language: analysis.detected_language,
      entry_file: normalizeRelativePath(nextEntryFile || ""),
      detected_entry_file: analysis.detected_entry_file,
      start_command: coerceNullableString(nextStartCommand, nextAutoStart),
      detected_start_command: nextAutoStart,
      install_command: analysis.install_command,
      detected_install_command: analysis.install_command,
      package_manager: analysis.package_manager,
      minecraft_version: bot.service_type === "minecraft_server" ? null : bot.minecraft_version,
      detected_minecraft_version:
        bot.service_type === "minecraft_server" ? null : bot.detected_minecraft_version,
      archive_name: artifactFile.originalname || bot.archive_name,
      status: isExpired(bot.expires_at) ? "EXPIRED" : "OFFLINE",
      status_message: null,
      updated_at: nowIso()
    });

    await assertStorageWithinLimit();

    if (reinstallDependenciesFlag && bot.service_type !== "minecraft_server") {
      const installResponse = await installDependencies(botId);
      install = installResponse.install;
    }

    let updatedBot = await getBotWithRuntime(botId);

    if (restartAfterUpdate && !isExpired(updatedBot.expires_at)) {
      updatedBot = await startBot(botId);
    }

    return {
      bot: updatedBot,
      install
    };
  } finally {
    await fs.rm(artifactFile.path, { force: true });
  }
}

async function executeBotConsoleCommand(botId, payload) {
  const bot = getBotRow(botId);
  const command = coerceNullableString(payload?.command, null);

  if (!command) {
    throw createHttpError(400, "Podaj polecenie do wykonania.");
  }

  if (command.length > MAX_CONSOLE_COMMAND_LENGTH) {
    throw createHttpError(
      400,
      `Polecenie jest za dlugie (maks. ${MAX_CONSOLE_COMMAND_LENGTH} znakow).`
    );
  }

  const timeoutMs = coerceNullableNumber(payload?.timeout_ms, DEFAULT_CONSOLE_TIMEOUT_MS);
  const result = await runShellCommand(command, {
    cwd: bot.project_path,
    maxOutput: 200000,
    timeoutMs,
    allowFailure: true
  });

  return {
    cwd: bot.project_path,
    command,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    ran_at: nowIso()
  };
}

async function getBotLogsPayload(botId) {
  const bot = getBotRow(botId);
  const logs = await getBotLogs(botId);

  if (logs.combined) {
    return {
      ...logs,
      status_message: bot.status_message || null
    };
  }

  const processInfo = await describeProcess(bot.pm2_name).catch(() => null);
  const diagnostics = [];

  if (bot.status_message) {
    diagnostics.push(`Status message: ${bot.status_message}`);
  }

  if (processInfo?.pm2_env?.status) {
    diagnostics.push(`PM2 status: ${processInfo.pm2_env.status}`);
  }

  if (processInfo?.pm2_env?.exit_code !== undefined) {
    diagnostics.push(`Exit code: ${processInfo.pm2_env.exit_code}`);
  }

  if (processInfo?.pm2_env?.unstable_restarts !== undefined) {
    diagnostics.push(`Unstable restarts: ${processInfo.pm2_env.unstable_restarts}`);
  }

  if (processInfo?.pm2_env?.restart_time !== undefined) {
    diagnostics.push(`Restart count: ${processInfo.pm2_env.restart_time}`);
  }

  const combined = diagnostics.length
    ? `[bytehost diagnostics]\n${diagnostics.join("\n")}`
    : "";

  return {
    ...logs,
    combined,
    diagnostics,
    status_message: bot.status_message || null
  };
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
  updateBotArchive,
  executeBotConsoleCommand,
  getBotLogsPayload,
  getBotFiles,
  createBotFile,
  updateBotFile,
  deleteBotFile,
  uploadBotFiles,
  updateBotEnv
};
