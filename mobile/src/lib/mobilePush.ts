import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import type { Session } from "@supabase/supabase-js";
import { useMobilePreferences } from "./mobilePreferences";
import { supabase } from "./supabase";

export type PushStatus = "checking" | "ready" | "expo-go" | "simulator" | "missing-project" | "denied" | "error";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type PushData = Record<string, unknown>;

export function useMobilePush(session: Session, onOpen: (data: PushData) => void | Promise<void>) {
  const { preferences } = useMobilePreferences();
  const [status, setStatus] = useState<PushStatus>("checking");
  const lastHandled = useRef<string | null>(null);

  const register = useCallback(async (askPermission: boolean) => {
    if (Constants.appOwnership === "expo") { setStatus("expo-go"); return; }
    if (!Device.isDevice) { setStatus("simulator"); return; }

    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) { setStatus("missing-project"); return; }

    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("gamemate", {
          name: "GameMate", importance: Notifications.AndroidImportance.HIGH,
        });
      }

      let { status: permission } = await Notifications.getPermissionsAsync();
      if (permission !== "granted" && askPermission) {
        permission = (await Notifications.requestPermissionsAsync()).status;
      }
      if (permission !== "granted") { setStatus("denied"); return; }

      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      const { error } = await supabase.rpc("register_mobile_push_device", {
        p_token: result.data,
        p_messages: preferences.pushMessages,
        p_friend_requests: preferences.pushFriends,
        p_invitations: preferences.pushInvitations,
        p_message_preview: preferences.showMessagePreview,
      });
      if (error) throw error;
      setStatus("ready");
    } catch (error) {
      console.error("Notifications mobile :", error);
      setStatus("error");
    }
  }, [preferences.pushMessages, preferences.pushFriends, preferences.pushInvitations,
    preferences.showMessagePreview]);

  useEffect(() => {
    queueMicrotask(() => { void register(true); });
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") void register(false);
    });
    return () => { active.remove(); };
  }, [register, session.user.id]);

  useEffect(() => {
    const handle = async (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (lastHandled.current === id) return;
      lastHandled.current = id;
      try {
        await onOpen(response.notification.request.content.data ?? {});
        await Notifications.clearLastNotificationResponseAsync();
      } catch (error) {
        console.error("Ouverture de la notification :", error);
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handle(response);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handle(response);
    }).catch((error) => console.error("Dernière notification :", error));
    return () => { subscription.remove(); };
  }, [onOpen, session.user.id]);

  return { status, retry: () => { setStatus("checking"); void register(true); } };
}
