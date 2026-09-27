import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as NavigationBar from "expo-navigation-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";

import {
  deviceLabel,
  getDevicePresence,
  startMobilePresence,
  stopMobilePresence,
} from "./src/lib/presence";

type Tab =
  | "home"
  | "friends"
  | "messages"
  | "mates"
  | "profile";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio?: string | null;
  region?: string | null;
  language?: string | null;
};

type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
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

type ConversationItem = {
  conversation: Conversation;
  profile: Profile;
  lastMessage: Message | null;
  unread: number;
};

export default function App() {
  const [session, setSession] =
    useState<Session | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;

        setSession(data.session);
        setLoading(false);
      });

    const { data } =
      supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          setSession(nextSession);
        }
      );

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
  if (!session?.user.id) {
    stopMobilePresence();
    return;
  }

  void startMobilePresence();

  return () => {
    stopMobilePresence();
  };
}, [session?.user.id]);

useEffect(() => {
  if (Platform.OS === "android") {
  }
}, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>
          Chargement de GameMate...
        </Text>
      </View>
    );
  }

  return (
  <SafeAreaProvider>
    {session ? (
      <GameMate session={session} />
    ) : (
      <Login />
    )}
  </SafeAreaProvider>
);

}

function GameMate({
  session,
}: {
  session: Session;
}) {
  const [tab, setTab] =
    useState<Tab>("home");

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [onlineFriends, setOnlineFriends] =
    useState(0);

  const [unreadMessages, setUnreadMessages] =
    useState(0);

  const [messageTarget, setMessageTarget] =
    useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id,username,display_name,bio,region,language"
      )
      .eq("id", session.user.id)
      .single();

    if (data) {
      setProfile(data as Profile);
    }
  }, [session.user.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function openMessage(userId: string) {
    setMessageTarget(userId);
    setTab("messages");
  }

  return (
    <View style={styles.app}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#020812"
      />

      <View style={styles.content}>
        {tab === "home" && (
          <Home
            profile={profile}
            onlineFriends={onlineFriends}
            unreadMessages={unreadMessages}
            navigate={setTab}
          />
        )}

        {tab === "friends" && (
          <Friends
            session={session}
            onOnlineCount={setOnlineFriends}
            onMessage={openMessage}
          />
        )}

        {tab === "messages" && (
          <Messages
            session={session}
            initialUserId={messageTarget}
            clearInitial={() =>
              setMessageTarget(null)
            }
            onUnread={setUnreadMessages}
          />
        )}

        {tab === "mates" && (
          <Mates
            session={session}
            onMessage={openMessage}
          />
        )}

        {tab === "profile" && (
          <ProfilePage
            session={session}
            profile={profile}
            reload={loadProfile}
          />
        )}
      </View>

      <BottomNavigation
        active={tab}
        onChange={setTab}
      />
    </View>
  );
}

function Home({
  profile,
  onlineFriends,
  unreadMessages,
  navigate,
}: {
  profile: Profile | null;
  onlineFriends: number;
  unreadMessages: number;
  navigate: (tab: Tab) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.page}
    >
      <Text style={styles.kicker}>
        GAMEMATE MOBILE
      </Text>

      <Text style={styles.title}>
        Salut {nameOf(profile)}
      </Text>

      <Text style={styles.subtitle}>
        Ton rÃ©seau GameMate dans ta poche.
      </Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>
          EN DIRECT
        </Text>

        <Text style={styles.heroTitle}>
          Reste connectÃ© Ã  tes mates.
        </Text>

        <Text style={styles.heroText}>
          Messages, amis, prÃ©sence et recherche
          de joueurs synchronisÃ©s avec GameMate.
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Pressable
          style={styles.stat}
          onPress={() =>
            navigate("friends")
          }
        >
          <Text style={styles.statValue}>
            {onlineFriends}
          </Text>

          <Text style={styles.statLabel}>
            amis en ligne
          </Text>
        </Pressable>

        <Pressable
          style={styles.stat}
          onPress={() =>
            navigate("messages")
          }
        >
          <Text style={styles.statValue}>
            {unreadMessages}
          </Text>

          <Text style={styles.statLabel}>
            messages non lus
          </Text>
        </Pressable>
      </View>

      <QuickAction
        title="Messages"
        text="Continue tes discussions PC â†” mobile."
        onPress={() =>
          navigate("messages")
        }
      />

      <QuickAction
        title="Mes amis"
        text="Vois qui est connectÃ©."
        onPress={() =>
          navigate("friends")
        }
      />

      <QuickAction
        title="Trouver des mates"
        text="Recherche et contacte des joueurs."
        onPress={() =>
          navigate("mates")
        }
      />
    </ScrollView>
  );
}

function Friends({
  session,
  onOnlineCount,
  onMessage,
}: {
  session: Session;
  onOnlineCount: (count: number) => void;
  onMessage: (userId: string) => void;
}) {
  const [friends, setFriends] =
    useState<
      (Profile & {
        status: string;
        platforms: string[];
      })[]
    >([]);

  const [loading, setLoading] =
    useState(true);

  const load = useCallback(async () => {
    const userId = session.user.id;

    const { data: relationships } =
      await supabase
        .from("friendships")
        .select(
          "requester_id,addressee_id"
        )
        .eq("status", "accepted")
        .or(
          `requester_id.eq.${userId},addressee_id.eq.${userId}`
        );

    const ids = Array.from(
      new Set(
        (relationships ?? []).map((row) =>
          row.requester_id === userId
            ? row.addressee_id
            : row.requester_id
        )
      )
    );

    if (!ids.length) {
      setFriends([]);
      onOnlineCount(0);
      setLoading(false);
      return;
    }

    const [
      profilesResult,
      presenceResult,
      deviceMap,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id,username,display_name"
        )
        .in("id", ids),

      supabase.rpc("get_presence_v15", {
        p_user_ids: ids,
      }),

      getDevicePresence(ids),
    ]);

    const presenceMap = new Map(
      (
        (presenceResult.data ?? []) as {
          user_id: string;
          status: string;
        }[]
      ).map((row) => [
        row.user_id,
        row.status,
      ])
    );

    const next =
      (profilesResult.data ?? []).map(
        (profile) => ({
          ...(profile as Profile),

          status:
            presenceMap.get(profile.id) ??
            "offline",

          platforms:
            deviceMap.get(profile.id) ?? [],
        })
      );

    next.sort((a, b) => {
      const aOnline =
        a.status === "offline" ? 0 : 1;

      const bOnline =
        b.status === "offline" ? 0 : 1;

      return (
        bOnline - aOnline ||
        nameOf(a).localeCompare(
          nameOf(b),
          "fr"
        )
      );
    });

    setFriends(next);

    onOnlineCount(
      next.filter(
        (friend) =>
          friend.status !== "offline"
      ).length
    );

    setLoading(false);
  }, [
    session.user.id,
    onOnlineCount,
  ]);

  useEffect(() => {
    void load();

    const interval = setInterval(
      () => void load(),
      30000
    );

    return () => {
      clearInterval(interval);
    };
  }, [load]);

  if (loading) {
    return (
      <Loading text="Chargement des amis..." />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
    >
      <Text style={styles.kicker}>
        SOCIAL
      </Text>

      <Text style={styles.title}>
        Mes amis
      </Text>

      <Text style={styles.subtitle}>
        Vois leur prÃ©sence GameMate.
      </Text>

      {!friends.length ? (
        <Empty text="Aucun ami pour le moment." />
      ) : (
        friends.map((friend) => {
          const online =
            friend.status !== "offline";

          const platform =
            deviceLabel(friend.platforms);

          return (
            <View
              key={friend.id}
              style={styles.card}
            >
              <View
                style={styles.personRow}
              >
                <Avatar
                  name={nameOf(friend)}
                />

                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.name}
                  >
                    {nameOf(friend)}
                  </Text>

                  <Text
                    style={styles.handle}
                  >
                    @{friend.username}
                  </Text>

                  <Text
                    style={[
                      styles.presence,
                      online &&
                        styles.online,
                    ]}
                  >
                    {online
                      ? `En ligne${
                          platform
                            ? ` Â· ${platform}`
                            : ""
                        }`
                      : "Hors ligne"}
                  </Text>
                </View>
              </View>

              <Pressable
                style={
                  styles.secondaryButton
                }
                onPress={() =>
                  onMessage(friend.id)
                }
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Message
                </Text>
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function Messages({
  session,
  initialUserId,
  clearInitial,
  onUnread,
}: {
  session: Session;
  initialUserId: string | null;
  clearInitial: () => void;
  onUnread: (count: number) => void;
}) {
  const userId = session.user.id;

  const [conversations, setConversations] =
    useState<ConversationItem[]>([]);

  const [selected, setSelected] =
    useState<ConversationItem | null>(
      null
    );

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [draft, setDraft] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const loadConversations =
    useCallback(async () => {
      const { data } = await supabase
        .from("conversations")
        .select(
          "id,user_a,user_b,updated_at"
        )
        .or(
          `user_a.eq.${userId},user_b.eq.${userId}`
        )
        .order("updated_at", {
          ascending: false,
        });

      const rows =
        (data ?? []) as Conversation[];

      if (!rows.length) {
        setConversations([]);
        onUnread(0);
        setLoading(false);
        return;
      }

      const otherIds = Array.from(
        new Set(
          rows.map((row) =>
            row.user_a === userId
              ? row.user_b
              : row.user_a
          )
        )
      );

      const conversationIds =
        rows.map((row) => row.id);

      const [
        profilesResult,
        messagesResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,username,display_name"
          )
          .in("id", otherIds),

        supabase
          .from("messages")
          .select(
            "id,conversation_id,sender_id,body,created_at,read_at"
          )
          .in(
            "conversation_id",
            conversationIds
          )
          .order("created_at", {
            ascending: false,
          }),
      ]);

      const profileMap = new Map(
        (
          (profilesResult.data ??
            []) as Profile[]
        ).map((profile) => [
          profile.id,
          profile,
        ])
      );

      const allMessages =
        (messagesResult.data ??
          []) as Message[];

      const next = rows
        .map((conversation) => {
          const otherId =
            conversation.user_a === userId
              ? conversation.user_b
              : conversation.user_a;

          const profile =
            profileMap.get(otherId);

          if (!profile) return null;

          const conversationMessages =
            allMessages.filter(
              (message) =>
                message.conversation_id ===
                conversation.id
            );

          return {
            conversation,
            profile,

            lastMessage:
              conversationMessages[0] ??
              null,

            unread:
              conversationMessages.filter(
                (message) =>
                  message.sender_id !==
                    userId &&
                  !message.read_at
              ).length,
          };
        })
  .filter(Boolean) as ConversationItem[];

      setConversations(next);

      onUnread(
        next.reduce(
          (sum, item) =>
            sum + item.unread,
          0
        )
      );

      setLoading(false);
    }, [userId, onUnread]);

  const loadThread =
    useCallback(
      async (
        conversation: ConversationItem
      ) => {
        const { data } = await supabase
          .from("messages")
          .select(
            "id,conversation_id,sender_id,body,created_at,read_at"
          )
          .eq(
            "conversation_id",
            conversation.conversation.id
          )
          .order("created_at", {
            ascending: true,
          });

        setMessages(
          (data ?? []) as Message[]
        );

        await supabase.rpc(
          "mark_conversation_read",
          {
            p_conversation_id:
              conversation.conversation
                .id,
          }
        );

        void loadConversations();
      },
      [loadConversations]
    );

  useEffect(() => {
    void loadConversations();

    const channel = supabase
      .channel(
        `mobile-messages-${userId}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          void loadConversations();

          if (selected) {
            void loadThread(selected);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [
    userId,
    loadConversations,
    loadThread,
    selected?.conversation.id,
  ]);

  useEffect(() => {
    if (!initialUserId) return;

    void (async () => {
      const { data, error } =
        await supabase.rpc(
          "get_or_create_conversation",
          {
            p_other_user_id:
              initialUserId,
          }
        );

      if (!error && data) {
        const { data: profile } =
          await supabase
            .from("profiles")
            .select(
              "id,username,display_name"
            )
            .eq("id", initialUserId)
            .single();

        if (profile) {
          const item: ConversationItem =
            {
              conversation:
                data as Conversation,

              profile:
                profile as Profile,

              lastMessage: null,
              unread: 0,
            };

          setSelected(item);
          await loadThread(item);
        }
      }

      clearInitial();
    })();
  }, [initialUserId]);

  async function send() {
    const body = draft.trim();

    if (!body || !selected) return;

    setDraft("");

    const { error } = await supabase
      .from("messages")
      .insert({
        conversation_id:
          selected.conversation.id,
        sender_id: userId,
        body,
      });

    if (error) {
      setDraft(body);
      return;
    }

    await loadThread(selected);
  }

  if (loading) {
    return (
      <Loading text="Chargement des messages..." />
    );
  }

  if (selected) {
    return (
      <KeyboardAvoidingView
        style={styles.thread}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <View
          style={styles.threadHeader}
        >
          <Pressable
            onPress={() =>
              setSelected(null)
            }
          >
            <Text style={styles.back}>
              â€¹
            </Text>
          </Pressable>

          <Avatar
            name={nameOf(
              selected.profile
            )}
            size={40}
          />

          <View>
            <Text style={styles.name}>
              {nameOf(
                selected.profile
              )}
            </Text>

            <Text
              style={styles.handle}
            >
              @{selected.profile.username}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={
            styles.messageList
          }
        >
          {messages.map((message) => {
            const mine =
              message.sender_id ===
              userId;

            return (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  mine
                    ? styles.bubbleMine
                    : styles.bubbleOther,
                ]}
              >
                <Text
                  style={
                    styles.bubbleText
                  }
                >
                  {message.body}
                </Text>

                <Text style={styles.time}>
                  {new Date(
                    message.created_at
                  ).toLocaleTimeString(
                    "fr-FR",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={
              styles.composerInput
            }
            value={draft}
            onChangeText={setDraft}
            placeholder="Ã‰cris un message..."
            placeholderTextColor="#647B91"
            multiline
          />

          <Pressable
            style={styles.send}
            onPress={() =>
              void send()
            }
          >
            <Text
              style={styles.sendText}
            >
              âž¤
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
    >
      <Text style={styles.kicker}>
        DISCUSSIONS
      </Text>

      <Text style={styles.title}>
        Messages
      </Text>

      <Text style={styles.subtitle}>
        Les mÃªmes discussions que sur ton PC.
      </Text>

      {!conversations.length ? (
        <Empty text="Aucune conversation." />
      ) : (
        conversations.map((item) => (
          <Pressable
            key={
              item.conversation.id
            }
            style={
              styles.conversation
            }
            onPress={() => {
              setSelected(item);
              void loadThread(item);
            }}
          >
            <Avatar
              name={nameOf(
                item.profile
              )}
            />

            <View style={{ flex: 1 }}>
              <View
                style={
                  styles.rowBetween
                }
              >
                <Text
                  style={styles.name}
                >
                  {nameOf(
                    item.profile
                  )}
                </Text>

                {item.unread > 0 && (
                  <View
                    style={styles.badge}
                  >
                    <Text
                      style={
                        styles.badgeText
                      }
                    >
                      {item.unread}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={styles.preview}
                numberOfLines={1}
              >
                {item.lastMessage
                  ?.body ??
                  "Nouvelle conversation"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function Mates({
  session,
  onMessage,
}: {
  session: Session;
  onMessage: (userId: string) => void;
}) {
  const [query, setQuery] =
    useState("");

  const [results, setResults] =
    useState<Profile[]>([]);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    const value = query.trim();

    if (value.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      void search(value);
    }, 300);

    return () =>
      clearTimeout(timer);
  }, [query]);

  async function search(
    value: string
  ) {
    setLoading(true);

    const [displayResults, usernameResults] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,username,display_name,bio,region"
          )
          .neq(
            "id",
            session.user.id
          )
          .ilike(
            "display_name",
            `%${value}%`
          )
          .limit(20),

        supabase
          .from("profiles")
          .select(
            "id,username,display_name,bio,region"
          )
          .neq(
            "id",
            session.user.id
          )
          .ilike(
            "username",
            `%${value}%`
          )
          .limit(20),
      ]);

    const map =
      new Map<string, Profile>();

    [
      ...(displayResults.data ?? []),
      ...(usernameResults.data ?? []),
    ].forEach((profile) => {
      map.set(
        profile.id,
        profile as Profile
      );
    });

    setResults(
      Array.from(map.values())
    );

    setLoading(false);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>
        DÃ‰COUVERTE
      </Text>

      <Text style={styles.title}>
        Trouver des mates
      </Text>

      <Text style={styles.subtitle}>
        Recherche un joueur GameMate.
      </Text>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Pseudo ou nom..."
        placeholderTextColor="#647B91"
        autoCapitalize="none"
      />

      {loading && (
        <ActivityIndicator />
      )}

      {results.map((player) => (
        <View
          key={player.id}
          style={styles.card}
        >
          <View
            style={styles.personRow}
          >
            <Avatar
              name={nameOf(player)}
            />

            <View style={{ flex: 1 }}>
              <Text
                style={styles.name}
              >
                {nameOf(player)}
              </Text>

              <Text
                style={styles.handle}
              >
                @{player.username}
              </Text>

              {player.region && (
                <Text
                  style={styles.meta}
                >
                  {player.region}
                </Text>
              )}
            </View>
          </View>

          {player.bio && (
            <Text style={styles.bio}>
              {player.bio}
            </Text>
          )}

          <Pressable
            style={
              styles.secondaryButton
            }
            onPress={() =>
              onMessage(player.id)
            }
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Envoyer un message
            </Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function ProfilePage({
  session,
  profile,
  reload,
}: {
  session: Session;
  profile: Profile | null;
  reload: () => Promise<void>;
}) {
  const [displayName, setDisplayName] =
    useState("");

  const [bio, setBio] =
    useState("");

  const [region, setRegion] =
    useState("");

  const [language, setLanguage] =
    useState("fr");

  const [notice, setNotice] =
    useState("");

  useEffect(() => {
    setDisplayName(
      profile?.display_name ?? ""
    );

    setBio(profile?.bio ?? "");
    setRegion(profile?.region ?? "");

    setLanguage(
      profile?.language ?? "fr"
    );
  }, [profile]);

  async function save() {
    setNotice("");

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name:
          displayName.trim() || null,

        bio: bio.trim() || null,

        region:
          region.trim() || null,

        language:
          language.trim() || "fr",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        session.user.id
      );

    if (error) {
      setNotice(
        "Impossible d'enregistrer."
      );
      return;
    }

    setNotice(
      "Profil mis Ã  jour."
    );

    await reload();
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>
        MON COMPTE
      </Text>

      <Text style={styles.title}>
        Profil
      </Text>

      <View style={styles.card}>
        <View
          style={styles.personRow}
        >
          <Avatar
            name={nameOf(profile)}
            size={68}
          />

          <View>
            <Text style={styles.name}>
              {nameOf(profile)}
            </Text>

            <Text
              style={styles.handle}
            >
              @{profile?.username}
            </Text>

            <Text style={styles.meta}>
              {session.user.email}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Field
          label="Nom affichÃ©"
          value={displayName}
          onChange={setDisplayName}
        />

        <Field
          label="Bio"
          value={bio}
          onChange={setBio}
          multiline
        />

        <Field
          label="RÃ©gion"
          value={region}
          onChange={setRegion}
        />

        <Field
          label="Langue"
          value={language}
          onChange={setLanguage}
        />

        {notice && (
          <Text style={styles.notice}>
            {notice}
          </Text>
        )}

        <Pressable
          style={
            styles.primaryButton
          }
          onPress={() =>
            void save()
          }
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            Enregistrer
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.logout}
        onPress={() =>
          void supabase.auth.signOut()
        }
      >
        <Text
          style={styles.logoutText}
        >
          Se dÃ©connecter
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Login() {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function login() {
    setLoading(true);
    setMessage("");

    const { error } =
      await supabase.auth
        .signInWithPassword({
          email:
            email.trim().toLowerCase(),

          password,
        });

    if (error) {
      setMessage(error.message);
    }

    setLoading(false);
  }

  return (
    <View style={styles.authRoot}>
      <StatusBar
        barStyle="light-content"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.authPage
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logo}>
            <Text
              style={styles.logoText}
            >
              GM
            </Text>
          </View>

          <Text style={styles.kicker}>
            GAMEMATE MOBILE
          </Text>

          <Text
            style={styles.authTitle}
          >
            Retrouve tes mates.
          </Text>

          <Text
            style={styles.subtitle}
          >
            Tes amis et tes messages
            GameMate dans ta poche.
          </Text>

          <View
            style={styles.authCard}
          >
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor="#647B91"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />

            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              placeholderTextColor="#647B91"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
            />

            {message && (
              <Text
                style={
                  styles.authMessage
                }
              >
                {message}
              </Text>
            )}

            <Pressable
              style={
                styles.primaryButton
              }
              onPress={() =>
                void login()
              }
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                {loading
                  ? "Connexion..."
                  : "Se connecter"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function BottomNavigation({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const insets = useSafeAreaInsets();

  const tabs: {
    key: Tab;
    label: string;
  }[] = [
    { key: "home", label: "Accueil" },
    { key: "friends", label: "Amis" },
    { key: "messages", label: "Messages" },
    { key: "mates", label: "Mates" },
    { key: "profile", label: "Profil" },
  ];

  return (
    <View
      style={[
        styles.nav,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          height: 62 + Math.max(insets.bottom, 8),
        },
      ]}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          style={styles.navItem}
          onPress={() => onChange(tab.key)}
        >
          <Text
            style={[
              styles.navDot,
              active === tab.key && styles.navActive,
            ]}
          >
            ●
          </Text>

          <Text
            style={[
              styles.navLabel,
              active === tab.key && styles.navActive,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Avatar({
  name,
  size = 46,
}: {
  name: string;
  size?: number;
}) {
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]?.toUpperCase() ?? ""
      )
      .join("") || "GM";

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size * 0.34,
        },
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          {
            fontSize: size * 0.32,
          },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

function QuickAction({
  title,
  text,
  onPress,
}: {
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.action}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>
          {title}
        </Text>

        <Text style={styles.preview}>
          {text}
        </Text>
      </View>

      <Text style={styles.arrow}>
        â€º
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>
        {label}
      </Text>

      <TextInput
        style={[
          styles.input,
          multiline && styles.textarea,
        ]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholderTextColor="#647B91"
      />
    </View>
  );
}

function Loading({
  text,
}: {
  text: string;
}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator />

      <Text style={styles.muted}>
        {text}
      </Text>
    </View>
  );
}

function Empty({
  text,
}: {
  text: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>
        {text}
      </Text>
    </View>
  );
}

function nameOf(
  profile:
    | Profile
    | null
    | undefined
) {
  return (
    profile?.display_name ||
    profile?.username ||
    "Joueur"
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: "#020812",
  },

  content: {
    flex: 1,
  },

  page: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020812",
    gap: 10,
  },

  muted: {
    color: "#8195A9",
    fontSize: 13,
  },

  kicker: {
    color: "#5FD6FF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
  },

  title: {
    color: "#F6F9FC",
    fontSize: 29,
    fontWeight: "900",
  },

  subtitle: {
    color: "#8398AD",
    fontSize: 13,
    lineHeight: 19,
  },

  hero: {
    padding: 20,
    borderWidth: 1,
    borderColor: "#334B87",
    borderRadius: 22,
    backgroundColor: "#0A1730",
  },

  heroLabel: {
    color: "#6DDBFF",
    fontSize: 10,
    fontWeight: "900",
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 8,
  },

  heroText: {
    color: "#94A8BD",
    fontSize: 14,
    marginTop: 7,
  },

  statsRow: {
    flexDirection: "row",
    gap: 10,
  },

  stat: {
    flex: 1,
    padding: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#163A54",
    backgroundColor: "#061522",
  },

  statValue: {
    color: "#F3F7FB",
    fontSize: 26,
    fontWeight: "900",
  },

  statLabel: {
    color: "#7890A8",
    fontSize: 12,
  },

  card: {
    padding: 15,
    gap: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#15344C",
    backgroundColor: "#061522",
  },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172C52",
    borderWidth: 1,
    borderColor: "#315789",
  },

  avatarText: {
    color: "#DCE9FF",
    fontWeight: "900",
  },

  name: {
    color: "#F3F7FB",
    fontSize: 15,
    fontWeight: "900",
  },

  handle: {
    color: "#6E8498",
    fontSize: 12,
  },

  meta: {
    color: "#5F758B",
    fontSize: 11,
  },

  bio: {
    color: "#91A4B7",
    fontSize: 12,
  },

  presence: {
    color: "#667C90",
    fontSize: 12,
    fontWeight: "800",
  },

  online: {
    color: "#64DBA8",
  },

  secondaryButton: {
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#172E58",
  },

  secondaryButtonText: {
    color: "#D4E7FF",
    fontWeight: "900",
  },

  action: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#15344C",
    backgroundColor: "#061522",
  },

  arrow: {
    color: "#6DD5FF",
    fontSize: 28,
  },

  conversation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#15344C",
    backgroundColor: "#061522",
  },

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  preview: {
    color: "#71879B",
    fontSize: 12,
    marginTop: 4,
  },

  badge: {
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#5E46E8",
  },

  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },

  thread: {
    flex: 1,
    backgroundColor: "#020812",
  },

  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#142A3E",
    backgroundColor: "#04101C",
  },

  back: {
    color: "#DDEAF5",
    fontSize: 32,
  },

  messageList: {
    flexGrow: 1,
    justifyContent: "flex-end",
    padding: 14,
    gap: 8,
  },

  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 16,
  },

  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: "#4938BE",
  },

  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#10263A",
  },

  bubbleText: {
    color: "#F8FAFC",
    fontSize: 14,
  },

  time: {
    color: "#B2BECD",
    fontSize: 9,
    marginTop: 4,
  },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    backgroundColor: "#04101C",
  },

  composerInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    paddingHorizontal: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#193952",
    backgroundColor: "#061522",
    color: "#F5F8FC",
  },

  send: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#5E46E8",
  },

  sendText: {
    color: "#FFFFFF",
    fontSize: 19,
  },

  search: {
    height: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#193952",
    borderRadius: 14,
    backgroundColor: "#061522",
    color: "#F5F8FC",
  },

  input: {
    minHeight: 49,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#193952",
    borderRadius: 13,
    backgroundColor: "#03101D",
    color: "#F5F8FC",
  },

  textarea: {
    minHeight: 100,
    paddingTop: 12,
    textAlignVertical: "top",
  },

  fieldLabel: {
    color: "#A7B8C8",
    fontSize: 12,
    fontWeight: "800",
  },

  notice: {
    color: "#6DD6A8",
    fontSize: 12,
  },

  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#5E46E8",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  logout: {
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#512738",
    backgroundColor: "#1A0A11",
  },

  logoutText: {
    color: "#FF9BAC",
    fontWeight: "900",
  },

  empty: {
    padding: 22,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#17344B",
    backgroundColor: "#061522",
  },

 nav: {
  flexDirection: "row",
  borderTopWidth: 1,
  borderTopColor: "#142A3E",
  backgroundColor: "#04101C",
},

  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },

  navDot: {
    color: "#536C84",
    fontSize: 11,
  },

  navLabel: {
    color: "#657A90",
    fontSize: 10,
    fontWeight: "700",
  },

  navActive: {
    color: "#6DD5FF",
  },

  authRoot: {
    flex: 1,
    backgroundColor: "#020812",
  },

  authPage: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },

  logo: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#5E46E8",
    marginBottom: 18,
  },

  logoText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
  },

  authTitle: {
    color: "#F5F8FC",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 7,
  },

  authCard: {
    gap: 11,
    padding: 17,
    marginTop: 20,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#17344B",
    backgroundColor: "#061522",
  },

  authMessage: {
    color: "#AFC1D2",
    fontSize: 12,
  },
});

