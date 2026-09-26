"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type Language = "fr" | "en";

type PublicStats = {
  onlineUsers: number;
  downloads: number;
  latestVersion: string;
  downloadUrl: string;
  publishedAt: string | null;
};

const FALLBACK_DOWNLOAD =
  "https://github.com/SkyLex56930/gamemate-releases/releases/latest/download/launcher_x64-setup.exe";

const copy = {
  fr: {
    navDiscover: "Découvrir",
    navFeatures: "Fonctionnalités",
    navDownload: "Télécharger",
    login: "Se connecter",
    signup: "Créer un compte",
    heroTitleBefore: "Trouve tes prochains ",
    heroTitleAccent: "mates.",
    heroText:
      "Trouve des joueurs qui jouent comme toi, quand tu veux jouer. Découvre GameMate librement, puis télécharge le launcher quand tu veux passer à l’action.",
    heroDownload: "Télécharger GameMate",
    heroDiscover: "Découvrir",
    discoveryBefore: "Marre de ",
    discoveryAccent: "jouer seul ?",
    discoveryText:
      "GameMate te met en relation avec des joueurs qui correspondent vraiment à ton jeu, ton niveau, tes horaires et ta manière de jouer.",
    howItWorks: "COMMENT ÇA MARCHE",
    featuresBefore: "Tout ce qu’il faut pour ",
    featuresAccent: "trouver ta team.",
    featuresText:
      "Trouve des joueurs compatibles, lance une recherche immédiate, crée tes squads et retrouve les personnes avec qui tu veux rejouer.",
    downloadBefore: "Prêt à trouver ",
    downloadAccent: "ta team ?",
    downloadText:
      "Télécharge le launcher sans inscription obligatoire. Tu pourras te connecter ou créer ton compte quand tu lanceras réellement GameMate.",
    downloadWindows: "Télécharger pour Windows",
    windows: "Windows 64 bits",
    latest: "Dernière version",
    released: "Publiée le",
    statsOnline: "joueurs en ligne",
    statsDownloads: "téléchargements",
    statsVersion: "dernière version",
    languageLabel: "Passer le site en anglais",
    footerFeatures: "Fonctionnalités",
    footerDownload: "Télécharger",
    features: [
      { icon: "◉", title: "Trouver des mates", text: "Choisis ton jeu et trouve des joueurs qui correspondent à ton style, ton niveau et tes envies." },
      { icon: "⚡", title: "Play Now", text: "Quand tu veux jouer tout de suite, lance une recherche et forme rapidement une équipe." },
      { icon: "◆", title: "Squads", text: "Crée ton groupe, retrouve tes mates et rejoue facilement avec les bonnes personnes." },
      { icon: "✦", title: "Gaming DNA", text: "Ton profil de joueur aide GameMate à te proposer des personnes vraiment compatibles." },
    ],
  },
  en: {
    navDiscover: "Discover",
    navFeatures: "Features",
    navDownload: "Download",
    login: "Sign in",
    signup: "Create account",
    heroTitleBefore: "Find your next ",
    heroTitleAccent: "mates.",
    heroText:
      "Find players who play like you, when you want to play. Explore GameMate freely, then download the launcher whenever you are ready.",
    heroDownload: "Download GameMate",
    heroDiscover: "Discover",
    discoveryBefore: "Tired of ",
    discoveryAccent: "playing alone?",
    discoveryText:
      "GameMate connects you with players who truly match your game, skill level, schedule and playstyle.",
    howItWorks: "HOW IT WORKS",
    featuresBefore: "Everything you need to ",
    featuresAccent: "find your team.",
    featuresText:
      "Find compatible players, start an instant search, create squads and reconnect with people you want to play with again.",
    downloadBefore: "Ready to find ",
    downloadAccent: "your team?",
    downloadText:
      "Download the launcher without mandatory signup. You can sign in or create your account when you actually launch GameMate.",
    downloadWindows: "Download for Windows",
    windows: "Windows 64-bit",
    latest: "Latest version",
    released: "Released",
    statsOnline: "players online",
    statsDownloads: "downloads",
    statsVersion: "latest version",
    languageLabel: "Switch the website to French",
    footerFeatures: "Features",
    footerDownload: "Download",
    features: [
      { icon: "◉", title: "Find mates", text: "Pick your game and find players who match your style, skill level and goals." },
      { icon: "⚡", title: "Play Now", text: "When you want to play right away, launch a search and quickly build a team." },
      { icon: "◆", title: "Squads", text: "Create your group, find your mates again and easily replay with the right people." },
      { icon: "✦", title: "Gaming DNA", text: "Your player profile helps GameMate suggest people who are genuinely compatible with you." },
    ],
  },
} as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

export default function HomePage() {
  const cinematicRef = useRef<HTMLElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [lang, setLang] = useState<Language>("fr");
  const [stats, setStats] = useState<PublicStats>({
    onlineUsers: 0,
    downloads: 0,
    latestVersion: "—",
    downloadUrl: FALLBACK_DOWNLOAD,
    publishedAt: null,
  });

  const t = copy[lang];

  useEffect(() => {
    const saved = window.localStorage.getItem("gamemate-site-language");
    if (saved === "fr" || saved === "en") {
      setLang(saved);
      return;
    }
    setLang(navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("gamemate-site-language", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const response = await fetch("/api/public-stats", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as PublicStats;
        if (!cancelled) setStats(data);
      } catch {}
    }

    void loadStats();
    const timer = window.setInterval(() => void loadStats(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let raf = 0;

    const update = () => {
      raf = 0;
      const section = cinematicRef.current;
      const sticky = stickyRef.current;
      if (!section || !sticky) return;

      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;

      const progress = clamp(-rect.top / scrollable);
      const heroOpacity = 1 - clamp((progress - 0.14) / 0.22);
      const secondOpacity = clamp((progress - 0.20) / 0.22);
      const secondContentOpacity = clamp((progress - 0.34) / 0.18);

      sticky.style.setProperty("--hero-opacity", String(heroOpacity));
      sticky.style.setProperty("--second-opacity", String(secondOpacity));
      sticky.style.setProperty("--second-content-opacity", String(secondContentOpacity));
      sticky.style.setProperty("--hero-scale", String(1 + progress * 0.045));
      sticky.style.setProperty("--second-scale", String(1.045 - progress * 0.025));
      sticky.style.setProperty("--progress", String(progress));
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const publishedLabel =
    stats.publishedAt &&
    new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(stats.publishedAt));

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB").format(value);

  return (
    <main className={styles.page}>
      <header className={styles.navbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>GM</span>
          <span>Game<span>Mate</span></span>
        </Link>

        <nav className={styles.navLinks} aria-label="Navigation principale">
          <a href="#discover">{t.navDiscover}</a>
          <a href="#features">{t.navFeatures}</a>
          <a href="#download">{t.navDownload}</a>
        </nav>

        <div className={styles.navActions}>
          <button
            type="button"
            className={styles.languageButton}
            onClick={() => setLang((current) => (current === "fr" ? "en" : "fr"))}
            aria-label={t.languageLabel}
            title={t.languageLabel}
          >
            <span>{lang.toUpperCase()}</span>
            <b>{lang === "fr" ? "EN" : "FR"}</b>
          </button>

          <Link href="/login" className={styles.login}>{t.login}</Link>
          <Link href="/signup" className={styles.signup}>{t.signup}</Link>
        </div>
      </header>

      <section ref={cinematicRef} className={styles.cinematic}>
        <div ref={stickyRef} className={styles.cinematicSticky}>
          <div className={styles.heroLayer} />
          <div className={styles.heroShade} />
          <div className={styles.secondLayer} />
          <div className={styles.secondShade} />
          <div className={styles.transitionFlash} />

          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>PLAY · CONNECT · BELONG</p>
            <h1>{t.heroTitleBefore}<span>{t.heroTitleAccent}</span></h1>
            <p className={styles.heroText}>{t.heroText}</p>

            <div className={styles.heroButtons}>
              <a href="#download" className={styles.primaryButton}>{t.heroDownload}</a>
              <a href="#discover" className={styles.secondaryButton}>{t.heroDiscover}</a>
            </div>
          </div>

          <div id="discover" className={styles.discoveryContent}>
            <p className={styles.eyebrow}>GAMEMATE</p>
            <h2>{t.discoveryBefore}<span>{t.discoveryAccent}</span></h2>
            <p>{t.discoveryText}</p>
          </div>

          <div className={styles.progressRail} aria-hidden="true"><span /></div>
        </div>
      </section>

      <section className={styles.liveStats} aria-label="GameMate live">
        <div className={styles.liveStatsInner}>
          <article className={styles.liveStat}>
            <span className={styles.liveDot} aria-hidden="true" />
            <div><strong>{formatNumber(stats.onlineUsers)}</strong><small>{t.statsOnline}</small></div>
          </article>

          <article className={styles.liveStat}>
            <span className={styles.statIcon} aria-hidden="true">↓</span>
            <div><strong>{formatNumber(stats.downloads)}</strong><small>{t.statsDownloads}</small></div>
          </article>

          <article className={styles.liveStat}>
            <span className={styles.statIcon} aria-hidden="true">◆</span>
            <div><strong>{stats.latestVersion}</strong><small>{t.statsVersion}</small></div>
          </article>
        </div>
      </section>

      <section id="features" className={styles.featuresSection}>
        <div className={styles.featuresIntro}>
          <p className={styles.eyebrow}>{t.howItWorks}</p>
          <h2>{t.featuresBefore}<span>{t.featuresAccent}</span></h2>
          <p>{t.featuresText}</p>
        </div>

        <div className={styles.featureGrid}>
          {t.features.map((feature, index) => (
            <article key={feature.title} className={styles.featureCard}>
              <div className={styles.featureTopline}>
                <span className={styles.featureNumber}>0{index + 1}</span>
                <span className={styles.featureIcon}>{feature.icon}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="download" className={styles.downloadSection}>
        <div className={styles.downloadGlow} />
        <div className={styles.downloadInner}>
          <p className={styles.eyebrow}>GAME ON</p>
          <h2>{t.downloadBefore}<span>{t.downloadAccent}</span></h2>
          <p>{t.downloadText}</p>

          <div className={styles.downloadActions}>
            <a href={stats.downloadUrl || FALLBACK_DOWNLOAD} className={styles.primaryButton}>
              {t.downloadWindows}
            </a>
            <Link href="/signup" className={styles.secondaryButton}>{t.signup}</Link>
          </div>

          <p className={styles.downloadNote}>
            {t.windows} · {t.latest} {stats.latestVersion}
            {publishedLabel ? ` · ${t.released} ${publishedLabel}` : ""}
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.brandMark}>GM</span>
          <strong>Game<span>Mate</span></strong>
        </div>

        <div className={styles.footerLinks}>
          <Link href="/login">{t.login}</Link>
          <Link href="/signup">{t.signup}</Link>
          <a href="#features">{t.footerFeatures}</a>
          <a href="#download">{t.footerDownload}</a>
        </div>

        <p>Good players. Better people.</p>
      </footer>
    </main>
  );
}
