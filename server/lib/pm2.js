const fs = require("fs/promises");
const path = require("path");
const pm2 = require("pm2");

const { getShellInvocation, runShellCommand } = require("./commands");
const { getBotLogPaths } = require("./logs");

let connectionPromise;
const MANAGED_SERVER_SERVICE_TYPES = new Set([
  "discord_bot"
]);
const MANAGED_CONSOLE_WRITE_TIMEOUT_MS = 3000;

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

function hasManagedServerConsole(botOrServiceType) {
  const serviceType =
    typeof botOrServiceType === "string" ? botOrServiceType : botOrServiceType?.service_type;
  return MANAGED_SERVER_SERVICE_TYPES.has(serviceType);
}

function getManagedConsoleInputPath(projectPath) {
  return path.join(projectPath, ".bytehost", "console.stdin");
}

async function prepareManagedConsoleInput(projectPath) {
  const consoleInputPath = getManagedConsoleInputPath(projectPath);
  await fs.mkdir(path.dirname(consoleInputPath), { recursive: true });
  await fs.rm(consoleInputPath, { force: true });
  return consoleInputPath;
}

function getManagedServerShellInvocation(bot, consoleInputPath) {
  if (process.platform === "win32") {
    return {
      ...getShellInvocation(bot.start_command),
      env: {}
    };
  }

  return {
    command: "/bin/bash",
    args: [
      "-lc",
      [
        'mkdir -p "$(dirname "$BYTEHOST_CONSOLE_INPUT")"',
        'rm -f "$BYTEHOST_CONSOLE_INPUT"',
        'mkfifo "$BYTEHOST_CONSOLE_INPUT"',
        'exec 3<>"$BYTEHOST_CONSOLE_INPUT"',
        'exec /bin/bash -lc "$BYTEHOST_START_COMMAND" <&3'
      ].join("; ")
    ],
    env: {
      BYTEHOST_START_COMMAND: bot.start_command,
      BYTEHOST_CONSOLE_INPUT: consoleInputPath
    }
  };
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
  const logPaths = getBotLogPaths(bot.id);

  await deleteProcess(bot.pm2_name);

  const shell = hasManagedServerConsole(bot)
    ? getManagedServerShellInvocation(bot, await prepareManagedConsoleInput(bot.project_path))
    : getShellInvocation(bot.start_command);

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
      BYTEHOST_BOT_ID: bot.id,
      ...(shell.env || {})
    }
  });
}

async function sendManagedConsoleCommand(projectPath, command) {
  if (!command) {
    return;
  }

  const consoleInputPath = getManagedConsoleInputPath(projectPath);

  if (process.platform === "win32") {
    throw new Error("Prawdziwa konsola serwera jest obslugiwana tylko na Linuxie.");
  }

  await runShellCommand('printf "%s\\n" "$BYTEHOST_CONSOLE_COMMAND" > "$BYTEHOST_CONSOLE_INPUT"', {
    cwd: projectPath,
    timeoutMs: MANAGED_CONSOLE_WRITE_TIMEOUT_MS,
    maxOutput: 2000,
    env: {
      BYTEHOST_CONSOLE_COMMAND: command,
      BYTEHOST_CONSOLE_INPUT: consoleInputPath
    }
  });
}

module.exports = {
  getBotProcessName,
  listBytehostProcesses,
  describeProcess,
  deleteProcess,
  stopProcess,
  startBotProcess,
  hasManagedServerConsole,
  getManagedConsoleInputPath,
  sendManagedConsoleCommand
};
