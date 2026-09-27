import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playMessageSendSound } from "../lib/audio";
import { Icon } from "../components/Icon";
import { presenceActivity, readPresenceStatus, type OwnPresenceStatus, type PresenceSnapshot, type PresenceStatus } from "../lib/presence";
import "./MessagesPage.css";

type Props = {
  session: Session | null;
  initialUserId: string | null;
  onInitialUserHandled: () => void;
  onLogin: () => void;
  onOpenProfile: (userId: string) => void;
  onUnreadCountChange: (count: number) => void;
};

type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
  language: string | null;
};

type ConversationView = {
  conversation: Conversation;
  profile: Profile;
  lastMessage: Message | null;
  unread: number;
  presence: PresenceSnapshot;
};

type SidebarTab = "conversations" | "friends";

type FriendWithPresence = {
  user_id: string;
  profile: Profile;
  presence: PresenceSnapshot;
};

export default function MessagesPage({
  session,
  initialUserId,
  onInitialUserHandled,
  onLogin,
  onOpenProfile,
  onUnreadCountChange,
}: Props) {
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("conversations");
  const [friends, setFriends] = useState<FriendWithPresence[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [myPresence, setMyPresence] = useState<OwnPresenceStatus>(readPresenceStatus);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const threadBodyRef = useRef<HTMLDivElement | null>(null);
  const forceBottomRef = useRef(false);

  const userId = session?.user?.id ?? null;

  const loadConversations = useCallback(async (background = false) => {
    if (!userId) {
      setConversations([]);
      setLoadingList(false);
      onUnreadCountChange(0);
      return;
    }

    if (!background) setLoadingList(true);
    setError("");

    const { data: conversationRows, error: conversationError } = await supabase
      .from("conversations")
      .select("id, user_a, user_b, created_at, updated_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("updated_at", { ascending: false });

    if (conversationError) {
      console.error("Messages / conversations:", conversationError);
      setError("Impossible de charger les conversations.");
      setLoadingList(false);
      return;
    }

    const rawConversations = (conversationRows ?? []) as Conversation[];

    if (rawConversations.length === 0) {
      setConversations([]);
      setLoadingList(false);
      onUnreadCountChange(0);
      return;
    }

    const otherIds = Array.from(
      new Set(
        rawConversations.map((conversation) =>
          conversation.user_a === userId ? conversation.user_b : conversation.user_a
        )
      )
    );

    const conversationIds = rawConversations.map((conversation) => conversation.id);

    const [profilesResult, messagesResult, presenceResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, region, language")
        .in("id", otherIds),
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, read_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_presence_v15", { p_user_ids: otherIds }),
    ]);

    if (profilesResult.error || presenceResult.error) {
      console.error("Messages / profiles:", profilesResult.error);
      setError("Impossible de charger les profils.");
      setLoadingList(false);
      return;
    }

    if (messagesResult.error) {
      console.error("Messages / previews:", messagesResult.error);
      setError("Impossible de charger les derniers messages.");
      setLoadingList(false);
      return;
    }

    const profileMap = new Map<string, Profile>(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile as Profile])
    );
    const presenceMap = new Map<string, PresenceSnapshot>(
      ((presenceResult.data ?? []) as PresenceSnapshot[]).map((presence) => [presence.user_id, presence])
    );

    const allMessages = (messagesResult.data ?? []) as Message[];
    const latestMap = new Map<string, Message>();
    const unreadMap = new Map<string, number>();

    for (const message of allMessages) {
      if (!latestMap.has(message.conversation_id)) {
        latestMap.set(message.conversation_id, message);
      }

      if (message.sender_id !== userId && !message.read_at) {
        unreadMap.set(
          message.conversation_id,
          (unreadMap.get(message.conversation_id) ?? 0) + 1
        );
      }
    }

    const hydrated = rawConversations
      .map((conversation) => {
        const otherId =
          conversation.user_a === userId ? conversation.user_b : conversation.user_a;
        const profile = profileMap.get(otherId);
        if (!profile) return null;

        return {
          conversation,
          profile,
          lastMessage: latestMap.get(conversation.id) ?? null,
          unread: unreadMap.get(conversation.id) ?? 0,
          presence: presenceMap.get(otherId) ?? offlinePresence(otherId),
        };
      })
      .filter((value): value is ConversationView => Boolean(value))
      .sort((a, b) => {
        const aDate = a.lastMessage?.created_at ?? a.conversation.updated_at;
        const bDate = b.lastMessage?.created_at ?? b.conversation.updated_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

    setConversations(hydrated);
    onUnreadCountChange(
      hydrated.reduce((total, conversation) => total + conversation.unread, 0)
    );
    setLoadingList(false);
  }, [userId, onUnreadCountChange]);

  const loadFriends = useCallback(async (background = false) => {
    if (!userId) {
      setFriends([]);
      setLoadingFriends(false);
      return;
    }

    if (!background) setLoadingFriends(true);

    const { data: relationships, error: friendshipsError } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (friendshipsError) {
      console.error("Messages / friends:", friendshipsError);
      setLoadingFriends(false);
      return;
    }

    const friendIds = Array.from(
      new Set(
        (relationships ?? []).map((row) =>
          row.requester_id === userId ? row.addressee_id : row.requester_id
        )
      )
    );

    if (friendIds.length === 0) {
      setFriends([]);
      setLoadingFriends(false);
      return;
    }

    const [profilesResult, presenceResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, region, language")
        .in("id", friendIds),
      supabase
        .rpc("get_presence_v15", { p_user_ids: friendIds }),
    ]);

    if (profilesResult.error) {
      console.error("Messages / friend profiles:", profilesResult.error);
      setLoadingFriends(false);
      return;
    }

    if (presenceResult.error) {
      console.error("Messages / presence:", presenceResult.error);
    }

    const presenceMap = new Map<string, PresenceSnapshot>(
      ((presenceResult.data ?? []) as PresenceSnapshot[]).map((row) => [row.user_id, row])
    );

    const hydrated: FriendWithPresence[] = (profilesResult.data ?? []).map((profile) => {
      return {
        user_id: profile.id,
        profile: profile as Profile,
        presence: presenceMap.get(profile.id) ?? offlinePresence(profile.id),
      };
    });

    hydrated.sort((a, b) => {
      const statusDiff = presenceRank(a.presence.status) - presenceRank(b.presence.status);
      if (statusDiff !== 0) return statusDiff;
      return profileName(a.profile).localeCompare(profileName(b.profile), "fr");
    });

    setFriends(hydrated);
    setLoadingFriends(false);
  }, [userId]);

  const loadMessages = useCallback(
    async (conversationId: string, background = false) => {
      if (!userId) return;

      if (!background) setLoadingMessages(true);
      setError("");

      const { data, error: messagesError } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, read_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Messages / thread:", messagesError);
        setError("Impossible de charger cette conversation.");
        setLoadingMessages(false);
        return;
      }

      setMessages((data ?? []) as Message[]);

      const { error: readError } = await supabase.rpc("mark_conversation_read", {
        p_conversation_id: conversationId,
      });

      if (readError) console.error("mark_conversation_read:", readError);

      setLoadingMessages(false);
      void loadConversations();
    },
    [userId, loadConversations]
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);


  useEffect(() => {
    if (!userId || !initialUserId) return;

    let cancelled = false;

    async function openInitialConversation() {
      const { data, error: conversationError } = await supabase.rpc(
        "get_or_create_conversation",
        { p_other_user_id: initialUserId }
      );

      if (cancelled) return;

      if (conversationError) {
        console.error("get_or_create_conversation:", conversationError);
        setError("Impossible d’ouvrir cette conversation.");
        onInitialUserHandled();
        return;
      }

      const conversation = data as Conversation;
      forceBottomRef.current = true;
      setSelectedConversationId(conversation.id);
      onInitialUserHandled();
      await loadConversations();
      await loadMessages(conversation.id);
    }

    void openInitialConversation();

    return () => {
      cancelled = true;
    };
  }, [userId, initialUserId, onInitialUserHandled, loadConversations, loadMessages]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`messages-clean:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          const message = (payload.new || payload.old) as Partial<Message>;
          void loadConversations(true);

          if (
            selectedConversationId &&
            message.conversation_id === selectedConversationId
          ) {
            void loadMessages(selectedConversationId, true);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void loadConversations(true)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, selectedConversationId, loadConversations, loadMessages]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`messages-friends-presence:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_presence" },
        () => void loadFriends(true)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => void loadFriends(true)
      )
      .subscribe();

    const refresh = window.setInterval(() => {
      void loadFriends(true);
    }, 45000);

    return () => {
      window.clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId, loadFriends]);

  useEffect(() => {
    const body = threadBodyRef.current;
    if (!body) return;

    const jumpToBottom = () => {
      body.scrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
    };

    requestAnimationFrame(() => {
      jumpToBottom();
      requestAnimationFrame(() => {
        jumpToBottom();
        setTimeout(jumpToBottom, 60);
        setTimeout(jumpToBottom, 180);
      });
    });

    forceBottomRef.current = false;
  }, [messages, selectedConversationId, loadingMessages]);

  const selectedConversation =
    conversations.find(
      (conversation) => conversation.conversation.id === selectedConversationId
    ) ?? null;

  const filteredConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return conversations;

    return conversations.filter(({ profile, lastMessage }) =>
      [
        profile.display_name,
        profile.username,
        profile.region,
        profile.language,
        lastMessage?.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [conversations, query]);

  const filteredFriends = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return friends;

    return friends.filter(({ profile }) =>
      [profile.display_name, profile.username, profile.region, profile.language]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [friends, query]);

  async function selectConversation(conversationId: string) {
    forceBottomRef.current = true;
    setSelectedConversationId(conversationId);
    await loadMessages(conversationId);
  }

  async function openFriendConversation(friendUserId: string) {
    forceBottomRef.current = true;
    setError("");

    const existing = conversations.find((item) => item.profile.id === friendUserId);
    if (existing) {
      setSidebarTab("conversations");
      await selectConversation(existing.conversation.id);
      return;
    }

    const { data, error: conversationError } = await supabase.rpc(
      "get_or_create_conversation",
      { p_other_user_id: friendUserId }
    );

    if (conversationError) {
      console.error("get_or_create_conversation:", conversationError);
      setError("Impossible d’ouvrir cette conversation.");
      return;
    }

    const conversation = data as Conversation;
    setSidebarTab("conversations");
    setSelectedConversationId(conversation.id);
    await loadConversations();
    await loadMessages(conversation.id);
  }

  async function changeMyPresence(status: OwnPresenceStatus) {
    setMyPresence(status);
    localStorage.setItem("gamemate-presence-status", status);
    window.dispatchEvent(new Event("gamemate-presence-status-changed"));

    const { error: presenceError } = await supabase.rpc("set_my_presence", {
      p_status: status,
    });

    if (presenceError) {
      console.error("set_my_presence:", presenceError);
      setError("Impossible de modifier ton statut.");
    }
  }

  async function sendMessage() {
    if (!selectedConversationId || !draft.trim() || sending) return;

    setSending(true);
    setError("");

    const body = draft.trim();

    const { error: sendError } = await supabase.rpc("send_message", {
      p_conversation_id: selectedConversationId,
      p_body: body,
    });

    if (sendError) {
      console.error("send_message:", sendError);
      setError(
        sendError.message.includes("messaging_muted")
          ? "Tu ne peux pas envoyer de messages pendant la durée de ton mute."
          : sendError.message.includes("account_restricted")
            ? "Ton compte est actuellement suspendu ou banni."
            : sendError.message.includes("conversation_blocked")
              ? "Impossible d’envoyer le message : cette conversation est bloquée."
              : "Impossible d’envoyer ce message."
      );
      setSending(false);
      return;
    }

    setDraft("");
    playMessageSendSound();
    await loadMessages(selectedConversationId);
    setSending(false);
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const enterToSend = localStorage.getItem("gamemate-enter-to-send") !== "false";

    if (enterToSend && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  if (!session) {
    return (
      <section className="messages-clean locked">
        <div>
          <span className="messages-kicker">MESSAGES</span>
          <h1>Discute avec tes mates.</h1>
          <p>Connecte-toi pour accéder à tes conversations.</p>
          <button type="button" className="messages-primary" onClick={onLogin}>
            Se connecter
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="messages-clean">
      <header className="messages-page-head">
        <div>
          <span className="messages-kicker">SOCIAL</span>
          <h1>Messages</h1>
        </div>
        <span className="messages-unread-total">
          {conversations.reduce((total, conversation) => total + conversation.unread, 0)} non lu
          {conversations.reduce((total, conversation) => total + conversation.unread, 0) > 1 ? "s" : ""}
        </span>
      </header>

      {error && <div className="messages-error"><span>{error}</span><button type="button" onClick={() => { setError(""); void loadConversations(); void loadFriends(); if (selectedConversationId) void loadMessages(selectedConversationId); }}>Réessayer</button></div>}

      <section className={`messages-layout ${selectedConversation ? "thread-open" : ""}`}>
        <aside className="messages-sidebar">
          <div className="messages-sidebar-top">
            <div className="messages-sidebar-tabs">
              <button
                type="button"
                className={sidebarTab === "conversations" ? "active" : ""}
                onClick={() => setSidebarTab("conversations")}
              >
                Discussions
              </button>
              <button
                type="button"
                className={sidebarTab === "friends" ? "active" : ""}
                onClick={() => setSidebarTab("friends")}
              >
                Amis
                <span>{friends.length}</span>
              </button>
            </div>

            <div className="messages-my-presence">
              <span className={`messages-presence-dot ${myPresence}`} />
              <select
                value={myPresence}
                onChange={(event) => void changeMyPresence(event.target.value as OwnPresenceStatus)}
                aria-label="Mon statut"
              >
                <option value="online">En ligne</option>
                <option value="away">Absent</option>
                <option value="dnd">Ne pas déranger</option>
                <option value="invisible">Invisible</option>
              </select>
            </div>
          </div>

          <div className="messages-search">
            <Icon name="search" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={sidebarTab === "friends" ? "Rechercher un ami..." : "Rechercher une conversation..."}
            />
          </div>

          {sidebarTab === "conversations" ? (
            <div className="messages-conversations">
              {loadingList ? (
                <div className="messages-empty">Chargement...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="messages-empty">
                  <strong>Aucune conversation</strong>
                  <p>Ouvre l’onglet Amis pour démarrer une discussion.</p>
                </div>
              ) : (
                filteredConversations.map((item) => (
                  <ConversationItem
                    key={item.conversation.id}
                    item={item}
                    active={item.conversation.id === selectedConversationId}
                    currentUserId={userId!}
                    onClick={() => void selectConversation(item.conversation.id)}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="messages-friends">
              {loadingFriends ? (
                <div className="messages-empty">Chargement...</div>
              ) : filteredFriends.length === 0 ? (
                <div className="messages-empty">
                  <strong>Aucun ami</strong>
                  <p>Les amis acceptés apparaîtront ici.</p>
                </div>
              ) : (
                filteredFriends.map((friend) => (
                  <FriendItem
                    key={friend.user_id}
                    friend={friend}
                    onMessage={() => void openFriendConversation(friend.user_id)}
                    onProfile={() => onOpenProfile(friend.user_id)}
                  />
                ))
              )}
            </div>
          )}
        </aside>

        <main className="messages-thread">
          {selectedConversation ? (
            <>
              <header className="messages-thread-head">
                <button
                  type="button"
                  className="messages-mobile-back"
                  onClick={() => setSelectedConversationId(null)}
                  aria-label="Retour aux conversations"
                >
                  ←
                </button>

                <Avatar profile={selectedConversation.profile} size="medium" />

                <div className="messages-thread-person">
                  <strong>{profileName(selectedConversation.profile)}</strong>
                  <small className={`status-${selectedConversation.presence.status}`}><i className={`messages-presence-dot ${selectedConversation.presence.status}`} />{presenceActivity(selectedConversation.presence)}</small>
                  <span>
                    {selectedConversation.profile.username
                      ? `@${selectedConversation.profile.username}`
                      : [selectedConversation.profile.region, selectedConversation.profile.language]
                          .filter(Boolean)
                          .join(" · ") || "Profil GameMate"}
                  </span>
                </div>

                <button
                  type="button"
                  className="messages-profile-btn"
                  onClick={() => onOpenProfile(selectedConversation.profile.id)}
                >
                  Profil
                </button>
              </header>

              <div className="messages-thread-body" ref={threadBodyRef}>
                {loadingMessages ? (
                  <div className="messages-thread-empty">Chargement...</div>
                ) : messages.length === 0 ? (
                  <div className="messages-thread-empty">
                    <Avatar profile={selectedConversation.profile} size="large" />
                    <strong>{profileName(selectedConversation.profile)}</strong>
                    <p>Envoie le premier message.</p>
                  </div>
                ) : (
                  <div className="messages-flow">
                    {messages.map((message, index) => {
                      const mine = message.sender_id === userId;
                      const previous = messages[index - 1];
                      const showTime =
                        !previous ||
                        new Date(message.created_at).getTime() -
                          new Date(previous.created_at).getTime() >
                          10 * 60 * 1000;

                      return (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          mine={mine}
                          showTime={showTime}
                        />
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              <footer className="messages-composer">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  maxLength={4000}
                  rows={1}
                  placeholder={`Écrire à ${profileName(selectedConversation.profile)}...`}
                />
                <button
                  type="button"
                  disabled={!draft.trim() || sending}
                  onClick={() => void sendMessage()}
                  aria-label="Envoyer"
                >
                  ➤
                </button>
              </footer>
            </>
          ) : (
            <div className="messages-no-thread">
              <img src="/gamemate-logo.png" alt="" />
              <strong>Sélectionne une conversation</strong>
              <p>Choisis un mate dans la colonne de gauche pour commencer.</p>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

function FriendItem({
  friend,
  onMessage,
  onProfile,
}: {
  friend: FriendWithPresence;
  onMessage: () => void;
  onProfile: () => void;
}) {
  return (
    <div className="messages-friend">
      <button type="button" className="messages-friend-main" onClick={onMessage}>
        <span className="messages-friend-avatar-wrap">
          <Avatar profile={friend.profile} size="small" />
          <i className={`messages-presence-dot ${friend.presence.status}`} />
        </span>

        <span className="messages-friend-copy">
          <strong>{profileName(friend.profile)}</strong>
          <small className={`status-${friend.presence.status}`}>{presenceActivity(friend.presence)}</small>
        </span>
      </button>

      <div className="messages-friend-actions">
        <button type="button" onClick={onMessage} title="Envoyer un message" aria-label="Envoyer un message">
          <Icon name="message-circle" size={16} />
        </button>
        <button type="button" onClick={onProfile} title="Voir le profil" aria-label="Voir le profil">
          <Icon name="more-horizontal" size={17} />
        </button>
      </div>
    </div>
  );
}

function ConversationItem({
  item,
  active,
  currentUserId,
  onClick,
}: {
  item: ConversationView;
  active: boolean;
  currentUserId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`messages-conversation ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="messages-friend-avatar-wrap">
        <Avatar profile={item.profile} size="small" />
        <i className={`messages-presence-dot ${item.presence.status}`} />
      </span>

      <span className="messages-conversation-copy">
        <span className="messages-conversation-top">
          <strong>{profileName(item.profile)}</strong>
          <small>{formatRelativeTime(item.lastMessage?.created_at ?? item.conversation.updated_at)}</small>
        </span>
        <span className="messages-preview">
          {item.lastMessage ? (
            <>
              {item.lastMessage.sender_id === currentUserId && <i>Toi : </i>}
              {item.lastMessage.body}
            </>
          ) : (
            "Nouvelle conversation"
          )}
        </span>
      </span>

      {item.unread > 0 && (
        <span className="messages-unread">{item.unread > 99 ? "99+" : item.unread}</span>
      )}
    </button>
  );
}

function MessageBubble({
  message,
  mine,
  showTime,
}: {
  message: Message;
  mine: boolean;
  showTime: boolean;
}) {
  return (
    <>
      {showTime && (
        <div className="messages-time-divider">
          {formatMessageTime(message.created_at)}
        </div>
      )}
      <div className={`messages-row ${mine ? "mine" : "theirs"}`}>
        <div className="messages-bubble">
          <p>{message.body}</p>
          <small>
            {shortTime(message.created_at)}
            {mine && message.read_at ? " · Lu" : ""}
          </small>
        </div>
      </div>
    </>
  );
}

function Avatar({
  profile,
  size,
}: {
  profile: Profile;
  size: "small" | "medium" | "large";
}) {
  const name = profileName(profile);
  return (
    <span className={`messages-avatar ${size}`}>
      {profile.avatar_url ? <img src={profile.avatar_url} alt={name} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function profileName(profile: Profile) {
  return profile.display_name || profile.username || "Joueur GameMate";
}

function offlinePresence(userId: string): PresenceSnapshot {
  return { user_id: userId, status: "offline", custom_status: null, activity_game_id: null, activity_game_name: null, activity_text: null, last_seen_at: null };
}

function presenceRank(status: PresenceStatus) {
  return status === "online" ? 0 : status === "away" ? 1 : status === "dnd" ? 2 : 3;
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "maintenant";
  if (diff < hour) return `${Math.floor(diff / minute)} min`;
  if (diff < day) return `${Math.floor(diff / hour)} h`;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

