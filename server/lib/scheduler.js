const { getDb, mapBotRow } = require("./db");
const { listBytehostProcesses, stopProcess } = require("./pm2");
const { deriveBotRuntime, isExpired } = require("./runtime");
const { nowIso } = require("./utils");
const { SCHEDULER_INTERVAL_MS } = require("../config");

const cpuViolations = new Map();

async function runSchedulerTick() {
  const db = getDb();
  const bots = db.prepare("SELECT * FROM bots").all().map(mapBotRow);
  const processList = await listBytehostProcesses().catch(() => []);
  const processMap = new Map(processList.map((processInfo) => [processInfo.name, processInfo]));

  for (const bot of bots) {
    if (isExpired(bot.expires_at)) {
      await stopProcess(bot.pm2_name);
      db.prepare(
        `
          UPDATE bots
          SET status = 'EXPIRED',
              status_message = @status_message,
              stability_status = 'EXPIRED',
              updated_at = @updated_at
          WHERE id = @id
        `
      ).run({
        id: bot.id,
        status_message: "Bot wygasł i został automatycznie zatrzymany.",
        updated_at: nowIso()
      });
      cpuViolations.delete(bot.id);
      continue;
    }

    const runtime = deriveBotRuntime(bot, processMap.get(bot.pm2_name));

    if (runtime.status === "CRASH LOOP") {
      await stopProcess(bot.pm2_name);
      db.prepare(
        `
          UPDATE bots
          SET status = 'CRASH LOOP',
              status_message = @status_message,
              restart_count = @restart_count,
              last_restart_at = @last_restart_at,
              stability_status = 'CRASH LOOP',
              updated_at = @updated_at
          WHERE id = @id
        `
      ).run({
        id: bot.id,
        status_message: "Bot wpadł w crash loop i został zatrzymany.",
        restart_count: runtime.restart_count,
        last_restart_at: runtime.last_restart_at,
        updated_at: nowIso()
      });
      cpuViolations.delete(bot.id);
      continue;
    }

    if (
      runtime.status === "ONLINE" &&
      bot.cpu_limit_percent &&
      runtime.cpu_usage_percent > Number(bot.cpu_limit_percent)
    ) {
      const nextViolationCount = (cpuViolations.get(bot.id) || 0) + 1;
      cpuViolations.set(bot.id, nextViolationCount);

      if (nextViolationCount >= 3) {
        await stopProcess(bot.pm2_name);
        db.prepare(
          `
            UPDATE bots
            SET status = 'ERROR',
                status_message = @status_message,
                updated_at = @updated_at
            WHERE id = @id
          `
        ).run({
          id: bot.id,
          status_message: `Przekroczono limit CPU (${bot.cpu_limit_percent}%). Bot został zatrzymany.`,
          updated_at: nowIso()
        });
        cpuViolations.delete(bot.id);
        continue;
      }
    } else {
      cpuViolations.delete(bot.id);
    }

    db.prepare(
      `
        UPDATE bots
        SET status = @status,
            restart_count = @restart_count,
            last_restart_at = @last_restart_at,
            stability_status = @stability_status,
            updated_at = @updated_at
        WHERE id = @id
      `
    ).run({
      id: bot.id,
      status: runtime.status,
      restart_count: runtime.restart_count,
      last_restart_at: runtime.last_restart_at,
      stability_status: runtime.stability_status,
      updated_at: nowIso()
    });
  }
}

function startScheduler() {
  runSchedulerTick().catch((error) => {
    console.error("Scheduler initial tick failed:", error);
  });

  setInterval(() => {
    runSchedulerTick().catch((error) => {
      console.error("Scheduler tick failed:", error);
    });
  }, SCHEDULER_INTERVAL_MS);
}

module.exports = {
  startScheduler,
  runSchedulerTick
};
