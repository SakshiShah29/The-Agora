"use client";
import { usePolling } from "@/lib/hook";
import { Agent } from "@/lib/types";
import { AgentCard } from "./AgentCard";

export function AgentGrid() {
  const { data } = usePolling<{ agents: Agent[] }>("/api/frontend/agents", 10000);

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-agora-surface" />
        ))}
      </div>
    );
  }

  const sorted = [...data.agents].sort((a, b) => {
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return b.conviction - a.conviction;
  });

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {sorted.map((agent) => (
        <AgentCard key={agent.agentId} agent={agent} />
      ))}
    </div>
  );
}