import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccentPalette } from "../lib/mobilePreferences";
import { supabase } from "../lib/supabase";
import { useAndroidKeyboardOverlap } from "../lib/useAndroidKeyboardOverlap";
import { theme } from "../theme/theme";

type Scope = "all" | "mine" | "applications";
type UserGame = { game_id: number; platform_id: number | null; is_primary: boolean; mode_text: string | null; rank_text: string | null; mic_enabled: boolean; crossplay_enabled: boolean; name: string };
type Application = { application_id: string; display_name: string | null; username: string | null; message: string | null; status: string };
type Post = {
  post_id: string; owner_display_name: string | null; owner_username: string | null;
  game_id: number; game_name: string; platform_name: string | null; title: string;
  description: string | null; mode_text: string | null; rank_text: string | null; region: string | null;
  mic_required: boolean; crossplay_enabled: boolean; starts_at: string;
  max_players: number; current_players: number; pending_count: number;
  post_status: "open" | "closed" | "cancelled";
  application_state: "none" | "pending" | "accepted" | "declined" | "cancelled";
  is_owner: boolean; squad_id: string | null; applications: Application[];
};

function dateLabel(value: string) {
  return new Date(value).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function LfgScreen({ session, onOpenSquads }: { session: Session; onOpenSquads: () => void }) {
  const palette = useAccentPalette();
  const insets = useSafeAreaInsets();
  const { root, keyboardInset, measureKeyboardOverlap } = useAndroidKeyboardOverlap();
  const [scope, setScope] = useState<Scope>("all");
  const [gameFilter, setGameFilter] = useState<number | null>(null);
  const [games, setGames] = useState<UserGame[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [game, setGame] = useState<UserGame | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("");
  const [rank, setRank] = useState("");
  const [region, setRegion] = useState("");
  const [mic, setMic] = useState(false);
  const [crossplay, setCrossplay] = useState(true);
  const [startOffset, setStartOffset] = useState(0);
  const [duration, setDuration] = useState(120);
  const [players, setPlayers] = useState(4);
  const [applyId, setApplyId] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("get_lfg_feed_v8", {
      p_game_id: gameFilter, p_scope: scope, p_limit: 80,
    });
    if (loadError) setError("Impossible de charger les annonces. Appuie pour réessayer.");
    else { setPosts((data ?? []) as Post[]); setError(""); }
    setLoading(false);
  }, [gameFilter, scope]);

  const loadGames = useCallback(async () => {
    const { data, error: gamesError } = await supabase.from("user_games")
      .select("game_id,platform_id,is_primary,mode_text,rank_text,mic_enabled,crossplay_enabled")
      .eq("user_id", session.user.id);
    if (gamesError || !data?.length) { setGames([]); return; }
    const ids = [...new Set(data.map((row) => row.game_id))];
    const catalog = await supabase.from("games").select("id,name").in("id", ids);
    if (catalog.error) { setGames([]); return; }
    const names = new Map((catalog.data ?? []).map((row) => [Number(row.id), row.name as string]));
    const list = data.map((row) => ({
      ...row, game_id: Number(row.game_id), platform_id: row.platform_id == null ? null : Number(row.platform_id),
      name: names.get(Number(row.game_id)) || "Jeu",
    })) as UserGame[];
    list.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    setGames(list);
  }, [session.user.id]);

  useFocusEffect(useCallback(() => { setLoading(true); void load(); void loadGames(); }, [load, loadGames]));
  useEffect(() => {
    const channel = supabase.channel(`mobile-annonces:${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_posts_v8" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_applications_v8" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session.user.id, load]);

  function selectGame(value: UserGame) {
    setGame(value);
    setMode(value.mode_text || ""); setRank(value.rank_text || "");
    setMic(Boolean(value.mic_enabled)); setCrossplay(Boolean(value.crossplay_enabled));
    if (!title) setTitle(`Recherche de mates sur ${value.name}`);
  }

  function openForm() {
    const primary = games[0] ?? null;
    setGame(primary); setTitle(primary ? `Recherche de mates sur ${primary.name}` : "");
    setMode(primary?.mode_text || ""); setRank(primary?.rank_text || "");
    setMic(Boolean(primary?.mic_enabled)); setCrossplay(primary?.crossplay_enabled ?? true);
    setDescription(""); setRegion(""); setStartOffset(0); setDuration(120); setPlayers(4);
    setFormOpen(true); setError(""); setNotice("");
  }

  async function create() {
    if (!game || title.trim().length < 4) { setError("Choisis un jeu et un titre d’au moins quatre caractères."); return; }
    setBusy("create"); setError("");
    const { error: createError } = await supabase.rpc("create_lfg_post_v8", {
      p_game_id: game.game_id, p_platform_id: game.platform_id,
      p_title: title.trim(), p_description: description.trim() || null,
      p_mode_text: mode.trim() || null, p_rank_text: rank.trim() || null, p_region: region.trim() || null,
      p_mic_required: mic, p_crossplay_enabled: crossplay,
      p_starts_at: new Date(Date.now() + startOffset * 60_000).toISOString(),
      p_duration_minutes: duration, p_max_players: players,
    });
    if (createError) setError(`Publication impossible : ${createError.message}`);
    else { setNotice("Ton annonce est publiée."); setFormOpen(false); setScope("mine"); await load(); }
    setBusy(null);
  }

  async function action(key: string, rpc: string, args: Record<string, unknown>, success: string) {
    setBusy(key); setError(""); setNotice("");
    const { error: actionError } = await supabase.rpc(rpc, args);
    if (actionError) setError(`Action impossible : ${actionError.message}`);
    else { setNotice(success); setApplyId(null); setApplyMessage(""); await load(); }
    setBusy(null);
  }

  function close(post: Post) {
    Alert.alert("Fermer cette annonce ?", post.title, [
      { text: "Garder", style: "cancel" },
      { text: "Fermer", style: "destructive", onPress: () => void action(post.post_id, "close_lfg_post_v8", { p_post_id: post.post_id }, "Annonce fermée.") },
    ]);
  }

  return <View ref={root} style={styles.root} onLayout={measureKeyboardOverlap}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 + keyboardInset }]}>
        <Text style={[styles.kicker, { color: palette.secondary }]}>PARTIES EN DIRECT</Text>
        <Text style={styles.title}>Annonces</Text>
        <Text style={styles.muted}>Trouve des mates pour ta prochaine partie.</Text>
        <Pressable disabled={!games.length} onPress={openForm} style={[styles.primary, { backgroundColor: palette.primary }, !games.length && styles.disabled]}>
          <Ionicons name={formOpen ? "close-outline" : "add-circle-outline"} size={19} color="#FFF" />
          <Text style={styles.primaryText}>{formOpen ? "Nouvelle annonce" : "Publier une annonce"}</Text>
        </Pressable>
        {!games.length && <Text style={styles.muted}>Ajoute un jeu à ton profil pour publier une annonce.</Text>}
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!error && <Pressable onPress={() => void load()}><Text style={styles.error}>{error}</Text></Pressable>}

        {formOpen && <View style={styles.card}>
          <Text style={styles.cardTitle}>Nouvelle annonce</Text>
          <Text style={styles.label}>Jeu</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {games.map((value, index) => <Chip key={`${value.game_id}-${value.platform_id}-${index}`} label={value.name} selected={game === value} onPress={() => selectGame(value)} />)}
          </ScrollView>
          <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="Titre de l’annonce" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
          <TextInput value={description} onChangeText={setDescription} maxLength={500} multiline placeholder="Quelques détails (facultatif)" placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.multiline]} />
          <View style={styles.row}><TextInput value={mode} onChangeText={setMode} maxLength={60} placeholder="Mode" placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.flex]} />
            <TextInput value={rank} onChangeText={setRank} maxLength={60} placeholder="Rang" placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.flex]} /></View>
          <TextInput value={region} onChangeText={setRegion} maxLength={80} placeholder="Région (facultatif)" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
          <Text style={styles.label}>Début</Text>
          <View style={styles.row}>{[0, 60, 1440].map((offset) => <Chip key={offset} label={offset === 0 ? "Maintenant" : offset === 60 ? "Dans 1 h" : "Demain"} selected={startOffset === offset} onPress={() => setStartOffset(offset)} />)}</View>
          <View style={styles.row}><Text style={[styles.muted, styles.flex]}>Durée : {duration} min</Text>
            <Step onPress={() => setDuration((v) => Math.max(15, v - 30))} label="−" /><Step onPress={() => setDuration((v) => Math.min(1440, v + 30))} label="+" /></View>
          <View style={styles.row}><Text style={[styles.muted, styles.flex]}>Places : {players}</Text>
            <Step onPress={() => setPlayers((v) => Math.max(2, v - 1))} label="−" /><Step onPress={() => setPlayers((v) => Math.min(12, v + 1))} label="+" /></View>
          <View style={styles.row}><Chip label="Micro requis" selected={mic} onPress={() => setMic(!mic)} /><Chip label="Crossplay" selected={crossplay} onPress={() => setCrossplay(!crossplay)} /></View>
          <Pressable disabled={!!busy} onPress={() => void create()} style={[styles.primary, { backgroundColor: palette.primary }, !!busy && styles.disabled]}><Text style={styles.primaryText}>{busy === "create" ? "Publication…" : "Publier"}</Text></Pressable>
          <Pressable onPress={() => setFormOpen(false)}><Text style={styles.muted}>Annuler</Text></Pressable>
        </View>}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(["all", "mine", "applications"] as const).map((value) => <Chip key={value} label={value === "all" ? "Toutes" : value === "mine" ? "Mes annonces" : "Mes candidatures"} selected={scope === value} onPress={() => setScope(value)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Tous les jeux" selected={gameFilter === null} onPress={() => setGameFilter(null)} />
          {[...new Map(games.map((value) => [value.game_id, value])).values()].map((value) => <Chip key={value.game_id} label={value.name} selected={gameFilter === value.game_id} onPress={() => setGameFilter(value.game_id)} />)}
        </ScrollView>

        {loading && <ActivityIndicator color={palette.primary} />}
        {!loading && !posts.length && <Text style={styles.empty}>Aucune annonce pour le moment.</Text>}
        {posts.map((post) => <View key={post.post_id} style={styles.card}>
          <Text style={[styles.label, { color: palette.secondary }]}>{post.game_name} {post.platform_name ? `· ${post.platform_name}` : ""}</Text>
          <Text style={styles.cardTitle}>{post.title}</Text>
          <Text style={styles.muted}>Par {post.owner_display_name || post.owner_username || "Joueur"} · {dateLabel(post.starts_at)}</Text>
          {!!post.description && <Text style={styles.body}>{post.description}</Text>}
          <Text style={styles.muted}>{[post.mode_text, post.rank_text, post.region, post.mic_required ? "Micro" : null, post.crossplay_enabled ? "Crossplay" : null].filter(Boolean).join(" · ")}</Text>
          <Text style={styles.bold}>{post.current_players}/{post.max_players} joueurs · {post.post_status === "open" ? "Ouverte" : "Fermée"}</Text>
          {post.is_owner ? <>
            {post.applications?.filter((application) => application.status === "pending").map((application) => <View key={application.application_id} style={styles.application}>
              <Text style={styles.bold}>{application.display_name || application.username || "Joueur"}</Text>
              {!!application.message && <Text style={styles.muted}>{application.message}</Text>}
              <View style={styles.row}>
                <Pressable disabled={!!busy} onPress={() => void action(application.application_id, "respond_lfg_application_v8", { p_application_id: application.application_id, p_accept: true }, "Candidature acceptée.")} style={[styles.mini, { backgroundColor: palette.primary }]}><Text style={styles.miniText}>Accepter</Text></Pressable>
                <Pressable disabled={!!busy} onPress={() => void action(application.application_id, "respond_lfg_application_v8", { p_application_id: application.application_id, p_accept: false }, "Candidature refusée.")} style={styles.mini}><Text style={styles.miniText}>Refuser</Text></Pressable>
              </View>
            </View>)}
            {post.post_status === "open" && <Pressable disabled={!!busy} onPress={() => close(post)}><Text style={styles.error}>Fermer l’annonce</Text></Pressable>}
          </> : post.application_state === "pending" ? <Pressable disabled={!!busy} onPress={() => void action(post.post_id, "cancel_lfg_application_v8", { p_post_id: post.post_id }, "Candidature retirée.")}><Text style={styles.muted}>Candidature envoyée · Retirer</Text></Pressable>
            : post.application_state === "accepted" ? <Pressable onPress={onOpenSquads} style={[styles.primary, { backgroundColor: palette.primary }]}><Text style={styles.primaryText}>Rejoindre ma squad</Text></Pressable>
              : post.post_status === "open" && post.application_state === "none" ? <>
                {applyId === post.post_id && <TextInput value={applyMessage} onChangeText={setApplyMessage} maxLength={400} multiline placeholder="Petit message (facultatif)" placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.multiline]} />}
                <Pressable disabled={!!busy} onPress={() => applyId === post.post_id
                  ? void action(post.post_id, "apply_lfg_post_v8", { p_post_id: post.post_id, p_message: applyMessage.trim() || null }, "Candidature envoyée.")
                  : (setApplyId(post.post_id), setApplyMessage(""))} style={[styles.primary, { backgroundColor: palette.primary }]}><Text style={styles.primaryText}>{applyId === post.post_id ? "Envoyer ma candidature" : "Rejoindre cette partie"}</Text></Pressable>
              </> : <Text style={styles.muted}>{post.application_state === "declined" ? "Candidature refusée" : post.application_state === "cancelled" ? "Candidature retirée" : "Annonce terminée"}</Text>}
          {post.is_owner && !!post.squad_id && <Pressable onPress={onOpenSquads}><Text style={[styles.link, { color: palette.secondary }]}>Voir la squad</Text></Pressable>}
        </View>)}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const palette = useAccentPalette();
  return <Pressable onPress={onPress} style={[styles.chip, selected && { borderColor: palette.primary, backgroundColor: palette.primary }]}><Text style={styles.chipText}>{label}</Text></Pressable>;
}
function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={styles.step}><Text style={styles.stepText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  page: { padding: 18, gap: 12 },
  kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: "900" },
  card: { padding: 16, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 10 },
  cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "800" },
  muted: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 18 },
  bold: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },
  body: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  label: { color: theme.colors.textSoft, fontSize: 11, fontWeight: "800" },
  error: { color: theme.colors.danger, fontSize: 12 },
  notice: { color: theme.colors.success, fontSize: 12 },
  link: { fontSize: 12, fontWeight: "800" },
  input: { minHeight: 47, borderRadius: 11, backgroundColor: theme.colors.surfaceSoft, color: theme.colors.text, paddingHorizontal: 12, paddingVertical: 9 },
  multiline: { minHeight: 75, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 7, alignItems: "center", flexWrap: "wrap" },
  flex: { flex: 1 },
  chips: { gap: 7, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSoft, borderRadius: 9, minHeight: 37, paddingHorizontal: 11, justifyContent: "center" },
  chipText: { color: theme.colors.text, fontSize: 11, fontWeight: "800" },
  primary: { minHeight: 45, paddingHorizontal: 12, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  primaryText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  step: { width: 36, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: theme.colors.surfaceSoft },
  stepText: { color: theme.colors.text, fontSize: 20 },
  mini: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 8, backgroundColor: theme.colors.surfaceSoft },
  miniText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  application: { padding: 10, gap: 7, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft },
  empty: { color: theme.colors.textSoft, padding: 25, textAlign: "center" },
});
