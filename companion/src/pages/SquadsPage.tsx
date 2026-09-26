import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playMessageSendSound } from "../lib/audio";
import SquadGameSession from "../components/SquadGameSession";
import SquadSchedule from "../components/SquadSchedule";
import SquadVoiceRoom, { type VoiceSessionSnapshot } from "../components/SquadVoiceRoom";
import { Icon } from "../components/Icon";
import { presenceActivity, presenceLabel, type PresenceSnapshot, type PresenceStatus } from "../lib/presence";
import "./SquadsPage.css";

type Props = {
  session: Session | null;
  onLogin: () => void;
  onOpenFriends: () => void;
  onOpenMessages: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
  onVoiceStateChange?: (snapshot: VoiceSessionSnapshot | null) => void;
};

type Game = {
  id: number;
  name: string;
};

type Member = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: "owner" | "member";
  joined_at: string;
  presence: PresenceSnapshot;
};

type SquadChannel = {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
  channel_type: "text" | "voice";
  created_at: string;
};

type SquadMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_display_name: string | null;
  sender_username: string | null;
  sender_avatar_url: string | null;
  body: string;
  created_at: string;
};

type ActiveSquad = {
  squad_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  game_id: number | null;
  game_name: string | null;
  max_members: number;
  created_at: string;
  members: Member[];
  channels: SquadChannel[];
  messages: SquadMessage[];
};

type IncomingInvite = {
  invite_id: string;
  squad_id: string;
  squad_name: string;
  sender_id: string;
  sender_display_name: string | null;
  sender_username: string | null;
  sender_avatar_url: string | null;
  game_id: number | null;
  game_name: string | null;
  max_members: number;
  created_at: string;
};

type OutgoingInvite = {
  invite_id: string;
  recipient_id: string;
  recipient_display_name: string | null;
  recipient_username: string | null;
  recipient_avatar_url: string | null;
  created_at: string;
};

type SquadState = {
  active_squad: ActiveSquad | null;
  incoming_invites: IncomingInvite[];
  outgoing_invites: OutgoingInvite[];
};

type FriendProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
  presence: PresenceSnapshot;
};

type Friendship = {
  requester_id: string;
  addressee_id: string;
  status: string;
};

type Tab = "overview" | "planning" | "session" | "members" | "chat" | "invite" | "settings";

const SQUAD_TAB_REQUEST_KEY = "gamemate-open-squad-tab";

function readInitialSquadTab(): Tab {
  const requested = sessionStorage.getItem(SQUAD_TAB_REQUEST_KEY);
  if (requested === "session" || requested === "planning") {
    sessionStorage.removeItem(SQUAD_TAB_REQUEST_KEY);
    return requested;
  }
  return "overview";
}

const EMPTY_STATE: SquadState = {
  active_squad: null,
  incoming_invites: [],
  outgoing_invites: [],
};

export default function SquadsPage({
  session,
  onLogin,
  onOpenFriends,
  onOpenMessages,
  onOpenProfile,
  onVoiceStateChange,
}: Props) {
  const [state, setState] = useState<SquadState>(EMPTY_STATE);
  const [games, setGames] = useState<Game[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [tab, setTab] = useState<Tab>(readInitialSquadTab);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [createName, setCreateName] = useState("Ma team");
  const [createGameId, setCreateGameId] = useState("");
  const [createMax, setCreateMax] = useState(6);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGameId, setEditGameId] = useState("");
  const [editMax, setEditMax] = useState(6);

  const [friendQuery, setFriendQuery] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    | { type: "dissolve" }
    | { type: "leave" }
    | { type: "kick"; member: Member }
    | { type: "transfer"; member: Member }
    | null
  >(null);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const userId = session?.user?.id ?? null;
  const squad = state.active_squad;
  const isOwner = Boolean(squad && squad.owner_id === userId);

  const loadState = useCallback(async (background = false) => {
    if (!userId) {
      setState(EMPTY_STATE);
      setFriends([]);
      setLoading(false);
      return;
    }

    if (!background) setLoading(true);
    setError("");

    const [stateResult, gamesResult, friendshipsResult] = await Promise.all([
      supabase.rpc("get_my_squad_state"),
      supabase.from("games").select("id, name").order("name"),
      supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    ]);

    if (stateResult.error) {
      console.error("Squad state:", stateResult.error);
      setError("Impossible de charger ta team.");
      setLoading(false);
      return;
    }

    const nextState = (stateResult.data ?? EMPTY_STATE) as SquadState;

    if (!gamesResult.error) {
      setGames((gamesResult.data ?? []) as Game[]);
    }

    const friendIds = friendshipsResult.error
      ? []
      : ((friendshipsResult.data ?? []) as Friendship[]).map((row) =>
        row.requester_id === userId ? row.addressee_id : row.requester_id
      );
    const memberIds = nextState.active_squad?.members.map((member) => member.user_id) ?? [];
    const presenceIds = Array.from(new Set([...friendIds, ...memberIds]));
    const presenceResult = presenceIds.length > 0
      ? await supabase.rpc("get_presence_v15", { p_user_ids: presenceIds })
      : { data: [], error: null };
    const presenceMap = new Map<string, PresenceSnapshot>(
      ((presenceResult.data ?? []) as PresenceSnapshot[]).map((presence) => [presence.user_id, presence])
    );

    const hydratedSquad = nextState.active_squad
      ? {
          ...nextState.active_squad,
          members: nextState.active_squad.members.map((member) => ({
            ...member,
            presence: presenceMap.get(member.user_id) ?? offlinePresence(member.user_id),
          })),
        }
      : null;

    setState({
      active_squad: hydratedSquad,
      incoming_invites: nextState.incoming_invites ?? [],
      outgoing_invites: nextState.outgoing_invites ?? [],
    });

    if (!friendshipsResult.error) {
      const ids = friendIds;

      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, region")
          .in("id", ids);

        setFriends((profiles ?? []).map((profile) => ({
          ...profile,
          presence: presenceMap.get(profile.id) ?? offlinePresence(profile.id),
        })) as FriendProfile[]);
      } else {
        setFriends([]);
      }
    }

    if (nextState.active_squad) {
      const channels = nextState.active_squad.channels ?? [];
      setSelectedChannelId((current) => {
        if (current && channels.some((channel) => channel.id === current)) return current;
        return channels.find((channel) => channel.is_default)?.id ?? channels[0]?.id ?? "";
      });
      setEditName(nextState.active_squad.name || "Ma team");
      setEditDescription(nextState.active_squad.description || "");
      setEditGameId(
        nextState.active_squad.game_id != null
          ? String(nextState.active_squad.game_id)
          : ""
      );
      setEditMax(nextState.active_squad.max_members || 6);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    function openRequestedTab(event: Event) {
      const requested = (event as CustomEvent<string | { tab: string; channelId?: string }>).detail;
      const requestedTab = typeof requested === "string" ? requested : requested?.tab;
      if (requestedTab === "session" || requestedTab === "planning") {
        sessionStorage.removeItem(SQUAD_TAB_REQUEST_KEY);
        setTab(requestedTab);
      } else if (requestedTab === "chat") {
        setTab("chat");
        if (typeof requested !== "string" && requested.channelId) {
          setSelectedChannelId(requested.channelId);
        }
      }
    }

    window.addEventListener("gamemate:open-squad-tab", openRequestedTab);
    return () => window.removeEventListener("gamemate:open-squad-tab", openRequestedTab);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`squads-clean:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squads" }, () => void loadState())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_members" }, () => void loadState())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_invites" }, () => void loadState())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => void loadState(true))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "squad_messages" }, () => void loadState())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadState]);

  useEffect(() => {
    if (tab === "chat") {
      requestAnimationFrame(() =>
        chatBottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
      );
    }
  }, [tab, squad?.messages]);

  const availableFriends = useMemo(() => {
    if (!squad) return friends;

    const memberIds = new Set(squad.members.map((member) => member.user_id));
    const pendingIds = new Set(
      state.outgoing_invites.map((invite) => invite.recipient_id)
    );
    const q = friendQuery.trim().toLowerCase();

    return friends
      .filter((friend) => !memberIds.has(friend.id) && !pendingIds.has(friend.id))
      .filter((friend) => {
        if (!q) return true;
        return [friend.display_name, friend.username, friend.region]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => presenceRank(a.presence.status) - presenceRank(b.presence.status));
  }, [friends, squad, state.outgoing_invites, friendQuery]);

  async function createSquad() {
    setWorking("create");
    setError("");
    setNotice("");

    const { error: createError } = await supabase.rpc("create_squad", {
      p_name: createName.trim() || "Ma team",
      p_game_id: createGameId ? Number(createGameId) : null,
      p_max_members: createMax,
    });

    if (createError) {
      setError(
        createError.message.includes("already_in_active_squad")
          ? "Tu es déjà dans une team active."
          : "Impossible de créer la team."
      );
    } else {
      setNotice("Team créée.");
      setTab("overview");
      await loadState();
    }

    setWorking(null);
  }

  async function respondInvite(inviteId: string, accept: boolean) {
    setWorking(inviteId);
    setError("");
    setNotice("");

    const { error: responseError } = await supabase.rpc("respond_to_squad_invite", {
      p_invite_id: inviteId,
      p_accept: accept,
    });

    if (responseError) {
      setError(
        responseError.message.includes("already_in_active_squad")
          ? "Quitte d’abord ta team actuelle."
          : responseError.message.includes("squad_full")
          ? "Cette team est complète."
          : "Impossible de répondre à l’invitation."
      );
    } else {
      setNotice(accept ? "Tu as rejoint la team." : "Invitation refusée.");
      await loadState();
    }

    setWorking(null);
  }

  async function inviteFriend(friendId: string) {
    setWorking(friendId);
    setError("");
    setNotice("");

    const { data, error: inviteError } = await supabase.rpc("invite_to_squad", {
      p_recipient_id: friendId,
      p_game_id: squad?.game_id ?? null,
    });

    if (inviteError) {
      setError(
        inviteError.message.includes("squad_full")
          ? "Ta team est complète."
          : inviteError.message.includes("only_owner_can_invite")
          ? "Seul le chef peut inviter."
          : inviteError.message.includes("squad_invites_disabled")
          ? "Cet ami n’accepte pas les invitations de squad."
          : "Impossible d’envoyer l’invitation."
      );
    } else {
      const result = data as { status?: string } | null;
      setNotice(
        result?.status === "already_pending"
          ? "Cette invitation est déjà en attente."
          : "Invitation envoyée."
      );
      await loadState();
    }

    setWorking(null);
  }

  async function cancelInvite(inviteId: string) {
    setWorking(inviteId);
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("cancel_squad_invite", {
      p_invite_id: inviteId,
    });

    if (actionError) setError("Impossible d’annuler l’invitation.");
    else {
      setNotice("Invitation annulée.");
      await loadState();
    }

    setWorking(null);
  }

  async function saveSettings() {
    if (!squad) return;

    setWorking("settings");
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("update_squad_settings_v2", {
      p_squad_id: squad.squad_id,
      p_name: editName.trim() || "Ma team",
      p_description: editDescription.trim() || null,
      p_game_id: editGameId ? Number(editGameId) : null,
      p_max_members: editMax,
    });

    if (actionError) {
      setError(
        actionError.message.includes("max_members_below_current_count")
          ? "La limite ne peut pas être inférieure au nombre de membres."
          : actionError.message.includes("not_squad_owner")
          ? "Seul le chef peut modifier la team."
          : "Impossible d’enregistrer les modifications."
      );
    } else {
      setNotice("Modifications enregistrées.");
      await loadState();
    }

    setWorking(null);
  }

  async function executeConfirmedAction() {
    if (!squad || !confirmAction) return;

    setWorking("confirm");
    setError("");
    setNotice("");

    let result;

    if (confirmAction.type === "dissolve") {
      result = await supabase.rpc("dissolve_squad", {
        p_squad_id: squad.squad_id,
      });
    } else if (confirmAction.type === "leave") {
      result = await supabase.rpc("leave_temp_squad", {
        p_squad_id: squad.squad_id,
      });
    } else if (confirmAction.type === "kick") {
      result = await supabase.rpc("kick_squad_member", {
        p_squad_id: squad.squad_id,
        p_user_id: confirmAction.member.user_id,
      });
    } else {
      result = await supabase.rpc("transfer_squad_owner", {
        p_squad_id: squad.squad_id,
        p_new_owner_id: confirmAction.member.user_id,
      });
    }

    if (result.error) {
      setError("L’action n’a pas pu être effectuée.");
    } else {
      setNotice(
        confirmAction.type === "dissolve"
          ? "Team dissoute."
          : confirmAction.type === "leave"
          ? "Tu as quitté la team."
          : confirmAction.type === "kick"
          ? "Membre exclu."
          : "Chef transféré."
      );
      setConfirmAction(null);
      setTab("overview");
      await loadState();
    }

    setWorking(null);
  }

  async function createChannel() {
    if (!squad || !newChannelName.trim()) return;

    setWorking("channel-create");
    setError("");
    setNotice("");

    const { data, error: channelError } = await supabase.rpc("create_team_channel_v2", {
      p_squad_id: squad.squad_id,
      p_name: newChannelName.trim(),
      p_type: newChannelType,
    });

    if (channelError) {
      setError(
        channelError.message.includes("channel_limit_reached")
          ? "Une team est limitée à 5 salons."
          : channelError.message.includes("channel_name_exists")
          ? "Un salon porte déjà ce nom."
          : "Impossible de créer le salon."
      );
    } else {
      const result = data as { channel_id?: string } | null;
      setNewChannelName("");
      setNewChannelType("text");
      await loadState();
      if (result?.channel_id) setSelectedChannelId(result.channel_id);
      setNotice("Salon créé.");
    }

    setWorking(null);
  }

  async function renameChannel(channelId: string) {
    if (!editingChannelName.trim()) return;

    setWorking(`channel-rename-${channelId}`);
    setError("");
    setNotice("");

    const { error: channelError } = await supabase.rpc("rename_team_channel", {
      p_channel_id: channelId,
      p_name: editingChannelName.trim(),
    });

    if (channelError) {
      setError(
        channelError.message.includes("channel_name_exists")
          ? "Un salon porte déjà ce nom."
          : "Impossible de renommer le salon."
      );
    } else {
      setEditingChannelId(null);
      setEditingChannelName("");
      setNotice("Salon renommé.");
      await loadState();
    }

    setWorking(null);
  }

  async function deleteChannel(channel: SquadChannel) {
    if (!squad || channel.is_default) return;

    setWorking(`channel-delete-${channel.id}`);
    setError("");
    setNotice("");

    const { error: channelError } = await supabase.rpc("delete_team_channel", {
      p_channel_id: channel.id,
    });

    if (channelError) {
      setError(
        channelError.message.includes("cannot_delete_default_channel")
          ? "Le salon Général ne peut pas être supprimé."
          : "Impossible de supprimer le salon."
      );
    } else {
      if (selectedChannelId === channel.id) {
        const fallback = squad.channels.find((item) => item.is_default) ?? squad.channels[0];
        setSelectedChannelId(fallback?.id ?? "");
      }
      setNotice("Salon supprimé.");
      await loadState();
    }

    setWorking(null);
  }

  async function sendChatMessage() {
    if (!squad || !selectedChannelId || !chatDraft.trim()) return;

    setWorking("chat");
    setError("");

    const { error: messageError } = await supabase.rpc("send_squad_channel_message", {
      p_squad_id: squad.squad_id,
      p_channel_id: selectedChannelId,
      p_body: chatDraft.trim(),
    });

    if (messageError) {
      setError(
        messageError.message.includes("messaging_muted")
          ? "Tu ne peux pas écrire dans les salons pendant la durée de ton mute."
          : messageError.message.includes("account_restricted")
            ? "Ton compte est actuellement suspendu ou banni."
            : "Impossible d’envoyer le message."
      );
    } else {
      setChatDraft("");
      playMessageSendSound();
      await loadState();
    }

    setWorking(null);
  }

  if (!session) {
    return (
      <section className="team-page locked">
        <div>
          <span className="team-kicker">TEAM</span>
          <h1>Crée ton équipe.</h1>
          <p>Connecte-toi pour créer ou rejoindre une team GameMate.</p>
          <button type="button" className="team-primary" onClick={onLogin}>
            Se connecter
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return <section className="team-page loading">Chargement de ta team...</section>;
  }

  return (
    <div className="team-page">
      <header className="team-head">
        <div>
          <span className="team-kicker">GAMEMATE</span>
          <h1>Team</h1>
          <p>Ton groupe, tes membres et ton chat au même endroit.</p>
        </div>

        {state.incoming_invites.length > 0 && (
          <span className="team-invite-count">
            {state.incoming_invites.length} invitation{state.incoming_invites.length > 1 ? "s" : ""}
          </span>
        )}
      </header>

      {error && <div className="team-notice error"><span>{error}</span><button type="button" onClick={() => void loadState()}>Réessayer</button></div>}
      {notice && <div className="team-notice">{notice}</div>}

      {state.incoming_invites.length > 0 && (
        <section className="team-incoming">
          <div className="team-section-head">
            <div>
              <span className="team-kicker">INVITATIONS</span>
              <h2>Rejoindre une team</h2>
            </div>
          </div>

          <div className="team-invite-list">
            {state.incoming_invites.map((invite) => (
              <article key={invite.invite_id}>
                <Avatar
                  url={invite.sender_avatar_url}
                  name={invite.sender_display_name || invite.sender_username || "Joueur"}
                />
                <div>
                  <strong>{invite.squad_name}</strong>
                  <small>
                    {invite.game_name || "Aucun jeu défini"} · par{" "}
                    {invite.sender_display_name || invite.sender_username || "Joueur"}
                  </small>
                </div>
                <div>
                  <button
                    type="button"
                    className="primary"
                    disabled={working === invite.invite_id}
                    onClick={() => void respondInvite(invite.invite_id, true)}
                  >
                    Rejoindre
                  </button>
                  <button
                    type="button"
                    disabled={working === invite.invite_id}
                    onClick={() => void respondInvite(invite.invite_id, false)}
                  >
                    Refuser
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!squad ? (
        <CreateTeam
          games={games}
          name={createName}
          gameId={createGameId}
          maxMembers={createMax}
          working={working === "create"}
          onNameChange={setCreateName}
          onGameChange={setCreateGameId}
          onMaxChange={setCreateMax}
          onCreate={() => void createSquad()}
        />
      ) : (
        <>
          <section className="team-hero">
            <div className="team-emblem">{squad.name.slice(0, 2).toUpperCase()}</div>

            <div className="team-hero-copy">
              <span className="team-kicker">{isOwner ? "TA TEAM · CHEF" : "TEAM ACTIVE"}</span>
              <h2>{squad.name}</h2>
              <p>
                {squad.description ||
                  (squad.game_name
                    ? `Équipe active sur ${squad.game_name}.`
                    : "Équipe GameMate active.")}
              </p>
            </div>

            <div className="team-hero-meta">
              <strong>{squad.members.length}/{squad.max_members}</strong>
              <small>membres</small>
              <span>{squad.game_name || "Multi-jeux"}</span>
            </div>
          </section>

          <nav className="team-tabs">
            <Tab active={tab === "overview"} label="Aperçu" onClick={() => setTab("overview")} />
            <Tab active={tab === "planning"} label="Planning" onClick={() => setTab("planning")} />
            <Tab active={tab === "session"} label="Session de jeu" onClick={() => setTab("session")} />
            <Tab active={tab === "members"} label="Membres" count={squad.members.length} onClick={() => setTab("members")} />
            <Tab active={tab === "chat"} label="Chat" onClick={() => setTab("chat")} />
            {isOwner && (
              <Tab
                active={tab === "invite"}
                label="Inviter"
                count={state.outgoing_invites.length}
                onClick={() => setTab("invite")}
              />
            )}
            <Tab active={tab === "settings"} label="Paramètres" onClick={() => setTab("settings")} />
          </nav>

          <section className="team-body">
            {tab === "overview" && (
              <Overview
                squad={squad}
                isOwner={isOwner}
                onMembers={() => setTab("members")}
                onChat={() => setTab("chat")}
                onInvite={() => setTab("invite")}
                onSettings={() => setTab("settings")}
              />
            )}

            {tab === "planning" && (
              <SquadSchedule
                squadId={squad.squad_id}
                isOwner={isOwner}
                games={games}
                defaultGameId={squad.game_id}
                squadMaxMembers={squad.max_members}
                onOpenLiveSession={() => setTab("session")}
              />
            )}

            {tab === "session" && (
              <SquadGameSession
                squadId={squad.squad_id}
                currentUserId={userId!}
                isOwner={isOwner}
                members={squad.members}
                games={games}
                defaultGameId={squad.game_id}
                onOpenChat={() => setTab("chat")}
                onOpenFriends={onOpenFriends}
                onOpenMessages={onOpenMessages}
                onOpenProfile={onOpenProfile}
              />
            )}

            {tab === "members" && (
              <Members
                squad={squad}
                currentUserId={userId!}
                isOwner={isOwner}
                working={working}
                onKick={(member) => setConfirmAction({ type: "kick", member })}
                onTransfer={(member) => setConfirmAction({ type: "transfer", member })}
              />
            )}

            <div className={`team-persistent-chat ${tab === "chat" ? "" : "is-hidden"}`} aria-hidden={tab !== "chat"}>
              <TeamChat
                squadId={squad.squad_id}
                members={squad.members}
                channels={squad.channels ?? []}
                selectedChannelId={selectedChannelId}
                messages={(squad.messages ?? []).filter((message) => message.channel_id === selectedChannelId)}
                currentUserId={userId!}
                isOwner={isOwner}
                draft={chatDraft}
                working={working}
                bottomRef={chatBottomRef}
                newChannelName={newChannelName}
                newChannelType={newChannelType}
                editingChannelId={editingChannelId}
                editingChannelName={editingChannelName}
                onSelectChannel={setSelectedChannelId}
                onDraft={setChatDraft}
                onSend={() => void sendChatMessage()}
                onNewChannelName={setNewChannelName}
                onNewChannelType={setNewChannelType}
                onCreateChannel={() => void createChannel()}
                onStartRename={(channel) => {
                  setEditingChannelId(channel.id);
                  setEditingChannelName(channel.name);
                }}
                onEditingChannelName={setEditingChannelName}
                onRenameChannel={(channelId) => void renameChannel(channelId)}
                onCancelRename={() => {
                  setEditingChannelId(null);
                  setEditingChannelName("");
                }}
                onDeleteChannel={(channel) => void deleteChannel(channel)}
                onVoiceStateChange={onVoiceStateChange}
              />
            </div>

            {tab === "invite" && isOwner && (
              <InviteFriends
                friends={availableFriends}
                pending={state.outgoing_invites}
                query={friendQuery}
                working={working}
                onQuery={setFriendQuery}
                onInvite={(id) => void inviteFriend(id)}
                onCancel={(id) => void cancelInvite(id)}
              />
            )}

            {tab === "settings" && (
              <TeamSettings
                squad={squad}
                games={games}
                isOwner={isOwner}
                name={editName}
                description={editDescription}
                gameId={editGameId}
                maxMembers={editMax}
                working={working === "settings"}
                onName={setEditName}
                onDescription={setEditDescription}
                onGame={setEditGameId}
                onMax={setEditMax}
                onSave={() => void saveSettings()}
                onLeave={() => setConfirmAction({ type: "leave" })}
                onDissolve={() => setConfirmAction({ type: "dissolve" })}
              />
            )}
          </section>
        </>
      )}

      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          working={working === "confirm"}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => void executeConfirmedAction()}
        />
      )}
    </div>
  );
}

function CreateTeam({
  games,
  name,
  gameId,
  maxMembers,
  working,
  onNameChange,
  onGameChange,
  onMaxChange,
  onCreate,
}: {
  games: Game[];
  name: string;
  gameId: string;
  maxMembers: number;
  working: boolean;
  onNameChange: (value: string) => void;
  onGameChange: (value: string) => void;
  onMaxChange: (value: number) => void;
  onCreate: () => void;
}) {
  return (
    <section className="team-create">
      <div>
        <span className="team-kicker">NOUVELLE TEAM</span>
        <h2>Crée ton équipe.</h2>
        <p>Tu deviendras chef et pourras ensuite modifier les paramètres, inviter et gérer les membres.</p>
      </div>

      <div className="team-form">
        <label>
          <span>Nom</span>
          <input
            value={name}
            maxLength={40}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </label>

        <label>
          <span>Jeu principal</span>
          <select value={gameId} onChange={(event) => onGameChange(event.target.value)}>
            <option value="">Aucun jeu spécifique</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>{game.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Taille maximale</span>
          <select
            value={maxMembers}
            onChange={(event) => onMaxChange(Number(event.target.value))}
          >
            {[2,3,4,5,6,7,8,9,10,11,12].map((value) => (
              <option key={value} value={value}>{value} membres</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="team-primary"
          disabled={working || !name.trim()}
          onClick={onCreate}
        >
          {working ? "Création..." : "Créer la team"}
        </button>
      </div>
    </section>
  );
}

function Overview({
  squad,
  isOwner,
  onMembers,
  onChat,
  onInvite,
  onSettings,
}: {
  squad: ActiveSquad;
  isOwner: boolean;
  onMembers: () => void;
  onChat: () => void;
  onInvite: () => void;
  onSettings: () => void;
}) {
  const owner = squad.members.find((member) => member.role === "owner");

  return (
    <div className="team-overview">
      <section className="team-card main-card">
        <span className="team-kicker">ÉQUIPE</span>
        <h3>{squad.name}</h3>
        <p>{squad.description || "Aucune description pour le moment."}</p>

        <div className="team-actions">
          <button type="button" onClick={onMembers}>Voir les membres</button>
          <button type="button" onClick={onChat}>Ouvrir le chat</button>
          {isOwner && <button type="button" onClick={onInvite}>Inviter un ami</button>}
          {isOwner && <button type="button" onClick={onSettings}>Modifier la team</button>}
        </div>
      </section>

      <section className="team-card compact-card">
        <span className="team-kicker">CHEF</span>
        {owner ? (
          <div className="team-owner">
            <Avatar url={owner.avatar_url} name={memberName(owner)} large />
            <div>
              <strong>{memberName(owner)}</strong>
              <small>{owner.username ? `@${owner.username}` : "GameMate"}</small>
            </div>
          </div>
        ) : (
          <p>Chef indisponible.</p>
        )}
      </section>

      <section className="team-card compact-card">
        <span className="team-kicker">CAPACITÉ</span>
        <strong className="team-capacity">{squad.members.length}<small> / {squad.max_members}</small></strong>
        <p>{Math.max(0, squad.max_members - squad.members.length)} place(s) disponible(s).</p>
      </section>
    </div>
  );
}

function Members({
  squad,
  currentUserId,
  isOwner,
  working,
  onKick,
  onTransfer,
}: {
  squad: ActiveSquad;
  currentUserId: string;
  isOwner: boolean;
  working: string | null;
  onKick: (member: Member) => void;
  onTransfer: (member: Member) => void;
}) {
  return (
    <div className="team-members">
      {squad.members.map((member) => (
        <article key={member.user_id}>
          <Avatar url={member.avatar_url} name={memberName(member)} large />

          <div className="team-member-copy">
            <strong>
              {memberName(member)}
              {member.user_id === currentUserId && <em>Toi</em>}
            </strong>
            <small>{member.username ? `@${member.username}` : "GameMate"} · {presenceActivity(member.presence)}</small>
          </div>

          <span className={`team-presence ${member.presence.status}`}><i />{presenceLabel(member.presence.status)}</span>

          <span className={`team-role ${member.role}`}>
            {member.role === "owner" ? "CHEF" : "MEMBRE"}
          </span>

          {isOwner && member.user_id !== currentUserId && (
            <div className="team-member-actions">
              <button
                type="button"
                disabled={Boolean(working)}
                onClick={() => onTransfer(member)}
              >
                Nommer chef
              </button>
              <button
                type="button"
                className="danger"
                disabled={Boolean(working)}
                onClick={() => onKick(member)}
              >
                Exclure
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function InviteFriends({
  friends,
  pending,
  query,
  working,
  onQuery,
  onInvite,
  onCancel,
}: {
  friends: FriendProfile[];
  pending: OutgoingInvite[];
  query: string;
  working: string | null;
  onQuery: (value: string) => void;
  onInvite: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="team-invite-layout">
      <section className="team-card">
        <div className="team-section-head">
          <div>
            <span className="team-kicker">AMIS</span>
            <h3>Inviter dans la team</h3>
          </div>
        </div>

        <input
          className="team-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Rechercher un ami..."
        />

        <div className="team-friend-list">
          {friends.length === 0 ? (
            <div className="team-empty">Aucun ami disponible à inviter.</div>
          ) : (
            friends.map((friend) => (
              <div key={friend.id} className="team-friend-row">
                <Avatar url={friend.avatar_url} name={profileName(friend)} />
                <div>
                  <strong>{profileName(friend)}</strong>
                  <small><i className={`team-presence-dot ${friend.presence.status}`} />{presenceActivity(friend.presence)}</small>
                </div>
                <button
                  type="button"
                  disabled={working === friend.id}
                  onClick={() => onInvite(friend.id)}
                >
                  {working === friend.id ? "..." : "Inviter"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="team-card">
        <div className="team-section-head">
          <div>
            <span className="team-kicker">EN ATTENTE</span>
            <h3>Invitations envoyées</h3>
          </div>
        </div>

        <div className="team-friend-list">
          {pending.length === 0 ? (
            <div className="team-empty">Aucune invitation en attente.</div>
          ) : (
            pending.map((invite) => (
              <div key={invite.invite_id} className="team-friend-row">
                <Avatar
                  url={invite.recipient_avatar_url}
                  name={invite.recipient_display_name || invite.recipient_username || "Joueur"}
                />
                <div>
                  <strong>{invite.recipient_display_name || invite.recipient_username || "Joueur"}</strong>
                  <small>Invitation en attente</small>
                </div>
                <button
                  type="button"
                  disabled={working === invite.invite_id}
                  onClick={() => onCancel(invite.invite_id)}
                >
                  Annuler
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function TeamChat({
  squadId,
  members,
  channels,
  selectedChannelId,
  messages,
  currentUserId,
  isOwner,
  draft,
  working,
  bottomRef,
  newChannelName,
  newChannelType,
  editingChannelId,
  editingChannelName,
  onSelectChannel,
  onDraft,
  onSend,
  onNewChannelName,
  onNewChannelType,
  onCreateChannel,
  onStartRename,
  onEditingChannelName,
  onRenameChannel,
  onCancelRename,
  onDeleteChannel,
  onVoiceStateChange,
}: {
  squadId: string;
  members: Member[];
  channels: SquadChannel[];
  selectedChannelId: string;
  messages: SquadMessage[];
  currentUserId: string;
  isOwner: boolean;
  draft: string;
  working: string | null;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  newChannelName: string;
  newChannelType: "text" | "voice";
  editingChannelId: string | null;
  editingChannelName: string;
  onSelectChannel: (value: string) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onNewChannelName: (value: string) => void;
  onNewChannelType: (value: "text" | "voice") => void;
  onCreateChannel: () => void;
  onStartRename: (channel: SquadChannel) => void;
  onEditingChannelName: (value: string) => void;
  onRenameChannel: (channelId: string) => void;
  onCancelRename: () => void;
  onDeleteChannel: (channel: SquadChannel) => void;
  onVoiceStateChange?: (snapshot: VoiceSessionSnapshot | null) => void;
}) {
  const [retainedVoiceChannelId, setRetainedVoiceChannelId] = useState<string | null>(null);
  const selectedChannel =
    channels.find((channel) => channel.id === selectedChannelId) ??
    channels[0] ??
    null;

  const textChannels = channels.filter((channel) => channel.channel_type === "text");
  const voiceChannels = channels.filter((channel) => channel.channel_type === "voice");
  const retainedVoiceChannel = retainedVoiceChannelId
    ? voiceChannels.find((channel) => channel.id === retainedVoiceChannelId) ?? null
    : null;
  const selectedVoiceChannel = selectedChannel?.channel_type === "voice" ? selectedChannel : null;
  const voiceChannelToRender = retainedVoiceChannel ?? selectedVoiceChannel;
  const showVoicePanel = Boolean(selectedVoiceChannel);

  const handleVoiceStateChange = useCallback((snapshot: VoiceSessionSnapshot | null) => {
    setRetainedVoiceChannelId((current) => {
      if (snapshot?.joined || snapshot?.connecting) return snapshot.channelId;
      if (!snapshot || snapshot.channelId === current) return null;
      return current;
    });
    onVoiceStateChange?.(snapshot);
  }, [onVoiceStateChange]);

  return (
    <div className="team-chat-shell">
      <aside className="team-channels">
        <div className="team-channels-head">
          <div>
            <span className="team-kicker">SALONS DE TEAM</span>
            <strong>{channels.length}/5</strong>
          </div>
        </div>

        <ChannelGroup
          title="TEXTUELS"
          channels={textChannels}
          selectedChannelId={selectedChannelId}
          isOwner={isOwner}
          working={working}
          editingChannelId={editingChannelId}
          editingChannelName={editingChannelName}
          onSelectChannel={onSelectChannel}
          onStartRename={onStartRename}
          onEditingChannelName={onEditingChannelName}
          onRenameChannel={onRenameChannel}
          onCancelRename={onCancelRename}
          onDeleteChannel={onDeleteChannel}
        />

        <ChannelGroup
          title="VOCAUX"
          channels={voiceChannels}
          selectedChannelId={selectedChannelId}
          isOwner={isOwner}
          working={working}
          editingChannelId={editingChannelId}
          editingChannelName={editingChannelName}
          onSelectChannel={onSelectChannel}
          onStartRename={onStartRename}
          onEditingChannelName={onEditingChannelName}
          onRenameChannel={onRenameChannel}
          onCancelRename={onCancelRename}
          onDeleteChannel={onDeleteChannel}
        />

        {isOwner && channels.length < 5 && (
          <div className="team-channel-create">
            <select
              value={newChannelType}
              onChange={(event) => onNewChannelType(event.target.value as "text" | "voice")}
            >
              <option value="text">Texte</option>
              <option value="voice">Vocal</option>
            </select>
            <input
              value={newChannelName}
              maxLength={30}
              placeholder={newChannelType === "voice" ? "Nom du vocal..." : "Nom du salon..."}
              onChange={(event) => onNewChannelName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCreateChannel();
              }}
            />
            <button
              type="button"
              disabled={!newChannelName.trim() || working === "channel-create"}
              onClick={onCreateChannel}
            >
              +
            </button>
          </div>
        )}

        {isOwner && channels.length >= 5 && (
          <small className="team-channel-limit">
            Limite atteinte : 5 salons pour une team.
          </small>
        )}
      </aside>

      {voiceChannelToRender && (
        <div className={`team-persistent-voice ${showVoicePanel ? "" : "is-hidden"}`} aria-hidden={!showVoicePanel}>
          <SquadVoiceRoom
            squadId={squadId}
            channelId={voiceChannelToRender.id}
            channelName={voiceChannelToRender.name}
            currentUserId={currentUserId}
            members={members}
            onStateChange={handleVoiceStateChange}
          />
        </div>
      )}

      {!showVoicePanel && (
        <div className="team-chat">
          <header className="team-chat-head">
            <div>
              <span>#</span>
              <div>
                <strong>{selectedChannel?.name ?? "Salon"}</strong>
                <small>{messages.length} message{messages.length > 1 ? "s" : ""}</small>
              </div>
            </div>
          </header>

          <div className="team-chat-log">
            {messages.length === 0 ? (
              <div className="team-chat-empty">
                <strong>#{selectedChannel?.name ?? "salon"}</strong>
                <p>Ce salon est encore vide.</p>
              </div>
            ) : (
              messages.map((message) => {
                const mine = message.sender_id === currentUserId;

                return (
                  <div key={message.id} className={`team-chat-row ${mine ? "mine" : ""}`}>
                    {!mine && (
                      <Avatar
                        url={message.sender_avatar_url}
                        name={message.sender_display_name || message.sender_username || "Joueur"}
                      />
                    )}

                    <div className="team-chat-bubble">
                      {!mine && (
                        <strong>
                          {message.sender_display_name || message.sender_username || "Joueur"}
                        </strong>
                      )}
                      <p>{message.body}</p>
                      <small>{formatTime(message.created_at)}</small>
                    </div>
                  </div>
                );
              })
            )}

            <div ref={bottomRef} />
          </div>

          <div className="team-chat-composer">
            <textarea
              value={draft}
              maxLength={2000}
              placeholder={selectedChannel ? `Écrire dans #${selectedChannel.name}...` : "Choisis un salon..."}
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSend();
                }
              }}
            />
            <button
              type="button"
              disabled={working === "chat" || !selectedChannel || !draft.trim()}
              onClick={onSend}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelGroup({
  title,
  channels,
  selectedChannelId,
  isOwner,
  working,
  editingChannelId,
  editingChannelName,
  onSelectChannel,
  onStartRename,
  onEditingChannelName,
  onRenameChannel,
  onCancelRename,
  onDeleteChannel,
}: {
  title: string;
  channels: SquadChannel[];
  selectedChannelId: string;
  isOwner: boolean;
  working: string | null;
  editingChannelId: string | null;
  editingChannelName: string;
  onSelectChannel: (value: string) => void;
  onStartRename: (channel: SquadChannel) => void;
  onEditingChannelName: (value: string) => void;
  onRenameChannel: (channelId: string) => void;
  onCancelRename: () => void;
  onDeleteChannel: (channel: SquadChannel) => void;
}) {
  return (
    <div className="team-channel-group">
      <span className="team-channel-group-title">{title}</span>

      {channels.length === 0 ? (
        <small className="team-channel-empty">Aucun salon.</small>
      ) : (
        channels.map((channel) => (
          <div
            key={channel.id}
            className={`team-channel-row ${channel.id === selectedChannelId ? "active" : ""}`}
          >
            {editingChannelId === channel.id ? (
              <div className="team-channel-edit">
                <input
                  value={editingChannelName}
                  maxLength={30}
                  autoFocus
                  onChange={(event) => onEditingChannelName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onRenameChannel(channel.id);
                    if (event.key === "Escape") onCancelRename();
                  }}
                />
                <button type="button" onClick={() => onRenameChannel(channel.id)} aria-label="Enregistrer"><Icon name="check" size={15} /></button>
                <button type="button" onClick={onCancelRename} aria-label="Annuler"><Icon name="close" size={15} /></button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="team-channel-main"
                  onClick={() => onSelectChannel(channel.id)}
                >
                  <span>{channel.channel_type === "voice" ? <Icon name="volume-2" size={16} /> : <Icon name="message-circle" size={16} />}</span>
                  <strong>{channel.name}</strong>
                </button>

                {isOwner && (
                  <div className="team-channel-actions">
                    <button
                      type="button"
                      title="Renommer"
                      onClick={() => onStartRename(channel)}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    {!channel.is_default && (
                      <button
                        type="button"
                        title="Supprimer"
                        disabled={working === `channel-delete-${channel.id}`}
                        onClick={() => onDeleteChannel(channel)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function TeamSettings({
  squad,
  games,
  isOwner,
  name,
  description,
  gameId,
  maxMembers,
  working,
  onName,
  onDescription,
  onGame,
  onMax,
  onSave,
  onLeave,
  onDissolve,
}: {
  squad: ActiveSquad;
  games: Game[];
  isOwner: boolean;
  name: string;
  description: string;
  gameId: string;
  maxMembers: number;
  working: boolean;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onGame: (value: string) => void;
  onMax: (value: number) => void;
  onSave: () => void;
  onLeave: () => void;
  onDissolve: () => void;
}) {
  return (
    <div className="team-settings">
      <section className="team-card">
        <div className="team-section-head">
          <div>
            <span className="team-kicker">{isOwner ? "CHEF DE TEAM" : "TEAM"}</span>
            <h3>{isOwner ? "Modifier la team" : squad.name}</h3>
          </div>
        </div>

        {isOwner ? (
          <div className="team-settings-form">
            <label>
              <span>Nom de la team</span>
              <input
                value={name}
                maxLength={40}
                onChange={(event) => onName(event.target.value)}
              />
              <small>{name.length}/40</small>
            </label>

            <label>
              <span>Description</span>
              <textarea
                value={description}
                maxLength={280}
                rows={4}
                placeholder="Décris l’ambiance, les objectifs ou le type de joueurs recherchés..."
                onChange={(event) => onDescription(event.target.value)}
              />
              <small>{description.length}/280</small>
            </label>

            <div className="team-settings-grid">
              <label>
                <span>Jeu principal</span>
                <select value={gameId} onChange={(event) => onGame(event.target.value)}>
                  <option value="">Aucun jeu spécifique</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>{game.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Nombre maximum de membres</span>
                <select
                  value={maxMembers}
                  onChange={(event) => onMax(Number(event.target.value))}
                >
                  {[2,3,4,5,6,7,8,9,10,11,12].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              className="team-primary"
              disabled={working || !name.trim()}
              onClick={onSave}
            >
              {working ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </div>
        ) : (
          <div className="team-readonly">
            <div>
              <span>Description</span>
              <strong>{squad.description || "Aucune description"}</strong>
            </div>
            <div>
              <span>Jeu</span>
              <strong>{squad.game_name || "Multi-jeux"}</strong>
            </div>
            <div>
              <span>Capacité</span>
              <strong>{squad.max_members} membres</strong>
            </div>
          </div>
        )}
      </section>

      <section className="team-card danger-card">
        <span className="team-kicker">ZONE DE GESTION</span>
        <h3>{isOwner ? "Dissoudre la team" : "Quitter la team"}</h3>
        <p>
          {isOwner
            ? "Si tu veux partir sans fermer la team, transfère d’abord le rôle de chef à un autre membre."
            : "Tu pourras rejoindre ou créer une autre team après ton départ."}
        </p>

        <button
          type="button"
          className="team-danger"
          onClick={isOwner ? onDissolve : onLeave}
        >
          {isOwner ? "Dissoudre définitivement" : "Quitter la team"}
        </button>
      </section>
    </div>
  );
}

function Tab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "active" : ""} onClick={onClick}>
      {label}
      {typeof count === "number" && count > 0 && <span>{count}</span>}
    </button>
  );
}

function Avatar({
  url,
  name,
  large = false,
}: {
  url: string | null;
  name: string;
  large?: boolean;
}) {
  return (
    <span className={`team-avatar ${large ? "large" : ""}`}>
      {url ? <img src={url} alt={name} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ConfirmModal({
  action,
  working,
  onClose,
  onConfirm,
}: {
  action:
    | { type: "dissolve" }
    | { type: "leave" }
    | { type: "kick"; member: Member }
    | { type: "transfer"; member: Member };
  working: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const content =
    action.type === "dissolve"
      ? ["Dissoudre la team ?", "La team sera fermée pour tous les membres.", "Dissoudre"]
      : action.type === "leave"
      ? ["Quitter la team ?", "Tu ne seras plus membre de cette team.", "Quitter"]
      : action.type === "kick"
      ? [`Exclure ${memberName(action.member)} ?`, "Ce membre sera retiré immédiatement.", "Exclure"]
      : [`Nommer ${memberName(action.member)} chef ?`, "Cette personne prendra le contrôle de la team.", "Transférer"];

  return (
    <div className="team-modal-backdrop" onMouseDown={onClose}>
      <section className="team-modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{content[0]}</h2>
        <p>{content[1]}</p>
        <div>
          <button type="button" disabled={working} onClick={onClose}>Annuler</button>
          <button type="button" className="danger" disabled={working} onClick={onConfirm}>
            {working ? "..." : content[2]}
          </button>
        </div>
      </section>
    </div>
  );
}

function memberName(member: Member) {
  return member.display_name || member.username || "Joueur GameMate";
}

function offlinePresence(userId: string): PresenceSnapshot {
  return {
    user_id: userId,
    status: "offline",
    custom_status: null,
    activity_game_id: null,
    activity_game_name: null,
    activity_text: null,
    last_seen_at: null,
  };
}

function presenceRank(status: PresenceStatus) {
  return status === "online" ? 0 : status === "away" ? 1 : status === "dnd" ? 2 : 3;
}

function profileName(profile: FriendProfile) {
  return profile.display_name || profile.username || "Joueur GameMate";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
