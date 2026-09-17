import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";
import Link from "next/link";

export const dynamic = "force-dynamic";

function getRelationName(
  value:
    | { name: string }
    | { name: string }[]
    | null
) {
  if (!value) return "Inconnu";

  return Array.isArray(value)
    ? value[0]?.name ?? "Inconnu"
    : value.name;
}

function getRelationLabel(
  value:
    | { label: string }
    | { label: string }[]
    | null
) {
  if (!value) return "";

  return Array.isArray(value)
    ? value[0]?.label ?? ""
    : value.label;
}

const dayLabels: Record<number, string> = {
  0: "Dim",
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
  6: "Sam",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "username, display_name, bio, region, avatar_url, is_onboarding_complete"
    )
    .eq("id", user.id)
    .single();

  if (!profile?.is_onboarding_complete) {
    redirect("/onboarding");
  }

  const { data: games } = await supabase
    .from("user_games")
    .select(`
      game_id,
      platform_id,
      is_primary,
      rank_text,
      role_text,
      games (
        name
      ),
      platforms (
        name
      )
    `)
    .eq("user_id", user.id)
    .order("is_primary", { ascending: false });

  const { data: dna } = await supabase
    .from("user_gaming_dna")
    .select(`
      tag_id,
      gaming_dna_tags (
        label
      )
    `)
    .eq("user_id", user.id);

  const { data: availability } = await supabase
    .from("user_availability")
    .select("day_of_week, start_time, end_time")
    .eq("user_id", user.id)
    .order("day_of_week");

  const { data: lookingFor } = await supabase
    .from("user_looking_for")
    .select(`
      option_id,
      looking_for_options (
        label
      )
    `)
    .eq("user_id", user.id);

  const displayName =
    profile.display_name ||
    profile.username ||
    "GameMate";

  const username = profile.username || "player";

  return (
    <main className="min-h-screen bg-[#050812] text-white">
      <div className="flex min-h-screen">

        {/* SIDEBAR */}
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#070B16] lg:flex lg:flex-col">
          <div className="flex h-20 items-center border-b border-white/10 px-5">
            <div className="relative h-12 w-12 shrink-0">
              <Image
                src="/gamemate-logo.png"
                alt="GameMate"
                fill
                priority
                className="object-contain"
              />
            </div>

            <div className="ml-3">
              <p className="text-lg font-bold">
                GameMate
              </p>

              <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
                Play. Connect. Belong.
              </p>
            </div>
          </div>

          <nav className="flex-1 space-y-1.5 p-4">
            <a
              href="#home"
              className="flex items-center gap-3 rounded-xl bg-violet-500/15 px-4 py-3 text-sm font-semibold text-violet-200"
            >
              <span>⌂</span>
              Accueil
            </a>

            <a
              href="#download"
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              <span>↓</span>
              Télécharger
            </a>

            <Link
  href="/dashboard/profile"
  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
>
  <span>◎</span>
  Mon profil
</Link>

            <Link
  href="/dashboard/games"
  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400"
>
  <span>▣</span>
  Mes jeux
</Link>

            <Link
  href="/dashboard/gaming-dna"
  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
>
  <span>✦</span>
  Gaming DNA
</Link>

            <Link
  href="/dashboard/availability"
  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
>
  <span>◷</span>
  Disponibilités
</Link>

            <Link
  href="/dashboard/preferences"
  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
>
  <span>◇</span>
  Préférences
</Link>
            <Link
  href="/dashboard/settings"
  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
>
  <span>⚙</span>
  Paramètres
</Link>
<div className="border-t border-white/10 p-4">
  <LogoutButton />
</div>
          </nav>

          <div className="border-t border-white/10 p-4">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              <span>?</span>
              Support
            </button>

            
          </div>
        </aside>

        {/* PAGE */}
        <div className="min-w-0 flex-1">

          {/* TOPBAR */}
          <header className="flex h-20 items-center border-b border-white/10 bg-[#070B16]/90 px-5 backdrop-blur-xl md:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="relative h-11 w-11">
                <Image
                  src="/gamemate-logo.png"
                  alt="GameMate"
                  fill
                  priority
                  className="object-contain"
                />
              </div>

              <p className="font-bold">
                GameMate
              </p>
            </div>

            <div className="hidden lg:block">
              <p className="text-sm text-slate-500">
                Portail GameMate
              </p>

              <p className="font-semibold">
                Bonjour {displayName}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-4">
              <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300 sm:inline-flex">
                ● Services opérationnels
              </span>

              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/30 bg-gradient-to-br from-violet-600 to-cyan-500 font-bold">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </header>

          <div
            id="home"
            className="mx-auto max-w-[1500px] space-y-8 p-5 md:p-8"
          >

            {/* DOWNLOAD HERO */}
            <section
              id="download"
              className="relative overflow-hidden rounded-[32px] border border-violet-500/20 bg-gradient-to-br from-[#15122F] via-[#0C1125] to-[#071521] p-7 md:p-10"
            >
              <div className="pointer-events-none absolute -right-20 -top-28 h-[420px] w-[420px] rounded-full bg-violet-600/25 blur-[110px]" />
              <div className="pointer-events-none absolute bottom-0 right-[20%] h-64 w-64 rounded-full bg-cyan-500/10 blur-[90px]" />

              <div className="relative z-10 grid gap-10 lg:grid-cols-[1fr_360px] lg:items-center">
                <div>
                  <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-xs font-semibold text-cyan-300">
                    Windows • Companion GameMate
                  </span>

                  <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
                    Toute l&apos;expérience
                    <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                      GameMate sur ton PC.
                    </span>
                  </h1>

                  <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-400">
                    Trouve tes mates, discute, forme tes squads,
                    utilise le vocal et profite plus tard de
                    l&apos;overlay directement pendant tes parties.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled
                      title="Le launcher sera branché ici dès qu'il sera disponible."
                      className="rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 px-7 py-4 font-semibold shadow-[0_0_40px_rgba(124,58,237,0.25)] opacity-70"
                    >
                      ↓ Télécharger GameMate pour Windows
                    </button>

                    <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          Version prévue
                        </p>

                        <p className="text-sm font-semibold">
                          GameMate Alpha
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">
                    Le bouton sera activé dès que GameMateSetup.exe sera prêt.
                  </p>
                </div>

                <div className="relative mx-auto w-full max-w-sm">
                  <div className="rounded-[28px] border border-white/10 bg-black/25 p-7 backdrop-blur-xl">
                    <div className="relative mx-auto h-28 w-28">
                      <Image
                        src="/gamemate-logo.png"
                        alt="GameMate"
                        fill
                        className="object-contain drop-shadow-[0_0_30px_rgba(124,58,237,0.5)]"
                      />
                    </div>

                    <div className="mt-6 text-center">
                      <p className="text-lg font-bold">
                        GameMate Companion
                      </p>

                      <p className="mt-2 text-sm text-slate-400">
                        Ton hub gaming, directement sur ton PC.
                      </p>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white/[0.04] p-3">
                        <p className="text-lg">⚡</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Léger
                        </p>
                      </div>

                      <div className="rounded-xl bg-white/[0.04] p-3">
                        <p className="text-lg">🎮</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Overlay
                        </p>
                      </div>

                      <div className="rounded-xl bg-white/[0.04] p-3">
                        <p className="text-lg">◉</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Vocal
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* PROFIL */}
            <section
              id="profile"
              className="grid gap-6 xl:grid-cols-[330px_1fr]"
            >
              <div className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-violet-400/30 bg-gradient-to-br from-violet-600 to-cyan-500 text-2xl font-bold">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>

                  <div>
                    <h2 className="text-xl font-bold">
                      {displayName}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      @{username}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4 border-t border-white/10 pt-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-600">
                      Email
                    </p>

                    <p className="mt-1 text-sm">
                      {user.email}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-600">
                      Région
                    </p>

                    <p className="mt-1 text-sm">
                      {profile.region || "Non renseignée"}
                    </p>
                  </div>
                </div>

                <a
  href="/dashboard/profile"
  className="mt-6 block w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 text-center text-sm font-semibold transition hover:bg-white/[0.07]"
>
  Modifier mon profil
</a>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                      Ton compte GameMate
                    </p>

                    <h2 className="mt-2 text-2xl font-bold">
                      Gère ton profil depuis le web.
                    </h2>
                  </div>
                </div>

                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
                  Tout ce que tu as choisi pendant l&apos;inscription pourra être modifié ici.
                  Les changements seront automatiquement disponibles dans le Companion.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-[#070B16] p-4">
                    <p className="text-2xl font-bold">
                      {games?.length ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Jeux
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#070B16] p-4">
                    <p className="text-2xl font-bold">
                      {dna?.length ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tags Gaming DNA
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#070B16] p-4">
                    <p className="text-2xl font-bold">
                      {availability?.length ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Jours disponibles
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#070B16] p-4">
                    <p className="text-2xl font-bold">
                      {lookingFor?.length ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Préférences
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* JEUX */}
            <section
              id="games"
              className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6 md:p-7"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Mes jeux & plateformes
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Modifie les informations utilisées par GameMate.
                  </p>
                </div>

                <a
  href="/dashboard/games"
  className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20"
>
  Modifier
</a>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(games ?? []).map((game) => (
                  <div
                    key={`${game.game_id}-${game.platform_id}`}
                    className="rounded-2xl border border-white/10 bg-[#070B16] p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">
                          {getRelationName(game.games)}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {getRelationName(game.platforms)}
                        </p>
                      </div>

                      {game.is_primary && (
                        <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] text-violet-300">
                          ★ Principal
                        </span>
                      )}
                    </div>

                    {(game.rank_text || game.role_text) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {game.rank_text && (
                          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
                            {game.rank_text}
                          </span>
                        )}

                        {game.role_text && (
                          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
                            {game.role_text}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">

              {/* DNA */}
              <section
                id="dna"
                className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6"
              >
                <Link
  href="/dashboard/gaming-dna"
  className="text-sm font-medium text-violet-400 transition hover:text-violet-300"
>
  Modifier
</Link>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(dna ?? []).map((item) => (
                    <span
                      key={item.tag_id}
                      className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-300"
                    >
                      {getRelationLabel(item.gaming_dna_tags)}
                    </span>
                  ))}
                </div>
              </section>

              {/* DISPONIBILITES */}
              <section
                id="availability"
                className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">
                    Disponibilités
                  </h2>

                  <Link
  href="/dashboard/availability"
  className="text-sm font-medium text-violet-400 transition hover:text-violet-300"
>
  Modifier
</Link>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(availability ?? []).map((item) => (
                    <span
                      key={`${item.day_of_week}-${item.start_time}`}
                      className="rounded-xl border border-white/10 bg-[#070B16] px-3 py-2 text-xs text-slate-300"
                    >
                      {dayLabels[item.day_of_week]}{" "}
                      {item.start_time.slice(0, 5)}
                      {" → "}
                      {item.end_time.slice(0, 5)}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            {/* PREFERENCES */}
            <section
              id="preferences"
              className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Ce que je recherche
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Ces choix seront utilisés dans le matching de l&apos;application.
                  </p>
                </div>

                <Link
  href="/dashboard/preferences"
  className="text-sm font-medium text-violet-400 transition hover:text-violet-300"
>
  Modifier
</Link>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {(lookingFor ?? []).map((item) => (
                  <span
                    key={item.option_id}
                    className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-sm text-cyan-300"
                  >
                    {getRelationLabel(
                      item.looking_for_options
                    )}
                  </span>
                ))}
              </div>
            </section>

            {/* INFOS APP */}
            <section className="grid gap-5 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  Dernière version
                </p>

                <p className="mt-3 text-xl font-bold">
                  Alpha
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Companion en développement
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  Services
                </p>

                <p className="mt-3 font-semibold text-emerald-300">
                  ● Opérationnels
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Auth & profil disponibles
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0A0F1D] p-6">
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  Besoin d&apos;aide ?
                </p>

                <p className="mt-3 text-xl font-bold">
                  Support GameMate
                </p>

                <button className="mt-3 text-sm font-medium text-violet-400">
                  Centre d&apos;aide →
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}