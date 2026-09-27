import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type Player = {
  id: string;
  username: string | null;
  display_name: string | null;
  region: string | null;
  bio: string | null;
};

export function DiscoverScreen({
  session,
  onMessage,
}: {
  session: Session;
  onMessage?: (userId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setNotice("");
        const [byUsername, byDisplay] = await Promise.all([
          supabase.from("profiles").select("id,username,display_name,region,bio")
            .neq("id", session.user.id).ilike("username", `%${value}%`).limit(20),
          supabase.from("profiles").select("id,username,display_name,region,bio")
            .neq("id", session.user.id).ilike("display_name", `%${value}%`).limit(20),
        ]);
        if (!active) return;
        if (byUsername.error || byDisplay.error) {
          setNotice("Recherche impossible. Réessaie.");
        } else {
          const map = new Map<string, Player>();
          for (const row of [...(byUsername.data ?? []), ...(byDisplay.data ?? [])]) {
            map.set(row.id, row as Player);
          }
          setPlayers(Array.from(map.values()));
        }
        setLoading(false);
      })();
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, session.user.id]);

  async function addFriend(userId: string) {
    setWorkingId(userId);
    setNotice("");

    const { error } = await supabase.rpc("send_friend_request", {
      p_target_user_id: userId,
    });

    if (error) {
      setNotice("Impossible d'envoyer la demande.");
    } else {
      setNotice("Demande d'ami envoyée.");
    }

    setWorkingId(null);
  }

  async function openMessage(userId: string) {
    if (onMessage) {
      onMessage(userId);
      return;
    }

    const { error } = await supabase.rpc("get_or_create_conversation", {
      p_other_user_id: userId,
    });

    if (error) {
      setNotice("Impossible d'ouvrir la conversation.");
    } else {
      setNotice("Conversation prête.");
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>DÉCOUVERTE</Text>
      <Text style={styles.title}>Trouver des mates</Text>

      <View style={styles.search}>
        <Ionicons
          name="search-outline"
          size={20}
          color={theme.colors.textSoft}
        />

        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            if (value.trim().length < 2) {
              setPlayers([]);
              setLoading(false);
            }
          }}
          placeholder="Rechercher un joueur..."
          placeholderTextColor="#66778A"
          autoCapitalize="none"
          style={styles.input}
        />
      </View>

      {notice ? (
        <Text style={styles.notice}>
          {notice}
        </Text>
      ) : null}

      {loading ? <ActivityIndicator /> : null}

      {players.map((player) => (
        <View
          key={player.id}
          style={styles.card}
        >
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(player.display_name || player.username || "G")
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {player.display_name || player.username || "Joueur"}
              </Text>

              <Text style={styles.handle}>
                @{player.username ?? "joueur"}
              </Text>

              {player.region ? (
                <Text style={styles.region}>
                  {player.region}
                </Text>
              ) : null}
            </View>
          </View>

          {player.bio ? (
            <Text style={styles.bio}>
              {player.bio}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void addFriend(player.id)}
              disabled={workingId === player.id}
            >
              <Ionicons
                name="person-add-outline"
                size={17}
                color={theme.colors.text}
              />
              <Text style={styles.secondaryText}>
                {workingId === player.id ? "Envoi..." : "Ajouter"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.primaryButton}
              onPress={() => void openMessage(player.id)}
            >
              <Ionicons
                name="chatbubble-outline"
                size={17}
                color="#FFF"
              />
              <Text style={styles.primaryText}>
                Message
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
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
    color: theme.colors.primarySoft,
    fontSize: 10,
    fontWeight: "900",
  },

  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: "900",
  },

  search: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  input: {
    flex: 1,
    height: 50,
    color: theme.colors.text,
    marginLeft: 8,
  },

  notice: {
    color: theme.colors.success,
    fontSize: 12,
  },

  card: {
    padding: 15,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceSoft,
  },

  avatarText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "900",
  },

  name: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 15,
  },

  handle: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 2,
  },

  region: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  bio: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },

  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },

  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSoft,
  },

  secondaryText: {
    color: theme.colors.text,
    fontWeight: "800",
  },

  primaryButton: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },

  primaryText: {
    color: "#FFF",
    fontWeight: "900",
  },
});
