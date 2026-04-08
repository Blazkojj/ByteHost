import { useEffect, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";

import { api } from "../api";
import { formatNumber } from "../utils";

export function SystemPage({ system, onRefresh, onRefreshSystem }) {
  const [form, setForm] = useState({
    ram_limit_mb: "",
    cpu_limit_percent: "",
    storage_limit_mb: "",
    max_bots: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!system?.limits) {
      return;
    }

    setForm({
      ram_limit_mb: String(system.limits.ram_limit_mb ?? ""),
      cpu_limit_percent: String(system.limits.cpu_limit_percent ?? ""),
      storage_limit_mb: String(system.limits.storage_limit_mb ?? ""),
      max_bots: String(system.limits.max_bots ?? "")
    });
  }, [system]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await api.updateSystemLimits(form);
      setMessage("Limity systemowe zostały zapisane.");
      await onRefreshSystem();
      await onRefresh();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Limity globalne</p>
            <h3>Polityka zasobów</h3>
          </div>
          <ShieldCheck size={18} />
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            RAM globalny (MB)
            <input
              value={form.ram_limit_mb}
              onChange={(event) => setForm((current) => ({ ...current, ram_limit_mb: event.target.value }))}
            />
          </label>
          <label>
            CPU globalne (%)
            <input
              value={form.cpu_limit_percent}
              onChange={(event) =>
                setForm((current) => ({ ...current, cpu_limit_percent: event.target.value }))
              }
            />
          </label>
          <label>
            Storage globalny (MB)
            <input
              value={form.storage_limit_mb}
              onChange={(event) =>
                setForm((current) => ({ ...current, storage_limit_mb: event.target.value }))
              }
            />
          </label>
          <label>
            Maksymalna liczba botów
            <input
              value={form.max_bots}
              onChange={(event) => setForm((current) => ({ ...current, max_bots: event.target.value }))}
            />
          </label>

          <div className="form-actions wide">
            <button className="primary-button" type="submit" disabled={saving}>
              <Save size={16} />
              <span>{saving ? "Zapisywanie..." : "Zapisz limity"}</span>
            </button>
          </div>
        </form>

        {message ? <div className="banner success">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Zużycie</p>
            <h3>Aktualny stan</h3>
          </div>
        </div>

        <div className="stats-grid compact">
          <article className="metric-card">
            <div>
              <p>RAM botów</p>
              <strong>{formatNumber(system?.usage?.ram_mb, " MB")}</strong>
              <span>Limit: {formatNumber(system?.limits?.ram_limit_mb, " MB")}</span>
            </div>
          </article>
          <article className="metric-card">
            <div>
              <p>CPU botów</p>
              <strong>{formatNumber(system?.usage?.cpu_percent, "%")}</strong>
              <span>Limit: {formatNumber(system?.limits?.cpu_limit_percent, "%")}</span>
            </div>
          </article>
          <article className="metric-card">
            <div>
              <p>Storage</p>
              <strong>{formatNumber(system?.usage?.storage_mb, " MB")}</strong>
              <span>Limit: {formatNumber(system?.limits?.storage_limit_mb, " MB")}</span>
            </div>
          </article>
          <article className="metric-card">
            <div>
              <p>Host RAM</p>
              <strong>{formatNumber(system?.host?.used_ram_mb, " MB")}</strong>
              <span>Host total: {formatNumber(system?.host?.total_ram_mb, " MB")}</span>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
