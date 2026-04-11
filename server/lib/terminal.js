const { WebSocketServer } = require("ws");

const { authenticateToken } = require("./auth");
const { executeBotConsoleCommand, getBotLogsPayload } = require("./bots");

const TERMINAL_PATH_PATTERN = /^\/api\/bots\/([^/]+)\/terminal\/?$/;
const TERMINAL_POLL_INTERVAL_MS = 650;
const TERMINAL_HEARTBEAT_MS = 25000;

function sendJson(socket, payload) {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function parseMessage(rawMessage) {
  try {
    return JSON.parse(String(rawMessage || ""));
  } catch (_error) {
    return {};
  }
}

async function sendLogsSnapshot(socket, botId, actor, state, reason = "poll") {
  const logs = await getBotLogsPayload(botId, actor);
  const combined = logs.combined || "";

  if (state.lastCombined === combined && reason !== "initial") {
    return;
  }

  state.lastCombined = combined;
  sendJson(socket, {
    type: "logs",
    reason,
    logs,
    at: new Date().toISOString()
  });
}

function attachTerminalWebSocket(server) {
  const terminalServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    const match = url.pathname.match(TERMINAL_PATH_PATTERN);

    if (!match) {
      return;
    }

    const actor = authenticateToken(url.searchParams.get("token"));
    if (!actor) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    request.bytehost = {
      botId: decodeURIComponent(match[1]),
      actor
    };

    terminalServer.handleUpgrade(request, socket, head, (webSocket) => {
      terminalServer.emit("connection", webSocket, request);
    });
  });

  terminalServer.on("connection", (socket, request) => {
    const { actor, botId } = request.bytehost;
    const state = {
      lastCombined: ""
    };

    sendJson(socket, {
      type: "ready",
      bot_id: botId,
      at: new Date().toISOString()
    });

    sendLogsSnapshot(socket, botId, actor, state, "initial").catch((error) => {
      sendJson(socket, { type: "error", message: error.message });
    });

    const logInterval = setInterval(() => {
      sendLogsSnapshot(socket, botId, actor, state).catch((error) => {
        sendJson(socket, { type: "error", message: error.message });
      });
    }, TERMINAL_POLL_INTERVAL_MS);

    const heartbeatInterval = setInterval(() => {
      sendJson(socket, { type: "ping", at: new Date().toISOString() });
    }, TERMINAL_HEARTBEAT_MS);

    socket.on("message", async (rawMessage) => {
      const message = parseMessage(rawMessage);

      if (message.type !== "command") {
        return;
      }

      try {
        sendJson(socket, {
          type: "command-start",
          command: message.command || "",
          at: new Date().toISOString()
        });

        const result = await executeBotConsoleCommand(botId, actor, {
          mode: message.mode || "server",
          command: message.command
        });

        sendJson(socket, {
          type: "command-result",
          result,
          at: new Date().toISOString()
        });

        await sendLogsSnapshot(socket, botId, actor, state, "command");
      } catch (error) {
        sendJson(socket, {
          type: "command-error",
          message: error.message,
          at: new Date().toISOString()
        });
      }
    });

    socket.on("close", () => {
      clearInterval(logInterval);
      clearInterval(heartbeatInterval);
    });
  });
}

module.exports = {
  attachTerminalWebSocket
};
