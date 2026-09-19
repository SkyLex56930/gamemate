"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./page.module.css";

const features = [
  {
    icon: "◉",
    title: "Trouver des mates",
    text: "Choisis ton jeu et trouve des joueurs qui correspondent à ton style, ton niveau et tes envies.",
  },
  {
    icon: "⚡",
    title: "Play Now",
    text: "Quand tu veux jouer tout de suite, lance une recherche et forme rapidement une équipe.",
  },
  {
    icon: "◆",
    title: "Squads",
    text: "Crée ton groupe, retrouve tes mates et rejoue facilement avec les bonnes personnes.",
  },
  {
    icon: "✦",
    title: "Gaming DNA",
    text: "Ton profil de joueur aide GameMate à te proposer des personnes vraiment compatibles.",
  },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

export default function HomePage() {
  const cinematicRef = useRef<HTMLElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);

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

      // Transition plus courte : l'essentiel du switch se fait entre 18% et 52%.
      const heroOpacity = 1 - clamp((progress - 0.14) / 0.22);
      const secondOpacity = clamp((progress - 0.20) / 0.22);
      const secondContentOpacity = clamp((progress - 0.34) / 0.18);

      sticky.style.setProperty("--hero-opacity", String(heroOpacity));
      sticky.style.setProperty("--second-opacity", String(secondOpacity));
      sticky.style.setProperty(
        "--second-content-opacity",
        String(secondContentOpacity),
      );
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

  return (
    <main className={styles.page}>
      <header className={styles.navbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>GM</span>
          <span>
            Game<span>Mate</span>
          </span>
        </Link>

        <nav className={styles.navLinks} aria-label="Navigation principale">
          <a href="#discover">Découvrir</a>
          <a href="#features">Fonctionnalités</a>
          <a href="#download">Télécharger</a>
        </nav>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.login}>
            Se connecter
          </Link>
          <Link href="/signup" className={styles.signup}>
            Créer un compte
          </Link>
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
            <h1>
              Trouve tes prochains <span>mates.</span>
            </h1>
            <p className={styles.heroText}>
              Trouve des joueurs qui jouent comme toi, quand tu veux jouer.
              Découvre GameMate librement, puis télécharge le launcher quand tu
              veux passer à l&apos;action.
            </p>

            <div className={styles.heroButtons}>
              <a href="#download" className={styles.primaryButton}>
                Télécharger GameMate
              </a>
              <a href="#discover" className={styles.secondaryButton}>
                Découvrir
              </a>
            </div>
          </div>

          <div id="discover" className={styles.discoveryContent}>
            <p className={styles.eyebrow}>GAMEMATE</p>
            <h2>
              Marre de <span>jouer seul ?</span>
            </h2>
            <p>
              GameMate te met en relation avec des joueurs qui correspondent
              vraiment à ton jeu, ton niveau, tes horaires et ta manière de
              jouer.
            </p>
          </div>

          <div className={styles.progressRail} aria-hidden="true">
            <span />
          </div>
        </div>
      </section>

      <section id="features" className={styles.featuresSection}>
        <div className={styles.featuresIntro}>
          <p className={styles.eyebrow}>COMMENT ÇA MARCHE</p>
          <h2>
            Tout ce qu&apos;il faut pour <span>trouver ta team.</span>
          </h2>
          <p>
            Trouve des joueurs compatibles, lance une recherche immédiate,
            crée tes squads et retrouve les personnes avec qui tu veux rejouer.
          </p>
        </div>

        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
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
          <h2>
            Prêt à trouver <span>ta team ?</span>
          </h2>
          <p>
            Télécharge le launcher sans inscription obligatoire. Tu pourras te
            connecter ou créer ton compte quand tu lanceras réellement
            GameMate.
          </p>

          <div className={styles.downloadActions}>
            <a
  className={styles.primaryButton}
  href="https://github.com/SkyLex56930/gamemate/releases/latest/download/launcher_0.1.0_x64-setup.exe"
>
  Télécharger pour Windows
</a>
            <Link href="/signup" className={styles.secondaryButton}>
              Créer un compte
            </Link>
          </div>

          <p className={styles.downloadNote}>
            Le bouton sera relié au vrai installateur du Launcher dès qu&apos;il
            sera prêt.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.brandMark}>GM</span>
          <strong>
            Game<span>Mate</span>
          </strong>
        </div>

        <div className={styles.footerLinks}>
          <Link href="/login">Connexion</Link>
          <Link href="/signup">Créer un compte</Link>
          <a href="#features">Fonctionnalités</a>
          <a href="#download">Télécharger</a>
        </div>

        <p>Good players. Better people.</p>
      </footer>
    </main>
  );
}
