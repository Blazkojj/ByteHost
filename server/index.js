const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { CLIENT_DIST_DIR, PORT } = require("./config");
const { attachOptionalAuth } = require("./lib/auth");
const { initDatabase } = require("./lib/db");
const { ensureStorageDirectories } = require("./lib/storage");
const { startScheduler } = require("./lib/scheduler");
const { attachTerminalWebSocket } = require("./lib/terminal");
const { ensureDefaultOwner } = require("./lib/users");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const botsRoutes = require("./routes/bots");
const systemRoutes = require("./routes/system");

async function bootstrap() {
  initDatabase();
  await ensureStorageDirectories();
  await ensureDefaultOwner();
  startScheduler();

  const app = express();
  app.set("etag", false);

  app.use(cors());
  app.use(morgan("dev"));
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(attachOptionalAuth);
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.set("Pragma", "no-cache");
    response.set("Expires", "0");
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/bots", botsRoutes);
  app.use("/api/system", systemRoutes);

  if (fs.existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api")) {
        next();
        return;
      }

      response.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
    });
  }

  app.use((error, _request, response, _next) => {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
      console.error(error);
    }

    response.status(statusCode).json({
      error: error.message || "Wystąpił nieoczekiwany błąd.",
      details: error.details || null
    });
  });

  const server = http.createServer(app);
  attachTerminalWebSocket(server);

  server.listen(PORT, () => {
    console.log(`ByteHost listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("ByteHost bootstrap failed:", error);
  process.exit(1);
});
