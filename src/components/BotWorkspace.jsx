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
  formatCountdown,
  formatDate,
  formatDuration,
  formatNumber,
  fromDatetimeLocal,
  serviceJoinAddress,
  serviceTypeLabel,
  statusTheme,
  toDatetimeLocal
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
  return {
    name: service.name || "",
    description: service.description || "",
    language: service.language || "",
    minecraft_version: service.minecraft_version || "",
    entry_file: service.entry_file || "",
    start_command: service.start_command || "",
    expires_at: toDatetimeLocal(service.expires_at),
    auto_restart: Boolean(service.auto_restart),
    restart_delay: service.restart_delay ?? 5000,
    max_restarts: service.max_restarts ?? 5,
    ram_limit_mb: service.ram_limit_mb ?? 512,
    cpu_limit_percent: service.cpu_limit_percent ?? 35,
    accept_eula: Boolean(service.accept_eula),
    public_host: service.public_host || "",
    public_port: service.public_port ?? 25565
  };
}

export function BotWorkspace({ botId, onRefreshAll, onRefreshBots, onRefreshSystem }) {
  const navigate = useNavigate();
  const uploadInputRef = useRef(null);
  const archiveUpdateInputRef = useRef(null);

  const [bot, setBot] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [settings, setSettings] = useState(null);
  const [logs, setLogs] = useState({ combined: "" });
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
    if (activeTab !== "logs") {
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
  }, [activeTab, botId]);

  useEffect(() => {
    if (activeTab === "files") {
      openPath("");
    }
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
        expires_at: fromDatetimeLocal(settings.expires_at)
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
    const currentPath =
      filesData?.kind === "directory"
        ? filesData.path
        : filesData?.path?.split("/").slice(0, -1).join("/") || "";
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

    const targetPath =
      filesData?.kind === "directory"
        ? filesData.path
        : filesData?.path?.split("/").slice(0, -1).join("/") || "";
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
        command: consoleCommand
      });

      setConsoleResult(result);
      setMessage("Polecenie zostalo wykonane.");
    } catch (consoleError) {
      setError(consoleError.message);
    } finally {
      setActionState("");
    }
  }

  async function copyJoinAddress() {
    const joinAddress = serviceJoinAddress(bot);
    if (!isMinecraft || joinAddress === "Brak") {
      return;
    }

    try {
      await navigator.clipboard.writeText(joinAddress);
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
          : "Bot zostal zaktualizowany z nowego archiwum. .env zostal zachowany."
      );
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setActionState("");
      event.target.value = "";
    }
  }

  if (!bot || !settings) {
    return <div className="panel-card">Ladowanie workspace...</div>;
  }

  const isMinecraft = bot.service_type === "minecraft_server";
  const tabs = [
    { id: "overview", label: "Przeglad" },
    { id: "logs", label: "Logi" },
    { id: "console", label: "Konsola" },
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
                  : ".zip,.rar,application/zip,application/x-rar-compressed"
              }
              className="hidden-input"
              onChange={handleArchiveUpdate}
            />
            <StatusBadge status={bot.status} />
            {isMinecraft && serviceJoinAddress(bot) !== "Brak" ? (
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
              <span>{isMinecraft ? "Aktualizuj JAR/ZIP/RAR" : "Aktualizuj ZIP/RAR"}</span>
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
              <span>{isMinecraft ? "Przygotuj" : "Dependencies"}</span>
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
            hint={isMinecraft ? "Java + PM2" : "Discord + PM2"}
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
            label={isMinecraft ? "Adres graczy" : "Uptime"}
            value={isMinecraft ? serviceJoinAddress(bot) : formatDuration(bot.uptime_seconds)}
            hint={
              isMinecraft
                ? "Wymaga publicznego TCP dla portu gry"
                : `Restarty: ${bot.restart_count || 0}`
            }
          />
          <SummaryTile
            label={isMinecraft ? "EULA" : "RAM"}
            value={isMinecraft ? (bot.accept_eula ? "Zaakceptowana" : "Wymagana") : formatNumber(bot.ram_usage_mb, " MB")}
            hint={
              isMinecraft
                ? "Panel moze ustawic eula=true przed startem"
                : `Limit: ${formatNumber(bot.ram_limit_mb, " MB")}`
            }
          />
          <SummaryTile
            label={isMinecraft ? "RAM" : "CPU"}
            value={
              isMinecraft
                ? formatNumber(bot.ram_usage_mb, " MB")
                : formatNumber(bot.cpu_usage_percent, "%")
            }
            hint={
              isMinecraft
                ? `Limit: ${formatNumber(bot.ram_limit_mb, " MB")}`
                : `Limit: ${formatNumber(bot.cpu_limit_percent, "%")}`
            }
          />
          <SummaryTile
            label={isMinecraft ? "CPU" : "Wygasa za"}
            value={
              isMinecraft
                ? formatNumber(bot.cpu_usage_percent, "%")
                : formatCountdown(bot.expires_at)
            }
            hint={
              isMinecraft
                ? `Limit: ${formatNumber(bot.cpu_limit_percent, "%")}`
                : formatDate(bot.expires_at)
            }
          />
          <SummaryTile
            label={isMinecraft ? "Uptime" : "Stabilnosc"}
            value={isMinecraft ? formatDuration(bot.uptime_seconds) : bot.stability_status || "STOPPED"}
            hint={
              isMinecraft
                ? `Restarty: ${bot.restart_count || 0}`
                : bot.status_message || "Brak alertow"
            }
          />
          {isMinecraft ? (
            <SummaryTile
              label="Wygasa za"
              value={formatCountdown(bot.expires_at)}
              hint={formatDate(bot.expires_at)}
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
                ? "ByteHost moze sam pobrac oficjalny server.jar dla wybranej wersji Minecraft i zbudowac komende startowa dla Javy. Pola ponizej pozwalaja nadpisac wykrycie, jesli chcesz recznie wskazac launcher lub inna komende."
                : "ByteHost automatycznie wykrywa jezyk projektu, plik startowy i komende startowa po wrzuceniu ZIP lub RAR. Pola nizszej sekcji sa recznymi nadpisaniami, jesli auto-detect sie pomyli."}
            </div>

            <div className="info-card wide">
              {isMinecraft
                ? "Aktualizacja samym JAR-em podmienia silnik serwera bez czyszczenia swiata i pluginow. Wrzucenie ZIP lub RAR zastapi caly katalog uslugi, wiec traktuj to jak pelny reinstall serwera."
                : "Aktualizacja bota przez nowy ZIP lub RAR podmienia pliki projektu, zachowuje .env, odswieza auto-detekcje i moze automatycznie przeinstalowac zaleznosci oraz wznowic proces."}
            </div>

            {isMinecraft ? (
              <div className="info-card wide">
                Kazdy gracz wejdzie dopiero wtedy, gdy publiczny host i port gry rzeczywiscie beda
                wystawione na zewnatrz. Panel zapisuje ten adres dla operatora, ale nie zastapi
                przekierowania portu lub tunelu TCP do Minecrafta.
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
                disabled={isMinecraft}
                onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value }))}
              >
                <option value="Node.js">Node.js</option>
                <option value="TypeScript">TypeScript</option>
                <option value="Python">Python</option>
                <option value="Java">Java</option>
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
                value={settings.entry_file}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, entry_file: event.target.value }))
                }
              />
            </label>
            <label className="wide">
              Komenda startowa
              <input
                value={settings.start_command}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, start_command: event.target.value }))
                }
              />
            </label>
            <label>
              Wygasa o
              <input
                type="datetime-local"
                value={settings.expires_at}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, expires_at: event.target.value }))
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
              RAM limit (MB)
              <input
                type="number"
                value={settings.ram_limit_mb}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, ram_limit_mb: event.target.value }))
                }
              />
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
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, public_port: event.target.value }))
                    }
                  />
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
            <pre>{logs.combined || "Brak logow do wyswietlenia."}</pre>
          </div>
        ) : null}

        {activeTab === "console" ? (
          <div className="console-stack">
            <form className="console-form" onSubmit={runConsoleCommand}>
              <label className="wide">
                Konsola robocza uslugi
                <input
                  value={consoleCommand}
                  onChange={(event) => setConsoleCommand(event.target.value)}
                  placeholder={
                    isMinecraft
                      ? 'np. java -version, ls -la, cat server.properties'
                      : 'np. npm run lint, ls -la, python3 -V'
                  }
                />
              </label>
              <div className="form-actions wide">
                <button className="primary-button" type="submit" disabled={actionState === "console"}>
                  <Terminal size={16} />
                  <span>Wykonaj polecenie</span>
                </button>
              </div>
            </form>

            <div className="info-card">
              Konsola wykonuje polecenia w katalogu projektu uslugi. To nie jest stdin procesu PM2,
              tylko robocza konsola serwisowa do testow, npm, pip, javac i komend systemowych.
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
              <button className="ghost-button compact" onClick={() => uploadInputRef.current?.click()}>
                <Upload size={16} />
                <span>Upload</span>
              </button>
            </div>

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
