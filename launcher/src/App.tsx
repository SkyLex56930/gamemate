import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const appWindow = getCurrentWindow();

type LauncherState = "ready" | "checking" | "updating";

function App() {
  const [launcherState, setLauncherState] =
    useState<LauncherState>("ready");
  const [progress, setProgress] = useState(0);
  const [launchLoading, setLaunchLoading] = useState(false);

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

  async function handleLaunch() {
    if (launchLoading) return;

    setLaunchLoading(true);

    try {
      const message = await invoke<string>("launch_companion");
      console.log(message);
    } catch (error) {
      console.error("Erreur lancement Companion :", error);

      alert(
        typeof error === "string"
          ? error
          : "Impossible de lancer le Companion.",
      );
    } finally {
      // On laisse un court délai pour éviter un double-clic immédiat.
      window.setTimeout(() => {
        setLaunchLoading(false);
      }, 1400);
    }
  }

  function simulateUpdateCheck() {
    if (launcherState !== "ready") return;

    setLauncherState("checking");
    setProgress(12);

    window.setTimeout(() => setProgress(38), 250);
    window.setTimeout(() => setProgress(72), 520);
    window.setTimeout(() => {
      setProgress(100);
      setLauncherState("ready");
    }, 850);
  }

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
              className="window-button"
              onClick={() => void handleMinimize()}
              aria-label="Réduire"
              title="Réduire"
            >
              <span className="minimize-icon" />
            </button>

            <button
              type="button"
              className="window-button"
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

        <main className="launcher-main">
          <div className="ambient ambient-purple" />
          <div className="ambient ambient-blue" />

          <section className="hero-panel">
            <div className="hero-copy">
              <div className="status-pill">
                <span className="status-dot" />
                Prêt à jouer
              </div>

              <p className="eyebrow">GAMEMATE COMPANION</p>

              <h1>
                Tout est prêt.
                <span>Lance GameMate.</span>
              </h1>

              <p className="hero-description">
                Le launcher s&apos;occupe uniquement de vérifier ta version,
                mettre GameMate à jour et lancer le Companion.
              </p>

              <div className="hero-actions">
                <button
                  type="button"
                  className="launch-button"
                  onClick={() => void handleLaunch()}
                  disabled={
                    launcherState !== "ready" || launchLoading
                  }
                >
                  <span className="play-icon">▶</span>
                  {launchLoading
                    ? "Lancement..."
                    : "Lancer GameMate"}
                </button>

                <button
                  type="button"
                  className="check-button"
                  onClick={simulateUpdateCheck}
                  disabled={
                    launcherState !== "ready" || launchLoading
                  }
                >
                  Vérifier les mises à jour
                </button>
              </div>

              <div className="version-row">
                <div>
                  <span>VERSION INSTALLÉE</span>
                  <strong>Alpha 0.1.0</strong>
                </div>

                <div>
                  <span>DERNIÈRE VERSION</span>
                  <strong>Alpha 0.1.0</strong>
                </div>

                <div>
                  <span>ÉTAT</span>
                  <strong className="online">À jour</strong>
                </div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="logo-ring logo-ring-one" />
              <div className="logo-ring logo-ring-two" />
              <div className="logo-aura" />

              <img
                src="/gamemate-logo.png"
                alt="Logo GameMate"
                className="hero-logo"
              />
            </div>
          </section>

          <section className="bottom-grid">
            <article className="update-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    DERNIÈRE MISE À JOUR
                  </span>
                  <h2>GameMate Alpha 0.1.0</h2>
                </div>

                <span className="date-badge">
                  17 SEPT. 2026
                </span>
              </div>

              <p>
                Nouvelle base du Launcher, Companion en
                développement actif et amélioration générale de
                l&apos;expérience GameMate.
              </p>

              <ul>
                <li>Launcher simplifié</li>
                <li>Accès direct au Companion</li>
                <li>
                  Préparation du système de mise à jour
                </li>
              </ul>
            </article>

            <article className="status-card">
              <span className="eyebrow">INSTALLATION</span>

              <div className="install-state">
                <div className="install-icon">✓</div>

                <div>
                  <strong>
                    {launcherState === "checking"
                      ? "Vérification en cours..."
                      : launcherState === "updating"
                        ? "Mise à jour en cours..."
                        : "GameMate est à jour"}
                  </strong>
                  <span>
                    {launcherState === "ready"
                      ? "Aucune mise à jour nécessaire."
                      : "Patiente quelques secondes."}
                  </span>
                </div>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width:
                      launcherState === "ready" &&
                      progress === 0
                        ? "100%"
                        : `${progress}%`,
                  }}
                />
              </div>

              <div className="progress-meta">
                <span>GameMate Companion</span>
                <span>
                  {launcherState === "ready"
                    ? "Prêt"
                    : `${Math.max(progress, 1)}%`}
                </span>
              </div>
            </article>
          </section>
        </main>

        <footer className="launcher-footer">
          <span>GameMate Launcher · Alpha</span>
          <span className="footer-dot">•</span>
          <span>Windows</span>
        </footer>
      </div>
    </div>
  );
}

export default App;
