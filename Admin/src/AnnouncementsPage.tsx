import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type Announcement = {
  id: string;
  title: string;
  body: string;
  kind: "info" | "update" | "maintenance" | "important";
  audience: "all" | "online";
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const KIND_LABELS: Record<Announcement["kind"], string> = {
  info: "Information",
  update: "Mise à jour",
  maintenance: "Maintenance",
  important: "Important",
};

export default function AnnouncementsPage({ canPublish }: { canPublish: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Announcement["kind"]>("info");
  const [audience, setAudience] = useState<Announcement["audience"]>("all");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAnnouncements() {
    const { data, error } = await supabase.rpc("admin_list_announcements");
    if (error) setError(error.message);
    else setItems((data ?? []) as Announcement[]);
  }

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  async function publish() {
    if (!title.trim() || !body.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { error } = await supabase.rpc("admin_create_announcement", {
      p_title: title.trim(),
      p_body: body.trim(),
      p_kind: kind,
      p_audience: audience,
      p_starts_at: new Date().toISOString(),
      p_ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    });

    if (error) {
      setError(error.message);
    } else {
      setTitle("");
      setBody("");
      setEndsAt("");
      setKind("info");
      setAudience("all");
      setNotice("Annonce publiée.");
      await loadAnnouncements();
    }

    setBusy(false);
  }

  async function toggle(item: Announcement) {
    const { error } = await supabase.rpc("admin_set_announcement_active", {
      p_id: item.id,
      p_active: !item.is_active,
    });

    if (error) setError(error.message);
    else await loadAnnouncements();
  }

  return (
    <div className="page admin-announcements-page">
      <header className="pageHead admin-simple-head">
        <div>
          <span className="eyebrow">COMMUNICATION</span>
          <h1>Annonces</h1>
          <p>Publie une information officielle visible dans GameMate.</p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {notice && <div className="message">{notice}</div>}

      <div className="admin-announcement-layout">
        <section className="panel admin-announcement-editor">
          <span className="eyebrow">NOUVELLE ANNONCE</span>
          <h2>Préparer une annonce</h2>

          <label>
            <span>Titre</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex. Mise à jour GameMate"
              maxLength={140}
            />
          </label>

          <label>
            <span>Message</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              placeholder="Écris le message affiché aux joueurs..."
              maxLength={6000}
            />
          </label>

          <div className="grid2">
            <label>
              <span>Type</span>
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as Announcement["kind"])
                }
              >
                <option value="info">Information</option>
                <option value="update">Mise à jour</option>
                <option value="maintenance">Maintenance</option>
                <option value="important">Important</option>
              </select>
            </label>

            <label>
              <span>Cible</span>
              <select
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as Announcement["audience"])
                }
              >
                <option value="all">Tous les joueurs</option>
                <option value="online">Joueurs actuellement en ligne</option>
              </select>
            </label>
          </div>

          <label>
            <span>Fin automatique (optionnel)</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>

          <div className={`admin-announcement-preview ${kind}`}>
            <small>{KIND_LABELS[kind]}</small>
            <strong>{title || "Titre de l’annonce"}</strong>
            <p>{body || "Aperçu du message qui sera affiché dans GameMate."}</p>
          </div>

          <button
            className="primary"
            disabled={!canPublish || busy || !title.trim() || !body.trim()}
            onClick={() => void publish()}
          >
            {busy ? "Publication..." : "Publier l’annonce"}
          </button>

          {!canPublish && (
            <p className="muted">
              Seuls les owners et admins peuvent publier des annonces.
            </p>
          )}
        </section>

        <section className="panel admin-announcement-history">
          <div className="panelHead">
            <div>
              <span className="eyebrow">HISTORIQUE</span>
              <h2>{items.length} annonces</h2>
            </div>
            <button type="button" onClick={() => void loadAnnouncements()}>
              Actualiser
            </button>
          </div>

          <div className="admin-announcement-list">
            {items.map((item) => (
              <article key={item.id}>
                <div>
                  <span className={`admin-announcement-kind ${item.kind}`}>
                    {KIND_LABELS[item.kind]}
                  </span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <small>
                    {item.audience === "all" ? "Tous les joueurs" : "Joueurs en ligne"} ·{" "}
                    {new Date(item.created_at).toLocaleString("fr-FR")}
                  </small>
                </div>

                <button
                  type="button"
                  className={item.is_active ? "active" : ""}
                  onClick={() => void toggle(item)}
                >
                  {item.is_active ? "Active" : "Désactivée"}
                </button>
              </article>
            ))}

            {items.length === 0 && (
              <div className="admin-empty-clean">
                <strong>Aucune annonce.</strong>
                <span>La première apparaîtra ici après publication.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

