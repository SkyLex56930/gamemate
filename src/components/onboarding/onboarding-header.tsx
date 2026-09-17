type OnboardingHeaderProps = {
  step: number;
  totalSteps?: number;
  title: string;
  highlightedTitle?: string;
  description: string;
};

export default function OnboardingHeader({
  step,
  totalSteps = 6,
  title,
  highlightedTitle,
  description,
}: OnboardingHeaderProps) {
  const progress = Math.min(
    100,
    Math.max(0, (step / totalSteps) * 100)
  );

  return (
    <div className="mb-10">
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-400">
            GameMate Onboarding
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {title}

            {highlightedTitle && (
              <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                {highlightedTitle}
              </span>
            )}
          </h1>

          <p className="mt-4 max-w-2xl leading-relaxed text-slate-400">
            {description}
          </p>
        </div>

        <div className="hidden shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-right backdrop-blur sm:block">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Progression
          </p>

          <p className="mt-1 text-lg font-semibold">
            Étape {step} / {totalSteps}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500 sm:hidden">
          <span>
            Étape {step} / {totalSteps}
          </span>

          <span>{Math.round(progress)}%</span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}