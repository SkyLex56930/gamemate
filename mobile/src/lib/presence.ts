import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { supabase } from "./supabase";

const DEVICE_KEY = "gamemate-mobile-device-id";

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_KEY);

  if (!id) {
    id = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }

  return id;
}

async function publishPresence() {
  const id = await getDeviceId();

  await Promise.all([
    supabase.rpc("set_my_presence", {
      p_status: "online",
    }),

    supabase.rpc("set_my_device_presence", {
      p_device_id: id,
      p_platform: Platform.OS === "ios" ? "ios" : "android",
    }),
  ]);
}

export async function startMobilePresence() {
  await publishPresence();

  if (timer) clearInterval(timer);

  timer = setInterval(() => {
    if (AppState.currentState === "active") {
      void publishPresence();
    }
  }, 30000);

  appStateSubscription?.remove();

  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void publishPresence();
    }
  });
}

export function stopMobilePresence() {
  if (timer) clearInterval(timer);

  timer = null;

  appStateSubscription?.remove();
  appStateSubscription = null;
}

export async function getDevicePresence(userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, string[]>();
  }

  const { data, error } = await supabase.rpc("get_device_presence", {
    p_user_ids: userIds,
  });

  if (error) {
    console.log("get_device_presence", error);
    return new Map<string, string[]>();
  }

  return new Map(
    ((data ?? []) as {
      user_id: string;
      platforms: string[];
    }[]).map((row) => [
      row.user_id,
      row.platforms ?? [],
    ])
  );
}

export function deviceLabel(platforms: string[]) {
  const mobile =
    platforms.includes("android") ||
    platforms.includes("ios");

  const pc = platforms.includes("pc");

  if (pc && mobile) return "PC + Mobile";
  if (mobile) return "Mobile";
  if (pc) return "PC";
  if (platforms.includes("web")) return "Web";

  return "";
}
