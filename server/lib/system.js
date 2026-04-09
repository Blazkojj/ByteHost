const path = require("path");
const os = require("os");
const si = require("systeminformation");

const { BOTS_DIR, BACKUPS_DIR } = require("../config");
const { getDb, mapBotRow, mapSystemLimitsRow } = require("./db");
const { listBytehostProcesses } = require("./pm2");
const { deriveBotRuntime } = require("./runtime");
const { getDirectorySize } = require("./storage");
const { getUserAccountStatus, hasProvisionedPlan, isAdminUser } = require("./users");
const { nowIso, round, toMb } = require("./utils");

function getSystemLimits() {
  const db = getDb();
  const row = db.prepare("SELECT * FROM system_limits WHERE id = 1").get();
  return mapSystemLimitsRow(row);
}

function updateSystemLimits(payload) {
  const db = getDb();
  const current = getSystemLimits();
  const next = {
    ...current,
    ...payload,
    updated_at: nowIso()
  };

  db.prepare(
    `
      UPDATE system_limits
      SET ram_limit_mb = @ram_limit_mb,
          cpu_limit_percent = @cpu_limit_percent,
          storage_limit_mb = @storage_limit_mb,
          max_bots = @max_bots,
          updated_at = @updated_at
      WHERE id = 1
    `
  ).run(next);

  return getSystemLimits();
}

function getScopedBots(actor) {
  const rows = !actor || isAdminUser(actor)
    ? getDb().prepare("SELECT * FROM bots ORDER BY created_at DESC").all()
    : getDb()
        .prepare("SELECT * FROM bots WHERE owner_user_id = ? ORDER BY created_at DESC")
        .all(actor.id);

  return rows.map(mapBotRow);
}

function getScopedLimits(actor) {
  if (!actor || isAdminUser(actor)) {
    return getSystemLimits();
  }

  return {
    ram_limit_mb: actor?.max_ram_mb ?? null,
    cpu_limit_percent: actor?.max_cpu_percent ?? null,
    storage_limit_mb: actor?.max_storage_mb ?? null,
    max_bots: actor?.max_bots ?? null
  };
}

function buildRemaining(limits, usage) {
  return {
    ram_mb:
      Number(limits.ram_limit_mb || 0) > 0
        ? Math.max(0, round(Number(limits.ram_limit_mb) - Number(usage.ram_mb || 0)))
        : null,
    cpu_percent:
      Number(limits.cpu_limit_percent || 0) > 0
        ? Math.max(0, round(Number(limits.cpu_limit_percent) - Number(usage.cpu_percent || 0)))
        : null,
    storage_mb:
      Number(limits.storage_limit_mb || 0) > 0
        ? Math.max(0, round(Number(limits.storage_limit_mb) - Number(usage.storage_mb || 0)))
        : null,
    bots:
      Number(limits.max_bots || 0) > 0
        ? Math.max(0, Number(limits.max_bots) - Number(usage.bots || 0))
        : null
  };
}

async function collectSystemStats(actor) {
  const bots = getScopedBots(actor);
  const processList = await listBytehostProcesses().catch(() => []);
  const processMap = new Map(processList.map((processInfo) => [processInfo.name, processInfo]));

  let runningRamMb = 0;
  let runningCpuPercent = 0;
  let storageBytes = 0;

  const botStatuses = {
    total: bots.length,
    online: 0,
    offline: 0,
    error: 0,
    expired: 0,
    crash_loop: 0
  };

  for (const bot of bots) {
    const runtime = deriveBotRuntime(bot, processMap.get(bot.pm2_name));
    storageBytes += await getDirectorySize(bot.project_path);
    storageBytes += await getDirectorySize(path.join(BACKUPS_DIR, bot.id));

    if (runtime.status === "ONLINE") {
      botStatuses.online += 1;
      runningRamMb += runtime.ram_usage_mb;
      runningCpuPercent += runtime.cpu_usage_percent;
    } else if (runtime.status === "ERROR") {
      botStatuses.error += 1;
    } else if (runtime.status === "EXPIRED") {
      botStatuses.expired += 1;
    } else if (runtime.status === "CRASH LOOP") {
      botStatuses.crash_loop += 1;
    } else {
      botStatuses.offline += 1;
    }
  }

  const usage = {
    ram_mb: round(runningRamMb),
    cpu_percent: round(runningCpuPercent),
    storage_mb: round(toMb(storageBytes)),
    bots: bots.length
  };
  const limits = getScopedLimits(actor);
  const remaining = buildRemaining(limits, usage);

  const account = actor
    ? {
        id: actor.id,
        email: actor.email,
        role: actor.role,
        is_admin: isAdminUser(actor),
        is_active: actor.is_active,
        expires_at: actor.expires_at || null,
        account_status: getUserAccountStatus(actor),
        has_active_plan: hasProvisionedPlan(actor),
        limits: {
          max_bots: actor.max_bots ?? null,
          max_ram_mb: actor.max_ram_mb ?? null,
          max_cpu_percent: actor.max_cpu_percent ?? null,
          max_storage_mb: actor.max_storage_mb ?? null
        },
        usage,
        remaining
      }
    : null;

  const payload = {
    scope: isAdminUser(actor) ? "system" : "user",
    limits,
    usage,
    remaining,
    statuses: botStatuses,
    account
  };

  if (!isAdminUser(actor)) {
    return payload;
  }

  const [memory, currentLoad, totalStorageBytes] = await Promise.all([
    si.mem(),
    si.currentLoad(),
    Promise.all([getDirectorySize(BOTS_DIR), getDirectorySize(BACKUPS_DIR)]).then(
      ([botsStorageBytes, backupsStorageBytes]) => botsStorageBytes + backupsStorageBytes
    )
  ]);

  return {
    ...payload,
    usage: {
      ...usage,
      storage_mb: round(toMb(totalStorageBytes)),
      bots: botStatuses.total
    },
    remaining: buildRemaining(limits, {
      ...usage,
      storage_mb: round(toMb(totalStorageBytes)),
      bots: botStatuses.total
    }),
    host: {
      cpu_load_percent: round(currentLoad.currentLoad),
      total_ram_mb: round(toMb(memory.total)),
      used_ram_mb: round(toMb(memory.active)),
      free_ram_mb: round(toMb(memory.available)),
      uptime_seconds: Math.floor(os.uptime())
    }
  };
}

module.exports = {
  getSystemLimits,
  updateSystemLimits,
  collectSystemStats
};
