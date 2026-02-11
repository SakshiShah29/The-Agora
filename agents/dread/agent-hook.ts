/**
 * udread Agent Hook
 *
 * This file is called by OpenClaw to start udread's decision-loop.
 * It imports the shared hook and provides agent-specific initialization.
 */

import { startAgentHook } from '../shared-skills/decision-loop/openclaw-hook.js';

// Export for OpenClaw
export default startAgentHook;

// If OpenClaw expects a specific function name, alias it
export const onAgentStart = startAgentHook;
export const init = startAgentHook;
export const main = startAgentHook;
