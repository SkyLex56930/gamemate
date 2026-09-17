"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AvailabilityRow = {
  id?: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

type Props = {
  initialAvailability: AvailabilityRow[];
};

const days = [
  {
    id: 1,
    short: "Lun",
    label: "Lundi",
  },
  {
    id: 2,
    short: "Mar",
    label: "Mardi",
  },
  {
    id: 3,
    short: "Mer",
    label: "Mercredi",
  },
  {
    id: 4,
    short: "Jeu",
    label: "Jeudi",
  },
  {
    id: 5,
    short: "Ven",
    label: "Vendredi",
  },
  {
    id: 6,
    short: "Sam",
    label: "Samedi",
  },
  {
    id: 0,
    short: "Dim",
    label: "Dimanche",
  },
];

export default function AvailabilitySettingsForm({
  initialAvailability,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const initialDays = initialAvailability.map(
    (item) => item.day_of_week
  );

  const [selectedDays, setSelectedDays] =
    useState<number[]>(initialDays);

  const [startTime, setStartTime] = useState(
    initialAvailability[0]?.start_time?.slice(0, 5) ??
      "18:00"
  );

  const [endTime, setEndTime] = useState(
    initialAvailability[0]?.end_time?.slice(0, 5) ??
      "23:00"
  );

  const [timezone, setTimezone] = useState(
    initialAvailability[0]?.timezone ??
      "Europe/Paris"
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const orderedSelectedDays = useMemo(() => {
    return days.filter((day) =>
      selectedDays.includes(day.id)
    );
  }, [selectedDays]);

  function toggleDay(dayId: number) {
    setMessage("");
    setError("");

    setSelectedDays((current) => {
      if (current.includes(dayId)) {
        return current.filter(
          (id) => id !== dayId
        );
      }

      return [...current, dayId];
    });
  }

  async function saveAvailability() {
    setSaving(true);
    setMessage("");
    setError("");

    if (selectedDays.length === 0) {
      setError(
        "Sélectionne au moins un jour."
      );
      setSaving(false);
      return;
    }

    if (!startTime || !endTime) {
      setError(
        "Renseigne une heure de début et une heure de fin."
      );
      setSaving(false);
      return;
    }

    if (startTime >= endTime) {
      setError(
        "L'heure de fin doit être après l'heure de début."
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
        .from("user_availability")
        .delete()
        .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const rows = selectedDays.map(
      (dayId) => ({
        user_id: user.id,
        day_of_week: dayId,
        start_time: startTime,
        end_time: endTime,
        timezone,
        updated_at: new Date().toISOString(),
      })
    );

    const { error: insertError } =
      await supabase
        .from("user_availability")
        .insert(rows);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setMessage(
      "Tes disponibilités ont bien été mises à jour."
    );

    router.refresh();

    setSaving(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">

      {/* FORMULAIRE */}
      <section className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8">
        <div>
          <h2 className="text-xl font-bold">
            Jours disponibles
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Sélectionne les jours pendant lesquels
            tu joues habituellement.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {days.map((day) => {
            const selected =
              selectedDays.includes(day.id);

            return (
              <button
                key={day.id}
                type="button"
                onClick={() =>
                  toggleDay(day.id)
                }
                className={`rounded-2xl border px-4 py-4 text-center transition ${
                  selected
                    ? "border-violet-400/40 bg-gradient-to-br from-violet-500/20 to-cyan-500/10 text-white shadow-[0_0_20px_rgba(124,58,237,0.08)]"
                    : "border-white/10 bg-[#070B16] text-slate-500 hover:border-white/20 hover:text-white"
                }`}
              >
                <span
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    selected
                      ? "bg-violet-500 text-white"
                      : "bg-white/5"
                  }`}
                >
                  {selected ? "✓" : day.short[0]}
                </span>

                <p className="mt-3 text-sm font-semibold">
                  {day.short}
                </p>
              </button>
            );
          })}
        </div>

        {/* HORAIRES */}
        <div className="mt-10 border-t border-white/10 pt-8">
          <h2 className="text-xl font-bold">
            Créneau habituel
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Pour l&apos;instant, ce créneau
            s&apos;applique à tous les jours
            sélectionnés.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                À partir de
              </label>

              <input
                type="time"
                value={startTime}
                onChange={(event) =>
                  setStartTime(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-white outline-none transition focus:border-violet-500/60"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Jusqu&apos;à
              </label>

              <input
                type="time"
                value={endTime}
                onChange={(event) =>
                  setEndTime(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-white outline-none transition focus:border-violet-500/60"
              />
            </div>
          </div>
        </div>

        {/* TIMEZONE */}
        <div className="mt-8 border-t border-white/10 pt-8">
          <h2 className="text-xl font-bold">
            Fuseau horaire
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            GameMate pourra comparer correctement
            tes horaires avec ceux des autres joueurs.
          </p>

          <div className="mt-5 max-w-md">
            <select
              value={timezone}
              onChange={(event) =>
                setTimezone(event.target.value)
              }
              className="w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-500/60"
            >
              <option value="Europe/Paris">
                Europe / Paris
              </option>

              <option value="Europe/London">
                Europe / Londres
              </option>

              <option value="Europe/Brussels">
                Europe / Bruxelles
              </option>

              <option value="Europe/Berlin">
                Europe / Berlin
              </option>

              <option value="America/New_York">
                Amérique / New York
              </option>

              <option value="America/Los_Angeles">
                Amérique / Los Angeles
              </option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-7 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-7 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
            ✓ {message}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-white/10 pt-6">
          <button
            type="button"
            onClick={saveAvailability}
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
      <aside>
        <div className="sticky top-6 rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            Tes disponibilités
          </p>

          <div className="mt-5 flex items-end gap-2">
            <p className="text-4xl font-bold">
              {selectedDays.length}
            </p>

            <p className="pb-1 text-sm text-slate-500">
              jour
              {selectedDays.length > 1
                ? "s"
                : ""}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {orderedSelectedDays.map(
              (day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() =>
                    toggleDay(day.id)
                  }
                  className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300"
                >
                  {day.short} ×
                </button>
              )
            )}
          </div>

          {selectedDays.length === 0 && (
            <p className="mt-5 text-sm text-slate-500">
              Aucun jour sélectionné.
            </p>
          )}

          <div className="mt-7 rounded-2xl border border-white/10 bg-[#070B16] p-5">
            <p className="text-xs uppercase tracking-wider text-slate-600">
              Créneau
            </p>

            <p className="mt-2 text-lg font-semibold">
              {startTime} → {endTime}
            </p>
          </div>

          <div className="mt-3 rounded-2xl border border-white/10 bg-[#070B16] p-5">
            <p className="text-xs uppercase tracking-wider text-slate-600">
              Fuseau
            </p>

            <p className="mt-2 text-sm font-medium">
              {timezone}
            </p>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs leading-relaxed text-slate-500">
              GameMate utilisera ces horaires pour
              favoriser les joueurs réellement
              disponibles en même temps que toi.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}