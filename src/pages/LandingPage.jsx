import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Clock3,
  FolderTree,
  Gamepad2,
  HardDrive,
  PanelTop,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users
} from "lucide-react";

import logoUrl from "../assets/bytehost-logo.svg";
import { ThemeToggle } from "../components/ThemeToggle";

const offerCards = [
  {
    icon: Bot,
    title: "Discord bot hosting",
    text: "Wrzucasz ZIP lub RAR, ByteHost wykrywa jezyk, plik startowy, komende i odpala proces przez PM2."
  },
  {
    icon: Gamepad2,
    title: "Minecraft Java",
    text: "Tworzysz serwer bez pliku albo z wlasnym JAR-em, ustawiasz wersje, EULA i dalej zarzadzasz wszystkim z panelu."
  },
  {
    icon: Users,
    title: "Owner i uzytkownicy",
    text: "Tworzysz konta bez rejestracji publicznej, ustawiasz limity planu, wygasanie i dostep tylko do swoich uslug."
  }
];

const featureCards = [
  {
    icon: FolderTree,
    title: "Prawdziwy file manager",
    text: "Edycja plikow, .env, upload, foldery, kasowanie i podglad projektu bez wychodzenia z panelu."
  },
  {
    icon: TerminalSquare,
    title: "Logi i konsola",
    text: "Masz logi procesu, diagnostyke bledow startu, komende startowa i szybki podglad stanu uslugi."
  },
  {
    icon: ShieldCheck,
    title: "Limity i kontrola",
    text: "Boty, RAM, CPU i storage sa ograniczane planem lub ustawieniami ownera, wiec nic nie wyjdzie poza pulpit."
  },
  {
    icon: Clock3,
    title: "Auto restart i expire",
    text: "PM2 pilnuje restartow, scheduler sprawdza wygasniecia, a panel oznacza crash loop i zablokowane uslugi."
  }
];

const workflowSteps = [
  {
    step: "01",
    title: "Zaloguj sie do panelu",
    text: "Owner tworzy konto, a Ty dostajesz gotowe dane do logowania bez publicznej rejestracji."
  },
  {
    step: "02",
    title: "Dodaj projekt lub serwer",
    text: "Bot Discord, Minecraft lub prywatna usluga trafia do panelu z poprawnie wykrytym typem i limitem."
  },
  {
    step: "03",
    title: "Skonfiguruj srodowisko",
    text: "Ustawiasz .env, wersje, RAM, expire date, auto restart i wszystko, czego wymaga projekt."
  },
  {
    step: "04",
    title: "Uruchom i monitoruj",
    text: "Start, stop, restart, reinstall, logi, file manager i publiczny routing do panelu sa pod reka."
  }
];

const faqItems = [
  {
    question: "Czy ByteHost jest prawdziwym hostingiem, a nie mockupem?",
    answer:
      "Tak. Panel operuje na realnych plikach, uruchamia procesy przez PM2, zapisuje logi i pilnuje limitow oraz wygasniec."
  },
  {
    question: "Czy moge hostowac Discord bota i Minecraft z jednego miejsca?",
    answer:
      "Tak. ByteHost laczy oba scenariusze w jednym panelu, ale zachowuje osobne wykrywanie projektu, komendy startu i konfiguracje."
  },
  {
    question: "Czy uzytkownik widzi tylko swoje uslugi?",
    answer:
      "Tak. Konto user ma dostep tylko do przypisanych uslug, swoich limitow i wlasnych danych. Owner widzi caly system."
  },
  {
    question: "Czy moge uruchomic panel w jasnym i ciemnym motywie?",
    answer:
      "Tak. Strona startowa, logowanie i panel maja przelacznik motywu, a wybrany wyglad zapisuje sie lokalnie w przegladarce."
  }
];

function FaqItem({ item, open, onClick }) {
  return (
    <article className={`landing-faq-item ${open ? "open" : ""}`}>
      <button className="landing-faq-trigger" type="button" onClick={onClick}>
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
    <div className="landing-shell">
      <header className="landing-header">
        <Link className="brand" to="/">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div className="brand-copy">
            <strong>ByteHost</strong>
          </div>
        </Link>

        <nav className="landing-nav">
          <a href="#offer">Oferta</a>
          <a href="#panel">Panel</a>
          <a href="#workflow">Jak dziala</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="landing-header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Link className="ghost-button" to="/login">
            Zaloguj
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-kicker">
              <Sparkles size={16} />
              Prywatny hosting botow Discord i serwerow Minecraft
            </p>
            <h1>ByteHost daje Ci panel hostingu, ktory wyglada nowoczesnie i robi realna robote.</h1>
            <p className="landing-hero-text">
              Zamiast surowego panelu technicznego dostajesz szybki dashboard do uruchamiania botow,
              serwerow Minecraft, planow uzytkownikow, limitow i logow. Wszystko w Twojej
              kolorystyce i pod pelna kontrola ownera.
            </p>

            <div className="landing-hero-actions">
              <Link className="primary-button" to="/login">
                <span>Wejdz do panelu</span>
                <ArrowRight size={16} />
              </Link>
              <a className="ghost-button" href="#offer">
                Zobacz oferte
              </a>
            </div>

            <div className="landing-highlights">
              <span>PM2 + live logi</span>
              <span>ZIP / RAR / JAR</span>
              <span>Plany i limity</span>
              <span>Light / dark mode</span>
            </div>
          </div>

          <div className="landing-hero-stage" id="panel">
            <div className="landing-window">
              <div className="landing-window-bar">
                <span />
                <span />
                <span />
              </div>

              <div className="landing-window-body">
                <div className="landing-window-sidebar">
                  <div className="landing-side-badge active">
                    <PanelTop size={16} />
                    <span>Dashboard</span>
                  </div>
                  <div className="landing-side-badge">
                    <Bot size={16} />
                    <span>Discord bots</span>
                  </div>
                  <div className="landing-side-badge">
                    <Gamepad2 size={16} />
                    <span>Minecraft</span>
                  </div>
                  <div className="landing-side-badge">
                    <Users size={16} />
                    <span>Uzytkownicy</span>
                  </div>
                </div>

                <div className="landing-window-content">
                  <div className="landing-window-overview">
                    <article className="landing-mini-card">
                      <small>Aktywne uslugi</small>
                      <strong>12</strong>
                    </article>
                    <article className="landing-mini-card">
                      <small>Zuzycie RAM</small>
                      <strong>5.5 GB</strong>
                    </article>
                    <article className="landing-mini-card accent">
                      <small>Status hosta</small>
                      <strong>ONLINE</strong>
                    </article>
                  </div>

                  <div className="landing-service-list">
                    <div className="landing-service-row">
                      <div>
                        <strong>nightcore-discord-bot</strong>
                        <span>Node.js / PM2 / autorestart</span>
                      </div>
                      <b className="status-pill success">online</b>
                    </div>
                    <div className="landing-service-row">
                      <div>
                        <strong>survival-1.21.5</strong>
                        <span>Minecraft Java / publiczny routing</span>
                      </div>
                      <b className="status-pill warning">starting</b>
                    </div>
                    <div className="landing-service-row">
                      <div>
                        <strong>python-ticket-bot</strong>
                        <span>Python / env ready / logs live</span>
                      </div>
                      <b className="status-pill muted">idle</b>
                    </div>
                  </div>

                  <div className="landing-terminal-preview">
                    <span>[pm2] starting app: survival-1.21.5</span>
                    <span>[bytehost] minecraft version resolved: 1.21.5</span>
                    <span>[logs] live diagnostics and restart guard active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-band" id="offer">
          {offerCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="landing-band-card">
                <div className="landing-band-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </div>
              </article>
            );
          })}
        </section>

        <section className="landing-section landing-split">
          <div className="landing-section-heading">
            <p className="eyebrow">Panel i automatyzacja</p>
            <h2>Wyglada jak nowoczesny hosting, ale nadal jest praktyczny przy codziennej pracy.</h2>
            <p>
              Zamiast kopiowac klasyczna strone hostingu 1:1, ByteHost pokazuje realne funkcje:
              auto-detekcje projektu, limity kont, logi, file manager i zarzadzanie wieloma
              uslugami z jednego miejsca.
            </p>
          </div>

          <div className="landing-feature-grid">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="landing-feature-card">
                  <div className="landing-feature-icon">
                    <Icon size={18} />
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="landing-section" id="workflow">
          <div className="section-header landing-section-headline">
            <div>
              <p className="eyebrow">Jak to dziala</p>
              <h2>Od logowania do odpalonej uslugi bez chaosu w panelu.</h2>
            </div>
          </div>

          <div className="landing-step-grid">
            {workflowSteps.map((step) => (
              <article key={step.step} className="landing-step-card">
                <span>{step.step}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-cta-card">
            <div>
              <p className="eyebrow">ByteHost workflow</p>
              <h2>Wrzucasz projekt, ustawiasz limity i odpalasz wszystko z jednego miejsca.</h2>
              <p>
                Strona startowa prowadzi do panelu, a panel dalej robi juz cala robote:
                zarzadzanie userami, limity, expire, Minecraft, Discord i monitoring.
              </p>
            </div>

            <div className="landing-cta-points">
              <span>
                <HardDrive size={16} />
                Limity RAM, CPU i storage
              </span>
              <span>
                <Bot size={16} />
                Discord bot upload i analiza
              </span>
              <span>
                <Gamepad2 size={16} />
                Minecraft z wyborem wersji
              </span>
            </div>
          </div>
        </section>

        <section className="landing-section" id="faq">
          <div className="section-header landing-section-headline">
            <div>
              <p className="eyebrow">FAQ</p>
              <h2>Najwazniejsze odpowiedzi przed wejsciem do panelu.</h2>
            </div>
          </div>

          <div className="landing-faq-list">
            {faqItems.map((item, index) => (
              <FaqItem
                key={item.question}
                item={item}
                open={openFaq === index}
                onClick={() => setOpenFaq((current) => (current === index ? -1 : index))}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
