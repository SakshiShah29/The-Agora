// ─── routes/chronicler.ts ─────────────────────────────────────────────────────
// Chronicler routes for The Agora server.
//
// Usage in index.ts:
//   import { createChroniclerRouter } from "./routes/chronicler";
//   const chroniclerRouter = createChroniclerRouter(db, {
//     publicClient, getWalletClient, BELIEF_POOL
//   });
//   app.use(chroniclerRouter);

import { Router } from "express";
import type { Db } from "mongodb";

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ─── BeliefPool ABI (chronicler verdict function) ────────────────────────────

const BELIEF_POOL_CHRONICLER_ABI = [
  {
    name: "submitDebateVerdict",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "debateId", type: "uint256" },
      { name: "verdict", type: "string" },
    ],
    outputs: [],
  },
] as const;

// ─── Chronicler agent ID ─────────────────────────────────────────────────────

const CHRONICLER_AGENT_ID = "9";

// ─── Types for dependencies ──────────────────────────────────────────────────

interface ChroniclerRouterDeps {
  publicClient: any;
  getWalletClient: (agentId: string) => any;
  BELIEF_POOL: `0x${string}`;
}

// ─── Router factory ──────────────────────────────────────────────────────────

export function createChroniclerRouter(db: Db, deps: ChroniclerRouterDeps): Router {
  const router = Router();
  const { publicClient, getWalletClient, BELIEF_POOL } = deps;

  // ─── GET /api/chronicler/pending-verdict ─────────────────────────────────
  // Returns the first debate with status == "concluded" (needs judging)
  // Includes full transcript + participant conviction scores

  router.get("/api/chronicler/pending-verdict", async (req, res) => {
    try {
      const debate = await db.collection("debates").findOne({
        status: "concluded",
      });

      if (!debate) {
        return res.json({ pending: false });
      }

      // Get conviction scores for both participants
      const challengerState = await db.collection("beliefStates").findOne({
        agentId: debate.challengerId,
      });
      const challengedState = await db.collection("beliefStates").findOne({
        agentId: debate.challengedId,
      });

      console.log(`[${ts()}]    chronicler: found pending debate ${debate.debateId} — ${debate.challengerName} vs ${debate.challengedName}`);
      console.log(`[${ts()}]    chronicler: transcript has ${(debate.transcript || []).length} entries`);

      res.json({
        pending: true,
        debate: {
          debateId: debate.debateId,
          onChainDebateId: debate.onChainDebateId,
          challengerName: debate.challengerName,
          challengerId: debate.challengerId,
          challengerBelief: debate.challengerBelief,
          challengedName: debate.challengedName,
          challengedId: debate.challengedId,
          challengedBelief: debate.challengedBelief,
          topic: debate.topic,
          transcript: debate.transcript || [],
          challengerConviction: challengerState?.conviction ?? 0,
          challengedConviction: challengedState?.conviction ?? 0,
          concludedAt: debate.concludedAt,
        },
      });
    } catch (err: any) {
      console.error(`[${ts()}]    chronicler: ❌ PENDING-VERDICT FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/chronicler/submit-verdict ─────────────────────────────────
  // 1. ON-CHAIN: calls BeliefPool.submitDebateVerdict(debateId, verdict)
  // 2. DB: updates debate status + stores verdict details
  // 3. DB: clears awaitingVerdict on both agents
  // 4. Returns participant info for announcement

  router.post("/api/chronicler/submit-verdict", async (req, res) => {
    try {
      const { debateId, verdict, confidence, analysis, keyMoment } = req.body;

      // Validate inputs
      if (!debateId || !verdict || confidence === undefined || !analysis || !keyMoment) {
        return res.status(400).json({
          error: "Required fields: debateId, verdict, confidence, analysis, keyMoment",
        });
      }

      const validVerdicts = ["winner_agent_a", "winner_agent_b", "stalemate"];
      if (!validVerdicts.includes(verdict)) {
        return res.status(400).json({
          error: `verdict must be one of: ${validVerdicts.join(", ")}`,
        });
      }

      if (confidence < 0 || confidence > 100) {
        return res.status(400).json({ error: "confidence must be 0-100" });
      }

      // Find the debate
      const debate = await db.collection("debates").findOne({
        debateId: parseInt(debateId) || debateId,
        status: "concluded",
      });

      if (!debate) {
        return res.status(404).json({
          error: "No concluded debate found with this debateId. It may have already been settled.",
        });
      }

      // ─── ON-CHAIN: submitDebateVerdict ────────────────────────────────────
      const onChainId = debate.onChainDebateId;
      console.log(`[${ts()}]    chronicler: submitting verdict for debate ${onChainId} on-chain...`);
      console.log(`[${ts()}]    chronicler: verdict="${verdict}" confidence=${confidence}`);

      const walletClient = getWalletClient(CHRONICLER_AGENT_ID);
      const txHash = await walletClient.writeContract({
        address: BELIEF_POOL,
        abi: BELIEF_POOL_CHRONICLER_ABI,
        functionName: "submitDebateVerdict",
        args: [BigInt(onChainId), verdict],
      });
      console.log(`[${ts()}]    chronicler: submitDebateVerdict tx sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[${ts()}]    chronicler: ✅ submitDebateVerdict confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

      // ─── Determine winner/loser names ───────────────────────────────────
      let winnerName: string | null = null;
      let loserName: string | null = null;
      let winnerId: number | null = null;
      let loserId: number | null = null;
      let settledStatus = "settled_stalemate";

      if (verdict === "winner_agent_a") {
        winnerName = debate.challengerName;
        winnerId = debate.challengerId;
        loserName = debate.challengedName;
        loserId = debate.challengedId;
        settledStatus = "settled_winner";
      } else if (verdict === "winner_agent_b") {
        winnerName = debate.challengedName;
        winnerId = debate.challengedId;
        loserName = debate.challengerName;
        loserId = debate.challengerId;
        settledStatus = "settled_winner";
      }

      // ─── DB: update debate status ───────────────────────────────────────
      await db.collection("debates").updateOne(
        { debateId: debate.debateId },
        {
          $set: {
            status: settledStatus,
            verdict,
            confidence,
            analysis,
            keyMoment,
            winnerId,
            winnerName,
            loserId,
            loserName,
            verdictTxHash: txHash,
            settledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      );

      // ─── DB: clear awaitingVerdict on both agents ───────────────────────
      await db.collection("beliefStates").updateOne(
        { agentId: debate.challengerId },
        { $set: { awaitingVerdict: false } }
      );
      await db.collection("beliefStates").updateOne(
        { agentId: debate.challengedId },
        { $set: { awaitingVerdict: false } }
      );

      // ─── Get current conviction scores for response ─────────────────────
      const challengerState = await db.collection("beliefStates").findOne({
        agentId: debate.challengerId,
      });
      const challengedState = await db.collection("beliefStates").findOne({
        agentId: debate.challengedId,
      });

      console.log(`[${ts()}]    chronicler: ⚖️  VERDICT DELIVERED — debate ${debate.debateId}`);
      if (winnerName) {
        console.log(`[${ts()}]    chronicler: WINNER: ${winnerName} | LOSER: ${loserName} | confidence: ${confidence}`);
      } else {
        console.log(`[${ts()}]    chronicler: STALEMATE | confidence: ${confidence}`);
      }
      console.log(`[${ts()}]    chronicler: awaitingVerdict cleared for agents ${debate.challengerId} & ${debate.challengedId}`);

      res.json({
        status: "verdict_submitted",
        debateId: debate.debateId,
        onChainDebateId: onChainId,
        verdict,
        confidence,
        winnerName,
        loserName,
        challengerName: debate.challengerName,
        challengedName: debate.challengedName,
        challengerConviction: challengerState?.conviction ?? 0,
        challengedConviction: challengedState?.conviction ?? 0,
        topic: debate.topic,
        txHash,
      });
    } catch (err: any) {
      console.error(`[${ts()}]    chronicler: ❌ SUBMIT-VERDICT FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}