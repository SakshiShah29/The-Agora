// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IIdentityRegistry.sol";
import "./interfaces/IReputationRegistry.sol";

/**
 * @title BeliefPool
 * @notice Core staking and debate mechanics for The Agora
 * @dev Integrates with ERC-8004 IdentityRegistry and ReputationRegistry
 */
contract BeliefPool is Ownable, ReentrancyGuard {

    // ========== STRUCTS ==========

    struct BeliefPosition {
        uint256 id;
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
        Pending,           // Waiting for Agent B to match
        Active,            // Both staked, awaiting Chronicler verdict
        SettledWinner,     // Winner paid
        SettledStalemate   // Penalties applied, stakes returned
    }

    struct DebateEscrow {
        uint256 debateId;
        uint256 agentAId;
        uint256 agentBId;
        uint256 stakeAmount;
        DebateStatus status;
        uint256 createdAt;
        uint256 settledAt;
        uint256 winnerId;      // 0 if stalemate
        string verdict;        // "winner_agent_a", "winner_agent_b", "stalemate"
    }

    // ========== STATE VARIABLES ==========

    IIdentityRegistry public immutable identityRegistry;
    IReputationRegistry public immutable reputationRegistry;

    address public chroniclerAddress;
    address public agoraGateTreasury;

    uint256 public stalematePenaltyBps;         // Basis points (1000 = 10%)
    uint256 public convictionMultiplierPeriod;  // Time period for conviction multiplier
    uint256 public constant MIN_STAKE_AMOUNT = 0.001 ether;

    uint256 public nextDebateId;

    // beliefId => BeliefPosition (IDs 1-5)
    mapping(uint256 => BeliefPosition) public beliefs;

    // agentId => beliefId => StakeInfo
    mapping(uint256 => mapping(uint256 => StakeInfo)) public agentStakes;

    // debateId => DebateEscrow
    mapping(uint256 => DebateEscrow) public debates;

    // ========== EVENTS ==========

    event Staked(uint256 indexed agentId, uint256 indexed beliefId, uint256 amount, uint256 timestamp);
    event Unstaked(uint256 indexed agentId, uint256 indexed beliefId, uint256 amount);
    event StakeMigrated(uint256 indexed agentId, uint256 fromBeliefId, uint256 toBeliefId, uint256 amount);
    event DebateEscrowCreated(uint256 indexed debateId, uint256 agentAId, uint256 agentBId, uint256 stakeAmount);
    event DebateEscrowMatched(uint256 indexed debateId, uint256 agentBId);
    event DebateSettled(uint256 indexed debateId, uint256 winnerId, uint256 amount, string outcome);
    event StalematePenaltyPaid(uint256 indexed debateId, uint256 penaltyAmount);
    event ChroniclerAddressUpdated(address indexed chronicler);
    event AgoraGateTreasuryUpdated(address indexed treasury);
    event StalematePenaltyUpdated(uint256 penaltyBps);

    // ========== CONSTRUCTOR ==========

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

    // ========== STAKING FUNCTIONS ==========

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

    // ========== CONVERSION FUNCTION ==========

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

    // ========== DEBATE ESCROW FUNCTIONS ==========

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

    // ========== CHRONICLER VERDICT (ATOMIC SETTLEMENT) ==========

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

    // ========== VIEW FUNCTIONS ==========

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
     * @notice Get agent's stake info for a belief
     */
    function getStakeInfo(uint256 agentId, uint256 beliefId)
        external
        view
        returns (StakeInfo memory)
    {
        return agentStakes[agentId][beliefId];
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

    // ========== ADMIN FUNCTIONS ==========

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

    // ========== INTERNAL FUNCTIONS ==========

    /**
     * @notice Verify caller owns the agent NFT
     */
    function _verifyAgentOwnership(uint256 agentId) internal view {
        address owner = identityRegistry.ownerOf(agentId);
        require(owner == msg.sender, "Not agent owner");
    }

    /**
     * @notice Check if agent exists
     */
    function _agentExists(uint256 agentId) internal view returns (bool) {
        try identityRegistry.ownerOf(agentId) returns (address owner) {
            return owner != address(0);
        } catch {
            return false;
        }
    }

    /**
     * @notice Get agent wallet with fallback to NFT owner
     */
    function _getAgentWallet(uint256 agentId) internal view returns (address) {
        address wallet = identityRegistry.getAgentWallet(agentId);
        if (wallet == address(0)) {
            wallet = identityRegistry.ownerOf(agentId);
        }
        return wallet;
    }

    /**
     * @notice Parse verdict tag
     */
    function _parseVerdictTag(string memory tag) internal pure returns (
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
    ) internal {
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
}
