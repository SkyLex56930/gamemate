import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { chatName, getConversations, type ConversationItem } from "../lib/messages";
import { getMyProfileSummary, type ProfileSummary } from "../lib/profileSummary";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";
import { useAccentPalette, useMobilePreferences } from "../lib/mobilePreferences";

type Props = {
  session: Session;
  onNavigate: (tab: "Messages" | "Amis" | "Mates" | "Squads" | "Profil" | "Boutique") => void;
  onOpenConversation: (item: ConversationItem) => void;
  onUnreadChange: (count: number) => void;
  onNotifications: () => void;
};

export function HomeScreen({ session, onNavigate, onOpenConversation, onUnreadChange, onNotifications }: Props) {
  const palette = useAccentPalette();
  const { preferences } = useMobilePreferences();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [recent, setRecent] = useState<ConversationItem[]>([]);

  const loadProfile = useCallback(async () => {
    try {
      setSummary(await getMyProfileSummary(session.user.id));
      setProfileError(false);
    } catch (error) {
      console.error("Accueil / profil:", error);
      setProfileError(true);
    } finally {
      setProfileLoading(false);
    }
  }, [session.user.id]);

  const loadRecent = useCallback(async () => {
    try {
      const conversations = await getConversations(session.user.id);
      setRecent(conversations.slice(0, 3));
      onUnreadChange(conversations.reduce((count, item) => count + item.unread, 0));
    } catch (error) {
      console.error("Accueil / conversations:", error);
    }
  }, [session.user.id, onUnreadChange]);

  useFocusEffect(useCallback(() => {
    void loadProfile();
    void loadRecent();
  }, [loadProfile, loadRecent]));

  useEffect(() => {
    const channel = supabase.channel(`mobile-home-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => void loadRecent())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${session.user.id}` }, () => void loadProfile())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_games", filter: `user_id=eq.${session.user.id}` }, () => void loadProfile())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session.user.id, loadRecent, loadProfile]);

  const profile = summary?.profile;
  const name = profile?.display_name || profile?.username || "Joueur";

  return <View style={styles.root}>
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}
      showsVerticalScrollIndicator={false}>
      {profileLoading && !summary ? <ActivityIndicator style={styles.loading} color={palette.primary} /> :
        profileError && !summary ? <Pressable style={styles.retry} onPress={() => void loadProfile()}>
          <Text style={styles.retryText}>Impossible de charger ton profil. Appuie pour réessayer.</Text>
        </Pressable> :
        summary && <View style={styles.profileCard}>
          <View style={styles.identity}>
            <Avatar name={name} url={profile?.avatar_url} size={68} />
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.handle} numberOfLines={1}>
                {profile?.username ? `@${profile.username}` : "Profil GameMate"}
              </Text>
            </View>
            <Pressable onPress={() => onNavigate("Profil")} style={styles.editButton}
              accessibilityRole="button" accessibilityLabel="Voir mon profil">
              <Ionicons name="person-outline" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

          <Text style={[styles.bio, !profile?.bio?.trim() && styles.bioEmpty]}>
            {profile?.bio?.trim() || "Ajoute une présentation pour que les autres joueurs te connaissent."}
          </Text>

          {(profile?.region || profile?.language) && <View style={styles.meta}>
            {!!profile.region && <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={15} color={palette.secondary} />
              <Text style={styles.metaText}>{profile.region}</Text>
            </View>}
            {!!profile.language && <View style={styles.metaItem}>
              <Ionicons name="language-outline" size={15} color={palette.secondary} />
              <Text style={styles.metaText}>{profile.language}</Text>
            </View>}
          </View>}

          <View style={styles.separator} />
          <Text style={styles.label}>MES JEUX</Text>
          {summary.games.length ? <View style={styles.games}>
            {summary.games.slice(0, 3).map((game, index) => <View style={styles.game} key={`${game}-${index}`}>
              <Text style={styles.gameText} numberOfLines={1}>{game}</Text>
            </View>)}
            {summary.gameCount > 3 && <Text style={styles.moreGames}>+{summary.gameCount - 3}</Text>}
          </View> : <Text style={styles.emptyGames}>Tes jeux configurés sur le Companion apparaîtront ici.</Text>}

          {summary.completion !== null && <View style={styles.completion}>
            <View style={styles.completionLine}>
              <Text style={styles.completionLabel}>Profil complété</Text>
              <Text style={[styles.completionValue, { color: palette.light }]}>{summary.completion}%</Text>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${summary.completion}%`, backgroundColor: palette.primary }]} /></View>
          </View>}

          <Pressable style={styles.profileLink} onPress={() => onNavigate("Profil")} accessibilityRole="button">
            <Text style={[styles.profileLinkText, { color: palette.light }]}>Voir mon profil</Text>
            <Ionicons name="arrow-forward" size={17} color={palette.light} />
          </Pressable>
        </View>}

      <Pressable onPress={onNotifications} style={styles.notificationsLink} accessibilityRole="button">
        <Ionicons name="notifications-outline" size={20} color={palette.secondary} />
        <Text style={styles.notificationsText}>Invitations et demandes d’amis</Text>
        <Ionicons name="chevron-forward" size={17} color={theme.colors.textSoft} />
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Discussions récentes</Text>
        <Pressable onPress={() => onNavigate("Messages")} accessibilityRole="button">
          <Text style={[styles.seeAll, { color: palette.light }]}>Voir tout</Text>
        </Pressable>
      </View>
      {recent.length ? recent.map((item) => <Pressable key={item.conversation.id}
        onPress={() => onOpenConversation(item)} style={styles.conversation} accessibilityRole="button">
        <Avatar name={chatName(item.profile)} url={item.profile.avatar_url} size={46} />
        <View style={styles.conversationMain}>
          <View style={styles.conversationTop}>
            <Text style={styles.conversationName} numberOfLines={1}>{chatName(item.profile)}</Text>
            <Text style={styles.time}>{item.lastMessage
              ? new Date(item.lastMessage.created_at).toLocaleDateString("fr-FR") : ""}</Text>
          </View>
          <View style={styles.conversationBottom}>
            <Text numberOfLines={1} style={[styles.preview, preferences.messageSize === "large" && styles.previewLarge]}>
              {item.lastMessage?.body ?? "Commencer la conversation"}
            </Text>
            {preferences.messageBadges && item.unread > 0 && <View style={[styles.unread, { backgroundColor: palette.primary }]}>
              <Text style={styles.unreadText}>{item.unread}</Text>
            </View>}
          </View>
        </View>
      </Pressable>) : <Text style={styles.noConversations}>Tes discussions apparaîtront ici.</Text>}

      <Pressable style={styles.discover} onPress={() => onNavigate("Mates")} accessibilityRole="button">
        <View style={styles.discoverIcon}>
          <Ionicons name="search-outline" size={21} color={palette.light} />
        </View>
        <View style={styles.discoverCopy}>
          <Text style={styles.discoverTitle}>Trouver des mates</Text>
          <Text style={styles.discoverDescription}>Découvre des joueurs et commence une discussion.</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={theme.colors.textSoft} />
      </Pressable>
      <Pressable style={styles.discover} onPress={() => onNavigate("Squads")} accessibilityRole="button">
        <View style={styles.discoverIcon}>
          <Ionicons name="shield-outline" size={21} color={palette.secondary} />
        </View>
        <View style={styles.discoverCopy}>
          <Text style={styles.discoverTitle}>Ma squad et mon planning</Text>
          <Text style={styles.discoverDescription}>Retrouve ton équipe et les prochaines parties.</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={theme.colors.textSoft} />
      </Pressable>
      <Pressable style={styles.discover} onPress={() => onNavigate("Boutique")} accessibilityRole="button">
        <View style={styles.discoverIcon}>
          <Ionicons name="sparkles-outline" size={21} color={palette.secondary} />
        </View>
        <View style={styles.discoverCopy}>
          <Text style={styles.discoverTitle}>Boutique GameMate</Text>
          <Text style={styles.discoverDescription}>Découvre les cadres, bannières et récompenses.</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={theme.colors.textSoft} />
      </Pressable>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  page: { paddingHorizontal: 18, paddingTop: 12 },
  notificationsLink: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13,
    marginBottom: 14, borderRadius: 13, backgroundColor: theme.colors.surface },
  notificationsText: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  loading: { marginVertical: 65 },
  retry: { padding: 24, borderRadius: 16, backgroundColor: theme.colors.surface },
  retryText: { color: theme.colors.danger },
  profileCard: { padding: 17, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  identityText: { flex: 1, gap: 3 },
  name: { color: theme.colors.text, fontSize: 21, fontWeight: "800" },
  handle: { color: theme.colors.textSoft, fontSize: 13 },
  editButton: { height: 38, width: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSoft },
  bio: { color: theme.colors.text, fontSize: 13, lineHeight: 19, marginTop: 15 },
  bioEmpty: { color: theme.colors.textSoft },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 13, marginTop: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: theme.colors.textSoft, fontSize: 12 },
  separator: { height: 1, backgroundColor: theme.colors.border, marginTop: 16, marginBottom: 13 },
  label: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  games: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 9 },
  game: { maxWidth: "65%", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: theme.colors.surfaceSoft },
  gameText: { color: theme.colors.text, fontSize: 12, fontWeight: "600" },
  moreGames: { color: theme.colors.textSoft, fontSize: 12 },
  emptyGames: { color: theme.colors.textSoft, fontSize: 12, marginTop: 8 },
  completion: { marginTop: 17, gap: 7 },
  completionLine: { flexDirection: "row", justifyContent: "space-between" },
  completionLabel: { color: theme.colors.textSoft, fontSize: 12 },
  completionValue: { color: theme.colors.primarySoft, fontWeight: "800", fontSize: 12 },
  track: { height: 5, borderRadius: 4, backgroundColor: theme.colors.surfaceHover, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: theme.colors.primary },
  profileLink: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.border },
  profileLinkText: { color: theme.colors.primarySoft, fontSize: 13, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 5 },
  sectionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "800" },
  seeAll: { color: theme.colors.primarySoft, fontSize: 12, fontWeight: "700" },
  conversation: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  conversationMain: { flex: 1, gap: 5 },
  conversationTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  conversationName: { color: theme.colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  time: { color: theme.colors.textMuted, fontSize: 10 },
  conversationBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  preview: { flex: 1, color: theme.colors.textSoft, fontSize: 12 },
  previewLarge: { fontSize: 15 },
  unread: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary },
  unreadText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  noConversations: { color: theme.colors.textSoft, fontSize: 13, marginTop: 12 },
  discover: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 26, padding: 13, borderRadius: 15, backgroundColor: theme.colors.surface },
  discoverIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSoft },
  discoverCopy: { flex: 1, gap: 3 },
  discoverTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  discoverDescription: { color: theme.colors.textSoft, fontSize: 11, lineHeight: 15 },
});
