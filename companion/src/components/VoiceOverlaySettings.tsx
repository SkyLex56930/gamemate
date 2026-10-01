import { useState } from "react";

import { Icon } from "./Icon";
import {
  readVoiceOverlaySettings,
  saveVoiceOverlaySettings,
  shortcutOptions,
  type VoiceOverlaySettings as OverlaySettings,
} from "../lib/voiceOverlay";

type Props = { onNotice: (message: string) => void };

export default function VoiceOverlaySettings({ onNotice }: Props) {
  const [settings, setSettings] = useState<OverlaySettings>(readVoiceOverlaySettings);

  function update(patch: Partial<OverlaySettings>) {
    const next = { ...settings, ...patch };
    const shortcuts = [next.muteShortcut, next.deafenShortcut, next.visibilityShortcut];
    if (new Set(shortcuts).size !== shortcuts.length) {
      onNotice("Choisis une touche différente pour chaque action.");
      return;
    }
    setSettings(next);
    saveVoiceOverlaySettings(next);
    onNotice("Réglages de l’overlay appliqués.");
  }

  return (
    <div className="voice-overlay-settings">
      <div className="voice-overlay-settings-preview" aria-hidden="true">
        <div className="overlay-preview-title"><img src="/gamemate-mark-transparent.png" alt="" /><span><strong>Escouade classée</strong><small>VOCAL SQUAD</small></span></div>
        {[
          { name: "Alex · toi", status: "mic", color: "cyan" },
          { name: "Nova", status: "speaking", color: "violet" },
          { name: "Kayo", status: "muted", color: "pink" },
        ].map((player) => (
          <div key={player.name} className={`overlay-preview-player ${player.status === "speaking" ? "speaking" : ""}`}>
            <span className={`avatar ${player.color}`}>{player.name.slice(0, 1)}<i /></span>
            <strong>{player.name}</strong>
            {player.status === "speaking" ? <span className="preview-wave"><i /><i /><i /><i /><i /></span> : <Icon name={player.status === "muted" ? "mic-off" : "mic"} size={16} />}
          </div>
        ))}
      </div>

      <div className="voice-overlay-settings-controls">
        <button type="button" className={`voice-overlay-enable ${settings.enabled ? "active" : ""}`} onClick={() => update({ enabled: !settings.enabled })}>
          <span><Icon name="layout-grid" size={19} /></span>
          <div><strong>Overlay en jeu</strong><small>Affiche le vocal au-dessus de ton jeu.</small></div>
          <i><b /></i>
        </button>

        <ShortcutSelect label="Couper / réactiver le micro" value={settings.muteShortcut} onChange={(muteShortcut) => update({ muteShortcut })} />
        <ShortcutSelect label="Couper / réactiver le son" value={settings.deafenShortcut} onChange={(deafenShortcut) => update({ deafenShortcut })} />
        <ShortcutSelect label="Afficher / masquer l’overlay" value={settings.visibilityShortcut} onChange={(visibilityShortcut) => update({ visibilityShortcut })} />
        <p><Icon name="info" size={14} /> Ces touches restent actives lorsque le jeu est au premier plan.</p>
      </div>
    </div>
  );
}

function ShortcutSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="voice-overlay-shortcut">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {shortcutOptions.map((shortcut) => <option key={shortcut} value={shortcut}>{shortcut.replace("Control", "Ctrl")}</option>)}
      </select>
    </label>
  );
}
