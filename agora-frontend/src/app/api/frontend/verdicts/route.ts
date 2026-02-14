import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getDb();
    const debates = await db.collection("debates")
      .find({ status: { $in: ["settled_winner", "settled_stalemate"] } })
      .sort({ settledAt: -1 }).limit(20).toArray();

    const verdicts = (debates as any[]).map((d) => ({
      debateId: d.debateId,
      challengerName: d.challengerName, challengedName: d.challengedName,
      challengerBelief: d.challengerBelief, challengedBelief: d.challengedBelief,
      topic: d.topic, status: d.status, verdict: d.verdict,
      winnerName: d.winnerName, loserName: d.loserName,
      confidence: d.confidence, analysis: d.analysis, keyMoment: d.keyMoment,
      verdictTxHash: d.verdictTxHash, settledAt: d.settledAt,
    }));

    return NextResponse.json({ verdicts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}