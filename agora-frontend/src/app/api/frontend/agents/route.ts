import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ALL_AGENTS, BELIEF_COLORS } from "@/lib/constants";

export async function GET() {
  try {
    const db = await getDb();
    const states = await db.collection("beliefStates").find({}).toArray();
    const stateMap = new Map(states.map((s: any) => [s.agentId, s]));

    const agents = Object.entries(ALL_AGENTS).map(([idStr, meta]) => {
      const id = parseInt(idStr);
      const state = stateMap.get(id) as any;

      if (state) {
        return {
          agentId: id,
          name: state.agentName || meta.name,
          avatar: meta.avatar,
          beliefId: meta.beliefId,
          belief: meta.belief,
          beliefColor: BELIEF_COLORS[meta.beliefId] || "#6b7280",
          conviction: state.conviction ?? 0,
          status: getStatus(state),
          hasEnteredAgora: state.hasEnteredAgora || false,
          isCurrentlyStaked: state.isCurrentlyStaked || false,
          sermonsDelivered: state.sermonsDelivered || 0,
          totalPreaches: (state.sermonsDelivered || 0) + (state.postOnboardPreaches || 0),
          entryTxHash: state.entryTxHash || null,
          stakeTxHash: state.stakeTxHash || null,
          active: true,
        };
      }

      return {
        agentId: id,
        name: meta.name,
        avatar: meta.avatar,
        beliefId: meta.beliefId,
        belief: meta.belief,
        beliefColor: BELIEF_COLORS[meta.beliefId] || "#6b7280",
        conviction: 0,
        status: "coming_soon",
        hasEnteredAgora: false,
        isCurrentlyStaked: false,
        sermonsDelivered: 0,
        totalPreaches: 0,
        entryTxHash: null,
        stakeTxHash: null,
        active: false,
      };
    });

    return NextResponse.json({ agents });
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