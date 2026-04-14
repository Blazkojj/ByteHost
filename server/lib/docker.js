const fs = require("fs/promises");
const path = require("path");

const { spawnBuffered, runShellCommand } = require("./commands");
const { GAME_SERVICE_TYPES, getGamePreset } = require("./gamePresets");

const DOCKER_WORKDIR = "/home/container";
const DOCKER_LOG_TAIL_LINES = 800;
const DOCKER_STOP_TIMEOUT_SECONDS = 20;

const DOCKER_SERVICE_TYPES = new Set([
  "minecraft_server",
  "fivem_server",
  ...GAME_SERVICE_TYPES
]);

const DEFAULT_DOCKER_IMAGES = {
  minecraft_server: "ghcr.io/pterodactyl/yolks:java_21",
  fivem_server: "ghcr.io/pterodactyl/yolks:debian",
  project_zomboid: "ghcr.io/pterodactyl/yolks:steamcmd",
  cs2: "ghcr.io/pterodactyl/yolks:steamcmd",
  csgo: "ghcr.io/pterodactyl/yolks:steamcmd",
  unturned: "ghcr.io/pterodactyl/yolks:steamcmd",
  terraria: "ghcr.io/pterodactyl/yolks:debian"
};

function isDockerService(botOrServiceType) {
  const serviceType =
    typeof botOrServiceType === "string" ? botOrServiceType : botOrServiceType?.service_type;
  return DOCKER_SERVICE_TYPES.has(serviceType);
}

function getDockerContainerName(bot) {
  return bot.pm2_name || `bytehost-${bot.id}`;
}

function getDockerImage(bot) {
  const serviceType = bot.service_type;
  const serviceKey = String(serviceType || "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toUpperCase();
  return (
    process.env[`BYTEHOST_DOCKER_IMAGE_${serviceKey}`] ||
    process.env.BYTEHOST_DOCKER_IMAGE_DEFAULT ||
    DEFAULT_DOCKER_IMAGES[serviceType] ||
    "ghcr.io/pterodactyl/yolks:debian"
  );
}

function normalizeDockerCpus(cpuLimitPercent) {
  const cpus = Number(cpuLimitPercent || 0) / 100;
  return Number.isFinite(cpus) && cpus > 0 ? String(Math.max(0.1, cpus)) : null;
}

function parseBytesFromHumanSize(value) {
  const match = String(value || "")
    .trim()
    .match(/^([\d.]+)\s*([kmgtp]?i?b)?$/i);

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const unit = String(match[2] || "b").toLowerCase();
  const multipliers = {
    b: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4
  };

  return amount * (multipliers[unit] || 1);
}

function parseDockerStatsLine(line) {
  if (!line?.trim()) {
    return {
      cpu_percent: 0,
      memory_mb: 0
    };
  }

  try {
    const parsed = JSON.parse(line);
    const memoryUsed = String(parsed.MemUsage || parsed.MemUsageRaw || "")
      .split("/")
      .at(0);

    return {
      cpu_percent: Number(String(parsed.CPUPerc || "0").replace("%", "")) || 0,
      memory_mb: parseBytesFromHumanSize(memoryUsed) / 1024 / 1024
    };
  } catch (_error) {
    return {
      cpu_percent: 0,
      memory_mb: 0
    };
  }
}

async function runDocker(args, options = {}) {
  try {
    return await spawnBuffered("docker", args, {
      maxOutput: options.maxOutput || 250000,
      timeoutMs: options.timeoutMs || 30000,
      allowFailure: options.allowFailure || false,
      env: options.env
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Docker nie jest zainstalowany albo nie jest dostepny w PATH.");
    }

    throw error;
  }
}

async function containerExists(containerName) {
  const result = await runDocker(["inspect", containerName], {
    allowFailure: true,
    maxOutput: 2000
  });
  return result.code === 0;
}

async function removeDockerContainer(containerName) {
  if (!(await containerExists(containerName))) {
    return;
  }

  await runDocker(["rm", "-f", containerName], {
    allowFailure: true,
    timeoutMs: 30000,
    maxOutput: 12000
  });
}

async function stopDockerContainer(containerName) {
  if (!(await containerExists(containerName))) {
    return;
  }

  await runDocker(["stop", "-t", String(DOCKER_STOP_TIMEOUT_SECONDS), containerName], {
    allowFailure: true,
    timeoutMs: (DOCKER_STOP_TIMEOUT_SECONDS + 10) * 1000,
    maxOutput: 12000
  });
}

async function prepareDockerConsoleInput(projectPath) {
  const consoleDirectory = path.join(projectPath, ".bytehost");
  const consoleInputPath = path.join(consoleDirectory, "console.stdin");

  await fs.mkdir(consoleDirectory, { recursive: true });
  await fs.rm(consoleInputPath, { force: true }).catch(() => {});

  if (process.platform !== "win32") {
    await runShellCommand('mkfifo "$BYTEHOST_CONSOLE_INPUT"', {
      env: {
        BYTEHOST_CONSOLE_INPUT: consoleInputPath
      },
      timeoutMs: 3000,
      maxOutput: 2000
    });
  } else {
    await fs.writeFile(consoleInputPath, "", "utf8");
  }

  return consoleInputPath;
}

function getContainerStartCommand() {
  return [
    "mkdir -p /home/container/.bytehost",
    "rm -f /home/container/.bytehost/console.stdin",
    "mkfifo /home/container/.bytehost/console.stdin",
    "exec 3<>/home/container/.bytehost/console.stdin",
    'exec /bin/bash -lc "$BYTEHOST_START_COMMAND" <&3'
  ].join("; ");
}

async function startDockerService(bot, startCommand) {
  if (!isDockerService(bot)) {
    throw new Error("Ta usluga nie jest obslugiwana przez Docker.");
  }

  const containerName = getDockerContainerName(bot);
  const dockerImage = getDockerImage(bot);
  const envFile = path.join(bot.project_path, ".bytehost", "game.env");

  await removeDockerContainer(containerName);
  await prepareDockerConsoleInput(bot.project_path);

  const args = [
    "run",
    "-d",
    "--interactive",
    "--name",
    containerName,
    "--label",
    "bytehost.managed=true",
    "--label",
    `bytehost.service_id=${bot.id}`,
    "--workdir",
    DOCKER_WORKDIR,
    "--volume",
    `${bot.project_path}:${DOCKER_WORKDIR}`,
    "--env",
    `BYTEHOST_BOT_ID=${bot.id}`,
    "--env",
    `BYTEHOST_SERVICE_TYPE=${bot.service_type}`,
    "--env",
    `BYTEHOST_START_COMMAND=${startCommand}`,
    "--env",
    `PORT=${bot.public_port || ""}`,
    "--env",
    `MAX_PLAYERS=${bot.minecraft_max_players || bot.fivem_max_clients || ""}`
  ];

  if (bot.ram_limit_mb) {
    args.push("--memory", `${Number(bot.ram_limit_mb)}m`);
  }

  const dockerCpus = normalizeDockerCpus(bot.cpu_limit_percent);
  if (dockerCpus) {
    args.push("--cpus", dockerCpus);
  }

  if (bot.auto_restart) {
    const maxRestarts = Math.max(0, Number(bot.max_restarts || 0));
    args.push("--restart", maxRestarts > 0 ? `on-failure:${maxRestarts}` : "on-failure");
  }

  if (bot.public_port) {
    args.push("--publish", `${bot.public_port}:${bot.public_port}/tcp`);
    args.push("--publish", `${bot.public_port}:${bot.public_port}/udp`);
  }

  if (await fs.stat(envFile).then((stats) => stats.isFile()).catch(() => false)) {
    args.push("--env-file", envFile);
  }

  args.push(dockerImage, "/bin/bash", "-lc", getContainerStartCommand());

  return runDocker(args, {
    timeoutMs: 120000,
    maxOutput: 500000
  });
}

async function inspectDockerService(bot) {
  const containerName = getDockerContainerName(bot);
  const inspectResult = await runDocker(["inspect", containerName], {
    allowFailure: true,
    timeoutMs: 10000,
    maxOutput: 250000
  });

  if (inspectResult.code !== 0) {
    return null;
  }

  let inspect = null;
  try {
    const parsed = JSON.parse(inspectResult.stdout || "[]");
    inspect = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch (_error) {
    inspect = null;
  }

  if (!inspect) {
    return null;
  }

  const statsResult =
    inspect.State?.Running
      ? await runDocker(
          ["stats", "--no-stream", "--format", "{{json .}}", containerName],
          {
            allowFailure: true,
            timeoutMs: 10000,
            maxOutput: 10000
          }
        )
      : null;
  const stats =
    statsResult?.code === 0 ? parseDockerStatsLine(statsResult.stdout.split(/\r?\n/)[0]) : null;

  return {
    bytehost_runtime: "docker",
    name: containerName,
    image: inspect.Config?.Image || getDockerImage(bot),
    state: inspect.State || {},
    restart_count: Number(inspect.RestartCount || 0),
    stats: stats || {
      cpu_percent: 0,
      memory_mb: 0
    }
  };
}

async function listBytehostContainers() {
  const result = await runDocker(
    ["ps", "-a", "--filter", "label=bytehost.managed=true", "--format", "{{json .}}"],
    {
      allowFailure: true,
      timeoutMs: 10000,
      maxOutput: 250000
    }
  );

  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

async function getDockerServiceLogs(bot, options = {}) {
  const containerName = getDockerContainerName(bot);
  const tailLines = Number(options.tailLines || DOCKER_LOG_TAIL_LINES);
  const result = await runDocker(
    ["logs", "--tail", String(tailLines), containerName],
    {
      allowFailure: true,
      timeoutMs: 10000,
      maxOutput: options.maxOutput || 1000000
    }
  );

  if (result.code !== 0) {
    return "";
  }

  return [result.stdout, result.stderr].filter(Boolean).join("\n").trimEnd();
}

async function sendDockerConsoleCommand(bot, command) {
  const consoleInputPath = path.join(bot.project_path, ".bytehost", "console.stdin");
  const ready = await fs.stat(consoleInputPath).then(() => true).catch(() => false);

  if (!ready) {
    throw new Error("Konsola Dockera nie jest jeszcze gotowa. Zrestartuj usluge i sprobuj ponownie.");
  }

  await runShellCommand('printf "%s\\n" "$BYTEHOST_CONSOLE_COMMAND" > "$BYTEHOST_CONSOLE_INPUT"', {
    cwd: bot.project_path,
    timeoutMs: 3000,
    maxOutput: 2000,
    env: {
      BYTEHOST_CONSOLE_COMMAND: command,
      BYTEHOST_CONSOLE_INPUT: consoleInputPath
    }
  });
}

function getDockerRuntimeLabel(bot) {
  const preset = getGamePreset(bot.service_type);
  return preset?.label || bot.service_type;
}

module.exports = {
  getDockerContainerName,
  getDockerImage,
  getDockerRuntimeLabel,
  getDockerServiceLogs,
  inspectDockerService,
  isDockerService,
  listBytehostContainers,
  removeDockerContainer,
  sendDockerConsoleCommand,
  startDockerService,
  stopDockerContainer
};
