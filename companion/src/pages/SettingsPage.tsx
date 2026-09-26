import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playMessageSendSound, playNotificationSound, soundPreferenceKeys } from "../lib/audio";
import { audioDevicePreferenceKeys } from "../lib/mediaDevices";
import AudioDeviceSettings from "../components/AudioDeviceSettings";
import { Icon, type IconName } from "../components/Icon";
import {
  presenceDescription,
  presenceLabel,
  presenceStorageKeys,
  readPresenceCustomStatus,
  readPresenceStatus,
  type OwnPresenceStatus,
} from "../lib/presence";
import "./SettingsPage.css";

type UiScale = "compact" | "normal" | "large" | "xlarge";
type PerfPreset = "eco" | "balanced" | "high" | "ultra" | "custom";
type StartupSection = "home" | "play" | "friends" | "messages";
type NavigationMode = "full" | "compact";
type Accent = "violet" | "cyan" | "magenta" | "emerald";
type Density = "comfortable" | "compact";
type Tab = "overview" | "appearance" | "performance" | "audio" | "social" | "system";
type PresenceGame = { id: number; name: string };

export type AppearanceSettings = {
  accent: Accent;
  density: Density;
  highContrast: boolean;
  reduceMotion: boolean;
};

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
  appearance: AppearanceSettings;
  navigationMode: NavigationMode;
  notificationBadges: boolean;
  onScaleChange: (value: UiScale) => void;
  onPerformanceChange: (value: PerformanceSettings) => void;
  onAppearanceChange: (value: AppearanceSettings) => void;
  onNavigationModeChange: (value: NavigationMode) => void;
  onNotificationBadgesChange: (value: boolean) => void;
  onLogin: () => void;
  onLogout: () => void;
};

const tabs: Array<{ id: Tab; label: string; hint: string; icon: IconName }> = [
  { id: "overview", label: "Vue d’ensemble", hint: "État du Companion", icon: "home" },
  { id: "appearance", label: "Apparence", hint: "Interface et accessibilité", icon: "palette" },
  { id: "performance", label: "Performances", hint: "Qualité et ressources", icon: "zap" },
  { id: "audio", label: "Audio & alertes", hint: "Volumes et notifications", icon: "volume-2" },
  { id: "social", label: "Social", hint: "Présence et messages", icon: "users" },
  { id: "system", label: "Compte & système", hint: "Session et configuration", icon: "settings" },
];

const performancePresets: Record<Exclude<PerfPreset, "custom">, PerformanceSettings> = {
  eco: { preset: "eco", glow: 20, blur: 15, particles: 0, motion: 20, reduceWhenInactive: true },
  balanced: { preset: "balanced", glow: 50, blur: 40, particles: 30, motion: 55, reduceWhenInactive: true },
  high: { preset: "high", glow: 82, blur: 72, particles: 68, motion: 80, reduceWhenInactive: true },
  ultra: { preset: "ultra", glow: 100, blur: 100, particles: 100, motion: 100, reduceWhenInactive: false },
};

const LOCAL_SETTING_KEYS = [
  "gamemate-ui-scale",
  "gamemate-performance-settings",
  "gamemate-appearance-settings",
  "gamemate-startup-section",
  "gamemate-navigation-mode",
  "gamemate-notification-badges-enabled",
  "gamemate-sound-enabled",
  "gamemate-notification-sound-enabled",
  "gamemate-message-send-sound-enabled",
  "gamemate-master-volume",
  "gamemate-notification-volume",
  "gamemate-message-send-volume",
  audioDevicePreferenceKeys.input,
  audioDevicePreferenceKeys.output,
  audioDevicePreferenceKeys.echoCancellation,
  audioDevicePreferenceKeys.noiseSuppression,
  audioDevicePreferenceKeys.autoGainControl,
  presenceStorageKeys.status,
  presenceStorageKeys.customStatus,
  presenceStorageKeys.activityGameId,
  presenceStorageKeys.activityText,
  "gamemate-enter-to-send",
];

function readBool(key: string, fallback = true) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value !== "false";
  } catch {
    return fallback;
  }
}

function readNumber(key: string, fallback: number) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

function readStartupSection(): StartupSection {
  const value = localStorage.getItem("gamemate-startup-section");
  return value === "play" || value === "friends" || value === "messages" ? value : "home";
}

export default function SettingsPage({
  session,
  displayName,
  uiScale,
  performance,
  appearance,
  navigationMode,
  notificationBadges,
  onScaleChange,
  onPerformanceChange,
  onAppearanceChange,
  onNavigationModeChange,
  onNotificationBadgesChange,
  onLogin,
  onLogout,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [startupSection, setStartupSection] = useState<StartupSection>(readStartupSection);
  const [presence, setPresence] = useState<OwnPresenceStatus>(readPresenceStatus);
  const [customStatus, setCustomStatus] = useState(readPresenceCustomStatus);
  const [activityGameId, setActivityGameId] = useState(() => localStorage.getItem(presenceStorageKeys.activityGameId) ?? "");
  const [activityText, setActivityText] = useState(() => localStorage.getItem(presenceStorageKeys.activityText) ?? "");
  const [presenceGames, setPresenceGames] = useState<PresenceGame[]>([]);
  const [savingPresence, setSavingPresence] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => readBool(soundPreferenceKeys.all));
  const [notificationSound, setNotificationSound] = useState(() => readBool(soundPreferenceKeys.receive));
  const [messageSendSound, setMessageSendSound] = useState(() => readBool(soundPreferenceKeys.send));
  const [masterVolume, setMasterVolume] = useState(() => readNumber(soundPreferenceKeys.masterVolume, 80));
  const [notificationVolume, setNotificationVolume] = useState(() => readNumber(soundPreferenceKeys.receiveVolume, 70));
  const [sendVolume, setSendVolume] = useState(() => readNumber(soundPreferenceKeys.sendVolume, 60));
  const [enterToSend, setEnterToSend] = useState(() => readBool("gamemate-enter-to-send"));
  const [notice, setNotice] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  const accountEmail = session?.user?.email ?? null;
  const activePreset = useMemo(() => performance.preset, [performance.preset]);

  useEffect(() => {
    let active = true;

    async function loadPresenceSettings() {
      const [gamesResult, presenceResult] = await Promise.all([
        supabase.from("games").select("id, name").eq("is_active", true).order("name"),
        session ? supabase.rpc("get_my_presence_v15") : Promise.resolve({ data: null, error: null }),
      ]);

      if (!active) return;
      if (!gamesResult.error) setPresenceGames((gamesResult.data ?? []) as PresenceGame[]);
      if (!session) return;

      const { data, error } = presenceResult;
      if (!active || error || !data) return;
      const row = data as {
        status?: string;
        custom_status?: string | null;
        activity_game_id?: number | null;
        activity_text?: string | null;
      };
      const nextStatus: OwnPresenceStatus = row.status === "away" || row.status === "dnd" || row.status === "invisible"
        ? row.status
        : "online";
      setPresence(nextStatus);
      setCustomStatus(row.custom_status ?? "");
      setActivityGameId(row.activity_game_id != null ? String(row.activity_game_id) : "");
      setActivityText(row.activity_text ?? "");
    }

    void loadPresenceSettings();
    return () => { active = false; };
  }, [session]);

  function announce(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 3600);
  }

  function saveStartup(value: StartupSection) {
    setStartupSection(value);
    localStorage.setItem("gamemate-startup-section", value);
    announce("Page de démarrage enregistrée.");
  }

  function setSound(key: string, value: boolean, setter: (value: boolean) => void) {
    setter(value);
    localStorage.setItem(key, String(value));
  }

  function setVolume(key: string, value: number, setter: (value: number) => void) {
    setter(value);
    localStorage.setItem(key, String(value));
  }

  async function changePresence(value: OwnPresenceStatus) {
    setPresence(value);
    localStorage.setItem(presenceStorageKeys.status, value);
    window.dispatchEvent(new Event("gamemate-presence-status-changed"));

    if (session) {
      const { error } = await supabase.rpc("update_my_presence_v15", {
        p_status: value,
        p_custom_status: customStatus.trim() || null,
        p_activity_game_id: activityGameId ? Number(activityGameId) : null,
        p_activity_text: activityText.trim() || null,
      });
      if (error) {
        console.error("set_my_presence:", error);
        announce("La présence locale est enregistrée, mais la synchronisation a échoué.");
        return;
      }
    }
    announce("Statut de présence synchronisé.");
  }

  async function savePresenceProfile() {
    setSavingPresence(true);
    localStorage.setItem(presenceStorageKeys.status, presence);
    localStorage.setItem(presenceStorageKeys.customStatus, customStatus.trim());
    localStorage.setItem(presenceStorageKeys.activityGameId, activityGameId);
    localStorage.setItem(presenceStorageKeys.activityText, activityText.trim());

    if (session) {
      const { error } = await supabase.rpc("update_my_presence_v15", {
        p_status: presence,
        p_custom_status: customStatus.trim() || null,
        p_activity_game_id: activityGameId ? Number(activityGameId) : null,
        p_activity_text: activityText.trim() || null,
      });
      if (error) {
        console.error("update_my_presence_v15:", error);
        announce("Impossible de synchroniser ton activité.");
        setSavingPresence(false);
        return;
      }
    }

    window.dispatchEvent(new Event("gamemate-presence-status-changed"));
    announce(session ? "Présence et activité synchronisées." : "Présence enregistrée sur cet appareil.");
    setSavingPresence(false);
  }

  function exportConfiguration() {
    const settings = Object.fromEntries(LOCAL_SETTING_KEYS.map((key) => [key, localStorage.getItem(key)]));
    const blob = new Blob([JSON.stringify({ version: 15, exportedAt: new Date().toISOString(), settings }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gamemate-companion-settings.json";
    anchor.click();
    URL.revokeObjectURL(url);
    announce("Configuration exportée.");
  }

  async function importConfiguration(file: File | undefined) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { settings?: Record<string, unknown> };
      if (!payload.settings || typeof payload.settings !== "object") throw new Error("Format invalide");
      for (const key of LOCAL_SETTING_KEYS) {
        const value = payload.settings[key];
        if (typeof value === "string") localStorage.setItem(key, value);
      }
      window.location.reload();
    } catch {
      announce("Ce fichier de configuration n’est pas valide.");
    }
  }

  async function copyDiagnostics() {
    const details = [
      "GameMate Companion V9",
      `Compte: ${session ? "connecté" : "déconnecté"}`,
      `Interface: ${uiScale} / ${navigationMode}`,
      `Accent: ${appearance.accent}`,
      `Performance: ${performance.preset}`,
      `Plateforme: ${navigator.platform}`,
      `Agent: ${navigator.userAgent}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(details);
      announce("Diagnostic copié dans le presse-papiers.");
    } catch {
      announce("Impossible d’accéder au presse-papiers.");
    }
  }

  function resetCompanionSettings() {
    LOCAL_SETTING_KEYS.forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  }

  const connectedLabel = session ? "Connecté" : "Hors session";

  return (
    <div className="settings-page">
      <header className="settings-command-head">
        <div>
          <span className="settings-eyebrow"><i /> COMPANION CONTROL CENTER</span>
          <h1>Ton setup. Tes règles.</h1>
          <p>Ajuste l’expérience GameMate avec des réglages persistants et réellement appliqués.</p>
        </div>
        <div className="settings-head-status">
          <span className={session ? "is-online" : ""}><i /> {connectedLabel}</span>
          <strong>{displayName}</strong>
          <small>Configuration locale V9</small>
        </div>
      </header>

      <section className="settings-health-grid" aria-label="État du Companion">
        <HealthCard icon="palette" label="Profil visuel" value={appearance.accent} detail={appearance.highContrast ? "Contraste renforcé" : "Contraste standard"} />
        <HealthCard icon="gauge" label="Moteur visuel" value={performance.preset} detail={`${performance.motion}% animations`} />
        <HealthCard icon="volume-2" label="Audio" value={soundEnabled ? `${masterVolume}%` : "Coupé"} detail="Volume principal" />
        <HealthCard icon="wifi" label="Présence" value={presenceLabel(presence)} detail={session ? "Synchronisée" : "Mode local"} />
      </section>

      <div className="settings-workspace">
        <aside className="settings-nav">
          <div className="settings-nav-title"><span>RÉGLAGES</span><b>6 modules</b></div>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => { setTab(item.id); setNotice(""); }}
            >
              <span className="settings-nav-icon"><Icon name={item.icon} /></span>
              <span className="settings-nav-copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
              <Icon name="chevron-right" size={15} />
            </button>
          ))}
        </aside>

        <main className="settings-content">
          {notice && <div className="settings-notice" role="status"><span><Icon name="check" size={16} /></span>{notice}</div>}

          {tab === "overview" && (
            <>
              <SettingsPanel index="01" kicker="DÉMARRAGE" title="Ouverture du Companion" description="Choisis ton point d’entrée quand GameMate démarre.">
                <ChoiceGrid>
                  <Choice active={startupSection === "home"} icon="home" title="Accueil" subtitle="Vue d’ensemble" onClick={() => saveStartup("home")} />
                  <Choice active={startupSection === "play"} icon="play" title="Play Now" subtitle="Lancer une session" onClick={() => saveStartup("play")} />
                  <Choice active={startupSection === "friends"} icon="users" title="Amis" subtitle="Activité sociale" onClick={() => saveStartup("friends")} />
                  <Choice active={startupSection === "messages"} icon="message-circle" title="Messages" subtitle="Conversations" onClick={() => saveStartup("messages")} />
                </ChoiceGrid>
              </SettingsPanel>
              <SettingsPanel index="02" kicker="SIGNAL" title="Indicateurs d’attention" description="Garde les informations importantes visibles dans la navigation.">
                <Toggle title="Badges de notifications" description="Affiche les demandes, messages et alertes non lus." checked={notificationBadges} onChange={onNotificationBadgesChange} />
              </SettingsPanel>
            </>
          )}

          {tab === "appearance" && (
            <>
              <SettingsPanel index="01" kicker="SIGNATURE" title="Couleur d’accent" description="L’accent s’applique à la navigation, aux actions et aux états actifs.">
                <div className="settings-accent-grid">
                  {(["violet", "cyan", "magenta", "emerald"] as Accent[]).map((accent) => (
                    <button key={accent} type="button" className={`settings-accent ${accent} ${appearance.accent === accent ? "active" : ""}`} onClick={() => onAppearanceChange({ ...appearance, accent })}>
                      <i /><span><strong>{accentLabel(accent)}</strong><small>{accent === "violet" ? "Signature GameMate" : "Palette alternative"}</small></span><b><Icon name="check" size={15} /></b>
                    </button>
                  ))}
                </div>
              </SettingsPanel>
              <SettingsPanel index="02" kicker="ÉCHELLE" title="Taille de l’interface" description="Ajuste la densité d’information à ton écran.">
                <ChoiceGrid>
                  {(["compact", "normal", "large", "xlarge"] as UiScale[]).map((scale) => (
                    <Choice key={scale} active={uiScale === scale} title={scaleLabel(scale)} subtitle={scalePercent(scale)} onClick={() => onScaleChange(scale)} />
                  ))}
                </ChoiceGrid>
              </SettingsPanel>
              <SettingsPanel index="03" kicker="ERGONOMIE" title="Navigation et accessibilité" description="Configure le confort visuel sans sacrifier les fonctions.">
                <ChoiceGrid>
                  <Choice active={navigationMode === "full"} title="Navigation complète" subtitle="Icônes et libellés" onClick={() => onNavigationModeChange("full")} />
                  <Choice active={navigationMode === "compact"} title="Navigation compacte" subtitle="Icônes uniquement" onClick={() => onNavigationModeChange("compact")} />
                  <Choice active={appearance.density === "comfortable"} title="Densité confort" subtitle="Plus d’espace" onClick={() => onAppearanceChange({ ...appearance, density: "comfortable" })} />
                  <Choice active={appearance.density === "compact"} title="Densité pro" subtitle="Plus d’informations" onClick={() => onAppearanceChange({ ...appearance, density: "compact" })} />
                </ChoiceGrid>
                <Toggle title="Contraste renforcé" description="Accentue les textes, bordures et séparations." checked={appearance.highContrast} onChange={(highContrast) => onAppearanceChange({ ...appearance, highContrast })} />
                <Toggle title="Réduire les animations" description="Désactive les mouvements décoratifs et transitions longues." checked={appearance.reduceMotion} onChange={(reduceMotion) => onAppearanceChange({ ...appearance, reduceMotion })} />
              </SettingsPanel>
            </>
          )}

          {tab === "performance" && (
            <>
              <SettingsPanel index="01" kicker="PRÉRÉGLAGES" title="Profil de rendu" description="Chaque profil agit sur les effets du Companion.">
                <ChoiceGrid>
                  {(["eco", "balanced", "high", "ultra"] as const).map((preset) => (
                    <Choice key={preset} active={activePreset === preset} icon={preset === "eco" ? "gauge" : preset === "ultra" ? "sparkles" : "zap"} title={presetLabel(preset)} subtitle={presetDescription(preset)} onClick={() => onPerformanceChange(performancePresets[preset])} />
                  ))}
                </ChoiceGrid>
              </SettingsPanel>
              <SettingsPanel index="02" kicker="MOTEUR VISUEL" title="Réglages avancés" description="Un ajustement manuel active automatiquement le profil personnalisé.">
                <Range title="Intensité lumineuse" description="Halo sur les actions et cartes" value={performance.glow} onChange={(glow) => onPerformanceChange({ ...performance, preset: "custom", glow })} />
                <Range title="Profondeur du verre" description="Flou des surfaces translucides" value={performance.blur} onChange={(blur) => onPerformanceChange({ ...performance, preset: "custom", blur })} />
                <Range title="Particules ambiantes" description="Densité du décor animé" value={performance.particles} onChange={(particles) => onPerformanceChange({ ...performance, preset: "custom", particles })} />
                <Range title="Fluidité des animations" description="Amplitude et vitesse des mouvements" value={performance.motion} onChange={(motion) => onPerformanceChange({ ...performance, preset: "custom", motion })} />
                <Toggle title="Économie en arrière-plan" description="Réduit automatiquement les effets quand GameMate n’est pas actif." checked={performance.reduceWhenInactive} onChange={(reduceWhenInactive) => onPerformanceChange({ ...performance, preset: "custom", reduceWhenInactive })} />
              </SettingsPanel>
            </>
          )}

          {tab === "audio" && (
            <>
              <SettingsPanel index="01" kicker="PÉRIPHÉRIQUES" title="Studio audio" description="Choisis tes périphériques Windows et vérifie leur fonctionnement en direct.">
                <AudioDeviceSettings onNotice={announce} />
              </SettingsPanel>
              <SettingsPanel index="02" kicker="MIXAGE" title="Volumes du Companion" description="Trois niveaux indépendants, sauvegardés sur cet appareil.">
                <Range title="Volume principal" description="Niveau global de tous les sons" value={masterVolume} disabled={!soundEnabled} onChange={(value) => setVolume(soundPreferenceKeys.masterVolume, value, setMasterVolume)} />
                <Range title="Notifications" description="Alertes reçues et événements sociaux" value={notificationVolume} disabled={!soundEnabled || !notificationSound} onChange={(value) => setVolume(soundPreferenceKeys.receiveVolume, value, setNotificationVolume)} />
                <Range title="Messages envoyés" description="Retour sonore après un envoi réussi" value={sendVolume} disabled={!soundEnabled || !messageSendSound} onChange={(value) => setVolume(soundPreferenceKeys.sendVolume, value, setSendVolume)} />
              </SettingsPanel>
              <SettingsPanel index="03" kicker="ROUTAGE" title="Sons et alertes" description="Active séparément les signaux réellement utilisés par GameMate.">
                <Toggle title="Audio du Companion" description="Interrupteur principal de tous les sons." checked={soundEnabled} onChange={(value) => setSound(soundPreferenceKeys.all, value, setSoundEnabled)} />
                <Toggle title="Son de notification" description="Joué à la réception d’une notification, sauf en mode Ne pas déranger." checked={notificationSound} disabled={!soundEnabled} actionLabel="Tester" onAction={() => playNotificationSound(true)} onChange={(value) => setSound(soundPreferenceKeys.receive, value, setNotificationSound)} />
                <Toggle title="Confirmation d’envoi" description="Jouée après l’envoi réussi d’un message." checked={messageSendSound} disabled={!soundEnabled} actionLabel="Tester" onAction={playMessageSendSound} onChange={(value) => setSound(soundPreferenceKeys.send, value, setMessageSendSound)} />
                <Toggle title="Badges visuels" description="Complète les sons avec les compteurs dans l’interface." checked={notificationBadges} onChange={onNotificationBadgesChange} />
              </SettingsPanel>
            </>
          )}

          {tab === "social" && (
            <>
              <SettingsPanel index="01" kicker="PRÉSENCE" title="Visibilité GameMate" description="Le statut est enregistré et synchronisé avec Supabase quand tu es connecté.">
                <div className="settings-presence-grid">
                  {(["online", "away", "dnd", "invisible"] as OwnPresenceStatus[]).map((status) => (
                    <button key={status} type="button" className={presence === status ? "active" : ""} onClick={() => void changePresence(status)}>
                      <i className={status} /><span><strong>{presenceLabel(status)}</strong><small>{presenceDescription(status)}</small></span><b><Icon name="check" size={15} /></b>
                    </button>
                  ))}
                </div>
                <div className="settings-presence-profile">
                  <label>
                    <span>Statut personnalisé</span>
                    <input value={customStatus} maxLength={80} placeholder="Ex. Disponible pour du classé" onChange={(event) => setCustomStatus(event.target.value)} />
                    <small>{customStatus.length}/80</small>
                  </label>
                  <label>
                    <span>Jeu actuel</span>
                    <select value={activityGameId} onChange={(event) => setActivityGameId(event.target.value)}>
                      <option value="">Aucun jeu affiché</option>
                      {presenceGames.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Activité</span>
                    <input value={activityText} maxLength={80} placeholder="Ex. Recherche 2 joueurs" onChange={(event) => setActivityText(event.target.value)} />
                    <small>{activityText.length}/80</small>
                  </label>
                  <button type="button" className="settings-primary-btn" disabled={savingPresence} onClick={() => void savePresenceProfile()}>
                    {savingPresence ? "Synchronisation…" : "Enregistrer ma présence"}
                  </button>
                </div>
              </SettingsPanel>
              <SettingsPanel index="02" kicker="MESSAGERIE" title="Comportement du chat" description="Personnalise la saisie sans changer tes conversations.">
                <Toggle title="Entrée pour envoyer" description="Entrée envoie. Maj + Entrée ajoute une nouvelle ligne." checked={enterToSend} onChange={(value) => { setEnterToSend(value); localStorage.setItem("gamemate-enter-to-send", String(value)); }} />
              </SettingsPanel>
            </>
          )}

          {tab === "system" && (
            <>
              <SettingsPanel index="01" kicker="COMPTE" title={session ? displayName : "Aucun compte connecté"} description={accountEmail ?? "Connecte-toi pour synchroniser ton expérience GameMate."}>
                <div className="settings-account-card">
                  <div className="settings-account-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
                  <div><span>SESSION GAMEMATE</span><strong>{accountEmail ?? "Mode invité"}</strong><small>{session ? `ID · ${session.user.id}` : "Les réglages restent disponibles localement."}</small></div>
                  <button type="button" className={session ? "settings-danger-btn" : "settings-primary-btn"} onClick={session ? onLogout : onLogin}>{session ? "Se déconnecter" : "Se connecter"}</button>
                </div>
              </SettingsPanel>
              <SettingsPanel index="02" kicker="CONFIGURATION" title="Sauvegarde locale" description="Transfère tes préférences sur un autre poste sans exporter tes données de compte.">
                <div className="settings-action-grid">
                  <button type="button" onClick={exportConfiguration}><span><Icon name="download" /></span><strong>Exporter</strong><small>Télécharger un fichier JSON</small></button>
                  <button type="button" onClick={() => importInput.current?.click()}><span><Icon name="upload" /></span><strong>Importer</strong><small>Restaurer une configuration</small></button>
                  <button type="button" onClick={() => void copyDiagnostics()}><span><Icon name="terminal" /></span><strong>Diagnostic</strong><small>Copier les informations système</small></button>
                </div>
                <input ref={importInput} className="settings-file-input" type="file" accept="application/json,.json" onChange={(event) => void importConfiguration(event.target.files?.[0])} />
              </SettingsPanel>
              <SettingsPanel index="03" kicker="ZONE SENSIBLE" title="Réinitialiser le Companion" description="Efface uniquement les préférences locales. Profil, amis, messages et squads restent intacts dans Supabase.">
                <button type="button" className="settings-danger-btn" onClick={resetCompanionSettings}>Réinitialiser tous les réglages</button>
              </SettingsPanel>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function HealthCard({ icon, label, value, detail }: { icon: IconName; label: string; value: string; detail: string }) {
  return <article className="settings-health"><span><Icon name={icon} /></span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>;
}

function SettingsPanel({ index, kicker, title, description, children }: { index: string; kicker: string; title: string; description: string; children: ReactNode }) {
  return <section className="settings-panel"><header><span className="settings-panel-index">{index}</span><div><small>{kicker}</small><h2>{title}</h2><p>{description}</p></div></header><div className="settings-panel-body">{children}</div></section>;
}

function ChoiceGrid({ children }: { children: ReactNode }) { return <div className="settings-choice-grid">{children}</div>; }

function Choice({ active, icon, title, subtitle, onClick }: { active: boolean; icon?: IconName; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" className={`settings-choice ${active ? "active" : ""}`} onClick={onClick}>{icon && <span><Icon name={icon} /></span>}<div><strong>{title}</strong><small>{subtitle}</small></div><b><Icon name="check" size={15} /></b></button>;
}

function Toggle({ title, description, checked, disabled = false, actionLabel, onAction, onChange }: { title: string; description: string; checked: boolean; disabled?: boolean; actionLabel?: string; onAction?: () => void; onChange: (value: boolean) => void }) {
  return <div className={`settings-toggle ${disabled ? "disabled" : ""}`}><div><strong>{title}</strong><small>{description}</small></div><div className="settings-toggle-actions">{actionLabel && onAction && <button type="button" onClick={onAction} disabled={disabled}>{actionLabel}</button>}<button type="button" className={`settings-switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><i /></button></div></div>;
}

function Range({ title, description, value, disabled = false, onChange }: { title: string; description: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className={`settings-range ${disabled ? "disabled" : ""}`}><span><strong>{title}</strong><small>{description}</small></span><input type="range" min="0" max="100" value={value} disabled={disabled} style={{ "--range-progress": `${value}%` } as CSSProperties} onChange={(event) => onChange(Number(event.target.value))} /><b>{value}<small>%</small></b></label>;
}

function accentLabel(value: Accent) { return value === "cyan" ? "Cyan pulse" : value === "magenta" ? "Magenta rush" : value === "emerald" ? "Emerald ops" : "Violet core"; }
function scaleLabel(value: UiScale) { return value === "compact" ? "Compact" : value === "normal" ? "Normal" : value === "large" ? "Grand" : "Très grand"; }
function scalePercent(value: UiScale) { return value === "compact" ? "90 %" : value === "normal" ? "100 %" : value === "large" ? "115 %" : "130 %"; }
function presetLabel(value: Exclude<PerfPreset, "custom">) { return value === "eco" ? "Éco" : value === "balanced" ? "Équilibré" : value === "high" ? "Élevé" : "Ultra"; }
function presetDescription(value: Exclude<PerfPreset, "custom">) { return value === "eco" ? "GPU minimum" : value === "balanced" ? "Confort stable" : value === "high" ? "Expérience premium" : "Effets maximum"; }
