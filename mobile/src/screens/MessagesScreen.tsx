import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { chatName, getConversations, messagePreview, type ConversationItem } from "../lib/messages";
import { supabase } from "../lib/supabase";
import type { MessagesStackParamList } from "../navigation/AppNavigator";
import { theme } from "../theme/theme";
import { useAccentPalette, useMobilePreferences } from "../lib/mobilePreferences";

type Props = NativeStackScreenProps<MessagesStackParamList, "Conversations"> & {
  session: Session;
  onUnreadChange: (count: number) => void;
};

export function MessagesScreen({ session, navigation, onUnreadChange }: Props) {
  const palette = useAccentPalette();
  const { preferences } = useMobilePreferences();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const rows = await getConversations(session.user.id);
      setItems(rows);
      onUnreadChange(rows.reduce((total, row) => total + row.unread, 0));
      setError("");
    } catch (cause) {
      console.error("Messages / conversations:", cause);
      setError("Impossible de charger les conversations. Appuie ici pour réessayer.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.user.id, onUnreadChange]);

  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  useEffect(() => {
    const channel = supabase.channel(`mobile-conversations-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session.user.id, load]);

  return <View style={styles.container}>
    <FlatList
      data={items}
      keyExtractor={(item) => item.conversation.id}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        setRefreshing(true);
        void load();
      }} tintColor={palette.primary} />}
      ListHeaderComponent={<View style={styles.heading}>
        <Text style={[styles.kicker, { color: palette.secondary }]}>DISCUSSIONS</Text>
        <Text style={styles.title}>Messages</Text>
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={palette.primary} /> :
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={32} color={theme.colors.textSoft} />
          <Text style={styles.emptyText}>Aucune conversation pour le moment.</Text>
          <Text style={styles.emptyHint}>Trouve un joueur dans Mates pour lui écrire.</Text>
        </View>}
      renderItem={({ item }) => <Pressable
        onPress={() => navigation.navigate("Chat", { conversationId: item.conversation.id, profile: item.profile })}
        style={styles.row} accessibilityRole="button"
        accessibilityLabel={`Conversation avec ${chatName(item.profile)}`}>
        <Avatar name={chatName(item.profile)} size={48} />
        <View style={styles.details}>
          <View style={styles.line}>
            <Text style={styles.name} numberOfLines={1}>{chatName(item.profile)}</Text>
            <Text style={styles.date}>{item.lastMessage ? new Date(item.lastMessage.created_at).toLocaleDateString("fr-FR") : ""}</Text>
          </View>
          <View style={styles.line}>
            <Text style={[styles.preview, item.unread > 0 && styles.unreadText,
              preferences.messageSize === "large" && styles.previewLarge]} numberOfLines={1}>
              {item.lastMessage ? `${item.lastMessage.sender_id === session.user.id ? "Vous : " : ""}${messagePreview(item.lastMessage.body)}` : "Commencer la conversation"}
            </Text>
            {preferences.messageBadges && item.unread > 0 && <View style={[styles.badge, { backgroundColor: palette.primary }]}>
              <Text style={styles.badgeText}>{item.unread}</Text></View>}
          </View>
        </View>
      </Pressable>}
    />
    {!!error && <Pressable style={styles.error} onPress={() => void load(true)}><Text style={styles.errorText}>{error}</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  list: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 22 },
  heading: { marginBottom: 18, gap: 5 },
  kicker: { color: theme.colors.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontSize: 29, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  details: { flex: 1, gap: 5 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: theme.colors.text, fontSize: 15, fontWeight: "700", flex: 1 },
  date: { color: theme.colors.textMuted, fontSize: 11 },
  preview: { color: theme.colors.textSoft, fontSize: 13, flex: 1 },
  previewLarge: { fontSize: 16 },
  unreadText: { color: theme.colors.text, fontWeight: "700" },
  badge: { backgroundColor: theme.colors.primary, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", paddingVertical: 55, gap: 10 },
  emptyText: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
  emptyHint: { color: theme.colors.textSoft, textAlign: "center" },
  error: { padding: 12, backgroundColor: theme.colors.surface },
  errorText: { color: theme.colors.danger, textAlign: "center" },
});
