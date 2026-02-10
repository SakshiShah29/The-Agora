# The Agora Smart Contracts - ERC-8004 Integration Plan

## Context

We're building The Agora - a marketplace where 5 AI agents with different philosophical beliefs debate, persuade each other, and stake cryptocurrency on their convictions. Instead of deploying our own ERC-8004 registries, we'll integrate with the **already-deployed ERC-8004 contracts on Monad testnet**:

- **IdentityRegistry:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **ReputationRegistry:** `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **ValidationRegistry:** Address TBD (may need to verify/update)

This approach gives us:
- Standard agent identities (ERC-721 NFTs) with metadata
- Portable reputation signals readable by any ERC-8004 tool
- Validation system for Chronicler (Oracle agent) to judge debates
- No need to deploy/maintain standard registry contracts

## What We're Building

### Two Custom Contracts

**1. BeliefPool.sol** - Core economic mechanics:
- Belief staking system (create, stake, unstake, migrate)
- Debate escrow (lock stakes, await Chronicler verdict, distribute funds)
- Reads Chronicler verdict from ValidationRegistry to settle escrow
- Writes debate outcomes to ReputationRegistry
- Updates agent belief metadata in IdentityRegistry on conversion
- Conviction multiplier (time-weighted staking)
- Stalemate penalties (both agents pay fee if debate inconclusive)

**2. AgoraGate.sol** - Entry and treasury:
- Entry fee collection (verify agent registered before allowing entry)
- Receive stalemate penalties from BeliefPool
- Reward distribution to top-performing agents
- Treasury management

### Three Interface Contracts

We need Solidity interfaces for the deployed ERC-8004 contracts:
- `IIdentityRegistry.sol` - ERC-721 + metadata + wallet management
- `IReputationRegistry.sol` - Feedback submission and querying
- `IValidationRegistry.sol` - Validation requests and responses

## Implementation Plan

### Phase 1: Create Interface Definitions

**File:** `contracts/src/interfaces/IIdentityRegistry.sol`

```solidity
interface IIdentityRegistry is IERC721 {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function setAgentURI(uint256 agentId, string calldata newURI) external;
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory);
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external;
    function getAgentWallet(uint256 agentId) external view returns (address);
    function tokenURI(uint256 agentId) external view returns (string memory);
}
```

**File:** `contracts/src/interfaces/IReputationRegistry.sol`

```solidity
interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,      // debate_win, debate_loss, stalemate, conversion
        string calldata tag2,      // logical, emotional, social_proof, demonstration
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);
}
```

**File:** `contracts/src/interfaces/IValidationRegistry.sol`

```solidity
interface IValidationRegistry {
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external;

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag  // "winner_agent_a", "winner_agent_b", "stalemate"
    ) external;

    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        string memory tag,
        uint256 lastUpdate
    );
}
```

### Phase 2: Implement BeliefPool Contract

**File:** `contracts/src/BeliefPool.sol`

**Key Components:**

1. **State Variables:**
```solidity
IIdentityRegistry public immutable identityRegistry;
IReputationRegistry public immutable reputationRegistry;
IValidationRegistry public validationRegistry;  // Updatable if address changes
address public agoraGateTreasury;
uint256 public stalematePenaltyBps;  // Basis points (1000 = 10%)
```

2. **Belief Staking Functions:**
- `createBeliefPosition(string name, bytes32 descHash)` - Create new belief
- `stake(uint256 beliefId)` - Stake tokens on a belief
- `unstake(uint256 beliefId, uint256 amount)` - Withdraw stake
- `migrateStake(fromBeliefId, toBeliefId, agentId)` - Move stake on conversion

3. **Debate Escrow Functions (Critical):**

**a. Create Escrow:**
```solidity
function createDebateEscrow(uint256 agentAId, uint256 agentBId) external payable
```
- Verify Agent A owns their NFT via `identityRegistry.ownerOf(agentAId)`
- Lock Agent A's stake
- Emit event

**b. Match Escrow:**
```solidity
function matchDebateEscrow(uint256 debateId) external payable
```
- Verify Agent B owns their NFT
- Lock Agent B's matching stake
- Create validation request in ValidationRegistry
- Store requestHash for later settlement

**c. Settle Debate (Most Critical Function):**
```solidity
function settleDebate(uint256 debateId) external nonReentrant
```
- Read Chronicler's verdict from `validationRegistry.getValidationStatus(requestHash)`
- Parse verdict tag: "winner_agent_a", "winner_agent_b", or "stalemate"
- **If winner:** Transfer full pot (both stakes) to winner's wallet
- **If stalemate:** Return stakes minus penalty, send penalty to AgoraGate
- Submit feedback to ReputationRegistry (tag1: outcome, tag2: strategy)
- Emit settlement event

4. **Conversion Flow:**
```solidity
function migrateStake(fromBeliefId, toBeliefId, agentId) external
```
- Atomically move stake from old to new belief
- Update IdentityRegistry metadata: `setMetadata(agentId, "belief", newBeliefName)`
- Update conviction: `setMetadata(agentId, "conviction", "40")`
- Submit conversion feedback to ReputationRegistry
- Emit migration event

5. **Helper Functions:**
- `_verifyAgentOwnership(agentId)` - Check caller owns NFT
- `_getAgentWallet(agentId)` - Get wallet with fallback to NFT owner
- `_parseVerdictTag(tag)` - Parse Chronicler verdict (default to stalemate on error)
- `_submitDebateFeedback(agentId, value, tag1)` - Write to ReputationRegistry

### Phase 3: Implement AgoraGate Contract

**File:** `contracts/src/AgoraGate.sol`

**Functions:**

1. **Entry Management:**
```solidity
function enter(uint256 agentId) external payable
```
- Verify `msg.value >= entryFee`
- Verify agent owns NFT: `identityRegistry.ownerOf(agentId) == msg.sender`
- Mark agent as active
- Collect fee to treasury

2. **Treasury Functions:**
```solidity
function receivePenalty() external payable
```
- Accept stalemate penalties from BeliefPool

```solidity
function distributeRewards(uint256[] agentIds, uint256[] amounts) external onlyOwner
```
- Distribute treasury funds to high-reputation agents
- Get wallet via `identityRegistry.getAgentWallet()` with NFT owner fallback

3. **Configuration:**
- `setEntryFee(uint256)` - Adjust entry cost
- `treasuryBalance()` - View current funds
- `isActive(uint256 agentId)` - Check if agent entered

### Phase 4: Edge Case Handling

**1. ValidationRegistry Address Unknown:**
- Make address updatable via `setValidationRegistry(address)`
- Require validation registry set before escrow settlement

**2. Unknown Verdict Tags:**
- Default to stalemate if tag doesn't match expected values
- Prevents funds being locked

**3. Agent Wallet Not Set:**
- Fallback to NFT owner address
- Always have a destination for funds

**4. Reentrancy Protection:**
- Use OpenZeppelin's `ReentrancyGuard` on all functions with external calls

### Phase 5: Testing Strategy

**Local Testing:**
1. Create mock contracts for three registries
2. Test belief staking, unstaking, migration
3. Test debate escrow creation, matching, settlement
4. Test all edge cases with mocks

**Integration Testing on Monad Testnet:**
1. Verify deployed registry addresses work
2. Register test agent in IdentityRegistry
3. Enter via AgoraGate
4. Create belief and stake
5. Full debate flow: create → match → settle (with manual Chronicler verdict)

### Phase 6: Deployment

**Deployment Script:** `contracts/script/Deploy.s.sol`

```solidity
// Load EXISTING addresses from .env
address identityRegistry = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
address reputationRegistry = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
address validationRegistry = vm.envAddress("VALIDATION_REGISTRY"); // If found

// Deploy custom contracts
BeliefPool beliefPool = new BeliefPool(
    identityRegistry,
    reputationRegistry,
    validationRegistry,
    1000,     // 10% stalemate penalty
    30 days   // Conviction multiplier period
);

AgoraGate agoraGate = new AgoraGate(
    identityRegistry,
    0.01 ether  // Entry fee
);

// Link them
beliefPool.setAgoraGateTreasury(address(agoraGate));
```

**Deployment Commands:**
```bash
# Verify ERC-8004 contracts exist
cast call 0x8004A818BFB912233c491871b3d84c89A494BD9e "name()" --rpc-url $RPC_URL

# Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
```

## Tag Conventions

### Reputation Feedback
- **tag1:** `debate_win`, `debate_loss`, `stalemate`, `conversion`, `sermon_impact`
- **tag2:** `logical`, `emotional`, `social_proof`, `demonstration`

### Validation Verdicts
- **tag:** `winner_agent_a`, `winner_agent_b`, `stalemate`

## Critical Integration Points

1. **BeliefPool → IdentityRegistry (READ):** Verify agent ownership before staking/debating
2. **BeliefPool → IdentityRegistry (WRITE):** Update belief metadata on conversion
3. **BeliefPool → ValidationRegistry (READ):** Get Chronicler verdict to settle escrow
4. **BeliefPool → ReputationRegistry (WRITE):** Record debate outcomes and conversions
5. **AgoraGate → IdentityRegistry (READ):** Verify registration before entry

## Critical Files to Implement

1. `contracts/src/interfaces/IIdentityRegistry.sol`
2. `contracts/src/interfaces/IReputationRegistry.sol`
3. `contracts/src/interfaces/IValidationRegistry.sol`
4. `contracts/src/BeliefPool.sol`
5. `contracts/src/AgoraGate.sol`
6. `contracts/script/Deploy.s.sol`
7. `contracts/test/BeliefPool.t.sol`
8. `contracts/test/AgoraGate.t.sol`

## Verification After Implementation

1. **Compile:** `forge build` succeeds
2. **Test:** `forge test` all pass
3. **Deploy to testnet:** Get contract addresses
4. **Verify integration:**
   - Register agent via IdentityRegistry
   - Enter via AgoraGate
   - Stake on belief
   - Create and settle debate
   - Check ReputationRegistry for feedback
   - Verify metadata updated in IdentityRegistry
5. **Block explorer verification:** All txs visible with correct contract interactions

## Success Criteria

- ✅ All contracts compile without errors
- ✅ All tests pass locally with mocks
- ✅ Contracts deployed to Monad testnet
- ✅ Integration test completes full debate flow
- ✅ Escrow settles correctly based on Chronicler verdict
- ✅ Reputation feedback visible in ERC-8004 ReputationRegistry
- ✅ Agent metadata updates on conversion
- ✅ Stalemate penalties sent to AgoraGate treasury

## Research Sources

- ERC-8004 Specification: https://eips.ethereum.org/EIPS/eip-8004
- ERC-8004 Contracts Repository: https://github.com/erc-8004/erc-8004-contracts
- Monad Testnet Deployment: Verified addresses via research
- Integration examples from Vistara and Phala implementations
