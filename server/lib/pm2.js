const pm2 = require("pm2");

const { getShellInvocation } = require("./commands");
const { getBotLogPaths } = require("./logs");

let connectionPromise;

function ensurePm2Connection() {
  if (!connectionPromise) {
    connectionPromise = new Promise((resolve, reject) => {
      pm2.connect((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  return connectionPromise;
}

function invoke(method, ...args) {
  return ensurePm2Connection().then(
    () =>
      new Promise((resolve, reject) => {
        pm2[method](...args, (error, response) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(response);
        });
      })
  );
}

function getBotProcessName(botId) {
  return `bytehost-${botId}`;
}

function isMissingProcessError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("process or namespace not found") || message.includes("not found");
}

async function listBytehostProcesses() {
  const list = await invoke("list");
  return (list || []).filter((processInfo) => processInfo.name?.startsWith("bytehost-"));
}

async function describeProcess(processName) {
  try {
    const result = await invoke("describe", processName);
    return Array.isArray(result) && result.length > 0 ? result[0] : null;
  } catch (error) {
    if (isMissingProcessError(error)) {
      return null;
    }

    throw error;
  }
}

async function deleteProcess(processName) {
  try {
    await invoke("delete", processName);
  } catch (error) {
    if (!isMissingProcessError(error)) {
      throw error;
    }
  }
}

async function stopProcess(processName) {
  try {
    await invoke("stop", processName);
  } catch (error) {
    if (!isMissingProcessError(error)) {
      throw error;
    }
  }
}

async function startBotProcess(bot) {
  const shell = getShellInvocation(bot.start_command);
  const logPaths = getBotLogPaths(bot.id);

  await deleteProcess(bot.pm2_name);

  return invoke("start", {
    name: bot.pm2_name,
    cwd: bot.project_path,
    script: shell.command,
    args: shell.args,
    interpreter: "none",
    out_file: logPaths.out,
    error_file: logPaths.error,
    time: true,
    merge_logs: false,
    autorestart: Boolean(bot.auto_restart),
    restart_delay: Number(bot.restart_delay || 0),
    max_restarts: Number(bot.max_restarts || 0),
    min_uptime: 5000,
    max_memory_restart: bot.ram_limit_mb ? `${bot.ram_limit_mb}M` : undefined,
    env: {
      BYTEHOST_BOT_ID: bot.id
    }
  });
}

module.exports = {
  getBotProcessName,
  listBytehostProcesses,
  describeProcess,
  deleteProcess,
  stopProcess,
  startBotProcess
};
