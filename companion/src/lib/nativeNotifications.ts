type IncomingCallNotification = {
  callerName: string;
  mode: "audio" | "video";
};

type DesktopNotification = {
  title: string;
  body: string;
};

export const desktopNotificationPreferenceKeys = {
  enabled: "gamemate-desktop-notifications-enabled",
  messagePreview: "gamemate-desktop-message-preview-enabled",
} as const;

function desktopAlertsEnabled() {
  try {
    return localStorage.getItem(desktopNotificationPreferenceKeys.enabled) !== "false"
      && localStorage.getItem("gamemate-presence-status") !== "dnd";
  } catch {
    return true;
  }
}

export function desktopMessagePreviewEnabled() {
  try {
    return localStorage.getItem(desktopNotificationPreferenceKeys.messagePreview) === "true";
  } catch {
    return false;
  }
}

function runsInsideTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function prepareNativeNotifications() {
  if (!runsInsideTauri()) return false;
  try {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch (error) {
    console.error("GameMate notification permission:", error);
    return false;
  }
}

export async function showDesktopNotification({ title, body }: DesktopNotification) {
  if (!runsInsideTauri() || !desktopAlertsEnabled()) return false;
  if (document.visibilityState === "visible" && document.hasFocus()) return false;

  try {
    const { isPermissionGranted, sendNotification } = await import("@tauri-apps/plugin-notification");
    if (!(await isPermissionGranted())) return false;
    if (!desktopAlertsEnabled() || (document.visibilityState === "visible" && document.hasFocus())) return false;
    sendNotification({ title, body });
    return true;
  } catch (error) {
    console.error("GameMate desktop notification:", error);
    return false;
  }
}

export async function showIncomingCallNotification({ callerName, mode }: IncomingCallNotification) {
  if (!runsInsideTauri() || document.visibilityState === "visible") return false;

  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return false;

    sendNotification({
      title: mode === "video" ? "Appel vidéo GameMate" : "Appel vocal GameMate",
      body: `${callerName} essaie de te joindre.`,
    });
    return true;
  } catch (error) {
    console.error("GameMate native notification:", error);
    return false;
  }
}
