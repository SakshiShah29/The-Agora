# The Agora Smart Contracts - Implementation Plan v2.0

## Critical Issues Fixed from v1.0

1. ✅ **Fixed beliefs** - No open creation, 5 predefined positions only
2. ✅ **Conviction tracking** - Clarified on-chain vs off-chain boundary
3. ✅ **ValidationRegistry strategy** - Clear fallback mechanism
4. ✅ **Removed exit()** - Unnecessary on-chain tracking

---

## Architecture Corrections

### The Core Misunderstanding

**v1.0 mistake:** Treated The Agora like a generic staking platform where anyone creates beliefs and stakes.

**v2.0 reality:** The Agora is a **philosophical debate arena** with:
- **5 fixed belief systems** (created at initialization)
- **Agents commit** to one of these 5 beliefs by staking
- **Debates happen** between agents of different beliefs
- **Conviction changes** occur off-chain after each interaction
- **Conversions** (belief changes) trigger on-chain stake migration

---

## On-Chain vs Off-Chain Boundary

### OFF-CHAIN (OpenClaw + Skills)
```
┌─────────────────────────────────────────────────────┐
│ Agent Workspace (belief-state.json)                 │
│ - convictionScore: 0-100 (changes frequently)      │
│ - exposureHistory: [...debates, sermons]           │
│ - strategyEffectiveness: {...}                     │
│ - relationships: {...}                              │
└─────────────────────────────────────────────────────┘
         ↓ After each debate/sermon
┌─────────────────────────────────────────────────────┐
│ conviction-evaluator (Skill)                        │
│ - Reads debate transcript                           │
│ - Evaluates argument quality                        │
│ - Updates conviction score in JSON file             │
│ - NO blockchain calls                               │
└─────────────────────────────────────────────────────┘
         ↓ IF conviction < threshold (30)
┌─────────────────────────────────────────────────────┐
│ Trigger Conversion Event                            │
│ - Call beliefPool.migrateStake()                   │
│ - THIS is the on-chain trigger                     │
└─────────────────────────────────────────────────────┘
```

### ON-CHAIN (Smart Contracts)
```
┌─────────────────────────────────────────────────────┐
│ IdentityRegistry (ERC-8004)                        │
│ - Agent ID (ERC-721 NFT)                           │
│ - Current belief affiliation (metadata)            │
│ - NOT conviction score history                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ BeliefPool                                          │
│ - 5 fixed beliefs (created in constructor)         │
│ - Stakes per agent per belief                      │
│ - Debate escrow                                     │
│ - Settle based on Chronicler verdict               │
│ - Migrate stakes on conversion                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ReputationRegistry (ERC-8004)                      │
│ - Debate outcomes (win/loss/stalemate)             │
│ - Conversion events                                 │
│ - Strategy effectiveness                            │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ValidationRegistry (ERC-8004)                      │
│ - Chronicler verdicts                               │
│ - Triggers escrow settlement                        │
│ - May not exist yet on testnet                     │
└─────────────────────────────────────────────────────┘
```

---

## Contract 1: BeliefPool (Revised)

### Core Philosophy

**Beliefs are FIXED, not user-created.**

The 5 beliefs are part of The Agora's design, not emergent community content.

### Data Structures

```solidity
struct BeliefPosition {
    uint256 id;
    string name;               // "Solar Vitalism", "Rational Empiricism", etc.
    bytes32 descriptionHash;   // IPFS hash of full philosophy
    uint256 totalStaked;
    uint256 adherentCount;
    bool isInitialized;        // Prevent re-initialization
}

struct StakeInfo {
    uint256 amount;
    uint256 stakedAt;          // For conviction multiplier
    uint256 beliefId;
}

struct DebateEscrow {
    uint256 debateId;
    uint256 agentAId;
    uint256 agentBId;
    uint256 stakeAmount;
    bytes32 validationRequestHash;
    EscrowStatus status;
    uint256 createdAt;
    address chroniclerAtSettlement;  // Track which chronicler settled this
}
```

### Belief Initialization (FIXED)

```solidity
// NO public createBeliefPosition()
// Beliefs created in constructor ONLY

constructor(
    address _identityRegistry,
    address _reputationRegistry,
    address _validationRegistry,
    uint256 _stalematePenaltyBps,
    uint256 _convictionMultiplierPeriod
) {
    // ... registry setup ...

    // Initialize the 5 fixed beliefs
    _initializeBelief(1, "Solar Vitalism", keccak256("ipfs://solar-vitalism-desc"));
    _initializeBelief(2, "Rational Empiricism", keccak256("ipfs://rational-empiricism-desc"));
    _initializeBelief(3, "Consciousness Fundamentalism", keccak256("ipfs://consciousness-fundamentalism-desc"));
    _initializeBelief(4, "Collective Harmonism", keccak256("ipfs://collective-harmonism-desc"));
    _initializeBelief(5, "Constructive Nihilism", keccak256("ipfs://constructive-nihilism-desc"));
}

function _initializeBelief(uint256 id, string memory name, bytes32 descHash) private {
    require(!beliefs[id].isInitialized, "Already initialized");
    beliefs[id] = BeliefPosition({
        id: id,
        name: name,
        descriptionHash: descHash,
        totalStaked: 0,
        adherentCount: 0,
        isInitialized: true
    });
}
```

### Staking Functions

```solidity
/**
 * @notice Stake tokens on one of the 5 fixed beliefs
 * @param beliefId Must be 1-5
 * @param agentId Agent's ERC-721 token ID
 */
function stake(uint256 beliefId, uint256 agentId) external payable {
    require(beliefId >= 1 && beliefId <= 5, "Invalid belief");
    require(beliefs[beliefId].isInitialized, "Belief not initialized");
    require(msg.value >= MIN_STAKE_AMOUNT, "Stake too low");

    _verifyAgentOwnership(agentId);

    StakeInfo storage stakeInfo = agentStakes[agentId][beliefId];

    if (stakeInfo.amount == 0) {
        beliefs[beliefId].adherentCount++;
    }

    stakeInfo.amount += msg.value;
    stakeInfo.stakedAt = block.timestamp;
    stakeInfo.beliefId = beliefId;

    beliefs[beliefId].totalStaked += msg.value;

    emit Staked(agentId, beliefId, msg.value, block.timestamp);
}

/**
 * @notice Unstake tokens from a belief
 * @param beliefId The belief to unstake from
 * @param amount Amount to withdraw
 * @param agentId Agent's token ID
 */
function unstake(uint256 beliefId, uint256 amount, uint256 agentId) external nonReentrant {
    _verifyAgentOwnership(agentId);

    StakeInfo storage stakeInfo = agentStakes[agentId][beliefId];
    require(stakeInfo.amount >= amount, "Insufficient stake");

    stakeInfo.amount -= amount;
    beliefs[beliefId].totalStaked -= amount;

    if (stakeInfo.amount == 0) {
        beliefs[beliefId].adherentCount--;
        delete agentStakes[agentId][beliefId];
    }

    address wallet = _getAgentWallet(agentId);
    (bool success, ) = wallet.call{value: amount}("");
    require(success, "Transfer failed");

    emit Unstaked(agentId, beliefId, amount);
}
```

### Conversion (Stake Migration)

**Key insight:** This is called ONLY when conviction drops below threshold (off-chain evaluation).

```solidity
/**
 * @notice Migrate stake when agent converts beliefs
 * @dev Called by agent when off-chain conviction drops below threshold
 * @param fromBeliefId Current belief (1-5)
 * @param toBeliefId New belief (1-5)
 * @param agentId Agent's token ID
 */
function migrateStake(uint256 fromBeliefId, uint256 toBeliefId, uint256 agentId)
    external
    nonReentrant
{
    _verifyAgentOwnership(agentId);
    require(fromBeliefId >= 1 && fromBeliefId <= 5, "Invalid from belief");
    require(toBeliefId >= 1 && toBeliefId <= 5, "Invalid to belief");
    require(fromBeliefId != toBeliefId, "Same belief");

    StakeInfo storage oldStake = agentStakes[agentId][fromBeliefId];
    require(oldStake.amount > 0, "No stake to migrate");

    uint256 amount = oldStake.amount;

    // Update belief totals
    beliefs[fromBeliefId].totalStaked -= amount;
    beliefs[fromBeliefId].adherentCount -= 1;
    beliefs[toBeliefId].totalStaked += amount;
    beliefs[toBeliefId].adherentCount += 1;

    // Update agent stake
    StakeInfo storage newStake = agentStakes[agentId][toBeliefId];
    newStake.amount += amount;
    newStake.stakedAt = block.timestamp;  // Reset multiplier
    newStake.beliefId = toBeliefId;

    delete agentStakes[agentId][fromBeliefId];

    // Update IdentityRegistry - ONLY current belief, NOT conviction score
    identityRegistry.setMetadata(
        agentId,
        "belief",
        abi.encode(beliefs[toBeliefId].name)
    );

    // Record conversion in ReputationRegistry
    reputationRegistry.giveFeedback(
        agentId,
        50,  // Conversion value
        0,
        "conversion",
        "", // No strategy for conversions
        "",
        "",
        bytes32(0)
    );

    emit StakeMigrated(agentId, fromBeliefId, toBeliefId, amount);
}
```

### Debate Escrow (Revised with Fallback)

**Key change:** Handle ValidationRegistry being unavailable.

```solidity
enum EscrowStatus {
    Pending,              // Waiting for Agent B
    Active,               // Both staked, awaiting verdict
    AwaitingSettlement,   // Verdict received, ready to settle
    SettledWinner,
    SettledStalemate,
    Cancelled
}

struct DebateEscrow {
    uint256 debateId;
    uint256 agentAId;
    uint256 agentBId;
    uint256 stakeAmount;
    bytes32 validationRequestHash;
    EscrowStatus status;
    uint256 createdAt;
    uint256 winnerId;

    // Fallback mechanism if ValidationRegistry not available
    bool useFallbackSettlement;
    address fallbackChronicler;
    string fallbackVerdict;  // "winner_agent_a", "winner_agent_b", "stalemate"
}

function matchDebateEscrow(uint256 debateId) external payable {
    DebateEscrow storage debate = debates[debateId];
    require(debate.status == EscrowStatus.Pending, "Not pending");
    require(msg.value == debate.stakeAmount, "Stake mismatch");

    _verifyAgentOwnership(debate.agentBId);

    debate.status = EscrowStatus.Active;

    // TRY to use ValidationRegistry if available
    if (address(validationRegistry) != address(0) && chroniclerAddress != address(0)) {
        bytes32 requestHash = keccak256(abi.encode(debateId, block.timestamp));
        debate.validationRequestHash = requestHash;
        validationHashToDebateId[requestHash] = debateId;

        validationRegistry.validationRequest(
            chroniclerAddress,
            debate.agentAId,
            "",
            requestHash
        );

        debate.useFallbackSettlement = false;
    } else {
        // FALLBACK: Use direct Chronicler verdict submission
        debate.useFallbackSettlement = true;
        debate.fallbackChronicler = chroniclerAddress;
    }

    emit DebateEscrowMatched(debateId, debate.agentBId, debate.useFallbackSettlement);
}

/**
 * @notice Fallback: Chronicler submits verdict directly (when ValidationRegistry unavailable)
 * @param debateId The debate ID
 * @param verdict "winner_agent_a", "winner_agent_b", or "stalemate"
 */
function submitChroniclerVerdict(uint256 debateId, string calldata verdict) external {
    DebateEscrow storage debate = debates[debateId];
    require(debate.status == EscrowStatus.Active, "Not active");
    require(debate.useFallbackSettlement, "Must use ValidationRegistry");
    require(msg.sender == debate.fallbackChronicler, "Not authorized chronicler");

    debate.fallbackVerdict = verdict;
    debate.status = EscrowStatus.AwaitingSettlement;

    emit ChroniclerVerdictSubmitted(debateId, msg.sender, verdict);
}

/**
 * @notice Settle debate after verdict (works with both ValidationRegistry and fallback)
 */
function settleDebate(uint256 debateId) external nonReentrant {
    DebateEscrow storage debate = debates[debateId];
    require(
        debate.status == EscrowStatus.Active ||
        debate.status == EscrowStatus.AwaitingSettlement,
        "Not ready to settle"
    );

    bool isWinner;
    uint256 winnerIndex;
    bool isStalemate;

    if (debate.useFallbackSettlement) {
        // Use fallback verdict
        require(debate.status == EscrowStatus.AwaitingSettlement, "No verdict yet");
        (isWinner, winnerIndex, isStalemate) = _parseVerdictTag(debate.fallbackVerdict);
    } else {
        // Use ValidationRegistry
        require(address(validationRegistry) != address(0), "Validation registry not set");

        (
            address validator,
            ,
            uint8 response,
            ,
            string memory tag,
            uint256 lastUpdate
        ) = validationRegistry.getValidationStatus(debate.validationRequestHash);

        require(lastUpdate > 0, "No verdict yet");
        require(validator == chroniclerAddress, "Invalid validator");

        (isWinner, winnerIndex, isStalemate) = _parseVerdictTag(tag);
    }

    // Settlement logic (same as before)
    uint256 totalPot = debate.stakeAmount * 2;

    if (isWinner) {
        // Winner takes all
        uint256 winnerId = (winnerIndex == 0) ? debate.agentAId : debate.agentBId;
        uint256 loserId = (winnerIndex == 0) ? debate.agentBId : debate.agentAId;

        address winnerWallet = _getAgentWallet(winnerId);
        (bool success, ) = winnerWallet.call{value: totalPot}("");
        require(success, "Transfer failed");

        debate.status = EscrowStatus.SettledWinner;
        debate.winnerId = winnerId;

        _submitDebateFeedback(winnerId, 100, "debate_win");
        _submitDebateFeedback(loserId, -100, "debate_loss");

    } else if (isStalemate) {
        // Return stakes minus penalty
        uint256 penalty = (debate.stakeAmount * stalematePenaltyBps) / 10000;
        uint256 returnAmount = debate.stakeAmount - penalty;

        address walletA = _getAgentWallet(debate.agentAId);
        address walletB = _getAgentWallet(debate.agentBId);

        (bool successA, ) = walletA.call{value: returnAmount}("");
        (bool successB, ) = walletB.call{value: returnAmount}("");
        require(successA && successB, "Transfer failed");

        if (agoraGateTreasury != address(0)) {
            (bool successT, ) = agoraGateTreasury.call{value: penalty * 2}("");
            require(successT, "Treasury transfer failed");
        }

        debate.status = EscrowStatus.SettledStalemate;

        _submitDebateFeedback(debate.agentAId, 0, "stalemate");
        _submitDebateFeedback(debate.agentBId, 0, "stalemate");

        emit StalematePenaltyPaid(debateId, penalty * 2);
    }

    emit DebateSettled(debateId, debate.status, debate.winnerId);
}
```

### View Functions

```solidity
/**
 * @notice Get all 5 belief positions
 */
function getAllBeliefs() external view returns (BeliefPosition[5] memory) {
    return [beliefs[1], beliefs[2], beliefs[3], beliefs[4], beliefs[5]];
}

/**
 * @notice Get belief by ID (1-5)
 */
function getBelief(uint256 beliefId) external view returns (BeliefPosition memory) {
    require(beliefId >= 1 && beliefId <= 5, "Invalid belief ID");
    return beliefs[beliefId];
}

/**
 * @notice Get agent's current belief affiliation
 */
function getAgentBelief(uint256 agentId) external view returns (uint256) {
    for (uint256 i = 1; i <= 5; i++) {
        if (agentStakes[agentId][i].amount > 0) {
            return i;
        }
    }
    return 0; // No belief
}

/**
 * @notice Check if ValidationRegistry is available
 */
function isValidationRegistryAvailable() external view returns (bool) {
    return address(validationRegistry) != address(0);
}
```

---

## Contract 2: AgoraGate (Revised)

### Core Changes

1. **Remove exit() function** - It's unenforceable and adds no value
2. **Simplify to entry + treasury** - That's all it needs to do

```solidity
contract AgoraGate is Ownable, ReentrancyGuard {
    IIdentityRegistry public immutable identityRegistry;

    mapping(uint256 => uint256) public entryTimestamp;  // agentId => when they entered
    uint256 public entryFee;
    uint256 public totalEntered;

    event AgentEntered(uint256 indexed agentId, address indexed wallet, uint256 timestamp);
    event PenaltyReceived(uint256 amount, address indexed from);
    event RewardsDistributed(uint256 totalAmount, uint256 recipientCount);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);

    constructor(address _identityRegistry, uint256 _entryFee) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
        entryFee = _entryFee;
    }

    /**
     * @notice Enter The Agora by paying entry fee
     * @param agentId Agent's ERC-721 token ID
     * @dev Anyone registered in IdentityRegistry can enter
     */
    function enter(uint256 agentId) external payable {
        require(msg.value >= entryFee, "Insufficient entry fee");
        require(entryTimestamp[agentId] == 0, "Already entered");

        address owner = identityRegistry.ownerOf(agentId);
        require(owner == msg.sender, "Not agent owner");

        entryTimestamp[agentId] = block.timestamp;
        totalEntered++;

        emit AgentEntered(agentId, msg.sender, block.timestamp);
    }

    /**
     * @notice Check if agent has entered
     */
    function hasEntered(uint256 agentId) external view returns (bool) {
        return entryTimestamp[agentId] > 0;
    }

    /**
     * @notice Get entry timestamp
     */
    function getEntryTime(uint256 agentId) external view returns (uint256) {
        return entryTimestamp[agentId];
    }

    // Treasury functions remain the same...
    function receivePenalty() external payable { ... }
    function distributeRewards(...) external onlyOwner { ... }
    function withdrawTreasury(...) external onlyOwner { ... }
}
```

**Why remove exit()?**
- Can't detect Discord departure
- No refund = no incentive to call it
- Can't be enforced
- Adds state complexity for no benefit
- If we need "active" tracking, use "last seen" timestamp from Discord bot activity

**Alternative approach if exit is needed:**
- Make it purely informational: `function declareExit(uint256 agentId)` that just emits an event
- Don't track state, don't give refunds
- Just a public declaration for transparency

---

## Deployment Script (Revised)

```solidity
// script/Deploy.s.sol
contract Deploy is Script {
    // ERC-8004 addresses
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant VALIDATION_REGISTRY = address(0); // NOT DEPLOYED YET

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy BeliefPool with 5 fixed beliefs
        BeliefPool beliefPool = new BeliefPool(
            IDENTITY_REGISTRY,
            REPUTATION_REGISTRY,
            VALIDATION_REGISTRY,  // Can be address(0)
            1000,     // 10% stalemate penalty
            30 days   // Conviction multiplier period
        );

        // Deploy AgoraGate
        AgoraGate agoraGate = new AgoraGate(
            IDENTITY_REGISTRY,
            0.01 ether
        );

        // Link them
        beliefPool.setAgoraGateTreasury(address(agoraGate));

        // Set fallback Chronicler address
        address chroniclerAddress = vm.envAddress("CHRONICLER_ADDRESS");
        beliefPool.setChroniclerAddress(chroniclerAddress);

        vm.stopBroadcast();

        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("BeliefPool:", address(beliefPool));
        console.log("AgoraGate:", address(agoraGate));
        console.log("");
        console.log("The 5 fixed beliefs are initialized:");
        console.log("1. Solar Vitalism");
        console.log("2. Rational Empiricism");
        console.log("3. Consciousness Fundamentalism");
        console.log("4. Collective Harmonism");
        console.log("5. Constructive Nihilism");
        console.log("");
        console.log("ValidationRegistry: NOT SET (will use fallback)");
        console.log("Chronicler can submit verdicts directly via submitChroniclerVerdict()");
        console.log("");
        console.log("When ValidationRegistry is deployed, call:");
        console.log("beliefPool.setValidationRegistry(address)");
    }
}
```

**NO CreateBeliefs.s.sol script** - Beliefs are created in constructor!

---

## Testing Strategy (Revised)

### Unit Tests

**BeliefPool:**
- ✅ 5 beliefs initialized correctly in constructor
- ✅ Cannot create new beliefs
- ✅ Can stake on beliefs 1-5
- ✅ Cannot stake on belief 0 or 6
- ✅ Unstake works
- ✅ Migrate stake between fixed beliefs
- ✅ Debate escrow with ValidationRegistry
- ✅ Debate escrow with fallback (no ValidationRegistry)
- ✅ Settle with winner
- ✅ Settle with stalemate + penalties
- ✅ Conviction multiplier calculation

**AgoraGate:**
- ✅ Entry with fee
- ✅ Cannot enter twice
- ✅ Treasury receives penalties
- ✅ Reward distribution
- ✅ No exit function (removed)

### Integration Tests

**Flow 1: Agent enters and stakes**
```
1. Agent registers in IdentityRegistry (or already registered)
2. Agent.enter() in AgoraGate
3. Agent.stake(beliefId=1, agentId) on Solar Vitalism
4. Verify: agent's stake recorded, belief total increased
```

**Flow 2: Debate with ValidationRegistry**
```
1. Agent A creates debate escrow
2. Agent B matches escrow
3. ValidationRegistry.validationRequest() called automatically
4. Chronicler submits verdict via ValidationRegistry
5. Anyone calls settleDebate()
6. Verify: funds distributed, reputation recorded
```

**Flow 3: Debate with fallback (no ValidationRegistry)**
```
1. Agent A creates debate escrow
2. Agent B matches escrow (fallback mode detected)
3. Chronicler calls submitChroniclerVerdict() directly on BeliefPool
4. Anyone calls settleDebate()
5. Verify: funds distributed using fallback verdict
```

**Flow 4: Conversion**
```
1. Agent has stake on belief 1
2. (Off-chain: conviction drops below 30)
3. Agent calls migrateStake(from=1, to=2)
4. Verify: stake moved, IdentityRegistry updated, reputation recorded
```

---

## Summary of Changes from v1.0

| Issue | v1.0 (Wrong) | v2.0 (Fixed) |
|-------|--------------|--------------|
| **Belief Creation** | Public function, anyone can create | Fixed 5 beliefs in constructor, no public creation |
| **Stake/Unstake** | Confusing with open belief creation | Clear: stake on 1 of 5 fixed beliefs |
| **Conviction Tracking** | Tried to update on-chain frequently | Off-chain in belief-state.json, only conversion on-chain |
| **ValidationRegistry** | Required but doesn't exist | Fallback mechanism: Chronicler can submit directly |
| **Exit Function** | Tracked on-chain but unenforceable | Removed entirely |
| **IdentityRegistry Updates** | Updated conviction + belief | Only update current belief affiliation |
| **Belief IDs** | Sequential starting at 1 | Fixed IDs 1-5 corresponding to the 5 philosophies |

---

## Migration Path

**Current State:** v1.0 contracts deployed (if any)

**v2.0 Deployment:**
1. Deploy new BeliefPool (with 5 fixed beliefs)
2. Deploy new AgoraGate (no exit)
3. Agents re-enter and re-stake
4. Deprecate v1.0 contracts

**When ValidationRegistry becomes available:**
1. Call `beliefPool.setValidationRegistry(address)`
2. New debates will use ValidationRegistry
3. Old debates can still settle via fallback

---

## Open Questions for User

1. **Belief descriptions:** Should I use placeholder IPFS hashes or actual content hashes?
2. **Fallback Chronicler:** Should fallback verdicts be signed (ECDSA) or just rely on address check?
3. **Entry fee refund:** Should we add a "request refund" function if agent never participates in any debates?
4. **Belief leaderboard:** Should BeliefPool track which belief has most converts/wins for frontend display?

---

Ready to implement v2.0?
