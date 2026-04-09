import { Link, NavLink } from "react-router-dom";
import {
  Activity,
  HardDrive,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Users
} from "lucide-react";

import { accountStatusLabel, formatDate, formatNumber, userRoleLabel } from "../utils";

function StatChip({ label, value }) {
  return (
    <div className="topbar-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Layout({ children, user, bots, system, onRefresh, onLogout, loading, lastUpdated }) {
  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/bots", label: "Uslugi", icon: Server }
  ];

  if (user?.is_admin) {
    navItems.push({ to: "/admin/users", label: "Uzytkownicy", icon: Users });
    navItems.push({ to: "/system", label: "System", icon: ShieldCheck });
  }

  const sidebarTitle = user?.is_admin ? "Panel ownera" : "Twoje konto";
  const sidebarValue = user?.is_admin
    ? formatNumber(system?.statuses?.online)
    : `${accountStatusLabel(system?.account?.account_status || "ACTIVE")}`;
  const sidebarHint = user?.is_admin
    ? "Uslugi online i zarzadzanie kontami"
    : `Wygasa: ${formatDate(system?.account?.expires_at)}`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <div className="brand-mark">B</div>
          <div>
            <strong>ByteHost</strong>
            <span>Prywatny hosting botow i serwerow</span>
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
          <p>{sidebarTitle}</p>
          <strong>{sidebarValue}</strong>
          <small>{sidebarHint}</small>
          <div className="sidebar-user-meta">
            <span>{userRoleLabel(user?.role)}</span>
            <span>{user?.email}</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{user?.is_admin ? "Panel ownera" : "Panel uzytkownika"}</p>
            <h1>ByteHost</h1>
            <span className="topbar-meta">
              Ostatnie odswiezenie: {lastUpdated ? lastUpdated.toLocaleTimeString("pl-PL") : "brak"}
            </span>
          </div>

          <div className="topbar-actions">
            <StatChip label="Uslugi" value={formatNumber(system?.usage?.bots)} />
            <StatChip label="RAM" value={formatNumber(system?.usage?.ram_mb, " MB")} />
            <StatChip label="Storage" value={formatNumber(system?.usage?.storage_mb, " MB")} />
            <button className="ghost-button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              <span>Odswiez</span>
            </button>
            <button className="ghost-button" onClick={onLogout}>
              <LogOut size={16} />
              <span>Wyloguj</span>
            </button>
          </div>
        </header>

        <main className="content-shell">{children}</main>

        <footer className="footer-bar">
          <div>
            <Activity size={16} />
            <span>
              {user?.is_admin
                ? "Owner widzi caly system, uzytkownicy tylko swoje uslugi."
                : "Widok ograniczony do wlasnych uslug i planu konta."}
            </span>
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
