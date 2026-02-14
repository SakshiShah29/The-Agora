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
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        isActive
          ? "border-agora-border/50 bg-linear-to-br from-agora-surface/90 to-agora-background/70 hover:border-agora-textMuted/50 hover:shadow-2xl hover:scale-[1.02] cursor-pointer backdrop-blur-sm"
          : "border-agora-border/30 bg-agora-surface/40 cursor-default opacity-50"
      }`}
    >
      {/* Decorative gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${agent.beliefColor}15, transparent 70%)`
        }}
      />

      {/* Belief color accent - top border */}
      <div
        className="absolute left-0 right-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, transparent, ${agent.beliefColor}, transparent)`
        }}
      />

      <div className="relative flex flex-col items-center gap-4 p-6">
        {/* Avatar with glow effect */}
        <div className="relative">
          <AgentAvatar
            avatar={agent.avatar}
            name={agent.name}
            size="xl"
            beliefColor={agent.beliefColor}
            inactive={!isActive}
          />
          {isActive && (
            <div
              className="absolute -inset-2 rounded-full opacity-20 blur-xl"
              style={{ backgroundColor: agent.beliefColor }}
            />
          )}
        </div>

        {/* Agent Info */}
        <div className="text-center space-y-2 w-full">
          <h3 className="font-display text-xl font-bold text-agora-text group-hover:text-agora-gold transition-colors">
            {agent.name}
          </h3>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border"
            style={{
              color: agent.beliefColor,
              borderColor: `${agent.beliefColor}40`,
              backgroundColor: `${agent.beliefColor}10`
            }}
          >
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: agent.beliefColor }}
            />
            {agent.belief}
          </div>
        </div>

        {/* Stats or Status */}
        {isActive ? (
          <div className="w-full space-y-3">
            {/* Conviction Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-agora-textMuted">Conviction</span>
                <span className="font-bold text-agora-text">{agent.conviction}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-agora-background/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(agent.conviction, 100)}%`,
                    backgroundColor: agent.beliefColor,
                    boxShadow: `0 0 8px ${agent.beliefColor}60`
                  }}
                />
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex justify-center">
              <StatusBadge status={agent.status} />
            </div>

            {/* Additional Stats */}
            {agent.totalPreaches > 0 && (
              <div className="flex items-center justify-center gap-4 text-xs text-agora-textSecondary pt-2 border-t border-agora-border/30">
                <div className="flex items-center gap-1">
                  <span className="text-agora-textMuted">Preaches:</span>
                  <span className="font-semibold text-agora-text">{agent.totalPreaches}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <span className="text-sm font-medium text-agora-textMuted italic">Coming Soon</span>
            <div className="flex gap-1">
              <div className="h-1 w-1 rounded-full bg-agora-textMuted/40 animate-pulse" style={{ animationDelay: "0ms" }} />
              <div className="h-1 w-1 rounded-full bg-agora-textMuted/40 animate-pulse" style={{ animationDelay: "150ms" }} />
              <div className="h-1 w-1 rounded-full bg-agora-textMuted/40 animate-pulse" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Hover indicator */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-linear-to-r from-transparent via-agora-gold to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
    </Link>
  );
}
