const SOUND_ENABLED_KEY = "gamemate-sound-enabled";
const RECEIVE_SOUND_KEY = "gamemate-notification-sound-enabled";
const SEND_SOUND_KEY = "gamemate-message-send-sound-enabled";
const MASTER_VOLUME_KEY = "gamemate-master-volume";
const RECEIVE_VOLUME_KEY = "gamemate-notification-volume";
const SEND_VOLUME_KEY = "gamemate-message-send-volume";

function readBool(key: string, fallback = true) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value !== "false";
  } catch {
    return fallback;
  }
}

function canPlay(kind: "receive" | "send") {
  if (!readBool(SOUND_ENABLED_KEY, true)) return false;

  return kind === "receive"
    ? readBool(RECEIVE_SOUND_KEY, true)
    : readBool(SEND_SOUND_KEY, true);
}

function readVolume(key: string, fallback: number) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, value)) / 100;
  } catch {
    return fallback;
  }
}

function effectiveVolume(kind: "receive" | "send") {
  const master = readVolume(MASTER_VOLUME_KEY, 0.8);
  const channel = kind === "receive"
    ? readVolume(RECEIVE_VOLUME_KEY, 0.7)
    : readVolume(SEND_VOLUME_KEY, 0.6);
  return master * channel;
}

async function play(path: string, volume: number) {
  try {
    const audio = new Audio(path);
    audio.volume = Math.max(0, Math.min(1, volume));
    await audio.play();
  } catch {
    // Browsers can block audio until the user has interacted once.
    // Tauri/Desktop usually allows it after normal app interaction.
  }
}

export function playNotificationSound() {
  if (!canPlay("receive")) return;
  void play("/sounds/notification-bell.wav", effectiveVolume("receive"));
}

export function playMessageSendSound() {
  if (!canPlay("send")) return;
  void play("/sounds/message-send.wav", effectiveVolume("send"));
}

export const soundPreferenceKeys = {
  all: SOUND_ENABLED_KEY,
  receive: RECEIVE_SOUND_KEY,
  send: SEND_SOUND_KEY,
  masterVolume: MASTER_VOLUME_KEY,
  receiveVolume: RECEIVE_VOLUME_KEY,
  sendVolume: SEND_VOLUME_KEY,
} as const;
