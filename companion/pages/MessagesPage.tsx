import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playMessageSendSound } from "../lib/audio";
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

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
  language: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type ConversationView = {
  conversation: Conversation;
  profile: Profile;
  lastMessage: Message | null;
  unread: number;
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
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const userId = session?.user?.id ?? null;

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      setLoadingList(false);
      onUnreadCountChange(0);
      return;
    }

    setLoadingList(true);
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

    const [profilesResult, messagesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, region, language")
        .in("id", otherIds),
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, read_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
    ]);

    if (profilesResult.error) {
      console.error("Messages / profiles:", profilesResult.error);
      setError("Impossible de charger les profils de messagerie.");
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
      (profilesResult.data ?? []).map((profile) => [profile.id, profile])
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

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!userId) return;

      setLoadingMessages(true);
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

      if (readError) {
        console.error("mark_conversation_read:", readError);
      }

      await loadConversations();
      setLoadingMessages(false);
    },
    [userId, loadConversations]
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

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
        setError(
          "Impossible d’ouvrir cette conversation. Le joueur est peut-être bloqué."
        );
        onInitialUserHandled();
        return;
      }

      const conversation = data as Conversation;
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
      .channel(`messages-page:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          const message = (payload.new || payload.old) as Partial<Message>;

          void loadConversations();

          if (
            selectedConversationId &&
            message.conversation_id === selectedConversationId
          ) {
            void loadMessages(selectedConversationId);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          void loadConversations();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, selectedConversationId, loadConversations, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

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

  async function selectConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    await loadMessages(conversationId);
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
        sendError.message.includes("conversation_blocked")
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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  if (!session) {
    return (
      <section className="msg2 msg2-locked">
        <div className="msg2-lock-orb a" />
        <div className="msg2-lock-orb b" />
        <div className="msg2-lock-content">
          <span className="msg2-kicker">MESSAGES GAMEMATE</span>
          <h1>Tes conversations, directement dans le Companion.</h1>
          <p>Connecte-toi pour retrouver et envoyer tes messages.</p>
          <button type="button" className="msg2-primary" onClick={onLogin}>
            Se connecter
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="msg2">
      <div className="msg2-grid" />
      <div className="msg2-orb msg2-orb-a" />
      <div className="msg2-orb msg2-orb-b" />

      <header className="msg2-header">
        <div>
          <span className="msg2-kicker">MESSAGERIE GAMEMATE</span>
          <h1>
            Tes <span>messages</span>
          </h1>
          <p>
            Conversations privées en temps réel, sans quitter GameMate.
          </p>
        </div>

        <div className="msg2-header-stat">
          <small>NON LUS</small>
          <strong>
            {conversations.reduce((total, conversation) => total + conversation.unread, 0)}
          </strong>
        </div>
      </header>

      <div className="msg2-layout">
        <aside className={`msg2-list ${selectedConversationId ? "has-selection" : ""}`}>
          <div className="msg2-list-head">
            <label className="msg2-search">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher..."
              />
            </label>
          </div>

          <div className="msg2-list-body">
            {loadingList ? (
              <div className="msg2-list-state">
                <span className="msg2-loader" />
                <small>Chargement...</small>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="msg2-list-state">
                <div className="msg2-empty-icon">✦</div>
                <strong>Aucune conversation</strong>
                <small>
                  Ouvre un ami et clique sur Message pour démarrer.
                </small>
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
        </aside>

        <main className={`msg2-thread ${selectedConversation ? "active" : ""}`}>
          {selectedConversation ? (
            <>
              <header className="msg2-thread-head">
                <button
                  type="button"
                  className="msg2-mobile-back"
                  onClick={() => setSelectedConversationId(null)}
                >
                  ←
                </button>

                <Avatar profile={selectedConversation.profile} size="medium" />

                <button
                  type="button"
                  className="msg2-thread-person"
                  onClick={() => onOpenProfile(selectedConversation.profile.id)}
                >
                  <strong>{profileName(selectedConversation.profile)}</strong>
                  <span>
                    {[selectedConversation.profile.region, selectedConversation.profile.language]
                      .filter(Boolean)
                      .join(" · ") || "Profil GameMate"}
                  </span>
                </button>

                <div className="msg2-thread-actions">
                  <button type="button" disabled title="Appel vocal bientôt disponible">
                    ◉
                  </button>
                  <button type="button" disabled title="Appel vidéo bientôt disponible">
                    ▣
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenProfile(selectedConversation.profile.id)}
                    title="Voir le profil"
                  >
                    •••
                  </button>
                </div>
              </header>

              <div className="msg2-thread-body">
                {error && <div className="msg2-error">{error}</div>}

                {loadingMessages ? (
                  <div className="msg2-thread-state">
                    <span className="msg2-loader" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="msg2-thread-state">
                    <div className="msg2-chat-avatar">
                      <Avatar profile={selectedConversation.profile} size="large" />
                    </div>
                    <span className="msg2-kicker">NOUVELLE CONVERSATION</span>
                    <h2>{profileName(selectedConversation.profile)}</h2>
                    <p>Envoie le premier message pour commencer.</p>
                  </div>
                ) : (
                  <div className="msg2-message-flow">
                    {messages.map((message, index) => {
                      const mine = message.sender_id === userId;
                      const previous = messages[index - 1];
                      const showTime =
                        !previous ||
                        new Date(message.created_at).getTime() -
                          new Date(previous.created_at).getTime() >
                          5 * 60 * 1000;

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

              <footer className="msg2-composer">
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
                  className="msg2-send"
                  disabled={!draft.trim() || sending}
                  onClick={() => void sendMessage()}
                >
                  <span>➤</span>
                </button>
              </footer>
            </>
          ) : (
            <section className="msg2-thread-empty">
              <div className="msg2-empty-logo">
                <img src="/gamemate-logo.png" alt="" />
              </div>
              <span className="msg2-kicker">MESSAGES</span>
              <h2>Sélectionne une conversation.</h2>
              <p>
                Ou ouvre un ami puis clique sur <strong>Message</strong> pour commencer à discuter.
              </p>
            </section>
          )}
        </main>
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
  const name = profileName(item.profile);

  return (
    <button
      type="button"
      className={`msg2-conversation ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <Avatar profile={item.profile} size="small" />

      <span className="msg2-conversation-copy">
        <span className="msg2-conversation-top">
          <strong>{name}</strong>
          <small>
            {formatRelativeTime(
              item.lastMessage?.created_at ?? item.conversation.updated_at
            )}
          </small>
        </span>

        <span className="msg2-conversation-preview">
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
        <span className="msg2-unread">{item.unread > 99 ? "99+" : item.unread}</span>
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
    <div className={`msg2-message-row ${mine ? "mine" : "theirs"}`}>
      {showTime && (
        <span className="msg2-time-divider">
          {formatMessageTime(message.created_at)}
        </span>
      )}

      <div className="msg2-bubble">
        <p>{message.body}</p>
        <small>
          {shortTime(message.created_at)}
          {mine && <span>{message.read_at ? " · Lu" : ""}</span>}
        </small>
      </div>
    </div>
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
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <span className={`msg2-avatar ${size}`}>
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt={name} />
      ) : (
        initial
      )}
    </span>
  );
}

function profileName(profile: Profile) {
  return profile.display_name || profile.username || "Joueur GameMate";
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
