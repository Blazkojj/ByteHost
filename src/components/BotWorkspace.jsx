import { useEffect, useRef, useState } from "react";
import {
  Copy,
  FolderOpen,
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
import { useNavigate } from "react-router-dom";

import { api } from "../api";
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

function buildSettingsState(service) {
  const isMinecraft = service.service_type === "minecraft_server";
  const isFiveM = service.service_type === "fivem_server";

  return {
    name: service.name || "",
    description: service.description || "",
    language: service.language || "",
    minecraft_version: service.minecraft_version || "",
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
    public_port: service.public_port ?? (isMinecraft ? 25565 : isFiveM ? 30120 : "")
  };
}

export function BotWorkspace({ botId, user, onRefreshAll, onRefreshBots, onRefreshSystem }) {
  const navigate = useNavigate();
  const uploadInputRef = useRef(null);
  const archiveUpdateInputRef = useRef(null);
  const liveTerminalRef = useRef(null);

  const [bot, setBot] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
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
  const [installResult, setInstallResult] = useState(null);
  const [minecraftVersions, setMinecraftVersions] = useState([]);
  const [latestMinecraftRelease, setLatestMinecraftRelease] = useState("");
  const [uploadTargetPath, setUploadTargetPath] = useState("");

  const serviceType = bot?.service_type || "";
  const isMinecraft = serviceType === "minecraft_server";
  const isFiveM = serviceType === "fivem_server";
  const isGameService = isMinecraft || isFiveM;
  const canManagePublicPort = Boolean(user?.is_admin);

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
    const shouldStreamLogs =
      activeTab === "logs" || (activeTab === "console" && isGameService);

    if (!shouldStreamLogs) {
      return undefined;
    }

    let cancelled = false;

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

    loadLogs();
    const interval = window.setInterval(loadLogs, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
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
        }
      } catch (_error) {
        if (!cancelled) {
          setMinecraftVersions([]);
          setLatestMinecraftRelease("");
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
    setMessage("");
    setError("");

    try {
      if (type === "delete") {
        if (!window.confirm("Usunac te usluge razem z plikami i procesem PM2?")) {
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
      setMessage("Akcja zostala wykonana.");
    } catch (runError) {
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
      const payload = {
        ...settings,
        ram_limit_mb: gbInputToMb(settings.ram_limit_mb, settings.ram_limit_mb)
      };

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
    setActionState("console");
    setMessage("");
    setError("");

    try {
      const result = await api.runConsoleCommand(botId, {
        mode: isGameService ? "server" : "shell",
        command: consoleCommand
      });

      setConsoleResult(result);
      setConsoleCommand("");
      setMessage(
        isGameService
          ? "Polecenie zostalo wyslane do dzialajacego serwera."
          : "Polecenie zostalo wykonane."
      );
    } catch (consoleError) {
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
  const tabs = [
    { id: "overview", label: "Przeglad" },
    { id: "logs", label: "Logi" },
    { id: "console", label: "Konsola" },
    { id: "backups", label: "Backupy" },
    { id: "files", label: "Pliki" },
    { id: "env", label: ".env" }
  ];

  return (
    <div className="workspace-stack">
      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h3>{bot.name}</h3>
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
            {isGameService && joinAddress !== "Brak" ? (
              <button className="ghost-button" onClick={copyJoinAddress} disabled={actionState}>
                <Copy size={16} />
                <span>Kopiuj IP</span>
              </button>
            ) : null}
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
            <button className="ghost-button" onClick={() => runAction("start")} disabled={actionState}>
              <Play size={16} />
              <span>Start</span>
            </button>
            <button className="ghost-button" onClick={() => runAction("stop")} disabled={actionState}>
              <Square size={16} />
              <span>Stop</span>
            </button>
            <button className="ghost-button" onClick={() => runAction("restart")} disabled={actionState}>
              <RotateCcw size={16} />
              <span>Restart</span>
            </button>
            <button className="ghost-button" onClick={() => runAction("install")} disabled={actionState}>
              <Wrench size={16} />
              <span>{isMinecraft ? "Przygotuj" : isFiveM ? "Napraw runtime" : "Dependencies"}</span>
            </button>
            <button className="danger-button" onClick={() => runAction("delete")} disabled={actionState}>
              <Trash2 size={16} />
              <span>Usun</span>
            </button>
          </div>
        </div>

        <div className="summary-grid">
          <SummaryTile
            label="Typ"
            value={serviceTypeLabel(bot.service_type)}
            hint={isMinecraft ? "Java + PM2" : isFiveM ? "FXServer + PM2" : "Discord + PM2"}
          />
          {isMinecraft ? (
            <SummaryTile
              label="Wersja"
              value={bot.minecraft_version || bot.detected_minecraft_version || "Auto"}
              hint={
                bot.detected_minecraft_version
                  ? `Pobrana: ${bot.detected_minecraft_version}`
                  : "Ustaw wersje, aby panel pobral oficjalny server.jar"
              }
            />
          ) : null}
          {isFiveM ? (
            <SummaryTile
              label="Artefakt FiveM"
              value={bot.fivem_artifact_build || "Auto"}
              hint="Oficjalny Linux build FXServer"
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
            label={isMinecraft ? "EULA" : isFiveM ? "Sloty" : "RAM"}
            value={
              isMinecraft
                ? bot.accept_eula
                  ? "Zaakceptowana"
                  : "Wymagana"
                : isFiveM
                  ? formatNumber(bot.fivem_max_clients || 48)
                  : formatMemoryFromMb(bot.ram_usage_mb)
            }
            hint={
              isMinecraft
                ? "Panel moze ustawic eula=true przed startem"
                : isFiveM
                  ? "Limit graczy ustawiany w sv_maxclients"
                : `Limit: ${formatMemoryLimit(bot.ram_limit_mb)}`
            }
          />
          <SummaryTile
            label={isMinecraft || isFiveM ? "RAM" : "CPU"}
            value={
              isMinecraft || isFiveM
                ? formatMemoryFromMb(bot.ram_usage_mb)
                : formatNumber(bot.cpu_usage_percent, "%")
            }
            hint={
              isMinecraft || isFiveM
                ? `Limit: ${formatMemoryLimit(bot.ram_limit_mb)}`
                : `Limit: ${formatNumber(bot.cpu_limit_percent, "%")}`
            }
          />
          <SummaryTile
            label={isMinecraft || isFiveM ? "CPU" : "Storage"}
            value={
              isMinecraft || isFiveM
                ? formatNumber(bot.cpu_usage_percent, "%")
                : formatMemoryFromMb(bot.storage_usage_mb || 0)
            }
            hint={
              isMinecraft || isFiveM
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
            label={isMinecraft || isFiveM ? "Uptime" : "Stabilnosc"}
            value={
              isMinecraft || isFiveM ? formatDuration(bot.uptime_seconds) : bot.stability_status || "STOPPED"
            }
            hint={
              isMinecraft || isFiveM
                ? `Restarty: ${bot.restart_count || 0}`
                : bot.status_message || "Brak alertow"
            }
          />
          {isGameService ? (
            <SummaryTile
              label="Storage"
              value={formatMemoryFromMb(bot.storage_usage_mb || 0)}
              hint="Rozmiar plikow uslugi"
            />
          ) : null}
        </div>

        {message ? <div className="banner success">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      <section className="panel-card">
        <div className="tab-row">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
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
                : "ByteHost automatycznie wykrywa jezyk projektu, plik startowy i komende startowa po wrzuceniu ZIP lub RAR. Pola nizszej sekcji sa recznymi nadpisaniami, jesli auto-detect sie pomyli."}
            </div>

            <div className="info-card wide">
              {isMinecraft
                ? "Aktualizacja samym JAR-em podmienia silnik serwera bez czyszczenia swiata i pluginow. Wrzucenie ZIP lub RAR zastapi caly katalog uslugi, wiec traktuj to jak pelny reinstall serwera."
                : isFiveM
                  ? "ZIP lub RAR dla FiveM traktuj jako pakiet serwera albo resources. Panel zachowuje oficjalny runtime FXServer, a resources, pluginy i skrypty wgrywasz wygodnie przez File Manager do folderu resources/."
                : "Aktualizacja bota przez nowy ZIP lub RAR podmienia pliki projektu, zachowuje .env, odswieza auto-detekcje i moze automatycznie przeinstalowac zaleznosci oraz wznowic proces."}
            </div>

            {isGameService ? (
              <div className="info-card wide">
                {isMinecraft
                  ? "Kazdy gracz wejdzie dopiero wtedy, gdy publiczny host i port gry rzeczywiscie beda wystawione na zewnatrz. Panel zapisuje ten adres dla operatora, ale nie zastapi przekierowania portu lub tunelu TCP do Minecrafta."
                  : "FiveM dostaje automatyczny adres publiczny `IP:port`, ale port nadal musi byc przekierowany na routerze do VM z ByteHost. Panel nie moze sam skonfigurowac przekierowania w Twoim routerze."}
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
            <label>
              Jezyk
              <select
                value={settings.language}
                disabled={isMinecraft || isFiveM}
                onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value }))}
              >
                <option value="Node.js">Node.js</option>
                <option value="TypeScript">TypeScript</option>
                <option value="Python">Python</option>
                <option value="Java">Java</option>
                <option value="FiveM">FiveM</option>
              </select>
            </label>
            {isMinecraft ? (
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
            ) : null}
            <label>
              Plik startowy
              <input
                placeholder={isFiveM ? "run.sh" : undefined}
                value={settings.entry_file}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, entry_file: event.target.value }))
                }
              />
            </label>
            <label className="wide">
              Komenda startowa
              <input
                placeholder={isFiveM ? 'bash "run.sh" +exec "server.cfg"' : undefined}
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
            {isMinecraft ? (
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
                <label className="checkbox-field wide">
                  <input
                    type="checkbox"
                    checked={settings.accept_eula}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, accept_eula: event.target.checked }))
                    }
                  />
                  <span>Akceptuje Minecraft EULA i pozwalam panelowi ustawic eula=true</span>
                </label>
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
                <label>
                  Adres publiczny
                  <input
                    placeholder="Auto: publiczne IP hosta"
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
                      ? "Ten sam port musi byc przekierowany w routerze dla TCP i UDP. Jesli bedzie zajety, ByteHost znajdzie wolny."
                      : "Port jest przydzielany automatycznie. Zmienic go recznie moze tylko owner."}
                  </small>
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
            </div>
            <pre ref={liveTerminalRef}>{logs.combined || "Brak logow do wyswietlenia."}</pre>
          </div>
        ) : null}

        {activeTab === "console" ? (
          isGameService ? (
            <div className="console-stack">
              <form className="console-form" onSubmit={runConsoleCommand}>
                <label className="wide">
                  Prawdziwa konsola serwera
                  <input
                    value={consoleCommand}
                    onChange={(event) => setConsoleCommand(event.target.value)}
                    placeholder={
                      isMinecraft
                        ? "np. list, say Witaj, whitelist add Nick, stop"
                        : "np. say Witaj, refresh, ensure moj-zasob, stop"
                    }
                  />
                </label>
                <div className="form-actions wide">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={actionState === "console"}
                  >
                    <Terminal size={16} />
                    <span>Wyslij do serwera</span>
                  </button>
                </div>
              </form>

              <div className="info-card">
                Ta konsola wysyla komendy bezposrednio do dzialajacego serwera. Live output
                ponizej pokazuje stdout i stderr procesu, wiec zobaczysz dolaczenia graczy,
                bledy, komendy i odpowiedzi serwera tak jak w hostingu gier.
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
                </div>
                <pre ref={liveTerminalRef}>{logs.combined || "Brak logow do wyswietlenia."}</pre>
              </div>
            </div>
          ) : (
            <div className="console-stack">
              <form className="console-form" onSubmit={runConsoleCommand}>
                <label className="wide">
                  Konsola robocza uslugi
                  <input
                    value={consoleCommand}
                    onChange={(event) => setConsoleCommand(event.target.value)}
                    placeholder={"np. npm run lint, ls -la, python3 -V"}
                  />
                </label>
                <div className="form-actions wide">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={actionState === "console"}
                  >
                    <Terminal size={16} />
                    <span>Wykonaj polecenie</span>
                  </button>
                </div>
              </form>

              <div className="info-card">
                Konsola wykonuje polecenia w katalogu projektu uslugi. To nie jest stdin procesu
                PM2, tylko robocza konsola serwisowa do testow, npm, pip i komend systemowych.
              </div>

              <div className="terminal-card">
                <div className="terminal-header">
                  <Terminal size={16} />
                  <span>Output</span>
                </div>
                <pre>
                  {consoleResult
                    ? [
                        `$ ${consoleResult.command}`,
                        `cwd: ${consoleResult.cwd}`,
                        `exit code: ${consoleResult.code}`,
                        "",
                        consoleResult.stdout || "",
                        consoleResult.stderr ? `\n[stderr]\n${consoleResult.stderr}` : ""
                      ]
                        .filter(Boolean)
                        .join("\n")
                    : "Brak wykonanych polecen."}
                </pre>
              </div>
            </div>
          )
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
                  <button
                    className="ghost-button compact"
                    onClick={() => openManagedDirectory("resourcepacks")}
                  >
                    <FolderOpen size={16} />
                    <span>Resource packi</span>
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
                  <button
                    className="ghost-button compact"
                    onClick={() => triggerUploadTo("resourcepacks")}
                  >
                    <Upload size={16} />
                    <span>Wrzuc resource pack</span>
                  </button>
                </div>

                <div className="info-card">
                  Pluginy trafiaja do <strong>plugins/</strong>, mody do <strong>mods/</strong>, a
                  paczki zasobow do <strong>resourcepacks/</strong>. Jesli chcesz wymusic paczke
                  klientom, ustaw jeszcze odpowiednie pola resource-pack w{" "}
                  <strong>server.properties</strong>.
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

            {filesData?.kind === "directory" ? (
              <div className="directory-grid">
                <div className="directory-path">/{filesData.path || ""}</div>
                <div className="directory-list">
                  {filesData.entries.length === 0 ? (
                    <div className="empty-block">Folder jest pusty.</div>
                  ) : (
                    filesData.entries.map((entry) => (
                      <div key={entry.path} className="file-row">
                        <button className="file-link" onClick={() => openPath(entry.path)}>
                          {entry.type === "directory" ? "DIR" : "FILE"} {entry.name}
                        </button>
                        <div className="file-row-actions">
                          <span>{formatNumber(entry.size, " B")}</span>
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
            <pre>{installResult.stdout || installResult.stderr || installResult.message || "Brak outputu."}</pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}
