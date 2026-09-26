import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./FriendsPage.css";

type Props = {
  session: Session | null;
  onLogin: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenMessages: (userId: string) => void;
};

type FriendProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  responded_at: string | null;
};

type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

type RequestWithProfile = FriendshipRow & { profile: FriendProfile };
type BlockWithProfile = BlockRow & { profile: FriendProfile };
type Tab = "friends" | "received" | "sent" | "blocked";

export default function FriendsPage({
  session,
  onLogin,
  onOpenProfile,
  onOpenMessages,
}: Props) {
  const [friends, setFriends] = useState<RequestWithProfile[]>([]);
  const [received, setReceived] = useState<RequestWithProfile[]>([]);
  const [sent, setSent] = useState<RequestWithProfile[]>([]);
  const [blocked, setBlocked] = useState<BlockWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("friends");
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<RequestWithProfile | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<RequestWithProfile | null>(null);

  const loadAll = useCallback(async () => {
    if (!session?.user?.id) {
      setFriends([]);
      setReceived([]);
      setSent([]);
      setBlocked([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const userId = session.user.id;

    const [relationshipsResult, blocksResult] = await Promise.all([
      supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at, responded_at")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_blocks")
        .select("id, blocker_id, blocked_id, created_at")
        .eq("blocker_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (relationshipsResult.error) {
      console.error("Friends / relationships:", relationshipsResult.error);
      setError("Impossible de charger tes amis.");
      setLoading(false);
      return;
    }

    if (blocksResult.error) {
      console.error("Friends / blocks:", blocksResult.error);
      setError("Impossible de charger les utilisateurs bloqués.");
      setLoading(false);
      return;
    }

    const relationships = (relationshipsResult.data ?? []) as FriendshipRow[];
    const blockRows = (blocksResult.data ?? []) as BlockRow[];

    const profileIds = Array.from(
      new Set([
        ...relationships.map((row) =>
          row.requester_id === userId ? row.addressee_id : row.requester_id
        ),
        ...blockRows.map((row) => row.blocked_id),
      ])
    );

    if (profileIds.length === 0) {
      setFriends([]);
      setReceived([]);
      setSent([]);
      setBlocked([]);
      setSelectedFriendId(null);
      setLoading(false);
      return;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, region, language")
      .in("id", profileIds);

    if (profilesError) {
      console.error("Friends / profiles:", profilesError);
      setError("Impossible de charger les profils.");
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, FriendProfile>(
      (profilesData ?? []).map((profile) => [
        profile.id,
        {
          user_id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          region: profile.region,
          language: profile.language,
        },
      ])
    );

    const hydrated = relationships
      .map((row) => {
        const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
        const profile = profileMap.get(otherId);
        return profile ? { ...row, profile } : null;
      })
      .filter((row): row is RequestWithProfile => Boolean(row));

    const nextFriends = hydrated.filter((row) => row.status === "accepted");
    setFriends(nextFriends);
    setReceived(
      hydrated.filter((row) => row.status === "pending" && row.addressee_id === userId)
    );
    setSent(
      hydrated.filter((row) => row.status === "pending" && row.requester_id === userId)
    );
    setBlocked(
      blockRows
        .map((row) => {
          const profile = profileMap.get(row.blocked_id);
          return profile ? { ...row, profile } : null;
        })
        .filter((row): row is BlockWithProfile => Boolean(row))
    );

    setSelectedFriendId((current) =>
      current && nextFriends.some((row) => row.profile.user_id === current) ? current : null
    );
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    const friendshipsChannel = supabase
      .channel(`friends-clean:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        (payload) => {
          const next = payload.new as Partial<FriendshipRow> | null;
          const previous = payload.old as Partial<FriendshipRow> | null;
          if (
            next?.requester_id === userId ||
            next?.addressee_id === userId ||
            previous?.requester_id === userId ||
            previous?.addressee_id === userId
          ) {
            void loadAll();
          }
        }
      )
      .subscribe();

    const blocksChannel = supabase
      .channel(`friends-blocks-clean:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_blocks" },
        (payload) => {
          const next = payload.new as Partial<BlockRow> | null;
          const previous = payload.old as Partial<BlockRow> | null;
          if (next?.blocker_id === userId || previous?.blocker_id === userId) {
            void loadAll();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(friendshipsChannel);
      void supabase.removeChannel(blocksChannel);
    };
  }, [session?.user?.id, loadAll]);

  async function respondRequest(requestId: string, accept: boolean) {
    setWorkingId(requestId);
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("respond_friend_request", {
      p_request_id: requestId,
      p_accept: accept,
    });

    if (actionError) {
      setError(accept ? "Impossible d’accepter cette demande." : "Impossible de refuser cette demande.");
    } else {
      setNotice(accept ? "Demande acceptée." : "Demande refusée.");
      await loadAll();
    }
    setWorkingId(null);
  }

  async function removeFriendship(row: RequestWithProfile) {
    setWorkingId(row.id);
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("remove_friendship", {
      p_friendship_id: row.id,
    });

    if (actionError) {
      setError("Impossible de retirer cet ami.");
    } else {
      setNotice("Ami retiré.");
      setConfirmRemove(null);
      setSelectedFriendId(null);
      await loadAll();
    }
    setWorkingId(null);
  }

  async function cancelRequest(row: RequestWithProfile) {
    setWorkingId(row.id);
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("remove_friendship", {
      p_friendship_id: row.id,
    });

    if (actionError) setError("Impossible d’annuler la demande.");
    else {
      setNotice("Demande annulée.");
      await loadAll();
    }
    setWorkingId(null);
  }

  async function blockUser(row: RequestWithProfile) {
    setWorkingId(row.id);
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("block_user", {
      p_target_user_id: row.profile.user_id,
    });

    if (actionError) {
      setError("Impossible de bloquer cet utilisateur.");
    } else {
      setNotice("Utilisateur bloqué.");
      setConfirmBlock(null);
      setConfirmRemove(null);
      setSelectedFriendId(null);
      setTab("blocked");
      await loadAll();
    }
    setWorkingId(null);
  }

  async function unblockUser(row: BlockWithProfile) {
    setWorkingId(row.id);
    setError("");
    setNotice("");

    const { error: actionError } = await supabase.rpc("unblock_user", {
      p_target_user_id: row.profile.user_id,
    });

    if (actionError) setError("Impossible de débloquer cet utilisateur.");
    else {
      setNotice("Utilisateur débloqué.");
      await loadAll();
    }
    setWorkingId(null);
  }

  async function inviteFriendToSquad(row: RequestWithProfile) {
    setWorkingId(row.id);
    setError("");
    setNotice("");

    const { data, error: actionError } = await supabase.rpc("invite_to_squad", {
      p_recipient_id: row.profile.user_id,
      p_game_id: null,
    });

    if (actionError) {
      setError(
        actionError.message.includes("only_owner_can_invite")
          ? "Seul le chef de la squad peut inviter."
          : actionError.message.includes("squad_full")
          ? "Ta squad est complète."
          : actionError.message.includes("blocked")
          ? "Cette invitation n’est pas autorisée."
          : "Impossible d’envoyer l’invitation."
      );
    } else {
      const result = data as { status?: string } | null;
      setNotice(
        result?.status === "already_pending"
          ? "Une invitation est déjà en attente."
          : "Invitation de squad envoyée."
      );
    }
    setWorkingId(null);
  }

  const source =
    tab === "friends" ? friends :
    tab === "received" ? received :
    tab === "sent" ? sent :
    blocked;

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((row) =>
      [
        row.profile.display_name,
        row.profile.username,
        row.profile.region,
        row.profile.language,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [source, query]);

  const selectedFriend =
    friends.find((row) => row.profile.user_id === selectedFriendId) ?? null;

  if (!session) {
    return (
      <section className="friends-clean locked">
        <div>
          <span className="friends-kicker">AMIS</span>
          <h1>Retrouve tes mates.</h1>
          <p>Connecte-toi pour accéder à tes amis et à tes demandes.</p>
          <button type="button" className="friends-primary" onClick={onLogin}>Se connecter</button>
        </div>
      </section>
    );
  }

  return (
    <div className="friends-clean">
      <header className="friends-header">
        <div>
          <span className="friends-kicker">SOCIAL</span>
          <h1>Amis</h1>
          <p>Gère simplement ton cercle GameMate.</p>
        </div>

        {received.length > 0 && (
          <button type="button" className="friends-request-shortcut" onClick={() => setTab("received")}>
            {received.length} demande{received.length > 1 ? "s" : ""} en attente
          </button>
        )}
      </header>

      <nav className="friends-tabs">
        <TabButton active={tab === "friends"} label="Amis" count={friends.length} onClick={() => setTab("friends")} />
        <TabButton active={tab === "received"} label="Reçues" count={received.length} attention={received.length > 0} onClick={() => setTab("received")} />
        <TabButton active={tab === "sent"} label="Envoyées" count={sent.length} onClick={() => setTab("sent")} />
        <TabButton active={tab === "blocked"} label="Bloqués" count={blocked.length} onClick={() => setTab("blocked")} />
      </nav>

      {(error || notice) && (
        <div className={`friends-notice ${error ? "error" : ""}`}>
          {error || notice}
          {error && <button type="button" onClick={() => void loadAll()}>Réessayer</button>}
        </div>
      )}

      <div className={`friends-layout ${selectedFriend && tab === "friends" ? "with-detail" : ""}`}>
        <main className="friends-main">
          <div className="friends-toolbar">
            <label className="friends-search">
              <span>⌕</span>
              <input
                type="text"
                value={query}
                placeholder="Rechercher..."
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <small>{filteredRows.length} résultat{filteredRows.length > 1 ? "s" : ""}</small>
          </div>

          {loading ? (
            <div className="friends-empty">Chargement...</div>
          ) : filteredRows.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="friends-list">
              {tab === "friends" && (filteredRows as RequestWithProfile[]).map((row) => (
                <FriendRow
                  key={row.id}
                  row={row}
                  selected={row.profile.user_id === selectedFriendId}
                  onSelect={() => setSelectedFriendId(row.profile.user_id)}
                  onMessage={() => onOpenMessages(row.profile.user_id)}
                  onProfile={() => onOpenProfile(row.profile.user_id)}
                />
              ))}

              {tab === "received" && (filteredRows as RequestWithProfile[]).map((row) => (
                <ReceivedRow
                  key={row.id}
                  row={row}
                  working={workingId === row.id}
                  onAccept={() => void respondRequest(row.id, true)}
                  onReject={() => void respondRequest(row.id, false)}
                  onProfile={() => onOpenProfile(row.profile.user_id)}
                  onBlock={() => setConfirmBlock(row)}
                />
              ))}

              {tab === "sent" && (filteredRows as RequestWithProfile[]).map((row) => (
                <SentRow
                  key={row.id}
                  row={row}
                  working={workingId === row.id}
                  onCancel={() => void cancelRequest(row)}
                  onProfile={() => onOpenProfile(row.profile.user_id)}
                />
              ))}

              {tab === "blocked" && (filteredRows as BlockWithProfile[]).map((row) => (
                <BlockedRow
                  key={row.id}
                  row={row}
                  working={workingId === row.id}
                  onUnblock={() => void unblockUser(row)}
                />
              ))}
            </div>
          )}
        </main>

        {selectedFriend && tab === "friends" && (
          <aside className="friends-detail">
            <button className="friends-detail-close" type="button" onClick={() => setSelectedFriendId(null)}>×</button>
            <Avatar profile={selectedFriend.profile} large />
            <h2>{friendName(selectedFriend.profile)}</h2>
            <span className="friends-handle">
              {selectedFriend.profile.username ? `@${selectedFriend.profile.username}` : "Profil GameMate"}
            </span>

            {selectedFriend.profile.bio && <p>{selectedFriend.profile.bio}</p>}

            <div className="friends-meta">
              {selectedFriend.profile.region && <span>{selectedFriend.profile.region}</span>}
              {selectedFriend.profile.language && <span>{selectedFriend.profile.language}</span>}
            </div>

            <div className="friends-detail-actions">
              <button type="button" className="primary" onClick={() => onOpenMessages(selectedFriend.profile.user_id)}>
                Message
              </button>
              <button type="button" onClick={() => onOpenProfile(selectedFriend.profile.user_id)}>
                Voir le profil
              </button>
              <button type="button" disabled={workingId === selectedFriend.id} onClick={() => void inviteFriendToSquad(selectedFriend)}>
                Inviter dans ma team
              </button>
            </div>

            <div className="friends-danger">
              <button type="button" disabled={workingId === selectedFriend.id} onClick={() => setConfirmRemove(selectedFriend)}>
                Retirer de mes amis
              </button>
              <button type="button" className="danger" disabled={workingId === selectedFriend.id} onClick={() => setConfirmBlock(selectedFriend)}>
                Bloquer
              </button>
            </div>
          </aside>
        )}
      </div>

      {confirmRemove && (
        <ConfirmModal
          title={`Retirer ${friendName(confirmRemove.profile)} ?`}
          text="Cette personne ne sera plus dans ta liste d’amis."
          confirmLabel={workingId === confirmRemove.id ? "Suppression..." : "Retirer"}
          working={workingId === confirmRemove.id}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => void removeFriendship(confirmRemove)}
        />
      )}

      {confirmBlock && (
        <ConfirmModal
          title={`Bloquer ${friendName(confirmBlock.profile)} ?`}
          text="La relation d’amitié et les demandes en cours seront supprimées. Cette personne ne pourra plus t’envoyer de demande tant qu’elle est bloquée."
          confirmLabel={workingId === confirmBlock.id ? "Blocage..." : "Bloquer"}
          working={workingId === confirmBlock.id}
          danger
          onCancel={() => setConfirmBlock(null)}
          onConfirm={() => void blockUser(confirmBlock)}
        />
      )}
    </div>
  );
}

function friendName(profile: FriendProfile) {
  return profile.display_name || profile.username || "Joueur GameMate";
}

function Avatar({ profile, large = false }: { profile: FriendProfile; large?: boolean }) {
  const name = friendName(profile);
  return (
    <span className={`friends-avatar ${large ? "large" : ""}`}>
      {profile.avatar_url ? <img src={profile.avatar_url} alt={name} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function TabButton({
  active,
  label,
  count,
  attention = false,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`${active ? "active" : ""} ${attention ? "attention" : ""}`} onClick={onClick}>
      {label}
      <span>{count}</span>
    </button>
  );
}

function FriendRow({
  row,
  selected,
  onSelect,
  onMessage,
  onProfile,
}: {
  row: RequestWithProfile;
  selected: boolean;
  onSelect: () => void;
  onMessage: () => void;
  onProfile: () => void;
}) {
  const profile = row.profile;
  return (
    <article className={`friends-row ${selected ? "selected" : ""}`}>
      <button type="button" className="friends-person" onClick={onSelect}>
        <Avatar profile={profile} />
        <span className="friends-person-copy">
          <strong>{friendName(profile)}</strong>
          <small>
            {profile.username ? `@${profile.username}` : "GameMate"}
            {profile.region ? ` · ${profile.region}` : ""}
          </small>
        </span>
      </button>

      <div className="friends-row-actions">
        <button type="button" className="primary" onClick={onMessage}>Message</button>
        <button type="button" onClick={onProfile}>Profil</button>
        <button type="button" className="more" onClick={onSelect} aria-label="Plus d’actions">•••</button>
      </div>
    </article>
  );
}

function ReceivedRow({
  row,
  working,
  onAccept,
  onReject,
  onProfile,
  onBlock,
}: {
  row: RequestWithProfile;
  working: boolean;
  onAccept: () => void;
  onReject: () => void;
  onProfile: () => void;
  onBlock: () => void;
}) {
  return (
    <article className="friends-row">
      <div className="friends-person static">
        <Avatar profile={row.profile} />
        <span className="friends-person-copy">
          <strong>{friendName(row.profile)}</strong>
          <small>{row.profile.username ? `@${row.profile.username}` : "Souhaite t’ajouter"}</small>
        </span>
      </div>

      <div className="friends-row-actions">
        <button type="button" className="primary" disabled={working} onClick={onAccept}>Accepter</button>
        <button type="button" disabled={working} onClick={onReject}>Refuser</button>
        <button type="button" onClick={onProfile}>Profil</button>
        <button type="button" className="danger-icon" disabled={working} onClick={onBlock} title="Bloquer">×</button>
      </div>
    </article>
  );
}

function SentRow({
  row,
  working,
  onCancel,
  onProfile,
}: {
  row: RequestWithProfile;
  working: boolean;
  onCancel: () => void;
  onProfile: () => void;
}) {
  return (
    <article className="friends-row">
      <div className="friends-person static">
        <Avatar profile={row.profile} />
        <span className="friends-person-copy">
          <strong>{friendName(row.profile)}</strong>
          <small>Demande en attente</small>
        </span>
      </div>

      <div className="friends-row-actions">
        <button type="button" onClick={onProfile}>Profil</button>
        <button type="button" disabled={working} onClick={onCancel}>Annuler</button>
      </div>
    </article>
  );
}

function BlockedRow({
  row,
  working,
  onUnblock,
}: {
  row: BlockWithProfile;
  working: boolean;
  onUnblock: () => void;
}) {
  return (
    <article className="friends-row">
      <div className="friends-person static">
        <Avatar profile={row.profile} />
        <span className="friends-person-copy">
          <strong>{friendName(row.profile)}</strong>
          <small>Utilisateur bloqué</small>
        </span>
      </div>

      <div className="friends-row-actions">
        <button type="button" disabled={working} onClick={onUnblock}>
          {working ? "Déblocage..." : "Débloquer"}
        </button>
      </div>
    </article>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy = {
    friends: ["Aucun ami pour le moment", "Les joueurs acceptés apparaîtront ici."],
    received: ["Aucune demande reçue", "Tu n’as rien à traiter pour le moment."],
    sent: ["Aucune demande envoyée", "Tes invitations en attente apparaîtront ici."],
    blocked: ["Aucun joueur bloqué", "Ta liste de blocage est vide."],
  }[tab];

  return (
    <div className="friends-empty">
      <span>♢</span>
      <strong>{copy[0]}</strong>
      <p>{copy[1]}</p>
    </div>
  );
}

function ConfirmModal({
  title,
  text,
  confirmLabel,
  working,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  working: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="friends-modal-backdrop" onMouseDown={onCancel}>
      <section className="friends-modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div>
          <button type="button" disabled={working} onClick={onCancel}>Annuler</button>
          <button type="button" className={danger ? "danger" : "primary"} disabled={working} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
