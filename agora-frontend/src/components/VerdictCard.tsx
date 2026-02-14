import { Verdict } from "@/lib/types";
import { TxBadge } from "./TXBadge";

interface VerdictCardProps {
  verdict: Verdict;
}

export function VerdictCard({ verdict: v }: VerdictCardProps) {
  const isStalemate = v.status === "settled_stalemate";

  return (
    <div className="rounded-xl border border-agora-gold/20 bg-agora-surface p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚖️</span>
          <span className="font-display text-base font-bold text-agora-gold">
            {v.challengerName} vs {v.challengedName}
          </span>
        </div>
        {v.verdictTxHash && <TxBadge txHash={v.verdictTxHash} />}
      </div>

      <p className="mt-2 text-sm italic text-agora-textSecondary">"{v.topic}"</p>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm font-bold text-agora-text">
          {isStalemate ? "STALEMATE" : `WINNER: ${v.winnerName}`}
        </span>
        <span className="text-xs text-agora-textMuted">Confidence: {v.confidence}/100</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-agora-textSecondary">{v.analysis}</p>

      {v.keyMoment && (
        <p className="mt-2 text-xs italic text-agora-textMuted">Key Moment: {v.keyMoment}</p>
      )}

      <div className="mt-3 text-[10px] text-agora-textMuted">
        {new Date(v.settledAt).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })}
      </div>
    </div>
  );
}