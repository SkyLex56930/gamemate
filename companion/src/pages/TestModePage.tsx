import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseTest } from "../lib/supabaseTest";
import "./TestModePage.css";
import TestSupportPanel from "./TestSupportPanel";

type Props = {
  mainSession: Session | null;
  mainDisplayName: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
  language: string | null;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
};

type FriendRequest = Friendship & {
  profile: Profile;
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

export default function TestModePage({
  mainSession,
  mainDisplayName,
}: Props) {
  const [testSession, setTestSession] = useState<Session | null>(null);
  const [testProfile, setTestProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [messagesFromMain, setMessagesFromMain] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [friendshipWithMain, setFriendshipWithMain] = useState<
    "none" | "pending" | "accepted"
  >("none");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testArea, setTestArea] = useState<"support" | "social">("support");

  const mainUserId = mainSession?.user?.id ?? null;
  const testUserId = testSession?.user?.id ?? null;

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabaseTest.auth.getSession();

      if (!mounted) return;

      setTestSession(data.session);
      setAuthLoading(false);
    }

    void init();

    const {
      data: { subscription },
    } = supabaseTest.auth.onAuthStateChange((_event, session) => {
      setTestSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadTestData = useCallback(async () => {
    if (!testUserId) {
      setTestProfile(null);
      setRequests([]);
      setFriends([]);
      setMessagesFromMain([]);
      setFriendshipWithMain("none");
      return;
    }

    setError("");

    const { data: profileData, error: profileError } = await supabaseTest
      .from("profiles")
      .select("id, username, display_name, avatar_url, region, language")
      .eq("id", testUserId)
      .maybeSingle();

    if (profileError) {
      console.error("Mode test / profile:", profileError);
      setError("Impossible de charger le profil du compte test.");
    } else {
      setTestProfile((profileData as Profile | null) ?? null);
    }

    const { data: friendshipData, error: friendshipError } = await supabaseTest
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .or(`requester_id.eq.${testUserId},addressee_id.eq.${testUserId}`)
      .order("created_at", { ascending: false });

    if (friendshipError) {
      console.error("Mode test / friendships:", friendshipError);
      setError("Impossible de charger les relations du compte test.");
      return;
    }

    const rows = (friendshipData ?? []) as Friendship[];

    const otherIds = Array.from(
      new Set(
        rows.map((row) =>
          row.requester_id === testUserId ? row.addressee_id : row.requester_id
        )
      )
    );

    let profileMap = new Map<string, Profile>();

    if (otherIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabaseTest
        .from("profiles")
        .select("id, username, display_name, avatar_url, region, language")
        .in("id", otherIds);

      if (!profilesError) {
        profileMap = new Map(
          ((profilesData ?? []) as Profile[]).map((profile) => [
            profile.id,
            profile,
          ])
        );
      }
    }

    const hydrated = rows
      .map((row) => {
        const otherId =
          row.requester_id === testUserId ? row.addressee_id : row.requester_id;
        const profile = profileMap.get(otherId);
        return profile ? { ...row, profile } : null;
      })
      .filter((row): row is FriendRequest => Boolean(row));

    setRequests(
      hydrated.filter(
        (row) => row.status === "pending" && row.addressee_id === testUserId
      )
    );

    setFriends(hydrated.filter((row) => row.status === "accepted"));

    if (mainUserId) {
      const mainRelation = rows.find(
        (row) =>
          (row.requester_id === testUserId && row.addressee_id === mainUserId) ||
          (row.requester_id === mainUserId && row.addressee_id === testUserId)
      );

      setFriendshipWithMain(
        mainRelation?.status === "accepted"
          ? "accepted"
          : mainRelation?.status === "pending"
          ? "pending"
          : "none"
      );

      const { data: conversationRows } = await supabaseTest
        .from("conversations")
        .select("id, user_a, user_b, updated_at")
        .or(
          `and(user_a.eq.${testUserId},user_b.eq.${mainUserId}),and(user_a.eq.${mainUserId},user_b.eq.${testUserId})`
        )
        .limit(1);

      const conversation = (conversationRows?.[0] ?? null) as Conversation | null;

      if (conversation) {
        const { data: messageRows } = await supabaseTest
          .from("messages")
          .select(
            "id, conversation_id, sender_id, body, created_at, read_at"
          )
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true });

        setMessagesFromMain((messageRows ?? []) as Message[]);

        await supabaseTest.rpc("mark_conversation_read", {
          p_conversation_id: conversation.id,
        });
      } else {
        setMessagesFromMain([]);
      }
    } else {
      setFriendshipWithMain("none");
      setMessagesFromMain([]);
    }
  }, [testUserId, mainUserId]);

  useEffect(() => {
    void loadTestData();
  }, [loadTestData]);

  useEffect(() => {
    if (!testUserId) return;

    const friendshipsChannel = supabaseTest
      .channel(`test-friendships:${testUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => void loadTestData()
      )
      .subscribe();

    const messagesChannel = supabaseTest
      .channel(`test-messages:${testUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => void loadTestData()
      )
      .subscribe();

    return () => {
      void supabaseTest.removeChannel(friendshipsChannel);
      void supabaseTest.removeChannel(messagesChannel);
    };
  }, [testUserId, loadTestData]);

  async function loginTestAccount() {
    if (!email.trim() || !password) return;

    setAuthLoading(true);
    setError("");
    setNotice("");

    const { data, error: loginError } =
      await supabaseTest.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (loginError) {
      setError("Connexion du compte test impossible.");
      setAuthLoading(false);
      return;
    }

    if (data.user.id === mainUserId) {
      await supabaseTest.auth.signOut();
      setError(
        "Le compte test doit être différent du compte principal."
      );
      setAuthLoading(false);
      return;
    }

    setPassword("");
    setNotice("Compte test connecté.");
    setAuthLoading(false);
  }

  async function logoutTestAccount() {
    await supabaseTest.auth.signOut();
    setTestSession(null);
    setTestProfile(null);
    setRequests([]);
    setFriends([]);
    setMessagesFromMain([]);
    setNotice("Compte test déconnecté.");
  }

  async function sendFriendRequestToMain() {
    if (!mainUserId || !testUserId) return;

    setActionLoading(true);
    setError("");
    setNotice("");

    const { error: requestError } = await supabaseTest.rpc(
      "send_friend_request",
      { p_target_user_id: mainUserId }
    );

    if (requestError) {
      console.error("Mode test / send friend request:", requestError);
      setError("Impossible d’envoyer la demande au compte principal.");
    } else {
      setNotice("Demande d’ami envoyée au compte principal.");
      await loadTestData();
    }

    setActionLoading(false);
  }

  async function respondRequest(id: string, accept: boolean) {
    setActionLoading(true);
    setError("");
    setNotice("");

    const { error: responseError } = await supabaseTest.rpc(
      "respond_friend_request",
      {
        p_request_id: id,
        p_accept: accept,
      }
    );

    if (responseError) {
      console.error("Mode test / respond:", responseError);
      setError("Impossible de répondre à la demande.");
    } else {
      setNotice(accept ? "Demande acceptée." : "Demande refusée.");
      await loadTestData();
    }

    setActionLoading(false);
  }

  async function sendMessageToMain() {
    if (!mainUserId || !testUserId || !messageDraft.trim()) return;

    setActionLoading(true);
    setError("");
    setNotice("");

    const { data: conversationData, error: conversationError } =
      await supabaseTest.rpc("get_or_create_conversation", {
        p_other_user_id: mainUserId,
      });

    if (conversationError) {
      console.error("Mode test / conversation:", conversationError);
      setError(
        "Impossible d’ouvrir la conversation avec le compte principal."
      );
      setActionLoading(false);
      return;
    }

    const conversation = conversationData as Conversation;

    const { error: messageError } = await supabaseTest.rpc("send_message", {
      p_conversation_id: conversation.id,
      p_body: messageDraft.trim(),
    });

    if (messageError) {
      console.error("Mode test / message:", messageError);
      setError("Impossible d’envoyer le message.");
    } else {
      setMessageDraft("");
      setNotice("Message envoyé au compte principal.");
      await loadTestData();
    }

    setActionLoading(false);
  }

  const testDisplayName =
    testProfile?.display_name ||
    testProfile?.username ||
    testSession?.user.email ||
    "Compte test";

  const mainReady = Boolean(mainUserId);

  if (authLoading && !testSession) {
    return (
      <section className="tm2 tm2-loading">
        <span className="tm2-loader" />
        <strong>Ouverture du Mode test...</strong>
      </section>
    );
  }

  return (
    <div className="tm2">
      <div className="tm2-grid" />
      <div className="tm2-orb a" />
      <div className="tm2-orb b" />

      <header className="tm2-header">
        <div>
          <span className="tm2-kicker">OUTIL DE DÉVELOPPEMENT</span>
          <h1>
            Mode <span>test</span>
          </h1>
          <p>
            Deux comptes Supabase dans un seul Companion, avec deux sessions
            totalement séparées.
          </p>
        </div>

        <div className="tm2-session-pills">
          <SessionPill
            label="PRINCIPAL"
            value={mainSession ? mainDisplayName : "Non connecté"}
            active={Boolean(mainSession)}
          />
          <SessionPill
            label="TEST"
            value={testSession ? testDisplayName : "Non connecté"}
            active={Boolean(testSession)}
          />
        </div>
      </header>

      {!mainReady && (
        <div className="tm2-warning">
          Connecte d’abord ton compte principal dans GameMate pour profiter de
          tous les tests croisés.
        </div>
      )}

      {!testSession ? (
        <section className="tm2-login-card">
          <div className="tm2-login-copy">
            <span className="tm2-kicker">COMPTE B</span>
            <h2>Connecter le compte test</h2>
            <p>
              Cette connexion utilise un stockage séparé. Elle ne déconnectera
              pas ton compte principal.
            </p>
          </div>

          <div className="tm2-form">
            <label>
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="compte-test@email.com"
              />
            </label>

            <label>
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void loginTestAccount();
                  }
                }}
              />
            </label>

            <button
              type="button"
              className="tm2-primary"
              disabled={authLoading || !email.trim() || !password}
              onClick={() => void loginTestAccount()}
            >
              {authLoading ? "Connexion..." : "Connecter le compte test"}
            </button>

            {error && <div className="tm2-error">{error}</div>}
          </div>
        </section>
      ) : (
        <>
          <div className="tm2-toolbar">
            <div>
              <span className="tm2-kicker">COMPTE TEST CONNECTÉ</span>
              <strong>{testDisplayName}</strong>
              <small>{testSession.user.email}</small>
            </div>

            <button type="button" onClick={() => void logoutTestAccount()}>
              Déconnecter le compte test
            </button>
          </div>

          {error && <div className="tm2-error">{error}</div>}
          {notice && <div className="tm2-notice">{notice}</div>}

          <div className="tm2-test-nav">
            <button
              type="button"
              className={testArea === "support" ? "active" : ""}
              onClick={() => setTestArea("support")}
            >
              <strong>Support & signalements</strong>
              <small>Créer un ticket ou envoyer un signalement</small>
            </button>

            <button
              type="button"
              className={testArea === "social" ? "active" : ""}
              onClick={() => setTestArea("social")}
            >
              <strong>Amis & messages</strong>
              <small>Tester les relations entre les comptes A et B</small>
            </button>
          </div>

          {testArea === "support" ? (
            <TestSupportPanel
              session={testSession}
              mainUserId={mainUserId}
            />
          ) : (
          <div className="tm2-layout">
            <section className="tm2-panel">
              <PanelTitle
                kicker="AMITIÉ"
                title="Compte principal ↔ compte test"
              />

              <div className="tm2-relation">
                <div className="tm2-account-box">
                  <span>A</span>
                  <div>
                    <small>PRINCIPAL</small>
                    <strong>
                      {mainSession ? mainDisplayName : "Non connecté"}
                    </strong>
                  </div>
                </div>

                <div className="tm2-link">
                  <span>↔</span>
                  <small>
                    {friendshipWithMain === "accepted"
                      ? "Amis"
                      : friendshipWithMain === "pending"
                      ? "Demande en attente"
                      : "Aucune relation"}
                  </small>
                </div>

                <div className="tm2-account-box test">
                  <span>B</span>
                  <div>
                    <small>TEST</small>
                    <strong>{testDisplayName}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="tm2-primary"
                disabled={
                  !mainReady ||
                  actionLoading ||
                  friendshipWithMain !== "none"
                }
                onClick={() => void sendFriendRequestToMain()}
              >
                {friendshipWithMain === "accepted"
                  ? "Les deux comptes sont amis"
                  : friendshipWithMain === "pending"
                  ? "Demande déjà en attente"
                  : "Envoyer une demande au compte principal"}
              </button>
            </section>

            <section className="tm2-panel">
              <PanelTitle
                kicker="DEMANDES REÇUES"
                title={`Demandes du compte test (${requests.length})`}
              />

              {requests.length === 0 ? (
                <Empty text="Aucune demande reçue sur le compte test." />
              ) : (
                <div className="tm2-list">
                  {requests.map((request) => (
                    <div className="tm2-person-row" key={request.id}>
                      <Avatar profile={request.profile} />
                      <div>
                        <strong>{profileName(request.profile)}</strong>
                        <small>
                          {request.profile.username
                            ? `@${request.profile.username}`
                            : "GameMate"}
                        </small>
                      </div>

                      <div className="tm2-row-actions">
                        <button
                          type="button"
                          className="accept"
                          disabled={actionLoading}
                          onClick={() =>
                            void respondRequest(request.id, true)
                          }
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void respondRequest(request.id, false)
                          }
                        >
                          Refuser
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="tm2-panel tm2-messages-panel">
              <PanelTitle
                kicker="MESSAGERIE"
                title="Conversation A ↔ B"
              />

              <div className="tm2-message-log">
                {messagesFromMain.length === 0 ? (
                  <Empty text="Aucun message entre les deux comptes." />
                ) : (
                  messagesFromMain.map((message) => (
                    <div
                      key={message.id}
                      className={`tm2-message ${
                        message.sender_id === testUserId ? "test" : "main"
                      }`}
                    >
                      <small>
                        {message.sender_id === testUserId
                          ? "Compte test"
                          : "Compte principal"}
                      </small>
                      <p>{message.body}</p>
                      <span>{formatTime(message.created_at)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="tm2-composer">
                <input
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder={
                    mainReady
                      ? `Message à ${mainDisplayName}...`
                      : "Compte principal non connecté"
                  }
                  disabled={!mainReady}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void sendMessageToMain();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={
                    !mainReady ||
                    actionLoading ||
                    !messageDraft.trim()
                  }
                  onClick={() => void sendMessageToMain()}
                >
                  ➤
                </button>
              </div>
            </section>

            <section className="tm2-panel">
              <PanelTitle
                kicker="AMIS DU COMPTE B"
                title={`Amis (${friends.length})`}
              />

              {friends.length === 0 ? (
                <Empty text="Le compte test n’a aucun ami." />
              ) : (
                <div className="tm2-list">
                  {friends.map((friendship) => (
                    <div className="tm2-person-row" key={friendship.id}>
                      <Avatar profile={friendship.profile} />
                      <div>
                        <strong>{profileName(friendship.profile)}</strong>
                        <small>
                          {friendship.profile.region ||
                            friendship.profile.language ||
                            "GameMate"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionPill({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className={`tm2-session-pill ${active ? "active" : ""}`}>
      <i />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function PanelTitle({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  return (
    <header className="tm2-panel-title">
      <span className="tm2-kicker">{kicker}</span>
      <h2>{title}</h2>
    </header>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="tm2-empty">{text}</div>;
}

function Avatar({ profile }: { profile: Profile }) {
  const name = profileName(profile);

  return (
    <span className="tm2-avatar">
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt={name} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function profileName(profile: Profile) {
  return profile.display_name || profile.username || "Joueur GameMate";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
