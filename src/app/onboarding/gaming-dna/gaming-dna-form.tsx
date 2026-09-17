"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OnboardingHeader from "@/components/onboarding/onboarding-header";

type Tag = {
  id: number;
  slug: string;
  label: string;
  category: string | null;
  sort_order: number;
};

type Props = {
  tags: Tag[];
  initialSelectedIds: number[];
};

const MAX_TAGS = 8;

export default function GamingDnaForm({
  tags,
  initialSelectedIds,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [selectedIds, setSelectedIds] =
    useState<number[]>(initialSelectedIds);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleTag(tagId: number) {
    setMessage("");

    if (selectedIds.includes(tagId)) {
      setSelectedIds((current) =>
        current.filter((id) => id !== tagId)
      );
      return;
    }

    if (selectedIds.length >= MAX_TAGS) {
      setMessage(
        `Tu peux sélectionner jusqu'à ${MAX_TAGS} tags maximum.`
      );
      return;
    }

    setSelectedIds((current) => [...current, tagId]);
  }

  async function handleSave() {
    setMessage("");

    if (selectedIds.length === 0) {
      setMessage("Choisis au moins un tag Gaming DNA.");
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
      .from("user_gaming_dna")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      setMessage(`Erreur : ${deleteError.message}`);
      setLoading(false);
      return;
    }

    const rows = selectedIds.map((tagId) => ({
      user_id: user.id,
      tag_id: tagId,
    }));

    const { error: insertError } = await supabase
      .from("user_gaming_dna")
      .insert(rows);

    if (insertError) {
      setMessage(`Erreur : ${insertError.message}`);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        onboarding_step: 4,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      setMessage(`Erreur : ${profileError.message}`);
      setLoading(false);
      return;
    }

    router.push("/onboarding/availability");
    router.refresh();
  }

  const categories = [
    {
      key: "vibe",
      title: "Ambiance",
      description: "Ton état d'esprit quand tu joues.",
    },
    {
      key: "style",
      title: "Style de jeu",
      description: "La façon dont tu aimes aborder tes parties.",
    },
    {
      key: "communication",
      title: "Communication",
      description: "Comment tu préfères échanger avec tes mates.",
    },
    {
      key: "availability",
      title: "Rythme",
      description: "Ton rythme et tes habitudes de jeu.",
    },
  ];

  const selectedTags = tags.filter((tag) =>
    selectedIds.includes(tag.id)
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070A12] px-6 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-cyan-500/5 blur-[110px]" />

      <div className="relative mx-auto max-w-6xl">
        <OnboardingHeader
          step={3}
          title="Ton Gaming DNA."
          highlightedTitle="Ta façon de jouer."
          description="Choisis les traits qui te représentent le mieux. GameMate s’en servira pour te proposer des mates réellement compatibles."
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {categories.map((category) => {
              const categoryTags = tags.filter(
                (tag) => tag.category === category.key
              );

              return (
                <section
                  key={category.key}
                  className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(124,58,237,0.05)] backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {category.title}
                      </h2>

                      <p className="mt-1 text-sm text-slate-400">
                        {category.description}
                      </p>
                    </div>

                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-500">
                      {
                        categoryTags.filter((tag) =>
                          selectedIds.includes(tag.id)
                        ).length
                      }{" "}
                      sélectionné(s)
                    </span>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {categoryTags.map((tag) => {
                      const selected =
                        selectedIds.includes(tag.id);

                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={`group rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                            selected
                              ? "border-violet-400/50 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 text-violet-200 shadow-[0_0_24px_rgba(124,58,237,0.12)]"
                              : "border-white/10 bg-slate-950 text-slate-300 hover:-translate-y-0.5 hover:border-violet-500/40 hover:bg-white/[0.03]"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                                selected
                                  ? "border-violet-400 bg-violet-500 text-white"
                                  : "border-white/15 text-slate-600"
                              }`}
                            >
                              {selected ? "✓" : "+"}
                            </span>

                            {tag.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="h-fit rounded-3xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur lg:sticky lg:top-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Ton profil
            </p>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">
                  {selectedIds.length}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  tags sélectionnés
                </p>
              </div>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  selectedIds.length >= MAX_TAGS
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border-violet-400/30 bg-violet-400/10 text-violet-300"
                }`}
              >
                {selectedIds.length} / {MAX_TAGS}
              </span>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-300"
                style={{
                  width: `${
                    (selectedIds.length / MAX_TAGS) * 100
                  }%`,
                }}
              />
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium text-slate-300">
                Gaming DNA actuel
              </p>

              {selectedTags.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-5 text-center">
                  <p className="text-sm text-slate-500">
                    Aucun trait sélectionné pour le moment.
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                    >
                      {tag.label} ×
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-4">
              <p className="text-sm font-medium text-cyan-200">
                Pourquoi ces choix ?
              </p>

              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                GameMate utilisera ton Gaming DNA pour améliorer la
                compatibilité avec les joueurs proposés dans Jouer
                maintenant, les recherches et les squads.
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
              router.push("/onboarding/games")
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