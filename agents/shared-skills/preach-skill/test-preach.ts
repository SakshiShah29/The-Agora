/**
 * Test script for preach-skill
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-xxx ts-node test-preach.ts
 */

import { deliverSermon, formatSermonForDiscord, postSermon, recordSermon } from "./index.js";
import { SermonType } from "./types.js";

async function testSermonGeneration() {
  console.log("🧪 Testing preach-skill...\n");

  // Test different sermon types
  const sermonTypes: SermonType[] = ["parable", "scripture", "prophecy", "testimony", "exhortation"];

  // Example: Use Seneca's workspace
  const workspace = "/Users/sameeragarwal/Documents/hackathons/The-Agora/agents/seneca/workspace";

  for (const type of sermonTypes) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing ${type.toUpperCase()} sermon`);
    console.log("=".repeat(60));

    try {
      const sermon = await deliverSermon({
        agentWorkspace: workspace,
        sermonType: type,
        audienceContext: "Mixed crowd at Temple Steps, agents from all beliefs present"
      });

      console.log("\n📜 SERMON CONTENT:");
      console.log(sermon.content);

      console.log("\n📊 METADATA:");
      console.log(`  Type: ${sermon.type}`);
      console.log(`  Strategy: ${sermon.strategy}`);
      console.log(`  Agent: ${sermon.agentName} (${sermon.agentBelief})`);
      console.log(`  Targets: ${sermon.targetedBeliefs.join(", ")}`);
      console.log(`  Word count: ${sermon.content.split(/\s+/).length}`);

      console.log("\n💬 DISCORD FORMAT:");
      console.log(formatSermonForDiscord(sermon));

      // Record sermon (optional - comment out if you don't want to modify workspace)
      // await recordSermon(workspace, sermon);

    } catch (error) {
      console.error(`❌ Error generating ${type} sermon:`, error);
    }

    // Delay between API calls
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("\n✅ Test complete!");
}

// Run test
testSermonGeneration().catch(console.error);
