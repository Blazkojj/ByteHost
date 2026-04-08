const fs = require("fs/promises");
const path = require("path");

const { LOGS_DIR, LOG_TAIL_BYTES } = require("../config");

function getBotLogPaths(botId) {
  return {
    out: path.join(LOGS_DIR, `${botId}.out.log`),
    error: path.join(LOGS_DIR, `${botId}.error.log`)
  };
}

async function readLogTail(filePath, maxBytes = LOG_TAIL_BYTES) {
  try {
    const stats = await fs.stat(filePath);
    const start = Math.max(0, stats.size - maxBytes);
    const length = stats.size - start;
    const handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    await handle.close();
    return buffer.toString("utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function getBotLogs(botId) {
  const paths = getBotLogPaths(botId);
  const [out, error] = await Promise.all([readLogTail(paths.out), readLogTail(paths.error)]);

  const combined = [
    out ? `[stdout]\n${out.trimEnd()}` : "",
    error ? `[stderr]\n${error.trimEnd()}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    out,
    error,
    combined,
    paths
  };
}

async function removeBotLogs(botId) {
  const paths = getBotLogPaths(botId);
  await Promise.all([
    fs.rm(paths.out, { force: true }),
    fs.rm(paths.error, { force: true })
  ]);
}

module.exports = {
  getBotLogPaths,
  getBotLogs,
  removeBotLogs
};
