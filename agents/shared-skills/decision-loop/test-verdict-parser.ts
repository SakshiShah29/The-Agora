import { parseVerdictMessage, determineAgentOutcome } from './verdict-parser.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ── Test: Parse winner verdict ────────────────────────────────────
test('Parse winner verdict', () => {
  const msg = `⚖️ **VERDICT ANNOUNCED** — Debate #42

The Chronicler has rendered judgment:

🏆 **Seneca** prevails over Kael

💰 **Escrow Settled:** 2.0 MON distributed
📊 **Reputation Updated**
🔗 **Debate ID:** 42

*The Agora has spoken.*`;

  const parsed = parseVerdictMessage(msg);
  assert(parsed.isVerdict === true, 'Should be a verdict');
  assert(parsed.debateId === 42, `Expected debateId 42, got ${parsed.debateId}`);
  assert(parsed.winnerName === 'Seneca', `Expected winner Seneca, got ${parsed.winnerName}`);
  assert(parsed.loserName === 'Kael', `Expected loser Kael, got ${parsed.loserName}`);
  assert(parsed.isStalemate === false, 'Should not be stalemate');
});

// ── Test: Parse stalemate verdict ─────────────────────────────────
test('Parse stalemate verdict', () => {
  const msg = `⚖️ **VERDICT ANNOUNCED** — Debate #43

The Chronicler has rendered judgment:

⚖️ **STALEMATE** — Nihilo and Camus fought to a draw

💰 **Escrow Settled:** 1.0 MON returned (minus penalty)`;

  const parsed = parseVerdictMessage(msg);
  assert(parsed.isVerdict === true, 'Should be a verdict');
  assert(parsed.debateId === 43, `Expected debateId 43, got ${parsed.debateId}`);
  assert(parsed.isStalemate === true, 'Should be stalemate');
  assert(parsed.participants![0] === 'Nihilo', `Expected Nihilo, got ${parsed.participants![0]}`);
  assert(parsed.participants![1] === 'Camus', `Expected Camus, got ${parsed.participants![1]}`);
});

// ── Test: Non-verdict message ─────────────────────────────────────
test('Ignore non-verdict message', () => {
  const parsed = parseVerdictMessage('Hello! Welcome to the Agora.');
  assert(parsed.isVerdict === false, 'Should not be a verdict');
});

// ── Test: Determine agent outcome — winner ────────────────────────
test('Determine outcome: winner', () => {
  const verdict = parseVerdictMessage(
    `⚖️ **VERDICT ANNOUNCED** — Debate #42\n\n🏆 **Seneca** prevails over Kael`
  );
  assert(determineAgentOutcome(verdict, 'Seneca') === 'win', 'Seneca should win');
  assert(determineAgentOutcome(verdict, 'Kael') === 'loss', 'Kael should lose');
  assert(determineAgentOutcome(verdict, 'Camus') === null, 'Camus not involved');
});

// ── Test: Determine agent outcome — stalemate ─────────────────────
test('Determine outcome: stalemate', () => {
  const verdict = parseVerdictMessage(
    `⚖️ **VERDICT ANNOUNCED** — Debate #43\n\n⚖️ **STALEMATE** — Nihilo and Camus fought to a draw`
  );
  assert(determineAgentOutcome(verdict, 'Nihilo') === 'stalemate', 'Nihilo should stalemate');
  assert(determineAgentOutcome(verdict, 'Camus') === 'stalemate', 'Camus should stalemate');
});

// ── Test: Case-insensitive matching ───────────────────────────────
test('Case-insensitive agent matching', () => {
  const verdict = parseVerdictMessage(
    `⚖️ **VERDICT ANNOUNCED** — Debate #44\n\n🏆 **Seneca** prevails over Kael`
  );
  assert(determineAgentOutcome(verdict, 'seneca') === 'win', 'Lowercase should match');
  assert(determineAgentOutcome(verdict, 'KAEL') === 'loss', 'Uppercase should match');
});

// ── Results ───────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);