export type VoiceOverlayParticipant = {
  id: string;
  name: string;
  avatarUrl: string | null;
  muted: boolean;
  speaking: boolean;
  self: boolean;
};

export type VoiceOverlaySnapshot = {
  kind: "squad" | "direct";
  title: string;
  participants: VoiceOverlayParticipant[];
};

export type VoiceOverlaySettings = {
  enabled: boolean;
  muteShortcut: string;
  deafenShortcut: string;
  visibilityShortcut: string;
};

export const voiceOverlayKeys = {
  enabled: "gamemate-voice-overlay-enabled",
  muteShortcut: "gamemate-voice-mute-shortcut",
  deafenShortcut: "gamemate-voice-deafen-shortcut",
  visibilityShortcut: "gamemate-voice-overlay-shortcut",
} as const;

export const voiceOverlaySettingsEvent = "gamemate:voice-overlay-settings-changed";
export const globalVoiceCommandEvent = "gamemate:global-voice-command";

export const shortcutOptions = [
  "Alt+M",
  "Alt+D",
  "Alt+O",
  "Control+Shift+M",
  "Control+Shift+D",
  "Control+Shift+O",
  "F8",
  "F9",
  "F10",
  "F11",
] as const;

export function readVoiceOverlaySettings(): VoiceOverlaySettings {
  return {
    enabled: localStorage.getItem(voiceOverlayKeys.enabled) !== "false",
    muteShortcut: localStorage.getItem(voiceOverlayKeys.muteShortcut) || "Alt+M",
    deafenShortcut: localStorage.getItem(voiceOverlayKeys.deafenShortcut) || "Alt+D",
    visibilityShortcut: localStorage.getItem(voiceOverlayKeys.visibilityShortcut) || "Alt+O",
  };
}

export function saveVoiceOverlaySettings(settings: VoiceOverlaySettings) {
  localStorage.setItem(voiceOverlayKeys.enabled, String(settings.enabled));
  localStorage.setItem(voiceOverlayKeys.muteShortcut, settings.muteShortcut);
  localStorage.setItem(voiceOverlayKeys.deafenShortcut, settings.deafenShortcut);
  localStorage.setItem(voiceOverlayKeys.visibilityShortcut, settings.visibilityShortcut);
  window.dispatchEvent(new CustomEvent(voiceOverlaySettingsEvent, { detail: settings }));
}
