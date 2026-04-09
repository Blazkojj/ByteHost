import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "./api";
import { Layout } from "./components/Layout";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { BotsPage } from "./pages/BotsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { SystemPage } from "./pages/SystemPage";

const THEME_STORAGE_KEY = "bytehost-theme";

function resolveInitialTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function LoadingScreen() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">ByteHost</p>
        <h1>Przywracanie sesji...</h1>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [bots, setBots] = useState([]);
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [theme, setTheme] = useState(resolveInitialTheme);

  function resetSessionState() {
    setUser(null);
    setBots([]);
    setSystem(null);
    setLoading(false);
    setPageError("");
    setLastUpdated(null);
  }

  async function refreshAll() {
    if (!api.getAuthToken()) {
      return;
    }

    setLoading(true);
    setPageError("");

    try {
      const [nextUser, nextBots, nextSystem] = await Promise.all([
        api.getMe(),
        api.getBots(),
        api.getSystemStats()
      ]);
      setUser(nextUser);
      setBots(nextBots);
      setSystem(nextSystem);
      setLastUpdated(new Date());
    } catch (error) {
      if (error.statusCode !== 401) {
        setPageError(error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshBots() {
    try {
      const nextBots = await api.getBots();
      setBots(nextBots);
      setLastUpdated(new Date());
    } catch (error) {
      if (error.statusCode !== 401) {
        setPageError(error.message);
      }
    }
  }

  async function refreshSystem() {
    try {
      const nextSystem = await api.getSystemStats();
      setSystem(nextSystem);
      setLastUpdated(new Date());
    } catch (error) {
      if (error.statusCode !== 401) {
        setPageError(error.message);
      }
    }
  }

  async function restoreSession() {
    if (!api.getAuthToken()) {
      setAuthLoading(false);
      return;
    }

    try {
      setUser(await api.getMe());
    } catch (_error) {
      api.clearAuthToken();
      resetSessionState();
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    restoreSession();

    const handleUnauthorized = () => {
      api.clearAuthToken();
      resetSessionState();
      setAuthLoading(false);
    };

    window.addEventListener("bytehost:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("bytehost:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    refreshAll();
    const interval = window.setInterval(() => {
      refreshAll();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [user?.id]);

  async function handleLogin(credentials) {
    const session = await api.login(credentials);
    api.setAuthToken(session.token);
    setUser(session.user);
    setPageError("");
  }

  function handleRegister(payload) {
    return api.register(payload);
  }

  function handleLogout() {
    api.clearAuthToken();
    resetSessionState();
  }

  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function renderProtectedPage(element) {
    if (!user) {
      return <Navigate to="/login" replace />;
    }

    return (
      <Layout
        user={user}
        bots={bots}
        system={system}
        onRefresh={refreshAll}
        onLogout={handleLogout}
        loading={loading}
        lastUpdated={lastUpdated}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      >
        {pageError ? <div className="banner error">{pageError}</div> : null}
        {element}
      </Layout>
    );
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<LandingPage theme={theme} onToggleTheme={handleToggleTheme} />}
      />
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginPage
              onLogin={handleLogin}
              onRegister={handleRegister}
              loading={authLoading}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              mode="login"
            />
          )
        }
      />
      <Route
        path="/register"
        element={
          user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginPage
              onLogin={handleLogin}
              onRegister={handleRegister}
              loading={authLoading}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              mode="register"
            />
          )
        }
      />
      <Route
        path="/dashboard"
        element={renderProtectedPage(
          <DashboardPage user={user} bots={bots} system={system} loading={loading} />
        )}
      />
      <Route
        path="/bots"
        element={renderProtectedPage(
          <BotsPage
            user={user}
            bots={bots}
            system={system}
            onRefreshAll={refreshAll}
            onRefreshBots={refreshBots}
            onRefreshSystem={refreshSystem}
          />
        )}
      />
      <Route
        path="/bots/:id"
        element={renderProtectedPage(
          <BotsPage
            user={user}
            bots={bots}
            system={system}
            onRefreshAll={refreshAll}
            onRefreshBots={refreshBots}
            onRefreshSystem={refreshSystem}
          />
        )}
      />
      <Route
        path="/system"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.is_admin ? (
            renderProtectedPage(
              <SystemPage
                user={user}
                system={system}
                onRefresh={refreshAll}
                onRefreshSystem={refreshSystem}
              />
            )
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/admin/users"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.is_admin ? (
            renderProtectedPage(<AdminUsersPage />)
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/"} replace />} />
    </Routes>
  );
}
