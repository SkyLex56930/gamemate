import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const appWindow = getCurrentWindow();

type CompanionStatus = {
  installed: boolean;
  path: string | null;
};

type LauncherState =
  | "checking"
  | "ready"
  | "installing"
  | "launching"
  | "error";

const EMPTY_STATUS: CompanionStatus = {
  installed: false,
  path: null,
};

function App() {
  const [launcherState, setLauncherState] =
    useState<LauncherState>("checking");
  const [companion, setCompanion] =
    useState<CompanionStatus>(EMPTY_STATUS);
  const [message, setMessage] = useState(
    "Vérification de GameMate Companion...",
  );

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    setLauncherState("checking");
    setMessage("Vérification de GameMate Companion...");

    try {
      const status =
        await invoke<CompanionStatus>("companion_status");

      setCompanion(status);
      setLauncherState("ready");
      setMessage(
        status.installed
          ? "GameMate Companion est installé sur ce PC."
          : "GameMate Companion n’est pas encore installé.",
      );
    } catch (error) {
      console.error(error);
      setLauncherState("error");
      setMessage(
        typeof error === "string"
          ? error
          : "Impossible de vérifier l’installation.",
      );
    }
  }

  async function installCompanion() {
    if (launcherState === "installing") return;

    setLauncherState("installing");
    setMessage(
      "Téléchargement de l’installateur officiel GameMate Companion...",
    );

    try {
      const status =
        await invoke<CompanionStatus>("install_companion");

      setCompanion(status);
      setLauncherState("ready");
      setMessage(
        "Installation terminée. GameMate Companion est prêt.",
      );
    } catch (error) {
      console.error(error);
      setLauncherState("error");
      setMessage(
        typeof error === "string"
          ? error
          : "Impossible d’installer GameMate Companion.",
      );
    }
  }

  async function launchCompanion() {
    if (launcherState === "launching") return;

    setLauncherState("launching");
    setMessage("Ouverture de GameMate Companion...");

    try {
      await invoke<string>("launch_companion");

      window.setTimeout(() => {
        setLauncherState("ready");
        setMessage(
          "GameMate Companion est installé sur ce PC.",
        );
      }, 1500);
    } catch (error) {
      console.error(error);
      setLauncherState("error");
      setMessage(
        typeof error === "string"
          ? error
          : "Impossible de lancer GameMate Companion.",
      );
    }
  }

  async function handlePrimaryAction() {
    if (
      launcherState === "checking" ||
      launcherState === "installing" ||
      launcherState === "launching"
    ) {
      return;
    }

    if (companion.installed) {
      await launchCompanion();
    } else {
      await installCompanion();
    }
  }

  async function handleMinimize() {
    await appWindow.minimize();
  }

  async function handleToggleMaximize() {
    await appWindow.toggleMaximize();
  }

  async function handleClose() {
    await appWindow.close();
  }

  async function handleStartDragging() {
    await appWindow.startDragging();
  }

  const busy =
    launcherState === "checking" ||
    launcherState === "installing" ||
    launcherState === "launching";

  const primaryLabel =
    launcherState === "installing"
      ? "Installation..."
      : launcherState === "launching"
        ? "Lancement..."
        : companion.installed
          ? "Lancer GameMate"
          : "Installer GameMate";

  const statusLabel =
    launcherState === "checking"
      ? "Vérification"
      : launcherState === "installing"
        ? "Installation"
        : launcherState === "launching"
          ? "Lancement"
          : launcherState === "error"
            ? "Erreur"
            : companion.installed
              ? "Prêt"
              : "À installer";

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
            >
              <span className="minimize-icon" />
            </button>

            <button
              type="button"
              className="window-button"
              onClick={() => void handleToggleMaximize()}
              aria-label="Agrandir ou restaurer"
            >
              <span className="maximize-icon" />
            </button>

            <button
              type="button"
              className="window-button window-close"
              onClick={() => void handleClose()}
              aria-label="Fermer"
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
              <div
                className={`status-pill ${
                  companion.installed ? "" : "status-pill-install"
                } ${launcherState === "error" ? "status-pill-error" : ""}`}
              >
                <span className="status-dot" />
                {companion.installed
                  ? "Prêt à jouer"
                  : "Installation requise"}
              </div>

              <p className="eyebrow">GAMEMATE COMPANION</p>

              <h1>
                {companion.installed
                  ? "Tout est prêt."
                  : "Installe GameMate."}
                <span>
                  {companion.installed
                    ? "Lance le Companion."
                    : "Le Launcher s’occupe du reste."}
                </span>
              </h1>

              <p className="hero-description">
                {companion.installed
                  ? "Le Companion installé sur Windows a été détecté. Aucun dossier de développement n’est utilisé."
                  : "Le Launcher télécharge l’installateur Windows depuis la release GameMate puis lance une vraie installation sur ce PC."}
              </p>

              <div className="hero-actions">
                <button
                  type="button"
                  className="launch-button"
                  onClick={() => void handlePrimaryAction()}
                  disabled={busy}
                >
                  <span className="play-icon">
                    {companion.installed ? "▶" : "↓"}
                  </span>
                  {primaryLabel}
                </button>

                <button
                  type="button"
                  className="check-button"
                  onClick={() => void refreshStatus()}
                  disabled={busy}
                >
                  Vérifier l’installation
                </button>
              </div>

              <div className="launcher-message" role="status">
                <span
                  className={`launcher-message-dot ${launcherState}`}
                />
                {message}
              </div>

              <div className="version-row">
                <div>
                  <span>VERSION INSTALLÉE</span>
                  <strong>
                    {companion.installed
                      ? "Alpha 0.1.0"
                      : "Non installé"}
                  </strong>
                </div>

                <div>
                  <span>DERNIÈRE VERSION</span>
                  <strong>Alpha 0.1.0</strong>
                </div>

                <div>
                  <span>ÉTAT</span>
                  <strong
                    className={
                      companion.installed ? "online" : ""
                    }
                  >
                    {statusLabel}
                  </strong>
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
                  <span className="eyebrow">INSTALLATION WINDOWS</span>
                  <h2>GameMate Companion</h2>
                </div>
                <span className="date-badge">ALPHA 0.1.0</span>
              </div>

              <p>
                Cette version n’utilise plus le dossier
                <strong> gamemate\companion</strong> de ton PC de
                développement. Elle utilise uniquement le Companion
                réellement installé sous Windows.
              </p>

              <ul>
                <li>Téléchargement réel</li>
                <li>Installateur Windows réel</li>
                <li>Aucun npm pour lancer l’application</li>
              </ul>
            </article>

            <article className="status-card">
              <span className="eyebrow">ÉTAT DU COMPANION</span>

              <div className="install-state">
                <div
                  className={`install-icon ${
                    companion.installed ? "installed" : ""
                  } ${launcherState === "error" ? "install-error" : ""}`}
                >
                  {companion.installed
                    ? "✓"
                    : launcherState === "error"
                      ? "!"
                      : "↓"}
                </div>

                <div>
                  <strong>{statusLabel}</strong>
                  <span>{message}</span>
                </div>
              </div>

              <div className="progress-track">
                <div
                  className={`progress-fill ${
                    busy ? "progress-indeterminate" : ""
                  }`}
                  style={{
                    width: companion.installed ? "100%" : busy ? "38%" : "0%",
                  }}
                />
              </div>

              <div className="progress-meta">
                <span>GameMate Companion</span>
                <span>{statusLabel}</span>
              </div>
            </article>
          </section>
        </main>

        <footer className="launcher-footer">
          <span>GameMate Launcher · Alpha</span>
          <span className="footer-dot">•</span>
          <span>Windows</span>
        </footer>

        {launcherState === "launching" && (
          <div className="launch-splash">
            <div className="launch-splash-card">
              <img src="/gamemate-logo.png" alt="GameMate" />
              <strong>Lancement du Companion…</strong>
              <span>Ouverture de l’application installée.</span>
              <div className="launch-splash-loader" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
