import { DEBATE_PHASES, PHASE_LABELS } from "@/lib/constants";

interface PhaseIndicatorProps {
  turnIndex: number;
  status: string;
}

export function PhaseIndicator({ turnIndex, status }: PhaseIndicatorProps) {
  const currentPhaseIndex = Math.floor(turnIndex / 2);
  const isSettled = status.startsWith("settled");
  const isConcluded = status === "concluded";

  return (
    <div className="flex items-center gap-1">
      {DEBATE_PHASES.map((phase, i) => {
        const isComplete = i < currentPhaseIndex || isSettled || isConcluded;
        const isCurrent = i === currentPhaseIndex && !isSettled && !isConcluded;

        return (
          <div key={phase} className="flex items-center gap-1">
            <div
              className={`h-2 w-8 rounded-full transition-colors ${
                isComplete
                  ? "bg-agora-gold"
                  : isCurrent
                  ? "bg-agora-gold/50 animate-pulse"
                  : "bg-agora-border"
              }`}
            />
            {i < DEBATE_PHASES.length - 1 && (
              <div className="h-px w-1 bg-agora-border" />
            )}
          </div>
        );
      })}
      <span className="ml-2 text-xs text-agora-textSecondary">
        {isSettled
          ? "Settled"
          : isConcluded
          ? "Awaiting Verdict"
          : PHASE_LABELS[DEBATE_PHASES[currentPhaseIndex]] || ""}
      </span>
    </div>
  );
}