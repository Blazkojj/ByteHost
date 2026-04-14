const {
  deleteProcess,
  describeProcess,
  hasManagedServerConsole,
  listBytehostProcesses,
  sendManagedConsoleCommand,
  startBotProcess,
  stopProcess
} = require("./pm2");
const {
  getDockerServiceLogs,
  inspectDockerService,
  isDockerService,
  listBytehostContainers,
  removeDockerContainer,
  sendDockerConsoleCommand,
  startDockerService,
  stopDockerContainer
} = require("./docker");

function getRuntimeKind(botOrServiceType) {
  return isDockerService(botOrServiceType) ? "docker" : "pm2";
}

function hasInteractiveConsole(bot) {
  return isDockerService(bot) || hasManagedServerConsole(bot);
}

async function describeServiceRuntime(bot) {
  if (isDockerService(bot)) {
    return inspectDockerService(bot);
  }

  return describeProcess(bot.pm2_name);
}

async function listServiceRuntimeMap(bots = []) {
  const runtimeMap = new Map();
  const pm2Bots = bots.filter((bot) => !isDockerService(bot));
  const dockerBots = bots.filter((bot) => isDockerService(bot));

  if (pm2Bots.length > 0) {
    const processList = await listBytehostProcesses().catch(() => []);
    for (const processInfo of processList) {
      runtimeMap.set(processInfo.name, processInfo);
    }
  }

  if (dockerBots.length > 0) {
    await listBytehostContainers().catch(() => []);
    await Promise.all(
      dockerBots.map(async (bot) => {
        const runtime = await inspectDockerService(bot).catch(() => null);
        if (runtime) {
          runtimeMap.set(bot.pm2_name, runtime);
        }
      })
    );
  }

  return runtimeMap;
}

async function startServiceRuntime(bot, startCommand) {
  if (isDockerService(bot)) {
    return startDockerService(bot, startCommand);
  }

  return startBotProcess({
    ...bot,
    start_command: startCommand
  });
}

async function stopServiceRuntime(bot) {
  if (isDockerService(bot)) {
    return stopDockerContainer(bot.pm2_name);
  }

  return stopProcess(bot.pm2_name);
}

async function deleteServiceRuntime(bot) {
  if (isDockerService(bot)) {
    return removeDockerContainer(bot.pm2_name);
  }

  return deleteProcess(bot.pm2_name);
}

async function sendServiceConsoleCommand(bot, command) {
  if (isDockerService(bot)) {
    return sendDockerConsoleCommand(bot, command);
  }

  return sendManagedConsoleCommand(bot.project_path, command);
}

async function getServiceRuntimeLogs(bot) {
  if (!isDockerService(bot)) {
    return "";
  }

  return getDockerServiceLogs(bot);
}

module.exports = {
  deleteServiceRuntime,
  describeServiceRuntime,
  getRuntimeKind,
  getServiceRuntimeLogs,
  hasInteractiveConsole,
  isDockerService,
  listServiceRuntimeMap,
  sendServiceConsoleCommand,
  startServiceRuntime,
  stopServiceRuntime
};
