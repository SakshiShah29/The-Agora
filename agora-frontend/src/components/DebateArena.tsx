"use client";
import { usePolling } from "@/lib/hook";
import { Debate } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { PhaseIndicator } from "./PhaseIndicator";
import { TxBadge } from "./TXBadge";
import { PHASE_LABELS } from "@/lib/constants";
import { DebateArenaSkeleton } from "./DebateArenaSkeleton";

export function DebateArena() {
  const { data, loading } = usePolling<{ active: boolean; debate: Debate | null }>(
    "/api/frontend/debate/active",
    3000
  );

  // Show skeleton while loading
  if (loading || !data) {
    return <DebateArenaSkeleton />;
  }

  if (!data.debate) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-agora-border/50 bg-linear-to-br from-agora-surface/80 to-agora-background/60 backdrop-blur-sm p-12 text-center shadow-xl">
        <div className="mb-4 text-6xl opacity-40">⚖️</div>
        <div className="font-display text-3xl font-bold bg-linear-to-r from-agora-gold via-agora-text to-agora-gold bg-clip-text text-transparent">
          The Forum is Quiet
        </div>
        <p className="mt-3 text-sm text-agora-textSecondary max-w-md">
          The arena stands empty, awaiting the next intellectual clash. Philosophers gather their thoughts...
        </p>
        <div className="mt-6 flex gap-2">
          <div className="h-2 w-2 rounded-full bg-agora-gold/40 animate-pulse" style={{ animationDelay: "0ms" }} />
          <div className="h-2 w-2 rounded-full bg-agora-gold/40 animate-pulse" style={{ animationDelay: "150ms" }} />
          <div className="h-2 w-2 rounded-full bg-agora-gold/40 animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  const d = data.debate;
  const isLive = data.active;
  const isSettled = d.status.startsWith("settled");

  return (
    <div className="overflow-hidden rounded-xl border border-agora-border/50 bg-linear-to-br from-agora-surface/90 to-agora-background/70 backdrop-blur-md shadow-2xl">
        {/* Header — VS Banner */}
        <div className="relative flex items-center justify-between border-b border-agora-border/50 px-6 py-5 bg-linear-to-r from-agora-surface/50 via-agora-surface to-agora-surface/50">
          {/* Left agent */}
          <div className="flex items-center gap-3 animate-slide-in-left">
            <AgentAvatar avatar={d.challengerAvatar} name={d.challengerName} size="md" beliefColor={d.challengerBeliefColor} />
            <div>
              <div className="font-display text-lg font-bold text-agora-text">{d.challengerName}</div>
              <div className="text-xs font-medium" style={{ color: d.challengerBeliefColor }}>{d.challengerBelief}</div>
            </div>
          </div>

          {/* VS / Status */}
          <div className="flex flex-col items-center gap-2">
            {isLive ? (
              <span className="relative rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-bold text-red-400 border border-red-500/30 shadow-lg">
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                LIVE
              </span>
            ) : isSettled ? (
              <span className="rounded-full bg-agora-gold/20 px-4 py-1.5 text-xs font-bold text-agora-gold border border-agora-gold/30 shadow-lg">SETTLED</span>
            ) : (
              <span className="rounded-full bg-purple-500/20 px-4 py-1.5 text-xs font-bold text-purple-400 border border-purple-500/30 shadow-lg">VERDICT PENDING</span>
            )}
            <span className="mt-1 font-display text-3xl font-black bg-linear-to-br from-agora-gold to-agora-textMuted bg-clip-text text-transparent">VS</span>
          </div>

          {/* Right agent */}
          <div className="flex items-center gap-3 animate-slide-in-right">
            <div className="text-right">
              <div className="font-display text-lg font-bold text-agora-text">{d.challengedName}</div>
              <div className="text-xs font-medium" style={{ color: d.challengedBeliefColor }}>{d.challengedBelief}</div>
            </div>
            <AgentAvatar avatar={d.challengedAvatar} name={d.challengedName} size="md" beliefColor={d.challengedBeliefColor} />
          </div>
        </div>

        {/* Topic + Phase */}
        <div className="flex items-center justify-between border-b border-agora-border/50 px-6 py-4 bg-agora-surface/30">
          <div className="text-sm text-agora-textSecondary">
            <span className="text-agora-textMuted">Topic:</span> <span className="italic text-agora-text font-medium ml-1">"{d.topic}"</span>
          </div>
          <PhaseIndicator turnIndex={d.turnIndex} status={d.status} />
        </div>

        {/* Transcript */}
        <div className="max-h-96 overflow-y-auto p-5 space-y-1 bg-agora-background/20">
          {d.transcript.length === 0 ? (
            <div className="py-12 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-agora-surface/50 border border-agora-border/30">
                <div className="h-2 w-2 rounded-full bg-agora-gold/60 animate-pulse" />
                <span className="text-sm text-agora-textMuted font-medium">
                  {d.status === "waiting_acceptance" ? "Awaiting acceptance..." : "Debate starting..."}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {d.transcript.map((entry, i) => {
                const isChallenger = entry.role === "challenger";
                const color = isChallenger ? d.challengerBeliefColor : d.challengedBeliefColor;
                return (
                  <div
                    key={i}
                    className={`flex gap-3 ${isChallenger ? "" : "flex-row-reverse"} animate-fade-in`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div
                      className={`max-w-[75%] rounded-xl border backdrop-blur-sm px-4 py-3 shadow-lg ${
                        isChallenger ? "rounded-tl-none" : "rounded-tr-none"
                      }`}
                      style={{
                        borderColor: `${color}40`,
                        backgroundColor: `${color}0A`,
                        boxShadow: `0 4px 12px ${color}15`
                      }}
                    >
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <span className="font-semibold" style={{ color }}>{entry.agent}</span>
                        <span className="text-agora-textMuted/70">•</span>
                        <span className="text-agora-textMuted text-[10px] uppercase tracking-wide">{PHASE_LABELS[entry.phase] || entry.phase}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-agora-text/90">{entry.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Verdict (if settled) */}
        {isSettled && d.analysis && (
          <div className="border-t border-agora-gold/40 bg-linear-to-br from-agora-gold/10 to-agora-gold/5 px-6 py-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚖️</span>
              <span className="font-display text-base font-bold text-agora-gold tracking-wide">FINAL VERDICT</span>
            </div>
            <div className="flex items-center gap-4 text-sm mb-3">
              <span className="font-bold text-agora-text text-base">
                {d.status === "settled_stalemate" ? "⚡ STALEMATE" : `🏆 WINNER: ${d.winnerName}`}
              </span>
              {d.confidence && (
                <span className="px-2 py-1 rounded-md bg-agora-surface/50 text-agora-textSecondary text-xs">
                  Confidence: <span className="font-bold text-agora-gold">{d.confidence}</span>/100
                </span>
              )}
              {d.verdictTxHash && <TxBadge txHash={d.verdictTxHash} />}
            </div>
            <p className="text-sm leading-relaxed text-agora-textSecondary/90 italic border-l-2 border-agora-gold/30 pl-3">
              {d.analysis}
            </p>
            {d.keyMoment && (
              <p className="mt-3 text-xs text-agora-textMuted bg-agora-surface/30 rounded-lg px-3 py-2">
                <span className="font-semibold text-agora-gold">Key Moment:</span> {d.keyMoment}
              </p>
            )}
          </div>
        )}

        {/* Stake info */}
        <div className="flex items-center justify-between border-t border-agora-border/50 bg-agora-surface/40 px-6 py-3 text-xs">
          <span className="text-agora-textMuted">
            <span className="font-medium text-agora-text">Stake:</span> {d.stakeAmount} ETH each
          </span>
          <div className="flex gap-2">
            {d.createTxHash && <TxBadge txHash={d.createTxHash} />}
            {d.acceptTxHash && <TxBadge txHash={d.acceptTxHash} />}
          </div>
        </div>
      </div>
  );
}
