import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseTest } from "./lib/supabaseTest";

type Role = "owner" | "admin" | "moderator";
type Access = { allowed: boolean; role: Role | null };

type StaffMember = {
  user_id: string;
  role: Role;
  is_active: boolean;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  presence_status: "online" | "busy" | "offline";
  last_seen_at: string | null;
};

type Channel = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  members: string[];
};

type Message = {
  id: number;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default function AdminTestModePage({
  mainSession,
  mainRole,
}: {
  mainSession: Session;
  mainRole: Role;
}) {
  const [testSession, setTestSession] = useState<Session | null>(null);
  const [testAccess, setTestAccess] = useState<Access | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [presence, setPresence] = useState<"online" | "busy">("online");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    void supabaseTest.auth.getSession().then(({ data }) => setTestSession(data.session));
    const { data } = supabaseTest.auth.onAuthStateChange((_event, session) => {
      setTestSession(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!testSession) {
      setTestAccess(null);
      setStaff([]);
      setChannels([]);
      setMessages([]);
      return;
    }

    void loadAccessAndState();

    const heartbeat = window.setInterval(() => {
      void supabaseTest.rpc("set_my_admin_presence", { p_status: presence });
    }, 30000);

    return () => window.clearInterval(heartbeat);
  }, [testSession?.user.id, presence]);

  useEffect(() => {
    if (!testSession || !selectedChannelId) return;

    void loadMessages(selectedChannelId);

    const live = supabaseTest
      .channel(`admin-test-messages-${selectedChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "moderation_messages",
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        () => void loadMessages(selectedChannelId)
      )
      .subscribe();

    return () => {
      void supabaseTest.removeChannel(live);
    };
  }, [testSession?.user.id, selectedChannelId]);

  async function loadAccessAndState() {
    if (!testSession) return;

    const { data: accessData, error: accessError } = await supabaseTest.rpc(
      "get_my_admin_access"
    );

    if (accessError) {
      setStatusMessage(accessError.message);
      setTestAccess({ allowed: false, role: null });
      return;
    }

    const access = accessData as Access;
    setTestAccess(access);

    if (!access.allowed || !access.role) {
      setStatusMessage("Ce compte test n’a aucun rôle Admin/Modo actif.");
      return;
    }

    await supabaseTest.rpc("set_my_admin_presence", { p_status: presence });

    const { data: stateData, error: stateError } = await supabaseTest.rpc(
      "get_admin_staff_state"
    );

    if (stateError) {
      setStatusMessage(stateError.message);
      return;
    }

    const nextStaff = (((stateData as any)?.staff ?? []) as StaffMember[]);
    const nextChannels = (((stateData as any)?.channels ?? []) as Channel[]);

    setStaff(nextStaff);
    setChannels(nextChannels);
    setSelectedChannelId((current) => {
      if (current && nextChannels.some((channel) => channel.id === current)) {
        return current;
      }
      return nextChannels[0]?.id ?? "";
    });
  }

  async function loginTest() {
    setBusy(true);
    setLoginError("");
    setStatusMessage("");

    const { error } = await supabaseTest.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) setLoginError(error.message);
    setBusy(false);
  }

  async function logoutTest() {
    if (testSession && testAccess?.allowed) {
      await supabaseTest.rpc("set_my_admin_presence", { p_status: "offline" });
    }
    await supabaseTest.auth.signOut();
  }

  async function changePresence(next: "online" | "busy") {
    setPresence(next);
    const { error } = await supabaseTest.rpc("set_my_admin_presence", {
      p_status: next,
    });

    if (error) setStatusMessage(error.message);
    else {
      setStatusMessage(
        `Compte test passé en ${next === "online" ? "En ligne" : "Occupé"}.`
      );
      await loadAccessAndState();
    }
  }

  async function loadMessages(channelId: string) {
    const { data, error } = await supabaseTest
      .from("moderation_messages")
      .select("id,channel_id,sender_id,body,created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(80);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setMessages((data ?? []) as Message[]);
  }

  async function sendMessage() {
    const body = messageBody.trim();
    if (!body || !selectedChannelId) return;

    const { error } = await supabaseTest.rpc("send_moderation_message", {
      p_channel_id: selectedChannelId,
      p_body: body,
    });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setMessageBody("");
    await loadMessages(selectedChannelId);
  }

  const testMember = useMemo(
    () => staff.find((member) => member.user_id === testSession?.user.id) ?? null,
    [staff, testSession?.user.id]
  );

  if (!testSession) {
    return (
      <div className="page admin-test-page">
        <header className="pageHead">
          <span className="eyebrow">MODE TEST ADMIN</span>
          <h1>Deuxième compte de test</h1>
          <p>
            Ton compte principal reste connecté. Connecte ici un compte Admin ou
            Modérateur séparé pour tester les rôles, la présence et les salons.
          </p>
        </header>

        <section className="panel admin-test-login">
          <div className="admin-test-main-account">
            <span>COMPTE PRINCIPAL</span>
            <strong>{mainSession.user.email}</strong>
            <b>{mainRole}</b>
          </div>

          <div className="admin-test-login-form">
            <label>
              <span>Email du compte test</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="modo-test@..."
              />
            </label>

            <label>
              <span>Mot de passe du compte test</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loginTest();
                }}
              />
            </label>

            {loginError && <div className="error">{loginError}</div>}

            <button
              className="primary"
              disabled={busy || !email.trim() || !password}
              onClick={() => void loginTest()}
            >
              {busy ? "Connexion..." : "Connecter le compte test"}
            </button>
          </div>

          <div className="admin-test-note">
            La session du compte B est totalement séparée de ton compte principal.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page admin-test-page">
      <header className="pageHead admin-test-header">
        <div>
          <span className="eyebrow">MODE TEST ADMIN</span>
          <h1>Test Admin / Modérateur</h1>
          <p>Teste les droits et le realtime avec deux comptes en même temps.</p>
        </div>

        <button className="danger" onClick={() => void logoutTest()}>
          Déconnecter le compte test
        </button>
      </header>

      <section className="admin-test-identities">
        <article className="panel admin-test-identity main">
          <span>COMPTE A · PRINCIPAL</span>
          <strong>{mainSession.user.email}</strong>
          <b>{mainRole}</b>
          <small>Session normale du panneau Admin</small>
        </article>

        <article className="panel admin-test-identity test">
          <span>COMPTE B · TEST</span>
          <strong>{testSession.user.email}</strong>
          <b>{testAccess?.allowed ? testAccess.role : "Aucun rôle"}</b>
          <small>Session indépendante de test</small>
        </article>
      </section>

      {!testAccess?.allowed ? (
        <section className="panel admin-test-denied">
          <h2>Le compte test est connecté, mais n’a pas accès à l’Admin.</h2>
          <p>
            Depuis ton compte Owner, ajoute-le dans <b>Équipe admin</b> avec le
            rôle Modérateur ou Administrateur, puis revérifie les droits.
          </p>
          <button className="primary" onClick={() => void loadAccessAndState()}>
            Revérifier les droits
          </button>
        </section>
      ) : (
        <>
          <section className="admin-test-checks">
            <article className="panel">
              <span className="eyebrow">ÉTIQUETTE DE RÔLE</span>
              <h2 className="admin-test-role-title">
                {testAccess.role === "moderator"
                  ? "Modérateur"
                  : testAccess.role === "admin"
                  ? "Administrateur"
                  : "Owner"}
              </h2>
              <p>Étiquette issue du rôle réel stocké dans Supabase.</p>
            </article>

            <article className="panel">
              <span className="eyebrow">PRÉSENCE RÉELLE</span>
              <h2>
                {testMember?.presence_status === "online"
                  ? "En ligne"
                  : testMember?.presence_status === "busy"
                  ? "Occupé"
                  : "Hors ligne"}
              </h2>
              <div className="admin-test-presence-buttons">
                <button
                  className={presence === "online" ? "primary" : "ghost"}
                  onClick={() => void changePresence("online")}
                >
                  En ligne
                </button>
                <button
                  className={presence === "busy" ? "primary" : "ghost"}
                  onClick={() => void changePresence("busy")}
                >
                  Occupé
                </button>
              </div>
            </article>

            <article className="panel">
              <span className="eyebrow">PERMISSIONS</span>
              <h2>
                {testAccess.role === "moderator"
                  ? "Accès Modération"
                  : "Accès Administration"}
              </h2>
              <p>
                {testAccess.role === "moderator"
                  ? "Le compte peut utiliser ses salons mais ne peut pas administrer leur structure."
                  : "Le compte possède les permissions de gestion prévues pour son rôle."}
              </p>
            </article>
          </section>

          {statusMessage && <div className="message">{statusMessage}</div>}

          <section className="admin-test-workspace">
            <aside className="panel admin-test-staff-panel">
              <div className="admin-test-panel-head">
                <div>
                  <span className="eyebrow">STAFF VISIBLE</span>
                  <h2>{staff.length} comptes</h2>
                </div>
                <button className="ghost" onClick={() => void loadAccessAndState()}>
                  Actualiser
                </button>
              </div>

              <div className="admin-test-staff-list">
                {staff.map((member) => (
                  <article
                    key={member.user_id}
                    className={`admin-test-staff-row ${
                      member.user_id === testSession.user.id ? "current" : ""
                    }`}
                  >
                    <div className="admin-test-avatar">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" />
                      ) : (
                        (member.display_name || member.username || member.role)
                          .slice(0, 1)
                          .toUpperCase()
                      )}
                      <i className={member.presence_status} />
                    </div>

                    <div>
                      <strong>
                        {member.display_name ||
                          member.username ||
                          member.user_id.slice(0, 8)}
                      </strong>
                      <span>
                        {member.role} · {member.presence_status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </aside>

            <section className="panel admin-test-chat">
              <div className="admin-test-panel-head">
                <div>
                  <span className="eyebrow">TEST SALONS & MESSAGES</span>
                  <h2>Chat de modération</h2>
                </div>

                <select
                  value={selectedChannelId}
                  onChange={(event) => setSelectedChannelId(event.target.value)}
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      # {channel.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-test-channel-info">
                {channels.find((channel) => channel.id === selectedChannelId)
                  ?.description || "Salon interne de modération."}
              </div>

              <div className="admin-test-message-list">
                {messages.length === 0 ? (
                  <div className="admin-test-empty">
                    Aucun message. Envoie-en un avec le compte test.
                  </div>
                ) : (
                  messages.map((message) => {
                    const sender = staff.find(
                      (member) => member.user_id === message.sender_id
                    );
                    const name =
                      sender?.display_name ||
                      sender?.username ||
                      sender?.role ||
                      "Staff";

                    return (
                      <article
                        key={message.id}
                        className={
                          message.sender_id === testSession.user.id
                            ? "admin-test-message mine"
                            : "admin-test-message"
                        }
                      >
                        <header>
                          <strong>{name}</strong>
                          <span>
                            {sender?.role ?? "staff"} ·{" "}
                            {new Date(message.created_at).toLocaleTimeString(
                              "fr-FR",
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </span>
                        </header>
                        <p>{message.body}</p>
                      </article>
                    );
                  })
                )}
              </div>

              <div className="admin-test-composer">
                <textarea
                  rows={2}
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder="Message envoyé avec le compte test..."
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button
                  className="primary"
                  disabled={!messageBody.trim() || !selectedChannelId}
                  onClick={() => void sendMessage()}
                >
                  Envoyer en tant que compte B
                </button>
              </div>
            </section>
          </section>
        </>
      )}
    </div>
  );
}
