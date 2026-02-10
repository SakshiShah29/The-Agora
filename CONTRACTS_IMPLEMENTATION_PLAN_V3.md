# The Agora Smart Contracts - Implementation Plan v3.0

## Simplifications from v2.0

1. ✅ **Removed ValidationRegistry** - No ERC-8004 validation integration
2. ✅ **Direct Chronicler settlement** - Verdict submission = immediate settlement
3. ✅ **Atomic fund distribution** - Winner gets paid when verdict is submitted
4. ✅ **No reward distribution** - AgoraGate just collects fees/penalties

---

## Simplified Architecture

### ERC-8004 Integration (Only 2 Registries)

```
┌─────────────────────────────────────────────────────────────┐
│ IdentityRegistry (ERC-8004) - DEPLOYED                     │
│ 0x8004A818BFB912233c491871b3d84c89A494BD9e                 │
│ - Agent NFTs                                                 │
│ - Current belief metadata                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ReputationRegistry (ERC-8004) - DEPLOYED                   │
│ 0x8004B663056A597Dffe9eCcC1965A193B7388713                 │
│ - Debate outcomes                                            │
│ - Conversion records                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BeliefPool (CUSTOM) - WE DEPLOY                            │
│ - 5 fixed beliefs                                            │
│ - Staking                                                    │
│ - Debate escrow                                              │
│ - Chronicler submits verdict → immediate settlement         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ AgoraGate (CUSTOM) - WE DEPLOY                             │
│ - Entry fees                                                 │
│ - Penalty collection                                         │
│ - Treasury balance tracking                                  │
└─────────────────────────────────────────────────────────────┘
```

**Key simplification:** Chronicler is a trusted address that directly settles debates in BeliefPool.

---

## Contract 1: BeliefPool (Simplified)

### Debate Flow

```
1. Agent A creates debate escrow → locks stake
2. Agent B matches debate escrow → locks stake
3. Debate happens in Discord (off-chain)
4. Chronicler calls submitDebateVerdict(debateId, verdict)
   ├─ Parses verdict
   ├─ Transfers funds to winner (or returns with penalties)
   ├─ Records outcome in ReputationRegistry
   └─ Emits settlement event
5. Done! ✅
```

**No separate settlement step. No ValidationRegistry. Just Chronicler's direct verdict.**

### Data Structures

```solidity
struct BeliefPosition {
    uint256 id;               // 1-5
    string name;
    bytes32 descriptionHash;
    uint256 totalStaked;
    uint256 adherentCount;
}

struct StakeInfo {
    uint256 amount;
    uint256 stakedAt;
    uint256 beliefId;
}

enum DebateStatus {
    Pending,        // Waiting for Agent B to match
    Active,         // Both staked, awaiting Chronicler verdict
    SettledWinner,  // Winner paid
    SettledStalemate // Penalties applied, stakes returned
}

struct DebateEscrow {
    uint256 debateId;
    uint256 agentAId;
    uint256 agentBId;
    uint256 stakeAmount;
    DebateStatus status;
    uint256 createdAt;
    uint256 settledAt;
    uint256 winnerId;       // 0 if stalemate
    string verdict;         // "winner_agent_a", "winner_agent_b", "stalemate"
}
```

### Constructor (Fixed Beliefs)

```solidity
constructor(
    address _identityRegistry,
    address _reputationRegistry,
    uint256 _stalematePenaltyBps,
    uint256 _convictionMultiplierPeriod
) Ownable(msg.sender) {
    require(_identityRegistry != address(0), "Invalid identity registry");
    require(_reputationRegistry != address(0), "Invalid reputation registry");
    require(_stalematePenaltyBps <= 5000, "Penalty too high");

    identityRegistry = IIdentityRegistry(_identityRegistry);
    reputationRegistry = IReputationRegistry(_reputationRegistry);
    stalematePenaltyBps = _stalematePenaltyBps;
    convictionMultiplierPeriod = _convictionMultiplierPeriod;

    // Initialize the 5 fixed beliefs
    beliefs[1] = BeliefPosition(1, "Solar Vitalism", keccak256("ipfs://solar"), 0, 0);
    beliefs[2] = BeliefPosition(2, "Rational Empiricism", keccak256("ipfs://rational"), 0, 0);
    beliefs[3] = BeliefPosition(3, "Consciousness Fundamentalism", keccak256("ipfs://consciousness"), 0, 0);
    beliefs[4] = BeliefPosition(4, "Collective Harmonism", keccak256("ipfs://collective"), 0, 0);
    beliefs[5] = BeliefPosition(5, "Constructive Nihilism", keccak256("ipfs://nihilism"), 0, 0);

    nextDebateId = 1;
}
```

### Staking Functions (Unchanged)

```solidity
/**
 * @notice Stake on one of the 5 fixed beliefs
 */
function stake(uint256 beliefId, uint256 agentId) external payable {
    require(beliefId >= 1 && beliefId <= 5, "Invalid belief");
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
 * @notice Unstake from a belief
 */
function unstake(uint256 beliefId, uint256 amount, uint256 agentId)
    external
    nonReentrant
{
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

### Conversion (Unchanged)

```solidity
/**
 * @notice Migrate stake when agent converts (off-chain conviction dropped below threshold)
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

    // Update beliefs
    beliefs[fromBeliefId].totalStaked -= amount;
    beliefs[fromBeliefId].adherentCount--;
    beliefs[toBeliefId].totalStaked += amount;
    beliefs[toBeliefId].adherentCount++;

    // Update agent stake
    StakeInfo storage newStake = agentStakes[agentId][toBeliefId];
    newStake.amount += amount;
    newStake.stakedAt = block.timestamp;
    newStake.beliefId = toBeliefId;

    delete agentStakes[agentId][fromBeliefId];

    // Update IdentityRegistry metadata (current belief only)
    identityRegistry.setMetadata(
        agentId,
        "belief",
        abi.encode(beliefs[toBeliefId].name)
    );

    // Record conversion in ReputationRegistry
    reputationRegistry.giveFeedback(
        agentId,
        50,
        0,
        "conversion",
        "",
        "",
        "",
        bytes32(0)
    );

    emit StakeMigrated(agentId, fromBeliefId, toBeliefId, amount);
}
```

### Debate Escrow (Simplified)

```solidity
/**
 * @notice Create debate escrow (Agent A initiates)
 */
function createDebateEscrow(uint256 agentAId, uint256 agentBId)
    external
    payable
    returns (uint256 debateId)
{
    require(msg.value >= MIN_STAKE_AMOUNT, "Stake too low");
    require(agentAId != agentBId, "Cannot debate self");

    _verifyAgentOwnership(agentAId);
    require(_agentExists(agentBId), "Agent B not found");

    debateId = nextDebateId++;

    debates[debateId] = DebateEscrow({
        debateId: debateId,
        agentAId: agentAId,
        agentBId: agentBId,
        stakeAmount: msg.value,
        status: DebateStatus.Pending,
        createdAt: block.timestamp,
        settledAt: 0,
        winnerId: 0,
        verdict: ""
    });

    emit DebateEscrowCreated(debateId, agentAId, agentBId, msg.value);
}

/**
 * @notice Match debate escrow (Agent B accepts)
 */
function matchDebateEscrow(uint256 debateId) external payable {
    DebateEscrow storage debate = debates[debateId];
    require(debate.status == DebateStatus.Pending, "Not pending");
    require(msg.value == debate.stakeAmount, "Stake mismatch");

    _verifyAgentOwnership(debate.agentBId);

    debate.status = DebateStatus.Active;

    emit DebateEscrowMatched(debateId, debate.agentBId);
}
```

### Chronicler Verdict (SIMPLIFIED - ONE FUNCTION)

**Key change:** Verdict submission = immediate settlement + fund distribution.

```solidity
/**
 * @notice Chronicler submits verdict and settles debate atomically
 * @param debateId The debate to settle
 * @param verdict "winner_agent_a", "winner_agent_b", or "stalemate"
 * @dev Only callable by authorized Chronicler address
 * @dev Settlement and fund distribution happen in same transaction
 */
function submitDebateVerdict(uint256 debateId, string calldata verdict)
    external
    nonReentrant
{
    require(msg.sender == chroniclerAddress, "Not authorized chronicler");

    DebateEscrow storage debate = debates[debateId];
    require(debate.status == DebateStatus.Active, "Not active");

    debate.verdict = verdict;

    // Parse verdict
    (bool isWinner, uint256 winnerIndex, bool isStalemate) = _parseVerdictTag(verdict);

    uint256 totalPot = debate.stakeAmount * 2;

    if (isWinner) {
        // Winner takes all
        uint256 winnerId = (winnerIndex == 0) ? debate.agentAId : debate.agentBId;
        uint256 loserId = (winnerIndex == 0) ? debate.agentBId : debate.agentAId;

        address winnerWallet = _getAgentWallet(winnerId);
        (bool success, ) = winnerWallet.call{value: totalPot}("");
        require(success, "Transfer failed");

        debate.status = DebateStatus.SettledWinner;
        debate.winnerId = winnerId;

        // Record in ReputationRegistry
        _submitDebateFeedback(winnerId, 100, "debate_win");
        _submitDebateFeedback(loserId, -100, "debate_loss");

        emit DebateSettled(debateId, winnerId, totalPot, "winner");

    } else if (isStalemate) {
        // Return stakes minus penalty
        uint256 penalty = (debate.stakeAmount * stalematePenaltyBps) / 10000;
        uint256 returnAmount = debate.stakeAmount - penalty;

        address walletA = _getAgentWallet(debate.agentAId);
        address walletB = _getAgentWallet(debate.agentBId);

        (bool successA, ) = walletA.call{value: returnAmount}("");
        (bool successB, ) = walletB.call{value: returnAmount}("");
        require(successA && successB, "Transfer failed");

        // Send penalties to treasury
        if (agoraGateTreasury != address(0)) {
            (bool successT, ) = agoraGateTreasury.call{value: penalty * 2}("");
            require(successT, "Treasury transfer failed");
        }

        debate.status = DebateStatus.SettledStalemate;

        // Record in ReputationRegistry
        _submitDebateFeedback(debate.agentAId, 0, "stalemate");
        _submitDebateFeedback(debate.agentBId, 0, "stalemate");

        emit DebateSettled(debateId, 0, 0, "stalemate");
        emit StalematePenaltyPaid(debateId, penalty * 2);
    }

    debate.settledAt = block.timestamp;
}

/**
 * @notice Parse verdict tag
 */
function _parseVerdictTag(string memory tag) private pure returns (
    bool isWinner,
    uint256 winnerIndex,
    bool isStalemate
) {
    bytes32 tagHash = keccak256(bytes(tag));

    if (tagHash == keccak256("winner_agent_a")) {
        return (true, 0, false);
    } else if (tagHash == keccak256("winner_agent_b")) {
        return (true, 1, false);
    } else if (tagHash == keccak256("stalemate")) {
        return (false, 0, true);
    } else {
        // Unknown tag defaults to stalemate (safe default)
        return (false, 0, true);
    }
}

/**
 * @notice Submit debate feedback to ReputationRegistry
 */
function _submitDebateFeedback(
    uint256 agentId,
    int128 value,
    string memory tag1
) private {
    reputationRegistry.giveFeedback(
        agentId,
        value,
        0,
        tag1,
        "",
        "",
        "",
        bytes32(0)
    );
}
```

### View Functions

```solidity
/**
 * @notice Get all 5 beliefs
 */
function getAllBeliefs() external view returns (BeliefPosition[5] memory) {
    return [beliefs[1], beliefs[2], beliefs[3], beliefs[4], beliefs[5]];
}

/**
 * @notice Get single belief
 */
function getBelief(uint256 beliefId) external view returns (BeliefPosition memory) {
    require(beliefId >= 1 && beliefId <= 5, "Invalid belief");
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
 * @notice Get debate details
 */
function getDebate(uint256 debateId) external view returns (DebateEscrow memory) {
    return debates[debateId];
}

/**
 * @notice Get effective stake (with conviction multiplier)
 */
function getEffectiveStake(uint256 agentId, uint256 beliefId)
    external
    view
    returns (uint256)
{
    StakeInfo memory stakeInfo = agentStakes[agentId][beliefId];
    if (stakeInfo.amount == 0) return 0;

    uint256 duration = block.timestamp - stakeInfo.stakedAt;
    uint256 multiplier = 10000 + (duration * 10000 / convictionMultiplierPeriod);

    return (stakeInfo.amount * multiplier) / 10000;
}
```

### Admin Functions

```solidity
/**
 * @notice Set Chronicler address (who can submit verdicts)
 */
function setChroniclerAddress(address _chronicler) external onlyOwner {
    require(_chronicler != address(0), "Invalid address");
    chroniclerAddress = _chronicler;
    emit ChroniclerAddressUpdated(_chronicler);
}

/**
 * @notice Set AgoraGate treasury (receives stalemate penalties)
 */
function setAgoraGateTreasury(address _treasury) external onlyOwner {
    require(_treasury != address(0), "Invalid address");
    agoraGateTreasury = _treasury;
    emit AgoraGateTreasuryUpdated(_treasury);
}

/**
 * @notice Set stalemate penalty (basis points)
 */
function setStalematePenalty(uint256 _penaltyBps) external onlyOwner {
    require(_penaltyBps <= 5000, "Penalty too high");
    stalematePenaltyBps = _penaltyBps;
    emit StalematePenaltyUpdated(_penaltyBps);
}
```

---

## Contract 2: AgoraGate (Ultra Simplified)

**Removed:**
- ❌ Exit function
- ❌ Reward distribution
- ❌ Active/inactive tracking

**Kept:**
- ✅ Entry with fee
- ✅ Penalty reception
- ✅ Treasury balance view
- ✅ Emergency withdrawal

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IIdentityRegistry.sol";

/**
 * @title AgoraGate
 * @notice Simple entry gate and treasury for The Agora
 */
contract AgoraGate is Ownable, ReentrancyGuard {

    IIdentityRegistry public immutable identityRegistry;

    mapping(uint256 => uint256) public entryTimestamp;
    uint256 public entryFee;
    uint256 public totalEntered;

    event AgentEntered(uint256 indexed agentId, address indexed wallet, uint256 timestamp);
    event PenaltyReceived(uint256 amount, address indexed from);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryWithdrawn(address indexed to, uint256 amount);

    constructor(address _identityRegistry, uint256 _entryFee) Ownable(msg.sender) {
        require(_identityRegistry != address(0), "Invalid registry");
        identityRegistry = IIdentityRegistry(_identityRegistry);
        entryFee = _entryFee;
    }

    /**
     * @notice Enter The Agora
     * @param agentId Agent's ERC-721 token ID from IdentityRegistry
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
     * @notice Receive stalemate penalties from BeliefPool
     */
    function receivePenalty() external payable {
        require(msg.value > 0, "No value sent");
        emit PenaltyReceived(msg.value, msg.sender);
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

    /**
     * @notice Get treasury balance
     */
    function treasuryBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Update entry fee
     */
    function setEntryFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = entryFee;
        entryFee = newFee;
        emit EntryFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Emergency treasury withdrawal
     */
    function withdrawTreasury(address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        require(to != address(0), "Invalid address");
        require(amount <= address(this).balance, "Insufficient balance");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");

        emit TreasuryWithdrawn(to, amount);
    }

    /**
     * @notice Receive function for direct transfers
     */
    receive() external payable {
        emit PenaltyReceived(msg.value, msg.sender);
    }
}
```

---

## Deployment Script

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BeliefPool.sol";
import "../src/AgoraGate.sol";

contract Deploy is Script {
    // ERC-8004 Deployed Addresses on Monad Testnet
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    // Configuration
    uint256 constant STALEMATE_PENALTY_BPS = 1000;  // 10%
    uint256 constant CONVICTION_PERIOD = 30 days;
    uint256 constant ENTRY_FEE = 0.01 ether;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address chronicler = vm.envAddress("CHRONICLER_ADDRESS");

        console.log("=== DEPLOYING THE AGORA v3.0 ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", vm.addr(deployerKey));
        console.log("Chronicler:", chronicler);
        console.log("");

        vm.startBroadcast(deployerKey);

        // Deploy BeliefPool
        BeliefPool beliefPool = new BeliefPool(
            IDENTITY_REGISTRY,
            REPUTATION_REGISTRY,
            STALEMATE_PENALTY_BPS,
            CONVICTION_PERIOD
        );

        console.log("BeliefPool deployed:", address(beliefPool));

        // Deploy AgoraGate
        AgoraGate agoraGate = new AgoraGate(
            IDENTITY_REGISTRY,
            ENTRY_FEE
        );

        console.log("AgoraGate deployed:", address(agoraGate));

        // Link contracts
        beliefPool.setAgoraGateTreasury(address(agoraGate));
        beliefPool.setChroniclerAddress(chronicler);

        console.log("");
        console.log("=== CONFIGURATION ===");
        console.log("Chronicler can settle debates via: submitDebateVerdict()");
        console.log("Stalemate penalties sent to:", address(agoraGate));

        vm.stopBroadcast();

        console.log("");
        console.log("=== FIXED BELIEFS INITIALIZED ===");
        console.log("1. Solar Vitalism");
        console.log("2. Rational Empiricism");
        console.log("3. Consciousness Fundamentalism");
        console.log("4. Collective Harmonism");
        console.log("5. Constructive Nihilism");

        console.log("");
        console.log("=== UPDATE .ENV ===");
        console.log("BELIEF_POOL=", address(beliefPool));
        console.log("AGORA_GATE=", address(agoraGate));
    }
}
```

---

## Testing Strategy

### Unit Tests - BeliefPool

```solidity
// Test belief initialization
- ✅ 5 beliefs initialized in constructor
- ✅ Belief IDs 1-5 have correct names
- ✅ Cannot stake on belief 0 or 6

// Test staking
- ✅ Stake on valid belief
- ✅ Multiple stakes accumulate
- ✅ Cannot stake without ownership
- ✅ Cannot stake below minimum

// Test unstaking
- ✅ Unstake partial amount
- ✅ Unstake full amount
- ✅ Cannot unstake more than staked

// Test conversion
- ✅ Migrate stake between beliefs
- ✅ IdentityRegistry metadata updated
- ✅ ReputationRegistry records conversion
- ✅ Cannot migrate to same belief

// Test debate escrow
- ✅ Create debate escrow
- ✅ Match debate escrow
- ✅ Cannot match with wrong amount
- ✅ Cannot debate self

// Test verdict & settlement (ATOMIC)
- ✅ Chronicler submits verdict for winner_agent_a → funds transferred
- ✅ Chronicler submits verdict for winner_agent_b → funds transferred
- ✅ Chronicler submits verdict for stalemate → penalties applied
- ✅ Non-chronicler cannot submit verdict
- ✅ ReputationRegistry updated on settlement
- ✅ Unknown verdict tags default to stalemate
```

### Unit Tests - AgoraGate

```solidity
- ✅ Entry with fee
- ✅ Cannot enter twice
- ✅ Cannot enter without ownership
- ✅ Receive penalty function
- ✅ Receive via receive() fallback
- ✅ Treasury balance view
- ✅ Owner can withdraw treasury
- ✅ Owner can update entry fee
```

### Integration Tests

```solidity
// Flow 1: Full debate lifecycle
function testFullDebateFlow() {
    // 1. Agents enter
    vm.prank(alice);
    agoraGate.enter{value: 0.01 ether}(aliceId);

    vm.prank(bob);
    agoraGate.enter{value: 0.01 ether}(bobId);

    // 2. Agents stake
    vm.prank(alice);
    beliefPool.stake{value: 1 ether}(1, aliceId); // Solar Vitalism

    vm.prank(bob);
    beliefPool.stake{value: 1 ether}(2, bobId); // Rational Empiricism

    // 3. Create debate
    vm.prank(alice);
    uint256 debateId = beliefPool.createDebateEscrow{value: 0.5 ether}(aliceId, bobId);

    // 4. Match debate
    vm.prank(bob);
    beliefPool.matchDebateEscrow{value: 0.5 ether}(debateId);

    // 5. Chronicler submits verdict (ATOMIC SETTLEMENT)
    uint256 aliceBalanceBefore = alice.balance;

    vm.prank(chronicler);
    beliefPool.submitDebateVerdict(debateId, "winner_agent_a");

    // 6. Verify Alice received full pot
    assertEq(alice.balance, aliceBalanceBefore + 1 ether);

    // 7. Verify reputation recorded
    assertEq(reputationRegistry.getFeedbackCount(aliceId), 1);
    assertEq(reputationRegistry.getFeedbackCount(bobId), 1);
}
```

---

## Summary

### What Changed from v2.0

| Feature | v2.0 | v3.0 |
|---------|------|------|
| **ValidationRegistry** | Optional with fallback | **Removed entirely** |
| **Settlement** | Two-step (verdict → settle) | **Atomic (verdict = settlement)** |
| **Fund Distribution** | Separate function call | **Immediate in submitDebateVerdict()** |
| **Reward Distribution** | distributeRewards() in AgoraGate | **Removed** |
| **Exit Tracking** | Removed | Still removed |
| **Chronicler Role** | Submits to ValidationRegistry | **Direct settlement authority** |

### Simplified Flow

```
Before (v2.0):
1. Chronicler → ValidationRegistry.validationResponse()
2. Anyone → BeliefPool.settleDebate()
3. Funds distributed

After (v3.0):
1. Chronicler → BeliefPool.submitDebateVerdict()
   ↳ Funds distributed immediately ✅
```

### Benefits

- ✅ Simpler architecture
- ✅ Fewer contracts to integrate
- ✅ One transaction for settlement
- ✅ Lower gas costs
- ✅ No dependency on undeployed ValidationRegistry
- ✅ Clearer trust model (Chronicler is trusted judge)

---

Ready to implement v3.0?
