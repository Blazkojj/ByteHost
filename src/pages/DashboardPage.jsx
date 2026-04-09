import { Link } from "react-router-dom";
import { Activity, Clock3, Cpu, HardDrive, Server, TriangleAlert } from "lucide-react";

import {
  accountStatusLabel,
  formatCountdown,
  formatDate,
  formatLimitValue,
  formatMemoryFromMb,
  formatNumber,
  serviceTypeLabel
} from "../utils";

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

export function DashboardPage({ user, bots, system, loading }) {
  const featuredBots = bots.slice(0, 6);
  const account = system?.account;
  const limits = system?.limits || {};
  const remaining = system?.remaining || {};

  return (
    <div className="page-grid">
      <section className="hero-card">
        <div>
          <p className="eyebrow">{user.is_admin ? "Owner workspace" : "Panel uzytkownika"}</p>
          <h2>
            {user.is_admin
              ? "Zarzadzaj kontami, limitami i uslugami z jednego panelu."
              : "Widzisz tylko swoje boty, zuzycie zasobow i pozostaly limit planu."}
          </h2>
          <p className="hero-copy">
            {user.is_admin
              ? "ByteHost laczy realne procesy PM2 z systemem kont, limitow planu, schedulerem wygasniec i administracja uzytkownikami."
              : "Twoj panel pokazuje realne procesy PM2, file manager, logi i limity zasobow przypisane do konta przez ownera."}
          </p>
          <div className="hero-pills">
            <span>JWT auth</span>
            <span>Bcrypt</span>
            <span>PM2</span>
            <span>{user.is_admin ? "Admin + user ACL" : "Prywatny workspace"}</span>
          </div>
        </div>

        <div className="hero-panel">
          <div className="pulse-row">
            <span>Stan konta</span>
            <strong>{loading ? "Synchronizacja..." : accountStatusLabel(account?.account_status || "ACTIVE")}</strong>
          </div>
          <div className="resource-bar">
            <label>CPU</label>
            <progress
              value={system?.usage?.cpu_percent || 0}
              max={limits.cpu_limit_percent || Math.max(100, system?.usage?.cpu_percent || 0)}
            />
          </div>
          <div className="resource-bar">
            <label>RAM</label>
            <progress
              value={system?.usage?.ram_mb || 0}
              max={limits.ram_limit_mb || Math.max(1024, system?.usage?.ram_mb || 0)}
            />
          </div>
          <div className="resource-bar">
            <label>Storage</label>
            <progress
              value={system?.usage?.storage_mb || 0}
              max={limits.storage_limit_mb || Math.max(1024, system?.usage?.storage_mb || 0)}
            />
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <MetricCard
          icon={Server}
          label={user.is_admin ? "Wszystkie uslugi" : "Twoje uslugi"}
          value={formatNumber(system?.statuses?.total)}
          hint={`Limit: ${formatLimitValue(limits.max_bots)}`}
        />
        <MetricCard
          icon={Activity}
          label={user.is_admin ? "ONLINE" : "Pozostalo botow"}
          value={user.is_admin ? formatNumber(system?.statuses?.online) : formatLimitValue(remaining.bots)}
          hint={user.is_admin ? "Procesy aktualnie uruchomione" : `Wykorzystane: ${formatNumber(system?.usage?.bots)}`}
        />
        <MetricCard
          icon={Cpu}
          label="CPU"
          value={formatNumber(system?.usage?.cpu_percent, "%")}
          hint={
            user.is_admin
              ? `Host: ${formatNumber(system?.host?.cpu_load_percent, "%")}`
              : `Pozostalo: ${formatNumber(remaining.cpu_percent, "%")}`
          }
        />
        <MetricCard
          icon={HardDrive}
          label="Storage"
          value={formatNumber(system?.usage?.storage_mb, " MB")}
          hint={`Pozostalo: ${formatLimitValue(remaining.storage_mb, " MB")}`}
        />
      </section>

      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Uslugi</p>
            <h3>{user.is_admin ? "Ostatnio dodane" : "Twoje ostatnie uslugi"}</h3>
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
                    <td>{formatMemoryFromMb(bot.ram_usage_mb || bot.ram_limit_mb)}</td>
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
            <p className="eyebrow">{user.is_admin ? "Stan hosta" : "Plan konta"}</p>
            <h3>{user.is_admin ? "Monitoring serwera" : "Status konta i wygasniecie"}</h3>
          </div>
        </div>

        <div className="host-grid">
          <div className="host-stat">
            <Clock3 size={18} />
            <div>
              <span>{user.is_admin ? "Uptime hosta" : "Konto wygasa"}</span>
              <strong>
                {user.is_admin
                  ? formatNumber(Math.floor((system?.host?.uptime_seconds || 0) / 3600), " h")
                  : formatDate(account?.expires_at)}
              </strong>
            </div>
          </div>
          <div className="host-stat">
            <TriangleAlert size={18} />
            <div>
              <span>{user.is_admin ? "Crash loop" : "Status konta"}</span>
              <strong>
                {user.is_admin
                  ? formatNumber(system?.statuses?.crash_loop)
                  : accountStatusLabel(account?.account_status || "ACTIVE")}
              </strong>
            </div>
          </div>
          <div className="host-stat">
            <Activity size={18} />
            <div>
              <span>{user.is_admin ? "Ostatni sync" : "Pozostaly RAM"}</span>
              <strong>
                {user.is_admin
                  ? formatDate(new Date())
                  : formatLimitValue(remaining.ram_mb, " MB") === "Bez limitu"
                    ? "Bez limitu"
                    : formatMemoryFromMb(remaining.ram_mb)}
              </strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
