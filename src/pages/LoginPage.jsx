import { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { Link } from "react-router-dom";

import logoUrl from "../assets/bytehost-logo.svg";
import { ThemeToggle } from "../components/ThemeToggle";

export function LoginPage({ onLogin, loading, theme, onToggleTheme }) {
  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onLogin(form);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-topbar">
          <Link className="ghost-button compact" to="/">
            Wroc na start
          </Link>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <div className="brand login-brand">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div className="brand-copy">
            <strong>ByteHost</strong>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">Logowanie</p>
          <h1>Wejdz do swojego panelu ByteHost.</h1>
          <p>
            Rejestracja publiczna jest wylaczona. Konta tworzy tylko owner z panelu
            administracyjnego.
          </p>
        </div>

        <form className="form-grid login-form" onSubmit={handleSubmit}>
          <label className="wide">
            Email
            <input
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="owner@bytehost.online"
            />
          </label>

          <label className="wide">
            Haslo
            <input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="********"
            />
          </label>

          <div className="info-card info-card-inline wide">
            <LockKeyhole size={18} />
            <span>Sesja dziala na JWT, a hasla sa przechowywane jako hash bcrypt.</span>
          </div>

          <div className="form-actions wide">
            <button className="primary-button" type="submit" disabled={loading || submitting}>
              <LogIn size={16} />
              <span>{submitting ? "Logowanie..." : "Zaloguj sie"}</span>
            </button>
          </div>
        </form>

        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </div>
  );
}
