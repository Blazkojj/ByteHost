import { Link, NavLink } from "react-router-dom";
import { Activity, HardDrive, LayoutDashboard, RefreshCw, Server, ShieldCheck } from "lucide-react";

import { formatNumber } from "../utils";

function StatChip({ label, value }) {
  return (
    <div className="topbar-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Layout({ children, bots, system, onRefresh, loading, lastUpdated }) {
  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/bots", label: "Boty", icon: Server },
    { to: "/system", label: "System", icon: ShieldCheck }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <div className="brand-mark">B</div>
          <div>
            <strong>ByteHost</strong>
            <span>Prywatny hosting botów Discord</span>
          </div>
        </Link>

        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <p>Aktywne boty</p>
          <strong>{bots.filter((bot) => bot.status === "ONLINE").length}</strong>
          <small>Z PM2, schedulerem i monitoringiem</small>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Panel hostingowy</p>
            <h1>ByteHost</h1>
            <span className="topbar-meta">
              Ostatnie odświeżenie: {lastUpdated ? lastUpdated.toLocaleTimeString("pl-PL") : "brak"}
            </span>
          </div>

          <div className="topbar-actions">
            <StatChip label="Boty" value={formatNumber(system?.usage?.bots)} />
            <StatChip label="RAM" value={formatNumber(system?.usage?.ram_mb, " MB")} />
            <StatChip label="Storage" value={formatNumber(system?.usage?.storage_mb, " MB")} />
            <button className="ghost-button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              <span>Odśwież</span>
            </button>
          </div>
        </header>

        <main className="content-shell">{children}</main>

        <footer className="footer-bar">
          <div>
            <Activity size={16} />
            <span>Realny panel PM2 dla jednego użytkownika</span>
          </div>
          <div>
            <HardDrive size={16} />
            <span>Storage: {formatNumber(system?.usage?.storage_mb, " MB")}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
