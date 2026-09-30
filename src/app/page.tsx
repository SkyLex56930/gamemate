"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import styles from "./page.module.css";

type Language = "fr" | "en";
type IconName = "arrow" | "bolt" | "calendar" | "check" | "download" | "headset" | "heart" | "message" | "people" | "radar" | "shield" | "sparkles" | "windows";
type PublicStats = { onlineUsers: number; downloads: number; latestVersion: string; downloadUrl: string; publishedAt: string | null };

const FALLBACK_DOWNLOAD = "https://github.com/SkyLex56930/gamemate-releases/releases/latest/download/launcher_x64-setup.exe";

const copy = {
  fr: {
    navProduct: "Le produit", navFeatures: "Fonctionnalités", navHow: "Comment ça marche", login: "Connexion", signup: "Créer mon profil",
    heroBadge: "La rencontre pensée pour les joueurs", heroBefore: "Les bons mates.", heroAccent: "Au bon moment.",
    heroText: "GameMate comprend ta façon de jouer et te connecte aux joueurs avec qui ça peut vraiment matcher — niveau, vibe et disponibilités compris.",
    download: "Télécharger GameMate", discover: "Voir comment ça marche", free: "Gratuit · Windows 64 bits", matchLive: "MATCH EN DIRECT", compatibility: "Compatibilité", ready: "Prêt à jouer", voice: "Vocal actif",
    playersOnline: "joueurs en ligne", downloads: "téléchargements", latest: "version actuelle", socialProof: "Un seul profil pour toute ta vie gaming",
    productKicker: "PLUS QU’UN MATCHING", productBefore: "Ton cercle gaming,", productAccent: "réuni au même endroit.",
    productText: "Du premier match à la prochaine session, retrouve tes mates, tes messages et tes squads sur PC comme sur mobile.",
    appLabel: "COMPANION PC", appTitle: "Ce soir, on ne joue pas solo.", search: "Recherche en cours", found: "3 mates trouvés", squadTonight: "Squad du soir", ranked: "Ranked · 21:30", join: "Rejoindre", mobileLabel: "MOBILE",
    featureKicker: "TOUT EST CONNECTÉ", featureBefore: "Conçu pour jouer.", featureAccent: "Pas pour scroller.", featureText: "Chaque fonction aide à passer plus vite de « je cherche » à « on lance ».",
    smartTitle: "Matching intelligent", smartText: "Jeu, rôle, niveau, langue, horaires et état d’esprit : les bons critères, pas juste un pseudo.",
    squadTitle: "Des squads qui vivent", squadText: "Salons, vocal et sessions planifiées pour garder le groupe actif après le premier match.",
    everywhereTitle: "Toujours avec ta team", everywhereText: "Continue la conversation sur mobile et retrouve toute ta communauté sur PC.",
    safeTitle: "À toi de choisir", safeText: "Ton profil, tes disponibilités et tes préférences restent sous ton contrôle.",
    stepsKicker: "SIMPLE PAR DESIGN", stepsBefore: "Solo maintenant.", stepsAccent: "En squad dans 3 étapes.",
    steps: [["01", "Crée ton Gaming DNA", "Dis-nous à quoi tu joues, comment et quand."], ["02", "Découvre tes matches", "GameMate classe les profils vraiment compatibles."], ["03", "Lance la session", "Message, squad, vocal : tout est déjà prêt."]],
    ctaKicker: "TON PROCHAIN GG COMMENCE ICI", ctaBefore: "Prêt à rencontrer", ctaAccent: "ta prochaine team ?", ctaText: "Télécharge le Launcher GameMate et commence gratuitement.",
    version: "Dernière version", released: "publiée le", footerLine: "Good players. Better people.", languageLabel: "Passer le site en anglais",
  },
  en: {
    navProduct: "Product", navFeatures: "Features", navHow: "How it works", login: "Sign in", signup: "Create my profile",
    heroBadge: "The social app built for players", heroBefore: "The right mates.", heroAccent: "At the right time.",
    heroText: "GameMate understands how you play and connects you with people you can truly click with — skill, vibe and availability included.",
    download: "Download GameMate", discover: "See how it works", free: "Free · Windows 64-bit", matchLive: "LIVE MATCH", compatibility: "Compatibility", ready: "Ready to play", voice: "Voice live",
    playersOnline: "players online", downloads: "downloads", latest: "current version", socialProof: "One profile for your whole gaming life",
    productKicker: "MORE THAN MATCHING", productBefore: "Your gaming circle,", productAccent: "all in one place.",
    productText: "From the first match to the next session, keep your mates, messages and squads close on PC and mobile.",
    appLabel: "PC COMPANION", appTitle: "Tonight, nobody plays solo.", search: "Searching now", found: "3 mates found", squadTonight: "Tonight’s squad", ranked: "Ranked · 9:30 PM", join: "Join", mobileLabel: "MOBILE",
    featureKicker: "EVERYTHING CONNECTS", featureBefore: "Built for playing.", featureAccent: "Not scrolling.", featureText: "Every feature gets you from “looking” to “launching” faster.",
    smartTitle: "Smart matching", smartText: "Game, role, skill, language, schedule and mindset — the right signals, not just a username.",
    squadTitle: "Squads that stay alive", squadText: "Channels, voice and planned sessions keep the group active beyond the first match.",
    everywhereTitle: "Always with your team", everywhereText: "Keep chatting on mobile and find your whole community back on PC.",
    safeTitle: "You stay in control", safeText: "Your profile, availability and preferences remain yours to manage.",
    stepsKicker: "SIMPLE BY DESIGN", stepsBefore: "Solo right now.", stepsAccent: "Squadded in 3 steps.",
    steps: [["01", "Build your Gaming DNA", "Tell us what, how and when you play."], ["02", "Discover your matches", "GameMate ranks the players who truly fit."], ["03", "Launch the session", "Message, squad and voice are already there."]],
    ctaKicker: "YOUR NEXT GG STARTS HERE", ctaBefore: "Ready to meet", ctaAccent: "your next team?", ctaText: "Download the GameMate Launcher and start for free.",
    version: "Latest version", released: "released", footerLine: "Good players. Better people.", languageLabel: "Switch the website to French",
  },
} as const;

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>, bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8z"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>, check: <path d="m5 12 4 4L19 6"/>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></>, headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2Zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2Z"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>, message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>, radar: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 6-6"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>, sparkles: <><path d="m12 3-1.4 3.6L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.4Z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8ZM19 14l-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8Z"/></>,
    windows: <><path d="M3 5.5 11 4v7H3Zm10-1.8L21 2.5V11h-8ZM3 13h8v7l-8-1.4Zm10 0h8v8.5l-8-1.2Z"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function HomePage() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [lang, setLang] = useState<Language>("fr");
  const [stats, setStats] = useState<PublicStats>({ onlineUsers: 0, downloads: 0, latestVersion: "—", downloadUrl: FALLBACK_DOWNLOAD, publishedAt: null });
  const t = copy[lang];

  useEffect(() => {
    const saved = window.localStorage.getItem("gamemate-site-language");
    const preferred = saved === "fr" || saved === "en" ? saved : navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
    const timer = window.setTimeout(() => setLang(preferred), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { window.localStorage.setItem("gamemate-site-language", lang); document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    let cancelled = false;
    async function loadStats() { try { const response = await fetch("/api/public-stats", { cache: "no-store" }); if (!response.ok) return; const data = await response.json() as PublicStats; if (!cancelled) setStats(data); } catch {} }
    void loadStats(); const timer = window.setInterval(() => void loadStats(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const onSceneMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    sceneRef.current?.style.setProperty("--mx", ((((event.clientX - rect.left) / rect.width) - 0.5) * 2).toFixed(3));
    sceneRef.current?.style.setProperty("--my", ((((event.clientY - rect.top) / rect.height) - 0.5) * 2).toFixed(3));
  };
  const resetScene = () => { sceneRef.current?.style.setProperty("--mx", "0"); sceneRef.current?.style.setProperty("--my", "0"); };
  const formatNumber = (value: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB").format(value);
  const publishedLabel = stats.publishedAt && new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(stats.publishedAt));

  return <main className={styles.page}>
    <header className={styles.navbar}>
      <Link href="/" className={styles.brand} aria-label="GameMate"><span className={styles.brandMark}><Image src="/gamemate-mark-transparent.png" alt="" width={46} height={46} priority /></span><span className={styles.wordmark}>Game<b>Mate</b></span></Link>
      <nav className={styles.navLinks} aria-label="Navigation principale"><a href="#product">{t.navProduct}</a><a href="#features">{t.navFeatures}</a><a href="#how">{t.navHow}</a></nav>
      <div className={styles.navActions}><button className={styles.languageButton} type="button" onClick={() => setLang(lang === "fr" ? "en" : "fr")} aria-label={t.languageLabel}>{lang.toUpperCase()}</button><Link href="/login" className={styles.login}>{t.login}</Link><Link href="/signup" className={styles.signup}>{t.signup}<Icon name="arrow" /></Link></div>
    </header>

    <section className={styles.hero}>
      <div className={styles.aurora} aria-hidden="true"/><div className={styles.noise} aria-hidden="true"/>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <div className={styles.heroBadge}><span><Icon name="sparkles" /></span>{t.heroBadge}</div><h1><span>{t.heroBefore}</span><strong>{t.heroAccent}</strong></h1><p>{t.heroText}</p>
          <div className={styles.heroActions}><a href={stats.downloadUrl || FALLBACK_DOWNLOAD} className={styles.primaryButton}><Icon name="windows" />{t.download}<span><Icon name="download" /></span></a><a href="#product" className={styles.textButton}>{t.discover}<Icon name="arrow" /></a></div>
          <div className={styles.heroMeta}><span><Icon name="check" />{t.free}</span><span className={styles.avatarMini}><i>MK</i><i>JL</i><i>+9</i></span></div>
        </div>
        <div ref={sceneRef} className={styles.matchScene} onPointerMove={onSceneMove} onPointerLeave={resetScene}>
          <div className={styles.sceneFloor}/><div className={styles.sceneHalo}/><div className={styles.orbit}><span/><span/><span/><span/></div>
          <div className={styles.core}><div className={styles.coreGlow}/><Image src="/gamemate-mark-transparent.png" alt="" width={152} height={152} priority/><div className={styles.corePulse}/></div>
          <div className={`${styles.playerCard} ${styles.playerOne}`}><div className={styles.playerAvatar}>NO</div><div><strong>NOVA</strong><small>Support · FR</small></div><b>96%</b></div>
          <div className={`${styles.playerCard} ${styles.playerTwo}`}><div className={styles.playerAvatar}>KY</div><div><strong>KAYO</strong><small>Duelist · EU</small></div><b>91%</b></div>
          <div className={`${styles.playerCard} ${styles.playerThree}`}><div className={styles.playerAvatar}>MX</div><div><strong>MIXX</strong><small>Flex · FR</small></div><b>88%</b></div>
          <div className={styles.liveMatch}><span/><div><small>{t.matchLive}</small><strong>Valorant · Ranked</strong></div></div>
          <div className={styles.compatibility}><small>{t.compatibility}</small><strong>94<span>%</span></strong><div><i/></div></div><div className={styles.gameTag}>VALORANT</div><div className={styles.gameTagAlt}>21:30 · EU WEST</div>
        </div>
      </div><div className={styles.scrollCue}><span>SCROLL</span><i/></div>
    </section>

    <section className={styles.statsStrip} aria-label="GameMate live"><p>{t.socialProof}</p><div className={styles.statsItems}><span><i className={styles.liveDot}/><strong>{formatNumber(stats.onlineUsers)}</strong>{t.playersOnline}</span><span><Icon name="download"/><strong>{formatNumber(stats.downloads)}</strong>{t.downloads}</span><span><Icon name="bolt"/><strong>{stats.latestVersion}</strong>{t.latest}</span></div></section>

    <section id="product" className={styles.productSection}>
      <div className={styles.sectionIntro}><div><p className={styles.kicker}>{t.productKicker}</p><h2>{t.productBefore}<br/><span>{t.productAccent}</span></h2></div><p>{t.productText}</p></div>
      <div className={styles.productStage}><div className={styles.stageGlow}/>
        <div className={styles.desktopMockup}><div className={styles.windowTop}><div><i/><i/><i/></div><span>GAMEMATE COMPANION</span><b>—　□　×</b></div><div className={styles.desktopBody}>
          <aside className={styles.appSidebar}><Image src="/gamemate-mark-transparent.png" alt="" width={38} height={38}/><span className={styles.activeNav}><Icon name="radar"/></span><span><Icon name="people"/></span><span><Icon name="message"/></span><span><Icon name="calendar"/></span><em>AM</em></aside>
          <div className={styles.appPanel}><div className={styles.appPanelTop}><div><small>{t.appLabel}</small><h3>{t.appTitle}</h3></div><span><i/> 12 online</span></div>
            <div className={styles.searchCard}><div className={styles.radarMini}><i/><i/><i/></div><div><small>{t.search}</small><strong>Valorant · Ranked · Diamond</strong><span><i/>{t.found}</span></div><button aria-label={t.join}><Icon name="arrow"/></button></div>
            <div className={styles.appColumns}><div className={styles.matesList}><div className={styles.panelHeading}><strong>Mates</strong><span>Voir tout</span></div>{[["N","Nova","96%"],["K","Kayo","91%"],["M","Mixx","88%"]].map(mate => <div className={styles.mateRow} key={mate[1]}><i>{mate[0]}</i><div><strong>{mate[1]}</strong><small>{t.ready}</small></div><b>{mate[2]}</b></div>)}</div>
              <div className={styles.squadPanel}><div className={styles.panelHeading}><strong>{t.squadTonight}</strong><Icon name="headset"/></div><div className={styles.squadOrb}><span>R</span><i/><i/><i/></div><h4>Ranked Rush</h4><p>{t.ranked}</p><button><Icon name="headset"/>{t.join}</button></div></div>
          </div></div></div>
        <div className={styles.phoneMockup}><div className={styles.phoneIsland}/><div className={styles.phoneStatus}><b>9:41</b><span>● ◒ ▰</span></div><div className={styles.phoneBrand}><Image src="/gamemate-mark-transparent.png" alt="" width={32} height={32}/><span>{t.mobileLabel}</span><i/></div><h3>Hey Alex,<br/><span>ta squad t’attend.</span></h3>
          <div className={styles.mobileSquad}><div className={styles.mobileSquadTop}><span>RR</span><div><strong>Ranked Rush</strong><small>4 mates en ligne</small></div><b><Icon name="headset"/></b></div><div className={styles.waveform}>{Array.from({length:22}).map((_,index)=><i key={index}/>)}</div><button>{t.voice}<span><Icon name="arrow"/></span></button></div><div className={styles.mobileTabs}><Icon name="radar"/><Icon name="people"/><Icon name="message"/><Icon name="heart"/></div>
        </div>
        <div className={styles.floatingNotification}><span><Icon name="bolt"/></span><div><small>PLAY NOW</small><strong>{t.found}</strong></div><i>maintenant</i></div>
      </div>
    </section>

    <section id="features" className={styles.featuresSection}><div className={styles.featuresHeader}><p className={styles.kicker}>{t.featureKicker}</p><h2>{t.featureBefore}<br/><span>{t.featureAccent}</span></h2><p>{t.featureText}</p></div>
      <div className={styles.bentoGrid}>
        <article className={`${styles.bentoCard} ${styles.smartCard}`}><div className={styles.cardIcon}><Icon name="radar"/></div><span className={styles.cardIndex}>01</span><h3>{t.smartTitle}</h3><p>{t.smartText}</p><div className={styles.dnaVisual}><div><span>PLAYSTYLE</span><strong>Competitive</strong></div><div><span>VIBE</span><strong>Chill + focus</strong></div><div><span>SCHEDULE</span><strong>Evenings</strong></div><i>94%</i></div></article>
        <article className={`${styles.bentoCard} ${styles.squadsCard}`}><div className={styles.cardIcon}><Icon name="people"/></div><span className={styles.cardIndex}>02</span><h3>{t.squadTitle}</h3><p>{t.squadText}</p><div className={styles.squadVisual}><div><i>AX</i><i>NO</i><i>KY</i><i>+2</i></div><span><Icon name="headset"/>LIVE</span></div></article>
        <article className={`${styles.bentoCard} ${styles.mobileCard}`}><div className={styles.cardIcon}><Icon name="message"/></div><span className={styles.cardIndex}>03</span><h3>{t.everywhereTitle}</h3><p>{t.everywhereText}</p><div className={styles.messageVisual}><span>On lance à 21h30 ?</span><span>Présent 👊</span><i>•••</i></div></article>
        <article className={`${styles.bentoCard} ${styles.safeCard}`}><div className={styles.cardIcon}><Icon name="shield"/></div><span className={styles.cardIndex}>04</span><h3>{t.safeTitle}</h3><p>{t.safeText}</p><div className={styles.safeVisual}><span><Icon name="check"/>Profil visible</span><span><Icon name="check"/>Invitations filtrées</span></div></article>
      </div>
    </section>

    <section id="how" className={styles.stepsSection}><div className={styles.stepsIntro}><p className={styles.kicker}>{t.stepsKicker}</p><h2>{t.stepsBefore}<br/><span>{t.stepsAccent}</span></h2></div><div className={styles.stepsList}>{t.steps.map(([number,title,text],index)=><article key={number}><span>{number}</span><div className={styles.stepIcon}><Icon name={(["sparkles","radar","headset"] as IconName[])[index]}/></div><div><h3>{title}</h3><p>{text}</p></div>{index < 2 && <i/>}</article>)}</div></section>

    <section className={styles.ctaSection}><div className={styles.ctaGrid}/><div className={styles.ctaOrb}><div><Image src="/gamemate-mark-transparent.png" alt="" width={150} height={150}/></div><i/><i/></div><div className={styles.ctaContent}><p className={styles.kicker}>{t.ctaKicker}</p><h2>{t.ctaBefore}<br/><span>{t.ctaAccent}</span></h2><p>{t.ctaText}</p><div className={styles.ctaActions}><a href={stats.downloadUrl || FALLBACK_DOWNLOAD} className={styles.primaryButton}><Icon name="windows"/>{t.download}<span><Icon name="download"/></span></a><Link href="/signup" className={styles.textButton}>{t.signup}<Icon name="arrow"/></Link></div><small>{t.version} {stats.latestVersion}{publishedLabel ? ` · ${t.released} ${publishedLabel}` : ""}</small></div></section>

    <footer className={styles.footer}><div><Link href="/" className={styles.brand}><span className={styles.brandMark}><Image src="/gamemate-mark-transparent.png" alt="" width={46} height={46}/></span><span className={styles.wordmark}>Game<b>Mate</b></span></Link><p>{t.footerLine}</p></div><div className={styles.footerLinks}><a href="#product">{t.navProduct}</a><a href="#features">{t.navFeatures}</a><a href="#how">{t.navHow}</a><Link href="/login">{t.login}</Link></div><small>© {new Date().getFullYear()} GameMate</small></footer>
  </main>;
}
