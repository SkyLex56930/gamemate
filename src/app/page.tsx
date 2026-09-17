"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const features = [
  ["◎", "Trouve les bons mates", "Filtre par jeu, plateforme, micro, crossplay et style de jeu."],
  ["⚡", "Play Now", "Lance une recherche rapide et rejoins une session sans perdre de temps."],
  ["◇", "Squads", "Garde tes meilleurs mates sous la main et relance facilement une équipe."],
  ["✦", "Gaming DNA", "Présente ton style de jeu, tes habitudes et tes préférences."]
];

const steps = [
  ["01", "Télécharge GameMate", "Le site reste public : pas besoin de compte pour télécharger l'application."],
  ["02", "Crée ton profil", "Ajoute tes jeux, ta plateforme, ton style et tes disponibilités."],
  ["03", "Trouve ta squad", "Utilise Play Now ou la recherche avancée pour trouver les bons joueurs."]
];

export default function HomePage() {
  const goDownload = () =>
    document.getElementById("download")?.scrollIntoView({ behavior: "smooth" });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <Image src="/gamemate-logo.png" alt="GameMate" width={42} height={42} priority />
          <span>GameMate</span>
        </Link>

        <nav className={styles.nav}>
          <a href="#how">Comment ça marche</a>
          <a href="#features">Fonctionnalités</a>
          <a href="#download">Télécharger</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className={styles.actions}>
          <Link href="/login" className={styles.login}>Connexion</Link>
          <button onClick={goDownload} className={styles.smallCta}>Télécharger</button>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span />Le réseau pensé pour jouer ensemble</div>
          <h1>Trouve tes mates.<em>Lance tes games.</em></h1>
          <p>
            GameMate t'aide à trouver rapidement des joueurs selon ton jeu,
            ta plateforme, ton style et tes disponibilités.
          </p>

          <div className={styles.heroActions}>
            <button onClick={goDownload} className={styles.primary}>
              Télécharger GameMate <b>↘</b>
            </button>
            <a href="#how" className={styles.secondary}>Découvrir GameMate</a>
          </div>

          <div className={styles.stats}>
            <div><strong>Gratuit</strong><span>pour commencer</span></div>
            <div><strong>Windows</strong><span>disponible en premier</span></div>
            <div><strong>Crossplay</strong><span>pensé multi-plateforme</span></div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.aura} />
          <div className={styles.appMock}>
            <div className={styles.mockTop}>
              <div><Image src="/gamemate-logo.png" alt="" width={26} height={26} /><b>GameMate</b></div>
              <span>•••</span>
            </div>
            <div className={styles.mockBody}>
              <aside>
                <b>Accueil</b>
                <span>Play Now</span>
                <span>Trouver des mates</span>
                <span>Squads</span>
                <span>Messages</span>
              </aside>
              <div className={styles.mockContent}>
                <small>PLAY NOW</small>
                <h3>Trouve ta prochaine squad</h3>
                {[
                  ["N", "Nox", "VALORANT • PC", "96%"],
                  ["M", "Maya", "Fortnite • Crossplay", "91%"],
                  ["K", "Kiro", "Warzone • Vocal", "88%"]
                ].map(([letter, name, meta, score]) => (
                  <div className={styles.mate} key={name}>
                    <i>{letter}</i>
                    <div><b>{name}</b><span>{meta}</span></div>
                    <strong>{score}</strong>
                  </div>
                ))}
                <button>Trouver mes mates</button>
              </div>
            </div>
          </div>
          <div className={`${styles.floatCard} ${styles.floatOne}`}>⚡ <span><b>Match trouvé</b><small>3 joueurs compatibles</small></span></div>
          <div className={`${styles.floatCard} ${styles.floatTwo}`}>◉ <span><b>Squad prête</b><small>Micro + crossplay</small></span></div>
        </div>
      </section>

      <div className={styles.games}>
        <span>VALORANT</span><span>FORTNITE</span><span>WARZONE</span>
        <span>ROCKET LEAGUE</span><span>MINECRAFT</span><span>+ TES JEUX</span>
      </div>

      <section className={styles.section} id="how">
        <div className={styles.heading}>
          <span>COMMENT ÇA MARCHE</span>
          <h2>Moins de recherche. Plus de parties.</h2>
          <p>Du moment où tu veux jouer jusqu'à une vraie squad, GameMate doit rester simple et rapide.</p>
        </div>
        <div className={styles.steps}>
          {steps.map(([n, title, text]) => (
            <article key={n}>
              <span>{n}</span><h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="features">
        <div className={styles.heading}>
          <span>TOUT AU MÊME ENDROIT</span>
          <h2>Une expérience pensée autour de tes parties.</h2>
        </div>
        <div className={styles.features}>
          {features.map(([icon, title, text]) => (
            <article key={title}>
              <i>{icon}</i><h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.story}>
        <div>
          <span>FAIT POUR LES JOUEURS</span>
          <h2>Pas besoin de fouiller partout pour trouver avec qui jouer.</h2>
          <p>
            GameMate rassemble la recherche de joueurs, les squads,
            les préférences et les sessions rapides dans une seule expérience.
          </p>
        </div>
        <div className={styles.quotes}>
          <blockquote>“Je lance, je choisis mon jeu et je trouve directement des gens qui veulent jouer comme moi.”<footer>Nox • FPS / PC</footer></blockquote>
          <blockquote>“Plus besoin de fouiller dix serveurs pour trouver une équipe.”<footer>Maya • Crossplay</footer></blockquote>
          <blockquote>“Je retrouve vite les joueurs avec qui j'ai envie de rejouer.”<footer>Kiro • Compétitif</footer></blockquote>
        </div>
      </section>

      <section className={styles.download} id="download">
        <div className={styles.headingCenter}>
          <span>TÉLÉCHARGER GAMEMATE</span>
          <h2>Ta prochaine squad est à quelques clics.</h2>
          <p>Télécharge GameMate sans inscription obligatoire.</p>
        </div>

        <div className={styles.platforms}>
          <article className={styles.mainPlatform}>
            <div><b>⊞</b><span>Disponible</span></div>
            <h3>Windows</h3>
            <p>Launcher GameMate + Companion.</p>
            <button>Télécharger pour Windows</button>
            <small>Windows 10 / 11</small>
          </article>

          <article>
            <div><b>◈</b><span>Bientôt</span></div>
            <h3>Android</h3>
            <p>Retrouve tes mates et tes messages depuis ton téléphone.</p>
            <button disabled>Bientôt disponible</button>
          </article>

          <article>
            <div><b>●</b><span>À venir</span></div>
            <h3>iOS</h3>
            <p>L'expérience GameMate arrivera également sur iPhone.</p>
            <button disabled>À venir</button>
          </article>
        </div>
      </section>

      <section className={styles.faq} id="faq">
        <div className={styles.heading}>
          <span>FAQ</span><h2>Les réponses rapides.</h2>
        </div>
        <details><summary>Est-ce que GameMate est gratuit ?</summary><p>Oui. Les fonctions essentielles pour trouver des joueurs et jouer ensemble restent au cœur de l'expérience gratuite.</p></details>
        <details><summary>Faut-il créer un compte avant de télécharger ?</summary><p>Non. Le site est public et le téléchargement n'impose pas d'inscription.</p></details>
        <details><summary>GameMate prend-il en compte le crossplay ?</summary><p>Oui, la plateforme et les préférences crossplay peuvent être utilisées dans la recherche.</p></details>
      </section>

      <section className={styles.finalCta}>
        <div><span>PRÊT À JOUER ?</span><h2>Arrête de chercher. Commence à jouer.</h2></div>
        <button onClick={goDownload} className={styles.primary}>Télécharger GameMate <b>↘</b></button>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <Image src="/gamemate-logo.png" alt="GameMate" width={36} height={36} />
          <span><b>GameMate</b><small>Trouve tes prochains mates.</small></span>
        </div>
        <div>
          <a href="#features">Fonctionnalités</a>
          <a href="#download">Télécharger</a>
          <Link href="/login">Connexion</Link>
          <Link href="/signup">Créer un compte</Link>
        </div>
        <small>© {new Date().getFullYear()} GameMate</small>
      </footer>
    </main>
  );
}
