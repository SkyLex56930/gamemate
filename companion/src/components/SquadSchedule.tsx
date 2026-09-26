import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Icon } from "./Icon";
import "./SquadSchedule.css";

type Game = { id: number; name: string };
type ResponseValue = "going" | "maybe" | "declined";

export type ScheduledSession = {
  session_id: string;
  squad_id: string;
  squad_name: string;
  game_id: number | null;
  game_name: string | null;
  title: string;
  mode: string;
  server_region: string | null;
  starts_at: string;
  duration_minutes: number;
  max_players: number;
  notes: string | null;
  status: "scheduled" | "cancelled" | "completed";
  created_by: string;
  going_count: number;
  maybe_count: number;
  my_response: ResponseValue | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  squadId: string;
  isOwner: boolean;
  games: Game[];
  defaultGameId: number | null;
  squadMaxMembers: number;
  onOpenLiveSession: () => void;
};

type FormState = {
  title: string;
  gameId: string;
  mode: string;
  serverRegion: string;
  startsAt: string;
  duration: number;
  maxPlayers: number;
  notes: string;
};

function initialForm(defaultGameId: number | null, maxPlayers: number): FormState {
  const start = new Date(Date.now() + 60 * 60_000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  return {
    title: "Session avec la squad",
    gameId: defaultGameId == null ? "" : String(defaultGameId),
    mode: "",
    serverRegion: "Europe",
    startsAt: toLocalInput(start),
    duration: 120,
    maxPlayers: Math.max(2, Math.min(12, maxPlayers)),
    notes: "",
  };
}

export default function SquadSchedule({
  squadId,
  isOwner,
  games,
  defaultGameId,
  squadMaxMembers,
  onOpenLiveSession,
}: Props) {
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledSession | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScheduledSession | null>(null);
  const [form, setForm] = useState(() => initialForm(defaultGameId, squadMaxMembers));

  const loadSessions = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    const { data, error: loadError } = await supabase.rpc("get_my_scheduled_sessions_v12", {
      p_squad_id: squadId,
      p_limit: 20,
    });

    if (loadError) {
      console.error("Scheduled sessions:", loadError);
      setError("Impossible de charger le planning. Vérifie que le SQL V12 est installé.");
    } else {
      setSessions(((data ?? []) as ScheduledSession[]).map((session) => ({
        ...session,
        going_count: Number(session.going_count ?? 0),
        maybe_count: Number(session.maybe_count ?? 0),
      })));
      setError("");
    }
    setLoading(false);
  }, [squadId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadSessions(true), 180);
    };
    const channel = supabase
      .channel(`squad-schedule-v12:${squadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_sessions", filter: `squad_id=eq.${squadId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_scheduled_session_responses", filter: `squad_id=eq.${squadId}` }, refresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadSessions, squadId]);

  const nextSession = sessions[0] ?? null;
  const laterSessions = useMemo(() => sessions.slice(1), [sessions]);

  function openCreate() {
    setEditing(null);
    setForm(initialForm(defaultGameId, squadMaxMembers));
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function openEdit(session: ScheduledSession) {
    setEditing(session);
    setForm({
      title: session.title,
      gameId: session.game_id == null ? "" : String(session.game_id),
      mode: session.mode,
      serverRegion: session.server_region ?? "",
      startsAt: toLocalInput(new Date(session.starts_at)),
      duration: session.duration_minutes,
      maxPlayers: session.max_players,
      notes: session.notes ?? "",
    });
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function actionError(message: string) {
    if (message.includes("invalid_start_time")) return "Choisis une heure située au moins 5 minutes dans le futur.";
    if (message.includes("only_owner")) return "Seul le chef de la squad peut modifier le planning.";
    if (message.includes("scheduled_session_closed")) return "Cette session est déjà terminée ou annulée.";
    return "L’action n’a pas pu être effectuée.";
  }

  async function saveSession() {
    if (!form.title.trim() || !form.mode.trim() || !form.startsAt) return;
    setWorking("save");
    setError("");
    setNotice("");

    const common = {
      p_game_id: form.gameId ? Number(form.gameId) : null,
      p_title: form.title.trim(),
      p_mode: form.mode.trim(),
      p_server_region: form.serverRegion.trim() || null,
      p_starts_at: new Date(form.startsAt).toISOString(),
      p_duration_minutes: form.duration,
      p_max_players: form.maxPlayers,
      p_notes: form.notes.trim() || null,
    };

    const result = editing
      ? await supabase.rpc("update_scheduled_session_v12", { p_session_id: editing.session_id, ...common })
      : await supabase.rpc("create_scheduled_session_v12", { p_squad_id: squadId, ...common });

    if (result.error) setError(actionError(result.error.message));
    else {
      setNotice(editing ? "Session mise à jour. Les membres ont été prévenus." : "Session ajoutée au planning.");
      setFormOpen(false);
      setEditing(null);
      await loadSessions(true);
    }
    setWorking(null);
  }

  async function respond(sessionId: string, response: ResponseValue) {
    setWorking(`${sessionId}:${response}`);
    setError("");
    const { error: responseError } = await supabase.rpc("respond_scheduled_session_v12", {
      p_session_id: sessionId,
      p_response: response,
    });
    if (responseError) setError(actionError(responseError.message));
    else await loadSessions(true);
    setWorking(null);
  }

  async function cancelSession() {
    if (!cancelTarget) return;
    setWorking("cancel");
    setError("");
    const { error: cancelError } = await supabase.rpc("cancel_scheduled_session_v12", {
      p_session_id: cancelTarget.session_id,
    });
    if (cancelError) setError(actionError(cancelError.message));
    else {
      setNotice("Session annulée. Les membres ont été prévenus.");
      setCancelTarget(null);
      await loadSessions(true);
    }
    setWorking(null);
  }

  if (loading) return <div className="schedule-loading-v12">Chargement du planning…</div>;

  return (
    <div className="schedule-v12">
      <header className="schedule-head-v12">
        <div><span>PLANNING DE LA SQUAD</span><h2>Les prochaines sessions.</h2><p>Planifie une partie et laisse chaque membre confirmer sa présence.</p></div>
        {isOwner && <button type="button" onClick={openCreate}><Icon name="plus" size={16} /> Programmer</button>}
      </header>

      {error && <div className="schedule-alert-v12 error">{error}<button type="button" onClick={() => void loadSessions()}>Réessayer</button></div>}
      {notice && <div className="schedule-alert-v12">{notice}</div>}

      {!nextSession ? (
        <section className="schedule-empty-v12">
          <span><Icon name="calendar-clock" size={28} /></span><h3>Aucune session programmée.</h3>
          <p>{isOwner ? "Ajoute une date pour que toute la squad puisse s’organiser." : "Le chef de la squad n’a encore rien programmé."}</p>
          {isOwner && <button type="button" onClick={openCreate}>Programmer la première session</button>}
        </section>
      ) : (
        <>
          <SessionCard
            session={nextSession}
            featured
            isOwner={isOwner}
            working={working}
            onRespond={respond}
            onEdit={openEdit}
            onCancel={setCancelTarget}
            onOpenLiveSession={onOpenLiveSession}
          />
          {laterSessions.length > 0 && (
            <section className="schedule-later-v12">
              <header><span>ENSUITE</span><strong>{laterSessions.length} session{laterSessions.length > 1 ? "s" : ""}</strong></header>
              <div>{laterSessions.map((item) => (
                <SessionCard key={item.session_id} session={item} isOwner={isOwner} working={working} onRespond={respond} onEdit={openEdit} onCancel={setCancelTarget} onOpenLiveSession={onOpenLiveSession} />
              ))}</div>
            </section>
          )}
        </>
      )}

      {formOpen && (
        <div className="schedule-modal-v12" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="schedule-form-title-v12">
            <header><div><span>{editing ? "MODIFIER" : "NOUVELLE SESSION"}</span><h3 id="schedule-form-title-v12">{editing ? "Mettre à jour la session" : "Programmer une partie"}</h3></div><button type="button" aria-label="Fermer" onClick={() => setFormOpen(false)}><Icon name="close" size={17} /></button></header>
            <div className="schedule-form-v12">
              <label className="wide"><span>Titre</span><input maxLength={80} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label><span>Jeu</span><select value={form.gameId} onChange={(event) => setForm({ ...form, gameId: event.target.value })}><option value="">Jeu de la squad</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>
              <label><span>Mode</span><input maxLength={60} placeholder="Classé, détente…" value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })} /></label>
              <label><span>Date et heure</span><input type="datetime-local" min={minimumLocalTime()} value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
              <label><span>Région / serveur</span><input maxLength={60} value={form.serverRegion} onChange={(event) => setForm({ ...form, serverRegion: event.target.value })} /></label>
              <label><span>Durée prévue</span><select value={form.duration} onChange={(event) => setForm({ ...form, duration: Number(event.target.value) })}>{[60,90,120,180,240].map((minutes) => <option key={minutes} value={minutes}>{durationLabel(minutes)}</option>)}</select></label>
              <label><span>Places</span><select value={form.maxPlayers} onChange={(event) => setForm({ ...form, maxPlayers: Number(event.target.value) })}>{Array.from({ length: 11 }, (_, index) => index + 2).map((value) => <option key={value} value={value}>{value} joueurs</option>)}</select></label>
              <label className="wide"><span>Note facultative</span><textarea maxLength={500} placeholder="Objectif, niveau, préparation…" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            <footer><small>Heure locale · {Intl.DateTimeFormat().resolvedOptions().timeZone}</small><button type="button" onClick={() => setFormOpen(false)}>Annuler</button><button type="button" className="primary" disabled={working === "save" || !form.title.trim() || !form.mode.trim() || !form.startsAt} onClick={() => void saveSession()}>{working === "save" ? "Enregistrement…" : editing ? "Enregistrer" : "Programmer"}</button></footer>
          </section>
        </div>
      )}

      {cancelTarget && (
        <div className="schedule-modal-v12" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelTarget(null); }}>
          <section className="schedule-confirm-v12" role="dialog" aria-modal="true"><span>ANNULATION</span><h3>Annuler « {cancelTarget.title} » ?</h3><p>Tous les membres de la squad seront prévenus.</p><footer><button type="button" onClick={() => setCancelTarget(null)}>Garder</button><button type="button" className="danger" disabled={working === "cancel"} onClick={() => void cancelSession()}>{working === "cancel" ? "Annulation…" : "Annuler la session"}</button></footer></section>
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, featured = false, isOwner, working, onRespond, onEdit, onCancel, onOpenLiveSession }: {
  session: ScheduledSession;
  featured?: boolean;
  isOwner: boolean;
  working: string | null;
  onRespond: (sessionId: string, response: ResponseValue) => void;
  onEdit: (session: ScheduledSession) => void;
  onCancel: (session: ScheduledSession) => void;
  onOpenLiveSession: () => void;
}) {
  const startsIn = new Date(session.starts_at).getTime() - Date.now();
  const soon = startsIn <= 30 * 60_000 && startsIn >= -4 * 60 * 60_000;
  return (
    <article className={`schedule-card-v12 ${featured ? "featured" : ""}`}>
      <div className="schedule-date-v12"><strong>{new Date(session.starts_at).toLocaleDateString("fr-FR", { day: "2-digit" })}</strong><span>{new Date(session.starts_at).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span><small>{new Date(session.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small></div>
      <div className="schedule-copy-v12"><span>{session.game_name ?? "Jeu de la squad"} · {session.mode}</span><h3>{session.title}</h3><p>{session.server_region ? `${session.server_region} · ` : ""}{durationLabel(session.duration_minutes)}{session.notes ? ` · ${session.notes}` : ""}</p><div><b>{session.going_count}/{session.max_players} confirmés</b>{session.maybe_count > 0 && <b className="maybe">{session.maybe_count} peut-être</b>}</div></div>
      <div className="schedule-actions-v12">
        <div role="group" aria-label={`Réponse pour ${session.title}`}>
          <ResponseButton value="going" label="Présent" active={session.my_response === "going"} working={working} sessionId={session.session_id} onClick={onRespond} />
          <ResponseButton value="maybe" label="Peut-être" active={session.my_response === "maybe"} working={working} sessionId={session.session_id} onClick={onRespond} />
          <ResponseButton value="declined" label="Absent" active={session.my_response === "declined"} working={working} sessionId={session.session_id} onClick={onRespond} />
        </div>
        {soon && <button type="button" className="schedule-live-v12" onClick={onOpenLiveSession}>Ouvrir le ready-check <Icon name="arrow-right" size={14} /></button>}
        {isOwner && <span><button type="button" onClick={() => onEdit(session)}>Modifier</button><button type="button" className="danger" onClick={() => onCancel(session)}>Annuler</button></span>}
      </div>
    </article>
  );
}

function ResponseButton({ value, label, active, working, sessionId, onClick }: { value: ResponseValue; label: string; active: boolean; working: string | null; sessionId: string; onClick: (sessionId: string, response: ResponseValue) => void }) {
  return <button type="button" className={`${value} ${active ? "active" : ""}`} disabled={working?.startsWith(`${sessionId}:`)} onClick={() => onClick(sessionId, value)}>{label}</button>;
}

function toLocalInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function minimumLocalTime() {
  return toLocalInput(new Date(Date.now() + 5 * 60_000));
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}
