import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { playMessageSendSound } from "../lib/audio";
import "./SquadsPage.css";

type Props = {
  session: Session | null;
  onLogin: () => void;
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
};

type SquadMessage = {
  id: string;
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
};

type Friendship = {
  requester_id: string;
  addressee_id: string;
  status: string;
};

type Tab = "overview" | "members" | "invite" | "chat" | "settings";

const EMPTY_STATE: SquadState = {
  active_squad: null,
  incoming_invites: [],
  outgoing_invites: [],
};

export default function SquadsPage({ session, onLogin }: Props) {
  const [state, setState] = useState<SquadState>(EMPTY_STATE);
  const [games, setGames] = useState<Game[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createName, setCreateName] = useState("Ma squad");
  const [createGameId, setCreateGameId] = useState("");
  const [createMax, setCreateMax] = useState(6);
  const [editName, setEditName] = useState("");
  const [editGameId, setEditGameId] = useState("");
  const [editMax, setEditMax] = useState(6);
  const [friendQuery, setFriendQuery] = useState("");
  const [chatDraft, setChatDraft] = useState("");
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

  const loadState = useCallback(async () => {
    if (!userId) {
      setState(EMPTY_STATE);
      setFriends([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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
      setError("Impossible de charger ta squad.");
      setLoading(false);
      return;
    }

    const nextState = (stateResult.data ?? EMPTY_STATE) as SquadState;
    setState({
      active_squad: nextState.active_squad ?? null,
      incoming_invites: nextState.incoming_invites ?? [],
      outgoing_invites: nextState.outgoing_invites ?? [],
    });

    if (!gamesResult.error) {
      setGames((gamesResult.data ?? []) as Game[]);
    }

    if (!friendshipsResult.error) {
      const rows = (friendshipsResult.data ?? []) as Friendship[];
      const ids = rows.map((row) =>
        row.requester_id === userId ? row.addressee_id : row.requester_id
      );

      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, region")
          .in("id", ids);

        setFriends((profiles ?? []) as FriendProfile[]);
      } else {
        setFriends([]);
      }
    }

    if (nextState.active_squad) {
      setEditName(nextState.active_squad.name || "Ma squad");
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
    if (!userId) return;

    const channel = supabase
      .channel(`squads-v2:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squads" }, () => void loadState())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_members" }, () => void loadState())
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_invites" }, () => void loadState())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "squad_messages" }, () => void loadState())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadState]);

  useEffect(() => {
    if (tab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
        return [
          friend.display_name,
          friend.username,
          friend.region,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [friends, squad, state.outgoing_invites, friendQuery]);

  async function createSquad() {
    setWorking("create");
    setError("");
    setNotice("");

    const { error: createError } = await supabase.rpc("create_squad", {
      p_name: createName.trim() || "Ma squad",
      p_game_id: createGameId ? Number(createGameId) : null,
      p_max_members: createMax,
    });

    if (createError) {
      setError(
        createError.message.includes("already_in_active_squad")
          ? "Tu es déjà dans une squad active."
          : "Impossible de créer la squad."
      );
    } else {
      setNotice("Squad créée.");
      setTab("overview");
      await loadState();
    }

    setWorking(null);
  }

  async function respondInvite(inviteId: string, accept: boolean) {
    setWorking(inviteId);
    setError("");
    setNotice("");

    const { error: responseError } = await supabase.rpc(
      "respond_to_squad_invite",
      {
        p_invite_id: inviteId,
        p_accept: accept,
      }
    );

    if (responseError) {
      setError(
        responseError.message.includes("already_in_active_squad")
          ? "Quitte d’abord ta squad actuelle."
          : responseError.message.includes("squad_full")
          ? "Cette squad est déjà complète."
          : "Impossible de répondre à l’invitation."
      );
    } else {
      setNotice(accept ? "Tu as rejoint la squad." : "Invitation refusée.");
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
          ? "Ta squad est complète."
          : inviteError.message.includes("only_owner_can_invite")
          ? "Seul le chef peut inviter."
          : "Impossible d’envoyer l’invitation."
      );
    } else {
      const result = data as { status?: string };
      setNotice(
        result?.status === "already_pending"
          ? "L’invitation était déjà en attente."
          : "Invitation envoyée."
      );
      await loadState();
    }

    setWorking(null);
  }

  async function cancelInvite(inviteId: string) {
    setWorking(inviteId);
    const { error: actionError } = await supabase.rpc("cancel_squad_invite", {
      p_invite_id: inviteId,
    });

    if (actionError) setError("Impossible d’annuler l’invitation.");
    else await loadState();

    setWorking(null);
  }

  async function saveSettings() {
    if (!squad) return;

    setWorking("settings");
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("update_squad_settings", {
      p_squad_id: squad.squad_id,
      p_name: editName.trim() || "Ma squad",
      p_game_id: editGameId ? Number(editGameId) : null,
      p_max_members: editMax,
    });

    if (actionError) {
      setError(
        actionError.message.includes("max_members_below_current_count")
          ? "La limite ne peut pas être inférieure au nombre de membres."
          : "Impossible d’enregistrer les paramètres."
      );
    } else {
      setNotice("Paramètres enregistrés.");
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
          ? "Squad dissoute."
          : confirmAction.type === "leave"
          ? "Tu as quitté la squad."
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

  async function sendChatMessage() {
    if (!squad || !chatDraft.trim()) return;

    setWorking("chat");
    const body = chatDraft.trim();

    const { error: messageError } = await supabase.rpc("send_squad_message", {
      p_squad_id: squad.squad_id,
      p_body: body,
    });

    if (messageError) {
      setError("Impossible d’envoyer le message.");
    } else {
      setChatDraft("");
      playMessageSendSound();
      await loadState();
    }

    setWorking(null);
  }

  if (!session) {
    return (
      <section className="sq2 sq2-locked">
        <div>
          <span className="sq2-kicker">SQUADS GAMEMATE</span>
          <h1>Monte ton équipe.</h1>
          <p>Connecte-toi pour créer, rejoindre et gérer tes squads.</p>
          <button className="sq2-primary" onClick={onLogin}>Se connecter</button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="sq2 sq2-loading">
        <span className="sq2-loader" />
        <strong>Chargement de tes squads...</strong>
      </section>
    );
  }

  return (
    <div className="sq2">
      <div className="sq2-grid" />
      <header className="sq2-header">
        <div>
          <span className="sq2-kicker">SQUADS 2.0</span>
          <h1>
            Joue en <span>équipe.</span>
          </h1>
          <p>
            Crée ton groupe, invite tes amis, discute et gère ton équipe en temps réel.
          </p>
        </div>

        <div className="sq2-header-stats">
          <Stat label="INVITATIONS" value={state.incoming_invites.length} alert={state.incoming_invites.length > 0} />
          <Stat label="MEMBRES" value={squad?.members.length ?? 0} />
        </div>
      </header>

      {error && <div className="sq2-banner error">{error}</div>}
      {notice && <div className="sq2-banner success">{notice}</div>}

      {state.incoming_invites.length > 0 && (
        <section className="sq2-invites-strip">
          <div className="sq2-section-title">
            <span className="sq2-kicker">INVITATIONS REÇUES</span>
            <h2>{state.incoming_invites.length} invitation{state.incoming_invites.length > 1 ? "s" : ""}</h2>
          </div>

          <div className="sq2-invite-row">
            {state.incoming_invites.map((invite) => (
              <article className="sq2-invite-card" key={invite.invite_id}>
                <Avatar
                  url={invite.sender_avatar_url}
                  name={invite.sender_display_name || invite.sender_username || "Joueur"}
                />
                <div>
                  <strong>{invite.squad_name}</strong>
                  <span>
                    par {invite.sender_display_name || invite.sender_username || "Joueur"}
                  </span>
                  <small>{invite.game_name || "Jeu non défini"}</small>
                </div>
                <div className="sq2-invite-actions">
                  <button
                    className="accept"
                    disabled={working === invite.invite_id}
                    onClick={() => void respondInvite(invite.invite_id, true)}
                  >
                    Rejoindre
                  </button>
                  <button
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
        <CreateSquad
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
          <section className="sq2-command">
            <div className="sq2-command-main">
              <div className="sq2-emblem">
                {squad.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <span className="sq2-kicker">
                  {isOwner ? "TA SQUAD · CHEF" : "SQUAD ACTIVE"}
                </span>
                <h2>{squad.name}</h2>
                <p>{squad.game_name || "Jeu non défini"}</p>
              </div>
            </div>

            <div className="sq2-capacity">
              <strong>{squad.members.length}</strong>
              <span>/ {squad.max_members} membres</span>
              <div>
                <i
                  style={{
                    width: `${Math.min(
                      100,
                      (squad.members.length / squad.max_members) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </section>

          <nav className="sq2-tabs">
            <Tab active={tab === "overview"} label="Vue d’ensemble" onClick={() => setTab("overview")} />
            <Tab active={tab === "members"} label="Membres" count={squad.members.length} onClick={() => setTab("members")} />
            {isOwner && <Tab active={tab === "invite"} label="Inviter" count={state.outgoing_invites.length} onClick={() => setTab("invite")} />}
            <Tab active={tab === "chat"} label="Chat" onClick={() => setTab("chat")} />
            <Tab active={tab === "settings"} label="Paramètres" onClick={() => setTab("settings")} />
          </nav>

          <section className="sq2-body">
            {tab === "overview" && (
              <Overview
                squad={squad}
                isOwner={isOwner}
                onInvite={() => setTab("invite")}
                onChat={() => setTab("chat")}
                onMembers={() => setTab("members")}
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

            {tab === "chat" && (
              <SquadChat
                messages={squad.messages ?? []}
                currentUserId={userId!}
                draft={chatDraft}
                working={working === "chat"}
                bottomRef={chatBottomRef}
                onDraft={setChatDraft}
                onSend={() => void sendChatMessage()}
              />
            )}

            {tab === "settings" && (
              <Settings
                squad={squad}
                games={games}
                isOwner={isOwner}
                name={editName}
                gameId={editGameId}
                maxMembers={editMax}
                working={working === "settings"}
                onName={setEditName}
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

function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`sq2-stat ${alert ? "alert" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Tab({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button className={`sq2-tab ${active ? "active" : ""}`} onClick={onClick}>
      {label}
      {typeof count === "number" && <b>{count}</b>}
    </button>
  );
}

function CreateSquad({
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
    <section className="sq2-create">
      <div className="sq2-create-copy">
        <span className="sq2-kicker">NOUVELLE SQUAD</span>
        <h2>Crée ton groupe en quelques secondes.</h2>
        <p>
          Tu deviendras chef de la squad et pourras inviter tes amis immédiatement.
        </p>
      </div>

      <div className="sq2-form">
        <label>
          <span>Nom de la squad</span>
          <input maxLength={40} value={name} onChange={(e) => onNameChange(e.target.value)} />
        </label>

        <label>
          <span>Jeu</span>
          <select value={gameId} onChange={(e) => onGameChange(e.target.value)}>
            <option value="">Aucun jeu spécifique</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>{game.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Taille maximale</span>
          <select value={maxMembers} onChange={(e) => onMaxChange(Number(e.target.value))}>
            {[2,3,4,5,6,7,8,9,10,11,12].map((value) => (
              <option key={value} value={value}>{value} joueurs</option>
            ))}
          </select>
        </label>

        <button className="sq2-primary" disabled={working || !name.trim()} onClick={onCreate}>
          {working ? "Création..." : "Créer la squad"}
        </button>
      </div>
    </section>
  );
}

function Overview({
  squad,
  isOwner,
  onInvite,
  onChat,
  onMembers,
}: {
  squad: ActiveSquad;
  isOwner: boolean;
  onInvite: () => void;
  onChat: () => void;
  onMembers: () => void;
}) {
  const owner = squad.members.find((member) => member.role === "owner");

  return (
    <div className="sq2-overview">
      <section className="sq2-card hero-card">
        <span className="sq2-kicker">ÉQUIPE ACTIVE</span>
        <h3>{squad.name}</h3>
        <p>
          {squad.game_name
            ? `Squad prête pour ${squad.game_name}.`
            : "Squad multi-jeux prête à partir."}
        </p>

        <div className="sq2-quick-actions">
          {isOwner && <button onClick={onInvite}>+ Inviter un ami</button>}
          <button onClick={onChat}>Ouvrir le chat</button>
          <button onClick={onMembers}>Voir les membres</button>
        </div>
      </section>

      <section className="sq2-card">
        <span className="sq2-kicker">CHEF</span>
        {owner ? (
          <div className="sq2-owner">
            <Avatar url={owner.avatar_url} name={memberName(owner)} large />
            <div>
              <strong>{memberName(owner)}</strong>
              <span>{owner.username ? `@${owner.username}` : "GameMate"}</span>
            </div>
          </div>
        ) : (
          <p>Chef non disponible.</p>
        )}
      </section>

      <section className="sq2-card">
        <span className="sq2-kicker">CAPACITÉ</span>
        <div className="sq2-big-number">
          {squad.members.length}<small> / {squad.max_members}</small>
        </div>
        <p>{squad.max_members - squad.members.length} place(s) disponible(s).</p>
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
    <div className="sq2-members">
      {squad.members.map((member) => (
        <article className="sq2-member" key={member.user_id}>
          <Avatar url={member.avatar_url} name={memberName(member)} large />
          <div className="sq2-member-copy">
            <strong>
              {memberName(member)}
              {member.user_id === currentUserId && <em>Toi</em>}
            </strong>
            <span>{member.username ? `@${member.username}` : "GameMate"}</span>
          </div>

          <span className={`sq2-role ${member.role}`}>
            {member.role === "owner" ? "CHEF" : "MEMBRE"}
          </span>

          {isOwner && member.user_id !== currentUserId && (
            <div className="sq2-member-actions">
              <button disabled={Boolean(working)} onClick={() => onTransfer(member)}>
                Nommer chef
              </button>
              <button className="danger" disabled={Boolean(working)} onClick={() => onKick(member)}>
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
    <div className="sq2-invite-layout">
      <section className="sq2-card">
        <div className="sq2-section-title">
          <span className="sq2-kicker">TES AMIS</span>
          <h3>Inviter dans la squad</h3>
        </div>

        <input
          className="sq2-search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Rechercher un ami..."
        />

        <div className="sq2-friend-list">
          {friends.length === 0 ? (
            <div className="sq2-empty">Aucun ami disponible à inviter.</div>
          ) : (
            friends.map((friend) => (
              <div className="sq2-friend" key={friend.id}>
                <Avatar url={friend.avatar_url} name={profileName(friend)} />
                <div>
                  <strong>{profileName(friend)}</strong>
                  <span>{friend.username ? `@${friend.username}` : friend.region || "GameMate"}</span>
                </div>
                <button disabled={working === friend.id} onClick={() => onInvite(friend.id)}>
                  {working === friend.id ? "..." : "Inviter"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="sq2-card">
        <div className="sq2-section-title">
          <span className="sq2-kicker">EN ATTENTE</span>
          <h3>Invitations envoyées</h3>
        </div>

        <div className="sq2-friend-list">
          {pending.length === 0 ? (
            <div className="sq2-empty">Aucune invitation en attente.</div>
          ) : (
            pending.map((invite) => (
              <div className="sq2-friend" key={invite.invite_id}>
                <Avatar
                  url={invite.recipient_avatar_url}
                  name={invite.recipient_display_name || invite.recipient_username || "Joueur"}
                />
                <div>
                  <strong>{invite.recipient_display_name || invite.recipient_username || "Joueur"}</strong>
                  <span>Invitation en attente</span>
                </div>
                <button
                  className="ghost-danger"
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

function SquadChat({
  messages,
  currentUserId,
  draft,
  working,
  bottomRef,
  onDraft,
  onSend,
}: {
  messages: SquadMessage[];
  currentUserId: string;
  draft: string;
  working: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="sq2-chat">
      <div className="sq2-chat-log">
        {messages.length === 0 ? (
          <div className="sq2-chat-empty">
            <span>✦</span>
            <strong>Le chat est vide.</strong>
            <p>Envoie le premier message à ta squad.</p>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            return (
              <div className={`sq2-chat-row ${mine ? "mine" : ""}`} key={message.id}>
                {!mine && (
                  <Avatar
                    url={message.sender_avatar_url}
                    name={message.sender_display_name || message.sender_username || "Joueur"}
                  />
                )}
                <div className="sq2-chat-bubble">
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

      <div className="sq2-chat-composer">
        <textarea
          value={draft}
          maxLength={2000}
          placeholder="Message à la squad..."
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button disabled={working || !draft.trim()} onClick={onSend}>➤</button>
      </div>
    </div>
  );
}

function Settings({
  squad,
  games,
  isOwner,
  name,
  gameId,
  maxMembers,
  working,
  onName,
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
  gameId: string;
  maxMembers: number;
  working: boolean;
  onName: (v: string) => void;
  onGame: (v: string) => void;
  onMax: (v: number) => void;
  onSave: () => void;
  onLeave: () => void;
  onDissolve: () => void;
}) {
  return (
    <div className="sq2-settings">
      <section className="sq2-card">
        <span className="sq2-kicker">PARAMÈTRES DE SQUAD</span>
        <h3>Configuration</h3>

        {isOwner ? (
          <div className="sq2-form compact">
            <label>
              <span>Nom</span>
              <input maxLength={40} value={name} onChange={(e) => onName(e.target.value)} />
            </label>
            <label>
              <span>Jeu</span>
              <select value={gameId} onChange={(e) => onGame(e.target.value)}>
                <option value="">Aucun jeu spécifique</option>
                {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
              </select>
            </label>
            <label>
              <span>Nombre maximum</span>
              <select value={maxMembers} onChange={(e) => onMax(Number(e.target.value))}>
                {[2,3,4,5,6,7,8,9,10,11,12].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <button className="sq2-primary" disabled={working} onClick={onSave}>
              {working ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        ) : (
          <p>Seul le chef peut modifier le nom, le jeu et la taille de la squad.</p>
        )}
      </section>

      <section className="sq2-card danger-card">
        <span className="sq2-kicker">ZONE DE GESTION</span>
        <h3>{isOwner ? "Dissoudre la squad" : "Quitter la squad"}</h3>
        <p>
          {isOwner
            ? "Si tu veux simplement partir sans fermer la squad, transfère d’abord le rôle de chef à un autre membre."
            : "Tu pourras rejoindre ou créer une autre squad après ton départ."}
        </p>

        {isOwner ? (
          <button className="sq2-danger" onClick={onDissolve}>Dissoudre définitivement</button>
        ) : (
          <button className="sq2-danger" onClick={onLeave}>Quitter la squad</button>
        )}
      </section>
    </div>
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
      ? ["Dissoudre la squad ?", "La squad sera fermée et toutes les invitations en attente seront annulées.", "Dissoudre"]
      : action.type === "leave"
      ? ["Quitter la squad ?", "Tu ne seras plus membre de cette squad.", "Quitter"]
      : action.type === "kick"
      ? [`Exclure ${memberName(action.member)} ?`, "Ce membre sera retiré immédiatement de la squad.", "Exclure"]
      : [`Nommer ${memberName(action.member)} chef ?`, "Tu deviendras membre et cette personne prendra le contrôle de la squad.", "Transférer"];

  return (
    <div className="sq2-modal-backdrop" onMouseDown={onClose}>
      <section className="sq2-modal" onMouseDown={(e) => e.stopPropagation()}>
        <span className="sq2-kicker">CONFIRMATION</span>
        <h2>{content[0]}</h2>
        <p>{content[1]}</p>
        <div>
          <button disabled={working} onClick={onClose}>Annuler</button>
          <button className="danger" disabled={working} onClick={onConfirm}>
            {working ? "..." : content[2]}
          </button>
        </div>
      </section>
    </div>
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
    <span className={`sq2-avatar ${large ? "large" : ""}`}>
      {url ? <img src={url} alt={name} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function memberName(member: Member) {
  return member.display_name || member.username || "Joueur GameMate";
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
