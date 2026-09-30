import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { VoiceSessionSnapshot } from "./SquadVoiceRoom";
import { Icon, type IconName } from "./Icon";
import { presenceActivity, type PresenceSnapshot, type PresenceStatus } from "../lib/presence";
import "./HomeDashboard.css";

type DashboardGame = {
  game_id: string;
  platform_id: string | null;
  is_primary: boolean;
  gameName: string;
  platformName: string | null;
};

type FriendProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
};

type OnlineFriend = FriendProfile & {
  presence: PresenceSnapshot;
};

type ConversationRow = {
  id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type ConversationPreview = {
  conversationId: string;
  profile: FriendProfile;
  message: MessageRow | null;
  unread: number;
  updatedAt: string;
};

type SquadMember = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type ActiveSquad = {
  squad_id: string;
  name: string;
  game_name: string | null;
  max_members: number;
  members: SquadMember[];
};

type UpcomingSession = {
  session_id: string;
  squad_id: string;
  squad_name: string;
  game_name: string | null;
  title: string;
  mode: string;
  starts_at: string;
  duration_minutes: number;
  max_players: number;
  going_count: number;
  maybe_count: number;
  my_response: "going" | "maybe" | "declined" | null;
};

type LfgPost = {
  post_id: string;
  owner_id: string;
  owner_display_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
  game_name: string;
  platform_name: string | null;
  title: string;
  mode_text: string | null;
  rank_text: string | null;
  starts_at: string;
  max_players: number;
  current_players: number;
  is_owner: boolean;
};

type DashboardData = {
  onlineFriends: OnlineFriend[];
  conversations: ConversationPreview[];
  squad: ActiveSquad | null;
  upcomingSession: UpcomingSession | null;
  recommendations: LfgPost[];
};

type Props = {
  session: Session;
  displayName: string;
  userGames: DashboardGame[];
  profileCompletion: number;
  pendingFriendRequests: number;
  unreadMessages: number;
  voiceSession: VoiceSessionSnapshot | null;
  onPlay: () => void;
  onFindMates: () => void;
  onSquads: () => void;
  onFriends: () => void;
  onMessages: () => void;
  onOpenMessage: (userId: string) => void;
  onProfile: () => void;
};

const EMPTY_DATA: DashboardData = {
  onlineFriends: [],
  conversations: [],
  squad: null,
  upcomingSession: null,
  recommendations: [],
};

export default function HomeDashboard({
  session,
  displayName,
  userGames,
  profileCompletion,
  pendingFriendRequests,
  unreadMessages,
  voiceSession,
  onPlay,
  onFindMates,
  onSquads,
  onFriends,
  onMessages,
  onOpenMessage,
  onProfile,
}: Props) {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const userId = session.user.id;
  const firstName = displayName.split(" ")[0] || displayName;
  const primaryGame = useMemo(
    () => userGames.find((game) => game.is_primary) ?? userGames[0] ?? null,
    [userGames]
  );

  const loadDashboard = useCallback(async (background = false) => {
    const requestId = ++requestIdRef.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    const [friendshipsResult, conversationsResult, squadResult, lfgResult, scheduleResult] = await Promise.all([
      supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      supabase
        .from("conversations")
        .select("id, user_a, user_b, updated_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase.rpc("get_my_squad_state"),
      supabase.rpc("get_lfg_feed_v8", {
        p_game_id: primaryGame ? Number(primaryGame.game_id) : null,
        p_scope: "all",
        p_limit: 8,
      }),
      supabase.rpc("get_my_scheduled_sessions_v12", {
        p_squad_id: null,
        p_limit: 1,
      }),
    ]);

    if (requestId !== requestIdRef.current) return;

    const errors = [
      friendshipsResult.error,
      conversationsResult.error,
      squadResult.error,
      lfgResult.error,
      scheduleResult.error,
    ].filter(Boolean);

    const friendships = (friendshipsResult.data ?? []) as FriendshipRow[];
    const conversations = (conversationsResult.data ?? []) as ConversationRow[];
    const friendIds = Array.from(new Set(friendships.map((row) => (
      row.requester_id === userId ? row.addressee_id : row.requester_id
    ))));
    const conversationUserIds = conversations.map((conversation) => (
      conversation.user_a === userId ? conversation.user_b : conversation.user_a
    ));
    const profileIds = Array.from(new Set([...friendIds, ...conversationUserIds]));
    const conversationIds = conversations.map((conversation) => conversation.id);

    let profiles: FriendProfile[] = [];
    let presenceRows: PresenceSnapshot[] = [];
    let messages: MessageRow[] = [];

    const [profilesResult, presenceResult, messagesResult] = await Promise.all([
      profileIds.length > 0
        ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      friendIds.length > 0
        ? supabase.rpc("get_presence_v15", { p_user_ids: friendIds })
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length > 0
        ? supabase
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at, read_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(160)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (requestId !== requestIdRef.current) return;

    if (profilesResult.error || presenceResult.error || messagesResult.error) {
      errors.push(profilesResult.error, presenceResult.error, messagesResult.error);
    }

    profiles = (profilesResult.data ?? []) as FriendProfile[];
    presenceRows = (presenceResult.data ?? []) as PresenceSnapshot[];
    messages = (messagesResult.data ?? []) as MessageRow[];

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const presenceMap = new Map(presenceRows.map((presence) => [presence.user_id, presence]));
    const onlineFriends = friendIds
      .map((friendId) => {
        const profile = profileMap.get(friendId);
        const presence = presenceMap.get(friendId);
        if (!profile || !presence || presence.status === "offline") return null;
        return { ...profile, presence } as OnlineFriend;
      })
      .filter((friend): friend is OnlineFriend => Boolean(friend))
      .sort((a, b) => presenceRank(a.presence.status) - presenceRank(b.presence.status));

    const latestMap = new Map<string, MessageRow>();
    const unreadMap = new Map<string, number>();
    for (const message of messages) {
      if (!latestMap.has(message.conversation_id)) latestMap.set(message.conversation_id, message);
      if (message.sender_id !== userId && !message.read_at) {
        unreadMap.set(message.conversation_id, (unreadMap.get(message.conversation_id) ?? 0) + 1);
      }
    }

    const conversationPreviews = conversations
      .map((conversation) => {
        const otherId = conversation.user_a === userId ? conversation.user_b : conversation.user_a;
        const profile = profileMap.get(otherId);
        if (!profile) return null;
        return {
          conversationId: conversation.id,
          profile,
          message: latestMap.get(conversation.id) ?? null,
          unread: unreadMap.get(conversation.id) ?? 0,
          updatedAt: latestMap.get(conversation.id)?.created_at ?? conversation.updated_at,
        };
      })
      .filter((preview): preview is ConversationPreview => Boolean(preview))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const squadPayload = squadResult.data as { active_squad?: ActiveSquad | null } | null;
    const lfgPosts = (lfgResult.data ?? []) as LfgPost[];
    const scheduledSessions = (scheduleResult.data ?? []) as UpcomingSession[];
    const externalPosts = lfgPosts.filter((post) => !post.is_owner);

    setData({
      onlineFriends,
      conversations: conversationPreviews,
      squad: squadPayload?.active_squad ?? null,
      upcomingSession: scheduledSessions[0] ?? null,
      recommendations: (externalPosts.length > 0 ? externalPosts : lfgPosts).slice(0, 4),
    });
    setError(errors.length > 0 ? "Certaines informations n’ont pas pu être actualisées." : "");
    setLoading(false);
    setRefreshing(false);
  }, [primaryGame, userId]);

  useEffect(() => {
    void loadDashboard();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadDashboard]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadDashboard(true), 260);
    };

    const channel = supabase
      .channel(`home-dashboard-v11:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "squads" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_members" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_sessions" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_session_responses" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_posts_v8" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_applications_v8" }, refreshSoon)
      .subscribe();

    const refreshOnFocus = () => void loadDashboard(true);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refreshOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [loadDashboard, userId]);

  function openPlanning() {
    sessionStorage.setItem("gamemate-open-squad-tab", "planning");
    window.dispatchEvent(new CustomEvent("gamemate:open-squad-tab", { detail: "planning" }));
    onSquads();
  }

  return (
    <div className="home-dashboard-v11">
      <section className="home-command-v11">
        <div className="home-command-copy-v11">
          <span className="home-kicker-v11">CENTRE DE JEU PERSONNALISÉ</span>
          <h1>Salut {firstName}.</h1>
          <p>
            {primaryGame
              ? `Ton espace pour lancer une session sur ${primaryGame.gameName}, retrouver tes mates et suivre ta squad.`
              : "Configure ton premier jeu pour personnaliser tes sessions et tes recommandations."}
          </p>
          <div className="home-command-actions-v11">
            <button type="button" className="primary" onClick={onPlay}><Icon name="play" size={16} /> Jouer maintenant</button>
            <button type="button" onClick={onFindMates}><Icon name="search" size={16} /> Trouver des mates</button>
          </div>
          <div className="home-live-metrics-v11">
            <button type="button" onClick={onFriends}><i className="online" /><strong>{data.onlineFriends.length}</strong><span>amis en ligne</span></button>
            <button type="button" onClick={onMessages}><i className="message" /><strong>{unreadMessages}</strong><span>messages non lus</span></button>
            <button type="button" onClick={onFriends}><i className="request" /><strong>{pendingFriendRequests}</strong><span>demandes reçues</span></button>
          </div>
        </div>

        <button type="button" className={`home-focus-v11 ${voiceSession ? "voice" : data.upcomingSession ? "scheduled" : ""}`} onClick={voiceSession ? onSquads : data.upcomingSession ? openPlanning : onPlay}>
          <span className="home-focus-orbit-v11"><i /><b />{voiceSession ? <Icon name="headphones" /> : data.upcomingSession ? <Icon name="calendar-clock" /> : primaryGame?.gameName.slice(0, 2).toUpperCase() ?? "GM"}</span>
          <span>
            <small>{voiceSession ? "VOCAL ACTIF" : data.upcomingSession ? "PROCHAINE SESSION" : "PROCHAINE ACTION"}</small>
            <strong>{voiceSession?.channelName ?? data.upcomingSession?.title ?? primaryGame?.gameName ?? "Compléter mon profil"}</strong>
            <em>
              {voiceSession
                ? `${voiceSession.participantCount || 1} connecté${voiceSession.participantCount > 1 ? "s" : ""} · ${voiceSession.muted ? "micro coupé" : "micro actif"}`
                : data.upcomingSession
                ? `${scheduleDateLabel(data.upcomingSession.starts_at)} · ${data.upcomingSession.going_count}/${data.upcomingSession.max_players} confirmés`
                : primaryGame?.platformName ?? "Ajoute ton jeu principal"}
            </em>
          </span>
          <Icon name="arrow-right" size={18} />
        </button>
      </section>

      {error && <div className="home-degraded-v11"><span><Icon name="alert-circle" /></span>{error}<button type="button" onClick={() => void loadDashboard()}>Réessayer</button></div>}

      <section className="home-shortcuts-v11">
        <button type="button" onClick={onPlay}><span><Icon name="play" /></span><strong>Play Now</strong><small>Lancer une recherche</small></button>
        <button type="button" onClick={onFindMates}><span><Icon name="search" /></span><strong>Annonces live</strong><small>Rejoindre un groupe</small></button>
        <button type="button" onClick={onSquads}><span><Icon name="users" /></span><strong>Ma squad</strong><small>{data.squad ? `${data.squad.members.length}/${data.squad.max_members} membres` : "Créer ou rejoindre"}</small></button>
        <button type="button" onClick={onMessages}><span><Icon name="message-circle" /></span><strong>Messages</strong><small>{unreadMessages > 0 ? `${unreadMessages} à lire` : "Tout est à jour"}</small></button>
      </section>

      <section className={`home-grid-v11 ${loading ? "is-loading" : ""}`}>
        <DashboardCard title="Amis connectés" kicker="EN LIGNE" action="Voir tous" onAction={onFriends} className="home-friends-v11">
          {loading ? <DashboardSkeleton rows={4} /> : data.onlineFriends.length > 0 ? (
            <div className="home-friend-list-v11">
              {data.onlineFriends.slice(0, 5).map((friend) => (
                <div key={friend.id} className="home-friend-v11">
                  <DashboardAvatar profile={friend} status={friend.presence.status} />
                  <span><strong>{profileName(friend)}</strong><small>{presenceActivity(friend.presence)}</small></span>
                  <button type="button" onClick={() => onOpenMessage(friend.id)} aria-label={`Écrire à ${profileName(friend)}`}><Icon name="message-circle" size={16} /></button>
                </div>
              ))}
            </div>
          ) : <DashboardEmpty icon="users" title="Aucun ami connecté" text="Tes amis apparaîtront ici dès qu’ils ouvriront GameMate." action="Voir mes amis" onAction={onFriends} />}
        </DashboardCard>

        <DashboardCard title="Messages récents" kicker="CONVERSATIONS" action="Tout ouvrir" onAction={onMessages} className="home-messages-v11">
          {loading ? <DashboardSkeleton rows={3} /> : data.conversations.length > 0 ? (
            <div className="home-conversation-list-v11">
              {data.conversations.slice(0, 4).map((conversation) => (
                <button type="button" key={conversation.conversationId} onClick={() => onOpenMessage(conversation.profile.id)}>
                  <DashboardAvatar profile={conversation.profile} />
                  <span><strong>{profileName(conversation.profile)}</strong><small>{conversation.message ? messagePreview(conversation.message.body) : "Conversation prête"}</small></span>
                  <em>{conversation.unread > 0 ? conversation.unread : relativeTime(conversation.updatedAt)}</em>
                </button>
              ))}
            </div>
          ) : <DashboardEmpty icon="message-circle" title="Aucune conversation" text="Trouve un mate et lance la discussion depuis son profil." action="Trouver des mates" onAction={onFindMates} />}
        </DashboardCard>

        <DashboardCard title="Squad active" kicker="TON GROUPE" action={data.squad ? "Ouvrir" : undefined} onAction={data.squad ? onSquads : undefined} className="home-squad-v11">
          {loading ? <DashboardSkeleton rows={3} /> : data.squad ? (
            <div className="home-squad-summary-v11">
              <div className="home-squad-emblem-v11"><Icon name="users" /></div>
              <div><h3>{data.squad.name}</h3><p>{data.squad.game_name ?? "Squad multigaming"}</p></div>
              <div className="home-squad-stack-v11">
                {data.squad.members.slice(0, 5).map((member) => (
                  <DashboardAvatar key={member.user_id} profile={{ id: member.user_id, username: member.username, display_name: member.display_name, avatar_url: member.avatar_url }} />
                ))}
                <span>{data.squad.members.length}/{data.squad.max_members}</span>
              </div>
              {data.upcomingSession && (
                <button type="button" className="home-next-session-v12" onClick={openPlanning}>
                  <span><small>PROCHAINE SESSION</small><strong>{data.upcomingSession.title}</strong></span>
                  <span><strong>{scheduleDateLabel(data.upcomingSession.starts_at)}</strong><small>{data.upcomingSession.going_count}/{data.upcomingSession.max_players} présents</small></span>
                </button>
              )}
              <button type="button" onClick={data.upcomingSession ? openPlanning : onSquads}>{data.upcomingSession ? "Ouvrir le planning" : "Rejoindre l’espace squad"} <Icon name="arrow-right" size={15} /></button>
            </div>
          ) : <DashboardEmpty icon="users" title="Aucune squad active" text="Crée une squad ou accepte une invitation pour jouer ensemble." action="Ouvrir les squads" onAction={onSquads} />}
        </DashboardCard>

        <DashboardCard title="Annonces recommandées" kicker={primaryGame?.gameName.toUpperCase() ?? "LFG EN DIRECT"} action="Voir le flux" onAction={onFindMates} className="home-lfg-v11">
          {loading ? <DashboardSkeleton rows={3} /> : data.recommendations.length > 0 ? (
            <div className="home-lfg-list-v11">
              {data.recommendations.slice(0, 3).map((post) => (
                <button type="button" key={post.post_id} onClick={onFindMates}>
                  <span className="home-lfg-game-v11">{post.game_name.slice(0, 2).toUpperCase()}</span>
                  <span className="home-lfg-copy-v11"><strong>{post.title}</strong><small>{post.owner_display_name || post.owner_username || "Joueur"} · {post.platform_name ?? "Toutes plateformes"}</small></span>
                  <span className="home-lfg-meta-v11"><strong>{post.current_players}/{post.max_players}</strong><small>{startLabel(post.starts_at)}</small></span>
                </button>
              ))}
            </div>
          ) : <DashboardEmpty icon="search" title="Aucune annonce maintenant" text={primaryGame ? `Il n’y a pas encore d’annonce ouverte pour ${primaryGame.gameName}.` : "Ajoute un jeu à ton profil pour recevoir des recommandations."} action={primaryGame ? "Créer une annonce" : "Configurer mon profil"} onAction={primaryGame ? onFindMates : onProfile} />}
        </DashboardCard>

        <DashboardCard title="Profil GameMate" kicker="PROGRESSION" action="Modifier" onAction={onProfile} className="home-profile-v11">
          <button type="button" className="home-profile-progress-v11" onClick={onProfile}>
            <span style={{ "--dashboard-progress": `${profileCompletion * 3.6}deg` } as React.CSSProperties}><strong>{profileCompletion}%</strong></span>
            <div>
              <strong>{profileCompletion === 100 ? "Profil complet" : profileAction(profileCompletion, userGames.length)}</strong>
              <small>{profileCompletion === 100 ? "Ton matching utilise toutes tes préférences." : "Un profil précis améliore les recommandations et la compatibilité."}</small>
            </div>
            <Icon name="chevron-right" size={18} />
          </button>
        </DashboardCard>
      </section>

      {refreshing && <span className="home-refreshing-v11">Synchronisation…</span>}
    </div>
  );
}

function DashboardCard({
  title,
  kicker,
  action,
  onAction,
  className,
  children,
}: {
  title: string;
  kicker: string;
  action?: string;
  onAction?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`home-card-v11 ${className}`}>
      <header><div><small>{kicker}</small><h2>{title}</h2></div>{action && onAction && <button type="button" onClick={onAction}>{action} <Icon name="chevron-right" size={14} /></button>}</header>
      {children}
    </article>
  );
}

function DashboardAvatar({ profile, status }: { profile: FriendProfile; status?: PresenceStatus }) {
  return (
    <span className="home-avatar-v11">
      {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : profileName(profile).slice(0, 1).toUpperCase()}
      {status && <i className={status} />}
    </span>
  );
}

function presenceRank(status: PresenceStatus) {
  return status === "online" ? 0 : status === "away" ? 1 : status === "dnd" ? 2 : 3;
}

function DashboardEmpty({ icon, title, text, action, onAction }: { icon: IconName; title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="home-empty-v11"><span><Icon name={icon} /></span><strong>{title}</strong><p>{text}</p><button type="button" onClick={onAction}>{action}</button></div>
  );
}

function DashboardSkeleton({ rows }: { rows: number }) {
  return <div className="home-skeleton-v11">{Array.from({ length: rows }, (_, index) => <i key={index} />)}</div>;
}

function profileName(profile: FriendProfile) {
  return profile.display_name || profile.username || "Joueur";
}

function messagePreview(body: string) {
  return body.includes("\n[gm-voice:v1]") ? "🎙️ Message vocal" : body;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

function startLabel(value: string) {
  const start = new Date(value);
  const minutes = Math.round((start.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "Maintenant";
  if (minutes < 60) return `Dans ${minutes} min`;
  if (minutes < 24 * 60) return `Dans ${Math.round(minutes / 60)} h`;
  return start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function scheduleDateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();
  const day = sameDay(date, today) ? "Aujourd’hui" : sameDay(date, tomorrow) ? "Demain" : date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
  return `${day} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function profileAction(completion: number, gameCount: number) {
  if (gameCount === 0) return "Ajoute ton premier jeu";
  if (completion < 50) return "Continue la configuration";
  if (completion < 80) return "Précise ton style de jeu";
  return "Finalise les derniers détails";
}
