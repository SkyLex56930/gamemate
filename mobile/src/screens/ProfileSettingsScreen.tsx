import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../components/Avatar";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";
import { useAccentPalette } from "../lib/mobilePreferences";
import { useAndroidKeyboardOverlap } from "../lib/useAndroidKeyboardOverlap";
import { MatchPreferencesEditor } from "../components/MatchPreferencesEditor";

export function ProfileSettingsScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const palette = useAccentPalette();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const { root, keyboardInset, measureKeyboardOverlap } = useAndroidKeyboardOverlap();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<{ id: number; name: string }[]>([]);
  const [myGames, setMyGames] = useState<{ game_id: number; platform_id: number | null; is_primary: boolean }[]>([]);
  const [gameSearch, setGameSearch] = useState("");
  const [gameBusy, setGameBusy] = useState(false);

  const loadGames = useCallback(async () => {
    const [catalogResult, ownResult] = await Promise.all([
      supabase.from("games").select("id,name").eq("is_active", true).order("name"),
      supabase.from("user_games").select("game_id,platform_id,is_primary").eq("user_id", session.user.id),
    ]);
    if (!catalogResult.error) setCatalog((catalogResult.data ?? []) as { id: number; name: string }[]);
    if (!ownResult.error) setMyGames((ownResult.data ?? []).map((row) => ({
      game_id: Number(row.game_id), platform_id: row.platform_id == null ? null : Number(row.platform_id), is_primary: Boolean(row.is_primary),
    })));
  }, [session.user.id]);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("display_name,username,bio,region,language,avatar_url")
      .eq("id", session.user.id)
      .single();
    if (!data) return;
    setDisplayName(data.display_name ?? "");
    setUsername(data.username ?? "");
    setBio(data.bio ?? "");
    setRegion(data.region ?? "");
    setLanguage(data.language ?? "");
    setAvatarUrl(data.avatar_url);
  }, [session.user.id]);

  useFocusEffect(useCallback(() => { void loadProfile(); void loadGames(); }, [loadProfile, loadGames]));
  useEffect(() => {
    if (keyboardInset > 0 && gameSearch) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  }, [keyboardInset, gameSearch]);

  async function addGame(gameId: number) {
    setGameBusy(true); setNotice("");
    const { error } = await supabase.from("user_games").insert({
      user_id: session.user.id, game_id: gameId, platform_id: null,
      is_primary: myGames.length === 0, rank_text: null, role_text: null, mode_text: null,
      mic_enabled: false, crossplay_enabled: true,
    });
    if (error) setNotice("Impossible d’ajouter ce jeu.");
    else { setGameSearch(""); await loadGames(); }
    setGameBusy(false);
  }

  async function removeGame(item: { game_id: number; platform_id: number | null }) {
    setGameBusy(true); setNotice("");
    let query = supabase.from("user_games").delete().eq("user_id", session.user.id).eq("game_id", item.game_id);
    query = item.platform_id === null ? query.is("platform_id", null) : query.eq("platform_id", item.platform_id);
    const { error } = await query;
    if (error) setNotice("Impossible de retirer ce jeu.");
    else await loadGames();
    setGameBusy(false);
  }

  async function save() {
    if (saving) return;
    if (!username.trim() || !displayName.trim()) {
      setNotice("Le pseudo et le nom affiché sont obligatoires.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: username.trim(),
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          region: region.trim() || null,
          language: language.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.user.id);
      if (error) setNotice("Enregistrement impossible. Vérifie ton pseudo et réessaie.");
      else onBack();
    } catch (cause) {
      console.error("Paramètres du profil :", cause);
      setNotice("Enregistrement impossible. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return <View ref={root} style={{ flex: 1 }} onLayout={measureKeyboardOverlap}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 + keyboardInset }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour au profil">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View>
          <Text style={[styles.kicker, { color: palette.secondary }]}>PARAMÈTRES</Text>
          <Text style={styles.headerTitle}>Modifier mon profil</Text>
        </View>
      </View>
      <View style={styles.identity}>
        <Avatar name={displayName || username || "Joueur"} url={avatarUrl} size={68} />
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{displayName || username || "Joueur"}</Text>
          <Text style={styles.handle}>@{username || "joueur"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pseudo</Text>
        <TextInput value={username} onChangeText={setUsername} style={styles.input}
          autoCapitalize="none" autoCorrect={false} maxLength={30} />

        <Text style={styles.label}>Nom affiché</Text>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          style={styles.input}
        />

        <Text style={styles.label}>Bio</Text>

        <TextInput
          value={bio}
          onChangeText={setBio}
          multiline
          style={[styles.input, styles.textarea]}
        />

        <Text style={styles.label}>Région</Text>

        <TextInput
          value={region}
          onChangeText={setRegion}
          style={styles.input}
        />

        <Text style={styles.label}>Langue</Text>

        <TextInput
          value={language}
          onChangeText={setLanguage}
          style={styles.input}
        />

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable style={[styles.button, { backgroundColor: palette.primary }, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>
          <Ionicons name="save-outline" size={18} color="#FFF" />
          <Text style={styles.buttonText}>{saving ? "Enregistrement…" : "Enregistrer"}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.headerTitle}>Mes jeux</Text>
        <Text style={styles.label}>Ajoute tes jeux pour trouver des mates et publier des annonces.</Text>
        {myGames.map((item) => <View key={`${item.game_id}-${item.platform_id}`} style={styles.gameRow}>
          <Text style={styles.gameName}>{catalog.find((game) => game.id === item.game_id)?.name || "Jeu"}{item.is_primary ? " · Principal" : ""}</Text>
          <Pressable disabled={gameBusy} onPress={() => void removeGame(item)} accessibilityLabel="Retirer ce jeu"><Ionicons name="close-circle-outline" size={21} color={theme.colors.danger} /></Pressable>
        </View>)}
        <TextInput value={gameSearch} onChangeText={setGameSearch} onFocus={() => requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }))} style={styles.input} placeholder="Rechercher un jeu à ajouter" placeholderTextColor={theme.colors.textMuted} />
        {gameSearch.trim().length >= 2 && catalog.filter((item) => !myGames.some((own) => own.game_id === item.id) && item.name.toLowerCase().includes(gameSearch.trim().toLowerCase())).slice(0, 8).map((item) => <Pressable key={item.id} disabled={gameBusy} onPress={() => void addGame(item.id)} style={styles.gameRow}>
          <Text style={styles.gameName}>{item.name}</Text><Ionicons name="add-circle-outline" size={21} color={palette.primary} />
        </Pressable>)}
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
      </View>
      <MatchPreferencesEditor key={myGames.map((item) => `${item.game_id}:${item.platform_id}`).join("|")} userId={session.user.id} catalog={catalog} onGamesChanged={loadGames} />
    </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: theme.colors.background,
    paddingTop: 14,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  kicker: { color: theme.colors.cyan, fontWeight: "800", fontSize: 10, letterSpacing: 1 },
  headerTitle: { color: theme.colors.text, fontWeight: "800", fontSize: 22 },
  identity: { flexDirection: "row", gap: 13, alignItems: "center", marginHorizontal: 20, marginTop: 24 },
  identityCopy: { flex: 1 },
  name: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  handle: {
    color: theme.colors.textSoft,
    marginTop: 3,
  },
  card: {
    gap: 9,
    margin: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: {
    color: "#B5C0CE",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.text,
  },
  textarea: {
    minHeight: 100,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  gameRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  gameName: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  notice: {
    color: theme.colors.success,
    fontSize: 12,
  },
  button: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 13,
    backgroundColor: theme.colors.primary,
    marginTop: 8,
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "900",
  },
  disabled: { opacity: 0.6 },
});
