import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import type { PushStatus } from "./mobilePush";
import { useMobilePreferences, type SessionReminderMinutes } from "./mobilePreferences";
import { supabase } from "./supabase";

const KIND = "squad_session_reminder";
const MINUTE = 60_000;

type ScheduledSession = {
  session_id: string;
  title: string;
  game_name: string | null;
  starts_at: string;
  my_response: "going" | "maybe" | "declined" | null;
};

// Serialize reconciliation so that a fast response change cannot leave two reminders for a session.
let pending: Promise<void> = Promise.resolve();

function enqueue(action: () => Promise<void>) {
  const next = pending.catch(() => undefined).then(action);
  pending = next.catch((error) => console.error("Rappels des parties :", error));
  return next;
}

async function reconcile(userId: string | null, minutes: SessionReminderMinutes) {
  if (Constants.appOwnership === "expo" || Platform.OS === "web") return;
  const Notifications = await import("expo-notifications");
  const existing = (await Notifications.getAllScheduledNotificationsAsync()).filter(
    (item) => item.content.data?.kind === KIND,
  );

  if (!userId || minutes === 0) {
    await Promise.all(existing.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
    return;
  }

  const { data, error } = await supabase.rpc("get_my_scheduled_sessions_v12", {
    p_squad_id: null, p_limit: 30,
  });
  if (error) throw error; // Preserve scheduled reminders if the network is temporarily unavailable.

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== "granted") {
    await Promise.all(existing.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
    return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("gamemate", {
      name: "GameMate", importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const now = Date.now();
  const desired = new Map<string, { session: ScheduledSession; at: number }>();
  for (const session of (data ?? []) as ScheduledSession[]) {
    const start = Date.parse(session.starts_at);
    if ((session.my_response !== "going" && session.my_response !== "maybe") || !Number.isFinite(start)) continue;
    let at = start - minutes * MINUTE;
    if (at <= now + MINUTE && start > now + 7 * MINUTE) at = start - 5 * MINUTE;
    if (at > now + MINUTE) desired.set(session.session_id, { session, at });
  }

  const kept = new Set<string>();
  for (const item of existing) {
    const fields = item.content.data;
    const sessionId = typeof fields?.sessionId === "string" ? fields.sessionId : "";
    const target = desired.get(sessionId);
    if (target && !kept.has(sessionId) && fields?.userId === userId && fields?.reminderAt === target.at
      && fields?.title === target.session.title && fields?.gameName === target.session.game_name) {
      kept.add(sessionId);
    } else {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }

  for (const [sessionId, { session, at }] of desired) {
    if (kept.has(sessionId)) continue;
    const until = Math.round((Date.parse(session.starts_at) - at) / MINUTE);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Ta partie commence bientôt",
        body: `${session.title}${session.game_name ? ` · ${session.game_name}` : ""} dans ${until} min`,
        data: { kind: KIND, userId, sessionId, reminderAt: at, title: session.title, gameName: session.game_name },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at),
        ...(Platform.OS === "android" ? { channelId: "gamemate" } : {}) },
    });
  }
}

export function syncSessionReminders(userId: string, minutes: SessionReminderMinutes) {
  return enqueue(() => reconcile(userId, minutes));
}

function clearSessionReminders() {
  return enqueue(() => reconcile(null, 0));
}

export function useSessionReminders(userId: string, pushStatus: PushStatus) {
  const { preferences } = useMobilePreferences();
  const minutes = preferences.sessionReminderMinutes;

  useEffect(() => () => { void clearSessionReminders(); }, [userId]);

  useEffect(() => {
    void syncSessionReminders(userId, minutes);
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncSessionReminders(userId, minutes);
    });
    const channel = supabase.channel(`mobile-session-reminders:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_sessions" },
        () => void syncSessionReminders(userId, minutes))
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_session_responses" },
        () => void syncSessionReminders(userId, minutes))
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_members" },
        () => void syncSessionReminders(userId, minutes))
      .subscribe();
    return () => { active.remove(); void supabase.removeChannel(channel); };
  }, [userId, minutes, pushStatus]);
}
