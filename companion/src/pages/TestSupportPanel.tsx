import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseTest } from "../lib/supabaseTest";
import "./TestSupportPanel.css";

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

type UserReport = {
  id: number;
  reporter_id: string;
  target_user_id: string | null;
  report_type: string;
  reason: string;
  details: string | null;
  status: "new" | "in_progress" | "waiting" | "resolved" | "dismissed";
  priority: "low" | "normal" | "high" | "critical";
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  account: "Compte",
  payment: "Paiement",
  technical: "Technique",
  moderation: "Modération",
  shop: "Boutique",
  other: "Autre",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  waiting_user: "Attente joueur",
  resolved: "Résolu",
  closed: "Fermé",
  new: "Nouveau",
  waiting: "En attente",
  dismissed: "Ignoré",
};

export default function TestSupportPanel({
  session,
  mainUserId,
}: {
  session: Session;
  mainUserId: string | null;
}) {
  const [tab, setTab] = useState<"tickets" | "reports">("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [category, setCategory] = useState("technical");
  const [subject, setSubject] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [reportType, setReportType] = useState("behavior");
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [targetUserId, setTargetUserId] = useState(mainUserId ?? "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId]
  );

  const loadTickets = useCallback(async () => {
    const { data, error } = await supabaseTest
      .from("support_tickets")
      .select("id,user_id,category,subject,status,priority,assigned_to,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as Ticket[];
    setTickets(rows);
    setSelectedTicketId((current) => {
      if (current && rows.some((ticket) => ticket.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }, []);

  const loadReports = useCallback(async () => {
    const { data, error } = await supabaseTest
      .from("user_reports")
      .select("id,reporter_id,target_user_id,report_type,reason,details,status,priority,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setReports((data ?? []) as UserReport[]);
  }, []);

  const loadMessages = useCallback(async (ticketId: number) => {
    const { data, error } = await supabaseTest
      .from("support_ticket_messages")
      .select("id,ticket_id,sender_id,sender_kind,body,created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    setMessages((data ?? []) as TicketMessage[]);
  }, []);

  useEffect(() => {
    void loadTickets();
    void loadReports();

    const live = supabaseTest
      .channel(`test-support-${session.user.id}`)
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
      void supabaseTest.removeChannel(live);
    };
  }, [session.user.id, loadTickets, loadReports, loadMessages, selectedTicketId]);

  useEffect(() => {
    if (selectedTicketId) void loadMessages(selectedTicketId);
    else setMessages([]);
  }, [selectedTicketId, loadMessages]);

  useEffect(() => {
    if (mainUserId) setTargetUserId(mainUserId);
  }, [mainUserId]);

  async function createTicket() {
    if (!subject.trim() || !ticketBody.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { data, error } = await supabaseTest.rpc("create_support_ticket", {
      p_category: category,
      p_subject: subject.trim(),
      p_body: ticketBody.trim(),
    });

    if (error) {
      setError(error.message);
    } else {
      const id = Number(data);
      setSubject("");
      setTicketBody("");
      setNotice(`Ticket #${id} créé. Il doit maintenant apparaître dans le panneau Admin.`);
      await loadTickets();
      setSelectedTicketId(id);
    }

    setBusy(false);
  }

  async function replyTicket() {
    if (!selectedTicket || !replyBody.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { error } = await supabaseTest.rpc("send_support_ticket_message", {
      p_ticket_id: selectedTicket.id,
      p_body: replyBody.trim(),
    });

    if (error) setError(error.message);
    else {
      setReplyBody("");
      setNotice(`Réponse envoyée sur le ticket #${selectedTicket.id}.`);
      await loadMessages(selectedTicket.id);
      await loadTickets();
    }

    setBusy(false);
  }

  async function createReport() {
    const target = targetUserId.trim();

    if (!target || !reportReason.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { data, error } = await supabaseTest.rpc("create_user_report", {
      p_target_user_id: target,
      p_report_type: reportType,
      p_reason: reportReason.trim(),
      p_details: reportDetails.trim() || null,
    });

    if (error) setError(error.message);
    else {
      setReportReason("");
      setReportDetails("");
      setNotice(`Signalement #${Number(data)} envoyé au panneau de modération.`);
      await loadReports();
    }

    setBusy(false);
  }

  return (
    <section className="tsp">
      <header className="tsp-head">
        <div>
          <span className="tm2-kicker">SUPPORT & MODÉRATION</span>
          <h2>Tester la chaîne Joueur → Admin</h2>
          <p>
            Tout ce qui est créé ici utilise le vrai compte test connecté et le vrai backend Supabase.
          </p>
        </div>

        <div className="tsp-tabs">
          <button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}>
            Tickets
          </button>
          <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>
            Signalements
          </button>
        </div>
      </header>

      {error && <div className="tm2-error">{error}</div>}
      {notice && <div className="tm2-notice">{notice}</div>}

      {tab === "tickets" ? (
        <div className="tsp-ticket-layout">
          <div className="tsp-create-card">
            <h3>Nouveau ticket</h3>

            <label>
              <span>Catégorie</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="account">Compte</option>
                <option value="payment">Paiement</option>
                <option value="technical">Technique</option>
                <option value="moderation">Modération</option>
                <option value="shop">Boutique</option>
                <option value="other">Autre</option>
              </select>
            </label>

            <label>
              <span>Sujet</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Ex : Impossible de lancer une partie"
              />
            </label>

            <label>
              <span>Message</span>
              <textarea
                rows={5}
                value={ticketBody}
                onChange={(event) => setTicketBody(event.target.value)}
                placeholder="Explique le problème comme un vrai joueur..."
              />
            </label>

            <button
              className="tm2-primary"
              disabled={busy || !subject.trim() || !ticketBody.trim()}
              onClick={() => void createTicket()}
            >
              Créer le ticket
            </button>
          </div>

          <div className="tsp-list-card">
            <h3>Tickets du compte test</h3>
            <div className="tsp-ticket-list">
              {tickets.length === 0 ? (
                <div className="tm2-empty">Aucun ticket créé par ce compte.</div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    className={selectedTicketId === ticket.id ? "active" : ""}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <div>
                      <strong>#{ticket.id} · {ticket.subject}</strong>
                      <span>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
                    </div>
                    <b className={`tsp-ticket-status ${ticket.status}`}>
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </b>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="tsp-thread-card">
            {selectedTicket ? (
              <>
                <header>
                  <div>
                    <small>TICKET #{selectedTicket.id}</small>
                    <h3>{selectedTicket.subject}</h3>
                  </div>
                  <b className={`ticket-status ${selectedTicket.status}`}>
                    {STATUS_LABELS[selectedTicket.status] ?? selectedTicket.status}
                  </b>
                </header>

                <div className="tsp-thread">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={message.sender_kind === "user" ? "user" : "staff"}
                    >
                      <small>{message.sender_kind === "user" ? "Compte test" : "Support GameMate"}</small>
                      <p>{message.body}</p>
                      <span>{new Date(message.created_at).toLocaleString("fr-FR")}</span>
                    </article>
                  ))}
                </div>

                <div className="tsp-reply">
                  <textarea
                    rows={2}
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder={
                      selectedTicket.status === "closed"
                        ? "Ticket fermé"
                        : "Répondre au support..."
                    }
                    disabled={selectedTicket.status === "closed"}
                  />
                  <button
                    disabled={
                      busy ||
                      selectedTicket.status === "closed" ||
                      !replyBody.trim()
                    }
                    onClick={() => void replyTicket()}
                  >
                    Envoyer
                  </button>
                </div>
              </>
            ) : (
              <div className="tm2-empty">Sélectionne un ticket pour voir la conversation.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="tsp-report-layout">
          <div className="tsp-create-card">
            <h3>Nouveau signalement</h3>

            <label>
              <span>Utilisateur ciblé (UUID)</span>
              <input
                value={targetUserId}
                onChange={(event) => setTargetUserId(event.target.value)}
                placeholder="UUID du joueur"
              />
            </label>

            <label>
              <span>Type</span>
              <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
                <option value="behavior">Comportement</option>
                <option value="chat">Chat</option>
                <option value="profile">Profil</option>
                <option value="voice">Vocal</option>
                <option value="community">Communauté</option>
                <option value="other">Autre</option>
              </select>
            </label>

            <label>
              <span>Motif</span>
              <input
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                placeholder="Ex : Harcèlement"
              />
            </label>

            <label>
              <span>Détails</span>
              <textarea
                rows={5}
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                placeholder="Contexte du signalement..."
              />
            </label>

            <button
              className="tm2-primary"
              disabled={busy || !targetUserId.trim() || !reportReason.trim()}
              onClick={() => void createReport()}
            >
              Envoyer le signalement
            </button>
          </div>

          <div className="tsp-report-list-card">
            <h3>Signalements envoyés</h3>
            {reports.length === 0 ? (
              <div className="tm2-empty">Aucun signalement envoyé.</div>
            ) : (
              <div className="tsp-report-list">
                {reports.map((report) => (
                  <article key={report.id}>
                    <div>
                      <strong>#{report.id} · {report.reason}</strong>
                      <span>{report.report_type} · cible {report.target_user_id?.slice(0, 8) ?? "—"}</span>
                    </div>
                    <b className={`tsp-report-status ${report.status}`}>
                      {STATUS_LABELS[report.status] ?? report.status}
                    </b>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
