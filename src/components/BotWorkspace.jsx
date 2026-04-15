import { useEffect, useRef, useState } from "react";
import {
  Copy,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Square,
  Terminal,
  Trash2,
  Upload,
  Wrench
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../api";
import { MinecraftInstaller } from "./MinecraftInstaller";
import { getGameServicePreset, isGameServiceType } from "../gameServices";
import {
  formatDate,
  formatDuration,
  formatMemoryFromMb,
  formatMemoryLimit,
  formatNumber,
  gbInputToMb,
  mbToGbInput,
  serviceJoinAddress,
  serviceTypeLabel,
  statusTheme
} from "../utils";

function StatusBadge({ status }) {
  return <span className={`status-pill ${statusTheme[status] || "muted"}`}>{status}</span>;
}

function SummaryTile({ label, value, hint }) {
  return (
    <article className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function fileKindLabel(entry) {
  if (entry.type === "directory") {
    return "Folder";
  }

  const extension = String(entry.name || "").split(".").pop();
  if (!extension || extension === entry.name) {
    return "Plik";
  }

  return extension.toUpperCase();
}

const TERMINAL_EMPTY_TEXT = "Brak logow do wyswietlenia.";

const ACTION_PROGRESS_MESSAGES = {
  start: "Startowanie uslugi... ByteHost uruchamia proces.",
  stop: "Zatrzymywanie uslugi... ByteHost wysyla stop do procesu.",
  restart: "Restartowanie uslugi... ByteHost przeladowuje proces.",
  install: "Przygotowanie uslugi... ByteHost instaluje wymagane pliki.",
  delete: "Usuwanie uslugi... ByteHost sprzata proces i pliki.",
  console: "Wysylanie komendy do konsoli..."
};

const ACTION_SUCCESS_MESSAGES = {
  start: "Usluga zostala uruchomiona.",
  stop: "Usluga zostala zatrzymana.",
  restart: "Usluga zostala zrestartowana.",
  install: "Instalacja/przygotowanie zostalo zakonczone.",
  delete: "Usluga zostala usunieta.",
  console: "Komenda zostala wyslana."
};

const TERMINAL_STATUS_LABELS = {
  idle: "Offline",
  connecting: "Laczenie...",
  online: "Live",
  polling: "Fallback",
  error: "Blad"
};

const WORKSPACE_TAB_IDS = new Set([
  "overview",
  "logs",
  "console",
  "players",
  "installer",
  "backups",
  "files",
  "env"
]);

function readWorkspaceTabHash(hashValue = window.location.hash) {
  const tabId = String(hashValue || "").replace(/^#/, "");
  return WORKSPACE_TAB_IDS.has(tabId) ? tabId : "overview";
}

const FALLBACK_MINECRAFT_SERVER_TYPES = [
  { id: "vanilla", label: "Vanilla", hint: "Oficjalny server.jar od Mojang" },
  { id: "paper", label: "Paper", hint: "Pluginy Bukkit/Spigot/Paper" },
  { id: "spigot", label: "Spigot compatible", hint: "Pobiera Paper pod pluginy Spigot" },
  { id: "bukkit", label: "Bukkit / Spigot compatible", hint: "Pobiera Paper pod pluginy" },
  { id: "craftbukkit", label: "CraftBukkit compatible", hint: "Pobiera Paper pod pluginy Bukkit" },
  { id: "purpur", label: "Purpur", hint: "Fork Paper" },
  { id: "folia", label: "Folia", hint: "Eksperymentalny fork Paper" },
  { id: "fabric", label: "Fabric", hint: "Mody Fabric w mods/" },
  { id: "velocity", label: "Velocity proxy", hint: "Proxy Minecraft od PaperMC" },
  { id: "waterfall", label: "Waterfall proxy", hint: "Proxy kompatybilny z BungeeCord" },
  { id: "travertine", label: "Travertine proxy", hint: "Proxy dla starszych wersji Minecraft" }
];

function terminalLineTone(line) {
  const normalized = String(line || "").toLowerCase();

  if (normalized.includes("bytehost")) {
    return "bytehost";
  }

  if (/\b(error|fatal|failed|exception|crash|denied|timeout|nie udalo|blad)\b/.test(normalized)) {
    return "error";
  }

  if (/\b(warn|warning|uwaga|deprecated)\b/.test(normalized)) {
    return "warning";
  }

  if (/\b(info|online|started|listening|success|done|gotowe|running)\b/.test(normalized)) {
    return "success";
  }

  if (normalized.includes("[console]") || normalized.startsWith(">") || normalized.startsWith("$ ")) {
    return "console";
  }

  return "default";
}

function TerminalOutput({ content, emptyText = TERMINAL_EMPTY_TEXT, containerRef }) {
  const text = String(content || "").trimEnd() || emptyText;
  const lines = text.split(/\r?\n/).slice(-1000);

  return (
    <div className="terminal-output" ref={containerRef}>
      {lines.map((line, index) => (
        <div
          className={`terminal-line ${terminalLineTone(line)}`}
          key={`${index}-${line.slice(0, 24)}`}
        >
          <span className="terminal-prompt">&gt;</span>
          <span className="terminal-text">{line || " "}</span>
        </div>
      ))}
    </div>
  );
}

function buildSettingsState(service) {
  const isMinecraft = service.service_type === "minecraft_server";
  const isFiveM = service.service_type === "fivem_server";
  const gamePreset = getGameServicePreset(service.service_type);
  const defaultGameEngine = gamePreset?.engineOptions?.[0]?.id || "";

  return {
    name: service.name || "",
    description: service.description || "",
    background_url: service.background_url || "",
    subdomain: service.subdomain || "",
    language: service.language || "",
    minecraft_version: service.minecraft_version || "",
    minecraft_server_type: service.minecraft_server_type || "vanilla",
    minecraft_max_players: service.minecraft_max_players ?? 20,
    game_engine: service.game_engine || defaultGameEngine,
    fivem_license_key: service.fivem_license_key || "",
    fivem_max_clients: service.fivem_max_clients ?? 48,
    fivem_project_name: service.fivem_project_name || service.name || "",
    fivem_tags: service.fivem_tags || "default",
    fivem_locale: service.fivem_locale || "pl-PL",
    fivem_onesync_enabled:
      service.fivem_onesync_enabled === undefined ? true : Boolean(service.fivem_onesync_enabled),
    entry_file: service.entry_file || "",
    start_command: service.start_command || "",
    auto_restart: Boolean(service.auto_restart),
    restart_delay: service.restart_delay ?? 5000,
    max_restarts: service.max_restarts ?? 5,
    ram_limit_mb: mbToGbInput(service.ram_limit_mb ?? 512, "0.5"),
    cpu_limit_percent: service.cpu_limit_percent ?? 35,
    accept_eula: Boolean(service.accept_eula),
    public_host: service.public_host || "",
    public_port:
      service.public_port ?? (isMinecraft ? 25565 : isFiveM ? 30120 : gamePreset?.defaultPort || "")
  };
}

export function BotWorkspace({ botId, user, onRefreshAll, onRefreshBots, onRefreshSystem }) {
  const navigate = useNavigate();
  const location = useLocation();
  const uploadInputRef = useRef(null);
  const archiveUpdateInputRef = useRef(null);
  const liveTerminalRef = useRef(null);
  const terminalSocketRef = useRef(null);

  const [bot, setBot] = useState(null);
  const [activeTab, setActiveTab] = useState(readWorkspaceTabHash);
  const [settings, setSettings] = useState(null);
  const [logs, setLogs] = useState({ combined: "" });
  const [backups, setBackups] = useState([]);
  const [backupName, setBackupName] = useState("");
  const [filesData, setFilesData] = useState(null);
  const [editorContent, setEditorContent] = useState("");
  const [envContent, setEnvContent] = useState("");
  const [consoleCommand, setConsoleCommand] = useState("");
  const [consoleResult, setConsoleResult] = useState(null);
  const [actionState, setActionState] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [terminalStatus, setTerminalStatus] = useState("idle");
  const [installResult, setInstallResult] = useState(null);
  const [minecraftVersions, setMinecraftVersions] = useState([]);
  const [latestMinecraftRelease, setLatestMinecraftRelease] = useState("");
  const [minecraftServerTypes, setMinecraftServerTypes] = useState(FALLBACK_MINECRAFT_SERVER_TYPES);
  const [uploadTargetPath, setUploadTargetPath] = useState("");

  const serviceType = bot?.service_type || "";
  const isMinecraft = serviceType === "minecraft_server";
  const isFiveM = serviceType === "fivem_server";
  const gamePreset = getGameServicePreset(serviceType);
  const isGameService = isGameServiceType(serviceType);
  const canManagePublicPort = Boolean(user?.is_admin);
  const canEditProvisioning = Boolean(user?.is_admin);

  useEffect(() => {
    async function loadBot() {
      try {
        const nextBot = await api.getBot(botId);
        setBot(nextBot);
        setSettings(buildSettingsState(nextBot));
      } catch (loadError) {
        setError(loadError.message);
      }
    }

    setMessage("");
    setError("");
    setInstallResult(null);
    setConsoleResult(null);
    setFilesData(null);
    setLogs({ combined: "" });
    loadBot();
  }, [botId]);

  useEffect(() => {
    setActiveTab(readWorkspaceTabHash(location.hash));
  }, [botId, location.hash]);

  useEffect(() => {
    function syncActiveTabFromHash() {
      setActiveTab(readWorkspaceTabHash());
    }

    window.addEventListener("hashchange", syncActiveTabFromHash);
    return () => window.removeEventListener("hashchange", syncActiveTabFromHash);
  }, []);

  useEffect(() => {
    const shouldStreamLogs =
      activeTab === "logs" ||
      activeTab === "console" ||
      (isGameService && (activeTab === "console" || activeTab === "players"));

    if (!shouldStreamLogs) {
      setTerminalStatus("idle");
      return undefined;
    }

    let cancelled = false;
    let fallbackInterval = null;
    const socket = new WebSocket(api.getTerminalSocketUrl(botId));
    terminalSocketRef.current = socket;
    setTerminalStatus("connecting");

    async function loadLogs() {
      try {
        const nextLogs = await api.getLogs(botId);
        if (!cancelled) {
          setLogs(nextLogs);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    function startPollingFallback() {
      if (cancelled || fallbackInterval) {
        return;
      }

      setTerminalStatus("polling");
      loadLogs();
      fallbackInterval = window.setInterval(loadLogs, 3000);
    }

    socket.addEventListener("open", () => {
      if (!cancelled) {
        setTerminalStatus("online");
      }
    });

    socket.addEventListener("message", (event) => {
      let payload = null;

      try {
        payload = JSON.parse(event.data);
      } catch (_error) {
        return;
      }

      if (payload.type === "logs" && payload.logs) {
        setLogs(payload.logs);
        return;
      }

      if (payload.type === "command-result") {
        setConsoleResult(payload.result);
        setMessage("Polecenie zostalo wyslane do dzialajacej uslugi.");
        setActionState("");
        return;
      }

      if (payload.type === "command-error" || payload.type === "error") {
        setMessage("");
        setActionState("");
        setError(payload.message || "Terminal zwrocil blad.");
      }
    });

    socket.addEventListener("error", () => {
      if (!cancelled) {
        setTerminalStatus("error");
      }
    });

    socket.addEventListener("close", () => {
      if (terminalSocketRef.current === socket) {
        terminalSocketRef.current = null;
      }

      if (!cancelled) {
        startPollingFallback();
      }
    });

    return () => {
      cancelled = true;
      setTerminalStatus("idle");
      if (fallbackInterval) {
        window.clearInterval(fallbackInterval);
      }

      if (terminalSocketRef.current === socket) {
        terminalSocketRef.current = null;
      }

      socket.close();
    };
  }, [activeTab, botId, isGameService]);

  useEffect(() => {
    if (!liveTerminalRef.current) {
      return;
    }

    liveTerminalRef.current.scrollTop = liveTerminalRef.current.scrollHeight;
  }, [activeTab, logs.combined]);

  useEffect(() => {
    if (activeTab === "files") {
      openPath("");
    }
  }, [activeTab, botId]);

  useEffect(() => {
    if (activeTab === "installer" && bot && !isMinecraft) {
      setActiveTab("overview");
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (activeTab === "players" && bot && !isGameService) {
      setActiveTab("overview");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [activeTab, bot, isGameService, isMinecraft]);

  useEffect(() => {
    if (activeTab !== "backups") {
      return undefined;
    }

    let cancelled = false;

    async function loadBackups() {
      try {
        const nextBackups = await api.getBotBackups(botId);
        if (!cancelled) {
          setBackups(nextBackups);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    loadBackups();

    return () => {
      cancelled = true;
    };
  }, [activeTab, botId]);

  useEffect(() => {
    if (activeTab !== "env") {
      return;
    }

    async function loadEnv() {
      try {
        const envFile = await api.getFiles(botId, ".env");
        setEnvContent(envFile.content || "");
      } catch (_error) {
        setEnvContent("");
      }
    }

    loadEnv();
  }, [activeTab, botId]);

  useEffect(() => {
    let cancelled = false;

    async function loadVersions() {
      try {
        const payload = await api.getMinecraftVersions();
        if (!cancelled) {
          setMinecraftVersions(payload.versions || []);
          setLatestMinecraftRelease(payload.latest_release || "");
          setMinecraftServerTypes(payload.server_types?.length ? payload.server_types : FALLBACK_MINECRAFT_SERVER_TYPES);
        }
      } catch (_error) {
        if (!cancelled) {
          setMinecraftVersions([]);
          setLatestMinecraftRelease("");
          setMinecraftServerTypes(FALLBACK_MINECRAFT_SERVER_TYPES);
        }
      }
    }

    if (bot?.service_type === "minecraft_server") {
      loadVersions();
    }

    return () => {
      cancelled = true;
    };
  }, [bot?.service_type]);

  async function refreshDetail() {
    const nextBot = await api.getBot(botId);
    setBot(nextBot);
    setSettings(buildSettingsState(nextBot));
    await onRefreshBots();
    await onRefreshSystem();
  }

  async function refreshBackups() {
    const nextBackups = await api.getBotBackups(botId);
    setBackups(nextBackups);
    return nextBackups;
  }

  async function runAction(type) {
    setActionState(type);
    setMessage(ACTION_PROGRESS_MESSAGES[type] || "Wykonywanie akcji...");
    setError("");

    try {
      if (type === "delete") {
        if (!window.confirm("Usunac te usluge razem z plikami i procesem PM2?")) {
          setMessage("");
          return;
        }

        await api.deleteBot(botId);
        await onRefreshAll();
        navigate("/bots");
        return;
      }

      if (type === "install") {
        const result = await api.installBot(botId);
        setInstallResult(result.install);
        setBot(result.bot);
      } else {
        const actionMap = {
          start: api.startBot,
          stop: api.stopBot,
          restart: api.restartBot
        };

        setBot(await actionMap[type](botId));
      }

      await onRefreshAll();
      setMessage(ACTION_SUCCESS_MESSAGES[type] || "Akcja zostala wykonana.");
    } catch (runError) {
      setMessage("");
      setError(runError.message);
    } finally {
      setActionState("");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setActionState("save-settings");
    setMessage("");
    setError("");

    try {
      const payload = canEditProvisioning
        ? {
            ...settings,
            ram_limit_mb: gbInputToMb(settings.ram_limit_mb, settings.ram_limit_mb)
          }
        : {
            name: settings.name,
            description: settings.description
          };

      if (canEditProvisioning && !isGameService) {
        payload.background_url = "";
        payload.subdomain = "";
      }

      const updatedBot = await api.updateBot(botId, payload);
      setBot(updatedBot);
      setSettings(buildSettingsState(updatedBot));
      await onRefreshAll();
      setMessage("Ustawienia uslugi zostaly zapisane.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setActionState("");
    }
  }

  async function openPath(relativePath) {
    try {
      const nextFileState = await api.getFiles(botId, relativePath);
      setFilesData(nextFileState);
      if (nextFileState.kind === "file") {
        setEditorContent(nextFileState.content || "");
      }
    } catch (openError) {
      setError(openError.message);
    }
  }

  function getCurrentDirectoryPath() {
    if (!filesData) {
      return "";
    }

    if (filesData.kind === "directory") {
      return filesData.path || "";
    }

    return filesData.path?.split("/").slice(0, -1).join("/") || "";
  }

  async function ensureDirectory(relativePath) {
    if (!relativePath) {
      return;
    }

    await api.createFile(botId, {
      type: "folder",
      path: relativePath
    });
  }

  async function openManagedDirectory(relativePath) {
    try {
      await ensureDirectory(relativePath);
      await openPath(relativePath);
    } catch (directoryError) {
      setError(directoryError.message);
    }
  }

  async function triggerUploadTo(relativePath = "") {
    try {
      if (relativePath) {
        await ensureDirectory(relativePath);
      }

      setUploadTargetPath(relativePath);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
        uploadInputRef.current.click();
      }
    } catch (uploadError) {
      setError(uploadError.message);
    }
  }

  async function saveCurrentFile() {
    if (!filesData || filesData.kind !== "file") {
      return;
    }

    setActionState("save-file");

    try {
      const updated = await api.updateFile(botId, {
        path: filesData.path,
        content: editorContent
      });
      setFilesData(updated);
      setMessage("Plik zostal zapisany.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setActionState("");
    }
  }

  async function createEntry(type) {
    const currentPath = getCurrentDirectoryPath();
    const name = window.prompt(type === "folder" ? "Nazwa folderu" : "Nazwa pliku");

    if (!name) {
      return;
    }

    const nextPath = currentPath ? `${currentPath}/${name}` : name;

    try {
      await api.createFile(botId, {
        type,
        path: nextPath,
        content: type === "file" ? "" : undefined
      });
      await openPath(type === "folder" ? nextPath : currentPath);
      setMessage(type === "folder" ? "Folder zostal utworzony." : "Plik zostal utworzony.");
    } catch (createError) {
      setError(createError.message);
    }
  }

  async function removeEntry(relativePath) {
    if (!window.confirm(`Usunac ${relativePath}?`)) {
      return;
    }

    try {
      const nextState = await api.deleteFile(botId, relativePath);
      setFilesData(nextState);
      setMessage("Element zostal usuniety.");
    } catch (removeError) {
      setError(removeError.message);
    }
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const targetPath = uploadTargetPath || getCurrentDirectoryPath();
    const formData = new FormData();

    formData.append("target_path", targetPath);
    files.forEach((file) => formData.append("files", file));

    try {
      const nextState = await api.uploadFiles(botId, formData);
      setFilesData(nextState);
      setMessage("Pliki zostaly wyslane.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      event.target.value = "";
      setUploadTargetPath("");
    }
  }

  async function saveEnv() {
    setActionState("save-env");

    try {
      await api.updateEnv(botId, envContent);
      setMessage("Plik .env zostal zapisany.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setActionState("");
    }
  }

  async function runConsoleCommand(event) {
    event.preventDefault();
    await sendConsoleText(consoleCommand);
  }

  async function sendConsoleText(command) {
    const normalizedCommand = String(command || "").trim();
    if (!normalizedCommand) {
      setError("Podaj polecenie do wyslania.");
      return;
    }

    setActionState("console");
    setMessage(ACTION_PROGRESS_MESSAGES.console);
    setError("");

    const terminalSocket = terminalSocketRef.current;

    if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
      try {
        terminalSocket.send(
          JSON.stringify({
            type: "command",
            mode: "server",
            command: normalizedCommand
          })
        );
      } catch (socketError) {
        setMessage("");
        setActionState("");
        setError(socketError.message || "Nie udalo sie wyslac komendy do live terminala.");
        return;
      }

      setLogs((current) => ({
        ...current,
        combined: [current.combined?.trimEnd(), `[console] > ${normalizedCommand}`]
          .filter(Boolean)
          .join("\n")
      }));
      setConsoleResult({
        mode: "server",
        cwd: bot?.project_path,
        command: normalizedCommand,
        sent: true,
        sent_at: new Date().toISOString()
      });
      setConsoleCommand("");
      return;
    }

    try {
      const result = await api.runConsoleCommand(botId, {
        mode: "server",
        command: normalizedCommand
      });

      setConsoleResult(result);
      setConsoleCommand("");
      setMessage("Polecenie zostalo wyslane do dzialajacej uslugi.");
    } catch (consoleError) {
      setMessage("");
      setError(consoleError.message);
    } finally {
      setActionState("");
    }
  }

  async function copyJoinAddress() {
    const joinAddress = serviceJoinAddress(bot);
    if (!isGameService || joinAddress === "Brak") {
      return;
    }

    try {
      const rawHost = String(bot.public_host || "");
      const host =
        rawHost.includes(":") && !rawHost.startsWith("[") ? `[${rawHost}]` : rawHost;
      const defaultPort = bot.service_type === "minecraft_server" ? 25565 : 30120;
      const copyAddress = `${host}:${bot.public_port || defaultPort}`;

      await navigator.clipboard.writeText(copyAddress);
      setMessage("Adres serwera zostal skopiowany.");
      setError("");
    } catch (_error) {
      setError("Nie udalo sie skopiowac adresu serwera.");
    }
  }

  async function handleArchiveUpdate(event) {
    const archive = event.target.files?.[0];
    if (!archive) {
      return;
    }

    setActionState("update-archive");
    setMessage("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("archive", archive);
      formData.append("preserve_env", bot?.service_type === "minecraft_server" ? "false" : "true");
      formData.append(
        "reinstall_dependencies",
        bot?.service_type === "minecraft_server" ? "false" : "true"
      );
      formData.append("restart_after_update", "true");

      const result = await api.updateBotArchive(botId, formData);
      setBot(result.bot);
      setSettings(buildSettingsState(result.bot));
      if (result.install) {
        setInstallResult(result.install);
      }
      await onRefreshAll();
      setMessage(
        bot?.service_type === "minecraft_server"
          ? "Serwer Minecraft zostal zaktualizowany. Sam JAR podmienia silnik bez czyszczenia swiata, a ZIP/RAR podmienia caly katalog uslugi."
          : bot?.service_type === "fivem_server"
            ? "Serwer FiveM zostal odswiezony. ByteHost zachowal oficjalny runtime FXServer i nalozyl nowy pakiet ZIP/RAR z resources/modami/pluginami na swiezy workspace."
          : "Bot zostal zaktualizowany z nowego archiwum. .env zostal zachowany."
      );
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setActionState("");
      event.target.value = "";
    }
  }

  async function handleCreateBackup(event) {
    event.preventDefault();
    setActionState("create-backup");
    setMessage("");
    setError("");

    try {
      const result = await api.createBotBackup(botId, {
        name: backupName
      });
      setBackups(result.backups || []);
      setBackupName("");
      setMessage("Backup zostal utworzony.");
      await onRefreshSystem();
    } catch (backupError) {
      setError(backupError.message);
    } finally {
      setActionState("");
    }
  }

  async function handleRestoreBackup(backup) {
    if (!window.confirm(`Przywroc backup "${backup.name}"?`)) {
      return;
    }

    setActionState(`restore-backup:${backup.id}`);
    setMessage("");
    setError("");

    try {
      const result = await api.restoreBotBackup(botId, backup.id, {});
      setBot(result.bot);
      setSettings(buildSettingsState(result.bot));
      setBackups(result.backups || []);
      setFilesData(null);
      setLogs({ combined: "" });
      setConsoleResult(null);
      setInstallResult(null);
      await onRefreshAll();
      setMessage(`Backup "${backup.name}" zostal przywrocony.`);
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setActionState("");
    }
  }

  async function handleDeleteBackup(backup) {
    if (!window.confirm(`Usunac backup "${backup.name}"?`)) {
      return;
    }

    setActionState(`delete-backup:${backup.id}`);
    setMessage("");
    setError("");

    try {
      const result = await api.deleteBotBackup(botId, backup.id);
      setBackups(result.backups || []);
      setMessage("Backup zostal usuniety.");
      await onRefreshSystem();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setActionState("");
    }
  }

  if (!bot || !settings) {
    return <div className="panel-card">Ladowanie workspace...</div>;
  }

  const joinAddress = serviceJoinAddress(bot);
  const playerQuickCommands = isMinecraft
    ? ["list", "whitelist list"]
    : isFiveM
      ? ["status", "players"]
      : gamePreset
        ? ["status", "players", "list"]
        : [];
  const tabs = [
    { id: "overview", label: "Przeglad" },
    { id: "logs", label: "Logi" },
    { id: "console", label: "Konsola" },
    ...(isGameService ? [{ id: "players", label: "Gracze" }] : []),
    ...(isMinecraft ? [{ id: "installer", label: "Instalator" }] : []),
    { id: "backups", label: "Backupy" },
    { id: "files", label: "Pliki" },
    { id: "env", label: ".env" }
  ];
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Przeglad";
  const isCompactWorkspace = activeTab !== "overview";

  return (
    <div className="workspace-stack">
      <section className={`panel-card ${isCompactWorkspace ? "workspace-compact-card" : ""}`}>
        <div className="section-header">
          <div>
            <p className="eyebrow">{isCompactWorkspace ? activeTabLabel : "Workspace"}</p>
            <h3>{bot.name}</h3>
            {isCompactWorkspace ? (
              <small className="workspace-context">
                Czysty widok zakladki z podstawowym sterowaniem usluga.
              </small>
            ) : null}
          </div>

          <div className="workspace-actions">
            <input
              ref={archiveUpdateInputRef}
              type="file"
              accept={
                isMinecraft
                  ? ".jar,.zip,.rar,application/java-archive,application/x-java-archive,application/zip,application/x-rar-compressed"
                  : isFiveM
                    ? ".zip,.rar,application/zip,application/x-rar-compressed"
                  : ".zip,.rar,application/zip,application/x-rar-compressed"
              }
              className="hidden-input"
              onChange={handleArchiveUpdate}
            />
            <StatusBadge status={bot.status} />
            {!isCompactWorkspace && isGameService && joinAddress !== "Brak" ? (
              <button className="ghost-button" onClick={copyJoinAddress} disabled={actionState}>
                <Copy size={16} />
                <span>Kopiuj IP</span>
              </button>
            ) : null}
            {!isCompactWorkspace ? (
              <button
                className="ghost-button"
                onClick={() => archiveUpdateInputRef.current?.click()}
                disabled={actionState}
              >
                <Upload size={16} />
                <span>
                  {isMinecraft ? "Aktualizuj JAR/ZIP/RAR" : "Aktualizuj ZIP/RAR"}
                </span>
              </button>
            ) : null}
            <button className="ghost-button" onClick={() => runAction("start")} disabled={actionState}>
              <Play size={16} />
              <span>{actionState === "start" ? "Startuje..." : "Start"}</span>
            </button>
            <button className="ghost-button" onClick={() => runAction("stop")} disabled={actionState}>
              <Square size={16} />
              <span>{actionState === "stop" ? "Zatrzymuje..." : "Stop"}</span>
            </button>
            <button className="ghost-button" onClick={() => runAction("restart")} disabled={actionState}>
              <RotateCcw size={16} />
              <span>{actionState === "restart" ? "Restartuje..." : "Restart"}</span>
            </button>
            {!isCompactWorkspace ? (
              <>
                <button className="ghost-button" onClick={() => runAction("install")} disabled={actionState}>
                  <Wrench size={16} />
                  <span>
                    {actionState === "install"
                      ? "Instaluje..."
                      : isMinecraft
                        ? "Przygotuj"
                        : isFiveM
                          ? "Napraw runtime"
                          : gamePreset
                            ? gamePreset.installLabel
                            : "Dependencies"}
                  </span>
                </button>
                <button className="danger-button" onClick={() => runAction("delete")} disabled={actionState}>
                  <Trash2 size={16} />
                  <span>{actionState === "delete" ? "Usuwam..." : "Usun"}</span>
                </button>
              </>
            ) : null}
          </div>
        </div>

        {!isCompactWorkspace ? (
          <div className="summary-grid">
          <SummaryTile
            label="Typ"
            value={serviceTypeLabel(bot.service_type)}
            hint={
              isMinecraft
                ? "Java + PM2"
                : isFiveM
                  ? "FXServer + PM2"
                  : gamePreset
                    ? `${gamePreset.language} + PM2`
                : "Discord + PM2"
            }
          />
          {isMinecraft ? (
            <SummaryTile
              label="Wersja"
              value={bot.minecraft_version || bot.detected_minecraft_version || "Auto"}
              hint={
                bot.detected_minecraft_version
                  ? `Pobrana: ${bot.detected_minecraft_version}`
                  : "Ustaw wersje, aby panel pobral server.jar"
              }
            />
          ) : null}
          {isMinecraft ? (
            <SummaryTile
              label="Silnik"
              value={
                minecraftServerTypes.find((type) => type.id === (bot.minecraft_server_type || "vanilla"))
                  ?.label || bot.minecraft_server_type || "Vanilla"
              }
              hint="Vanilla, Paper, Spigot/Bukkit, Purpur, Folia, Fabric i proxy PaperMC"
            />
          ) : null}
          {isFiveM ? (
            <SummaryTile
              label="Artefakt FiveM"
              value={bot.fivem_artifact_build || "Auto"}
              hint="Oficjalny Linux build FXServer"
            />
          ) : null}
          {gamePreset?.engineOptions?.length ? (
            <SummaryTile
              label="Silnik"
              value={
                gamePreset.engineOptions.find((engine) => engine.id === bot.game_engine)?.label ||
                gamePreset.engineOptions[0].label
              }
              hint={
                gamePreset.engineOptions.find((engine) => engine.id === bot.game_engine)?.hint ||
                "Wariant zapisany w .bytehost/game.env"
              }
            />
          ) : null}
          <SummaryTile
            label="Jezyk"
            value={bot.language || "Auto"}
            hint={`Auto: ${bot.detected_language || "brak"}`}
          />
          <SummaryTile
            label="Plik startowy"
            value={bot.entry_file || "Brak"}
            hint={`Auto: ${bot.detected_entry_file || "brak"}`}
          />
          <SummaryTile
            label="Komenda"
            value={bot.start_command || "Brak"}
            hint={`Auto: ${bot.detected_start_command || "brak"}`}
          />
          <SummaryTile
            label={isGameService ? "Adres graczy" : "Uptime"}
            value={isGameService ? joinAddress : formatDuration(bot.uptime_seconds)}
            hint={
              isGameService
                ? "Wymaga publicznego przekierowania portu na routerze"
                : `Restarty: ${bot.restart_count || 0}`
            }
          />
          <SummaryTile
            label={isGameService ? "Sloty" : "RAM"}
            value={
              isMinecraft
                ? formatNumber(bot.minecraft_max_players || 20)
                : isFiveM
                  ? formatNumber(bot.fivem_max_clients || 48)
                  : gamePreset
                    ? formatNumber(gamePreset.maxPlayers)
                  : formatMemoryFromMb(bot.ram_usage_mb)
            }
            hint={
              isMinecraft
                ? "EULA akceptowana automatycznie przez ByteHost"
                : isFiveM
                  ? "Limit graczy ustawiany w sv_maxclients"
                  : gamePreset
                    ? "Domyslnie w .bytehost/game.env"
                  : `Limit: ${formatMemoryLimit(bot.ram_limit_mb)}`
            }
          />
          <SummaryTile
            label={isGameService ? "RAM" : "CPU"}
            value={
              isGameService
                ? formatMemoryFromMb(bot.ram_usage_mb)
                : formatNumber(bot.cpu_usage_percent, "%")
            }
            hint={
              isGameService
                ? `Limit: ${formatMemoryLimit(bot.ram_limit_mb)}`
                : `Limit: ${formatNumber(bot.cpu_limit_percent, "%")}`
            }
          />
          <SummaryTile
            label={isGameService ? "CPU" : "Storage"}
            value={
              isGameService
                ? formatNumber(bot.cpu_usage_percent, "%")
                : formatMemoryFromMb(bot.storage_usage_mb || 0)
            }
            hint={
              isGameService
                ? `Limit: ${formatNumber(bot.cpu_limit_percent, "%")}`
                : "Rozmiar plikow uslugi"
            }
          />
          {isFiveM ? (
            <SummaryTile
              label="OneSync"
              value={bot.fivem_onesync_enabled ? "Wlaczone" : "Wylaczone"}
              hint={bot.fivem_project_name || "Panel zarzadza blokiem server.cfg"}
            />
          ) : null}
          <SummaryTile
            label={isGameService ? "Uptime" : "Stabilnosc"}
            value={
              isGameService ? formatDuration(bot.uptime_seconds) : bot.stability_status || "STOPPED"
            }
            hint={
              isGameService
                ? `Restarty: ${bot.restart_count || 0}`
                : bot.status_message || "Brak alertow"
            }
          />
          {isGameService && bot.subdomain ? (
            <SummaryTile label="Subdomena" value={bot.subdomain} hint="Zapisana w ByteHost" />
          ) : null}
          {isGameService ? (
            <SummaryTile
              label="Storage"
              value={formatMemoryFromMb(bot.storage_usage_mb || 0)}
              hint="Rozmiar plikow uslugi"
            />
          ) : null}
          </div>
        ) : null}

        {message ? <div className={`banner ${actionState ? "info" : "success"}`}>{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      <section className={`panel-card ${activeTab === "files" ? "files-panel-card" : ""}`}>
        <div className="server-section-bar">
          <div>
            <p className="eyebrow">{activeTab === "files" ? "File manager" : "Panel serwera"}</p>
            <h3>{activeTabLabel}</h3>
          </div>
          <button className="ghost-button compact" onClick={refreshDetail}>
            <RefreshCw size={16} />
            <span>Sync</span>
          </button>
        </div>

        {activeTab === "overview" ? (
          <form className="form-grid" onSubmit={saveSettings}>
            <div className="info-card wide">
              {isMinecraft
                ? "ByteHost moze sam pobrac oficjalny server.jar dla wybranej wersji Minecraft, ustawic port w server.properties i zbudowac komende startowa dla Javy. Pola ponizej pozwalaja nadpisac wykrycie, jesli chcesz recznie wskazac launcher lub inna komende."
                : isFiveM
                  ? "ByteHost pobiera oficjalny artefakt FXServer dla Linuxa, generuje zarzadzany blok server.cfg i ustawia podstawowe komendy startowe. Ponizej mozesz ustawic sloty, OneSync, licencje i publiczny port."
                  : gamePreset
                    ? `${gamePreset.label} ma wlasny workspace z install-server.sh, start-server.sh i folderami pod mody/pluginy. Kliknij Reinstall dependencies, zeby pobrac lub naprawic pliki serwera.`
                : "ByteHost automatycznie wykrywa jezyk projektu, plik startowy i komende startowa po wrzuceniu ZIP lub RAR. Pola nizszej sekcji sa recznymi nadpisaniami, jesli auto-detect sie pomyli."}
            </div>

            <div className="info-card wide">
              {isMinecraft
                ? "Aktualizacja samym JAR-em podmienia silnik serwera bez czyszczenia swiata i pluginow. Wrzucenie ZIP lub RAR zastapi caly katalog uslugi, wiec traktuj to jak pelny reinstall serwera."
                : isFiveM
                  ? "ZIP lub RAR dla FiveM traktuj jako pakiet serwera albo resources. Panel zachowuje oficjalny runtime FXServer, a resources, pluginy i skrypty wgrywasz wygodnie przez File Manager do folderu resources/."
                  : gamePreset
                    ? "ZIP lub RAR dla tej gry moze zawierac dodatki, pluginy, konfiguracje albo gotowe pliki serwera. Wgrywanie przez File Manager jest najbezpieczniejsze dla pojedynczych modow."
                : "Aktualizacja bota przez nowy ZIP lub RAR podmienia pliki projektu, zachowuje .env, odswieza auto-detekcje i moze automatycznie przeinstalowac zaleznosci oraz wznowic proces."}
            </div>

            {isGameService ? (
              <div className="info-card wide">
                {isMinecraft
                  ? "Kazdy gracz wejdzie dopiero wtedy, gdy publiczny host i port gry rzeczywiscie beda wystawione na zewnatrz. Panel zapisuje ten adres dla operatora, ale nie zastapi przekierowania portu lub tunelu TCP do Minecrafta."
                  : "Serwer gry dostaje automatyczny adres publiczny `IP:port`, ale port nadal musi byc przekierowany na routerze do VM z ByteHost. Panel nie moze sam skonfigurowac przekierowania w Twoim routerze."}
              </div>
            ) : null}

            <label>
              Nazwa
              <input
                value={settings.name}
                onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              Typ uslugi
              <input value={serviceTypeLabel(bot.service_type)} disabled />
            </label>
            <label className="wide">
              Opis
              <input
                value={settings.description}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            {canEditProvisioning ? (
              <>
                {isGameService ? (
                  <>
                    <label>
                      Subdomena
                      <input
                        placeholder="np. mc.bytehost.online"
                        value={settings.subdomain}
                        onChange={(event) =>
                          setSettings((current) => ({ ...current, subdomain: event.target.value }))
                        }
                      />
                      <small>Panel zapisuje subdomene przy usludze. Rekord DNS ustawisz osobno.</small>
                    </label>
                    <label>
                      Tlo serwera
                      <input
                        placeholder="https://..."
                        value={settings.background_url}
                        onChange={(event) =>
                          setSettings((current) => ({ ...current, background_url: event.target.value }))
                        }
                      />
                      <small>URL obrazka widocznego na karcie serwera.</small>
                    </label>
                  </>
                ) : null}
                <label>
                  Jezyk
                  <select
                    value={settings.language}
                    disabled={isMinecraft || isFiveM || Boolean(gamePreset)}
                    onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value }))}
                  >
                    <option value="Node.js">Node.js</option>
                    <option value="TypeScript">TypeScript</option>
                    <option value="Python">Python</option>
                    <option value="Java">Java</option>
                    <option value="FiveM">FiveM</option>
                    <option value="SteamCMD">SteamCMD</option>
                    <option value="Terraria">Terraria</option>
                  </select>
                </label>
                {isMinecraft ? (
                  <>
                    <label>
                      Silnik serwera
                      <select
                        value={settings.minecraft_server_type}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            minecraft_server_type: event.target.value
                          }))
                        }
                      >
                        {minecraftServerTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <small>
                        {minecraftServerTypes.find((type) => type.id === settings.minecraft_server_type)?.hint ||
                          "ByteHost pobierze odpowiedni server.jar."}
                      </small>
                    </label>
                    <label>
                      Wersja Minecraft
                      <input
                        list="workspace-minecraft-version-list"
                        placeholder={latestMinecraftRelease || "np. 1.21.5"}
                        value={settings.minecraft_version}
                        onChange={(event) =>
                          setSettings((current) => ({ ...current, minecraft_version: event.target.value }))
                        }
                      />
                      <datalist id="workspace-minecraft-version-list">
                        {minecraftVersions.map((version) => (
                          <option key={version.id} value={version.id}>
                            {version.id}
                          </option>
                        ))}
                      </datalist>
                      <small>
                        Po zapisaniu ByteHost pobierze oficjalny server.jar dla tej wersji. Puste pole
                        oznacza, ze pozostawiasz wlasny JAR albo aktualnie pobrana wersje.
                      </small>
                    </label>
                    <label>
                      Sloty graczy
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={settings.minecraft_max_players}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            minecraft_max_players: event.target.value
                          }))
                        }
                      />
                      <small>Maksymalna liczba graczy online na serwerze Minecraft.</small>
                    </label>
                  </>
                ) : null}
                {gamePreset?.engineOptions?.length ? (
                  <label>
                    Silnik / wariant gry
                    <select
                      value={settings.game_engine}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          game_engine: event.target.value
                        }))
                      }
                    >
                      {gamePreset.engineOptions.map((engine) => (
                        <option key={engine.id} value={engine.id}>
                          {engine.label}
                        </option>
                      ))}
                    </select>
                    <small>
                      {gamePreset.engineOptions.find((engine) => engine.id === settings.game_engine)?.hint ||
                        "ByteHost zapisze wariant w .bytehost/game.env."}
                    </small>
                  </label>
                ) : null}
                <label>
                  Plik startowy
                  <input
                    placeholder={isFiveM ? "run.sh" : gamePreset ? gamePreset.entryFile : undefined}
                    value={settings.entry_file}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, entry_file: event.target.value }))
                    }
                  />
                </label>
                <label className="wide">
                  Komenda startowa
                  <input
                    placeholder={
                      isFiveM
                        ? 'bash "run.sh" +exec "server.cfg"'
                        : gamePreset
                          ? gamePreset.startCommand
                        : undefined
                    }
                    value={settings.start_command}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, start_command: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Restart delay
                  <input
                    type="number"
                    value={settings.restart_delay}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, restart_delay: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Max restarts
                  <input
                    type="number"
                    value={settings.max_restarts}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, max_restarts: event.target.value }))
                    }
                  />
                </label>
                <label>
                  RAM limit (GB)
                  <input
                    type="number"
                    step="0.25"
                    value={settings.ram_limit_mb}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, ram_limit_mb: event.target.value }))
                    }
                  />
                  <small>Wpisz w GB. ByteHost zapisze to jako MB po stronie backendu.</small>
                </label>
                <label>
                  CPU limit (%)
                  <input
                    type="number"
                    value={settings.cpu_limit_percent}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, cpu_limit_percent: event.target.value }))
                    }
                  />
                </label>
                {isGameService ? (
                  <>
                    <label>
                      Adres publiczny
                      <input
                        placeholder="mc.twojadomena.pl"
                        value={settings.public_host}
                        onChange={(event) =>
                          setSettings((current) => ({ ...current, public_host: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Port publiczny
                      <input
                        type="number"
                        value={settings.public_port}
                        disabled={!canManagePublicPort}
                        onChange={(event) =>
                          setSettings((current) => ({ ...current, public_port: event.target.value }))
                        }
                      />
                      <small>
                        {canManagePublicPort
                          ? "Jesli wybrany port jest zajety, ByteHost automatycznie przydzieli wolny."
                          : "Port jest przydzielany automatycznie. Zmienic go recznie moze tylko owner."}
                      </small>
                    </label>
                    {isMinecraft ? (
                      <div className="info-card wide">
                        ByteHost akceptuje Minecraft EULA automatycznie przy starcie serwera.
                      </div>
                    ) : null}
                  </>
                ) : null}
                {isFiveM ? (
                  <>
                <label>
                  Klucz FiveM
                  <input
                    placeholder="sv_licenseKey z portal.cfx.re"
                    value={settings.fivem_license_key}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        fivem_license_key: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Sloty graczy
                  <input
                    type="number"
                    min="1"
                    max="128"
                    value={settings.fivem_max_clients}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        fivem_max_clients: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Projekt FiveM
                  <input
                    value={settings.fivem_project_name}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        fivem_project_name: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Tagi
                  <input
                    value={settings.fivem_tags}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        fivem_tags: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Locale
                  <input
                    value={settings.fivem_locale}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        fivem_locale: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="checkbox-field wide">
                  <input
                    type="checkbox"
                    checked={settings.fivem_onesync_enabled}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        fivem_onesync_enabled: event.target.checked
                      }))
                    }
                  />
                  <span>Wlacz OneSync</span>
                </label>
                  </>
                ) : null}
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={settings.auto_restart}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, auto_restart: event.target.checked }))
                    }
                  />
                  <span>Auto restart aktywny</span>
                </label>
              </>
            ) : (
              <div className="info-card wide">
                Parametry hostingu, RAM, CPU, port, silnik i komenda startowa sa ustawiane przez ownera.
                Na tym koncie mozesz zmienic tylko nazwe oraz opis uslugi.
              </div>
            )}
            <div className="form-actions wide">
              <button className="primary-button" type="submit" disabled={actionState === "save-settings"}>
                <Save size={16} />
                <span>Zapisz ustawienia</span>
              </button>
            </div>
          </form>
        ) : null}

        {activeTab === "logs" ? (
          <div className="terminal-card">
            <div className="terminal-header">
              <Terminal size={16} />
              <span>Live logs</span>
              <span className={`terminal-live-pill ${terminalStatus}`}>
                {TERMINAL_STATUS_LABELS[terminalStatus] || terminalStatus}
              </span>
            </div>
            <TerminalOutput content={logs.combined} containerRef={liveTerminalRef} />
          </div>
        ) : null}

        {activeTab === "console" ? (
          <div className="console-stack">
            <form className="console-form" onSubmit={runConsoleCommand}>
              <label className="wide">
                {isGameService ? "Prawdziwa konsola serwera" : "Prawdziwa konsola procesu"}
                <input
                  value={consoleCommand}
                  onChange={(event) => setConsoleCommand(event.target.value)}
                  placeholder={
                    isMinecraft
                      ? "np. list, say Witaj, whitelist add Nick, stop"
                      : isFiveM
                        ? "np. status, say Witaj, refresh, ensure moj-zasob"
                        : gamePreset
                          ? "np. status, players, list, save"
                          : "stdin procesu, np. help albo komenda obslugiwana przez bota"
                  }
                />
              </label>
              <div className="form-actions wide">
                <button className="primary-button" type="submit" disabled={actionState === "console"}>
                  <Terminal size={16} />
                  <span>Wyslij do konsoli</span>
                </button>
              </div>
            </form>

            <div className="info-card">
              Ta konsola laczy sie z dzialajacym procesem przez live terminal. Output ponizej
              pokazuje stdout/stderr PM2, a pole komendy wysyla tekst do stdin procesu. Dla botow
              Discord komenda zadziala wtedy, gdy sam bot czyta stdin, ale logi sa live tak samo
              jak przy serwerach gier.
            </div>

            {consoleResult?.mode === "server" ? (
              <div className="info-card">
                Ostatnio wyslano: <strong>{consoleResult.command}</strong>
              </div>
            ) : null}

            <div className="terminal-card">
              <div className="terminal-header">
                <Terminal size={16} />
                <span>Live console</span>
                <span className={`terminal-live-pill ${terminalStatus}`}>
                  {TERMINAL_STATUS_LABELS[terminalStatus] || terminalStatus}
                </span>
              </div>
              <TerminalOutput content={logs.combined} containerRef={liveTerminalRef} />
            </div>
          </div>
        ) : null}

        {activeTab === "players" && isGameService ? (
          <div className="workspace-stack">
            <div className="info-card wide">
              Player manager korzysta z prawdziwej konsoli serwera. Kliknij szybka komende, a
              wynik pojawi sie w live console/logach tak jak w Pterodactylu. Dla gier SteamCMD
              dokladne komendy zaleza od silnika i pluginow RCON.
            </div>
            <div className="file-actions">
              {playerQuickCommands.map((command) => (
                <button
                  key={command}
                  className="ghost-button compact"
                  onClick={() => sendConsoleText(command)}
                  disabled={actionState === "console"}
                >
                  <Terminal size={16} />
                  <span>{command}</span>
                </button>
              ))}
            </div>
            <form className="console-form" onSubmit={runConsoleCommand}>
              <label className="wide">
                Komenda gracza / administracji
                <input
                  value={consoleCommand}
                  onChange={(event) => setConsoleCommand(event.target.value)}
                  placeholder={
                    isMinecraft
                      ? "np. kick Nick, ban Nick, op Nick"
                      : isFiveM
                        ? "np. status, clientkick ID powod"
                        : "np. status, players, list"
                  }
                />
              </label>
              <button className="primary-button" type="submit" disabled={actionState === "console"}>
                <Terminal size={16} />
                <span>Wyslij</span>
              </button>
            </form>
            <div className="terminal-card">
              <div className="terminal-header">
                <Terminal size={16} />
                <span>Live console</span>
                <span className={`terminal-live-pill ${terminalStatus}`}>
                  {TERMINAL_STATUS_LABELS[terminalStatus] || terminalStatus}
                </span>
              </div>
              <TerminalOutput content={logs.combined} containerRef={liveTerminalRef} />
            </div>
          </div>
        ) : null}

        {activeTab === "installer" && isMinecraft ? (
          <MinecraftInstaller
            botId={botId}
            bot={bot}
            onInstalled={async (result) => {
              if (result?.bot) {
                setBot(result.bot);
                setSettings(buildSettingsState(result.bot));
              }
              await onRefreshAll();
            }}
          />
        ) : null}

        {activeTab === "backups" ? (
          <div className="workspace-stack">
            <form className="form-grid" onSubmit={handleCreateBackup}>
              <div className="info-card wide">
                Backup tworzy realny snapshot katalogu uslugi w `storage/backups`. Backupy licza
                sie do storage i mozesz je potem przywrocic albo usunac z panelu.
              </div>
              <label className="wide">
                Nazwa backupu
                <input
                  value={backupName}
                  placeholder="np. przed aktualizacja"
                  onChange={(event) => setBackupName(event.target.value)}
                />
              </label>
              <div className="form-actions wide">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={refreshBackups}
                  disabled={Boolean(actionState)}
                >
                  <RefreshCw size={16} />
                  <span>Odswiez liste</span>
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={actionState === "create-backup"}
                >
                  <Save size={16} />
                  <span>Utworz backup</span>
                </button>
              </div>
            </form>

            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nazwa</th>
                    <th>Utworzono</th>
                    <th>Rozmiar</th>
                    <th>Status z chwili backupu</th>
                    <th>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-state">
                        Brak backupow dla tej uslugi.
                      </td>
                    </tr>
                  ) : (
                    backups.map((backup) => (
                      <tr key={backup.id}>
                        <td>{backup.name}</td>
                        <td>{formatDate(backup.created_at)}</td>
                        <td>{formatMemoryFromMb(backup.size_mb)}</td>
                        <td>{backup.source_status || "OFFLINE"}</td>
                        <td>
                          <div className="workspace-actions">
                            <button
                              className="ghost-button compact"
                              type="button"
                              onClick={() => handleRestoreBackup(backup)}
                              disabled={actionState === `restore-backup:${backup.id}`}
                            >
                              <RotateCcw size={14} />
                              <span>Przywroc</span>
                            </button>
                            <button
                              className="danger-button compact"
                              type="button"
                              onClick={() => handleDeleteBackup(backup)}
                              disabled={actionState === `delete-backup:${backup.id}`}
                            >
                              <Trash2 size={14} />
                              <span>Usun</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "files" ? (
          <div className="file-manager">
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden-input"
              onChange={handleUpload}
            />

            <div className="file-actions">
              <button className="ghost-button compact" onClick={() => openPath("")}>
                <FolderOpen size={16} />
                <span>Root</span>
              </button>
              <button className="ghost-button compact" onClick={() => createEntry("file")}>
                <Save size={16} />
                <span>Nowy plik</span>
              </button>
              <button className="ghost-button compact" onClick={() => createEntry("folder")}>
                <FolderOpen size={16} />
                <span>Nowy folder</span>
              </button>
              <button className="ghost-button compact" onClick={() => triggerUploadTo("")}>
                <Upload size={16} />
                <span>Upload</span>
              </button>
            </div>

            {isMinecraft ? (
              <>
                <div className="file-actions">
                  <button
                    className="ghost-button compact"
                    onClick={() => openManagedDirectory("plugins")}
                  >
                    <FolderOpen size={16} />
                    <span>Pluginy</span>
                  </button>
                  <button className="ghost-button compact" onClick={() => openManagedDirectory("mods")}>
                    <FolderOpen size={16} />
                    <span>Mody</span>
                  </button>
                  <button className="ghost-button compact" onClick={() => openManagedDirectory("config")}>
                    <FolderOpen size={16} />
                    <span>Config modow</span>
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => openManagedDirectory("resourcepacks")}
                  >
                    <FolderOpen size={16} />
                    <span>Resource packi</span>
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => openManagedDirectory("world/datapacks")}
                  >
                    <FolderOpen size={16} />
                    <span>Datapacki</span>
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => openManagedDirectory("shaderpacks")}
                  >
                    <FolderOpen size={16} />
                    <span>Shadery</span>
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => openPath("server.properties")}
                  >
                    <Save size={16} />
                    <span>server.properties</span>
                  </button>
                </div>

                <div className="file-actions">
                  <button
                    className="ghost-button compact"
                    onClick={() => triggerUploadTo("plugins")}
                  >
                    <Upload size={16} />
                    <span>Wrzuc plugin</span>
                  </button>
                  <button className="ghost-button compact" onClick={() => triggerUploadTo("mods")}>
                    <Upload size={16} />
                    <span>Wrzuc mod</span>
                  </button>
                  <button className="ghost-button compact" onClick={() => triggerUploadTo("config")}>
                    <Upload size={16} />
                    <span>Wrzuc config</span>
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => triggerUploadTo("resourcepacks")}
                  >
                    <Upload size={16} />
                    <span>Wrzuc resource pack</span>
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => triggerUploadTo("world/datapacks")}
                  >
                    <Upload size={16} />
                    <span>Wrzuc datapack</span>
                  </button>
                </div>

                <div className="info-card">
                  Pluginy trafiaja do <strong>plugins/</strong>, mody do <strong>mods/</strong>, a
                  paczki zasobow do <strong>resourcepacks/</strong>. Pliki .jar sa binarne, wiec
                  panel pozwala je otworzyc, usunac albo podmienic, a edycje tekstowa robisz na
                  plikach configow, JSON, TOML, YAML i server.properties.
                </div>
              </>
            ) : null}

            {isFiveM ? (
              <>
                <div className="file-actions">
                  <button
                    className="ghost-button compact"
                    onClick={() => openManagedDirectory("resources")}
                  >
                    <FolderOpen size={16} />
                    <span>Resources</span>
                  </button>
                  <button className="ghost-button compact" onClick={() => openPath("server.cfg")}>
                    <Save size={16} />
                    <span>server.cfg</span>
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => triggerUploadTo("resources/[bytehost]")}
                  >
                    <Upload size={16} />
                    <span>Wrzuc resource</span>
                  </button>
                </div>

                <div className="info-card">
                  Zasoby FiveM wrzucaj do <strong>resources/</strong>. ByteHost nie usuwa Twoich
                  dodatkow przy zwyklej pracy panelu, a serwer mozna potem dolaczyc do{" "}
                  <strong>ensure</strong> w <strong>server.cfg</strong>.
                </div>
              </>
            ) : null}

            {gamePreset ? (
              <>
                <div className="file-actions">
                  {gamePreset.addonFolders.map((folder) => (
                    <button
                      key={folder.path}
                      className="ghost-button compact"
                      onClick={() => openManagedDirectory(folder.path)}
                    >
                      <FolderOpen size={16} />
                      <span>{folder.label}</span>
                    </button>
                  ))}
                  <button
                    className="ghost-button compact"
                    onClick={() => openManagedDirectory(".bytehost")}
                  >
                    <Save size={16} />
                    <span>game.env</span>
                  </button>
                </div>

                <div className="file-actions">
                  {gamePreset.addonFolders.map((folder) => (
                    <button
                      key={`upload-${folder.path}`}
                      className="ghost-button compact"
                      onClick={() => triggerUploadTo(folder.path)}
                    >
                      <Upload size={16} />
                      <span>Wrzuc do {folder.label}</span>
                    </button>
                  ))}
                </div>

                <div className="info-card">
                  {gamePreset.label} ma gotowe foldery pod dodatki. Konfiguracje portu, slotow i
                  nazwy serwera znajdziesz w <strong>.bytehost/game.env</strong>, a pliki gry
                  pobierasz przyciskiem <strong>{gamePreset.installLabel}</strong>.
                </div>
              </>
            ) : null}

            {filesData?.kind === "directory" ? (
              <div className="directory-grid file-browser">
                <div className="file-browser-header">
                  <div>
                    <p className="eyebrow">Biezacy folder</p>
                    <div className="directory-path">
                      <Home size={15} />
                      <span>/{filesData.path || "home/container"}</span>
                    </div>
                  </div>
                  <span className="file-count">
                    {(filesData.entries || []).length} elementow
                  </span>
                </div>
                <div className="directory-list">
                  {(filesData.entries || []).length === 0 ? (
                    <div className="empty-block">Folder jest pusty.</div>
                  ) : (
                    (filesData.entries || []).map((entry) => (
                      <div
                        key={entry.path}
                        className={`file-row ${entry.type === "directory" ? "is-folder" : "is-file"}`}
                      >
                        <button className="file-link" onClick={() => openPath(entry.path)}>
                          <span
                            className={`file-icon ${entry.type === "directory" ? "folder" : "file"}`}
                          >
                            {entry.type === "directory" ? (
                              <Folder size={18} />
                            ) : (
                              <FileText size={18} />
                            )}
                          </span>
                          <span className="file-name-stack">
                            <strong>{entry.name}</strong>
                            <small>{entry.type === "directory" ? "Folder projektu" : entry.path}</small>
                          </span>
                        </button>
                        <div className="file-row-actions">
                          <span className="file-kind-pill">{fileKindLabel(entry)}</span>
                          <span className="file-size">
                            {entry.type === "directory" ? "-" : formatFileSize(entry.size)}
                          </span>
                          <button className="icon-button" onClick={() => removeEntry(entry.path)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {filesData?.kind === "file" ? (
              <div className="editor-shell">
                <div className="editor-toolbar">
                  <button
                    className="ghost-button compact"
                    onClick={() => openPath(filesData.path.split("/").slice(0, -1).join("/"))}
                  >
                    <FolderOpen size={16} />
                    <span>Powrot</span>
                  </button>
                  <strong>{filesData.path}</strong>
                  <div className="editor-toolbar-actions">
                    <button className="ghost-button compact" onClick={() => removeEntry(filesData.path)}>
                      <Trash2 size={14} />
                      <span>Usun</span>
                    </button>
                    <button className="primary-button compact" onClick={saveCurrentFile}>
                      <Save size={14} />
                      <span>Zapisz</span>
                    </button>
                  </div>
                </div>
                {filesData.is_text ? (
                  <textarea
                    className="code-editor"
                    value={editorContent}
                    onChange={(event) => setEditorContent(event.target.value)}
                  />
                ) : (
                  <div className="empty-block">Plik binarny nie jest edytowalny w panelu.</div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "env" ? (
          <div className="editor-shell">
            <div className="editor-toolbar">
              <strong>.env</strong>
              <button className="primary-button compact" onClick={saveEnv} disabled={actionState === "save-env"}>
                <Save size={14} />
                <span>Zapisz .env</span>
              </button>
            </div>
            <textarea
              className="code-editor"
              value={envContent}
              onChange={(event) => setEnvContent(event.target.value)}
              placeholder="TOKEN=..."
            />
          </div>
        ) : null}
      </section>

      {installResult ? (
        <section className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Install output</p>
              <h3>{installResult.command || "Brak komendy"}</h3>
            </div>
          </div>
          <div className="terminal-card">
            <TerminalOutput
              content={installResult.stdout || installResult.stderr || installResult.message}
              emptyText="Brak outputu."
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
