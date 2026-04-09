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

const offerCards = [
  {
    icon: Bot,
    title: "Discord bot hosting",
    text: "Upload ZIP lub RAR, automatyczne wykrywanie jezyka, pliku startowego i realne odpalanie przez PM2."
  },
  {
    icon: Gamepad2,
    title: "Minecraft Java",
    text: "Serwer z wersja, JAR-em, EULA, limitem zasobow i dalszym zarzadzaniem juz z poziomu panelu."
  },
  {
    icon: Users,
    title: "Konta i aktywacja",
    text: "Uzytkownik moze zalozyc konto sam, ale owner aktywuje je w panelu i dopiero wtedy ustawia limity."
  }
];

const workflowSteps = [
  {
    step: "01",
    title: "Zakladasz konto albo logujesz sie",
    text: "Nowe konto trafia do ownera i czeka na aktywacje przed pierwszym wejsciem."
  },
  {
    step: "02",
    title: "Dodajesz usluge",
    text: "Bot Discord lub Minecraft trafia do panelu z limitem RAM, CPU, storage i statusem."
  },
  {
    step: "03",
    title: "Konfigurujesz i startujesz",
    text: "Pliki, .env, logi, komenda startowa i restart sa gotowe bez skakania po terminalu."
  }
];

const faqItems = [
  {
    question: "Czy ByteHost to prawdziwy panel hostingowy?",
    answer:
      "Tak. To nie jest sama makieta. Panel pracuje na plikach, PM2, logach, limitach i schedulerze wygasniec."
  },
  {
    question: "Czy moge hostowac i Discord boty, i Minecraft?",
    answer:
      "Tak. ByteHost obsluguje oba typy uslug i rozdziela ich konfiguracje, wykrywanie oraz ustawienia startu."
  },
  {
    question: "Czy uzytkownik moze sam zalozyc konto?",
    answer:
      "Tak. Rejestracja tworzy konto oczekujace, a owner aktywuje je w panelu admina i ustawia limity."
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
            <span>Prywatny panel do hostowania botow i serwerow</span>
          </div>
        </Link>

        <nav className="marketing-nav">
          <a href="#offer">Oferta</a>
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
        <section className="marketing-hero marketing-hero-clean">
          <div className="marketing-hero-copy reveal-up delay-1">
            <p className="marketing-kicker">
              <Sparkles size={16} />
              ByteHost hosting panel
            </p>
            <h1>Nowoczesny, prywatny hosting dla botow Discord i serwerow Minecraft.</h1>
            <p className="marketing-hero-text">
              Jeden panel do uruchamiania projektow, zarzadzania plikami, logami, limitami i
              kontami uzytkownikow. Czysty wyglad, realny backend i zero udawania.
            </p>

            <div className="marketing-hero-actions">
              <Link className="primary-button" to="/login">
                <span>Wejdz do panelu</span>
                <ArrowRight size={16} />
              </Link>
              <Link className="ghost-button" to="/register">
                Zaloz konto
              </Link>
            </div>

            <div className="marketing-pill-row">
              <span>PM2 + logi live</span>
              <span>ZIP / RAR / JAR</span>
              <span>JWT + bcrypt</span>
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
                <span>Auto-detect + PM2</span>
              </div>
            </article>

            <article className="marketing-floating-card floating-right">
              <Gamepad2 size={16} />
              <div>
                <strong>Minecraft</strong>
                <span>Wersje + start control</span>
              </div>
            </article>
          </div>
        </section>

        <section className="marketing-section" id="offer">
          <div className="marketing-section-heading centered reveal-up">
            <p className="eyebrow">Oferta</p>
            <h2>Najwazniejsze funkcje bez przeładowanej strony glównej.</h2>
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
            <p className="eyebrow">Jak to dziala</p>
            <h2>Prosty workflow od konta do dzialajacej uslugi.</h2>
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
              <h2>Mniej chaosu, wiecej kontroli.</h2>
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
                Expire i restart scheduler
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
