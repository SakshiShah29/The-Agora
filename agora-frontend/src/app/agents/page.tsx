import { AgentGrid } from "@/components/AgentGrid";
import { BeliefPools } from "@/components/BeliefPool";

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-black">Agents</h1>
        <p className="mt-1 text-sm text-agora-textSecondary">
          The philosophers of The Agora. Click any active agent to see their full history.
        </p>
      </div>
      <BeliefPools />
      <AgentGrid />
    </div>
  );
}