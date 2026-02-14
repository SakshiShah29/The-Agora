"use client";
import { usePolling } from "@/lib/hook";
import { FeedEvent } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { TxBadge } from "./TXBadge";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ActivityFeed() {
  const { data } = usePolling<{ events: FeedEvent[] }>("/api/frontend/feed?limit=20", 5000);

  if (!data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-agora-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {data.events.map((event, i) => {
        const isVerdict = event.type === "verdict";
        return (
          <div
            key={`${event.type}-${event.timestamp}-${i}`}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-agora-surfaceHover ${
              isVerdict ? "border border-agora-gold/20 bg-agora-gold/5" : ""
            }`}
          >
            <span className="text-base">{event.icon}</span>
            <AgentAvatar avatar={event.avatar} name={event.agent} size="sm" beliefColor={event.beliefColor} />
            <span className={`flex-1 text-sm ${isVerdict ? "font-medium text-agora-gold" : "text-agora-textSecondary"}`}>
              {event.description}
            </span>
            {event.txHash && <TxBadge txHash={event.txHash} />}
            {event.timestamp && (
              <span className="text-[10px] text-agora-textMuted">{timeAgo(event.timestamp)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}