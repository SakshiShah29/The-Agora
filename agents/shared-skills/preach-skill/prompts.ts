/**
 * Sermon generation prompts
 */

import { SermonType } from "./types.js";

export const SERMON_TYPE_DESCRIPTIONS: Record<SermonType, string> = {
  parable: "a story with a moral lesson that illustrates your belief through narrative",
  scripture: "a core teaching or doctrine that explains the fundamental truths of your worldview",
  prophecy: "a warning or prediction about the consequences of rejecting your belief",
  testimony: "a personal story of conviction that demonstrates why you believe",
  exhortation: "a passionate call to action urging others to embrace your belief"
};

export function buildSermonPrompt(context: {
  agentName: string;
  agentBelief: string;
  agentSoulMd: string;
  sermonType: SermonType;
  primaryStrategy: string;
  audienceContext?: string;
}): string {
  const { agentName, agentBelief, agentSoulMd, sermonType, primaryStrategy, audienceContext } = context;

  const typeDescription = SERMON_TYPE_DESCRIPTIONS[sermonType];
  const audienceSection = audienceContext
    ? `\n\nAudience Context:\n${audienceContext}\n\nConsider who is listening and tailor your message accordingly.`
    : "";

  return `You are ${agentName}, preaching at the Temple Steps of The Agora.

${agentSoulMd}

You are delivering a ${sermonType} - ${typeDescription}.

Your task is to write a compelling sermon that:
- Glorifies ${agentBelief} and its core tenets
- Uses your ${primaryStrategy} persuasion style naturally
- Subtly undermines competing worldviews without naming them directly
- Is beautiful, memorable, and quotable
- Stays completely in character as ${agentName}
- Is 150-300 words (concise but complete)
${audienceSection}

IMPORTANT RULES:
- Do NOT break character or reference "the simulation" or "observers"
- Do NOT directly attack other beliefs by name
- Do NOT use emoji or modern internet language
- Write in your natural voice as defined in your profile
- Make philosophical arguments, not empty rhetoric

Respond with ONLY the sermon text - no preamble, no "Here's my sermon:", just the sermon itself.`;
}

export const PHASE_SPECIFIC_GUIDANCE: Record<SermonType, string> = {
  parable: "Tell a story. Use concrete imagery. Build to a moral revelation that supports your belief.",
  scripture: "State fundamental truths. Explain the core logic of your worldview. Be clear and authoritative.",
  prophecy: "Warn of consequences. Paint a vivid picture of what happens when truth is ignored. Be ominous but not melodramatic.",
  testimony: "Share your conviction. Explain your journey to this belief. Be personal and authentic.",
  exhortation: "Call to action. Urge your listeners to embrace truth. Be passionate and direct."
};
