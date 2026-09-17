"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OnboardingHeader from "@/components/onboarding/onboarding-header";

type Profile = {
  username: string;
  displayName: string;
  bio: string;
  region: string;
  dateOfBirth: string;
};

type GameRow = {
  game_id: number;
  platform_id: number;
  is_primary: boolean;
  rank_text: string | null;
  role_text: string | null;
  mode_text: string | null;
  mic_enabled: boolean;
  crossplay_enabled: boolean;
  games:
    | { name: string }
    | { name: string }[]
    | null;
  platforms:
    | { name: string }
    | { name: string }[]
    | null;
};

type DnaRow = {
  tag_id: number;
  gaming_dna_tags:
    | { label: string }
    | { label: string }[]
    | null;
};

type AvailabilityRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

type LookingForRow = {
  option_id: number;
  looking_for_options:
    | { label: string }
    | { label: string }[]
    | null;
};

type Props = {
  profile: Profile;
  games: GameRow[];
  dna: DnaRow[];
  availability: AvailabilityRow[];
  lookingFor: LookingForRow[];
};

const dayLabels: Record<number, string> = {
  0: "Dimanche",
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

function getName(
  value:
    | { name: string }
    | { name: string }[]
    | null
) {
  if (!value) return "—";
  return Array.isArray(value)
    ? value[0]?.name ?? "—"
    : value.name;
}

function getLabel(
  value:
    | { label: string }
    | { label: string }[]
    | null
) {
  if (!value) return "—";
  return Array.isArray(value)
    ? value[0]?.label ?? "—"
    : value.label;
}

export default function SummaryForm({
  profile,
  games,
  dna,
  availability,
  lookingFor,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function finishOnboarding() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Session invalide.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        is_onboarding_complete: true,
        onboarding_step: 6,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      setMessage(`Erreur : ${error.message}`);
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070A12] px-6 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-cyan-500/5 blur-[110px]" />

      <div className="relative mx-auto max-w-6xl">
        <OnboardingHeader
          step={6}
          title="Ton profil est"
          highlightedTitle="presque prêt."
          description="Vérifie une dernière fois tes informations avant d’entrer dans GameMate."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              Profil
            </p>

            <div className="mt-5">
              <h2 className="text-2xl font-bold">
                {profile.displayName || profile.username}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                @{profile.username}
              </p>

              <div className="mt-5 space-y-3 text-sm">
                <p>
                  <span className="text-slate-500">Région :</span>{" "}
                  {profile.region || "Non renseignée"}
                </p>

                <p>
                  <span className="text-slate-500">
                    Date de naissance :
                  </span>{" "}
                  {profile.dateOfBirth || "Non renseignée"}
                </p>

                <p className="leading-relaxed text-slate-300">
                  {profile.bio || "Aucune bio pour le moment."}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              Ce que tu recherches
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {lookingFor.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aucune préférence.
                </p>
              ) : (
                lookingFor.map((item) => (
                  <span
                    key={item.option_id}
                    className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-300"
                  >
                    {getLabel(item.looking_for_options)}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                  Jeux & plateformes
                </p>

                <h2 className="mt-2 text-xl font-semibold">
                  Tes jeux
                </h2>
              </div>

              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-400">
                {games.length} jeu{games.length > 1 ? "x" : ""}
              </span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {games.map((item) => (
                <div
                  key={`${item.game_id}-${item.platform_id}`}
                  className="rounded-2xl border border-white/10 bg-slate-950 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">
                        {getName(item.games)}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {getName(item.platforms)}
                      </p>
                    </div>

                    {item.is_primary && (
                      <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
                        ★ Principal
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {item.rank_text && (
                      <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">
                        Rank : {item.rank_text}
                      </span>
                    )}

                    {item.role_text && (
                      <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">
                        Rôle : {item.role_text}
                      </span>
                    )}

                    {item.mode_text && (
                      <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">
                        Mode : {item.mode_text}
                      </span>
                    )}

                    <span className="rounded-full bg-cyan-400/5 px-3 py-1 text-cyan-300">
                      {item.mic_enabled ? "Micro" : "Sans micro"}
                    </span>

                    <span className="rounded-full bg-cyan-400/5 px-3 py-1 text-cyan-300">
                      {item.crossplay_enabled
                        ? "Crossplay"
                        : "Sans crossplay"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              Gaming DNA
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {dna.map((item) => (
                <span
                  key={item.tag_id}
                  className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-300"
                >
                  {getLabel(item.gaming_dna_tags)}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              Disponibilités
            </p>

            <div className="mt-5 space-y-3">
              {availability.map((item) => (
                <div
                  key={`${item.day_of_week}-${item.start_time}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950 px-4 py-3"
                >
                  <span className="text-sm font-medium">
                    {dayLabels[item.day_of_week]}
                  </span>

                  <span className="text-sm text-slate-400">
                    {item.start_time.slice(0, 5)} →{" "}
                    {item.end_time.slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {message && (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 text-sm text-amber-200">
            {message}
          </div>
        )}

        <div className="mt-10 rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-slate-900/80 to-cyan-500/5 p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">
            Tout est prêt
          </p>

          <h2 className="mt-3 text-3xl font-bold">
            Bienvenue dans GameMate.
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Ton profil est configuré. Tu pourras modifier toutes ces
            informations plus tard dans tes paramètres.
          </p>

          <button
            type="button"
            onClick={finishOnboarding}
            disabled={loading}
            className="mt-7 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 px-9 py-4 font-semibold shadow-[0_0_40px_rgba(124,58,237,0.25)] transition hover:scale-[1.02] disabled:opacity-50"
          >
            {loading
              ? "Préparation de GameMate..."
              : "Entrer dans GameMate →"}
          </button>
        </div>

        <div className="mt-8 flex justify-start border-t border-white/10 pt-8">
          <button
            type="button"
            onClick={() =>
              router.push("/onboarding/looking-for")
            }
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
          >
            ← Retour
          </button>
        </div>
      </div>
    </main>
  );
}