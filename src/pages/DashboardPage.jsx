import { Link } from "react-router-dom";
import { Activity, Clock3, Cpu, HardDrive, Server, TriangleAlert } from "lucide-react";

import { formatCountdown, formatDate, formatNumber, serviceTypeLabel } from "../utils";

function MetricCard({ icon: Icon, label, value, hint }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{hint}</span>
      </div>
    </article>
  );
}

export function DashboardPage({ bots, system, loading }) {
  const featuredBots = bots.slice(0, 6);

  return (
    <div className="page-grid">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Prywatny panel hostingu</p>
          <h2>Hostuj boty Discord i serwery Minecraft na prawdziwych procesach.</h2>
          <p className="hero-copy">
            ByteHost zarzadza realnymi plikami, PM2, schedulerem wygasniecia, auto restartem,
            limitami zasobow i file managerem dla jednego operatora.
          </p>
          <div className="hero-pills">
            <span>PM2</span>
            <span>SQLite</span>
            <span>ZIP / RAR / JAR</span>
            <span>Discord + Minecraft</span>
          </div>
        </div>

        <div className="hero-panel">
          <div className="pulse-row">
            <span>Stan hostingu</span>
            <strong>{loading ? "Synchronizacja..." : "Gotowy"}</strong>
          </div>
          <div className="resource-bar">
            <label>CPU uslug</label>
            <progress value={system?.usage?.cpu_percent || 0} max={system?.limits?.cpu_limit_percent || 100} />
          </div>
          <div className="resource-bar">
            <label>RAM uslug</label>
            <progress value={system?.usage?.ram_mb || 0} max={system?.limits?.ram_limit_mb || 100} />
          </div>
          <div className="resource-bar">
            <label>Storage</label>
            <progress
              value={system?.usage?.storage_mb || 0}
              max={system?.limits?.storage_limit_mb || 100}
            />
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <MetricCard
          icon={Server}
          label="Wszystkie uslugi"
          value={formatNumber(system?.statuses?.total)}
          hint={`Limit: ${formatNumber(system?.limits?.max_bots)}`}
        />
        <MetricCard
          icon={Activity}
          label="ONLINE"
          value={formatNumber(system?.statuses?.online)}
          hint="Procesy aktualnie uruchomione"
        />
        <MetricCard
          icon={Cpu}
          label="CPU"
          value={formatNumber(system?.usage?.cpu_percent, "%")}
          hint={`Host: ${formatNumber(system?.host?.cpu_load_percent, "%")}`}
        />
        <MetricCard
          icon={HardDrive}
          label="Storage"
          value={formatNumber(system?.usage?.storage_mb, " MB")}
          hint={`Limit: ${formatNumber(system?.limits?.storage_limit_mb, " MB")}`}
        />
      </section>

      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Uslugi</p>
            <h3>Ostatnio dodane</h3>
          </div>
          <Link className="inline-link" to="/bots">
            Otworz workspace
          </Link>
        </div>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Status</th>
                <th>Typ</th>
                <th>Wygasniecie</th>
                <th>RAM</th>
              </tr>
            </thead>
            <tbody>
              {featuredBots.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    Brak uslug. Przejdz do sekcji Uslugi i dodaj pierwszy projekt.
                  </td>
                </tr>
              ) : (
                featuredBots.map((bot) => (
                  <tr key={bot.id}>
                    <td>
                      <Link className="table-link" to={`/bots/${bot.id}`}>
                        {bot.name}
                      </Link>
                    </td>
                    <td>{bot.status}</td>
                    <td>{serviceTypeLabel(bot.service_type)}</td>
                    <td>{formatCountdown(bot.expires_at)}</td>
                    <td>{formatNumber(bot.ram_usage_mb || bot.ram_limit_mb, " MB")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Stan hosta</p>
            <h3>Monitoring serwera</h3>
          </div>
        </div>

        <div className="host-grid">
          <div className="host-stat">
            <Clock3 size={18} />
            <div>
              <span>Uptime hosta</span>
              <strong>{formatNumber(Math.floor((system?.host?.uptime_seconds || 0) / 3600), " h")}</strong>
            </div>
          </div>
          <div className="host-stat">
            <TriangleAlert size={18} />
            <div>
              <span>Crash loop</span>
              <strong>{formatNumber(system?.statuses?.crash_loop)}</strong>
            </div>
          </div>
          <div className="host-stat">
            <Activity size={18} />
            <div>
              <span>Ostatni sync</span>
              <strong>{formatDate(new Date())}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
