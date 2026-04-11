import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Upload } from "lucide-react";

import { api } from "../api";
import { BotWorkspace } from "../components/BotWorkspace";
import {
  GAME_SERVICE_PRESETS,
  GAME_SERVICE_TYPES,
  getGameServicePreset,
  isGameServiceType
} from "../gameServices";
import {
  formatLimitValue,
  hasVisibleAccountPlan,
  formatMemoryFromMb,
  formatMemoryLimit,
  formatNumber,
  gbInputToMb,
  serviceArtifactLabel,
  serviceTypeLabel
} from "../utils";

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

function CreateBotPanel({ open, system, user, onClose, onCreated }) {
  const [form, setForm] = useState({
    service_type: "discord_bot",
    name: "",
    description: "",
    language: "",
    minecraft_version: "",
    minecraft_server_type: "vanilla",
    minecraft_max_players: 20,
    game_engine: "",
    fivem_license_key: "",
    fivem_max_clients: 48,
    fivem_project_name: "",
    fivem_tags: "default",
    fivem_locale: "pl-PL",
    fivem_onesync_enabled: true,
    entry_file: "",
    start_command: "",
    auto_restart: true,
    restart_delay: 5000,
    max_restarts: 5,
    ram_limit_mb: "0.5",
    cpu_limit_percent: 35,
    install_on_create: false,
    accept_eula: true,
    public_host: "",
    public_port: 25565,
    background_url: "",
    subdomain: ""
  });
  const [archive, setArchive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [minecraftVersions, setMinecraftVersions] = useState([]);
  const [latestMinecraftRelease, setLatestMinecraftRelease] = useState("");
  const [minecraftServerTypes, setMinecraftServerTypes] = useState(FALLBACK_MINECRAFT_SERVER_TYPES);

  const isMinecraft = form.service_type === "minecraft_server";
  const isFiveM = form.service_type === "fivem_server";
  const selectedGamePreset = getGameServicePreset(form.service_type);
  const isGameService = isGameServiceType(form.service_type);

  useEffect(() => {
    if (open) {
      setError("");
    }
  }, [open]);

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

    if (open && isMinecraft) {
      loadVersions();
    }

    return () => {
      cancelled = true;
    };
  }, [open, isMinecraft]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = new FormData();

      Object.entries(form).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) {
          payload.append(
            key,
            key === "ram_limit_mb" ? String(gbInputToMb(value, value)) : String(value)
          );
        }
      });

      if (archive) {
        payload.append("archive", archive);
      }

      const bot = await api.createBot(payload);
      setArchive(null);
      onCreated(bot);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card large">
        <div className="section-header">
          <div>
            <p className="eyebrow">Nowa usluga</p>
            <h3>
              {isMinecraft
                ? "Dodaj serwer Minecraft"
                : isFiveM
                  ? "Dodaj serwer FiveM"
                  : selectedGamePreset
                    ? `Dodaj ${selectedGamePreset.label}`
                  : "Dodaj bota Discord"}
            </h3>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Zamknij
          </button>
        </div>

        <div className="info-card">
          {isMinecraft
            ? "ByteHost wykrywa plik JAR serwera i przygotowuje komende startowa dla Javy. Plik jest opcjonalny przy tworzeniu: panel moze najpierw utworzyc pusty workspace Minecraft, a JAR dodasz pozniej. Publiczny host moze ustawic sie automatycznie na Twoje IP, a EULA jest akceptowana automatycznie."
            : isFiveM
              ? "ByteHost sam pobiera oficjalny artefakt FXServer oraz bazowe cfx-server-data. ZIP albo RAR jest opcjonalny i sluzy do nalozenia gotowego pakietu resources/modow/pluginow na swiezy serwer."
              : selectedGamePreset
                ? selectedGamePreset.hint
            : "ByteHost automatycznie wykrywa plik startowy i komende startowa po wrzuceniu archiwum. Pola ponizej sa opcjonalne i sluza do recznego poprawienia wykrycia."}
        </div>

        {isGameService ? (
          <div className="info-card">
            {isMinecraft
              ? "Panel moze sam ustawic adres publiczny jako `publiczne_IP[:port]`. Jesli port Minecraft jest zajety, ByteHost sam dobierze wolny. Owner moze go zmienic recznie, a zwykly uzytkownik dostaje port automatycznie."
              : "Panel automatycznie generuje adres publiczny jako `publiczne_IP:port`. Jesli port gry jest zajety, ByteHost sam dobierze wolny. Owner moze go zmienic recznie, a zwykly uzytkownik dostaje port automatycznie."}
          </div>
        ) : null}

        {!user?.is_admin ? (
          <div className="info-card">
            Twoj plan: {system?.usage?.bots || 0}/{formatLimitValue(system?.limits?.max_bots)} uslug, RAM{" "}
            {formatMemoryFromMb(system?.usage?.ram_mb || 0)}/
            {formatMemoryLimit(system?.limits?.ram_limit_mb || 0)}, CPU{" "}
            {system?.usage?.cpu_percent || 0}/{formatLimitValue(system?.limits?.cpu_limit_percent, "%")},
            storage {system?.usage?.storage_mb || 0}/{formatLimitValue(system?.limits?.storage_limit_mb, " MB")}.
          </div>
        ) : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Typ uslugi
            <select
              value={form.service_type}
              onChange={(event) =>
                setForm((current) => {
                  const nextServiceType = event.target.value;
                  const nextGamePreset = getGameServicePreset(nextServiceType);
                  const currentEntryFile = current.entry_file || "";
                  const currentStartCommand = current.start_command || "";

                  return nextServiceType === "minecraft_server"
                      ? {
                          ...current,
                          service_type: nextServiceType,
                          language: "Java",
                          entry_file: currentEntryFile.toLowerCase().endsWith(".jar")
                            ? currentEntryFile
                            : "server.jar",
                          start_command:
                            currentStartCommand === 'bash "start-server.sh"'
                              ? ""
                              : currentStartCommand,
                          minecraft_version: current.minecraft_version || "",
                          minecraft_server_type: current.minecraft_server_type || "vanilla",
                          minecraft_max_players: current.minecraft_max_players || 20,
                          game_engine: "",
                          install_on_create: false,
                          public_port: current.public_port || 25565
                        }
                    : nextServiceType === "fivem_server"
                      ? {
                          ...current,
                          service_type: nextServiceType,
                          language: "FiveM",
                          entry_file:
                            currentEntryFile &&
                            currentEntryFile !== "server.jar" &&
                            currentEntryFile !== "start-server.sh"
                              ? currentEntryFile
                              : "run.sh",
                          minecraft_version: "",
                          minecraft_server_type: "vanilla",
                          minecraft_max_players: 20,
                          game_engine: "",
                          install_on_create: false,
                          public_port: current.public_port || 30120
                        }
                    : nextGamePreset
                      ? {
                          ...current,
                          service_type: nextServiceType,
                          language: nextGamePreset.language,
                          entry_file: nextGamePreset.entryFile,
                          start_command: nextGamePreset.startCommand,
                          minecraft_version: "",
                          minecraft_server_type: "vanilla",
                          minecraft_max_players: 20,
                          game_engine: nextGamePreset.engineOptions?.[0]?.id || "",
                          install_on_create: false,
                          public_port: current.public_port || nextGamePreset.defaultPort
                        }
                    : {
                        ...current,
                        service_type: nextServiceType,
                        language:
                          current.language === "Java" ||
                          current.language === "FiveM" ||
                          current.language === "SteamCMD" ||
                          current.language === "Terraria"
                            ? ""
                            : current.language,
                        minecraft_version: "",
                        minecraft_server_type: "vanilla",
                        minecraft_max_players: 20,
                        game_engine: "",
                        entry_file:
                          current.entry_file === "server.jar" ||
                          current.entry_file === "start-server.sh"
                            ? ""
                            : current.entry_file,
                        start_command:
                          current.start_command === 'bash "start-server.sh"'
                            ? ""
                            : current.start_command
                      };
                })
              }
            >
              <option value="discord_bot">Bot Discord</option>
              <option value="minecraft_server">Serwer Minecraft</option>
              <option value="fivem_server">Serwer FiveM</option>
              {GAME_SERVICE_TYPES.map((serviceType) => (
                <option key={serviceType} value={serviceType}>
                  {GAME_SERVICE_PRESETS[serviceType].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nazwa
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="wide">
            Opis
            <input
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="wide upload-dropzone">
            <span>{serviceArtifactLabel(form.service_type)}</span>
            <input
              type="file"
              accept={
                isMinecraft
                  ? ".jar,.zip,.rar,application/java-archive,application/x-java-archive,application/zip,application/x-rar-compressed"
                  : isFiveM || selectedGamePreset
                    ? ".zip,.rar,application/zip,application/x-rar-compressed"
                  : ".zip,.rar,application/zip,application/x-rar-compressed"
              }
              onChange={(event) => setArchive(event.target.files?.[0] || null)}
            />
            <small>
              {archive
                ? archive.name
                : isMinecraft
                  ? "Opcjonalne. Mozesz utworzyc pusty serwer i dodac JAR pozniej albo od razu wrzucic JAR/ZIP/RAR."
                  : isFiveM
                    ? "Opcjonalne. Bez pliku ByteHost postawi czysty FiveM z oficjalnym FXServerem i cfx-server-data. ZIP/RAR nalozy Twoje resources/mods/pluginy na gotowy runtime."
                    : selectedGamePreset
                      ? "Opcjonalne. Bez pliku ByteHost utworzy workspace i skrypty instalacji, a dodatki wrzucisz pozniej przez manager plikow."
                  : "Mozesz dodac plik teraz lub utworzyc pusty workspace."}
            </small>
          </label>
          <label>
            Jezyk projektu
            <select
              value={form.language}
              disabled={isMinecraft || isFiveM || Boolean(selectedGamePreset)}
              onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
            >
              <option value="">Auto detect</option>
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
                  value={form.minecraft_server_type}
                  onChange={(event) =>
                    setForm((current) => ({
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
                  {minecraftServerTypes.find((type) => type.id === form.minecraft_server_type)?.hint ||
                    "ByteHost pobierze odpowiedni server.jar."}
                </small>
              </label>
              <label>
                Wersja Minecraft
                <input
                  list="minecraft-version-list"
                  placeholder={latestMinecraftRelease || "np. 1.21.5"}
                  value={form.minecraft_version}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minecraft_version: event.target.value }))
                  }
                />
                <datalist id="minecraft-version-list">
                  {minecraftVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.id}
                    </option>
                  ))}
                </datalist>
                <small>
                  Puste pole oznacza automatyczne pobranie najnowszej oficjalnej wersji
                  {latestMinecraftRelease ? ` (${latestMinecraftRelease})` : ""}.
                </small>
              </label>
              <label>
                Sloty graczy
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={form.minecraft_max_players}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      minecraft_max_players: event.target.value
                    }))
                  }
                />
                <small>Maksymalna liczba graczy online na serwerze.</small>
              </label>
            </>
          ) : null}
          {selectedGamePreset?.engineOptions?.length ? (
            <label>
              Silnik / wariant gry
              <select
                value={form.game_engine || selectedGamePreset.engineOptions[0].id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    game_engine: event.target.value
                  }))
                }
              >
                {selectedGamePreset.engineOptions.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.label}
                  </option>
                ))}
              </select>
              <small>
                {selectedGamePreset.engineOptions.find(
                  (engine) => engine.id === (form.game_engine || selectedGamePreset.engineOptions[0].id)
                )?.hint || "ByteHost zapisze wariant w .bytehost/game.env."}
              </small>
            </label>
          ) : null}
          <label>
            Plik startowy
            <input
              placeholder={
                isMinecraft
                  ? "server.jar"
                  : isFiveM
                    ? "run.sh"
                    : selectedGamePreset
                      ? selectedGamePreset.entryFile
                  : "dist/index.js"
              }
              value={form.entry_file}
              onChange={(event) => setForm((current) => ({ ...current, entry_file: event.target.value }))}
            />
          </label>
          <label className="wide">
            Komenda startowa
            <input
              placeholder={
                isMinecraft
                  ? 'java -Xms1024M -Xmx2048M -jar "server.jar" nogui'
                  : isFiveM
                    ? 'bash "run.sh" +exec "server.cfg"'
                    : selectedGamePreset
                      ? selectedGamePreset.startCommand
                  : 'npm start lub python3 "main.py"'
              }
              value={form.start_command}
              onChange={(event) =>
                setForm((current) => ({ ...current, start_command: event.target.value }))
              }
            />
          </label>
          <label>
            Restart delay (ms)
            <input
              type="number"
              value={form.restart_delay}
              onChange={(event) =>
                setForm((current) => ({ ...current, restart_delay: event.target.value }))
              }
            />
          </label>
          <label>
            Max restarts
            <input
              type="number"
              value={form.max_restarts}
              onChange={(event) =>
                setForm((current) => ({ ...current, max_restarts: event.target.value }))
              }
            />
          </label>
          <label>
            Limit RAM (GB)
            <input
              type="number"
              step="0.25"
              value={form.ram_limit_mb}
              onChange={(event) =>
                setForm((current) => ({ ...current, ram_limit_mb: event.target.value }))
              }
            />
            <small>Wpisz wartosc w GB, np. `1` = 1024 MB.</small>
          </label>
          <label>
            Limit CPU (%)
            <input
              type="number"
              value={form.cpu_limit_percent}
              onChange={(event) =>
                setForm((current) => ({ ...current, cpu_limit_percent: event.target.value }))
              }
            />
          </label>

          {isGameService ? (
            <>
              <label>
                Adres publiczny
                <input
                  placeholder="Auto: publiczne IP hosta"
                  value={form.public_host}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, public_host: event.target.value }))
                  }
                />
              </label>
              <label>
                Port publiczny
                <input
                  type="number"
                  value={form.public_port}
                  disabled={!user?.is_admin}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, public_port: event.target.value }))
                  }
                />
                <small>
                  {user?.is_admin
                    ? "Jesli wybrany port jest zajety, ByteHost automatycznie znajdzie wolny."
                    : "Port jest przydzielany automatycznie. Zmienic go recznie moze tylko owner."}
                </small>
              </label>
              {isMinecraft ? (
                <div className="info-card wide">
                  ByteHost akceptuje Minecraft EULA automatycznie przy tworzeniu i starcie serwera.
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
                  value={form.fivem_license_key}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fivem_license_key: event.target.value }))
                  }
                />
              </label>
              <label>
                Sloty graczy
                <input
                  type="number"
                  min="1"
                  max="128"
                  value={form.fivem_max_clients}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fivem_max_clients: event.target.value }))
                  }
                />
              </label>
              <label>
                Nazwa projektu FiveM
                <input
                  placeholder="ByteHost FiveM"
                  value={form.fivem_project_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fivem_project_name: event.target.value }))
                  }
                />
              </label>
              <label>
                Tagi
                <input
                  placeholder="roleplay, economy, drift"
                  value={form.fivem_tags}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fivem_tags: event.target.value }))
                  }
                />
              </label>
              <label>
                Locale
                <input
                  placeholder="pl-PL"
                  value={form.fivem_locale}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fivem_locale: event.target.value }))
                  }
                />
              </label>
              <label className="checkbox-field wide">
                <input
                  type="checkbox"
                  checked={form.fivem_onesync_enabled}
                  onChange={(event) =>
                    setForm((current) => ({
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
              checked={form.auto_restart}
              onChange={(event) =>
                setForm((current) => ({ ...current, auto_restart: event.target.checked }))
              }
            />
            <span>Auto restart wlaczony</span>
          </label>
          <label>
            Subdomena
            <input
              placeholder="np. mc.bytehost.online"
              value={form.subdomain}
              onChange={(event) =>
                setForm((current) => ({ ...current, subdomain: event.target.value }))
              }
            />
            <small>Panel zapisuje subdomene przy usludze. DNS w Cloudflare ustawisz osobno.</small>
          </label>
          <label>
            Tlo serwera
            <input
              placeholder="https://..."
              value={form.background_url}
              onChange={(event) =>
                setForm((current) => ({ ...current, background_url: event.target.value }))
              }
            />
            <small>URL obrazka, ktory bedzie widoczny na karcie serwera.</small>
          </label>

          {!isGameService ? (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.install_on_create}
                onChange={(event) =>
                  setForm((current) => ({ ...current, install_on_create: event.target.checked }))
                }
              />
              <span>Instaluj zaleznosci od razu po utworzeniu</span>
            </label>
          ) : null}

          <div className="form-actions wide">
            <button className="ghost-button" type="button" onClick={onClose}>
              Anuluj
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              <Upload size={16} />
              <span>
                {saving
                  ? "Tworzenie..."
                  : isMinecraft
                    ? "Utworz serwer Minecraft"
                    : isFiveM
                      ? "Utworz serwer FiveM"
                      : selectedGamePreset
                        ? `Utworz ${selectedGamePreset.label}`
                    : "Utworz bota"}
              </span>
            </button>
          </div>
        </form>

        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </div>
  );
}

export function BotsPage({ user, bots, system, onRefreshAll, onRefreshBots, onRefreshSystem }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [createOpen, setCreateOpen] = useState(false);

  const selectedBot = bots.find((bot) => bot.id === id) || null;
  const accountLocked =
    !user?.is_admin &&
    (system?.account?.account_status === "PENDING_APPROVAL" ||
      !hasVisibleAccountPlan(system?.account?.limits || system?.limits));

  return (
    <>
      <CreateBotPanel
        open={createOpen && !accountLocked}
        user={user}
        system={system}
        onClose={() => setCreateOpen(false)}
        onCreated={(bot) => {
          setCreateOpen(false);
          navigate(`/bots/${bot.id}`);
          onRefreshAll();
        }}
      />

      <div className="bots-layout">
        <section className="panel-card bot-list-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Uslugi</p>
              <h3>Workspace</h3>
            </div>
            <button
              className="primary-button"
              onClick={() => setCreateOpen(true)}
              disabled={accountLocked}
              title={
                accountLocked
                  ? "Konto jest w trybie podgladu i nie ma jeszcze aktywnego planu."
                  : ""
              }
            >
              <Plus size={16} />
              <span>Nowa usluga</span>
            </button>
          </div>

          {accountLocked ? (
            <div className="info-card">
              Konto nie ma jeszcze aktywnego planu. Mozesz obejrzec panel, ale tworzenie i
              uruchamianie uslug jest zablokowane, dopoki owner nie aktywuje konta i nie ustawi
              limitow.
            </div>
          ) : null}

          <div className="list-summary">
            <span>Lacznie: {formatNumber(system?.statuses?.total)}</span>
            <span>ONLINE: {formatNumber(system?.statuses?.online)}</span>
            <span>
              {user?.is_admin
                ? `CRASH LOOP: ${formatNumber(system?.statuses?.crash_loop)}`
                : `Pozostalo limitu: ${formatNumber(system?.remaining?.bots)}`}
            </span>
          </div>

          <div className="bot-list">
            {bots.length === 0 ? (
              <div className="empty-block">
                <p>Nie masz jeszcze zadnych uslug.</p>
                <button className="ghost-button" onClick={() => setCreateOpen(true)}>
                  Dodaj pierwsza usluge
                </button>
              </div>
            ) : (
              bots.map((bot) => (
                <Link
                  key={bot.id}
                  className={`bot-list-item server-list-card ${selectedBot?.id === bot.id ? "active" : ""}`}
                  to={`/bots/${bot.id}`}
                  style={
                    bot.background_url
                      ? { "--server-bg": `url("${bot.background_url}")` }
                      : undefined
                  }
                >
                  <div>
                    <strong>{bot.name}</strong>
                    <span>{serviceTypeLabel(bot.service_type)}</span>
                  </div>
                  <div className="bot-list-meta">
                    <span>{bot.status}</span>
                    <small>RAM {formatMemoryLimit(bot.ram_limit_mb)}</small>
                    <small>{formatMemoryFromMb(bot.storage_usage_mb || 0)}</small>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="bot-workspace-panel">
          {selectedBot ? (
            <BotWorkspace
              botId={selectedBot.id}
              user={user}
              onRefreshAll={onRefreshAll}
              onRefreshBots={onRefreshBots}
              onRefreshSystem={onRefreshSystem}
            />
          ) : (
            <div className="panel-card empty-workspace">
              <p className="eyebrow">Wybierz usluge</p>
              <h3>Panel zarzadzania</h3>
              <p>
                Po lewej stronie wybierz istniejaca usluge albo utworz nowa. ByteHost obsluguje
                boty Discord, serwery Minecraft i serwery FiveM, z auto-detekcja startu,
                limitami per konto oraz recznymi nadpisaniami dla operatora.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
