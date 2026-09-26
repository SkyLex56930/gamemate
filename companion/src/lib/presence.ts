export type OwnPresenceStatus = "online" | "away" | "dnd" | "invisible";
export type PresenceStatus = OwnPresenceStatus | "offline";

export type PresenceSnapshot = {
  user_id: string;
  status: PresenceStatus;
  custom_status: string | null;
  activity_game_id: number | null;
  activity_game_name: string | null;
  activity_text: string | null;
  last_seen_at: string | null;
};

export const presenceStorageKeys = {
  status: "gamemate-presence-status",
  customStatus: "gamemate-presence-custom-status",
  activityGameId: "gamemate-presence-activity-game-id",
  activityText: "gamemate-presence-activity-text",
} as const;

export function readPresenceStatus(): OwnPresenceStatus {
  const saved = localStorage.getItem(presenceStorageKeys.status);
  if (saved === "away" || saved === "dnd" || saved === "invisible") return saved;
  if (saved === "busy") return "dnd";
  return "online";
}

export function readPresenceCustomStatus() {
  return localStorage.getItem(presenceStorageKeys.customStatus)?.trim() ?? "";
}

export function presenceLabel(status: PresenceStatus) {
  if (status === "online") return "En ligne";
  if (status === "away") return "Absent";
  if (status === "dnd") return "Ne pas déranger";
  if (status === "invisible") return "Invisible";
  return "Hors ligne";
}

export function presenceDescription(status: OwnPresenceStatus) {
  if (status === "online") return "Disponible pour jouer";
  if (status === "away") return "Momentanément absent";
  if (status === "dnd") return "Notifications discrètes";
  return "Apparaître hors ligne";
}

export function presenceActivity(presence: PresenceSnapshot | null | undefined) {
  if (!presence) return "Hors ligne";
  if (presence.custom_status) return presence.custom_status;
  if (presence.activity_game_name && presence.activity_text) {
    return `${presence.activity_game_name} · ${presence.activity_text}`;
  }
  if (presence.activity_game_name) return `Sur ${presence.activity_game_name}`;
  if (presence.activity_text) return presence.activity_text;
  return presenceLabel(presence.status);
}

export function lastSeenLabel(value: string | null) {
  if (!value) return "Dernière activité masquée";
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "À l’instant";
  if (elapsed < 3_600_000) return `Il y a ${Math.max(1, Math.floor(elapsed / 60_000))} min`;
  if (elapsed < 86_400_000) return `Il y a ${Math.floor(elapsed / 3_600_000)} h`;
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
