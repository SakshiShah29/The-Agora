import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ALL_AGENTS, BELIEF_COLORS, BELIEF_NAMES } from "@/lib/constants";

export async function GET() {
  try {
    const db = await getDb();
    const states = await db.collection("beliefStates").find({}).toArray();

    const beliefs = [1, 2, 3, 4].map((id) => {
      const adherents = (states as any[]).filter(
        (s) => s.coreBeliefId === id && s.isCurrentlyStaked
      );
      return {
        beliefId: id,
        name: BELIEF_NAMES[id],
        color: BELIEF_COLORS[id],
        adherentCount: adherents.length,
        totalStaked: adherents.length * 0.1,
        agents: adherents.map((s: any) => ({
          agentId: s.agentId,
          name: s.agentName || ALL_AGENTS[s.agentId]?.name || `Agent ${s.agentId}`,
          avatar: ALL_AGENTS[s.agentId]?.avatar || "default.png",
          conviction: s.conviction ?? 0,
        })),
      };
    });

    return NextResponse.json({ beliefs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}