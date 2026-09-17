"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Game = {
  id: number;
  name: string;
  slug: string;
};

type Platform = {
  id: number;
  name: string;
  slug: string;
};

type UserGame = {
  id?: number;
  game_id: number;
  platform_id: number;
  is_primary: boolean;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  crossplay_enabled: boolean;
  mic_enabled: boolean;
};

type EditableSelection = {
  game_id: number;
  platform_id: number | null;
  is_primary: boolean;
  rank_text: string;
  role_text: string;
  mode_text: string;
  crossplay_enabled: boolean;
  mic_enabled: boolean;
};

type Props = {
  games: Game[];
  platforms: Platform[];
  initialSelections: UserGame[];
};

export default function GamesSettingsForm({
  games,
  platforms,
  initialSelections,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [selections, setSelections] = useState<EditableSelection[]>(
    initialSelections.map((item) => ({
      game_id: item.game_id,
      platform_id: item.platform_id,
      is_primary: item.is_primary,
      rank_text: item.rank_text ?? "",
      role_text: item.role_text ?? "",
      mode_text: item.mode_text ?? "",
      crossplay_enabled: item.crossplay_enabled,
      mic_enabled: item.mic_enabled,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedGameIds = useMemo(
    () => new Set(selections.map((item) => item.game_id)),
    [selections]
  );

  function toggleGame(gameId: number) {
    setMessage("");
    setError("");

    const exists = selections.some(
      (item) => item.game_id === gameId
    );

    if (exists) {
      const next = selections.filter(
        (item) => item.game_id !== gameId
      );

      if (
        selections.find(
          (item) => item.game_id === gameId
        )?.is_primary &&
        next.length > 0
      ) {
        next[0] = {
          ...next[0],
          is_primary: true,
        };
      }

      setSelections(next);
      return;
    }

    setSelections((current) => [
      ...current,
      {
        game_id: gameId,
        platform_id: platforms[0]?.id ?? null,
        is_primary: current.length === 0,
        rank_text: "",
        role_text: "",
        mode_text: "",
        crossplay_enabled: true,
        mic_enabled: true,
      },
    ]);
  }

  function updateSelection(
    gameId: number,
    patch: Partial<EditableSelection>
  ) {
    setSelections((current) =>
      current.map((item) =>
        item.game_id === gameId
          ? { ...item, ...patch }
          : item
      )
    );
  }

  function setPrimary(gameId: number) {
    setSelections((current) =>
      current.map((item) => ({
        ...item,
        is_primary:
          item.game_id === gameId
            ? !item.is_primary
            : false,
      }))
    );
  }

  async function saveGames() {
    setSaving(true);
    setMessage("");
    setError("");

    if (selections.length === 0) {
      setError(
        "Sélectionne au moins un jeu."
      );
      setSaving(false);
      return;
    }

    const missingPlatform = selections.some(
      (item) => !item.platform_id
    );

    if (missingPlatform) {
      setError(
        "Choisis une plateforme pour chaque jeu."
      );
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expirée.");
      setSaving(false);
      return;
    }

    const { error: deleteError } =
      await supabase
        .from("user_games")
        .delete()
        .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const hasPrimary = selections.some(
      (item) => item.is_primary
    );

    const rows = selections.map(
      (item, index) => ({
        user_id: user.id,
        game_id: item.game_id,
        platform_id: item.platform_id as number,
        is_primary:
          hasPrimary
            ? item.is_primary
            : index === 0,
        rank_text:
          item.rank_text.trim() || null,
        role_text:
          item.role_text.trim() || null,
        mode_text:
          item.mode_text.trim() || null,
        crossplay_enabled:
          item.crossplay_enabled,
        mic_enabled:
          item.mic_enabled,
        updated_at: new Date().toISOString(),
      })
    );

    const { error: insertError } =
      await supabase
        .from("user_games")
        .insert(rows);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setMessage(
      "Tes jeux ont bien été mis à jour."
    );

    router.refresh();

    setSaving(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">

      {/* CONTENU */}
      <section className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8">

        <div>
          <h2 className="text-xl font-bold">
            Sélectionne tes jeux
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Clique sur un jeu pour l&apos;ajouter ou le retirer.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => {
            const selected =
              selectedGameIds.has(game.id);

            return (
              <button
                key={game.id}
                type="button"
                onClick={() =>
                  toggleGame(game.id)
                }
                className={`rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-white/10 bg-[#070B16] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/30 to-cyan-500/20 font-bold text-violet-200">
                    {game.name
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      selected
                        ? "border-violet-400 bg-violet-500 text-xs"
                        : "border-white/20"
                    }`}
                  >
                    {selected ? "✓" : ""}
                  </div>
                </div>

                <p className="mt-4 font-semibold">
                  {game.name}
                </p>
              </button>
            );
          })}
        </div>

        {selections.length > 0 && (
          <div className="mt-10 space-y-5">
            <div>
              <h2 className="text-xl font-bold">
                Configuration
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Configure chaque jeu séparément.
              </p>
            </div>

            {selections.map((selection) => {
              const game = games.find(
                (item) =>
                  item.id === selection.game_id
              );

              if (!game) {
                return null;
              }

              return (
                <div
                  key={selection.game_id}
                  className="rounded-2xl border border-white/10 bg-[#070B16] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold">
                        {game.name}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        Paramètres de jeu
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setPrimary(
                          selection.game_id
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selection.is_primary
                          ? "border-violet-400/40 bg-violet-500/15 text-violet-300"
                          : "border-white/10 bg-white/[0.03] text-slate-500"
                      }`}
                    >
                      {selection.is_primary
                        ? "★ Jeu principal"
                        : "☆ Définir principal"}
                    </button>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">

                    {/* PLATFORM */}
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Plateforme
                      </label>

                      <select
                        value={
                          selection.platform_id ??
                          ""
                        }
                        onChange={(event) =>
                          updateSelection(
                            selection.game_id,
                            {
                              platform_id:
                                Number(
                                  event.target
                                    .value
                                ),
                            }
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0A0F1D] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/50"
                      >
                        {platforms.map(
                          (platform) => (
                            <option
                              key={platform.id}
                              value={platform.id}
                            >
                              {platform.name}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* RANK */}
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Rang
                      </label>

                      <input
                        value={
                          selection.rank_text
                        }
                        onChange={(event) =>
                          updateSelection(
                            selection.game_id,
                            {
                              rank_text:
                                event.target
                                  .value,
                            }
                          )
                        }
                        placeholder="Ex : Gold II"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0A0F1D] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-violet-500/50"
                      />
                    </div>

                    {/* ROLE */}
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Rôle
                      </label>

                      <input
                        value={
                          selection.role_text
                        }
                        onChange={(event) =>
                          updateSelection(
                            selection.game_id,
                            {
                              role_text:
                                event.target
                                  .value,
                            }
                          )
                        }
                        placeholder="Ex : Support"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0A0F1D] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-violet-500/50"
                      />
                    </div>

                    {/* MODE */}
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Mode favori
                      </label>

                      <input
                        value={
                          selection.mode_text
                        }
                        onChange={(event) =>
                          updateSelection(
                            selection.game_id,
                            {
                              mode_text:
                                event.target
                                  .value,
                            }
                          )
                        }
                        placeholder="Ex : Ranked"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0A0F1D] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-violet-500/50"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelection(
                          selection.game_id,
                          {
                            mic_enabled:
                              !selection.mic_enabled,
                          }
                        )
                      }
                      className={`rounded-xl border px-4 py-2 text-xs font-medium transition ${
                        selection.mic_enabled
                          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                          : "border-white/10 bg-white/[0.03] text-slate-500"
                      }`}
                    >
                      🎙 Micro{" "}
                      {selection.mic_enabled
                        ? "activé"
                        : "désactivé"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSelection(
                          selection.game_id,
                          {
                            crossplay_enabled:
                              !selection.crossplay_enabled,
                          }
                        )
                      }
                      className={`rounded-xl border px-4 py-2 text-xs font-medium transition ${
                        selection.crossplay_enabled
                          ? "border-violet-400/30 bg-violet-500/10 text-violet-300"
                          : "border-white/10 bg-white/[0.03] text-slate-500"
                      }`}
                    >
                      Crossplay{" "}
                      {selection.crossplay_enabled
                        ? "✓"
                        : "×"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
            ✓ {message}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-white/10 pt-6">
          <button
            type="button"
            onClick={saveGames}
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Enregistrement..."
              : "Enregistrer les modifications"}
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/dashboard")
            }
            className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-slate-300"
          >
            Annuler
          </button>
        </div>
      </section>

      {/* RESUME */}
      <aside className="space-y-5">
        <div className="sticky top-6 rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            Résumé
          </p>

          <p className="mt-3 text-3xl font-bold">
            {selections.length}
          </p>

          <p className="text-sm text-slate-500">
            jeu
            {selections.length > 1
              ? "x"
              : ""}{" "}
            sélectionné
            {selections.length > 1
              ? "s"
              : ""}
          </p>

          <div className="mt-6 space-y-3">
            {selections.map((selection) => {
              const game = games.find(
                (item) =>
                  item.id ===
                  selection.game_id
              );

              const platform =
                platforms.find(
                  (item) =>
                    item.id ===
                    selection.platform_id
                );

              return (
                <div
                  key={selection.game_id}
                  className="rounded-xl border border-white/10 bg-[#070B16] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">
                      {game?.name}
                    </p>

                    {selection.is_primary && (
                      <span className="text-xs text-violet-400">
                        ★
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {platform?.name ??
                      "Plateforme"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs leading-relaxed text-slate-500">
              Ces paramètres seront utilisés pour
              le matching dans l&apos;application
              GameMate.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}