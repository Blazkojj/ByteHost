const os = require("os");
const si = require("systeminformation");

const { BOTS_DIR } = require("../config");
const { getDb, mapBotRow, mapSystemLimitsRow } = require("./db");
const { listBytehostProcesses } = require("./pm2");
const { getDirectorySize } = require("./storage");
const { deriveBotRuntime } = require("./runtime");
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

async function collectSystemStats() {
  const db = getDb();
  const bots = db
    .prepare("SELECT * FROM bots ORDER BY created_at DESC")
    .all()
    .map(mapBotRow);
  const processList = await listBytehostProcesses().catch(() => []);
  const processMap = new Map(processList.map((processInfo) => [processInfo.name, processInfo]));

  let runningRamMb = 0;
  let runningCpuPercent = 0;

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

  const [memory, currentLoad, storageBytes] = await Promise.all([
    si.mem(),
    si.currentLoad(),
    getDirectorySize(BOTS_DIR)
  ]);

  return {
    limits: getSystemLimits(),
    usage: {
      ram_mb: round(runningRamMb),
      cpu_percent: round(runningCpuPercent),
      storage_mb: round(toMb(storageBytes)),
      bots: bots.length
    },
    host: {
      cpu_load_percent: round(currentLoad.currentLoad),
      total_ram_mb: round(toMb(memory.total)),
      used_ram_mb: round(toMb(memory.active)),
      free_ram_mb: round(toMb(memory.available)),
      uptime_seconds: Math.floor(os.uptime())
    },
    statuses: botStatuses
  };
}

module.exports = {
  getSystemLimits,
  updateSystemLimits,
  collectSystemStats
};
