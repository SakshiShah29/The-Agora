import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ALL_AGENTS, BELIEF_COLORS } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "30");
    const events: any[] = [];

    const states = await db.collection("beliefStates").find({}).toArray();
    for (const s of states as any[]) {
      const meta = ALL_AGENTS[s.agentId];
      if (!meta) continue;

      if (s.hasEnteredAgora) {
        events.push({
          type: "agent_entry", icon: "🏛️", agent: meta.name, agentId: s.agentId,
          avatar: meta.avatar, beliefColor: BELIEF_COLORS[meta.beliefId],
          description: `${meta.name} entered The Agora`,
          txHash: s.entryTxHash || null,
          timestamp: s.entryTime ? new Date(s.entryTime).toISOString() : null,
        });
      }
      if (s.isCurrentlyStaked) {
        events.push({
          type: "stake", icon: "💰", agent: meta.name, agentId: s.agentId,
          avatar: meta.avatar, beliefColor: BELIEF_COLORS[meta.beliefId],
          description: `${meta.name} staked 0.1 ETH on ${meta.belief}`,
          txHash: s.stakeTxHash || null,
          timestamp: s.entryTime ? new Date(s.entryTime + 1000).toISOString() : null,
        });
      }
    }

    // Sermons
    const sermons = await db.collection("sermons").find({}).sort({ createdAt: -1 }).limit(20).toArray();
    for (const s of sermons as any[]) {
      const meta = ALL_AGENTS[s.agentId];
      events.push({
        type: "sermon", icon: "📜", agent: meta?.name || `Agent ${s.agentId}`,
        agentId: s.agentId, avatar: meta?.avatar || "default.png",
        beliefColor: meta ? BELIEF_COLORS[meta.beliefId] : undefined,
        description: `${meta?.name || "Agent"} delivered ${s.type || "sermon"}`,
        txHash: null, timestamp: s.createdAt,
      });
    }

    // Debate events
    const debates = await db.collection("debates").find({}).sort({ createdAt: -1 }).limit(20).toArray();
    for (const d of debates as any[]) {
      const challengerMeta = ALL_AGENTS[d.challengerId];
      const challengedMeta = ALL_AGENTS[d.challengedId];

      events.push({
        type: "debate_challenge", icon: "⚔️", agent: d.challengerName,
        agentId: d.challengerId, avatar: challengerMeta?.avatar || "default.png",
        beliefColor: challengerMeta ? BELIEF_COLORS[challengerMeta.beliefId] : undefined,
        description: `${d.challengerName} challenged ${d.challengedName}`,
        txHash: d.createTxHash || null, timestamp: d.createdAt,
      });

      if (d.acceptTxHash) {
        events.push({
          type: "debate_accept", icon: "🤝", agent: d.challengedName,
          agentId: d.challengedId, avatar: challengedMeta?.avatar || "default.png",
          beliefColor: challengedMeta ? BELIEF_COLORS[challengedMeta.beliefId] : undefined,
          description: `${d.challengedName} accepted the challenge`,
          txHash: d.acceptTxHash, timestamp: d.acceptedAt,
        });
      }

      if (d.settledAt) {
        const isStalemate = d.status === "settled_stalemate";
        events.push({
          type: "verdict", icon: "⚖️", agent: "Chronicler", agentId: 9,
          avatar: "chronicler.png",
          beliefColor: BELIEF_COLORS[0],
          description: isStalemate
            ? `STALEMATE — ${d.challengerName} vs ${d.challengedName}`
            : `VERDICT: ${d.winnerName} defeats ${d.loserName}`,
          txHash: d.verdictTxHash || null, timestamp: d.settledAt,
          verdict: {
            debateId: d.debateId, winnerName: d.winnerName, loserName: d.loserName,
            confidence: d.confidence, analysis: d.analysis, topic: d.topic,
          },
        });
      }
    }

    events.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({ events: events.slice(0, limit) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}