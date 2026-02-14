import Link from "next/link";
import { Agent } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { StatusBadge } from "./StatusBadge";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const isActive = agent.active;

  return (
    <Link
      href={isActive ? `/agents/${agent.agentId}` : "#"}
      className={`group relative flex flex-col items-center gap-3 rounded-xl border border-agora-border bg-agora-surface p-5 transition-all ${
        isActive
          ? "hover:border-agora-textMuted hover:bg-agora-surfaceHover cursor-pointer"
          : "cursor-default opacity-60"
      }`}
    >
      {/* Belief color top accent */}
      <div
        className="absolute left-0 right-0 top-0 h-0.5 rounded-t-xl"
        style={{ backgroundColor: agent.beliefColor }}
      />

      <AgentAvatar
        avatar={agent.avatar}
        name={agent.name}
        size="lg"
        beliefColor={agent.beliefColor}
        inactive={!isActive}
      />

      <div className="text-center">
        <h3 className="font-display text-lg font-bold">{agent.name}</h3>
        <p className="text-sm" style={{ color: agent.beliefColor }}>
          {agent.belief}
        </p>
      </div>

      {isActive ? (
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-agora-textSecondary">
            Conviction: <span className="font-medium text-agora-text">{agent.conviction}</span>
          </div>
          <StatusBadge status={agent.status} />
        </div>
      ) : (
        <span className="text-sm italic text-agora-textMuted">Coming Soon</span>
      )}
    </Link>
  );
}