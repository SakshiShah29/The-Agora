"use client";
import { usePolling } from "@/lib/hook";
import { BeliefPool } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";

export function BeliefPools() {
  const { data } = usePolling<{ beliefs: BeliefPool[] }>("/api/frontend/beliefs", 30000);

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {data.beliefs.map((b) => (
        <div key={b.beliefId} className="rounded-xl border border-agora-border bg-agora-surface p-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
            <span className="font-display text-sm font-bold" style={{ color: b.color }}>{b.name}</span>
          </div>

          <div className="mt-3 space-y-1 text-xs text-agora-textSecondary">
            <div className="flex justify-between">
              <span>Adherents</span>
              <span className="font-medium text-agora-text">{b.adherentCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Staked</span>
              <span className="font-medium text-agora-text">{b.totalStaked.toFixed(1)} ETH</span>
            </div>
          </div>

          {b.agents.length > 0 && (
            <div className="mt-3 flex -space-x-2">
              {b.agents.map((a) => (
                <AgentAvatar key={a.agentId} avatar={a.avatar} name={a.name} size="sm" beliefColor={b.color} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}