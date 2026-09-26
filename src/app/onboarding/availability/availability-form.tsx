"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OnboardingHeader from "@/components/onboarding/onboarding-header";

type AvailabilityRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

type Props = {
  initialAvailability: AvailabilityRow[];
};

const days = [
  { id: 1, label: "Lundi", short: "Lun" },
  { id: 2, label: "Mardi", short: "Mar" },
  { id: 3, label: "Mercredi", short: "Mer" },
  { id: 4, label: "Jeudi", short: "Jeu" },
  { id: 5, label: "Vendredi", short: "Ven" },
  { id: 6, label: "Samedi", short: "Sam" },
  { id: 0, label: "Dimanche", short: "Dim" },
];

export default function AvailabilityForm({
  initialAvailability,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [selectedDays, setSelectedDays] = useState<number[]>(
    initialAvailability.map((item) => item.day_of_week)
  );

  const [startTime, setStartTime] = useState(
    initialAvailability[0]?.start_time?.slice(0, 5) ?? "18:00"
  );

  const [endTime, setEndTime] = useState(
    initialAvailability[0]?.end_time?.slice(0, 5) ?? "22:00"
  );

  const [timezone] = useState(
    initialAvailability[0]?.timezone ?? "Europe/Paris"
  );

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    );
  }

  async function handleSave() {
    setMessage("");

    if (selectedDays.length === 0) {
      setMessage("Choisis au moins un jour.");
      return;
    }

    if (startTime >= endTime) {
      setMessage(
        "L'heure de fin doit être après l'heure de début."
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
      .from("user_availability")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      setMessage(`Erreur : ${deleteError.message}`);
      setLoading(false);
      return;
    }

    const rows = selectedDays.map((day) => ({
      user_id: user.id,
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
      timezone,
    }));

    const { error: insertError } = await supabase
      .from("user_availability")
      .insert(rows);

    if (insertError) {
      setMessage(`Erreur : ${insertError.message}`);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        onboarding_step: 5,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      setMessage(`Erreur : ${profileError.message}`);
      setLoading(false);
      return;
    }

    router.push("/onboarding/looking-for");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070A12] px-6 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-cyan-500/5 blur-[100px]" />

      <div className="relative mx-auto max-w-6xl">
        <OnboardingHeader
          step={4}
          title="Quand est-ce que"
          highlightedTitle="tu joues ?"
          description="Indique tes créneaux habituels. GameMate pourra te proposer des mates disponibles au bon moment."
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-7 backdrop-blur">
            <div>
              <h2 className="text-xl font-semibold">
                Tes jours habituels
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Tu pourras modifier tes disponibilités plus tard.
              </p>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {days.map((day) => {
                const selected = selectedDays.includes(day.id);

                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`rounded-2xl border px-3 py-5 text-center transition-all ${
                      selected
                        ? "border-violet-400/50 bg-violet-500/15 text-violet-200 shadow-[0_0_25px_rgba(124,58,237,0.12)]"
                        : "border-white/10 bg-slate-950 text-slate-400 hover:border-violet-500/30"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {day.short}
                    </span>

                    <span className="mt-2 block text-lg">
                      {selected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-10">
              <h2 className="text-xl font-semibold">
                Ton créneau habituel
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                {"Pour l'instant, on utilise un créneau principal par jour."}
              </p>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Début
                  </label>

                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) =>
                      setStartTime(e.target.value)
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 text-lg outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Fin
                  </label>

                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) =>
                      setEndTime(e.target.value)
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 text-lg outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-3xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur lg:sticky lg:top-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Résumé
            </p>

            <p className="mt-5 text-3xl font-bold">
              {selectedDays.length}
            </p>

            <p className="mt-1 text-sm text-slate-400">
              jour{selectedDays.length > 1 ? "s" : ""} sélectionné
              {selectedDays.length > 1 ? "s" : ""}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {days
                .filter((day) =>
                  selectedDays.includes(day.id)
                )
                .map((day) => (
                  <span
                    key={day.id}
                    className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300"
                  >
                    {day.label}
                  </span>
                ))}
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-slate-950 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Créneau
              </p>

              <p className="mt-2 text-xl font-semibold">
                {startTime} → {endTime}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                Fuseau : {timezone}
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-4">
              <p className="text-sm font-medium text-cyan-200">
                Matching plus précis
              </p>

              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                {"Ces informations permettront à GameMate d'éviter de te proposer des joueurs qui ne sont jamais disponibles aux mêmes heures que toi."}
              </p>
            </div>
          </aside>
        </div>

        {message && (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 text-sm text-amber-200">
            {message}
          </div>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-8">
          <button
            type="button"
            onClick={() =>
              router.push("/onboarding/gaming-dna")
            }
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
            {loading
              ? "Enregistrement..."
              : "Continuer →"}
          </button>
        </div>
      </div>
    </main>
  );
}
