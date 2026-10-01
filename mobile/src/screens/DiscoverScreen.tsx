import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { useAccentPalette } from "../lib/mobilePreferences";
import { theme } from "../theme/theme";
import { LfgScreen } from "./LfgScreen";
import { SmartMatchScreen } from "./SmartMatchScreen";
import { FriendsScreen } from "./FriendsScreen";

export function DiscoverScreen({ session, onMessage, onOpenSquads, onOpenSettings, onOpenFriends }: {
  session: Session;
  onMessage: (userId: string) => void;
  onOpenSquads: () => void;
  onOpenSettings: () => void;
  onOpenFriends: () => void;
}) {
  const palette = useAccentPalette();
  const [section, setSection] = useState<"matching" | "announcements" | "friends">("matching");

  return <View style={styles.screen}>
    <View style={styles.switcher}>
      {(["matching", "announcements", "friends"] as const).map((value) => <Pressable key={value}
        onPress={() => setSection(value)} accessibilityRole="tab" accessibilityState={{ selected: section === value }}
        style={[styles.switchButton, section === value && { backgroundColor: palette.primary }]}>
        <Text style={styles.switchText}>{value === "matching" ? "Découvrir" : value === "announcements" ? "Annonces" : "Amis"}</Text>
      </Pressable>)}
    </View>
    {section === "matching"
      ? <SmartMatchScreen session={session} onMessage={onMessage} onOpenSquads={onOpenSquads}
          onOpenSettings={onOpenSettings} onOpenFriends={() => { setSection("friends"); onOpenFriends(); }} />
      : section === "announcements" ? <LfgScreen session={session} onOpenSquads={onOpenSquads} />
      : <FriendsScreen session={session} onMessage={onMessage} />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  switcher: { flexDirection: "row", marginHorizontal: 18, marginTop: 12, padding: 4, borderRadius: 17,
    borderWidth: 1, borderColor: "rgba(124,92,255,0.24)", backgroundColor: theme.colors.surface, gap: 4 },
  switchButton: { flex: 1, minHeight: 42, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  switchText: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },
});
