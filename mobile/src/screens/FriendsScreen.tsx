import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";
import { useAccentPalette } from "../lib/mobilePreferences";

type Friend = {
  id: string;
  username: string | null;
  display_name: string | null;
};

export function FriendsScreen({ session, onMessage }: { session: Session; onMessage: (userId: string) => void }) {
  const palette = useAccentPalette();
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const uid = session.user.id;

    const { data: relations, error: relationsError } = await supabase
      .from("friendships")
      .select("requester_id,addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);

    if (relationsError) {
      console.error("Amis / relations:", relationsError);
      setLoading(false);
      return;
    }

    const ids = Array.from(
      new Set(
        (relations ?? []).map((row) =>
          row.requester_id === uid ? row.addressee_id : row.requester_id
        )
      )
    );

    if (!ids.length) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .in("id", ids);

    setFriends((data ?? []) as Friend[]);
    setLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}>
      <Text style={[styles.kicker, { color: palette.secondary }]}>SOCIAL</Text>
      <Text style={styles.title}>Amis</Text>

      {loading ? (
        <ActivityIndicator />
      ) : friends.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={30} color={theme.colors.textSoft} />
          <Text style={styles.emptyTitle}>Aucun ami pour le moment</Text>
        </View>
      ) : (
        friends.map((friend) => (
          <Pressable key={friend.id} style={styles.card} onPress={() => onMessage(friend.id)}
            accessibilityRole="button" accessibilityLabel={`Écrire à ${friend.display_name || friend.username || "Joueur"}`}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(friend.display_name || friend.username || "G").slice(0, 1).toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {friend.display_name || friend.username || "Joueur"}
              </Text>
              <Text style={styles.handle}>@{friend.username ?? "joueur"}</Text>
            </View>

            <Ionicons name="chatbubble-outline" size={21} color={palette.secondary} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 12,
    backgroundColor: theme.colors.background,
  },
  kicker: {
    color: theme.colors.cyan,
    fontSize: 10,
    fontWeight: "900",
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: "900",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172744",
  },
  avatarText: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  name: {
    color: theme.colors.text,
    fontWeight: "900",
  },
  handle: {
    color: theme.colors.textSoft,
    fontSize: 12,
  },
  empty: {
    alignItems: "center",
    padding: 30,
  },
  emptyTitle: {
    color: theme.colors.textSoft,
    marginTop: 10,
  },
});
