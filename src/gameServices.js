export const GAME_SERVICE_PRESETS = {
  project_zomboid: {
    label: "Project Zomboid",
    language: "SteamCMD",
    entryFile: "start-server.sh",
    startCommand: 'bash "start-server.sh"',
    defaultPort: 16261,
    maxPlayers: 32,
    artifactLabel: "Pakiet Project Zomboid (ZIP / RAR)",
    installLabel: "Pobierz przez SteamCMD",
    hint:
      "Tworzy workspace z install-server.sh i folderami pod mody. Kliknij Reinstall dependencies, zeby pobrac serwer przez SteamCMD.",
    engineOptions: [
      { id: "vanilla", label: "Vanilla dedicated server", hint: "Oficjalny dedicated server" },
      { id: "workshop", label: "Workshop mods", hint: "Ten sam runtime, ale przygotowany pod Workshop" }
    ],
    addonFolders: [
      { label: "Mods", path: "Zomboid/mods" },
      { label: "Workshop", path: "Zomboid/Workshop" },
      { label: "Server config", path: "Zomboid/Server" }
    ]
  },
  terraria: {
    label: "Terraria",
    language: "Terraria",
    entryFile: "start-server.sh",
    startCommand: 'bash "start-server.sh"',
    defaultPort: 7777,
    maxPlayers: 16,
    artifactLabel: "Pakiet Terraria / TShock (ZIP / RAR)",
    installLabel: "Pobierz dedicated server",
    hint:
      "Tworzy workspace dla oficjalnego Terraria dedicated server, z folderami worlds, mods i tshock/plugins.",
    engineOptions: [
      { id: "vanilla", label: "Vanilla dedicated server", hint: "Oficjalny dedicated server Terraria" },
      { id: "tshock", label: "TShock", hint: "Pluginy TShock, runtime wrzucasz w plikach" },
      { id: "tmodloader", label: "tModLoader", hint: "Mody tModLoader, runtime wrzucasz w plikach" }
    ],
    addonFolders: [
      { label: "TShock plugins", path: "tshock/plugins" },
      { label: "Worlds", path: "worlds" },
      { label: "Mods", path: "mods" }
    ]
  },
  cs2: {
    label: "Counter-Strike 2",
    language: "SteamCMD",
    entryFile: "start-server.sh",
    startCommand: 'bash "start-server.sh"',
    defaultPort: 27015,
    maxPlayers: 12,
    artifactLabel: "Pakiet CS2 addons/config (ZIP / RAR)",
    installLabel: "Pobierz przez SteamCMD",
    hint:
      "Tworzy workspace CS2. Do publicznego serwera zwykle dodaj STEAM_GSLT w .bytehost/game.env.",
    engineOptions: [
      { id: "vanilla", label: "Valve dedicated server", hint: "Czysty CS2 dedicated server" },
      { id: "metamod", label: "Metamod:Source", hint: "Pluginy w addons/" },
      { id: "counterstrikesharp", label: "CounterStrikeSharp", hint: "Framework pluginow CS2" }
    ],
    addonFolders: [
      { label: "Addons", path: "server/game/csgo/addons" },
      { label: "CFG", path: "server/game/csgo/cfg" },
      { label: "Maps", path: "server/game/csgo/maps" }
    ]
  },
  csgo: {
    label: "CS:GO Legacy",
    language: "SteamCMD",
    entryFile: "start-server.sh",
    startCommand: 'bash "start-server.sh"',
    defaultPort: 27016,
    maxPlayers: 12,
    artifactLabel: "Pakiet CS:GO addons/config (ZIP / RAR)",
    installLabel: "Pobierz przez SteamCMD",
    hint:
      "Tworzy workspace CS:GO dedicated server. Addony i pluginy wrzucaj do server/csgo/addons.",
    engineOptions: [
      { id: "vanilla", label: "SRCDS vanilla", hint: "Czysty CS:GO dedicated server" },
      { id: "sourcemod", label: "SourceMod + MetaMod", hint: "Pluginy w addons/" }
    ],
    addonFolders: [
      { label: "Addons", path: "server/csgo/addons" },
      { label: "CFG", path: "server/csgo/cfg" },
      { label: "Maps", path: "server/csgo/maps" }
    ]
  },
  unturned: {
    label: "Unturned",
    language: "SteamCMD",
    entryFile: "start-server.sh",
    startCommand: 'bash "start-server.sh"',
    defaultPort: 27017,
    maxPlayers: 24,
    artifactLabel: "Pakiet Unturned Workshop / Plugins (ZIP / RAR)",
    installLabel: "Pobierz przez SteamCMD",
    hint:
      "Tworzy workspace Unturned z folderami Workshop Content, Maps i Plugins.",
    engineOptions: [
      { id: "vanilla", label: "Vanilla dedicated server", hint: "Oficjalny dedicated server" },
      { id: "rocketmod", label: "RocketMod", hint: "Pluginy RocketMod" },
      { id: "openmod", label: "OpenMod", hint: "Pluginy OpenMod" }
    ],
    addonFolders: [
      { label: "Workshop content", path: "server/Servers/ByteHost/Workshop/Content" },
      { label: "Workshop maps", path: "server/Servers/ByteHost/Workshop/Maps" },
      { label: "Plugins", path: "server/Servers/ByteHost/Plugins" }
    ]
  }
};

export const GAME_SERVICE_TYPES = Object.keys(GAME_SERVICE_PRESETS);

export function getGameServicePreset(serviceType) {
  return GAME_SERVICE_PRESETS[serviceType] || null;
}

export function isGameServiceType(serviceType) {
  return (
    serviceType === "minecraft_server" ||
    serviceType === "fivem_server" ||
    Boolean(getGameServicePreset(serviceType))
  );
}
