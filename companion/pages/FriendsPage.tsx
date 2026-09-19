import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./FriendsPage.css";

type Props = {
  session: Session | null;
  onLogin: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenMessages: () => void;
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

type RequestWithProfile = FriendshipRow & {
  profile: FriendProfile;
};

type BlockWithProfile = BlockRow & {
  profile: FriendProfile;
};

type FutureAction = "call" | "watch" | null;
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
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("friends");
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [futureAction, setFutureAction] = useState<FutureAction>(null);
  const [confirmBlock, setConfirmBlock] = useState<RequestWithProfile | null>(null);

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
      setError("Impossible de charger les relations d’amitié.");
      setLoading(false);
      return;
    }

    if (blocksResult.error) {
      console.error("Friends / blocks:", blocksResult.error);
      setError(
        "La fonction de blocage n’est pas encore installée dans Supabase. Exécute le fichier SQL fourni avec ce pack."
      );
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
        const otherId =
          row.requester_id === userId ? row.addressee_id : row.requester_id;
        const profile = profileMap.get(otherId);
        return profile ? { ...row, profile } : null;
      })
      .filter((row): row is RequestWithProfile => Boolean(row));

    const hydratedBlocks = blockRows
      .map((row) => {
        const profile = profileMap.get(row.blocked_id);
        return profile ? { ...row, profile } : null;
      })
      .filter((row): row is BlockWithProfile => Boolean(row));

    setFriends(hydrated.filter((row) => row.status === "accepted"));
    setReceived(
      hydrated.filter(
        (row) => row.status === "pending" && row.addressee_id === userId
      )
    );
    setSent(
      hydrated.filter(
        (row) => row.status === "pending" && row.requester_id === userId
      )
    );
    setBlocked(hydratedBlocks);

    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    const friendshipsChannel = supabase
      .channel(`friendships-page:${userId}`)
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
      .channel(`blocks-page:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_blocks" },
        (payload) => {
          const next = payload.new as Partial<BlockRow> | null;
          const previous = payload.old as Partial<BlockRow> | null;

          if (
            next?.blocker_id === userId ||
            previous?.blocker_id === userId
          ) {
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

    const { error: actionError } = await supabase.rpc(
      "respond_friend_request",
      {
        p_request_id: requestId,
        p_accept: accept,
      }
    );

    if (actionError) {
      console.error("respond_friend_request:", actionError);
      setError(
        accept
          ? "Impossible d’accepter cette demande."
          : "Impossible de refuser cette demande."
      );
    } else {
      await loadAll();
    }

    setWorkingId(null);
  }

  async function removeFriendship(friendshipId: string) {
    setWorkingId(friendshipId);
    setError("");

    const { error: actionError } = await supabase.rpc("remove_friendship", {
      p_friendship_id: friendshipId,
    });

    if (actionError) {
      console.error("remove_friendship:", actionError);
      setError("Impossible de retirer cet ami.");
    } else {
      setSelectedFriendId(null);
      await loadAll();
    }

    setWorkingId(null);
  }

  async function blockUser(row: RequestWithProfile) {
    setWorkingId(row.id);
    setError("");

    const { error: actionError } = await supabase.rpc("block_user", {
      p_target_user_id: row.profile.user_id,
    });

    if (actionError) {
      console.error("block_user:", actionError);
      setError(
        "Impossible de bloquer cet utilisateur. Vérifie que le SQL du système de blocage est installé."
      );
    } else {
      setConfirmBlock(null);
      setSelectedFriendId(null);
      setTab("blocked");
      await loadAll();
    }

    setWorkingId(null);
  }

  async function unblockUser(row: BlockWithProfile) {
    setWorkingId(row.id);
    setError("");

    const { error: actionError } = await supabase.rpc("unblock_user", {
      p_target_user_id: row.profile.user_id,
    });

    if (actionError) {
      console.error("unblock_user:", actionError);
      setError("Impossible de débloquer cet utilisateur.");
    } else {
      await loadAll();
    }

    setWorkingId(null);
  }


  async function inviteFriendToSquad(row: RequestWithProfile) {
    setWorkingId(row.id);
    setError("");

    const { data, error: actionError } = await supabase.rpc("invite_to_squad", {
      p_recipient_id: row.profile.user_id,
      p_game_id: null,
    });

    if (actionError) {
      console.error("invite_to_squad:", actionError);
      setError(
        actionError.message.includes("only_owner_can_invite")
          ? "Seul le chef de la squad peut inviter."
          : actionError.message.includes("squad_full")
          ? "Ta squad est complète."
          : "Impossible d’envoyer l’invitation de squad."
      );
    } else {
      const result = data as { status?: string } | null;
      setError(
        result?.status === "already_pending"
          ? "Invitation squad déjà en attente."
          : "Invitation squad envoyée."
      );
    }

    setWorkingId(null);
  }

  const source =
    tab === "friends"
      ? friends
      : tab === "received"
      ? received
      : tab === "sent"
      ? sent
      : blocked;

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return source;

    return source.filter((row) => {
      const profile = row.profile;
      return [
        profile.display_name,
        profile.username,
        profile.region,
        profile.language,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [source, query]);

  const selectedFriend =
    friends.find((row) => row.profile.user_id === selectedFriendId) ?? null;

  if (!session) {
    return (
      <section className="fr2 fr2-locked">
        <div className="fr2-lock-orb a" />
        <div className="fr2-lock-orb b" />
        <div className="fr2-lock-content">
          <span className="fr2-kicker">AMIS GAMEMATE</span>
          <h1>Ton cercle gaming, toujours à portée de clic.</h1>
          <p>Connecte-toi pour gérer tes amis et ta confidentialité.</p>
          <button type="button" className="fr2-primary" onClick={onLogin}>
            Se connecter
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="fr2">
      <div className="fr2-grid" />
      <div className="fr2-orb fr2-orb-a" />
      <div className="fr2-orb fr2-orb-b" />

      <header className="fr2-header">
        <div>
          <span className="fr2-kicker">SOCIAL GAMEMATE</span>
          <h1>
            Tes <span>amis</span>
          </h1>
          <p>
            Gère tes amis, tes demandes et les joueurs bloqués depuis un seul endroit.
          </p>
        </div>

        <div className="fr2-header-stats">
          <Stat label="AMIS" value={friends.length} />
          <Stat label="REÇUES" value={received.length} highlight={received.length > 0} />
          <Stat label="BLOQUÉS" value={blocked.length} />
        </div>
      </header>

      <div className="fr2-tabs">
        <TabButton active={tab === "friends"} label="Mes amis" count={friends.length} onClick={() => setTab("friends")} />
        <TabButton active={tab === "received"} label="Demandes reçues" count={received.length} attention={received.length > 0} onClick={() => setTab("received")} />
        <TabButton active={tab === "sent"} label="Demandes envoyées" count={sent.length} onClick={() => setTab("sent")} />
        <TabButton active={tab === "blocked"} label="Bloqués" count={blocked.length} onClick={() => setTab("blocked")} />
      </div>

      <div className="fr2-layout">
        <main className="fr2-main">
          <div className="fr2-toolbar">
            <label className="fr2-search">
              <span>⌕</span>
              <input
                type="text"
                value={query}
                placeholder="Rechercher un joueur..."
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="fr2-toolbar-copy">
              <strong>{filteredRows.length} résultat{filteredRows.length > 1 ? "s" : ""}</strong>
              <span>Synchronisé avec Supabase.</span>
            </div>
          </div>

          {error && <div className="fr2-info-banner error">{error}</div>}

          {loading ? (
            <div className="fr2-state">
              <span className="fr2-loader" />
              <strong>Synchronisation...</strong>
            </div>
          ) : filteredRows.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="fr2-cards">
              {tab === "friends" &&
                (filteredRows as RequestWithProfile[]).map((row) => (
                  <FriendCard
                    key={row.id}
                    row={row}
                    active={row.profile.user_id === selectedFriendId}
                    onSelect={() => setSelectedFriendId(row.profile.user_id)}
                    onOpenProfile={() => onOpenProfile(row.profile.user_id)}
                  />
                ))}

              {tab === "received" &&
                (filteredRows as RequestWithProfile[]).map((row) => (
                  <ReceivedRequestCard
                    key={row.id}
                    row={row}
                    working={workingId === row.id}
                    onOpenProfile={() => onOpenProfile(row.profile.user_id)}
                    onAccept={() => void respondRequest(row.id, true)}
                    onReject={() => void respondRequest(row.id, false)}
                    onBlock={() => setConfirmBlock(row)}
                  />
                ))}

              {tab === "sent" &&
                (filteredRows as RequestWithProfile[]).map((row) => (
                  <SentRequestCard
                    key={row.id}
                    row={row}
                    working={workingId === row.id}
                    onOpenProfile={() => onOpenProfile(row.profile.user_id)}
                    onCancel={() => void removeFriendship(row.id)}
                  />
                ))}

              {tab === "blocked" &&
                (filteredRows as BlockWithProfile[]).map((row) => (
                  <BlockedCard
                    key={row.id}
                    row={row}
                    working={workingId === row.id}
                    onUnblock={() => void unblockUser(row)}
                  />
                ))}
            </div>
          )}
        </main>

        <aside className="fr2-side">
          {selectedFriend ? (
            <FriendPanel
              row={selectedFriend}
              working={workingId === selectedFriend.id}
              onOpenProfile={() => onOpenProfile(selectedFriend.profile.user_id)}
              onMessage={onOpenMessages}
              onCall={() => setFutureAction("call")}
              onWatch={() => setFutureAction("watch")}
              onInvite={() => void inviteFriendToSquad(selectedFriend)}
              onRemove={() => void removeFriendship(selectedFriend.id)}
              onBlock={() => setConfirmBlock(selectedFriend)}
            />
          ) : (
            <section className="fr2-side-empty">
              <div className="fr2-side-logo">
                <img src="/gamemate-logo.png" alt="" />
              </div>
              <span className="fr2-kicker">GESTION SOCIALE</span>
              <h2>
                {tab === "blocked" ? "Joueurs bloqués" : "Sélectionne un joueur."}
              </h2>
              <p>
                {tab === "blocked"
                  ? "Un joueur bloqué ne peut plus t’envoyer de demande d’ami tant que tu ne le débloques pas."
                  : "Les actions de gestion apparaîtront ici."}
              </p>
            </section>
          )}
        </aside>
      </div>

      {futureAction && selectedFriend && (
        <FutureActionModal
          action={futureAction}
          friend={selectedFriend.profile}
          onClose={() => setFutureAction(null)}
        />
      )}

      {confirmBlock && (
        <BlockConfirmModal
          row={confirmBlock}
          working={workingId === confirmBlock.id}
          onCancel={() => setConfirmBlock(null)}
          onConfirm={() => void blockUser(confirmBlock)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`fr2-header-stat ${highlight ? "attention" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function TabButton({ active, label, count, attention = false, onClick }: { active: boolean; label: string; count: number; attention?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`fr2-tab ${active ? "active" : ""} ${attention ? "attention" : ""}`} onClick={onClick}>
      <span>{label}</span>
      <b>{count}</b>
    </button>
  );
}

function FriendCard({ row, active, onSelect, onOpenProfile }: { row: RequestWithProfile; active: boolean; onSelect: () => void; onOpenProfile: () => void }) {
  const friend = row.profile;
  const name = friend.display_name || friend.username || "Joueur GameMate";
  return (
    <article className={`fr2-card ${active ? "active" : ""}`}>
      <button type="button" className="fr2-card-main" onClick={onSelect}>
        <Avatar profile={friend} initial={name.slice(0, 1).toUpperCase()} />
        <div className="fr2-card-copy">
          <strong>{name}</strong>
          <span>{friend.username ? `@${friend.username}` : "Profil GameMate"}</span>
          <small>{[friend.region, friend.language].filter(Boolean).join(" · ") || "Informations non renseignées"}</small>
        </div>
        <span className="fr2-card-arrow">›</span>
      </button>
      <button type="button" className="fr2-card-profile" onClick={onOpenProfile}>Voir profil</button>
    </article>
  );
}

function ReceivedRequestCard({ row, working, onOpenProfile, onAccept, onReject, onBlock }: { row: RequestWithProfile; working: boolean; onOpenProfile: () => void; onAccept: () => void; onReject: () => void; onBlock: () => void }) {
  const friend = row.profile;
  const name = friend.display_name || friend.username || "Joueur GameMate";
  return (
    <article className="fr2-card request">
      <div className="fr2-card-main static">
        <Avatar profile={friend} initial={name.slice(0, 1).toUpperCase()} />
        <div className="fr2-card-copy">
          <strong>{name}</strong>
          <span>{friend.username ? `@${friend.username}` : "Profil GameMate"}</span>
          <small>Veut t’ajouter en ami</small>
        </div>
      </div>
      <div className="fr2-request-actions four">
        <button type="button" className="accept" disabled={working} onClick={onAccept}>Accepter</button>
        <button type="button" disabled={working} onClick={onReject}>Refuser</button>
        <button type="button" onClick={onOpenProfile}>Profil</button>
        <button type="button" className="danger" disabled={working} onClick={onBlock}>Bloquer</button>
      </div>
    </article>
  );
}

function SentRequestCard({ row, working, onOpenProfile, onCancel }: { row: RequestWithProfile; working: boolean; onOpenProfile: () => void; onCancel: () => void }) {
  const friend = row.profile;
  const name = friend.display_name || friend.username || "Joueur GameMate";
  return (
    <article className="fr2-card request">
      <div className="fr2-card-main static">
        <Avatar profile={friend} initial={name.slice(0, 1).toUpperCase()} />
        <div className="fr2-card-copy">
          <strong>{name}</strong>
          <span>{friend.username ? `@${friend.username}` : "Profil GameMate"}</span>
          <small>Demande envoyée · En attente</small>
        </div>
      </div>
      <div className="fr2-request-actions">
        <button type="button" disabled={working} onClick={onCancel}>Annuler</button>
        <button type="button" onClick={onOpenProfile}>Profil</button>
      </div>
    </article>
  );
}

function BlockedCard({ row, working, onUnblock }: { row: BlockWithProfile; working: boolean; onUnblock: () => void }) {
  const profile = row.profile;
  const name = profile.display_name || profile.username || "Joueur GameMate";
  return (
    <article className="fr2-card blocked-card">
      <div className="fr2-card-main static">
        <Avatar profile={profile} initial={name.slice(0, 1).toUpperCase()} />
        <div className="fr2-card-copy">
          <strong>{name}</strong>
          <span>{profile.username ? `@${profile.username}` : "Profil GameMate"}</span>
          <small>Utilisateur bloqué</small>
        </div>
      </div>
      <div className="fr2-request-actions">
        <button type="button" disabled={working} onClick={onUnblock}>
          {working ? "Déblocage..." : "Débloquer"}
        </button>
      </div>
    </article>
  );
}

function Avatar({ profile, initial }: { profile: FriendProfile; initial: string }) {
  return (
    <div className="fr2-avatar">
      {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name ?? "Avatar"} /> : initial}
    </div>
  );
}

function FriendPanel({
  row,
  working,
  onOpenProfile,
  onMessage,
  onCall,
  onWatch,
  onInvite,
  onRemove,
  onBlock,
}: {
  row: RequestWithProfile;
  working: boolean;
  onOpenProfile: () => void;
  onMessage: () => void;
  onCall: () => void;
  onWatch: () => void;
  onInvite: () => void;
  onRemove: () => void;
  onBlock: () => void;
}) {
  const friend = row.profile;
  const name = friend.display_name || friend.username || "Joueur GameMate";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <section className="fr2-panel">
      <div className="fr2-panel-glow" />
      <div className="fr2-panel-avatar">
        {friend.avatar_url ? <img src={friend.avatar_url} alt={name} /> : initial}
      </div>

      <span className="fr2-kicker">AMI GAMEMATE</span>
      <h2>{name}</h2>
      <small className="fr2-panel-handle">{friend.username ? `@${friend.username}` : "GameMate"}</small>
      <p>{friend.bio || "Aucune bio renseignée pour ce joueur."}</p>

      <div className="fr2-panel-meta">
        {friend.region && <span>⌖ {friend.region}</span>}
        {friend.language && <span>◇ {friend.language}</span>}
      </div>

      <div className="fr2-action-grid">
        <ActionButton icon="✦" title="Message" description="Ouvrir la messagerie" active onClick={onMessage} />
        <ActionButton icon="◇" title="Inviter" description="Inviter dans une squad" onClick={onInvite} />
        <ActionButton icon="◉" title="Appeler" description="Vocal ou vidéo" onClick={onCall} />
        <ActionButton icon="▣" title="Regarder" description="Demander le partage" onClick={onWatch} />
      </div>

      <button type="button" className="fr2-open-profile" onClick={onOpenProfile}>Ouvrir le profil complet</button>

      <div className="fr2-danger-zone">
        <button type="button" disabled={working} onClick={onRemove}>Retirer de mes amis</button>
        <button type="button" className="danger" disabled={working} onClick={onBlock}>Bloquer</button>
      </div>
    </section>
  );
}

function ActionButton({ icon, title, description, active = false, onClick }: { icon: string; title: string; description: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`fr2-action ${active ? "active" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      <div><strong>{title}</strong><small>{description}</small></div>
    </button>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const content = {
    friends: ["AUCUN AMI", "Ta liste d’amis est vide.", "Ajoute des joueurs depuis leur profil public."],
    received: ["AUCUNE DEMANDE", "Tu n’as aucune demande en attente.", "Les nouvelles demandes apparaîtront ici automatiquement."],
    sent: ["AUCUNE DEMANDE", "Aucune demande envoyée.", "Tes demandes en attente apparaîtront ici."],
    blocked: ["AUCUN BLOCAGE", "Tu n’as bloqué personne.", "Les utilisateurs bloqués seront listés ici."],
  }[tab];

  return (
    <div className="fr2-state">
      <div className="fr2-state-icon">♢</div>
      <span className="fr2-kicker">{content[0]}</span>
      <h2>{content[1]}</h2>
      <p>{content[2]}</p>
    </div>
  );
}

function BlockConfirmModal({ row, working, onCancel, onConfirm }: { row: RequestWithProfile; working: boolean; onCancel: () => void; onConfirm: () => void }) {
  const name = row.profile.display_name || row.profile.username || "ce joueur";
  return (
    <div className="fr2-modal-backdrop" onMouseDown={onCancel}>
      <section className="fr2-modal danger-modal" onMouseDown={(event) => event.stopPropagation()}>
        <span className="fr2-kicker">BLOQUER UN UTILISATEUR</span>
        <h2>Bloquer {name} ?</h2>
        <p>
          Cette personne sera retirée de tes amis, les demandes en cours seront supprimées et aucune nouvelle demande d’ami ne pourra passer tant que le blocage est actif.
        </p>
        <div className="fr2-confirm-actions">
          <button type="button" onClick={onCancel} disabled={working}>Annuler</button>
          <button type="button" className="danger" onClick={onConfirm} disabled={working}>
            {working ? "Blocage..." : "Bloquer"}
          </button>
        </div>
      </section>
    </div>
  );
}

function FutureActionModal({ action, friend, onClose }: { action: Exclude<FutureAction, null>; friend: FriendProfile; onClose: () => void }) {
  const name = friend.display_name || friend.username || "cet ami";
  const content = {
    call: { kicker: "APPEL GAMEMATE", title: `Appeler ${name}`, body: "Le vocal et la vidéo seront branchés plus tard.", choices: ["Appel vocal", "Appel vidéo"] },
    watch: { kicker: "REGARDER LA PARTIE", title: `Demander à regarder ${name}`, body: "Le partage d’écran démarrera uniquement après son accord.", choices: ["Envoyer une demande"] },
  }[action];

  return (
    <div className="fr2-modal-backdrop" onMouseDown={onClose}>
      <section className="fr2-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="fr2-modal-close" onClick={onClose}>×</button>
        <span className="fr2-kicker">{content.kicker}</span>
        <h2>{content.title}</h2>
        <p>{content.body}</p>
        <div className="fr2-modal-preview">
          {content.choices.map((choice) => (
            <button type="button" disabled key={choice}>{choice}<small>Bientôt disponible</small></button>
          ))}
        </div>
      </section>
    </div>
  );
}
