import { useEffect, useState } from "react";
import { Plus, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import { api } from "../api";
import { GAME_SERVICE_PRESETS, GAME_SERVICE_TYPES } from "../gameServices";
import {
  accountStatusLabel,
  formatDate,
  formatLimitValue,
  formatMemoryLimit,
  fromDatetimeLocal,
  gbInputToMb,
  mbToGbInput,
  serviceTypeLabel,
  toDatetimeLocal,
  userRoleLabel
} from "../utils";

const HOSTING_SERVICE_OPTIONS = [
  { id: "discord_bot", label: "Bot Discord" },
  { id: "minecraft_server", label: "Serwer Minecraft" },
  { id: "fivem_server", label: "Serwer FiveM" },
  ...GAME_SERVICE_TYPES.map((serviceType) => ({
    id: serviceType,
    label: GAME_SERVICE_PRESETS[serviceType].label
  }))
];

function normalizeAllowedServices(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function buildUserForm(user) {
  return {
    email: user.email || "",
    password: "",
    max_bots: user.max_bots ?? "",
    max_ram_mb: mbToGbInput(user.max_ram_mb, ""),
    max_cpu_percent: user.max_cpu_percent ?? "",
    max_storage_mb: mbToGbInput(user.max_storage_mb, ""),
    expires_at: toDatetimeLocal(user.expires_at),
    is_active: Boolean(user.is_active),
    pending_approval: Boolean(user.pending_approval),
    allowed_service_types: normalizeAllowedServices(user.allowed_service_types)
  };
}

function ServiceAccessPicker({ value, disabled, onChange }) {
  const selected = new Set(normalizeAllowedServices(value));

  function toggleService(serviceType, checked) {
    const next = new Set(selected);
    if (checked) {
      next.add(serviceType);
    } else {
      next.delete(serviceType);
    }
    onChange([...next]);
  }

  return (
    <div className="service-access-grid">
      {HOSTING_SERVICE_OPTIONS.map((option) => (
        <label className="checkbox-field service-access-option" key={option.id}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={selected.has(option.id)}
            onChange={(event) => toggleService(option.id, event.target.checked)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [userForms, setUserForms] = useState({});
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    max_bots: 3,
    max_ram_mb: 2,
    max_cpu_percent: 100,
    max_storage_mb: 2,
    expires_at: "",
    is_active: true,
    allowed_service_types: []
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pendingUsers = users.filter((user) => user.pending_approval);

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const nextUsers = await api.getUsers();
      setUsers(nextUsers);
      setUserForms(Object.fromEntries(nextUsers.map((user) => [user.id, buildUserForm(user)])));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    setError("");

    try {
      await api.createUser({
        ...createForm,
        max_ram_mb: gbInputToMb(createForm.max_ram_mb, createForm.max_ram_mb),
        max_storage_mb: gbInputToMb(createForm.max_storage_mb, createForm.max_storage_mb),
        expires_at: fromDatetimeLocal(createForm.expires_at)
      });
      setCreateForm({
        email: "",
        password: "",
        max_bots: 3,
        max_ram_mb: 2,
        max_cpu_percent: 100,
        max_storage_mb: 2,
        expires_at: "",
        is_active: true,
        allowed_service_types: []
      });
      setMessage("Nowe konto zostalo utworzone.");
      await loadUsers();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveUser(user) {
    setSavingId(user.id);
    setMessage("");
    setError("");

    try {
      const form = userForms[user.id];
      const payload = {
        ...form,
        max_ram_mb: gbInputToMb(form.max_ram_mb, form.max_ram_mb),
        max_storage_mb: gbInputToMb(form.max_storage_mb, form.max_storage_mb),
        expires_at: fromDatetimeLocal(form.expires_at)
      };

      if (!form.password) {
        delete payload.password;
      }

      await api.updateUser(user.id, payload);
      setMessage(`Zapisano konto ${user.email}.`);
      await loadUsers();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingId("");
    }
  }

  async function handleApproveUser(user) {
    setSavingId(user.id);
    setMessage("");
    setError("");

    try {
      const form = userForms[user.id];
      const payload = {
        ...form,
        is_active: true,
        pending_approval: false,
        max_ram_mb: gbInputToMb(form.max_ram_mb, form.max_ram_mb),
        max_storage_mb: gbInputToMb(form.max_storage_mb, form.max_storage_mb),
        expires_at: fromDatetimeLocal(form.expires_at)
      };

      if (!form.password) {
        delete payload.password;
      }

      await api.updateUser(user.id, payload);
      setMessage(`Konto ${user.email} zostalo aktywowane.`);
      await loadUsers();
    } catch (approveError) {
      setError(approveError.message);
    } finally {
      setSavingId("");
    }
  }

  async function handleDeleteUser(user) {
    if (!window.confirm(`Usunac konto ${user.email} razem z jego uslugami?`)) {
      return;
    }

    setSavingId(user.id);
    setMessage("");
    setError("");

    try {
      await api.deleteUser(user.id);
      setMessage(`Usunieto konto ${user.email}.`);
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="page-grid">
      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Owner</p>
            <h3>Tworzenie użytkownika</h3>
          </div>
          <UserPlus size={18} />
        </div>

        <form className="form-grid" onSubmit={handleCreate}>
          <label>
            Email
            <input
              type="email"
              value={createForm.email}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <label>
            Hasło
            <input
              type="password"
              value={createForm.password}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, password: event.target.value }))
              }
            />
          </label>
          <label>
            Maksymalna liczba botów
            <input
              type="number"
              value={createForm.max_bots}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, max_bots: event.target.value }))
              }
            />
          </label>
          <label>
            Limit RAM (GB)
            <input
              type="number"
              step="0.25"
              value={createForm.max_ram_mb}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, max_ram_mb: event.target.value }))
              }
            />
            <small>Wpisz w GB. `1` oznacza 1024 MB.</small>
          </label>
          <label>
            Limit CPU (%)
            <input
              type="number"
              value={createForm.max_cpu_percent}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, max_cpu_percent: event.target.value }))
              }
            />
          </label>
          <label>
            Limit storage (GB)
            <input
              type="number"
              step="1"
              value={createForm.max_storage_mb}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, max_storage_mb: event.target.value }))
              }
            />
            <small>Wpisz w GB, np. 260 = 266240 MB.</small>
          </label>
          <label>
            Konto wygasa
            <input
              type="datetime-local"
              value={createForm.expires_at}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, expires_at: event.target.value }))
              }
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, is_active: event.target.checked }))
              }
            />
            <span>Konto aktywne</span>
          </label>

          <div className="wide service-access-panel">
            <strong>Dozwolony hosting</strong>
            <small>
              Jeśli nic nie zaznaczysz, konto może się zalogować i obejrzeć panel, ale nie utworzy żadnej usługi.
            </small>
            <ServiceAccessPicker
              value={createForm.allowed_service_types}
              onChange={(allowedServiceTypes) =>
                setCreateForm((current) => ({
                  ...current,
                  allowed_service_types: allowedServiceTypes
                }))
              }
            />
          </div>

          <div className="form-actions wide">
            <button className="primary-button" type="submit" disabled={creating}>
              <Plus size={16} />
              <span>{creating ? "Tworzenie..." : "Utwórz konto"}</span>
            </button>
          </div>
        </form>

        {message ? <div className="banner success">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Użytkownicy</p>
            <h3>Konta i plany zasobów</h3>
          </div>
          <ShieldCheck size={18} />
        </div>

        {loading ? (
          <div className="empty-block">Ładowanie kont...</div>
        ) : users.length === 0 ? (
          <div className="empty-block">Brak kont do wyświetlenia.</div>
        ) : (
          <div className="user-admin-grid">
            {pendingUsers.length > 0 ? (
              <div className="info-card wide">
                {`Konta oczekujące na aktywację: ${pendingUsers.length}. Ustaw limity i kliknij "Aktywuj konto".`}
              </div>
            ) : null}

            {users.map((user) => {
              const form = userForms[user.id] || buildUserForm(user);
              const isOwner = user.role === "owner";

              return (
                <article className="summary-tile user-admin-card" key={user.id}>
                  <div className="section-header compact-header">
                    <div>
                      <strong>{user.email}</strong>
                      <small>{`${userRoleLabel(user.role)} | ${accountStatusLabel(user.account_status)}`}</small>
                    </div>
                    <div className="workspace-actions">
                      {user.pending_approval && !isOwner ? (
                        <span className="status-pill warning">Oczekuje</span>
                      ) : null}
                      {!isOwner ? (
                        <button
                          className="danger-button compact"
                          onClick={() => handleDeleteUser(user)}
                          disabled={savingId === user.id}
                        >
                          <Trash2 size={14} />
                          <span>Usuń</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="user-meta-grid">
                    <span>Wygasa: {formatDate(user.expires_at)}</span>
                    <span>Boty: {formatLimitValue(user.max_bots)}</span>
                    <span>RAM: {formatMemoryLimit(user.max_ram_mb)}</span>
                    <span>CPU: {formatLimitValue(user.max_cpu_percent, "%")}</span>
                    <span>Storage: {formatLimitValue(user.max_storage_mb, " MB")}</span>
                    <span>
                      Hosting:{" "}
                      {isOwner
                        ? "Wszystko"
                        : normalizeAllowedServices(user.allowed_service_types)
                            .map(serviceTypeLabel)
                            .join(", ") || "Brak"}
                    </span>
                  </div>

                  <div className="form-grid nested-form">
                    <label>
                      Email
                      <input
                        value={form.email}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], email: event.target.value }
                          }))
                        }
                      />
                    </label>
                    <label>
                      Nowe hasło
                      <input
                        type="password"
                        placeholder={isOwner ? "Opcjonalna zmiana ownera" : "Opcjonalne"}
                        value={form.password}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], password: event.target.value }
                          }))
                        }
                      />
                    </label>
                    <label>
                      Maksymalna liczba botów
                      <input
                        type="number"
                        disabled={isOwner}
                        value={form.max_bots}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], max_bots: event.target.value }
                          }))
                        }
                      />
                    </label>
                    <label>
                      Limit RAM (GB)
                      <input
                        type="number"
                        disabled={isOwner}
                        step="0.25"
                        value={form.max_ram_mb}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], max_ram_mb: event.target.value }
                          }))
                        }
                      />
                      <small>Wpisz w GB. ByteHost zapisze to jako MB.</small>
                    </label>
                    <label>
                      Limit CPU (%)
                      <input
                        type="number"
                        disabled={isOwner}
                        value={form.max_cpu_percent}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], max_cpu_percent: event.target.value }
                          }))
                        }
                      />
                    </label>
                    <label>
                      Limit storage (GB)
                      <input
                        type="number"
                        disabled={isOwner}
                        step="1"
                        value={form.max_storage_mb}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], max_storage_mb: event.target.value }
                          }))
                        }
                      />
                      <small>Wpisz w GB. ByteHost zapisze to jako MB.</small>
                    </label>
                    <label>
                      Konto wygasa
                      <input
                        type="datetime-local"
                        disabled={isOwner}
                        value={form.expires_at}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], expires_at: event.target.value }
                          }))
                        }
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        disabled={isOwner}
                        checked={form.is_active}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], is_active: event.target.checked }
                          }))
                        }
                      />
                      <span>Konto aktywne</span>
                    </label>
                    <div className="wide service-access-panel">
                      <strong>Dozwolony hosting</strong>
                      <small>
                        Zaznacz typy usług, które ten użytkownik może sam tworzyć. Limity RAM/CPU/storage nadal ustawiasz tylko tutaj.
                      </small>
                      <ServiceAccessPicker
                        disabled={isOwner}
                        value={form.allowed_service_types}
                        onChange={(allowedServiceTypes) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: {
                              ...current[user.id],
                              allowed_service_types: allowedServiceTypes
                            }
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      className="primary-button compact"
                      onClick={() => handleSaveUser(user)}
                      disabled={savingId === user.id}
                    >
                      <Save size={14} />
                      <span>{savingId === user.id ? "Zapisywanie..." : "Zapisz konto"}</span>
                    </button>
                    {user.pending_approval && !isOwner ? (
                      <button
                        className="ghost-button compact"
                        onClick={() => handleApproveUser(user)}
                        disabled={savingId === user.id}
                      >
                        <ShieldCheck size={14} />
                        <span>{savingId === user.id ? "Aktywacja..." : "Aktywuj konto"}</span>
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
