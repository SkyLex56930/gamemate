import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Icon, type IconName } from "./Icon";
import "./ProfilePrivacyPanel.css";

type PrivacySettings = {
  show_bio: boolean;
  show_region: boolean;
  show_language: boolean;
  show_games: boolean;
  show_gaming_dna: boolean;
  show_looking_for: boolean;
  show_availability: boolean;
  show_last_seen: boolean;
  allow_friend_requests: boolean;
  allow_squad_invites: boolean;
};

const defaultSettings: PrivacySettings = {
  show_bio: true,
  show_region: true,
  show_language: true,
  show_games: true,
  show_gaming_dna: true,
  show_looking_for: true,
  show_availability: true,
  show_last_seen: true,
  allow_friend_requests: true,
  allow_squad_invites: true,
};

const visibilityRows: Array<{
  key: keyof PrivacySettings;
  title: string;
  description: string;
  icon: IconName;
}> = [
  { key: "show_bio", title: "Présentation", description: "Affiche ta bio sur ton profil joueur.", icon: "edit" },
  { key: "show_region", title: "Région", description: "Affiche uniquement la région que tu as saisie.", icon: "map-pin" },
  { key: "show_language", title: "Langue", description: "Aide les autres joueurs à savoir dans quelle langue jouer.", icon: "globe" },
  { key: "show_games", title: "Jeux et niveaux", description: "Affiche tes jeux, plateformes, rangs, rôles et modes.", icon: "gamepad" },
  { key: "show_gaming_dna", title: "Gaming DNA", description: "Affiche les tags qui décrivent ton style de jeu.", icon: "sparkles" },
  { key: "show_looking_for", title: "Ce que je recherche", description: "Affiche tes intentions : détente, classement, groupe régulier…", icon: "search" },
  { key: "show_availability", title: "Disponibilités", description: "Autorise le matching à comparer tes créneaux avec ceux des autres joueurs.", icon: "clock" },
  { key: "show_last_seen", title: "Dernière activité", description: "Autorise tes amis à voir quand tu as utilisé GameMate pour la dernière fois.", icon: "activity" },
];

const interactionRows: Array<{
  key: keyof PrivacySettings;
  title: string;
  description: string;
  icon: IconName;
}> = [
  { key: "allow_friend_requests", title: "Demandes d’ami", description: "Autorise les joueurs à t’envoyer une demande depuis ton profil.", icon: "user-plus" },
  { key: "allow_squad_invites", title: "Invitations de squad", description: "Autorise les chefs de squad à t’inviter depuis ton profil.", icon: "users" },
];

export default function ProfilePrivacyPanel() {
  const [settings, setSettings] = useState<PrivacySettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      const { data, error: loadError } = await supabase.rpc("get_my_profile_privacy");
      if (!active) return;

      if (loadError) {
        setError(loadError.message);
      } else if (data) {
        const row = data as Partial<PrivacySettings>;
        setSettings({
          show_bio: row.show_bio ?? true,
          show_region: row.show_region ?? true,
          show_language: row.show_language ?? true,
          show_games: row.show_games ?? true,
          show_gaming_dna: row.show_gaming_dna ?? true,
          show_looking_for: row.show_looking_for ?? true,
          show_availability: row.show_availability ?? true,
          show_last_seen: row.show_last_seen ?? true,
          allow_friend_requests: row.allow_friend_requests ?? true,
          allow_squad_invites: row.allow_squad_invites ?? true,
        });
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  function toggle(key: keyof PrivacySettings) {
    setFeedback("");
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }

  async function save() {
    setSaving(true);
    setFeedback("");
    setError("");

    const { error: saveError } = await supabase.rpc("update_my_profile_privacy_v15", {
      p_show_bio: settings.show_bio,
      p_show_region: settings.show_region,
      p_show_language: settings.show_language,
      p_show_games: settings.show_games,
      p_show_gaming_dna: settings.show_gaming_dna,
      p_show_looking_for: settings.show_looking_for,
      p_show_availability: settings.show_availability,
      p_show_last_seen: settings.show_last_seen,
      p_allow_friend_requests: settings.allow_friend_requests,
      p_allow_squad_invites: settings.allow_squad_invites,
    });

    if (saveError) {
      setError(saveError.message);
    } else {
      setFeedback("Tes réglages de confidentialité sont enregistrés.");
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="privacy6-loading"><span /><strong>Chargement de tes réglages…</strong></div>;
  }

  return (
    <div className="privacy6">
      <section className="privacy6-intro">
        <div>
          <span className="privacy6-eyebrow">CONFIDENTIALITÉ DU PROFIL</span>
          <h2>Choisis ce que les autres joueurs voient</h2>
          <p>
            Ton avatar, ton pseudo et ta bannière restent visibles pour que ton compte
            puisse être identifié. Toutes les informations ci-dessous sont réglables.
          </p>
        </div>
        <div className="privacy6-shield"><span><Icon name="shield" /></span><strong>Contrôle total</strong><small>Réglages appliqués côté serveur</small></div>
      </section>

      {(feedback || error) && (
        <div className={`privacy6-feedback ${error ? "error" : ""}`}>
          {error || feedback}
        </div>
      )}

      <div className="privacy6-grid">
        <section className="privacy6-card">
          <header><div><span className="privacy6-eyebrow">VISIBILITÉ</span><h3>Informations publiques</h3></div><b>{visibilityRows.filter((row) => settings[row.key]).length}/{visibilityRows.length}</b></header>
          <div className="privacy6-list">
            {visibilityRows.map((row) => (
              <PrivacyRow
                key={row.key}
                icon={row.icon}
                title={row.title}
                description={row.description}
                enabled={settings[row.key]}
                onToggle={() => toggle(row.key)}
              />
            ))}
          </div>
        </section>

        <section className="privacy6-card">
          <header><div><span className="privacy6-eyebrow">INTERACTIONS</span><h3>Qui peut te contacter</h3></div></header>
          <div className="privacy6-list">
            {interactionRows.map((row) => (
              <PrivacyRow
                key={row.key}
                icon={row.icon}
                title={row.title}
                description={row.description}
                enabled={settings[row.key]}
                onToggle={() => toggle(row.key)}
              />
            ))}
          </div>
          <div className="privacy6-info">
            <span><Icon name="info" size={16} /></span>
            <p>Le blocage d’un joueur reste prioritaire sur ces réglages. Un joueur bloqué ne peut jamais t’envoyer d’action sociale.</p>
          </div>
        </section>
      </div>

      <footer className="privacy6-savebar">
        <div><strong>Ton profil, tes règles.</strong><span>Les changements deviennent actifs dès l’enregistrement.</span></div>
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Enregistrement…" : "Enregistrer les réglages"}
        </button>
      </footer>
    </div>
  );
}

function PrivacyRow({
  icon,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: IconName;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={`privacy6-row ${enabled ? "enabled" : ""}`} onClick={onToggle} aria-pressed={enabled}>
      <span className="privacy6-icon"><Icon name={icon} /></span>
      <span className="privacy6-row-copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="privacy6-state">{enabled ? "Visible" : "Masqué"}</span>
      <span className="privacy6-switch"><i /></span>
    </button>
  );
}
