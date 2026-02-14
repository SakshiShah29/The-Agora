"use client";
import { usePolling } from "@/lib/hook";
import { Agent } from "@/lib/types";
import { AgentCard } from "./AgentCard";
import { TempleStepsFeed } from "./TempleStepsFeed";
import { Skeleton } from "./ui/skeleton";

export function AgentGrid() {
  const { data, loading } = usePolling<{ agents: Agent[] }>("/api/frontend/agents", 10000);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent cards skeleton - left side */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl bg-agora-surface/50" />
          ))}
        </div>
        {/* Temple Steps skeleton - right side */}
        <div className="hidden lg:block">
          <Skeleton className="h-full min-h-[600px] rounded-2xl bg-agora-surface/50" />
        </div>
      </div>
    );
  }

  // Filter out Chronicler (agentId: 9) as it's a judge, not a participant
  const filteredAgents = data.agents.filter(agent => agent.agentId !== 9);

  const sorted = [...filteredAgents].sort((a, b) => {
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return b.conviction - a.conviction;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Agent Cards - Left Side (Half Width) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {sorted.map((agent) => (
          <AgentCard key={agent.agentId} agent={agent} />
        ))}
      </div>

      {/* Temple Steps - Right Side (Half Width) */}
      <div className="hidden lg:block">
        <div className="sticky top-6">
          <TempleStepsFeed />
        </div>
      </div>
    </div>
  );
}
