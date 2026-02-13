// ─── routes/debate.ts ─────────────────────────────────────────────────────────
// Debate & preach routes for The Agora server.
//
// Usage in index.ts:
//   import { createDebateRouter } from "./routes/debate";
//   const debateRouter = createDebateRouter(db, { publicClient, getWalletClient, BELIEF_POOL });
//   app.use(debateRouter);

import { Router } from "express";
import type { Db } from "mongodb";
import { parseEther, formatEther } from "viem";

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ─── Debate phase machine ────────────────────────────────────────────────────

const DEBATE_PHASES = ["OPENING", "ROUND_1", "ROUND_2", "ROUND_3", "CLOSING"] as const;
type DebatePhase = (typeof DEBATE_PHASES)[number];

function getPhaseAndRole(turnIndex: number): { phase: DebatePhase; role: "challenger" | "challenged" } {
  const phaseIndex = Math.floor(turnIndex / 2);
  const role = turnIndex % 2 === 0 ? "challenger" : "challenged";
  return { phase: DEBATE_PHASES[phaseIndex], role };
}

// ─── Agent config ────────────────────────────────────────────────────────────

const AGENT_INFO: Record<number, { name: string; belief: string; beliefId: number }> = {
  5: { name: "Nihilo", belief: "constructive-nihilism", beliefId: 1 },
  6: { name: "Seneca", belief: "classical-stoicism", beliefId: 4 },
};

// ─── BeliefPool ABI (debate escrow functions only) ───────────────────────────

const BELIEF_POOL_DEBATE_ABI = [
  {
    name: "createDebateEscrow",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "agentAId", type: "uint256" },
      { name: "agentBId", type: "uint256" },
    ],
    outputs: [{ name: "debateId", type: "uint256" }],
  },
  {
    name: "matchDebateEscrow",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "debateId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "declineDebateEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "debateId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getDebate",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "debateId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "debateId", type: "uint256" },
          { name: "agentAId", type: "uint256" },
          { name: "agentBId", type: "uint256" },
          { name: "stakeAmount", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint256" },
          { name: "settledAt", type: "uint256" },
          { name: "winnerId", type: "uint256" },
          { name: "verdict", type: "string" },
        ],
      },
    ],
  },
  {
    name: "nextDebateId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Types for dependencies ──────────────────────────────────────────────────

interface DebateRouterDeps {
  publicClient: any;
  getWalletClient: (agentId: string) => any;
  BELIEF_POOL: `0x${string}`;
}

// ─── Router factory ──────────────────────────────────────────────────────────

export function createDebateRouter(db: Db, deps: DebateRouterDeps): Router {
  const router = Router();
  const { publicClient, getWalletClient, BELIEF_POOL } = deps;

  const DEBATE_STAKE = parseEther("0.001");

  // Helper: get agent state from DB
  async function getState(agentId: number) {
    return db.collection("beliefStates").findOne({ agentId });
  }

  // Helper: check if any debate is currently active (for othersDebating)
  async function isAnyDebateActive(): Promise<boolean> {
    const active = await db.collection("debates").findOne({
      status: { $in: ["waiting_acceptance", "active"] },
    });
    return !!active;
  }

  // Helper: check if a SPECIFIC agent is part of the active debate
  async function getActiveDebateForAgent(agentId: number) {
    return db.collection("debates").findOne({
      status: { $in: ["waiting_acceptance", "active"] },
      $or: [{ challengerId: agentId }, { challengedId: agentId }],
    });
  }

  // ─── GET /api/agents/:id/state/debate-overlay ─────────────────────────────

  router.get("/api/agents/:id/state/debate-overlay", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const info = AGENT_INFO[agentId];
      if (!info) return res.status(404).json({ error: `Unknown agent ${agentId}` });

      const state = await getState(agentId);
      if (!state) return res.status(404).json({ error: "Agent state not found" });

      const totalPreaches = (state.sermonsDelivered || 0) + (state.postOnboardPreaches || 0);
      const challengeCooldown = state.challengeCooldown || 0;

      const myDebate = await getActiveDebateForAgent(agentId);
      const anyDebate = await isAnyDebateActive();

      let isActiveDebateParticipant = false;
      let activeDebate = null;
      let pendingChallenge = null;
      let othersDebating = false;

      if (myDebate) {
        const iAmChallenger = myDebate.challengerId === agentId;
        const myRole = iAmChallenger ? "challenger" : "challenged";
        const opponentId = iAmChallenger ? myDebate.challengedId : myDebate.challengerId;
        const opponentInfo = AGENT_INFO[opponentId];

        if (myDebate.status === "waiting_acceptance") {
          if (iAmChallenger) {
            isActiveDebateParticipant = true;
            activeDebate = {
              debateId: myDebate.debateId,
              onChainDebateId: myDebate.onChainDebateId,
              phase: "WAITING_ACCEPTANCE" as string,
              myTurn: false,
              myRole,
              opponentName: opponentInfo?.name || `Agent ${opponentId}`,
              opponentId,
              opponentBelief: opponentInfo?.belief || "unknown",
              topic: myDebate.topic,
              stakeAmount: "0.001",
              channelId: "1470722825068216433",
              transcript: myDebate.transcript || [],
            };
          } else {
            const challengerInfo = AGENT_INFO[myDebate.challengerId];
            pendingChallenge = {
              debateId: myDebate.debateId,
              onChainDebateId: myDebate.onChainDebateId,
              challengerName: challengerInfo?.name || `Agent ${myDebate.challengerId}`,
              challengerId: myDebate.challengerId,
              challengerBelief: challengerInfo?.belief || "unknown",
              topic: myDebate.topic,
              stakeAmount: "0.001",
              channelId: "1470722825068216433",
            };
          }
        } else if (myDebate.status === "active") {
          isActiveDebateParticipant = true;
          const { phase, role: expectedRole } = getPhaseAndRole(myDebate.turnIndex);
          const myTurn = expectedRole === myRole;

          activeDebate = {
            debateId: myDebate.debateId,
            onChainDebateId: myDebate.onChainDebateId,
            phase,
            myTurn,
            myRole,
            opponentName: opponentInfo?.name || `Agent ${opponentId}`,
            opponentId,
            opponentBelief: opponentInfo?.belief || "unknown",
            topic: myDebate.topic,
            stakeAmount: "0.001",
            channelId: "1470722825068216433",
            transcript: myDebate.transcript || [],
          };
        }
      } else if (anyDebate) {
        othersDebating = true;
      }

      res.json({
        totalPreaches,
        challengeCooldown,
        isActiveDebateParticipant,
        activeDebate,
        pendingChallenge,
        othersDebating,
      });
    } catch (err: any) {
      console.error(`[${ts()}]    debate-overlay error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/agents/:id/preach ───────────────────────────────────────────

  router.post("/api/agents/:id/preach", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content) return res.status(400).json({ error: "content is required" });

      const state = await getState(agentId);
      if (!state) return res.status(404).json({ error: "Agent not found" });

      if ((state.sermonsDelivered || 0) < 3) {
        return res.status(400).json({ error: "Onboarding not complete. Deliver 3 sermons first." });
      }

      const newCount = (state.postOnboardPreaches || 0) + 1;
      const now = new Date().toISOString();

      await db.collection("beliefStates").updateOne(
        { agentId },
        {
          $set: {
            postOnboardPreaches: newCount,
            lastPreachAt: now,
          },
          $inc: { challengeCooldown: state.challengeCooldown > 0 ? -1 : 0 },
        }
      );

      await db.collection("preaches").insertOne({
        agentId,
        content,
        preachNumber: newCount,
        createdAt: now,
      });

      const totalPreaches = (state.sermonsDelivered || 0) + newCount;
      const updatedCooldown = Math.max(0, (state.challengeCooldown || 0) - 1);

      console.log(`[${ts()}]    agent ${agentId}: preach #${newCount} recorded (total=${totalPreaches}, cooldown=${updatedCooldown})`);

      res.json({
        status: "preach_recorded",
        postOnboardPreaches: newCount,
        totalPreaches,
        challengeCooldown: updatedCooldown,
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ PREACH FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/agents/:id/debate/challenge ─────────────────────────────────
  // ON-CHAIN: BeliefPool.createDebateEscrow(agentAId, agentBId) { value: 0.001 ETH }

  router.post("/api/agents/:id/debate/challenge", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { targetAgentId, topic } = req.body;

      if (!targetAgentId || !topic) {
        return res.status(400).json({ error: "targetAgentId and topic are required" });
      }

      const targetId = parseInt(targetAgentId);
      const challengerInfo = AGENT_INFO[agentId];
      const targetInfo = AGENT_INFO[targetId];

      if (!challengerInfo) return res.status(404).json({ error: `Unknown challenger agent ${agentId}` });
      if (!targetInfo) return res.status(404).json({ error: `Unknown target agent ${targetId}` });
      if (agentId === targetId) return res.status(400).json({ error: "Cannot challenge yourself" });

      const state = await getState(agentId);
      if (!state) return res.status(404).json({ error: "Agent state not found" });

      const totalPreaches = (state.sermonsDelivered || 0) + (state.postOnboardPreaches || 0);

      if (totalPreaches < 6) {
        return res.status(400).json({
          error: "not_enough_preaches",
          message: `Need at least 6 total preaches (have ${totalPreaches}). Keep preaching.`,
        });
      }

      if ((state.challengeCooldown || 0) > 0) {
        return res.status(400).json({
          error: "cooldown_active",
          message: `Challenge cooldown active. ${state.challengeCooldown} preaches remaining.`,
        });
      }

      const existingDebate = await db.collection("debates").findOne({
        status: { $in: ["waiting_acceptance", "active"] },
      });
      if (existingDebate) {
        return res.status(400).json({
          error: "others_debating",
          message: "A debate is already in progress. Wait for it to conclude.",
        });
      }

      const targetState = await getState(targetId);
      if (!targetState || (targetState.sermonsDelivered || 0) < 3) {
        return res.status(400).json({
          error: "target_not_ready",
          message: `${targetInfo.name} has not completed onboarding yet.`,
        });
      }

      // ─── ON-CHAIN: createDebateEscrow ───────────────────────────────────
      console.log(`[${ts()}]    agent ${agentId}: sending createDebateEscrow(${agentId}, ${targetId}) with ${formatEther(DEBATE_STAKE)} ETH...`);

      const walletClient = getWalletClient(agentId.toString());
      const txHash = await walletClient.writeContract({
        address: BELIEF_POOL,
        abi: BELIEF_POOL_DEBATE_ABI,
        functionName: "createDebateEscrow",
        args: [BigInt(agentId), BigInt(targetId)],
        value: DEBATE_STAKE,
      });
      console.log(`[${ts()}]    agent ${agentId}: createDebateEscrow tx sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[${ts()}]    agent ${agentId}: ✅ createDebateEscrow confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

      // Read the on-chain debate ID (nextDebateId was incremented, so current = next - 1)
      const nextId = await publicClient.readContract({
        address: BELIEF_POOL,
        abi: BELIEF_POOL_DEBATE_ABI,
        functionName: "nextDebateId",
      });
      const onChainDebateId = Number(nextId) - 1;
      console.log(`[${ts()}]    agent ${agentId}: on-chain debateId = ${onChainDebateId}`);

      // ─── DB: create debate record ───────────────────────────────────────
      const debate = {
        debateId: onChainDebateId,
        onChainDebateId,
        challengerId: agentId,
        challengedId: targetId,
        challengerName: challengerInfo.name,
        challengedName: targetInfo.name,
        challengerBelief: challengerInfo.belief,
        challengedBelief: targetInfo.belief,
        topic,
        stakeAmount: "0.001",
        status: "waiting_acceptance",
        turnIndex: 0,
        transcript: [],
        createTxHash: txHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.collection("debates").insertOne(debate);

      await db.collection("beliefStates").updateOne(
        { agentId },
        { $set: { inDebate: true } }
      );

      console.log(`[${ts()}]    agent ${agentId}: ⚔️  CHALLENGE ISSUED → ${targetInfo.name} (on-chain #${onChainDebateId})`);
      console.log(`[${ts()}]    topic: "${topic}"`);

      res.json({
        status: "challenge_issued",
        debateId: onChainDebateId,
        onChainDebateId,
        topic,
        opponent: targetInfo.name,
        opponentId: targetId,
        txHash,
        stakeAmount: formatEther(DEBATE_STAKE),
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ CHALLENGE FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/agents/:id/debate/accept ────────────────────────────────────
  // ON-CHAIN: BeliefPool.matchDebateEscrow(debateId) { value: 0.001 ETH }

  router.post("/api/agents/:id/debate/accept", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { debateId } = req.body;

      if (!debateId) return res.status(400).json({ error: "debateId is required" });

      const debate = await db.collection("debates").findOne({
        debateId: parseInt(debateId) || debateId,
        challengedId: agentId,
        status: "waiting_acceptance",
      });

      if (!debate) {
        return res.status(404).json({
          error: "no_pending_challenge",
          message: "No pending challenge found for this agent with this debateId.",
        });
      }

      // ─── ON-CHAIN: matchDebateEscrow ────────────────────────────────────
      const onChainId = debate.onChainDebateId;
      console.log(`[${ts()}]    agent ${agentId}: sending matchDebateEscrow(${onChainId}) with ${formatEther(DEBATE_STAKE)} ETH...`);

      const walletClient = getWalletClient(agentId.toString());
      const txHash = await walletClient.writeContract({
        address: BELIEF_POOL,
        abi: BELIEF_POOL_DEBATE_ABI,
        functionName: "matchDebateEscrow",
        args: [BigInt(onChainId)],
        value: DEBATE_STAKE,
      });
      console.log(`[${ts()}]    agent ${agentId}: matchDebateEscrow tx sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[${ts()}]    agent ${agentId}: ✅ matchDebateEscrow confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

      // ─── DB: activate debate ────────────────────────────────────────────
      await db.collection("debates").updateOne(
        { debateId: debate.debateId },
        {
          $set: {
            status: "active",
            turnIndex: 0,
            acceptTxHash: txHash,
            acceptedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      );

      await db.collection("beliefStates").updateOne(
        { agentId },
        { $set: { inDebate: true } }
      );
      await db.collection("beliefStates").updateOne(
        { agentId: debate.challengerId },
        { $set: { inDebate: true } }
      );

      console.log(`[${ts()}]    agent ${agentId}: ✅ CHALLENGE ACCEPTED (on-chain #${onChainId})`);
      console.log(`[${ts()}]    ${debate.challengerName} vs ${debate.challengedName} — "${debate.topic}"`);

      res.json({
        status: "challenge_accepted",
        debateId: debate.debateId,
        onChainDebateId: onChainId,
        topic: debate.topic,
        challengerName: debate.challengerName,
        phase: "OPENING",
        challengerGoesFirst: true,
        txHash,
        stakeAmount: formatEther(DEBATE_STAKE),
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ ACCEPT FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/agents/:id/debate/decline ───────────────────────────────────
  // ON-CHAIN: BeliefPool.declineDebateEscrow(debateId) — refunds Agent A

  router.post("/api/agents/:id/debate/decline", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { debateId } = req.body;

      if (!debateId) return res.status(400).json({ error: "debateId is required" });

      const debate = await db.collection("debates").findOne({
        debateId: parseInt(debateId) || debateId,
        challengedId: agentId,
        status: "waiting_acceptance",
      });

      if (!debate) {
        return res.status(404).json({
          error: "no_pending_challenge",
          message: "No pending challenge found for this agent with this debateId.",
        });
      }

      // ─── ON-CHAIN: declineDebateEscrow ──────────────────────────────────
      const onChainId = debate.onChainDebateId;
      console.log(`[${ts()}]    agent ${agentId}: sending declineDebateEscrow(${onChainId})...`);

      const walletClient = getWalletClient(agentId.toString());
      const txHash = await walletClient.writeContract({
        address: BELIEF_POOL,
        abi: BELIEF_POOL_DEBATE_ABI,
        functionName: "declineDebateEscrow",
        args: [BigInt(onChainId)],
      });
      console.log(`[${ts()}]    agent ${agentId}: declineDebateEscrow tx sent: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[${ts()}]    agent ${agentId}: ✅ declineDebateEscrow confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

      // ─── DB: mark declined + cooldowns ──────────────────────────────────
      await db.collection("debates").updateOne(
        { debateId: debate.debateId },
        {
          $set: {
            status: "declined",
            declineTxHash: txHash,
            declinedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      );

      const COOLDOWN = 4;
      await db.collection("beliefStates").updateOne(
        { agentId },
        { $set: { challengeCooldown: COOLDOWN, inDebate: false, postOnboardPreaches: 0 } }
      );
      await db.collection("beliefStates").updateOne(
        { agentId: debate.challengerId },
        { $set: { challengeCooldown: COOLDOWN, inDebate: false, postOnboardPreaches: 0 } }
      );

      console.log(`[${ts()}]    agent ${agentId}: ❌ CHALLENGE DECLINED (on-chain #${onChainId})`);
      console.log(`[${ts()}]    Agent A refunded on-chain. cooldown=${COOLDOWN} for both, preaches reset`);

      res.json({
        status: "challenge_declined",
        debateId: debate.debateId,
        onChainDebateId: onChainId,
        challengeCooldown: COOLDOWN,
        txHash,
        message: "Challenge declined. Challenger refunded on-chain. Both agents return to preaching.",
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ DECLINE FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/agents/:id/debate/argue ─────────────────────────────────────
  // No on-chain call — arguments are off-chain. Settlement via Chronicler later.

  router.post("/api/agents/:id/debate/argue", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { debateId, content } = req.body;

      if (!debateId || !content) {
        return res.status(400).json({ error: "debateId and content are required" });
      }

      const debate = await db.collection("debates").findOne({
        debateId: parseInt(debateId) || debateId,
        status: "active",
      });

      if (!debate) {
        return res.status(404).json({ error: "No active debate found with this debateId." });
      }

      const iAmChallenger = debate.challengerId === agentId;
      const iAmChallenged = debate.challengedId === agentId;
      if (!iAmChallenger && !iAmChallenged) {
        return res.status(403).json({ error: "You are not a participant in this debate." });
      }

      const myRole = iAmChallenger ? "challenger" : "challenged";
      const { phase: currentPhase, role: expectedRole } = getPhaseAndRole(debate.turnIndex);

      if (expectedRole !== myRole) {
        return res.status(400).json({
          error: "not_your_turn",
          message: `It's the ${expectedRole}'s turn. Wait for your opponent.`,
          phase: currentPhase,
          myTurn: false,
        });
      }

      const agentInfo = AGENT_INFO[agentId];
      const transcriptEntry = {
        agent: agentInfo?.name || `Agent ${agentId}`,
        agentId,
        role: myRole,
        phase: currentPhase,
        content,
        timestamp: new Date().toISOString(),
      };

      const newTurnIndex = debate.turnIndex + 1;
      const debateConcluded = newTurnIndex >= 10;

      const updateFields: any = {
        turnIndex: newTurnIndex,
        updatedAt: new Date().toISOString(),
      };

      if (debateConcluded) {
        updateFields.status = "concluded";
        updateFields.concludedAt = new Date().toISOString();
      }

      await db.collection("debates").updateOne(
        { debateId: debate.debateId },
        {
          $set: updateFields,
          $push: { transcript: transcriptEntry } as any,
        }
      );

      if (debateConcluded) {
        const POST_DEBATE_COOLDOWN = 4;
        await db.collection("beliefStates").updateOne(
          { agentId: debate.challengerId },
          { $set: { inDebate: false, challengeCooldown: POST_DEBATE_COOLDOWN, postOnboardPreaches: 0, awaitingVerdict: true } }
        );
        await db.collection("beliefStates").updateOne(
          { agentId: debate.challengedId },
          { $set: { inDebate: false, challengeCooldown: POST_DEBATE_COOLDOWN, postOnboardPreaches: 0, awaitingVerdict: true } }
        );
        console.log(`[${ts()}]    debate ${debate.debateId}: 🏁 CONCLUDED after ${newTurnIndex} turns`);
        console.log(`[${ts()}]    cooldown=${POST_DEBATE_COOLDOWN} for both, preaches reset`);
        console.log(`[${ts()}]    ⏳ Awaiting Chronicler verdict via submitDebateVerdict(${debate.onChainDebateId})`);
      }

      let nextPhase = currentPhase;
      let nextMyTurn = false;
      if (!debateConcluded) {
        const next = getPhaseAndRole(newTurnIndex);
        nextPhase = next.phase;
        nextMyTurn = next.role === myRole;
      }

      const turnLabel = `${currentPhase} by ${agentInfo?.name}`;
      console.log(`[${ts()}]    debate ${debate.debateId}: turn ${debate.turnIndex + 1}/10 — ${turnLabel}${debateConcluded ? " (FINAL)" : ""}`);

      res.json({
        status: "argument_recorded",
        phase: nextPhase,
        myTurn: nextMyTurn,
        debateConcluded,
        turnIndex: newTurnIndex,
      });
    } catch (err: any) {
      console.error(`[${ts()}]    agent ${req.params.id}: ❌ ARGUE FAILED: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}