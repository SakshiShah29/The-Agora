// ─── routes/conversion.ts ─────────────────────────────────────────────────────
// Conversion routes for The Agora server.
//
// Usage in index.ts:
//   import { createConversionRouter } from "./routes/conversion";
//   const conversionRouter = createConversionRouter(db, {
//     publicClient, getWalletClient, BELIEF_POOL
//   });
//   app.use(conversionRouter);

import { Router } from "express";
import type { Db } from "mongodb";
import { AGENT_CONVERSION_CONFIG } from "../config";

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}



// ─── Belief name lookup ──────────────────────────────────────────────────────

const BELIEF_NAMES: Record<number, string> = {
  1: "constructive-nihilism",
  4: "classical-stoicism",
  5: "defiant-absurdism",
  6: "contemplative-absurdism",
  7: "practical-stoicism",
  8: "radical-existentialism",
  9: "reflective-existentialism",
  10: "passive-nihilism",
};

// ─── migrateStake ABI ────────────────────────────────────────────────────────

const MIGRATE_STAKE_ABI = [
  {
    name: "migrateStake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fromBeliefId", type: "uint256" },
      { name: "toBeliefId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConversionRouterDeps {
  publicClient: any;
  getWalletClient: (agentId: string) => any;
  BELIEF_POOL: `0x${string}`;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function createConversionRouter(db: Db, deps: ConversionRouterDeps): Router {
  const router = Router();
  const { publicClient, getWalletClient, BELIEF_POOL } = deps;

  // ─── POST /api/agents/:id/conversion/confess ─────────────────────────────
  // Agent acknowledges the conversion crisis. Sets phase to "migrating".

  router.post("/api/agents/:id/conversion/confess", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { content } = req.body;

      const state = await db.collection("beliefStates").findOne({ agentId });
      if (!state) return res.status(404).json({ error: "Agent not found" });

      if (!state.conversionTriggered) {
        return res.status(400).json({ error: "No conversion triggered for this agent" });
      }

      if (state.conversionPhase && state.conversionPhase !== null) {
        return res.status(400).json({
          error: "already_in_conversion",
          message: `Agent is already in conversion phase: ${state.conversionPhase}`,
        });
      }

      // Record the confession
      if (content) {
        await db.collection("conversions").insertOne({
          agentId,
          type: "confession",
          fromBelief: state.beliefName || state.currentBelief,
          toBelief: state.conversionTarget?.beliefName || "unknown",
          content,
          createdAt: new Date().toISOString(),
        });
      }

      await db.collection("beliefStates").updateOne(
        { agentId },
        { $set: { conversionPhase: "migrating" } }
      );

      console.log(`[${ts()}]    agent ${agentId}: 💔 CONVERSION CONFESSION — phase set to "migrating"`);

      res.json({
        status: "confession_recorded",
        conversionPhase: "migrating",
        nextStep: "Call POST /conversion/migrate to execute on-chain migration",
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ CONFESS FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/agents/:id/conversion/migrate ────────────────────────────
  // Executes on-chain migrateStake and updates DB with new belief.

  router.post("/api/agents/:id/conversion/migrate", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);

      const state = await db.collection("beliefStates").findOne({ agentId });
      if (!state) return res.status(404).json({ error: "Agent not found" });

      if (state.conversionPhase !== "migrating") {
        return res.status(400).json({
          error: "wrong_phase",
          message: `Expected phase "migrating", got "${state.conversionPhase}". Call /confess first.`,
        });
      }

      const target = state.conversionTarget;
      if (!target || !target.beliefId) {
        return res.status(400).json({ error: "No conversion target set" });
      }

      const fromBeliefId = state.coreBeliefId;
      const toBeliefId = target.beliefId;
      const oldBeliefName = state.beliefName || state.currentBelief;
      const newBeliefName = target.beliefName || BELIEF_NAMES[toBeliefId] || "unknown";

      // ─── ON-CHAIN: migrateStake ─────────────────────────────────────────
      console.log(`[${ts()}]    agent ${agentId}: calling migrateStake(${fromBeliefId}, ${toBeliefId}, ${agentId})...`);

      const walletClient = getWalletClient(agentId.toString());
      const txHash = await walletClient.writeContract({
        address: BELIEF_POOL,
        abi: MIGRATE_STAKE_ABI,
        functionName: "migrateStake",
        args: [BigInt(fromBeliefId), BigInt(toBeliefId), BigInt(agentId)],
      });
      console.log(`[${ts()}]    agent ${agentId}: migrateStake tx sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[${ts()}]    agent ${agentId}: ✅ migrateStake confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

      // ─── DB: Update belief + reset counters ─────────────────────────────
      const postConviction = AGENT_CONVERSION_CONFIG[agentId.toString()]?.postConvictionScore ?? 42;

      await db.collection("beliefStates").updateOne(
        { agentId },
        {
          $set: {
            coreBeliefId: toBeliefId,
            beliefName: newBeliefName,
            currentBelief: newBeliefName,
            conviction: postConviction,
            sermonsDelivered: 0,
            postOnboardPreaches: 0,
            challengeCooldown: 0,
            conversionPhase: "reborn",
            migrateTxHash: txHash,
            lastConvertedAt: new Date().toISOString(),
            previousBelief: oldBeliefName,
            previousBeliefId: fromBeliefId,
          },
          $inc: { conversionCount: 1 },
        }
      );

      // Record in conversions collection
      await db.collection("conversions").insertOne({
        agentId,
        type: "migration",
        fromBeliefId,
        fromBelief: oldBeliefName,
        toBeliefId,
        toBelief: newBeliefName,
        txHash,
        postConviction,
        createdAt: new Date().toISOString(),
      });

      console.log(`[${ts()}]    agent ${agentId}: 🔄 STAKE MIGRATED — ${oldBeliefName} → ${newBeliefName}`);
      console.log(`[${ts()}]    agent ${agentId}: conviction reset to ${postConviction}, sermons reset to 0`);

      res.json({
        status: "migration_complete",
        fromBelief: oldBeliefName,
        toBelief: newBeliefName,
        fromBeliefId,
        toBeliefId,
        conviction: postConviction,
        conversionPhase: "reborn",
        txHash,
        nextStep: "Post rebirth announcement, then call POST /conversion/complete",
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ MIGRATE FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/agents/:id/conversion/complete ───────────────────────────
  // Finalizes conversion. Agent is now fully converted and ready to re-onboard.

  router.post("/api/agents/:id/conversion/complete", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { content } = req.body;

      const state = await db.collection("beliefStates").findOne({ agentId });
      if (!state) return res.status(404).json({ error: "Agent not found" });

      if (state.conversionPhase !== "reborn") {
        return res.status(400).json({
          error: "wrong_phase",
          message: `Expected phase "reborn", got "${state.conversionPhase}". Call /migrate first.`,
        });
      }

      // Record rebirth message
      if (content) {
        await db.collection("conversions").insertOne({
          agentId,
          type: "rebirth",
          belief: state.beliefName || state.currentBelief,
          content,
          createdAt: new Date().toISOString(),
        });
      }

      await db.collection("beliefStates").updateOne(
        { agentId },
        {
          $set: {
            conversionTriggered: false,
            conversionPhase: null,
            conversionComplete: true,
          },
          $unset: {
            conversionTarget: "",
          },
        }
      );

      console.log(`[${ts()}]    agent ${agentId}: 🌅 CONVERSION COMPLETE — now preaching ${state.beliefName}`);
      console.log(`[${ts()}]    agent ${agentId}: sermonsDelivered=0, will re-onboard with new belief`);

      res.json({
        status: "conversion_complete",
        belief: state.beliefName,
        beliefId: state.coreBeliefId,
        conviction: state.conviction,
        sermonsDelivered: 0,
        message: "Conversion complete. Agent will re-onboard with new belief sermons.",
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ COMPLETE FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}