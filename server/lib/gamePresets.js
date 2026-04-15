const fs = require("fs/promises");
const path = require("path");

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\"'\"'")}'`;
}

function envLine(key, value) {
  return `${key}=${shellQuote(value)}\n`;
}

const TERRARIA_DEFAULT_SERVER_VERSION = process.env.TERRARIA_SERVER_VERSION || "1456";

const GAME_PRESETS = {
  project_zomboid: {
    serviceType: "project_zomboid",
    label: "Project Zomboid",
    language: "SteamCMD",
    packageManager: "steamcmd",
    appId: "380870",
    entryFile: "start-server.sh",
    installCommand: 'bash "install-server.sh"',
    startCommand: 'bash "start-server.sh"',
    defaultPort: 16261,
    portRangeStart: numberFromEnv("PROJECT_ZOMBOID_PORT_RANGE_START", 16261),
    portRangeEnd: numberFromEnv("PROJECT_ZOMBOID_PORT_RANGE_END", 16361),
    maxPlayers: 32,
    engineOptions: [
      {
        id: "vanilla",
        label: "Vanilla dedicated server",
        hint: "Oficjalny dedicated server pobierany przez SteamCMD"
      },
      {
        id: "workshop",
        label: "Workshop mods",
        hint: "Ten sam runtime, ale przygotowany pod mody z Workshopa"
      }
    ],
    addonFolders: [
      { label: "Mods", path: "Zomboid/mods", description: "Lokalne mody Project Zomboid." },
      { label: "Workshop", path: "Zomboid/Workshop", description: "Pliki z Workshopa." },
      { label: "Server config", path: "Zomboid/Server", description: "Konfiguracje serwera." }
    ],
    readme: [
      "Project Zomboid w ByteHost",
      "",
      "1. Kliknij Reinstall dependencies, zeby pobrac serwer przez SteamCMD.",
      "2. Ustaw port na routerze na publiczny port tej uslugi.",
      "3. Mody wrzucaj do Zomboid/mods albo zarzadzaj Workshopem w plikach konfiguracyjnych.",
      "",
      "Wymagane na Ubuntu: steamcmd."
    ],
    installScript: (preset) => `#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="\${BYTEHOST_INSTALL_DIR:-$PWD/server}"
if ! command -v steamcmd >/dev/null 2>&1; then
  echo "[bytehost] Brakuje steamcmd. Zainstaluj: sudo apt install steamcmd"
  exit 127
fi
mkdir -p "$INSTALL_DIR"
steamcmd +force_install_dir "$INSTALL_DIR" +login anonymous +app_update ${preset.appId} validate +quit
echo "[bytehost] Project Zomboid server zostal pobrany do $INSTALL_DIR"
`,
    startScript: () => `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$PWD"
if [ -f "$ROOT_DIR/.bytehost/game.env" ]; then
  set -a
  . "$ROOT_DIR/.bytehost/game.env"
  set +a
fi
SERVER_DIR="\${BYTEHOST_INSTALL_DIR:-$ROOT_DIR/server}"
SERVER_NAME="\${PZ_SERVER_NAME:-ByteHost}"
if [ ! -f "$SERVER_DIR/start-server.sh" ]; then
  echo "[bytehost] Brakuje plikow serwera. Kliknij Reinstall dependencies, zeby pobrac Project Zomboid przez SteamCMD."
  exit 1
fi
cd "$SERVER_DIR"
exec bash start-server.sh -servername "$SERVER_NAME"
`
  },

  terraria: {
    serviceType: "terraria",
    label: "Terraria",
    language: "Terraria",
    packageManager: "terraria",
    entryFile: "start-server.sh",
    installCommand: 'bash "install-server.sh"',
    startCommand: 'bash "start-server.sh"',
    defaultPort: 7777,
    portRangeStart: numberFromEnv("TERRARIA_PORT_RANGE_START", 7777),
    portRangeEnd: numberFromEnv("TERRARIA_PORT_RANGE_END", 7877),
    maxPlayers: 16,
    engineOptions: [
      {
        id: "vanilla",
        label: "Vanilla dedicated server",
        hint: "Oficjalny dedicated server Terraria"
      },
      {
        id: "tshock",
        label: "TShock",
        hint: "Pluginy TShock, runtime wrzucasz lub podmieniasz w plikach"
      },
      {
        id: "tmodloader",
        label: "tModLoader",
        hint: "Mody tModLoader, runtime wrzucasz lub podmieniasz w plikach"
      }
    ],
    addonFolders: [
      { label: "TShock plugins", path: "tshock/plugins", description: "Pluginy TShock, jesli uzywasz TShocka." },
      { label: "Worlds", path: "worlds", description: "Swiaty Terraria." },
      { label: "Mods", path: "mods", description: "Folder pod reczne mody/tModLoader." }
    ],
    readme: [
      "Terraria w ByteHost",
      "",
      "1. Kliknij Reinstall dependencies, zeby pobrac oficjalny dedicated server z terraria.org.",
      "2. Standardowy port to 7777, ale ByteHost przydzieli wolny port automatycznie.",
      "3. Wersje serwera ustawisz w .bytehost/game.env przez TERRARIA_SERVER_VERSION, np. 1456.",
      "4. Pluginy TShock wrzucaj do tshock/plugins, jesli podmienisz silnik na TShock.",
      "",
      "Wymagane na Ubuntu: curl oraz unzip."
    ],
    installScript: () => `#!/usr/bin/env bash
set -euo pipefail
VERSION="\${TERRARIA_SERVER_VERSION:-${TERRARIA_DEFAULT_SERVER_VERSION}}"
ARCHIVE="terraria-server-$VERSION.zip"
DOWNLOAD_URL="https://terraria.org/api/download/pc-dedicated-server/$ARCHIVE"
if ! command -v curl >/dev/null 2>&1; then
  echo "[bytehost] Brakuje curl. Zainstaluj: sudo apt install curl"
  exit 127
fi
if ! command -v unzip >/dev/null 2>&1; then
  echo "[bytehost] Brakuje unzip. Zainstaluj: sudo apt install unzip"
  exit 127
fi
rm -rf server server-source "$ARCHIVE"
mkdir -p server-source server worlds tshock/plugins mods
echo "[bytehost] Pobieranie Terraria dedicated server: $DOWNLOAD_URL"
for attempt in 1 2 3; do
  rm -f "$ARCHIVE"
  if curl -fL --retry 4 --retry-delay 3 --retry-all-errors --connect-timeout 30 "$DOWNLOAD_URL" -o "$ARCHIVE"; then
    if unzip -tq "$ARCHIVE" >/dev/null 2>&1; then
      break
    fi
    echo "[bytehost] Pobrany plik Terraria nie jest poprawnym ZIP-em, proba $attempt/3."
  else
    echo "[bytehost] Pobieranie Terraria nie powiodlo sie, proba $attempt/3."
  fi

  if [ "$attempt" = "3" ]; then
    echo "[bytehost] Nie udalo sie pobrac poprawnej paczki Terraria. Sprobuj ponownie pozniej albo ustaw TERRARIA_SERVER_VERSION w .bytehost/game.env."
    exit 1
  fi
  sleep 3
done
unzip -q "$ARCHIVE" -d server-source
LINUX_DIR="$(find server-source -type d -path "*/Linux" | head -n 1)"
if [ -z "$LINUX_DIR" ]; then
  echo "[bytehost] Nie znaleziono katalogu Linux w paczce Terraria."
  exit 1
fi
cp -R "$LINUX_DIR"/. server/
chmod +x server/TerrariaServer.bin.x86* || true
echo "[bytehost] Terraria dedicated server zostal pobrany do $PWD/server"
`,
    startScript: () => `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$PWD"
if [ -f "$ROOT_DIR/.bytehost/game.env" ]; then
  set -a
  . "$ROOT_DIR/.bytehost/game.env"
  set +a
fi
PORT="\${PORT:-7777}"
MAX_PLAYERS="\${MAX_PLAYERS:-16}"
WORLD_NAME="\${TERRARIA_WORLD_NAME:-ByteHost}"
WORLD_SIZE="\${TERRARIA_WORLD_SIZE:-2}"
WORLD_PATH="\${TERRARIA_WORLD:-$ROOT_DIR/worlds/$WORLD_NAME.wld}"
if [ ! -x "$ROOT_DIR/server/TerrariaServer.bin.x86_64" ]; then
  echo "[bytehost] Brakuje TerrariaServer.bin.x86_64. Kliknij Reinstall dependencies, zeby pobrac serwer."
  exit 1
fi
mkdir -p "$ROOT_DIR/worlds"
cd "$ROOT_DIR/server"
exec ./TerrariaServer.bin.x86_64 -port "$PORT" -players "$MAX_PLAYERS" -world "$WORLD_PATH" -autocreate "$WORLD_SIZE" -worldname "$WORLD_NAME"
`
  },

  cs2: {
    serviceType: "cs2",
    label: "Counter-Strike 2",
    language: "SteamCMD",
    packageManager: "steamcmd",
    appId: "730",
    entryFile: "start-server.sh",
    installCommand: 'bash "install-server.sh"',
    startCommand: 'bash "start-server.sh"',
    defaultPort: 27015,
    portRangeStart: numberFromEnv("CS2_PORT_RANGE_START", 27015),
    portRangeEnd: numberFromEnv("CS2_PORT_RANGE_END", 27115),
    maxPlayers: 12,
    engineOptions: [
      {
        id: "vanilla",
        label: "Valve dedicated server",
        hint: "Czysty CS2 dedicated server przez SteamCMD"
      },
      {
        id: "metamod",
        label: "Metamod:Source",
        hint: "Pod pluginy CS2 instalowane recznie do addons/"
      },
      {
        id: "counterstrikesharp",
        label: "CounterStrikeSharp",
        hint: "Framework pluginow CS2 instalowany recznie do addons/"
      }
    ],
    addonFolders: [
      { label: "Addons", path: "server/game/csgo/addons", description: "Pluginy/addony CS2." },
      { label: "CFG", path: "server/game/csgo/cfg", description: "Konfiguracje serwera." },
      { label: "Maps", path: "server/game/csgo/maps", description: "Mapy serwera." }
    ],
    readme: [
      "Counter-Strike 2 w ByteHost",
      "",
      "1. Kliknij Reinstall dependencies, zeby pobrac pliki przez SteamCMD.",
      "2. Do publicznego serwera CS2 zwykle potrzebny jest GSLT w zmiennej STEAM_GSLT.",
      "3. Addony wrzucaj do server/game/csgo/addons.",
      "",
      "Wymagane na Ubuntu: steamcmd."
    ],
    installScript: (preset) => `#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="\${BYTEHOST_INSTALL_DIR:-$PWD/server}"
REQUIRED_FREE_MB="\${CS2_REQUIRED_FREE_MB:-45000}"
if ! command -v steamcmd >/dev/null 2>&1; then
  echo "[bytehost] Brakuje steamcmd. Zainstaluj: sudo apt install steamcmd"
  exit 127
fi
mkdir -p "$INSTALL_DIR"
AVAILABLE_MB="$(df -Pm "$PWD" | awk 'NR==2 {print $4}')"
if [ -n "$AVAILABLE_MB" ] && [ "$AVAILABLE_MB" -lt "$REQUIRED_FREE_MB" ]; then
  echo "[bytehost] CS2 potrzebuje okolo 33 GB pobierania i bezpiecznie min. $REQUIRED_FREE_MB MB wolnego miejsca. Dostepne: $AVAILABLE_MB MB."
  echo "[bytehost] Zwieksz dysk VM albo limit storage dla tej uslugi i uruchom instalacje ponownie."
  exit 1
fi
LOWER_INSTALL_LINK="/tmp/bytehost-cs2-\$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
rm -f "$LOWER_INSTALL_LINK"
ln -s "$INSTALL_DIR" "$LOWER_INSTALL_LINK"
trap 'rm -f "$LOWER_INSTALL_LINK"' EXIT
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
steamcmd +force_install_dir "$LOWER_INSTALL_LINK" +login anonymous +app_update ${preset.appId} validate +quit
echo "[bytehost] CS2 server zostal pobrany do $INSTALL_DIR"
`,
    startScript: () => `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$PWD"
if [ -f "$ROOT_DIR/.bytehost/game.env" ]; then
  set -a
  . "$ROOT_DIR/.bytehost/game.env"
  set +a
fi
SERVER_DIR="\${BYTEHOST_INSTALL_DIR:-$ROOT_DIR/server}"
PORT="\${PORT:-27015}"
MAP="\${CS2_MAP:-de_dust2}"
GAME_TYPE="\${CS2_GAME_TYPE:-0}"
GAME_MODE="\${CS2_GAME_MODE:-1}"
if [ ! -x "$SERVER_DIR/game/bin/linuxsteamrt64/cs2" ]; then
  echo "[bytehost] Brakuje binarki CS2. Kliknij Reinstall dependencies, zeby pobrac serwer przez SteamCMD."
  exit 1
fi
cd "$SERVER_DIR"
ARGS=(-dedicated -usercon -ip 0.0.0.0 -port "$PORT" +map "$MAP" +game_type "$GAME_TYPE" +game_mode "$GAME_MODE")
if [ -n "\${STEAM_GSLT:-}" ]; then
  ARGS+=(+sv_setsteamaccount "$STEAM_GSLT")
fi
exec ./game/bin/linuxsteamrt64/cs2 "\${ARGS[@]}"
`
  },

  csgo: {
    serviceType: "csgo",
    label: "CS:GO Legacy",
    language: "SteamCMD",
    packageManager: "steamcmd",
    appId: "740",
    entryFile: "start-server.sh",
    installCommand: 'bash "install-server.sh"',
    startCommand: 'bash "start-server.sh"',
    defaultPort: 27016,
    portRangeStart: numberFromEnv("CSGO_PORT_RANGE_START", 27016),
    portRangeEnd: numberFromEnv("CSGO_PORT_RANGE_END", 27116),
    maxPlayers: 12,
    engineOptions: [
      {
        id: "vanilla",
        label: "SRCDS vanilla",
        hint: "Czysty CS:GO dedicated server przez SteamCMD"
      },
      {
        id: "sourcemod",
        label: "SourceMod + MetaMod",
        hint: "Pluginy SourceMod instalowane recznie do addons/"
      }
    ],
    addonFolders: [
      { label: "Addons", path: "server/csgo/addons", description: "Pluginy/addony CS:GO." },
      { label: "CFG", path: "server/csgo/cfg", description: "Konfiguracje serwera." },
      { label: "Maps", path: "server/csgo/maps", description: "Mapy serwera." }
    ],
    readme: [
      "CS:GO Legacy w ByteHost",
      "",
      "1. Kliknij Reinstall dependencies, zeby pobrac dedicated server przez SteamCMD.",
      "2. Do publicznego serwera zwykle potrzebny jest GSLT w zmiennej STEAM_GSLT.",
      "3. Addony wrzucaj do server/csgo/addons.",
      "",
      "Wymagane na Ubuntu: steamcmd."
    ],
    installScript: (preset) => `#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="\${BYTEHOST_INSTALL_DIR:-$PWD/server}"
if ! command -v steamcmd >/dev/null 2>&1; then
  echo "[bytehost] Brakuje steamcmd. Zainstaluj: sudo apt install steamcmd"
  exit 127
fi
mkdir -p "$INSTALL_DIR"
steamcmd +force_install_dir "$INSTALL_DIR" +login anonymous +app_update ${preset.appId} validate +quit
echo "[bytehost] CS:GO dedicated server zostal pobrany do $INSTALL_DIR"
`,
    startScript: () => `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$PWD"
if [ -f "$ROOT_DIR/.bytehost/game.env" ]; then
  set -a
  . "$ROOT_DIR/.bytehost/game.env"
  set +a
fi
SERVER_DIR="\${BYTEHOST_INSTALL_DIR:-$ROOT_DIR/server}"
PORT="\${PORT:-27016}"
MAP="\${CSGO_MAP:-de_dust2}"
if [ ! -x "$SERVER_DIR/srcds_run" ]; then
  echo "[bytehost] Brakuje srcds_run. Kliknij Reinstall dependencies, zeby pobrac CS:GO przez SteamCMD."
  exit 1
fi
cd "$SERVER_DIR"
ARGS=(-game csgo -console -usercon -ip 0.0.0.0 -port "$PORT" +map "$MAP" +game_type 0 +game_mode 1)
if [ -n "\${STEAM_GSLT:-}" ]; then
  ARGS+=(+sv_setsteamaccount "$STEAM_GSLT")
fi
exec ./srcds_run "\${ARGS[@]}"
`
  },

  unturned: {
    serviceType: "unturned",
    label: "Unturned",
    language: "SteamCMD",
    packageManager: "steamcmd",
    appId: "1110390",
    entryFile: "start-server.sh",
    installCommand: 'bash "install-server.sh"',
    startCommand: 'bash "start-server.sh"',
    defaultPort: 27017,
    portRangeStart: numberFromEnv("UNTURNED_PORT_RANGE_START", 27017),
    portRangeEnd: numberFromEnv("UNTURNED_PORT_RANGE_END", 27117),
    maxPlayers: 24,
    engineOptions: [
      {
        id: "vanilla",
        label: "Vanilla dedicated server",
        hint: "Oficjalny dedicated server Unturned przez SteamCMD"
      },
      {
        id: "rocketmod",
        label: "RocketMod",
        hint: "Pluginy RocketMod instalowane recznie w folderze serwera"
      },
      {
        id: "openmod",
        label: "OpenMod",
        hint: "Pluginy OpenMod instalowane recznie w folderze serwera"
      }
    ],
    addonFolders: [
      { label: "Workshop content", path: "server/Servers/ByteHost/Workshop/Content", description: "Mody z Workshopa." },
      { label: "Workshop maps", path: "server/Servers/ByteHost/Workshop/Maps", description: "Mapy z Workshopa." },
      { label: "Plugins", path: "server/Servers/ByteHost/Plugins", description: "Pluginy serwera." }
    ],
    readme: [
      "Unturned w ByteHost",
      "",
      "1. Kliknij Reinstall dependencies, zeby pobrac dedicated server przez SteamCMD.",
      "2. Workshop i pluginy wrzucaj do folderow w server/Servers/ByteHost.",
      "3. Port musi byc przekierowany na routerze do VM.",
      "",
      "Wymagane na Ubuntu: steamcmd."
    ],
    installScript: (preset) => `#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="\${BYTEHOST_INSTALL_DIR:-$PWD/server}"
if ! command -v steamcmd >/dev/null 2>&1; then
  echo "[bytehost] Brakuje steamcmd. Zainstaluj: sudo apt install steamcmd"
  exit 127
fi
mkdir -p "$INSTALL_DIR"
steamcmd +force_install_dir "$INSTALL_DIR" +login anonymous +app_update ${preset.appId} validate +quit
echo "[bytehost] Unturned dedicated server zostal pobrany do $INSTALL_DIR"
`,
    startScript: () => `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$PWD"
if [ -f "$ROOT_DIR/.bytehost/game.env" ]; then
  set -a
  . "$ROOT_DIR/.bytehost/game.env"
  set +a
fi
SERVER_DIR="\${BYTEHOST_INSTALL_DIR:-$ROOT_DIR/server}"
SERVER_NAME="\${UNTURNED_SERVER_NAME:-ByteHost}"
PORT="\${PORT:-27017}"
MAX_PLAYERS="\${MAX_PLAYERS:-24}"
if [ ! -f "$SERVER_DIR/ServerHelper.sh" ]; then
  echo "[bytehost] Brakuje ServerHelper.sh. Kliknij Reinstall dependencies, zeby pobrac Unturned przez SteamCMD."
  exit 1
fi
mkdir -p "$SERVER_DIR/Servers/$SERVER_NAME/Server"
cat > "$SERVER_DIR/Servers/$SERVER_NAME/Server/Commands.dat" <<EOF
Name $SERVER_NAME
Port $PORT
MaxPlayers $MAX_PLAYERS
Map PEI
Perspective Both
Mode Normal
Cheats Disabled
EOF
cd "$SERVER_DIR"
chmod +x ServerHelper.sh Unturned_Headless.x86_64 || true
exec ./ServerHelper.sh +InternetServer/"$SERVER_NAME"
`
  }
};

const GAME_SERVICE_TYPES = new Set(Object.keys(GAME_PRESETS));

function getGamePreset(serviceType) {
  return GAME_PRESETS[serviceType] || null;
}

function getGameEngineOptions(serviceType) {
  const preset = getGamePreset(serviceType);
  return preset?.engineOptions || [];
}

function sanitizeGameEngine(serviceType, value, fallback = null) {
  const engineOptions = getGameEngineOptions(serviceType);
  const fallbackEngine = fallback || engineOptions[0]?.id || "vanilla";
  const normalized = String(value || fallbackEngine).toLowerCase();

  return engineOptions.some((engine) => engine.id === normalized) ? normalized : fallbackEngine;
}

function isGamePresetService(serviceType) {
  return GAME_SERVICE_TYPES.has(serviceType);
}

function listGamePresets() {
  return Object.values(GAME_PRESETS).map((preset) => ({
    serviceType: preset.serviceType,
    label: preset.label,
    language: preset.language,
    defaultPort: preset.defaultPort,
    engineOptions: preset.engineOptions || [],
    addonFolders: preset.addonFolders
  }));
}

function buildGameStartCommand(serviceType, entryFile = null) {
  const preset = getGamePreset(serviceType);
  if (!preset) {
    return null;
  }

  return entryFile && entryFile !== preset.entryFile
    ? `bash "${entryFile}"`
    : preset.startCommand;
}

function getGamePortRange(serviceType) {
  const preset = getGamePreset(serviceType);
  if (!preset) {
    return null;
  }

  return {
    start: preset.portRangeStart,
    end: Math.max(preset.portRangeStart, preset.portRangeEnd)
  };
}

async function writeExecutableFile(targetPath, content) {
  await fs.writeFile(targetPath, content, "utf8");
  await fs.chmod(targetPath, 0o755).catch(() => {});
}

async function ensureGameAddonFolders(projectPath, serviceType) {
  const preset = getGamePreset(serviceType);
  if (!preset) {
    return [];
  }

  const created = [];
  for (const folder of preset.addonFolders) {
    const targetPath = path.join(projectPath, folder.path);
    await fs.mkdir(targetPath, { recursive: true });
    created.push(folder.path);
  }

  return created;
}

async function writeGameServerEnv(projectPath, serviceType, options = {}) {
  const preset = getGamePreset(serviceType);
  if (!preset) {
    return null;
  }

  const envDirectory = path.join(projectPath, ".bytehost");
  const envPath = path.join(envDirectory, "game.env");
  const serviceName = options.name || preset.label;
  const publicPort = options.public_port || preset.defaultPort;
  const gameEngine = sanitizeGameEngine(serviceType, options.game_engine);
  const maxPlayers =
    options.max_players ||
    options.minecraft_max_players ||
    options.fivem_max_clients ||
    preset.maxPlayers;

  await fs.mkdir(envDirectory, { recursive: true });
  await fs.writeFile(
    envPath,
    [
      "# Managed by ByteHost. You can edit advanced game variables here.",
      envLine("PORT", publicPort),
      envLine("MAX_PLAYERS", maxPlayers),
      envLine("SERVER_NAME", serviceName),
      envLine("GAME_ENGINE", gameEngine),
      envLine("PZ_SERVER_NAME", serviceName),
      envLine("UNTURNED_SERVER_NAME", serviceName),
      envLine("TERRARIA_WORLD_NAME", serviceName.replace(/[^a-zA-Z0-9_-]+/g, "_")),
      serviceType === "terraria" ? envLine("TERRARIA_SERVER_VERSION", TERRARIA_DEFAULT_SERVER_VERSION) : "",
      ""
    ].join("\n"),
    "utf8"
  );

  return envPath;
}

async function bootstrapGameWorkspace(projectPath, serviceType, options = {}) {
  const preset = getGamePreset(serviceType);
  if (!preset) {
    throw new Error(`Unknown game service type: ${serviceType}`);
  }

  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(path.join(projectPath, "server"), { recursive: true });
  await ensureGameAddonFolders(projectPath, serviceType);
  await writeGameServerEnv(projectPath, serviceType, options);
  await fs.writeFile(path.join(projectPath, "README-BYTEHOST.txt"), preset.readme.join("\n"), "utf8");
  await writeExecutableFile(path.join(projectPath, "install-server.sh"), preset.installScript(preset));
  await writeExecutableFile(path.join(projectPath, "start-server.sh"), preset.startScript(preset));

  return {
    detected_language: preset.language,
    detected_entry_file: preset.entryFile,
    detected_start_command: preset.startCommand,
    install_command: preset.installCommand,
    package_manager: preset.packageManager
  };
}

module.exports = {
  GAME_PRESETS,
  GAME_SERVICE_TYPES,
  buildGameStartCommand,
  bootstrapGameWorkspace,
  ensureGameAddonFolders,
  getGamePortRange,
  getGameEngineOptions,
  getGamePreset,
  isGamePresetService,
  listGamePresets,
  sanitizeGameEngine,
  writeGameServerEnv
};
