import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { chatName, getMessages, markRead, sendMessage, type Message } from "../lib/messages";
import { supabase } from "../lib/supabase";
import type { MessagesStackParamList } from "../navigation/AppNavigator";
import { theme } from "../theme/theme";
import { accentPalettes, useMobilePreferences } from "../lib/mobilePreferences";

type Props = NativeStackScreenProps<MessagesStackParamList, "Chat"> & { session: Session };

export function ChatScreen({ session, navigation, route }: Props) {
  const { preferences } = useMobilePreferences();
  const accent = accentPalettes[preferences.accent].primary;
  const { conversationId, profile } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<FlatList<Message>>(null);
  const request = useRef(0);
  const root = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const measureKeyboardOverlap = useCallback(() => {
    if (Platform.OS !== "android" || keyboardTop.current === null) return;
    root.current?.measureInWindow((_x, y, _width, height) => {
      const top = Keyboard.metrics()?.screenY ?? keyboardTop.current;
      if (top !== null) setKeyboardInset(Math.max(0, Math.ceil(y + height - top)));
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      requestAnimationFrame(measureKeyboardOverlap);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
      setKeyboardInset(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [measureKeyboardOverlap]);

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
    </View>
    {loading ? <ActivityIndicator style={styles.loading} color={accent} /> :
      <FlatList ref={list} data={messages} keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.thread, preferences.density === "compact" && styles.threadCompact]}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        onLayout={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.empty}>Dis bonjour à {chatName(profile)} !</Text>}
        renderItem={({ item }) => <View style={[styles.bubble, item.sender_id === session.user.id ? [styles.mine, { backgroundColor: accent }] : styles.theirs]}>
          <Text style={[styles.body, preferences.messageSize === "large" && styles.bodyLarge]}>{item.body}</Text>
          <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>}
      />}
    {!!error && <Pressable onPress={() => void load()} style={styles.errorBox}><Text style={styles.error}>{error}</Text></Pressable>}
    <View style={styles.composer}>
      <TextInput style={styles.input} placeholder="Écris un message..." placeholderTextColor={theme.colors.textMuted}
        value={draft} onChangeText={setDraft} onFocus={() => requestAnimationFrame(measureKeyboardOverlap)}
        multiline maxLength={4000} />
      <Pressable onPress={() => void send()} disabled={!draft.trim() || sending}
        accessibilityLabel="Envoyer le message" style={[styles.send, { backgroundColor: accent }, (!draft.trim() || sending) && styles.disabled]}>
        <Ionicons name="send" size={19} color="#FFFFFF" />
      </Pressable>
    </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: { height: 64, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface },
  back: { padding: 8 },
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
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 18, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border },
  input: { flex: 1, minHeight: 42, maxHeight: 125, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: theme.colors.surfaceHover, color: theme.colors.text, fontSize: 14 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary },
  disabled: { opacity: 0.5 },
});
