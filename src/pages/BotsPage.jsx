import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Upload } from "lucide-react";

import { api } from "../api";
import { BotWorkspace } from "../components/BotWorkspace";
import {
  formatCountdown,
  formatNumber,
  serviceArtifactLabel,
  serviceTypeLabel
} from "../utils";

function CreateBotPanel({ open, system, user, onClose, onCreated }) {
  const [form, setForm] = useState({
    service_type: "discord_bot",
    name: "",
    description: "",
    language: "",
    minecraft_version: "",
    entry_file: "",
    start_command: "",
    expires_at: "",
    auto_restart: true,
    restart_delay: 5000,
    max_restarts: 5,
    ram_limit_mb: 512,
    cpu_limit_percent: 35,
    install_on_create: false,
    accept_eula: false,
    public_host: "",
    public_port: 25565
  });
  const [archive, setArchive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [minecraftVersions, setMinecraftVersions] = useState([]);
  const [latestMinecraftRelease, setLatestMinecraftRelease] = useState("");

  const isMinecraft = form.service_type === "minecraft_server";

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
        }
      } catch (_error) {
        if (!cancelled) {
          setMinecraftVersions([]);
          setLatestMinecraftRelease("");
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
          payload.append(key, String(value));
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
            <h3>{isMinecraft ? "Dodaj serwer Minecraft" : "Dodaj bota Discord"}</h3>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Zamknij
          </button>
        </div>

        <div className="info-card">
          {isMinecraft
            ? "ByteHost wykrywa plik JAR serwera i przygotowuje komende startowa dla Javy. Plik jest opcjonalny przy tworzeniu: panel moze najpierw utworzyc pusty workspace Minecraft, a JAR dodasz pozniej."
            : "ByteHost automatycznie wykrywa plik startowy i komende startowa po wrzuceniu archiwum. Pola ponizej sa opcjonalne i sluza do recznego poprawienia wykrycia."}
        </div>

        {!user?.is_admin ? (
          <div className="info-card">
            Twoj plan: {system?.usage?.bots || 0}/{system?.limits?.max_bots || 0} uslug, RAM{" "}
            {system?.usage?.ram_mb || 0}/{system?.limits?.ram_limit_mb || 0} MB, CPU{" "}
            {system?.usage?.cpu_percent || 0}/{system?.limits?.cpu_limit_percent || 0}%,
            storage {system?.usage?.storage_mb || 0}/{system?.limits?.storage_limit_mb || 0} MB.
          </div>
        ) : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Typ uslugi
            <select
              value={form.service_type}
              onChange={(event) =>
                setForm((current) =>
                  event.target.value === "minecraft_server"
                    ? {
                        ...current,
                        service_type: event.target.value,
                        language: "Java",
                        entry_file: current.entry_file || "server.jar",
                        minecraft_version: current.minecraft_version || "",
                        install_on_create: false,
                        public_port: current.public_port || 25565
                      }
                    : {
                        ...current,
                        service_type: event.target.value,
                        language: current.language === "Java" ? "" : current.language,
                        minecraft_version: "",
                        entry_file: current.entry_file === "server.jar" ? "" : current.entry_file
                      }
                )
              }
            >
              <option value="discord_bot">Bot Discord</option>
              <option value="minecraft_server">Serwer Minecraft</option>
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
                  : ".zip,.rar,application/zip,application/x-rar-compressed"
              }
              onChange={(event) => setArchive(event.target.files?.[0] || null)}
            />
            <small>
              {archive
                ? archive.name
                : isMinecraft
                  ? "Opcjonalne. Mozesz utworzyc pusty serwer i dodac JAR pozniej albo od razu wrzucic JAR/ZIP/RAR."
                  : "Mozesz dodac plik teraz lub utworzyc pusty workspace."}
            </small>
          </label>
          <label>
            Jezyk projektu
            <select
              value={form.language}
              disabled={isMinecraft}
              onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
            >
              <option value="">Auto detect</option>
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
          ) : null}
          <label>
            Plik startowy
            <input
              placeholder={isMinecraft ? "server.jar" : "dist/index.js"}
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
                  : 'npm start lub python3 "main.py"'
              }
              value={form.start_command}
              onChange={(event) =>
                setForm((current) => ({ ...current, start_command: event.target.value }))
              }
            />
          </label>
          <label>
            Wygasa o
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))}
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
            Limit RAM (MB)
            <input
              type="number"
              value={form.ram_limit_mb}
              onChange={(event) =>
                setForm((current) => ({ ...current, ram_limit_mb: event.target.value }))
              }
            />
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

          {isMinecraft ? (
            <>
              <label>
                Adres publiczny
                <input
                  placeholder="mc.twojadomena.pl"
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
                  onChange={(event) =>
                    setForm((current) => ({ ...current, public_port: event.target.value }))
                  }
                />
              </label>
              <label className="checkbox-field wide">
                <input
                  type="checkbox"
                  checked={form.accept_eula}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, accept_eula: event.target.checked }))
                  }
                />
                <span>Akceptuje Minecraft EULA i pozwalam panelowi ustawic eula=true</span>
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
          {!isMinecraft ? (
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

  return (
    <>
      <CreateBotPanel
        open={createOpen}
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
            <button className="primary-button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              <span>Nowa usluga</span>
            </button>
          </div>

          <div className="list-summary">
            <span>Lacznie: {formatNumber(system?.statuses?.total)}</span>
            <span>ONLINE: {formatNumber(system?.statuses?.online)}</span>
            <span>
              {user?.is_admin
                ? `EXPIRED: ${formatNumber(system?.statuses?.expired)}`
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
                  className={`bot-list-item ${selectedBot?.id === bot.id ? "active" : ""}`}
                  to={`/bots/${bot.id}`}
                >
                  <div>
                    <strong>{bot.name}</strong>
                    <span>{serviceTypeLabel(bot.service_type)}</span>
                  </div>
                  <div className="bot-list-meta">
                    <span>{bot.status}</span>
                    <small>{formatCountdown(bot.expires_at)}</small>
                    <small>{formatNumber(bot.storage_usage_mb, " MB")}</small>
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
                boty Discord i serwery Minecraft, z auto-detekcja startu, limitami per konto
                oraz recznymi nadpisaniami dla operatora.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
