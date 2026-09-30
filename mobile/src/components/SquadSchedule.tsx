import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAccentPalette, useMobilePreferences } from "../lib/mobilePreferences";
import { syncSessionReminders } from "../lib/sessionReminders";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type Response = "going" | "maybe" | "declined";
type ScheduledSession = {
  session_id: string;
  title: string;
  mode: string;
  game_name: string | null;
  starts_at: string;
  duration_minutes: number;
  max_players: number;
  notes: string | null;
  going_count: number;
  maybe_count: number;
  my_response: Response | null;
};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function SquadSchedule({ squadId, userId, gameId, maxMembers, isOwner }: {
  squadId: string; userId: string; gameId: number | null; maxMembers: number; isOwner: boolean;
}) {
  const palette = useAccentPalette();
  const { preferences } = useMobilePreferences();
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 60 * 60_000));
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [duration, setDuration] = useState(120);
  const [players, setPlayers] = useState(() => Math.max(2, Math.min(12, maxMembers)));

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("get_my_scheduled_sessions_v12", {
      p_squad_id: squadId, p_limit: 30,
    });
    if (loadError) setError("Impossible de charger le planning.");
    else {
      setSessions((data ?? []) as ScheduledSession[]);
      setError("");
      void syncSessionReminders(userId, preferences.sessionReminderMinutes);
    }
    setLoading(false);
  }, [squadId, userId, preferences.sessionReminderMinutes]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const channel = supabase.channel(`mobile-planning:${squadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_sessions", filter: `squad_id=eq.${squadId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_session_responses", filter: `squad_id=eq.${squadId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [squadId, load]);

  const days = useMemo(() => Array.from({ length: 30 }, (_, offset) => {
    const next = new Date();
    next.setHours(12, 0, 0, 0);
    next.setDate(next.getDate() + offset);
    return next;
  }), []);
  const shown = selectedDay ? sessions.filter((item) => dayKey(new Date(item.starts_at)) === selectedDay) : sessions;

  async function respond(sessionId: string, response: Response) {
    setBusy(sessionId);
    const { error: responseError } = await supabase.rpc("respond_scheduled_session_v12", {
      p_session_id: sessionId, p_response: response,
    });
    if (responseError) setError("Réponse impossible. Réessaie.");
    else await load();
    setBusy(null);
  }

  async function create() {
    if (title.trim().length < 3 || !mode.trim()) {
      setError("Ajoute un titre et un mode de jeu.");
      return;
    }
    const startsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
    if (startsAt.getTime() <= Date.now() + 5 * 60_000) {
      setError("Choisis un horaire à au moins cinq minutes dans le futur.");
      return;
    }
    setBusy("create");
    const { error: createError } = await supabase.rpc("create_scheduled_session_v12", {
      p_squad_id: squadId,
      p_game_id: gameId,
      p_title: title.trim(), p_mode: mode.trim(), p_server_region: null,
      p_starts_at: startsAt.toISOString(), p_duration_minutes: duration,
      p_max_players: players, p_notes: notes.trim() || null,
    });
    if (createError) setError("Impossible de programmer la session. Vérifie la date et réessaie.");
    else {
      setFormOpen(false);
      setTitle(""); setMode(""); setNotes("");
      setSelectedDay(dayKey(startsAt));
      await load();
    }
    setBusy(null);
  }

  function cancel(item: ScheduledSession) {
    Alert.alert("Annuler cette session ?", item.title, [
      { text: "Garder", style: "cancel" },
      { text: "Annuler la session", style: "destructive", onPress: () => { void (async () => {
        setBusy(item.session_id);
        const { error: cancelError } = await supabase.rpc("cancel_scheduled_session_v12", { p_session_id: item.session_id });
        if (cancelError) setError("Impossible d’annuler cette session.");
        else await load();
        setBusy(null);
      })(); } },
    ]);
  }

  return <View style={styles.root}>
    <View style={styles.heading}>
      <View style={styles.headingCopy}><Text style={styles.title}>Planning</Text><Text style={styles.muted}>Les prochaines parties de ta squad.</Text></View>
      {isOwner && <Pressable accessibilityRole="button" accessibilityLabel="Programmer une session" onPress={() => { setError(""); setFormOpen((value) => !value); }}
        style={[styles.add, { backgroundColor: palette.primary }]}><Ionicons name={formOpen ? "close" : "add"} size={22} color="#FFF" /></Pressable>}
    </View>
    {preferences.sessionReminderMinutes > 0 && <Text style={styles.muted}>Rappel {preferences.sessionReminderMinutes} min avant pour les joueurs présents ou peut-être (5 min si la partie est proche).</Text>}
    {!!error && <Pressable onPress={() => void load()}><Text style={styles.error}>{error}</Text></Pressable>}

    {formOpen && <View style={styles.card}>
      <Text style={styles.cardTitle}>Programmer une partie</Text>
      <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="Titre de la session" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
      <TextInput value={mode} onChangeText={setMode} maxLength={60} placeholder="Mode de jeu" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
      <Text style={styles.label}>Jour</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {days.map((day) => <Pressable key={dayKey(day)} onPress={() => setDate(day)} style={[styles.day, dayKey(date) === dayKey(day) && { borderColor: palette.primary, backgroundColor: palette.primary }]}>
          <Text style={styles.dayText}>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</Text>
          <Text style={styles.dayNumber}>{day.getDate()}</Text>
        </Pressable>)}
      </ScrollView>
      <View style={styles.steppers}>
        <Stepper label="Heure" value={String(hour).padStart(2, "0")} onMinus={() => setHour((value) => (value + 23) % 24)} onPlus={() => setHour((value) => (value + 1) % 24)} />
        <Stepper label="Minutes" value={String(minute).padStart(2, "0")} onMinus={() => setMinute((value) => (value + 45) % 60)} onPlus={() => setMinute((value) => (value + 15) % 60)} />
      </View>
      <View style={styles.steppers}>
        <Stepper label="Durée (min)" value={String(duration)} onMinus={() => setDuration((value) => Math.max(30, value - 30))} onPlus={() => setDuration((value) => Math.min(480, value + 30))} />
        <Stepper label="Joueurs" value={String(players)} onMinus={() => setPlayers((value) => Math.max(2, value - 1))} onPlus={() => setPlayers((value) => Math.min(12, value + 1))} />
      </View>
      <TextInput value={notes} onChangeText={setNotes} maxLength={500} placeholder="Notes pour la squad (facultatif)" placeholderTextColor={theme.colors.textMuted} multiline style={[styles.input, styles.notes]} />
      <Pressable disabled={!!busy} onPress={() => void create()} style={[styles.submit, { backgroundColor: palette.primary }, !!busy && styles.disabled]}>
        <Text style={styles.submitText}>{busy === "create" ? "Programmation…" : "Programmer la session"}</Text>
      </Pressable>
    </View>}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
      <Pressable onPress={() => setSelectedDay(null)} style={[styles.day, !selectedDay && { borderColor: palette.primary }]}><Text style={styles.dayText}>Toutes</Text><Ionicons name="calendar-outline" size={18} color="#FFF" /></Pressable>
      {days.slice(0, 14).map((day) => <Pressable key={dayKey(day)} onPress={() => setSelectedDay(dayKey(day))} style={[styles.day, selectedDay === dayKey(day) && { borderColor: palette.primary, backgroundColor: palette.primary }]}>
        <Text style={styles.dayText}>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</Text>
        <Text style={styles.dayNumber}>{day.getDate()}</Text>
        {sessions.some((item) => dayKey(new Date(item.starts_at)) === dayKey(day)) && <View style={styles.dot} />}
      </Pressable>)}
    </ScrollView>

    {loading ? <ActivityIndicator color={palette.primary} /> : shown.length === 0 ? <Text style={styles.empty}>Aucune session prévue pour cette période.</Text> : shown.map((item) => <View key={item.session_id} style={styles.card}>
      <Text style={[styles.dateLabel, { color: palette.secondary }]}>{new Date(item.starts_at).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</Text>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.muted}>{item.game_name || "Jeu à définir"} · {item.mode} · {item.duration_minutes} min</Text>
      {!!item.notes && <Text style={styles.muted}>{item.notes}</Text>}
      <Text style={styles.muted}>{item.going_count} présent{item.going_count > 1 ? "s" : ""} · {item.maybe_count} peut-être · {item.max_players} places</Text>
      <View style={styles.responses}>
        {(["going", "maybe", "declined"] as const).map((response) => <Pressable key={response} disabled={!!busy} onPress={() => void respond(item.session_id, response)}
          style={[styles.response, item.my_response === response && { borderColor: palette.primary, backgroundColor: palette.primary }]}>
          <Text style={styles.responseText}>{response === "going" ? "Présent" : response === "maybe" ? "Peut-être" : "Absent"}</Text>
        </Pressable>)}
      </View>
      {isOwner && <Pressable onPress={() => cancel(item)} disabled={!!busy}><Text style={styles.cancel}>Annuler la session</Text></Pressable>}
    </View>)}
  </View>;
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return <View style={styles.stepper}><Text style={styles.label}>{label}</Text><View style={styles.stepperControls}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Diminuer ${label}`} onPress={onMinus} style={styles.stepperButton}><Text style={styles.stepperText}>−</Text></Pressable>
    <Text style={styles.stepperValue}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Augmenter ${label}`} onPress={onPlus} style={styles.stepperButton}><Text style={styles.stepperText}>+</Text></Pressable>
  </View></View>;
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headingCopy: { flex: 1 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "900" },
  muted: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 18 },
  add: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  error: { color: theme.colors.danger, fontSize: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 11 },
  cardTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "800" },
  dateLabel: { fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 13, backgroundColor: theme.colors.surfaceSoft, color: theme.colors.text },
  notes: { minHeight: 72, textAlignVertical: "top", paddingTop: 12 },
  label: { color: theme.colors.textSoft, fontSize: 11, fontWeight: "800" },
  days: { gap: 8, paddingVertical: 3 },
  day: { minWidth: 60, height: 65, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 2 },
  dayText: { color: theme.colors.textSoft, fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  dayNumber: { color: theme.colors.text, fontSize: 19, fontWeight: "900" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.cyan },
  steppers: { flexDirection: "row", gap: 10 },
  stepper: { flex: 1, gap: 5 },
  stepperControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.colors.surfaceSoft, borderRadius: 11 },
  stepperButton: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  stepperText: { color: theme.colors.text, fontSize: 22 },
  stepperValue: { color: theme.colors.text, fontWeight: "800", fontSize: 15 },
  submit: { minHeight: 47, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  submitText: { color: "#FFF", fontWeight: "800" },
  disabled: { opacity: 0.5 },
  empty: { color: theme.colors.textSoft, textAlign: "center", padding: 28 },
  responses: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  response: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.border },
  responseText: { color: theme.colors.text, fontSize: 11, fontWeight: "700" },
  cancel: { color: theme.colors.danger, fontSize: 12, marginTop: 3 },
});
