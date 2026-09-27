export const audioDevicePreferenceKeys = {
  input: "gamemate-audio-input-device",
  output: "gamemate-audio-output-device",
  echoCancellation: "gamemate-audio-echo-cancellation",
  noiseSuppression: "gamemate-audio-noise-suppression",
  autoGainControl: "gamemate-audio-auto-gain-control",
} as const;

export type AudioDevicePreferences = {
  inputDeviceId: string;
  outputDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

function readBool(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value !== "false";
  } catch {
    return fallback;
  }
}

export function readAudioDevicePreferences(): AudioDevicePreferences {
  return {
    inputDeviceId: localStorage.getItem(audioDevicePreferenceKeys.input) || "default",
    outputDeviceId: localStorage.getItem(audioDevicePreferenceKeys.output) || "default",
    echoCancellation: readBool(audioDevicePreferenceKeys.echoCancellation, true),
    noiseSuppression: readBool(audioDevicePreferenceKeys.noiseSuppression, true),
    autoGainControl: readBool(audioDevicePreferenceKeys.autoGainControl, true),
  };
}

export function saveAudioDevicePreference(
  key: keyof AudioDevicePreferences,
  value: string | boolean,
) {
  const storageKey = {
    inputDeviceId: audioDevicePreferenceKeys.input,
    outputDeviceId: audioDevicePreferenceKeys.output,
    echoCancellation: audioDevicePreferenceKeys.echoCancellation,
    noiseSuppression: audioDevicePreferenceKeys.noiseSuppression,
    autoGainControl: audioDevicePreferenceKeys.autoGainControl,
  }[key];

  localStorage.setItem(storageKey, String(value));
  window.dispatchEvent(new CustomEvent("gamemate-audio-devices-changed"));
}

export function createMicrophoneConstraints(
  preferences = readAudioDevicePreferences(),
): MediaTrackConstraints {
  return {
    ...(preferences.inputDeviceId !== "default"
      ? { deviceId: { exact: preferences.inputDeviceId } }
      : {}),
    echoCancellation: preferences.echoCancellation,
    noiseSuppression: preferences.noiseSuppression,
    autoGainControl: preferences.autoGainControl,
  };
}

type MediaElementWithSink = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function supportsAudioOutputSelection() {
  return typeof (HTMLMediaElement.prototype as HTMLMediaElement & {
    setSinkId?: (sinkId: string) => Promise<void>;
  }).setSinkId === "function";
}

export async function applyPreferredOutput(media: HTMLMediaElement) {
  const target = media as MediaElementWithSink;
  if (!target.setSinkId) return false;

  const { outputDeviceId } = readAudioDevicePreferences();
  try {
    await target.setSinkId(outputDeviceId === "default" ? "" : outputDeviceId);
  } catch {
    // Un casque peut être débranché entre deux lancements. Dans ce cas,
    // GameMate revient immédiatement sur la sortie Windows au lieu de perdre le son.
    localStorage.setItem(audioDevicePreferenceKeys.output, "default");
    await target.setSinkId("");
  }
  return true;
}

export function friendlyMediaError(error: unknown) {
  if (!(error instanceof DOMException)) {
    return "Impossible d’accéder aux périphériques audio.";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Accès au microphone refusé. Autorise GameMate dans les paramètres Windows.";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "Aucun microphone compatible n’a été détecté.";
  }
  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return "Le microphone est déjà utilisé ou indisponible.";
  }
  if (error.name === "OverconstrainedError") {
    return "Le périphérique sélectionné n’est plus disponible.";
  }
  return "Le périphérique audio n’a pas pu être initialisé.";
}
