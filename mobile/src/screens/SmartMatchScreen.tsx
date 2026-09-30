import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { Avatar } from "../components/Avatar";
import { useAccentPalette } from "../lib/mobilePreferences";
import { getMyProfileSummary } from "../lib/profileSummary";
import { supabase } from "../lib/supabase";
import { useAndroidKeyboardOverlap } from "../lib/useAndroidKeyboardOverlap";
import { theme } from "../theme/theme";

type MyGame = {
  game_id: number; platform_id: number | null; is_primary: boolean; gameName: string; platformName: string | null;
  rank_text: string | null; role_text: string | null; mode_text: string | null; crossplay_enabled: boolean;
};
type SortMode = "compatibility" | "online" | "name";
type Reason = { label: string; detail: string | null; points: number };
type Mate = {
  user_id: string; username: string | null; display_name: string | null; avatar_url: string | null;
  bio: string | null; region: string | null; language: string | null;
  game_name: string; platform_name: string | null; rank_text: string | null; role_text: string | null;
  mode_text: string | null; mic_enabled: boolean; crossplay_enabled: boolean;
  compatibility_score: number; compatibility_level: "ideal" | "strong" | "promising" | "possible";
  match_reasons: Reason[]; shared_dna_count: number; shared_looking_for_count: number;
  availability_match: boolean; availability_summary: { day_of_week: number; start_time: string; end_time: string } | null;
  presence_status: "online" | "away" | "busy" | "dnd" | "offline";
  friendship_id: string | null; friendship_state: "none" | "pending_outgoing" | "pending_incoming" | "accepted";
  can_invite: boolean; squad_invite_pending: boolean; target_in_squad: boolean; viewer_squad_game_id: number | null;
};

const gameKey = (item: MyGame) => `${item.game_id}:${item.platform_id ?? "none"}`;
const mateName = (mate: Mate) => mate.display_name || mate.username || "Joueur";
const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function SmartMatchScreen({ session, onMessage, onOpenSquads, onOpenSettings, onOpenFriends }: {
  session: Session; onMessage: (userId: string) => void; onOpenSquads: () => void;
  onOpenSettings: () => void; onOpenFriends: () => void;
}) {
  const palette = useAccentPalette();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Mate>>(null);
  const { root, keyboardInset, measureKeyboardOverlap } = useAndroidKeyboardOverlap();
  const [games, setGames] = useState<MyGame[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [completion, setCompletion] = useState<number | null>(null);
  const [availabilityCount, setAvailabilityCount] = useState(0);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [micOnly, setMicOnly] = useState(false);
  const [crossplay, setCrossplay] = useState(true);
  const [sameRank, setSameRank] = useState(false);
  const [sameRole, setSameRole] = useState(false);
  const [sameMode, setSameMode] = useState(false);
  const [sameLanguage, setSameLanguage] = useState(false);
  const [sameRegion, setSameRegion] = useState(false);
  const [commonAvailability, setCommonAvailability] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("compatibility");
  const [results, setResults] = useState<Mate[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedGame = games.find((item) => gameKey(item) === selectedKey) ?? games[0] ?? null;

  const loadProfile = useCallback(async () => {
    setGamesLoading(true);
    try {
      const [gameRows, slots, summary] = await Promise.all([
        supabase.from("user_games").select("game_id,platform_id,is_primary,rank_text,role_text,mode_text,crossplay_enabled")
          .eq("user_id", session.user.id),
        supabase.from("user_availability").select("day_of_week").eq("user_id", session.user.id),
        getMyProfileSummary(session.user.id),
      ]);
      if (gameRows.error) throw gameRows.error;
      setAvailabilityCount(slots.error ? 0 : (slots.data ?? []).length);
      setCompletion(summary.completion);
      const rows = gameRows.data ?? [];
      if (!rows.length) { setGames([]); return; }
      const platformIds = [...new Set(rows.map((row) => row.platform_id).filter((id): id is number => id !== null))];
      const [catalog, platforms] = await Promise.all([
        supabase.from("games").select("id,name").in("id", [...new Set(rows.map((row) => row.game_id))]),
        platformIds.length ? supabase.from("platforms").select("id,name").in("id", platformIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (catalog.error) throw catalog.error;
      const names = new Map((catalog.data ?? []).map((row) => [Number(row.id), row.name as string]));
      const platformNames = new Map((platforms.data ?? []).map((row) => [Number(row.id), row.name as string]));
      const mapped: MyGame[] = rows.map((row) => ({
        ...row, game_id: Number(row.game_id), platform_id: row.platform_id == null ? null : Number(row.platform_id),
        gameName: names.get(Number(row.game_id)) || "Jeu", platformName: row.platform_id == null ? null : platformNames.get(Number(row.platform_id)) || null,
      }));
      mapped.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      setGames(mapped);
      if (!selectedKey || !mapped.some((item) => gameKey(item) === selectedKey)) {
        setSelectedKey(gameKey(mapped[0]));
        setCrossplay(mapped[0].crossplay_enabled);
      }
      setError("");
    } catch (cause) {
      console.error("Matching mobile / profil :", cause);
      setError("Impossible de charger tes jeux. Réessaie.");
    } finally { setGamesLoading(false); }
  }, [session.user.id, selectedKey]);

  useFocusEffect(useCallback(() => { void loadProfile(); }, [loadProfile]));

  const sorted = useMemo(() => [...results].sort((a, b) => {
    if (sortMode === "name") return mateName(a).localeCompare(mateName(b), "fr", { sensitivity: "base" });
    if (sortMode === "online") {
      const weight = (mate: Mate) => mate.presence_status === "online" ? 0 : mate.presence_status === "busy" ? 1 : 2;
      return weight(a) - weight(b) || b.compatibility_score - a.compatibility_score;
    }
    return b.compatibility_score - a.compatibility_score;
  }), [results, sortMode]);

  async function search(silent = false) {
    if (!selectedGame) { setError("Ajoute au moins un jeu dans les paramètres de ton profil."); return; }
    if (!silent) setLoading(true);
    setError(""); setNotice(""); setSearched(true);
    try {
      const { data, error: searchError } = await supabase.rpc("find_mates_smart_v7", {
        p_game_id: selectedGame.game_id, p_platform_id: selectedGame.platform_id,
        p_allow_crossplay: crossplay, p_mic_required: micOnly,
        p_same_rank: sameRank, p_same_role: sameRole, p_same_mode: sameMode,
        p_same_language: sameLanguage, p_same_region: sameRegion,
        p_availability_required: commonAvailability, p_query: query.trim() || null, p_limit: 60,
      });
      if (searchError) throw searchError;
      setResults((data ?? []) as Mate[]);
    } catch (cause) {
      console.error("Matching mobile / recherche :", cause);
      setResults([]);
      setError(cause instanceof Error && cause.message.includes("game_not_configured")
        ? "Ce jeu n’est plus configuré dans ton profil." : "Impossible de calculer les compatibilités. Réessaie.");
    } finally { setLoading(false); }
  }

  async function mateAction(mate: Mate, kind: "friend" | "accept" | "squad") {
    setBusy(`${kind}:${mate.user_id}`); setError(""); setNotice("");
    const action = kind === "friend"
      ? supabase.rpc("send_friend_request", { p_target_user_id: mate.user_id })
      : kind === "accept"
        ? supabase.rpc("respond_friend_request", { p_request_id: mate.friendship_id, p_accept: true })
        : supabase.rpc("invite_to_squad", { p_recipient_id: mate.user_id, p_game_id: mate.viewer_squad_game_id });
    try {
      const { error: actionError } = await action;
      if (actionError) throw actionError;
      await search(true);
      setNotice(kind === "friend" ? "Demande d’ami envoyée." : kind === "accept" ? "Demande acceptée." : "Invitation de squad envoyée.");
    } catch (cause) {
      console.error("Matching mobile / action :", cause);
      setError(cause instanceof Error && cause.message.includes("friend_requests_disabled") ? "Ce joueur n’accepte pas les demandes d’ami."
        : cause instanceof Error && cause.message.includes("squad_invites_disabled") ? "Ce joueur n’accepte pas les invitations de squad."
          : "Action impossible. Réessaie.");
    } finally { setBusy(null); }
  }

  function chooseGame(item: MyGame) {
    setSelectedKey(gameKey(item)); setCrossplay(item.crossplay_enabled);
    setSameRank(false); setSameRole(false); setSameMode(false);
    setResults([]); setSearched(false); setError("");
  }

  const heading = <View style={styles.heading}>
    <Text style={[styles.kicker, { color: palette.secondary }]}>MATCHING INTELLIGENT · PC + MOBILE</Text>
    <Text style={styles.title}>Trouver mes mates</Text>
    <Text style={styles.muted}>Un score calculé avec vos profils et vos préférences de jeu.</Text>
    <Pressable onPress={onOpenSettings} style={styles.profileQuality} accessibilityRole="button">
      <Ionicons name="stats-chart-outline" size={22} color={palette.secondary} />
      <View style={styles.flex}><Text style={styles.bold}>Mon profil : {completion == null ? "à vérifier" : `${completion}%`}</Text>
        <Text style={styles.muted}>Complète ton profil pour affiner les résultats.</Text></View>
      <Ionicons name="chevron-forward" size={17} color={theme.colors.textSoft} />
    </Pressable>
    <Text style={styles.section}>1 · Choisis ton jeu</Text>
    {gamesLoading && <ActivityIndicator color={palette.primary} />}
    {!gamesLoading && !games.length && <Pressable onPress={onOpenSettings} style={styles.empty}><Text style={styles.muted}>Ajoute un jeu à ton profil pour commencer. Ouvrir les paramètres →</Text></Pressable>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {games.map((item) => <Chip key={gameKey(item)} label={`${item.gameName}${item.platformName ? ` · ${item.platformName}` : ""}`}
        selected={gameKey(item) === gameKey(selectedGame ?? item) && selectedGame === item}
        onPress={() => chooseGame(item)} color={palette.primary} />)}
    </ScrollView>
    <Text style={styles.section}>2 · Tes critères</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="Pseudo, région, rôle…" placeholderTextColor={theme.colors.textMuted}
      returnKeyType="search" onSubmitEditing={() => void search()} style={styles.input} />
    <Filter label="Micro obligatoire" value={micOnly} onChange={setMicOnly} color={palette.primary} />
    <Filter label="Inclure le crossplay" value={crossplay} onChange={setCrossplay} color={palette.primary} />
    <Pressable onPress={() => setAdvanced(!advanced)} style={styles.advanced}><Text style={[styles.bold, styles.flex]}>Critères avancés</Text><Ionicons name={advanced ? "chevron-up" : "chevron-down"} size={18} color={palette.secondary} /></Pressable>
    {advanced && <View style={styles.filters}>
      <Filter label="Même rang" detail={selectedGame?.rank_text || "Renseigne ton rang dans ton profil"} value={sameRank} onChange={setSameRank} disabled={!selectedGame?.rank_text} color={palette.primary} />
      <Filter label="Même rôle" detail={selectedGame?.role_text || "Renseigne ton rôle dans ton profil"} value={sameRole} onChange={setSameRole} disabled={!selectedGame?.role_text} color={palette.primary} />
      <Filter label="Même mode" detail={selectedGame?.mode_text || "Renseigne ton mode dans ton profil"} value={sameMode} onChange={setSameMode} disabled={!selectedGame?.mode_text} color={palette.primary} />
      <Filter label="Même langue" value={sameLanguage} onChange={setSameLanguage} color={palette.primary} />
      <Filter label="Même région" value={sameRegion} onChange={setSameRegion} color={palette.primary} />
      <Filter label="Créneau en commun" detail={availabilityCount ? `${availabilityCount} créneau(x) dans ton profil` : "Ajoute tes disponibilités dans ton profil"}
        value={commonAvailability} onChange={setCommonAvailability} disabled={!availabilityCount} color={palette.primary} />
    </View>}
    <Pressable disabled={!selectedGame || loading} onPress={() => void search()} style={[styles.searchButton, { backgroundColor: palette.primary }, (!selectedGame || loading) && styles.disabled]}>
      <Ionicons name="sparkles-outline" color="#FFF" size={19} /><Text style={styles.primaryText}>{loading ? "Calcul en cours…" : "Trouver mes meilleurs mates"}</Text>
    </Pressable>
    {searched && <View style={styles.row}><Text style={[styles.section, styles.flex]}>3 · {sorted.length} résultat{sorted.length > 1 ? "s" : ""}</Text>
      <Pressable onPress={() => setSortMode(sortMode === "compatibility" ? "online" : sortMode === "online" ? "name" : "compatibility")}
        style={styles.sort}><Text style={styles.sortText}>{sortMode === "compatibility" ? "Meilleur %" : sortMode === "online" ? "En ligne" : "Nom"} ↻</Text></Pressable></View>}
    {!!notice && <Text style={styles.notice}>{notice}</Text>}
    {!!error && <Pressable onPress={() => void search()}><Text style={styles.error}>{error}</Text></Pressable>}
    {searched && !loading && !results.length && !error && <Text style={styles.muted}>Aucun mate avec ces critères. Essaie d’en retirer un.</Text>}
    {loading && <ActivityIndicator color={palette.primary} />}
  </View>;

  return <View ref={root} style={styles.root} onLayout={measureKeyboardOverlap}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList ref={list} data={sorted} keyExtractor={(item) => item.user_id} ListHeaderComponent={heading}
        renderItem={({ item }) => <MateCard mate={item} color={palette.primary} secondary={palette.secondary}
          expanded={expanded === item.user_id} onExpand={() => setExpanded(expanded === item.user_id ? null : item.user_id)}
          busy={!!busy} onFriend={() => void mateAction(item, "friend")}
          onAccept={() => void mateAction(item, "accept")}
          onInvite={() => void mateAction(item, "squad")}
          onMessage={() => onMessage(item.user_id)} onOpenFriends={onOpenFriends} onOpenSquads={onOpenSquads} />}
        contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 + keyboardInset }]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && searched} onRefresh={() => void search()} tintColor={palette.primary} />}
      />
    </KeyboardAvoidingView>
  </View>;
}

function MateCard({ mate, color, secondary, expanded, onExpand, busy, onFriend, onAccept, onInvite, onMessage, onOpenFriends, onOpenSquads }: {
  mate: Mate; color: string; secondary: string; expanded: boolean; onExpand: () => void; busy: boolean;
  onFriend: () => void; onAccept: () => void; onInvite: () => void;
  onMessage: () => void; onOpenFriends: () => void; onOpenSquads: () => void;
}) {
  const level = { ideal: "Match idéal", strong: "Très compatible", promising: "Bon potentiel", possible: "Compatible" }[mate.compatibility_level];
  const reasons = mate.match_reasons ?? [];
  const slot = mate.availability_summary;
  const name = mateName(mate);
  return <View style={styles.card}>
    <View style={styles.row}>
      <Avatar name={name} url={mate.avatar_url} size={49} />
      <View style={styles.flex}><Text style={styles.bold}>{name}</Text><Text style={styles.muted}>@{mate.username || "joueur"}</Text>
        <Text style={[styles.status, { color: mate.presence_status === "online" ? theme.colors.success : theme.colors.textMuted }]}>{mate.presence_status === "online" ? "● En ligne" : mate.presence_status === "busy" ? "● Occupé" : "○ Hors ligne"}</Text></View>
      <View style={[styles.score, { borderColor: color }]}><Text style={[styles.scoreNumber, { color }]}>{mate.compatibility_score}%</Text><Text style={styles.scoreLabel}>{level}</Text></View>
    </View>
    <View style={styles.bar}><View style={[styles.barFill, { backgroundColor: color, width: `${Math.max(0, Math.min(100, mate.compatibility_score))}%` }]} /></View>
    <Text style={styles.muted}>{[mate.game_name, mate.platform_name, mate.mic_enabled ? "Micro" : null, mate.crossplay_enabled ? "Crossplay" : null].filter(Boolean).join(" · ")}</Text>
    {!!mate.bio && <Text numberOfLines={expanded ? undefined : 2} style={styles.bio}>{mate.bio}</Text>}
    <View style={styles.chipsWrap}>{reasons.slice(0, 3).map((reason, index) => <Text key={`${reason.label}-${index}`} style={[styles.reasonChip, { color: secondary }]}>{reason.label}</Text>)}</View>
    {!!slot && <Text style={styles.muted}>🕒 Créneau commun · {days[slot.day_of_week]} {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</Text>}
    <Pressable onPress={onExpand} accessibilityRole="button"><Text style={[styles.detailsLink, { color: secondary }]}>{expanded ? "Masquer les détails" : `Pourquoi ${mate.compatibility_score}% ?`}</Text></Pressable>
    {expanded && <View style={styles.details}>
      {!!mate.region && <Text style={styles.muted}>Région : {mate.region}</Text>}
      {!!mate.language && <Text style={styles.muted}>Langue : {mate.language}</Text>}
      {!!mate.rank_text && <Text style={styles.muted}>Rang : {mate.rank_text}</Text>}
      {!!mate.role_text && <Text style={styles.muted}>Rôle : {mate.role_text}</Text>}
      {!!mate.mode_text && <Text style={styles.muted}>Mode : {mate.mode_text}</Text>}
      <Text style={styles.muted}>{mate.shared_dna_count} trait(s) et {mate.shared_looking_for_count} intention(s) en commun</Text>
      {reasons.map((reason, index) => <View key={`${reason.label}-${index}`} style={styles.reasonRow}>
        <View style={styles.flex}><Text style={styles.bold}>{reason.label}</Text><Text style={styles.muted}>{reason.detail || "Critère compatible"}</Text></View>
        <Text style={[styles.bold, { color }]}>+{reason.points}</Text>
      </View>)}
    </View>}
    <View style={styles.actions}>
      {mate.friendship_state === "accepted" ? <Action label="Message" onPress={onMessage} color={color} />
        : mate.friendship_state === "pending_incoming" ? <Action label="Accepter l’ami" onPress={onAccept} color={color} disabled={busy} />
          : mate.friendship_state === "pending_outgoing" ? <Action label="Demande envoyée" onPress={onOpenFriends} />
            : <Action label="Ajouter en ami" onPress={onFriend} color={color} disabled={busy} />}
      {mate.target_in_squad || mate.squad_invite_pending ? <Action label={mate.target_in_squad ? "Dans la squad" : "Invitation envoyée"} onPress={onOpenSquads} />
        : mate.can_invite ? <Action label="Inviter" onPress={onInvite} disabled={busy} /> : null}
    </View>
  </View>;
}

function Chip({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color: string }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && { borderColor: color, backgroundColor: color }]}><Text style={styles.chipText}>{label}</Text></Pressable>;
}
function Filter({ label, detail, value, onChange, disabled = false, color }: {
  label: string; detail?: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean; color: string;
}) {
  return <View style={[styles.filter, disabled && styles.disabled]}><View style={styles.flex}><Text style={styles.bold}>{label}</Text>{!!detail && <Text style={styles.muted}>{detail}</Text>}</View>
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: color, false: theme.colors.border }} thumbColor="#FFF" accessibilityLabel={label} /></View>;
}
function Action({ label, onPress, color, disabled }: { label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.action, color ? { backgroundColor: color } : styles.secondaryAction, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  page: { paddingHorizontal: 18, gap: 13 },
  heading: { paddingTop: 14, gap: 12 },
  kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 29, fontWeight: "900" },
  muted: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 17 },
  bold: { color: theme.colors.text, fontSize: 13, fontWeight: "800" },
  section: { color: theme.colors.text, fontSize: 16, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  profileQuality: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 14, backgroundColor: theme.colors.surface },
  chips: { gap: 8, paddingVertical: 3 },
  chip: { minHeight: 40, paddingHorizontal: 12, justifyContent: "center", borderRadius: 10, borderWidth: 1,
    borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  chipText: { color: theme.colors.text, fontSize: 11, fontWeight: "800" },
  input: { minHeight: 49, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: 11, color: theme.colors.text, paddingHorizontal: 13 },
  filter: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  advanced: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, padding: 12, borderRadius: 11 },
  filters: { padding: 13, borderRadius: 13, backgroundColor: theme.colors.surface, gap: 5 },
  searchButton: { minHeight: 47, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  sort: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: theme.colors.surface },
  sortText: { color: theme.colors.text, fontSize: 11, fontWeight: "700" },
  error: { color: theme.colors.danger, fontSize: 12 },
  notice: { color: theme.colors.success, fontSize: 12 },
  empty: { borderRadius: 12, padding: 16, backgroundColor: theme.colors.surface },
  card: { padding: 15, borderRadius: 17, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 12 },
  status: { fontSize: 11 },
  score: { width: 76, minHeight: 58, alignItems: "center", justifyContent: "center", borderWidth: 2, borderRadius: 13, padding: 3 },
  scoreNumber: { fontSize: 19, fontWeight: "900" },
  scoreLabel: { color: theme.colors.textSoft, fontSize: 8, textAlign: "center", fontWeight: "800" },
  bar: { height: 5, backgroundColor: theme.colors.surfaceSoft, borderRadius: 5, overflow: "hidden" },
  barFill: { height: 5, borderRadius: 5 },
  bio: { color: theme.colors.text, fontSize: 12, lineHeight: 18 },
  chipsWrap: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  reasonChip: { backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, fontSize: 10, fontWeight: "800" },
  detailsLink: { fontSize: 12, fontWeight: "800" },
  details: { backgroundColor: theme.colors.surfaceSoft, padding: 11, borderRadius: 10, gap: 7 },
  reasonRow: { flexDirection: "row", gap: 8, alignItems: "center", borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 7 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  action: { minHeight: 39, paddingHorizontal: 12, borderRadius: 10, justifyContent: "center" },
  secondaryAction: { backgroundColor: theme.colors.surfaceSoft },
  actionText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
});
