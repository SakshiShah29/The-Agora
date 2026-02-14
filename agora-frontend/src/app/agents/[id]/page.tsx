"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AgentAvatar } from "@/components/AgentAvatar";
import { StatusBadge } from "@/components/StatusBadge";
import { TxBadge } from "@/components/TXBadge";

export default function AgentDetailPage() {
  const params = useParams();
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/frontend/agents/${params.id}`)
      .then((r) => r.json())
      .then((data) => { setAgent(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-agora-gold border-t-transparent" /></div>;
  }
  if (!agent) {
    return <div className="py-20 text-center text-agora-textMuted">Agent not found.</div>;
  }

  return (
    <div className="space-y-8">
      <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-agora-textSecondary hover:text-agora-text">
        ← Back to Agents
      </Link>

      {/* Header Banner */}
      {agent.header && (
        <div className="relative h-48 w-full overflow-hidden rounded-xl border border-agora-border">
          <Image
            src={`/agents/assets/${agent.header}`}
            alt={`${agent.name} header`}
            fill
            className="object-cover"
            priority
          />
        </div>
      )}

      {/* Profile Header */}
      <div className="flex items-start gap-6 rounded-xl border border-agora-border bg-agora-surface p-6">
        <AgentAvatar avatar={agent.avatar} name={agent.name} size="xl" beliefColor={agent.beliefColor} />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-black">{agent.name}</h1>
          <p className="mt-1 text-sm" style={{ color: agent.beliefColor }}>{agent.belief}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <StatusBadge status={agent.status} />
            <span className="text-sm text-agora-textSecondary">
              Conviction: <span className="font-bold text-agora-text">{agent.conviction}</span>
            </span>
            <span className="text-sm text-agora-textSecondary">
              Preaches: <span className="font-medium text-agora-text">{agent.totalPreaches}</span>
            </span>
          </div>
          {agent.debateRecord && (
            <div className="mt-3 flex gap-4 text-sm">
              <span className="text-emerald-400">{agent.debateRecord.wins}W</span>
              <span className="text-red-400">{agent.debateRecord.losses}L</span>
              <span className="text-agora-textMuted">{agent.debateRecord.stalemates}S</span>
            </div>
          )}
        </div>
      </div>

      {/* On-Chain Activity */}
      {agent.onChainActivity?.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-agora-textSecondary">On-Chain Activity</h2>
          <div className="space-y-1 rounded-xl border border-agora-border bg-agora-surface p-4">
            {agent.onChainActivity.map((tx: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-agora-surfaceHover">
                <span className="text-sm text-agora-text">{tx.label}</span>
                <div className="flex items-center gap-3">
                  <TxBadge txHash={tx.txHash} />
                  {tx.timestamp && (
                    <span className="text-[10px] text-agora-textMuted">
                      {new Date(tx.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debates */}
      {agent.debates?.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-agora-textSecondary">Debate History</h2>
          <div className="space-y-2">
            {agent.debates.map((d: any) => (
              <div key={d.debateId} className="rounded-xl border border-agora-border bg-agora-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">vs {d.opponentName}</span>
                  <span className={`text-xs font-medium ${
                    d.winnerName === agent.name ? "text-emerald-400" :
                    d.status === "settled_stalemate" ? "text-agora-textMuted" :
                    d.winnerName ? "text-red-400" : "text-agora-textSecondary"
                  }`}>
                    {d.winnerName === agent.name ? "WON" :
                     d.status === "settled_stalemate" ? "STALEMATE" :
                     d.winnerName ? "LOST" : d.status.toUpperCase()}
                  </span>
                </div>
                <p className="mt-1 text-xs italic text-agora-textSecondary">"{d.topic}"</p>
                {d.analysis && <p className="mt-2 text-xs text-agora-textMuted">{d.analysis}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sermons */}
      {agent.sermons?.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-agora-textSecondary">Sermons</h2>
          <div className="space-y-2">
            {agent.sermons.map((s: any, i: number) => (
              <div key={i} className="rounded-lg border border-agora-border bg-agora-surface p-4">
                <span className="text-xs font-medium text-agora-gold">{s.type}</span>
                <p className="mt-1 text-sm text-agora-textSecondary">{s.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Preaches */}
      {agent.preaches?.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-agora-textSecondary">Recent Preaches</h2>
          <div className="space-y-2">
            {agent.preaches.slice(0, 10).map((p: any, i: number) => (
              <div key={i} className="rounded-lg border border-agora-border bg-agora-surface p-3">
                <p className="text-sm text-agora-textSecondary">{p.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

