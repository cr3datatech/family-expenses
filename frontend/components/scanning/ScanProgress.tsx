"use client";

export const SCAN_STEPS = ["Prepare", "Upload", "Analyze", "Finish"];

export default function ScanProgress({
  phase,
  stepIndex,
}: {
  phase: string | null;
  stepIndex: number;
}) {
  if (!phase) return null;
  const isAnalyzing = stepIndex === 2;
  const isError =
    phase.includes("Couldn't") || phase.includes("failed") || phase.includes("Failed");

  return (
    <div className="w-full rounded-[14px] border-2 border-dashed border-snap-400 bg-white p-3 shadow-[0_1px_4px_rgba(34,197,94,0.06)] space-y-3">
      <div className="flex items-center justify-between gap-1 px-0.5">
        {SCAN_STEPS.map((label, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div key={label} className="flex flex-1 flex-col items-center gap-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
                  done
                    ? "bg-snap-500 text-white"
                    : active
                      ? "bg-snap-400 text-white ring-2 ring-snap-300 ring-offset-1"
                      : "bg-snap-100 text-skin-secondary"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`text-[9px] font-semibold uppercase tracking-tight text-center leading-tight ${
                  active ? "text-snap-700" : "text-skin-secondary"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {isAnalyzing && (
        <div className="scan-indeterminate-track" aria-hidden>
          <div className="scan-indeterminate-bar" />
        </div>
      )}

      <p
        aria-live="polite"
        className={`text-[13px] font-semibold text-center leading-snug px-1 ${
          isError ? "text-red-700" : "text-snap-800"
        }`}
      >
        {phase}
      </p>
    </div>
  );
}
