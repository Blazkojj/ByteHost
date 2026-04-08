import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";

import { api } from "./api";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { BotsPage } from "./pages/BotsPage";
import { SystemPage } from "./pages/SystemPage";

export default function App() {
  const [bots, setBots] = useState([]);
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function refreshAll() {
    setLoading(true);
    setPageError("");

    try {
      const [nextBots, nextSystem] = await Promise.all([api.getBots(), api.getSystemStats()]);
      setBots(nextBots);
      setSystem(nextSystem);
      setLastUpdated(new Date());
    } catch (error) {
      setPageError(error.message);
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
      setPageError(error.message);
    }
  }

  async function refreshSystem() {
    try {
      const nextSystem = await api.getSystemStats();
      setSystem(nextSystem);
      setLastUpdated(new Date());
    } catch (error) {
      setPageError(error.message);
    }
  }

  useEffect(() => {
    refreshAll();

    const interval = window.setInterval(() => {
      refreshAll();
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <Layout
      bots={bots}
      system={system}
      onRefresh={refreshAll}
      loading={loading}
      lastUpdated={lastUpdated}
    >
      {pageError ? <div className="banner error">{pageError}</div> : null}

      <Routes>
        <Route
          path="/"
          element={<DashboardPage bots={bots} system={system} loading={loading} />}
        />
        <Route
          path="/bots"
          element={
            <BotsPage
              bots={bots}
              system={system}
              onRefreshAll={refreshAll}
              onRefreshBots={refreshBots}
              onRefreshSystem={refreshSystem}
            />
          }
        />
        <Route
          path="/bots/:id"
          element={
            <BotsPage
              bots={bots}
              system={system}
              onRefreshAll={refreshAll}
              onRefreshBots={refreshBots}
              onRefreshSystem={refreshSystem}
            />
          }
        />
        <Route
          path="/system"
          element={<SystemPage system={system} onRefresh={refreshAll} onRefreshSystem={refreshSystem} />}
        />
      </Routes>
    </Layout>
  );
}
