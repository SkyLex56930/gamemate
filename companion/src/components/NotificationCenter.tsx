import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playNotificationSound } from "../lib/audio";
import { Icon } from "./Icon";
import "./NotificationCenter.css";

type Props = {
  session: Session | null;
  totalCount: number;
  onOpenFriends: () => void;
  onOpenMessage: (userId: string) => void;
  onOpenSquads: () => void;
  onOpenFindMates: () => void;
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

type ScheduledSessionNotificationRow = {
  id: string;
  squad_id: string;
  scheduled_session_id: string;
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
  targetTab: "session" | "planning";
};

type LfgNotificationRow = {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  actor_id: string | null;
  actor_display_name: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  entity_type: string;
  entity_id: string | null;
  action_target: string;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type LfgNotification = {
  kind: "lfg";
  id: string;
  createdAt: string;
  title: string;
  body: string;
  eventKind: string;
  actor: Profile;
  actionTarget: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
};

type DeferredSocialAction = {
  id: string;
  kind: "friend_request" | "squad_invite";
  source_id: string;
  deferred_at: string;
};

type DeferredFriendNotification = FriendNotification & {
  queueId: string;
  deferredAt: string;
};

type DeferredSquadNotification = SquadNotification & {
  queueId: string;
  deferredAt: string;
};

type DeferredNotificationItem = DeferredFriendNotification | DeferredSquadNotification;

type NotificationItem =
  | FriendNotification
  | MessageNotification
  | SquadNotification
  | GameSessionNotification
  | LfgNotification;

export default function NotificationCenter({
  session,
  totalCount,
  onOpenFriends,
  onOpenMessage,
  onOpenSquads,
  onOpenFindMates,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"now" | "later">("now");
  const [friendRequests, setFriendRequests] = useState<FriendNotification[]>([]);
  const [messageNotifications, setMessageNotifications] = useState<MessageNotification[]>([]);
  const [squadNotifications, setSquadNotifications] = useState<SquadNotification[]>([]);
  const [gameSessionNotifications, setGameSessionNotifications] = useState<GameSessionNotification[]>([]);
  const [lfgNotifications, setLfgNotifications] = useState<LfgNotification[]>([]);
  const [laterFriendRequests, setLaterFriendRequests] = useState<DeferredFriendNotification[]>([]);
  const [laterSquadNotifications, setLaterSquadNotifications] = useState<DeferredSquadNotification[]>([]);
  const [deferredFriendCount, setDeferredFriendCount] = useState(0);
  const [squadCount, setSquadCount] = useState(0);
  const [lfgCount, setLfgCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [acceptedFriend, setAcceptedFriend] = useState<Profile | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const soundReadyRef = useRef(false);
  const previousTotalRef = useRef(0);

  const userId = session?.user?.id ?? null;
  const effectiveTotal = Math.max(0, totalCount - deferredFriendCount) + squadCount + lfgCount;
  const laterCount = laterFriendRequests.length + laterSquadNotifications.length;

  const loadSquadCount = useCallback(async () => {
    if (!userId) {
      setSquadCount(0);
      setDeferredFriendCount(0);
      setLfgCount(0);
      return;
    }

    const [inviteResult, sessionResult, scheduledResult, deferredResult, friendResult, lfgCountResult] = await Promise.all([
      supabase
        .from("squad_invites")
        .select("id")
        .eq("recipient_id", userId)
        .eq("status", "pending"),
      supabase
        .from("squad_session_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null),
      supabase
        .from("squad_scheduled_session_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null),
      supabase
        .from("deferred_social_actions")
        .select("kind, source_id")
        .eq("user_id", userId),
      supabase
        .from("friendships")
        .select("id")
        .eq("addressee_id", userId)
        .eq("status", "pending"),
      supabase.rpc("get_unread_notification_count_v9"),
    ]);

    if (!inviteResult.error && !deferredResult.error && !friendResult.error) {
      const deferred = (deferredResult.data ?? []) as Pick<DeferredSocialAction, "kind" | "source_id">[];
      const deferredFriendIds = new Set(
        deferred.filter((row) => row.kind === "friend_request").map((row) => row.source_id)
      );
      const deferredSquadIds = new Set(
        deferred.filter((row) => row.kind === "squad_invite").map((row) => row.source_id)
      );
      const activeSquadInvites = (inviteResult.data ?? []).filter(
        (invite) => !deferredSquadIds.has(invite.id)
      ).length;
      const activeDeferredFriendCount = (friendResult.data ?? []).filter(
        (request) => deferredFriendIds.has(request.id)
      ).length;
      setDeferredFriendCount(activeDeferredFriendCount);
      setSquadCount(
        activeSquadInvites
        + (sessionResult.error ? 0 : sessionResult.count ?? 0)
        + (scheduledResult.error ? 0 : scheduledResult.count ?? 0)
      );
    }

    if (lfgCountResult.error) {
      console.error("Notifications LFG / compteur:", lfgCountResult.error);
      setLfgCount(0);
    } else {
      setLfgCount(Number(lfgCountResult.data ?? 0));
    }
  }, [userId]);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setFriendRequests([]);
      setMessageNotifications([]);
      setSquadNotifications([]);
      setGameSessionNotifications([]);
      setLfgNotifications([]);
      setLaterFriendRequests([]);
      setLaterSquadNotifications([]);
      setDeferredFriendCount(0);
      setSquadCount(0);
      setLfgCount(0);
      return;
    }

    setLoading(true);
    setError("");

    const [friendshipsResult, conversationsResult, squadInvitesResult, gameSessionsResult, scheduledSessionsResult, deferredResult, lfgResult] =
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
        supabase
          .from("squad_scheduled_session_notifications")
          .select("id, squad_id, scheduled_session_id, recipient_id, kind, title, message, read_at, created_at")
          .eq("recipient_id", userId)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("deferred_social_actions")
          .select("id, kind, source_id, deferred_at")
          .eq("user_id", userId)
          .order("deferred_at", { ascending: false }),
        supabase.rpc("get_my_notifications_v9", {
          p_limit: 30,
          p_before: null,
        }),
      ]);

    if (friendshipsResult.error || conversationsResult.error || squadInvitesResult.error || deferredResult.error) {
      console.error(
        "Notifications:",
        friendshipsResult.error,
        conversationsResult.error,
        squadInvitesResult.error,
        deferredResult.error
      );
      setError("Impossible de charger toutes les notifications.");
      setLoading(false);
      return;
    }

    const friendships = (friendshipsResult.data ?? []) as Friendship[];
    const conversations = (conversationsResult.data ?? []) as Conversation[];
    const squadInvites = (squadInvitesResult.data ?? []) as SquadInvite[];
    const deferredRows = (deferredResult.data ?? []) as DeferredSocialAction[];
    const deferredBySource = new Map(deferredRows.map((row) => [`${row.kind}:${row.source_id}`, row]));
    const gameSessionRows = gameSessionsResult.error
      ? []
      : ((gameSessionsResult.data ?? []) as SquadSessionNotificationRow[]);
    const scheduledSessionRows = scheduledSessionsResult.error
      ? []
      : ((scheduledSessionsResult.data ?? []) as ScheduledSessionNotificationRow[]);
    const lfgRows = lfgResult.error
      ? []
      : ((lfgResult.data ?? []) as LfgNotificationRow[]);

    if (lfgResult.error) {
      console.error("Notifications LFG:", lfgResult.error);
    }
    const deferredFriendIds = new Set(
      deferredRows.filter((row) => row.kind === "friend_request").map((row) => row.source_id)
    );
    const deferredSquadIds = new Set(
      deferredRows.filter((row) => row.kind === "squad_invite").map((row) => row.source_id)
    );
    setDeferredFriendCount(friendships.filter((request) => deferredFriendIds.has(request.id)).length);
    setSquadCount(
      squadInvites.filter((invite) => !deferredSquadIds.has(invite.id)).length
      + gameSessionRows.length
      + scheduledSessionRows.length
    );

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

    const activeFriendItems: FriendNotification[] = [];
    const deferredFriendItems: DeferredFriendNotification[] = [];

    for (const request of friendships) {
      const profile = profileMap.get(request.requester_id);
      if (!profile) continue;
      const item: FriendNotification = {
        kind: "friend",
        id: request.id,
        createdAt: request.created_at,
        profile,
      };
      const deferred = deferredBySource.get(`friend_request:${request.id}`);
      if (deferred) {
        deferredFriendItems.push({ ...item, queueId: deferred.id, deferredAt: deferred.deferred_at });
      } else {
        activeFriendItems.push(item);
      }
    }

    setFriendRequests(activeFriendItems);
    setLaterFriendRequests(deferredFriendItems);

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

    const activeSquadItems: SquadNotification[] = [];
    const deferredSquadItems: DeferredSquadNotification[] = [];

    for (const invite of squadInvites) {
      const profile = profileMap.get(invite.sender_id);
      if (!profile) continue;
      const squad = squadMap.get(invite.squad_id);
      const item: SquadNotification = {
        kind: "squad",
        id: invite.id,
        createdAt: invite.created_at,
        profile,
        squadName: squad?.name || "Squad GameMate",
      };
      const deferred = deferredBySource.get(`squad_invite:${invite.id}`);
      if (deferred) {
        deferredSquadItems.push({ ...item, queueId: deferred.id, deferredAt: deferred.deferred_at });
      } else {
        activeSquadItems.push(item);
      }
    }

    setSquadNotifications(activeSquadItems);
    setLaterSquadNotifications(deferredSquadItems);

    setGameSessionNotifications(
      [
        ...gameSessionRows.map((notification) => ({
          kind: "game_session" as const,
          id: notification.id,
          createdAt: notification.created_at,
          squadId: notification.squad_id,
          title: notification.title,
          message: notification.message,
          targetTab: "session" as const,
        })),
        ...scheduledSessionRows.map((notification) => ({
          kind: "game_session" as const,
          id: notification.id,
          createdAt: notification.created_at,
          squadId: notification.squad_id,
          title: notification.title,
          message: notification.message,
          targetTab: "planning" as const,
        })),
      ]
    );

    setLfgNotifications(
      lfgRows.map((notification) => ({
        kind: "lfg" as const,
        id: notification.notification_id,
        createdAt: notification.created_at,
        title: notification.title,
        body: notification.body,
        eventKind: notification.kind,
        actor: {
          id: notification.actor_id ?? notification.notification_id,
          username: notification.actor_username,
          display_name: notification.actor_display_name,
          avatar_url: notification.actor_avatar_url,
        },
        actionTarget: notification.action_target,
        metadata: notification.metadata ?? {},
        readAt: notification.read_at,
      }))
    );

    const liveDeferredKeys = new Set([
      ...friendships.map((request) => `friend_request:${request.id}`),
      ...squadInvites.map((invite) => `squad_invite:${invite.id}`),
    ]);
    const staleQueueIds = deferredRows
      .filter((row) => !liveDeferredKeys.has(`${row.kind}:${row.source_id}`))
      .map((row) => row.id);
    if (staleQueueIds.length > 0) {
      void supabase
        .from("deferred_social_actions")
        .delete()
        .eq("user_id", userId)
        .in("id", staleQueueIds);
    }

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
        void loadSquadCount();
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

    const scheduledSessionChannel = supabase
      .channel(`global-notifications-scheduled-sessions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "squad_scheduled_session_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void loadSquadCount();
          if (open) void loadNotifications();
        }
      )
      .subscribe();

    const deferredChannel = supabase
      .channel(`global-notifications-deferred:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deferred_social_actions",
        },
        () => {
          void loadSquadCount();
          if (open) void loadNotifications();
        }
      )
      .subscribe();

    const lfgNotificationChannel = supabase
      .channel(`global-notifications-lfg:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications_v9",
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
      void supabase.removeChannel(scheduledSessionChannel);
      void supabase.removeChannel(deferredChannel);
      void supabase.removeChannel(lfgNotificationChannel);
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
      [
        ...friendRequests,
        ...messageNotifications,
        ...squadNotifications,
        ...gameSessionNotifications,
        ...lfgNotifications,
      ]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 30),
    [friendRequests, messageNotifications, squadNotifications, gameSessionNotifications, lfgNotifications]
  );

  const laterItems = useMemo<DeferredNotificationItem[]>(
    () => [...laterFriendRequests, ...laterSquadNotifications]
      .sort((a, b) => new Date(b.deferredAt).getTime() - new Date(a.deferredAt).getTime()),
    [laterFriendRequests, laterSquadNotifications]
  );

  async function clearDeferred(kind: DeferredSocialAction["kind"], sourceId: string) {
    if (!userId) return;
    await supabase
      .from("deferred_social_actions")
      .delete()
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("source_id", sourceId);
  }

  async function deferNotification(kind: DeferredSocialAction["kind"], sourceId: string) {
    if (!userId) return;
    setWorkingId(sourceId);
    setError("");

    const { error: deferError } = await supabase
      .from("deferred_social_actions")
      .insert({ user_id: userId, kind, source_id: sourceId });

    if (deferError && deferError.code !== "23505") {
      console.error("Après ma game:", deferError);
      setError("Impossible d’ajouter cette invitation à Après ma game.");
    } else {
      window.dispatchEvent(new CustomEvent("gamemate:deferred-social-changed"));
      await Promise.all([loadNotifications(), loadSquadCount()]);
      setView("later");
    }

    setWorkingId(null);
  }

  async function restoreNotification(queueId: string) {
    if (!userId) return;
    setWorkingId(queueId);
    setError("");

    const { error: restoreError } = await supabase
      .from("deferred_social_actions")
      .delete()
      .eq("id", queueId)
      .eq("user_id", userId);

    if (restoreError) {
      setError("Impossible de remettre cette invitation dans Maintenant.");
    } else {
      window.dispatchEvent(new CustomEvent("gamemate:deferred-social-changed"));
      await Promise.all([loadNotifications(), loadSquadCount()]);
      setView("now");
    }

    setWorkingId(null);
  }

  async function respondFriendRequest(item: FriendNotification, accept: boolean) {
    setWorkingId(item.id);
    setError("");
    const { error: responseError } = await supabase.rpc("respond_friend_request", {
      p_request_id: item.id,
      p_accept: accept,
    });

    if (responseError) setError("Impossible de répondre à la demande.");
    else {
      await clearDeferred("friend_request", item.id);
      setAcceptedFriend(accept ? item.profile : null);
      window.dispatchEvent(new CustomEvent("gamemate:social-refresh"));
      window.dispatchEvent(new CustomEvent("gamemate:deferred-social-changed"));
      await loadNotifications();
    }

    setWorkingId(null);
  }

  async function respondSquadInvite(id: string, accept: boolean) {
    setWorkingId(id);
    setError("");
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
      await clearDeferred("squad_invite", id);
      window.dispatchEvent(new CustomEvent("gamemate:social-refresh"));
      window.dispatchEvent(new CustomEvent("gamemate:deferred-social-changed"));
      await loadNotifications();
      await loadSquadCount();
      if (accept) {
        setOpen(false);
        onOpenSquads();
      }
    }

    setWorkingId(null);
  }

  async function openGameSessionNotification(item: GameSessionNotification) {
    setWorkingId(item.id);
    const table = item.targetTab === "planning"
      ? "squad_scheduled_session_notifications"
      : "squad_session_notifications";
    const { error: updateError } = await supabase
      .from(table)
      .update({ read_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("recipient_id", userId);

    if (updateError) setError("Impossible de marquer cette notification comme lue.");
    else {
      setOpen(false);
      await loadSquadCount();
      sessionStorage.setItem("gamemate-open-squad-tab", item.targetTab);
      window.dispatchEvent(
        new CustomEvent("gamemate:open-squad-tab", { detail: item.targetTab })
      );
      onOpenSquads();
    }

    setWorkingId(null);
  }

  async function markLfgNotificationRead(item: LfgNotification) {
    if (item.readAt) return true;

    const { error: readError } = await supabase.rpc("mark_notification_read_v9", {
      p_notification_id: item.id,
    });

    if (readError) {
      console.error("Notification LFG / lecture:", readError);
      setError("Impossible de marquer cette notification comme lue.");
      return false;
    }

    const readAt = new Date().toISOString();
    setLfgNotifications((current) =>
      current.map((notification) =>
        notification.id === item.id ? { ...notification, readAt } : notification
      )
    );
    setLfgCount((current) => Math.max(0, current - 1));
    return true;
  }

  async function openLfgNotification(item: LfgNotification) {
    setWorkingId(item.id);
    setError("");

    const canOpen = await markLfgNotificationRead(item);
    if (canOpen) {
      setOpen(false);

      if (item.actionTarget === "squad") {
        onOpenSquads();
      } else if (item.actionTarget === "messages") {
        const callerId = typeof item.metadata.caller_id === "string"
          ? item.metadata.caller_id
          : item.actor.id;
        onOpenMessage(callerId);
      } else {
        sessionStorage.setItem("gamemate-find-mates-mode", "live");
        window.dispatchEvent(new CustomEvent("gamemate:open-lfg"));
        onOpenFindMates();
      }
    }

    setWorkingId(null);
  }

  async function markAllLfgNotificationsRead() {
    if (lfgCount === 0) return;
    setWorkingId("lfg-all");
    setError("");

    const { error: readError } = await supabase.rpc("mark_all_notifications_read_v9");

    if (readError) {
      console.error("Notifications LFG / tout lire:", readError);
      setError("Impossible de marquer les notifications LFG comme lues.");
    } else {
      const readAt = new Date().toISOString();
      setLfgNotifications((current) =>
        current.map((notification) =>
          notification.readAt ? notification : { ...notification, readAt }
        )
      );
      setLfgCount(0);
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
            <div className="notification-head-actions">
              {lfgCount > 0 && (
                <button
                  type="button"
                  disabled={workingId === "lfg-all"}
                  onClick={() => void markAllLfgNotificationsRead()}
                >
                  Tout lire
                </button>
              )}
              <strong>{effectiveTotal}</strong>
            </div>
          </header>

          <div className="notification-tabs" role="tablist" aria-label="Files de notifications">
            <button
              type="button"
              role="tab"
              aria-selected={view === "now"}
              className={view === "now" ? "active" : ""}
              onClick={() => setView("now")}
            >
              Maintenant <b>{effectiveTotal}</b>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "later"}
              className={view === "later" ? "active" : ""}
              onClick={() => setView("later")}
            >
              Après ma game <b>{laterCount}</b>
            </button>
          </div>

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
            ) : view === "now" ? (
              items.length === 0 ? (
                <div className="notification-empty">
                  <div className="notification-empty-icon"><Icon name="check" /></div>
                  <strong>Tout est calme.</strong>
                  <p>Tu n’as aucune notification immédiate.</p>
                </div>
              ) : items.map((item) => {
                if (item.kind === "friend") {
                  return (
                    <FriendItem
                      key={`friend-${item.id}`}
                      item={item}
                      working={workingId === item.id}
                      onAccept={() => void respondFriendRequest(item, true)}
                      onReject={() => void respondFriendRequest(item, false)}
                      onLater={() => void deferNotification("friend_request", item.id)}
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
                      onLater={() => void deferNotification("squad_invite", item.id)}
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
                      onOpen={() => void openGameSessionNotification(item)}
                    />
                  );
                }

                if (item.kind === "lfg") {
                  return (
                    <LfgItem
                      key={`lfg-${item.id}`}
                      item={item}
                      working={workingId === item.id}
                      onOpen={() => void openLfgNotification(item)}
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
            ) : laterItems.length === 0 ? (
              <div className="notification-empty later">
                <div className="notification-empty-icon">☾</div>
                <strong>Rien pour plus tard.</strong>
                <p>Les invitations mises de côté apparaîtront ici.</p>
              </div>
            ) : laterItems.map((item) => item.kind === "friend" ? (
              <FriendItem
                key={`later-friend-${item.queueId}`}
                item={item}
                working={workingId === item.id || workingId === item.queueId}
                onAccept={() => void respondFriendRequest(item, true)}
                onReject={() => void respondFriendRequest(item, false)}
                onRestore={() => void restoreNotification(item.queueId)}
                onOpen={() => {
                  setOpen(false);
                  onOpenFriends();
                }}
              />
            ) : (
              <SquadItem
                key={`later-squad-${item.queueId}`}
                item={item}
                working={workingId === item.id || workingId === item.queueId}
                onAccept={() => void respondSquadInvite(item.id, true)}
                onReject={() => void respondSquadInvite(item.id, false)}
                onRestore={() => void restoreNotification(item.queueId)}
                onOpen={() => {
                  setOpen(false);
                  onOpenSquads();
                }}
              />
            ))}
          </div>

          <footer className="notification-panel-foot four">
            <button type="button" onClick={() => { setOpen(false); onOpenFriends(); }}>
              Amis
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                sessionStorage.setItem("gamemate-find-mates-mode", "live");
                window.dispatchEvent(new CustomEvent("gamemate:open-lfg"));
                onOpenFindMates();
              }}
            >
              Annonces
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
  onLater,
  onRestore,
  onOpen,
}: {
  item: FriendNotification;
  working: boolean;
  onAccept: () => void;
  onReject: () => void;
  onLater?: () => void;
  onRestore?: () => void;
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
      <div className={`notification-actions ${onLater || onRestore ? "three" : ""}`}>
        <button className="accept" disabled={working} onClick={onAccept}>Accepter</button>
        <button disabled={working} onClick={onReject}>Refuser</button>
        {onLater && <button className="later" disabled={working} onClick={onLater}>Après ma game</button>}
        {onRestore && <button className="later" disabled={working} onClick={onRestore}>Maintenant</button>}
      </div>
    </article>
  );
}

function SquadItem({
  item,
  working,
  onAccept,
  onReject,
  onLater,
  onRestore,
  onOpen,
}: {
  item: SquadNotification;
  working: boolean;
  onAccept: () => void;
  onReject: () => void;
  onLater?: () => void;
  onRestore?: () => void;
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
      <div className={`notification-actions ${onLater || onRestore ? "three" : ""}`}>
        <button className="accept" disabled={working} onClick={onAccept}>Rejoindre</button>
        <button disabled={working} onClick={onReject}>Refuser</button>
        {onLater && <button className="later" disabled={working} onClick={onLater}>Après ma game</button>}
        {onRestore && <button className="later" disabled={working} onClick={onRestore}>Maintenant</button>}
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
      <span className="notification-session-icon"><Icon name="play" size={17} /></span>
      <span className="notification-item-copy">
        <strong>{item.title}</strong>
        <span>{item.message}</span>
        <small>{relativeTime(item.createdAt)}</small>
      </span>
      <i className="notification-type session">PARTIE</i>
    </button>
  );
}

function LfgItem({
  item,
  working,
  onOpen,
}: {
  item: LfgNotification;
  working: boolean;
  onOpen: () => void;
}) {
  const labels: Record<string, string> = {
    lfg_application_received: "CANDIDATURE",
    lfg_application_accepted: "ACCEPTÉE",
    lfg_application_declined: "RÉPONSE",
    lfg_application_withdrawn: "RETRAIT",
    lfg_post_closed: "ANNONCE",
    direct_call: "APPEL",
  };

  return (
    <button
      type="button"
      className={`notification-item notification-lfg ${item.readAt ? "read" : "unread"}`}
      disabled={working}
      onClick={onOpen}
    >
      <Avatar profile={item.actor} />
      <span className="notification-item-copy">
        <strong>{item.title}</strong>
        <span>{item.body}</span>
        <small>{relativeTime(item.createdAt)}</small>
      </span>
      <span className="notification-lfg-meta">
        <i className="notification-type lfg">{labels[item.eventKind] ?? "LFG"}</i>
        {!item.readAt && <span className="notification-unread-dot" aria-label="Non lue" />}
      </span>
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
