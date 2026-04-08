const Database = require("better-sqlite3");

const { DB_PATH, DEFAULT_SYSTEM_LIMITS } = require("../config");
const { nowIso } = require("./utils");

let database;

function mapBotRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    auto_restart: Boolean(row.auto_restart),
    accept_eula: Boolean(row.accept_eula)
  };
}

function mapSystemLimitsRow(row) {
  if (!row) {
    return null;
  }

  return { ...row };
}

function getDb() {
  if (!database) {
    throw new Error("Baza danych nie zostala zainicjalizowana.");
  }

  return database;
}

function getTableColumns(db, tableName) {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => column.name)
  );
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = getTableColumns(db, tableName);
  if (!columns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function initDatabase() {
  if (database) {
    return database;
  }

  database = new Database(DB_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT DEFAULT '',
      language TEXT,
      detected_language TEXT,
      entry_file TEXT,
      detected_entry_file TEXT,
      start_command TEXT,
      detected_start_command TEXT,
      install_command TEXT,
      detected_install_command TEXT,
      package_manager TEXT,
      project_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OFFLINE',
      status_message TEXT,
      expires_at TEXT,
      auto_restart INTEGER NOT NULL DEFAULT 1,
      restart_delay INTEGER NOT NULL DEFAULT 5000,
      max_restarts INTEGER NOT NULL DEFAULT 5,
      restart_count INTEGER NOT NULL DEFAULT 0,
      last_restart_at TEXT,
      stability_status TEXT DEFAULT 'STOPPED',
      ram_limit_mb INTEGER,
      cpu_limit_percent INTEGER,
      archive_name TEXT,
      pm2_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_pm2_name ON bots(pm2_name);

    CREATE TABLE IF NOT EXISTS system_limits (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ram_limit_mb INTEGER NOT NULL,
      cpu_limit_percent INTEGER NOT NULL,
      storage_limit_mb INTEGER NOT NULL,
      max_bots INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(database, "bots", "service_type", "TEXT NOT NULL DEFAULT 'discord_bot'");
  ensureColumn(database, "bots", "accept_eula", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "bots", "public_host", "TEXT");
  ensureColumn(database, "bots", "public_port", "INTEGER");
  ensureColumn(database, "bots", "minecraft_version", "TEXT");
  ensureColumn(database, "bots", "detected_minecraft_version", "TEXT");

  const existingLimits = database.prepare("SELECT id FROM system_limits WHERE id = 1").get();
  if (!existingLimits) {
    database
      .prepare(
        `
          INSERT INTO system_limits (
            id,
            ram_limit_mb,
            cpu_limit_percent,
            storage_limit_mb,
            max_bots,
            updated_at
          )
          VALUES (1, @ram_limit_mb, @cpu_limit_percent, @storage_limit_mb, @max_bots, @updated_at)
        `
      )
      .run({
        ...DEFAULT_SYSTEM_LIMITS,
        updated_at: nowIso()
      });
  }

  return database;
}

module.exports = {
  getDb,
  initDatabase,
  mapBotRow,
  mapSystemLimitsRow
};
