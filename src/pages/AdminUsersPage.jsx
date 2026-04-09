import { useEffect, useState } from "react";
import { Plus, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import { api } from "../api";
import { accountStatusLabel, formatDate, formatNumber, fromDatetimeLocal, toDatetimeLocal, userRoleLabel } from "../utils";

function buildUserForm(user) {
  return {
    email: user.email || "",
    password: "",
    max_bots: user.max_bots ?? "",
    max_ram_mb: user.max_ram_mb ?? "",
    max_cpu_percent: user.max_cpu_percent ?? "",
    max_storage_mb: user.max_storage_mb ?? "",
    expires_at: toDatetimeLocal(user.expires_at),
    is_active: Boolean(user.is_active)
  };
}

function formatPlanValue(value, suffix = "") {
  if (value === null || value === undefined || value === "" || Number(value) === 0) {
    return `Bez limitu${suffix ? ` ${suffix.trim()}` : ""}`.trim();
  }

  return formatNumber(value, suffix);
}

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [userForms, setUserForms] = useState({});
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    max_bots: 3,
    max_ram_mb: 2048,
    max_cpu_percent: 100,
    max_storage_mb: 2048,
    expires_at: "",
    is_active: true
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const nextUsers = await api.getUsers();
      setUsers(nextUsers);
      setUserForms(
        Object.fromEntries(nextUsers.map((user) => [user.id, buildUserForm(user)]))
      );
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
        expires_at: fromDatetimeLocal(createForm.expires_at)
      });
      setCreateForm({
        email: "",
        password: "",
        max_bots: 3,
        max_ram_mb: 2048,
        max_cpu_percent: 100,
        max_storage_mb: 2048,
        expires_at: "",
        is_active: true
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
            <h3>Tworzenie uzytkownika</h3>
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
            Haslo
            <input
              type="password"
              value={createForm.password}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, password: event.target.value }))
              }
            />
          </label>
          <label>
            Maksymalna liczba botow
            <input
              type="number"
              value={createForm.max_bots}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, max_bots: event.target.value }))
              }
            />
          </label>
          <label>
            Limit RAM (MB)
            <input
              type="number"
              value={createForm.max_ram_mb}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, max_ram_mb: event.target.value }))
              }
            />
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
            Limit storage (MB)
            <input
              type="number"
              value={createForm.max_storage_mb}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, max_storage_mb: event.target.value }))
              }
            />
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

          <div className="form-actions wide">
            <button className="primary-button" type="submit" disabled={creating}>
              <Plus size={16} />
              <span>{creating ? "Tworzenie..." : "Utworz konto"}</span>
            </button>
          </div>
        </form>

        {message ? <div className="banner success">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      <section className="panel-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Uzytkownicy</p>
            <h3>Konta i plany zasobow</h3>
          </div>
          <ShieldCheck size={18} />
        </div>

        {loading ? (
          <div className="empty-block">Ladowanie kont...</div>
        ) : users.length === 0 ? (
          <div className="empty-block">Brak kont do wyswietlenia.</div>
        ) : (
          <div className="user-admin-grid">
            {users.map((user) => {
              const form = userForms[user.id] || buildUserForm(user);
              const isOwner = user.role === "owner";

              return (
                <article className="summary-tile user-admin-card" key={user.id}>
                  <div className="section-header compact-header">
                    <div>
                      <strong>{user.email}</strong>
                      <small>
                        {userRoleLabel(user.role)} · {accountStatusLabel(user.account_status)}
                      </small>
                    </div>
                    {!isOwner ? (
                      <button
                        className="danger-button compact"
                        onClick={() => handleDeleteUser(user)}
                        disabled={savingId === user.id}
                      >
                        <Trash2 size={14} />
                        <span>Usun</span>
                      </button>
                    ) : null}
                  </div>

                  <div className="user-meta-grid">
                    <span>Wygasa: {formatDate(user.expires_at)}</span>
                    <span>Boty: {formatPlanValue(user.max_bots)}</span>
                    <span>RAM: {formatPlanValue(user.max_ram_mb, " MB")}</span>
                    <span>CPU: {formatPlanValue(user.max_cpu_percent, "%")}</span>
                    <span>Storage: {formatPlanValue(user.max_storage_mb, " MB")}</span>
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
                      Nowe haslo
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
                      Maksymalna liczba botow
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
                      Limit RAM (MB)
                      <input
                        type="number"
                        disabled={isOwner}
                        value={form.max_ram_mb}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], max_ram_mb: event.target.value }
                          }))
                        }
                      />
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
                      Limit storage (MB)
                      <input
                        type="number"
                        disabled={isOwner}
                        value={form.max_storage_mb}
                        onChange={(event) =>
                          setUserForms((current) => ({
                            ...current,
                            [user.id]: { ...current[user.id], max_storage_mb: event.target.value }
                          }))
                        }
                      />
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
