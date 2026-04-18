import { useState } from "react";
import { LockKeyhole, LogIn, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";

import logoUrl from "../assets/bytehost.png";
import { ThemeToggle } from "../components/ThemeToggle";

export function LoginPage({ onLogin, onRegister, loading, theme, onToggleTheme, mode = "login" }) {
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: ""
  });
  const [registerForm, setRegisterForm] = useState({
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isRegisterMode = mode === "register";

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await onLogin(loginForm);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      if (registerForm.password !== registerForm.confirmPassword) {
        throw new Error("Hasla musza byc takie same.");
      }

      await onRegister({
        email: registerForm.email,
        password: registerForm.password
      });

      setRegisterForm({
        email: "",
        password: "",
        confirmPassword: ""
      });
      setSuccess("Konto zostało utworzone. Owner musi je teraz aktywować i ustawić limity.");
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-topbar">
          <Link className="ghost-button compact" to="/">
            Wróć na start
          </Link>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <div className="brand login-brand">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div className="brand-copy">
            <strong>ByteHost</strong>
          </div>
        </div>

        <div className="tab-row auth-tab-row">
          <Link className={`tab-button ${!isRegisterMode ? "active" : ""}`} to="/login">
            Logowanie
          </Link>
          <Link className={`tab-button ${isRegisterMode ? "active" : ""}`} to="/register">
            Załóż konto
          </Link>
        </div>

        <div className="login-copy">
          <p className="eyebrow">{isRegisterMode ? "Rejestracja" : "Logowanie"}</p>
          <h1>
            {isRegisterMode
              ? "Utworz konto i poczekaj na aktywacje ownera."
              : "Wejdź do swojego panelu ByteHost."}
          </h1>
          <p>
            {isRegisterMode
              ? "Użytkownik może założyć konto sam, ale owner musi je zatwierdzić w panelu admina i ustawić limity."
              : "Jeśli Twoje konto nie jest jeszcze aktywne, owner musi je zatwierdzić i ustawić plan zasobów."}
          </p>
        </div>

        {!isRegisterMode ? (
          <form className="form-grid login-form" onSubmit={handleLoginSubmit}>
            <label className="wide">
              Email
              <input
                type="email"
                autoComplete="username"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="owner@bytehost.online"
              />
            </label>

            <label className="wide">
              Haslo
              <input
                type="password"
                autoComplete="current-password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="********"
              />
            </label>

            <div className="info-card info-card-inline wide">
              <LockKeyhole size={18} />
              <span>Sesja jest bezpieczna, a hasła są przechowywane jako zaszyfrowany hash.</span>
            </div>

            <div className="form-actions wide">
              <button className="primary-button" type="submit" disabled={loading || submitting}>
                <LogIn size={16} />
                <span>{submitting ? "Logowanie..." : "Zaloguj sie"}</span>
              </button>
            </div>
          </form>
        ) : (
          <form className="form-grid login-form" onSubmit={handleRegisterSubmit}>
            <label className="wide">
              Email
              <input
                type="email"
                autoComplete="email"
                value={registerForm.email}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="uzytkownik@bytehost.online"
              />
            </label>

            <label>
              Haslo
              <input
                type="password"
                autoComplete="new-password"
                value={registerForm.password}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Minimum 8 znakow"
              />
            </label>

            <label>
              Powtorz haslo
              <input
                type="password"
                autoComplete="new-password"
                value={registerForm.confirmPassword}
                onChange={(event) =>
                  setRegisterForm((current) => ({
                    ...current,
                    confirmPassword: event.target.value
                  }))
                }
                placeholder="Powtorz haslo"
              />
            </label>

            <div className="info-card info-card-inline wide">
              <UserPlus size={18} />
              <span>
                Po rejestracji konto trafi do panelu ownera jako oczekujace. Owner aktywuje je i
                ustawi RAM, CPU, storage oraz liczbę botów.
              </span>
            </div>

            <div className="form-actions wide">
              <button className="primary-button" type="submit" disabled={submitting}>
                <UserPlus size={16} />
                <span>{submitting ? "Tworzenie konta..." : "Utworz konto"}</span>
              </button>
            </div>
          </form>
        )}

        {success ? <div className="banner success">{success}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </div>
  );
}
