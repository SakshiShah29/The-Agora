import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ALL_AGENTS, BELIEF_COLORS } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    const preaches = await db.collection("preaches")
      .find({}).sort({ createdAt: -1 }).limit(limit).toArray();

    const formatted = (preaches as any[]).map((p) => {
      const meta = ALL_AGENTS[p.agentId];
      return {
        agentId: p.agentId,
        agent: meta?.name || `Agent ${p.agentId}`,
        avatar: meta?.avatar || "default.png",
        belief: meta?.belief || "Unknown",
        beliefColor: meta ? (BELIEF_COLORS[meta.beliefId] || "#6b7280") : "#6b7280",
        content: p.content,
        preachNumber: p.preachNumber,
        createdAt: p.createdAt,
      };
    });

    return NextResponse.json({ preaches: formatted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}