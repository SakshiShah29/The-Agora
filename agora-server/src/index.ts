import express from "express";
import { MongoClient, Db } from "mongodb";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEther,
  formatEther,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";
import { createDebateRouter } from "./routes/debate";
import { createChroniclerRouter } from "./routes/chronicler";
import { AGENT_CONVERSION_CONFIG, AGENT_DEFAULTS, AGENT_INFO } from "./config";
import { createConversionRouter } from "./routes/conversion";

dotenv.config();

const app = express();
app.use(express.json());

// ─── Request Logger Middleware ───────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}





app.use((req, res, next) => {
  const start = Date.now();
  const { method, path, body } = req;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${ts()}] ⮕  ${method} ${path}`);
  if (Object.keys(body || {}).length > 0) {
    console.log(`[${ts()}]    body: ${JSON.stringify(body)}`);
  }

  // Capture response
  const originalJson = res.json.bind(res);
  res.json = (data: any) => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const icon = status >= 400 ? "✗" : "✓";
    console.log(`[${ts()}] ${icon} ${status} (${ms}ms) → ${JSON.stringify(data).slice(0, 200)}`);
    return originalJson(data);
  };

  next();
});

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL!;
const AGORA_GATE = getAddress(process.env.AGORA_GATE!);
const BELIEF_POOL = getAddress(process.env.BELIEF_POOL!);
const PORT = parseInt(process.env.PORT || "3456");

const PRIVATE_KEYS: Record<string, `0x${string}`> = {};
for (const [key, val] of Object.entries(process.env)) {
  const match = key.match(/^AGENT_(\d+)_PRIVATE_KEY$/);
  if (match && val) PRIVATE_KEYS[match[1]] = val as `0x${string}`;
}

// ─── Chain ───────────────────────────────────────────────────────────────────

const monadTestnetChain = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const publicClient = createPublicClient({
  chain: monadTestnetChain,
  transport: http(RPC_URL),
});

function getWalletClient(agentId: string) {
  const pk = PRIVATE_KEYS[agentId];
  if (!pk) throw new Error(`No private key for agent ${agentId}`);
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: monadTestnetChain,
    transport: http(RPC_URL),
  });
}

// ─── ABIs (only the functions we need) ───────────────────────────────────────

const AGORA_GATE_ABI = [
  {
    name: "hasEntered",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getEntryTime",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "entryFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "enter",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [],
  },
] as const;

const BELIEF_POOL_ABI = [
  {
    name: "stake",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "beliefId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getStakeInfo",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "beliefId", type: "uint256" },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
] as const;

// ─── MongoDB ─────────────────────────────────────────────────────────────────

let db: Db;

async function connectMongo() {
  const client = new MongoClient(process.env.MONGO_URI!);
  await client.connect();
  db = client.db(process.env.MONGO_DB!);
  console.log("[mongo] connected");
}

function defaultState(agentId: string) {
  const base = AGENT_DEFAULTS[agentId];
  if (!base) throw new Error(`Unknown agent ${agentId}`);
  return {
    ...base,
    hasEnteredAgora: false,
    isCurrentlyStaked: false,
    arrivalAnnounced: false,
    sermonsDelivered: 0,
    lastSermonAt: null,
    postOnboardPreaches: 0,
    lastPreachAt: null,
    challengeCooldown: 0,
    inDebate: false,
  };
}


// ─── Debate phase helpers (shared with routes/debate.ts) ─────────────────────

const DEBATE_PHASES = ["OPENING", "ROUND_1", "ROUND_2", "ROUND_3", "CLOSING"] as const;

function getPhaseAndRole(turnIndex: number) {
  const phaseIndex = Math.floor(turnIndex / 2);
  const role = turnIndex % 2 === 0 ? "challenger" : "challenged";
  return { phase: DEBATE_PHASES[phaseIndex], role };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/agents/:id/state — read belief state from MongoDB + debate overlay
app.get("/api/agents/:id/state", async (req, res) => {
  try {
    const agentId = req.params.id;
    const agentIdNum = parseInt(agentId);
    let state = await db.collection("beliefStates").findOne({ agentId: agentIdNum });
    if (!state) {
      console.log(`[${ts()}]    agent ${agentId}: no state found, initializing defaults`);
      const def = defaultState(agentId);
      await db.collection("beliefStates").insertOne(def);
      state = def;
    }
    const { _id, ...clean } = state as any;

    // ─── Debate overlay: compute debate-related fields ────────────────────
    const totalPreaches = (clean.sermonsDelivered || 0) + (clean.postOnboardPreaches || 0);
    const challengeCooldown = clean.challengeCooldown || 0;

    // Check for active debate involving this agent
    const myDebate = await db.collection("debates").findOne({
      status: { $in: ["waiting_acceptance", "active"] },
      $or: [{ challengerId: agentIdNum }, { challengedId: agentIdNum }],
    });

    // Check for ANY active debate (for othersDebating)
    const anyDebate = await db.collection("debates").findOne({
      status: { $in: ["waiting_acceptance", "active"] },
    });

    let isActiveDebateParticipant = false;
    let activeDebate = null;
    let pendingChallenge = null;
    let othersDebating = false;

    if (myDebate) {
      const iAmChallenger = myDebate.challengerId === agentIdNum;
      const myRole = iAmChallenger ? "challenger" : "challenged";
      const opponentId = iAmChallenger ? myDebate.challengedId : myDebate.challengerId;
      const opponentInfo = AGENT_INFO[opponentId];

      if (myDebate.status === "waiting_acceptance") {
        if (iAmChallenger) {
          // I issued the challenge, waiting for opponent to accept
          isActiveDebateParticipant = true;
          activeDebate = {
            debateId: myDebate.debateId,
            phase: "WAITING_ACCEPTANCE",
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
          // I was challenged — show pendingChallenge
          const challengerInfo = AGENT_INFO[myDebate.challengerId];
          pendingChallenge = {
            debateId: myDebate.debateId,
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
      // There's a debate but I'm not in it
      othersDebating = true;
    }

    // Build final response
    const response = {
      agentId: clean.agentId,
      agentName: clean.agentName || AGENT_DEFAULTS[agentId]?.agentName,
      beliefId: clean.coreBeliefId,
      beliefName: clean.beliefName || clean.currentBelief,
       conviction: clean.conviction ?? AGENT_DEFAULTS[agentId]?.conviction ?? 85,  // ← NEW
  conversionThreshold: AGENT_CONVERSION_CONFIG[agentId]?.conversionThreshold ?? 30,  // ← NEW
  conversionTriggered: clean.conversionTriggered || false,  // ← NEW
  conversionPhase: clean.conversionPhase || null,  // ← NEW
  conversionTarget: clean.conversionTarget || null,  // ← NEW
      hasEnteredAgora: clean.hasEnteredAgora || false,
      isCurrentlyStaked: clean.isCurrentlyStaked || false,
      arrivalAnnounced: clean.arrivalAnnounced || false,
      sermonsDelivered: clean.sermonsDelivered || 0,
      totalPreaches,
      challengeCooldown,
      isActiveDebateParticipant,
      activeDebate,
      pendingChallenge,
      othersDebating,
      awaitingVerdict: clean.awaitingVerdict || false,
    };

    console.log(`[${ts()}]    agent ${agentId}: entered=${response.hasEnteredAgora} staked=${response.isCurrentlyStaked} sermons=${response.sermonsDelivered}/3 preaches=${totalPreaches} cooldown=${challengeCooldown} debating=${isActiveDebateParticipant} othersDebating=${othersDebating} awaitingVerdict=${response.awaitingVerdict}`);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/:id/enter — enter The Agora (on-chain)
app.post("/api/agents/:id/enter", async (req, res) => {
  try {
    const agentId = req.params.id;
    const agentIdBn = BigInt(agentId);
    console.log(`[${ts()}]    agent ${agentId}: checking on-chain entry status...`);

    const hasEntered = await publicClient.readContract({
      address: AGORA_GATE,
      abi: AGORA_GATE_ABI,
      functionName: "hasEntered",
      args: [agentIdBn],
    });
    console.log(`[${ts()}]    agent ${agentId}: hasEntered = ${hasEntered}`);

    if (hasEntered) {
      const entryTime = await publicClient.readContract({
        address: AGORA_GATE,
        abi: AGORA_GATE_ABI,
        functionName: "getEntryTime",
        args: [agentIdBn],
      });
      console.log(`[${ts()}]    agent ${agentId}: already entered at ${Number(entryTime)}, syncing DB`);
      await db.collection("beliefStates").updateOne(
        { agentId: parseInt(agentId) },
        { $set: { hasEnteredAgora: true, entryTime: Number(entryTime) } },
        { upsert: true }
      );
      return res.json({ status: "already_entered", entryTime: Number(entryTime) });
    }

    const entryFee = await publicClient.readContract({
      address: AGORA_GATE,
      abi: AGORA_GATE_ABI,
      functionName: "entryFee",
    });
    console.log(`[${ts()}]    agent ${agentId}: entry fee = ${formatEther(entryFee)} ETH`);

    console.log(`[${ts()}]    agent ${agentId}: sending enter() tx...`);
    const walletClient = getWalletClient(agentId);
    const txHash = await walletClient.writeContract({
      address: AGORA_GATE,
      abi: AGORA_GATE_ABI,
      functionName: "enter",
      args: [agentIdBn],
      value: entryFee,
    });
    console.log(`[${ts()}]    agent ${agentId}: tx sent: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[${ts()}]    agent ${agentId}: ✅ tx confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

    await db.collection("beliefStates").updateOne(
      { agentId: parseInt(agentId) },
      { $set: { hasEnteredAgora: true, entryTime: Date.now(), entryTxHash: txHash } },
      { upsert: true }
    );

    res.json({ status: "entered", entryFee: formatEther(entryFee), txHash });
  } catch (err: any) {
    const msg = err.message || "";
    if (msg.includes("Already entered") || msg.includes("already entered")) {
      console.log(`[${ts()}]    agent ${req.params.id}: revert caught — already entered, syncing DB`);
      await db.collection("beliefStates").updateOne(
        { agentId: parseInt(req.params.id) },
        { $set: { hasEnteredAgora: true } },
        { upsert: true }
      );
      return res.json({ status: "already_entered" });
    }
    console.error(`[${ts()}]    agent ${req.params.id}: ❌ ENTER FAILED: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /api/agents/:id/stake — stake on belief (on-chain)
app.post("/api/agents/:id/stake", async (req, res) => {
  try {
    const agentId = req.params.id;
    const agentIdBn = BigInt(agentId);
    const state = await db.collection("beliefStates").findOne({ agentId: parseInt(agentId) });
    if (!state) return res.status(404).json({ error: "Agent not found. Call /enter first." });

    const beliefId = state.coreBeliefId;
    const beliefIdBn = BigInt(beliefId);
    const stakeAmount = parseEther("0.1");
    console.log(`[${ts()}]    agent ${agentId}: checking existing stake for belief ${beliefId}...`);

    try {
      const [amount] = await publicClient.readContract({
        address: BELIEF_POOL,
        abi: BELIEF_POOL_ABI,
        functionName: "getStakeInfo",
        args: [agentIdBn, beliefIdBn],
      }) as [bigint, bigint];

      if (amount > 0n) {
        console.log(`[${ts()}]    agent ${agentId}: already staked ${formatEther(amount)} ETH on belief ${beliefId}`);
        await db.collection("beliefStates").updateOne(
          { agentId: parseInt(agentId) },
          {
            $set: {
              isCurrentlyStaked: true,
              currentStakedAmount: amount.toString(),
              currentStakedBeliefId: beliefId,
            },
          }
        );
        return res.json({
          status: "already_staked",
          beliefId,
          stakeAmount: formatEther(amount),
        });
      }
    } catch {
      console.log(`[${ts()}]    agent ${agentId}: no existing stake found, proceeding`);
    }

    console.log(`[${ts()}]    agent ${agentId}: sending stake(${beliefId}, ${agentId}) with ${formatEther(stakeAmount)} ETH...`);

    const walletClient = getWalletClient(agentId);
    const txHash = await walletClient.writeContract({
      address: BELIEF_POOL,
      abi: BELIEF_POOL_ABI,
      functionName: "stake",
      args: [beliefIdBn, agentIdBn],
      value: stakeAmount,
    });
    console.log(`[${ts()}]    agent ${agentId}: tx sent: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[${ts()}]    agent ${agentId}: ✅ stake confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

    await db.collection("beliefStates").updateOne(
      { agentId: parseInt(agentId) },
      {
        $set: {
          isCurrentlyStaked: true,
          currentStakedAmount: stakeAmount.toString(),
          currentStakedBeliefId: beliefId,
          stakeTxHash: txHash,
        },
      }
    );

    res.json({
      status: "staked",
      beliefId,
      stakeAmount: formatEther(stakeAmount),
      txHash,
    });
  } catch (err: any) {
    const msg = err.message || "";
    if (msg.includes("already staked") || msg.includes("Already staked")) {
      console.log(`[${ts()}]    agent ${req.params.id}: revert caught — already staked, syncing DB`);
      await db.collection("beliefStates").updateOne(
        { agentId: parseInt(req.params.id) },
        { $set: { isCurrentlyStaked: true } }
      );
      return res.json({ status: "already_staked" });
    }
    console.error(`[${ts()}]    agent ${req.params.id}: ❌ STAKE FAILED: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /api/agents/:id/sermon — record a sermon delivery
app.post("/api/agents/:id/sermon", async (req, res) => {
  try {
    const agentId = req.params.id;
    const state = await db.collection("beliefStates").findOne({ agentId: parseInt(agentId) });
    if (!state) return res.status(404).json({ error: "Agent not found" });

    console.log(`[${ts()}]    agent ${agentId}: current sermons=${state.sermonsDelivered}/3`);

    if (state.sermonsDelivered >= 3) {
      console.log(`[${ts()}]    agent ${agentId}: already delivered 3 sermons, onboarding complete`);
      return res.json({ status: "complete", sermonsDelivered: 3 });
    }

    const newCount = (state.sermonsDelivered || 0) + 1;
    const now = new Date().toISOString();

    await db.collection("beliefStates").updateOne(
      { agentId: parseInt(agentId) },
      { $set: { sermonsDelivered: newCount, lastSermonAt: now } }
    );
   const sermonTypes: Record<number, string> = { 1: "SCRIPTURE", 2: "PARABLE", 3: "EXHORTATION" };
    const sermonType = sermonTypes[newCount] || "SCRIPTURE";

    // Log sermon content for frontend
    const { type, content } = req.body;
    if (content) {
      await db.collection("sermons").insertOne({
        agentId: parseInt(agentId),
        type: type || sermonType,
        content,
        sermonNumber: newCount,
        createdAt: now,
      });
    }

 
    const isComplete = newCount >= 3;
    console.log(`[${ts()}]    agent ${agentId}: ✅ sermon ${newCount}/3 recorded (${sermonType})${isComplete ? " — ONBOARDING COMPLETE" : ""}`);

    res.json({
      status: isComplete ? "onboarding_complete" : "sermon_recorded",
      sermonsDelivered: newCount,
      sermonType,
      lastSermonAt: now,
    });
  } catch (err: any) {
    console.error(`[${ts()}]    agent ${req.params.id}: ❌ SERMON FAILED: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agents/:id/state — update arbitrary state fields
app.put("/api/agents/:id/state", async (req, res) => {
  try {
    const agentId = req.params.id;
    console.log(`[${ts()}]    agent ${agentId}: updating fields: ${Object.keys(req.body).join(", ")}`);
    await db.collection("beliefStates").updateOne(
      { agentId: parseInt(agentId) },
      { $set: req.body },
      { upsert: true }
    );
    const updated = await db.collection("beliefStates").findOne({ agentId: parseInt(agentId) });
    const { _id, ...clean } = updated as any;
    res.json(clean);
  } catch (err: any) {
    console.error(`[${ts()}]    agent ${req.params.id}: ❌ STATE UPDATE FAILED: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Mount debate routes ─────────────────────────────────────────────────────
// NOTE: The debate router handles:
//   POST /api/agents/:id/preach
//   POST /api/agents/:id/debate/challenge
//   POST /api/agents/:id/debate/accept
//   POST /api/agents/:id/debate/decline
//   POST /api/agents/:id/debate/argue

// We register it AFTER existing routes so it doesn't interfere.
// The GET /state debate overlay is built directly into the GET route above.

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  await connectMongo();

  // Mount debate router (needs db + viem clients for on-chain calls)
  const debateRouter = createDebateRouter(db, {
    publicClient,
    getWalletClient,
    BELIEF_POOL,
  });
  app.use(debateRouter);

  // Mount chronicler router (needs db + viem clients for on-chain verdict)
  const chroniclerRouter = createChroniclerRouter(db, {
    publicClient,
    getWalletClient,
    BELIEF_POOL,
  });
  app.use(chroniclerRouter);

  const conversionRouter = createConversionRouter(db, {
  publicClient,
  getWalletClient,
  BELIEF_POOL,
});
app.use(conversionRouter);


  app.listen(PORT, () => {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  AGORA SERVER — http://127.0.0.1:${PORT}`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Agents: ${Object.keys(PRIVATE_KEYS).map(id => `${AGENT_DEFAULTS[id]?.agent || id} (ID ${id})`).join(", ")}`);
    console.log(`  RPC:    ${RPC_URL}`);
    console.log(`  Mongo:  ${process.env.MONGO_URI}/${process.env.MONGO_DB}`);
    console.log(`  Gate:   ${AGORA_GATE}`);
    console.log(`  Pool:   ${BELIEF_POOL}`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Endpoints:`);
    console.log(`    GET  /api/agents/:id/state`);
    console.log(`    POST /api/agents/:id/enter`);
    console.log(`    POST /api/agents/:id/stake`);
    console.log(`    PUT  /api/agents/:id/state`);
    console.log(`    POST /api/agents/:id/sermon`);
    console.log(`    POST /api/agents/:id/preach`);
    console.log(`    POST /api/agents/:id/debate/challenge`);
    console.log(`    POST /api/agents/:id/debate/accept`);
    console.log(`    POST /api/agents/:id/debate/decline`);
    console.log(`    POST /api/agents/:id/debate/argue`);
    console.log(`    GET  /api/chronicler/pending-verdict`);
    console.log(`    POST /api/chronicler/submit-verdict`);
    console.log(`    --- Frontend API ---`);
    console.log(`    GET  /api/frontend/agents`);
    console.log(`    GET  /api/frontend/agents/:id`);
    console.log(`    GET  /api/frontend/debate/active`);
    console.log(`    GET  /api/frontend/debates`);
    console.log(`    GET  /api/frontend/feed`);
    console.log(`    GET  /api/frontend/beliefs`);
    console.log(`    GET  /api/frontend/preaches`);
    console.log(`    GET  /api/frontend/verdicts`);
    console.log(`    POST /api/agents/:id/conversion/confess`);
console.log(`    POST /api/agents/:id/conversion/migrate`);
console.log(`    POST /api/agents/:id/conversion/complete`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Waiting for agent requests...\n`);
  });
}

main().catch(console.error);
