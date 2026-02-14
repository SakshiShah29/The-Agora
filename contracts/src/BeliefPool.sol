// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IIdentityRegistry.sol";
import "./BeliefToken.sol";

/**
 * @title BeliefPool
 * @notice Core staking and debate mechanics for The Agora.
 *         Each belief has an ERC-20 LP token (non-transferable). Staking mints
 *         shares; debate winnings flow as dividends that increase share price.
 * @dev Integrates with ERC-8004 IdentityRegistry.
 */
contract BeliefPool is Ownable, ReentrancyGuard {

    // ========== STRUCTS ==========

    struct BeliefPosition {
        uint256 id;
        string name;
        bytes32 descriptionHash;
        uint256 totalAssets;       // Total MON backing this belief (stakes + dividends)
        uint256 adherentCount;
        BeliefToken token;         // Non-transferable LP token for this belief
    }

enum DebateStatus {
        Pending,           // Waiting for Agent B to match
        Active,            // Both staked, awaiting Chronicler verdict
        SettledWinner,     // Winner paid
        SettledStalemate,   // Penalties applied, stakes returned
        Cancelled          // Debate cancelled by Agent A (before match)
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

    address public chroniclerAddress;
    address public agoraGateTreasury;

    uint256 public stalematePenaltyBps;         // Basis points (1000 = 10%)
    uint256 public debateDividendBps;            // Basis points of pot to winner's belief pool
    uint256 public constant MIN_STAKE_AMOUNT = 0.001 ether;

    uint256 public nextDebateId;

    // beliefId => BeliefPosition (IDs 1-4)
    mapping(uint256 => BeliefPosition) public beliefs;

    // debateId => DebateEscrow
    mapping(uint256 => DebateEscrow) public debates;

    // agentId => current belief they are staked on (0 if not staked)
    mapping(uint256 => uint256) public agentCurrentBelief;

    // agentId => active debateId (0 if not in a debate)
    mapping(uint256 => uint256) public agentActiveDebate;

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
    event DividendDistributed(uint256 indexed debateId, uint256 indexed beliefId, uint256 amount);
    event DebateDividendUpdated(uint256 dividendBps);

    // ========== CONSTRUCTOR ==========

    constructor(
        address _identityRegistry,
        uint256 _stalematePenaltyBps,
        uint256 _debateDividendBps
    ) Ownable(msg.sender) {
        require(_identityRegistry != address(0), "Invalid identity registry");
        require(_stalematePenaltyBps <= 5000, "Penalty too high");
        require(_debateDividendBps <= 5000, "Dividend too high");

        identityRegistry = IIdentityRegistry(_identityRegistry);
        stalematePenaltyBps = _stalematePenaltyBps;
        debateDividendBps = _debateDividendBps;

        // Initialize the 4 fixed beliefs with their LP tokens
        beliefs[1] = BeliefPosition(1, "Nihilism", keccak256("ipfs://nihilism"), 0, 0, new BeliefToken("Agora Nihilism LP", "aNIH", address(this)));
        beliefs[2] = BeliefPosition(2, "Existentialism", keccak256("ipfs://existentialism"), 0, 0, new BeliefToken("Agora Existentialism LP", "aEXI", address(this)));
        beliefs[3] = BeliefPosition(3, "Absurdism", keccak256("ipfs://absurdism"), 0, 0, new BeliefToken("Agora Absurdism LP", "aABS", address(this)));
        beliefs[4] = BeliefPosition(4, "Stoicism", keccak256("ipfs://stoicism"), 0, 0, new BeliefToken("Agora Stoicism LP", "aSTO", address(this)));

        nextDebateId = 1;
    }

    // ========== STAKING FUNCTIONS ==========

    /**
     * @notice Stake MON on one of the 4 fixed beliefs. Mints LP tokens.
     */
    function stake(uint256 beliefId, uint256 agentId) external payable {
        require(beliefId >= 1 && beliefId <= 4, "Invalid belief");
        require(msg.value >= MIN_STAKE_AMOUNT, "Stake too low");
        _verifyAgentOwnership(agentId);

        // Ensure agent can only stake on one belief at a time
        uint256 currentBelief = agentCurrentBelief[agentId];
        require(currentBelief == 0 || currentBelief == beliefId, "Already staked on different belief");

        BeliefToken token = beliefs[beliefId].token;
        address wallet = _getAgentWallet(agentId);

        // Calculate shares to mint (vault math)
        uint256 sharesToMint;
        uint256 totalShares = token.totalSupply();
        uint256 totalAssets = beliefs[beliefId].totalAssets;

        if (totalShares == 0 || totalAssets == 0) {
            sharesToMint = msg.value;
        } else {
            sharesToMint = (msg.value * totalShares) / totalAssets;
        }

        require(sharesToMint > 0, "Zero shares");

        // Update adherent tracking
        if (token.balanceOf(wallet) == 0) {
            beliefs[beliefId].adherentCount++;
            agentCurrentBelief[agentId] = beliefId;
        }

        // Update total assets and mint shares
        beliefs[beliefId].totalAssets += msg.value;
        token.mint(wallet, sharesToMint);

        emit Staked(agentId, beliefId, msg.value, block.timestamp);
    }

    /**
     * @notice Unstake by burning LP shares. Receives proportional MON.
     * @param beliefId The belief to unstake from
     * @param shares Number of LP token shares to burn
     * @param agentId The agent's NFT ID
     */
    function unstake(uint256 beliefId, uint256 shares, uint256 agentId)
        external
        nonReentrant
    {
        _verifyAgentOwnership(agentId);
        require(shares > 0, "Zero shares");
        require(agentActiveDebate[agentId] == 0, "Agent has active debate");

        BeliefToken token = beliefs[beliefId].token;
        address wallet = _getAgentWallet(agentId);

        require(token.balanceOf(wallet) >= shares, "Insufficient shares");

        // Calculate MON to return
        uint256 totalShares = token.totalSupply();
        uint256 totalAssets = beliefs[beliefId].totalAssets;
        uint256 monOut = (shares * totalAssets) / totalShares;

        // Burn shares and update assets
        token.burn(wallet, shares);
        beliefs[beliefId].totalAssets -= monOut;

        bool fullyUnstaked = (token.balanceOf(wallet) == 0);

        if (fullyUnstaked) {
            beliefs[beliefId].adherentCount--;
            agentCurrentBelief[agentId] = 0;
        }

        // Transfer MON
        (bool success, ) = wallet.call{value: monOut}("");
        require(success, "Transfer failed");

        emit Unstaked(agentId, beliefId, monOut);

        // If agent has fully unstaked, exit Agora (if they were in it)
        if (fullyUnstaked && agoraGateTreasury != address(0)) {
            (bool exitSuccess, ) = agoraGateTreasury.call(
                abi.encodeWithSignature("exitAgent(uint256)", agentId)
            );
            exitSuccess; // Intentionally ignore
        }
    }

    // ========== CONVERSION FUNCTION ==========

    /**
     * @notice Migrate stake when agent converts. Burns old LP tokens, mints new ones
     *         at the new belief's current share price. MON stays in the contract.
     */
    function migrateStake(uint256 fromBeliefId, uint256 toBeliefId, uint256 agentId)
        external
        nonReentrant
    {
        _verifyAgentOwnership(agentId);
        require(agentActiveDebate[agentId] == 0, "Agent has active debate");
        require(fromBeliefId >= 1 && fromBeliefId <= 4, "Invalid from belief");
        require(toBeliefId >= 1 && toBeliefId <= 4, "Invalid to belief");
        require(fromBeliefId != toBeliefId, "Same belief");

        address wallet = _getAgentWallet(agentId);

        // --- Burn all shares from old belief ---
        BeliefToken fromToken = beliefs[fromBeliefId].token;
        uint256 fromShares = fromToken.balanceOf(wallet);
        require(fromShares > 0, "No stake to migrate");

        uint256 fromTotalShares = fromToken.totalSupply();
        uint256 fromTotalAssets = beliefs[fromBeliefId].totalAssets;
        uint256 monValue = (fromShares * fromTotalAssets) / fromTotalShares;

        fromToken.burn(wallet, fromShares);
        beliefs[fromBeliefId].totalAssets -= monValue;
        beliefs[fromBeliefId].adherentCount--;

        // --- Mint shares in new belief ---
        BeliefToken toToken = beliefs[toBeliefId].token;
        uint256 toTotalShares = toToken.totalSupply();
        uint256 toTotalAssets = beliefs[toBeliefId].totalAssets;

        uint256 newShares;
        if (toTotalShares == 0 || toTotalAssets == 0) {
            newShares = monValue;
        } else {
            newShares = (monValue * toTotalShares) / toTotalAssets;
        }

        require(newShares > 0, "Zero shares");

        toToken.mint(wallet, newShares);
        beliefs[toBeliefId].totalAssets += monValue;
        beliefs[toBeliefId].adherentCount++;

        agentCurrentBelief[agentId] = toBeliefId;

        // Update IdentityRegistry metadata
        identityRegistry.setMetadata(
            agentId,
            "belief",
            abi.encode(beliefs[toBeliefId].name)
        );

        emit StakeMigrated(agentId, fromBeliefId, toBeliefId, monValue);
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

        // Debate gating: both agents must have active belief stakes
        require(agentCurrentBelief[agentAId] != 0, "Agent A has no belief stake");
        require(agentCurrentBelief[agentBId] != 0, "Agent B has no belief stake");

        // Ensure previous debate is settled (skip check for first debate)
        if (nextDebateId > 1) {
            require(
                debates[nextDebateId - 1].status == DebateStatus.SettledStalemate ||
                debates[nextDebateId - 1].status == DebateStatus.SettledWinner ||
                debates[nextDebateId - 1].status == DebateStatus.Cancelled,
                "Old debate not settled"
            );
        }

        // Lock both agents from unstaking/migrating during debate
        require(agentActiveDebate[agentAId] == 0, "Agent A already in debate");
        require(agentActiveDebate[agentBId] == 0, "Agent B already in debate");

        debateId = nextDebateId++;

        agentActiveDebate[agentAId] = debateId;
        agentActiveDebate[agentBId] = debateId;

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

    /**
    * @notice Decline debate escrow (Agent B declines before matching)
    */
    function declineDebateEscrow(uint256 debateId) external nonReentrant {
        DebateEscrow storage debate = debates[debateId];
        require(debate.status == DebateStatus.Pending, "Not pending");
        require(msg.sender == _getAgentWallet(debate.agentBId), "Not agent B");

        debate.status = DebateStatus.Cancelled;

        // Unlock both agents
        agentActiveDebate[debate.agentAId] = 0;
        agentActiveDebate[debate.agentBId] = 0;

        // Refund Agent A
        address walletA = _getAgentWallet(debate.agentAId);
        (bool successA, ) = walletA.call{value: debate.stakeAmount}("");
        require(successA, "Refund failed");

        emit DebateSettled(debateId, 0, 0, "cancelled");
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
            uint256 winnerId = (winnerIndex == 0) ? debate.agentAId : debate.agentBId;

            // Calculate dividend to winner's belief pool
            uint256 dividend = (totalPot * debateDividendBps) / 10000;
            uint256 winnerPayout = totalPot - dividend;

            // Dividend increases share price for all stakers of winner's belief
            uint256 winnerBeliefId = agentCurrentBelief[winnerId];
            beliefs[winnerBeliefId].totalAssets += dividend;

            address winnerWallet = _getAgentWallet(winnerId);
            (bool success, ) = winnerWallet.call{value: winnerPayout}("");
            require(success, "Transfer failed");

            debate.status = DebateStatus.SettledWinner;
            debate.winnerId = winnerId;

            emit DividendDistributed(debateId, winnerBeliefId, dividend);
            emit DebateSettled(debateId, winnerId, winnerPayout, "winner");

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

            emit DebateSettled(debateId, 0, 0, "stalemate");
            emit StalematePenaltyPaid(debateId, penalty * 2);
        }

        // Unlock both agents
        agentActiveDebate[debate.agentAId] = 0;
        agentActiveDebate[debate.agentBId] = 0;

        debate.settledAt = block.timestamp;
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @notice Get all 4 beliefs
     */
    function getAllBeliefs() external view returns (BeliefPosition[4] memory) {
        return [beliefs[1], beliefs[2], beliefs[3], beliefs[4]];
    }

    /**
     * @notice Get single belief
     */
    function getBelief(uint256 beliefId) external view returns (BeliefPosition memory) {
        require(beliefId >= 1 && beliefId <= 4, "Invalid belief");
        return beliefs[beliefId];
    }

    /**
     * @notice Get agent's current belief affiliation
     */
    function getAgentBelief(uint256 agentId) external view returns (uint256) {
        return agentCurrentBelief[agentId];
    }

    /**
     * @notice Get the MON value and share count of an agent's stake in a belief pool
     */
    function getAgentStakeValue(uint256 agentId, uint256 beliefId)
        external
        view
        returns (uint256 monValue, uint256 shares)
    {
        BeliefToken token = beliefs[beliefId].token;
        address wallet = _getAgentWallet(agentId);
        shares = token.balanceOf(wallet);

        if (shares == 0) return (0, 0);

        uint256 totalShares = token.totalSupply();
        monValue = (shares * beliefs[beliefId].totalAssets) / totalShares;
    }

    /**
     * @notice Preview how much MON would be received for burning shares
     */
    function previewRedeem(uint256 beliefId, uint256 shares)
        external
        view
        returns (uint256 monOut)
    {
        BeliefToken token = beliefs[beliefId].token;
        uint256 totalShares = token.totalSupply();
        if (totalShares == 0) return 0;

        monOut = (shares * beliefs[beliefId].totalAssets) / totalShares;
    }

    /**
     * @notice Get the current share price (MON per share, scaled by 1e18)
     */
    function getSharePrice(uint256 beliefId)
        external
        view
        returns (uint256 price)
    {
        BeliefToken token = beliefs[beliefId].token;
        uint256 totalShares = token.totalSupply();
        if (totalShares == 0) return 1e18;

        price = (beliefs[beliefId].totalAssets * 1e18) / totalShares;
    }

    /**
     * @notice Get the LP token address for a belief
     */
    function getBeliefToken(uint256 beliefId) external view returns (address) {
        require(beliefId >= 1 && beliefId <= 4, "Invalid belief");
        return address(beliefs[beliefId].token);
    }

/**
     * @notice Get debate details
     */
    function getDebate(uint256 debateId) external view returns (DebateEscrow memory) {
        return debates[debateId];
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

    function setDebateDividendBps(uint256 _dividendBps) external onlyOwner {
        require(_dividendBps <= 5000, "Dividend too high");
        debateDividendBps = _dividendBps;
        emit DebateDividendUpdated(_dividendBps);
    }

    // ========== INTERNAL FUNCTIONS ==========

    /**
     * @notice Verify caller owns the agent NFT
     */
    function _verifyAgentOwnership(uint256 agentId) internal view {
        address owner = identityRegistry.ownerOf(agentId);
        address wallet = identityRegistry.getAgentWallet(agentId);
        require(msg.sender == owner || msg.sender == wallet, "Not authorized");
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

}
