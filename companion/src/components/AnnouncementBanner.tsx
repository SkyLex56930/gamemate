import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Icon } from "./Icon";

type Announcement = {
  id: string;
  title: string;
  body: string;
  kind: "info" | "update" | "maintenance" | "important";
  audience: "all" | "online";
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

const DISMISSED_KEY = "gamemate-dismissed-announcements";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export default function AnnouncementBanner({
  session,
}: {
  session: Session | null;
}) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const load = useCallback(async () => {
    if (!session?.user.id) {
      setItems([]);
      return;
    }

    const { data, error } = await supabase.rpc("get_active_announcements");

    if (error) {
      console.error("Announcements:", error);
      return;
    }

    setItems((data ?? []) as Announcement[]);
  }, [session?.user.id]);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => void load(), 30000);
    const onFocus = () => void load();

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const visible = useMemo(
    () => items.find((item) => !dismissed.includes(item.id)) ?? null,
    [items, dismissed]
  );

  if (!visible) return null;

  function dismiss() {
    const next = Array.from(new Set([...dismissed, visible!.id]));
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  }

  const label =
    visible.kind === "important"
      ? "Important"
      : visible.kind === "maintenance"
      ? "Maintenance"
      : visible.kind === "update"
      ? "Mise à jour"
      : "Information";

  return (
    <div className={`gm-announcement-banner ${visible.kind}`}>
      <div className="gm-announcement-icon">
        <Icon
          name={
            visible.kind === "important"
              ? "alert-circle"
              : visible.kind === "maintenance"
              ? "settings"
              : visible.kind === "update"
              ? "refresh"
              : "info"
          }
          size={18}
        />
      </div>

      <div className="gm-announcement-copy">
        <span>{label}</span>
        <strong>{visible.title}</strong>
        <p>{visible.body}</p>
      </div>

      <button type="button" onClick={dismiss} aria-label="Fermer l’annonce">
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}


