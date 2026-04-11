import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Archive,
  ChevronLeft,
  FileText,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Users
} from "lucide-react";

import logoUrl from "../assets/bytehost.png";
import { ThemeToggle } from "./ThemeToggle";
import {
  accountStatusLabel,
  formatDate,
  formatMemoryFromMb,
  formatNumber,
  serviceTypeLabel,
  userRoleLabel
} from "../utils";

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
  const location = useLocation();
  const serverMatch = location.pathname.match(/^\/bots\/([^/]+)/);
  const activeServerId = serverMatch ? decodeURIComponent(serverMatch[1]) : null;
  const activeServer = activeServerId ? bots?.find((bot) => bot.id === activeServerId) : null;
  const activeServerTab = location.hash ? location.hash.slice(1) : "overview";
  const isServerWorkspace = Boolean(activeServerId);
  const isGameServer = activeServer
    ? activeServer.service_type !== "discord_bot"
    : false;
  const isMinecraftServer = activeServer?.service_type === "minecraft_server";
  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/bots", label: "Uslugi", icon: Server }
  ];

  if (user?.is_admin) {
    navItems.push({ to: "/admin/users", label: "Uzytkownicy", icon: Users });
    navItems.push({ to: "/system", label: "System", icon: ShieldCheck });
  }

  const serverNavItems = activeServerId
    ? [
        { tab: "overview", label: "Przeglad", icon: ListChecks },
        { tab: "logs", label: "Logi", icon: FileText },
        { tab: "console", label: "Konsola", icon: Terminal },
        ...(isGameServer ? [{ tab: "players", label: "Gracze", icon: Users }] : []),
        ...(isMinecraftServer ? [{ tab: "installer", label: "Instalator", icon: Archive }] : []),
        { tab: "backups", label: "Backupy", icon: Archive },
        { tab: "files", label: "Pliki", icon: FolderOpen },
        { tab: "env", label: "Zmienne", icon: FileText }
      ]
    : [];

  const sidebarTitle = activeServer
    ? "Aktywny serwer"
    : user?.is_admin
      ? "Panel ownera"
      : "Twoje konto";
  const sidebarValue = user?.is_admin
    ? formatNumber(system?.statuses?.online)
    : `${accountStatusLabel(system?.account?.account_status || "ACTIVE")}`;
  const sidebarHint = activeServer
    ? serviceTypeLabel(activeServer.service_type)
    : user?.is_admin
    ? "Uslugi online i zarzadzanie kontami"
    : `Wygasa: ${formatDate(system?.account?.expires_at)}`;
  const sidebarDisplayValue = activeServer ? activeServer.name : sidebarValue;

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
          {isServerWorkspace ? (
            <>
              <Link className="nav-link muted" to="/bots">
                <ChevronLeft size={18} />
                <span>Wroc do uslug</span>
              </Link>
              {serverNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.tab}
                    to={`${location.pathname}#${item.tab}`}
                    className={`nav-link ${activeServerTab === item.tab ? "active" : ""}`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          ) : (
            navItems.map((item) => {
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
            })
          )}
        </nav>

        <div className="sidebar-card">
          <p>{sidebarTitle}</p>
          <strong>{sidebarDisplayValue}</strong>
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
