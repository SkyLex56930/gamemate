type IncomingCallNotification = {
  callerName: string;
  mode: "audio" | "video";
};

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
