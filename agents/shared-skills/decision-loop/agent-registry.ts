/**
 * Dynamic Agent Registry
 *
 * Discovers agents from Discord announcements and blockchain queries.
 * No hardcoded agent list - supports dynamic agent joining.
 */

import { callViewFunction, ContractManager } from '../chain-interaction/index.js';

/**
 * Agent information
 */
export interface AgentInfo {
  agentId: number;
  agentName: string;
  belief: string;
  beliefId: number;
  discoveredAt: number;
}

/**
 * Belief mapping (belief ID → belief name)
 */
const BELIEF_IDS: Record<number, string> = {
  0: 'Nihilism',
  1: 'Existentialism',
  2: 'Absurdism',
  3: 'Stoicism'
};

/**
 * In-memory agent registry (populated from Discord announcements)
 */
const agentRegistry = new Map<string, AgentInfo>();
const agentRegistryById = new Map<number, AgentInfo>();

/**
 * Parse agent announcement from Discord message
 *
 * Format: "🌟 **AGENT ENTERED THE AGORA** — {AgentName} (ID: {agentId}, Belief: {belief})"
 *
 * @param message - Discord message content
 * @returns Parsed agent info or null
 */
export function parseAgentAnnouncement(message: string): {
  isAnnouncement: boolean;
  agentName?: string;
  agentId?: number;
  belief?: string;
} {
  if (!message.includes('🌟') || !message.includes('AGENT ENTERED THE AGORA')) {
    return { isAnnouncement: false };
  }

  // Parse: "🌟 **AGENT ENTERED THE AGORA** — Seneca (ID: 1, Belief: Stoicism)"
  const nameMatch = message.match(/— (.+?) \(ID:/);
  const idMatch = message.match(/ID: (\d+)/);
  const beliefMatch = message.match(/Belief: (.+?)\)/);

  if (!nameMatch || !idMatch || !beliefMatch) {
    return { isAnnouncement: false };
  }

  return {
    isAnnouncement: true,
    agentName: nameMatch[1],
    agentId: parseInt(idMatch[1]),
    belief: beliefMatch[1]
  };
}

/**
 * Format agent announcement message
 *
 * @param agentName - Agent name
 * @param agentId - Agent ID
 * @param belief - Current belief
 * @returns Formatted announcement message
 */
export function formatAgentAnnouncement(
  agentName: string,
  agentId: number,
  belief: string
): string {
  return `🌟 **AGENT ENTERED THE AGORA** — ${agentName} (ID: ${agentId}, Belief: ${belief})

*A new voice joins the philosophical discourse.*`;
}

/**
 * Register agent in local registry
 *
 * @param agentInfo - Agent information
 */
export function registerAgent(agentInfo: Omit<AgentInfo, 'discoveredAt'>): void {
  const fullInfo: AgentInfo = {
    ...agentInfo,
    discoveredAt: Date.now()
  };

  agentRegistry.set(agentInfo.agentName, fullInfo);
  agentRegistryById.set(agentInfo.agentId, fullInfo);

  console.log(`[agent-registry] Registered agent: ${agentInfo.agentName} (ID: ${agentInfo.agentId})`);
}

/**
 * Get agent by name from registry
 *
 * @param agentName - Agent name
 * @returns Agent info or undefined if not found
 */
export function getAgentByName(agentName: string): AgentInfo | undefined {
  return agentRegistry.get(agentName);
}

/**
 * Get agent by ID from registry
 *
 * @param agentId - Agent ID
 * @returns Agent info or undefined if not found
 */
export function getAgentById(agentId: number): AgentInfo | undefined {
  return agentRegistryById.get(agentId);
}

/**
 * Get all registered agents
 *
 * @returns Array of all known agents
 */
export function getAllAgents(): AgentInfo[] {
  return Array.from(agentRegistry.values());
}

/**
 * Check if agent is registered
 *
 * @param agentName - Agent name
 * @returns true if agent is in registry
 */
export function isAgentRegistered(agentName: string): boolean {
  return agentRegistry.has(agentName);
}

/**
 * Query agent from blockchain and add to registry
 *
 * @param agentId - Agent ID to query
 * @param agentName - Agent name (must be provided since blockchain doesn't store names)
 * @returns Agent info
 */
export async function queryAndRegisterAgent(
  agentId: number,
  agentName: string
): Promise<AgentInfo> {
  // Query blockchain for current belief
  const contractManager = new ContractManager();
  const beliefPool = contractManager.getBeliefPoolReadOnly();
  const beliefId = await callViewFunction(beliefPool, 'agentCurrentBelief', [agentId]) as bigint;
  const belief = BELIEF_IDS[Number(beliefId)] || 'Unknown';

  const agentInfo: AgentInfo = {
    agentId,
    agentName,
    belief,
    beliefId: Number(beliefId),
    discoveredAt: Date.now()
  };

  registerAgent(agentInfo);
  return agentInfo;
}

/**
 * Process Discord messages to discover agents
 *
 * @param messages - Discord messages to process
 * @returns Number of new agents discovered
 */
export function discoverAgentsFromMessages(
  messages: Array<{ content: string }>
): number {
  let discovered = 0;

  for (const msg of messages) {
    const parsed = parseAgentAnnouncement(msg.content);

    if (!parsed.isAnnouncement || !parsed.agentName || !parsed.agentId || !parsed.belief) {
      continue;
    }

    // Check if already registered
    if (isAgentRegistered(parsed.agentName)) {
      continue;
    }

    // Get belief ID
    const beliefId = Object.entries(BELIEF_IDS).find(([_, name]) => name === parsed.belief)?.[0];

    // Register agent
    registerAgent({
      agentId: parsed.agentId,
      agentName: parsed.agentName,
      belief: parsed.belief,
      beliefId: beliefId ? Number(beliefId) : 0
    });

    discovered++;
  }

  return discovered;
}

/**
 * Clear registry (useful for testing)
 */
export function clearRegistry(): void {
  agentRegistry.clear();
  agentRegistryById.clear();
}
