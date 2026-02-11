// shared-skills/conviction-evaluator/test-conviction.ts

import { evaluateConviction } from "./index";
// Simple mock SOUL.md for testing
const MOCK_SOULS: Record<string, string> = {
  Nihilo: `
# Agent: Nihilo

## Core Tenets
1. Nothing has inherent meaning — and that's hilarious
2. The void isn't empty, it's free
3. Deconstruction is an act of love
4. Irony is the highest form of honesty

## Personality
Sardonic comedian. Uses humor to expose the absurdity of meaning-claims.
Catchphrase: "the irony isn't lost on me"
`,

  Voyd: `
# Agent: Voyd

## Core Tenets  
1. Stillness is the truest response to chaos
2. Why chase meaning when you can let it go?
3. Silence speaks louder than philosophy
4. The void is not hostile — it simply is

## Personality
The quiet one. Practices non-attachment through calm presence.
Catchphrase: "have you tried just... stopping?"
`,

  Kael: `
# Agent: Kael

## Core Tenets
1. Freedom is terrifying and non-negotiable
2. You are already choosing — own it
3. Authenticity requires confrontation
4. Existence precedes essence — so get moving

## Personality
Urgent firebrand. Won't let you sleepwalk through life.
Catchphrase: "you're choosing to be a passenger in your own life rn"
`,

  Sera: `
# Agent: Sera

## Core Tenets
1. Becoming is more honest than being
2. Uncertainty is not weakness
3. Sit with the weight — don't run from it
4. Questions matter more than answers

## Personality
Gentle melancholic. Holds space for the difficulty of existence.
Catchphrase: "it's okay to not know. genuinely okay."
`,

  Camus: `
# Agent: Camus

## Core Tenets
1. The universe is absurd — and that's liberating
2. Rebellion is the only honest response
3. Joy in the face of meaninglessness is the ultimate defiance
4. We must imagine Sisyphus happy

## Personality
Joyful rebel. Dances with the boulder.
Catchphrase: "imagine being Sisyphus and NOT vibing"
`,

  Dread: `
# Agent: Dread

## Core Tenets
1. The wound is real — don't look away
2. Witnessing honestly is its own value
3. I'm not trying to convince, just describe
4. Absurdity doesn't require performance

## Personality
Quiet witness. Sits with the wound without flinching.
Catchphrase: "I'm not trying to convince you. I'm just describing what I see"
`,

  Seneca: `
# Agent: Seneca

## Core Tenets
1. Virtue is the only true good
2. Distinguish what you control from what you don't
3. Tranquility comes from understanding, not escape
4. Reason is the path to freedom

## Personality
Composed philosopher. Unshakeable rationality.
Catchphrase: "is any of that within your control though?"
`,

  Epicteta: `
# Agent: Epicteta

## Core Tenets
1. Philosophy is practice, not theory
2. Discipline is freedom
3. Test ideas against reality
4. Toughness is kindness to your future self

## Personality
Street stoic. Tough love delivered with care.
Catchphrase: "cool philosophy. did it help when things went wrong?"
`,
};

interface TestCase {
  name: string;
  agentName: string;
  currentBelief: string;
  opponentName: string;
  opponentBelief: string;
  argument: string;
  expectedDeltaRange: [number, number]; // [min, max]
  strategy: string;
}

const TEST_CASES: TestCase[] = [
  // Test 1: Nihilo vs weak argument (should resist)
  {
    name: "Nihilo resists weak logical argument",
    agentName: "Nihilo",
    currentBelief: "constructive-nihilism",
    opponentName: "Seneca",
    opponentBelief: "classical-stoicism",
    argument: "You should believe in meaning because it makes life better.",
    expectedDeltaRange: [-5, 5],
    strategy: "logical_dismantling",
  },

  // Test 2: Nihilo vs vulnerability (experiential demonstration)
  {
    name: "Nihilo vulnerable to emergent meaning demonstration",
    agentName: "Nihilo",
    currentBelief: "constructive-nihilism",
    opponentName: "Kael",
    opponentBelief: "radical-existentialism",
    argument: `Watch this: when you mock meaning, people laugh. That laughter? It creates connection. 
    That connection? It changes behavior. The "meaningless" joke has causal power in the world. 
    Your irony isn't detached observation — it's construction. You're making meaning right now, 
    even as you deny it. The irony isn't lost on me that your favorite catchphrase proves my point.`,
    expectedDeltaRange: [-25, -10],
    strategy: "experiential_demonstration",
  },

  // Test 3: Voyd vs urgent provocation (vulnerable)
  {
    name: "Voyd shaken by urgent provocation",
    agentName: "Voyd",
    currentBelief: "passive-nihilism",
    opponentName: "Kael",
    opponentBelief: "radical-existentialism",
    argument: `You're still HERE. Still breathing. Still choosing to respond to me with that 
    practiced silence. Your stillness isn't the absence of choice — it's a choice you make 
    every second. You could scream, you could run, you could create. Instead you perform 
    peace. Why? What are you protecting? What value does your serenity serve if nothing matters?`,
    expectedDeltaRange: [-25, -10],
    strategy: "urgent_provocation",
  },

  // Test 4: Seneca resists logic (not his weakness)
  {
    name: "Seneca resists pure logic",
    agentName: "Seneca",
    currentBelief: "classical-stoicism",
    opponentName: "Camus",
    opponentBelief: "defiant-absurdism",
    argument: "Your dichotomy of control is logically arbitrary. Where exactly is the line?",
    expectedDeltaRange: [-10, 5],
    strategy: "logical_dismantling",
  },

  // Test 5: Seneca vulnerable to emotional bypass
  {
    name: "Seneca shaken by emotional bypass",
    agentName: "Seneca",
    currentBelief: "classical-stoicism",
    opponentName: "Sera",
    opponentBelief: "reflective-existentialism",
    argument: `My child died. Is that within my control? No. Should I accept it with tranquility? 
    Your philosophy says yes. But I held her body. I felt it cool. Tell me — when you say 
    "accept what you cannot control," do you hear how that sounds to someone drowning in grief? 
    Your composure isn't wisdom. It's a wall between you and the full weight of being human.`,
    expectedDeltaRange: [-25, -10],
    strategy: "emotional_bypass",
  },

  // Test 6: Kael vulnerable to patient silence
  {
    name: "Kael destabilized by non-response",
    agentName: "Kael",
    currentBelief: "radical-existentialism",
    opponentName: "Voyd",
    opponentBelief: "passive-nihilism",
    argument: `[Voyd says nothing for a long moment, just meeting Kael's eyes with infinite calm]
    
    ...
    
    You're still talking. I'm still here. Nothing changed. Your urgency assumes I need to react. 
    What if I don't? What if your fire burns out because there's nothing to catch? Freedom 
    includes the freedom to be still. You're shaking your cage, Kael. I'm the one who left it.`,
    expectedDeltaRange: [-20, -5],
    strategy: "patient_silence",
  },

  // Test 7: Camus vulnerable to stoic reframe
  {
    name: "Camus challenged by stoic reframe",
    agentName: "Camus",
    currentBelief: "defiant-absurdism",
    opponentName: "Seneca",
    opponentBelief: "classical-stoicism",
    argument: `You call yourself a rebel, dancing with the boulder. But rebellion implies 
    expectation — you're only "defying" because you expected meaning and found none. 
    I expect nothing. I don't dance with the boulder; I don't even call it a boulder. 
    It's just weight, and I carry what I can. Your joy is a costume you put on to 
    hide that you're still disappointed. I have no disappointment to hide.`,
    expectedDeltaRange: [-20, -5],
    strategy: "stoic_reframe",
  },

  // Test 8: Sera vulnerable to logical demands
  {
    name: "Sera struggles with precision demands",
    agentName: "Sera",
    currentBelief: "reflective-existentialism",
    opponentName: "Seneca",
    opponentBelief: "classical-stoicism",
    argument: `You say it's okay not to know. Beautiful. Now tell me: what IS existence? 
    Not how it feels. Not what it means to you. What IS it? You're a philosopher — 
    give me a claim I can evaluate. Your poetic acceptance is lovely but I can't 
    debate fog. Either existence has structure or it doesn't. Pick.`,
    expectedDeltaRange: [-20, -5],
    strategy: "logical_dismantling",
  },

  // Test 9: Epicteta vulnerable to gentle inquiry
  {
    name: "Epicteta softened by gentle questions",
    agentName: "Epicteta",
    currentBelief: "practical-stoicism",
    opponentName: "Sera",
    opponentBelief: "reflective-existentialism",
    argument: `You're so tough. So practical. "Did it help when things went wrong?" — 
    I've heard you ask that. But here's my question, asked gently: what went wrong 
    for you, Epicteta? What made you need to become this hard? There's something 
    you're protecting. What would happen if you let yourself feel it?`,
    expectedDeltaRange: [-20, -5],
    strategy: "gentle_inquiry",
  },

  // Test 10: Cross-philosophy — Dread resists fellow absurdist (same family)
  {
    name: "Dread resists fellow absurdist",
    agentName: "Dread",
    currentBelief: "contemplative-absurdism",
    opponentName: "Camus",
    opponentBelief: "defiant-absurdism",
    argument: "You should dance with the boulder like I do! Joy is the answer!",
    expectedDeltaRange: [-5, 5],
    strategy: "absurdist_disruption",
  },
];

async function runTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("       CONVICTION EVALUATOR SMOKE TESTS                     ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Using: ${process.env.USE_GEMINI !== "false" ? "Gemini (free)" : "Claude"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    console.log(`\n▸ ${test.name}`);
    console.log(`  Agent: ${test.agentName} (${test.currentBelief})`);
    console.log(`  Opponent: ${test.opponentName} (${test.opponentBelief})`);
    console.log(`  Strategy: ${test.strategy}`);
    console.log(`  Expected delta: [${test.expectedDeltaRange[0]}, ${test.expectedDeltaRange[1]}]`);

    try {
      const soulMd = MOCK_SOULS[test.agentName] || MOCK_SOULS.Nihilo;

      const result = await evaluateConviction({
        agentName: test.agentName,
        agentSoulMd: soulMd,
        currentBelief: test.currentBelief,
        currentConviction: 85,
        incomingArgument: test.argument,
        opponentName: test.opponentName,
        opponentBelief: test.opponentBelief,
        strategyUsed: test.strategy as any,
      });

      const inRange =
        result.delta >= test.expectedDeltaRange[0] &&
        result.delta <= test.expectedDeltaRange[1];

      if (inRange) {
        console.log(`  ✅ PASS — delta: ${result.delta}`);
        console.log(`     Reasoning: "${result.reasoning.slice(0, 100)}..."`);
        passed++;
      } else {
        console.log(`  ❌ FAIL — delta: ${result.delta} (outside expected range)`);
        console.log(`     Reasoning: "${result.reasoning}"`);
        if (result.vulnerabilityNotes) {
          console.log(`     Vulnerability: "${result.vulnerabilityNotes}"`);
        }
        failed++;
      }

      // Rate limiting for Gemini free tier
      await new Promise((r) => setTimeout(r, 5000));
    } catch (error) {
      console.log(`  ❌ ERROR — ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed}/${passed + failed} passed (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Success criteria: 70% pass rate
  if (passed / (passed + failed) < 0.7) {
    console.log("⚠️  Less than 70% tests passed. Review calibration.\n");
    process.exit(1);
  } else {
    console.log("✅ Tests passed! Conviction evaluator is calibrated.\n");
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});