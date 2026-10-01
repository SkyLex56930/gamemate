import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus,
  useAudioRecorder, useAudioRecorderState } from "expo-audio";
import type { Session } from "@supabase/supabase-js";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { chatName, formatVoiceDuration, getMessages, markRead, MAX_VOICE_DURATION_SECONDS,
  parseVoiceMessage, sendMessage, VOICE_MESSAGE_BUCKET, VOICE_MESSAGE_MARKER,
  type Message, type VoiceMessagePayload } from "../lib/messages";
import { supabase } from "../lib/supabase";
import type { MessagesStackParamList } from "../navigation/AppNavigator";
import { theme } from "../theme/theme";
import { accentPalettes, useMobilePreferences } from "../lib/mobilePreferences";
import { useAndroidKeyboardOverlap } from "../lib/useAndroidKeyboardOverlap";
import { useDirectCalls } from "../lib/directCalls";

type Props = NativeStackScreenProps<MessagesStackParamList, "Chat"> & { session: Session };

export function ChatScreen({ session, navigation, route }: Props) {
  const { preferences } = useMobilePreferences();
  const accent = accentPalettes[preferences.accent].primary;
  const { conversationId, profile } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<FlatList<Message>>(null);
  const request = useRef(0);
  const { root, keyboardInset, measureKeyboardOverlap } = useAndroidKeyboardOverlap();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const { startCall, busy: callBusy } = useDirectCalls();

  const load = useCallback(async () => {
    const currentRequest = ++request.current;
    try {
      const rows = await getMessages(conversationId);
      if (currentRequest !== request.current) return;
      setMessages(rows);
      setError("");
      if (rows.some((row) => row.sender_id !== session.user.id && !row.read_at)) {
        await markRead(conversationId);
      }
    } catch (cause) {
      console.error("Messages / chat:", cause);
      if (currentRequest === request.current) setError("Impossible de charger cette conversation.");
    } finally {
      if (currentRequest === request.current) setLoading(false);
    }
  }, [conversationId, session.user.id]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    const channel = supabase.channel(`mobile-chat-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}`,
      }, () => void load())
      .subscribe();
    const activeRequest = request;
    return () => { active = false; activeRequest.current++; void supabase.removeChannel(channel); };
  }, [conversationId, load]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await sendMessage(conversationId, body);
      setDraft("");
      await load();
    } catch (cause) {
      console.error("Messages / send:", cause);
      const message = cause instanceof Error ? cause.message : "";
      setError(message.includes("messaging_muted") ? "Tu ne peux pas envoyer de messages pendant ton mute."
        : message.includes("account_restricted") ? "Ton compte ne peut pas envoyer de messages actuellement."
        : message.includes("conversation_blocked") ? "Impossible d'envoyer le message : cette conversation est bloquée."
        : "Envoi impossible. Réessaie.");
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    if (sendingVoice || recorderState.isRecording) return;
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone", "Autorise GameMate à utiliser le micro pour envoyer un message vocal.");
      return;
    }
    try {
      setError("");
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_VOICE_DURATION_SECONDS });
    } catch (cause) {
      console.error("Messages / enregistrement mobile :", cause);
      setError("Impossible de démarrer l’enregistrement vocal.");
    }
  }

  async function stopRecording(send = true) {
    if (!recorderState.isRecording) return;
    const duration = Math.max(1, Math.round(recorderState.durationMillis / 1000));
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (!send || !recorder.uri) return;
    if (duration < 1) { setError("Le message vocal est trop court."); return; }
    setSendingVoice(true);
    try {
      const response = await fetch(recorder.uri);
      const audio = await response.arrayBuffer();
      const path = `${conversationId}/${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`;
      const { error: uploadError } = await supabase.storage.from(VOICE_MESSAGE_BUCKET)
        .upload(path, audio, { contentType: "audio/mp4", cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const payload: VoiceMessagePayload = { version: 1, path,
        duration: Math.min(MAX_VOICE_DURATION_SECONDS, duration), mime: "audio/mp4" };
      try {
        await sendMessage(conversationId, `🎙️ Message vocal${VOICE_MESSAGE_MARKER}${JSON.stringify(payload)}`);
      } catch (sendError) {
        await supabase.storage.from(VOICE_MESSAGE_BUCKET).remove([path]);
        throw sendError;
      }
      await load();
    } catch (cause) {
      console.error("Messages / vocal mobile :", cause);
      setError("Le message vocal n’a pas pu être envoyé.");
    } finally { setSendingVoice(false); }
  }

  return <View ref={root} style={styles.root} onLayout={measureKeyboardOverlap}>
    <SafeAreaView style={[styles.root, Platform.OS === "android" && { paddingBottom: keyboardInset }]} edges={["bottom"]}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Retour aux conversations" style={styles.back}>
        <Ionicons name="arrow-back" size={23} color={theme.colors.text} />
      </Pressable>
      <Avatar name={chatName(profile)} size={39} />
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>{chatName(profile)}</Text>
        {!!profile.username && <Text style={styles.handle}>@{profile.username}</Text>}
      </View>
      <Pressable disabled={callBusy} onPress={() => void startCall(profile.id)} accessibilityLabel={`Appeler ${chatName(profile)}`}
        style={[styles.headerAction, callBusy && styles.disabled]}>
        <Ionicons name="call-outline" size={20} color={theme.colors.cyan} />
      </Pressable>
    </View>
    {loading ? <ActivityIndicator style={styles.loading} color={accent} /> :
      <FlatList ref={list} data={messages} keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.thread, preferences.density === "compact" && styles.threadCompact]}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        onLayout={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.empty}>Dis bonjour à {chatName(profile)} !</Text>}
        renderItem={({ item }) => <View style={[styles.bubble, item.sender_id === session.user.id ? [styles.mine, { backgroundColor: accent }] : styles.theirs]}>
          {parseVoiceMessage(item.body) ? <VoiceMessagePlayer payload={parseVoiceMessage(item.body)!} mine={item.sender_id === session.user.id} />
            : <Text style={[styles.body, preferences.messageSize === "large" && styles.bodyLarge]}>{item.body}</Text>}
          <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>}
      />}
    {!!error && <Pressable onPress={() => void load()} style={styles.errorBox}><Text style={styles.error}>{error}</Text></Pressable>}
    {recorderState.isRecording ? <View style={styles.recordingBar}>
      <Pressable onPress={() => void stopRecording(false)} style={styles.recordAction} accessibilityLabel="Annuler le vocal">
        <Ionicons name="trash-outline" size={21} color={theme.colors.textSoft} /></Pressable>
      <View style={styles.recordDot} /><Text style={styles.recordTime}>{formatVoiceDuration(recorderState.durationMillis / 1000)}</Text>
      <View style={styles.wave}>{Array.from({ length: 13 }, (_, index) => <View key={index} style={[styles.waveBar, { height: 7 + ((index * 7) % 18) }]} />)}</View>
      <Pressable onPress={() => void stopRecording(true)} style={[styles.recordAction, styles.stopAction]} accessibilityLabel="Envoyer le vocal">
        <Ionicons name="send" size={19} color="#FFF" /></Pressable>
    </View> : <View style={styles.composer}>
      <Pressable onPress={() => void startRecording()} disabled={sendingVoice || sending} style={styles.mic} accessibilityLabel="Enregistrer un message vocal">
        {sendingVoice ? <ActivityIndicator size="small" color={theme.colors.cyan} /> : <Ionicons name="mic-outline" size={21} color={theme.colors.cyan} />}
      </Pressable>
      <TextInput style={styles.input} placeholder={sendingVoice ? "Envoi du vocal…" : "Écris un message..."} placeholderTextColor={theme.colors.textMuted}
        value={draft} onChangeText={setDraft} onFocus={() => requestAnimationFrame(measureKeyboardOverlap)}
        multiline maxLength={4000} editable={!sendingVoice} />
      <Pressable onPress={() => void send()} disabled={!draft.trim() || sending || sendingVoice}
        accessibilityLabel="Envoyer le message" style={[styles.send, { backgroundColor: accent }, (!draft.trim() || sending || sendingVoice) && styles.disabled]}>
        <Ionicons name="send" size={19} color="#FFFFFF" />
      </Pressable>
    </View>}
    </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}

function VoiceMessagePlayer({ payload, mine }: { payload: VoiceMessagePayload; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const player = useAudioPlayer(url, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    let active = true;
    void supabase.storage.from(VOICE_MESSAGE_BUCKET).createSignedUrl(payload.path, 3600).then(({ data, error }) => {
      if (!active) return;
      if (error || !data?.signedUrl) setFailed(true); else setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [payload.path]);
  const progress = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;
  return <Pressable disabled={!url || failed} onPress={() => {
    if (status.playing) player.pause(); else { if (status.didJustFinish) void player.seekTo(0); player.play(); }
  }} style={styles.voiceMessage} accessibilityLabel={status.playing ? "Mettre le vocal en pause" : "Lire le message vocal"}>
    <View style={[styles.voicePlay, mine && styles.voicePlayMine]}><Ionicons name={status.playing ? "pause" : "play"} size={16} color="#FFF" /></View>
    <View style={styles.voiceWave}>{Array.from({ length: 15 }, (_, index) => <View key={index}
      style={[styles.voiceWaveBar, index / 15 <= progress && styles.voiceWaveProgress,
        { height: 6 + ((index * 11) % 16) }]} />)}</View>
    <Text style={styles.voiceDuration}>{failed ? "Erreur" : formatVoiceDuration(status.duration || payload.duration)}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: { height: 64, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface },
  back: { padding: 8 },
  headerAction: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(32,220,255,0.10)" },
  identity: { flex: 1 },
  name: { fontWeight: "700", fontSize: 16, color: theme.colors.text },
  handle: { fontSize: 11, color: theme.colors.textSoft },
  loading: { flex: 1 },
  thread: { flexGrow: 1, justifyContent: "flex-end", padding: 14, gap: 8 },
  threadCompact: { gap: 4, paddingVertical: 8 },
  empty: { textAlign: "center", color: theme.colors.textSoft, marginBottom: 18 },
  bubble: { maxWidth: "83%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  mine: { alignSelf: "flex-end", backgroundColor: theme.colors.primary, borderBottomRightRadius: 5 },
  theirs: { alignSelf: "flex-start", backgroundColor: theme.colors.surfaceSoft, borderBottomLeftRadius: 5 },
  body: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  bodyLarge: { fontSize: 17, lineHeight: 25 },
  time: { color: "#D3D6F7", fontSize: 10, alignSelf: "flex-end", marginTop: 3 },
  errorBox: { padding: 8 },
  error: { color: theme.colors.danger, textAlign: "center" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 18, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border },
  mic: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(32,220,255,0.09)" },
  input: { flex: 1, minHeight: 42, maxHeight: 125, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: theme.colors.surfaceHover, color: theme.colors.text, fontSize: 14 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary },
  disabled: { opacity: 0.5 },
  recordingBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 18,
    borderTopWidth: 1, borderTopColor: "rgba(227,59,255,0.34)", backgroundColor: theme.colors.surface },
  recordAction: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceHover },
  stopAction: { backgroundColor: theme.colors.magenta },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.magenta },
  recordTime: { color: theme.colors.text, fontWeight: "900", fontVariant: ["tabular-nums"] },
  wave: { flex: 1, height: 30, flexDirection: "row", alignItems: "center", gap: 3 },
  waveBar: { flex: 1, maxWidth: 4, borderRadius: 3, backgroundColor: theme.colors.magenta },
  voiceMessage: { minWidth: 190, flexDirection: "row", alignItems: "center", gap: 8 },
  voicePlay: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary },
  voicePlayMine: { backgroundColor: "rgba(4,10,28,0.36)" },
  voiceWave: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2, height: 26 },
  voiceWaveBar: { width: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)" },
  voiceWaveProgress: { backgroundColor: theme.colors.cyan },
  voiceDuration: { color: "#E7ECFF", fontSize: 10, fontWeight: "700", minWidth: 30 },
});
