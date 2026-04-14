const { getDb, mapBotRow, mapUserRow } = require("./db");
const { deriveBotRuntime } = require("./runtime");
const { listServiceRuntimeMap, stopServiceRuntime } = require("./serviceRuntime");
const { isUserExpired } = require("./users");
const { nowIso } = require("./utils");
const { SCHEDULER_INTERVAL_MS } = require("../config");

const cpuViolations = new Map();

async function runSchedulerTick() {
  const db = getDb();
  const bots = db.prepare("SELECT * FROM bots").all().map(mapBotRow);
  const users = db.prepare("SELECT * FROM users").all().map(mapUserRow);
  const userMap = new Map(users.map((user) => [user.id, user]));
  const runtimeMap = await listServiceRuntimeMap(bots).catch(() => new Map());

  for (let bot of bots) {
    const owner = userMap.get(bot.owner_user_id) || null;

    if (owner && (!owner.is_active || isUserExpired(owner))) {
      await stopServiceRuntime(bot);
      db.prepare(
        `
          UPDATE bots
          SET status = @status,
              status_message = @status_message,
              stability_status = @stability_status,
              updated_at = @updated_at
          WHERE id = @id
        `
      ).run({
        id: bot.id,
        status: isUserExpired(owner) ? "EXPIRED" : "ERROR",
        status_message: isUserExpired(owner)
          ? "Konto wlasciciela wygaslo i usluga zostala automatycznie zatrzymana."
          : "Konto wlasciciela jest nieaktywne. Usluga zostala zatrzymana.",
        stability_status: isUserExpired(owner) ? "EXPIRED" : "STOPPED",
        updated_at: nowIso()
      });
      cpuViolations.delete(bot.id);
      continue;
    }

    if (
      bot.expires_at ||
      (bot.status === "EXPIRED" && String(bot.status_message || "").startsWith("Usluga wygasla"))
    ) {
      db.prepare(
        `
          UPDATE bots
          SET expires_at = NULL,
              status = @status,
              status_message = @status_message,
              stability_status = @stability_status,
              updated_at = @updated_at
          WHERE id = @id
        `
      ).run({
        id: bot.id,
        status: "OFFLINE",
        status_message: null,
        stability_status: "STOPPED",
        updated_at: nowIso()
      });
      bot = {
        ...bot,
        expires_at: null,
        status: "OFFLINE",
        status_message: null,
        stability_status: "STOPPED"
      };
      cpuViolations.delete(bot.id);
    }

    const runtime = deriveBotRuntime(bot, runtimeMap.get(bot.pm2_name));

    if (runtime.status === "CRASH LOOP") {
      await stopServiceRuntime(bot);
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
        status_message: "Usluga wpadla w crash loop i zostala zatrzymana.",
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
        await stopServiceRuntime(bot);
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
          status_message: `Przekroczono limit CPU (${bot.cpu_limit_percent}%). Usluga zostala zatrzymana.`,
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
