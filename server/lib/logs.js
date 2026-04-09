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

function splitLogLines(content, stream) {
  if (!content) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      line,
      stream,
      index,
      timestamp: extractTimestamp(line)
    }));
}

function extractTimestamp(line) {
  const match = String(line || "").match(
    /^(\d{4}-\d{2}-\d{2}[T ][0-9:.+-]{8,})(?:\s|$)/
  );

  if (!match) {
    return null;
  }

  const parsed = Date.parse(match[1].replace(" ", "T"));
  return Number.isNaN(parsed) ? null : parsed;
}

function mergeChronologicalLines(out, error) {
  const outLines = splitLogLines(out, "out");
  const errorLines = splitLogLines(error, "error");
  const merged = [...outLines, ...errorLines];

  if (merged.length === 0) {
    return "";
  }

  merged.sort((left, right) => {
    if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    if (left.timestamp !== null && right.timestamp === null) {
      return -1;
    }

    if (left.timestamp === null && right.timestamp !== null) {
      return 1;
    }

    if (left.index !== right.index) {
      return left.index - right.index;
    }

    return left.stream.localeCompare(right.stream);
  });

  return merged.map((entry) => entry.line).join("\n");
}

async function getBotLogs(botId) {
  const paths = getBotLogPaths(botId);
  const [out, error] = await Promise.all([readLogTail(paths.out), readLogTail(paths.error)]);
  const combined = mergeChronologicalLines(out, error);

  return {
    out,
    error,
    combined,
    paths
  };
}

async function appendBotLog(botId, stream, message) {
  const paths = getBotLogPaths(botId);
  const filePath = stream === "out" ? paths.out : paths.error;
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.appendFile(filePath, message, "utf8");
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
  readLogTail,
  getBotLogs,
  appendBotLog,
  removeBotLogs
};
