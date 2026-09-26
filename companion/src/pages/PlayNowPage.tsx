import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Icon, type IconName } from "../components/Icon";
import "./PlayNowPage.css";

type UserGame = {
  game_id: string;
  platform_id: string | null;
  is_primary: boolean;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean;
  crossplay_enabled: boolean;
  gameName: string;
  platformName: string | null;
};

type LookingForOption = { id: string; label: string; slug: string };

type PlayNowProps = {
  session: Session | null;
  userGames: UserGame[];
  lookingFor: LookingForOption[];
  profileCompletion?: number;
  onLogin: () => void;
  onOpenProfile?: (userId: string) => void;
  onOpenSettings?: () => void;
};

type SearchMode = "fast" | "balanced" | "precise";
type SearchStatus = "idle" | "searching" | "results" | "error";

type MateResult = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: string | null;
  language: string | null;
  game_id: string | number | null;
  game_name: string | null;
  platform_name: string | null;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean | null;
  crossplay_enabled: boolean | null;
  is_primary: boolean | null;
};

const searchModes: Array<{ id: SearchMode; title: string; time: string; description: string }> = [
  { id: "fast", title: "Rapide", time: "Plus de profils", description: "Peu de filtres pour trouver quelqu'un rapidement." },
  { id: "balanced", title: "Équilibré", time: "Recommandé", description: "Priorise rang, rôle, mode et micro sans bloquer la recherche." },
  { id: "precise", title: "Précis", time: "Plus ciblé", description: "Garde les profils proches de ton rang et de ton rôle." },
];

export default function PlayNowPage({
  session,
  userGames,
  lookingFor,
  profileCompletion = 0,
  onLogin,
  onOpenProfile,
  onOpenSettings,
}: PlayNowProps) {
  const primaryGame = useMemo(
    () => userGames.find((game) => game.is_primary) ?? userGames[0] ?? null,
    [userGames]
  );
  const [selectedGameId, setSelectedGameId] = useState(primaryGame?.game_id ?? "");
  const selectedGame = userGames.find((game) => game.game_id === selectedGameId) ?? primaryGame ?? null;
  const defaultIntent = lookingFor.find((option) => option.slug === "play-now") ?? lookingFor[0] ?? null;
  const [intentId, setIntentId] = useState(defaultIntent?.id ?? "");
  const [micRequired, setMicRequired] = useState(selectedGame?.mic_enabled ?? true);
  const [crossplay, setCrossplay] = useState(selectedGame?.crossplay_enabled ?? true);
  const [partySize, setPartySize] = useState(2);
  const [searchMode, setSearchMode] = useState<SearchMode>("balanced");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<MateResult[]>([]);
  const [error, setError] = useState("");

  const selectedIntent = lookingFor.find((option) => option.id === intentId) ?? defaultIntent;

  useEffect(() => {
    if (!selectedGameId && primaryGame?.game_id) setSelectedGameId(primaryGame.game_id);
  }, [primaryGame?.game_id, selectedGameId]);

  function changeGame(gameId: string) {
    setSelectedGameId(gameId);
    const game = userGames.find((item) => item.game_id === gameId);
    if (game) {
      setMicRequired(game.mic_enabled);
      setCrossplay(game.crossplay_enabled);
    }
    setStatus("idle");
    setResults([]);
    setError("");
  }

  async function startSearch() {
    if (!session) {
      onLogin();
      return;
    }
    if (!selectedGame) {
      setError("Ajoute au moins un jeu à ton profil avant de lancer une recherche.");
      setStatus("error");
      return;
    }

    setError("");
    setResults([]);
    setStatus("searching");
    const gameId = Number(selectedGame.game_id);
    if (!Number.isFinite(gameId)) {
      setError("Le jeu sélectionné possède un identifiant invalide.");
      setStatus("error");
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("find_mates_profiles", {
      p_game_id: gameId,
      p_allow_crossplay: crossplay,
    });

    if (rpcError) {
      console.error("Play Now / find_mates_profiles:", rpcError);
      setError("Impossible de lancer la recherche pour le moment.");
      setStatus("error");
      return;
    }

    let candidates = (data ?? []) as MateResult[];
    if (micRequired) candidates = candidates.filter((candidate) => candidate.mic_enabled);
    if (!crossplay && selectedGame.platformName) {
      candidates = candidates.filter((candidate) => candidate.platform_name === selectedGame.platformName);
    }
    if (searchMode === "precise") {
      candidates = candidates.filter((candidate) => {
        const sameRank = !selectedGame.rank_text || !candidate.rank_text || candidate.rank_text === selectedGame.rank_text;
        const sameRole = !selectedGame.role_text || !candidate.role_text || candidate.role_text === selectedGame.role_text;
        return sameRank && sameRole;
      });
    }
    if (searchMode === "balanced") {
      candidates = [...candidates].sort((a, b) => matchSignals(b, selectedGame, micRequired) - matchSignals(a, selectedGame, micRequired));
    }

    setResults(candidates.slice(0, Math.max(1, partySize - 1) * 6));
    setStatus("results");
  }

  function resetSearch() {
    setStatus("idle");
    setResults([]);
    setError("");
  }

  if (!session) {
    return (
      <section className="pnx-locked">
        <span><Icon name="play" size={28} /></span><div><small>PLAY NOW</small><h1>Lance ta prochaine session.</h1>
          <p>Connecte-toi pour préparer une recherche avec tes vrais jeux et préférences.</p>
          <button type="button" onClick={onLogin}>Se connecter</button></div>
      </section>
    );
  }

  if (status === "searching") {
    return <SearchingView game={selectedGame} intent={selectedIntent?.label ?? null} onCancel={resetSearch} />;
  }

  if (status === "results") {
    return <ResultsView game={selectedGame} results={results} onRetry={() => void startSearch()}
      onEdit={resetSearch} onOpenProfile={onOpenProfile} />;
  }

  return (
    <div className="pnx">
      <header className="pnx-header">
        <div><span className="pnx-eyebrow">PLAY NOW</span><h1>Configure. Lance. <em>Joue.</em></h1>
          <p>Une recherche guidée en trois étapes, avec seulement les réglages qui comptent.</p></div>
        <div className="pnx-steps"><span className="active"><b>1</b>Jeu</span><i /><span className="active"><b>2</b>Session</span><i /><span><b>3</b>Résultats</span></div>
      </header>

      {profileCompletion < 70 && (
        <button type="button" className="pnx-profile-tip" onClick={onOpenSettings}>
          <span><Icon name="sparkles" /></span><span><strong>Ton profil est complété à {profileCompletion}%</strong>
            <small>Ajoute ton rang, ton rôle et ton Gaming DNA pour des recherches plus précises.</small></span><b>Compléter <Icon name="arrow-right" size={14} /></b>
        </button>
      )}

      <section className="pnx-section pnx-game-section">
        <header><div><span className="pnx-number">01</span><div><small>CHOISIS TON JEU</small><h2>À quoi veux-tu jouer ?</h2></div></div>
          {selectedGame && <span className="pnx-selected-label">Sélectionné · {selectedGame.platformName ?? "Plateforme inconnue"}</span>}</header>
        <div className="pnx-games">
          {userGames.map((game, index) => (
            <button type="button" key={`${game.game_id}-${game.platform_id ?? "none"}`}
              className={game.game_id === selectedGame?.game_id ? "active" : ""} onClick={() => changeGame(game.game_id)}>
              <span className={`pnx-game-cover tone-${index % 4}`}><b>{game.gameName.slice(0, 2).toUpperCase()}</b>{game.is_primary && <i>PRINCIPAL</i>}</span>
              <span><strong>{game.gameName}</strong><small>{game.platformName ?? "Plateforme inconnue"}</small></span>
              <em>{game.game_id === selectedGame?.game_id ? <Icon name="check" size={15} /> : null}</em>
            </button>
          ))}
          {userGames.length === 0 && <button className="pnx-add-game" type="button" onClick={onOpenSettings}><Icon name="plus" /><span><strong>Ajouter un jeu</strong><small>Configure ton profil</small></span></button>}
        </div>
      </section>

      <div className="pnx-config-grid">
        <section className="pnx-section">
          <header><div><span className="pnx-number">02</span><div><small>TYPE DE SESSION</small><h2>Quelle ambiance ?</h2></div></div></header>
          <div className="pnx-intents">
            {lookingFor.map((option) => <button type="button" key={option.id} className={intentId === option.id ? "active" : ""}
              onClick={() => setIntentId(option.id)}><span><Icon name={intentIcon(option.slug)} /></span>{option.label}</button>)}
            {lookingFor.length === 0 && <p className="pnx-inline-empty">Ajoute ce que tu recherches depuis ton profil.</p>}
          </div>
          <div className="pnx-party-size"><span><strong>Taille du groupe</strong><small>Nombre total de joueurs souhaité</small></span>
            <div>{[2,3,4,5].map((size) => <button key={size} type="button" className={partySize === size ? "active" : ""} onClick={() => setPartySize(size)}>{size}</button>)}</div></div>
        </section>

        <section className="pnx-section">
          <header><div><span className="pnx-number">03</span><div><small>PRÉCISION</small><h2>Comment chercher ?</h2></div></div></header>
          <div className="pnx-modes">
            {searchModes.map((mode) => <button type="button" key={mode.id} className={searchMode === mode.id ? "active" : ""} onClick={() => setSearchMode(mode.id)}>
              <span><strong>{mode.title}</strong><small>{mode.time}</small></span><p>{mode.description}</p><i>{searchMode === mode.id ? <Icon name="check" size={15} /> : null}</i></button>)}
          </div>
        </section>
      </div>

      <section className="pnx-launch-card">
        <div className="pnx-launch-summary">
          <span className="pnx-launch-art">{selectedGame?.gameName.slice(0,2).toUpperCase() ?? "GM"}</span>
          <div><small>TA RECHERCHE</small><strong>{selectedGame?.gameName ?? "Aucun jeu"} · {partySize} joueurs</strong>
            <span>{selectedIntent?.label ?? "Session libre"} · {searchModeLabel(searchMode)}</span></div>
        </div>
        <div className="pnx-options">
          <Toggle label="Micro requis" checked={micRequired} onChange={setMicRequired} />
          <Toggle label="Crossplay" checked={crossplay} onChange={setCrossplay} />
        </div>
        <button className="pnx-launch-button" type="button" disabled={!selectedGame} onClick={() => void startSearch()}><span><Icon name="play" /></span><span><strong>Lancer la recherche</strong><small>Profils GameMate réels</small></span><Icon name="arrow-right" /></button>
      </section>
      {status === "error" && error && <div className="pnx-error">{error}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className={`pnx-toggle ${checked ? "active" : ""}`} onClick={() => onChange(!checked)}><span>{label}</span><i><b /></i></button>;
}

function SearchingView({ game, intent, onCancel }: { game: UserGame | null; intent: string | null; onCancel: () => void }) {
  return <section className="pnx-searching"><div className="pnx-search-orbit"><span /><i /><img src="/gamemate-logo.png" alt="" /></div>
    <small>RECHERCHE EN COURS</small><h1>{game?.gameName ?? "GameMate"}</h1><p>{intent ? `${intent} · ` : ""}Recherche de profils compatibles.</p>
    <div className="pnx-search-pills"><span>Profils réels</span><span>Filtres actifs</span><span>Matching sécurisé</span></div>
    <button type="button" onClick={onCancel}>Annuler la recherche</button></section>;
}

function ResultsView({ game, results, onRetry, onEdit, onOpenProfile }: {
  game: UserGame | null; results: MateResult[]; onRetry: () => void; onEdit: () => void; onOpenProfile?: (userId: string) => void;
}) {
  return <div className="pnx pnx-result-page"><header className="pnx-result-head"><div><span className="pnx-eyebrow">PLAY NOW · RÉSULTATS</span>
    <h1>{results.length ? `${results.length} mate${results.length > 1 ? "s" : ""} à découvrir` : "Aucun mate pour le moment"}</h1>
    <p>{game?.gameName ?? "Recherche GameMate"}</p></div><div><button type="button" onClick={onEdit}>Modifier</button><button type="button" className="primary" onClick={onRetry}>Relancer</button></div></header>
    {results.length === 0 ? <section className="pnx-no-results"><span><Icon name="search" size={28} /></span><h2>Élargis légèrement la recherche.</h2><p>Passe en mode Rapide ou active le crossplay pour afficher davantage de profils.</p><button type="button" onClick={onEdit}>Modifier les paramètres</button></section> :
      <div className="pnx-result-grid">{results.map((mate) => { const name = mate.display_name || mate.username || "Joueur GameMate"; const reasons = buildReasons(mate, game);
        return <article key={mate.user_id}><div className="pnx-result-top"><span className="pnx-result-avatar">{mate.avatar_url ? <img src={mate.avatar_url} alt={name} /> : name.slice(0,1).toUpperCase()}</span>
          <div><strong>{name}</strong><small>{[mate.platform_name,mate.rank_text].filter(Boolean).join(" · ") || "Profil GameMate"}</small></div></div>
          <p>{mate.bio || "Aucune présentation pour le moment."}</p><div className="pnx-result-reasons">{reasons.map((reason) => <span key={reason}><Icon name="check" size={12} /> {reason}</span>)}</div>
          {onOpenProfile && <button type="button" onClick={() => onOpenProfile(mate.user_id)}>Voir le profil <Icon name="arrow-right" size={14} /></button>}</article>; })}</div>}
  </div>;
}

function matchSignals(candidate: MateResult, game: UserGame, micRequired: boolean) {
  let value = 0;
  if (game.rank_text && candidate.rank_text === game.rank_text) value += 2;
  if (game.role_text && candidate.role_text === game.role_text) value += 2;
  if (game.mode_text && candidate.mode_text === game.mode_text) value += 1;
  if (candidate.mic_enabled === micRequired) value += 1;
  return value;
}

function buildReasons(candidate: MateResult, game: UserGame | null) {
  return [game?.platformName && candidate.platform_name === game.platformName ? "Même plateforme" : null,
    game?.rank_text && candidate.rank_text === game.rank_text ? "Même rang" : null,
    game?.role_text && candidate.role_text === game.role_text ? "Même rôle" : null,
    candidate.mic_enabled ? "Micro" : null].filter(Boolean) as string[];
}

function intentIcon(slug: string): IconName {
  if (slug.includes("rank") || slug.includes("compet")) return "trophy";
  if (slug.includes("friend")) return "user-plus";
  if (slug.includes("team") || slug.includes("squad")) return "users";
  return "play";
}

function searchModeLabel(mode: SearchMode) {
  return mode === "fast" ? "Rapide" : mode === "precise" ? "Précis" : "Équilibré";
}
