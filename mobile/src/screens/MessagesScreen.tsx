import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type Message = {
  id: string;
  body: string;
  created_at: string;
};

export function MessagesScreen({ session }: { session: Session }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase
      .from("conversations")
      .select("id")
      .or(`user_a.eq.${session.user.id},user_b.eq.${session.user.id}`)
      .then(async ({ data }) => {
        const ids = (data ?? []).map((row) => row.id);

        if (!ids.length) {
          setLoading(false);
          return;
        }

        const { data: messageRows } = await supabase
          .from("messages")
          .select("id,body,created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .limit(50);

        setMessages((messageRows ?? []) as Message[]);
        setLoading(false);
      });
  }, [session.user.id]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.kicker}>DISCUSSIONS</Text>
      <Text style={styles.title}>Messages</Text>

      {loading ? (
        <ActivityIndicator />
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={34} color={theme.colors.textSoft} />
          <Text style={styles.emptyText}>Aucun message pour le moment.</Text>
        </View>
      ) : (
        messages.map((message) => (
          <View key={message.id} style={styles.card}>
            <Ionicons name="chatbubble-outline" size={20} color={theme.colors.cyan} />

            <View style={{ flex: 1 }}>
              <Text style={styles.body} numberOfLines={2}>
                {message.body}
              </Text>

              <Text style={styles.date}>
                {new Date(message.created_at).toLocaleString("fr-FR")}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 120,
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
    gap: 12,
    padding: 15,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  body: {
    color: theme.colors.text,
    fontSize: 14,
  },
  date: {
    color: theme.colors.textSoft,
    fontSize: 10,
    marginTop: 5,
  },
  empty: {
    alignItems: "center",
    padding: 30,
  },
  emptyText: {
    color: theme.colors.textSoft,
    marginTop: 10,
  },
});
