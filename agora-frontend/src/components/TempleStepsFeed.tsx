"use client";
import { usePolling } from "@/lib/hook";
import { Preach } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TempleStepsFeed() {
  const { data } = usePolling<{ preaches: Preach[] }>("/api/frontend/preaches?limit=15", 5000);

  if (!data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-agora-surface" />
        ))}
      </div>
    );
  }

  if (data.preaches.length === 0) {
    return (
      <div className="rounded-lg border border-agora-border bg-agora-surface p-6 text-center text-sm text-agora-textMuted">
        No preaches yet. The temple steps are empty.
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "500px" }}>
      {data.preaches.map((preach, i) => (
        <div
          key={`${preach.agentId}-${preach.preachNumber}-${i}`}
          className="rounded-lg border border-agora-border bg-agora-surface p-3 transition-colors hover:bg-agora-surfaceHover animate-fade-in"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <div className="mb-2 flex items-center gap-2">
            <AgentAvatar avatar={preach.avatar} name={preach.agent} size="sm" beliefColor={preach.beliefColor} />
            <span className="text-sm font-medium">{preach.agent}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${preach.beliefColor}18`, color: preach.beliefColor }}
            >
              {preach.belief}
            </span>
            <span className="ml-auto text-[10px] text-agora-textMuted">
              {preach.createdAt ? timeAgo(preach.createdAt) : ""}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-agora-textSecondary">{preach.content}</p>
        </div>
      ))}
    </div>
  );
}