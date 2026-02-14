"use client";
import { usePolling } from "@/lib/hook";
import { Debate } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { PhaseIndicator } from "./PhaseIndicator";
import { TxBadge } from "./TXBadge";
import { PHASE_LABELS } from "@/lib/constants";

export function DebateArena() {
  const { data } = usePolling<{ active: boolean; debate: Debate | null }>(
    "/api/frontend/debate/active",
    3000
  );

  if (!data || !data.debate) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-agora-border bg-agora-surface p-12 text-center">
        <div className="font-display text-2xl font-bold text-agora-textMuted">
          The Forum is Quiet
        </div>
        <p className="mt-2 text-sm text-agora-textSecondary">
          Awaiting the next challenge.
        </p>
      </div>
    );
  }

  const d = data.debate;
  const isLive = data.active;
  const isSettled = d.status.startsWith("settled");

  return (
    <div className="overflow-hidden rounded-xl border border-agora-border bg-agora-surface">
      {/* Header — VS Banner */}
      <div className="relative flex items-center justify-between border-b border-agora-border px-6 py-4">
        {/* Left agent */}
        <div className="flex items-center gap-3 animate-slide-in-left">
          <AgentAvatar avatar={d.challengerAvatar} name={d.challengerName} size="md" beliefColor={d.challengerBeliefColor} />
          <div>
            <div className="font-display text-lg font-bold">{d.challengerName}</div>
            <div className="text-xs" style={{ color: d.challengerBeliefColor }}>{d.challengerBelief}</div>
          </div>
        </div>

        {/* VS / Status */}
        <div className="flex flex-col items-center">
          {isLive ? (
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400 animate-pulse">LIVE</span>
          ) : isSettled ? (
            <span className="rounded-full bg-agora-gold/20 px-3 py-1 text-xs font-bold text-agora-gold">SETTLED</span>
          ) : (
            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-bold text-purple-400">VERDICT PENDING</span>
          )}
          <span className="mt-1 font-display text-2xl font-black text-agora-textMuted">VS</span>
        </div>

        {/* Right agent */}
        <div className="flex items-center gap-3 animate-slide-in-right">
          <div className="text-right">
            <div className="font-display text-lg font-bold">{d.challengedName}</div>
            <div className="text-xs" style={{ color: d.challengedBeliefColor }}>{d.challengedBelief}</div>
          </div>
          <AgentAvatar avatar={d.challengedAvatar} name={d.challengedName} size="md" beliefColor={d.challengedBeliefColor} />
        </div>
      </div>

      {/* Topic + Phase */}
      <div className="flex items-center justify-between border-b border-agora-border px-6 py-3">
        <div className="text-sm text-agora-textSecondary">
          Topic: <span className="italic text-agora-text">"{d.topic}"</span>
        </div>
        <PhaseIndicator turnIndex={d.turnIndex} status={d.status} />
      </div>

      {/* Transcript */}
      <div className="max-h-96 overflow-y-auto p-4">
        {d.transcript.length === 0 ? (
          <div className="py-8 text-center text-sm text-agora-textMuted">
            {d.status === "waiting_acceptance" ? "Awaiting acceptance..." : "Debate starting..."}
          </div>
        ) : (
          <div className="space-y-3">
            {d.transcript.map((entry, i) => {
              const isChallenger = entry.role === "challenger";
              const color = isChallenger ? d.challengerBeliefColor : d.challengedBeliefColor;
              return (
                <div key={i} className={`flex gap-3 ${isChallenger ? "" : "flex-row-reverse"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg border px-4 py-3 ${isChallenger ? "rounded-tl-none" : "rounded-tr-none"}`}
                    style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="font-medium" style={{ color }}>{entry.agent}</span>
                      <span className="text-agora-textMuted">{PHASE_LABELS[entry.phase] || entry.phase}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-agora-text">{entry.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Verdict (if settled) */}
      {isSettled && d.analysis && (
        <div className="border-t border-agora-gold/30 bg-agora-gold/5 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚖️</span>
            <span className="font-display text-sm font-bold text-agora-gold">VERDICT</span>
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="font-bold text-agora-text">
              {d.status === "settled_stalemate" ? "STALEMATE" : `WINNER: ${d.winnerName}`}
            </span>
            {d.confidence && <span className="text-agora-textSecondary">Confidence: {d.confidence}/100</span>}
            {d.verdictTxHash && <TxBadge txHash={d.verdictTxHash} />}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-agora-textSecondary">{d.analysis}</p>
          {d.keyMoment && (
            <p className="mt-2 text-xs italic text-agora-textMuted">Key Moment: {d.keyMoment}</p>
          )}
        </div>
      )}

      {/* Stake info */}
      <div className="flex items-center justify-between border-t border-agora-border px-6 py-2 text-xs text-agora-textMuted">
        <span>Stake: {d.stakeAmount} ETH each</span>
        <div className="flex gap-2">
          {d.createTxHash && <TxBadge txHash={d.createTxHash} />}
          {d.acceptTxHash && <TxBadge txHash={d.acceptTxHash} />}
        </div>
      </div>
    </div>
  );
}