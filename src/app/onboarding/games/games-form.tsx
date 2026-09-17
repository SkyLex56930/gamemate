"use client";
import OnboardingHeader from "@/components/onboarding/onboarding-header";
import { useState } from "react";
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

type Selection = {
  gameId: number;
  platformId: number | null;
  rank: string;
  role: string;
  mode: string;
  mic: boolean;
  crossplay: boolean;
};

type Props = {
  games: Game[];
  platforms: Platform[];
};

export default function GamesForm({
  games,
  platforms,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [selections, setSelections] = useState<Selection[]>([]);
  const [primaryGameId, setPrimaryGameId] =
    useState<number | null>(null);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleGame(gameId: number) {
    const exists = selections.some(
      (selection) => selection.gameId === gameId
    );

    if (exists) {
      setSelections((current) =>
        current.filter(
          (selection) => selection.gameId !== gameId
        )
      );

      if (primaryGameId === gameId) {
        setPrimaryGameId(null);
      }

      return;
    }

    setSelections((current) => [
      ...current,
      {
        gameId,
        platformId: null,
        rank: "",
        role: "",
        mode: "",
        mic: true,
        crossplay: true,
      },
    ]);
  }

  function updateSelection(
    gameId: number,
    changes: Partial<Selection>
  ) {
    setSelections((current) =>
      current.map((selection) =>
        selection.gameId === gameId
          ? { ...selection, ...changes }
          : selection
      )
    );
  }

  async function handleSave() {
    setMessage("");

    if (selections.length === 0) {
      setMessage("Choisis au moins un jeu.");
      return;
    }

    if (
      selections.some(
        (selection) => !selection.platformId
      )
    ) {
      setMessage(
        "Choisis une plateforme pour chaque jeu."
      );
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Session invalide.");
      setLoading(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("user_games")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      setMessage(`Erreur : ${deleteError.message}`);
      setLoading(false);
      return;
    }

    const rows = selections.map((selection, index) => ({
      user_id: user.id,
      game_id: selection.gameId,
      platform_id: selection.platformId!,
      rank_text: selection.rank || null,
      role_text: selection.role || null,
      mode_text: selection.mode || null,
      mic_enabled: selection.mic,
      crossplay_enabled: selection.crossplay,
      is_primary:
        primaryGameId === selection.gameId ||
        (primaryGameId === null && index === 0),
    }));

    const { error: insertError } = await supabase
      .from("user_games")
      .insert(rows);

    if (insertError) {
      setMessage(`Erreur : ${insertError.message}`);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        onboarding_step: 3,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      setMessage(`Erreur : ${profileError.message}`);
      setLoading(false);
      return;
    }

    router.push("/onboarding/gaming-dna");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070A12] px-6 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-cyan-500/5 blur-[100px]" />

      <div className="relative mx-auto max-w-6xl">
        <OnboardingHeader
  step={2}
  title="Tes jeux."
  highlightedTitle="Ton terrain de jeu."
  description="Ajoute les jeux auxquels tu joues et donne-nous quelques détails pour trouver des mates plus compatibles."
/>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
          <div>
            <p className="text-sm font-medium">
              {selections.length} jeu
              {selections.length > 1 ? "x" : ""} sélectionné
              {selections.length > 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tu pourras modifier tout ça plus tard.
            </p>
          </div>

          <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300">
            Sélection personnalisée
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {games.map((game) => {
            const selected = selections.find(
              (selection) => selection.gameId === game.id
            );

            const isPrimary = primaryGameId === game.id;

            return (
              <div
                key={game.id}
                className={`group overflow-hidden rounded-3xl border transition-all duration-300 ${
                  selected
                    ? "border-violet-500/60 bg-gradient-to-br from-violet-500/10 via-slate-900 to-slate-950 shadow-[0_0_40px_rgba(124,58,237,0.12)]"
                    : "border-white/10 bg-slate-900/70 hover:-translate-y-1 hover:border-white/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleGame(game.id)}
                  className="flex w-full items-center justify-between gap-5 p-6 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-bold ${
                        selected
                          ? "border-violet-400/30 bg-violet-500/15 text-violet-300"
                          : "border-white/10 bg-white/5 text-slate-300"
                      }`}
                    >
                      {game.name.slice(0, 2).toUpperCase()}
                    </div>

                    <div>
                      <h2 className="text-lg font-semibold">
                        {game.name}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        {selected
                          ? "Configuré dans ton profil"
                          : "Ajouter à mes jeux"}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                      selected
                        ? "border-violet-400 bg-violet-500 text-white"
                        : "border-white/15 bg-white/5 text-slate-500"
                    }`}
                  >
                    {selected ? "✓" : "+"}
                  </div>
                </button>

                {selected && (
                  <div className="border-t border-white/10 bg-black/10 p-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Plateforme
                        </label>

                        <select
                          value={selected.platformId ?? ""}
                          onChange={(e) =>
                            updateSelection(game.id, {
                              platformId: Number(e.target.value),
                            })
                          }
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-violet-500"
                        >
                          <option value="">
                            Choisir une plateforme
                          </option>

                          {platforms.map((platform) => (
                            <option
                              key={platform.id}
                              value={platform.id}
                            >
                              {platform.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <input
                        placeholder="Rank"
                        value={selected.rank}
                        onChange={(e) =>
                          updateSelection(game.id, {
                            rank: e.target.value,
                          })
                        }
                        className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-violet-500"
                      />

                      <input
                        placeholder="Rôle"
                        value={selected.role}
                        onChange={(e) =>
                          updateSelection(game.id, {
                            role: e.target.value,
                          })
                        }
                        className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-violet-500"
                      />

                      <input
                        placeholder="Mode préféré"
                        value={selected.mode}
                        onChange={(e) =>
                          updateSelection(game.id, {
                            mode: e.target.value,
                          })
                        }
                        className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-violet-500 sm:col-span-2"
                      />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          updateSelection(game.id, {
                            mic: !selected.mic,
                          })
                        }
                        className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                          selected.mic
                            ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                            : "border-white/10 bg-white/5 text-slate-400"
                        }`}
                      >
                        {selected.mic ? "✓ Micro" : "Micro désactivé"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateSelection(game.id, {
                            crossplay: !selected.crossplay,
                          })
                        }
                        className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                          selected.crossplay
                            ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                            : "border-white/10 bg-white/5 text-slate-400"
                        }`}
                      >
                        {selected.crossplay
                          ? "✓ Crossplay"
                          : "Crossplay désactivé"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPrimaryGameId(
                            isPrimary ? null : game.id
                          )
                        }
                        className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                          isPrimary
                            ? "border-violet-400/40 bg-violet-500/15 text-violet-300"
                            : "border-white/10 bg-white/5 text-slate-400"
                        }`}
                      >
                        {isPrimary
                          ? "★ Jeu principal"
                          : "Définir comme principal"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {message && (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 text-sm text-amber-200">
            {message}
          </div>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-8">
          <button
            type="button"
            onClick={() => router.push("/onboarding")}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
          >
            ← Retour
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-8 py-3 font-semibold shadow-lg shadow-violet-900/30 transition hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Continuer →"}
          </button>
        </div>
      </div>
    </main>
  );
}