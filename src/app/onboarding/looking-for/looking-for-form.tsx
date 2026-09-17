"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OnboardingHeader from "@/components/onboarding/onboarding-header";

type Option = {
  id: number;
  slug: string;
  label: string;
  description: string | null;
  sort_order: number;
};

type Props = {
  options: Option[];
  initialSelectedIds: number[];
};

export default function LookingForForm({
  options,
  initialSelectedIds,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [selectedIds, setSelectedIds] =
    useState<number[]>(initialSelectedIds);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleOption(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function handleSave() {
    setMessage("");

    if (selectedIds.length === 0) {
      setMessage("Choisis au moins une option.");
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
      .from("user_looking_for")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      setMessage(`Erreur : ${deleteError.message}`);
      setLoading(false);
      return;
    }

    const rows = selectedIds.map((optionId) => ({
      user_id: user.id,
      option_id: optionId,
    }));

    const { error: insertError } = await supabase
      .from("user_looking_for")
      .insert(rows);

    if (insertError) {
      setMessage(`Erreur : ${insertError.message}`);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        onboarding_step: 6,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      setMessage(`Erreur : ${profileError.message}`);
      setLoading(false);
      return;
    }

    router.push("/onboarding/summary");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070A12] px-6 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-cyan-500/5 blur-[110px]" />

      <div className="relative mx-auto max-w-6xl">
        <OnboardingHeader
          step={5}
          title="Qu’est-ce que"
          highlightedTitle="tu recherches ?"
          description="Choisis ce que tu veux trouver sur GameMate. Tu pourras modifier ces préférences plus tard."
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => {
            const selected = selectedIds.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleOption(option.id)}
                className={`group min-h-44 rounded-3xl border p-6 text-left transition-all duration-300 ${
                  selected
                    ? "border-violet-400/50 bg-gradient-to-br from-violet-500/15 via-slate-900 to-slate-950 shadow-[0_0_35px_rgba(124,58,237,0.10)]"
                    : "border-white/10 bg-slate-900/70 hover:-translate-y-1 hover:border-violet-500/30"
                }`}
              >
                <div className="flex items-start justify-between gap-5">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-lg ${
                      selected
                        ? "border-violet-400/40 bg-violet-500/20 text-violet-300"
                        : "border-white/10 bg-white/5 text-slate-500"
                    }`}
                  >
                    {selected ? "✓" : "+"}
                  </div>

                  {option.slug === "dating" && (
                    <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/5 px-3 py-1 text-xs text-fuchsia-300">
                      Facultatif
                    </span>
                  )}
                </div>

                <h2 className="mt-6 text-xl font-semibold">
                  {option.label}
                </h2>

                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {option.description}
                </p>

                <p
                  className={`mt-5 text-xs font-semibold uppercase tracking-wider ${
                    selected
                      ? "text-violet-300"
                      : "text-slate-600"
                  }`}
                >
                  {selected ? "Sélectionné" : "Sélectionner"}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">
                {selectedIds.length} préférence
                {selectedIds.length > 1 ? "s" : ""} sélectionnée
                {selectedIds.length > 1 ? "s" : ""}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Ces choix influenceront les suggestions et le matching.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {options
                .filter((option) =>
                  selectedIds.includes(option.id)
                )
                .map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => toggleOption(option.id)}
                    className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-300"
                  >
                    {option.label} ×
                  </button>
                ))}
            </div>
          </div>
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
              router.push("/onboarding/availability")
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