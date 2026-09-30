import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Icon } from "./Icon";

type OfficialMessage = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export default function OfficialMessagesPanel({
  session,
  onReadAll,
}: {
  session: Session;
  onReadAll: () => void;
}) {
  const [messages, setMessages] = useState<OfficialMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMessages = useCallback(async () => {
    setError("");

    const { data, error } = await supabase.rpc("get_my_admin_messages");

    if (error) {
      setError("Impossible de charger les messages GameMate.");
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as OfficialMessage[];
    setMessages(rows);
    setLoading(false);

    const unread = rows.filter((message) => !message.read_at);

    if (unread.length > 0) {
      await Promise.all(
        unread.map((message) =>
          supabase.rpc("mark_admin_message_read", { p_id: message.id })
        )
      );

      setMessages((current) =>
        current.map((message) => ({
          ...message,
          read_at: message.read_at ?? new Date().toISOString(),
        }))
      );

      onReadAll();
    }
  }, [onReadAll]);

  useEffect(() => {
    void loadMessages();

    const channel = supabase
      .channel(`official-messages:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_user_messages",
          filter: `recipient_id=eq.${session.user.id}`,
        },
        () => void loadMessages()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session.user.id, loadMessages]);

  if (loading) {
    return <div className="messages-official-empty">Chargement des messages GameMate...</div>;
  }

  if (error) {
    return (
      <div className="messages-official-empty">
        <strong>{error}</strong>
        <button type="button" onClick={() => void loadMessages()}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="messages-official-panel">
      <header className="messages-official-head">
        <div className="messages-official-logo">
          <img src="/gamemate-mark-transparent.png" alt="" />
        </div>
        <div>
          <span className="messages-kicker">COMPTE OFFICIEL</span>
          <strong>GameMate</strong>
          <small>Messages envoyés par l’équipe GameMate</small>
        </div>
        <span className="messages-official-verified">
          <Icon name="check" size={14} />
          Officiel
        </span>
      </header>

      <div className="messages-official-body">
        {messages.length === 0 ? (
          <div className="messages-official-empty">
            <img src="/gamemate-mark-transparent.png" alt="" />
            <strong>Aucun message officiel.</strong>
            <p>Les informations importantes de l’équipe GameMate apparaîtront ici.</p>
          </div>
        ) : (
          <div className="messages-official-list">
            {messages.map((message) => (
              <article key={message.id} className="messages-official-message">
                <header>
                  <div>
                    <span>GameMate</span>
                    <time>
                      {new Date(message.created_at).toLocaleString("fr-FR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                </header>
                <h3>{message.title}</h3>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="messages-official-footer">
        <Icon name="shield" size={15} />
        <span>Canal officiel en lecture seule. Pour répondre, utilise la page Support.</span>
      </footer>
    </div>
  );
}

