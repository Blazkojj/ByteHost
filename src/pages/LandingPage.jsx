import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Clock3,
  Database,
  FolderTree,
  Gamepad2,
  Globe,
  LockKeyhole,
  Network,
  PanelTop,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users
} from "lucide-react";

import logoUrl from "../assets/bytehost-logo.svg";
import { ThemeToggle } from "../components/ThemeToggle";

const featurePills = ["PM2", "ZIP / RAR / JAR", "JWT + bcrypt", "Dark / light", "Discord + Minecraft"];

const proofCards = [
  {
    title: "Prywatny panel",
    text: "Bez publicznej rejestracji, z ownerem, planami i kontrola dostepu do uslug."
  },
  {
    title: "Realne procesy",
    text: "Boty i serwery sa uruchamiane przez PM2, a nie udawane w samym interfejsie."
  },
  {
    title: "Nowoczesny workflow",
    text: "Upload, logi, pliki, env, restart, limity i scheduler sa spiete w jednym miejscu."
  }
];

const offerCards = [
  {
    icon: Bot,
    title: "Hosting botow Discord",
    text: "ZIP lub RAR, auto-detekcja jezyka, pliku startowego i komendy plus pelna obsluga logow i plikow."
  },
  {
    icon: Gamepad2,
    title: "Serwery Minecraft",
    text: "Tworzenie bez pliku albo z wlasnym JAR, wybor wersji, EULA, limity i gotowosc do publicznego routingu."
  },
  {
    icon: Users,
    title: "Konta i limity",
    text: "Owner tworzy konta, ustawia plan, RAM, CPU, storage, expires_at i widzi caly system z jednego panelu."
  }
];

const stackCards = [
  { icon: PanelTop, label: "Express panel" },
  { icon: Database, label: "SQLite storage" },
  { icon: TerminalSquare, label: "PM2 runtime" },
  { icon: Network, label: "API + JWT" },
  { icon: Globe, label: "Cloudflare ready" },
  { icon: LockKeyhole, label: "Owner access" }
];

const stepCards = [
  {
    step: "01",
    title: "Logujesz sie do panelu",
    text: "Konto tworzy owner. Uzytkownik dostaje gotowy dostep bez rejestracji publicznej."
  },
  {
    step: "02",
    title: "Dodajesz projekt",
    text: "Discord bot albo Minecraft trafia do panelu razem z limitami i ustawieniami planu."
  },
  {
    step: "03",
    title: "Konfigurujesz srodowisko",
    text: "Ustawiasz .env, start command, wersje, RAM, CPU, expire i auto restart."
  },
  {
    step: "04",
    title: "Monitorujesz usluge",
    text: "Masz logi, file manager, diagnostyke, restart count, status i kontrola nad procesem."
  }
];

const faqItems = [
  {
    question: "Czy ByteHost to prawdziwy panel hostingowy?",
    answer:
      "Tak. Panel korzysta z realnych plikow, PM2, schedulerow, limitow i logow. To nie jest sam frontend bez backendu."
  },
  {
    question: "Czy moge hostowac boty Discord i Minecraft z jednego miejsca?",
    answer:
      "Tak. ByteHost laczy oba typy uslug w jednym panelu i rozdziela ich konfiguracje, komendy startu oraz limity."
  },
  {
    question: "Czy uzytkownik widzi tylko swoje uslugi?",
    answer:
      "Tak. Zwykly user widzi tylko swoje uslugi, limity i dane konta. Owner ma dostep do calego systemu."
  },
  {
    question: "Czy panel ma ciemny motyw?",
    answer:
      "Tak. Strona glowna, logowanie i panel maja przelacznik jasnego i ciemnego motywu z zapisem lokalnym."
  }
];

function FaqItem({ item, open, onToggle }) {
  return (
    <article className={`marketing-faq-item ${open ? "open" : ""}`}>
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
      <header className="marketing-header">
        <Link className="brand marketing-brand" to="/">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div className="brand-copy">
            <strong>ByteHost</strong>
            <span>Hosting panel for bots and game servers</span>
          </div>
        </Link>

        <nav className="marketing-nav">
          <a href="#offer">Oferta</a>
          <a href="#stack">Technologie</a>
          <a href="#workflow">Jak to dziala</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="marketing-header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Link className="ghost-button" to="/register">
            Zaloz konto
          </Link>
          <Link className="ghost-button" to="/login">
            Logowanie
          </Link>
        </div>
      </header>

      <main className="marketing-main">
        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">
              <Sparkles size={16} />
              ByteHost / hosting panel in your own color style
            </p>
            <h1>Nowoczesny panel do hostowania botow Discord i serwerow Minecraft.</h1>
            <p className="marketing-hero-text">
              ByteHost wyglada jak dopracowana strona hostingu, ale za tym interfejsem stoi realny
              backend: PM2, limity, logi, scheduler wygasniec, zarzadzanie userami i file manager.
            </p>

            <div className="marketing-hero-actions">
              <Link className="ghost-button" to="/register">
                Zaloz konto
              </Link>
              <Link className="primary-button" to="/login">
                <span>Wejdz do panelu</span>
                <ArrowRight size={16} />
              </Link>
              <a className="ghost-button" href="#offer">
                Zobacz mozliwosci
              </a>
            </div>

            <div className="marketing-pill-row">
              {featurePills.map((pill) => (
                <span key={pill}>{pill}</span>
              ))}
            </div>
          </div>

          <div className="marketing-hero-mockup">
            <div className="marketing-window">
              <div className="marketing-window-bar">
                <span />
                <span />
                <span />
              </div>

              <div className="marketing-window-body">
                <aside className="marketing-window-sidebar">
                  <div className="marketing-side-link active">
                    <PanelTop size={16} />
                    <span>Dashboard</span>
                  </div>
                  <div className="marketing-side-link">
                    <Bot size={16} />
                    <span>Discord</span>
                  </div>
                  <div className="marketing-side-link">
                    <Gamepad2 size={16} />
                    <span>Minecraft</span>
                  </div>
                  <div className="marketing-side-link">
                    <Users size={16} />
                    <span>Uzytkownicy</span>
                  </div>
                </aside>

                <div className="marketing-window-content">
                  <div className="marketing-mini-grid">
                    <article className="marketing-mini-card">
                      <small>Aktywne uslugi</small>
                      <strong>12</strong>
                    </article>
                    <article className="marketing-mini-card">
                      <small>RAM in use</small>
                      <strong>5.5 GB</strong>
                    </article>
                    <article className="marketing-mini-card accent">
                      <small>Status</small>
                      <strong>ONLINE</strong>
                    </article>
                  </div>

                  <div className="marketing-service-list">
                    <div className="marketing-service-row">
                      <div>
                        <strong>music-discord-bot</strong>
                        <span>Node.js / PM2 / autorestart</span>
                      </div>
                      <b className="status-pill success">online</b>
                    </div>
                    <div className="marketing-service-row">
                      <div>
                        <strong>survival-1.21.5</strong>
                        <span>Minecraft Java / version selected</span>
                      </div>
                      <b className="status-pill warning">starting</b>
                    </div>
                    <div className="marketing-service-row">
                      <div>
                        <strong>tickets-python-bot</strong>
                        <span>Python / env ready / live logs</span>
                      </div>
                      <b className="status-pill muted">idle</b>
                    </div>
                  </div>

                  <div className="marketing-terminal">
                    <span>[pm2] app started: music-discord-bot</span>
                    <span>[bytehost] detected main file: index.js</span>
                    <span>[scheduler] account limit check completed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-proof">
          {proofCards.map((card) => (
            <article key={card.title} className="marketing-proof-card">
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </section>

        <section className="marketing-section" id="offer">
          <div className="marketing-section-heading centered">
            <p className="eyebrow">Nasza oferta</p>
            <h2>Wszystko, czego potrzebujesz do prywatnego hostingu, w jednym panelu.</h2>
            <p>
              Strona glowna ma wyglad klasycznej nowoczesnej marki hostingowej, ale srodek zostaje
              podporzadkowany ByteHost i realnym funkcjom aplikacji.
            </p>
          </div>

          <div className="marketing-card-grid three">
            {offerCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="marketing-feature-card">
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

        <section className="marketing-section" id="stack">
          <div className="marketing-section-heading centered">
            <p className="eyebrow">Technologie i fundament</p>
            <h2>ByteHost stoi na realnym stacku, a nie tylko na ladnym widoku.</h2>
          </div>

          <div className="marketing-stack-grid">
            {stackCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.label} className="marketing-stack-card">
                  <Icon size={18} />
                  <span>{card.label}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="marketing-section" id="workflow">
          <div className="marketing-section-heading centered">
            <p className="eyebrow">Jak to dziala</p>
            <h2>Od pierwszego logowania do dzialajacej uslugi w czterech krokach.</h2>
          </div>

          <div className="marketing-card-grid four">
            {stepCards.map((step) => (
              <article key={step.step} className="marketing-step-card">
                <span>{step.step}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section">
          <div className="marketing-cta">
            <div>
              <p className="eyebrow">ByteHost workflow</p>
              <h2>Wrzucasz projekt, ustawiasz limity i uruchamiasz wszystko z jednego miejsca.</h2>
              <p>
                ByteHost daje Ci homepage w stylu nowoczesnego hostingu, ale dalej prowadzi do
                panelu, ktory zarzadza procesami, uzytkownikami, storage i konfiguracja.
              </p>
            </div>

            <div className="marketing-cta-points">
              <span>
                <FolderTree size={16} />
                File manager i .env editor
              </span>
              <span>
                <TerminalSquare size={16} />
                Logi, statusy i konsola
              </span>
              <span>
                <ShieldCheck size={16} />
                Limity planu i kontrola dostepu
              </span>
              <span>
                <Clock3 size={16} />
                Expire i restart scheduler
              </span>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="faq">
          <div className="marketing-section-heading centered">
            <p className="eyebrow">FAQ</p>
            <h2>Najwazniejsze odpowiedzi przed zalogowaniem.</h2>
          </div>

          <div className="marketing-faq-list">
            {faqItems.map((item, index) => (
              <FaqItem
                key={item.question}
                item={item}
                open={openFaq === index}
                onToggle={() => setOpenFaq((current) => (current === index ? -1 : index))}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-footer-brand">
          <img className="brand-logo" src={logoUrl} alt="ByteHost" />
          <div>
            <strong>ByteHost</strong>
            <span>Prywatny hosting botow i serwerow z jednym panelem administracyjnym.</span>
          </div>
        </div>

        <div className="marketing-footer-links">
          <a href="#offer">Oferta</a>
          <a href="#workflow">Jak to dziala</a>
          <a href="#faq">FAQ</a>
          <Link to="/login">Logowanie</Link>
        </div>
      </footer>
    </div>
  );
}
