"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type LookingForOption = {
  id: number;
  slug: string;
  label: string;
  description: string | null;
  sort_order: number;
};

type Props = {
  options: LookingForOption[];
  initialSelectedOptionIds: number[];
};

const optionIcons: Record<string, string> = {
  "play-now": "⚡",
  duo: "◉",
  squad: "◆",
  team: "♜",
  friends: "♡",
  competitive: "♛",
  dating: "✦",
};

export default function PreferencesSettingsForm({
  options,
  initialSelectedOptionIds,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [selectedOptionIds, setSelectedOptionIds] =
    useState<number[]>(initialSelectedOptionIds);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedOptions = useMemo(
    () =>
      options.filter((option) =>
        selectedOptionIds.includes(option.id)
      ),
    [options, selectedOptionIds]
  );

  function toggleOption(optionId: number) {
    setMessage("");
    setError("");

    setSelectedOptionIds((current) => {
      if (current.includes(optionId)) {
        return current.filter((id) => id !== optionId);
      }

      return [...current, optionId];
    });
  }

  async function savePreferences() {
    setSaving(true);
    setMessage("");
    setError("");

    if (selectedOptionIds.length === 0) {
      setError(
        "Sélectionne au moins une chose que tu recherches sur GameMate."
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

    const { error: deleteError } = await supabase
      .from("user_looking_for")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const rows = selectedOptionIds.map((optionId) => ({
      user_id: user.id,
      option_id: optionId,
    }));

    const { error: insertError } = await supabase
      .from("user_looking_for")
      .insert(rows);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setMessage(
      "Tes préférences ont bien été mises à jour."
    );

    router.refresh();
    setSaving(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <section className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8">
        <div>
          <h2 className="text-xl font-bold">
            Je recherche...
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Tu peux sélectionner plusieurs types de relations ou de
            sessions.
          </p>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {options.map((option) => {
            const selected =
              selectedOptionIds.includes(option.id);

            const isDating =
              option.slug === "dating";

            return (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  toggleOption(option.id)
                }
                className={`relative rounded-2xl border p-5 text-left transition ${
                  selected
                    ? "border-violet-400/40 bg-gradient-to-br from-violet-500/20 to-cyan-500/10 shadow-[0_0_24px_rgba(124,58,237,0.08)]"
                    : "border-white/10 bg-[#070B16] hover:border-white/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl ${
                      selected
                        ? "bg-violet-500/20 text-violet-200"
                        : "bg-white/[0.04] text-slate-500"
                    }`}
                  >
                    {optionIcons[option.slug] ?? "◇"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {option.label}
                      </p>

                      {isDating && (
                        <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/5 px-2 py-1 text-[10px] text-fuchsia-300">
                          Facultatif
                        </span>
                      )}
                    </div>

                    {option.description && (
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">
                        {option.description}
                      </p>
                    )}
                  </div>

                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                      selected
                        ? "border-violet-400 bg-violet-500 text-white"
                        : "border-white/20"
                    }`}
                  >
                    {selected ? "✓" : ""}
                  </div>
                </div>
              </button>
            );
          })}
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
            onClick={savePreferences}
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

      <aside>
        <div className="sticky top-6 rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            Tes préférences
          </p>

          <div className="mt-5 flex items-end gap-2">
            <p className="text-4xl font-bold">
              {selectedOptions.length}
            </p>

            <p className="pb-1 text-sm text-slate-500">
              sélection
              {selectedOptions.length > 1
                ? "s"
                : ""}
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    toggleOption(option.id)
                  }
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#070B16] p-4 text-left transition hover:border-violet-500/20"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    {optionIcons[option.slug] ?? "◇"}
                  </span>

                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {option.label}
                  </span>

                  <span className="text-xs text-slate-600">
                    ×
                  </span>
                </button>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Aucune préférence sélectionnée.
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs leading-relaxed text-slate-500">
              Le futur Companion pourra utiliser ces informations avec
              tes jeux, ton Gaming DNA et tes disponibilités pour
              améliorer les suggestions de mates.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}