import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Clock3,
  FolderTree,
  Gamepad2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users
} from "lucide-react";

import logoUrl from "../assets/bytehost.png";
import { ThemeToggle } from "../components/ThemeToggle";

const PANEL_URL = "/login";

const offerCards = [
  {
    icon: Bot,
    title: "Discord bot hosting",
    text: "Wgrywasz projekt, a panel prowadzi Cię przez konfigurację, pliki, logi i uruchamianie bota."
  },
  {
    icon: Gamepad2,
    title: "Minecraft Java",
    text: "Serwer z wyborem wersji, własnymi plikami, konsolą, backupami i wygodnym zarządzaniem."
  },
  {
    icon: Users,
    title: "FiveM hosting",
    text: "Panel przygotowuje środowisko pod serwer, resources, konfigurację i publiczny adres połączenia."
  }
];

const workflowSteps = [
  {
    step: "01",
    title: "Zakładasz konto albo logujesz się",
    text: "Nowe konto trafia do ownera, który aktywuje dostęp i przypisuje odpowiedni plan."
  },
  {
    step: "02",
    title: "Dostajesz usługę",
    text: "Owner nadaje plan, a Ty widzisz swoje serwery, limity, pliki i statusy w panelu."
  },
  {
    step: "03",
    title: "Konfigurujesz i startujesz",
    text: "Konfigurujesz pliki, konsolę, logi, backupy i start usługi z jednego miejsca."
  }
];

const faqItems = [
  {
    question: "Czy ByteHost to profesjonalny panel hostingowy?",
    answer:
      "Tak. ByteHost działa jak własny panel hostingowy z kontami, limitami, usługami, plikami, logami i konsolą."
  },
  {
    question: "Czy mogę hostować Discord, Minecraft i FiveM?",
    answer:
      "Tak. Każdy typ usługi ma oddzielne ustawienia, własne pliki, limity i widok zarządzania."
  },
  {
    question: "Czy użytkownik może sam założyć konto?",
    answer:
      "Tak. Rejestracja tworzy konto oczekujące, a owner aktywuje je w panelu admina i ustawia limity."
  }
];

function FaqItem({ item, open, onToggle, index }) {
  return (
    <article className={`marketing-faq-item reveal-up delay-${index + 1} ${open ? "open" : ""}`}>
      <button className="marketing-faq-trigger" type="button" onClick={onToggle}>
        <span>{item.question}</span>
        <ChevronDown size={18} />
      </button>
      {open ? <p>{item.answer}</p> : null}
    </article>
  );
}

export function LandingPage({ theme, onToggleTheme }) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="marketing-shell">
      <header className="marketing-header reveal-up">
        <Link className="brand marketing-brand" to="/">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div className="brand-copy">
            <strong>ByteHost</strong>
            <span>Profesjonalny hosting z własnym panelem</span>
          </div>
        </Link>

        <nav className="marketing-nav">
          <a href="#offer">Oferta</a>
          <a href="#workflow">Jak to działa</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="marketing-header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Link className="ghost-button" to="/register">
            Załóż konto
          </Link>
          <a className="ghost-button" href={PANEL_URL}>
            Logowanie
          </a>
        </div>
      </header>

      <main className="marketing-main">
        <section className="marketing-hero marketing-hero-clean">
          <div className="marketing-hero-copy reveal-up delay-1">
            <p className="marketing-kicker">
              <Sparkles size={16} />
              ByteHost hosting panel
            </p>
            <h1>Profesjonalny hosting z własnym panelem ByteHost.</h1>
            <p className="marketing-hero-text">
              ByteHost to nowoczesna strona hostingowa z autorskim panelem do usług Discord,
              Minecraft, FiveM i innych serwerów gier. Wszystko jest ułożone prosto: konto,
              plan, usługa, pliki, konsola, backupy i szybkie zarządzanie.
            </p>

            <div className="marketing-hero-actions">
              <a className="primary-button" href={PANEL_URL}>
                <span>Wejdź do panelu</span>
                <ArrowRight size={16} />
              </a>
              <Link className="ghost-button" to="/register">
                Załóż konto
              </Link>
            </div>

            <div className="marketing-pill-row">
              <span>Własny panel klienta</span>
              <span>Serwery gier i boty</span>
              <span>Konta i plany</span>
              <span>Light / dark mode</span>
            </div>
          </div>

          <div className="marketing-hero-visual reveal-up delay-2">
            <div className="marketing-orb orb-one" />
            <div className="marketing-orb orb-two" />
            <img className="marketing-hero-logo" src={logoUrl} alt="ByteHost logo" />

            <article className="marketing-floating-card floating-left">
              <Bot size={16} />
              <div>
                <strong>Discord bots</strong>
                <span>Pliki, logi i konsola</span>
              </div>
            </article>

            <article className="marketing-floating-card floating-right">
              <Gamepad2 size={16} />
              <div>
                <strong>Minecraft + FiveM</strong>
                <span>Panel + publiczny adres</span>
              </div>
            </article>
          </div>
        </section>

        <section className="marketing-section" id="offer">
          <div className="marketing-section-heading centered reveal-up">
            <p className="eyebrow">Oferta</p>
            <h2>Najważniejsze funkcje bez przeładowanej strony głównej.</h2>
          </div>

          <div className="marketing-card-grid three compact-grid">
            {offerCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className={`marketing-feature-card reveal-up delay-${index + 1}`}>
                  <div className="marketing-feature-icon">
                    <Icon size={18} />
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="marketing-section" id="workflow">
          <div className="marketing-section-heading centered reveal-up">
            <p className="eyebrow">Jak to działa</p>
            <h2>Prosty workflow od konta do działającej usługi.</h2>
          </div>

          <div className="marketing-card-grid three compact-grid">
            {workflowSteps.map((step, index) => (
              <article key={step.step} className={`marketing-step-card reveal-up delay-${index + 1}`}>
                <span>{step.step}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section marketing-band-section reveal-up">
          <div className="marketing-band-card">
            <div>
              <p className="eyebrow">W panelu dostajesz</p>
              <h2>Mniej chaosu, więcej kontroli.</h2>
            </div>

            <div className="marketing-band-points">
              <span>
                <FolderTree size={16} />
                File manager
              </span>
              <span>
                <TerminalSquare size={16} />
                Logi i diagnostyka
              </span>
              <span>
                <ShieldCheck size={16} />
                Limity i aktywacja kont
              </span>
              <span>
                <Clock3 size={16} />
                Backupy i zarządzanie
              </span>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="faq">
          <div className="marketing-section-heading centered reveal-up">
            <p className="eyebrow">FAQ</p>
            <h2>Najwazniejsze pytania przed zalogowaniem.</h2>
          </div>

          <div className="marketing-faq-list">
            {faqItems.map((item, index) => (
              <FaqItem
                key={item.question}
                item={item}
                index={index}
                open={openFaq === index}
                onToggle={() => setOpenFaq((current) => (current === index ? -1 : index))}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="marketing-footer reveal-up">
        <div className="marketing-footer-brand">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div>
            <strong>ByteHost</strong>
            <span>Profesjonalny hosting botów i serwerów z własnym panelem administracyjnym.</span>
          </div>
        </div>

        <div className="marketing-footer-links">
          <a href="#offer">Oferta</a>
          <a href="#workflow">Jak to działa</a>
          <a href="#faq">FAQ</a>
          <a href={PANEL_URL}>Logowanie</a>
        </div>
      </footer>
    </div>
  );
}
