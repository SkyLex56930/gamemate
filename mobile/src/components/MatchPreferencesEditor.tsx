import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAccentPalette } from "../lib/mobilePreferences";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type Game = { id: number; game_id: number; platform_id: number | null; is_primary: boolean;
  rank_text: string | null; role_text: string | null; mode_text: string | null;
  mic_enabled: boolean; crossplay_enabled: boolean };
type Option = { id: number; label: string };
type Slot = { day_of_week: number; start_time: string; end_time: string; timezone: string };
const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function MatchPreferencesEditor({ userId, catalog, onGamesChanged }: {
  userId: string; catalog: { id: number; name: string }[]; onGamesChanged: () => Promise<void>;
}) {
  const palette = useAccentPalette();
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Option[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dnaOptions, setDnaOptions] = useState<Option[]>([]);
  const [intentOptions, setIntentOptions] = useState<Option[]>([]);
  const [dna, setDna] = useState<number[]>([]);
  const [intents, setIntents] = useState<number[]>([]);
  const [initialDna, setInitialDna] = useState<number[]>([]);
  const [initialIntents, setInitialIntents] = useState<number[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("23:00");
  const [timezone, setTimezone] = useState("Etc/UTC");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [gameRes, platformRes, tagRes, intentRes, ownTagRes, ownIntentRes, slotRes] = await Promise.all([
      supabase.from("user_games").select("id,game_id,platform_id,is_primary,rank_text,role_text,mode_text,mic_enabled,crossplay_enabled").eq("user_id", userId),
      supabase.from("platforms").select("id,name").order("name"),
      supabase.from("gaming_dna_tags").select("id,label,category").order("category"),
      supabase.from("looking_for_options").select("id,label").order("label"),
      supabase.from("user_gaming_dna").select("tag_id").eq("user_id", userId),
      supabase.from("user_looking_for").select("option_id").eq("user_id", userId),
      supabase.from("user_availability").select("day_of_week,start_time,end_time,timezone").eq("user_id", userId),
    ]);
    const failure = [gameRes, platformRes, tagRes, intentRes, ownTagRes, ownIntentRes, slotRes].find((result) => result.error);
    if (failure?.error) { setError("Impossible de charger les préférences de recherche."); setLoading(false); return; }
    const loadedGames = (gameRes.data ?? []) as Game[];
    setGames(loadedGames);
    setSelectedId((current) => loadedGames.some((row) => row.id === current) ? current : loadedGames[0]?.id ?? null);
    setPlatforms((platformRes.data ?? []).map((row) => ({ id: Number(row.id), label: row.name })));
    setDnaOptions((tagRes.data ?? []).map((row) => ({ id: Number(row.id), label: row.label })));
    setIntentOptions((intentRes.data ?? []).map((row) => ({ id: Number(row.id), label: row.label })));
    const tagIds = (ownTagRes.data ?? []).map((row) => Number(row.tag_id));
    const intentIds = (ownIntentRes.data ?? []).map((row) => Number(row.option_id));
    setDna(tagIds); setInitialDna(tagIds); setIntents(intentIds); setInitialIntents(intentIds);
    const loadedSlots = (slotRes.data ?? []) as Slot[];
    setSlots(loadedSlots); setDays(loadedSlots.map((row) => row.day_of_week));
    if (loadedSlots.length) {
      setStart(loadedSlots[0].start_time.slice(0, 5)); setEnd(loadedSlots[0].end_time.slice(0, 5));
      setTimezone(loadedSlots[0].timezone || "Etc/UTC");
    } else {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC");
    }
    setError(""); setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selected = games.find((game) => game.id === selectedId);
  function editGame(values: Partial<Game>) {
    setGames((current) => current.map((game) => game.id === selectedId ? { ...game, ...values } : game));
  }
  function toggle(id: number, current: number[], set: (value: number[]) => void) {
    set(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }
  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); }
    catch (cause) { console.error("Préférences matching :", cause); setError("Enregistrement impossible. Réessaie."); }
    finally { setBusy(false); }
  }
  async function saveGame() {
    if (!selected) return;
    await run(async () => {
      const { error: updateError } = await supabase.from("user_games").update({
        platform_id: selected.platform_id, rank_text: selected.rank_text?.trim() || null,
        role_text: selected.role_text?.trim() || null, mode_text: selected.mode_text?.trim() || null,
        mic_enabled: selected.mic_enabled, crossplay_enabled: selected.crossplay_enabled,
      }).eq("id", selected.id).eq("user_id", userId);
      if (updateError) throw updateError;
      await onGamesChanged();
    }, "Préférences de jeu enregistrées.");
  }
  async function saveTraits() {
    if (dna.length > 8) { setError("Choisis au maximum 8 traits."); return; }
    await run(async () => {
      const addDna = dna.filter((id) => !initialDna.includes(id));
      const removeDna = initialDna.filter((id) => !dna.includes(id));
      const addIntents = intents.filter((id) => !initialIntents.includes(id));
      const removeIntents = initialIntents.filter((id) => !intents.includes(id));
      if (addDna.length) { const { error } = await supabase.from("user_gaming_dna").insert(addDna.map((tag_id) => ({ user_id: userId, tag_id }))); if (error) throw error; }
      if (removeDna.length) { const { error } = await supabase.from("user_gaming_dna").delete().eq("user_id", userId).in("tag_id", removeDna); if (error) throw error; }
      if (addIntents.length) { const { error } = await supabase.from("user_looking_for").insert(addIntents.map((option_id) => ({ user_id: userId, option_id }))); if (error) throw error; }
      if (removeIntents.length) { const { error } = await supabase.from("user_looking_for").delete().eq("user_id", userId).in("option_id", removeIntents); if (error) throw error; }
      setInitialDna([...dna]); setInitialIntents([...intents]);
    }, "Style de jeu et attentes enregistrés.");
  }
  async function saveSlots() {
    const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!clock.test(start) || !clock.test(end) || (days.length > 0 && start >= end)) {
      setError("Saisis des heures valides (HH:MM), avec une fin après le début."); return;
    }
    await run(async () => {
      const oldDays = new Set(slots.map((slot) => slot.day_of_week));
      for (const day of days) {
        const values = { start_time: start, end_time: end, timezone };
        const { error } = oldDays.has(day)
          ? await supabase.from("user_availability").update(values).eq("user_id", userId).eq("day_of_week", day)
          : await supabase.from("user_availability").insert({ ...values, user_id: userId, day_of_week: day });
        if (error) throw error;
      }
      const removed = slots.map((slot) => slot.day_of_week).filter((day) => !days.includes(day));
      if (removed.length) {
        const { error } = await supabase.from("user_availability").delete().eq("user_id", userId).in("day_of_week", removed);
        if (error) throw error;
      }
      setSlots(days.map((day_of_week) => ({ day_of_week, start_time: start, end_time: end, timezone })));
    }, "Disponibilités enregistrées.");
  }

  if (loading) return <ActivityIndicator color={palette.primary} style={styles.loader} />;
  return <View style={styles.wrap}>
    <View style={styles.card}>
      <Text style={styles.title}>Mon profil de jeu</Text>
      <Text style={styles.hint}>Ces informations servent au calcul du pourcentage de compatibilité.</Text>
      {!games.length && <Text style={styles.hint}>Ajoute d’abord un jeu ci-dessus.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {games.map((game) => <Chip key={game.id} label={catalog.find((item) => item.id === game.game_id)?.name || "Jeu"}
          active={game.id === selectedId} color={palette.primary} onPress={() => { setSelectedId(game.id); setNotice(""); }} />)}
      </ScrollView>
      {selected && <>
        <Text style={styles.label}>Plateforme</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          <Chip label="Toutes" active={selected.platform_id === null} color={palette.primary} onPress={() => editGame({ platform_id: null })} />
          {platforms.map((platform) => <Chip key={platform.id} label={platform.label} active={selected.platform_id === platform.id}
            color={palette.primary} onPress={() => editGame({ platform_id: platform.id })} />)}
        </ScrollView>
        <Text style={styles.label}>Rang</Text><TextInput style={styles.input} value={selected.rank_text ?? ""} onChangeText={(rank_text) => editGame({ rank_text })} placeholder="Ex. Diamant" placeholderTextColor={theme.colors.textMuted} maxLength={60} />
        <Text style={styles.label}>Rôle</Text><TextInput style={styles.input} value={selected.role_text ?? ""} onChangeText={(role_text) => editGame({ role_text })} placeholder="Ex. Support" placeholderTextColor={theme.colors.textMuted} maxLength={60} />
        <Text style={styles.label}>Mode préféré</Text><TextInput style={styles.input} value={selected.mode_text ?? ""} onChangeText={(mode_text) => editGame({ mode_text })} placeholder="Ex. Classé" placeholderTextColor={theme.colors.textMuted} maxLength={60} />
        <Toggle label="J’utilise un micro" value={selected.mic_enabled} onChange={(mic_enabled) => editGame({ mic_enabled })} color={palette.primary} />
        <Toggle label="Crossplay accepté" value={selected.crossplay_enabled} onChange={(crossplay_enabled) => editGame({ crossplay_enabled })} color={palette.primary} />
        <Button label="Enregistrer ce jeu" busy={busy} color={palette.primary} onPress={() => void saveGame()} />
      </>}
    </View>
    <View style={styles.card}>
      <Text style={styles.title}>Style de jeu et attentes</Text>
      <Text style={styles.hint}>Choisis jusqu’à 8 traits qui te représentent.</Text>
      <View style={styles.chips}>{dnaOptions.map((item) => <Chip key={item.id} label={item.label} active={dna.includes(item.id)} color={palette.primary}
        onPress={() => toggle(item.id, dna, setDna)} />)}</View>
      <Text style={styles.label}>Je cherche…</Text>
      <View style={styles.chips}>{intentOptions.map((item) => <Chip key={item.id} label={item.label} active={intents.includes(item.id)} color={palette.primary}
        onPress={() => toggle(item.id, intents, setIntents)} />)}</View>
      <Button label="Enregistrer mes préférences" busy={busy} color={palette.primary} onPress={() => void saveTraits()} />
    </View>
    <View style={styles.card}>
      <Text style={styles.title}>Mes disponibilités</Text>
      <Text style={styles.hint}>Sélectionne les jours, puis un créneau dans ton fuseau horaire ({timezone}).</Text>
      <View style={styles.chips}>{dayNames.map((name, day) => <Chip key={day} label={name} active={days.includes(day)} color={palette.primary}
        onPress={() => toggle(day, days, setDays)} />)}</View>
      <View style={styles.row}><View style={styles.half}><Text style={styles.label}>Début</Text><TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="18:00" keyboardType="numbers-and-punctuation" maxLength={5} /></View>
        <View style={styles.half}><Text style={styles.label}>Fin</Text><TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="23:00" keyboardType="numbers-and-punctuation" maxLength={5} /></View></View>
      <Button label="Enregistrer mes disponibilités" busy={busy} color={palette.primary} onPress={() => void saveSlots()} />
    </View>
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!!notice && <Text style={styles.notice}>{notice}</Text>}
  </View>;
}

function Chip({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}><Text style={styles.chipText}>{label}</Text></Pressable>;
}
function Toggle({ label, value, onChange, color }: { label: string; value: boolean; onChange: (value: boolean) => void; color: string }) {
  return <View style={styles.toggle}><Text style={styles.label}>{label}</Text><Switch value={value} onValueChange={onChange}
    trackColor={{ false: theme.colors.border, true: color }} thumbColor="#FFF" accessibilityLabel={label} /></View>;
}
function Button({ label, busy, color, onPress }: { label: string; busy: boolean; color: string; onPress: () => void }) {
  return <Pressable disabled={busy} onPress={onPress} style={[styles.button, { backgroundColor: color }, busy && styles.disabled]}>
    <Text style={styles.buttonText}>{busy ? "Enregistrement…" : label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  wrap: { gap: 14, paddingHorizontal: 20, paddingBottom: 20 },
  loader: { marginVertical: 28 },
  card: { padding: 16, borderRadius: 18, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, gap: 10 },
  title: { color: theme.colors.text, fontSize: 19, fontWeight: "800" },
  hint: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 18 },
  label: { color: theme.colors.textSoft, fontSize: 12, fontWeight: "800" },
  row: { flexDirection: "row", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 39, justifyContent: "center", paddingHorizontal: 11, borderRadius: 10,
    borderColor: theme.colors.border, borderWidth: 1, backgroundColor: theme.colors.surfaceSoft },
  chipText: { color: theme.colors.text, fontWeight: "700", fontSize: 11 },
  input: { minHeight: 47, paddingHorizontal: 12, borderRadius: 11, backgroundColor: theme.colors.surfaceSoft, color: theme.colors.text },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  half: { flex: 1, gap: 5 },
  button: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  buttonText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  error: { color: theme.colors.danger, fontSize: 12 },
  notice: { color: theme.colors.success, fontSize: 12 },
});
