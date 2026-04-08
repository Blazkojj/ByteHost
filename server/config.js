const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, "..");
const STORAGE_DIR = path.resolve(ROOT_DIR, process.env.STORAGE_DIR || "storage");
const DB_PATH = path.resolve(ROOT_DIR, process.env.DB_PATH || "storage/bytehost.db");
const BOTS_DIR = path.join(STORAGE_DIR, "bots");
const TMP_DIR = path.join(STORAGE_DIR, "tmp");
const LOGS_DIR = path.join(STORAGE_DIR, "logs");
const CLIENT_DIST_DIR = path.join(ROOT_DIR, "dist");

const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 512) * 1024 * 1024;
const SCHEDULER_INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS || 60000);
const LOG_TAIL_BYTES = 150000;
const TEXT_FILE_MAX_BYTES = 1024 * 1024;

const DEFAULT_SYSTEM_LIMITS = {
  ram_limit_mb: Number(process.env.DEFAULT_GLOBAL_RAM_MB || 8192),
  cpu_limit_percent: Number(process.env.DEFAULT_GLOBAL_CPU_PERCENT || 400),
  storage_limit_mb: Number(process.env.DEFAULT_GLOBAL_STORAGE_MB || 10240),
  max_bots: Number(process.env.DEFAULT_MAX_BOTS || 10)
};

const DEFAULT_BOT_LIMITS = {
  ram_limit_mb: Number(process.env.DEFAULT_BOT_RAM_MB || 512),
  cpu_limit_percent: Number(process.env.DEFAULT_BOT_CPU_PERCENT || 35),
  restart_delay: 5000,
  max_restarts: 5
};

module.exports = {
  ROOT_DIR,
  STORAGE_DIR,
  DB_PATH,
  BOTS_DIR,
  TMP_DIR,
  LOGS_DIR,
  CLIENT_DIST_DIR,
  PORT,
  MAX_UPLOAD_BYTES,
  SCHEDULER_INTERVAL_MS,
  LOG_TAIL_BYTES,
  TEXT_FILE_MAX_BYTES,
  DEFAULT_SYSTEM_LIMITS,
  DEFAULT_BOT_LIMITS
};
