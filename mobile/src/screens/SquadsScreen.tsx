import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { SquadSchedule } from "../components/SquadSchedule";
import { useAccentPalette } from "../lib/mobilePreferences";
import { supabase } from "../lib/supabase";
import { useAndroidKeyboardOverlap } from "../lib/useAndroidKeyboardOverlap";
import { useSquadVoice } from "../lib/useSquadVoice";
import { theme } from "../theme/theme";

type Game = { id: number; name: string };
type Member = { user_id: string; display_name: string | null; username: string | null; role: "owner" | "member" };
type Channel = { id: string; name: string; channel_type: "text" | "voice"; is_default: boolean };
type SquadMessage = { id: string; channel_id: string; sender_id: string; sender_display_name: string | null; sender_username: string | null; body: string; created_at: string };
type Squad = { squad_id: string; owner_id: string; name: string; description: string | null; game_id: number | null; game_name: string | null; max_members: number; members: Member[]; channels: Channel[]; messages: SquadMessage[] };
type Invite = { invite_id: string; squad_name: string; sender_display_name: string | null; sender_username: string | null; game_name: string | null };
type OutgoingInvite = { invite_id: string; recipient_id: string };
type SquadState = { active_squad: Squad | null; incoming_invites: Invite[]; outgoing_invites: OutgoingInvite[] };
type Friend = { id: string; display_name: string | null; username: string | null };
type VoicePresence = { user_id: string; display_name: string; muted: boolean; deafened: boolean };
const EMPTY: SquadState = { active_squad: null, incoming_invites: [], outgoing_invites: [] };

export function SquadsScreen({ session, openTab, reminderRequestId }: { session: Session; openTab?: "planning"; reminderRequestId?: number }) {
  const palette = useAccentPalette();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const { root, keyboardInset, measureKeyboardOverlap } = useAndroidKeyboardOverlap();
  const voice = useSquadVoice(session.user.id);
  const [state, setState] = useState<SquadState>(EMPTY);
  const [games, setGames] = useState<Game[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [tab, setTab] = useState<"overview" | "planning" | "chat">("overview");
  useEffect(() => {
    if (openTab !== "planning") return;
    const timer = setTimeout(() => setTab("planning"), 0);
    return () => clearTimeout(timer);
  }, [openTab, reminderRequestId]);
  const [name, setName] = useState("");
  const [gameId, setGameId] = useState<number | null>(null);
  const [maxMembers, setMaxMembers] = useState(6);
  const [channelId, setChannelId] = useState("");
  const [draft, setDraft] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState("");
  const [editingSquad, setEditingSquad] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGameId, setEditGameId] = useState<number | null>(null);
  const [editMax, setEditMax] = useState(6);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceSnapshot, setVoiceSnapshot] = useState<{ channelId: string; people: VoicePresence[]; error: boolean }>({ channelId: "", people: [], error: false });

  const load = useCallback(async () => {
    const [squadResult, gamesResult, friendshipsResult] = await Promise.all([
      supabase.rpc("get_my_squad_state"),
      supabase.from("games").select("id,name").eq("is_active", true).order("name"),
      supabase.from("friendships").select("requester_id,addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`),
    ]);
    if (squadResult.error) {
      setError("Impossible de charger ta squad. Appuie pour réessayer.");
      setLoading(false);
      return;
    }
    const next = (squadResult.data ?? EMPTY) as SquadState;
    setState({ active_squad: next.active_squad, incoming_invites: next.incoming_invites ?? [], outgoing_invites: next.outgoing_invites ?? [] });
    setChannelId((current) => next.active_squad?.channels?.some((item) => item.id === current)
      ? current : next.active_squad?.channels?.find((item) => item.is_default && item.channel_type === "text")?.id
        ?? next.active_squad?.channels?.find((item) => item.channel_type === "text")?.id
        ?? next.active_squad?.channels?.[0]?.id ?? "");
    if (!gamesResult.error) setGames((gamesResult.data ?? []) as Game[]);
    if (!friendshipsResult.error) {
      const ids = (friendshipsResult.data ?? []).map((row) => row.requester_id === session.user.id ? row.addressee_id : row.requester_id);
      if (ids.length) {
        const { data, error: friendsError } = await supabase.from("profiles").select("id,display_name,username").in("id", ids);
        if (!friendsError) setFriends((data ?? []) as Friend[]);
      } else setFriends([]);
    }
    setError("");
    setLoading(false);
  }, [session.user.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const channel = supabase.channel(`mobile-squads:${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_members" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_invites" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_channels" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "squad_messages" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session.user.id, load]);
  useEffect(() => {
    if (tab === "chat" && keyboardInset > 0) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  }, [keyboardInset, tab]);

  async function perform(key: string, action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setBusy(key); setError(""); setNotice("");
    try {
      const result = await action();
      if (result.error) throw result.error;
      setNotice(success);
      await load();
      return true;
    } catch (cause) {
      console.error("Squad mobile:", cause);
      const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
      setError(message.includes("already_in_active_squad") ? "Tu fais déjà partie d’une autre squad."
        : message.includes("channel_limit_reached") ? "Une squad est limitée à 5 salons."
          : message.includes("channel_name_exists") ? "Un salon porte déjà ce nom."
            : message.includes("cannot_delete_default_channel") ? "Le salon Général ne peut pas être supprimé."
              : message.includes("max_members_below_current_count") ? "La limite ne peut pas être inférieure au nombre de membres."
                : message.includes("not_squad_owner") ? "Seul le chef peut modifier la squad."
                  : "Action impossible. Réessaie.");
      return false;
    } finally { setBusy(null); }
  }

  async function create() {
    if (!name.trim()) { setError("Donne un nom à ta squad."); return; }
    await perform("create", () => supabase.rpc("create_squad", {
      p_name: name.trim(), p_game_id: gameId, p_max_members: maxMembers,
    }), "Squad créée.");
  }

  function leave() {
    const squad = state.active_squad;
    if (!squad) return;
    const owner = squad.owner_id === session.user.id;
    Alert.alert(owner ? "Dissoudre la squad ?" : "Quitter la squad ?",
      owner ? "Tous les membres perdront cet espace." : "Tu pourras rejoindre une autre squad ensuite.", [
        { text: "Garder", style: "cancel" },
        { text: owner ? "Dissoudre" : "Quitter", style: "destructive", onPress: () => {
          if (voice.room?.squadId === squad.squad_id) voice.leave();
          void perform("leave", () => owner
            ? supabase.rpc("dissolve_squad", { p_squad_id: squad.squad_id })
            : supabase.rpc("leave_temp_squad", { p_squad_id: squad.squad_id }), owner ? "Squad dissoute." : "Tu as quitté la squad.");
        } },
      ]);
  }

  async function sendMessage() {
    const squad = state.active_squad;
    const body = draft.trim();
    if (!squad || !channelId || !body || squad.channels.find((item) => item.id === channelId)?.channel_type !== "text") return;
    const sent = await perform("message", () => supabase.rpc("send_squad_channel_message", {
      p_squad_id: squad.squad_id, p_channel_id: channelId, p_body: body,
    }), "Message envoyé.");
    if (sent) setDraft("");
  }

  function startEditingSquad() {
    const squad = state.active_squad;
    if (!squad || squad.owner_id !== session.user.id) return;
    setEditName(squad.name); setEditDescription(squad.description ?? "");
    setEditGameId(squad.game_id); setEditMax(squad.max_members);
    setEditingSquad(true);
  }

  async function saveSquad() {
    const squad = state.active_squad;
    if (!squad || squad.owner_id !== session.user.id) return;
    if (!editName.trim()) { setError("Donne un nom à la squad."); return; }
    const saved = await perform("settings", () => supabase.rpc("update_squad_settings_v2", {
      p_squad_id: squad.squad_id, p_name: editName.trim(), p_description: editDescription.trim() || null,
      p_game_id: editGameId, p_max_members: editMax,
    }), "Squad modifiée.");
    if (saved) setEditingSquad(false);
  }

  async function createChannel() {
    const squad = state.active_squad;
    if (!squad || squad.owner_id !== session.user.id || squad.channels.length >= 5 || !newChannelName.trim()) return;
    let createdId = "";
    const created = await perform("channel-create", async () => {
      const result = await supabase.rpc("create_team_channel_v2", {
        p_squad_id: squad.squad_id, p_name: newChannelName.trim(), p_type: newChannelType,
      });
      createdId = (result.data as { channel_id?: string } | null)?.channel_id ?? "";
      return result;
    }, "Salon créé.");
    if (created) {
      setNewChannelName(""); setNewChannelType("text"); setShowCreateChannel(false);
      if (createdId) setChannelId(createdId);
    }
  }

  async function renameChannel(channel: Channel) {
    const squad = state.active_squad;
    if (!squad || squad.owner_id !== session.user.id || !editingChannelName.trim()) return;
    const renamed = await perform(`channel-rename-${channel.id}`, () => supabase.rpc("rename_team_channel", {
      p_channel_id: channel.id, p_name: editingChannelName.trim(),
    }), "Salon renommé.");
    if (renamed) { setEditingChannelId(null); setEditingChannelName(""); }
  }

  function deleteChannel(channel: Channel) {
    const squad = state.active_squad;
    if (!squad || squad.owner_id !== session.user.id || channel.is_default) return;
    Alert.alert("Supprimer ce salon ?", `« ${channel.name} » et ses messages seront supprimés.`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => {
        if (voice.room?.channelId === channel.id) voice.leave();
        void perform(`channel-delete-${channel.id}`, () => supabase.rpc("delete_team_channel", { p_channel_id: channel.id }), "Salon supprimé.");
      } },
    ]);
  }

  const squad = state.active_squad;
  const owner = squad?.owner_id === session.user.id;
  const availableFriends = friends.filter((friend) => !squad?.members.some((member) => member.user_id === friend.id)
    && !state.outgoing_invites.some((invite) => invite.recipient_id === friend.id));
  const textChannels = squad?.channels?.filter((channel) => channel.channel_type === "text") ?? [];
  const voiceChannels = squad?.channels?.filter((channel) => channel.channel_type === "voice") ?? [];
  const selectedChannel = squad?.channels?.find((channel) => channel.id === channelId) ?? null;
  const selectedVoiceSquadId = squad?.squad_id;
  const activeVoiceHere = voice.room?.channelId === channelId && voice.status !== "idle";
  const voiceParticipants = activeVoiceHere ? voice.participants
    : tab === "chat" && selectedChannel?.channel_type === "voice" && voiceSnapshot.channelId === channelId ? voiceSnapshot.people : [];
  const voiceLoading = !activeVoiceHere && selectedChannel?.channel_type === "voice" && voiceSnapshot.channelId !== channelId;
  const voiceConnectionError = !activeVoiceHere && voiceSnapshot.channelId === channelId && voiceSnapshot.error;
  const messages = selectedChannel?.channel_type === "text"
    ? squad?.messages?.filter((message) => message.channel_id === channelId) ?? [] : [];

  useEffect(() => {
    if (tab !== "chat" || selectedChannel?.channel_type !== "voice" || !selectedVoiceSquadId || activeVoiceHere) return;
    let active = true;
    const voice = supabase.channel(`squad-voice:${selectedVoiceSquadId}:${selectedChannel.id}`, {
      config: { private: true, presence: { key: session.user.id }, broadcast: { self: false } },
    });
    voice.on("presence", { event: "sync" }, () => {
      if (!active) return;
      const presence = voice.presenceState() as unknown as Record<string, VoicePresence[]>;
      const people = new Map<string, VoicePresence>();
      for (const entries of Object.values(presence)) {
        for (const person of entries) if (person.user_id) people.set(person.user_id, person);
      }
      setVoiceSnapshot({ channelId: selectedChannel.id, people: [...people.values()], error: false });
    }).subscribe((status) => {
      if (active && status === "SUBSCRIBED") setVoiceSnapshot((current) => current.channelId === selectedChannel.id
        ? { ...current, error: false } : { channelId: selectedChannel.id, people: [], error: false });
      if (active && (status === "CHANNEL_ERROR" || status === "TIMED_OUT"))
        setVoiceSnapshot({ channelId: selectedChannel.id, people: [], error: true });
    });
    return () => { active = false; void supabase.removeChannel(voice); };
  }, [tab, selectedChannel?.id, selectedChannel?.channel_type, selectedVoiceSquadId, session.user.id, activeVoiceHere]);

  return <View ref={root} style={styles.root} onLayout={measureKeyboardOverlap}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 105 + keyboardInset }]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: palette.secondary }]}>SOCIAL · EN ÉQUIPE</Text>
        <Text style={styles.title}>Mes squads</Text>
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!error && <Pressable onPress={() => void load()}><Text style={styles.error}>{error}</Text></Pressable>}
        {loading && !squad ? <ActivityIndicator color={palette.primary} /> : null}

        {state.incoming_invites.length > 0 && <View style={styles.card}>
          <Text style={styles.cardTitle}>Invitations reçues</Text>
          {state.incoming_invites.map((invite) => <View key={invite.invite_id} style={styles.row}>
            <View style={styles.flex}><Text style={styles.bold}>{invite.squad_name}</Text><Text style={styles.muted}>{invite.sender_display_name || invite.sender_username || "Un joueur"} · {invite.game_name || "Tous jeux"}</Text></View>
            <Pressable disabled={!!busy} onPress={() => void perform(invite.invite_id, () => supabase.rpc("respond_to_squad_invite", { p_invite_id: invite.invite_id, p_accept: true }), "Invitation acceptée.")}
              style={[styles.smallButton, { backgroundColor: palette.primary }]}><Text style={styles.smallButtonText}>Accepter</Text></Pressable>
            <Pressable disabled={!!busy} onPress={() => void perform(invite.invite_id, () => supabase.rpc("respond_to_squad_invite", { p_invite_id: invite.invite_id, p_accept: false }), "Invitation refusée.")}
              style={styles.smallButton}><Text style={styles.smallButtonText}>Refuser</Text></Pressable>
          </View>)}
        </View>}

        {!squad && !loading && <View style={styles.card}>
          <Ionicons name="people-outline" size={30} color={palette.secondary} />
          <Text style={styles.cardTitle}>Crée ta squad</Text>
          <Text style={styles.muted}>Retrouve tes amis, organise des parties et discute dans tes salons.</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={60} placeholder="Nom de la squad" placeholderTextColor={theme.colors.textMuted} />
          <Text style={styles.label}>Jeu (facultatif)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip title="Tous" selected={gameId === null} onPress={() => setGameId(null)} />
            {games.map((game) => <Chip key={game.id} title={game.name} selected={gameId === game.id} onPress={() => setGameId(game.id)} />)}
          </ScrollView>
          <View style={styles.row}><Text style={[styles.muted, styles.flex]}>Places : {maxMembers}</Text>
            <Pressable onPress={() => setMaxMembers((value) => Math.max(2, value - 1))} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable>
            <Pressable onPress={() => setMaxMembers((value) => Math.min(12, value + 1))} style={styles.step}><Text style={styles.stepText}>+</Text></Pressable>
          </View>
          <Pressable disabled={!!busy} onPress={() => void create()} style={[styles.primary, { backgroundColor: palette.primary }]}><Text style={styles.primaryText}>{busy === "create" ? "Création…" : "Créer ma squad"}</Text></Pressable>
        </View>}

        {squad && <>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: palette.primary }]}><Ionicons name="people" size={29} color="#FFF" /></View>
            <View style={styles.flex}>
              <Text style={styles.heroEyebrow}>{owner ? "TA SQUAD · CHEF" : "TA SQUAD"}</Text>
              <Text style={styles.heroTitle}>{squad.name}</Text>
              <Text style={styles.muted}>{squad.game_name || "Tous les jeux"} · {squad.members.length}/{squad.max_members} membres</Text>
            </View>
            <Ionicons name="shield-checkmark-outline" size={23} color={palette.secondary} />
          </View>
          <View style={styles.tabs}>
            {(["overview", "planning", "chat"] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)}
              accessibilityRole="tab" accessibilityState={{ selected: tab === value }}
              style={[styles.tab, tab === value && { borderColor: palette.primary, backgroundColor: palette.primary }]}>
              <Ionicons name={value === "overview" ? "people-outline" : value === "planning" ? "calendar-outline" : "chatbubbles-outline"} size={16} color={tab === value ? "#FFF" : theme.colors.textSoft} />
              <Text style={styles.tabText}>{value === "overview" ? "Équipe" : value === "planning" ? "Calendrier" : "Salons"}</Text>
            </Pressable>)}
          </View>
          {voice.room && voice.status !== "idle" && <View style={styles.voiceDock}>
            <Ionicons name="headset-outline" size={21} color={palette.secondary} />
            <View style={styles.flex}><Text style={styles.bold}>{voice.room.channelName}</Text>
              <Text style={styles.muted}>{voice.status === "connecting" ? "Connexion en cours…" : "Vocal connecté"}</Text></View>
            {voice.status === "joined" && <Pressable onPress={voice.toggleMute} accessibilityLabel={voice.muted ? "Rétablir le micro" : "Couper le micro"} style={styles.dockAction}>
              <Ionicons name={voice.muted ? "mic-off-outline" : "mic-outline"} size={21} color={voice.muted ? theme.colors.danger : theme.colors.text} />
            </Pressable>}
            <Pressable onPress={voice.leave} accessibilityLabel="Quitter le vocal" style={styles.dockAction}>
              <Ionicons name="call-outline" size={21} color={theme.colors.danger} />
            </Pressable>
          </View>}

          {tab === "overview" && <>
            {!!squad.description && <View style={styles.card}><Text style={styles.muted}>{squad.description}</Text></View>}
            <View style={styles.card}><Text style={styles.cardTitle}>Membres</Text>
              {squad.members.map((member) => <View key={member.user_id} style={styles.row}>
                <View style={styles.memberAvatar}><Text style={styles.bold}>{(member.display_name || member.username || "G").slice(0, 1).toUpperCase()}</Text></View>
                <Text style={[styles.bold, styles.flex]}>{member.display_name || member.username || "Joueur"}</Text>
                {member.role === "owner" && <Text style={styles.muted}>Chef</Text>}
              </View>)}
            </View>
            {owner && <View style={styles.card}><Text style={styles.cardTitle}>Inviter un ami</Text>
              {availableFriends.length === 0 ? <Text style={styles.muted}>Aucun ami disponible à inviter.</Text> : availableFriends.map((friend) => <View key={friend.id} style={styles.row}>
                <Text style={[styles.bold, styles.flex]}>{friend.display_name || friend.username || "Joueur"}</Text>
                <Pressable disabled={!!busy} style={[styles.smallButton, { backgroundColor: palette.primary }]} onPress={() => void perform(friend.id, () => supabase.rpc("invite_to_squad", { p_recipient_id: friend.id, p_game_id: squad.game_id }), "Invitation envoyée.")}>
                  <Text style={styles.smallButtonText}>Inviter</Text>
                </Pressable>
              </View>)}
            </View>}
            {owner && <View style={styles.card}>
              <Text style={styles.cardTitle}>Paramètres de la squad</Text>
              {!editingSquad ? <Pressable onPress={startEditingSquad} style={styles.smallButton} accessibilityRole="button">
                <Text style={styles.smallButtonText}>Modifier la squad</Text>
              </Pressable> : <>
                <Text style={styles.label}>Nom</Text>
                <TextInput style={styles.input} value={editName} onChangeText={setEditName} maxLength={60} placeholder="Nom de la squad" placeholderTextColor={theme.colors.textMuted} />
                <Text style={styles.label}>Description</Text>
                <TextInput style={styles.input} value={editDescription} onChangeText={setEditDescription} maxLength={300} multiline placeholder="Présentation de la squad" placeholderTextColor={theme.colors.textMuted} />
                <Text style={styles.label}>Jeu</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  <Chip title="Tous" selected={editGameId === null} onPress={() => setEditGameId(null)} />
                  {games.map((game) => <Chip key={game.id} title={game.name} selected={editGameId === game.id} onPress={() => setEditGameId(game.id)} />)}
                </ScrollView>
                <View style={styles.row}><Text style={[styles.muted, styles.flex]}>Places : {editMax}</Text>
                  <Pressable onPress={() => setEditMax((value) => Math.max(squad.members.length, 2, value - 1))} style={styles.step} accessibilityLabel="Retirer une place"><Text style={styles.stepText}>−</Text></Pressable>
                  <Pressable onPress={() => setEditMax((value) => Math.min(12, value + 1))} style={styles.step} accessibilityLabel="Ajouter une place"><Text style={styles.stepText}>+</Text></Pressable>
                </View>
                <View style={styles.row}>
                  <Pressable disabled={!!busy || !editName.trim()} onPress={() => void saveSquad()} style={[styles.smallButton, { backgroundColor: palette.primary }]}><Text style={styles.smallButtonText}>Enregistrer</Text></Pressable>
                  <Pressable disabled={!!busy} onPress={() => setEditingSquad(false)} style={styles.smallButton}><Text style={styles.smallButtonText}>Annuler</Text></Pressable>
                </View>
              </>}
            </View>}
            <Pressable disabled={!!busy} onPress={leave} style={styles.leave}><Text style={styles.error}>{owner ? "Dissoudre la squad" : "Quitter la squad"}</Text></Pressable>
          </>}

          {tab === "planning" && <SquadSchedule squadId={squad.squad_id} userId={session.user.id} gameId={squad.game_id} maxMembers={squad.max_members} isOwner={Boolean(owner)} />}

          {tab === "chat" && <>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>Salons</Text>
                  <Text style={styles.muted}>{squad.channels.length}/5 salons · textes et vocaux au même endroit</Text>
                </View>
                {owner && squad.channels.length < 5 && <Pressable onPress={() => setShowCreateChannel((current) => !current)}
                  accessibilityRole="button" accessibilityLabel={showCreateChannel ? "Fermer la création" : "Créer un salon"}
                  style={[styles.addChannel, { backgroundColor: palette.primary }]}>
                  <Ionicons name={showCreateChannel ? "close" : "add"} size={22} color="#FFF" />
                </Pressable>}
              </View>
              <Text style={styles.groupTitle}>SALONS TEXTUELS</Text>
              {!textChannels.length && <Text style={styles.muted}>Aucun salon textuel.</Text>}
              {textChannels.map((channel) => <ChannelItem key={channel.id} channel={channel} selected={channel.id === channelId}
                color={palette.primary} owner={Boolean(owner)} busy={Boolean(busy)}
                editing={editingChannelId === channel.id} editingName={editingChannelName} onEditingName={setEditingChannelName}
                onSelect={() => { setChannelId(channel.id); setDraft(""); }}
                onStartEdit={() => { setEditingChannelId(channel.id); setEditingChannelName(channel.name); }}
                onCancelEdit={() => setEditingChannelId(null)} onSave={() => void renameChannel(channel)}
                onDelete={() => deleteChannel(channel)} />)}
              <Text style={styles.groupTitle}>SALONS VOCAUX</Text>
              {!voiceChannels.length && <Text style={styles.muted}>Aucun salon vocal.</Text>}
              {voiceChannels.map((channel) => <ChannelItem key={channel.id} channel={channel} selected={channel.id === channelId}
                color={palette.primary} owner={Boolean(owner)} busy={Boolean(busy)}
                editing={editingChannelId === channel.id} editingName={editingChannelName} onEditingName={setEditingChannelName}
                onSelect={() => { setChannelId(channel.id); setDraft(""); }}
                onStartEdit={() => { setEditingChannelId(channel.id); setEditingChannelName(channel.name); }}
                onCancelEdit={() => setEditingChannelId(null)} onSave={() => void renameChannel(channel)}
                onDelete={() => deleteChannel(channel)} />)}
              {owner && squad.channels.length >= 5 && <Text style={styles.muted}>La limite de 5 salons est atteinte.</Text>}
              {owner && showCreateChannel && squad.channels.length < 5 && <View style={styles.createChannel}>
                <Text style={styles.label}>Créer un salon</Text>
                <View style={styles.row}>
                  <Chip title="Textuel" selected={newChannelType === "text"} onPress={() => setNewChannelType("text")} />
                  <Chip title="Vocal" selected={newChannelType === "voice"} onPress={() => setNewChannelType("voice")} />
                </View>
                <TextInput style={styles.input} value={newChannelName} onChangeText={setNewChannelName} maxLength={30}
                  onFocus={() => requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }))}
                  placeholder={newChannelType === "voice" ? "Nom du salon vocal" : "Nom du salon textuel"} placeholderTextColor={theme.colors.textMuted} />
                <Pressable disabled={Boolean(busy) || !newChannelName.trim()} onPress={() => void createChannel()}
                  style={[styles.primary, { backgroundColor: palette.primary }, (Boolean(busy) || !newChannelName.trim()) && styles.disabled]}>
                  <Text style={styles.primaryText}>{busy === "channel-create" ? "Création…" : "Créer le salon"}</Text>
                </Pressable>
              </View>}
            </View>

            {selectedChannel?.channel_type === "text" && <View style={styles.card}>
              <View style={styles.conversationHead}>
                <View style={[styles.conversationIcon, { backgroundColor: palette.primary }]}><Ionicons name="chatbubble-ellipses-outline" size={22} color="#FFF" /></View>
                <View style={styles.flex}><Text style={styles.cardTitle}># {selectedChannel.name}</Text>
                  <Text style={styles.muted}>Salon textuel de la squad</Text></View>
              </View>
              {messages.length === 0 && <Text style={styles.emptyChat}>Aucun message ici pour le moment. Lance la discussion !</Text>}
              {messages.map((message) => <View key={message.id} style={[styles.message, message.sender_id === session.user.id && styles.ownMessage]}>
                <Text style={[styles.messageAuthor, { color: palette.secondary }]}>{message.sender_display_name || message.sender_username || "Joueur"}</Text>
                <Text style={styles.messageBody}>{message.body}</Text>
              </View>)}
              <View style={styles.composer}>
                <TextInput value={draft} onChangeText={setDraft} multiline maxLength={4000} onFocus={() => requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }))}
                  placeholder={"Écrire dans # " + selectedChannel.name} placeholderTextColor={theme.colors.textMuted} style={[styles.input, styles.flex]} />
                <Pressable disabled={Boolean(busy) || !draft.trim()} onPress={() => void sendMessage()} accessibilityLabel="Envoyer le message"
                  style={[styles.send, { backgroundColor: palette.primary }, (Boolean(busy) || !draft.trim()) && styles.disabled]}>
                  <Ionicons name="send" size={18} color="#FFF" />
                </Pressable>
              </View>
            </View>}

            {selectedChannel?.channel_type === "voice" && <View style={styles.card}>
              <View style={styles.conversationHead}>
                <View style={[styles.conversationIcon, { backgroundColor: palette.primary }]}><Ionicons name="volume-high-outline" size={23} color="#FFF" /></View>
                <View style={styles.flex}><Text style={styles.cardTitle}>{selectedChannel.name}</Text>
                  <Text style={styles.muted}>Salon vocal · {voiceParticipants.length} connecté{voiceParticipants.length > 1 ? "s" : ""}</Text></View>
              </View>
              {!!voice.error && <Text style={styles.error}>{voice.error}</Text>}
              {activeVoiceHere ? <View style={styles.row}>
                {voice.status === "connecting" ? <ActivityIndicator color={palette.primary} />
                  : <Pressable onPress={voice.toggleMute} style={[styles.smallButton, { backgroundColor: palette.primary }]}>
                      <Text style={styles.smallButtonText}>{voice.muted ? "Rétablir le micro" : "Couper le micro"}</Text>
                    </Pressable>}
                <Pressable onPress={voice.leave} style={styles.smallButton}><Text style={styles.smallButtonText}>Quitter le vocal</Text></Pressable>
              </View> : <Pressable onPress={() => {
                void voice.join({ squadId: squad.squad_id, channelId: selectedChannel.id, channelName: selectedChannel.name },
                  squad.members.find((member) => member.user_id === session.user.id)?.display_name
                    || squad.members.find((member) => member.user_id === session.user.id)?.username || "Joueur");
              }} style={[styles.primary, { backgroundColor: palette.primary }]} accessibilityRole="button">
                <Text style={styles.primaryText}>{voice.status === "joined" ? "Changer pour ce vocal" : "Rejoindre le vocal"}</Text>
              </Pressable>}
              {voiceLoading ? <ActivityIndicator color={palette.primary} style={styles.voiceLoading} />
                : voiceConnectionError ? <Text style={styles.error}>Impossible de voir les personnes connectées au vocal.</Text>
                : voiceParticipants.length ? voiceParticipants.map((person) => <View key={person.user_id} style={styles.voicePerson}>
                    <View style={styles.memberAvatar}><Text style={styles.bold}>{person.display_name.slice(0, 1).toUpperCase()}</Text></View>
                    <View style={styles.flex}><Text style={styles.bold}>{person.display_name}</Text>
                      <Text style={styles.muted}>{person.deafened ? "Son et micro coupés" : person.muted ? "Micro coupé" : "Dans le vocal"}</Text></View>
                    <Ionicons name={person.muted ? "mic-off-outline" : "mic-outline"} size={19} color={person.muted ? theme.colors.textSoft : palette.secondary} />
                  </View>)
                  : <Text style={styles.emptyChat}>Personne n’est connecté à ce vocal pour le moment.</Text>}
              <Text style={styles.muted}>Le micro du téléphone est utilisé uniquement pendant ta connexion au vocal.</Text>
            </View>}
            {!selectedChannel && <View style={styles.card}><Text style={styles.muted}>Choisis un salon pour commencer.</Text></View>}
          </>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

function ChannelItem({ channel, selected, color, owner, busy, editing, editingName, onEditingName,
  onSelect, onStartEdit, onCancelEdit, onSave, onDelete }: {
  channel: Channel; selected: boolean; color: string; owner: boolean; busy: boolean; editing: boolean;
  editingName: string; onEditingName: (value: string) => void; onSelect: () => void;
  onStartEdit: () => void; onCancelEdit: () => void; onSave: () => void; onDelete: () => void;
}) {
  return <View style={[styles.channelItem, selected && { borderColor: color, backgroundColor: theme.colors.surfaceHover }]}>
    {editing ? <>
      <TextInput style={[styles.input, styles.flex]} value={editingName} onChangeText={onEditingName} maxLength={30}
        autoFocus selectTextOnFocus accessibilityLabel="Nom du salon" />
      <Pressable disabled={busy || !editingName.trim()} onPress={onSave} accessibilityLabel="Enregistrer le nom"><Ionicons name="checkmark-circle" size={25} color={color} /></Pressable>
      <Pressable onPress={onCancelEdit} accessibilityLabel="Annuler"><Ionicons name="close-circle-outline" size={24} color={theme.colors.textSoft} /></Pressable>
    </> : <>
      <Pressable style={styles.channelSelect} onPress={onSelect} accessibilityRole="button" accessibilityState={{ selected }}>
        <Ionicons name={channel.channel_type === "voice" ? "volume-high-outline" : "chatbubble-outline"} size={21} color={selected ? color : theme.colors.textSoft} />
        <View style={styles.flex}><Text style={styles.bold}>{channel.name}</Text>
          <Text style={styles.muted}>{channel.channel_type === "voice" ? "Vocal" : "Textuel"}{channel.is_default ? " · Général" : ""}</Text></View>
      </Pressable>
      {owner && <>
        <Pressable disabled={busy} onPress={onStartEdit} accessibilityLabel={"Renommer " + channel.name}><Ionicons name="pencil-outline" size={18} color={theme.colors.textSoft} /></Pressable>
        {!channel.is_default && <Pressable disabled={busy} onPress={onDelete} accessibilityLabel={"Supprimer " + channel.name}><Ionicons name="trash-outline" size={18} color={theme.colors.danger} /></Pressable>}
      </>}
    </>}
  </View>;
}

function Chip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={styles.chipText}>{title}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  page: { padding: 18, gap: 15 },
  kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: "900" },
  card: { padding: 16, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 11 },
  cardTitle: { color: theme.colors.text, fontSize: 19, fontWeight: "800" },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  heroIcon: { width: 56, height: 56, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  heroEyebrow: { color: theme.colors.textSoft, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  heroTitle: { color: theme.colors.text, fontSize: 21, fontWeight: "900", marginVertical: 2 },
  groupTitle: { color: theme.colors.textSoft, fontSize: 11, fontWeight: "900", letterSpacing: 0.7, marginTop: 8 },
  channelItem: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1,
    borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 12, paddingVertical: 7 },
  channelSelect: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  addChannel: { width: 37, height: 37, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  createChannel: { gap: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 13 },
  conversationHead: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 2 },
  conversationIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  emptyChat: { color: theme.colors.textSoft, textAlign: "center", paddingVertical: 25, fontSize: 12 },
  voicePerson: { flexDirection: "row", gap: 10, alignItems: "center", padding: 10, borderRadius: 11, backgroundColor: theme.colors.surfaceSoft },
  voiceDock: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  dockAction: { width: 37, height: 37, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft,
    alignItems: "center", justifyContent: "center" },
  voiceLoading: { marginVertical: 20 },
  muted: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 18 },
  bold: { color: theme.colors.text, fontSize: 13, fontWeight: "800" },
  error: { color: theme.colors.danger, fontSize: 12 },
  notice: { color: theme.colors.success, fontSize: 12 },
  label: { color: theme.colors.textSoft, fontSize: 11, fontWeight: "700" },
  input: { minHeight: 47, maxHeight: 120, borderRadius: 12, backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text },
  chips: { gap: 7, paddingVertical: 3 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  chipSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flex: { flex: 1 },
  smallButton: { backgroundColor: theme.colors.surfaceSoft, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 },
  smallButtonText: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  primary: { minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 12 },
  primaryText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.5 },
  step: { width: 35, height: 35, borderRadius: 9, backgroundColor: theme.colors.surfaceSoft, alignItems: "center", justifyContent: "center" },
  stepText: { color: theme.colors.text, fontSize: 20 },
  tabs: { flexDirection: "row", gap: 6 },
  tab: { flex: 1, flexDirection: "row", gap: 5, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  tabText: { color: theme.colors.text, fontSize: 11, fontWeight: "800" },
  memberAvatar: { width: 33, height: 33, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSoft },
  leave: { alignSelf: "flex-start", padding: 10 },
  message: { alignSelf: "flex-start", maxWidth: "95%", borderRadius: 12, backgroundColor: theme.colors.surfaceSoft, padding: 10, gap: 4 },
  ownMessage: { alignSelf: "flex-end" },
  messageAuthor: { fontSize: 11, fontWeight: "800" },
  messageBody: { color: theme.colors.text, fontSize: 13, lineHeight: 18 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  send: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
