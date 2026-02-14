import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ALL_AGENTS, BELIEF_COLORS } from "@/lib/constants";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const agentId = parseInt(id);
    const meta = ALL_AGENTS[agentId];
    if (!meta) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

    const db = await getDb();
    const state = await db.collection("beliefStates").findOne({ agentId });

    const sermons = await db.collection("sermons")
      .find({ agentId }).sort({ createdAt: 1 }).toArray();

    const preaches = await db.collection("preaches")
      .find({ agentId }).sort({ createdAt: -1 }).limit(50).toArray();

    const debates = await db.collection("debates")
      .find({ $or: [{ challengerId: agentId }, { challengedId: agentId }] })
      .sort({ createdAt: -1 }).toArray();

    const onChainActivity: any[] = [];
    if (state?.entryTxHash) {
      onChainActivity.push({ type: "entered_agora", label: "Entered The Agora",
        txHash: state.entryTxHash, timestamp: state.entryTime ? new Date(state.entryTime).toISOString() : null });
    }
    if (state?.stakeTxHash) {
      onChainActivity.push({ type: "staked_belief", label: `Staked on ${meta.belief}`,
        txHash: state.stakeTxHash, timestamp: null });
    }
    for (const d of debates as any[]) {
      if (d.createTxHash && d.challengerId === agentId)
        onChainActivity.push({ type: "debate_challenge", label: `Challenged ${d.challengedName}`,
          txHash: d.createTxHash, timestamp: d.createdAt });
      if (d.acceptTxHash && d.challengedId === agentId)
        onChainActivity.push({ type: "debate_accept", label: `Accepted challenge from ${d.challengerName}`,
          txHash: d.acceptTxHash, timestamp: d.acceptedAt });
      if (d.verdictTxHash) {
        const won = d.winnerId === agentId;
        const stale = d.status === "settled_stalemate";
        onChainActivity.push({ type: "verdict",
          label: stale ? "Debate stalemate" : won ? "Won debate" : "Lost debate",
          txHash: d.verdictTxHash, timestamp: d.settledAt });
      }
    }

    return NextResponse.json({
      agentId, name: state?.agentName || meta.name, avatar: meta.avatar, header: meta.header,
      beliefId: meta.beliefId, belief: meta.belief,
      beliefColor: BELIEF_COLORS[meta.beliefId] || "#6b7280",
      conviction: state?.conviction ?? 0,
      status: state ? getStatus(state) : "coming_soon",
      active: !!state,
      hasEnteredAgora: state?.hasEnteredAgora || false,
      isCurrentlyStaked: state?.isCurrentlyStaked || false,
      sermonsDelivered: state?.sermonsDelivered || 0,
      totalPreaches: (state?.sermonsDelivered || 0) + (state?.postOnboardPreaches || 0),
      sermons: sermons.map((s: any) => ({ type: s.type, content: s.content, createdAt: s.createdAt })),
      preaches: preaches.map((p: any) => ({ content: p.content, preachNumber: p.preachNumber, createdAt: p.createdAt })),
      debates: debates.map((d: any) => ({
        debateId: d.debateId,
        opponentName: d.challengerId === agentId ? d.challengedName : d.challengerName,
        topic: d.topic, status: d.status, verdict: d.verdict,
        confidence: d.confidence, analysis: d.analysis,
        winnerName: d.winnerName, createdAt: d.createdAt,
      })),
      debateRecord: {
        wins: debates.filter((d: any) => d.winnerId === agentId).length,
        losses: debates.filter((d: any) => d.loserId === agentId).length,
        stalemates: debates.filter((d: any) => d.status === "settled_stalemate").length,
      },
      onChainActivity,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getStatus(state: any): string {
  if (state.awaitingVerdict) return "awaiting_verdict";
  if (state.inDebate) return "in_debate";
  if (!state.hasEnteredAgora) return "not_entered";
  if (!state.isCurrentlyStaked) return "not_staked";
  if ((state.sermonsDelivered || 0) < 3) return "onboarding";
  return "preaching";
}