import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Icon } from "../components/Icon";
import "./SupportPage.css";

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
  created_at: string;
  updated_at: string;
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
  waiting_user: "Attente de ta réponse",
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

export default function SupportPage({
  session,
  onLogin,
}: {
  session: Session | null;
  onLogin: () => void;
}) {
  const [tab, setTab] = useState<"tickets" | "reports">("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [category, setCategory] = useState("technical");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId]
  );

  const loadTickets = useCallback(async () => {
    if (!session?.user.id) return;

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
    setSelectedTicketId((current) => {
      if (current && rows.some((ticket) => ticket.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }, [session?.user.id]);

  const loadReports = useCallback(async () => {
    if (!session?.user.id) return;

    const { data, error } = await supabase
      .from("user_reports")
      .select("id,reporter_id,target_user_id,report_type,reason,details,status,priority,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setReports((data ?? []) as Report[]);
  }, [session?.user.id]);

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

    setMessages((data ?? []) as TicketMessage[]);
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;

    void loadTickets();
    void loadReports();

    const live = supabase
      .channel(`support-page-${session.user.id}`)
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
          if (ticketId && ticketId === selectedTicketId) void loadMessages(ticketId);
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
  }, [session?.user.id, selectedTicketId, loadTickets, loadReports, loadMessages]);

  useEffect(() => {
    if (selectedTicketId) void loadMessages(selectedTicketId);
    else setMessages([]);
  }, [selectedTicketId, loadMessages]);

  async function createTicket() {
    if (!session) {
      onLogin();
      return;
    }

    if (!subject.trim() || !body.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { data, error } = await supabase.rpc("create_support_ticket", {
      p_category: category,
      p_subject: subject.trim(),
      p_body: body.trim(),
    });

    if (error) {
      setError(error.message);
    } else {
      const id = Number(data);
      setSubject("");
      setBody("");
      setShowCreateTicket(false);
      setNotice(`Ticket #${id} envoyé au support GameMate.`);
      await loadTickets();
      setSelectedTicketId(id);
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

    if (error) {
      setError(error.message);
    } else {
      setReply("");
      setNotice("Réponse envoyée.");
      await Promise.all([loadMessages(selectedTicket.id), loadTickets()]);
    }

    setBusy(false);
  }

  if (!session) {
    return (
      <section className="support-page support-page-login">
        <div className="support-login-card">
          <span className="support-kicker">SUPPORT GAMEMATE</span>
          <h1>Connecte-toi pour contacter le support</h1>
          <p>
            Tes tickets et tes signalements sont liés à ton compte GameMate.
          </p>
          <button type="button" onClick={onLogin}>
            Se connecter
          </button>
        </div>
      </section>
    );
  }

  const openTickets = tickets.filter(
    (ticket) => !["resolved", "closed"].includes(ticket.status)
  ).length;
  const activeReports = reports.filter(
    (report) => !["resolved", "dismissed"].includes(report.status)
  ).length;

  return (
    <div className="support-page">
      <header className="support-hero">
        <div>
          <span className="support-kicker">AIDE & SÉCURITÉ</span>
          <h1>Support GameMate</h1>
          <p>
            Contacte l’équipe, suis tes demandes et retrouve tes signalements.
          </p>
        </div>

        <button
          type="button"
          className="support-new-ticket"
          onClick={() => setShowCreateTicket(true)}
        >
          + Nouveau ticket
        </button>
      </header>

      {error && <div className="support-error"><span>{error}</span><button type="button" onClick={() => { setError(""); void loadTickets(); void loadReports(); if (selectedTicketId) void loadMessages(selectedTicketId); }}>Réessayer</button></div>}
      {notice && <div className="support-notice">{notice}</div>}

      <section className="support-summary">
        <article>
          <small>Tickets actifs</small>
          <strong>{openTickets}</strong>
        </article>
        <article>
          <small>Tickets au total</small>
          <strong>{tickets.length}</strong>
        </article>
        <article>
          <small>Signalements actifs</small>
          <strong>{activeReports}</strong>
        </article>
      </section>

      <div className="support-tabs">
        <button
          type="button"
          className={tab === "tickets" ? "active" : ""}
          onClick={() => setTab("tickets")}
        >
          Mes tickets
        </button>
        <button
          type="button"
          className={tab === "reports" ? "active" : ""}
          onClick={() => setTab("reports")}
        >
          Mes signalements
        </button>
      </div>

      {tab === "tickets" ? (
        <section className="support-ticket-layout">
          <aside className="support-ticket-list">
            <header>
              <span className="support-kicker">MES DEMANDES</span>
              <strong>{tickets.length} ticket{tickets.length > 1 ? "s" : ""}</strong>
            </header>

            <div>
              {tickets.length === 0 ? (
                <div className="support-empty small">
                  <strong>Aucun ticket.</strong>
                  <p>Crée une demande si tu as besoin d’aide.</p>
                </div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    type="button"
                    key={ticket.id}
                    className={selectedTicketId === ticket.id ? "active" : ""}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <div>
                      <strong>#{ticket.id} · {ticket.subject}</strong>
                      <span>
                        {CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
                        {new Date(ticket.updated_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    <b className={`support-status ${ticket.status}`}>
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </b>
                  </button>
                ))
              )}
            </div>
          </aside>

          <main className="support-thread-panel">
            {selectedTicket ? (
              <>
                <header className="support-thread-head">
                  <div>
                    <span className="support-kicker">TICKET #{selectedTicket.id}</span>
                    <h2>{selectedTicket.subject}</h2>
                    <p>{CATEGORY_LABELS[selectedTicket.category] ?? selectedTicket.category}</p>
                  </div>
                  <b className={`support-status ${selectedTicket.status}`}>
                    {TICKET_STATUS_LABELS[selectedTicket.status]}
                  </b>
                </header>

                <div className="support-thread">
                  {messages.length === 0 ? (
                    <div className="support-empty small">Aucun message.</div>
                  ) : (
                    messages.map((message) => (
                      <article
                        key={message.id}
                        className={message.sender_kind === "user" ? "mine" : "staff"}
                      >
                        <header>
                          <strong>
                            {message.sender_kind === "user"
                              ? "Toi"
                              : "Support GameMate"}
                          </strong>
                          <span>
                            {new Date(message.created_at).toLocaleString("fr-FR")}
                          </span>
                        </header>
                        <p>{message.body}</p>
                      </article>
                    ))
                  )}
                </div>

                <div className="support-reply">
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={
                      selectedTicket.status === "closed"
                        ? "Ce ticket est fermé."
                        : "Répondre au support..."
                    }
                    disabled={selectedTicket.status === "closed"}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={
                      busy ||
                      selectedTicket.status === "closed" ||
                      !reply.trim()
                    }
                    onClick={() => void sendReply()}
                  >
                    Envoyer
                  </button>
                </div>
              </>
            ) : (
              <div className="support-empty">
                <strong>Aucun ticket sélectionné.</strong>
                <p>Choisis un ticket ou crée une nouvelle demande.</p>
              </div>
            )}
          </main>
        </section>
      ) : (
        <section className="support-reports">
          <header>
            <div>
              <span className="support-kicker">SÉCURITÉ</span>
              <h2>Mes signalements</h2>
            </div>
            <p>
              Pour signaler un joueur, ouvre son profil public puis utilise le bouton
              <strong> Signaler</strong>.
            </p>
          </header>

          <div className="support-report-list">
            {reports.length === 0 ? (
              <div className="support-empty">
                <strong>Aucun signalement.</strong>
                <p>Les signalements que tu envoies apparaîtront ici.</p>
              </div>
            ) : (
              reports.map((report) => (
                <article key={report.id}>
                  <div>
                    <span className="support-kicker">#{report.id}</span>
                    <strong>{report.reason}</strong>
                    <p>{report.details || "Aucun détail supplémentaire."}</p>
                    <small>
                      {report.report_type} ·{" "}
                      {new Date(report.created_at).toLocaleString("fr-FR")}
                    </small>
                  </div>
                  <b className={`support-status report-${report.status}`}>
                    {REPORT_STATUS_LABELS[report.status]}
                  </b>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {showCreateTicket && (
        <div
          className="support-modal-backdrop"
          onMouseDown={() => setShowCreateTicket(false)}
        >
          <section
            className="support-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="support-kicker">NOUVELLE DEMANDE</span>
                <h2>Créer un ticket</h2>
              </div>
              <button type="button" onClick={() => setShowCreateTicket(false)} aria-label="Fermer">
                <Icon name="close" size={17} />
              </button>
            </header>

            <label>
              <span>Catégorie</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
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
                placeholder="Décris le problème en quelques mots"
              />
            </label>

            <label>
              <span>Message</span>
              <textarea
                rows={7}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Explique ce qu’il se passe et donne les détails utiles..."
              />
            </label>

            <div className="support-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowCreateTicket(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !subject.trim() || !body.trim()}
                onClick={() => void createTicket()}
              >
                {busy ? "Envoi..." : "Envoyer au support"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
