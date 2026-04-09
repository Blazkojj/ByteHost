const { round, toMb } = require("./utils");

function deriveBotRuntime(bot, processInfo) {
  if (!processInfo) {
    return {
      status: bot.status === "CRASH LOOP" ? "CRASH LOOP" : bot.status || "OFFLINE",
      pm2_status: "stopped",
      ram_usage_mb: 0,
      cpu_usage_percent: 0,
      uptime_seconds: 0,
      restart_count: bot.restart_count || 0,
      last_restart_at: bot.last_restart_at,
      stability_status:
        bot.status === "CRASH LOOP"
          ? "CRASH LOOP"
          : bot.stability_status || "STOPPED"
    };
  }

  const pm2Status = processInfo.pm2_env?.status || "stopped";
  const unstableRestarts = Number(processInfo.pm2_env?.unstable_restarts || 0);
  const restartCount = Number(processInfo.pm2_env?.restart_time || 0);
  const uptimeSeconds = processInfo.pm2_env?.pm_uptime
    ? Math.max(0, Math.floor((Date.now() - Number(processInfo.pm2_env.pm_uptime)) / 1000))
    : 0;
  const lastRestartAt = processInfo.pm2_env?.pm_uptime
    ? new Date(Number(processInfo.pm2_env.pm_uptime)).toISOString()
    : bot.last_restart_at;

  let status = "OFFLINE";
  let stability_status = "STOPPED";

  if (pm2Status === "online") {
    status = "ONLINE";
    stability_status = unstableRestarts > 0 ? "UNSTABLE" : "STABLE";
  } else if (pm2Status === "errored" || unstableRestarts >= Number(bot.max_restarts || 0)) {
    status = "CRASH LOOP";
    stability_status = "CRASH LOOP";
  } else if (pm2Status === "waiting restart") {
    status = "ERROR";
    stability_status = "UNSTABLE";
  } else if (pm2Status === "stopping" || pm2Status === "stopped") {
    status = "OFFLINE";
    stability_status = "STOPPED";
  } else {
    status = "ERROR";
    stability_status = "UNSTABLE";
  }

  return {
    status,
    pm2_status: pm2Status,
    ram_usage_mb: round(toMb(processInfo.monit?.memory || 0)),
    cpu_usage_percent: round(Number(processInfo.monit?.cpu || 0)),
    uptime_seconds: uptimeSeconds,
    restart_count: restartCount,
    last_restart_at: lastRestartAt,
    stability_status
  };
}

function mergeBotWithRuntime(bot, processInfo) {
  return {
    ...bot,
    ...deriveBotRuntime(bot, processInfo)
  };
}

module.exports = {
  deriveBotRuntime,
  mergeBotWithRuntime
};
