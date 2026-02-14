import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ALL_AGENTS, BELIEF_COLORS } from "@/lib/constants";

export async function GET() {
  try {
    const db = await getDb();

    let debate = await db.collection("debates").findOne({
      status: { $in: ["waiting_acceptance", "active", "concluded"] },
    });

    if (!debate) {
      debate = await db.collection("debates")
        .findOne(
          { status: { $in: ["settled_winner", "settled_stalemate"] } },
          { sort: { settledAt: -1 } }
        );

      if (!debate) return NextResponse.json({ active: false, debate: null });
      return NextResponse.json({ active: false, debate: formatDebate(debate) });
    }

    return NextResponse.json({
      active: debate.status === "active" || debate.status === "waiting_acceptance",
      debate: formatDebate(debate),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function formatDebate(d: any) {
  const cMeta = ALL_AGENTS[d.challengerId];
  const dMeta = ALL_AGENTS[d.challengedId];
  return {
    debateId: d.debateId,
    onChainDebateId: d.onChainDebateId,
    challengerName: d.challengerName,
    challengerId: d.challengerId,
    challengerBelief: d.challengerBelief,
    challengerAvatar: cMeta?.avatar || "default.png",
    challengerBeliefColor: BELIEF_COLORS[cMeta?.beliefId] || "#6b7280",
    challengedName: d.challengedName,
    challengedId: d.challengedId,
    challengedBelief: d.challengedBelief,
    challengedAvatar: dMeta?.avatar || "default.png",
    challengedBeliefColor: BELIEF_COLORS[dMeta?.beliefId] || "#6b7280",
    topic: d.topic,
    stakeAmount: d.stakeAmount || "0.001",
    status: d.status,
    turnIndex: d.turnIndex || 0,
    transcript: (d.transcript || []).map((t: any) => ({
      agent: t.agent, agentId: t.agentId, role: t.role,
      phase: t.phase, content: t.content, timestamp: t.timestamp,
    })),
    verdict: d.verdict || null,
    confidence: d.confidence || null,
    analysis: d.analysis || null,
    keyMoment: d.keyMoment || null,
    winnerName: d.winnerName || null,
    loserName: d.loserName || null,
    createTxHash: d.createTxHash || null,
    acceptTxHash: d.acceptTxHash || null,
    verdictTxHash: d.verdictTxHash || null,
    createdAt: d.createdAt,
    acceptedAt: d.acceptedAt || null,
    concludedAt: d.concludedAt || null,
    settledAt: d.settledAt || null,
  };
}