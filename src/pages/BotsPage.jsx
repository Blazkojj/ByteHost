import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Upload } from "lucide-react";

import { api } from "../api";
import { BotWorkspace } from "../components/BotWorkspace";
import { formatCountdown, formatNumber } from "../utils";

function CreateBotPanel({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    language: "",
    entry_file: "",
    start_command: "",
    expires_at: "",
    auto_restart: true,
    restart_delay: 5000,
    max_restarts: 5,
    ram_limit_mb: 512,
    cpu_limit_percent: 35,
    install_on_create: false
  });
  const [archive, setArchive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");
  }, [open]);

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
            <p className="eyebrow">Nowy bot</p>
            <h3>Dodaj projekt ZIP lub RAR</h3>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Zamknij
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Nazwa bota
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Język projektu
            <select
              value={form.language}
              onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
            >
              <option value="">Auto detect</option>
              <option value="Node.js">Node.js</option>
              <option value="TypeScript">TypeScript</option>
              <option value="Python">Python</option>
            </select>
          </label>
          <label className="wide">
            Opis
            <input
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label className="wide upload-dropzone">
            <span>Archiwum projektu (ZIP / RAR)</span>
            <input
              type="file"
              accept=".zip,.rar"
              onChange={(event) => setArchive(event.target.files?.[0] || null)}
            />
            <small>{archive ? archive.name : "Możesz dodać plik teraz lub utworzyć pusty workspace."}</small>
          </label>
          <label>
            Plik startowy
            <input
              placeholder="dist/index.js"
              value={form.entry_file}
              onChange={(event) => setForm((current) => ({ ...current, entry_file: event.target.value }))}
            />
          </label>
          <label>
            Komenda startowa
            <input
              placeholder='npm start lub python3 "main.py"'
              value={form.start_command}
              onChange={(event) => setForm((current) => ({ ...current, start_command: event.target.value }))}
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
              onChange={(event) => setForm((current) => ({ ...current, restart_delay: event.target.value }))}
            />
          </label>
          <label>
            Max restarts
            <input
              type="number"
              value={form.max_restarts}
              onChange={(event) => setForm((current) => ({ ...current, max_restarts: event.target.value }))}
            />
          </label>
          <label>
            Limit RAM (MB)
            <input
              type="number"
              value={form.ram_limit_mb}
              onChange={(event) => setForm((current) => ({ ...current, ram_limit_mb: event.target.value }))}
            />
          </label>
          <label>
            Limit CPU (%)
            <input
              type="number"
              value={form.cpu_limit_percent}
              onChange={(event) => setForm((current) => ({ ...current, cpu_limit_percent: event.target.value }))}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.auto_restart}
              onChange={(event) => setForm((current) => ({ ...current, auto_restart: event.target.checked }))}
            />
            <span>Auto restart włączony</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.install_on_create}
              onChange={(event) =>
                setForm((current) => ({ ...current, install_on_create: event.target.checked }))
              }
            />
            <span>Instaluj zależności od razu po utworzeniu</span>
          </label>

          <div className="form-actions wide">
            <button className="ghost-button" type="button" onClick={onClose}>
              Anuluj
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              <Upload size={16} />
              <span>{saving ? "Tworzenie..." : "Utwórz bota"}</span>
            </button>
          </div>
        </form>

        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </div>
  );
}

export function BotsPage({ bots, system, onRefreshAll, onRefreshBots, onRefreshSystem }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [createOpen, setCreateOpen] = useState(false);

  const selectedBot = bots.find((bot) => bot.id === id) || null;

  return (
    <>
      <CreateBotPanel
        open={createOpen}
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
              <p className="eyebrow">Boty</p>
              <h3>Workspace</h3>
            </div>
            <button className="primary-button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              <span>Nowy bot</span>
            </button>
          </div>

          <div className="list-summary">
            <span>Łącznie: {formatNumber(system?.statuses?.total)}</span>
            <span>ONLINE: {formatNumber(system?.statuses?.online)}</span>
            <span>EXPIRED: {formatNumber(system?.statuses?.expired)}</span>
          </div>

          <div className="bot-list">
            {bots.length === 0 ? (
              <div className="empty-block">
                <p>Nie masz jeszcze żadnych botów.</p>
                <button className="ghost-button" onClick={() => setCreateOpen(true)}>
                  Dodaj pierwszy projekt
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
                    <span>{bot.language || "Auto"}</span>
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
              <p className="eyebrow">Wybierz bota</p>
              <h3>Panel zarządzania</h3>
              <p>
                Po lewej stronie wybierz istniejącego bota albo utwórz nowy projekt. ByteHost
                wykryje język, plik startowy i komendę, ale możesz wszystko poprawić ręcznie.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
