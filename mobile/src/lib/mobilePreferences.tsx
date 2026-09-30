import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Accent = "violet" | "cyan" | "magenta" | "emerald";
export type MessageSize = "normal" | "large";
export type Density = "comfortable" | "compact";
export type SessionReminderMinutes = 0 | 15 | 30 | 60;

export type MobilePreferences = {
  accent: Accent;
  messageSize: MessageSize;
  density: Density;
  messageBadges: boolean;
  pushMessages: boolean;
  pushFriends: boolean;
  pushInvitations: boolean;
  sessionReminderMinutes: SessionReminderMinutes;
  showMessagePreview: boolean;
};

export const accentPalettes: Record<Accent, { label: string; primary: string; light: string; secondary: string }> = {
  violet: { label: "GameMate", primary: "#7C5CFF", light: "#B8A7FF", secondary: "#20DCFF" },
  cyan: { label: "Cyan pulse", primary: "#05B5DA", light: "#69EAF7", secondary: "#7C5CFF" },
  magenta: { label: "Magenta rush", primary: "#DE39C2", light: "#FF8BE2", secondary: "#6864FF" },
  emerald: { label: "Emerald ops", primary: "#15BE89", light: "#69EFBF", secondary: "#23BFE1" },
};

const DEFAULTS: MobilePreferences = {
  accent: "violet", messageSize: "normal", density: "comfortable", messageBadges: true,
  pushMessages: true, pushFriends: true, pushInvitations: true, sessionReminderMinutes: 30,
  showMessagePreview: false,
};

const STORAGE_KEY = "gamemate-mobile-preferences-v1";

type PreferencesContext = {
  preferences: MobilePreferences;
  updatePreferences: (changes: Partial<MobilePreferences>) => void;
};

const Context = createContext<PreferencesContext | null>(null);

function parsePreferences(raw: string | null): MobilePreferences {
  if (!raw) return DEFAULTS;
  try {
    const value: Partial<MobilePreferences> = JSON.parse(raw);
    return {
      accent: value.accent && value.accent in accentPalettes ? value.accent : DEFAULTS.accent,
      messageSize: value.messageSize === "large" ? "large" : "normal",
      density: value.density === "compact" ? "compact" : "comfortable",
      messageBadges: typeof value.messageBadges === "boolean" ? value.messageBadges : true,
      pushMessages: typeof value.pushMessages === "boolean" ? value.pushMessages : true,
      pushFriends: typeof value.pushFriends === "boolean" ? value.pushFriends : true,
      pushInvitations: typeof value.pushInvitations === "boolean" ? value.pushInvitations : true,
      sessionReminderMinutes: [0, 15, 30, 60].includes(value.sessionReminderMinutes as number)
        ? value.sessionReminderMinutes as SessionReminderMinutes : 30,
      showMessagePreview: typeof value.showMessagePreview === "boolean" ? value.showMessagePreview : false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function MobilePreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<MobilePreferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (active) setPreferences(parsePreferences(raw));
    }).catch((error) => console.error("Préférences mobile :", error))
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loaded) void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      .catch((error) => console.error("Enregistrement des préférences mobile :", error));
  }, [preferences, loaded]);

  const value = useMemo(() => ({
    preferences,
    updatePreferences: (changes: Partial<MobilePreferences>) =>
      setPreferences((current) => ({ ...current, ...changes })),
  }), [preferences]);

  return <Context.Provider value={value}>{loaded ? children : null}</Context.Provider>;
}

export function useMobilePreferences() {
  const context = useContext(Context);
  if (!context) throw new Error("MobilePreferencesProvider manquant");
  return context;
}

export function useAccentPalette() {
  const { preferences } = useMobilePreferences();
  return accentPalettes[preferences.accent];
}
