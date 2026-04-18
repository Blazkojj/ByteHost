import { Link } from "react-router-dom";
import { Activity, Clock3, Cpu, HardDrive, Server, TriangleAlert } from "lucide-react";

import {
  accountStatusLabel,
  formatDate,
  formatLimitValue,
  hasVisibleAccountPlan,
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
  const previewAccount =
    !user.is_admin &&
    (account?.account_status === "PENDING_APPROVAL" || !hasVisibleAccountPlan(account?.limits || limits));

  return (
    <div className="page-grid">
      {previewAccount ? (
        <div className="info-card">
          Konto jest w trybie podglądu. Możesz obejrzeć panel, ale nie utworzysz ani nie uruchomisz
          żadnej usługi, dopóki owner nie aktywuje konta i nie przypisze Ci planu. Obecnie nie masz
          jeszcze wykupionych zasobów.
        </div>
      ) : null}

      <section className="hero-card">
        <div>
          <p className="eyebrow">{user.is_admin ? "Centrum zarządzania" : "Twój pulpit"}</p>
          <h2>
            {user.is_admin
              ? "Wszystkie usługi, konta i limity w jednym spokojnym widoku."
              : "Twoje serwery, boty i zasoby bez terminalowego bałaganu."}
          </h2>
          <p className="hero-copy">
            {user.is_admin
              ? "Panel pokazuje realne usługi, pliki, użycie zasobów oraz konta użytkowników w stylu prawdziwego hostingu, nie demonstracyjnej makiety."
              : "Masz pod ręką konsolę, pliki, logi, backupy i czytelne limity planu przypisane przez ownera."}
          </p>
          <div className="hero-pills">
            <span>Live console</span>
            <span>File manager</span>
            <span>Resource limits</span>
            <span>{user.is_admin ? "Owner tools" : "Private workspace"}</span>
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
          label="Twoje usługi"
          value={formatNumber(system?.statuses?.total)}
          hint={`Limit: ${formatLimitValue(limits.max_bots)}`}
        />
        <MetricCard
          icon={Activity}
          label={user.is_admin ? "Twoje ONLINE" : "Pozostało botów"}
          value={user.is_admin ? formatNumber(system?.statuses?.online) : formatLimitValue(remaining.bots)}
          hint={user.is_admin ? "Twoje uruchomione procesy" : `Wykorzystane: ${formatNumber(system?.usage?.bots)}`}
        />
        <MetricCard
          icon={Cpu}
          label="CPU"
          value={formatNumber(system?.usage?.cpu_percent, "%")}
          hint={
            user.is_admin
              ? `Host: ${formatNumber(system?.host?.cpu_load_percent, "%")}`
              : `Pozostało: ${formatNumber(remaining.cpu_percent, "%")}`
          }
        />
        <MetricCard
          icon={HardDrive}
          label="Storage"
          value={formatNumber(system?.usage?.storage_mb, " MB")}
          hint={`Pozostało: ${formatLimitValue(remaining.storage_mb, " MB")}`}
        />
      </section>

      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Usługi</p>
            <h3>Twoje ostatnie usługi</h3>
          </div>
          <Link className="inline-link" to="/bots">
            Otwórz workspace
          </Link>
        </div>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Status</th>
                <th>Typ</th>
                <th>Storage</th>
                <th>RAM</th>
              </tr>
            </thead>
            <tbody>
              {featuredBots.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    Brak usług. Przejdź do sekcji Usługi i dodaj pierwszy projekt.
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
                    <td>{formatMemoryFromMb(bot.storage_usage_mb || 0)}</td>
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
            <h3>{user.is_admin ? "Monitoring serwera" : "Status konta i wygaśnięcie"}</h3>
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
              <span>{user.is_admin ? "Ostatni sync" : "Pozostały RAM"}</span>
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
