"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Tag = {
  id: number;
  slug: string;
  label: string;
  category: string;
  sort_order: number;
};

type Props = {
  tags: Tag[];
  initialSelectedTagIds: number[];
};

const categoryLabels: Record<string, string> = {
  vibe: "Ambiance",
  style: "Style de jeu",
  communication: "Communication",
  availability: "Habitudes",
};

export default function GamingDnaSettingsForm({
  tags,
  initialSelectedTagIds,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    initialSelectedTagIds
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const groupedTags = useMemo(() => {
    const groups: Record<string, Tag[]> = {};

    for (const tag of tags) {
      if (!groups[tag.category]) {
        groups[tag.category] = [];
      }

      groups[tag.category].push(tag);
    }

    return groups;
  }, [tags]);

  function toggleTag(tagId: number) {
    setMessage("");
    setError("");

    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds((current) =>
        current.filter((id) => id !== tagId)
      );

      return;
    }

    if (selectedTagIds.length >= 8) {
      setError(
        "Tu peux sélectionner jusqu'à 8 traits maximum."
      );

      return;
    }

    setSelectedTagIds((current) => [
      ...current,
      tagId,
    ]);
  }

  async function saveDna() {
    setSaving(true);
    setMessage("");
    setError("");

    if (selectedTagIds.length === 0) {
      setError(
        "Sélectionne au moins un trait."
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
        .from("user_gaming_dna")
        .delete()
        .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const rows = selectedTagIds.map(
      (tagId) => ({
        user_id: user.id,
        tag_id: tagId,
      })
    );

    const { error: insertError } =
      await supabase
        .from("user_gaming_dna")
        .insert(rows);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setMessage(
      "Ton Gaming DNA a bien été mis à jour."
    );

    router.refresh();

    setSaving(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">

      {/* TAGS */}
      <section className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              Tes traits de jeu
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Choisis les traits qui te représentent le mieux.
            </p>
          </div>

          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2">
            <span className="font-semibold text-violet-300">
              {selectedTagIds.length}
            </span>

            <span className="text-sm text-slate-500">
              {" "}
              / 8 sélectionnés
            </span>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {Object.entries(groupedTags).map(
            ([category, categoryTags]) => (
              <div key={category}>
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {categoryLabels[category] ??
                      category}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {categoryTags.map((tag) => {
                    const selected =
                      selectedTagIds.includes(
                        tag.id
                      );

                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          toggleTag(tag.id)
                        }
                        className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                          selected
                            ? "border-violet-400/40 bg-gradient-to-r from-violet-500/20 to-cyan-500/10 text-violet-200 shadow-[0_0_20px_rgba(124,58,237,0.08)]"
                            : "border-white/10 bg-[#070B16] text-slate-400 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {selected && (
                            <span className="text-cyan-300">
                              ✓
                            </span>
                          )}

                          {tag.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )}
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
            onClick={saveDna}
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
            Ton Gaming DNA
          </p>

          <div className="mt-5">
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold">
                {selectedTagIds.length}
              </p>

              <p className="pb-1 text-sm text-slate-500">
                / 8
              </p>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 transition-all"
                style={{
                  width: `${
                    (selectedTagIds.length /
                      8) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {selectedTagIds.length > 0 ? (
              selectedTagIds.map((tagId) => {
                const tag = tags.find(
                  (item) =>
                    item.id === tagId
                );

                if (!tag) {
                  return null;
                }

                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      toggleTag(tag.id)
                    }
                    className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 transition hover:bg-violet-500/20"
                  >
                    {tag.label} ×
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">
                Aucun trait sélectionné.
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs leading-relaxed text-slate-500">
              Ces informations aideront
              GameMate à te proposer des joueurs
              avec lesquels tu as plus de chances
              de bien t&apos;entendre.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}