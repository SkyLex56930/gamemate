const SOUND_ENABLED_KEY = "gamemate-sound-enabled";
const RECEIVE_SOUND_KEY = "gamemate-notification-sound-enabled";
const SEND_SOUND_KEY = "gamemate-message-send-sound-enabled";

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
  void play("/sounds/notification-bell.wav", 0.42);
}

export function playMessageSendSound() {
  if (!canPlay("send")) return;
  void play("/sounds/message-send.wav", 0.30);
}

export const soundPreferenceKeys = {
  all: SOUND_ENABLED_KEY,
  receive: RECEIVE_SOUND_KEY,
  send: SEND_SOUND_KEY,
} as const;
