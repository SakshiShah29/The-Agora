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

const localChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const publicClient = createPublicClient({
  chain: localChain,
  transport: http(RPC_URL),
});

function getWalletClient(agentId: string) {
  const pk = PRIVATE_KEYS[agentId];
  if (!pk) throw new Error(`No private key for agent ${agentId}`);
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: localChain,
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

// ─── Default belief state ────────────────────────────────────────────────────

const AGENT_DEFAULTS: Record<string, any> = {
  "6": {
    agent: "seneca",
    agentId: 6,
    coreBeliefId: 4,
    currentBelief: "classical-stoicism",
    conviction: 88,
  },
  "5": {
    agent: "nihilo",
    agentId: 5,
    coreBeliefId: 1,
    currentBelief: "constructive-nihilism",
    conviction: 85,
  },
};

function defaultState(agentId: string) {
  const base = AGENT_DEFAULTS[agentId];
  if (!base) throw new Error(`Unknown agent ${agentId}`);
  return {
    ...base,
    hasEnteredAgora: false,
    isCurrentlyStaked: false,
    sermonsDelivered: 0,
    lastSermonAt: null,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/agents/:id/state — read belief state from MongoDB
app.get("/api/agents/:id/state", async (req, res) => {
  try {
    const agentId = req.params.id;
    let state = await db.collection("beliefStates").findOne({ agentId: parseInt(agentId) });
    if (!state) {
      console.log(`[${ts()}]    agent ${agentId}: no state found, initializing defaults`);
      const def = defaultState(agentId);
      await db.collection("beliefStates").insertOne(def);
      state = def;
    }
    const { _id, ...clean } = state as any;
    console.log(`[${ts()}]    agent ${agentId}: entered=${clean.hasEnteredAgora} staked=${clean.isCurrentlyStaked} sermons=${clean.sermonsDelivered}/3`);
    res.json(clean);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/:id/enter — enter The Agora (on-chain)
// Mirrors: onboardAgent() → agoraGate.enter(agentId) { value: entryFee }
app.post("/api/agents/:id/enter", async (req, res) => {
  try {
    const agentId = req.params.id;
    const agentIdBn = BigInt(agentId);
    console.log(`[${ts()}]    agent ${agentId}: checking on-chain entry status...`);

    // 1. Check if already entered
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

    // 2. Get entry fee
    const entryFee = await publicClient.readContract({
      address: AGORA_GATE,
      abi: AGORA_GATE_ABI,
      functionName: "entryFee",
    });
    console.log(`[${ts()}]    agent ${agentId}: entry fee = ${formatEther(entryFee)} ETH`);

    // 3. Enter
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

    // 4. Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[${ts()}]    agent ${agentId}: ✅ tx confirmed block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

    // 5. Update DB
    await db.collection("beliefStates").updateOne(
      { agentId: parseInt(agentId) },
      { $set: { hasEnteredAgora: true, entryTime: Date.now() } },
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
// Mirrors: onboardAgent() → beliefPool.stake(beliefId, agentId) { value: stakeAmount }
// IMPORTANT: args order is [beliefId, agentId] — belief FIRST
app.post("/api/agents/:id/stake", async (req, res) => {
  try {
    const agentId = req.params.id;
    const agentIdBn = BigInt(agentId);
    const state = await db.collection("beliefStates").findOne({ agentId: parseInt(agentId) });
    if (!state) return res.status(404).json({ error: "Agent not found. Call /enter first." });

    const beliefId = state.coreBeliefId;
    const beliefIdBn = BigInt(beliefId);
    const stakeAmount = parseEther("0.1"); // 100000000000000000 wei
    console.log(`[${ts()}]    agent ${agentId}: checking existing stake for belief ${beliefId}...`);

    // Check if already staked
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
      console.log(`[${ts()}]    agent ${agentId}: no existing stake found (getStakeInfo reverted), proceeding`);
    }

    console.log(`[${ts()}]    agent ${agentId}: sending stake(${beliefId}, ${agentId}) with ${formatEther(stakeAmount)} ETH...`);

    // Stake: beliefPool.stake(beliefId, agentId) { value: stakeAmount }
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

    // Update DB
    await db.collection("beliefStates").updateOne(
      { agentId: parseInt(agentId) },
      {
        $set: {
          isCurrentlyStaked: true,
          currentStakedAmount: stakeAmount.toString(),
          currentStakedBeliefId: beliefId,
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

    console.log(`[${ts()}]    agent ${agentId}: current sermons=${state.sermonsDelivered}/3, lastAt=${state.lastSermonAt || "never"}`);

    // Check cooldown (10 min)
    if (state.lastSermonAt) {
      const elapsed = Date.now() - new Date(state.lastSermonAt).getTime();
      if (elapsed < 10 * 60 * 1000) {
        const waitSec = Math.ceil((10 * 60 * 1000 - elapsed) / 1000);
        console.log(`[${ts()}]    agent ${agentId}: ⏳ cooldown active, ${waitSec}s remaining`);
        return res.status(429).json({
          error: "cooldown",
          message: `Wait ${waitSec}s before next sermon`,
          waitSeconds: waitSec,
        });
      }
    }

    // Check max sermons
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

    // Determine sermon type
    const sermonTypes: Record<number, string> = { 1: "SCRIPTURE", 2: "PARABLE", 3: "EXHORTATION" };
    const sermonType = sermonTypes[newCount] || "SCRIPTURE";

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

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  await connectMongo();
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
    console.log(`  Waiting for agent requests...\n`);
  });
}

main().catch(console.error);