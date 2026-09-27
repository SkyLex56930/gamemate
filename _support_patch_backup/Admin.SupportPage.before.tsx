import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Role = "owner" | "admin" | "moderator";

type Ticket = {
  id: number;
  user_id: string;
  category: string;
  subject: string;
  status: "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

type TicketMessage = {
  id: number;
  ticket_id: number;
  sender_id: string;
  sender_kind: "user" | "staff";
  body: string;
  created_at: string;
};

type Report = {
  id: number;
  reporter_id: string;
  target_user_id: string | null;
  report_type: string;
  reason: string;
  details: string | null;
  status: "new" | "in_progress" | "waiting" | "resolved" | "dismissed";
  priority: "low" | "normal" | "high" | "critical";
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  account: "Compte",
  payment: "Paiement",
  technical: "Technique",
  moderation: "Modération",
  shop: "Boutique",
  other: "Autre",
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  waiting_user: "Attente joueur",
  resolved: "Résolu",
  closed: "Fermé",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  in_progress: "En cours",
  waiting: "En attente",
  resolved: "Résolu",
  dismissed: "Ignoré",
};

function profileLabel(profile: Profile | null | undefined, fallback: string) {
  return profile?.display_name || profile?.username || fallback.slice(0, 8);
}

export default function SupportPage({
  session,
  role,
}: {
  session: Session;
  role: Role;
}) {
  const [tab, setTab] = useState<"tickets" | "reports">("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [ticketStatus, setTicketStatus] = useState<Ticket["status"]>("open");
  const [ticketPriority, setTicketPriority] = useState<Ticket["priority"]>("normal");
  const [reportStatus, setReportStatus] = useState<Report["status"]>("new");
  const [reportPriority, setReportPriority] = useState<Report["priority"]>("normal");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId]
  );

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );

  const loadProfiles = useCallback(async (ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) return;

    const { data } = await supabase
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .in("id", unique);

    setProfiles((current) => {
      const next = new Map(current);
      for (const profile of (data ?? []) as Profile[]) next.set(profile.id, profile);
      return next;
    });
  }, []);

  const loadTickets = useCallback(async () => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id,user_id,category,subject,status,priority,assigned_to,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as Ticket[];
    setTickets(rows);
    void loadProfiles(rows.map((ticket) => ticket.user_id));

    setSelectedTicketId((current) => {
      if (current && rows.some((ticket) => ticket.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }, [loadProfiles]);

  const loadReports = useCallback(async () => {
    const { data, error } = await supabase
      .from("user_reports")
      .select("id,reporter_id,target_user_id,report_type,reason,details,status,priority,assigned_to,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as Report[];
    setReports(rows);
    void loadProfiles(
      rows.flatMap((report) => [report.reporter_id, report.target_user_id ?? ""])
    );

    setSelectedReportId((current) => {
      if (current && rows.some((report) => report.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }, [loadProfiles]);

  const loadMessages = useCallback(async (ticketId: number) => {
    const { data, error } = await supabase
      .from("support_ticket_messages")
      .select("id,ticket_id,sender_id,sender_kind,body,created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as TicketMessage[];
    setMessages(rows);
    void loadProfiles(rows.map((message) => message.sender_id));
  }, [loadProfiles]);

  useEffect(() => {
    void loadTickets();
    void loadReports();

    const live = supabase
      .channel("admin-support-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => void loadTickets()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_messages" },
        (payload) => {
          const ticketId = Number((payload.new as any)?.ticket_id ?? 0);
          if (ticketId === selectedTicketId) void loadMessages(ticketId);
          void loadTickets();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_reports" },
        () => void loadReports()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(live);
    };
  }, [loadTickets, loadReports, loadMessages, selectedTicketId]);

  useEffect(() => {
    if (selectedTicketId) void loadMessages(selectedTicketId);
    else setMessages([]);
  }, [selectedTicketId, loadMessages]);

  useEffect(() => {
    if (!selectedTicket) return;
    setTicketStatus(selectedTicket.status);
    setTicketPriority(selectedTicket.priority);
  }, [selectedTicket?.id, selectedTicket?.status, selectedTicket?.priority]);

  useEffect(() => {
    if (!selectedReport) return;
    setReportStatus(selectedReport.status);
    setReportPriority(selectedReport.priority);
  }, [selectedReport?.id, selectedReport?.status, selectedReport?.priority]);

  async function saveTicketState() {
    if (!selectedTicket) return;
    setBusy(true);
    setError("");
    setNotice("");

    const { error } = await supabase.rpc("admin_update_support_ticket", {
      p_ticket_id: selectedTicket.id,
      p_status: ticketStatus,
      p_priority: ticketPriority,
      p_assigned_to: selectedTicket.assigned_to,
    });

    if (error) setError(error.message);
    else {
      setNotice(`Ticket #${selectedTicket.id} mis à jour.`);
      await loadTickets();
    }

    setBusy(false);
  }

  async function sendReply() {
    if (!selectedTicket || !reply.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");

    const { error } = await supabase.rpc("send_support_ticket_message", {
      p_ticket_id: selectedTicket.id,
      p_body: reply.trim(),
    });

    if (error) setError(error.message);
    else {
      setReply("");
      setNotice(`Réponse envoyée au joueur sur le ticket #${selectedTicket.id}.`);
      await loadMessages(selectedTicket.id);
      await loadTickets();
    }

    setBusy(false);
  }

  async function saveReportState() {
    if (!selectedReport) return;
    setBusy(true);
    setError("");
    setNotice("");

    const { error } = await supabase.rpc("admin_update_user_report", {
      p_report_id: selectedReport.id,
      p_status: reportStatus,
      p_priority: reportPriority,
      p_assigned_to: selectedReport.assigned_to,
    });

    if (error) setError(error.message);
    else {
      setNotice(`Signalement #${selectedReport.id} mis à jour.`);
      await loadReports();
    }

    setBusy(false);
  }

  const openTickets = tickets.filter(
    (ticket) => !["resolved", "closed"].includes(ticket.status)
  ).length;
  const openReports = reports.filter(
    (report) => !["resolved", "dismissed"].includes(report.status)
  ).length;

  return (
    <div className="page admin-support-page">
      <header className="pageHead admin-support-head">
        <div>
          <span className="eyebrow">GAMEMATE SUPPORT</span>
          <h1>Support & signalements</h1>
          <p>
            Les demandes créées depuis le Companion apparaissent ici en temps réel.
          </p>
        </div>

        <div className="admin-support-kpis">
          <span>{openTickets} tickets ouverts</span>
          <span>{openReports} signalements actifs</span>
          <span>{role}</span>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      <div className="admin-support-tabs">
        <button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}>
          Tickets support
        </button>
        <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>
          Signalements
        </button>
      </div>

      {tab === "tickets" ? (
        <div className="admin-support-layout">
          <section className="panel admin-support-list">
            <div className="admin-support-list-head">
              <span className="eyebrow">FILE SUPPORT</span>
              <strong>{tickets.length} tickets</strong>
            </div>

            <div className="admin-support-items">
              {tickets.map((ticket) => {
                const user = profiles.get(ticket.user_id);
                return (
                  <button
                    key={ticket.id}
                    className={selectedTicketId === ticket.id ? "active" : ""}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <div className="admin-support-item-avatar">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="" />
                      ) : (
                        profileLabel(user, ticket.user_id).slice(0, 1).toUpperCase()
                      )}
                    </div>

                    <div>
                      <strong>#{ticket.id} · {ticket.subject}</strong>
                      <span>
                        {profileLabel(user, ticket.user_id)} · {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                      </span>
                    </div>

                    <b className={`support-status ${ticket.status}`}>
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </b>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel admin-support-detail">
            {selectedTicket ? (
              <>
                <header className="admin-support-detail-head">
                  <div>
                    <span className="eyebrow">TICKET #{selectedTicket.id}</span>
                    <h2>{selectedTicket.subject}</h2>
                    <p>
                      {profileLabel(profiles.get(selectedTicket.user_id), selectedTicket.user_id)} ·{" "}
                      {CATEGORY_LABELS[selectedTicket.category] ?? selectedTicket.category}
                    </p>
                  </div>

                  <b className={`support-status ${selectedTicket.status}`}>
                    {TICKET_STATUS_LABELS[selectedTicket.status]}
                  </b>
                </header>

                <div className="admin-support-controls">
                  <label>
                    <span>Statut</span>
                    <select
                      value={ticketStatus}
                      onChange={(event) => setTicketStatus(event.target.value as Ticket["status"])}
                    >
                      <option value="open">Ouvert</option>
                      <option value="in_progress">En cours</option>
                      <option value="waiting_user">Attente joueur</option>
                      <option value="resolved">Résolu</option>
                      <option value="closed">Fermé</option>
                    </select>
                  </label>

                  <label>
                    <span>Priorité</span>
                    <select
                      value={ticketPriority}
                      onChange={(event) => setTicketPriority(event.target.value as Ticket["priority"])}
                    >
                      <option value="low">Faible</option>
                      <option value="normal">Normale</option>
                      <option value="high">Haute</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </label>

                  <button className="primary" disabled={busy} onClick={() => void saveTicketState()}>
                    Enregistrer
                  </button>
                </div>

                <div className="admin-support-thread">
                  {messages.map((message) => {
                    const sender = profiles.get(message.sender_id);
                    return (
                      <article
                        key={message.id}
                        className={message.sender_kind === "staff" ? "staff" : "user"}
                      >
                        <header>
                          <strong>
                            {message.sender_kind === "staff"
                              ? profileLabel(sender, message.sender_id) || "Support GameMate"
                              : profileLabel(sender, message.sender_id)}
                          </strong>
                          <span>
                            {message.sender_kind === "staff" ? "Staff" : "Joueur"} ·{" "}
                            {new Date(message.created_at).toLocaleString("fr-FR")}
                          </span>
                        </header>
                        <p>{message.body}</p>
                      </article>
                    );
                  })}
                </div>

                <div className="admin-support-reply">
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Répondre au joueur..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <button
                    className="primary"
                    disabled={busy || !reply.trim()}
                    onClick={() => void sendReply()}
                  >
                    Répondre
                  </button>
                </div>
              </>
            ) : (
              <div className="admin-support-empty">
                <strong>Aucun ticket.</strong>
                <p>Crée un ticket depuis le Mode test du Companion.</p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="admin-support-layout">
          <section className="panel admin-support-list">
            <div className="admin-support-list-head">
              <span className="eyebrow">SIGNALEMENTS</span>
              <strong>{reports.length} entrées</strong>
            </div>

            <div className="admin-support-items">
              {reports.map((report) => {
                const reporter = profiles.get(report.reporter_id);
                const target = report.target_user_id ? profiles.get(report.target_user_id) : null;

                return (
                  <button
                    key={report.id}
                    className={selectedReportId === report.id ? "active" : ""}
                    onClick={() => setSelectedReportId(report.id)}
                  >
                    <div className="admin-support-item-avatar warning">!</div>
                    <div>
                      <strong>#{report.id} · {report.reason}</strong>
                      <span>
                        {profileLabel(reporter, report.reporter_id)} →{" "}
                        {report.target_user_id
                          ? profileLabel(target, report.target_user_id)
                          : "Utilisateur supprimé"}
                      </span>
                    </div>
                    <b className={`support-status report-${report.status}`}>
                      {REPORT_STATUS_LABELS[report.status]}
                    </b>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel admin-support-detail">
            {selectedReport ? (
              <>
                <header className="admin-support-detail-head">
                  <div>
                    <span className="eyebrow">SIGNALEMENT #{selectedReport.id}</span>
                    <h2>{selectedReport.reason}</h2>
                    <p>
                      Type : {selectedReport.report_type} · Signalé par{" "}
                      {profileLabel(profiles.get(selectedReport.reporter_id), selectedReport.reporter_id)}
                    </p>
                  </div>

                  <b className={`support-status report-${selectedReport.status}`}>
                    {REPORT_STATUS_LABELS[selectedReport.status]}
                  </b>
                </header>

                <div className="admin-support-report-target">
                  <span>Utilisateur ciblé</span>
                  <strong>
                    {selectedReport.target_user_id
                      ? profileLabel(
                          profiles.get(selectedReport.target_user_id),
                          selectedReport.target_user_id
                        )
                      : "Compte supprimé"}
                  </strong>
                  <small>{selectedReport.target_user_id ?? "—"}</small>
                </div>

                <div className="admin-support-report-body">
                  {selectedReport.details || "Aucun détail supplémentaire fourni."}
                </div>

                <div className="admin-support-controls">
                  <label>
                    <span>Statut</span>
                    <select
                      value={reportStatus}
                      onChange={(event) => setReportStatus(event.target.value as Report["status"])}
                    >
                      <option value="new">Nouveau</option>
                      <option value="in_progress">En cours</option>
                      <option value="waiting">En attente</option>
                      <option value="resolved">Résolu</option>
                      <option value="dismissed">Ignoré</option>
                    </select>
                  </label>

                  <label>
                    <span>Priorité</span>
                    <select
                      value={reportPriority}
                      onChange={(event) => setReportPriority(event.target.value as Report["priority"])}
                    >
                      <option value="low">Faible</option>
                      <option value="normal">Normale</option>
                      <option value="high">Haute</option>
                      <option value="critical">Critique</option>
                    </select>
                  </label>

                  <button className="primary" disabled={busy} onClick={() => void saveReportState()}>
                    Enregistrer
                  </button>
                </div>
              </>
            ) : (
              <div className="admin-support-empty">
                <strong>Aucun signalement.</strong>
                <p>Envoie-en un depuis le Mode test du Companion.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
