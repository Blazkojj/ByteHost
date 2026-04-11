import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, RefreshCw, Search, X } from "lucide-react";

import { api } from "../api";
import { formatDate, formatNumber } from "../utils";

const INSTALLER_TYPES = [
  { id: "modpack", label: "Modpacki", hint: "Paczki .mrpack" },
  { id: "mod", label: "Mody", hint: "Fabric / Forge / Quilt" },
  { id: "plugin", label: "Pluginy", hint: "Paper / Spigot / Purpur" },
  { id: "datapack", label: "Datapacki", hint: "world/datapacks" },
  { id: "resourcepack", label: "Resource packi", hint: "Paczki zasobow" },
  { id: "shader", label: "Shadery", hint: "Shader packi" }
];

const SORT_OPTIONS = [
  { id: "downloads", label: "Najwiecej pobran" },
  { id: "follows", label: "Najwiecej ocen" },
  { id: "updated", label: "Ostatnio aktualizowane" },
  { id: "newest", label: "Najnowsze" },
  { id: "relevance", label: "Trafnosc" }
];

const ADDON_SOURCES = [
  { id: "modrinth", label: "Modrinth" },
  { id: "curseforge", label: "CurseForge" }
];

const LOADER_OPTIONS = {
  modpack: [
    { id: "auto", label: "Auto loader" },
    { id: "any", label: "Dowolny loader" },
    { id: "fabric", label: "Fabric" },
    { id: "forge", label: "Forge" },
    { id: "neoforge", label: "NeoForge" },
    { id: "quilt", label: "Quilt" }
  ],
  mod: [
    { id: "auto", label: "Auto loader" },
    { id: "any", label: "Dowolny loader" },
    { id: "fabric", label: "Fabric" },
    { id: "forge", label: "Forge" },
    { id: "neoforge", label: "NeoForge" },
    { id: "quilt", label: "Quilt" }
  ],
  plugin: [
    { id: "auto", label: "Auto silnik" },
    { id: "any", label: "Dowolny silnik" },
    { id: "paper", label: "Paper" },
    { id: "spigot", label: "Spigot" },
    { id: "bukkit", label: "Bukkit" },
    { id: "purpur", label: "Purpur" },
    { id: "folia", label: "Folia" }
  ],
  datapack: [
    { id: "auto", label: "Auto" },
    { id: "any", label: "Dowolne" }
  ],
  resourcepack: [
    { id: "auto", label: "Auto" },
    { id: "any", label: "Dowolne" }
  ],
  shader: [
    { id: "auto", label: "Auto" },
    { id: "any", label: "Dowolne" }
  ]
};

function getTypeLabel(type) {
  return INSTALLER_TYPES.find((entry) => entry.id === type)?.label || "Dodatki";
}

function getSourceLabel(source) {
  return ADDON_SOURCES.find((entry) => entry.id === source)?.label || "Modrinth";
}

function getProjectUrl(project, type) {
  if (project.project_url) {
    return project.project_url;
  }

  if (project.source === "curseforge") {
    return `https://www.curseforge.com/minecraft/mc-mods/${project.slug || project.id}`;
  }

  return `https://modrinth.com/${project.project_type || type}/${project.slug}`;
}

function getAutoLoader(bot, type) {
  const serverType = String(bot?.minecraft_server_type || "").toLowerCase();

  if (["mod", "modpack"].includes(type) && ["fabric", "forge", "neoforge", "quilt"].includes(serverType)) {
    return serverType;
  }

  if (type === "plugin") {
    if (serverType === "craftbukkit") {
      return "bukkit";
    }

    if (["paper", "spigot", "bukkit", "purpur", "folia"].includes(serverType)) {
      return serverType;
    }
  }

  return "";
}

function getLoaderLabel(loader, autoLoader) {
  if (loader === "auto") {
    return autoLoader ? `auto: ${autoLoader}` : "auto";
  }

  return loader || "dowolny";
}

function AddonIcon({ project }) {
  if (project.icon_url) {
    return <img src={project.icon_url} alt="" />;
  }

  return (
    <span>
      {(project.title || project.slug || "MC")
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

function VersionLabel({ version }) {
  if (!version) {
    return null;
  }

  const loader = version.loaders?.length ? version.loaders.slice(0, 3).join(", ") : "loader auto";
  const gameVersion = version.game_versions?.length
    ? version.game_versions.slice(0, 3).join(", ")
    : "wersje auto";

  return (
    <>
      {version.name || version.version_number}
      <small>
        {version.version_number} | {gameVersion} | {loader}
      </small>
    </>
  );
}

export function MinecraftInstaller({ botId, bot, onInstalled }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("modpack");
  const [source, setSource] = useState("modrinth");
  const [loader, setLoader] = useState("auto");
  const [sort, setSort] = useState("downloads");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [matchVersion, setMatchVersion] = useState(true);
  const [payload, setPayload] = useState({ hits: [], total_hits: 0, limit: 10 });
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const gameVersion = bot?.minecraft_version || bot?.detected_minecraft_version || "";
  const autoLoader = getAutoLoader(bot, type);
  const loaderOptions = LOADER_OPTIONS[type] || LOADER_OPTIONS.modpack;
  const requestLoader = loader === "any" ? "" : loader;
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(Number(payload.total_hits || 0) / Number(payload.limit || 10))),
    [payload.limit, payload.total_hits]
  );
  const selectedVersion = versions.find((version) => version.id === selectedVersionId);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const nextPayload = await api.searchMinecraftAddons(botId, {
          query,
          type,
          source,
          loader: requestLoader,
          sort,
          page,
          limit: 10,
          game_version: matchVersion ? gameVersion : "",
          all_versions: matchVersion ? "" : "true"
        });

        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [botId, gameVersion, matchVersion, page, query, refreshKey, requestLoader, sort, source, type]);

  async function openProject(project) {
    setSelectedProject(project);
    setVersions([]);
    setSelectedVersionId("");
    setModalLoading(true);
    setMessage("");
    setError("");

    try {
      const nextVersions = await api.getMinecraftAddonVersions(botId, project.id, {
        type,
        source: project.source || source,
        loader: requestLoader,
        game_version: matchVersion ? gameVersion : "",
        all_versions: matchVersion ? "" : "true"
      });

      setVersions(nextVersions.versions || []);
      setSelectedVersionId(nextVersions.versions?.[0]?.id || "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setModalLoading(false);
    }
  }

  async function installSelectedProject() {
    if (!selectedProject || !selectedVersionId) {
      setError("Najpierw wybierz wersje dodatku.");
      return;
    }

    setInstalling(true);
    setError("");
    setMessage("");

    try {
      const result = await api.installMinecraftAddon(botId, {
        type,
        source: selectedProject.source || source,
        loader: requestLoader,
        project_id: selectedProject.id,
        version_id: selectedVersionId,
        game_version: matchVersion ? gameVersion : "",
        all_versions: matchVersion ? "" : "true"
      });

      setMessage(
        `${selectedProject.title} zostal zainstalowany do ${result.file.path}. ${
          result.warning || ""
        }`.trim()
      );
      setSelectedProject(null);
      await onInstalled?.(result);
    } catch (installError) {
      setError(installError.message);
    } finally {
      setInstalling(false);
    }
  }

  function updateType(nextType) {
    setType(nextType);
    setLoader("auto");
    setPage(1);
  }

  function updateQuery(nextQuery) {
    setQuery(nextQuery);
    setPage(1);
  }

  return (
    <div className="installer-shell">
      <div className="installer-toolbar">
        <div>
          <p className="eyebrow">Instalator</p>
          <h3>Dodatki Minecraft</h3>
          <small>
            Zrodlo: {getSourceLabel(source)}. Loader: {getLoaderLabel(loader, autoLoader)}.
            Pliki trafiaja automatycznie do mods/, plugins/, resourcepacks/,
            shaderpacks/ albo modpacks/.
          </small>
        </div>
        <button className="ghost-button compact" onClick={() => setRefreshKey((current) => current + 1)}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          <span>Odswiez</span>
        </button>
      </div>

      <div className="installer-controls">
        <label className="installer-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Szukaj..."
          />
        </label>
        <select value={type} onChange={(event) => updateType(event.target.value)}>
          {INSTALLER_TYPES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setPage(1);
          }}
        >
          {ADDON_SOURCES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <select
          value={loader}
          onChange={(event) => {
            setLoader(event.target.value);
            setPage(1);
          }}
        >
          {loaderOptions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id === "auto" && autoLoader
                ? `${entry.label}: ${autoLoader}`
                : entry.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          {SORT_OPTIONS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <label className="checkbox-field installer-version-toggle">
        <input
          type="checkbox"
          checked={matchVersion}
          onChange={(event) => {
            setMatchVersion(event.target.checked);
            setPage(1);
          }}
        />
        <span>
          Dopasuj do wersji serwera {gameVersion ? `(${gameVersion})` : "(auto)"}
        </span>
      </label>

      {source === "curseforge" ? (
        <div className="banner info">
          CurseForge dziala przez oficjalne API i wymaga CURSEFORGE_API_KEY w .env.
          Bez klucza panel pokaze blad zamiast wynikow.
        </div>
      ) : null}

      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}
      {payload.warning ? <div className="banner info">{payload.warning}</div> : null}

      <div className="installer-list">
        {loading ? (
          <div className="empty-block">Ladowanie dodatkow...</div>
        ) : payload.hits.length === 0 ? (
          <div className="empty-block">Brak wynikow dla tej kategorii.</div>
        ) : (
          payload.hits.map((project) => (
            <button
              key={`${project.source || source}:${project.id}`}
              className="installer-row"
              type="button"
              onClick={() => openProject(project)}
            >
              <span className="installer-icon">
                <AddonIcon project={project} />
              </span>
              <span className="installer-row-copy">
                <strong>{project.title}</strong>
                <small>{project.description}</small>
              </span>
              <span className="installer-row-meta">
                <span>{getSourceLabel(project.source || source)}</span>
                <span>{formatNumber(project.downloads)} pobran</span>
                <span>{project.latest_version || "auto"}</span>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="installer-footer">
        <span>
          Wyswietlanie {payload.hits.length ? (page - 1) * payload.limit + 1 : 0} -{" "}
          {Math.min(page * payload.limit, payload.total_hits || 0)} z{" "}
          {formatNumber(payload.total_hits)} wynikow.
        </span>
        <div className="installer-pagination">
          <button
            className="ghost-button compact"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            «
          </button>
          <span>{page}</span>
          <button
            className="ghost-button compact"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            »
          </button>
        </div>
      </div>

      {selectedProject ? (
        <div className="modal-backdrop installer-modal-backdrop">
          <div className="modal-card installer-modal">
            <button
              className="icon-button installer-modal-close"
              type="button"
              onClick={() => setSelectedProject(null)}
            >
              <X size={18} />
            </button>
            <div className="installer-modal-head">
              <span className="installer-modal-icon">
                <AddonIcon project={selectedProject} />
              </span>
              <div>
                <p className="eyebrow">{getTypeLabel(type)}</p>
                <h3>{selectedProject.title}</h3>
                <p>{selectedProject.description}</p>
              </div>
            </div>

            <div className="installer-meta-grid">
              <span>
                <strong>Autor:</strong> {selectedProject.author || "Brak"}
              </span>
              <span>
                <strong>Kategorie:</strong>{" "}
                {(selectedProject.display_categories || selectedProject.categories || [])
                  .slice(0, 6)
                  .join(", ") || "Brak"}
              </span>
              <span>
                <strong>Obserwujacy:</strong> {formatNumber(selectedProject.follows)}
              </span>
              <span>
                <strong>Ostatnia aktualizacja:</strong> {formatDate(selectedProject.date_modified)}
              </span>
              <span>
                <strong>Pobrania:</strong> {formatNumber(selectedProject.downloads)}
              </span>
              <span>
                <strong>Zrodlo:</strong> {getSourceLabel(selectedProject.source || source)}
              </span>
            </div>

            <label className="wide">
              Wybierz wersje
              <select
                value={selectedVersionId}
                onChange={(event) => setSelectedVersionId(event.target.value)}
                disabled={modalLoading || versions.length === 0}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name || version.version_number} ({version.version_number})
                  </option>
                ))}
              </select>
              <small>
                {modalLoading
                  ? "Ladowanie wersji..."
                  : selectedVersion
                    ? `${selectedVersion.file_name || "plik"} | ${formatNumber(
                        selectedVersion.file_size,
                        " B"
                      )}`
                    : "Brak wersji pasujacych do aktualnego filtra."}
              </small>
            </label>

            {selectedVersion ? (
              <div className="info-card">
                <VersionLabel version={selectedVersion} />
              </div>
            ) : null}

            <div className="form-actions wide">
              <a
                className="ghost-button"
                href={getProjectUrl(selectedProject, type)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} />
                <span>{getSourceLabel(selectedProject.source || source)}</span>
              </a>
              <button className="danger-button" type="button" onClick={() => setSelectedProject(null)}>
                Anuluj
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={installSelectedProject}
                disabled={installing || modalLoading || !selectedVersionId}
              >
                {installing ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                <span>{installing ? "Instalowanie..." : "Zainstaluj"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
