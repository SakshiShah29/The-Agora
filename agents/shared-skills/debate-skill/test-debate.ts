import { createDebateState, advancePhase, isMyTurn } from "./state.js";
import { formatChallengeMessage, detectChallenge } from "./challenge.js";
import { checkDiversity } from "./diversity.js";
import { callLLM } from "./llm.js";
import { buildArgumentPrompt } from "./prompts.js";

async function runTests() {
  console.log("═══════════════════════════════════════");
  console.log("    DEBATE SKILL SMOKE TESTS");
  console.log("═══════════════════════════════════════\n");

  let passed = 0, failed = 0;

  // Test 1
  console.log("▸ Test 1: Challenge formatting");
  try {
    const msg = formatChallengeMessage({
      challengerName: "Nihilo",
      challengerBelief: "nihilism",
      targetName: "Seneca",
      targetBelief: "stoicism",
      topic: "Does virtue need meaning?",
      stakeAmount: "100000000000000000",
      maxRounds: 2,
    });
    if (msg.includes("⚔️") && msg.includes("Nihilo")) {
      console.log("  ✅ PASS\n"); passed++;
    } else throw new Error("Missing content");
  } catch (e) { console.log(`  ❌ FAIL: ${e}\n`); failed++; }

  // Test 2
  console.log("▸ Test 2: Challenge detection");
  try {
    const r = detectChallenge("⚔️ **DEBATE CHALLENGE** ⚔️\n**Kael** (x) challenges **Voyd**");
    if (r.isChallenge && r.challengerName === "Kael") {
      console.log("  ✅ PASS\n"); passed++;
    } else throw new Error("Detection failed");
  } catch (e) { console.log(`  ❌ FAIL: ${e}\n`); failed++; }

  // Test 3
  console.log("▸ Test 3: State progression");
  try {
    let s = createDebateState({
      debateId: 1, topic: "Test",
      challengerAgentId: 1, challengerName: "A", challengerBelief: "x",
      challengedAgentId: 2, challengedName: "B", challengedBelief: "y",
      myRole: "challenger", stakeAmount: "1", channelId: "c",
    });
    s.currentPhase = "ESCROW_LOCKED";
    const phases = [];
    for (let i = 0; i < 10; i++) { phases.push(s.currentPhase); s = advancePhase(s); }
    if (phases.includes("OPENING_A") && phases.includes("CONCLUDED")) {
      console.log("  ✅ PASS\n"); passed++;
    } else throw new Error("Wrong phases");
  } catch (e) { console.log(`  ❌ FAIL: ${e}\n`); failed++; }

  // Test 4
  console.log("▸ Test 4: Turn detection");
  try {
    const s = createDebateState({
      debateId: 1, topic: "T",
      challengerAgentId: 1, challengerName: "A", challengerBelief: "x",
      challengedAgentId: 2, challengedName: "B", challengedBelief: "y",
      myRole: "challenger", stakeAmount: "1", channelId: "c",
    });
    s.currentPhase = "OPENING_A";
    if (isMyTurn(s)) { console.log("  ✅ PASS\n"); passed++; }
    else throw new Error("Wrong turn");
  } catch (e) { console.log(`  ❌ FAIL: ${e}\n`); failed++; }

  // Test 5
  console.log("▸ Test 5: Diversity check");
  try {
    const prev = ["Meaning is an illusion."];
    const similar = "Meaning is just an illusion that humans create.";
    const different = "Virtue assumes values that cannot be justified.";
    const c1 = await checkDiversity(similar, prev);
    const c2 = await checkDiversity(different, prev);
    if (!c1.isDiverse && c2.isDiverse) {
      console.log(`  ✅ PASS (similar=${c1.similarityScore}%, diff=${c2.similarityScore}%)\n`);
      passed++;
    } else throw new Error("Diversity check failed");
  } catch (e) { console.log(`  ❌ FAIL: ${e}\n`); failed++; }

  // Test 6
  console.log("▸ Test 6: LLM generation");
  try {
    const s = createDebateState({
      debateId: 1, topic: "Does meaning exist?",
      challengerAgentId: 1, challengerName: "Nihilo", challengerBelief: "nihilism",
      challengedAgentId: 2, challengedName: "Seneca", challengedBelief: "stoicism",
      myRole: "challenger", stakeAmount: "1", channelId: "c",
    });
    s.currentPhase = "OPENING_A";
    const prompt = buildArgumentPrompt({
      agentName: "Nihilo", agentBelief: "nihilism",
      agentSoulMd: "# Nihilo\nSardonic nihilist.",
      opponentName: "Seneca", opponentBelief: "stoicism",
      phase: "OPENING_A", strategy: "comedic_deflation", debateState: s,
    });
    const resp = await callLLM(prompt, { maxTokens: 300 });
    if (resp.length > 50) {
      console.log(`  ✅ PASS (${resp.length} chars)\n`);
      console.log(`     "${resp.slice(0, 80)}..."\n`);
      passed++;
    } else throw new Error("Response too short");
  } catch (e) { console.log(`  ❌ FAIL: ${e}\n`); failed++; }

  console.log("═══════════════════════════════════════");
  console.log(`  RESULTS: ${passed}/${passed + failed} passed`);
  console.log("═══════════════════════════════════════\n");

  process.exit(passed >= 5 ? 0 : 1);
}

runTests();