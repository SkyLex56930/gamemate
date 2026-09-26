import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Game = {
  id: number;
  name: string;
};

type SquadMember = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: "owner" | "member";
};

type GameSession = {
  id: string;
  squad_id: string;
  game_id: number | null;
  mode: string;
  server_region: string | null;
  status: "ready_check" | "in_game" | "finished" | "cancelled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
};

type MemberSessionState = {
  session_id: string;
  squad_id: string;
  user_id: string;
  readiness: "not_ready" | "ready" | "away";
  preferred_role: string | null;
  updated_at: string;
};

type Props = {
  squadId: string;
  currentUserId: string;
  isOwner: boolean;
  members: SquadMember[];
  games: Game[];
  defaultGameId: number | null;
  onOpenChat: () => void;
};

const ROLE_SUGGESTIONS = ["Flex", "Tank", "DPS", "Support", "IGL", "Sniper"];

export default function SquadGameSession({
  squadId,
  currentUserId,
  isOwner,
  members,
  games,
  defaultGameId,
  onOpenChat,
}: Props) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [memberStates, setMemberStates] = useState<MemberSessionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gameId, setGameId] = useState(defaultGameId == null ? "" : String(defaultGameId));
  const [mode, setMode] = useState("");
  const [serverRegion, setServerRegion] = useState("");
  const [preferredRole, setPreferredRole] = useState("");

  const loadSession = useCallback(async () => {
    const sessionResult = await supabase
      .from("squad_game_sessions")
      .select(
        "id, squad_id, game_id, mode, server_region, status, created_by, created_at, updated_at, started_at, ended_at"
      )
      .eq("squad_id", squadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionResult.error) {
      console.error("Squad game session:", sessionResult.error);
      setError("Impossible de charger la session. Vérifie que le SQL V11 a bien été exécuté.");
      setLoading(false);
      return;
    }

    const latest = (sessionResult.data ?? null) as GameSession | null;
    const visibleSession = latest?.status === "cancelled" ? null : latest;
    setSession(visibleSession);

    if (!visibleSession) {
      setMemberStates([]);
      setLoading(false);
      return;
    }

    const statesResult = await supabase
      .from("squad_game_session_members")
      .select("session_id, squad_id, user_id, readiness, preferred_role, updated_at")
      .eq("session_id", visibleSession.id);

    if (statesResult.error) {
      console.error("Squad session members:", statesResult.error);
      setError("La session est visible, mais les statuts des membres sont indisponibles.");
    } else {
      setMemberStates((statesResult.data ?? []) as MemberSessionState[]);
    }

    setLoading(false);
  }, [squadId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const channel = supabase
      .channel(`squad-game-session:${squadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "squad_game_sessions",
          filter: `squad_id=eq.${squadId}`,
        },
        () => void loadSession()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "squad_game_session_members",
          filter: `squad_id=eq.${squadId}`,
        },
        () => void loadSession()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [squadId, loadSession]);

  useEffect(() => {
    if (!session) {
      setGameId(defaultGameId == null ? "" : String(defaultGameId));
      setMode("");
      setServerRegion("");
      return;
    }

    setGameId(session.game_id == null ? "" : String(session.game_id));
    setMode(session.mode);
    setServerRegion(session.server_region ?? "");
  }, [session?.id, session?.game_id, session?.mode, session?.server_region, defaultGameId]);

  const stateByUser = useMemo(
    () => new Map(memberStates.map((state) => [state.user_id, state])),
    [memberStates]
  );

  const roster = useMemo(
    () =>
      members.map((member) => ({
        member,
        state: stateByUser.get(member.user_id) ?? {
          session_id: session?.id ?? "",
          squad_id: squadId,
          user_id: member.user_id,
          readiness: "not_ready" as const,
          preferred_role: null,
          updated_at: "",
        },
      })),
    [members, stateByUser, session?.id, squadId]
  );

  const myState = stateByUser.get(currentUserId);

  useEffect(() => {
    setPreferredRole(myState?.preferred_role ?? "");
  }, [myState?.preferred_role, session?.id]);

  const readyCount = roster.filter(({ state }) => state.readiness === "ready").length;
  const awayCount = roster.filter(({ state }) => state.readiness === "away").length;
  const waitingCount = roster.length - readyCount - awayCount;
  const canStart = readyCount > 0 && waitingCount === 0;
  const selectedGame = games.find((game) => game.id === session?.game_id);

  function clearFeedback() {
    setError("");
    setNotice("");
  }

  function sessionError(message: string) {
    if (message.includes("active_session_exists")) return "Une session est déjà active.";
    if (message.includes("members_not_ready")) return "Certains membres n’ont pas encore répondu.";
    if (message.includes("no_ready_members")) return "Au moins un membre doit être prêt.";
    if (message.includes("only_owner")) return "Cette action est réservée au chef de la squad.";
    if (message.includes("session_closed")) return "Cette session est déjà terminée.";
    return "L’action n’a pas pu être effectuée.";
  }

  async function createSession() {
    if (!mode.trim()) return;
    clearFeedback();
    setWorking("create");

    const { error: actionError } = await supabase.rpc("create_squad_game_session", {
      p_squad_id: squadId,
      p_game_id: gameId ? Number(gameId) : null,
      p_mode: mode.trim(),
      p_server_region: serverRegion.trim() || null,
    });

    if (actionError) setError(sessionError(actionError.message));
    else {
      setNotice("Ready-check envoyé à toute la squad.");
      await loadSession();
    }

    setWorking(null);
  }

  async function saveSession() {
    if (!session || !mode.trim()) return;
    clearFeedback();
    setWorking("save");

    const { error: actionError } = await supabase.rpc("update_squad_game_session", {
      p_session_id: session.id,
      p_game_id: gameId ? Number(gameId) : null,
      p_mode: mode.trim(),
      p_server_region: serverRegion.trim() || null,
    });

    if (actionError) setError(sessionError(actionError.message));
    else {
      setNotice("Paramètres de session enregistrés.");
      await loadSession();
    }

    setWorking(null);
  }

  async function updatePresence(
    readiness: MemberSessionState["readiness"],
    role = preferredRole
  ) {
    if (!session || session.status === "finished") return;
    clearFeedback();
    setWorking(`presence-${readiness}`);

    const { error: actionError } = await supabase.rpc("set_squad_game_presence", {
      p_session_id: session.id,
      p_readiness: readiness,
      p_preferred_role: role.trim() || null,
    });

    if (actionError) setError(sessionError(actionError.message));
    else await loadSession();
    setWorking(null);
  }

  async function saveRole() {
    const currentRole = myState?.preferred_role ?? "";
    if (!session || session.status === "finished" || preferredRole.trim() === currentRole) return;
    await updatePresence(myState?.readiness ?? "not_ready", preferredRole);
  }

  async function runAction(
    action: "start" | "finish" | "replay" | "cancel",
    rpcName:
      | "start_squad_game_session"
      | "finish_squad_game_session"
      | "replay_squad_game_session"
      | "cancel_squad_game_session"
  ) {
    if (!session) return;
    clearFeedback();
    setWorking(action);

    const { error: actionError } = await supabase.rpc(rpcName, {
      p_session_id: session.id,
    });

    if (actionError) setError(sessionError(actionError.message));
    else {
      setNotice(
        action === "start"
          ? "La partie est lancée."
          : action === "finish"
            ? "Partie terminée."
            : action === "replay"
              ? "Nouveau ready-check envoyé."
              : "Session fermée."
      );
      await loadSession();
    }

    setWorking(null);
  }

  if (loading) {
    return <div className="game-session-loading">Chargement de la session...</div>;
  }

  if (!session) {
    return (
      <div className="game-session-page">
        <SessionHeader status="idle" title="Préparer la prochaine partie" />
        {error && <div className="game-session-alert error">{error}</div>}
        {notice && <div className="game-session-alert">{notice}</div>}

        {isOwner ? (
          <section className="game-session-create">
            <div className="game-session-create-copy">
              <span>READY-CHECK</span>
              <h3>Configure la session.</h3>
              <p>
                Les membres recevront une notification réelle et pourront indiquer leur rôle,
                leur disponibilité et leur état de préparation.
              </p>
            </div>
            <SessionForm
              games={games}
              gameId={gameId}
              mode={mode}
              serverRegion={serverRegion}
              disabled={working === "create"}
              submitLabel={working === "create" ? "Création..." : "Lancer le ready-check"}
              onGame={setGameId}
              onMode={setMode}
              onServerRegion={setServerRegion}
              onSubmit={() => void createSession()}
            />
          </section>
        ) : (
          <section className="game-session-waiting">
            <div className="game-session-radar"><i /><i /><i /></div>
            <span>AUCUNE SESSION ACTIVE</span>
            <h3>Le chef prépare la prochaine partie.</h3>
            <p>Tu recevras une notification dès que le ready-check sera ouvert.</p>
            <button type="button" onClick={onOpenChat}>Ouvrir le chat de squad</button>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className={`game-session-page ${session.status}`}>
      <SessionHeader
        status={session.status}
        title={selectedGame?.name ?? "Session multi-jeux"}
        subtitle={`${session.mode}${session.server_region ? ` · ${session.server_region}` : ""}`}
      />

      {error && <div className="game-session-alert error">{error}</div>}
      {notice && <div className="game-session-alert">{notice}</div>}

      <div className="game-session-summary">
        <div><span>PRÊTS</span><strong>{readyCount}</strong><small>sur {roster.length}</small></div>
        <div><span>EN ATTENTE</span><strong>{waitingCount}</strong><small>réponse(s)</small></div>
        <div><span>ABSENTS</span><strong>{awayCount}</strong><small>indisponible(s)</small></div>
        <div className="game-session-progress">
          <span style={{ width: `${roster.length ? (readyCount / roster.length) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="game-session-layout">
        <section className="game-session-roster">
          <header>
            <div><span>COMPOSITION</span><h3>État de la squad</h3></div>
            <b>{roster.length}</b>
          </header>

          <div className="game-session-member-list">
            {roster.map(({ member, state }) => (
              <article key={member.user_id} className={`game-session-member ${state.readiness}`}>
                <SessionAvatar member={member} />
                <div className="game-session-member-copy">
                  <strong>{memberName(member)}{member.user_id === currentUserId ? <em>TOI</em> : null}</strong>
                  <small>{state.preferred_role || "Rôle non défini"}</small>
                </div>
                <span className="game-session-member-state">
                  {session.status === "in_game" && state.readiness === "ready"
                    ? "EN JEU"
                    : readinessLabel(state.readiness)}
                </span>
              </article>
            ))}
          </div>
        </section>

        <aside className="game-session-console">
          {session.status !== "finished" ? (
            <>
              <span className="game-session-console-kicker">TON STATUT</span>
              <h3>{session.status === "in_game" ? "Partie en cours" : "Tu joues ?"}</h3>
              <p>Ton statut est synchronisé instantanément pour tous les membres.</p>

              <label className="game-session-role">
                <span>Rôle pour cette partie</span>
                <input
                  list="gamemate-session-roles"
                  value={preferredRole}
                  maxLength={40}
                  placeholder="Ex. Support, Tank, Flex..."
                  disabled={Boolean(working)}
                  onChange={(event) => setPreferredRole(event.target.value)}
                  onBlur={() => void saveRole()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <datalist id="gamemate-session-roles">
                  {ROLE_SUGGESTIONS.map((role) => <option key={role} value={role} />)}
                </datalist>
              </label>

              <div className="game-session-status-actions">
                <button
                  type="button"
                  className={myState?.readiness === "ready" ? "active ready" : ""}
                  disabled={Boolean(working)}
                  onClick={() => void updatePresence("ready")}
                >
                  <span>✓</span><strong>Prêt</strong><small>Je rejoins la partie</small>
                </button>
                <button
                  type="button"
                  className={(myState?.readiness ?? "not_ready") === "not_ready" ? "active waiting" : ""}
                  disabled={Boolean(working)}
                  onClick={() => void updatePresence("not_ready")}
                >
                  <span>…</span><strong>Pas prêt</strong><small>J’ai besoin d’un moment</small>
                </button>
                <button
                  type="button"
                  className={myState?.readiness === "away" ? "active away" : ""}
                  disabled={Boolean(working)}
                  onClick={() => void updatePresence("away")}
                >
                  <span>×</span><strong>Absent</strong><small>Ne m’attendez pas</small>
                </button>
              </div>
            </>
          ) : (
            <div className="game-session-finished-panel">
              <span>SESSION TERMINÉE</span>
              <h3>Bien joué.</h3>
              <p>Le chef peut relancer le même groupe ou préparer une nouvelle session.</p>
            </div>
          )}

          {isOwner && session.status === "ready_check" && (
            <div className="game-session-owner-zone">
              <span>CONTRÔLES DU CHEF</span>
              <SessionForm
                games={games}
                gameId={gameId}
                mode={mode}
                serverRegion={serverRegion}
                compact
                disabled={Boolean(working)}
                submitLabel={working === "save" ? "Enregistrement..." : "Enregistrer"}
                onGame={setGameId}
                onMode={setMode}
                onServerRegion={setServerRegion}
                onSubmit={() => void saveSession()}
              />
              <button
                type="button"
                className="game-session-launch"
                disabled={!canStart || Boolean(working)}
                title={!canStart ? "Tous les membres présents doivent être prêts" : undefined}
                onClick={() => void runAction("start", "start_squad_game_session")}
              >
                {working === "start" ? "Lancement..." : "Lancer la partie"}
              </button>
              <button
                type="button"
                className="game-session-secondary danger"
                disabled={Boolean(working)}
                onClick={() => void runAction("cancel", "cancel_squad_game_session")}
              >
                Annuler la session
              </button>
            </div>
          )}

          {isOwner && session.status === "in_game" && (
            <button
              type="button"
              className="game-session-finish"
              disabled={Boolean(working)}
              onClick={() => void runAction("finish", "finish_squad_game_session")}
            >
              {working === "finish" ? "Finalisation..." : "Terminer la partie"}
            </button>
          )}

          {isOwner && session.status === "finished" && (
            <div className="game-session-post-actions">
              <button
                type="button"
                className="game-session-launch"
                disabled={Boolean(working)}
                onClick={() => void runAction("replay", "replay_squad_game_session")}
              >
                {working === "replay" ? "Relance..." : "Rejouer avec la squad"}
              </button>
              <button
                type="button"
                className="game-session-secondary"
                disabled={Boolean(working)}
                onClick={() => void runAction("cancel", "cancel_squad_game_session")}
              >
                Préparer une autre session
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SessionHeader({
  status,
  title,
  subtitle,
}: {
  status: "idle" | GameSession["status"];
  title: string;
  subtitle?: string;
}) {
  const label =
    status === "ready_check"
      ? "READY-CHECK OUVERT"
      : status === "in_game"
        ? "PARTIE EN COURS"
        : status === "finished"
          ? "SESSION TERMINÉE"
          : "PROCHAINE SESSION";

  return (
    <header className="game-session-head">
      <div className={`game-session-signal ${status}`}><i /><b /></div>
      <div>
        <span>{label}</span>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className={`game-session-live ${status}`}><i />{label}</div>
    </header>
  );
}

function SessionForm({
  games,
  gameId,
  mode,
  serverRegion,
  compact = false,
  disabled,
  submitLabel,
  onGame,
  onMode,
  onServerRegion,
  onSubmit,
}: {
  games: Game[];
  gameId: string;
  mode: string;
  serverRegion: string;
  compact?: boolean;
  disabled: boolean;
  submitLabel: string;
  onGame: (value: string) => void;
  onMode: (value: string) => void;
  onServerRegion: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className={`game-session-form ${compact ? "compact" : ""}`}>
      <label>
        <span>Jeu</span>
        <select value={gameId} disabled={disabled} onChange={(event) => onGame(event.target.value)}>
          <option value="">Multi-jeux</option>
          {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
        </select>
      </label>
      <label>
        <span>Mode de jeu</span>
        <input
          value={mode}
          maxLength={60}
          disabled={disabled}
          placeholder="Classé, détente, tournoi..."
          onChange={(event) => onMode(event.target.value)}
        />
      </label>
      <label>
        <span>Serveur / région</span>
        <input
          value={serverRegion}
          maxLength={60}
          disabled={disabled}
          placeholder="Europe Ouest, Paris..."
          onChange={(event) => onServerRegion(event.target.value)}
        />
      </label>
      <button type="button" disabled={disabled || !mode.trim()} onClick={onSubmit}>{submitLabel}</button>
    </div>
  );
}

function SessionAvatar({ member }: { member: SquadMember }) {
  const name = memberName(member);
  return (
    <span className="game-session-avatar">
      {member.avatar_url ? <img src={member.avatar_url} alt={name} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function memberName(member: SquadMember) {
  return member.display_name || member.username || "Joueur GameMate";
}

function readinessLabel(readiness: MemberSessionState["readiness"]) {
  if (readiness === "ready") return "PRÊT";
  if (readiness === "away") return "ABSENT";
  return "PAS PRÊT";
}
