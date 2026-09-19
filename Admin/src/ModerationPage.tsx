import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Role = "owner" | "admin" | "moderator";

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

type Sanction = {
  id: number;
  user_id: string;
  report_id: number | null;
  sanction_type: "warning" | "mute" | "suspension" | "ban";
  reason: string;
  duration_minutes: number | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
};

type AuditRow = {
  id: number;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

function profileName(profile: Profile | undefined, fallback: string) {
  return profile?.display_name || profile?.username || fallback.slice(0, 8);
}

function reportStatusLabel(status: Report["status"]) {
  return {
    new: "Nouveau",
    in_progress: "En cours",
    waiting: "En attente",
    resolved: "Résolu",
    dismissed: "Ignoré",
  }[status];
}

function priorityLabel(priority: Report["priority"]) {
  return {
    low: "Faible",
    normal: "Normale",
    high: "Haute",
    critical: "Critique",
  }[priority];
}

function sanctionLabel(type: Sanction["sanction_type"]) {
  return {
    warning: "Avertissement",
    mute: "Mute",
    suspension: "Suspension",
    ban: "Bannissement",
  }[type];
}

export default function ModerationPage({
  session,
  role,
}: {
  session: Session;
  role: Role;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [incidentBody, setIncidentBody] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [reportStatus, setReportStatus] = useState<Report["status"]>("new");
  const [reportPriority, setReportPriority] = useState<Report["priority"]>("normal");
  const [sanctionReason, setSanctionReason] = useState("");
  const [sanctionType, setSanctionType] = useState<"warning" | "mute" | "suspension" | "ban">("suspension");
  const [durationPreset, setDurationPreset] = useState("1440");
  const [customDuration, setCustomDuration] = useState("24");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [presence, setPresence] = useState<"online" | "busy">("online");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticketCount, setTicketCount] = useState(0);

  const canRevoke = role === "owner" || role === "admin";

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (statusFilter !== "all" && report.status !== statusFilter) return false;
      if (priorityFilter !== "all" && report.priority !== priorityFilter) return false;
      return true;
    });
  }, [reports, statusFilter, priorityFilter]);

  const selectedTargetSanctions = useMemo(() => {
    if (!selectedReport?.target_user_id) return [];
    return sanctions.filter((sanction) => sanction.user_id === selectedReport.target_user_id);
  }, [sanctions, selectedReport?.target_user_id]);

  const loadProfiles = useCallback(async (ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .in("id", unique);

    if (error) {
      setError(error.message);
      return;
    }

    setProfiles((current) => {
      const next = new Map(current);
      for (const profile of (data ?? []) as Profile[]) next.set(profile.id, profile);
      return next;
    });
  }, []);

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
      rows.flatMap((report) => [report.reporter_id, report.target_user_id ?? "", report.assigned_to ?? ""])
    );

    setSelectedReportId((current) => {
      if (current && rows.some((report) => report.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }, [loadProfiles]);

  const loadSanctions = useCallback(async () => {
    const { data, error } = await supabase
      .from("moderation_sanctions")
      .select("id,user_id,report_id,sanction_type,reason,duration_minutes,starts_at,ends_at,is_active,created_by,created_at")
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as Sanction[];
    setSanctions(rows);
    void loadProfiles(rows.flatMap((row) => [row.user_id, row.created_by]));
  }, [loadProfiles]);

  const loadStaffState = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_admin_staff_state");
    if (error) {
      setError(error.message);
      return;
    }

    const nextStaff = (((data as any)?.staff ?? []) as StaffMember[]);
    const nextChannels = (((data as any)?.channels ?? []) as Channel[]);

    setStaff(nextStaff);
    setChannels(nextChannels);
    setSelectedChannelId((current) => {
      if (current && nextChannels.some((channel) => channel.id === current)) return current;
      return nextChannels[0]?.id ?? "";
    });
  }, []);

  const loadAudit = useCallback(async () => {
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("id,actor_id,action,entity_type,entity_id,created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as AuditRow[];
    setAuditRows(rows);
    void loadProfiles(rows.map((row) => row.actor_id));
  }, [loadProfiles]);

  const loadTicketCount = useCallback(async () => {
    const { count, error } = await supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .not("status", "in", '("resolved","closed")');

    if (!error) setTicketCount(count ?? 0);
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    if (!channelId) {
      setMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from("moderation_messages")
      .select("id,channel_id,sender_id,body,created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(80);

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as Message[];
    setMessages(rows);
    void loadProfiles(rows.map((row) => row.sender_id));
  }, [loadProfiles]);

  useEffect(() => {
    void loadReports();
    void loadSanctions();
    void loadStaffState();
    void loadAudit();
    void loadTicketCount();

    const live = supabase
      .channel("real-moderation-v6")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_reports" },
        () => void loadReports()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "moderation_sanctions" },
        () => void loadSanctions()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_presence" },
        () => void loadStaffState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_audit_log" },
        () => void loadAudit()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => void loadTicketCount()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(live);
    };
  }, [loadReports, loadSanctions, loadStaffState, loadAudit, loadTicketCount]);

  useEffect(() => {
    if (!selectedChannelId) return;

    void loadMessages(selectedChannelId);

    const live = supabase
      .channel(`real-moderation-room-${selectedChannelId}`)
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
      void supabase.removeChannel(live);
    };
  }, [selectedChannelId, loadMessages]);

  useEffect(() => {
    if (!selectedReport) return;
    setReportStatus(selectedReport.status);
    setReportPriority(selectedReport.priority);
    setSanctionReason(selectedReport.reason);
  }, [selectedReport?.id, selectedReport?.status, selectedReport?.priority, selectedReport?.reason]);

  async function changePresence(next: "online" | "busy") {
    setPresence(next);
    const { error } = await supabase.rpc("set_my_admin_presence", { p_status: next });
    if (error) setError(error.message);
    else await loadStaffState();
  }

  async function saveReport() {
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

  async function dismissReport() {
    if (!selectedReport) return;

    setBusy(true);
    const { error } = await supabase.rpc("admin_update_user_report", {
      p_report_id: selectedReport.id,
      p_status: "dismissed",
      p_priority: selectedReport.priority,
      p_assigned_to: selectedReport.assigned_to,
    });

    if (error) setError(error.message);
    else {
      setNotice(`Signalement #${selectedReport.id} ignoré.`);
      await loadReports();
    }
    setBusy(false);
  }

  function resolveDurationMinutes() {
    if (sanctionType === "warning") return null;
    if (sanctionType === "ban" && durationPreset === "permanent") return null;

    if (durationPreset !== "custom") {
      const parsed = Number(durationPreset);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    const value = Number(customDuration);
    if (!Number.isFinite(value) || value <= 0) return null;

    if (customUnit === "minutes") return Math.round(value);
    if (customUnit === "hours") return Math.round(value * 60);
    return Math.round(value * 24 * 60);
  }

  async function applyConfiguredSanction() {
    const duration = resolveDurationMinutes();

    if (
      sanctionType !== "warning" &&
      !(sanctionType === "ban" && durationPreset === "permanent") &&
      !duration
    ) {
      setError("Choisis une durée valide.");
      return;
    }

    await applySanction(sanctionType, duration);
  }

  async function applySanction(
    sanctionType: "warning" | "mute" | "suspension" | "ban",
    durationMinutes: number | null
  ) {
    if (!selectedReport?.target_user_id) {
      setError("Ce signalement n’a plus de compte cible.");
      return;
    }

    const reason = sanctionReason.trim();
    if (reason.length < 3) {
      setError("Indique un motif de sanction.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    const { data, error } = await supabase.rpc("apply_moderation_sanction", {
      p_report_id: selectedReport.id,
      p_user_id: selectedReport.target_user_id,
      p_sanction_type: sanctionType,
      p_reason: reason,
      p_duration_minutes: durationMinutes,
    });

    if (error) setError(error.message);
    else {
      setNotice(`${sanctionLabel(sanctionType)} enregistré sous l’ID #${Number(data)}.`);
      await Promise.all([loadReports(), loadSanctions(), loadAudit()]);
    }

    setBusy(false);
  }

  async function revokeSanction(id: number) {
    if (!canRevoke) return;

    const reason = window.prompt("Motif du déblocage / de la révocation :") ?? "";
    const { error } = await supabase.rpc("revoke_moderation_sanction", {
      p_sanction_id: id,
      p_reason: reason,
    });

    if (error) setError(error.message);
    else {
      setNotice(`Sanction #${id} révoquée.`);
      await Promise.all([loadSanctions(), loadAudit()]);
    }
  }

  async function sendIncidentMessage() {
    const body = incidentBody.trim();
    if (!body || !selectedChannelId) return;

    const { error } = await supabase.rpc("send_moderation_message", {
      p_channel_id: selectedChannelId,
      p_body: body,
    });

    if (error) setError(error.message);
    else {
      setIncidentBody("");
      await loadMessages(selectedChannelId);
    }
  }

  const openReports = reports.filter(
    (report) => !["resolved", "dismissed"].includes(report.status)
  ).length;

  const activeSanctions = sanctions.filter((sanction) => sanction.is_active).length;
  const onlineStaff = staff.filter((member) => member.presence_status === "online").length;

  return (
    <div className="page real-mod">
      <header className="real-mod-head">
        <div>
          <span className="eyebrow">GAMEMATE ADMIN</span>
          <h1>Modération</h1>
          <p>Uniquement des données réelles provenant de Supabase.</p>
        </div>

        <div className="real-mod-presence">
          <span>{onlineStaff} staff en ligne</span>
          <select
            value={presence}
            onChange={(event) => void changePresence(event.target.value as "online" | "busy")}
          >
            <option value="online">En ligne</option>
            <option value="busy">Occupé</option>
          </select>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      <section className="real-mod-kpis">
        <article className="panel">
          <small>Signalements actifs</small>
          <strong>{openReports}</strong>
          <span>{reports.length} au total</span>
        </article>

        <article className="panel">
          <small>Tickets support ouverts</small>
          <strong>{ticketCount}</strong>
          <span>données réelles</span>
        </article>

        <article className="panel">
          <small>Sanctions actives</small>
          <strong>{activeSanctions}</strong>
          <span>{sanctions.length} enregistrées</span>
        </article>

        <article className="panel">
          <small>Staff en ligne</small>
          <strong>{onlineStaff}</strong>
          <span>{staff.length} comptes actifs</span>
        </article>
      </section>

      <section className="real-mod-layout">
        <div className="real-mod-main">
          <section className="panel real-mod-queue">
            <div className="real-mod-section-head">
              <div>
                <span className="eyebrow">FILE RÉELLE</span>
                <h2>Signalements</h2>
              </div>

              <div className="real-mod-filters">
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">Tous les statuts</option>
                  <option value="new">Nouveau</option>
                  <option value="in_progress">En cours</option>
                  <option value="waiting">En attente</option>
                  <option value="resolved">Résolu</option>
                  <option value="dismissed">Ignoré</option>
                </select>

                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                  <option value="all">Toutes les priorités</option>
                  <option value="low">Faible</option>
                  <option value="normal">Normale</option>
                  <option value="high">Haute</option>
                  <option value="critical">Critique</option>
                </select>
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <div className="real-mod-empty">
                <strong>Aucun signalement correspondant.</strong>
                <p>Les signalements créés depuis le Companion apparaîtront ici.</p>
              </div>
            ) : (
              <div className="real-mod-report-list">
                {filteredReports.map((report) => {
                  const reporter = profiles.get(report.reporter_id);
                  const target = report.target_user_id
                    ? profiles.get(report.target_user_id)
                    : undefined;

                  return (
                    <button
                      key={report.id}
                      className={selectedReportId === report.id ? "active" : ""}
                      onClick={() => setSelectedReportId(report.id)}
                    >
                      <div className="real-mod-avatar warning">!</div>

                      <div>
                        <strong>#{report.id} · {report.reason}</strong>
                        <span>
                          {profileName(reporter, report.reporter_id)} →{" "}
                          {report.target_user_id
                            ? profileName(target, report.target_user_id)
                            : "Compte supprimé"}
                        </span>
                      </div>

                      <b className={`real-mod-priority ${report.priority}`}>
                        {priorityLabel(report.priority)}
                      </b>

                      <b className={`real-mod-status ${report.status}`}>
                        {reportStatusLabel(report.status)}
                      </b>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel real-mod-detail">
            {selectedReport ? (
              <>
                <header className="real-mod-detail-head">
                  <div>
                    <span className="eyebrow">SIGNALEMENT #{selectedReport.id}</span>
                    <h2>{selectedReport.reason}</h2>
                    <p>
                      Type : {selectedReport.report_type} · Créé le{" "}
                      {new Date(selectedReport.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>

                  <b className={`real-mod-status ${selectedReport.status}`}>
                    {reportStatusLabel(selectedReport.status)}
                  </b>
                </header>

                <div className="real-mod-people">
                  <article>
                    <small>Signalé par</small>
                    <strong>
                      {profileName(
                        profiles.get(selectedReport.reporter_id),
                        selectedReport.reporter_id
                      )}
                    </strong>
                    <span>{selectedReport.reporter_id}</span>
                  </article>

                  <article>
                    <small>Utilisateur ciblé</small>
                    <strong>
                      {selectedReport.target_user_id
                        ? profileName(
                            profiles.get(selectedReport.target_user_id),
                            selectedReport.target_user_id
                          )
                        : "Compte supprimé"}
                    </strong>
                    <span>{selectedReport.target_user_id ?? "—"}</span>
                  </article>
                </div>

                <div className="real-mod-details-box">
                  {selectedReport.details || "Aucun détail supplémentaire fourni."}
                </div>

                <div className="real-mod-edit-row">
                  <label>
                    <span>Statut</span>
                    <select
                      value={reportStatus}
                      onChange={(event) =>
                        setReportStatus(event.target.value as Report["status"])
                      }
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
                      onChange={(event) =>
                        setReportPriority(event.target.value as Report["priority"])
                      }
                    >
                      <option value="low">Faible</option>
                      <option value="normal">Normale</option>
                      <option value="high">Haute</option>
                      <option value="critical">Critique</option>
                    </select>
                  </label>

                  <button className="primary" disabled={busy} onClick={() => void saveReport()}>
                    Enregistrer
                  </button>
                </div>

                <div className="real-mod-sanction-box">
                  <div>
                    <span className="eyebrow">SANCTION RÉELLE</span>
                    <h3>Appliquer une sanction</h3>
                  </div>

                  <textarea
                    rows={3}
                    value={sanctionReason}
                    onChange={(event) => setSanctionReason(event.target.value)}
                    placeholder="Motif de la sanction..."
                  />

                  <div className="real-mod-sanction-config">
                    <label>
                      <span>Type de sanction</span>
                      <select
                        value={sanctionType}
                        onChange={(event) => {
                          const next = event.target.value as "warning" | "mute" | "suspension" | "ban";
                          setSanctionType(next);
                          if (next === "warning") setDurationPreset("custom");
                          else if (next === "ban") setDurationPreset("permanent");
                          else setDurationPreset("1440");
                        }}
                      >
                        <option value="warning">Avertissement</option>
                        <option value="mute">Mute</option>
                        <option value="suspension">Suspension</option>
                        <option value="ban">Bannissement</option>
                      </select>
                    </label>

                    {sanctionType !== "warning" && (
                      <label>
                        <span>Durée</span>
                        <select
                          value={durationPreset}
                          onChange={(event) => setDurationPreset(event.target.value)}
                        >
                          <option value="60">1 heure</option>
                          <option value="360">6 heures</option>
                          <option value="1440">24 heures</option>
                          <option value="4320">3 jours</option>
                          <option value="10080">7 jours</option>
                          <option value="43200">30 jours</option>
                          {sanctionType === "ban" && (
                            <option value="permanent">Permanent</option>
                          )}
                          <option value="custom">Personnalisée</option>
                        </select>
                      </label>
                    )}

                    {sanctionType !== "warning" && durationPreset === "custom" && (
                      <div className="real-mod-custom-duration">
                        <label>
                          <span>Valeur</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={customDuration}
                            onChange={(event) => setCustomDuration(event.target.value)}
                          />
                        </label>

                        <label>
                          <span>Unité</span>
                          <select
                            value={customUnit}
                            onChange={(event) =>
                              setCustomUnit(event.target.value as "minutes" | "hours" | "days")
                            }
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Heures</option>
                            <option value="days">Jours</option>
                          </select>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="real-mod-actions">
                    <button disabled={busy} onClick={() => void dismissReport()}>
                      Ignorer le signalement
                    </button>

                    <button
                      className={sanctionType === "ban" ? "danger" : "primary"}
                      disabled={busy}
                      onClick={() => void applyConfiguredSanction()}
                    >
                      {busy
                        ? "Application..."
                        : sanctionType === "warning"
                        ? "Envoyer l’avertissement"
                        : sanctionType === "mute"
                        ? "Appliquer le mute"
                        : sanctionType === "suspension"
                        ? "Bloquer le compte"
                        : durationPreset === "permanent"
                        ? "Bannir définitivement"
                        : "Bannir temporairement"}
                    </button>
                  </div>
                </div>

                <div className="real-mod-history">
                  <div className="real-mod-section-head">
                    <div>
                      <span className="eyebrow">HISTORIQUE RÉEL</span>
                      <h3>Sanctions de cet utilisateur</h3>
                    </div>
                  </div>

                  {selectedTargetSanctions.length === 0 ? (
                    <div className="real-mod-empty compact">
                      Aucune sanction enregistrée pour cet utilisateur.
                    </div>
                  ) : (
                    <div className="real-mod-sanction-list">
                      {selectedTargetSanctions.map((sanction) => (
                        <article key={sanction.id}>
                          <div>
                            <strong>
                              #{sanction.id} · {sanctionLabel(sanction.sanction_type)}
                            </strong>
                            <span>{sanction.reason}</span>
                          </div>

                          <div className="real-mod-sanction-meta">
                            <b className={sanction.is_active ? "active" : "revoked"}>
                              {sanction.is_active ? "Active" : "Révoquée"}
                            </b>
                            <span>
                              {new Date(sanction.created_at).toLocaleString("fr-FR")}
                            </span>
                            {sanction.ends_at && (
                              <span>
                                fin {new Date(sanction.ends_at).toLocaleString("fr-FR")}
                              </span>
                            )}
                            {canRevoke && sanction.is_active && (
                              <button onClick={() => void revokeSanction(sanction.id)}>
                                Révoquer
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="real-mod-empty">
                <strong>Aucun signalement.</strong>
                <p>Crée-en un depuis le Mode test du Companion pour tester la chaîne réelle.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="real-mod-side">
          <section className="panel">
            <div className="real-mod-section-head">
              <div>
                <span className="eyebrow">SALLE D’INCIDENT</span>
                <h2>Coordination staff</h2>
              </div>

              <select
                value={selectedChannelId}
                onChange={(event) => setSelectedChannelId(event.target.value)}
              >
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="real-mod-room">
              {messages.length === 0 ? (
                <div className="real-mod-empty compact">Aucun message dans ce salon.</div>
              ) : (
                messages.map((message) => (
                  <article key={message.id}>
                    <strong>
                      {profileName(profiles.get(message.sender_id), message.sender_id)}
                    </strong>
                    <span>
                      {new Date(message.created_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <p>{message.body}</p>
                  </article>
                ))
              )}
            </div>

            <div className="real-mod-room-compose">
              <textarea
                rows={2}
                value={incidentBody}
                onChange={(event) => setIncidentBody(event.target.value)}
                placeholder="Message interne..."
              />
              <button
                className="primary"
                disabled={!incidentBody.trim() || !selectedChannelId}
                onClick={() => void sendIncidentMessage()}
              >
                Envoyer
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="real-mod-section-head">
              <div>
                <span className="eyebrow">ÉQUIPE</span>
                <h2>Staff de modération</h2>
              </div>
            </div>

            <div className="real-mod-staff-list">
              {staff.map((member) => (
                <article key={member.user_id}>
                  <div className="real-mod-avatar">
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
                      {member.display_name || member.username || member.user_id.slice(0, 8)}
                    </strong>
                    <span>{member.role} · {member.presence_status}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="real-mod-section-head">
              <div>
                <span className="eyebrow">JOURNAL</span>
                <h2>Activité admin</h2>
              </div>
            </div>

            <div className="real-mod-audit-list">
              {auditRows.length === 0 ? (
                <div className="real-mod-empty compact">Aucune activité récente.</div>
              ) : (
                auditRows.map((row) => (
                  <article key={row.id}>
                    <strong>{profileName(profiles.get(row.actor_id), row.actor_id)}</strong>
                    <span>
                      {row.action} · {row.entity_type}
                      {row.entity_id ? ` #${row.entity_id}` : ""}
                    </span>
                    <small>{new Date(row.created_at).toLocaleString("fr-FR")}</small>
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
