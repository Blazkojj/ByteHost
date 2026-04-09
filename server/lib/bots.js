const fs = require("fs/promises");
const path = require("path");

const {
  DEFAULT_BOT_LIMITS,
  BOTS_DIR,
  BACKUPS_DIR,
  TMP_DIR,
  MINECRAFT_DEFAULT_PORT,
  MINECRAFT_PORT_RANGE_START,
  MINECRAFT_PORT_RANGE_END,
  FIVEM_DEFAULT_PORT,
  FIVEM_PORT_RANGE_START,
  FIVEM_PORT_RANGE_END
} = require("../config");
const { getDb, mapBotRow } = require("./db");
const { detectUploadedArtifactKind, importProjectArtifact } = require("./archive");
const {
  analyzeProject,
  buildMinecraftStartCommand,
  buildFiveMStartCommand
} = require("./analyzer");
const { runShellCommand } = require("./commands");
const {
  bootstrapFiveMWorkspace,
  detectPublicGameHost,
  normalizePublicHost,
  repairFiveMWorkspace,
  writeFiveMServerConfig
} = require("./fivem");
const { getBotLogs, appendBotLog, removeBotLogs } = require("./logs");
const { downloadMinecraftServerJar } = require("./minecraft");
const { mergeBotWithRuntime, deriveBotRuntime } = require("./runtime");
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
  startBotProcess,
  hasManagedServerConsole,
  getManagedConsoleInputPath,
  sendManagedConsoleCommand
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
  canUserManageServices,
  getUserById,
  hasProvisionedPlan,
  isAdminUser,
  isUserExpired
} = require("./users");
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

const ALLOWED_LANGUAGES = new Set(["Node.js", "TypeScript", "Python", "Java", "FiveM"]);
const ALLOWED_SERVICE_TYPES = new Set(["discord_bot", "minecraft_server", "fivem_server"]);
const DEFAULT_CONSOLE_TIMEOUT_MS = 20000;
const MAX_CONSOLE_COMMAND_LENGTH = 2000;

function sanitizeServiceType(value, fallback = "discord_bot") {
  if (!value) {
    return fallback;
  }

  return ALLOWED_SERVICE_TYPES.has(value) ? value : fallback;
}

function normalizeConsoleCommand(value) {
  return String(value || "")
    .replace(/\r?\n+/g, " ")
    .trim();
}

function sanitizeLanguage(value, fallback, serviceType = "discord_bot") {
  if (serviceType === "minecraft_server") {
    return "Java";
  }

  if (serviceType === "fivem_server") {
    return "FiveM";
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

function normalizeFiveMText(value, fallback = null) {
  return coerceNullableString(value, fallback);
}

function sanitizeFiveMMaxClients(value, fallback = 48) {
  const parsed = coerceNullableNumber(value, fallback);
  const maxClients = Math.trunc(Number(parsed || fallback));

  if (maxClients < 1 || maxClients > 128) {
    throw createHttpError(400, "Liczba slotow FiveM musi byc z zakresu 1-128.");
  }

  return maxClients;
}

function isGameService(serviceType) {
  return serviceType === "minecraft_server" || serviceType === "fivem_server";
}

function getDefaultServicePort(serviceType) {
  if (serviceType === "minecraft_server") {
    return MINECRAFT_DEFAULT_PORT;
  }

  if (serviceType === "fivem_server") {
    return FIVEM_DEFAULT_PORT;
  }

  return null;
}

function listReservedPublicPorts(options = {}) {
  const { excludeBotId = null } = options;

  return new Set(
    listBotRows(null)
      .filter((bot) => bot.id !== excludeBotId)
      .map((bot) => Number(bot.public_port || 0))
      .filter((port) => port > 0)
  );
}

function allocateServicePort(serviceType, preferredPort = null, options = {}) {
  const reservedPorts = listReservedPublicPorts(options);
  const sanitizedPreferredPort = sanitizePublicPort(preferredPort, null);
  const fallbackToFreePort = options.fallbackToFreePort !== false;

  if (sanitizedPreferredPort) {
    if (!reservedPorts.has(sanitizedPreferredPort)) {
      return sanitizedPreferredPort;
    }

    if (!fallbackToFreePort) {
      throw createHttpError(
        400,
        `Port ${sanitizedPreferredPort} jest juz zajety przez inna usluge.`
      );
    }
  }

  if (serviceType === "minecraft_server") {
    for (let port = MINECRAFT_PORT_RANGE_START; port <= MINECRAFT_PORT_RANGE_END; port += 1) {
      if (!reservedPorts.has(port)) {
        return port;
      }
    }

    throw createHttpError(
      400,
      `Nie znaleziono wolnego portu Minecraft w zakresie ${MINECRAFT_PORT_RANGE_START}-${MINECRAFT_PORT_RANGE_END}.`
    );
  }

  if (serviceType === "fivem_server") {
    for (let port = FIVEM_PORT_RANGE_START; port <= FIVEM_PORT_RANGE_END; port += 1) {
      if (!reservedPorts.has(port)) {
        return port;
      }
    }

    throw createHttpError(
      400,
      `Nie znaleziono wolnego portu FiveM w zakresie ${FIVEM_PORT_RANGE_START}-${FIVEM_PORT_RANGE_END}.`
    );
  }

  return null;
}

function listBotRows(actor = null) {
  const query = !actor || isAdminUser(actor)
    ? getDb().prepare("SELECT * FROM bots ORDER BY created_at DESC")
    : getDb().prepare("SELECT * FROM bots WHERE owner_user_id = ? ORDER BY created_at DESC");
  const rows = !actor || isAdminUser(actor) ? query.all() : query.all(actor.id);
  return rows.map(mapBotRow);
}

function listBotRowsByOwner(ownerUserId) {
  return getDb()
    .prepare("SELECT * FROM bots WHERE owner_user_id = ? ORDER BY created_at DESC")
    .all(ownerUserId)
    .map(mapBotRow);
}

function getBotRowById(botId) {
  const bot = mapBotRow(getDb().prepare("SELECT * FROM bots WHERE id = ?").get(botId));

  if (!bot) {
    throw createHttpError(404, "Usluga nie zostala znaleziona.");
  }

  return bot;
}

function assertActorCanAccessBot(actor, bot, options = {}) {
  if (options.skipAccessCheck || !actor || isAdminUser(actor)) {
    return;
  }

  if (bot.owner_user_id !== actor.id) {
    throw createHttpError(404, "Usluga nie zostala znaleziona.");
  }
}

function getBotRow(botId, actor = null, options = {}) {
  const bot = getBotRowById(botId);
  assertActorCanAccessBot(actor, bot, options);
  return bot;
}

function updateBotRow(botId, changes) {
  const fields = Object.keys(changes);
  if (fields.length === 0) {
    return getBotRow(botId, null, { skipAccessCheck: true });
  }

  const payload = { ...changes, id: botId };
  const setClause = fields.map((field) => `${field} = @${field}`).join(", ");
  getDb().prepare(`UPDATE bots SET ${setClause} WHERE id = @id`).run(payload);
  return getBotRow(botId, null, { skipAccessCheck: true });
}

function createBotRecord(record) {
  getDb()
    .prepare(
      `
        INSERT INTO bots (
          id, owner_user_id, service_type, name, slug, description, language, detected_language,
          entry_file, detected_entry_file, start_command, detected_start_command, install_command,
          detected_install_command, package_manager, project_path, status, status_message,
          expires_at, auto_restart, restart_delay, max_restarts, restart_count, last_restart_at,
          stability_status, ram_limit_mb, cpu_limit_percent, accept_eula, public_host,
          public_port, minecraft_version, detected_minecraft_version, fivem_artifact_build,
          fivem_license_key, fivem_max_clients, fivem_project_name, fivem_tags, fivem_locale,
          fivem_onesync_enabled, archive_name, pm2_name, created_at, updated_at
        )
        VALUES (
          @id, @owner_user_id, @service_type, @name, @slug, @description, @language,
          @detected_language, @entry_file, @detected_entry_file, @start_command,
          @detected_start_command, @install_command, @detected_install_command, @package_manager,
          @project_path, @status, @status_message, @expires_at, @auto_restart, @restart_delay,
          @max_restarts, @restart_count, @last_restart_at, @stability_status, @ram_limit_mb,
          @cpu_limit_percent, @accept_eula, @public_host, @public_port, @minecraft_version,
          @detected_minecraft_version, @fivem_artifact_build, @fivem_license_key,
          @fivem_max_clients, @fivem_project_name, @fivem_tags, @fivem_locale,
          @fivem_onesync_enabled, @archive_name, @pm2_name, @created_at, @updated_at
        )
      `
    )
    .run({
      ...record,
      auto_restart: record.auto_restart ? 1 : 0,
      accept_eula: record.accept_eula ? 1 : 0,
      fivem_onesync_enabled: record.fivem_onesync_enabled ? 1 : 0
    });

  return getBotRow(record.id, null, { skipAccessCheck: true });
}

function getBotOwner(bot) {
  if (!bot?.owner_user_id) {
    return null;
  }

  return getUserById(bot.owner_user_id);
}

function getBotBackupsDirectory(botId) {
  return path.join(BACKUPS_DIR, String(botId));
}

function getBotBackupDirectory(botId, backupId) {
  return path.join(getBotBackupsDirectory(botId), String(backupId));
}

function getBotBackupFilesDirectory(botId, backupId) {
  return path.join(getBotBackupDirectory(botId, backupId), "files");
}

function getBotBackupMetaPath(botId, backupId) {
  return path.join(getBotBackupDirectory(botId, backupId), "meta.json");
}

async function ensureBotBackupsDirectory(botId) {
  const backupsDirectory = getBotBackupsDirectory(botId);
  await fs.mkdir(backupsDirectory, { recursive: true });
  return backupsDirectory;
}

function assertOwnerCanProvisionServices(owner) {
  if (!owner) {
    throw createHttpError(400, "Usluga nie ma przypisanego wlasciciela.");
  }

  if (owner.pending_approval) {
    throw createHttpError(
      403,
      "Konto jest w trybie podgladu. Owner musi je aktywowac i przypisac aktywny plan przed tworzeniem uslug."
    );
  }

  if (!owner.is_active) {
    throw createHttpError(403, "To konto jest nieaktywne. Administrator musi je ponownie aktywowac.");
  }

  if (!hasProvisionedPlan(owner)) {
    throw createHttpError(
      403,
      "To konto nie ma aktywnego planu. Nie wykupiono jeszcze zasobow dla tworzenia i uruchamiania uslug."
    );
  }

  if (isUserExpired(owner)) {
    throw createHttpError(403, "Konto wygaslo. Tworzenie i uruchamianie uslug jest zablokowane.");
  }
}

async function getOwnedStorageUsageMb(ownerUserId) {
  const ownedBots = listBotRowsByOwner(ownerUserId);
  let totalBytes = 0;

  for (const bot of ownedBots) {
    totalBytes += await getDirectorySize(bot.project_path);
    totalBytes += await getDirectorySize(getBotBackupsDirectory(bot.id));
  }

  return round(toMb(totalBytes));
}

function getOwnedReservedResources(ownerUserId, options = {}) {
  const { excludeBotId = null } = options;
  const ownedBots = listBotRowsByOwner(ownerUserId).filter((bot) => bot.id !== excludeBotId);

  return ownedBots.reduce(
    (totals, bot) => {
      totals.bots += 1;
      totals.ram_mb += getReservedRam(bot);
      totals.cpu_percent += getReservedCpu(bot);
      return totals;
    },
    {
      bots: 0,
      ram_mb: 0,
      cpu_percent: 0
    }
  );
}

function assertBotReservationWithinUserPlan(owner, options = {}) {
  if (!owner || isAdminUser(owner)) {
    return;
  }

  const { excludeBotId = null, nextRamLimitMb = 0, nextCpuLimitPercent = 0, addingBot = false } = options;
  const reserved = getOwnedReservedResources(owner.id, { excludeBotId });
  const projectedBotCount = reserved.bots + (addingBot ? 1 : 0);
  const projectedRamMb = reserved.ram_mb + Number(nextRamLimitMb || 0);
  const projectedCpuPercent = reserved.cpu_percent + Number(nextCpuLimitPercent || 0);

  if (owner.max_bots !== null && owner.max_bots !== undefined && projectedBotCount > Number(owner.max_bots)) {
    throw createHttpError(
      400,
      `Przekroczono limit liczby uslug dla konta (${projectedBotCount} / ${owner.max_bots}).`
    );
  }

  if (owner.max_ram_mb !== null && owner.max_ram_mb !== undefined && projectedRamMb > Number(owner.max_ram_mb)) {
    throw createHttpError(
      400,
      `Przekroczono limit planu RAM dla konta (${round(projectedRamMb)} MB / ${owner.max_ram_mb} MB).`
    );
  }

  if (
    owner.max_cpu_percent !== null &&
    owner.max_cpu_percent !== undefined &&
    projectedCpuPercent > Number(owner.max_cpu_percent)
  ) {
    throw createHttpError(
      400,
      `Przekroczono limit planu CPU dla konta (${round(projectedCpuPercent)}% / ${owner.max_cpu_percent}%).`
    );
  }
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

async function isManagedConsoleInputReady(projectPath) {
  try {
    const stats = await fs.stat(getManagedConsoleInputPath(projectPath));
    return typeof stats.isFIFO === "function" ? stats.isFIFO() || stats.isFile() : true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function waitForManagedConsoleInput(projectPath, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isManagedConsoleInputReady(projectPath)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
}

async function readJsonIfExists(targetPath) {
  const content = await readUtf8IfExists(targetPath);
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch (_error) {
    return null;
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

async function copyDirectoryContents(sourceDirectory, destinationDirectory) {
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    await fs.cp(
      path.join(sourceDirectory, entry.name),
      path.join(destinationDirectory, entry.name),
      {
        recursive: true,
        force: true
      }
    );
  }
}

async function assertStorageWithinLimit() {
  const limits = getSystemLimits();
  const storageUsageMb = toMb(
    (await getDirectorySize(BOTS_DIR)) + (await getDirectorySize(BACKUPS_DIR))
  );

  if (limits.storage_limit_mb && storageUsageMb > limits.storage_limit_mb) {
    throw createHttpError(
      400,
      `Limit storage zostal przekroczony (${round(storageUsageMb)} MB / ${limits.storage_limit_mb} MB).`
    );
  }
}

async function assertUserStorageWithinLimit(owner) {
  if (!owner || isAdminUser(owner) || owner.max_storage_mb === null || owner.max_storage_mb === undefined) {
    return;
  }

  const storageUsageMb = await getOwnedStorageUsageMb(owner.id);
  if (storageUsageMb > Number(owner.max_storage_mb)) {
    throw createHttpError(
      400,
      `Przekroczono limit storage dla konta (${round(storageUsageMb)} MB / ${owner.max_storage_mb} MB).`
    );
  }
}

function getReservedRam(bot) {
  return Number(bot.ram_limit_mb || DEFAULT_BOT_LIMITS.ram_limit_mb);
}

function getReservedCpu(bot) {
  return Number(bot.cpu_limit_percent || DEFAULT_BOT_LIMITS.cpu_limit_percent);
}

async function assertStartWithinLimits(bot, owner) {
  const limits = getSystemLimits();
  const processList = await listBytehostProcesses().catch(() => []);
  const processMap = new Map(processList.map((processInfo) => [processInfo.name, processInfo]));

  let currentRamMb = 0;
  let currentCpuPercent = 0;
  let currentOwnerRamMb = 0;
  let currentOwnerCpuPercent = 0;

  for (const currentBot of listBotRows(null)) {
    if (currentBot.id === bot.id) {
      continue;
    }

    const runtime = deriveBotRuntime(currentBot, processMap.get(currentBot.pm2_name));
    if (runtime.status !== "ONLINE") {
      continue;
    }

    currentRamMb += runtime.ram_usage_mb;
    currentCpuPercent += runtime.cpu_usage_percent;

    if (owner && currentBot.owner_user_id === owner.id) {
      currentOwnerRamMb += runtime.ram_usage_mb;
      currentOwnerCpuPercent += runtime.cpu_usage_percent;
    }
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
  await assertUserStorageWithinLimit(owner);

  if (owner && !isAdminUser(owner)) {
    const projectedOwnerRamMb = currentOwnerRamMb + getReservedRam(bot);
    const projectedOwnerCpuPercent = currentOwnerCpuPercent + getReservedCpu(bot);

    if (
      owner.max_ram_mb !== null &&
      owner.max_ram_mb !== undefined &&
      projectedOwnerRamMb > Number(owner.max_ram_mb)
    ) {
      throw createHttpError(
        400,
        `Start zablokowany: limit RAM konta zostalby przekroczony (${round(projectedOwnerRamMb)} MB / ${owner.max_ram_mb} MB).`
      );
    }

    if (
      owner.max_cpu_percent !== null &&
      owner.max_cpu_percent !== undefined &&
      projectedOwnerCpuPercent > Number(owner.max_cpu_percent)
    ) {
      throw createHttpError(
        400,
        `Start zablokowany: limit CPU konta zostalby przekroczony (${round(projectedOwnerCpuPercent)}% / ${owner.max_cpu_percent}%).`
      );
    }
  }
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

function isUsingDetectedFiveMStartCommand(bot) {
  return (
    !bot.start_command ||
    bot.start_command === bot.detected_start_command ||
    bot.start_command === buildFiveMStartCommand(resolveEffectiveEntryFile(bot), "server.cfg")
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

  if (bot.service_type === "fivem_server") {
    return buildFiveMStartCommand(resolveEffectiveEntryFile(bot), "server.cfg");
  }

  return null;
}

function assertArtifactAllowed(serviceType, artifactKind) {
  if (serviceType !== "minecraft_server" && artifactKind === ".jar") {
    throw createHttpError(
      400,
      "Plik JAR jest dostepny tylko dla serwerow Minecraft. Boty Discord i FiveM obsluguja ZIP albo RAR."
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

  if (serviceType === "fivem_server") {
    return buildFiveMStartCommand(entryFile || "run.sh", "server.cfg");
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

async function ensureJavaRuntimeAvailable(projectPath) {
  const result = await runShellCommand("java -version", {
    cwd: projectPath,
    timeoutMs: 10000,
    allowFailure: true
  });

  if (result.code !== 0) {
    throw createHttpError(
      400,
      "Na serwerze Ubuntu nie znaleziono komendy `java`. Zainstaluj OpenJDK i sproboj ponownie."
    );
  }
}

function upsertPropertiesLine(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const trimmed = content.trimEnd();
  return trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
}

async function writeMinecraftServerProperties(projectPath, options = {}) {
  const serverPropertiesPath = path.join(projectPath, "server.properties");
  const motd = coerceNullableString(options.name, "ByteHost Minecraft Server");
  const serverPort = sanitizePublicPort(options.public_port, MINECRAFT_DEFAULT_PORT);
  let nextContent = (await readUtf8IfExists(serverPropertiesPath)) || "";

  nextContent = upsertPropertiesLine(nextContent, "enable-query", "false");
  nextContent = upsertPropertiesLine(nextContent, "enable-rcon", "false");
  nextContent = upsertPropertiesLine(nextContent, "gamemode", "survival");
  nextContent = upsertPropertiesLine(nextContent, "max-players", "20");
  nextContent = upsertPropertiesLine(nextContent, "motd", motd);
  nextContent = upsertPropertiesLine(nextContent, "online-mode", "true");
  nextContent = upsertPropertiesLine(nextContent, "server-ip", "");
  nextContent = upsertPropertiesLine(nextContent, "server-port", String(serverPort));
  nextContent = upsertPropertiesLine(nextContent, "view-distance", "10");

  await fs.writeFile(serverPropertiesPath, nextContent, "utf8");
  return serverPropertiesPath;
}

async function bootstrapMinecraftWorkspace(projectPath, options = {}) {
  const eulaAccepted = Boolean(options.acceptEula);
  const eulaPath = path.join(projectPath, "eula.txt");
  const readmePath = path.join(projectPath, "README_BYTEHOST_MINECRAFT.txt");

  await writeMinecraftServerProperties(projectPath, options);

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

async function resolveGamePublicHost(payloadHost = null) {
  const normalizedPayloadHost = normalizePublicHost(payloadHost);
  if (normalizedPayloadHost) {
    return normalizedPayloadHost;
  }

  return detectPublicGameHost();
}

function buildFiveMManagedSettings(source, options = {}) {
  const fallbackPort = getDefaultServicePort("fivem_server");

  return {
    ...source,
    service_type: "fivem_server",
    public_port: sanitizePublicPort(source.public_port, fallbackPort),
    fivem_project_name: normalizeFiveMText(source.fivem_project_name, source.name || "ByteHost FiveM"),
    fivem_license_key: normalizeFiveMText(source.fivem_license_key, ""),
    fivem_tags: normalizeFiveMText(source.fivem_tags, "default"),
    fivem_locale: normalizeFiveMText(source.fivem_locale, "pl-PL"),
    fivem_max_clients: sanitizeFiveMMaxClients(source.fivem_max_clients, 48),
    fivem_onesync_enabled:
      source.fivem_onesync_enabled === undefined
        ? true
        : coerceBoolean(source.fivem_onesync_enabled, true),
    description:
      coerceNullableString(source.description, null) ||
      options.defaultDescription ||
      "Serwer FiveM hostowany przez ByteHost."
  };
}

async function bootstrapManagedFiveMWorkspace(projectPath, source) {
  const settings = buildFiveMManagedSettings(source);
  return bootstrapFiveMWorkspace(projectPath, settings);
}

async function repairManagedFiveMWorkspace(projectPath, source) {
  const settings = buildFiveMManagedSettings(source);
  return repairFiveMWorkspace(projectPath, settings);
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

function buildBackupName(bot, requestedName) {
  const manualName = coerceNullableString(requestedName, null);
  if (manualName) {
    return manualName.slice(0, 120);
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(/:/g, "-");
  return `${bot.name} ${timestamp}`;
}

async function readBotBackupRecord(botId, backupId) {
  const backupDirectory = getBotBackupDirectory(botId, backupId);
  const backupExists = await fileExists(backupDirectory);

  if (!backupExists) {
    throw createHttpError(404, "Backup nie zostal znaleziony.");
  }

  const metadata = await readJsonIfExists(getBotBackupMetaPath(botId, backupId));
  const filesDirectory = getBotBackupFilesDirectory(botId, backupId);
  const stats = await fs.stat(backupDirectory);
  const sizeMb = round(toMb(await getDirectorySize(filesDirectory)));

  return {
    id: String(backupId),
    name: metadata?.name || String(backupId),
    description: metadata?.description || "",
    created_at: metadata?.created_at || stats.birthtime.toISOString(),
    source_status: metadata?.source_status || "OFFLINE",
    size_mb: sizeMb,
    service_type: metadata?.service_type || null,
    files_path: filesDirectory
  };
}

function toClientBackupRecord(backup) {
  const { files_path, ...clientBackup } = backup;
  return clientBackup;
}

async function listBotBackups(botId, actor) {
  getBotRow(botId, actor);

  const backupsDirectory = await ensureBotBackupsDirectory(botId);
  const entries = await fs.readdir(backupsDirectory, { withFileTypes: true });
  const backups = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      backups.push(await readBotBackupRecord(botId, entry.name));
    } catch (_error) {
      continue;
    }
  }

  backups.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  return backups.map(toClientBackupRecord);
}

async function createBotBackup(botId, actor, payload = {}) {
  const bot = getBotRow(botId, actor);
  const owner = getBotOwner(bot);
  const processInfo = await describeProcess(bot.pm2_name).catch(() => null);
  const runtime = deriveBotRuntime(bot, processInfo);
  const backupId = randomId();
  const backupDirectory = getBotBackupDirectory(botId, backupId);
  const filesDirectory = getBotBackupFilesDirectory(botId, backupId);
  const createdAt = nowIso();

  await ensureBotBackupsDirectory(botId);
  await fs.mkdir(filesDirectory, { recursive: true });

  try {
    await copyDirectoryContents(bot.project_path, filesDirectory);
    const sizeMb = round(toMb(await getDirectorySize(filesDirectory)));
    const metadata = {
      id: backupId,
      name: buildBackupName(bot, payload.name),
      description: coerceNullableString(payload.description, "") || "",
      created_at: createdAt,
      source_status: runtime.status,
      service_type: bot.service_type,
      size_mb: sizeMb
    };

    await fs.writeFile(
      getBotBackupMetaPath(botId, backupId),
      JSON.stringify(metadata, null, 2),
      "utf8"
    );

    await assertStorageWithinLimit();
    await assertUserStorageWithinLimit(owner);

    return {
      backup: toClientBackupRecord({
        ...metadata,
        files_path: filesDirectory
      }),
      backups: await listBotBackups(botId, actor)
    };
  } catch (error) {
    await fs.rm(backupDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function restoreBotBackup(botId, actor, backupId, payload = {}) {
  const bot = getBotRow(botId, actor);
  const owner = getBotOwner(bot);
  const backup = await readBotBackupRecord(botId, backupId);
  const processInfo = await describeProcess(bot.pm2_name).catch(() => null);
  const runtime = deriveBotRuntime(bot, processInfo);
  const restartAfterRestore =
    payload.restart_after_restore !== undefined
      ? coerceBoolean(payload.restart_after_restore, runtime.status === "ONLINE")
      : runtime.status === "ONLINE";

  await stopProcess(bot.pm2_name);
  await clearDirectoryContents(bot.project_path);
  await copyDirectoryContents(backup.files_path, bot.project_path);

  const analysis = await analyzeServiceProject(bot.project_path, bot.service_type, bot.ram_limit_mb);
  const nextLanguage =
    bot.service_type === "minecraft_server"
      ? "Java"
      : bot.service_type === "fivem_server"
        ? "FiveM"
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
      : bot.service_type === "fivem_server"
        ? buildFiveMStartCommand(resolveEffectiveEntryFile(bot) || "run.sh", "server.cfg")
      : bot.detected_start_command;
  const nextAutoStart =
    bot.service_type === "minecraft_server"
      ? buildMinecraftStartCommand(nextEntryFile || analysis.detected_entry_file, bot.ram_limit_mb)
      : bot.service_type === "fivem_server"
        ? buildFiveMStartCommand(
            nextEntryFile || analysis.detected_entry_file || "run.sh",
            "server.cfg"
          )
      : analysis.detected_start_command;
  const nextStartCommand =
    bot.service_type === "minecraft_server" || bot.service_type === "fivem_server"
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
    minecraft_version: bot.service_type === "minecraft_server" ? bot.minecraft_version : null,
    detected_minecraft_version:
      bot.service_type === "minecraft_server" ? bot.detected_minecraft_version : null,
    fivem_artifact_build:
      bot.service_type === "fivem_server" ? bot.fivem_artifact_build : null,
    status: "OFFLINE",
    status_message: null,
    expires_at: null,
    updated_at: nowIso()
  });

  if (bot.service_type === "minecraft_server") {
    await writeMinecraftServerProperties(bot.project_path, bot);
  }

  if (bot.service_type === "fivem_server") {
    await writeFiveMServerConfig(bot.project_path, bot);
  }

  await assertStorageWithinLimit();
  await assertUserStorageWithinLimit(owner);

  let updatedBot = await getBotWithRuntime(botId, actor);

  if (restartAfterRestore) {
    updatedBot = await startBot(botId, actor);
  }

  return {
    bot: updatedBot,
    backup: toClientBackupRecord({
      id: backup.id,
      name: backup.name,
      description: backup.description,
      created_at: backup.created_at,
      source_status: backup.source_status,
      size_mb: backup.size_mb,
      service_type: backup.service_type,
      files_path: backup.files_path
    }),
    backups: await listBotBackups(botId, actor)
  };
}

async function deleteBotBackup(botId, actor, backupId) {
  getBotRow(botId, actor);
  await readBotBackupRecord(botId, backupId);
  await fs.rm(getBotBackupDirectory(botId, backupId), { recursive: true, force: true });

  return {
    ok: true,
    backups: await listBotBackups(botId, actor)
  };
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

async function getBotWithRuntime(botId, actor) {
  const bot = getBotRow(botId, actor);
  const processInfo = await describeProcess(bot.pm2_name);

  return {
    ...mergeBotWithRuntime(bot, processInfo),
    storage_usage_mb: round(toMb(await getDirectorySize(bot.project_path)))
  };
}

async function listBots(actor) {
  const processList = await listBytehostProcesses().catch(() => []);
  const processMap = new Map(processList.map((processInfo) => [processInfo.name, processInfo]));

  return Promise.all(
    listBotRows(actor).map(async (bot) => ({
      ...mergeBotWithRuntime(bot, processMap.get(bot.pm2_name)),
      storage_usage_mb: round(toMb(await getDirectorySize(bot.project_path)))
    }))
  );
}

async function createBot(actor, payload, artifactFile) {
  assertOwnerCanProvisionServices(actor);

  const limits = getSystemLimits();
  const currentBotCount = getDb().prepare("SELECT COUNT(*) AS total FROM bots").get().total;

  if (limits.max_bots && currentBotCount >= limits.max_bots) {
    throw createHttpError(400, `Osiagnieto limit liczby uslug (${limits.max_bots}).`);
  }

  const serviceType = sanitizeServiceType(payload.service_type, "discord_bot");
  const ramLimitMb = coerceNullableNumber(payload.ram_limit_mb, DEFAULT_BOT_LIMITS.ram_limit_mb);
  const cpuLimitPercent = coerceNullableNumber(
    payload.cpu_limit_percent,
    DEFAULT_BOT_LIMITS.cpu_limit_percent
  );

  assertBotReservationWithinUserPlan(actor, {
    nextRamLimitMb: ramLimitMb,
    nextCpuLimitPercent: cpuLimitPercent,
    addingBot: true
  });

  const requestedMinecraftVersion =
    serviceType === "minecraft_server"
      ? normalizeMinecraftVersion(payload.minecraft_version, null)
      : null;
  const requestedFiveMMaxClients =
    serviceType === "fivem_server"
      ? sanitizeFiveMMaxClients(payload.fivem_max_clients, 48)
      : null;
  const requestedFiveMProjectName =
    serviceType === "fivem_server"
      ? normalizeFiveMText(payload.fivem_project_name, coerceNullableString(payload.name, "ByteHost FiveM"))
      : null;
  const requestedFiveMLicenseKey =
    serviceType === "fivem_server" ? normalizeFiveMText(payload.fivem_license_key, "") : null;
  const requestedFiveMTags =
    serviceType === "fivem_server" ? normalizeFiveMText(payload.fivem_tags, "default") : null;
  const requestedFiveMLocale =
    serviceType === "fivem_server" ? normalizeFiveMText(payload.fivem_locale, "pl-PL") : null;
  const requestedFiveMOneSync =
    serviceType === "fivem_server" ? coerceBoolean(payload.fivem_onesync_enabled, true) : null;
  const canOverridePublicPort = isAdminUser(actor);
  const resolvedPublicPort =
    isGameService(serviceType)
      ? allocateServicePort(
          serviceType,
          canOverridePublicPort ? payload.public_port : null,
          {
            excludeBotId: null,
            fallbackToFreePort: true
          }
        )
      : null;
  const resolvedPublicHost =
    isGameService(serviceType) ? await resolveGamePublicHost(payload.public_host) : null;
  const botId = randomId();
  const botDirectory = await ensureBotDirectory(botId);
  let resolvedMinecraftVersion = null;
  let resolvedFiveMArtifactBuild = null;

  try {
    if (serviceType === "fivem_server") {
      const bootstrap = await bootstrapManagedFiveMWorkspace(botDirectory, {
        name: payload.name,
        description: payload.description,
        public_port: resolvedPublicPort,
        fivem_project_name: requestedFiveMProjectName,
        fivem_license_key: requestedFiveMLicenseKey,
        fivem_tags: requestedFiveMTags,
        fivem_locale: requestedFiveMLocale,
        fivem_max_clients: requestedFiveMMaxClients,
        fivem_onesync_enabled: requestedFiveMOneSync
      });

      resolvedFiveMArtifactBuild = bootstrap.fivem_artifact_build;

      if (artifactFile) {
        const artifactKind = await detectUploadedArtifactKind(artifactFile.path, artifactFile.originalname);
        assertArtifactAllowed(serviceType, artifactKind);
        await importProjectArtifact(artifactFile.path, botDirectory, {
          originalName: artifactFile.originalname
        });
      }

      await writeFiveMServerConfig(botDirectory, {
        name: payload.name,
        description: payload.description,
        public_port: resolvedPublicPort,
        fivem_project_name: requestedFiveMProjectName,
        fivem_license_key: requestedFiveMLicenseKey,
        fivem_tags: requestedFiveMTags,
        fivem_locale: requestedFiveMLocale,
        fivem_max_clients: requestedFiveMMaxClients,
        fivem_onesync_enabled: requestedFiveMOneSync
      });
    } else if (artifactFile) {
      const artifactKind = await detectUploadedArtifactKind(artifactFile.path, artifactFile.originalname);
      assertArtifactAllowed(serviceType, artifactKind);
      await importProjectArtifact(artifactFile.path, botDirectory, {
        originalName: artifactFile.originalname
      });
    } else if (serviceType === "minecraft_server") {
      await bootstrapMinecraftWorkspace(botDirectory, {
        acceptEula: coerceBoolean(payload.accept_eula, false),
        name: payload.name,
        public_port: resolvedPublicPort
      });
      const download = await downloadOfficialMinecraftServer(botDirectory, requestedMinecraftVersion);
      resolvedMinecraftVersion = download.minecraft_version;
    }

    const analysis = await analyzeServiceProject(botDirectory, serviceType, ramLimitMb);
    const createdAt = nowIso();
    const derivedName =
      coerceNullableString(payload.name, null) ||
      path.basename(
        artifactFile?.originalname ||
          `${
            serviceType === "minecraft_server"
              ? "minecraft"
              : serviceType === "fivem_server"
                ? "fivem"
                : "bot"
          }-${botId.slice(0, 8)}`,
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
      owner_user_id: actor.id,
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
      status: "OFFLINE",
      status_message: null,
      expires_at: null,
      auto_restart: coerceBoolean(payload.auto_restart, true),
      restart_delay: coerceNullableNumber(payload.restart_delay, DEFAULT_BOT_LIMITS.restart_delay),
      max_restarts: coerceNullableNumber(payload.max_restarts, DEFAULT_BOT_LIMITS.max_restarts),
      restart_count: 0,
      last_restart_at: null,
      stability_status: "STOPPED",
      ram_limit_mb: ramLimitMb,
      cpu_limit_percent: cpuLimitPercent,
      accept_eula: serviceType === "minecraft_server" ? coerceBoolean(payload.accept_eula, false) : false,
      public_host:
        serviceType === "minecraft_server"
          ? resolvedPublicHost || null
          : serviceType === "fivem_server"
            ? resolvedPublicHost || null
            : null,
      public_port:
        serviceType === "minecraft_server"
          ? resolvedPublicPort
          : serviceType === "fivem_server"
            ? resolvedPublicPort
            : null,
      minecraft_version:
        serviceType === "minecraft_server"
          ? normalizeMinecraftVersion(payload.minecraft_version, resolvedMinecraftVersion)
          : null,
      detected_minecraft_version:
        serviceType === "minecraft_server" ? resolvedMinecraftVersion : null,
      fivem_artifact_build: serviceType === "fivem_server" ? resolvedFiveMArtifactBuild : null,
      fivem_license_key: serviceType === "fivem_server" ? requestedFiveMLicenseKey : null,
      fivem_max_clients: serviceType === "fivem_server" ? requestedFiveMMaxClients : null,
      fivem_project_name: serviceType === "fivem_server" ? requestedFiveMProjectName : null,
      fivem_tags: serviceType === "fivem_server" ? requestedFiveMTags : null,
      fivem_locale: serviceType === "fivem_server" ? requestedFiveMLocale : null,
      fivem_onesync_enabled: serviceType === "fivem_server" ? requestedFiveMOneSync : false,
      archive_name: artifactFile?.originalname || null,
      pm2_name: getBotProcessName(botId),
      created_at: createdAt,
      updated_at: createdAt
    });

    await assertStorageWithinLimit();
    await assertUserStorageWithinLimit(actor);

    if (artifactFile) {
      await fs.rm(artifactFile.path, { force: true });
    }

    if (coerceBoolean(payload.install_on_create, false) && serviceType !== "minecraft_server") {
      await installDependencies(botId, actor);
    }

    return getBotWithRuntime(botId, actor);
  } catch (error) {
    await removePath(botDirectory);
    if (artifactFile) {
      await fs.rm(artifactFile.path, { force: true });
    }
    throw error;
  }
}

async function updateBot(botId, actor, payload) {
  const existingBot = getBotRow(botId, actor);
  const owner = getBotOwner(existingBot);
  const nextRamLimit =
    payload.ram_limit_mb !== undefined
      ? coerceNullableNumber(payload.ram_limit_mb, existingBot.ram_limit_mb)
      : existingBot.ram_limit_mb;
  const nextCpuLimit =
    payload.cpu_limit_percent !== undefined
      ? coerceNullableNumber(payload.cpu_limit_percent, existingBot.cpu_limit_percent)
      : existingBot.cpu_limit_percent;
  let nextEntryFile =
    payload.entry_file !== undefined
      ? normalizeRelativePath(coerceNullableString(payload.entry_file, "") || "")
      : existingBot.entry_file;
  let nextDetectedEntryFile = existingBot.detected_entry_file;
  let nextDetectedMinecraftVersion = existingBot.detected_minecraft_version;
  let nextFiveMArtifactBuild = existingBot.fivem_artifact_build;
  const nextMinecraftVersion =
    existingBot.service_type === "minecraft_server"
      ? payload.minecraft_version !== undefined
        ? normalizeMinecraftVersion(payload.minecraft_version, null)
        : normalizeMinecraftVersion(existingBot.minecraft_version, null)
      : null;
  const nextFiveMProjectName =
    existingBot.service_type === "fivem_server"
      ? payload.fivem_project_name !== undefined
        ? normalizeFiveMText(payload.fivem_project_name, existingBot.fivem_project_name || existingBot.name)
        : normalizeFiveMText(existingBot.fivem_project_name, existingBot.name)
      : null;
  const nextFiveMLicenseKey =
    existingBot.service_type === "fivem_server"
      ? payload.fivem_license_key !== undefined
        ? normalizeFiveMText(payload.fivem_license_key, "")
        : normalizeFiveMText(existingBot.fivem_license_key, "")
      : null;
  const nextFiveMMaxClients =
    existingBot.service_type === "fivem_server"
      ? payload.fivem_max_clients !== undefined
        ? sanitizeFiveMMaxClients(payload.fivem_max_clients, existingBot.fivem_max_clients || 48)
        : sanitizeFiveMMaxClients(existingBot.fivem_max_clients, 48)
      : null;
  const nextFiveMTags =
    existingBot.service_type === "fivem_server"
      ? payload.fivem_tags !== undefined
        ? normalizeFiveMText(payload.fivem_tags, "default")
        : normalizeFiveMText(existingBot.fivem_tags, "default")
      : null;
  const nextFiveMLocale =
    existingBot.service_type === "fivem_server"
      ? payload.fivem_locale !== undefined
        ? normalizeFiveMText(payload.fivem_locale, "pl-PL")
        : normalizeFiveMText(existingBot.fivem_locale, "pl-PL")
      : null;
  const nextFiveMOneSync =
    existingBot.service_type === "fivem_server"
      ? payload.fivem_onesync_enabled !== undefined
        ? coerceBoolean(payload.fivem_onesync_enabled, existingBot.fivem_onesync_enabled)
        : coerceBoolean(existingBot.fivem_onesync_enabled, true)
      : null;
  const canOverridePublicPort = isAdminUser(actor);
  const nextPublicHost =
    existingBot.service_type === "fivem_server"
      ? payload.public_host !== undefined
        ? normalizePublicHost(payload.public_host)
        : existingBot.public_host || (await resolveGamePublicHost(null))
      : existingBot.service_type === "minecraft_server"
        ? payload.public_host !== undefined
          ? normalizePublicHost(payload.public_host)
          : existingBot.public_host || (await resolveGamePublicHost(null))
        : existingBot.public_host;
  const nextPublicPort =
    existingBot.service_type === "fivem_server"
        ? payload.public_port !== undefined
          ? allocateServicePort(
              existingBot.service_type,
              canOverridePublicPort ? payload.public_port : existingBot.public_port,
              {
                excludeBotId: existingBot.id,
                fallbackToFreePort: true
              }
            )
          : existingBot.public_port ||
            allocateServicePort(existingBot.service_type, null, {
              excludeBotId: existingBot.id,
              fallbackToFreePort: true
            })
      : existingBot.service_type === "minecraft_server"
        ? payload.public_port !== undefined
          ? allocateServicePort(
              existingBot.service_type,
              canOverridePublicPort ? payload.public_port : existingBot.public_port,
              {
                excludeBotId: existingBot.id,
                fallbackToFreePort: true
              }
            )
          : existingBot.public_port ||
            allocateServicePort(existingBot.service_type, null, {
              excludeBotId: existingBot.id,
              fallbackToFreePort: true
            })
        : existingBot.public_port;

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

  const nextMinecraftAuto =
    existingBot.service_type === "minecraft_server"
      ? buildMinecraftStartCommand(nextEntryFile || nextDetectedEntryFile, nextRamLimit)
      : null;
  const nextFiveMAuto =
    existingBot.service_type === "fivem_server"
      ? buildFiveMStartCommand(nextEntryFile || nextDetectedEntryFile || "run.sh", "server.cfg")
      : null;
  const defaultStartCommand =
    existingBot.service_type === "minecraft_server"
      ? nextMinecraftAuto
      : existingBot.service_type === "fivem_server"
        ? nextFiveMAuto
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

  if (
    existingBot.service_type === "fivem_server" &&
    payload.start_command === undefined &&
    isUsingDetectedFiveMStartCommand(existingBot)
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
    expires_at: null,
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
    cpu_limit_percent: nextCpuLimit,
    accept_eula:
      existingBot.service_type === "minecraft_server" && payload.accept_eula !== undefined
        ? coerceBoolean(payload.accept_eula, existingBot.accept_eula)
        : existingBot.accept_eula,
    public_host: nextPublicHost,
    public_port: nextPublicPort,
    minecraft_version:
      existingBot.service_type === "minecraft_server"
        ? nextMinecraftVersion
        : existingBot.minecraft_version,
    detected_minecraft_version:
      existingBot.service_type === "minecraft_server"
        ? nextDetectedMinecraftVersion
        : existingBot.detected_minecraft_version,
    fivem_artifact_build:
      existingBot.service_type === "fivem_server"
        ? nextFiveMArtifactBuild
        : existingBot.fivem_artifact_build,
    fivem_license_key:
      existingBot.service_type === "fivem_server"
        ? nextFiveMLicenseKey
        : existingBot.fivem_license_key,
    fivem_max_clients:
      existingBot.service_type === "fivem_server"
        ? nextFiveMMaxClients
        : existingBot.fivem_max_clients,
    fivem_project_name:
      existingBot.service_type === "fivem_server"
        ? nextFiveMProjectName
        : existingBot.fivem_project_name,
    fivem_tags:
      existingBot.service_type === "fivem_server" ? nextFiveMTags : existingBot.fivem_tags,
    fivem_locale:
      existingBot.service_type === "fivem_server" ? nextFiveMLocale : existingBot.fivem_locale,
    fivem_onesync_enabled:
      existingBot.service_type === "fivem_server"
        ? nextFiveMOneSync
        : existingBot.fivem_onesync_enabled,
    updated_at: nowIso()
  };

  if (payload.ram_limit_mb !== undefined || payload.cpu_limit_percent !== undefined) {
    assertBotReservationWithinUserPlan(owner, {
      excludeBotId: existingBot.id,
      nextRamLimitMb: nextRamLimit,
      nextCpuLimitPercent: nextCpuLimit,
      addingBot: true
    });
  }

  if (existingBot.status === "EXPIRED" && !isUserExpired(owner)) {
    changes.status = "OFFLINE";
    changes.status_message = null;
  }

  const updatedRow = updateBotRow(botId, {
    ...changes,
    auto_restart: changes.auto_restart ? 1 : 0,
    accept_eula: changes.accept_eula ? 1 : 0,
    fivem_onesync_enabled: changes.fivem_onesync_enabled ? 1 : 0
  });

  if (updatedRow.service_type === "minecraft_server") {
    await writeMinecraftServerProperties(updatedRow.project_path, updatedRow);
  }

  if (updatedRow.service_type === "fivem_server") {
    await writeFiveMServerConfig(updatedRow.project_path, updatedRow);
  }

  const requiresRestart =
    existingBot.status === "ONLINE" &&
    (payload.entry_file !== undefined ||
      payload.start_command !== undefined ||
      payload.auto_restart !== undefined ||
      payload.restart_delay !== undefined ||
      payload.max_restarts !== undefined ||
      payload.ram_limit_mb !== undefined ||
      payload.minecraft_version !== undefined ||
      payload.public_port !== undefined ||
      payload.public_host !== undefined ||
      payload.fivem_license_key !== undefined ||
      payload.fivem_max_clients !== undefined ||
      payload.fivem_project_name !== undefined ||
      payload.fivem_tags !== undefined ||
      payload.fivem_locale !== undefined ||
      payload.fivem_onesync_enabled !== undefined);

  if (requiresRestart) {
    await restartBot(botId, actor);
  }

  return getBotWithRuntime(botId, actor);
}

async function deleteBotById(botId, actor, options = {}) {
  const bot = getBotRow(botId, actor, options);
  await deleteProcess(bot.pm2_name);
  await removeBotLogs(bot.id);
  await removePath(getBotBackupsDirectory(bot.id));
  await removePath(bot.project_path);
  getDb().prepare("DELETE FROM bots WHERE id = ?").run(botId);
  return { ok: true };
}

async function startBot(botId, actor) {
  let bot = getBotRow(botId, actor);
  const owner = getBotOwner(bot);

  try {
    assertOwnerCanProvisionServices(owner);

    if (bot.service_type === "minecraft_server") {
      await ensureJavaRuntimeAvailable(bot.project_path);

      if (!bot.public_port) {
        bot = updateBotRow(botId, {
          public_port: allocateServicePort("minecraft_server", null, {
            excludeBotId: bot.id
          }),
          updated_at: nowIso()
        });
      }

      if (!bot.public_host) {
        const detectedHost = await resolveGamePublicHost(null);
        if (detectedHost) {
          bot = updateBotRow(botId, {
            public_host: detectedHost,
            updated_at: nowIso()
          });
        }
      }

      const accepted = bot.accept_eula || (await isMinecraftEulaAccepted(bot.project_path));
      if (!accepted) {
        throw createHttpError(
          400,
          "Aby uruchomic serwer Minecraft, zaznacz akceptacje EULA albo ustaw eula=true w eula.txt."
        );
      }

      await ensureMinecraftEula(bot.project_path);
      await writeMinecraftServerProperties(bot.project_path, bot);

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

    if (bot.service_type === "fivem_server") {
      let entryFile = resolveEffectiveEntryFile(bot) || "run.sh";
      const runtimeDirectory = path.join(bot.project_path, "alpine", "opt", "cfx-server");
      const entryExists = await fileExists(path.join(bot.project_path, entryFile));
      const runtimeExists = await fileExists(runtimeDirectory);

      if (!entryExists || !runtimeExists) {
        const repair = await repairManagedFiveMWorkspace(bot.project_path, bot);
        const nextDetectedStartCommand = buildFiveMStartCommand(repair.entry_file, "server.cfg");
        const nextRow = {
          detected_entry_file: repair.entry_file,
          detected_start_command: nextDetectedStartCommand,
          fivem_artifact_build: repair.fivem_artifact_build,
          updated_at: nowIso()
        };

        if (isUsingDetectedEntryFile(bot) || !bot.entry_file) {
          nextRow.entry_file = repair.entry_file;
        }

        if (isUsingDetectedFiveMStartCommand(bot)) {
          nextRow.start_command = nextDetectedStartCommand;
        }

        bot = updateBotRow(botId, nextRow);
        entryFile = resolveEffectiveEntryFile(bot) || repair.entry_file;
      }

      if (!bot.public_port) {
        bot = updateBotRow(botId, {
          public_port: allocateServicePort("fivem_server", null, {
            excludeBotId: bot.id
          }),
          updated_at: nowIso()
        });
      }

      if (!bot.public_host) {
        const detectedHost = await resolveGamePublicHost(null);
        if (detectedHost) {
          bot = updateBotRow(botId, {
            public_host: detectedHost,
            updated_at: nowIso()
          });
        }
      }

      if (!bot.fivem_license_key || bot.fivem_license_key === "changeme") {
        throw createHttpError(
          400,
          "Aby uruchomic serwer FiveM, ustaw poprawny `sv_licenseKey` w ustawieniach uslugi."
        );
      }

      await writeFiveMServerConfig(bot.project_path, bot);

      if (!(await fileExists(path.join(bot.project_path, entryFile)))) {
        throw createHttpError(
          400,
          `Nie znaleziono pliku startowego ${entryFile}. Napraw artefakt FiveM albo wrzuc poprawny pakiet serwera.`
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
        : bot.service_type === "fivem_server"
          ? buildFiveMStartCommand(resolveEffectiveEntryFile(bot) || "run.sh", "server.cfg")
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

    await assertStartWithinLimits(bot, owner);
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

    return getBotWithRuntime(botId, actor);
  } catch (error) {
    await recordBotFailure(bot, error.message || "Nie udalo sie uruchomic uslugi.");
    throw error;
  }
}

async function stopBot(botId, actor) {
  const bot = getBotRow(botId, actor);
  await stopProcess(bot.pm2_name);
  updateBotRow(botId, {
    status: "OFFLINE",
    status_message: null,
    updated_at: nowIso()
  });
  return getBotWithRuntime(botId, actor);
}

async function restartBot(botId, actor) {
  await deleteProcess(getBotRow(botId, actor).pm2_name);
  return startBot(botId, actor);
}

async function installDependencies(botId, actor) {
  const bot = getBotRow(botId, actor);

  if (bot.service_type === "minecraft_server") {
    return {
      bot: await getBotWithRuntime(botId, actor),
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

  if (bot.service_type === "fivem_server") {
    const repair = await repairManagedFiveMWorkspace(bot.project_path, bot);
    const nextDetectedStartCommand = buildFiveMStartCommand(repair.entry_file, "server.cfg");
    const nextRow = {
      detected_entry_file: repair.entry_file,
      detected_start_command: nextDetectedStartCommand,
      fivem_artifact_build: repair.fivem_artifact_build,
      updated_at: nowIso()
    };

    if (isUsingDetectedEntryFile(bot)) {
      nextRow.entry_file = repair.entry_file;
    }

    if (isUsingDetectedFiveMStartCommand(bot)) {
      nextRow.start_command = nextDetectedStartCommand;
    }

    updateBotRow(botId, nextRow);

    return {
      bot: await getBotWithRuntime(botId, actor),
      install: {
        skipped: false,
        command: "repair-fivem-runtime",
        stdout: "",
        stderr: "",
        message:
          "ByteHost pobral lub naprawil oficjalny artefakt FXServer i odswiezyl podstawowy server.cfg."
      }
    };
  }

  const command = bot.install_command || bot.detected_install_command;

  if (!command) {
    return {
      bot: await getBotWithRuntime(botId, actor),
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
      bot: await getBotWithRuntime(botId, actor),
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

async function updateBotArchive(botId, actor, artifactFile, payload = {}) {
  if (!artifactFile) {
    throw createHttpError(400, "Dodaj plik JAR, ZIP albo RAR do aktualizacji uslugi.");
  }

  const bot = getBotRow(botId, actor);
  const owner = getBotOwner(bot);
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
  let nextFiveMArtifactBuild = bot.fivem_artifact_build;

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

      if (bot.service_type === "fivem_server") {
        const repair = await bootstrapManagedFiveMWorkspace(tempDirectory, bot);
        nextFiveMArtifactBuild = repair.fivem_artifact_build;
      }

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
        : bot.service_type === "fivem_server"
          ? "FiveM"
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
        : bot.service_type === "fivem_server"
          ? buildFiveMStartCommand(resolveEffectiveEntryFile(bot) || "run.sh", "server.cfg")
        : bot.detected_start_command;
    const nextAutoStart =
      bot.service_type === "minecraft_server"
        ? buildMinecraftStartCommand(nextEntryFile || analysis.detected_entry_file, bot.ram_limit_mb)
        : bot.service_type === "fivem_server"
          ? buildFiveMStartCommand(nextEntryFile || analysis.detected_entry_file || "run.sh", "server.cfg")
        : analysis.detected_start_command;
    const nextStartCommand =
      bot.service_type === "minecraft_server" || bot.service_type === "fivem_server"
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

    const updatedArchiveBot = updateBotRow(botId, {
      language: sanitizeLanguage(nextLanguage, analysis.detected_language || "Node.js", bot.service_type),
      detected_language: analysis.detected_language,
      entry_file: normalizeRelativePath(nextEntryFile || ""),
      detected_entry_file: analysis.detected_entry_file,
      start_command: coerceNullableString(nextStartCommand, nextAutoStart),
      detected_start_command: nextAutoStart,
      install_command: analysis.install_command,
      detected_install_command: analysis.install_command,
      package_manager: analysis.package_manager,
      minecraft_version: bot.service_type === "minecraft_server" ? bot.minecraft_version : null,
      detected_minecraft_version:
        bot.service_type === "minecraft_server" ? bot.detected_minecraft_version : null,
      fivem_artifact_build:
        bot.service_type === "fivem_server" ? nextFiveMArtifactBuild : null,
      archive_name: artifactFile.originalname || bot.archive_name,
      status: "OFFLINE",
      status_message: null,
      expires_at: null,
      updated_at: nowIso()
    });

    if (updatedArchiveBot.service_type === "minecraft_server") {
      await writeMinecraftServerProperties(updatedArchiveBot.project_path, updatedArchiveBot);
    }

    if (updatedArchiveBot.service_type === "fivem_server") {
      await writeFiveMServerConfig(updatedArchiveBot.project_path, updatedArchiveBot);
    }

    await assertStorageWithinLimit();
    await assertUserStorageWithinLimit(owner);

    if (reinstallDependenciesFlag && bot.service_type !== "minecraft_server") {
      const installResponse = await installDependencies(botId, actor);
      install = installResponse.install;
    }

    let updatedBot = await getBotWithRuntime(botId, actor);

    if (restartAfterUpdate) {
      updatedBot = await startBot(botId, actor);
    }

    return {
      bot: updatedBot,
      install
    };
  } finally {
    await fs.rm(artifactFile.path, { force: true });
  }
}

async function executeBotConsoleCommand(botId, actor, payload) {
  let bot = getBotRow(botId, actor);
  const mode = coerceNullableString(payload?.mode, null);
  const command = normalizeConsoleCommand(coerceNullableString(payload?.command, ""));

  if (!command) {
    throw createHttpError(400, "Podaj polecenie do wykonania.");
  }

  if (command.length > MAX_CONSOLE_COMMAND_LENGTH) {
    throw createHttpError(
      400,
      `Polecenie jest za dlugie (maks. ${MAX_CONSOLE_COMMAND_LENGTH} znakow).`
    );
  }

  if (hasManagedServerConsole(bot) && mode !== "shell") {
    const processInfo = await describeProcess(bot.pm2_name).catch(() => null);
    const runtime = deriveBotRuntime(bot, processInfo);

    if (runtime.status !== "ONLINE") {
      throw createHttpError(
        400,
        "Prawdziwa konsola serwera dziala tylko wtedy, gdy usluga jest uruchomiona."
      );
    }

    let consoleReady = await isManagedConsoleInputReady(bot.project_path);

    if (!consoleReady) {
      await appendBotLog(
        bot.id,
        "out",
        "[bytehost] Konsola serwera byla jeszcze nieaktywna. ByteHost restartuje proces, aby podlaczyc prawdziwe stdin.\n"
      );

      await startBot(bot.id, actor);
      bot = getBotRow(botId, actor);
      consoleReady = await waitForManagedConsoleInput(bot.project_path);
    }

    if (!consoleReady) {
      throw createHttpError(
        400,
        "Nie udalo sie przygotowac prawdziwej konsoli serwera. Sprobuj ponownie za kilka sekund albo zrestartuj usluge recznie."
      );
    }

    try {
      await sendManagedConsoleCommand(bot.project_path, command);
      await appendBotLog(bot.id, "out", `[console] > ${command}\n`);
    } catch (error) {
      throw createHttpError(
        400,
        `Nie udalo sie wyslac polecenia do dzialajacego serwera: ${error.message}`
      );
    }

    return {
      mode: "server",
      cwd: bot.project_path,
      command,
      sent: true,
      sent_at: nowIso()
    };
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

async function getBotLogsPayload(botId, actor) {
  const bot = getBotRow(botId, actor);
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

async function getBotFiles(botId, actor, relativePath = "") {
  getBotRow(botId, actor);
  return readFileEntry(botId, relativePath);
}

async function createBotFile(botId, actor, payload) {
  const bot = getBotRow(botId, actor);
  await createEntry(botId, payload);
  await assertStorageWithinLimit();
  await assertUserStorageWithinLimit(getBotOwner(bot));
  return getBotFiles(botId, actor, payload.path);
}

async function updateBotFile(botId, actor, payload) {
  getBotRow(botId, actor);
  return updateFileContent(botId, payload);
}

async function deleteBotFile(botId, actor, relativePath) {
  getBotRow(botId, actor);
  const normalizedPath = normalizeRelativePath(relativePath);
  await deleteEntry(botId, normalizedPath);
  const parentPath = path.posix.dirname(normalizedPath);
  return getBotFiles(botId, actor, parentPath === "." ? "" : parentPath);
}

async function uploadBotFiles(botId, actor, targetPath, files) {
  const bot = getBotRow(botId, actor);
  const response = await uploadFiles(botId, targetPath, files);
  await assertStorageWithinLimit();
  await assertUserStorageWithinLimit(getBotOwner(bot));
  return response;
}

async function updateBotEnv(botId, actor, content) {
  getBotRow(botId, actor);
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
  getBotLogsPayload,
  getBotFiles,
  createBotFile,
  updateBotFile,
  deleteBotFile,
  uploadBotFiles,
  updateBotEnv
};
