import { Link, NavLink } from "react-router-dom";
import {
  HardDrive,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Users
} from "lucide-react";

import logoUrl from "../assets/bytehost.png";
import { ThemeToggle } from "./ThemeToggle";
import { accountStatusLabel, formatDate, formatMemoryFromMb, formatNumber, userRoleLabel } from "../utils";

function StatChip({ label, value }) {
  return (
    <div className="topbar-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Layout({
  children,
  user,
  bots,
  system,
  onRefresh,
  onLogout,
  loading,
  lastUpdated,
  theme,
  onToggleTheme
}) {
  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
        <Link className="brand panel-brand" to="/">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div className="brand-copy">
            <strong>ByteHost</strong>
          </div>
        </Link>

        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
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
            <StatChip label="RAM" value={formatMemoryFromMb(system?.usage?.ram_mb)} />
            <StatChip label="Storage" value={formatNumber(system?.usage?.storage_mb, " MB")} />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
            <HardDrive size={16} />
            <span>{`RAM: ${formatMemoryFromMb(system?.usage?.ram_mb)} | Storage: ${formatNumber(system?.usage?.storage_mb, " MB")}`}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
