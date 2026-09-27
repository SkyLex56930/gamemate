import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import {
  claimObjective, cosmeticColors, equipCosmetic, loadShop,
  type Cosmetic, type ShopData,
} from "../lib/cosmetics";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type Filter = "all" | "frame" | "banner" | "owned";
const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "Tout" }, { key: "frame", label: "Cadres" },
  { key: "banner", label: "Bannières" }, { key: "owned", label: "Mes objets" },
];
const rarity: Record<Cosmetic["rarity"], string> = {
  common: "Commun", rare: "Rare", epic: "Épique", legendary: "Légendaire",
};

export function ShopScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ShopData | null>(null);
  const [avatar, setAvatar] = useState<{ name: string; url: string | null }>({ name: "Joueur", url: null });
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    try {
      const [shop, profile] = await Promise.all([
        loadShop(session.user.id),
        supabase.from("profiles").select("display_name,username,avatar_url")
          .eq("id", session.user.id).single(),
      ]);
      setData(shop);
      if (profile.data) setAvatar({
        name: profile.data.display_name || profile.data.username || "Joueur",
        url: profile.data.avatar_url,
      });
      setError("");
    } catch (cause) {
      console.error("Boutique mobile :", cause);
      setError("Boutique indisponible. Réessaie.");
    } finally {
      setLoading(false);
    }
  }, [session.user.id]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  async function runAction(key: string, action: () => Promise<void>, success: string) {
    if (working) return;
    setWorking(key);
    setError("");
    setNotice("");
    try {
      await action();
      await reload();
      setNotice(success);
    } catch (cause) {
      console.error("Boutique mobile / action :", cause);
      setError("Action impossible pour le moment. Réessaie.");
    } finally {
      setWorking(null);
    }
  }

  const items = (data?.cosmetics ?? []).filter((item) =>
    filter === "all" || (filter === "owned" ? data?.ownedIds.has(item.id) : item.cosmetic_type === filter));

  return <ScrollView style={styles.root} contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}>
    <View style={styles.heading}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour au profil">
        <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
      </Pressable>
      <View style={styles.headingText}>
        <Text style={styles.kicker}>PERSONNALISATION</Text>
        <Text style={styles.title}>Boutique GameMate</Text>
      </View>
    </View>
    <Text style={styles.subtitle}>Découvre des cadres et des bannières pour ton profil.</Text>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}
      contentContainerStyle={styles.filterContent}>
      {filters.map((option) => <Pressable key={option.key} onPress={() => setFilter(option.key)}
        style={[styles.filter, filter === option.key && styles.filterActive]} accessibilityRole="button">
        <Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>{option.label}</Text>
      </Pressable>)}
    </ScrollView>

    {!!error && <Pressable onPress={() => void reload()} style={styles.feedback}>
      <Text style={styles.error}>{error}</Text>
    </Pressable>}
    {!!notice && <Text style={styles.notice}>{notice}</Text>}
    {loading && !data ? <ActivityIndicator style={styles.loading} color={theme.colors.primary} /> :
      !data ? null : items.length === 0 ? <Text style={styles.empty}>Aucun objet dans cette catégorie.</Text> :
        items.map((item) => {
          const owned = data?.ownedIds.has(item.id) ?? false;
          const equipped = (item.cosmetic_type === "frame" ? data?.equippedFrameId : data?.equippedBannerId) === item.id;
          const accent = item.style?.accent || theme.colors.primarySoft;
          const key = `equip-${item.cosmetic_type}`;
          return <View key={item.id} style={styles.card}>
            {item.cosmetic_type === "banner" ?
              <LinearGradient colors={cosmeticColors(item)} style={styles.bannerPreview}>
                <Text style={styles.previewBrand}>GAMEMATE</Text>
                <Text style={styles.previewName}>{item.name}</Text>
              </LinearGradient> :
              <View style={styles.framePreview}>
                <View style={[styles.frame, { borderColor: accent }]}>
                  <Avatar name={avatar.name} url={avatar.url} size={67} />
                </View>
                <Text style={styles.previewName}>{item.name}</Text>
              </View>}
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.kind}>{item.cosmetic_type === "frame" ? "CADRE" : "BANNIÈRE"} · {rarity[item.rarity]}</Text>
                {owned && <Text style={styles.owned}>POSSÉDÉ</Text>}
              </View>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.description}>{item.unlock_label || "Cosmétique GameMate"}</Text>
              {owned ? <Pressable disabled={!!working} style={[styles.action, equipped && styles.actionSecondary]}
                onPress={() => void runAction(key, () => equipCosmetic(equipped ? null : item, item.cosmetic_type),
                  equipped ? "Objet retiré de ton profil." : `${item.name} équipé.`)} accessibilityRole="button">
                <Text style={styles.actionText}>{working === key ? "Mise à jour…" : equipped ? "Déséquiper" : "Équiper"}</Text>
              </Pressable> : item.unlock_method === "purchase" ?
                <View style={styles.unavailable}>
                  <Text style={styles.unavailableText}>
                    {item.price_eur_cents !== null ? `${(item.price_eur_cents / 100).toFixed(2).replace(".", ",")} €` : "Boutique"} · Achat bientôt disponible
                  </Text>
                </View> : <View style={styles.unavailable}>
                  <Text style={styles.unavailableText}>À débloquer avec un objectif</Text>
                </View>}
            </View>
          </View>;
        })}

    {!!data?.objectives.length && <View style={styles.objectives}>
      <Text style={styles.sectionTitle}>Récompenses à obtenir</Text>
      <Text style={styles.sectionHint}>Remplis les objectifs sur GameMate pour débloquer des cosmétiques.</Text>
      {data.objectives.map((objective) => {
        const reward = data.cosmetics.find((item) => item.id === objective.reward_cosmetic_id);
        return <View style={styles.objective} key={objective.id}>
          <Text style={styles.objectiveTitle}>{objective.title}</Text>
          <Text style={styles.description}>{objective.description}</Text>
          <Text style={styles.objectiveProgress}>
            {reward?.name || "Récompense"} · {Math.min(objective.progress, objective.target_value)}/{objective.target_value}
          </Text>
          {objective.completed && !objective.claimed ?
            <Pressable disabled={!!working} onPress={() => void runAction(objective.id,
              () => claimObjective(objective.id), "Récompense ajoutée à tes objets.")}
              style={styles.claim} accessibilityRole="button">
              <Text style={styles.actionText}>{working === objective.id ? "Récupération…" : "Récupérer"}</Text>
            </Pressable> : <Text style={styles.objectiveStatus}>
              {objective.claimed ? "Récompense récupérée" : "En cours"}
            </Text>}
        </View>;
      })}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  page: { paddingTop: 14, paddingHorizontal: 18, gap: 13 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  headingText: { flex: 1 },
  kicker: { color: theme.colors.cyan, fontWeight: "800", fontSize: 10, letterSpacing: 1.1 },
  title: { color: theme.colors.text, fontWeight: "800", fontSize: 22 },
  subtitle: { color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 },
  filters: { flexGrow: 0, marginHorizontal: -18 },
  filterContent: { paddingHorizontal: 18, gap: 8 },
  filter: { paddingVertical: 9, paddingHorizontal: 13, backgroundColor: theme.colors.surface, borderRadius: 12 },
  filterActive: { backgroundColor: theme.colors.primary },
  filterText: { color: theme.colors.textSoft, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: "#FFFFFF" },
  loading: { marginVertical: 60 },
  feedback: { padding: 12, backgroundColor: theme.colors.surface, borderRadius: 10 },
  error: { color: theme.colors.danger, fontSize: 12 },
  notice: { color: theme.colors.success, fontSize: 12 },
  empty: { color: theme.colors.textSoft, marginVertical: 25 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  bannerPreview: { height: 114, justifyContent: "flex-end", padding: 15 },
  framePreview: { height: 114, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, backgroundColor: theme.colors.surfaceSoft },
  frame: { borderRadius: 27, borderWidth: 3, padding: 3 },
  previewBrand: { color: "#CED9FF", letterSpacing: 2, fontSize: 9, fontWeight: "900" },
  previewName: { color: theme.colors.text, fontWeight: "800", fontSize: 16 },
  cardBody: { padding: 15, gap: 7 },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  kind: { color: theme.colors.cyan, fontWeight: "800", fontSize: 10 },
  owned: { color: theme.colors.success, fontWeight: "900", fontSize: 10 },
  itemName: { color: theme.colors.text, fontWeight: "800", fontSize: 17 },
  description: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 17 },
  action: { alignItems: "center", backgroundColor: theme.colors.primary, padding: 12, marginTop: 7, borderRadius: 11 },
  actionSecondary: { backgroundColor: theme.colors.surfaceSoft },
  actionText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  unavailable: { paddingVertical: 11, marginTop: 5 },
  unavailableText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700" },
  objectives: { marginTop: 14, gap: 10 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "800" },
  sectionHint: { color: theme.colors.textSoft, fontSize: 12 },
  objective: { backgroundColor: theme.colors.surface, borderRadius: 15, padding: 14, gap: 6 },
  objectiveTitle: { color: theme.colors.text, fontWeight: "800", fontSize: 14 },
  objectiveProgress: { color: theme.colors.cyan, fontSize: 12, fontWeight: "700" },
  objectiveStatus: { color: theme.colors.textSoft, fontSize: 12, marginTop: 4 },
  claim: { alignSelf: "flex-start", backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, marginTop: 6 },
});
