import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccentPalette } from "../lib/mobilePreferences";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type Invitation = {
  id: string;
  kind: "friend" | "squad";
  senderId: string;
  createdAt: string;
  name: string;
};

export function NotificationsScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const palette = useAccentPalette();
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [friends, squads] = await Promise.all([
        supabase.from("friendships").select("id,requester_id,created_at")
          .eq("addressee_id", session.user.id).eq("status", "pending"),
        supabase.from("squad_invites").select("id,sender_id,created_at")
          .eq("recipient_id", session.user.id).eq("status", "pending"),
      ]);
      if (friends.error) throw friends.error;
      if (squads.error) throw squads.error;

      const ids = [...new Set([
        ...(friends.data ?? []).map((row) => row.requester_id),
        ...(squads.data ?? []).map((row) => row.sender_id),
      ])];
      const profiles = ids.length ? await supabase.from("profiles")
        .select("id,display_name,username").in("id", ids) : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const names = new Map((profiles.data ?? []).map((row) =>
        [row.id, row.display_name || row.username || "Un joueur"]));

      setItems([
        ...(friends.data ?? []).map((row) => ({
          id: row.id, kind: "friend" as const, senderId: row.requester_id,
          createdAt: row.created_at, name: names.get(row.requester_id) ?? "Un joueur",
        })),
        ...(squads.data ?? []).map((row) => ({
          id: row.id, kind: "squad" as const, senderId: row.sender_id,
          createdAt: row.created_at, name: names.get(row.sender_id) ?? "Un joueur",
        })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setError("");
    } catch (cause) {
      console.error("Invitations mobile :", cause);
      setError("Impossible de charger les invitations. Appuie pour réessayer.");
    } finally {
      setLoading(false);
    }
  }, [session.user.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const channel = supabase.channel(`mobile-invitations-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_invites" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session.user.id, load]);

  async function respond(item: Invitation, accept: boolean) {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    try {
      const { error: responseError } = item.kind === "friend"
        ? await supabase.rpc("respond_friend_request", { p_request_id: item.id, p_accept: accept })
        : await supabase.rpc("respond_to_squad_invite", { p_invite_id: item.id, p_accept: accept });
      if (responseError) throw responseError;
      await load();
    } catch (cause) {
      console.error("Réponse invitation mobile :", cause);
      setError("Réponse impossible. Réessaie.");
    } finally {
      setBusyId(null);
    }
  }

  return <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour à l’accueil">
        <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
      </Pressable>
      <View><Text style={[styles.kicker, { color: palette.secondary }]}>SOCIAL</Text>
        <Text style={styles.title}>Invitations</Text></View>
    </View>
    <Text style={styles.hint}>Demandes d’amis et invitations d’équipe en attente.</Text>
    {loading && !items.length ? <ActivityIndicator color={palette.primary} /> : null}
    {!!error && <Pressable onPress={() => void load()}><Text style={styles.error}>{error}</Text></Pressable>}
    {!loading && !items.length && !error ? <View style={styles.empty}>
      <Ionicons name="notifications-outline" size={28} color={theme.colors.textSoft} />
      <Text style={styles.hint}>Aucune invitation en attente.</Text>
    </View> : null}
    {items.map((item) => <View key={`${item.kind}-${item.id}`} style={styles.card}>
      <View style={[styles.icon, { backgroundColor: palette.primary }]}>
        <Ionicons name={item.kind === "friend" ? "person-add" : "people"} size={20} color="#FFFFFF" />
      </View>
      <View style={styles.details}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.hint}>{item.kind === "friend" ? "Souhaite t’ajouter comme ami" : "T’invite dans son équipe"}</Text>
        <View style={styles.actions}>
          <Pressable disabled={!!busyId} onPress={() => void respond(item, true)}
            style={[styles.accept, { backgroundColor: palette.primary }, !!busyId && styles.disabled]}>
            <Text style={styles.acceptText}>Accepter</Text>
          </Pressable>
          <Pressable disabled={!!busyId} onPress={() => void respond(item, false)}
            style={[styles.decline, !!busyId && styles.disabled]}>
            <Text style={styles.declineText}>Refuser</Text>
          </Pressable>
        </View>
      </View>
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 18, paddingTop: 18, gap: 14 },
  header: { flexDirection: "row", gap: 12, alignItems: "center" },
  back: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: "900", color: theme.colors.text },
  hint: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 17 },
  error: { color: theme.colors.danger, fontSize: 12 },
  empty: { marginTop: 25, alignItems: "center", gap: 8 },
  card: { flexDirection: "row", padding: 15, gap: 12, borderRadius: 16,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  details: { flex: 1, gap: 5 },
  name: { fontWeight: "800", color: theme.colors.text, fontSize: 15 },
  actions: { flexDirection: "row", gap: 9, marginTop: 6 },
  accept: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10 },
  acceptText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  decline: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft },
  declineText: { color: theme.colors.text, fontWeight: "700", fontSize: 12 },
  disabled: { opacity: 0.5 },
});
