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
    accept_eula: Boolean(row.accept_eula),
    fivem_onesync_enabled: row.fivem_onesync_enabled === null || row.fivem_onesync_enabled === undefined
      ? true
      : Boolean(row.fivem_onesync_enabled)
  };
}

function mapSystemLimitsRow(row) {
  if (!row) {
    return null;
  }

  return { ...row };
}

function mapUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    is_active: Boolean(row.is_active),
    pending_approval: Boolean(row.pending_approval)
  };
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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      max_bots INTEGER,
      max_ram_mb INTEGER,
      max_cpu_percent INTEGER,
      max_storage_mb INTEGER,
      expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      pending_approval INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
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
      updated_at TEXT NOT NULL,
      FOREIGN KEY(owner_user_id) REFERENCES users(id)
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

  ensureColumn(database, "users", "max_bots", "INTEGER");
  ensureColumn(database, "users", "max_ram_mb", "INTEGER");
  ensureColumn(database, "users", "max_cpu_percent", "INTEGER");
  ensureColumn(database, "users", "max_storage_mb", "INTEGER");
  ensureColumn(database, "users", "expires_at", "TEXT");
  ensureColumn(database, "users", "is_active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "users", "pending_approval", "INTEGER NOT NULL DEFAULT 0");

  ensureColumn(database, "bots", "owner_user_id", "TEXT");
  ensureColumn(database, "bots", "service_type", "TEXT NOT NULL DEFAULT 'discord_bot'");
  ensureColumn(database, "bots", "accept_eula", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "bots", "public_host", "TEXT");
  ensureColumn(database, "bots", "public_port", "INTEGER");
  ensureColumn(database, "bots", "minecraft_version", "TEXT");
  ensureColumn(database, "bots", "detected_minecraft_version", "TEXT");
  ensureColumn(database, "bots", "fivem_artifact_build", "TEXT");
  ensureColumn(database, "bots", "fivem_license_key", "TEXT");
  ensureColumn(database, "bots", "fivem_max_clients", "INTEGER");
  ensureColumn(database, "bots", "fivem_project_name", "TEXT");
  ensureColumn(database, "bots", "fivem_tags", "TEXT");
  ensureColumn(database, "bots", "fivem_locale", "TEXT");
  ensureColumn(database, "bots", "fivem_onesync_enabled", "INTEGER NOT NULL DEFAULT 1");

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
  mapSystemLimitsRow,
  mapUserRow
};
