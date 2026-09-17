import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { supabase } from "./lib/supabase";
import "./App.css";

type Section = "home" | "news" | "settings";

type Profile = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const appWindow = getCurrentWindow();

function App() {
  const [section, setSection] = useState<Section>("home");

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loginError, setLoginError] = useState("");
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session);

      if (session?.user) {
        await loadProfile(session.user.id);
      }

      setAuthLoading(false);
    }

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);

      if (currentSession?.user) {
        await loadProfile(currentSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Erreur profil :", error);
      return;
    }

    setProfile(data);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoginError("");
    setLoginLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error("Erreur Supabase login :", error);

      setLoginError(`${error.name} : ${error.message}`);

      setLoginLoading(false);
      return;
    }

    setSession(data.session);

    if (data.user) {
      await loadProfile(data.user.id);
    }

    setPassword("");
    setShowLogin(false);
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setSession(null);
    setProfile(null);
    setEmail("");
    setPassword("");
  }

  async function handleMinimize() {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error("Erreur minimize :", error);
    }
  }

  async function handleToggleMaximize() {
    try {
      await appWindow.toggleMaximize();
    } catch (error) {
      console.error("Erreur maximize :", error);
    }
  }

  async function handleClose() {
    try {
      await appWindow.close();
    } catch (error) {
      console.error("Erreur fermeture :", error);
    }
  }

  async function handleStartDragging() {
    try {
      await appWindow.startDragging();
    } catch (error) {
      console.error("Erreur déplacement :", error);
    }
  }

  const displayName =
    profile?.display_name ||
    profile?.username ||
    session?.user.email ||
    "Compte GameMate";

  const avatarLetter = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="launcher-shell">
      <div className="launcher">
        <div
          className="titlebar"
          onMouseDown={(event) => {
            if (event.button === 0) {
              void handleStartDragging();
            }
          }}
          onDoubleClick={() => {
            void handleToggleMaximize();
          }}
        >
          <div className="titlebar-left">
            <img
              src="/gamemate-logo.png"
              alt="GameMate"
              className="titlebar-logo"
            />

            <div className="titlebar-brand">
              <strong>GameMate</strong>
              <span>Launcher</span>
            </div>
          </div>

          <div
            className="window-controls"
            onMouseDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="window-button window-minimize"
              onClick={() => void handleMinimize()}
              aria-label="Réduire"
              title="Réduire"
            >
              <span className="minimize-icon" />
            </button>

            <button
              type="button"
              className="window-button window-maximize"
              onClick={() => void handleToggleMaximize()}
              aria-label="Agrandir ou restaurer"
              title="Agrandir / Restaurer"
            >
              <span className="maximize-icon" />
            </button>

            <button
              type="button"
              className="window-button window-close"
              onClick={() => void handleClose()}
              aria-label="Fermer"
              title="Fermer"
            >
              <span className="close-icon">×</span>
            </button>
          </div>
        </div>

        <div className="launcher-body">
          <aside className="sidebar">
            <div className="brand">
              <img
                src="/gamemate-logo.png"
                alt="GameMate"
                className="brand-logo"
              />

              <div>
                <div className="brand-name">GameMate</div>
                <div className="brand-subtitle">Companion</div>
              </div>
            </div>

            <nav className="navigation">
              <button
                type="button"
                className={`nav-item ${
                  section === "home" ? "active" : ""
                }`}
                onClick={() => setSection("home")}
              >
                <span>⌂</span>
                Accueil
              </button>

              <button
                type="button"
                className={`nav-item ${
                  section === "news" ? "active" : ""
                }`}
                onClick={() => setSection("news")}
              >
                <span>✦</span>
                Nouveautés
              </button>

              <button
                type="button"
                className={`nav-item ${
                  section === "settings" ? "active" : ""
                }`}
                onClick={() => setSection("settings")}
              >
                <span>⚙</span>
                Paramètres
              </button>
            </nav>

            <div className="sidebar-bottom">
              <div className="service-status">
                <span className="status-dot" />

                <div>
                  <strong>Services opérationnels</strong>
                  <span>Tous les systèmes fonctionnent</span>
                </div>
              </div>

              <div className="version">
                GameMate Launcher • Alpha 0.1.0
              </div>
            </div>
          </aside>

          <main className="main">
            <header className="topbar">
              <div>
                <span className="topbar-label">GAMEMATE</span>

                <strong>
                  {section === "home" && "Accueil"}
                  {section === "news" && "Nouveautés"}
                  {section === "settings" && "Paramètres"}
                </strong>
              </div>

              <div className="profile">
                <div className="profile-avatar">
                  {authLoading ? (
                    "…"
                  ) : session && profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="profile-avatar-image"
                    />
                  ) : (
                    avatarLetter
                  )}
                </div>

                <div className="profile-info">
                  <strong>
                    {authLoading
                      ? "Chargement..."
                      : session
                        ? displayName
                        : "Compte GameMate"}
                  </strong>

                  <span>
                    {authLoading
                      ? "Vérification de la session"
                      : session
                        ? "● Connecté"
                        : "Non connecté"}
                  </span>
                </div>

                {session ? (
                  <button
                    type="button"
                    className="profile-menu"
                    onClick={() => void handleLogout()}
                    title="Se déconnecter"
                  >
                    ⎋
                  </button>
                ) : (
                  <button
                    type="button"
                    className="profile-menu"
                    onClick={() => setShowLogin(true)}
                    title="Se connecter"
                  >
                    →
                  </button>
                )}
              </div>
            </header>

            {section === "home" && (
              <div className="page">
                <section className="hero">
                  <div className="hero-glow hero-glow-purple" />
                  <div className="hero-glow hero-glow-blue" />

                  <div className="hero-content">
                    <div className="alpha-badge">
                      <span />
                      GameMate Alpha
                    </div>

                    <h1>
                      Ton univers gaming.
                      <span>Tes prochains mates.</span>
                    </h1>

                    <p>
                      GameMate rassemble tes joueurs, tes squads et tes
                      communautés directement sur ton PC.
                    </p>

                    <div className="hero-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          alert("Le Companion GameMate sera lancé ici.")
                        }
                      >
                        <span>▶</span>
                        Lancer GameMate
                      </button>

                      <div className="update-state">
                        <span className="check">✓</span>

                        <div>
                          <strong>Tu es à jour</strong>
                          <span>Version Alpha 0.1.0</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hero-logo-wrap">
                    <div className="logo-aura" />

                    <img
                      src="/gamemate-logo.png"
                      alt=""
                      className="hero-logo"
                    />
                  </div>
                </section>

                <section className="dashboard-grid">
                  <div className="card account-card">
                    <div className="card-header">
                      <div>
                        <span className="eyebrow">TON COMPTE</span>

                        <h2>
                          {session
                            ? `Bienvenue ${displayName}`
                            : "Connecte-toi à GameMate"}
                        </h2>
                      </div>

                      <span className="card-icon">◎</span>
                    </div>

                    {session ? (
                      <>
                        <p>
                          Ton compte GameMate est connecté. Ton profil est
                          chargé automatiquement et ta session restera
                          active lors du prochain lancement.
                        </p>

                        <div className="account-actions">
                          <button
                            type="button"
                            className="secondary-button"
                          >
                            Voir mon profil
                          </button>

                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void handleLogout()}
                          >
                            Se déconnecter
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p>
                          Utilise le même compte que sur le portail
                          GameMate pour retrouver ton profil, tes jeux et
                          ton Gaming DNA.
                        </p>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setShowLogin(true)}
                        >
                          Se connecter
                        </button>
                      </>
                    )}
                  </div>

                  <div className="card status-card">
                    <div className="card-header">
                      <div>
                        <span className="eyebrow">ÉTAT</span>
                        <h2>Services GameMate</h2>
                      </div>

                      <span className="status-big">●</span>
                    </div>

                    <div className="services">
                      <div>
                        <span>Authentification</span>
                        <strong className="online">Opérationnel</strong>
                      </div>

                      <div>
                        <span>Profils</span>
                        <strong className="online">Opérationnel</strong>
                      </div>

                      <div>
                        <span>Companion</span>
                        <strong className="development">
                          En développement
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="card news-card">
                    <span className="eyebrow">
                      DERNIÈRES NOUVEAUTÉS
                    </span>

                    <h2>GameMate prend vie.</h2>

                    <p>
                      Le portail web est opérationnel et le développement
                      du Companion Windows continue.
                    </p>

                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSection("news")}
                    >
                      Voir les nouveautés →
                    </button>
                  </div>

                  <div className="card coming-card">
                    <span className="eyebrow">BIENTÔT</span>

                    <h2>Le vrai GameMate arrive ici.</h2>

                    <div className="feature-list">
                      <span>
                        <i>✓</i> Trouver des mates
                      </span>

                      <span>
                        <i>✓</i> Squads & Teams
                      </span>

                      <span>
                        <i>✓</i> Messages
                      </span>

                      <span>
                        <i>✓</i> Overlay en jeu
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {section === "news" && (
              <div className="page">
                <div className="section-heading">
                  <span className="eyebrow">GAMEMATE NEWS</span>

                  <h1>Nouveautés</h1>

                  <p>Suis l&apos;évolution de GameMate.</p>
                </div>

                <div className="news-list">
                  <article className="news-item">
                    <div className="news-date">
                      SEPT.
                      <strong>16</strong>
                      2026
                    </div>

                    <div>
                      <span className="news-tag">COMPANION</span>

                      <h2>Développement du Companion</h2>

                      <p>
                        Le Companion GameMate dispose maintenant de sa
                        première interface et de son profil connecté.
                      </p>
                    </div>
                  </article>

                  <article className="news-item">
                    <div className="news-date">
                      SEPT.
                      <strong>16</strong>
                      2026
                    </div>

                    <div>
                      <span className="news-tag">AUTH</span>

                      <h2>Connexion Supabase</h2>

                      <p>
                        Le même compte GameMate fonctionne maintenant dans
                        le launcher Windows.
                      </p>
                    </div>
                  </article>
                </div>
              </div>
            )}

            {section === "settings" && (
              <div className="page">
                <div className="section-heading">
                  <span className="eyebrow">LAUNCHER</span>

                  <h1>Paramètres</h1>

                  <p>
                    Personnalise le comportement du GameMate Launcher.
                  </p>
                </div>

                <div className="settings-list">
                  <div className="setting-row">
                    <div>
                      <strong>Lancer au démarrage de Windows</strong>

                      <span>
                        Démarrer automatiquement le launcher avec ton PC.
                      </span>
                    </div>

                    <button type="button" className="toggle">
                      <span />
                    </button>
                  </div>

                  <div className="setting-row">
                    <div>
                      <strong>Mises à jour automatiques</strong>

                      <span>
                        Installer automatiquement les nouvelles versions.
                      </span>
                    </div>

                    <button type="button" className="toggle enabled">
                      <span />
                    </button>
                  </div>

                  <div className="setting-row">
                    <div>
                      <strong>
                        Réduire dans la zone de notification
                      </strong>

                      <span>
                        Garder GameMate actif en arrière-plan.
                      </span>
                    </div>

                    <button type="button" className="toggle enabled">
                      <span />
                    </button>
                  </div>

                  {session && (
                    <div className="setting-row">
                      <div>
                        <strong>Compte GameMate</strong>
                        <span>{session.user.email}</span>
                      </div>

                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => void handleLogout()}
                      >
                        Déconnexion
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>

        {showLogin && !session && (
          <div className="login-overlay">
            <div className="login-modal">
              <button
                type="button"
                className="login-close"
                onClick={() => setShowLogin(false)}
              >
                ×
              </button>

              <img
                src="/gamemate-logo.png"
                alt="GameMate"
                className="login-logo"
              />

              <span className="eyebrow">COMPTE GAMEMATE</span>

              <h2>Connexion</h2>

              <p>
                Connecte-toi avec le même compte que sur le portail
                GameMate.
              </p>

              <form onSubmit={handleLogin} className="login-form">
                <label>
                  Adresse email

                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="ton@email.com"
                    autoComplete="email"
                  />
                </label>

                <label>
                  Mot de passe

                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </label>

                {loginError && (
                  <div className="login-error">{loginError}</div>
                )}

                <button
                  type="submit"
                  className="primary-button login-submit"
                  disabled={loginLoading}
                >
                  {loginLoading ? "Connexion..." : "Se connecter"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;