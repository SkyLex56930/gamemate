import { useCallback, useState } from "react";
import { ActivityIndicator, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { cosmeticColors, type Cosmetic } from "../lib/cosmetics";
import { getMyProfileSummary, type ProfileSummary } from "../lib/profileSummary";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type MyPost = {
  post_id: string;
  title: string;
  description: string | null;
  game_name: string;
  post_status: "open" | "closed" | "cancelled";
  created_at: string;
};

export function ProfileScreen({ session, onSettings, onShop }: {
  session: Session;
  onSettings: () => void;
  onShop: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [frame, setFrame] = useState<Cosmetic | null>(null);
  const [banner, setBanner] = useState<Cosmetic | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState(false);

  const reload = useCallback(async () => {
    try {
      const profileSummary = await getMyProfileSummary(session.user.id);
      setSummary(profileSummary);
      setError("");
      const { equipped_frame_id: frameId, equipped_banner_cosmetic_id: bannerId } = profileSummary.profile;
      const ids = [frameId, bannerId].filter((id): id is string => !!id);
      const [feedResult, cosmeticsResult] = await Promise.all([
        supabase.rpc("get_lfg_feed_v8", { p_game_id: null, p_scope: "mine", p_limit: 20 }),
        ids.length ? supabase.from("profile_cosmetics")
          .select("id,name,cosmetic_type,rarity,unlock_method,unlock_label,price_eur_cents,style")
          .in("id", ids) : Promise.resolve({ data: [], error: null }),
      ]);
      setFeedError(!!feedResult.error);
      setPosts(feedResult.error ? [] : ((feedResult.data ?? []) as MyPost[])
        .sort((a, b) => b.created_at.localeCompare(a.created_at)));
      const cosmetics = (cosmeticsResult.data ?? []) as Cosmetic[];
      setFrame(cosmetics.find((item) => item.id === frameId) ?? null);
      setBanner(cosmetics.find((item) => item.id === bannerId) ?? null);
    } catch (cause) {
      console.error("Profil mobile :", cause);
      setError("Impossible de charger ton profil. Appuie pour réessayer.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.user.id]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const profile = summary?.profile;
  const name = profile?.display_name || profile?.username || "Joueur";
  const bannerBody = <View style={styles.bannerContent}>
    <Text style={styles.bannerLabel}>GAMEMATE · PROFIL</Text>
  </View>;

  return <ScrollView style={styles.root}
    contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
      setRefreshing(true);
      void reload();
    }} tintColor={theme.colors.primary} />}>
    <View style={styles.top}>
      <Text style={styles.title}>Mon profil</Text>
      <Pressable onPress={onSettings} style={styles.settings} accessibilityRole="button"
        accessibilityLabel="Paramètres du profil">
        <Ionicons name="settings-outline" size={21} color={theme.colors.text} />
      </Pressable>
    </View>

    {loading && !summary ? <ActivityIndicator style={styles.loading} color={theme.colors.primary} /> :
      error && !summary ? <Pressable onPress={() => void reload()} style={styles.errorBox}>
        <Text style={styles.error}>{error}</Text>
      </Pressable> : summary && <>
        {banner ? <LinearGradient colors={cosmeticColors(banner)} style={styles.banner}>{bannerBody}</LinearGradient> :
          profile?.banner_url ? <ImageBackground source={{ uri: profile.banner_url }} style={styles.banner}
            imageStyle={styles.bannerImage}>{bannerBody}</ImageBackground> :
            <LinearGradient colors={["#172744", "#3B276B", "#18465B"]} style={styles.banner}>
              {bannerBody}
            </LinearGradient>}

        <View style={styles.identity}>
          <View style={[styles.avatarFrame, frame && { borderColor: frame.style?.accent || theme.colors.primarySoft }]}>
            <Avatar name={name} url={profile?.avatar_url} size={78} />
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.handle}>@{profile?.username || "joueur"}</Text>
          </View>
        </View>

        <View style={styles.bioBox}>
          <Text style={styles.bio}>{profile?.bio || "Pas encore de présentation."}</Text>
          {(profile?.region || profile?.language) && <View style={styles.meta}>
            {!!profile.region && <Text style={styles.metaText}>📍 {profile.region}</Text>}
            {!!profile.language && <Text style={styles.metaText}>🌐 {profile.language}</Text>}
          </View>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mes jeux</Text>
          {summary.games.length ? <View style={styles.games}>
            {summary.games.map((game, index) => <View key={`${game}-${index}`} style={styles.game}>
              <Ionicons name="game-controller-outline" size={16} color={theme.colors.cyan} />
              <Text style={styles.gameText}>{game}</Text>
            </View>)}
          </View> : <Text style={styles.empty}>Tes jeux apparaîtront ici une fois ajoutés sur GameMate.</Text>}
        </View>

        <Pressable style={styles.shopLink} onPress={onShop} accessibilityRole="button">
          <View style={styles.shopIcon}><Ionicons name="sparkles" size={23} color={theme.colors.cyan} /></View>
          <View style={styles.shopCopy}>
            <Text style={styles.shopTitle}>Boutique et cosmétiques</Text>
            <Text style={styles.shopSubtitle}>Cadres, bannières et récompenses</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fil d’actualité</Text>
          <Text style={styles.sectionSubtitle}>Mes annonces de recherche de joueurs</Text>
          {feedError ? <Pressable onPress={() => void reload()}><Text style={styles.error}>Impossible de charger le fil. Réessayer</Text></Pressable> :
            posts.length ? posts.map((post) => <View key={post.post_id} style={styles.post}>
              <View style={styles.postHeader}>
                <Ionicons name="people-outline" size={17} color={theme.colors.cyan} />
                <Text style={styles.postKind}>RECHERCHE DE MATES</Text>
                <Text style={styles.date}>{new Date(post.created_at).toLocaleDateString("fr-FR")}</Text>
              </View>
              <Text style={styles.postTitle}>{post.title}</Text>
              {!!post.description && <Text style={styles.postDescription}>{post.description}</Text>}
              <View style={styles.postFooter}>
                <Text style={styles.gameLabel}>{post.game_name}</Text>
                <Text style={[styles.status, post.post_status === "open" && styles.open]}>
                  {post.post_status === "open" ? "En cours" : post.post_status === "closed" ? "Terminée" : "Annulée"}
                </Text>
              </View>
            </View>) : <Text style={styles.empty}>Aucune annonce pour l’instant. Tes annonces GameMate s’afficheront ici.</Text>}
        </View>
      </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  page: { paddingTop: 13, gap: 15 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 18 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "900" },
  settings: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  loading: { marginVertical: 70 },
  errorBox: { padding: 18, marginHorizontal: 18, backgroundColor: theme.colors.surface, borderRadius: 14 },
  error: { color: theme.colors.danger, fontSize: 12 },
  banner: { height: 145, marginHorizontal: 18, borderRadius: 18, justifyContent: "flex-end", overflow: "hidden" },
  bannerImage: { borderRadius: 18 },
  bannerContent: { padding: 14 },
  bannerLabel: { color: "#FFFFFF", fontWeight: "900", fontSize: 10, letterSpacing: 1.3 },
  identity: { marginHorizontal: 18, marginTop: -51, flexDirection: "row", alignItems: "flex-end", gap: 11 },
  avatarFrame: { padding: 4, borderRadius: 29, borderWidth: 3, borderColor: theme.colors.background, backgroundColor: theme.colors.background },
  identityText: { flex: 1, paddingBottom: 7 },
  name: { color: theme.colors.text, fontSize: 23, fontWeight: "900" },
  handle: { color: theme.colors.textSoft, fontSize: 12, marginTop: 2 },
  bioBox: { marginHorizontal: 18, gap: 12 },
  bio: { color: theme.colors.text, fontSize: 13, lineHeight: 20 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  metaText: { color: theme.colors.textSoft, fontSize: 12 },
  section: { marginHorizontal: 18, gap: 11, marginTop: 11 },
  sectionTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "800" },
  sectionSubtitle: { color: theme.colors.textSoft, fontSize: 12, marginTop: -6 },
  games: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  game: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: 11, padding: 10 },
  gameText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
  empty: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 19 },
  shopLink: { marginHorizontal: 18, marginTop: 6, padding: 14, borderRadius: 17, backgroundColor: theme.colors.surface, flexDirection: "row", alignItems: "center", gap: 12 },
  shopIcon: { backgroundColor: theme.colors.surfaceSoft, width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  shopCopy: { flex: 1, gap: 4 },
  shopTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  shopSubtitle: { color: theme.colors.textSoft, fontSize: 11 },
  post: { backgroundColor: theme.colors.surface, padding: 14, borderRadius: 15, gap: 9 },
  postHeader: { flexDirection: "row", gap: 6, alignItems: "center" },
  postKind: { color: theme.colors.cyan, fontSize: 10, fontWeight: "800", flex: 1 },
  date: { color: theme.colors.textMuted, fontSize: 10 },
  postTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  postDescription: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 18 },
  postFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  gameLabel: { color: theme.colors.primarySoft, fontSize: 11, fontWeight: "700" },
  status: { color: theme.colors.textMuted, fontSize: 10 },
  open: { color: theme.colors.success },
});
