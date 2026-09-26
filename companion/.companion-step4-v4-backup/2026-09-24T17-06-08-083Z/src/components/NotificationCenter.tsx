import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playNotificationSound } from "../lib/audio";
import "./NotificationCenter.css";

type Props = {
  session: Session | null;
  totalCount: number;
  onOpenFriends: () => void;
  onOpenMessage: (userId: string) => void;
  onOpenSquads: () => void;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
};

type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type SquadInvite = {
  id: string;
  squad_id: string;
  sender_id: string;
  recipient_id: string;
  status: string;
  created_at: string;
};

type SquadMeta = {
  id: string;
  name: string;
  game_id: number | null;
};

type SquadSessionNotificationRow = {
  id: string;
  squad_id: string;
  session_id: string;
  recipient_id: string;
  kind: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type FriendNotification = {
  kind: "friend";
  id: string;
  createdAt: string;
  profile: Profile;
};

type MessageNotification = {
  kind: "message";
  id: string;
  createdAt: string;
  profile: Profile;
  count: number;
  preview: string;
};

type SquadNotification = {
  kind: "squad";
  id: string;
  createdAt: string;
  profile: Profile;
  squadName: string;
};

type GameSessionNotification = {
  kind: "game_session";
  id: string;
  createdAt: string;
  squadId: string;
  title: string;
  message: string;
};

type NotificationItem =
  | FriendNotification
  | MessageNotification
  | SquadNotification
  | GameSessionNotification;

export default function NotificationCenter({
  session,
  totalCount,
  onOpenFriends,
  onOpenMessage,
  onOpenSquads,
}: Props) {
  const [open, setOpen] = useState(false);
  const [friendRequests, setFriendRequests] = useState<FriendNotification[]>([]);
  const [messageNotifications, setMessageNotifications] = useState<MessageNotification[]>([]);
  const [squadNotifications, setSquadNotifications] = useState<SquadNotification[]>([]);
  const [gameSessionNotifications, setGameSessionNotifications] = useState<GameSessionNotification[]>([]);
  const [squadCount, setSquadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [acceptedFriend, setAcceptedFriend] = useState<Profile | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const soundReadyRef = useRef(false);
  const previousTotalRef = useRef(0);

  const userId = session?.user?.id ?? null;
  const effectiveTotal = totalCount + squadCount;

  const loadSquadCount = useCallback(async () => {
    if (!userId) {
      setSquadCount(0);
      return;
    }

    const [inviteResult, sessionResult] = await Promise.all([
      supabase
        .from("squad_invites")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("status", "pending"),
      supabase
        .from("squad_session_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null),
    ]);

    if (!inviteResult.error) {
      setSquadCount((inviteResult.count ?? 0) + (sessionResult.error ? 0 : sessionResult.count ?? 0));
    }
  }, [userId]);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setFriendRequests([]);
      setMessageNotifications([]);
      setSquadNotifications([]);
      setGameSessionNotifications([]);
      setSquadCount(0);
      return;
    }

    setLoading(true);
    setError("");

    const [friendshipsResult, conversationsResult, squadInvitesResult, gameSessionsResult] =
      await Promise.all([
        supabase
          .from("friendships")
          .select("id, requester_id, addressee_id, status, created_at")
          .eq("addressee_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase
          .from("conversations")
          .select("id, user_a, user_b")
          .or(`user_a.eq.${userId},user_b.eq.${userId}`),
        supabase
          .from("squad_invites")
          .select("id, squad_id, sender_id, recipient_id, status, created_at")
          .eq("recipient_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase
          .from("squad_session_notifications")
          .select("id, squad_id, session_id, recipient_id, kind, title, message, read_at, created_at")
          .eq("recipient_id", userId)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (friendshipsResult.error || conversationsResult.error || squadInvitesResult.error) {
      console.error(
        "Notifications:",
        friendshipsResult.error,
        conversationsResult.error,
        squadInvitesResult.error
      );
      setError("Impossible de charger toutes les notifications.");
      setLoading(false);
      return;
    }

    const friendships = (friendshipsResult.data ?? []) as Friendship[];
    const conversations = (conversationsResult.data ?? []) as Conversation[];
    const squadInvites = (squadInvitesResult.data ?? []) as SquadInvite[];
    const gameSessionRows = gameSessionsResult.error
      ? []
      : ((gameSessionsResult.data ?? []) as SquadSessionNotificationRow[]);
    setSquadCount(squadInvites.length + gameSessionRows.length);

    const conversationIds = conversations.map((conversation) => conversation.id);
    let unreadMessages: Message[] = [];

    if (conversationIds.length > 0) {
      const { data, error: messagesError } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, read_at")
        .in("conversation_id", conversationIds)
        .neq("sender_id", userId)
        .is("read_at", null)
        .order("created_at", { ascending: false });

      if (messagesError) {
        console.error("Notifications / unread messages:", messagesError);
        setError("Impossible de charger les messages non lus.");
        setLoading(false);
        return;
      }

      unreadMessages = (data ?? []) as Message[];
    }

    const profileIds = Array.from(
      new Set([
        ...friendships.map((request) => request.requester_id),
        ...unreadMessages.map((message) => message.sender_id),
        ...squadInvites.map((invite) => invite.sender_id),
      ])
    );

    let profileMap = new Map<string, Profile>();

    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", profileIds);

      if (profilesError) {
        console.error("Notifications / profiles:", profilesError);
        setError("Impossible de charger certains profils.");
        setLoading(false);
        return;
      }

      profileMap = new Map(
        ((profiles ?? []) as Profile[]).map((profile) => [profile.id, profile])
      );
    }

    const squadIds = Array.from(new Set(squadInvites.map((invite) => invite.squad_id)));
    let squadMap = new Map<string, SquadMeta>();

    if (squadIds.length > 0) {
      const { data: squads, error: squadsError } = await supabase
        .from("squads")
        .select("id, name, game_id")
        .in("id", squadIds);

      if (!squadsError) {
        squadMap = new Map(
          ((squads ?? []) as SquadMeta[]).map((squad) => [squad.id, squad])
        );
      }
    }

    setFriendRequests(
      friendships
        .map((request) => {
          const profile = profileMap.get(request.requester_id);
          return profile
            ? {
                kind: "friend" as const,
                id: request.id,
                createdAt: request.created_at,
                profile,
              }
            : null;
        })
        .filter((value): value is FriendNotification => Boolean(value))
    );

    const groupedMessages = new Map<
      string,
      { profile: Profile; count: number; latest: Message }
    >();

    for (const message of unreadMessages) {
      const profile = profileMap.get(message.sender_id);
      if (!profile) continue;

      const existing = groupedMessages.get(message.sender_id);

      if (!existing) {
        groupedMessages.set(message.sender_id, {
          profile,
          count: 1,
          latest: message,
        });
      } else {
        existing.count += 1;
      }
    }

    setMessageNotifications(
      Array.from(groupedMessages.entries()).map(([senderId, group]) => ({
        kind: "message" as const,
        id: senderId,
        createdAt: group.latest.created_at,
        profile: group.profile,
        count: group.count,
        preview: group.latest.body,
      }))
    );

    setSquadNotifications(
      squadInvites
        .map((invite) => {
          const profile = profileMap.get(invite.sender_id);
          const squad = squadMap.get(invite.squad_id);

          return profile
            ? {
                kind: "squad" as const,
                id: invite.id,
                createdAt: invite.created_at,
                profile,
                squadName: squad?.name || "Squad GameMate",
              }
            : null;
        })
        .filter((value): value is SquadNotification => Boolean(value))
    );

    setGameSessionNotifications(
      gameSessionRows.map((notification) => ({
        kind: "game_session" as const,
        id: notification.id,
        createdAt: notification.created_at,
        squadId: notification.squad_id,
        title: notification.title,
        message: notification.message,
      }))
    );

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadSquadCount();
  }, [loadSquadCount]);

  useEffect(() => {
    if (open) void loadNotifications();
  }, [open, loadNotifications]);

  useEffect(() => {
    if (!session) {
      soundReadyRef.current = false;
      previousTotalRef.current = 0;
      return;
    }

    if (!soundReadyRef.current) {
      previousTotalRef.current = effectiveTotal;
      soundReadyRef.current = true;
      return;
    }

    if (effectiveTotal > previousTotalRef.current) {
      playNotificationSound();
    }

    previousTotalRef.current = effectiveTotal;
  }, [session, effectiveTotal]);

  useEffect(() => {
    if (!userId) return;

    const friendshipChannel = supabase
      .channel(`global-notifications-friends:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        if (open) void loadNotifications();
      })
      .subscribe();

    const messageChannel = supabase
      .channel(`global-notifications-messages:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        if (open) void loadNotifications();
      })
      .subscribe();

    const squadChannel = supabase
      .channel(`global-notifications-squads:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_invites" }, () => {
        void loadSquadCount();
        if (open) void loadNotifications();
      })
      .subscribe();

    const gameSessionChannel = supabase
      .channel(`global-notifications-game-sessions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "squad_session_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void loadSquadCount();
          if (open) void loadNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(friendshipChannel);
      void supabase.removeChannel(messageChannel);
      void supabase.removeChannel(squadChannel);
      void supabase.removeChannel(gameSessionChannel);
    };
  }, [userId, open, loadNotifications, loadSquadCount]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (open && rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const items = useMemo<NotificationItem[]>(
    () =>
      [...friendRequests, ...messageNotifications, ...squadNotifications, ...gameSessionNotifications]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 14),
    [friendRequests, messageNotifications, squadNotifications, gameSessionNotifications]
  );

  async function respondFriendRequest(item: FriendNotification, accept: boolean) {
    setWorkingId(item.id);
    setError("");
    const { error: responseError } = await supabase.rpc("respond_friend_request", {
      p_request_id: item.id,
      p_accept: accept,
    });

    if (responseError) setError("Impossible de répondre à la demande.");
    else {
      setAcceptedFriend(accept ? item.profile : null);
      window.dispatchEvent(new CustomEvent("gamemate:social-refresh"));
      await loadNotifications();
    }

    setWorkingId(null);
  }

  async function respondSquadInvite(id: string, accept: boolean) {
    setWorkingId(id);
    const { error: responseError } = await supabase.rpc(
      "respond_to_squad_invite",
      {
        p_invite_id: id,
        p_accept: accept,
      }
    );

    if (responseError) {
      setError(
        responseError.message.includes("already_in_active_squad")
          ? "Tu es déjà dans une squad active."
          : "Impossible de répondre à l’invitation."
      );
    } else {
      window.dispatchEvent(new CustomEvent("gamemate:social-refresh"));
      await loadNotifications();
      await loadSquadCount();
      if (accept) {
        setOpen(false);
        onOpenSquads();
      }
    }

    setWorkingId(null);
  }

  async function openGameSessionNotification(id: string) {
    setWorkingId(id);
    const { error: updateError } = await supabase
      .from("squad_session_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_id", userId);

    if (updateError) setError("Impossible de marquer cette notification comme lue.");
    else {
      setOpen(false);
      await loadSquadCount();
      sessionStorage.setItem("gamemate-open-squad-tab", "session");
      window.dispatchEvent(
        new CustomEvent("gamemate:open-squad-tab", { detail: "session" })
      );
      onOpenSquads();
    }

    setWorkingId(null);
  }

  if (!session) return null;

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className={`notification-bell ${open ? "active" : ""}`}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => {
          if (!value) setAcceptedFriend(null);
          return !value;
        })}
      >
        <BellIcon />
        {effectiveTotal > 0 && (
          <span className="notification-badge">
            {effectiveTotal > 99 ? "99+" : effectiveTotal}
          </span>
        )}
      </button>

      {open && (
        <section className="notification-panel">
          <header className="notification-panel-head">
            <div>
              <span>ACTIVITÉ GAMEMATE</span>
              <h2>Notifications</h2>
            </div>
            <strong>{effectiveTotal}</strong>
          </header>

          {error && <div className="notification-error">{error}</div>}
          {acceptedFriend && (
            <div className="notification-success">
              <span><strong>{profileName(acceptedFriend)}</strong> est maintenant dans tes amis.</span>
              <button type="button" onClick={() => {
                setOpen(false);
                onOpenMessage(acceptedFriend.id);
              }}>Message</button>
            </div>
          )}

          <div className="notification-list">
            {loading ? (
              <div className="notification-empty">
                <span className="notification-loader" />
                <p>Chargement...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="notification-empty">
                <div className="notification-empty-icon">✓</div>
                <strong>Tout est calme.</strong>
                <p>Tu n’as aucune notification en attente.</p>
              </div>
            ) : (
              items.map((item) => {
                if (item.kind === "friend") {
                  return (
                    <FriendItem
                      key={`friend-${item.id}`}
                      item={item}
                      working={workingId === item.id}
                      onAccept={() => void respondFriendRequest(item, true)}
                      onReject={() => void respondFriendRequest(item, false)}
                      onOpen={() => {
                        setOpen(false);
                        onOpenFriends();
                      }}
                    />
                  );
                }

                if (item.kind === "squad") {
                  return (
                    <SquadItem
                      key={`squad-${item.id}`}
                      item={item}
                      working={workingId === item.id}
                      onAccept={() => void respondSquadInvite(item.id, true)}
                      onReject={() => void respondSquadInvite(item.id, false)}
                      onOpen={() => {
                        setOpen(false);
                        onOpenSquads();
                      }}
                    />
                  );
                }

                if (item.kind === "game_session") {
                  return (
                    <GameSessionItem
                      key={`game-session-${item.id}`}
                      item={item}
                      working={workingId === item.id}
                      onOpen={() => void openGameSessionNotification(item.id)}
                    />
                  );
                }

                return (
                  <MessageItem
                    key={`message-${item.id}`}
                    item={item}
                    onOpen={() => {
                      setOpen(false);
                      onOpenMessage(item.profile.id);
                    }}
                  />
                );
              })
            )}
          </div>

          <footer className="notification-panel-foot three">
            <button type="button" onClick={() => { setOpen(false); onOpenFriends(); }}>
              Amis
            </button>
            <button type="button" onClick={() => { setOpen(false); onOpenSquads(); }}>
              Squads
            </button>
            <button
              type="button"
              disabled={messageNotifications.length === 0}
              onClick={() => {
                const first = messageNotifications[0];
                if (first) {
                  setOpen(false);
                  onOpenMessage(first.profile.id);
                }
              }}
            >
              Messages
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}

function FriendItem({
  item,
  working,
  onAccept,
  onReject,
  onOpen,
}: {
  item: FriendNotification;
  working: boolean;
  onAccept: () => void;
  onReject: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="notification-item">
      <button type="button" className="notification-item-main" onClick={onOpen}>
        <Avatar profile={item.profile} />
        <span className="notification-item-copy">
          <strong>{profileName(item.profile)}</strong>
          <span>t’a envoyé une demande d’ami.</span>
          <small>{relativeTime(item.createdAt)}</small>
        </span>
        <i className="notification-type friend">AMI</i>
      </button>
      <div className="notification-actions">
        <button className="accept" disabled={working} onClick={onAccept}>Accepter</button>
        <button disabled={working} onClick={onReject}>Refuser</button>
      </div>
    </article>
  );
}

function SquadItem({
  item,
  working,
  onAccept,
  onReject,
  onOpen,
}: {
  item: SquadNotification;
  working: boolean;
  onAccept: () => void;
  onReject: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="notification-item">
      <button type="button" className="notification-item-main" onClick={onOpen}>
        <Avatar profile={item.profile} />
        <span className="notification-item-copy">
          <strong>{profileName(item.profile)}</strong>
          <span>t’invite dans « {item.squadName} ».</span>
          <small>{relativeTime(item.createdAt)}</small>
        </span>
        <i className="notification-type squad">SQUAD</i>
      </button>
      <div className="notification-actions">
        <button className="accept" disabled={working} onClick={onAccept}>Rejoindre</button>
        <button disabled={working} onClick={onReject}>Refuser</button>
      </div>
    </article>
  );
}

function MessageItem({
  item,
  onOpen,
}: {
  item: MessageNotification;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="notification-item notification-message" onClick={onOpen}>
      <Avatar profile={item.profile} />
      <span className="notification-item-copy">
        <strong>{profileName(item.profile)}</strong>
        <span>
          {item.count === 1
            ? "t’a envoyé un nouveau message."
            : `t’a envoyé ${item.count} nouveaux messages.`}
        </span>
        <small className="notification-preview">{item.preview}</small>
      </span>
      <span className="notification-message-count">{item.count}</span>
    </button>
  );
}

function GameSessionItem({
  item,
  working,
  onOpen,
}: {
  item: GameSessionNotification;
  working: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="notification-item notification-session"
      disabled={working}
      onClick={onOpen}
    >
      <span className="notification-session-icon">▶</span>
      <span className="notification-item-copy">
        <strong>{item.title}</strong>
        <span>{item.message}</span>
        <small>{relativeTime(item.createdAt)}</small>
      </span>
      <i className="notification-type session">PARTIE</i>
    </button>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  const name = profileName(profile);
  return (
    <span className="notification-avatar">
      {profile.avatar_url ? <img src={profile.avatar_url} alt={name} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function profileName(profile: Profile) {
  return profile.display_name || profile.username || "Joueur GameMate";
}

function relativeTime(value: string) {
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "À l’instant";
  if (diff < hour) return `Il y a ${Math.floor(diff / minute)} min`;
  if (diff < day) return `Il y a ${Math.floor(diff / hour)} h`;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}
