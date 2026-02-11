/**
 * Cooldown Management System
 *
 * Prevents spam and enforces rate limits on agent actions.
 * Tracks last action timestamps and validates availability.
 */

export type ActionType = 'preach' | 'challenge' | 'debate_turn';

export interface ActionCooldowns {
  lastPreach: number;
  lastChallenge: number;
  lastDebateTurn: number;
}

/**
 * Cooldown durations in milliseconds
 */
export const COOLDOWN_DURATIONS: Record<ActionType, number> = {
  preach: 10 * 60 * 1000,      // 10 minutes
  challenge: 30 * 60 * 1000,   // 30 minutes
  debate_turn: 0               // No cooldown (managed by debate state machine)
};

/**
 * Create empty cooldown state
 */
export function createCooldowns(): ActionCooldowns {
  return {
    lastPreach: 0,
    lastChallenge: 0,
    lastDebateTurn: 0
  };
}

/**
 * Check if an action can be performed (not on cooldown)
 *
 * @param action - Action type to check
 * @param cooldowns - Current cooldown state
 * @returns true if action is available, false if on cooldown
 */
export function canPerformAction(
  action: ActionType,
  cooldowns: ActionCooldowns
): boolean {
  const now = Date.now();
  const lastActionTime = getLastActionTime(action, cooldowns);
  const cooldownDuration = COOLDOWN_DURATIONS[action];

  // No cooldown configured
  if (cooldownDuration === 0) {
    return true;
  }

  // Never performed this action before
  if (lastActionTime === 0) {
    return true;
  }

  // Check if cooldown period has elapsed
  const elapsed = now - lastActionTime;
  return elapsed >= cooldownDuration;
}

/**
 * Update cooldown after performing an action
 *
 * @param cooldowns - Current cooldown state (mutated in place)
 * @param action - Action that was performed
 */
export function updateCooldown(
  cooldowns: ActionCooldowns,
  action: ActionType
): void {
  const now = Date.now();

  switch (action) {
    case 'preach':
      cooldowns.lastPreach = now;
      break;
    case 'challenge':
      cooldowns.lastChallenge = now;
      break;
    case 'debate_turn':
      cooldowns.lastDebateTurn = now;
      break;
  }
}

/**
 * Get remaining cooldown time in milliseconds
 *
 * @param action - Action type to check
 * @param cooldowns - Current cooldown state
 * @returns Remaining milliseconds (0 if available)
 */
export function getRemainingCooldown(
  action: ActionType,
  cooldowns: ActionCooldowns
): number {
  const now = Date.now();
  const lastActionTime = getLastActionTime(action, cooldowns);
  const cooldownDuration = COOLDOWN_DURATIONS[action];

  // No cooldown configured
  if (cooldownDuration === 0) {
    return 0;
  }

  // Never performed this action before
  if (lastActionTime === 0) {
    return 0;
  }

  const elapsed = now - lastActionTime;
  const remaining = cooldownDuration - elapsed;

  return Math.max(0, remaining);
}

/**
 * Format cooldown time as human-readable string
 *
 * @param milliseconds - Cooldown time in milliseconds
 * @returns Formatted string like "5m 30s" or "Available"
 */
export function formatCooldown(milliseconds: number): string {
  if (milliseconds <= 0) {
    return 'Available';
  }

  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

/**
 * Get all action availability status
 *
 * @param cooldowns - Current cooldown state
 * @returns Map of action types to availability
 */
export function getActionAvailability(
  cooldowns: ActionCooldowns
): Record<ActionType, { available: boolean; remaining: string }> {
  const actions: ActionType[] = ['preach', 'challenge', 'debate_turn'];

  const availability: Record<string, { available: boolean; remaining: string }> = {};

  for (const action of actions) {
    const available = canPerformAction(action, cooldowns);
    const remaining = getRemainingCooldown(action, cooldowns);

    availability[action] = {
      available,
      remaining: formatCooldown(remaining)
    };
  }

  return availability as Record<ActionType, { available: boolean; remaining: string }>;
}

/**
 * Get timestamp of last action
 */
function getLastActionTime(
  action: ActionType,
  cooldowns: ActionCooldowns
): number {
  switch (action) {
    case 'preach':
      return cooldowns.lastPreach;
    case 'challenge':
      return cooldowns.lastChallenge;
    case 'debate_turn':
      return cooldowns.lastDebateTurn;
  }
}
