import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playMessageSendSound, playNotificationSound, soundPreferenceKeys } from "../lib/audio";
import "./SettingsPage.css";

type UiScale = "compact" | "normal" | "large" | "xlarge";
type PerfPreset = "eco" | "balanced" | "high" | "ultra" | "custom";
type PresenceStatus = "online" | "busy" | "offline";
type StartupSection = "home" | "play" | "friends" | "messages";
type NavigationMode = "full" | "compact";

type PerformanceSettings = {
  preset: PerfPreset;
  glow: number;
  blur: number;
  particles: number;
  motion: number;
  reduceWhenInactive: boolean;
};

type Props = {
  session: Session | null;
  displayName: string;
  uiScale: UiScale;
  performance: PerformanceSettings;
  navigationMode: NavigationMode;
  notificationBadges: boolean;
  onScaleChange: (value: UiScale) => void;
  onPerformanceChange: (value: PerformanceSettings) => void;
  onNavigationModeChange: (value: NavigationMode) => void;
  onNotificationBadgesChange: (value: boolean) => void;
  onLogin: () => void;
  onLogout: () => void;
};

type Tab =
  | "general"
  | "interface"
  | "performance"
  | "sounds"
  | "presence"
  | "messages"
  | "account"
  | "advanced";

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "general", label: "Général", icon: "⌂" },
  { id: "interface", label: "Interface", icon: "◫" },
  { id: "performance", label: "Performances", icon: "⚡" },
  { id: "sounds", label: "Sons & notifications", icon: "♪" },
  { id: "presence", label: "Présence", icon: "●" },
  { id: "messages", label: "Messages", icon: "✦" },
  { id: "account", label: "Compte", icon: "◌" },
  { id: "advanced", label: "Avancé", icon: "⚙" },
];

const performancePresets: Record<Exclude<PerfPreset, "custom">, PerformanceSettings> = {
  eco: {
    preset: "eco",
    glow: 20,
    blur: 15,
    particles: 0,
    motion: 20,
    reduceWhenInactive: true,
  },
  balanced: {
    preset: "balanced",
    glow: 50,
    blur: 40,
    particles: 30,
    motion: 55,
    reduceWhenInactive: true,
  },
  high: {
    preset: "high",
    glow: 82,
    blur: 72,
    particles: 68,
    motion: 80,
    reduceWhenInactive: true,
  },
  ultra: {
    preset: "ultra",
    glow: 100,
    blur: 100,
    particles: 100,
    motion: 100,
    reduceWhenInactive: false,
  },
};

function readBool(key: string, fallback = true) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value !== "false";
  } catch {
    return fallback;
  }
}

function readStartupSection(): StartupSection {
  const value = localStorage.getItem("gamemate-startup-section");
  return value === "play" || value === "friends" || value === "messages" ? value : "home";
}

function readPresence(): PresenceStatus {
  const value = localStorage.getItem("gamemate-presence-status");
  return value === "busy" || value === "offline" ? value : "online";
}

export default function SettingsPage({
  session,
  displayName,
  uiScale,
  performance,
  navigationMode,
  notificationBadges,
  onScaleChange,
  onPerformanceChange,
  onNavigationModeChange,
  onNotificationBadgesChange,
  onLogin,
  onLogout,
}: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [startupSection, setStartupSection] = useState<StartupSection>(readStartupSection);
  const [presence, setPresence] = useState<PresenceStatus>(readPresence);
  const [soundEnabled, setSoundEnabled] = useState(() => readBool(soundPreferenceKeys.all, true));
  const [notificationSound, setNotificationSound] = useState(() => readBool(soundPreferenceKeys.receive, true));
  const [messageSendSound, setMessageSendSound] = useState(() => readBool(soundPreferenceKeys.send, true));
  const [enterToSend, setEnterToSend] = useState(() => readBool("gamemate-enter-to-send", true));
  const [notice, setNotice] = useState("");

  const accountEmail = session?.user?.email ?? null;

  const activePreset = useMemo(() => {
    if (performance.preset !== "custom") return performance.preset;
    return "custom";
  }, [performance]);

  function saveStartup(value: StartupSection) {
    setStartupSection(value);
    localStorage.setItem("gamemate-startup-section", value);
    setNotice("Page de démarrage enregistrée.");
  }

  function setSound(key: string, value: boolean, setter: (value: boolean) => void) {
    setter(value);
    localStorage.setItem(key, String(value));
  }

  async function changePresence(value: PresenceStatus) {
    setPresence(value);
    localStorage.setItem("gamemate-presence-status", value);
    window.dispatchEvent(new Event("gamemate-presence-status-changed"));

    if (session) {
      const { error } = await supabase.rpc("set_my_presence", { p_status: value });
      if (error) {
        console.error("set_my_presence:", error);
        setNotice("Le statut n’a pas pu être synchronisé.");
        return;
      }
    }

    setNotice("Statut de présence mis à jour.");
  }

  function setPreset(value: Exclude<PerfPreset, "custom">) {
    onPerformanceChange(performancePresets[value]);
  }

  function resetCompanionSettings() {
    [
      "gamemate-ui-scale",
      "gamemate-performance-settings",
      "gamemate-startup-section",
      "gamemate-navigation-mode",
      "gamemate-notification-badges-enabled",
      "gamemate-sound-enabled",
      "gamemate-notification-sound-enabled",
      "gamemate-message-send-sound-enabled",
      "gamemate-presence-status",
      "gamemate-enter-to-send",
    ].forEach((key) => localStorage.removeItem(key));

    window.location.reload();
  }

  return (
    <div className="settings-page">
      <header className="settings-head">
        <span className="settings-kicker">COMPANION</span>
        <h1>Paramètres</h1>
        <p>Personnalise GameMate selon ta façon de jouer.</p>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => {
                setTab(item.id);
                setNotice("");
              }}
            >
              <span>{item.icon}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </aside>

        <main className="settings-content">
          {notice && <div className="settings-notice">{notice}</div>}

          {tab === "general" && (
            <>
              <Section
                kicker="DÉMARRAGE"
                title="Ouverture du Companion"
                description="Choisis la page affichée quand GameMate démarre."
              >
                <ChoiceGrid>
                  <Choice active={startupSection === "home"} title="Accueil" subtitle="Tableau de bord" onClick={() => saveStartup("home")} />
                  <Choice active={startupSection === "play"} title="Jouer" subtitle="Play Now" onClick={() => saveStartup("play")} />
                  <Choice active={startupSection === "friends"} title="Amis" subtitle="Liste sociale" onClick={() => saveStartup("friends")} />
                  <Choice active={startupSection === "messages"} title="Messages" subtitle="Messagerie" onClick={() => saveStartup("messages")} />
                </ChoiceGrid>
              </Section>

              <Section
                kicker="NOTIFICATIONS"
                title="Indicateurs dans l’application"
                description="Contrôle les compteurs rouges affichés dans la navigation."
              >
                <Toggle
                  title="Badges de notifications"
                  description="Afficher les nombres de demandes et messages non lus."
                  checked={notificationBadges}
                  onChange={onNotificationBadgesChange}
                />
              </Section>
            </>
          )}

          {tab === "interface" && (
            <>
              <Section
                kicker="TAILLE"
                title="Échelle de l’interface"
                description="Agrandis ou réduis l’ensemble du Companion."
              >
                <ChoiceGrid>
                  {(["compact", "normal", "large", "xlarge"] as UiScale[]).map((scale) => (
                    <Choice
                      key={scale}
                      active={uiScale === scale}
                      title={
                        scale === "compact"
                          ? "Compact"
                          : scale === "normal"
                          ? "Normal"
                          : scale === "large"
                          ? "Grand"
                          : "Très grand"
                      }
                      subtitle={
                        scale === "compact"
                          ? "90 %"
                          : scale === "normal"
                          ? "100 %"
                          : scale === "large"
                          ? "115 %"
                          : "130 %"
                      }
                      onClick={() => onScaleChange(scale)}
                    />
                  ))}
                </ChoiceGrid>
              </Section>

              <Section
                kicker="NAVIGATION"
                title="Barre latérale"
                description="Choisis une navigation complète ou uniquement les icônes."
              >
                <ChoiceGrid>
                  <Choice
                    active={navigationMode === "full"}
                    title="Complète"
                    subtitle="Icônes + libellés"
                    onClick={() => onNavigationModeChange("full")}
                  />
                  <Choice
                    active={navigationMode === "compact"}
                    title="Compacte"
                    subtitle="Icônes uniquement"
                    onClick={() => onNavigationModeChange("compact")}
                  />
                </ChoiceGrid>
              </Section>
            </>
          )}

          {tab === "performance" && (
            <>
              <Section
                kicker="PRÉRÉGLAGES"
                title="Qualité visuelle"
                description="Les préréglages modifient réellement les effets du Companion."
              >
                <ChoiceGrid>
                  {(["eco", "balanced", "high", "ultra"] as const).map((preset) => (
                    <Choice
                      key={preset}
                      active={activePreset === preset}
                      title={
                        preset === "eco"
                          ? "Éco"
                          : preset === "balanced"
                          ? "Équilibré"
                          : preset === "high"
                          ? "Élevé"
                          : "Ultra"
                      }
                      subtitle={
                        preset === "eco"
                          ? "Effets minimum"
                          : preset === "balanced"
                          ? "Bon compromis"
                          : preset === "high"
                          ? "Qualité élevée"
                          : "Tous les effets"
                      }
                      onClick={() => setPreset(preset)}
                    />
                  ))}
                </ChoiceGrid>
              </Section>

              <Section
                kicker="RÉGLAGES MANUELS"
                title="Effets"
                description="Modifier un curseur passe automatiquement en mode personnalisé."
              >
                <Range
                  title="Glow"
                  value={performance.glow}
                  onChange={(value) => onPerformanceChange({ ...performance, preset: "custom", glow: value })}
                />
                <Range
                  title="Flou"
                  value={performance.blur}
                  onChange={(value) => onPerformanceChange({ ...performance, preset: "custom", blur: value })}
                />
                <Range
                  title="Particules"
                  value={performance.particles}
                  onChange={(value) => onPerformanceChange({ ...performance, preset: "custom", particles: value })}
                />
                <Range
                  title="Animations"
                  value={performance.motion}
                  onChange={(value) => onPerformanceChange({ ...performance, preset: "custom", motion: value })}
                />

                <Toggle
                  title="Réduire les effets en arrière-plan"
                  description="Diminue les effets quand la fenêtre GameMate n’est pas active."
                  checked={performance.reduceWhenInactive}
                  onChange={(value) =>
                    onPerformanceChange({
                      ...performance,
                      preset: "custom",
                      reduceWhenInactive: value,
                    })
                  }
                />
              </Section>
            </>
          )}

          {tab === "sounds" && (
            <>
              <Section
                kicker="SON"
                title="Audio du Companion"
                description="Ces réglages contrôlent les sons déjà utilisés par GameMate."
              >
                <Toggle
                  title="Activer les sons"
                  description="Interrupteur principal des sons du Companion."
                  checked={soundEnabled}
                  onChange={(value) => setSound(soundPreferenceKeys.all, value, setSoundEnabled)}
                />
                <Toggle
                  title="Son de notification"
                  description="Joué quand une nouvelle notification arrive."
                  checked={notificationSound}
                  disabled={!soundEnabled}
                  onChange={(value) => setSound(soundPreferenceKeys.receive, value, setNotificationSound)}
                  actionLabel="Tester"
                  onAction={() => playNotificationSound()}
                />
                <Toggle
                  title="Son d’envoi des messages"
                  description="Joué après l’envoi réussi d’un message."
                  checked={messageSendSound}
                  disabled={!soundEnabled}
                  onChange={(value) => setSound(soundPreferenceKeys.send, value, setMessageSendSound)}
                  actionLabel="Tester"
                  onAction={() => playMessageSendSound()}
                />
              </Section>

              <Section
                kicker="BADGES"
                title="Notifications visuelles"
                description="Les badges indiquent les éléments qui demandent ton attention."
              >
                <Toggle
                  title="Afficher les badges"
                  description="Demandes d’amis et messages non lus."
                  checked={notificationBadges}
                  onChange={onNotificationBadgesChange}
                />
              </Section>
            </>
          )}

          {tab === "presence" && (
            <Section
              kicker="STATUT"
              title="Présence GameMate"
              description="Ton statut est synchronisé avec le vrai système de présence."
            >
              <div className="settings-presence">
                <button
                  type="button"
                  className={presence === "online" ? "active" : ""}
                  onClick={() => void changePresence("online")}
                >
                  <i className="online" />
                  <span><strong>En ligne</strong><small>Disponible pour jouer et discuter</small></span>
                </button>

                <button
                  type="button"
                  className={presence === "busy" ? "active" : ""}
                  onClick={() => void changePresence("busy")}
                >
                  <i className="busy" />
                  <span><strong>Occupé</strong><small>Présent, mais pas disponible</small></span>
                </button>

                <button
                  type="button"
                  className={presence === "offline" ? "active" : ""}
                  onClick={() => void changePresence("offline")}
                >
                  <i className="offline" />
                  <span><strong>Hors ligne</strong><small>Apparaître hors ligne</small></span>
                </button>
              </div>
            </Section>
          )}

          {tab === "messages" && (
            <Section
              kicker="MESSAGERIE"
              title="Comportement des messages"
              description="Réglages appliqués à la messagerie GameMate."
            >
              <Toggle
                title="Entrée pour envoyer"
                description="Entrée envoie le message. Maj + Entrée ajoute une nouvelle ligne."
                checked={enterToSend}
                onChange={(value) => {
                  setEnterToSend(value);
                  localStorage.setItem("gamemate-enter-to-send", String(value));
                }}
              />
            </Section>
          )}

          {tab === "account" && (
            <>
              <Section
                kicker="COMPTE"
                title={session ? displayName : "Aucun compte connecté"}
                description={accountEmail ?? "Connecte-toi pour accéder à ton compte GameMate."}
              >
                {session ? (
                  <div className="settings-account">
                    <div>
                      <span>Identifiant utilisateur</span>
                      <strong>{session.user.id}</strong>
                    </div>
                    <button type="button" className="settings-danger-btn" onClick={onLogout}>
                      Se déconnecter
                    </button>
                  </div>
                ) : (
                  <button type="button" className="settings-primary-btn" onClick={onLogin}>
                    Se connecter
                  </button>
                )}
              </Section>
            </>
          )}

          {tab === "advanced" && (
            <>
              <Section
                kicker="STOCKAGE LOCAL"
                title="Réinitialiser les préférences"
                description="Réinitialise uniquement les réglages du Companion. Ton compte et tes données Supabase ne sont pas supprimés."
              >
                <button type="button" className="settings-danger-btn" onClick={resetCompanionSettings}>
                  Réinitialiser les paramètres
                </button>
              </Section>

              <Section
                kicker="INFORMATIONS"
                title="Ce qui est enregistré localement"
                description="Échelle, performances, sons, présence, page de démarrage et comportement des messages."
              >
                <div className="settings-info-list">
                  <span>Les données de profil, amis, messages, squads et cosmétiques restent dans Supabase.</span>
                  <span>La réinitialisation ci-dessus ne supprime aucune donnée de compte.</span>
                </div>
              </Section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Section({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <header>
        <span className="settings-kicker">{kicker}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function ChoiceGrid({ children }: { children: React.ReactNode }) {
  return <div className="settings-choice-grid">{children}</div>;
}

function Choice({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`settings-choice ${active ? "active" : ""}`} onClick={onClick}>
      <strong>{title}</strong>
      <small>{subtitle}</small>
    </button>
  );
}

function Toggle({
  title,
  description,
  checked,
  disabled = false,
  actionLabel,
  onAction,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={`settings-toggle-row ${disabled ? "disabled" : ""}`}>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>

      <div className="settings-toggle-actions">
        {actionLabel && onAction && (
          <button type="button" className="settings-test-btn" disabled={disabled} onClick={onAction}>
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          className={`settings-switch ${checked ? "on" : ""}`}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <i />
        </button>
      </div>
    </div>
  );
}

function Range({
  title,
  value,
  onChange,
}: {
  title: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-range">
      <span><strong>{title}</strong><b>{value}%</b></span>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
